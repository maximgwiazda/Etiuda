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

  /* 11 to 17. THE TIE BETWEEN src/ AND THE ARTEFACT, and whether it still bites now that there
     is no monolith to splice. Board item: the harness edits of 2026-09-14.

     sourceFiles() and spliceTie() ask whether src/monolith.js exists rather than assuming it,
     because tests/text-scan-selftest.js still builds a fixture tree with one. The PRESENT branch
     is covered there - a throw planted in it takes that file from 25/25 to 10/25, measured - and
     the ABSENT branch, which is every run against this tree, was covered by nothing: the same
     throw left this file at 15/15 and text-scan-selftest at 25/25, both exit 0.

     The absent branch is also where the splice check goes quiet. With no monolith the comparison
     reads art.slice(n, n) !== "", which is false whatever the artefact holds, so the cases below
     prove the OTHER three rules still reject: the head, the tail, and the module set. The toy
     artefact is assembled by hand rather than built - spliceTie compares text by position and
     reads esbuild banner lines, and neither needs a real bundle. */
  const toy = (label, opts) => {
    const dir = path.join(tmp, label);
    for (const d of ["src", path.join("src", "modules"), "engine", "tests"])
      fs.mkdirSync(path.join(dir, d), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "template.html"),
      "<!doctype html><head>HEAD</head><body><script>" + String.fromCharCode(10) + E.APP_ANCHOR + "</script></body>");
    fs.writeFileSync(path.join(dir, "src", "main.js"), "// entry" + String.fromCharCode(10));
    for (const m of opts.modules) fs.writeFileSync(path.join(dir, "src", "modules", m), "// " + m + String.fromCharCode(10));
    if (opts.monolith != null) fs.writeFileSync(path.join(dir, "src", "monolith.js"), opts.monolith);
    fs.copyFileSync(path.join(__dirname, "engine.js"), path.join(dir, "tests", "engine.js"));
    /* The artefact: head, then a stand-in bundle carrying one esbuild banner per file in the
       order sourceFiles() gives, then the monolith if there is one, then the tail. */
    const tpl = fs.readFileSync(path.join(dir, "src", "template.html"), "utf8");
    const at = tpl.indexOf(E.APP_ANCHOR);
    const head = tpl.slice(0, at), tail = tpl.slice(at + E.APP_ANCHOR.length);
    const banners = opts.bundleFiles.map(f => "  // " + f + String.fromCharCode(10) + "  void 0;" + String.fromCharCode(10)).join("");
    fs.writeFileSync(path.join(dir, "engine", "etiuda.html"),
      head + banners + (opts.monolith != null ? opts.monolith : "") + tail + (opts.extra || ""));
    return dir;
  };
  /* One child per reading. engine.js resolves its root from its own folder, so the copy in the
     toy tree operates on the toy tree, and a fresh process means no require cache carries over. */
  const ask = dir => {
    const p = JSON.stringify(path.join(dir, "tests", "engine.js").split(path.sep).join("/"));
    const r = run("const E=require(" + p + ");" +
      "console.log(JSON.stringify({files:E.sourceFiles(),tie:E.spliceTie()}));");
    try { return JSON.parse(r.out.trim().split(String.fromCharCode(10)).pop()); }
    catch (e) { return { files: [], tie: { problems: ["CHILD DID NOT REPORT: " + r.out.trim().slice(0, 200)], modules: [] } }; }
  };

  const MODS = ["a.js", "b.js"];
  const noMono = ask(toy("nomono", { modules: MODS, bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/main.js"] }));
  ok(noMono.files.join(",") === "src/modules/a.js,src/modules/b.js,src/main.js",
     "with no src/monolith.js the source list is the modules and the entry, and names no monolith ("
     + noMono.files.length + " files)");
  ok(noMono.tie.problems.length === 0 && noMono.tie.modules.length === 3,
     "and the tie holds over an artefact assembled from them (" + noMono.tie.modules.length
     + " banners, " + noMono.tie.problems.length + " problems)");

  const badTail = ask(toy("nomono-tail", { modules: MODS, extra: "x",
    bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/main.js"] }));
  ok(badTail.tie.problems.some(x => /does not close with src\/template.html/.test(x)),
     "one byte past the end and it says the artefact does not close with the template ("
     + badTail.tie.problems.length + " problems)");

  const missing = ask(toy("nomono-missing", { modules: MODS,
    bundleFiles: ["src/modules/a.js", "src/main.js"] }));
  ok(missing.tie.problems.some(x => /^src\/modules\/b.js is in src\/ and not in the bundle/.test(x)),
     "a module in src/ that no banner names is rejected by name ("
     + JSON.stringify(missing.tie.problems.slice(0, 1)) + ")");

  const extra = ask(toy("nomono-extra", { modules: MODS,
    bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/modules/ghost.js", "src/main.js"] }));
  ok(extra.tie.problems.some(x => /^src\/modules\/ghost.js is in the bundle and not in src\//.test(x)),
     "and a banner naming a file src/ does not hold is rejected the other way");

  /* The present branch of the same two functions, which text-scan-selftest exercises through
     sourceFiles() and nothing exercises through spliceTie(). */
  const MONO = "/* the monolith */" + String.fromCharCode(10) + "var stillHere = 1;" + String.fromCharCode(10);
  const withMono = ask(toy("mono", { modules: MODS, monolith: MONO,
    bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/main.js"] }));
  ok(withMono.files[withMono.files.length - 1] === "src/monolith.js" && withMono.files.length === 4,
     "with a src/monolith.js it is last in the source list, after the entry (" + withMono.files.length + " files)");
  ok(withMono.tie.problems.length === 0 && withMono.tie.modules.length === 3,
     "and the tie holds when it is spliced verbatim, without counting it as a module");

  const cutMono = ask(toy("mono-cut", { modules: MODS, monolith: MONO,
    bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/main.js"] }));
  {
    const p = path.join(tmp, "mono-cut", "engine", "etiuda.html");
    const art = fs.readFileSync(p, "utf8");
    fs.writeFileSync(p, art.replace("var stillHere = 1;", "var stillHere = 2;"));
  }
  const cut = ask(path.join(tmp, "mono-cut"));
  ok(cut.tie.problems.some(x => /is not spliced verbatim/.test(x)),
     "and one byte of the monolith changed is rejected - the rule that cannot fire at all "
     + "without one, which is why it is proved here rather than assumed (" + cutMono.tie.problems.length
     + " before, " + cut.tie.problems.length + " after)");

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(insideRepo, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed" + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
