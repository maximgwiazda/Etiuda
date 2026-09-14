/* What the harness PRINTS, and what it must never print. Board item 286.
 *
 *   node tests/log-hygiene-selftest.js
 *
 * A catalog is somebody's content: its name says whose, and the name of the organisation is
 * inside it. `.gitignore` keeps the file out of the repository and `tests/README.md` keeps the
 * fixtures outside the tree, and both of those guard the FILE. Neither guards the LOG, and a
 * suite log is the most-pasted artefact this harness makes - into a report, into a chat, into an
 * agent's context. Until 2026-09-14 section 4 of test.js printed
 *
 *     <catalog name> [<version>]: N cards - 0 error(s), 1 warning(s)
 *
 * on every run that had a fixtures folder, so every one of those logs carried the name. That was
 * the only such line in a clean 658-line run, which is what makes it worth a gate rather than a
 * habit: one line, and nothing watching it.
 *
 * THE METHOD IS A SENTINEL, DRIVEN END TO END. A synthetic catalog is written outside the
 * repository with a name and a version no real text can contain, `node tests/test.js` is run
 * against it for real, and the whole of stdout and stderr is searched for those two strings.
 * The case has teeth from three directions and needs all three:
 *
 *   - the superseded line shape, built here from the same catalog, DOES contain the sentinel,
 *     so the search is known to be able to find it;
 *   - section 4 is asserted to have RUN, because a fixtures folder that failed to resolve
 *     prints NOT RUN and passes the sentinel search for the wrong reason - which is precisely
 *     the early victory this folder exists to catch;
 *   - the digest is asserted to still DISTINGUISH, so the replacement is not simply silence.
 *
 * WHAT IT DOES NOT CLAIM. A lint error or warning still quotes card titles, category keys and
 * intent text. That is how a person finds the row, it fires only on a defective catalog and
 * never on a clean one, and case 8 records it rather than permitting it: the behaviour is
 * measured here so that a decision to change it can start from a number. Removing a diagnostic's
 * subject is weakening a check, and that is not this seat's call.
 *
 * Exit code is the number of failed cases. Nothing here launches a browser. */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const E = require("./engine.js");
const T = require("./test.js");

let fails = 0, n = 0;
const ok = (good, what) => { n++; console.log((good ? "  ok   " : "  FAIL ") + what); if (!good) fails++; };

/* Two strings that occur in no catalog, no source file and no message in this tree. They are
   assembled from pieces so that this file cannot be found by searching a log for one of them. */
const MARK = "ZZQQ" + "SENTINEL" + "7F3A";
const NAME = MARK + "-catalog-name";
const VERSION = MARK + "-version";

/* A catalog the linter has nothing to say about, so the end-to-end case is testing the verdict
   line and not a diagnostic. If lintCatalog ever grows a rule this trips, case 3 says so by
   reading a non-zero error or warning count out of the line itself. */
const CATALOG = {
  format: 2,
  kind: "etiuda-catalog",
  id: "log-hygiene-fixture",
  name: NAME,
  rev: 1,
  date: VERSION,
  langs: [{ code: "en", label: "EN" }, { code: "pl", label: "PL" }],
  tags: [
    { id: "t-alpha", kind: "shelf", label: { en: "Alpha", pl: "Alfa" } },
    { id: "t-beta", kind: "shelf", label: { en: "Beta", pl: "Beta" } },
    { id: "t-first", kind: "request", clause: { en: "first intent", pl: "pierwsza intencja" } },
    { id: "t-second", kind: "request", clause: { en: "second intent", pl: "druga intencja" } }
  ],
  cards: [
    { id: "c-one", shelf: "t-alpha", bodyShape: "plain", requests: ["t-first"],
      title: { en: "One", pl: "Jeden" }, body: { en: "English one.", pl: "Polskie jeden." } },
    { id: "c-two", shelf: "t-alpha", bodyShape: "plain", requests: ["t-second"],
      title: { en: "Two", pl: "Dwa" }, body: { en: "English two.", pl: "Polskie dwa." } },
    { id: "c-three", shelf: "t-beta", bodyShape: "plain",
      title: { en: "Three", pl: "Trzy" }, body: { en: "English three.", pl: "Polskie trzy." } }
  ]
};

/* The line as it stood at c21c55f, kept here verbatim as the control. If it ever stops
   containing the sentinel this file is measuring nothing. */
