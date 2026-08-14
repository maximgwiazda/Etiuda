# Etiuda

**[▶ Open Etiuda](https://maximgwiazda.github.io/Etiuda/Etiuda.html)** - runs in the
browser, nothing to install.

One HTML file, and inside it every phrase a live-chat support agent sends all day - ready
to be found, filled in and copied faster than it could ever be typed. Double-click the file
and it runs. No install, no server, no account, no build step, and no network: nothing you
put into it is ever sent anywhere, because there is nowhere it could go.

## The name

An **etiuda** - an étude - is a short study a musician practises until it plays itself.
For most of its history that made it a finger exercise, something you played so that one day
you could play something else. Then Chopin, who grew up in Warsaw, where this tool was
written, folded the drill and the music into the same piece: studies you rehearse in
private and perform in public, note for note.

Support chat has exactly that shape. The same forty phrases a hundred times a day, two
languages, several conversations at once, and a customer who starts wondering where you went
after the first quiet minute. The wording is the practised part. Get it out of the way, and
what's left of your attention goes where it belongs - to the person on the other end.

## How it thinks

Four words carry the whole design:

- A **macro** is one copyable message.
- A **card** is a titled group of macros: a single phrase, a fan of alternatives
  (`1/4`, `2/4`…), or an ordered sequence you play through a conversation.
- An **intent** is what the customer actually came about. Choose one and the deck re-sorts
  itself around it: linked cards ring green and rise to the top, and the intent's own
  wording flows into any macro that asks for it.
- A **catalog** is all of the above in one file - *your* phrasing, *your* categories, *your*
  quick facts. The engine ships empty of content and opinion. A sample catalog is built in,
  so the app does something the moment you first open it, and everything the sample does,
  your own catalog can do.

## What it does

- **Click a macro and it's copied.** That is the whole central transaction, and everything
  else exists to make it happen sooner.
- **Two languages side by side.** Every macro carries both; one toggle switches the lot.
- **Placeholders that fill themselves.** `{GREET}`, `{PAX}`, `{AGENT}`, `{INIT}`, `{ROLE}`,
  `{ACTION}`, `{TOPIC}` and `{INTENT}` resolve from the header fields, the clock and the
  selected intents - so a greeting, or an internal comment, composes itself. Filled text is
  marked with a quiet dotted underline on screen; the clipboard receives clean prose.
- **Tabs, one per conversation.** Each keeps its own customer, intent and filters, because
  you never have only one conversation.
- **Search that forgives.** Both languages at once, diacritic-insensitive in both directions
  (`bagaz` finds `bagaż`), ranked so that intent-linked cards outrank incidental mentions.
- **Yours to rearrange.** Drag cards, categories and intents; star what you use; hide what
  you don't; edit everything in place.
- **Keyboard-first.** Every action has a shortcut, and every shortcut is rebindable. On a
  practised desk the mouse is optional.
- **Quick facts** - a panel for the numbers you look up daily and will never memorise.
- **Light and dark**, following the system or your say-so, with the floating panels drawn
  in glass so you keep your place on the page beneath them.
- **Offline and private.** No network calls of any kind. State lives in your browser's
  local storage, on your machine, and nowhere else.

## Getting started

1. Download `Etiuda.html`.
2. Double-click it.
3. Say yes to the **sample catalog and the one-minute tour**. (Skipped it? It waits under
   **⋯ → Show tour**.)

Then make it yours: edit the sample in place, build from scratch in **⋯ → Manage Etiuda**,
or drop a catalog file next to the app.

## Catalogs

A catalog is one `.js` file assigning one global:

```js
window.PB_CATALOG = {
  format: 1,
  kind: "playbook-catalog",
  name: "Acme Support",
  version: "2026-08-03",    // optional edition label - shown when a differing file is offered
  categories: { open: "Openers", sec: "Security", ask: "Questions" },
  roles: { always: ["open", "sec"], opener: "open" },
  intents: { en: [...], pl: [...], cat: [...], cmt: [...], topic: [...] },
  cards: [ { c: "open", t: "Cold open", en: "...", pl: "...", allIntents: 1, intentTop: 1 } ],
  who: ["customer", "account holder"],
  facts: "..."
};
```

Name it **`etiuda-catalog.js`**, put it beside `Etiuda.html`, and it is offered on launch.
Under any other name, bring it in through **Import catalog**.

Why a `.js` global and not `.json`? Because a page opened from `file://` cannot `fetch()` a
sibling file in any browser - loading the catalog as a `<script>` is the only route that
works everywhere, and "double-click and it runs" is not negotiable.

You never have to write one by hand. Everything the format can express, the interface can
author, and **Export catalog** writes the file back out with your edits merged in.
Round-tripping - export, share, import, edit, export again - is the intended way a catalog
lives and grows.

## Two artifacts, one product

| | |
|---|---|
| **The engine** - `Etiuda.html` | search, ranking, intents, tabs, tour, import/export. MIT. |
| **A catalog** - your content | cards, intents, categories, facts. Yours, under any licence you like. |

The separation is the point. Your macros are usually the confidential half - the customer
wording, the internal policy, what your desk actually says - and the engine never contains
a line of them. So the instrument can be shared, updated and forked in the open, while the
score stays exactly where you put it, under whatever terms you choose.

## The small details are the product

A macro bank earns its keep in the last few characters of a message, so that is where the
work went:

- **Polish vocative.** Address someone by the nominative and it reads wrong in Polish -
  "Dzień dobry, Anna" should be "Dzień dobry, Anno". Etiuda declines first names
  automatically: a hand-grown table for the names whose stems shift (Piotr → Piotrze,
  Kacper → Kacprze), derivation rules for the classes that permit them (-a → -o,
  -ek → -ku, -sia → -siu), and a deliberate refusal to guess where guessing would misfire -
  an unknown foreign name is left untouched rather than declined into nonsense.
- **Preposition euphony.** *z* or *ze*, decided per word, so a composed sentence never
  trips over its own consonant cluster.
- **A shared clock.** Morning, afternoon and evening greetings switch themselves, in both
  languages, on one definition of the day - a night shift's 4 a.m. still counts as evening.
- **A boot guard.** Stored state gone wrong can strand an app that keeps its state locally,
  so recovery lives outside the app: one automatic retry, a plain-HTML banner that needs no
  working stylesheet, and `#reset` in the address bar as the hatch of last resort.

## Development

There are no dependencies and no build. The source is the artifact - open `Etiuda.html` in
a text editor and you are looking at the whole program.

```bash
node test.js
```

runs the test harness: unit tests over the engine's pure functions (extracted straight out
of the HTML), a syntax check that compiles every inline script, and a lint of any catalog
sitting beside it. The linter also gates builds, so a catalog with colliding card ids or
dangling intent links fails loudly instead of shipping.

## Browser support

Firefox, Chrome and Edge, opened from `file://` or served as a static page.

## Licence

MIT - see [LICENSE](LICENSE). Use it, change it, ship it, sell it; keep the copyright
notice.

The licence covers **the engine**. A catalog is data, and carries whatever licence its
author gives it.
