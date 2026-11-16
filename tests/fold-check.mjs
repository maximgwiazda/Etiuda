/* FOLD CHECK LEG: tools/fold-check.mjs refuses a fold that brings more than it says, or anything held.
 *
 *     node tests/fold-check.mjs
 *
 * It builds small throwaway git repositories under the OS temp directory (removed at the end, by its literal folder),
 * runs the tool in them and judges its exit code and lines. Node and git only; no window, no network.
 * The plants run the same scenarios against a copy of the tool with one rule spoiled and expect the leg to notice
 * (ETIUDA_PLANTS=off skips them).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools", "fold-check.mjs");

let asserted = 0, failed = 0, skipped = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}
function skip(line) {
  skipped++;
  process.stdout.write("  NOT RUN " + line + "\n");
}

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}

function commit(cwd, subject, body) {
  const args = ["commit", "--allow-empty", "-m", subject];
  if (body) args.push("-m", body);
  git(cwd, ...args);
  return git(cwd, "rev-parse", "HEAD");
}

function run(tool, cwd, noteText, args, noteFile) {
  const note = path.join(cwd, "..", noteFile || "note.txt");
  fs.writeFileSync(note, noteText);
  const r = spawnSync(process.execPath, [tool, "--note", note, ...args], { cwd, encoding: "utf8" });
  const text = r.stdout || "";
  return {
    code: r.status, text, err: r.stderr || "",
    refused: text.split("\n").filter(l => l.startsWith("REFUSED:")),
    last: text.trim().split("\n").pop(),
  };
}

/** One repository: main with four commits, `old` cut after the first (three behind), and one branch per case. */
function build(lab) {
  const repo = path.join(lab, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Fold Check Leg");
  git(repo, "config", "user.email", "leg@example.invalid");
  git(repo, "config", "commit.gpgsign", "false");
  commit(repo, "root");
  git(repo, "branch", "old");
  commit(repo, "main two");
  commit(repo, "main three");
  commit(repo, "main four");
  const mk = (name, from, ...commits) => {
    git(repo, "checkout", "-q", "-b", name, from);
    for (const [s, b] of commits) commit(repo, s, b);
    git(repo, "checkout", "-q", "main");
  };
  mk("clean", "main", ["Add the thing"], ["Add the other thing", "A plain body.\nSecond line."]);
  mk("heldsub", "main", ["Held for deploy day: the new ids"]);
  mk("heldbody", "main", ["Add the ids", "Why: needed.\n\nHeld for Max's ruling.\n"]);
  mk("heldsentence", "main", ["Add the ids again", "Done in full. Held until the release is signed."]);
  mk("prose", "main", ["Tidy the store", "The files were held for review by the lead and then released; nothing here waits."]);
  mk("oldtwo", "old", ["Old one"], ["Old two"]);
  return repo;
}

function scenarios(tool, lab, repo) {
  const r = {};
  const base = ["--base", "main"];
  r.clean = run(tool, repo, "Fold note\nbrings: clean 2\n", [...base, "clean"]);
  r.undeclared = run(tool, repo, "brings: heldsub 1\nlifted: " + git(repo, "rev-parse", "heldsub").slice(0, 8) + " by Leg at now\n", [...base, "clean"]);
  r.more = run(tool, repo, "brings: clean 1\n", [...base, "clean"]);
  r.fewer = run(tool, repo, "brings: clean 3\n", [...base, "clean"]);
  r.heldSubject = run(tool, repo, "brings: heldsub 1\n", [...base, "heldsub"]);
  r.heldBody = run(tool, repo, "brings: heldbody 1\n", [...base, "heldbody"]);
  r.heldSentence = run(tool, repo, "brings: heldsentence 1\n", [...base, "heldsentence"]);
  const hs = git(repo, "rev-parse", "heldsub");
  r.lifted = run(tool, repo, "brings: heldsub 1\n- lifted: " + hs.slice(0, 8) + " by Max at 2026-11-16 12:00\n", [...base, "heldsub"]);
  r.stale = run(tool, repo, "brings: clean 2\nlifted: " + hs.slice(0, 8) + " by Max at 2026-11-16 12:00\n", [...base, "clean"]);
  r.prose = run(tool, repo, "brings: prose 1\n", [...base, "prose"]);
  r.old = run(tool, repo, "brings: oldtwo 2\n", [...base, "oldtwo"]);
  r.hashName = run(tool, repo, "brings: " + git(repo, "rev-parse", "clean").slice(0, 9) + " 2\n", [...base, "clean"]);
  r.two = run(tool, repo, "brings: clean 2\nbrings: prose 1\n", [...base, "clean", "prose"]);
  return r;
}

function main() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "fold-check-"));
  try {
    const repo = build(lab);
    const r = scenarios(TOOL, lab, repo);

    check(r.clean.code === 0 && r.clean.refused.length === 0 && r.clean.last === "#fold-check tips=1 incoming=2 held=0 refused=0",
      "fc1 a clean fold passes, with its two subjects printed: " + r.clean.last
      + (r.clean.text.includes("Add the thing") && r.clean.text.includes("Add the other thing") ? "" : " (subjects missing)"));
    check(r.clean.text.includes("Add the thing") && r.clean.text.includes("Add the other thing"), "fc1b every incoming subject is printed for the eye");
    check(r.undeclared.code === 1 && r.undeclared.refused.some(l => /tip clean has no `brings:` line/.test(l)),
      "fc2 a tip with no declaration is refused: " + (r.undeclared.refused[0] || "none"));
    check(r.more.code === 1 && r.more.refused.some(l => /brings 2 commit\(s\) and the note declares 1/.test(l)),
      "fc3 a tip bringing more than declared is refused: " + (r.more.refused[0] || "none"));
    check(r.fewer.code === 1 && r.fewer.refused.some(l => /fewer than said/.test(l)),
      "fc4 a tip bringing fewer than declared is refused too: " + (r.fewer.refused[0] || "none"));
    check(r.heldSubject.code === 1 && r.heldSubject.refused.some(l => /says it is held/.test(l)) && r.heldSubject.last.includes("held=1"),
      "fc5 a held subject is refused: " + (r.heldSubject.last));
    check(r.heldBody.code === 1 && r.heldBody.refused.some(l => /says it is held/.test(l)),
      "fc6 a body line 'Held for ...' is refused: " + (r.heldBody.refused[0] || "none"));
    check(r.heldSentence.code === 1 && r.heldSentence.refused.some(l => /says it is held/.test(l)),
      "fc6b a body sentence 'Held until ...' is refused: " + (r.heldSentence.refused[0] || "none"));
    check(r.lifted.code === 0 && r.lifted.refused.length === 0 && /^lifted [0-9a-f]{8} by Max at 2026-11-16 12:00/m.test(r.lifted.text)
      && r.lifted.last === "#fold-check tips=1 incoming=1 held=1 refused=0",
      "fc7 a lifted line lets the held commit pass and is printed: " + r.lifted.last);
    check(r.stale.code === 1 && r.stale.refused.some(l => /lifted: [0-9a-f]+` names no incoming commit/.test(l)),
      "fc8 a lifted line for a commit that is not incoming is an error: " + (r.stale.refused[0] || "none"));
    check(r.prose.code === 0 && r.prose.last === "#fold-check tips=1 incoming=1 held=0 refused=0",
      "fc9 prose that merely mentions 'held' in a body does not refuse: " + r.prose.last);
    check(/merge base [0-9a-f]{8}, 3 commit\(s\) behind main/.test(r.old.text) && r.old.code === 0,
      "fc10 the merge base and its distance behind the base are printed, with no refusal on that alone: "
      + ((/merge base .*/.exec(r.old.text) || ["none"])[0]));
    check(r.hashName.code === 0, "fc11 a declaration may name the tip by a hash prefix");
    check(r.two.code === 0 && r.two.last === "#fold-check tips=2 incoming=3 held=0 refused=0",
      "fc12 two tips are each judged against their own declaration: " + r.two.last);
    const bad = run(TOOL, repo, "brings: clean two\n", ["--base", "main", "clean"]);
    check(bad.code === 2, "fc13 a note line that breaks the grammar is a usage error, exit " + bad.code);
    const noref = run(TOOL, repo, "brings: nosuch 1\n", ["--base", "main", "nosuch"]);
    check(noref.code === 2, "fc14 a tip git cannot resolve is a git error, exit " + noref.code);
    const help = spawnSync(process.execPath, [TOOL, "--help"], { cwd: repo, encoding: "utf8" });
    check(help.status === 0 && /brings: <tip> <n>/.test(help.stdout) && /lifted: <hash> by <who> at <when>/.test(help.stdout),
      "fc15 --help states the note grammar");
    const cap = spawnSync(process.execPath, [TOOL, "--max-list", "1", "--base", "main", "--note", path.join(lab, "note.txt"), "clean"], { cwd: repo, encoding: "utf8" });
    check(/and 1 more/.test(cap.stdout), "fc16 the printed list is capped with 'and N more' (the scan is not)");

    /* Plants: the same scenarios against a copy of the tool with one rule spoiled; the leg must see the difference. */
    const plant = (name, from, to, seen, what) => {
      if (PLANTS_OFF) { skip(name + " plant: " + what + " is caught (ETIUDA_PLANTS=off)"); return; }
      const src = fs.readFileSync(TOOL, "utf8");
      const spoiled = src.replace(from, to);
      if (spoiled === src) { check(false, name + " plant: the spoiling did not apply to the tool's source"); return; }
      const copy = path.join(lab, "planted-" + name + ".mjs");
      fs.writeFileSync(copy, spoiled);
      const pr = scenarios(copy, lab, repo);
      check(seen(pr), name + " plant: " + what + " is caught");
    };
    plant("p1", "declared !== count", "declared < count",
      pr => pr.fewer.code === 0, "a tool that lets a fold bring fewer than declared");
    plant("p2", "(?:for|until)", "(?:xx)",
      pr => pr.heldBody.code === 0 && pr.heldSentence.code === 0, "a tool whose body check no longer sees 'Held for' or 'Held until'");
    plant("p3", "if (!l.hit) {", "if (false) {",
      pr => pr.stale.code === 0, "a tool that lets a stale lifted line stand");
    plant("p4", "if (hits.length === 0) refused.push", "if (false) refused.push",
      pr => pr.undeclared.code === 0 || !pr.undeclared.refused.some(l => /no `brings:` line/.test(l)), "a tool that lets an undeclared tip land");
  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }

  process.stdout.write("#counts checks=" + asserted + " skipped=" + skipped + " failures=" + failed + "\n");
  process.stdout.write("fold-check " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted + " check(s)\n");
  process.exit(failed ? 1 : 0);
}

main();
