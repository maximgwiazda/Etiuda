# Format 2, and the one-off converter

Etiuda 2.0.0 reads one catalog format and knows no other. A file of the old format is brought
across once, by the tool in this folder, which runs outside the engine and is bundled into
nothing. The engine has no reader for format 1 and is not going to grow one: a boundary that
exists is a boundary somebody maintains, and the files that need crossing are countable.

    node tools/catalog-v2/convert.mjs <in.js|in.json> --out <name.ec>
          [--js <name.js> [--global E_SAMPLE]] [--eval]
          [--id x] [--name "X"] [--rev 2] [--date 2026-09-14]
    node tools/catalog-v2/selftest.mjs

`--eval` is for a file a person wrote rather than a file an engine wrote: a hand-kept
catalog is a JavaScript object literal with bare keys, which no JSON parser will take. It is
opt-in and it evaluates, which the engine itself may never do; this tool is run once,
offline, by the owner of the file, and the alternative is retyping a catalog by hand.

## The two containers, and why there are two

**The catalog is JSON.** `.ec`, for etiuda catalog, is that JSON on its own: it is what a desk
exchanges, what Import reads, and what a file-backed build opens.

**A page opened from `file://` cannot fetch a sibling, but it can run one as a script.** So the
catalog that loads by itself beside the engine is the same JSON behind one assignment,
`window.E_CATALOG = {...};`, in a file the browser will treat as a script. `--js` writes it.

One format, two containers, one reader: the engine strips the assignment when it is there and
parses what is left. Nothing downstream can tell which container it came from.

## What changed from format 1, and why

| format 1 | format 2 | why |
|---|---|---|
| `categories` map, `roles.always`, `icons`, `colors` | `tags` of `kind:"shelf"` | four parallel maps keyed by the same string are four chances to disagree |
| five parallel `intents` arrays | `tags` of `kind:"request"` | index alignment across five arrays is a contract nothing checks |
| `cards[].c` a category key | `cards[].shelf` a tag id | exactly one shelf per card, as before |
| `cards[].intents` positional indices | `cards[].requests` tag ids | a deleted request renumbered every link |
| `t`/`tPl`, `en`/`pl`, `note`/`notePl` | `title`, `body`, `note` keyed by language code | a French catalog had to put French in a field named `en` |
| implicit English and Polish | `langs`, ordered, first is primary | the set of languages is open, the set of grammars is not |
| `alt` and `seq` booleans | `bodyShape` plus `[step]` and `[alt]` marker lines | three states in two booleans, and the blank line was doing two jobs |
| `who` | `role` | the token has been `{ROLE}` since 1.5.0 |
| `version`, free-form | `rev`, a strictly increasing integer, and `date` | "is this newer" became one integer comparison |
| `kind: "playbook-catalog"` | `kind: "etiuda-catalog"` | format 2 declares itself, so no file is ambiguous |
| no catalog id | `id`, immutable | the personal layer is namespaced by it, so a reworded catalog no longer wipes a desk |
| `intents[].cat` | gone | it decided nothing after 1.6.0 |

**Ids carry a prefix, `t-` for a tag of either breed and `c-` for a card, and that is normative.**
Four of the twenty-four category keys in the catalog this was written against are two characters
long, which the bare three-character rule rejects and the prefix rescues. Both breeds share one
id space, so a shelf and a request cannot quietly claim the same id: the converter reports a
collision rather than merging two things.

**An id is assigned once and kept.** A format 1 catalog carries no card ids, so the first
minting happens here, out of the category and the title, and that freezes the title's wording
as it stood at the conversion. Everything after keeps it: a card arriving with an id format 2
can carry keeps that id, the way back writes each card its id onto the format 1 file, and a
retitle therefore moves a title and nothing else. The cost of the alternative is a desk's own
layer - stars, hides and card order are keyed by the id, so re-deriving one from a reworded
title orphans all three. A second claimant to one id is reported and given an id of its own,
because a file whose ids repeat is one the engine refuses whole.

**A request carries no `label`.** What a request shows is its clause, and a second field holding
the same words is a second field to keep true.

**One envelope field is carried that section 2.4 does not list: `sample`.** The engine reads
it to remember that what was loaded was the sample rather than a desk's own catalog, so
dropping it would make the offer propose the sample for ever.

