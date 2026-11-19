/* THE NODE CHAIN, THE WINDOW/STANDALONE GATES AND THE NIGHTLY LEGS.
 *
 *     node tests/chain-split.mjs
 *
 * Every script directly under tests/ is on the node merge chain, on a named gate script,
 * in the nightly list, or named as a helper/non-gate.
 *
 * A leg in no list is unregistered and fails this check (the chain-split rule, rule 7).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");

/* Not gates of any chain. A name that a chain reaches, or a name with no file, is stale. */
export const HELPERS = {
  "tests/badge-room.js": "the badge's room, a sweep tests/smoke.js requires and runs",
  "tests/caret-selection-desk.js": "a machine-window gate (the helper on a real control), not in either chain",
  "tests/css-dead.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/deadcode.js": "a report: a hit is a candidate to read, not a verdict",
  "tests/engine.js": "the library every gate requires, not a gate",
  "tests/ghosts.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/install-plan.js": "the library tests/update-install.js judges with",
  "tests/install-guard.cjs": "the read-only guard the installer legs require, not a gate (its leg is tests/install-guard-selftest.js)",
  "tests/launch-wait.js": "a helper the window legs require, not a gate",
  "tests/quiet-lane.mjs": "the timing legs' busy-machine refusal, not a gate (its leg is tests/quiet-lane-selftest.mjs)",
  "tests/off-windows.cjs": "the stand-aside helper a Windows-only assertion asks, not a gate (its leg is tests/off-windows-selftest.cjs)",
  "tests/linux-desk.js": "a machine-window gate on Linux, not in either chain",
  "tests/linux-keyring.js": "a machine-window gate on Linux, not in either chain",
  "tests/motion.js": "legs tests/smoke.js requires and runs",
  "tests/pick-desk.js": "a machine-window gate, not in either chain",
  "tests/plants-tree.mjs": "the scratch copy the planting gates re-run themselves in, not a gate",
  "tests/reg-stand.cjs": "a stand-in module tests/relay-channel.mjs requires, not a gate",
  "tests/reg-stand-preload.cjs": "reg-stand preloaded into a harness-launched shell by tests/engine.js shellLaunch, not a gate",
  "tests/seat-lab.mjs": "the shared sign-in lab helper required by relay-channel, pick and desk-ipc, not a gate",
  "tests/storage-keys.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/syncer-invariants.mjs": "the oracle of the folder syncer's invariants piece: red on main on purpose until that piece lands, then it joins the node chain and leaves this list",
  "tests/tour-walk.js": "the tour's walk tests/smoke.js requires and runs",
  "tests/update-install.js": "a machine-window gate, not in either chain",
  "tests/silent-update-desk.js": "a machine-window gate, not in either chain",
  "tests/eject-desk.js": "a machine-window gate, not in either chain",
  "tests/no-crash-dialog.js": "the crash guard loaded into Electron main process, not a gate",
  "tests/no-crash-dialog-desk.js": "a machine-window gate, not in either chain",
  "tests/lab-owner.mjs": "the lab owner file, exit cleanup and stale sweep tests require, not a gate",
};

/* Nightly-only legs (rule 7): load-sensitive legs and self-tests that run only in nightly */
export const NIGHTLY_ONLY = [
  "tests/desk-growth.mjs",
  "tests/engine-selftest.js",
  "tests/result-line.mjs",
  "tests/machine-lock.mjs",
  "tests/sbom.mjs",
  "tests/text-scan-selftest.js",
  "tests/theme-presses.mjs",
  "tests/theme-roll.mjs",
];

/* Scripts that seed eTourDone_v3 as "1" without naming eFirstSigninSeen, each with its reason. */
export const FIRST_SIGNIN_SEED_EXCEPTIONS = {
  "tests/desk-focus-ring.mjs": "its one seeded boot is the first-opening sign-in screen's own, which must find the key unset",
  "tests/test.js": "synthetic localStorage fixture for clearLocalMemory(), not a booted desk",
};

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

function stripComments(text) {
  return String(text || "")
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
}