function supersededLine(c, r) {
  // `date` since the fixture became format 2: it is the field the verdict line's digest is
  // built from, which is the only reason this control names a second field at all.
  return (c.name || "unnamed") + (c.date != null ? " [" + c.date + "]" : "")
    + ": " + (c.cards || []).length + " cards - "
    + r.errors.length + " error(s), " + r.warnings.length + " warning(s)";
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-loghygiene-"));
try {
  /* Outside the repository on purpose: engine.js refuses a fixtures folder inside the tree, and
     a catalog inside the tree is the thing .gitignore exists to stop. */
  /* E_CATALOG and format 2, which section 4 of test.js has read since 2026-09-14: the linter
     takes the file through the engine's own reader now, so this case drives the same container
     a desk would hand it. */
  const body = "window.E_CATALOG = " + JSON.stringify(CATALOG, null, 2) + ";" + "\n";
  fs.writeFileSync(path.join(tmp, E.FIXTURE_FILE.catalogV2), body, "utf8");
  fs.writeFileSync(path.join(tmp, E.FIXTURE_FILE.sampleV2), body, "utf8");
  fs.writeFileSync(path.join(tmp, E.FIXTURE_FILE.searchEval), "module.exports = [];" + "\n", "utf8");
  ok(!E.inside(E.ROOT, tmp), "the synthetic catalog is written outside the repository");

  /* 2. THE CONTROL, FIRST. The rule that was replaced, on this same catalog, prints the name. */
  const lintClean = T.lintCatalog(CATALOG);
  ok(supersededLine(CATALOG, lintClean).indexOf(NAME) > -1
     && supersededLine(CATALOG, lintClean).indexOf(VERSION) > -1,
     "the superseded line shape prints both sentinels - so the search below can find them");

  /* 3. And the replacement, on the same input, prints neither, while still saying the counts. */
  const line = T.catalogLintLine(CATALOG, lintClean);
  ok(line.indexOf(NAME) < 0 && line.indexOf(VERSION) < 0 && line.indexOf(MARK) < 0,
     "catalogLintLine prints neither sentinel");
  ok(/\b3 cards, 2 categories, 2 intent\(s\) - 0 error\(s\), 0 warning\(s\)/.test(line),
     "catalogLintLine prints the counts: " + line.replace(/^.*?\): /, ""));

  /* 5 and 6. A digest that cannot tell two catalogs apart has replaced the name with silence.
     Name and version each move it, and the same input twice does not. */
  const id = s => (s.match(/catalog ([0-9a-f]{16})/) || [])[1];
  const base = id(T.catalogLintLine(CATALOG, lintClean));
  const other = id(T.catalogLintLine(Object.assign({}, CATALOG, { name: NAME + "x" }), lintClean));
  const newer = id(T.catalogLintLine(Object.assign({}, CATALOG, { date: VERSION + "x" }), lintClean));
  ok(!!base && base !== other && base !== newer && other !== newer,
     "the digest moves when the name moves and when the version moves: " + base + " " + other + " " + newer);
  ok(base === id(T.catalogLintLine(JSON.parse(JSON.stringify(CATALOG)), lintClean)),
     "and does not move when nothing does");

  /* 7. END TO END, which is the case that matters: the real test.js, the real fixtures wiring,
     every line it writes to either stream. */
  let out = "", code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(E.ROOT, "tests", "test.js")], {
      cwd: E.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { ETIUDA_FIXTURES: tmp })
    });
  } catch (e) { code = e.status === undefined ? -1 : e.status; out = (e.stdout || "") + (e.stderr || ""); }
  /* Section 4 must have RUN. Without this the sentinel search passes on a suite that never
     opened the catalog at all, which is the shape of every false green this folder has met. */
  const ran = /^\[4\/5\] catalog lint/m.test(out) && /^ {2}catalog [0-9a-f]{16} /m.test(out)
    && !/^ {2}NOT RUN/m.test(out.split("[4/5]")[1] || "");
  ok(ran && code === 0, "test.js ran section 4 against the synthetic catalog, exit " + code);
  ok(out.indexOf(MARK) < 0,
     "neither sentinel appears anywhere in " + out.split("\n").length + " lines of its output");

  /* 9. RECORDED, NOT FIXED. A defect still names the row it failed on, in both streams. This
     case is here so the day somebody changes it is a day a check goes red on purpose. */
  const dup = JSON.parse(JSON.stringify(CATALOG));
  /* A DIFFERENT id with the SAME shelf and title, which is the collision this rule is about:
     two format 2 cards may not share an id, so the duplicate a loader cannot see is this one. */
  dup.cards.push({ id: "c-four", shelf: "t-alpha", bodyShape: "plain",
                   title: { en: "One", pl: "Jeden" }, body: { en: "Again.", pl: "Znowu." } });
  const dupLint = T.lintCatalog(dup);
  ok(dupLint.errors.some(s => s.indexOf('"One"') > -1),
     "recorded: a lint error still quotes the card title - " + dupLint.errors.length + " error(s), diagnosis over hygiene");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed" + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
