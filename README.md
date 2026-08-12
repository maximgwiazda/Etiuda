# Etiuda

**[▶ Open Etiuda](https://maximgwiazda.github.io/Etiuda/Etiuda.html)** - runs in the
browser, nothing to install.

An étude drills one figure until the hand finds it without looking. Support work has the same
shape: the same forty phrases, a hundred times a day, with a clock running.

So the pieces here are notes. An **intent** is the key you are playing in - choose it and every
card that belongs to it rings. A **card** holds one or more **macros**, the phrases you actually
send. Sounded in turn they are a conversation; sounded together they are the chord a good agent
plays without stopping to think.

A macro bank for live-chat support agents. One HTML file - double-click it and it runs. No
install, no server, no account, no build step, and nothing ever leaves your machine. Built for
the real shape of the work: several conversations at once, two languages, and a reply expected
before the customer wonders where you went.

Your phrasing lives in a **catalog** you load into it, so the wording stays yours and the tool
isn't tied to any one company's script - the score is yours, this only helps you play it. A
sample catalog is built in, so it does something the moment you open it.

---

## What it does

- **Click a macro, it's copied.** A **macro** is one copyable message; a **card** is the titled
  group holding one or more of them. A card can carry several alternatives (`1/4`, `2/4`…) or an
  ordered sequence, and you copy one macro at a time.
- **Two languages side by side.** Every macro carries both; one toggle switches the lot.
- **Intents.** Pick what the customer is contacting you about and the list re-sorts around it -
  linked entries ring green and rise to the top. `{INTENT}` then writes itself into any macro
  that uses it, in whichever language is active.
- **Placeholders.** `{PAX}`, `{AGENT}`, `{INIT}`, `{WHO}`, `{ACTION}`, `{TOPIC}` fill from the
  header fields and the selected intents, so an internal comment can compose itself. Who can be
  on a chat is your vocabulary, not the tool's - `who` in the catalog, editable in Manage.
- **Tabs.** One per conversation. Each keeps its own customer name, intent and filters.
- **Search across both languages**, diacritic-insensitive - `bagaz` finds `bagaż` - and ranked,
  with intent-linked results outranking incidental mentions.
- **Yours to rearrange.** Drag cards, categories and intents; star what you use; hide what you
  don't. Everything is editable in place.
- **Keyboard-first.** Every action has a shortcut, and every shortcut is rebindable.
- **Quick facts** panel for the numbers you look up but never remember.
- **Offline and private.** No network calls of any kind. Everything lives in your browser's
  local storage, on your machine.

---

## Getting started

1. Download `Etiuda.html`.
2. Double-click it.
3. Take the offer of the **sample catalog and the one-minute tour** - a minute, and you have seen
   how the pieces fit.

Then make it yours: edit the sample, build from scratch in **⚙ → Manage Etiuda**, or drop a
catalog file next to it.

---

## Catalogs

A **catalog** is the content: cards, intents, categories and quick facts, in one file.

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

Name it **`etiuda-catalog.js`** and put it beside `Etiuda.html` - it's offered on launch and
loads once you accept. Under any other name, bring it in with **Import catalog**.

It's a `.js` file assigning a global rather than `.json`, and that isn't a preference: a page
opened from `file://` **cannot `fetch()` a sibling file** in any browser. Loading one as a
`<script>` is the only route that works everywhere.

You never have to write one by hand. Anything the format can express, the interface can author -
including category roles and the per-card flags - and **Export catalog** writes the file back
out with your edits merged in. Round-tripping is the intended workflow.

---

## Two artifacts, one product

| | |
|---|---|
| **The engine** - `Etiuda.html` | search, ranking, intents, tabs, tour, import/export. MIT. |
| **A catalog** - your content | cards, intents, categories, facts. Yours; licensed however you like. |

Keeping them apart is the point. Your macros are usually the confidential half - customer
wording, internal policy, whatever your desk actually says - and the engine never contains them.
So the tool can be shared, updated and forked freely while your content stays exactly where you
put it, under whatever terms you like.

---

## Browser support

Firefox, Chrome and Edge, opened from `file://`. No build step, no dependencies, no bundler -
the source is the artifact.

---

## Licence

MIT - see [LICENSE](LICENSE). Use it, change it, ship it, sell it; keep the copyright notice.

The licence covers **the engine**. A catalog is data and carries whatever licence its author
gives it.