**`greet` and `stop` are honoured by the engine and this converter writes neither.** A catalog
that declares the greeting phrases for its languages, or the noise words its trade is saturated
with, has them used; a catalog that declares neither keeps the built-in tables, which is what
every catalog converted so far does. Inventing them here would put words into somebody's file
that they never wrote, and the built-in behind them is the better default than a guess.

**`langs` decides what the runtime speaks**, in the order declared, the first of them primary,
and the set is open: any code is read, and the column it lives in is derived where the two
tables name none - the runtime field name, a colon, the code, so `t:de` and `clause:uk`.

**So a code is a key and half of a column name, and it is refused unless it can be both**:
lower-case letters, then any hyphened parts of letters and digits, as `en`, `pt-br` or
`qqq-x-invented`. The whole of a language tag's meaning survives that shape, since case carries
none in a tag; what does not survive is a second way to spell one code, and two spellings of one
code are two columns for one language. Nothing published has ever read a code outside `en` and
`pl`, so no file written against a release of Etiuda can be carrying one.

## The round trip, which is why you may believe it

Every conversion goes forward and then back, and the format 1 file that comes out is compared
with the one that went in. The tool writes nothing while an unexpected difference stands.

Six differences are the format's own decisions rather than faults, and each is counted
separately so that a seventh cannot hide among them: `intents.cat` dropped; `roles.opener`
dropped, that role having been replaced by the card-level flag; a card id assigned where the
file carried none it could keep; an
edition label that is not a date; whitespace around a block of a body that has alternatives;
and `roles.always` coming back in the shelf order, which is declared only where the members
are the same.

`selftest.mjs` covers both directions over an invented catalog and, in three cases, bends the
format 2 file between the legs and requires the comparison to name the path. A round trip that
cannot report a difference is reporting nothing when it is green.

**No output of this tool ever carries a value.** A path is structure and a count is arithmetic;
the words on either side belong to whoever wrote the catalog, and this log is read into a record.

## What the personal layer is keyed by, and what the runtime still counts

The file keys a shelf and a request by id. The runtime counts: parallel category maps keyed by
the shelf id, intent columns index-aligned with each other, and a card linking a request by its
POSITION in those columns. Those positions are rebuilt from the file at every load, so they cost
nothing but the join.

**The personal layer is keyed by tag id, since 2.0.0.** It is the one part that outlives the
file it was made against, so an index there is a promise the next edition can break: an override
stored under `i:<n>` follows the slot rather than the request, and an inserted request moves
every choice after it onto another clause, silently and in one direction. `intentIdAt()` is the
join - `t:<tag id>` where the applied catalog carries one - and everything the layer holds is
keyed through it: the override, the hide, the star, the removal, the use count, the display
order and a personal card's link to a built-in request.

**A desk arriving from an older build is migrated once, at its first open**, by `loadPack()`,
against the catalog applied at that boot, which is the catalog the layer was made against.

- **Where the file carries an id for every request, the re-key is exact**, and nothing is said
  to the user because nothing was lost.
- **Where it carries none, nothing is guessed.** A request's id has been carried on the applied
  catalog since 2026-09-14; a file older than that holds indices alone, and no rule can say
  which request an index of theirs meant. The whole intent-addressed layer is set aside under
  `IntentsAside` in that desk's namespace, positions and all, the desk starts clean on those
  fields and is told once. Guessing would point somebody's own wording at another
  customer-facing clause, which is worse than losing an arrangement they can see is gone.
- **A partial list of ids is treated as none.** The migration re-keys every slot or no slot:
  half a layer keyed by tag and half by position is two schemes on one desk.

Measured, as the size of the join that is left: 32 of the 98 files in `src/modules/` name an
intent by position, over 205 lines, counted by `grep -cE` per file over the eight names that
address one (`intentIdxs`, `intentOrder`, `intentIdAt`, `intentIdxOfId`, `intentIdxFromId`,
`SW_EN.length`, `isIntentHiddenIdx`, `intentIsCustom`) and summed on 2026-09-17. Those are
positions inside one session, rebuilt from the file at every load; none of them is stored.

## Two refusals

It will not write over a file that exists, and it will not write anywhere inside this
repository. The first is the difference between converting a catalog and losing one; the second
is the rule this whole tree keeps, that content is not ours to publish.
