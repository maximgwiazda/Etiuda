#!/usr/bin/env node
/* FOLD CHECK: a fold that brings onto main more than it says it brings, or anything that says it is held, is refused
 * by a machine before it lands, and what comes in is printed for a human eye either way.
 *
 *     node tools/fold-check.mjs --base <ref> --note <file> <tip> [<tip>...]
 *
 * Node's built-ins and git on the PATH only, run from inside the repository to check, and no path of this repository
 * is named, so the file works unchanged in any repository that has it copied in.
 *
 * Options: --base <ref> (default main), --note <file> (required), --max-list <n> (default 40: how many subjects are
 * printed per tip; every incoming commit is still scanned), --help.
 *
 * For each tip it prints the merge base with the base ref, how many commits that merge base is behind the base
 * (git rev-list --count <mergebase>..<base>; no refusal on that alone, a branch cut long ago is the usual way a fold
 * brings too much), the count of git rev-list --count <base>..<tip>, and the subjects of those commits.
 *
 * THE NOTE is a plain text or Markdown file the lander writes. Only lines of these two forms are read, every other line
 * is ignored. A line may be indented and may begin with one Markdown bullet ("- " or "* "); the keyword is lower case
 * and exact; a line that starts with a keyword and breaks its grammar is a usage error (exit 2), never ignored:
 *
 *     brings: <tip> <n>
 *     lifted: <hash> by <who> at <when>
 *
 *   <tip>   the tip exactly as given on the command line, or, where it is hex of 7 or more digits, a prefix of the
 *           tip's full hash. No spaces.
 *   <n>     the number of commits the tip is expected to bring: digits only.
 *   <hash>  7 to 40 hex digits, a prefix of an incoming commit's hash.
 *   <who>, <when>  any non-empty text; <who> runs up to the last " at ", <when> is the rest.
 *
 * REFUSED (each is a line starting "REFUSED:"):
 *   - a tip with no "brings:" line;
 *   - a tip whose count is not exactly the declared number: MORE refuses because it is the fault this tool exists
 *     for, and FEWER refuses too, because the declared number is the claim and a lander who is wrong low has read the
 *     wrong branch (a deliberate choice: any mismatch refuses);
 *   - a "brings:" line naming no tip given, or a tip declared twice (a stale or ambiguous note);
 *   - an incoming commit that says it is held, unless a "lifted:" line carries its hash;
 *   - a "lifted:" line whose hash is no incoming commit (a stale note);
 *   - a tip with no merge base with the base ref.
 *
 * WHAT "HELD" MATCHES, case-insensitively:
 *   - in the subject: the word "held" as a whole word, anywhere;
 *   - in the body: "held" followed by "for" or "until", only where "held" begins a line (after indentation, one
 *     bullet or quote marker and opening brackets or quotes) or begins a sentence (after ". ", "! " or "? ").
 *     So "Held for deploy day" and "Done. Held until Max rules." match, "the files were held for review" does not.
 *
 * Exit 0 when every tip passes, 1 when any is refused, 2 on a usage or git error. The last line is
 *     #fold-check tips=<n> incoming=<total> held=<n> refused=<n>
 * where incoming counts distinct commits over all tips, held counts distinct incoming commits that say it (lifted ones
 * included) and refused counts the REFUSED lines.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const HELD_SUBJECT = /\bheld\b/i;
export const HELD_BODY = /(?:^|[.!?]\s+)[("'[]*held\s+(?:for|until)\b/i;

export const USAGE = "usage: node tools/fold-check.mjs --base <ref> --note <file> [--max-list <n>] <tip> [<tip>...]\n"
  + "note lines read: `brings: <tip> <n>` and `lifted: <hash> by <who> at <when>`; any mismatch of a count refuses;\n"
  + "'held' matches as a whole word in a subject, and in a body only as 'Held for' or 'Held until' beginning a line or sentence;\n"
  + "exit 0 pass, 1 refused, 2 usage or git error. See the header of tools/fold-check.mjs.";

/** Whether a commit message says it is held: the matching rule is in the header. */
export function saysHeld(subject, body) {
  if (HELD_SUBJECT.test(subject || "")) return true;
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*>]\s+)?/, "");
    if (HELD_BODY.test(line)) return true;
  }
  return false;
}

/** Reads a note. Returns { brings: [{name, n}], lifted: [{hash, who, when}] } or throws an Error naming the line. */
export function parseNote(text) {
  const brings = [], lifted = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\s*(?:[-*]\s+)?/, "").replace(/\s+$/, "");
    if (/^brings:/.test(line)) {
      const m = /^brings: (\S+) (\d+)$/.exec(line);
      if (!m) throw new Error("note line " + (i + 1) + " breaks the grammar `brings: <tip> <n>`: " + line);
      brings.push({ name: m[1], n: parseInt(m[2], 10) });
    } else if (/^lifted:/.test(line)) {
      const m = /^lifted: ([0-9a-fA-F]{7,40}) by (.+) at (.+)$/.exec(line);
      if (!m || !m[2].trim() || !m[3].trim()) throw new Error("note line " + (i + 1) + " breaks the grammar `lifted: <hash> by <who> at <when>`: " + line);
      lifted.push({ hash: m[1].toLowerCase(), who: m[2].trim(), when: m[3].trim() });
    }
  }
  return { brings, lifted };
}

class GitError extends Error {}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new GitError("git could not run: " + r.error.message);
  if (r.status !== 0) throw new GitError("git " + args.join(" ") + " failed: " + (r.stderr || "").trim());
  return r.stdout;
}

function resolveCommit(ref) {
  return git(["rev-parse", "--verify", "--quiet", ref + "^{commit}"]).trim();
}

