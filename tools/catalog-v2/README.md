# Format 2, and the one-off converter

Etiuda 2.0.0 reads one catalog format and knows no other. A file of the old format is brought
across once, by the tool in this folder, which runs outside the engine and is bundled into
nothing. The engine has no reader for format 1 and is not going to grow one: a boundary that
exists is a boundary somebody maintains, and the files that need crossing are countable.

    node tools/catalog-v2/convert.mjs <in.js|in.json> --out <name.ec> [--js <name.js>]
                                      [--id x] [--name "X"] [--rev 2] [--date 2026-09-14]
    node tools/catalog-v2/selftest.mjs

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

**A request carries no `label`.** What a request shows is its clause, and a second field holding
the same words is a second field to keep true.

**`greet` and `stop` are in the format and this converter writes neither.** The engine still
supplies the greeting words and the stopword list; moving them into the catalog is its own step,
and inventing them here would put words into somebody's file that they never wrote.

## The round trip, which is why you may believe it

Every conversion goes forward and then back, and the format 1 file that comes out is compared
with the one that went in. The tool writes nothing while an unexpected difference stands.

Five differences are the format's own decisions rather than faults, and each is counted
separately so that a sixth cannot hide among them: `intents.cat` dropped; a card id
resynthesised; an edition label that is not a date; whitespace around a block of a body that has
alternatives; and `roles.always` coming back in the shelf order, which is declared only where
the members are the same.

`selftest.mjs` covers both directions over an invented catalog and, in three cases, bends the
format 2 file between the legs and requires the comparison to name the path. A round trip that
cannot report a difference is reporting nothing when it is green.

**No output of this tool ever carries a value.** A path is structure and a count is arithmetic;
the words on either side belong to whoever wrote the catalog, and this log is read into a record.

## Two refusals

It will not write over a file that exists, and it will not write anywhere inside this
repository. The first is the difference between converting a catalog and losing one; the second
is the rule this whole tree keeps, that content is not ours to publish.
