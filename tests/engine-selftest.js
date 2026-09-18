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
    ok(!!stale && stale.alive === false && afterDeath.code === 0 && afterDeath.launched === true,
       "23c a lock whose holder is gone does not wedge the harness: the file is still there and"
       + " reads pid " + (stale ? stale.pid : "-") + ", alive " + (stale ? stale.alive : "-")
       + ", and the same launch goes through (exit " + afterDeath.code + ", marker "
       + afterDeath.launched + ")");

    const broke = run('const E = require("./engine.js"); const t = E.takeDeskLock("the-next-taker");'
      + 'console.log(JSON.stringify(t)); console.log("HOLDER " + JSON.stringify(E.deskLockHolder()));', {});
    ok(/was left behind by pid /.test(broke.out) && /breaking it/.test(broke.out)
       && /"took":true/.test(broke.out) && /the-next-taker/.test(broke.out),
       "23d and the next taker breaks it with a line saying so rather than silently: "
       + JSON.stringify((broke.out.match(/^ +the desk lock.*$/m) || ["no line"])[0].trim().slice(0, 120)));
    try { fs.rmSync(E.DESK_LOCK, { force: true }); } catch (x) { /* the taker above died holding it */ }
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

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(insideRepo, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed"
            + (skips ? ", " + skips + " skipped on " + process.platform : "")
            + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
