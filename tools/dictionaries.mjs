/* THE SPELLING DICTIONARIES A LINUX PACKAGE CARRIES, pinned here by hash and fetched at packaging time.
 *
 *   node tools/dictionaries.mjs <folder>     fetch into <folder> what is not already there whole, and the notice;
 *                                            exit 0, or 1 naming what could not be had
 *
 * WHY: on Linux Chromium checks spelling with Hunspell and downloads each language's dictionary from
 * Google's server at the first window. The shell refuses that download (shell/main.js, spellingFromPackage),
 * so a desk underlines nothing unless the package brings the files; tools/package-linux.mjs runs this
 * before electron-builder and electron-builder.js copies the folder into resources/dictionaries.
 *
 * WHY THE BYTES ARE NOT IN THIS REPOSITORY. Every file here outside v1/ is under the root licence whatever
 * it carries (CLAUDE.md), and the Polish list is distributed under the Mozilla Public License 1.1, which
 * the root licence must not be presented as covering. So the tree holds the hashes, the notice and the
 * address, and a package built on any machine carries these bytes or is not built: a file whose sha256
 * differs from the one below is refused, whoever served it.
 *
 * WHERE THEY COME FROM: chromium/deps/hunspell_dictionaries at the commit Chromium 152, Electron 44's,
 * pins in its DEPS. Gitiles serves a file at a commit as base64 under ?format=TEXT; Chromium's own
 * dictionary server is the second source for the two .bdic files and sent the same bytes (both sha256
 * measured 2026-10-06). A later Electron may ask for another version (Chromium main has moved English to
 * -10-2): the names below are then not what Chromium looks for, and the launch leg's suggestions go red.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const COMMIT = "cccf64a8acc951afe3f47fee023908e55699bc58";
export const SOURCE = "https://chromium.googlesource.com/chromium/deps/hunspell_dictionaries/+/" + COMMIT + "/";
const SERVER = "https://redirector.gvt1.com/edgedl/chrome/dict/";

/* Chromium's own casing, which is the name it looks for on disk; its server takes the name lowercased. */
export const FILES = [
  { name: "en-US-10-1.bdic", size: 451968, sha256: "a075b01d9b015c616511a9e87da77da3d9881621db32f584e4606ddabf1c1100" },
  { name: "pl-PL-3-0.bdic", size: 3233589, sha256: "a04c51759b6e54f01e628dfc6354ca88a0711d8bcefa6a8c0e8baa04156fb92e" },
  { name: "README_en_US.txt", size: 15732, sha256: "168b4c01cb841f766a72f310b065c04d09cff46376c37a81d799593ce751c371" },
  { name: "README_pl_PL.txt", size: 802, sha256: "43c04d543d1c8b92c47373b3627386c16f2f6d80c108a8ebeae8709e7d1e276c" },
  { name: "COPYING.MPL", size: 25755, sha256: "53692a2ed6c6a2c6ec9b32dd0b820dfae91e0a1fcdf625ca9ed0bdf8705fcc4f" },
];
/* The notice is this tree's own words and ships beside the files as NOTICE.txt. */
export const NOTICE_NAME = "NOTICE.txt";
export const NOTICE_FILE = join(ROOT, "shell", "dictionaries-notice.txt");

const sha256 = b => createHash("sha256").update(b).digest("hex");

/** One line per thing the folder at `dir` lacks against `files` and `notice`; [] when it has them all. */
export function dictionaryProblems(dir, files, notice) {
  const want = files || FILES, text = notice === undefined ? readFileSync(NOTICE_FILE) : notice;
  if (!dir || !existsSync(dir)) return [String(dir) + " is not there, so no dictionary was read"];
  const out = [];
  for (const f of want) {
    const at = join(dir, f.name);
    if (!existsSync(at)) { out.push(f.name + " is missing"); continue; }
    const got = sha256(readFileSync(at));
    if (got !== f.sha256) out.push(f.name + " is not the pinned file: sha256 " + got.slice(0, 12) + ", pinned " + f.sha256.slice(0, 12));
  }
  const n = join(dir, NOTICE_NAME);
  if (!existsSync(n)) out.push(NOTICE_NAME + " is missing");
  else if (!readFileSync(n).equals(Buffer.from(text))) out.push(NOTICE_NAME + " is not this tree's notice");
  return out;
}

/* Where each file is asked for, in order: the commit first, then for a dictionary the server Chromium itself uses. */
export function sourcesOf(name) {
  const out = [{ url: SOURCE + name + "?format=TEXT", base64: true }];
  if (/\.bdic$/.test(name)) out.push({ url: SERVER + name.toLowerCase(), base64: false });
  return out;
}
async function webGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " answered " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/** Fill `dir`: a file already there whole is kept, any other is asked for and written only if its hash is
 *  the pinned one. `get(url)` answers bytes and is the web unless a caller hands another. Throws naming
 *  every file it could not have, and no file is ever written under its name with other bytes. */
export async function fetchDictionaries(dir, opts) {
  const o = opts || {}, want = o.files || FILES, get = o.get || webGet;
  mkdirSync(dir, { recursive: true });
  const kept = [], fetched = [], failed = [];
  for (const f of want) {
    const at = join(dir, f.name);
    if (existsSync(at) && sha256(readFileSync(at)) === f.sha256) { kept.push(f.name); continue; }
    const why = [];
    let got = null;
    for (const s of sourcesOf(f.name)) {
      try {
        const raw = await get(s.url);
        const bytes = s.base64 ? Buffer.from(raw.toString("latin1").trim(), "base64") : raw;
        if (sha256(bytes) === f.sha256) { got = bytes; break; }
        why.push(s.url + " sent " + bytes.length + " byte(s) of sha256 " + sha256(bytes).slice(0, 12));
      } catch (e) { why.push(String((e && e.message) || e)); }
    }
    if (!got) { failed.push(f.name + ": " + why.join("; ")); continue; }
    writeFileSync(at + ".tmp", got);
    renameSync(at + ".tmp", at);
    fetched.push(f.name);
  }
  if (failed.length) throw new Error("no pinned copy of " + failed.join(" | "));
  writeFileSync(join(dir, NOTICE_NAME), o.notice === undefined ? readFileSync(NOTICE_FILE) : o.notice);
  return { kept, fetched };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node tools/dictionaries.mjs <folder>"); process.exit(2); }
  try {
    const r = await fetchDictionaries(resolve(dir));
    const bad = dictionaryProblems(resolve(dir));
    if (bad.length) throw new Error(bad.join("; "));
    console.log("dictionaries: " + r.kept.length + " kept, " + r.fetched.length + " fetched, each its pinned sha256, into " + resolve(dir));
  } catch (e) {
    console.error("dictionaries: refused: " + ((e && e.message) || e));
    process.exit(1);
  }
}