function incomingOf(base, tip) {
  const out = git(["log", "--format=%H%x1f%s%x1f%b%x1e", base + ".." + tip]);
  const list = [];
  for (const rec of out.split("\x1e")) {
    const r = rec.replace(/^\n/, "");
    if (!r.trim()) continue;
    const [hash, subject, body] = r.split("\x1f");
    list.push({ hash, subject, body: body || "" });
  }
  return list;
}

function parseArgs(argv) {
  const o = { base: "main", note: null, max: 40, tips: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--base") o.base = argv[++i];
    else if (a === "--note") o.note = argv[++i];
    else if (a === "--max-list") o.max = parseInt(argv[++i], 10);
    else if (a.startsWith("--")) throw new Error("unknown option " + a);
    else o.tips.push(a);
  }
  if (!o.help) {
    if (!o.base) throw new Error("--base needs a ref");
    if (!o.note) throw new Error("--note <file> is required");
    if (!o.tips.length) throw new Error("at least one tip is required");
    if (!Number.isInteger(o.max) || o.max < 0) throw new Error("--max-list needs a number");
  }
  return o;
}

export function main(argv, out = s => process.stdout.write(s + "\n"), err = s => process.stderr.write(s + "\n")) {
  let o;
  try { o = parseArgs(argv); } catch (e) { err("fold-check: " + e.message); err(USAGE); return 2; }
  if (o.help) { out(USAGE); return 0; }
  let note;
  try {
    note = parseNote(fs.readFileSync(o.note, "utf8"));
  } catch (e) { err("fold-check: " + e.message); return 2; }

  const refused = [];
  const distinct = new Map();
  let baseHash;
  const tips = [];
  try {
    baseHash = resolveCommit(o.base);
    if (!baseHash) throw new GitError("cannot resolve base " + o.base);
    for (const t of o.tips) {
      const full = resolveCommit(t);
      if (!full) throw new GitError("cannot resolve tip " + t);
      tips.push({ arg: t, full });
    }

    const used = new Array(note.brings.length).fill(false);
    out("base " + o.base + " " + baseHash.slice(0, 8));
    for (const tip of tips) {
      const list = incomingOf(o.base, tip.full);
      const count = parseInt(git(["rev-list", "--count", o.base + ".." + tip.full]).trim(), 10);
      let mb = "";
      try { mb = git(["merge-base", o.base, tip.full]).trim(); } catch (e) { mb = ""; }
      out("");
      out("tip " + tip.arg + " (" + tip.full.slice(0, 8) + ")");
      if (mb) {
        const behind = git(["rev-list", "--count", mb + ".." + o.base]).trim();
        out("  merge base " + mb.slice(0, 8) + ", " + behind + " commit(s) behind " + o.base);
      } else {
        out("  merge base none");
        refused.push("tip " + tip.arg + " shares no history with " + o.base);
      }

      const hits = [];
      note.brings.forEach((b, i) => {
        const hex = /^[0-9a-f]{7,40}$/i.test(b.name);
        if (b.name === tip.arg || (hex && tip.full.startsWith(b.name.toLowerCase()))) hits.push(i);
      });
      hits.forEach(i => { used[i] = true; });
      let declared = null;
      if (hits.length > 1) refused.push("tip " + tip.arg + " is declared " + hits.length + " times in the note");
      else if (hits.length === 1) declared = note.brings[hits[0]].n;
      out("  brings " + count + " commit(s), declared " + (declared === null ? "none" : declared));
      if (hits.length === 0) refused.push("tip " + tip.arg + " has no `brings:` line in the note, and brings " + count);
      else if (hits.length === 1 && declared !== count) {
        refused.push("tip " + tip.arg + " brings " + count + " commit(s) and the note declares " + declared
          + (count > declared ? " (" + (count - declared) + " more than said)" : " (" + (declared - count) + " fewer than said)"));
      }

      let shown = 0;
      for (const c of list) {
        const held = saysHeld(c.subject, c.body);
        if (!distinct.has(c.hash)) distinct.set(c.hash, { ...c, held });
        if (shown < o.max) { out("    " + c.hash.slice(0, 8) + " " + c.subject + (held ? "  [HELD]" : "")); shown++; }
      }
      if (list.length > shown) out("    and " + (list.length - shown) + " more");
    }
    note.brings.forEach((b, i) => { if (!used[i]) refused.push("note declares `brings: " + b.name + " " + b.n + "` for a tip not given (a stale note)"); });
  } catch (e) {
    if (e instanceof GitError) { err("fold-check: " + e.message); return 2; }
    throw e;
  }

  const lifts = note.lifted.map(l => ({ ...l, hit: false }));
  let heldN = 0;
  out("");
  for (const c of distinct.values()) {
    if (!c.held) continue;
    heldN++;
    const l = lifts.find(x => c.hash.startsWith(x.hash));
    if (l) { l.hit = true; out("lifted " + c.hash.slice(0, 8) + " by " + l.who + " at " + l.when + ": " + c.subject); }
    else refused.push("commit " + c.hash.slice(0, 8) + " says it is held and the note has no `lifted:` line for it: " + c.subject);
  }
  for (const l of lifts) {
    if (!l.hit) {
      const any = [...distinct.keys()].some(h => h.startsWith(l.hash));
      refused.push("`lifted: " + l.hash + "` names " + (any ? "an incoming commit that does not say it is held" : "no incoming commit") + " (a stale note)");
    }
  }
  for (const r of refused) out("REFUSED: " + r);
  out("#fold-check tips=" + tips.length + " incoming=" + distinct.size + " held=" + heldN + " refused=" + refused.length);
  return refused.length ? 1 : 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) process.exit(main(process.argv.slice(2)));
