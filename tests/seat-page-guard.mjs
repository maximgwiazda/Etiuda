/* GUARD CHECK FOR SEATED BROWSER PAGE LEGS.
 *
 * Every test script directly under tests/ that loads etiuda.html in a headless browser
 * (by page.goto or Puppeteer + runFolder) must boot through tests/seat-page.js or sit on
 * DOOR_LEGS there with its reason.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { DOOR_LEGS, seatedView } = require("./seat-page.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const IGNORED = new Set([
  "tests/seat-page.js",
  "tests/seat-page-guard.mjs",
  "tests/engine.js",
  "tests/engine-selftest.js",
]);

function stripComments(text) {
  return String(text || "")
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
}

function isPageBootingLeg(text) {
  const code = stripComments(text);
  if (/\.goto\s*\(/.test(code)) return true;
  if (/puppeteer\.launch\s*\(/.test(code) && (/runFolder\s*\(/.test(code) || /etiuda\.html/.test(code))) return true;
  return false;
}

function callsSeatPage(text) {
  const code = stripComments(text);
  return /seat-page\.js/.test(code) && /\b(?:seatPage|seatedView)\s*\(/.test(code);
}

export function pageBootFaults({ files, read, doorLegs }) {
  const faults = [];
  const fileSet = new Set(files);
  const booting = [];

  for (const rel of files) {
    if (IGNORED.has(rel)) continue;
    const text = read(rel);
    if (isPageBootingLeg(text)) booting.push(rel);
  }
  const bootingSet = new Set(booting);

  for (const [rel, why] of Object.entries(doorLegs || {})) {
    if (typeof why !== "string" || !why.trim()) {
      faults.push({ file: rel, why: "listed on DOOR_LEGS with no reason" });
    } else if (!fileSet.has(rel)) {
      faults.push({ file: rel, why: "listed on DOOR_LEGS but missing from tests/" });
    } else if (!bootingSet.has(rel)) {
      faults.push({ file: rel, why: "listed on DOOR_LEGS but does not load the page in a browser" });
    }
  }

  for (const rel of booting) {
    const onDoor = Object.prototype.hasOwnProperty.call(doorLegs || {}, rel);
    const usesHelper = callsSeatPage(read(rel));
    if (onDoor && usesHelper) {
      faults.push({ file: rel, why: "both calls seat-page.js and sits on DOOR_LEGS" });
    } else if (!onDoor && !usesHelper) {
      faults.push({ file: rel, why: "loads etiuda.html in a browser without seatPage() or a DOOR_LEGS entry" });
    }
  }

  faults.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return { booting, faults };
}

function main() {
  const PRIO = E.belowNormal();
  console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

  let asserted = 0, failed = 0, skipped = 0;
  const check = (ok, what, detail) => {
    asserted++;
    console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
    if (!ok) failed++;
  };
  const skip = (what) => {
    skipped++;
    console.log("  NOT RUN " + what);
  };

  const view = seatedView({ fresh: true });
  check(
    view.works === true && view.seat === "held" && /^[0-9A-Z]{16}$/.test(view.code)
      && view.until > view.now && !!view.holding && view.holding.on === "own",
    "spg1 seatedView() mints and verifies a real seat-lab certificate in signinViewOf shape"
  );

  if (PLANTS_OFF) {
    skip("spg1p plant: tampered root or lapsed certificate yields works=false (ETIUDA_PLANTS=off)");
  } else {
    const badRoot = seatedView({ tamperRoot: "0".repeat(64) });
    const lapsed = seatedView({ tamperUntil: Date.now() - 1000 });
    check(badRoot.works === false && lapsed.works === false,
      "spg1p plant: tampered root or lapsed certificate yields works=false",
      { badRoot: badRoot.works, lapsed: lapsed.works });
  }

  const files = fs.readdirSync(TESTS).filter(f => /\.(mjs|js|cjs)$/.test(f)).sort().map(f => "tests/" + f);
  const { booting, faults } = pageBootFaults({
    files,
    read: rel => fs.readFileSync(path.join(ROOT, rel), "utf8"),
    doorLegs: DOOR_LEGS,
  });

  check(booting.length >= 20, "spg2 page-booting browser leg scan found " + booting.length + " legs");

  if (faults.length === 0) {
    check(true, "spg3 all " + booting.length + " page-booting browser legs call seat-page.js or sit on DOOR_LEGS ("
      + Object.keys(DOOR_LEGS).length + " door leg(s))");
  } else {
    for (const f of faults) {
      check(false, "spg3 " + f.file + ": " + f.why);
    }
  }

  if (PLANTS_OFF) {
    skip("spg4p plant: unseated page.goto leg and unreasoned DOOR_LEGS entry are caught by name (ETIUDA_PLANTS=off)");
  } else {
    const samples = {
      "tests/unseated.mjs": "await page.goto(url);\n",
      "tests/seated.mjs": "const { seatPage } = require('./seat-page.js');\nawait seatPage(page);\nawait page.goto(url);\n",
      "tests/door.mjs": "await page.goto(url);\n",
    };
    const planted = pageBootFaults({
      files: Object.keys(samples),
      read: f => samples[f],
      doorLegs: { "tests/door.mjs": "", "tests/missing.mjs": "gone" },
    });
    const caughtUnseated = planted.faults.some(f => f.file === "tests/unseated.mjs");
    const caughtNoReason = planted.faults.some(f => f.file === "tests/door.mjs");
    const caughtMissing = planted.faults.some(f => f.file === "tests/missing.mjs");
    const sparedSeated = !planted.faults.some(f => f.file === "tests/seated.mjs");
    check(caughtUnseated && caughtNoReason && caughtMissing && sparedSeated,
      "spg4p plant: catches unseated page.goto, empty DOOR_LEGS reason and missing file while sparing seated leg",
      planted.faults);
  }

  console.log("#counts checks=" + asserted + " skipped=" + skipped + " failures=" + failed);
  console.log("seat-page-guard " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted + " check(s)");
  process.exit(failed ? 1 : 0);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
