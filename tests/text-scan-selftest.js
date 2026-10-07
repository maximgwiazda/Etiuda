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

  for (const f of ["engine.js", "i18n-scan.js", "css-dead.js", "ghosts.js", "storage-keys.js", "deadcode.js"])
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

/* A third reading, for i18n-scan's rule 5b alone: a synthetic document holding a two-line Polish
   table and copy returned by functions, an arrow with an expression body, an arrow with a block
   body, and a function named as the value. Invented words throughout. */
const ARROW_DOC = [
  "UI_STRINGS.pl={",
  '  "Kept one":"Jeden",',
  '  "Kept two; with a word":"Dwa",',
  "};",
  'const S=[{title:()=>c ? "Kept one" : "Drifted  one", body:()=>{ if(x==="no") return "Kept two; with a word"; return t("Kept one"); }, label:named}];',
  'function named(){ return c ? "Named one" : "Kept one"; }',
  ""
].join("\n");
PATCH.arrowbody = "const txt = " + JSON.stringify(ARROW_DOC) + ";\n"
  + "E.sourceDoc = () => ({ text: txt, files: ['synthetic'], at: () => 'synthetic:1', atLine: k => 'synthetic:' + k });";

/* A reading of files, for the scans that ask which file a name is declared in. Each part is
   [file, text]; at() answers the file of an offset, as the real sourceDoc() does. */
function filesPatch(parts) {
  return "const parts = " + JSON.stringify(parts) + ";\n"
    + "let txt = ''; const starts = [];\n"
    + "parts.forEach(p => { starts.push([txt.length, p[0]]); txt += p[1]; });\n"
    + "const at = i => { let f = starts[0]; starts.forEach(s => { if (i >= s[0]) f = s; });"
    + " return f[1] + ':' + txt.slice(f[0], i).split('\\n').length; };\n"
    + "E.sourceDoc = () => ({ text: txt, files: parts.map(p => p[0]), at: at, atLine: k => 'synthetic:' + k });";
}

/* css-dead.js: four classes reached only by a prefix written where a class is (a fragment and a
   value, a hyphen and a value, an interpolation), and three dead ones: a class that only LOOKS
   like a prefix's (pl-row closes before its ternary adds whole classes), a prefix written where no
   class is, and a class nobody names. The stylesheet sits past offset 1000, where the scan looks. */
const CSS_DOC = [
  "<!-- " + "x".repeat(1000) + " -->",
  "<style>",
  ".pq-c1{color:red} .pq-c2{color:red} .ps-on{color:red} .pt-x{color:red}",
  ".pl-row{color:red} .pl-open{color:red} .pl-row-open{color:red} .pk-gone{color:red} .pd-dead{color:red}",
  "</style>",
  "<script>",
  "function region(el,n,state,k,open,id){",
  "  el.innerHTML='<div class=\"pq pq-c'+n+'\"></div>';",
  "  el.classList.add(\"ps-\"+state);",
  "  el.innerHTML=`<i class=\"pt-${k}\"></i>`;",
  "  el.innerHTML='<p class=\"pl-row'+(open?\" pl-open\":\"\")+'\"></p>';",
  "  return \"pk-\"+id;",
  "}",
  "</script>",
  ""
].join("\n");
PATCH.cssbuilt = "const txt = " + JSON.stringify(CSS_DOC) + ";\n"
  + "E.sourceDoc = () => ({ text: txt, files: ['synthetic'], at: () => 'synthetic:1', atLine: k => 'synthetic:' + k });";

/* i18n-scan.js's orphans: one key a sink reads, two no rule reads but the code holds whole (a
   literal handed on by a variable, an attribute inside a literal), one held only inside a longer
   string, and one held nowhere but a comment. Invented words throughout. */
const ORPHAN_DOC = [
  "UI_STRINGS.pl={",
  '  "Found":"Jest",',
  '  "Planted whole":"Cale",',
  '  "Kept; in an attribute":"Atrybut",',
  '  "Planted part":"Czesc",',
  '  "Planted gone":"Brak",',
  "};",
  "/* \"Planted gone\" was here once. */",
  'const L="Planted whole"; toast(t(L)); toast(t("Found"));',
  "const B='<b title=\"Kept; in an attribute\">'+x+'</b>';",
  'const P="Planted part, and the rest of it";',
  ""
].join("\n");
PATCH.orphans = "const txt = " + JSON.stringify(ORPHAN_DOC) + ";\n"
  + "E.sourceDoc = () => ({ text: txt, files: ['synthetic'], at: () => 'synthetic:1', atLine: k => 'synthetic:' + k });";

/* deadcode.js: two live names reached only through a namespace and a spread, and three dead ones
   that look nearly alike: a member of a namespace bound to another file, a member of an object
   that is no namespace, and one nobody names. Invented names throughout. */
