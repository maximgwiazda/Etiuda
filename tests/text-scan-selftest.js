/* Proof that the text scans read the engine as it is WRITTEN, and go on counting a name after it
   moves into a module. Board item 253.

     node tests/text-scan-selftest.js

   Four scans read the engine as prose - i18n-scan.js, css-dead.js, ghosts.js, storage-keys.js -
   and until 2026-09-13 all four read engine/etiuda.html, which is esbuild's reprint of src/. The
   reprint is faithful as a program and unfaithful as text, so each of them grew quieter as
   extraction proceeded rather than louder. A gate that goes green because it can no longer see
   its subject is the failure this folder exists to prevent, so it is proved here by rejection
   rather than argued.

   THE METHOD. A toy tree is built twice from the SAME region text: once with the region at the
   end of src/monolith.js, once with the identical text moved into src/modules/region.js and
   imported. Both are built with the real esbuild options, tools/bundler-probe's, imported rather
   than restated. Each scan is then run over three readings of that tree:

     src        what the scans do now - E.sourceDoc(), the document as written
     artefact   what they did before  - engine/etiuda.html, esbuild's reprint
     nomodules  a doctored sourceDoc() with src/modules/ left out

   `src` must find the region in BOTH phases: that is the property. `nomodules` must find it in
   neither: that is what stops every one of these cases from being vacuous, because a scan that
   reported its needle whatever it was handed would pass the first set and fail this one. And
   `artefact` records what the old wiring actually did, which for ghosts.js is nothing at all.

   Exit code is the number of failed cases. Nothing here launches a browser or needs a fixture. */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

let fails = 0, n = 0;
const ok = (good, what) => { n++; console.log((good ? "  ok   " : "  FAIL ") + what); if (!good) fails++; };

const TESTS = __dirname;
const PROBE = path.join(TESTS, "..", "tools", "bundler-probe", "build.mjs");

/* THE REGION. One string, used verbatim in both phases, so the only difference between them is
   which file holds it. Each scan has exactly one needle in here:
     ghosts.js        the comment names ghostName, which no code has
     i18n-scan.js     the UI_STRINGS.pl table, and the t() sinks it is scored against
     css-dead.js      var(--region-only) is read here and defined in no stylesheet
     storage-keys.js  lsGet/lsSet on "pbThing", both on ONE source line, and a settings reset
                      with a DECOY array of "pb" keys standing ahead of it */
const REGION = [
  '/* The region. It mentions ghostName, which nothing declares. */',
  'UI_STRINGS.pl={',
  '  "Hello":"Czesc",',
  '  "Shaken":"Wstrzasniety"',
  '};',
  '/* THE DECOY. The first bracketed array of "pb" literals in the document, and not the reset:',
  '   the rule storage-keys.js carried until 2026-09-14 took this one and reported its length. */',
  'const DECOY_KEYS=["pbDecoyA","pbDecoyB","pbDecoyC","pbDecoyD"];',
  'function regionInit(){',
  '  document.body.classList.add("live-class");',
  '  document.body.style.background = "var(--region-only)";',
  '  toast(t("Hello"));',
  '  lsGet("pbThing"); lsSet("pbThing", 1);',
  '}',
  'function regionShaken(){ toast(t("Shaken")); }',
  '/* The named list. Deliberately NOT the first "pb" array in the document, and deliberately',
  '   deleting keys the decoy does not name, so the two rules give different answers. */',
  'function resetAllSettings(){',
  '  ["pbAlpha","pbBeta"].forEach(k=>{ try{ lsDel(k); }catch(e){} });',
  '  try{ nsDel("Gamma"); }catch(e){}',
  '}',
  'globalThis["regionShaken"] = regionShaken;',
  ''
].join("\n");

/* .live-class is mentioned only inside the region, so it is alive while the region is visible and
   dead the moment a reading cannot see it. .ghost-class is mentioned nowhere and is dead in every
   reading, which is the sound case: a scan that called everything alive would pass on live-class
   alone. --dead-prop is defined and never read. */
const TEMPLATE = [
  '<!doctype html>',
  '<html><head><style>',
  '.live-class{color:red}',
  '.ghost-class{color:blue}',
  ':root{--used-prop:1;--dead-prop:2}',
  '.x{color:var(--used-prop)}',
  '</style></head>',
  '<body><div id="aboutInfo">Hello world.</div>',
  '<script>',
  '/*@APP*/',
  '</script></body></html>',
  ''
].join("\n");

