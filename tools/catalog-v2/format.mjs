/* Format 2 vocabulary, shared by both directions of the converter and by nothing else.
   This folder is a one-off tool that runs outside the engine and is never bundled into it:
   the engine of 2.0.0 reads format 2 and knows no other, so every rule about format 1 lives
   here. */

const FORMAT = 2;
const KIND = "etiuda-catalog";
const ID_MAX = 64;
/* Morning, afternoon and evening. The engine spells the same number V2_GREET_PARTS and refuses
   a greeting table of any other length, so a converter writing one would write a file its own
   reader throws out. Duplicated across the boundary on purpose, as contentHash is. */
const GREET_PARTS = 3;

/* [a-z0-9-], 3 to 64 characters, as the format says. Diacritics fold rather than vanish, so
   two clauses differing only in an accent do not collide into one id. */
function slug(text, max) {
  const cap = max || ID_MAX;
  const s = String(text == null ? "" : text)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, cap).replace(/-+$/, "");
}

/* The prefix is normative, and it is what rescues a two-character key: 4 of the 24 category
   keys in the catalog this converter was written for are two characters long, which the bare
   3-to-64 rule rejects. `t-` for a tag of either breed, so the two breeds share one id space
   and a collision between them is caught rather than merely improbable. */
function tagId(text) { return "t-" + slug(text, ID_MAX - 2); }
function cardId(text) { return "c-" + slug(text, ID_MAX - 2); }

const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
function idOk(id) { return ID_RE.test(String(id || "")); }

/* djb2 over the canonical form, the same function and the same spelling the engine's own
   signature uses. Content only: `hash` and `sig` are removed before hashing, or a file could
   never carry its own hash. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
function contentHash(cat) {
  const copy = {};
  for (const k of Object.keys(cat)) { if (k !== "hash" && k !== "sig") copy[k] = cat[k]; }
  return "djb2:" + djb2(canonical(copy));
}

/* A body is one block per marker, and the marker is a whole line. `plain` carries the body
   verbatim, blank lines included, which is what gives a paragraph back to a card that never
   had structure. */
const MARKER_RE = /^\[(step|alt)(:[^\]]*)?\]$/;
function isMarkerLine(line) { return MARKER_RE.test(String(line).trim()); }

export { FORMAT, KIND, ID_MAX, GREET_PARTS, slug, tagId, cardId, idOk, canonical, djb2, contentHash, isMarkerLine };
