/* NOTHING OF THE SHARED-FOLDER TEAM OR OF THE SHARED CATALOG FILE IS LEFT IN THE ENGINE, in bare node.
 *
 *   node tests/folder-removed-sweep.mjs      exit code is the number of failed checks, capped at 63
 *
 * The folder team (its syncer, mirror and outbox, its join by a folder, a check code and a pasted invitation, the move of a team to a
 * folder) and the shared catalog file (the lock, the shared read and write, the setting) are gone. A name is not the whole of a concept, so
 * this reads the concepts by the words they went under, in the sources the engine ships and in the built page: the shell, the page's
 * modules, the template, the relay and its channel, the README and the harness's own README and chain. A hit outside a named allowance
 * fails, and an allowance that matches nothing fails too, so the list cannot go stale. What an allowance names is a use that is still
 * live (a relay team's mirror, a plain catalog folder on a network share, the one sentence for a team held at a folder) or a note
 * saying what was retired; each carries its reason. The tests/ folder's own retirement notes are not scanned: they are the old sentence
 * beside the new, which the harness's rules ask for.
 *   frs1 every rule reads something: its pattern, planted in a scratch text, is found (the scan is not blind)
 *   frs2 no source, built page, README or chain line holds a removed concept outside its allowance
 *   frs3 every allowance still matches a line it names, in every file it names
 *   frs4 the chain and the harness's README name no leg that no longer exists, and every leg the chain names is a file
 *   frs5 an allowance withdrawn from the list is found out: its lines are reported as hits (the check has teeth)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 5;
let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* THE RULES: a concept by the words it went under. */
const RULES = [
  ["syncer", /folder[- ]?mirror|heldLocalCopy|inHeldCopy|folderOutboxOwes|mirrorOwes|folderSyncer|FolderSyncer|createFolderProgram|syncer-worker|shell\/folder\/|\.outbox\.json|\bsyncer\b/i],
  ["move", /moving team|teamNeedsFolder|copyDeskFilesToFolder|pickMovedFolder|isFolderMove|switchToFolderTeam|checkMatchingFolder|relay-desk-to-folder/],
  ["shared-file", /shared file|shared catalog file|sharedWrite|sharedRead|sharedLock|eHasShared|eSharedRead|eSharedWrite|sharedEditing|SHARED_LOCK|sharededit|etiuda:shared-|catalog-shared\.mjs|catalog-merge/],
  ["folder-team", /folder team|folder-team|folder invitation|inviteFolder|folderTeam\b|chooseInviteFolder|invitePlacePlan|askInviteFolder/],
  ["code", /joinCode|inviteCode|check code|checkCode|data-join-paste|openJoinPaste|join-paste|e-join-code/],
  ["folder-words", /shared folder|shared-folder|folder's join|folder's invitation/i],
  ["outbox", /outbox/i],
  ["drive-place", /placeKindOk|driveTops|placeSlash|placeLeaf|placeJoin|placeUnder|placeRest|syncRootsFrom|placeCandidates|placeResolve|placeKept|readSyncRecords|driveSeen|liveSyncIo|gdriveSeen/],
  ["fault", /outbox-unread|taken-back|data-ec-fault|shareRefused|askRefused|stillReading|teamReading/],
  ["tests-old", /folder-mirror\.mjs|syncer-outbox-unread|syncer-rename-busy|syncer-invariants|relay-desk-to-folder\.mjs/],
];

/* WHAT IS SCANNED: the engine's shipped sources and its built page, the README, and the harness's README and chain. */
const DIRS = ["src", "shell", "relay"];
const FILES = ["engine/etiuda.html", "README.md", "electron-builder.js", "package.json", "tests/README.md", ".gitignore"];
const SKIP_DIR = new Set(["node_modules", "test", ".git"]);
function walk(dir, out) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + e.name;
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(rel, out); }
    else if (/\.(js|cjs|mjs|html|css|json|md|txt|admx|adml|ec|nsh)$/i.test(e.name)) out.push(rel);
  }
  return out;
}
const corpus = new Map();
for (const d of DIRS) for (const f of walk(d, [])) corpus.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
for (const f of FILES) if (fs.existsSync(path.join(ROOT, f))) corpus.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
/* A line of the one-line test chain is taken a leg at a time, so a name is reported by itself and not as a line of 30,000 characters. */
function linesOf(file, text) {
  if (file === "package.json") {
    const scripts = JSON.parse(text).scripts || {};
    return Object.keys(scripts).flatMap(k => scripts[k].split(" && ").map(s => s.trim()));
  }
  return text.split("\n");
}

