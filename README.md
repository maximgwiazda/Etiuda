# Etiuda

**[▶ Open Etiuda](https://maximgwiazda.github.io/etiuda-v1/Etiuda.html)** in the browser.
Nothing to install.

One HTML file, and inside it every phrase a live-chat support agent sends all day, ready to
be found, filled in and copied faster than it could ever be typed. Double-click the file and
it runs. No install, no server, no account, no build step, and no network: nothing you put
into it is ever sent anywhere, because there is nowhere it could go.

## The name

An **etiuda**, an étude, is a short study a musician practises until it plays itself. For
most of its history that made it a finger exercise, something you played so that one day you
could play something else. Then Chopin, who grew up in Warsaw, where this tool was written,
folded the drill and the music into the same piece: studies you rehearse in private and
perform in public, note for note. There are twenty-seven, each built around a single
difficulty, so the set is one you draw from rather than one you play through.

Support chat has exactly that shape. The same forty phrases a hundred times a day, two
languages, several conversations at once, and a customer who starts wondering where you went
after the first quiet minute. The wording is the practised part. Get it out of the way, and
what is left of your attention goes where it belongs: to the person on the other end.

## How it thinks

Four words carry the whole design.

- A **macro** is one copyable message.
- A **card** is a titled group of macros: a single phrase, a fan of alternatives
  (`1/4`, `2/4`…), or an ordered sequence you play through a conversation.
- An **intent** is what the customer actually came about. Choose one and the deck re-sorts
  itself around it. Linked cards ring green and rise to the top, and the intent's own wording
  flows into any macro that asks for it.
- A **catalog** is all of the above in one file: *your* phrasing, *your* categories, *your*
  quick facts. The engine ships empty of content and opinion, and a sample catalog travels
  beside it so there is something to press on the first screen. Everything the sample does,
  your own catalog can do: it is an ordinary catalog file, not a special case.

## What it does

- **Click a macro and it is copied.** That is the whole central transaction, and everything
  else exists to make it happen sooner.
- **Two languages side by side.** Every macro can carry both, and one toggle switches the
  lot. Only the first is required: leave a card's second language empty and it shows the
  first, rather than a gap.
- **Placeholders that fill themselves.** `{GREET}`, `{PAX}`, `{AGENT}`, `{INIT}`, `{ROLE}`,
  `{ACTION}`, `{TOPIC}` and `{INTENT}` resolve from the header fields, the clock and the
  selected intents, so a greeting or an internal comment composes itself. Filled text is
  marked with a quiet dotted underline on screen; the clipboard receives clean prose.
- **Tabs, one per conversation.** Each keeps its own customer, intent and filters, because
  you never have only one conversation.
- **Search that forgives.** Both languages at once, diacritic-insensitive in both directions
  (`bagaz` finds `bagaż`), ranked so that intent-linked cards outrank incidental mentions.
- **Yours to rearrange.** Drag cards, categories and intents; star what you use; hide what
  you do not; edit everything in place.
- **Keyboard-first.** Every action has a shortcut, and every shortcut is rebindable. On a
  practised desk the mouse is optional.
- **Quick facts.** A panel for the numbers you look up daily and will never memorise.
- **Light and dark**, following the system or your say-so, with the floating panels drawn in
  glass so you keep your place on the page beneath them.
- **Offline and private.** No network calls of any kind. State lives in your browser's local
  storage, on your machine, and nowhere else.

## Getting started

**In the browser.** [Open Etiuda](https://maximgwiazda.github.io/etiuda-v1/Etiuda.html), press
**load a sample catalog**, and take the one-minute tour. Nothing is installed and nothing is
sent anywhere; what you do is kept in that browser.

**On your own machine.** Download `Etiuda.html`, and `sample-catalog.js` beside it if you want
the sample. Double-click the HTML file. With neither the sample nor a catalog next to it,
Etiuda opens empty and offers to **import a catalog**, which is how a desk that already has
one usually starts.

Skipping the tour costs nothing: it waits under **⋯ → Show tour**. Then make it yours - edit
the sample in place, build from nothing in **⋯ → Library**, or put a catalog file next to the
app.

## Catalogs

A catalog is one `.js` file assigning one global:

```js
window.PB_CATALOG = {
  format: 1,
  kind: "playbook-catalog",
  name: "Acme Support",
  version: "2026-08-27",
  categories: { open: "Openers", refund: "Refunds" },
  intents: [ { en: "a refund request", pl: "prośbę o zwrot", cats: ["refund"] } ],
  cards: [ { c: "open", t: "Cold open", en: "Hello {PAX}…", pl: "Dzień dobry {PAX}…" } ],
  roles: ["Agent", "Escalations"],
  who: ["customer", "account holder"],
  facts: "..."
};
```

Name it **`etiuda-catalog.js`**, put it beside `Etiuda.html`, and it is offered on launch.
Under any other name, bring it in through **Import catalog**.

`sample-catalog.js` is one of these under a name of its own. The engine offers it only while
nothing else is loaded, so it never competes with a real catalog, and it is worth reading as a
worked example of the format above.

Why a `.js` global and not `.json`? Because a page opened from `file://` cannot `fetch()` a
sibling file in any browser. Loading the catalog as a `<script>` is the only route that works
everywhere, and "double-click and it runs" is not negotiable.

You never have to write one by hand. Everything the format can express, the interface can
author, and **Export catalog** writes the file back out with your edits merged in.
Round-tripping (export, share, import, edit, export again) is the intended way a catalog
lives and grows.

## Keeping a desk current

A catalog is maintained by somebody: a team lead, a trainer, whoever owns the wording. When
they publish a new edition, every desk should be offered it without anyone re-sending a file.
Two channels do that, and both compare the *content* rather than a timestamp, so a file that
was touched but not changed says nothing.

**The file beside the app.** If `etiuda-catalog.js` sits next to `Etiuda.html`, Etiuda reads
it at every launch. Replace it with a newer edition and the next launch offers the update.
This works in every browser, including from `file://`, and it is the whole mechanism behind
putting both files on a shared drive.

**A file you point at.** In Chrome and Edge you can hand Etiuda a catalog anywhere on disk or
on a share, through **⋯ → Library → Import catalog**, and it remembers that file rather than
just its contents. From then on it checks at startup, silently, for as long as the browser
still holds permission. **Check for updates** in the Library asks on demand, which is also
how permission gets renewed after a restart, since re-granting needs a click to hang on.
Firefox ships no file picker to obtain such a handle, so the button is simply absent there.

Either way, an update is **offered, never applied**. The dialog names the edition and says
what would change, and your own work is kept: stars, hidden cards, hand-sorted order and
your edits all survive the swap.

## Two artifacts, one product

| | |
|---|---|
| **The engine**, `Etiuda.html` | search, ranking, intents, tabs, tour, import/export. MIT. |
| **A catalog**, your content | cards, intents, categories, facts. Yours, under any licence you like. |

The separation is the point. Your macros are usually the confidential half: the customer
wording, the internal policy, what your desk actually says. The engine never contains a line
of them. So the instrument can be shared, updated and forked in the open, while the score
stays exactly where you put it, under whatever terms you choose.

## The small details are the product

A macro bank earns its keep in the last few characters of a message, so that is where the
work went.

- **Polish vocative.** Address someone by the nominative and it reads wrong in Polish:
  "Dzień dobry, Anna" should be "Dzień dobry, Anno". Etiuda declines first names for you,
  card by card, so the cards that address a passenger do it and the ones that merely identify
  a booking do not. Behind it sits a hand-grown table for the names whose stems shift
  (Piotr → Piotrze, Kacper → Kacprze), derivation rules for the classes that permit them
  (-a → -o, -ek → -ku, -sia → -siu), and a deliberate refusal to guess where guessing would
  misfire. An unknown foreign name is left untouched rather than declined into nonsense.
- **Preposition euphony.** *z* or *ze*, decided per word, so a composed sentence never trips
  over its own consonant cluster.
- **A shared clock.** Morning, afternoon and evening greetings switch themselves, in both
  languages, on one definition of the day, so a night shift's 4 a.m. still counts as evening.
- **A boot guard.** Stored state gone wrong can strand an app that keeps its state locally,
  so recovery lives outside the app: one automatic retry, a plain-HTML banner that needs no
  working stylesheet, and `#reset` in the address bar as the hatch of last resort.

## Development

The repository publishes exactly five files: the engine, `sample-catalog.js`, this README, the
licence, and the allowlist `.gitignore` that keeps it to five. A working catalog is somebody's
content, and never belongs in it.

There are no dependencies and no build. The source is the artifact: open `Etiuda.html` in a
text editor and you are looking at the whole program.

```bash
node test.js
```

runs the test harness. Unit tests over the engine's pure functions (extracted straight out of
the HTML), a syntax check that compiles every inline script, and a lint of any catalog sitting
beside it. The linter also gates builds, so a catalog with colliding card ids or dangling
intent links fails loudly instead of shipping.

## Browser support

Firefox, Chrome and Edge, opened from `file://` or served as a static page. Watching a
catalog file needs the File System Access API, which today means Chrome or Edge; everything
else works everywhere.

## Licence

MIT. See [LICENSE](LICENSE). Use it, change it, ship it, sell it; keep the copyright notice.

The licence covers **the engine**. A catalog is data, and carries whatever licence its author
gives it.
