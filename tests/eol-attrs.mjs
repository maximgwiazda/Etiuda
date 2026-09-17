/* WHAT A FRESH CLONE WRITES, decided before it is cloned.
 *
 * A checkout's line endings are settled by three things: the blob, `core.autocrlf` on whatever
 * desk does the cloning, and `.gitattributes` in the tree. Only the third is ours, and this tree
 * has had it since `8711db8`. What it has not had is anything that NOTICES if it goes: the rule
 * was a file nobody reads and a habit of glancing at `git diff --stat`.
 *
 * The sibling repository is the worked example. Studio was cloned on a desk with
 * `core.autocrlf=true` and no attributes file, so every text file landed CRLF: `tools/pre-commit`
 * came out 14553 bytes against the blob's 14263, 290 carriage returns the repository does not
 * hold. Git for Windows' own `sh` runs such a hook anyway, which is exactly why nothing noticed;
 * a POSIX `sh` reads `#!/usr/bin/env sh\r` as a bad interpreter and refuses, and a byte-for-byte
 * comparison against a fixture is wrong by the number of lines in it.
 *
 * So this gate does not measure a checkout, which would only ever measure THIS desk. It reads
 * the attributes THE INDEX declares, `--cached`, because that is the copy a clone gets before it
 * has a working tree at all. The rule is one line: no tracked file may leave the question open.
 *
 *   text: unspecified  -> refused. The answer then comes from the cloning desk.
 *   text: unset        -> accepted. The file is declared binary and no conversion applies.
 *   text: auto | set   -> accepted only with eol: lf.
 *
 * PROVED BY MAKING IT FAIL: in a fresh clone of this repository at `main`, `git rm --cached
 * .gitattributes` and all 184 remaining tracked files are refused; put it back and 185 of 185
 * pass. The same file in Studio refused 55 of 55 before its attributes file existed.
 */
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const files = git("ls-files", "-z").split("\0").filter(Boolean);
if (!files.length) {
  console.log("  FAIL the repository lists no tracked files, so this gate checked nothing");
  console.log("#counts files=0 ok=0 unspecified=0 wrongEol=0");
  console.log("SUITE DID NOT COMPLETE: nothing to read attributes for");
  process.exit(78);
}

/* check-attr in one call per 200 paths: a command line has a ceiling and 55 files today is not
   the number this repository will have. -z on both sides, because a path may hold a space. */
const attr = new Map();
for (let i = 0; i < files.length; i += 200) {
  const batch = files.slice(i, i + 200);
  const out = git("check-attr", "--cached", "-z", "text", "eol", "--", ...batch).split("\0");
  for (let j = 0; j + 2 < out.length; j += 3) {
    const rec = attr.get(out[j]) || {};
    rec[out[j + 1]] = out[j + 2];
    attr.set(out[j], rec);
  }
}

let ok = 0;
const unspecified = [], wrongEol = [], missing = [];
for (const f of files) {
  const a = attr.get(f);
  if (!a) { missing.push(f); continue; }
  if (a.text === "unspecified") { unspecified.push(f); continue; }
  if (a.text === "unset") { ok++; continue; }          // declared binary, no conversion
  if (a.eol === "lf") { ok++; continue; }
  wrongEol.push(f + " (text: " + a.text + ", eol: " + a.eol + ")");
}

const show = list => list.slice(0, 8).map(f => "       " + f).concat(
  list.length > 8 ? ["       ... and " + (list.length - 8) + " more"] : []).join("\n");

if (missing.length) console.log("  FAIL " + missing.length + " tracked file(s) got no answer from check-attr\n" + show(missing));
if (unspecified.length)
  console.log("  FAIL " + unspecified.length + " tracked file(s) leave `text` unspecified, so what a clone writes"
    + " is decided by the cloning desk's core.autocrlf and not by this repository\n" + show(unspecified));
if (wrongEol.length)
  console.log("  FAIL " + wrongEol.length + " tracked text file(s) are not pinned to LF\n" + show(wrongEol));
if (!missing.length && !unspecified.length && !wrongEol.length)
  console.log("  ok all " + ok + " tracked file(s) declare their own line endings: LF, or binary and no conversion");

const fail = missing.length + unspecified.length + wrongEol.length;
console.log("#counts files=" + files.length + " ok=" + ok + " unspecified=" + unspecified.length
  + " wrongEol=" + wrongEol.length + " noAnswer=" + missing.length);
console.log((fail ? "eol-attrs FAILED: " : "eol-attrs passed: ") + ok + "/" + files.length
  + " tracked files pinned by the index's own attributes");
process.exitCode = fail ? 1 : 0;
