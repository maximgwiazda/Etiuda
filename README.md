# Playbook

A macro bank for live-chat support agents. One HTML file, no install, no server, no account -
double-click it and it runs. It ships with **no content of its own**: you bring the macros.

Built for the real shape of chat support work - several conversations at once, two languages,
a three-minute idle limit, and the same forty phrases typed a hundred times a day.

---

## What it does

- **Click a block, it's copied.** Not the whole macro - the block. A macro can hold several
  alternatives (`1/4`, `2/4`…) and you copy one at a time.
- **Two languages side by side.** Every macro carries both; one toggle switches the lot.
- **Intents.** Pick what the customer is contacting you about and the list re-sorts around it -
  linked entries ring green and rise to the top. `{INTENT}` then writes itself into any macro
  that uses it, in whichever language is active.
- **Placeholders.** `{PAX}`, `{AGENT}`, `{INIT}`, `{WHO}`, `{ACTION}`, `{TOPIC}` fill from the
  header fields and the selected intents, so an internal comment can compose itself.
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

1. Download `Playbook.html`.
2. Double-click it.
3. It's empty, so take the offer of the **sample catalog and the one-minute tour** - that's the
   fastest way to see what the pieces do.

When you're ready for your own content, build it in the app (**⚙ → Manage playbook**) or write a
catalog file by hand.

---

## Catalogs

The engine holds no content. A **catalog** supplies macros, intents, categories and quick facts:

```js
window.PB_CATALOG = {
  format: 1,
  kind: "playbook-catalog",
  name: "Acme Support",
  categories: { open: "Openers", sec: "Security", ask: "Questions" },
  roles: { always: ["open", "sec"], opener: "open" },
  intents: { en: [...], pl: [...], cat: [...], cmt: [...], topic: [...] },
  macros: [ { c: "open", t: "Cold open", en: "...", pl: "...", allIntents: 1, intentTop: 1 } ],
  facts: "..."
};
```

Name it **`playbook-catalog.js`** and put it beside `Playbook.html` - it's offered on launch and
loads once you accept. Under any other name, bring it in with **Import catalog**.

It's a `.js` file assigning a global rather than `.json`, and that isn't a preference: a page
opened from `file://` **cannot `fetch()` a sibling file** in any browser. Loading one as a
`<script>` is the only route that works everywhere.

You never have to write one by hand. Anything the format can express, the interface can author -
including category roles and the per-macro flags - and **Export catalog** writes the file back
out with your edits merged in. Round-tripping is the intended workflow.

---

## Two artifacts, one product

| | |
|---|---|
| **The engine** - `Playbook.html` | search, ranking, intents, tabs, tour, import/export. MIT. |
| **A catalog** - your content | macros, intents, categories, facts. Yours; licensed however you like. |

Keeping them apart is the point: your macros are usually the confidential half. The engine never
contains them, so it can be shared, forked or published while your catalog stays wherever you
keep it.

---

## Browser support

Firefox, Chrome and Edge, opened from `file://`. No build step, no dependencies, no bundler -
the source is the artifact.

---

## Licence

MIT - see [LICENSE](LICENSE). Use it, change it, ship it, sell it; keep the copyright notice.

The licence covers **the engine**. A catalog is data and carries whatever licence its author
gives it.
