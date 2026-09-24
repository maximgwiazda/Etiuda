/* Proof that the refusals in engine.js fire. A gate that has never rejected anything has not
   been tested, it has been written, and the failure this folder exists to prevent is a harness
   that reports green without looking. Each case drives the refusal it names in a child process
   and reads the exit code and the wording back.

     node tests/engine-selftest.js

   Exit code is the number of failed cases. Nothing here launches a browser.

   ONE CASE IS PLATFORM-BOUND and prints SKIP rather than ok where the platform cannot produce
   the fault it names; see case 19. The tally counts skips apart from passes on purpose, so the
   line at the end of a Linux run cannot be mistaken for the line at the end of a Windows one. */
"use strict";
const { execFileSync, spawn } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const crypto = require("crypto");
const E = require("./engine.js");

let fails = 0, n = 0, skips = 0;
const ok = (good, what) => { n++; console.log((good ? "  ok   " : "  FAIL ") + what); if (!good) fails++; };
/* A skip is not a pass and is counted apart from one, because the whole point of this file is
   that a green which could never have been red is worth nothing. Only one thing may use it: a
   case whose stand-in for the fault does not exist on the platform the run is on. It prints the
   platform and the reason, so a reader of the log sees what was not asserted. */
const skip = why => { skips++; console.log("  SKIP  " + why); };

/* A child rather than a try/catch, because the refusal is a process exit and the exit code is
   half of what is being asserted.
   ETIUDA_PORT_SHIFT is cleared as ETIUDA_FIXTURES is: a case wanting a shift sets one (27f),
   and an ambient one from the shell that started this run reddened 27e2, whose control asks
   for csp's base as the table writes it (measured 2026-09-23 and again 2026-09-24 at 1740). */
