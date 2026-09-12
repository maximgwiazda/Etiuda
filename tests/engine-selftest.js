/* Proof that the refusals in engine.js fire. A gate that has never rejected anything has not
   been tested, it has been written, and the failure this folder exists to prevent is a harness
   that reports green without looking. Each case drives the refusal it names in a child process
   and reads the exit code and the wording back.

     node tests/engine-selftest.js

   Exit code is the number of failed cases. Nothing here launches a browser. */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const E = require("./engine.js");

let fails = 0, n = 0;
const ok = (good, what) => { n++; console.log((good ? "  ok   " : "  FAIL ") + what); if (!good) fails++; };

/* A child rather than a try/catch, because the refusal is a process exit and the exit code is
   half of what is being asserted. */
function run(code, env) {
  const res = { out: "", code: 0 };
  try {
    res.out = execFileSync(process.execPath, ["-e", code], {
      cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { ETIUDA_FIXTURES: "" }, env)
    });
  } catch (e) { res.code = e.status === undefined ? -1 : e.status; res.out = (e.stdout || "") + (e.stderr || ""); }
  return res;
}
const ASK = 'require("./engine.js").fixtures("catalog","sample");console.log("RESOLVED");';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-selftest-"));
const good = path.join(tmp, "good"), bare = path.join(tmp, "bare"), afile = path.join(tmp, "afile");
const insideRepo = path.join(E.ROOT, "tests", "selftest-tmp-fixtures");
try {
  fs.mkdirSync(good); fs.mkdirSync(bare); fs.mkdirSync(insideRepo);
  fs.writeFileSync(afile, "not a folder");
  for (const k of ["catalog", "sample", "searchEval"])
    fs.writeFileSync(path.join(good, E.FIXTURE_FILE[k]), "/* invented, empty, and never read by this file */\n");

  /* 1 to 5: every way the fixtures folder can be wrong. */
  let r = run(ASK, {});
  ok(r.code === E.NO_VERDICT && /ETIUDA_FIXTURES is not set/.test(r.out), "unset refuses, exit " + r.code);

  r = run(ASK, { ETIUDA_FIXTURES: path.join(tmp, "nowhere") });
  ok(r.code === E.NO_VERDICT && /is not a folder/.test(r.out), "a path that does not exist refuses, exit " + r.code);

  r = run(ASK, { ETIUDA_FIXTURES: afile });
  ok(r.code === E.NO_VERDICT && /is not a folder/.test(r.out), "a file rather than a folder refuses, exit " + r.code);

  r = run(ASK, { ETIUDA_FIXTURES: insideRepo });
  ok(r.code === E.NO_VERDICT && /inside this repository/.test(r.out), "a folder inside the tree refuses, exit " + r.code);

  r = run(ASK, { ETIUDA_FIXTURES: bare });
  ok(r.code === E.NO_VERDICT && /has no etiuda-catalog\.js/.test(r.out), "an empty folder refuses by name, exit " + r.code);

  /* 6: and the sound case is run too, because a gate that refuses everything is not a gate. */
  r = run(ASK, { ETIUDA_FIXTURES: good });
  ok(r.code === 0 && /RESOLVED/.test(r.out), "a complete folder outside the tree resolves, exit " + r.code);

  /* 7: the refusal is in the shape a smoke log is read in, both lines. */
  r = run(ASK, {});
  ok(/^ {2}FAIL /m.test(r.out) && /^ {2}SUITE DID NOT COMPLETE/m.test(r.out),
     "a refusal prints a FAIL line and says the suite did not complete");

  /* 8: the run folder, which is what keeps a catalog out of the tree. */
  r = run('const f=require("./engine.js").runFolder("catalog","sample");'
        + 'console.log(JSON.stringify({dir:f.dir,page:f.page,same:f.engineSha===f.copySha,'
        + 'has:require("fs").readdirSync(f.dir).sort()}));f.drop();'
        + 'console.log("GONE " + !require("fs").existsSync(f.dir));', { ETIUDA_FIXTURES: good });
  let j = null; try { j = JSON.parse((r.out.match(/^\{.*\}$/m) || [])[0]); } catch (e) { /* reported by the check */ }
  ok(!!j && j.same, "the run folder's engine copy has the same sha256 as engine/etiuda.html");
  ok(!!j && j.has.join(",") === "etiuda-catalog.js,etiuda.html,sample-catalog.js",
     "the run folder holds the engine and only the fixtures asked for (" + (j ? j.has.join(", ") : r.out.trim()) + ")");
  ok(!!j && !E.inside(E.ROOT, path.dirname(j.dir)), "the run folder is outside the repository");
  ok(/GONE true/.test(r.out), "drop() removes it");

  /* 9: the browser, whose path is a property of the machine rather than of the repository. */
  r = run('require("./engine.js").browserPath("chrome");console.log("FOUND");',
          { ETIUDA_CHROME: path.join(tmp, "no-such-browser.exe") });
  ok(r.code === E.NO_VERDICT && /is not there/.test(r.out), "a browser named in the environment and absent refuses, exit " + r.code);

  /* 10: the finding that started this folder. The engine is not the redirect stub, and the
     stub is still at the root where a link in the wild points at it. */
  const engine = fs.statSync(E.ENGINE_PATH).size, stub = path.join(E.ROOT, "Etiuda.html");
  ok(engine > 500000, "engine/etiuda.html is the engine, " + engine + " bytes");
  ok(fs.existsSync(stub) && fs.statSync(stub).size < 2000,
     "the root Etiuda.html is still the redirect stub, " + fs.statSync(stub).size + " bytes, and is not what runs");
  ok(/PB_VERSION|E_VERSION/.test(E.engineSource()), "the engine source carries its version constant");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(insideRepo, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed" + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