const PRELUDE = [
  'var UI_STRINGS = {};',
  'function t(s){ return s; }',
  'function toast(s){ return s; }',
  'function lsGet(k){ return localStorage.getItem(k); }',
  'function lsSet(k,v){ return localStorage.setItem(k,v); }',
  'function lsDel(k){ localStorage.removeItem(k); }',
  'function nsDel(k){ localStorage.removeItem(k); }',
  ''
].join("\n");

function buildTree(root, phase) {
  for (const d of ["src", path.join("src", "modules"), "engine", "tests"])
    fs.mkdirSync(path.join(root, d), { recursive: true });
  if (phase === "mono") {
    fs.writeFileSync(path.join(root, "src", "main.js"), "export const BUILT = 1;\n");
    fs.writeFileSync(path.join(root, "src", "monolith.js"), PRELUDE + REGION + "regionInit();\n");
  } else {
    fs.writeFileSync(path.join(root, "src", "modules", "region.js"),
                     REGION.replace("function regionInit(){", "export function regionInit(){"));
    fs.writeFileSync(path.join(root, "src", "main.js"),
                     'import { regionInit } from "./modules/region.js";\nObject.assign(globalThis, { regionInit });\n');
    fs.writeFileSync(path.join(root, "src", "monolith.js"), PRELUDE + "regionInit();\n");
  }
  fs.writeFileSync(path.join(root, "src", "template.html"), TEMPLATE);

  /* The build, with the project's own options rather than a second copy of them. A temp .mjs
     rather than node -e, because bundler-probe/build.mjs guards its main block on argv[1]. */
  const builder = path.join(root, "build-toy.mjs");
  fs.writeFileSync(builder, [
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    /* By absolute URL: the builder is written into the toy tree, which has no node_modules of
       its own, so a bare specifier would resolve from there and find nothing. */
    "import * as esbuild from " + JSON.stringify(url(require.resolve("esbuild"))) + ";",
    "import { OPTIONS } from " + JSON.stringify(url(PROBE)) + ";",
    "const ROOT = " + JSON.stringify(root) + ";",
    "const r = await esbuild.build({ ...OPTIONS, absWorkingDir: ROOT, entryPoints: [join(ROOT,'src','main.js')] });",
    "const tpl = readFileSync(join(ROOT,'src','template.html'),'utf8');",
    "const mono = readFileSync(join(ROOT,'src','monolith.js'),'utf8');",
    "writeFileSync(join(ROOT,'engine','etiuda.html'), tpl.split('/*@APP*/\\n').join(r.outputFiles[0].text + mono), 'utf8');"
  ].join("\n"));
  execFileSync(process.execPath, [builder], { cwd: TESTS, stdio: ["ignore", "pipe", "pipe"] });

  for (const f of ["engine.js", "i18n-scan.js", "css-dead.js", "ghosts.js", "storage-keys.js"])
    fs.copyFileSync(path.join(TESTS, f), path.join(root, "tests", f));
}

function url(p) { return "file:///" + path.resolve(p).split(path.sep).join("/"); }
function req(p) { return JSON.stringify(p.split(path.sep).join("/")); }

/* The two doctored readings. Each replaces sourceDoc() before the scan requires it, which works
   because a scan asks engine.js for the document at load and both share one require cache. */
const PATCH = {
  src: "",
  artefact: [
    "const art = E.engineSource();",
    "E.sourceDoc = () => ({ text: art, files: ['engine/etiuda.html'],",
    "  at: i => 'engine/etiuda.html:' + art.slice(0, i).split('\\n').length,",
    "  atLine: k => 'engine/etiuda.html:' + k });"
  ].join("\n"),
  nomodules: [
    "const p = E.templateParts();",
    "const txt = p.head + E.readSrc('src/main.js') + E.readSrc('src/monolith.js') + p.tail;",
    "E.sourceDoc = () => ({ text: txt, files: ['src/template.html','src/main.js','src/monolith.js'],",
    "  at: i => 'src/(modules omitted):' + txt.slice(0, i).split('\\n').length,",
    "  atLine: k => 'src/(modules omitted):' + k });"
  ].join("\n")
};

