/* A CATALOG THAT IS NOBODY'S, for the window legs on GitHub's runner.
 *
 *     node tools/ci-catalog.mjs --root <tree> --out <dir>
 *
 * tests/shell-smoke.js, tests/reinstall.js and tests/catalog-watch.js ask E.fixtures for
 * "catalogEc": a format 2 catalog document that is not the shipped sample. On the desk that is a
 * real catalog in a folder outside the tree, and a real catalog never goes to a runner. This file
 * makes the stand-in there instead, from the sample the tree ships and nothing else:
 *
 *   - every word of every title, body, keyword list, tag label and the facts is replaced by an
 *     invented word, built from a syllabary by a seeded hash of the word it replaces, so one word
 *     always becomes the same word and the output is the same bytes on every machine;
 *   - every {PLACEHOLDER}, every punctuation mark, line and bracket line stays where it stood, so
 *     the document keeps the sample's structure and the engine's own checks still apply;
 *   - every card gets a new id, and every value that named an old id names the new one;
 *   - 14 cards more than the sample, its id, edition, date and roles its own, `sample` false.
 *
 * The result is checked with the tree's own v2Problems before it is written, and the run refuses
 * on any problem. Beside it goes sample-catalog.ec, the 09-17 sample shell-smoke's 2k4b asks for,
 * read from the tree's own history (8e839ddc) and checked by its sha256 prefix. Nothing here reads
 * ETIUDA_FIXTURES, and nothing it writes is derived from any catalog but the tree's own sample.
 *
 * The runner's two files fetch this one from the workflow's own commit, as they are fetched
 * (.github/workflows/verify.yml), so a tree under test never supplies its own stand-in maker. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SEED = "ci-catalog-1";
const EXTRA = 14;
const OLD_SAMPLE = { commit: "8e839ddc", sha16: "2fa81658b7ad2b4c" };
const SYL = ["ka", "ro", "mi", "tu", "le", "sa", "no", "vi", "da", "pe", "lo", "zu", "ne", "ti", "ba", "gor",
  "fen", "mar", "sol", "vek", "ril", "dan", "pos", "tem"];

function die(what) { console.error("ci-catalog: " + what); process.exit(1); }

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") o.root = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
    else die("unknown argument " + argv[i]);
  }
  if (!o.root || !o.out) die("usage: --root <tree> --out <dir>");
  return o;
}

/* One word to one invented word, the same every time: a hash of the seed and the word picks the
   syllables, as many as the word is long in thirds, at least one and at most four. Case follows. */
function invent(word) {
  const h = crypto.createHash("sha256").update(SEED + "\0" + word.toLowerCase()).digest();
  const n = Math.max(1, Math.min(4, Math.round(word.length / 3)));
  let w = "";
  for (let i = 0; i < n; i++) w += SYL[h[i] % SYL.length];
  if (word === word.toUpperCase() && word.length > 1) return w.toUpperCase();
  if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) return w[0].toUpperCase() + w.slice(1);
  return w;
}

/* Letters outside {...} become invented words; everything else stays byte for byte. A line that
   is wholly in brackets is a body marker, format vocabulary the engine reads, and stays as it is. */
function reword(text) {
  return String(text).split("\n").map(line => /^\[[^\]]*\]$/.test(line.trim()) ? line
    : line.split(/(\{[^{}]*\})/).map(part => /^\{[^{}]*\}$/.test(part) ? part
      : part.replace(/\p{L}+/gu, invent)).join("")).join("\n");
}

function rewordLangs(v) {
  if (typeof v === "string") return reword(v);
  if (Array.isArray(v)) return v.map(rewordLangs);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = rewordLangs(v[k]); return o; }
  return v;
}

/* Every string anywhere that equals an old card id names the new one instead. */
function renameIds(v, map) {
  if (typeof v === "string") return map.has(v) ? map.get(v) : v;
  if (Array.isArray(v)) return v.map(x => renameIds(x, map));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = renameIds(v[k], map); return o; }
  return v;
}

export async function makeCatalog(root) {
  const sample = JSON.parse(fs.readFileSync(path.join(root, "shell", "sample-catalog.ec"), "utf8"));
  const doc = JSON.parse(JSON.stringify(sample));
  doc.id = "ci-invented";
  doc.rev = (+sample.rev || 1) + 6;
  doc.date = "2026-01-01";
  doc.sample = false;
  doc.role = (sample.role || []).map(invent);
  doc.facts = reword(sample.facts || "");
  doc.tags = (sample.tags || []).map(t => Object.assign({}, t, t.label ? { label: rewordLangs(t.label) } : {}));
  const map = new Map();
  doc.cards.forEach((c, i) => map.set(c.id, "c-ci-" + String(i + 1).padStart(3, "0")));
  doc.cards = doc.cards.map(c => {
    const n = renameIds(c, map);
    for (const k of ["title", "body", "k"]) if (n[k] !== undefined) n[k] = rewordLangs(n[k]);
    return n;
  });
  for (let i = 0; i < EXTRA; i++) {
    const src = doc.cards[i];
    const extra = JSON.parse(JSON.stringify(src));
    extra.id = "c-ci-x" + String(i + 1).padStart(2, "0");
    extra.title = rewordLangs(JSON.parse(JSON.stringify(src.title)));
    for (const code of Object.keys(extra.title || {})) extra.title[code] = String(extra.title[code]) + " " + invent("extra" + i);
    delete extra.firstOnly;
    doc.cards.push(extra);
  }
  const v2 = await import(pathToFileURL(path.join(root, "src", "modules", "catalog-v2.js")).href);
  const problems = v2.v2Problems(doc);
  if (problems.length) die("the stand-in fails the tree's own v2Problems: " + problems.slice(0, 5).join("; "));
  return doc;
}

export function oldSample(root) {
  const bytes = execFileSync("git", ["show", OLD_SAMPLE.commit + ":shell/sample-catalog.ec"], { cwd: root, maxBuffer: 64 << 20 });
  const sha = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if (sha !== OLD_SAMPLE.sha16) die("the 09-17 sample at " + OLD_SAMPLE.commit + " hashes to " + sha + ", want " + OLD_SAMPLE.sha16);
  return bytes;
}

async function main() {
  const o = args(process.argv.slice(2));
  const root = path.resolve(o.root), out = path.resolve(o.out);
  const rel = path.relative(root, out);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) die("--out is inside the tree: " + out);
  const doc = await makeCatalog(root);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "etiuda-catalog.ec"), JSON.stringify(doc, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "sample-catalog.ec"), oldSample(root));
  console.log("#ci-catalog cards=" + doc.cards.length + " tags=" + doc.tags.length + " id=" + doc.id + " out=" + out);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch(e => die(e && e.stack ? e.stack : String(e)));
