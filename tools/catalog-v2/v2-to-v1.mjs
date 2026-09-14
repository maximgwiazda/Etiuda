/* Format 2 back to format 1. This direction ships nowhere: it exists so that the conversion
   has an oracle, by going back and comparing against what was read. A converter with no way
   back is a converter nobody can check. */

import { isMarkerLine } from "./format.mjs";
import { CARD_MAP, REQUEST_MAP, CARD_FLAGS } from "./v1-to-v2.mjs";

function str(v) { return String(v == null ? "" : v); }
function unprefix(id) { return str(id).replace(/^[tc]-/, ""); }

/* The inverse of bodyToMarkers: a marker line opens a block and the next one closes it, so
   dropping the markers and rejoining on blank lines is the whole of it. */
function markersToBody(text) {
  const lines = str(text).split("\n");
  const blocks = [];
  let cur = [];
  let started = false;
  for (const line of lines) {
    if (isMarkerLine(line)) {
      if (started) blocks.push(cur.join("\n").trim());
      cur = []; started = true;
      continue;
    }
    cur.push(line);
  }
  if (started) blocks.push(cur.join("\n").trim());
  return blocks.filter(Boolean).join("\n\n");
}

function toV1(v2) {
  const problems = [];
  const codes = (v2.langs || []).map(l => l.code);
  const shelves = (v2.tags || []).filter(t => t.kind === "shelf");
  const requests = (v2.tags || []).filter(t => t.kind === "request");
  const catOf = {};
  const categories = {}, categoriesPl = {}, icons = {}, colors = {};
  const always = [];
  for (const t of shelves) {
    const key = unprefix(t.id);
    catOf[t.id] = key;
    categories[key] = str((t.label || {}).en);
    if ((t.label || {}).pl) categoriesPl[key] = str(t.label.pl);
    if (t.icon) icons[key] = str(t.icon);
    if (t.hue != null) colors[key] = +t.hue;
    if (t.supporting) always.push(key);
  }
  const intents = {};
  const idxOf = {};
  requests.forEach((t, i) => { idxOf[t.id] = i; });
  for (const f of Object.keys(REQUEST_MAP)) {
    for (const code of codes) {
      const key = REQUEST_MAP[f][code];
      if (!key) continue;
      const col = requests.map(t => str((t[f] || {})[code]));
      if (col.some(v => v)) intents[key] = col;
    }
  }
  const cards = (v2.cards || []).map(c => {
    const m = { c: catOf[c.shelf] || unprefix(c.shelf) };
    for (const f of Object.keys(CARD_MAP)) {
      for (const code of codes) {
        const key = CARD_MAP[f][code];
        const v = str((c[f] || {})[code]);
        if (!v) continue;
        m[key] = (f === "body" && c.bodyShape !== "plain") ? markersToBody(v) : v;
      }
    }
    if (c.k) m.k = str(c.k);
    if (c.bodyShape === "steps") { m.alt = 1; m.seq = 1; }
    else if (c.bodyShape === "alts") { m.alt = 1; }
    for (const f of CARD_FLAGS) { if (c[f]) m[f] = 1; }
    if (c.paxVoc != null) m.paxVoc = (+c.paxVoc) ? 1 : 0;
    if (c.lockLang) m.lockLang = str(c.lockLang);
    const links = (c.requests || []).map(id => idxOf[id]).filter(i => i != null);
    if (links.length !== (c.requests || []).length) problems.push("card " + c.id + " links a request this file does not declare");
    if (links.length) m.intents = links;
    return m;
  });
  const out = {
    format: 1,
    kind: "playbook-catalog",
    name: str(v2.name),
    categories,
    icons,
    colors,
    roles: { always },
    intents,
    cards
  };
  if (v2.date) out.version = str(v2.date);
  if (Object.keys(categoriesPl).length) out.categoriesPl = categoriesPl;
  if (Array.isArray(v2.role) && v2.role.length) out.who = v2.role.map(str);
  if (str(v2.facts)) out.facts = str(v2.facts);
  return { catalog: out, problems };
}

export { toV1, markersToBody };