function scan(root, tool, reading, args) {
  const code = [
    "const E = require(" + req(path.join(root, "tests", "engine.js")) + ");",
    PATCH[reading],
    "process.argv = [process.argv[0], " + req(path.join(root, "tests", tool)) + "]"
      + (args || []).map(a => ".concat(" + JSON.stringify([a]) + ")").join("") + ";",
    "require(" + req(path.join(root, "tests", tool)) + ");"
  ].join("\n");
  try {
    return { out: execFileSync(process.execPath, ["-e", code],
             { cwd: path.join(root, "tests"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), code: 0 };
  } catch (e) {
    return { out: (e.stdout || "") + (e.stderr || ""), code: e.status === undefined ? -1 : e.status };
  }
}

/* What each scan must say when it can see the region, keyed by tool. `yes` is the needle, `no` is
   a second needle that must NOT be there, so a reading is wrong in both directions or right. */
const NEEDLE = {
  "ghosts.js":       { args: [],     yes: /\bghostName\b/,          no: null },
  "i18n-scan.js":    { args: ["pl"], yes: /PL: 2\/3 \(67%\)/,       no: /no UI_STRINGS/ },
  "css-dead.js":     { args: [],     yes: /--region-only/,          no: null },
  "storage-keys.js": { args: [],     yes: /^pbThing\s/m,            no: null }
};
const TOOLS = Object.keys(NEEDLE);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-textscan-"));
try {
  const roots = {};
  for (const phase of ["mono", "mod"]) {
    roots[phase] = path.join(tmp, phase);
    buildTree(roots[phase], phase);
  }

  /* 1 to 8. The property itself: the same region text, counted in both phases. */
  for (const phase of ["mono", "mod"]) {
    for (const tool of TOOLS) {
      const d = NEEDLE[tool], r = scan(roots[phase], tool, "src", d.args);
      ok(d.yes.test(r.out) && !(d.no && d.no.test(r.out)),
         tool.padEnd(16) + " counts the region with it in " + (phase === "mono" ? "src/monolith.js" : "src/modules/region.js"));
    }
  }

  /* 9 to 12. The teeth. Hand the same scan a document with src/modules/ left out and every one of
     those needles must go. Without this the eight cases above prove only that the scans print. */
  for (const tool of TOOLS) {
    const d = NEEDLE[tool], r = scan(roots.mod, tool, "nomodules", d.args);
    ok(!d.yes.test(r.out),
       tool.padEnd(16) + " loses the region when the reading omits src/modules/ - so case 5 to 8 has teeth");
  }

  /* 13 to 15. A finding names a file somebody can open and edit, which the artefact never could. */
  let r = scan(roots.mod, "ghosts.js", "src", []);
  ok(/src\/modules\/region\.js:\d+/.test(r.out), "ghosts.js          names src/modules/region.js and a line");
  r = scan(roots.mod, "storage-keys.js", "src", []);
  ok(/src\/modules\/region\.js:\d+/.test(r.out), "storage-keys.js    names src/modules/region.js and a line");
  r = scan(roots.mod, "css-dead.js", "src", []);
  ok(/src\/template\.html:\d+/.test(r.out), "css-dead.js        names src/template.html and a line");

  /* 16. THE HOLE THAT WAS OPEN. esbuild deletes every comment in every module, so ghosts.js read
     against the artefact is blind to the whole of src/modules/ - not quieter, blind. */
  const g = scan(roots.mod, "ghosts.js", "artefact", []);
  ok(!/\bghostName\b/.test(g.out),
     "ghosts.js          against engine/etiuda.html finds nothing: esbuild deleted the comment");

  /* 17. THE SECOND HOLE. The table's spelling is not preserved, and i18n-scan matched it
     literally, so an extraction turned the i18n gate into "No UI_STRINGS tables found", exit 0. */
  const art = fs.readFileSync(path.join(roots.mod, "engine", "etiuda.html"), "utf8");
  const srcHasTight = fs.readFileSync(path.join(roots.mod, "src", "modules", "region.js"), "utf8").includes("UI_STRINGS.pl={");
  ok(srcHasTight && !art.includes("UI_STRINGS.pl={") && /UI_STRINGS\.pl = \{/.test(art),
     "i18n-scan.js       the source says UI_STRINGS.pl={ and the artefact says UI_STRINGS.pl = {");

  /* 18. And the repair holds: the loose head still finds the table in either spelling. A parser
     that only worked on one of them is how the gate went quiet in the first place. */
  const i = scan(roots.mod, "i18n-scan.js", "artefact", ["pl"]);
  ok(/PL: \d+\/\d+/.test(i.out), "i18n-scan.js       finds the table in the reprinted spelling too");

  /* 19. Finding no table AT ALL is now a failure. It exited 0 until 2026-09-13. */
  const none = scan(roots.mod, "i18n-scan.js", "nomodules", []);
  ok(none.code === 1 && /FAIL no UI_STRINGS/.test(none.out),
     "i18n-scan.js       exits " + none.code + " when it can find no table at all");

  /* 20. What storage-keys.js lost was not a key but a place. One source line holding two calls
     comes back as two lines of the artefact, and neither of them is a line anyone can open. */
  const sk = scan(roots.mod, "storage-keys.js", "src", []);
  const ska = scan(roots.mod, "storage-keys.js", "artefact", []);
  const places = s => new Set((((s.match(/^pbThing\s.*$/m) || [""])[0]).match(/\S+:\d+/g) || [])).size;
  ok(places(sk.out) === 1 && places(ska.out) === 2,
     "storage-keys.js    one source line, " + places(sk.out) + " place in src/ and " + places(ska.out) + " in the artefact");

  /* 21. css-dead.js is the one that lost no finding: a class name is a string and the reprint
     keeps strings. It moved for the place, not for the count, and this records that - if the two
     readings ever stop agreeing, somebody should find out why before trusting either. */
  const cd = scan(roots.mod, "css-dead.js", "src", []);
  const cda = scan(roots.mod, "css-dead.js", "artefact", []);
  const findings = s => s.replace(/ +(src\/|engine\/)\S+/g, "").replace(/^selectors:.*$/m, "");
  ok(findings(cd.out) === findings(cda.out),
     "css-dead.js        finds the same names in src/ and in the artefact, positions aside");

  /* 22 and 23. THE RESET LIST IS FOUND BY NAME, NOT BY SHAPE. Board item 285. Until 2026-09-14
     storage-keys.js took the first bracketed array of "pb" literals anywhere in the document,
     which in the real tree is local-memory.js's E_PREF_KEYS - nineteen names belonging to a
     different button - and the reported count was out by eight. The region carries a decoy
     ahead of resetAllSettings() for exactly this, and it must be ignored in both phases. */
  for (const phase of ["mono", "mod"]) {
    const r = scan(roots[phase], "storage-keys.js", "src", []);
    const line = (r.out.match(/^settings reset covers .*$/m) || [""])[0];
    ok(/\bpbAlpha\b/.test(line) && /\bpbBeta\b/.test(line) && /\bns:Gamma\b/.test(line)
       && !/pbDecoy/.test(line) && /covers 3 key\(s\)/.test(line),
       "storage-keys.js    reads the reset out of resetAllSettings() in "
       + (phase === "mono" ? "src/monolith.js  " : "src/modules/region.js") + ", not the decoy above it");
  }

  /* 24. THE TEETH. The superseded rule, written out here as it stood at c21c55f, run over the
     same text: it picks the decoy. Without this, 22 and 23 prove only that the fixture has a
     reset list in it, not that the fixture can tell the two rules apart. */
  const regionFile = fs.readFileSync(path.join(roots.mod, "src", "modules", "region.js"), "utf8");
  const oldRule = regionFile.match(/\[\s*"pb[A-Za-z]+"(?:\s*,\s*"pb[A-Za-z]+")+\s*\]/);
  ok(!!oldRule && /pbDecoyA/.test(oldRule[0]) && !/pbAlpha/.test(oldRule[0]),
     "storage-keys.js    the superseded first-array rule picks the decoy on that same text");

  /* 25. And a reading that cannot see the name refuses out loud. The old rule printed nothing at
     all and exited 0, which is indistinguishable from an engine that has no settings reset. */
  const nk = scan(roots.mod, "storage-keys.js", "nomodules", []);
  ok(nk.code !== 0 && /settings reset: NOT READ/.test(nk.out),
     "storage-keys.js    refuses, exit " + nk.code + ", when resetAllSettings() is not in the reading");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed" + (fails ? " - " + fails + " FAILED" : ""));
process.exitCode = fails;
