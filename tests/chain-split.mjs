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
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");

/* Not gates of any chain. A name that a chain reaches, or a name with no file, is stale. */
export const HELPERS = {
  "tests/badge-room.js": "the badge's room, a sweep tests/smoke.js requires and runs",
  "tests/css-dead.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/deadcode.js": "a report: a hit is a candidate to read, not a verdict",
  "tests/engine.js": "the library every gate requires, not a gate",
  "tests/ghosts.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/install-plan.js": "the library tests/update-install.js judges with",
  "tests/launch-wait.js": "a helper the window legs require, not a gate",
  "tests/linux-desk.js": "a machine-window gate on Linux, not in either chain",
  "tests/linux-keyring.js": "a machine-window gate on Linux, not in either chain",
  "tests/motion.js": "legs tests/smoke.js requires and runs",
  "tests/pick-desk.js": "a machine-window gate, not in either chain",
  "tests/plants-tree.mjs": "the scratch copy the planting gates re-run themselves in, not a gate",
  "tests/reg-stand.cjs": "a stand-in module tests/relay-channel.mjs requires, not a gate",
  "tests/storage-keys.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  "tests/tour-walk.js": "the tour's walk tests/smoke.js requires and runs",
  "tests/update-install.js": "a machine-window gate, not in either chain",
};

/* Nightly-only legs (rule 7): load-sensitive legs and self-tests that run only in nightly */
export const NIGHTLY_ONLY = [
  "tests/desk-growth.mjs",
  "tests/engine-selftest.js",
  "tests/leg-ids.js",
  "tests/result-line.mjs",
  "tests/sbom.mjs",
  "tests/text-scan-selftest.js",
];

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
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

  controls();
  process.stdout.write("#counts checks=" + asserted + " failures=" + failed + "\n");
  process.stdout.write("chain-split " + (failed ? "FAILED " + failed + " of " : "passed ") + asserted + " check(s)\n");
  process.exit(failed ? 1 : 0);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invoked) main();