/** Whether `text` seeds `eTourDone_v3` as done ("1") rather than reading or deleting it. */
export function seedsTourDone(text) {
  const code = stripComments(text);
  return /(?:setItem|lsSet)\(\s*["']eTourDone_v3["']\s*,\s*["']1["']\s*\)/.test(code)
    || /\[\s*["']eTourDone_v3["']\s*,\s*["']1["']\s*\]/.test(code)
    || /\[\s*(?:["'][^"']+["']\s*,\s*)*["']eTourDone_v3["']/.test(code)
    || /(?:["']eTourDone_v3["']|\beTourDone_v3)\s*[:=]\s*["']1["']/.test(code);
}

/** Files under `files` that seed `eTourDone_v3` as done without naming `eFirstSigninSeen`, outside `exceptions`. */
export function firstSigninSeedFaults({ files, read, exceptions = FIRST_SIGNIN_SEED_EXCEPTIONS }) {
  const faults = [];
  const fileSet = new Set(files);
  for (const rel of Object.keys(exceptions)) {
    if (!exceptions[rel]) faults.push({ file: rel, why: "exception has no reason" });
    else if (!fileSet.has(rel)) faults.push({ file: rel, why: "listed as an exception but not a tests script" });
  }
  for (const rel of files) {
    if (Object.prototype.hasOwnProperty.call(exceptions, rel)) continue;
    const text = read(rel);
    if (seedsTourDone(text) && !/\beFirstSigninSeen\b/.test(text)) {
      faults.push({ file: rel, why: "seeds eTourDone_v3 as done without naming eFirstSigninSeen" });
    }
  }
  faults.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return faults;
}

const ALONE_MARKER = "/* run: alone (timing) */";
const ALONE_SHAPED = /^\/\*[ \t]*run:[ \t]*alone\b.*\*\/$/;
const ALONE_SLASH = /^\/\/[ \t]*run:[ \t]*alone\b/;

export function aloneMarkerFaults(text) {
  const faults = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === ALONE_MARKER) {
      if (i >= 15) faults.push({ line: i + 1, why: "sits past the first 15 lines" });
      continue;
    }
    if (ALONE_SHAPED.test(t) || ALONE_SLASH.test(t)) faults.push({ line: i + 1, why: "is misspelt" });
  }
  return faults;
}

export function chainFiles(script) {
  const out = [];
  for (const part of String(script || "").split("&&")) {
    const m = /^\s*node\s+(\S+)/.exec(part.trim());
    if (!m) continue;
    let rel = m[1].replace(/\\/g, "/");
    if (rel.startsWith("./")) rel = rel.slice(2);
    out.push(rel);
  }
  return out;
}

function scriptsUnder(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const rel = prefix + name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...scriptsUnder(abs, rel + "/"));
      continue;
    }
    if (/\.(mjs|js|cjs)$/.test(name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

export function judgeSets({ files, nodeList, otherList = [], nightlyList = [], helpers }) {
  const failures = [];
  const inNode = new Set(nodeList);
  const inOther = new Set(otherList);
  const inNight = new Set(nightlyList);
  const fileSet = new Set(files);
  const push = (file, why) => failures.push({ file, why });

  for (const rel of files) {
    if (Object.prototype.hasOwnProperty.call(helpers, rel)) continue;
    const node = inNode.has(rel);
    const other = inOther.has(rel);
    const night = inNight.has(rel);
    if (node && night) push(rel, "in both the node chain and the nightly list");
    if (other && night) push(rel, "in both other gates and the nightly list");
    if (!node && !other && !night) push(rel, "in neither list");
  }

  for (const rel of inNight) {
    if (!fileSet.has(rel)) push(rel, "listed in nightly but not a tests script");
  }

  for (const rel of Object.keys(helpers)) {
    if (!helpers[rel]) push(rel, "named as not a gate with no reason");
    if (!fileSet.has(rel) || inNode.has(rel) || inNight.has(rel))
      push(rel, "named as not a gate but reached or gone");
  }

  for (const rel of new Set([...inNode, ...inOther, ...inNight])) {
    if (!fileSet.has(rel)) push(rel, "listed but not a tests script");
  }

  failures.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : (a.why < b.why ? -1 : a.why > b.why ? 1 : 0));
  return failures;
}

function one(failures, file, why) {
  return failures.filter(f => f.file === file && f.why === why).length === 1;
}

function controls() {
  const files = ["tests/a.mjs", "tests/w.mjs", "tests/n.mjs", "tests/h.mjs"];
  const helpers = { "tests/h.mjs": "a helper, not a gate" };
  const clean = judgeSets({ files, nodeList: ["tests/a.mjs", "tests/n.mjs"], otherList: ["tests/w.mjs"], helpers });
  check(clean.length === 0, "cs0 a node chain, other gates and a named helper refuse nothing (" + clean.length + ")");

  const neither = judgeSets({
    files: files.concat(["tests/z.mjs"]),
    nodeList: ["tests/a.mjs", "tests/n.mjs"], otherList: ["tests/w.mjs"], helpers,
  });
  check(one(neither, "tests/z.mjs", "in neither list"),
    "cs1 a new tests/ script in neither list is refused by name: "
    + neither.filter(f => f.file === "tests/z.mjs").map(f => f.why).join("; "));

  const dropped = judgeSets({
    files, nodeList: ["tests/a.mjs"], otherList: [], helpers,
  });
  check(one(dropped, "tests/n.mjs", "in neither list"),
    "cs4 a tests script removed from chains is refused by name");

  check(aloneMarkerFaults(ALONE_MARKER + "\n").length === 0,
    "cs6 the exact alone marker on line 1 is kept");

  const miss = aloneMarkerFaults("/* run: alone */\n");
  check(miss.length === 1 && miss[0].line === 1 && miss[0].why === "is misspelt",
    "cs7 a misspelt alone marker is refused: " + miss.map(f => "line " + f.line + " " + f.why).join("; "));

  const late = Array.from({ length: 15 }, () => "// pad").join("\n") + "\n" + ALONE_MARKER + "\n";
  const lateFaults = aloneMarkerFaults(late);
  check(lateFaults.length === 1 && lateFaults[0].line === 16 && lateFaults[0].why === "sits past the first 15 lines",
    "cs8 an alone marker past the first 15 lines is refused: "
    + lateFaults.map(f => "line " + f.line + " " + f.why).join("; "));

  const nightClean = judgeSets({
    files: files.concat(["tests/k.mjs"]),
    nodeList: ["tests/a.mjs", "tests/n.mjs"],
    otherList: ["tests/w.mjs"],
    nightlyList: ["tests/k.mjs"],
    helpers,
  });
  check(nightClean.length === 0, "cs10 a nightly-only leg in nightlyList and absent from nodeList is valid (" + nightClean.length + ")");

  const nightBoth = judgeSets({
    files: files.concat(["tests/k.mjs"]),
    nodeList: ["tests/a.mjs", "tests/n.mjs", "tests/k.mjs"],
    otherList: ["tests/w.mjs"],
    nightlyList: ["tests/k.mjs"],
    helpers,
  });
  check(one(nightBoth, "tests/k.mjs", "in both the node chain and the nightly list"),
    "cs11 a leg in both the node chain and the nightly list is refused by name: "
    + nightBoth.filter(f => f.file === "tests/k.mjs").map(f => f.why).join("; "));

  const TD = "eTourDone" + "_v3", FS = "eFirstSignin" + "Seen";
  const samples = {
    "tests/read.mjs": `localStorage.getItem("${TD}"); ST.lsDel("${TD}");`,
    "tests/seed-ok.mjs": `localStorage.setItem("${TD}", "1"); localStorage.setItem("${FS}", "1");`,
    "tests/seed-obj-miss.mjs": `Object.assign(d.keys, { ${TD}: "1" });`,
    "tests/seed-list-miss.mjs": `for (const k of ["${TD}", "eNameAsked"]) localStorage.setItem(k, "1");`,
  };
  const sampleFaults = firstSigninSeedFaults({
    files: Object.keys(samples),
    read: f => samples[f],
    exceptions: {},
  });
  check(sampleFaults.length === 2
    && sampleFaults.some(f => f.file === "tests/seed-obj-miss.mjs")
    && sampleFaults.some(f => f.file === "tests/seed-list-miss.mjs")
    && !sampleFaults.some(f => f.file === "tests/read.mjs" || f.file === "tests/seed-ok.mjs"),
    "cs13 first-signin seed scan ignores reads/deletes and catches object/list seeds missing " + FS + ": "
    + sampleFaults.map(f => f.file).join(", "));
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const nodeList = chainFiles(pkg.scripts && pkg.scripts.test).filter(f => f.startsWith("tests/"));

  const otherList = [];
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (name === "test" || name === "nightly" || name === "gates") continue;
    for (const f of chainFiles(cmd)) {
      if (f.startsWith("tests/") && !nodeList.includes(f) && !otherList.includes(f)) {
        otherList.push(f);
      }
    }
  }

  const nightlyList = NIGHTLY_ONLY;
  const files = scriptsUnder(TESTS, "tests/");
  const failures = judgeSets({ files, nodeList, otherList, nightlyList, helpers: HELPERS });

  if (!failures.length) {
    const nodeN = nodeList.length, otherN = otherList.length, nightN = nightlyList.length, helpN = Object.keys(HELPERS).length;
    check(true, "chain-split every tests script is in one chain or named: " + nodeN + " node, "
      + otherN + " other, " + nightN + " nightly, " + helpN + " not gates, " + files.length + " scripts");
  } else {
    for (const f of failures) check(false, "chain-split refuses " + f.file + ": " + f.why);
  }

  const markerBad = [];
  for (const rel of files) {
    for (const f of aloneMarkerFaults(fs.readFileSync(path.join(ROOT, rel), "utf8")))
      markerBad.push({ file: rel, line: f.line, why: f.why });
  }
  if (!markerBad.length) {
    check(true, "cs9 every alone marker is the exact line in the first 15 lines");
  } else {
    for (const f of markerBad)
      check(false, "chain-split refuses " + f.file + ": the alone marker at line " + f.line + " " + f.why);
  }

  const seedFaults = firstSigninSeedFaults({
    files,
    read: rel => fs.readFileSync(path.join(ROOT, rel), "utf8"),
    exceptions: FIRST_SIGNIN_SEED_EXCEPTIONS,
  });
  if (!seedFaults.length) {
    check(true, "cs12 every tests script seeding eTourDone_v3 also names eFirstSigninSeen or is a reasoned exception ("
      + Object.keys(FIRST_SIGNIN_SEED_EXCEPTIONS).length + " exception(s))");
  } else {
    for (const f of seedFaults) check(false, "chain-split refuses " + f.file + ": " + f.why);
  }

  controls();

  if (PLANTS_OFF) {
    skip("cs14 plant: a test script seeding eTourDone_v3 without eFirstSigninSeen is caught by name (ETIUDA_PLANTS=off)");
  } else {
    const lab = fs.mkdtempSync(path.join(os.tmpdir(), "chain-split-fsseed-"));
    try {
      const TD = "eTourDone" + "_v3", FS = "eFirstSignin" + "Seen";
      const missRel = "tests/planted-miss.mjs", okRel = "tests/planted-ok.mjs";
      fs.mkdirSync(path.join(lab, "tests"), { recursive: true });
      fs.writeFileSync(path.join(lab, missRel), `localStorage.setItem("${TD}", "1");\n`);
      fs.writeFileSync(path.join(lab, okRel), `localStorage.setItem("${TD}", "1");\nlocalStorage.setItem("${FS}", "1");\n`);
      const planted = firstSigninSeedFaults({
        files: [missRel, okRel],
        read: rel => fs.readFileSync(path.join(lab, rel), "utf8"),
        exceptions: {},
      });
      check(planted.length === 1 && planted[0].file === missRel,
        "cs14 plant: a test script seeding " + TD + " without " + FS + " is caught by name: "
        + (planted.map(f => f.file).join(", ") || "none"));
    } finally {
      fs.rmSync(lab, { recursive: true, force: true });
    }
  }

  process.stdout.write("#counts checks=" + asserted + " skipped=" + skipped + " failures=" + failed + "\n");
  process.stdout.write("chain-split " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted + " check(s)\n");
  process.exit(failed ? 1 : 0);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