PATCH.deadns = filesPatch([
  ["src/modules/alpha.js", [
    "export function liveByNs(){ return 1; }",
    "function liveBySpread(){ return [1]; }",
    "export function useSpread(){ return Math.max(...liveBySpread()); }",
    "export function deadHere(){ return 2; }",
    "export function propOnly(){ return 3; }",
    ""].join("\n")],
  ["src/modules/beta.js", "export function shadowNs(){ return 4; }\n"],
  ["src/main.js", [
    'import * as alpha from "./modules/alpha.js";',
    'import * as beta from "./modules/beta.js";',
    "alpha.liveByNs(); alpha.useSpread(); alpha.shadowNs(); other.propOnly();",
    ""].join("\n")]
]);

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

  /* 26. COPY A FUNCTION RETURNS, 2026-09-28. The tour's customer step returns its title and body
     from a ternary, and until then no rule read them: a one-space drift in one of them left this
     scan complete and exit 0. Every returned whole value is read, as prose ("; with" included),
     and nothing merely compared ("no") or handed to a call other than a sink. */
  const ab = scan(roots.mod, "i18n-scan.js", "arrowbody", ["pl"]);
  const abMissing = ab.out.split("MISSING")[1] || "";
  ok(ab.code === 1 && /PL: 2\/4 /.test(ab.out) && /"Drifted  one":""/.test(abMissing) && /"Named one":""/.test(abMissing)
     && !/"no"/.test(abMissing) && !/Kept/.test(abMissing),
     "i18n-scan.js       reads copy a function returns, arrow or named, and nothing it only compares");

  /* 27. deadcode.js READS A NAMESPACE MEMBER AND A SPREAD AS USES, board 858. At 09fae6f 61 of its
     78 hits were live, 60 called as `ns.fn()` from boot() and one as `...hitRanges(`. The three
     dead names are the teeth: a scan that counted every name after a dot would lose them. */
  const dc = scan(roots.mod, "deadcode.js", "deadns", []);
  const dcDead = (dc.out.split("=== nothing references these ===")[1] || "").match(/^\s+\w+\s+(\w+)/gm) || [];
  const dcNames = dcDead.map(s => s.trim().split(/\s+/)[1]).sort().join(",");
  ok(dc.code === 0 && dcNames === "deadHere,propOnly,shadowNs",
     "deadcode.js        reads alpha.liveByNs() and ...liveBySpread() as uses, and still reports "
     + "a member of another namespace, of an object, and a name nobody calls: " + JSON.stringify(dcNames));

  /* 28. css-dead.js LISTS A CLASS BUILT BY CONCATENATION APART, board 858. At 09fae6f 5 of its 7
     dead classes were built so (`class="ed-c'+cols`, `class="ed-'+mine`). The three that stay dead
     are the teeth: a rule that took every fragment for a prefix would lose them. */
  const cs = scan(roots.mod, "css-dead.js", "cssbuilt", []);
  const section = title => ((cs.out.split(title)[1] || "").split("\n===")[0].match(/^  (\S+)/gm) || [])
    .map(s => s.trim()).sort().join(",");
  const csDead = section("=== classes styled but never mentioned outside the stylesheet");
  const csBuilt = section("=== classes styled and named only by a prefix built at run time");
  ok(cs.code === 0 && csDead === "pd-dead,pk-gone,pl-row-open" && csBuilt === "pq-c1,pq-c2,ps-on,pt-x",
     "css-dead.js        lists classes built from a prefix apart (" + csBuilt + ") and still calls "
     + "dead a look-alike, a prefix written where no class is, and an unnamed class (" + csDead + ")");

  /* 29. i18n-scan.js READS ITS ORPHANS A SECOND TIME, board 858. At 09fae6f it printed 227 in one
     list; 180 are held whole by the code, and the 42 lines found dead are all among the other 47.
     The key in a comment is the teeth: a reading that counted comments would call it held whole. */
  const orp = scan(roots.mod, "i18n-scan.js", "orphans", ["pl"]);
  const group = title => ((orp.out.split(title)[1] || "").split(/\n  [A-Z]/)[0].match(/^    - (.+)$/gm) || [])
    .map(s => s.slice(6)).sort().join("|");
  const orpWhole = group("ORPHANS FOUND WHOLE"), orpIn = group("ORPHANS FOUND INSIDE"), orpNone = group("ORPHANS FOUND NOWHERE");
  ok(orp.code === 0 && /PL: 1\/1 /.test(orp.out) && orpWhole === "Kept; in an attribute|Planted whole"
     && orpIn === "Planted part" && orpNone === "Planted gone",
     "i18n-scan.js       sorts its orphans: whole [" + orpWhole + "], inside a longer string [" + orpIn
     + "], nowhere but a comment [" + orpNone + "]");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("  " + (n - fails) + "/" + n + " cases passed" + (fails ? " - " + fails + " FAILED" : ""));
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exitCode = Math.min(fails, 63);
