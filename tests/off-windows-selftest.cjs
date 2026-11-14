/* THE STAND-ASIDE HELPER CANNOT STAND A LEG ASIDE ON WINDOWS (tests/off-windows.cjs). Node only.
 *
 *     node tests/off-windows-selftest.cjs
 *
 * o1 every leg file that requires the helper is named, and each calls it.
 * o2 the helper decides by the platform alone: its decision line is process.platform !== "win32", and it reads no variable
 *    and no argument.
 * o3 here, unplanted, it answers for this platform: null on Windows, the leg's line elsewhere.
 * o4 on Windows, a leg that has faked process.platform for a stretch is still refused a stand-aside.
 * o5 plant:off-windows lifted to `aside = true` in a scratch copy throws on Windows (off Windows, with the platform faked).
 * o6 a using leg, tests/drive-join.mjs, run with that planted copy in the helper's place goes red on Windows, naming the
 *    helper, and stands nothing aside.
 * o5 and o6 are plants and honour ETIUDA_PLANTS=off.
 */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { offWindows } = require("./off-windows.cjs");

const TESTS = __dirname;
const HELPER = path.join(TESTS, "off-windows.cjs");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const ON_WINDOWS = process.platform === "win32";
const EXPECTED = 6;
let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-off-windows-"));
const SRC = fs.readFileSync(HELPER, "utf8");
const DECISION = /^[^\n]*\/\*\s*plant:off-windows\s*\*\/[^\n]*$/m;

/* o1 */
const users = fs.readdirSync(TESTS).filter(f => /\.(c|m)?js$/.test(f) && f !== "off-windows.cjs" && f !== "off-windows-selftest.cjs")
  .filter(f => fs.readFileSync(path.join(TESTS, f), "utf8").indexOf("off-windows.cjs") >= 0).sort();
const silent = users.filter(f => !/\boffWindows\(/.test(fs.readFileSync(path.join(TESTS, f), "utf8")));
check(users.length > 0 && silent.length === 0 && users.indexOf("drive-join.mjs") >= 0,
  "o1 " + users.length + " leg file(s) require the helper, by a scan of tests/ for its file name, and each calls offWindows(): "
  + users.join(", ") + (silent.length ? "; never calling it: " + silent.join(", ") : ""));

/* o2 */
const line = (DECISION.exec(SRC) || [""])[0];
const reads = ["process.env", "process.argv", "process.execArgv"].filter(k => SRC.indexOf(k) >= 0);
check(/const aside = process\.platform !== "win32";/.test(line) && reads.length === 0 && (SRC.match(new RegExp(DECISION.source, "gm")) || []).length === 1,
  "o2 the decision is the platform alone: " + JSON.stringify(line.trim()) + ", reads " + (reads.join(", ") || "no variable and no argument"));

/* o3 */
{
  let got, threw = "";
  try { got = offWindows("o3", "this is not Windows"); } catch (e) { threw = String(e && e.message); }
  const right = ON_WINDOWS ? got === null : got === "o3 stands aside off Windows: this is not Windows";
  check(!threw && right, "o3 unplanted, on " + process.platform + ", it answers " + JSON.stringify(got) + (threw ? ", threw " + threw : ""));
}

/* o4 */
{
  const aside = offWindows("o4", "the kernel here is not Windows, so no faked platform can hide one");
  if (aside) skip(aside);
  else {
    const was = Object.getOwnPropertyDescriptor(process, "platform");
    let threw = "";
    try {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      offWindows("o4", "a faked platform");
    } catch (e) { threw = String(e && e.message); }
    finally { Object.defineProperty(process, "platform", was); }
    check(/^off-windows: o4 /.test(threw), "o4 with process.platform faked as linux on Windows, a stand-aside is refused: " + (threw || "it stood aside"));
  }
}

/* The helper with plant:off-windows lifted, in a scratch folder of its own. */
const PLANTED = path.join(LAB, "off-windows.cjs");
const plantedSrc = SRC.replace(DECISION, "  const aside = true; /* plant:off-windows lifted */");
fs.writeFileSync(PLANTED, plantedSrc);

/* o5 */
if (PLANTS_OFF) skip("o5 lifting plant:off-windows makes the helper throw on Windows (ETIUDA_PLANTS=off)");
else {
  const was = Object.getOwnPropertyDescriptor(process, "platform");
  let threw = "";
  try {
    if (!ON_WINDOWS) Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    require(PLANTED).offWindows("o5", "a lifted plant");
  } catch (e) { threw = String(e && e.message); }
  finally { Object.defineProperty(process, "platform", was); }
  check(plantedSrc !== SRC && /^off-windows: o5 /.test(threw),
    "o5 lifting plant:off-windows makes the helper throw on Windows" + (ON_WINDOWS ? "" : " (the platform faked as win32)") + ": planted "
    + (plantedSrc !== SRC) + ", " + (threw || "it stood aside"));
}

/* o6 */
if (PLANTS_OFF) skip("o6 a leg using the helper goes red on Windows with plant:off-windows lifted (ETIUDA_PLANTS=off)");
else {
  const aside = offWindows("o6", "the lifted plant is the helper's own answer here, so the leg it runs would stand aside as it should");
  if (aside) skip(aside);
  else {
    /* The leg's own require of the helper is answered from the planted copy, by the module cache, before the leg starts. */
    const preload = path.join(LAB, "planted-first.cjs");
    fs.writeFileSync(preload, "require(" + JSON.stringify(PLANTED) + ");\nrequire.cache[require.resolve(" + JSON.stringify(HELPER)
      + ")] = require.cache[require.resolve(" + JSON.stringify(PLANTED) + ")];\n");
    const r = spawnSync(process.execPath, ["--require", preload, path.join(TESTS, "drive-join.mjs")],
      { cwd: path.dirname(TESTS), encoding: "utf8", windowsHide: true, timeout: 300000 });
    const out = String(r.stdout || "") + String(r.stderr || "");
    check(r.status !== 0 && /off-windows: 955c was asked to stand aside on Windows/.test(out) && !/stands aside off Windows/.test(out),
      "o6 tests/drive-join.mjs with plant:off-windows lifted goes red, not aside: exit " + r.status
      + ", names the helper " + /off-windows: 955c/.test(out) + ", stood aside " + /stands aside off Windows/.test(out));
  }
}

fs.rmSync(LAB, { recursive: true, force: true });
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped !== EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " leg(s)");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