function run(code, env) {
  const res = { out: "", code: 0 };
  try {
    res.out = execFileSync(process.execPath, ["-e", code], {
      cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { ETIUDA_FIXTURES: "", ETIUDA_PORT_SHIFT: "" }, env)
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

  /* 18. The banner is not the module. esbuild writes one per output PART, and a module split
     across two parts carries two, so the count the [2b/5] line used to print was bigger than
     the number of files it named: 152 over 95 here on 2026-09-14, 107 over 78 before the
     monolith went. Both numbers are reported now and this case is what keeps them apart. */
  const twice = ask(toy("nomono-twice", { modules: MODS,
    bundleFiles: ["src/modules/a.js", "src/modules/b.js", "src/modules/a.js", "src/main.js"] }));
  ok(twice.tie.problems.length === 0 && twice.tie.modules.length === 4
     && (twice.tie.moduleFiles || []).length === 3,
     "a module emitted in two parts is two banners and one file, and neither count stands in "
     + "for the other (" + twice.tie.modules.length + " banners, "
     + (twice.tie.moduleFiles || []).length + " files, " + twice.tie.problems.length + " problems)");

  /* 19. removeLab, both ways. A throwaway Chromium profile survives its browser by a moment on
     Windows, so the cleanup in tests/csp.js and tests/desk.js retries and then REPORTS, and a
     report only means something if it can say no. An open file handle is the stand-in for the
     browser's: same errno, and it needs no browser to make. Two tries at 50 ms so the refusal
     costs a tenth of a second rather than three.

     THE FIRST ARM IS A WINDOWS SEMANTIC AND SAYS SO. The stand-in for a browser that has not
     let go is another process whose working directory IS the lab; Windows refuses to remove
     such a folder and POSIX removes it without complaint, the directory living on unnamed
     until the last reference is dropped. So on Linux this arm has no stand-in at all, and
     asserting it there is a check that cannot be made to fail, which is the one thing this
     file exists to prevent. It skips, loudly, and the second arm and 19b run everywhere.
     Measured 2026-09-15 on the cloud container, Linux: this arm failed there on an untouched
     dev worktree as well as on the branch, and `npm test` stopped at it, so the twelve scripts
     behind it had never run in that environment. */
  {
    const lab = path.join(tmp, "lab");
    const holdsADirOpen = process.platform === "win32";
    fs.mkdirSync(lab);
    fs.writeFileSync(path.join(lab, "held.db"), "a profile somebody is still in");
    const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    if (holdsADirOpen) {
      /* Another process standing IN the folder, because node opens its own files with
         FILE_SHARE_DELETE and an open handle of its own therefore does not block a removal at
         all - measured, the first version of this case passed for that wrong reason. Windows does
         refuse to remove a directory that is a live process's working directory. */
      const holder = spawn(process.execPath, ["-e", "setTimeout(function(){}, 8000)"],
                           { cwd: lab, stdio: "ignore" });
      pause(700);
      const refused = E.removeLab(lab, 2, 50, 50);
      holder.kill();
      pause(700);
      ok(refused === false,
         "removeLab refuses a lab it could not empty (" + refused + " with another process "
         + "standing in it), so the cleanup check in csp.js and desk.js can go red");
    } else {
      skip("removeLab refuses a lab it could not empty - " + process.platform + " removes a "
         + "directory a live process is standing in, so this platform has no stand-in for a "
         + "browser that has not let go and the refusal is not asserted here");
    }
    const removed = E.removeLab(lab, 12, 250, 50);
    ok(removed === true && !fs.existsSync(lab),
       "removeLab removes a lab nothing is holding and answers " + removed + ", so the same "
       + "check reads true when the folder really has gone");

    /* 19b. GONE IS NOT STAYS GONE. A Chromium helper that outlives taskkill /T by a moment writes
       its profile back, and a check taken at the instant of removal reads true for a folder that
       is about to exist again: measured in %TEMP% on 2026-09-14, 13 profile files written in the
       four seconds after a csp lab was removed and the check passed. The stand-in is a process
       that recreates the folder 400 ms later, which is inside the settle window and outside the
       first removal. */
    fs.mkdirSync(lab, { recursive: true });
    fs.writeFileSync(path.join(lab, "profile.db"), "written by the browser");
    const back = spawn(process.execPath, ["-e",
      "var f=require('fs'),d=process.argv[1];setTimeout(function(){f.mkdirSync(d,{recursive:true});"
      + "f.writeFileSync(d+'/profile.db','written after the kill');}, 400);", lab], { stdio: "ignore" });
    const again = E.removeLab(lab, 12, 250, 1200);
    /* Read the folder back after everything that was coming has come, which is what makes this a
       control: without the settle wait removeLab answers true in five milliseconds and the folder
       is there four hundred later, so `stayed` is the clause that separates the two. */
    pause(900);
    const stayed = !fs.existsSync(lab);
    back.kill();
    ok(again === true && stayed,
       "removeLab does not report gone for a lab something puts back inside the settle window: "
       + "it removed it again and answered " + again + ", and the folder was still gone a second "
       + "later (" + stayed + ")");
  }

  /* 20. WHICH WINDOW THE FACTS ARE OF, board item 414. windowFacts used to answer for the
     largest visible window of the pid, and a process with two windows then had its facts read
     off whichever one was bigger. The rectangles below are the shape of that case: a 1280x880
     framed window, which is the one the driver is talking to, and a larger frameless one beside
     it. The arithmetic is asserted here so the rule can be got wrong on purpose without an
     Electron; the same case is driven for real in shell-smoke 5f2, where the second window is
     opened by a variant of the shell inside the lab's asar. */
  /* The numbers are the ones this desk answered on 2026-09-17: a page reporting 1282x882 CSS px
     at a ratio of 1.25 sat in a window whose Win32 client rectangle was 1280x881, so Win32 was
     answering in CSS pixels here. PHYS is the same page on a desk that answers in physical ones.
     Both are asserted, because which of the two a desk gives is not this harness's to choose. */
  const SUBJECT = { winW: 1295, winH: 889, cliW: 1280, cliH: 842, topInset: 39, leftInset: 8, zoomed: false };
  const DECOY   = { winW: 1600, winH: 1000, cliW: 1600, cliH: 1000, topInset: 0, leftInset: 0, zoomed: false };
  const PAGE = { cssW: 1282, cssH: 843, dpr: 1.25 };
  const both = [DECOY, SUBJECT];
  const oldRule = E.pickWindow(both);
  const newRule = E.pickWindow(both, PAGE);
  ok(oldRule.picked === DECOY && newRule.picked === SUBJECT && newRule.scale === 1,
     "pickWindow: with two visible windows the old rule, the largest by area, picks the one the "
     + "driver never asked about (topInset " + oldRule.picked.topInset + ") and the page's own box "
     + "picks the driver's own window (topInset " + newRule.picked.topInset + ", matched at scale "
     + newRule.scale + "). That difference is the whole of check 5f's flake");
  /* THE OTHER READING OF THE SAME PAGE, which is what a desk answering in physical pixels gives:
     the same page, the same ratio, a client rectangle 1.25 times the size. Both are picked, and
     the scale that matched is reported rather than assumed. */
  const PHYS = { winW: 1619, winH: 1111, cliW: 1603, cliH: 1054, topInset: 49, leftInset: 10, zoomed: false };
  const physRule = E.pickWindow([DECOY, PHYS], PAGE);
  ok(physRule.picked === PHYS && physRule.scale === 1.25,
     "pickWindow: the same page on a desk whose Win32 client rectangle is in physical pixels is "
     + "picked too, at scale " + physRule.scale + ", and the reading is named rather than assumed");
  /* And the same rule on one window, which is every other launch in the harness. */
  const alone = E.pickWindow([SUBJECT], PAGE);
  ok(alone.picked === SUBJECT && alone.candidates === 1,
     "pickWindow: one window and the page box that matches it is the ordinary case, "
     + alone.candidates + " candidate(s)");
  /* NOT FOUND IS NOT THE NEAREST. A page whose window has gone, or a size read at the wrong
     moment, must redden rather than be answered with whatever else was on the screen. */
  const none = E.pickWindow(both, { cssW: 900, cssH: 600, dpr: 1 });
  const ambiguous = E.pickWindow([SUBJECT, Object.assign({}, SUBJECT)], PAGE);
  ok(none.picked === null && /no of 2 visible/.test(none.how)
     && ambiguous.picked === null && /^2 of 2 visible/.test(ambiguous.how),
     "pickWindow: a size nothing matches and a size two windows match are both refusals rather "
     + "than a guess, and each says what it saw (" + JSON.stringify(none.how.slice(-40)) + ")");
  /* A single window comes back from PowerShell as a bare object rather than an array of one. */
  const bareOne = E.pickWindow(SUBJECT, PAGE);
  ok(bareOne.picked === SUBJECT && bareOne.candidates === 1,
     "pickWindow: one window arriving as a bare object, which is what ConvertTo-Json writes for "
     + "an array of one, is still a list of one");

  /* 21. NO LAUNCH OF THE SHELL ON THE REAL DESK, board item 467. Every case here drives
     E.shellLaunch in a child process with a STAND-IN for the shell - node, writing a marker file
     and exiting - so the refusals are proved without an Electron and without a window.

     THE MARKER IS THE CONTROL. A refusal that exits 78 proves the wording; the marker proves
     WHEN it fired, because a guard that refused after the spawn would leave the file behind and
     still exit 78. So each refusal asserts the marker is absent, and 21d asserts it is there,
     which is the same probe the other way round and the only thing standing between this case
     and a guard that refuses everything. */
  let fire = null;   /* case 23 fires the same probe at the desk lock */
  {
    const probeFile = path.join(tmp, "stand-in.js");
    fs.writeFileSync(probeFile, 'require("fs").writeFileSync(process.argv[2], "launched");\n', "utf8");
    const probe = o => 'const E = require("./engine.js");'
      + 'const o = ' + JSON.stringify(o) + ';'
      + 'const opts = { stdio: "ignore" };'
      + 'if (o.ownsDesk) opts.ownsDesk = true;'
      + 'if (o.docs !== undefined) opts.env = Object.assign({}, process.env, { ETIUDA_TEST_DOCUMENTS: o.docs });'
      + 'if (o.declare !== undefined) opts.realCatalogFolder = o.declare;'
      + 'if (o.take) { const t = E.takeDeskLock(o.who); console.log("TOOK " + JSON.stringify(t.ok)); }'
      + 'const c = E.shellLaunch(o.who, process.execPath, [' + JSON.stringify(probeFile)
      + ', o.marker].concat(o.args || []), opts);'
      + 'c.on("exit", function (code) { console.log("SPAWNED, the stand-in exited " + code); });';
    let mark = 0;
    fire = o => {
      const marker = path.join(tmp, "launched-" + (++mark) + ".txt");
      const r = run(probe(Object.assign({ marker: marker }, o)), {});
      return { code: r.code, out: r.out, launched: fs.existsSync(marker), marker: marker };
    };
    const ownUd = path.join(tmp, "ud-own");
    const ownUd2 = path.join(tmp, "ud-own-2");
    const ownCat = path.join(tmp, "cat-own");
    const labDocs = path.join(tmp, "documents");
    fs.mkdirSync(ownUd, { recursive: true });
    fs.mkdirSync(ownUd2, { recursive: true });
    fs.mkdirSync(labDocs, { recursive: true });

    const noUd = fire({ who: "a-suite.js", args: [] });
    ok(noUd.code === E.NO_VERDICT && /no --user-data-dir=/.test(noUd.out)
       && /a-suite\.js/.test(noUd.out) && noUd.launched === false,
       "21a a launch with no --user-data-dir is refused, exit " + noUd.code + ", the caller named,"
       + " and nothing was spawned: the marker the stand-in writes is " + noUd.launched);

    const realUd = fire({ who: "a-suite.js", args: ["--user-data-dir=" + path.join(E.REAL_USER_DATA, "anything")] });
    ok(realUd.code === E.NO_VERDICT && /machine's own profile/.test(realUd.out) && realUd.launched === false,
       "21b a launch aimed INSIDE this machine's own profile is refused too, exit " + realUd.code
       + ", marker " + realUd.launched + " - the flag being present is not the same as it being"
       + " pointed somewhere harmless");

    const unpinned = fire({ who: "a-suite.js", args: ["--user-data-dir=" + ownUd] });
    ok(unpinned.code === E.NO_VERDICT && /nothing confining the catalog folder/.test(unpinned.out)
       && unpinned.launched === false,
       "21c a launch with a user-data folder of its own but no pin is refused, exit " + unpinned.code
       + ": the shell reads the catalog folder first, so its own profile does not confine it");

    E.pinCatalogFolder(ownUd, ownCat);
    const pinned = fire({ who: "a-suite.js", args: ["--user-data-dir=" + ownUd] });
    ok(pinned.code === 0 && pinned.launched === true && /SPAWNED/.test(pinned.out),
       "21d and the same launch once " + E.CATALOG_FOLDER_KEY + " is pinned goes through: exit "
       + pinned.code + ", the stand-in ran and wrote its marker (" + pinned.launched + "). This is"
       + " what makes 21a to 21c refusals rather than a guard that says no to everything");

    const badDocs = fire({ who: "a-suite.js", args: ["--user-data-dir=" + path.join(tmp, "ud-docs")],
                           docs: E.REAL_DOCUMENTS });
    const goodDocs = fire({ who: "a-suite.js", args: ["--user-data-dir=" + path.join(tmp, "ud-docs")],
                            docs: labDocs });
    ok(badDocs.code === E.NO_VERDICT && badDocs.launched === false
       && goodDocs.code === 0 && goodDocs.launched === true,
       "21e the other way of confining the catalog folder is ETIUDA_TEST_DOCUMENTS, and it is read"
       + " rather than trusted: pointed at this person's own Documents the launch is refused (exit "
       + badDocs.code + ", marker " + badDocs.launched + "), pointed at a lab folder it goes"
       + " through (exit " + goodDocs.code + ", marker " + goodDocs.launched + ")");

    const owns = fire({ who: "reinstall-shaped.js", ownsDesk: true, args: [], docs: labDocs, take: true });
    ok(owns.code === 0 && owns.launched === true,
       "21f the first exemption, ownsDesk, is what tests/reinstall.js launches under - no"
       + " --user-data-dir at all, because the real profile IS its subject - and its catalog"
       + " folder is still confined: exit " + owns.code + ", marker " + owns.launched);

    /* 21g is 21c with a sentence added and nothing else changed, which is what makes it a pair:
       the same unpinned launch, refused there and allowed here. A declaration shorter than a
       sentence is not one, so "yes" does not open the door. */
    const said = fire({ who: "smoke-2k-shaped.js", args: ["--user-data-dir=" + ownUd2],
                        declare: "2k asks what a first run with no setting reads, and the answer is this machine's own folder" });
    const tooShort = fire({ who: "smoke-2k-shaped.js", args: ["--user-data-dir=" + ownUd2], declare: "because" });
    ok(said.code === 0 && said.launched === true && /launches on this desk's OWN catalog folder, declared:/.test(said.out)
       && tooShort.code === E.NO_VERDICT && tooShort.launched === false,
       "21g the second exemption, realCatalogFolder, is a SENTENCE at the launch it belongs to and"
       + " the guard prints it (exit " + said.code + ", marker " + said.launched + "); a word in"
       + " its place is not a declaration and the launch is still refused (exit " + tooShort.code
       + "). 21c is the same launch without it");
  }

  /* 22. AND NOTHING LAUNCHES THE SHELL AROUND THE GUARD. Case 21 proves what shellLaunch does;
     it says nothing about a suite that calls spawn itself, which is exactly the fault board item
     467 is about - the rule was written in five comments and enforced nowhere. So the call sites
     are counted off the tree: every spawn or shellLaunch in tests/ whose command names an
     Electron or the packaged app must be the guard's.

     The classifier is the EXE NAMED AT THE CALL, not a list of files, so a launcher added
     tomorrow is caught by the same regex. The floor is the liveness: a census that finds nothing
     has stopped matching rather than found a clean tree, and it would then pass for free. */
  {
    const EXE = /electronExe\(\)|Etiuda\.exe|assocExe|deskExe|ETIUDA_DESK_EXE/;
    const CALL = /(?:E\.)?(shellLaunch|spawn)\(([\s\S]{0,140})/g;
    const sites = [];
    for (const name of fs.readdirSync(path.join(E.ROOT, "tests")).filter(f => /\.(js|mjs)$/.test(f))) {
      if (name === "engine.js") continue;   /* the guard itself, which is where the one spawn lives */
      const text = fs.readFileSync(path.join(E.ROOT, "tests", name), "utf8");
      let m;
      while ((m = CALL.exec(text)) !== null) {
        if (EXE.test(m[2])) sites.push({ file: name, via: m[1] });
      }
    }
    /* AND THE EXEMPTIONS ARE COUNTED, because an escape hatch nobody counts is a hole with a
       comment on it. Two are known and each is argued where it is taken: ownsDesk in
       reinstall.js, realCatalogFolder at shell-smoke 2k. A third reddens this case rather than
       arriving quietly, and the answer to that red is to decide whether it should exist, not to
       raise the number. Counted by regex over the same files, the option NAME at a call site. */
    const declared = [];
    for (const name of fs.readdirSync(path.join(E.ROOT, "tests")).filter(f => /\.(js|mjs)$/.test(f))) {
      if (name === "engine.js" || name === "engine-selftest.js") continue;
      const text = fs.readFileSync(path.join(E.ROOT, "tests", name), "utf8");
      for (const key of ["ownsDesk", "realCatalogFolder"]) {
        const m = text.match(new RegExp(key + "\\s*:", "g"));
        if (m) declared.push(name + " " + key + " x" + m.length);
      }
    }
    ok(declared.length === 2 && /reinstall\.js ownsDesk x1/.test(declared.join(" "))
       && /shell-smoke\.js realCatalogFolder x1/.test(declared.join(" ")),
       "22b the two exemptions are the two that were argued for, and no more: "
       + JSON.stringify(declared) + ", by regex for the option name over tests/*.js and *.mjs"
       + " excluding engine.js and this file");

    /* 23 to 23d: THE DESK LOCK, the second half of board item 467. The reinstall loop borrows
       this machine's own profile, and on 2026-09-17 two desk files reappeared in it seconds
       after that run parked them. The lock is what tells the other labs to stand off, so what
       has to be proved is that a launch is refused WHILE IT IS HELD, allowed once it is not, and
       that a lock whose holder died does not wedge the harness until somebody deletes a file.

       The holder is a real process taking the lock through takeDeskLock, not a file written by
       hand: a stand-in that skipped the taker would leave half the pair untested. */
    const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const holdUd = path.join(tmp, "ud-lock");
    E.pinCatalogFolder(holdUd, path.join(tmp, "cat-lock"));
    try { fs.rmSync(E.DESK_LOCK, { force: true }); } catch (x) { /* 21f's child left one */ }
    const holder = spawn(process.execPath, ["-e",
      'const E = require("./engine.js"); const r = E.takeDeskLock("a-stand-in-holder");'
      + 'console.log(JSON.stringify(r)); setTimeout(function () {}, 20000);'],
      { cwd: __dirname, stdio: "ignore" });
    for (let i = 0; i < 40 && !fs.existsSync(E.DESK_LOCK); i++) pause(100);
    const heldNow = E.deskLockHolder();
    const refused = fire({ who: "another-lab.js", args: ["--user-data-dir=" + holdUd] });
    ok(!!heldNow && heldNow.alive === true && heldNow.pid === holder.pid
       && refused.code === E.NO_VERDICT && refused.launched === false
       && refused.out.indexOf(String(holder.pid)) > -1 && /a-stand-in-holder/.test(refused.out),
       "23 a launch by any other run is refused while the desk lock is held, and the holder is"
       + " named: pid " + (heldNow ? heldNow.pid : "none") + " (" + (heldNow ? heldNow.who : "-")
       + "), exit " + refused.code + ", marker " + refused.launched
       + ". The same launch passed 21d unlocked, which is the pair");

    holder.kill();
    pause(800);
    const stale = E.deskLockHolder();
    const afterDeath = fire({ who: "another-lab.js", args: ["--user-data-dir=" + holdUd] });
    /* WHAT THE STATE WAS, printed, because this leg was red on the first real Linux run and its
       annotation said "alive true" and nothing about why. On POSIX a killed child that nobody
       has reaped is a zombie, signal 0 still reaches it, and pidAlive read it as a holder; the
       state letter below is what tells a reader of the next red run which of those it was. */
    let state = "";
    try { state = " /proc state " + (/^[^)]*\)\s*(\S)/.exec(
      fs.readFileSync("/proc/" + holder.pid + "/stat", "utf8").replace(/^.*\)/, ")")) || ["", "?"])[1]; }
    catch (e) { state = process.platform === "win32" ? "" : " /proc unreadable"; }
    ok(!!stale && stale.alive === false && afterDeath.code === 0 && afterDeath.launched === true,
       "23c a lock whose holder is gone does not wedge the harness: the file is still there and"
       + " reads pid " + (stale ? stale.pid : "-") + ", alive " + (stale ? stale.alive : "-")
       + state + ", and the same launch goes through (exit " + afterDeath.code + ", marker "
       + afterDeath.launched + ")");

    const broke = run('const E = require("./engine.js"); const t = E.takeDeskLock("the-next-taker");'
      + 'console.log(JSON.stringify(t)); console.log("HOLDER " + JSON.stringify(E.deskLockHolder()));', {});
    ok(/was left behind by pid /.test(broke.out) && /breaking it/.test(broke.out)
       && /"took":true/.test(broke.out) && /the-next-taker/.test(broke.out),
       "23d and the next taker breaks it with a line saying so rather than silently: "
       + JSON.stringify((broke.out.match(/^ +the desk lock.*$/m) || ["no line"])[0].trim().slice(0, 120)));
    try { fs.rmSync(E.DESK_LOCK, { force: true }); } catch (x) { /* the taker above died holding it */ }
    /* 23g: AND THE READING THAT MADE 23c RED, asked directly, because no run on this desk can
       produce a zombie and a leg that needs one would be a leg nobody here could fail. The lines
       below are /proc/<pid>/stat as the kernel writes it; the trap is field two, the command in
       parentheses, which may hold spaces and a bracket and a state letter of its own, so the
       state is read after the LAST ')' and not by splitting on spaces. */
    const Z = "8113 (node) Z 8095 8095 0 -1 4194560 0 0 0 0 0 0";
    const R = "8113 (node) R 8095 8095 0 -1 4194560 0 0 0 0 0 0";
    const NASTY = "8113 (sh -c echo ) R x) Z 8095 8095 0 -1 4194560 0 0";
    const NASTYR = "8113 (sh -c echo ) Z x) S 8095 8095 0 -1 4194560 0 0";
    ok(E.statIsZombie(Z) === true && E.statIsZombie(R) === false
       && E.statIsZombie(NASTY) === true && E.statIsZombie(NASTYR) === false,
       "23g a process that has exited and not been reaped still answers signal 0, so the state"
       + " is read too: Z " + E.statIsZombie(Z) + ", R " + E.statIsZombie(R) + ", and a command"
       + " name holding a bracket and a letter of its own does not move the answer ("
       + E.statIsZombie(NASTY) + ", " + E.statIsZombie(NASTYR) + "), because the state is taken"
       + " after the LAST bracket. 23c is where that reading is used");

    ok(!fs.existsSync(E.DESK_LOCK),
       "23e and this file leaves no lock behind: " + E.DESK_LOCK + " is gone");

    /* And with no lock held by anybody, which is the state every other run of the harness is in:
       ownsDesk is still refused. The word alone opens nothing; 21f is the same launch from a
       process that took the lock first, and that is the whole difference between them. */
    const ownsUnlocked = fire({ who: "reinstall-shaped.js", ownsDesk: true, args: [],
                                docs: path.join(tmp, "documents") });
    ok(ownsUnlocked.code === E.NO_VERDICT && /does not hold the desk lock/.test(ownsUnlocked.out)
       && ownsUnlocked.launched === false && !fs.existsSync(E.DESK_LOCK),
       "23f ownsDesk is not a word a run may simply say: with no lock held it is refused (exit "
       + ownsUnlocked.code + ", marker " + ownsUnlocked.launched + "), and 21f is the same launch"
       + " from a process that took the lock first");

    const direct = sites.filter(s => s.via === "spawn");
    ok(sites.length >= 7 && direct.length === 0,
       "22 every launch of the shell in tests/ goes through the guard: " + sites.length
       + " call site(s) whose command names an Electron or the packaged app, by regex over the"
       + " working tree of tests/*.js and *.mjs excluding engine.js, of which " + direct.length
       + " call spawn directly" + (direct.length ? ": " + JSON.stringify(direct) : "")
       + ". The floor of 7 is this case's own liveness");
  }

  /* 24 to 24e: PARKING A SHORTCUT, board item 514. The reinstall loop runs a real installer
     against the real user's Desktop and Start Menu. An installer writes its shortcut by NAME, so
     one of that name already there is overwritten by the install and deleted by the uninstall,
     and on 2026-09-18 that is what happened to this desk: both shortcuts gone, nothing put back,
     and the loop's own end-of-run check green because it counted additions only.

     The loop itself cannot be driven from here - it installs software on whatever desk it runs
     on, which is the fault, not the test - so what is driven here is the pair of helpers it now
     uses, against folders of this lab's own, through the same four steps in the same order:
     park, install over the name, uninstall the name, restore. The arm that matters is the
     CONTROL: the same four steps with the parking left out, which must lose the user's file.
     Without that arm this case would pass with the helpers doing nothing at all. */
  const LNK = "Etiuda.lnk";
  const MINE_BYTES = "the shortcut this desk already had, made by an install in June";
  const THEIRS = "the shortcut the run's own installer wrote";
  const shaOf = s => crypto.createHash("sha256").update(s).digest("hex");
  function aDesk(where) {
    const dt = path.join(tmp, where, "Desktop"), sm = path.join(tmp, where, "Start Menu");
    fs.mkdirSync(dt, { recursive: true });
    fs.mkdirSync(sm, { recursive: true });
    fs.writeFileSync(path.join(dt, LNK), MINE_BYTES);
    fs.writeFileSync(path.join(sm, LNK), MINE_BYTES);
    return { dt: dt, sm: sm, park: path.join(tmp, where, "qa-parked"),
             homes: [{ what: "the Desktop", tag: "desktop", dir: dt },
                     { what: "the Start Menu", tag: "start-menu", dir: sm }] };
  }
  const install = d => { fs.writeFileSync(path.join(d.dt, LNK), THEIRS); fs.writeFileSync(path.join(d.sm, LNK), THEIRS); };
  const uninstall = d => { fs.rmSync(path.join(d.dt, LNK), { force: true }); fs.rmSync(path.join(d.sm, LNK), { force: true }); };
  const bytesAt = p => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; } };

  const d1 = aDesk("desk-parked");
  const parked1 = E.parkNamedShortcuts(d1.homes, LNK, d1.park);
  const emptyAfterPark = !fs.existsSync(path.join(d1.dt, LNK)) && !fs.existsSync(path.join(d1.sm, LNK));
  ok(parked1.length === 2 && emptyAfterPark
     && parked1.every(p => fs.existsSync(p.to) && p.sha === shaOf(MINE_BYTES))
     && parked1[0].to !== parked1[1].to,
     "24 parking takes a shortcut of the installer's name out of both places and records its"
     + " bytes: " + parked1.length + " parked, each place empty of that name afterwards ("
     + emptyAfterPark + "), sha256 " + String((parked1[0] || {}).sha).slice(0, 16) + ", and the"
     + " two files are kept apart in the parking folder by their tag. This is what makes the"
     + " loop's 0a2 true and its 1b a reading of the installer's own work");

  install(d1);
  const overwritten = bytesAt(path.join(d1.dt, LNK)) === THEIRS;
  uninstall(d1);
  const backRows = E.restoreNamedShortcuts(parked1);
  const back = [path.join(d1.dt, LNK), path.join(d1.sm, LNK)].map(bytesAt);
  ok(overwritten && backRows.length === 2 && backRows.every(r => r.back && r.same && !r.tookRunsOwn)
     && back.every(b => b === MINE_BYTES) && fs.readdirSync(d1.park).length === 0,
     "24b and after an install over that name and the uninstall that follows it, the desk's own"
     + " file is back byte for byte: " + JSON.stringify(back.map(b => b === MINE_BYTES))
     + " against sha256 " + shaOf(MINE_BYTES).slice(0, 16) + ", the install having overwritten it"
     + " first (" + overwritten + "), and the parking folder is empty ("
     + fs.readdirSync(d1.park).length + " left)");

  /* THE CONTROL, and the whole teeth of 24b. The same desk, the same install and the same
     uninstall, with the two helpers not called: this is the loop as it stood on 2026-09-18, and
     what it must show is the user's file GONE. A green 24b with this arm green too would mean
     the parking did nothing and the installer simply never touched the file. */
  const d2 = aDesk("desk-unparked");
  install(d2);
  uninstall(d2);
  const lost = [path.join(d2.dt, LNK), path.join(d2.sm, LNK)].map(bytesAt);
  ok(lost.every(b => b === null),
     "24b2 the control: the same four steps without the parking lose the desk's own shortcut in"
     + " both places (" + JSON.stringify(lost) + "), which is what this machine measured on"
     + " 2026-09-18 and what 24b is the fix for");

  /* A run whose uninstall did not take its own shortcut away. The user's copy is the one in
     hand, so the file standing in its place is the run's, and it is removed and named. */
  const d3 = aDesk("desk-leftover");
  const parked3 = E.parkNamedShortcuts(d3.homes, LNK, d3.park);
  install(d3);
  const rows3 = E.restoreNamedShortcuts(parked3);
  ok(rows3.length === 2 && rows3.every(r => r.back && r.same && r.tookRunsOwn === true)
     && bytesAt(path.join(d3.dt, LNK)) === MINE_BYTES,
     "24c and where the run's own shortcut is still standing, it is removed first and the row"
     + " says so: tookRunsOwn " + JSON.stringify(rows3.map(r => r.tookRunsOwn)) + ", the bytes"
     + " back " + (bytesAt(path.join(d3.dt, LNK)) === MINE_BYTES)
     + ". Without the removal the rename would fail and the desk would keep a dead shortcut");

  /* And a desk that had none: nothing is parked, nothing is created, and the restore of an empty
     list is an empty list. A helper that invented a shortcut on a desk that never had one would
     be the same class of fault in the other direction. */
  const d4 = aDesk("desk-none");
  uninstall(d4);
  const parked4 = E.parkNamedShortcuts(d4.homes, LNK, d4.park);
  const rows4 = E.restoreNamedShortcuts(parked4);
  ok(parked4.length === 0 && rows4.length === 0 && !fs.existsSync(d4.park)
     && !fs.existsSync(path.join(d4.dt, LNK)) && !fs.existsSync(path.join(d4.sm, LNK)),
     "24d a desk with no shortcut of that name is untouched: " + parked4.length + " parked, "
     + rows4.length + " restored, no parking folder made (" + !fs.existsSync(d4.park)
     + "), and no shortcut invented");

  /* 24e. AND THE LOOP ACTUALLY CALLS THEM. The helpers above are proved; a copy of the loop that
     stopped calling them would take the proof with it and this file would stay green, which is
     the fault named in case 22 wearing different clothes. Counted by regex over the working tree
     of tests/*.js and *.mjs excluding engine.js and this file: the call site of each helper. */
  const callers = { park: [], restore: [] };
  for (const name of fs.readdirSync(path.join(E.ROOT, "tests")).filter(f => /\.(js|mjs)$/.test(f))) {
    if (name === "engine.js" || name === "engine-selftest.js") continue;
    const text = fs.readFileSync(path.join(E.ROOT, "tests", name), "utf8");
    for (const m of text.match(/E\.parkNamedShortcuts\(/g) || []) callers.park.push(name);
    for (const m of text.match(/E\.restoreNamedShortcuts\(/g) || []) callers.restore.push(name);
  }
  ok(callers.park.length === 1 && callers.restore.length === 1
     && callers.park[0] === "reinstall.js" && callers.restore[0] === "reinstall.js",
     "24e and the one instrument that installs software still calls both: park "
     + JSON.stringify(callers.park) + ", restore " + JSON.stringify(callers.restore)
     + ", by regex for the call over tests/*.js and *.mjs excluding engine.js and this file."
     + " A loop that stopped parking would leave 24 to 24d green and this red");

  /* 24f to 24k: A FILE THE RUN DID NOT WRITE IS KEPT, NOT DELETED (carve A of 2026-09-24). The
     loop's 0a refusal used to delete a desk.json that appeared in the real profile, having logged
     only its name, on two days running; the loop is driven against a scratch home in the report
     of that day, and these are the helpers it now calls, against folders of this lab's own. */
  {
    const ud = path.join(tmp, "envelope");
    fs.mkdirSync(ud, { recursive: true });
    const planted = path.join(ud, "desk.json");
    const PLANTED = JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "planted",
      saved: "2026-09-24T10:00:00.000Z", desk: "d-lab", answered: [],
      keys: { eCatalog: "SECRET-CARD-TEXT", eGlassOff: "1" } });
    fs.writeFileSync(planted, PLANTED);
    const env = E.deskEnvelope(planted);
    const line = E.envelopeLine(env);
    ok(env.app === "planted" && env.saved === "2026-09-24T10:00:00.000Z" && env.desk === "d-lab"
       && env.bytes === PLANTED.length && JSON.stringify(env.keys) === '["eCatalog","eGlassOff"]'
       && /app "planted"/.test(line) && line.indexOf("SECRET") < 0,
       "24f the envelope of a planted desk names its writer and its keys and never a value: "
       + line.replace(tmp, "<lab>"));
    /* 24f2, the other kind of file 0a can meet: a catalog is somebody's content and is not opened. */
    const ec = path.join(ud, "found.ec");
    fs.writeFileSync(ec, '{"kind":"etiuda-catalog","cards":["SECRET"]}');
    const ecLine = E.envelopeLine(E.deskEnvelope(ec));
    ok(ecLine.indexOf("SECRET") < 0 && ecLine.indexOf("etiuda-catalog") < 0 && /bytes/.test(ecLine),
       "24f2 and a catalog file is given its size and date only, not opened: " + ecLine);

    /* 24g: kept by rename, the same bytes, and a name already there is twinned rather than written
       over - which is what renameSync does to it on Windows unasked. */
    const keep = path.join(ud, "qa-evidence");
    fs.mkdirSync(keep, { recursive: true });
    fs.writeFileSync(path.join(keep, "desk.json"), "an earlier piece of evidence");
    const rows = E.keepAside([planted], keep);
    const earlier = fs.readFileSync(path.join(keep, "desk.json"), "utf8");
    ok(rows.length === 1 && rows[0].moved && rows[0].same === true && !fs.existsSync(planted)
       && path.basename(rows[0].to) === "desk.json.2" && earlier === "an earlier piece of evidence"
       && fs.readFileSync(rows[0].to, "utf8") === PLANTED,
       "24g keepAside moves the file, the same sha256 after (" + (rows[0] || {}).same + "), and"
       + " twins a name already kept (" + path.basename((rows[0] || {}).to || "none") + ") rather"
       + " than writing over the earlier one, which still reads as it did");

    /* 24h, the control for 24g: a file that cannot be moved is LEFT, and the row says so. A
       keepAside that answered moved for everything would pass 24g; this is the arm that needs a
       false. Two absent paths give the error without a lock, on every platform. */
    const gone = path.join(ud, "never-there.json");
    const bad = E.keepAside([gone], keep);
    ok(bad.length === 1 && bad[0].moved === false && !!bad[0].why,
       "24h control: a file that is not there is not reported moved: moved " + (bad[0] || {}).moved
       + ", " + String((bad[0] || {}).why).slice(0, 60));

    /* 24i to 24j: the question the loop now asks before it moves anything. Windows only - there is
       no shell to ask elsewhere - and it spawns PowerShell and nothing else. */
    if (process.platform === "win32") {
      const here = E.shellFolders();
      const agree = E.placesMismatch({ ApplicationData: here.ApplicationData,
        LocalApplicationData: here.LocalApplicationData, Desktop: here.Desktop, Programs: here.Programs });
      ok(E.SHELL_FOLDERS.every(k => !!here[k]) && agree.said.length === 0,
         "24i Windows answers all " + E.SHELL_FOLDERS.length + " folders and agrees with itself: "
         + agree.said.length + " disagreement(s)");
      /* 24j THE CONTROL, and the measurement it rests on: APPDATA and LOCALAPPDATA pointed into this
         lab, USERPROFILE left alone, and Windows still answers the folders it answered at 24i. A
         file that read the environment would act on the lab; this says it would not agree. */
      const wrong = Object.assign({}, process.env, { APPDATA: path.join(tmp, "elsewhere", "Roaming"),
                                                     LOCALAPPDATA: path.join(tmp, "elsewhere", "Local") });
      const told = E.placesMismatch({ ApplicationData: wrong.APPDATA, LocalApplicationData: wrong.LOCALAPPDATA },
                                    wrong);
      ok(told.said.length === 2 && told.shell.ApplicationData === here.ApplicationData,
         "24j control: with APPDATA and LOCALAPPDATA pointed into the lab and USERPROFILE not,"
         + " Windows still answers " + told.shell.ApplicationData + " and the comparison says so "
         + told.said.length + " time(s) of 2");
    } else skip("24i-24j: no Windows shell to ask on " + process.platform);

    /* 24k AND THE LOOP CALLS THEM, by regex over tests/reinstall.js with comment lines dropped:
       the envelope and the keeping at least once each, the question once, and NO recursive remove
       of the parking folder - the line that destroyed a desk file in a scratch home that day. */
    const loop = fs.readFileSync(path.join(E.ROOT, "tests", "reinstall.js"), "utf8").split(/\r?\n/)
      .filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).join("\n");
    const calls = {
      envelope: (loop.match(/E\.deskEnvelope\(/g) || []).length,
      keep: (loop.match(/E\.keepAside\(/g) || []).length,
      places: (loop.match(/E\.placesMismatch\(/g) || []).length,
      recursivePark: (loop.match(/rmSync\(PARKED[^)]*recursive/g) || []).length,
    };
    ok(calls.envelope >= 1 && calls.keep >= 1 && calls.places === 1 && calls.recursivePark === 0,
       "24k and the loop calls them: " + JSON.stringify(calls) + ", by regex over tests/reinstall.js"
       + " with comment lines dropped");
  }

/* ---- 25: A TALLY IS NOT A VERDICT, board item 531 -------------------------------------------
   E.suiteVerdict is the rule tests/smoke.js and tests/shell-smoke.js both end on, and it is a
   pure function so that it can be put wrong here rather than by shipping a broken suite. The
   cases are the four a run can be in, and the first is the one that must NOT refuse: a guard
   that refuses everything is as useless as one that refuses nothing. */
{
  const v = o => E.suiteVerdict(o);
  /* SAYS NOTHING EXTRA IS PLATFORM-BOUND, and this case did not know it until board item 629 ran
     the whole chain under a patched platform: off Windows a clean verdict still carries the
     eight-line notice, by design and asserted by 28e, so `lines.length === 0` was a case that
     would have reddened the first real Linux run for a fault in itself. The claim it was reaching
     for is the stronger one - the only extra lines are that notice and nothing else - and on
     Windows, where offWindowsNotice is empty, it is the same assertion it always was. */
  const whole = v({ checks: 107, fails: 0, expected: 107, reachedEnd: true });
  const notice = E.offWindowsNotice();
  ok(whole.exit === 0 && whole.noVerdict === false
     && whole.lines.join("\n") === notice.join("\n"),
     "25 a complete run whose count matches its declaration is a verdict and says nothing extra"
     + " beyond the " + notice.length + " line(s) this platform (" + process.platform + ") adds: "
     + "exit " + whole.exit + ", " + whole.lines.length + " line(s)");
  const failed = v({ checks: 107, fails: 3, expected: 107, reachedEnd: true });
  ok(failed.exit === 3 && failed.noVerdict === false,
     "25a and its exit code is the number of failed checks, not a flag: " + failed.exit);
  /* Ballot 4 of the fourth meeting, 2026-09-23. bash and Linux read an exit code modulo 256, so
     a count handed over whole read 256 failures as success and 78 as NO VERDICT. Measured red
     before the cap: 256 and 78. */
  const many = v({ checks: 300, fails: 256, expected: 300, reachedEnd: true });
  const seventyEight = v({ checks: 300, fails: 78, expected: 300, reachedEnd: true });
  ok(many.exit > 0 && many.exit % 256 !== 0 && seventyEight.exit !== E.NO_VERDICT
     && seventyEight.exit > 0 && many.noVerdict === false,
     "25g and a count too large for a shell is capped rather than wrapped: 256 failures exit "
     + many.exit + " and 78 failures exit " + seventyEight.exit + ", never 0 and never NO VERDICT");
  const short = v({ checks: 44, fails: 0, expected: 107, reachedEnd: true });
  ok(short.exit === E.NO_VERDICT && short.noVerdict === true
     && /63 never ran/.test(short.lines.join(" ")),
     "25b a run that reached the end with 44 of 107 checks has NO verdict, and says how many "
     + "never ran: exit " + short.exit + ", " + JSON.stringify(short.lines));
  const over = v({ checks: 108, fails: 0, expected: 107, reachedEnd: true });
  ok(over.exit === E.NO_VERDICT && /declaration is stale/.test(over.lines.join(" ")),
     "25c and more checks than declared is a refusal too, read as a stale declaration rather "
     + "than a pleasant surprise: exit " + over.exit);
  const stopped = v({ checks: 44, fails: 0, expected: null, reachedEnd: false });
  ok(stopped.exit === E.NO_VERDICT && /SUITE DID NOT COMPLETE/.test(stopped.lines.join(" ")),
     "25d a run that stopped early has no verdict whatever its tally says: exit " + stopped.exit);
  const undeclared = v({ checks: 44, fails: 0, expected: null, reachedEnd: true });
  ok(undeclared.exit === 0 && /no declared check count/.test(undeclared.lines.join(" ")),
     "25e and a driver that declares no count is told so out loud rather than passed over, "
     + "because that reading cannot see a section that never ran");
  /* THE DECLARATION IS NOT A COMMENT. Both drivers must actually hand one over, or 25b is a
     rule nothing obeys. Counted by regex over the two files' own source. */
  const ends = ["smoke.js", "shell-smoke.js"].map(f => ({
    file: f,
    on: /E\.suiteVerdict\(/.test(fs.readFileSync(path.join(E.ROOT, "tests", f), "utf8")),
  }));
  ok(ends.every(d => d.on),
     "25f and both drivers that decide a run END on it, so the rule has one body rather than "
     + "two copies that will differ: " + JSON.stringify(ends));
}

/* ---- 26: THE LEASES THIS HARNESS DOES NOT OWN, board item 568 -------------------------------
 *
 * ETIUDA_LEASE names a command and nothing about what is on the other end of it, so the whole
 * bridge can be driven against a stub that writes down what it was asked and answers as told.
 * The case that matters is 26c: a refusal must GIVE BACK what it already took. A bridge that
 * took the first resource, was refused the second and exited would leave a lease nobody holds
 * against a run that is not there, which wedges the next run instead of the present one.
 */
{
  const CALLS = path.join(tmp, "lease-calls.log");
  const stubAt = (name, exit) => {
    const f = path.join(tmp, name + ".js");
    fs.writeFileSync(f, [
      'const fs = require("fs");',
      'const a = process.argv.slice(2);',
      'fs.appendFileSync(' + JSON.stringify(CALLS) + ', a.join(" ") + "\\n");',
      /* A release always succeeds, or a refusal could not give back what it took. */
      'console.log("stub: " + a.join(" "));',
      'process.exit(a[0] === "release" ? 0 : ' + exit + ');',
    ].join("\n"));
    return "node " + f;
  };
  const FREE = stubAt("lease-free", "0");
  /* Refuses the SECOND resource only, which is what makes 26c a control rather than a repeat:
     the first was really taken before the refusal arrived. */
  const fSecond = path.join(tmp, "lease-second.js");
  fs.writeFileSync(fSecond, [
    'const fs = require("fs");',
    'const a = process.argv.slice(2);',
    'fs.appendFileSync(' + JSON.stringify(CALLS) + ', a.join(" ") + "\\n");',
    'console.log("stub: " + a.join(" "));',
    'if (a[0] === "release") process.exit(0);',
    'process.exit(a[1] === "desk:installed-app" ? 1 : 0);',
  ].join("\n"));
  const SECOND = "node " + fSecond;
  const TAKE = 'const E = require("./engine.js");'
    + 'const r = E.takeLeases(["desk:profile", "desk:installed-app"], 5, "case 26");'
    + 'console.log("TOOK " + JSON.stringify(r.asked) + " " + JSON.stringify(r.held) + " " + r.said);';

  let r = run(TAKE, { ETIUDA_LEASE: "" });
  ok(r.code === 0 && /TOOK false \[\]/.test(r.out) && /took no lease/.test(r.out),
     "26a with ETIUDA_LEASE unset a gate runs exactly as it did and says it took nothing, so a"
     + " clone outside this company is not told to invent a lease command: exit " + r.code);

  fs.writeFileSync(CALLS, "");
  r = run(TAKE, { ETIUDA_LEASE: FREE, ETIUDA_LEASE_HOLDER: "case-26" });
  let calls = fs.readFileSync(CALLS, "utf8").trim().split(/\r?\n/);
  ok(r.code === 0 && /TOOK true \["desk:profile","desk:installed-app"\]/.test(r.out)
     && calls[0] === "take desk:profile case-26 5" && calls[1] === "take desk:installed-app case-26 5",
     "26b a granting command is called once per resource, with the verb, the resource, the holder"
     + " and the minutes in that order: " + JSON.stringify(calls.slice(0, 2)));
  ok(calls.length === 4 && calls[2] === "release desk:installed-app case-26"
     && calls[3] === "release desk:profile case-26",
     "26c a run that ends gives both back, last taken first: " + JSON.stringify(calls.slice(2)));

  fs.writeFileSync(CALLS, "");
  r = run(TAKE, { ETIUDA_LEASE: SECOND, ETIUDA_LEASE_HOLDER: "case-26" });
  calls = fs.readFileSync(CALLS, "utf8").trim().split(/\r?\n/);
  ok(r.code === E.NO_VERDICT && /desk:installed-app is held by another run/.test(r.out)
     && /nothing about the product was measured/.test(r.out),
     "26d THE REFUSAL: a resource held by somebody else stops the gate before it starts, with"
     + " exit " + r.code + " rather than a failure, because nothing was measured");
  ok(calls.length === 3 && calls[2] === "release desk:profile case-26",
     "26e THE CONTROL: and the refusal gives back the one it had already taken, so a refused run"
     + " leaves nothing held in its name: " + JSON.stringify(calls));

  r = run(TAKE, { ETIUDA_LEASE: path.join(tmp, "no-such-lease-program") });
  ok(r.code === E.NO_VERDICT && /could not be run/.test(r.out),
     "26f a lease command that cannot be run is a refusal and not a shrug, because the brief that"
     + " set the variable believes it: exit " + r.code);

  r = run('console.log("HOLDER " + require("./engine.js").LEASE_HOLDER);', { ETIUDA_LEASE_HOLDER: "" });
  ok(/HOLDER harness-[a-z-]*-\d+/.test(r.out),
     "26g the default holder names the run rather than the seat, so two instances of one gate are"
     + " two holders: " + r.out.trim());
}

/* ---- 28: THE BRANCHES THIS MACHINE IS NOT ON, board item 613 --------------------------------
 *
 * Three helpers have a non-Windows arm, and no run on this desk would ever take it, so it could
 * be wrong for a year and nothing would say so. `process.platform` is a writable property, so a
 * child can be started as though it were somewhere else and the branch driven here.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the branch is taken and says what it says. It
 * does NOT prove the branch works on Linux: SIGKILL, /proc and a display are the real questions
 * and none of them is asked on this machine. Case 28 is a control against a wrong branch, not a
 * Linux run, and a report that cites it says so.
 */
{
  const AS = code => 'Object.defineProperty(process, "platform", { value: "linux" });' + code;
  /* AND THE OTHER WAY ROUND, since 2026-09-20. A control here said "on Windows the same call
     does X" and proved it by running UNPATCHED, which is Windows on this desk and Linux on
     ubuntu-latest: on the first real Linux run 28b, 28f and 29b were the patched arm a second
     time and reddened the job for the platform. Where the Windows answer is logic, the control
     patches to win32 and asks it anywhere; where it needs user32 or taskkill it is NOT RUN off
     Windows and says so, because a control that cannot be run is not a control that passed. */
  const HOST_WIN = process.platform === "win32";
  const AS_WIN = code => (HOST_WIN ? ""
    : 'Object.defineProperty(process, "platform", { value: "win32" });') + code;

  let r = run(AS('const E = require("./engine.js");'
    + 'const v = E.offscreenVerdict(1234, "case 28");'
    + 'console.log("SKIPPED " + v.skipped + " OK " + v.ok);'
    + 'console.log(v.what);'), {});
  ok(r.code === 0 && /SKIPPED true OK false/.test(r.out) && /NOT RUN/.test(r.out)
     && /neither a pass nor a failure/.test(r.out),
     "28a off Windows the offscreen verdict is NOT RUN rather than a failed check, because the"
     + " helper is PowerShell and user32 and was never able to look: " + (r.out.trim().split(/\r?\n/)[0] || ""));

  r = run(AS_WIN('const E = require("./engine.js");'
    + 'const v = E.offscreenVerdict(process.pid, "case 28");'
    + 'console.log("SKIPPED " + v.skipped + " MEASURED " + (v.facts && v.facts.measured)'
    + ' + " DISPLAYS " + ((v.facts && v.facts.displays) || []).length);'), {});
  /* What is asserted off Windows is that it is NOT A SKIP, which is the whole control; that it
     really looked needs a screen and is asserted where there is one. Written so that the same
     leg is true of a real Linux runner and of this file run under a patched platform, which is
     how the desk reads the other arm at all. */
  ok(r.code === 0 && /SKIPPED false /.test(r.out) && /MEASURED (true|false)/.test(r.out)
     && (!HOST_WIN || /SKIPPED false MEASURED true DISPLAYS [1-9]/.test(r.out)),
     "28b THE CONTROL: the same call on win32 is not a skip and carries facts - "
     + (HOST_WIN ? "on this machine it really looked and names the displays it compared against"
                 : "on " + process.platform + " it took the Windows arm and failed to look, which"
                   + " is a failed check and not a NOT RUN")
     + ", where the skip carries no facts at all. So 28a is the platform and not a helper that"
     + " gave up: " + r.out.trim());

  /* killTree, both arms, against a real child of this run. A sleeper rather than a stub that
     exits: a process that was leaving anyway would let either arm claim the kill. */
  const SLEEPER = 'const p = require("child_process").spawn(process.execPath,'
    + ' ["-e", "setInterval(function(){}, 1000);"], { stdio: "ignore" });'
    + 'const E = require("./engine.js");'
    + 'const before = E.pidAlive(p.pid);'
    + 'const did = E.killTree(p.pid);'
    + 'setTimeout(function () {'
    + '  console.log("BEFORE " + before + " AFTER " + E.pidAlive(p.pid) + " HOW " + did.how);'
    + '  process.exit(0);'
    + '}, 900);';
  if (HOST_WIN) {
    r = run(SLEEPER, {});
    ok(r.code === 0 && /BEFORE true AFTER false/.test(r.out) && /taskkill/.test(r.out),
       "28c killTree takes a live child down through the Windows arm: " + r.out.trim());
  } else {
    /* A win32 patch would reach the Windows arm and find no taskkill, so the child would live
       and the arm would report a kill it did not make. That is a measurement of the patch. */
    skip("28c killTree's Windows arm cannot be run on " + process.platform + ": it is taskkill,"
         + " and under a win32 patch here the arm would report a kill nothing performed. 28d is"
         + " the POSIX arm, which is this platform's own and is run");
  }
  r = run(AS(SLEEPER), {});
  ok(r.code === 0 && /BEFORE true AFTER false/.test(r.out) && /SIGKILL to the one pid/.test(r.out),
     "28d and the POSIX arm takes the same live child down, which is what says the branch is"
     + " reached and does something: " + r.out.trim());

  r = run(AS('const E = require("./engine.js");'
    + 'const v = E.suiteVerdict({ checks: 3, fails: 0, expected: 3, reachedEnd: true });'
    + 'console.log(JSON.stringify(v));'), {});
  ok(r.code === 0 && /NOT WINDOWS \(linux\)/.test(r.out)
     && /the installer itself/.test(r.out) && /exit":0/.test(r.out),
     "28e a clean run off Windows is still exit 0 and says, at the verdict, the "
     + E.NOT_PROVED_OFF_WINDOWS.length + " things it did not look at, because a document nobody"
     + " opens at that moment is not a guard");
  r = run(AS_WIN('const E = require("./engine.js");'
    + 'const v = E.suiteVerdict({ checks: 3, fails: 0, expected: 3, reachedEnd: true });'
    + 'console.log(JSON.stringify(v));'), {});
  ok(r.code === 0 && !/NOT WINDOWS/.test(r.out) && /"lines":\[\]/.test(r.out),
     "28f THE CONTROL: the same verdict on win32 says none of it, so the list reddens on the"
     + " platform and is not printed at every verdict. This is pure arithmetic and a string, so"
     + " it is asked under a patch on either platform: " + r.out.trim());
}

/* ---- 27: THE PORT TABLE, board item 628 -----------------------------------------------------
 *
 * 568 gave shell-smoke a movable base and left four gates on fixed numbers. Two concurrent runs
 * of tests/csp.js at 9422 were then measured on 2026-09-20: the second died on a detached frame
 * and THE FIRST went red counting three inline refusals where two were expected and four sibling
 * refusals where two were expected, because both drivers were reading one Electron. So the
 * numbers are a table, one shift moves a whole run, and the table is checked at every call.
 */
{
  const ASK = g => 'console.log("BASE " + require("./engine.js").portBlock(' + JSON.stringify(g) + '));';
  const TABLE = { csp: 9420, desk: 9424, "catalog-watch": 9428, "shell-smoke": 9460, reinstall: 9560 };
  let r;
  for (const g of Object.keys(TABLE)) {
    r = run(ASK(g), { ETIUDA_PORT_SHIFT: "" });
    ok(r.code === 0 && new RegExp("BASE " + TABLE[g] + "$", "m").test(r.out),
       "27a " + g + " takes its own row in the table with nothing in the environment: " + r.out.trim());
  }
  /* ONE SHIFT MOVES EVERY GATE BY THE SAME AMOUNT, which is the whole difference from a shared
     base: the gates stay as far apart from each other as the table put them. */
  const shifted = Object.keys(TABLE).map(g => {
    const out = run(ASK(g), { ETIUDA_PORT_SHIFT: "200" });
    return { g: g, base: Number((/BASE (\d+)/.exec(out.out) || [])[1]), code: out.code };
  });
  ok(shifted.every(x => x.code === 0 && x.base === TABLE[x.g] + 200),
     "27b a shift of 200 moves all " + shifted.length + " gates by 200 and no gate lands on"
     + " another's number: " + shifted.map(x => x.g + " " + x.base).join(", "));

  /* Two refusals, not one: a value that is not a number at all, and a number too small to clear
     the span, which would put this run's block inside another run's. */
  for (const bad of [["9460x", /is not a whole number/], ["-1", /is not a whole number/],
                     ["1", /smaller than the map's span/], ["80", /smaller than the map's span/],
                     [String(E.portSpan() - 1), /smaller than the map's span/]]) {
    r = run(ASK("csp"), { ETIUDA_PORT_SHIFT: bad[0] });
    ok(r.code === E.NO_VERDICT && bad[1].test(r.out),
       "27c a shift of " + JSON.stringify(bad[0]) + " refuses rather than falling back: exit "
       + r.code + ", " + (/ETIUDA_PORT_SHIFT is [^\n]*/.exec(r.out) || ["(said nothing)"])[0].trim());
  }
  r = run(ASK("csp"), { ETIUDA_PORT_SHIFT: "0" });
  ok(r.code === 0 && /BASE 9420/.test(r.out),
     "27c2 THE CONTROL: nought is a shift and is not refused, so 27c reddens on the value and not"
     + " on the variable being set: " + r.out.trim());

  r = run(ASK("storage-carry"), {});
  ok(r.code === E.NO_VERDICT && /has no port block called "storage-carry"/.test(r.out)
     && /csp, desk/.test(r.out),
     "27d a gate that is not in the table refuses and is told what the table holds, so the next"
     + " Electron gate cannot quietly pick a number the way these five did: exit " + r.code);

  /* THE OVERLAP CHECK, driven against the real table rather than a copy of it: a row is added at
     run time that overlaps csp's, and csp's own call is what refuses. */
  const PLANT = base => 'const E = require("./engine.js");'
    + 'E.PORT_BLOCKS["a-new-gate"] = { base: ' + base + ', size: 2 };'
    + 'console.log("BASE " + E.portBlock("csp"));';
  r = run(PLANT(9421), {});
  ok(r.code === E.NO_VERDICT && /port blocks overlap/.test(r.out) && /csp 9420-9423/.test(r.out)
     && /a-new-gate 9421-9422/.test(r.out),
     "27e a row overlapping csp's block refuses csp's own call and names both gates, so two gates"
     + " of ONE run cannot reach each other's Electron: exit " + r.code);
  r = run(PLANT(9600), {});
  ok(r.code === 0 && /BASE 9420/.test(r.out),
     "27e2 THE CONTROL: the same row at 9600 overlaps nothing and csp answers as before, so 27e"
     + " reddens on the overlap and not on the table having grown: " + r.out.trim());

  /* AND THE FIVE GATES MUST ACTUALLY ASK. Not a regex over their source: each is run under a
     shift that puts ITS OWN block past the last port, and each refuses quoting the block it
     would have used - a number no constant in the file could produce. */
  for (const g of Object.keys(TABLE)) {
    const file = "tests/" + (g === "shell-smoke" ? "shell-smoke" : g) + ".js";
    const want = TABLE[g] + 60000;
    const impossible = run('process.chdir(require("./engine.js").ROOT);'
      + 'require("child_process").execFileSync(process.execPath, [' + JSON.stringify(file) + '],'
      + '{ stdio: "inherit" });', { ETIUDA_PORT_SHIFT: "60000", ETIUDA_FIXTURES: "" });
    ok(new RegExp("block at " + want + "-").test(impossible.out),
       "27f " + file + " reads its base through the same door, refusing at load before it builds"
       + " anything, and quotes " + want + " back: "
       + (impossible.out.trim().split(/\r?\n/)[0] || "(said nothing)"));
  }
}

/* ---- 29: THE NOT-RUN IS A COUNT, board item 628 ---------------------------------------------
 *
 * Four gates printed `  NOT RUN` for the offscreen verdict off Windows and counted nothing. A
 * line neither counter reads leaves the run one check shorter than the same run on Windows, and
 * tools/gate-run.mjs then records two greens that are not the same green. E.offscreenCheck is
 * the one copy of the rule, and it is driven here rather than described.
 */
{
  const DRIVE = pre => pre + 'const E = require("./engine.js");'
    + 'const notRun = []; let checks = 0, fails = 0;'
    + 'const check = (good, what) => { checks++; if (!good) fails++; console.log((good ? "  ok   " : "  FAIL ") + what); };'
    + 'E.offscreenCheck(process.pid, "case 29", check, notRun);'
    + 'console.log("LIST " + notRun.join("|"));'
    + 'console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);';

  let r = run(DRIVE('Object.defineProperty(process, "platform", { value: "linux" });'), {});
  ok(r.code === 0 && /^ {2}NOT RUN /m.test(r.out) && /#counts checks=0 failed=0 notRun=1/.test(r.out)
     && /LIST case 29's offscreen verdict/.test(r.out),
     "29a off Windows the verdict is one entry in notRun and no check at all, so the count a gate"
     + " declares falls by one and SAYS it fell: "
     + (/#counts.*/.exec(r.out) || ["(no counts line)"])[0]);

  /* THE CONTROL on win32, patched where this machine is not. What it asserts on both platforms
     is that the call was COUNTED as a check and added nothing to notRun; whether that check
     passes needs user32 and is asserted only where user32 is. */
  const WIN = process.platform === "win32";
  r = run(DRIVE(WIN ? "" : 'Object.defineProperty(process, "platform", { value: "win32" });'), {});
  ok(r.code === 0 && !/NOT RUN/.test(r.out) && /^LIST $/m.test(r.out)
     && /#counts checks=1 failed=[01] notRun=0/.test(r.out) && (!WIN || /failed=0/.test(r.out)),
     "29b THE CONTROL: the same call on win32 is a check and notRun stays empty, so 29a is the"
     + " platform and not a helper that counts nothing"
     + (WIN ? "" : " (on " + process.platform + " the check itself may fail, because the helper"
                   + " is user32 and there is none: what is asserted here is the COUNT)") + ": "
     + (/#counts.*/.exec(r.out) || ["(no counts line)"])[0]);
}

/* ---- 30: THE LINUX JOB AND WHAT IT SAYS IT DID NOT SEE, board item 629 ----------------------
 *
 * .github/workflows/gates.yml grew a second job on ubuntu-latest, and the whole risk of two
 * harnesses is one reader taking a green Linux run for a green run. The answer is a notice, and
 * a notice is a guard only while it arrives: printed by tests/test.js at its verdict, copied
 * into the job summary by tools/job-summary.mjs, which REFUSES when it is not there.
 *
 * So the cases below drive the real file rather than reading either of them as text. 30a runs
 * tests/test.js itself under a patched platform and reads its output back; 30c to 30e feed that
 * very output, and two mutations of it, to the real summary tool. A log written here by hand
 * would be this file's idea of what the suite prints, which is the oracle that cannot catch a
 * fault already in the artefact.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT, the same caveat as case 28: the branch is taken and
 * says what it says. A real ubuntu runner is the only thing that proves a real ubuntu runner.
 */
{
  /* TWO PATCHES RATHER THAN ONE, and the controls take the win32 one. Until 2026-09-20 a
     control here ran UNPATCHED and called that Windows, which is true on this desk and false on
     the runner: on ubuntu-latest 30b and 30f were the linux arm again, asserting what only a
     Windows run says, and they reddened the job for the platform rather than for a fault.
     `as` is "linux", "win32" or null for whatever this machine is. */
  const AS_FILE = {};
  for (const plat of ["linux", "win32"]) {
    AS_FILE[plat] = path.join(tmp, "as-" + plat + ".js");
    fs.writeFileSync(AS_FILE[plat],
      'Object.defineProperty(process, "platform", { value: ' + JSON.stringify(plat) + ' });\n');
  }
  /* -r rather than -e: the file under test must be the MAIN module or its verdict never runs.
     GITHUB_STEP_SUMMARY IS CLEARED, and that one line is the second cause of board item 427's
     red: on a runner the variable is in the environment, the child inherits it, and
     tools/job-summary.mjs then appends its summary to the runner's real summary file and prints
     nothing - so 30c read 0 notice lines off stdout and 30f read no NOT RUN, on Linux and on
     Windows alike. Measured on this desk on 2026-09-20 by setting the variable: the same two
     cases red, in the runner's own wording. */
  const drive = (args, as) => {
    const res = { out: "", code: 0 };
    try {
      res.out = execFileSync(process.execPath, (as ? ["-r", AS_FILE[as]] : []).concat(args), {
        cwd: E.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: Object.assign({}, process.env, { ETIUDA_FIXTURES: "", GITHUB_STEP_SUMMARY: "" }),
      });
    } catch (e) { res.code = e.status === undefined ? -1 : e.status; res.out = (e.stdout || "") + (e.stderr || ""); }
    return res;
  };
  const SUITE = path.join(E.ROOT, "tests", "test.js");
  const TOOL = path.join(E.ROOT, "tools", "job-summary.mjs");
  const ITEM = /^ {4}- \S/;

  const lin = drive([SUITE], "linux");
  const linItems = lin.out.split(/\r?\n/).filter(l => ITEM.test(l));
  /* -1 is less than everything, so the order is asked only of a notice that is THERE: a vacuous
     true beside a missing notice is the shape this whole block is against. */
  const atNotice = lin.out.indexOf("NOT WINDOWS (");
  const order = atNotice > -1 && atNotice < lin.out.indexOf("#counts")
    && lin.out.indexOf("#counts") < lin.out.indexOf("RESULT: ");
  ok(lin.code === 0 && /NOT WINDOWS \(linux\), .* did not look at 7 things:/.test(lin.out)
     && linItems.length === E.NOT_PROVED_OFF_WINDOWS.length && order,
     "30a the gate the Linux job actually runs says at its own verdict what it did not look at: "
     + "exit " + lin.code + ", " + linItems.length + " thing(s) of "
     + E.NOT_PROVED_OFF_WINDOWS.length + ", before #counts and before RESULT: " + order);

  /* 30b asks what the SUITE prints on Windows, and the only way to ask that is to be on
     Windows: the suite spawns children, and a child of a patched parent is not patched, so a
     win32 patch here would drive half a Windows run. Off Windows it is NOT RUN and says so, and
     the claim it carries - that the notice is the platform's and not printed at every verdict -
     is still controlled by 28f, which takes the notice's own function under a win32 patch. */
  if (process.platform === "win32") {
    const win = drive([SUITE], null);
    ok(win.code === 0 && !/NOT WINDOWS/.test(win.out)
       && win.out.split(/\r?\n/).filter(l => ITEM.test(l)).length === 0
       && /#counts legs=\d+ failed=0 /.test(win.out),
       "30b THE CONTROL: the same gate on Windows prints none of it, so 30a is the platform and"
       + " not a notice printed at every verdict - and the counts line is untouched");
  } else {
    skip("30b the same gate on Windows, which is the control for 30a, cannot be run on "
         + process.platform + ": the suite spawns children and a child of a patched parent is not"
         + " patched. 28f controls the same claim on both platforms, at the notice's own function");
  }

  const LOG = path.join(tmp, "test-linux.log");
  fs.writeFileSync(LOG, lin.out);
  let s = drive([TOOL, LOG], "linux");
  const carried = s.out.split(/\r?\n/).filter(l => /^ {2}- \S/.test(l));
  ok(s.code === 0 && carried.length === E.NOT_PROVED_OFF_WINDOWS.length
     && /What a run off Windows cannot prove/.test(s.out) && /NOT RUN/.test(s.out),
     "30c and the tool that writes the job summary carries all " + carried.length + " of them into"
     + " it, beside what stood down: exit " + s.code);

  /* THE MUTANT, and it is the one that matters: the notice stops being printed and the job is
     green with a summary that says nothing. */
  const STRIPPED = path.join(tmp, "test-linux-no-notice.log");
  fs.writeFileSync(STRIPPED, lin.out.split(/\r?\n/)
    .filter(l => !/NOT WINDOWS \(/.test(l) && !ITEM.test(l)).join("\n"));
  s = drive([TOOL, STRIPPED], "linux");
  ok(s.code === 1 && /no NOT WINDOWS notice/.test(s.out),
     "30d and a log off Windows with the notice taken out of it REFUSES rather than writing a"
     + " shorter summary, which is the mutant this exists for: exit " + s.code);

  const SHORT = path.join(tmp, "test-linux-short.log");
  const cut = lin.out.split(/\r?\n/);
  cut.splice(cut.findIndex(l => ITEM.test(l)), 1);
  fs.writeFileSync(SHORT, cut.join("\n"));
  s = drive([TOOL, SHORT], "linux");
  ok(s.code === 1 && /says 7 things and 6 line\(s\) follow/.test(s.out),
     "30e and a notice whose header outnumbers the lines under it refuses too, so the channel is"
     + " checked for truncation and not only for absence: exit " + s.code);

  /* THE CONTROL, and it is the very log 30d refuses: the same bytes, the same tool, the other
     platform. One thing differs between the two legs and it is the platform, which is what a
     control is for; the old pair differed in the log as well, and off Windows its "Windows log"
     was a Linux one, so it reddened the linux job for being Linux. */
  s = drive([TOOL, STRIPPED], "win32");
  const quiet = s.out.split(/\r?\n/).filter(l => /^::error/.test(l)).length;
  ok(s.code === 0 && !/What a run off Windows/.test(s.out) && /NOT RUN/.test(s.out) && quiet === 0,
     "30f THE CONTROL: the log 30d refuses, given to the same tool on win32, is a pass that asks"
     + " for no notice - so 30d and 30e are the missing notice and not a tool that refuses"
     + " everything - and a green log raises " + quiet + " annotation(s)");

  /* 30j: THE WHOLE CHAIN'S LOG, WHICH IS THE ONLY LOG THE RUNNER EVER HANDS THIS TOOL, and the
     fault run 39 found. Its linux job was green at `npm test` and red here with one annotation,
     "the notice says 7 things and 0 line(s) follow it" - while the notice and all seven of its
     lines sat in the log, intact, where tests/test.js printed them. `npm test` is 21 gates into
     one tee, and THIS file is the second of them: case 25b prints E.suiteVerdict's lines as
     JSON inside its own message, so off Windows a passing check 389 lines above the notice
     CONTAINS the notice's header. The tool matched that header anywhere in a line and took the
     first match, so it read a check's message for a verdict and counted the list under it, which
     is the next check. Every case above drives the tool against ONE gate's output, which is the
     only reason this lived: the shape the runner produces was never put in front of it.
     The fixture is that line, built out of the log's own notice so that it cannot drift away
     from the thing it imitates. */
  const chainLines = lin.out.split(/\r?\n/);
  const noticeAt = chainLines.findIndex(l => /NOT WINDOWS \(/.test(l));
  const quoted = "  ok   25b a run that reached the end with 44 of 107 checks has NO verdict, and"
    + " says how many never ran: exit 78, " + JSON.stringify(
      ["THE RUN IS NOT THE SUITE: 44 check(s) ran and 107 are declared. 63 never ran, so this"
        + " tally is not a verdict."]
        .concat(chainLines.slice(noticeAt, noticeAt + 1 + E.NOT_PROVED_OFF_WINDOWS.length)
          .map(l => l.replace(/^ {2}/, ""))));
  /* The fixture must BE the trap, or the leg passes for nothing: one line, carrying the header
     with its number, and not a line of its own. */
  const trap = noticeAt > -1 && quoted.split("\n").length === 1
    && /NOT WINDOWS \(linux\)/.test(quoted)
    && quoted.indexOf("did not look at " + E.NOT_PROVED_OFF_WINDOWS.length + " things:") > 0;
  const CHAIN = path.join(tmp, "test-linux-chain.log");
  fs.writeFileSync(CHAIN, quoted + "\n" + lin.out);
  s = drive([TOOL, CHAIN], "linux");
  const chainCarried = s.out.split(/\r?\n/).filter(l => /^ {2}- \S/.test(l)).length;
  ok(s.code === 0 && trap && chainCarried === E.NOT_PROVED_OFF_WINDOWS.length,
     "30j a log in which an earlier gate QUOTES the notice inside its own check message is read"
     + " at the notice and not at the quotation, which is what reddened run 39's linux job: exit "
     + s.code + ", " + chainCarried + " of " + E.NOT_PROVED_OFF_WINDOWS.length
     + " thing(s) carried, fixture is the trap: " + trap);

  /* 30k: AND A QUOTATION IS NOT A NOTICE. The same line over the log 30d refuses. The tool must
     refuse for the RIGHT reason - the notice is absent - rather than read a mention as a notice
     truncated to nothing. This is the leg that refuses the cheap fix: taking the LAST matching
     line instead of the first would still find the quotation here and still say the wrong thing. */
  const QUOTE_ONLY = path.join(tmp, "test-linux-quote-only.log");
  fs.writeFileSync(QUOTE_ONLY, quoted + "\n" + fs.readFileSync(STRIPPED, "utf8"));
  s = drive([TOOL, QUOTE_ONLY], "linux");
  ok(s.code === 1 && /no NOT WINDOWS notice/.test(s.out) && !/line\(s\) follow it/.test(s.out),
     "30k and a log whose only NOT WINDOWS is that quotation is refused as a notice that is"
     + " MISSING, not read as a notice with nothing under it: exit " + s.code);

  /* 30m THE MIRROR, on the platform whose arm is the other one: a win32 log that mentions the
     notice inside a message is not a Windows run carrying the notice, and must not redden the
     windows job for a sentence it printed about itself. */
  s = drive([TOOL, QUOTE_ONLY], "win32");
  const mirror = s.out.split(/\r?\n/).filter(l => /^::error/.test(l)).length;
  ok(s.code === 0 && mirror === 0 && !/What a run off Windows/.test(s.out),
     "30m THE MIRROR: the same quotation on win32 is not a Windows log carrying the off-Windows"
     + " notice: exit " + s.code + ", " + mirror + " annotation(s)");

  /* 30n: A CHECK THAT RAN IS NOT A STAND-DOWN. The first section of the summary is what a reader
     takes for the half nobody looked at, and it collected any line holding the words NOT RUN -
     including 28a and 28b above, two checks that RAN and passed, about the not-run channel. On
     the rehearsed chain log of 2026-09-20 that was 2 of its 6 lines. A line that opens with a
     check's own verdict is a check that ran; skip lines are left in, because a skipped check is
     exactly what this section is for. */
  const NOISY = path.join(tmp, "test-linux-noisy.log");
  const noise = "  ok   28a off Windows the offscreen verdict is NOT RUN rather than a failed"
    + " check, because the helper is PowerShell and user32: SKIPPED true OK false";
  fs.writeFileSync(NOISY, noise + "\n" + lin.out);
  s = drive([TOOL, NOISY], "linux");
  const stood = s.out.split(/\r?\n/).filter(l => /^- /.test(l) && l.indexOf("NOT RUN") > -1);
  const real = chainLines.filter(l => l.indexOf("NOT RUN") > -1 && !/^\s*(ok|FAIL)\b/.test(l));
  ok(s.code === 0 && noise.indexOf("NOT RUN") > -1 && real.length >= 3
     && stood.length === real.length && !stood.some(l => l.indexOf("28a") > -1),
     "30n a passing check that merely says the words is not listed among the things this run did"
     + " not check: " + stood.length + " stand-down line(s) for " + real.length + " in the log,"
     + " and the check line is " + (stood.some(l => l.indexOf("28a") > -1) ? "IN" : "out"));

  /* 30i: WHERE THE SUMMARY GOES, which is what bit the runner. The tool writes to the file the
     runner names and keeps stdout for the workflow commands; nothing had ever asserted it, so
     every case above read an empty stdout on a runner and this file could not tell that from a
     tool that had stopped writing anything at all. Driven with the variable pointed at a lab
     file, and it is the one case here that must NOT clear it. */
  {
    const SUMFILE = path.join(tmp, "step-summary.md");
    const res = { out: "", code: 0 };
    try {
      res.out = execFileSync(process.execPath, ["-r", AS_FILE.linux, TOOL, LOG], {
        cwd: E.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: Object.assign({}, process.env, { ETIUDA_FIXTURES: "", GITHUB_STEP_SUMMARY: SUMFILE }),
      });
    } catch (e) { res.code = e.status === undefined ? -1 : e.status; res.out = (e.stdout || "") + (e.stderr || ""); }
    const wrote = fs.existsSync(SUMFILE) ? fs.readFileSync(SUMFILE, "utf8") : "";
    const inFile = wrote.split(/\r?\n/).filter(l => /^ {2}- \S/.test(l)).length;
    const onOut = res.out.split(/\r?\n/).filter(l => /^ {2}- \S/.test(l)).length;
    ok(res.code === 0 && inFile === E.NOT_PROVED_OFF_WINDOWS.length && onOut === 0
       && /What a run off Windows cannot prove/.test(wrote),
       "30i and it writes that summary into the file GITHUB_STEP_SUMMARY names rather than to"
       + " stdout: " + inFile + " of " + E.NOT_PROVED_OFF_WINDOWS.length + " line(s) in the file,"
       + " " + onOut + " on stdout. Every case above clears that variable for the same reason -"
       + " on a runner it is set, a child inherits it, and the summary the case meant to read"
       + " goes to the job's own page instead");
  }

  /* Board item 427: a run on a runner has been red since 2026-09-18 and nobody here has read
     what it said, because the log needs a sign-in. An annotation does not, so every FAIL line is
     echoed as one, capped at the ten a step is shown. Driven against a log with twelve. */
  const REDLOG = path.join(tmp, "test-red.log");
  const red = [];
  for (let i = 1; i <= 12; i++) red.push("  FAIL " + i + "x an invented failing leg");
  /* A per cent sign in the first line, because a workflow command decodes one and this harness
     prints them: top-1 46%, coverage, the search evaluation's own lines. */
  red[0] = "  FAIL 1x an invented failing leg, top-1 46% of them";
  fs.writeFileSync(REDLOG, red.concat(["  FAIL: a section threw, which is the other spelling",
    "RESULT: FAIL"]).join("\n"));
  s = drive([TOOL, REDLOG], "win32");
  const notes = s.out.split(/\r?\n/).filter(l => /^::error title=gate failure::/.test(l));
  ok(notes.length === 11 && /13 lines of the log begin with FAIL/.test(s.out)
     && /::error title=gate failure::FAIL 1x an invented failing leg, top-1 46%25 of them$/
        .test(notes[0])
     && !/11x an invented/.test(s.out),
     "30h and every FAIL line of a red run is echoed as an ::error:: command, which comes back"
     + " from the public jobs endpoint where the log needs a sign-in: " + notes.length
     + " line(s) for 13 failures, ten of them quoted and the eleventh the count. Both spellings"
     + " of the word are counted, `FAIL ` and `FAIL:`");

  /* The workflow itself cannot be run here, so what is asserted is its SHAPE, read with the
     comment lines dropped - this file's own name and the tool's appear in that prose, and a
     leg that matched them would be green with both jobs deleted. */
  {
    const src = fs.readFileSync(path.join(E.ROOT, ".github", "workflows", "gates.yml"), "utf8")
      .split(/\r?\n/).filter(l => !/^\s*#/.test(l));
    const jobsAt = src.findIndex(l => /^jobs:\s*$/.test(l));
    const jobs = [];
    for (let i = jobsAt + 1; i < src.length && jobsAt > -1; i++) {
      const head = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(src[i]);
      if (head) jobs.push({ name: head[1], lines: [] });
      else if (jobs.length) jobs[jobs.length - 1].lines.push(src[i]);
    }
    const on = j => (j.lines.map(l => /^\s+runs-on:\s*(\S+)/.exec(l)).filter(Boolean)[0] || [])[1];
    const runs = j => j.lines.filter(l => /^\s+-?\s*run:\s/.test(l)).join(" | ");
    const platforms = jobs.map(on).sort().join(",");
    const summaries = jobs.filter(j => /tools\/job-summary\.mjs/.test(runs(j))).length;
    const suites = jobs.filter(j => /npm test/.test(runs(j))).length;
    /* The name list is the one thing that may never reach a runner, and the rule is written in
       that file's own header. A step that quietly added it is what this looks for. */
    const scan = src.filter(l => /pre-commit|etiuda-names|release\.mjs/.test(l));
    ok(jobs.length === 2 && platforms === "ubuntu-latest,windows-latest"
       && summaries === 2 && suites === 2 && scan.length === 0,
       "30g the workflow declares " + jobs.length + " job(s) on " + platforms + ", each running"
       + " the suite and each writing what it did not check into the summary (" + summaries
       + "), and no step of either names the hook, the name list or the release tool ("
       + scan.length + " line(s))");
  }
}

/* ---- 31: EVERY GATE IN tests/ RUNS IN A CHAIN, 2026-09-24 ------------------------------------
 *
 * tests/storage-carry.js had a script of its own in package.json, the workflow's header said it
 * "belongs to the desk and to tools/release.mjs", and nothing called it: not `npm test`, not the
 * split guard, not one gate of the release. The one-time carries a desk arrives with were proved
 * whenever somebody remembered to type its name. A script entry is a door, not a run.
 *
 * HOW REACH IS COUNTED, since a count without its method is an impression. The chains are the
 * two package.json scripts the gate runner and the workflow run, `test` and `split-guard`, and
 * every script tools/release.mjs calls: `npm('<name>')` or `run('npm', ['run', '<name>'` in its
 * code, read with its comments dropped, since a comment that says a gate's name is not a call.
 * A file is reached when `tests/<file>` appears in the command of one of those scripts. Every
 * .js and .mjs directly in tests/ must be reached or be named below with its reason, and a name
 * below that a chain has since reached is stale, so the list cannot rot in either direction. */
{
  const NOT_GATES = {
    "engine.js": "the library every gate requires, not a gate",
    "deadcode.js": "a report: a hit is a candidate to read, not a verdict; its scanner is held by tests/text-scan-selftest.js",
    "css-dead.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
    "ghosts.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
    "storage-keys.js": "a report, as deadcode.js; its scanner is held by tests/text-scan-selftest.js",
  };
  const CHAIN_SCRIPTS = ["test", "split-guard"];
  function reachOf(scripts, releaseSrc) {
    const code = releaseSrc.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/)
      .map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
    const called = new Set(CHAIN_SCRIPTS);
    let m;
    const byNpm = /\bnpm\(\s*'([A-Za-z0-9:_-]+)'\s*\)/g;
    while ((m = byNpm.exec(code))) called.add(m[1]);
    const byRun = /\brun\(\s*'npm'\s*,\s*\[\s*'run'\s*,\s*'([A-Za-z0-9:_-]+)'/g;
    while ((m = byRun.exec(code))) called.add(m[1]);
    const files = new Set();
    for (const name of called) {
      const cmd = scripts[name] || "";
      const re = /\btests\/([A-Za-z0-9_.-]+\.m?js)\b/g;
      while ((m = re.exec(cmd))) files.add(m[1]);
    }
    return { called: [...called].sort(), files };
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(E.ROOT, "package.json"), "utf8"));
  const releaseSrc = fs.readFileSync(path.join(E.ROOT, "tools", "release.mjs"), "utf8");
  const on = fs.readdirSync(path.join(E.ROOT, "tests")).filter(f => /\.m?js$/.test(f)).sort();
  const got = reachOf(pkg.scripts, releaseSrc);
  const unreached = on.filter(f => !got.files.has(f) && !(f in NOT_GATES));
  const stale = Object.keys(NOT_GATES).filter(f => got.files.has(f) || on.indexOf(f) < 0);
  ok(unreached.length === 0 && stale.length === 0 && got.files.size >= 20,
     "31a every gate in tests/ runs in a chain: " + got.files.size + " of " + on.length + " file(s)"
     + " reached from the scripts " + got.called.join(", ") + ", " + Object.keys(NOT_GATES).length
     + " named as not gates"
     + (unreached.length ? "; RUN BY NO CHAIN: " + unreached.join(", ") : "")
     + (stale.length ? "; named as not gates but reached or gone: " + stale.join(", ") : ""));

  /* THE CONTROL, a planted tree in miniature: a gate with a script of its own that nothing calls,
     one whose name the release mentions only in a comment, and one it calls. The first two must
     be unreached and the third reached, or 31a's silence would mean a reader that reaches all. */
  const plantScripts = { test: "node tests/a.js", orphan: "node tests/orphan.js",
                         quoted: "node tests/quoted.js", called: "node tests/called.js" };
  const plantRelease = [
    "/* the release calls npm('quoted') in prose only */",
    "gate('x', () => npm('called') ? true : 'no'); // npm('quoted') again, in a line comment",
  ].join("\n");
  const pr = reachOf(plantScripts, plantRelease);
  const want = ["a.js", "called.js"];
  ok(JSON.stringify([...pr.files].sort()) === JSON.stringify(want),
     "31b control: a gate whose script nothing calls, and one the release names only in comments,"
     + " are not reached; the one it calls is: " + JSON.stringify([...pr.files].sort()));
}

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(insideRepo, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed"
            + (skips ? ", " + skips + " skipped on " + process.platform : "")
            + (fails ? " - " + fails + " FAILED" : ""));
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exitCode = Math.min(fails, 63);
