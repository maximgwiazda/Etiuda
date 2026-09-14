/* The oracle. A conversion nobody can check is a conversion nobody should run over the only
   copy of somebody's content, so every conversion goes forward and back and the two format 1
   files are compared.
   NOTHING HERE EVER PRINTS A VALUE. A path is structure and a count is arithmetic; the values
   on both sides are a catalog's own words, and this output is read into a record. */

import { toV2 } from "./v1-to-v2.mjs";
import { toV1 } from "./v2-to-v1.mjs";
import { idOk } from "./format.mjs";

function blocksNorm(text) {
  return String(text == null ? "" : text).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).join("\n\n");
}
function absent(v) {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return !v.length;
  /* An empty map is absent too. The way back writes icons, colors, roles and intents whether or
     not the catalog had any, and a catalog that never had one should not read as having lost
     it. A map that LOSES its entries is still caught, as the empty side of a full one. */
  return typeof v === "object" && !Object.keys(v).length;
}

/* Missing and empty are one state: format 1 exports write "" where a translation is absent
   and omit the key elsewhere, so treating them apart would report the exporter's habit as a
   loss. */
function walk(a, b, path, out) {
  if (absent(a) && absent(b)) return;
  if (absent(a) !== absent(b)) { out.push({ path, kind: absent(a) ? "only-after" : "only-before" }); return; }
  const ta = Array.isArray(a) ? "array" : typeof a;
  const tb = Array.isArray(b) ? "array" : typeof b;
  /* A format 1 flag is written `1` by the engine's exporter and `true` by a hand-edited file,
     and its own reader accepts 1, true, "1" and "true" alike. So a flag is compared by what it
     means; 0 is not caught by this, because absent() has already let it through as a value. */
  if ((ta === "boolean" || tb === "boolean") && ta !== tb) {
    if (!a !== !b) out.push({ path, kind: "value" });
    return;
  }
  if (ta !== tb) { out.push({ path, kind: "type" }); return; }
  if (ta === "array") {
    if (a.length !== b.length) { out.push({ path: path + ".length", kind: "value" }); }
    for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], path + "[" + i + "]", out);
    return;
  }
  if (ta === "object") {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of [...keys].sort()) walk(a[k], b[k], path ? path + "." + k : k, out);
    return;
  }
  if (String(a) !== String(b)) out.push({ path, kind: "value" });
}

/* Three losses are the format's own decisions rather than faults, and each is counted so that
   a fourth cannot hide among them. */
function classify(diffs, before, after) {
  const declared = { "intents.cat dropped, it decided nothing after 1.6.0": 0,
                     "card id assigned at conversion, the file carried none it could keep": 0,
                     "version label not a date, so it did not travel into date": 0,
                     "block whitespace inside a body with alternatives": 0,
                     "roles.always came back in the shelf order, same members": 0,
                     "roles.opener dropped, that role no longer exists": 0 };
  const unexpected = [];
  /* `always` is a set the engine resolves against the categories that exist, so the order it
     is written in decides nothing. Declared only where the MEMBERS are the same: a lost role
     must still be a failure. */
  const setSame = (x, y) => JSON.stringify((x || []).map(String).sort()) === JSON.stringify((y || []).map(String).sort());
  const rolesSetSame = setSame((before.roles || {}).always, (after.roles || {}).always);
  for (const d of diffs) {
    if (/^roles\.opener(\[|\.|$)/.test(d.path)) {
      declared["roles.opener dropped, that role no longer exists"]++;
      continue;
    }
    if (/^roles\.always(\[|\.|$)/.test(d.path) && rolesSetSame) {
      declared["roles.always came back in the shelf order, same members"]++;
      continue;
    }
    if (/^intents\.cat(\[|$)/.test(d.path) || d.path === "intents.cat.length") {
      declared["intents.cat dropped, it decided nothing after 1.6.0"]++;
      continue;
    }
    const card = d.path.match(/^cards\[(\d+)\]\.(\w+)$/);
    /* An id format 2 can carry must come back exactly as it went, so only the FIRST minting is
       a declared loss: a file with no id, or one shaped in a way format 2 cannot hold, had no
       identity here to keep. A legal id that moved is a fault and falls through to unexpected. */
    if (card && card[2] === "id") {
      const was = String(((before.cards || [])[+card[1]] || {}).id || "").trim();
      if (!idOk(was)) { declared["card id assigned at conversion, the file carried none it could keep"]++; continue; }
    }
    if (card && (card[2] === "en" || card[2] === "pl")) {
      const i = +card[1];
      const was = (before.cards || [])[i] || {};
      const now = (after.cards || [])[i] || {};
      if (blocksNorm(was[card[2]]) === blocksNorm(now[card[2]])) {
        declared["block whitespace inside a body with alternatives"]++;
        continue;
      }
    }
    if (d.path === "version" && !/^\d{4}-\d{2}-\d{2}/.test(String(before.version || ""))) {
      declared["version label not a date, so it did not travel into date"]++;
      continue;
    }
    unexpected.push(d);
  }
  return { declared, unexpected };
}

function roundTrip(v1, opts) {
  const fwd = toV2(v1, opts || {});
  const back = toV1(fwd.catalog);
  const diffs = [];
  walk(v1, back.catalog, "", diffs);
  const verdict = classify(diffs, v1, back.catalog);
  return { v2: fwd.catalog, back: back.catalog, problems: fwd.problems.concat(back.problems),
           diffs, declared: verdict.declared, unexpected: verdict.unexpected };
}

export { roundTrip, walk, classify, blocksNorm };
