/* One-off converter, format 1 to format 2. It runs outside the engine and is bundled into
   nothing: 2.0.0 reads format 2 and has no reader for anything else, so this is the only
   thing left that understands a format 1 file.
   Usage:
     node tools/catalog-v2/convert.mjs <in.js|in.json> --out <name.ec> [--js <name.js>]
                                       [--id x] [--name "X"] [--rev 1] [--date 2026-09-14]
   It refuses to write over an existing file, and it refuses to write anywhere inside this
   repository, which is public and holds no catalog. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { roundTrip } from "./roundtrip.mjs";
import { inside } from "./inside.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function die(msg) { console.error("convert  " + msg); process.exit(1); }

let evaluate = false;
function readV1(path) {
  let raw = readFileSync(path, "utf8").replace(/^﻿/, "").trim();
  /* The payload is found by literal search, the way the engine's own importer found it: a
     catalog file is a one-line assignment with a comment header, not a module. Two globals
     were in circulation, the catalog beside the engine and the sample beside it. */
  for (const name of ["PB_CATALOG", "PB_SAMPLE"]) {
    const at = raw.indexOf(name);
    if (at < 0) continue;
    const eq = raw.indexOf("=", at);
    if (eq > -1) raw = raw.slice(eq + 1).trim().replace(/;\s*$/, "");
    break;
  }
  try { return JSON.parse(raw); }
  catch (e) {
    /* A file an engine wrote is JSON. A file a person wrote is a JavaScript object literal
       with bare keys, and the published sample is one. --eval is opt-in and it EVALUATES,
       which the engine itself may never do: this tool is run once, offline, by the owner of
       the file, and the alternative is retyping a catalog by hand. */
    if (evaluate) {
      try { return runInNewContext("(" + raw + ")", Object.create(null), { timeout: 5000 }); }
      catch (e2) { die("not a format 1 catalog, even evaluated: " + (e2 && e2.message ? e2.message : "")); }
    }
    die("not a format 1 catalog: " + (e && e.message ? e.message : "could not parse")
      + " (a hand-written file with bare keys needs --eval)");
  }
}

function flags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

function guardDestination(path) {
  if (inside(REPO, path)) die("refusing to write inside this repository: a catalog is content and this tree is public");
  if (existsSync(path)) die("refusing to write over " + path + ", which exists: name a destination that does not");
}

const args = flags(process.argv.slice(2));
if (!args._.length || !args.out) die("usage: convert.mjs <in.js|in.json> --out <name.ec> [--js <name.js> [--global E_SAMPLE]] [--eval]");

const src = args._[0];
evaluate = args.eval === true || args.eval === "true";
const v1 = readV1(src);
const opts = {};
for (const k of ["id", "name", "rev", "date"]) { if (typeof args[k] === "string") opts[k] = args[k]; }

const r = roundTrip(v1, opts);
const counts = {
  cards: (r.v2.cards || []).length,
  shelves: (r.v2.tags || []).filter(t => t.kind === "shelf").length,
  requests: (r.v2.tags || []).filter(t => t.kind === "request").length,
  langs: (r.v2.langs || []).map(l => l.code).join("+"),
  plain: (r.v2.cards || []).filter(c => c.bodyShape === "plain").length,
  steps: (r.v2.cards || []).filter(c => c.bodyShape === "steps").length,
  alts: (r.v2.cards || []).filter(c => c.bodyShape === "alts").length
};
console.log("convert  " + counts.cards + " cards, " + counts.shelves + " shelves, " + counts.requests
  + " requests, langs " + counts.langs + ", bodies " + counts.plain + " plain / " + counts.steps
  + " steps / " + counts.alts + " alts");
for (const [what, n] of Object.entries(r.declared)) { if (n) console.log("  declared  " + n + "  " + what); }

if (r.problems.length) {
  for (const p of r.problems.slice(0, 20)) console.log("  problem  " + p);
  die(r.problems.length + " problem(s), nothing written");
}
if (r.unexpected.length) {
  /* Paths, never values. An unexpected difference is a defect in this tool and the path is
     what finds it; the words on either side belong to whoever wrote the catalog. */
  for (const d of r.unexpected.slice(0, 20)) console.log("  differs  " + d.path + "  (" + d.kind + ")");
  die(r.unexpected.length + " unexpected difference(s) on the way back, nothing written");
}
console.log("  ok  the round trip differs nowhere this converter did not choose");

guardDestination(args.out);
writeFileSync(args.out, JSON.stringify(r.v2, null, 1) + "\n", "utf8");
console.log("  wrote  " + args.out + "  " + JSON.stringify(r.v2).length + " bytes of JSON");

if (typeof args.js === "string") {
  guardDestination(args.js);
  /* A page opened from file:// cannot fetch a sibling, but it can run one as a script. So the
     document is JSON and the sibling is that same JSON behind one assignment: one format, two
     containers, and the engine's reader strips the assignment if it is there. */
  const head = "/* Etiuda catalog, format 2. Load it: Library > Import catalog, any filename.\n"
    + "   A file named etiuda-catalog.js beside the engine also loads on launch. */\n";
  const global = (typeof args.global === "string") ? args.global : "E_CATALOG";
  writeFileSync(args.js, head + "window." + global + " = " + JSON.stringify(r.v2, null, 1) + ";\n", "utf8");
  console.log("  wrote  " + args.js + "  the same catalog behind window." + global);
}
