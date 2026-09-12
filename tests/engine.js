/* Where the harness finds the engine, and where it finds the content it may not carry.
 *
 * Every script in this folder goes through here rather than resolving a path of its own. The
 * reason is board item 152: each of them used to read "Etiuda.html" from its own folder, and in
 * this repository that name belongs to the redirect stub, so a run reported green against a
 * 418-byte redirect. The engine has exactly one address and it is written down once, here.
 *
 * A catalog is somebody's content and this repository is public, so no fixture lives in the
 * tree. ETIUDA_FIXTURES names a folder outside it; the harness copies what it needs into a
 * temporary run folder, because the engine loads its catalog as a sibling of the HTML file.
 *
 * Exit code 78 means the harness could not produce a verdict. A completed smoke run exits with
 * the number of failed checks, so a verdict and a refusal must not share a number: 78 is
 * sysexits' EX_CONFIG and is out of that range.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");

const NO_VERDICT = 78;
const ROOT = path.resolve(__dirname, "..");
const ENGINE_PATH = path.join(ROOT, "engine", "etiuda.html");

/* The names the engine itself looks for as siblings, plus the case file test.js requires.
   Changing a key here changes what a caller asks for; changing a value changes what the engine
   would find on disk, which it will not tolerate. */
const FIXTURE_FILE = { catalog: "etiuda-catalog.js", sample: "sample-catalog.js", searchEval: "search-eval.js" };

/* A refusal is printed in the shape the smoke log already uses, so the same grep that counts
   failures counts this one, and the last line says in words that no verdict was reached. */
function refuse(reason, ...advice) {
  console.log("  FAIL " + reason);
  advice.forEach(l => console.log("       " + l));
  console.log("  SUITE DID NOT COMPLETE: " + reason);
  process.exit(NO_VERDICT);
}

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

function enginePath() {
  if (!fs.existsSync(ENGINE_PATH))
    refuse("the engine is not at engine/etiuda.html",
           "looked for " + ENGINE_PATH,
           "run this from a checkout of the 2.x repository.");
  return ENGINE_PATH;
}

function engineSource() { return fs.readFileSync(enginePath(), "utf8"); }

/* Windows compares paths case-insensitively and the filesystem may hand back a different case
   than the caller typed, so containment is decided on realpaths lowered on win32. */
function inside(parent, child) {
  const norm = p => { const r = fs.realpathSync(p); return process.platform === "win32" ? r.toLowerCase() : r; };
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function fixturesDir() { return process.env.ETIUDA_FIXTURES || ""; }

/* Resolve the fixtures folder or refuse. The containment check is the one that matters: a
   fixtures folder inside the tree puts a real catalog one `git add -f` from publication, and
   this repository's ignore rules are a blocklist that only a filename convention holds up. */
function fixtures(...keys) {
  const dir = fixturesDir();
  if (!dir)
    refuse("ETIUDA_FIXTURES is not set, and this run needs " + keys.join(", "),
           "point it at a folder OUTSIDE this repository holding: " + keys.map(k => FIXTURE_FILE[k]).join(", "),
           "a catalog is somebody's content and this repository is public.");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
    refuse("ETIUDA_FIXTURES is not a folder: " + dir);
  if (inside(ROOT, dir))
    refuse("ETIUDA_FIXTURES is inside this repository: " + dir,
           "the tree is public and its ignore file is a blocklist, so content kept here is one",
           "forced add from being published. Move the folder out of " + ROOT + ".");
  const out = {};
  for (const k of keys) {
    const name = FIXTURE_FILE[k];
    if (!name) refuse("no fixture is registered under the name " + JSON.stringify(k));
    const p = path.join(dir, name);
    if (!fs.existsSync(p))
      refuse("ETIUDA_FIXTURES has no " + name,
             "looked in " + dir,
             "without it this run would pass over checks rather than make them.");
    out[k] = p;
  }
  return out;
}

/* A run folder is a temp directory holding the engine under a plain name with its fixtures
   beside it, which is the only shape the engine boots in: it loads its catalog as a sibling.
   The caller removes it in a finally. Both digests are returned so a log names the bytes it
   judged rather than the path it read them from. */
function runFolder(...keys) {
  const src = enginePath(), got = fixtures(...keys);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-run-"));
  const page = path.join(dir, "etiuda.html");
  fs.copyFileSync(src, page);
  for (const k of keys) fs.copyFileSync(got[k], path.join(dir, FIXTURE_FILE[k]));
  return { dir, page, url: "file:///" + page.replace(/\\/g, "/"),
           engineSha: sha256(src), copySha: sha256(page),
           drop: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/* The browser is an installed one rather than a downloaded build, so its path is a property of
   the machine. The defaults are the stock install locations, not this desk's. */
const BROWSER_DEFAULT = {
  chrome: { win32: ["C:/Program Files/Google/Chrome/Application/chrome.exe",
                    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"],
            darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
            linux: ["/usr/bin/google-chrome", "/usr/bin/chromium"] },
  firefox: { win32: ["C:/Program Files/Mozilla Firefox/firefox.exe"],
             darwin: ["/Applications/Firefox.app/Contents/MacOS/firefox"],
             linux: ["/usr/bin/firefox"] }
};

function browserPath(which) {
  const env = which === "firefox" ? process.env.ETIUDA_FIREFOX : process.env.ETIUDA_CHROME;
  if (env) {
    if (!fs.existsSync(env)) refuse("the browser named in the environment is not there: " + env);
    return env;
  }
  const tried = (BROWSER_DEFAULT[which] || {})[process.platform] || [];
  const hit = tried.find(p => fs.existsSync(p));
  if (!hit)
    refuse("no " + which + " found to drive",
           "tried: " + (tried.join(", ") || "nothing is registered for " + process.platform),
           "set " + (which === "firefox" ? "ETIUDA_FIREFOX" : "ETIUDA_CHROME") + " to the executable.");
  return hit;
}

module.exports = { NO_VERDICT, ROOT, ENGINE_PATH, FIXTURE_FILE,
                   refuse, sha256, enginePath, engineSource, fixturesDir, fixtures, runFolder, browserPath, inside };