/* THE ALLOWANCES, each a use that is live or a note of what went: [files, line pattern, reason, rule]. */
const BUILT = "engine/etiuda.html";
const ALLOW = [
  [["src/modules/team-join.js", "src/modules/ui-lang.js", BUILT], /holds through a shared folder|worked through a shared folder/,
    "the one sentence for a team a desk still holds at a shared folder, which Etiuda no longer follows (its row says so once)", "folder-words"],
  [["shell/main.js"], /held through a shared folder|holds through a shared folder/,
    "folderHeld: a team held at a folder is not read as a team, its folder is a plain catalog folder, and a removal inside it removes nothing", "folder-words"],
  [["shell/license_en.txt", BUILT], /instead of a shared folder/,
    "the licence's privacy paragraph contrasts the relay with a shared folder; the licence's words are Max's to change, not a sweep's", "folder-words"],
  [["README.md"], /a team's shared files/, "a relay team's files, which travel sealed: not the shared catalog file", "shared-file"],
  [["shell/relay/channel.cjs"], /is the outbox: the files of this program's own/, "the relay channel's own outbox of files waiting for the relay", "outbox"],
  [["shell/sync/sync.cjs"], /this computer's outbox|plant:outbox-kept/, "personal sync's own outbox, a person's store and not a team's folder", "outbox"],
  [["shell/main.js"], /placeKindOk|driveTops|placeSlash|placeLeaf|placeJoin|placeUnder|placeRest|syncRootsFrom|placeCandidates|placeResolve|placeKept|readSyncRecords|driveSeen|liveSyncIo|gdriveSeen/,
    "the Drive place rules: no desk calls them now, but Studio's pin slices them (its PLACE_DECLS) and tests/drive-join.mjs and tests/member-core.mjs run them, so they go once Studio stops slicing them", "drive-place"],
  [["package.json"], /^node tests\/(folder-team-held|folder-syncer-gone|folder-join-gone|folder-move-gone)\.mjs$/,
    "the legs that hold the new state are named for what went", null],
  [["tests/README.md"], /^(    node tests\/|\| `)(shared-file-gone|team-join|folder-join-gone|folder-syncer-gone|folder-move-gone|folder-removed-sweep|link-handler|drive-join|member-core|folder-team-held)\.mjs/,
    "the harness's account of the legs that hold what was retired: the old sentence beside the new", null],
];

function scan(files, rules, allow) {
  const hits = [], used = allow.map(() => new Map());
  for (const [file, text] of files) {
    linesOf(file, text).forEach((line, i) => {
      for (const [rid, re] of rules) {
        if (!re.test(line)) continue;
        const at = allow.findIndex(a => a[0].includes(file) && a[1].test(line) && (!a[3] || a[3] === rid));
        if (at >= 0) used[at].set(file, (used[at].get(file) || 0) + 1);
        else hits.push(file + ":" + (i + 1) + " [" + rid + "] " + line.trim().slice(0, 110));
      }
    });
  }
  return { hits, used };
}

try {
  /* frs1: the rules are not blind. */
  const samples = { syncer: "const x = folderMirrorOf(a);", move: "function pickMovedFolder() {}", "shared-file": "host.sharedWrite(a)", "folder-team": "a folder team's row",
    code: "const joinCode = 1;", "folder-words": "the team's shared folder", outbox: "owes the outbox", "drive-place": "function placeSlash(p) {}",
    fault: "o.fault === \"outbox-unread\"", "tests-old": "node tests/folder-mirror.mjs" };
  const blind = RULES.filter(([rid, re]) => !re.test(samples[rid] || "")).map(r => r[0]);
  const planted = scan([["src/x.js", Object.values(samples).join("\n")]], RULES, []);
  check(!blind.length && planted.hits.length >= RULES.length, "frs1 each of the " + RULES.length + " rules finds its own planted line: blind " + JSON.stringify(blind) + ", " + planted.hits.length + " hits on the scratch text");

  const real = scan(corpus, RULES, ALLOW);
  check(real.hits.length === 0, "frs2 no shipped source, built page, README or chain line holds a removed concept outside an allowance: " + real.hits.length + " hit(s)" + (real.hits.length ? "\n    " + real.hits.slice(0, 400).join("\n    ") : ""));

  const stale = [];
  ALLOW.forEach((a, i) => a[0].forEach(f => { if (!real.used[i].get(f)) stale.push(f + " " + a[1]); }));
  check(stale.length === 0, "frs3 every allowance matches a line in every file it names: " + stale.length + " stale" + (stale.length ? " " + JSON.stringify(stale.slice(0, 8)) : ""));

  const chain = [...String(corpus.get("package.json") || "").matchAll(/node tests\/([\w.-]+)/g)].map(m => m[1]);
  const missing = [...new Set(chain)].filter(f => !fs.existsSync(path.join(ROOT, "tests", f)));
  const readme = String(corpus.get("tests/README.md") || "");
  const named = [...readme.matchAll(/^    node tests\/([\w.-]+)/gm)].map(m => m[1]).filter(f => !fs.existsSync(path.join(ROOT, "tests", f)));
  check(missing.length === 0 && named.length === 0, "frs4 every leg the chain or the README's command list names is a file in tests/: chain missing " + JSON.stringify(missing) + ", README missing " + JSON.stringify(named));

  const without = scan(corpus, RULES, ALLOW.slice(1));
  check(ALLOW.length === 0 ? true : without.hits.length > real.hits.length, "frs5 withdrawing an allowance turns its lines into hits: " + without.hits.length + " against " + real.hits.length);
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted >= EXPECTED;
if (!complete) console.log("  FAIL only " + asserted + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " folder removed sweep: " + (asserted - failed) + " of " + asserted + " legs green");
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
