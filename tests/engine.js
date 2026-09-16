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
const { execFileSync } = require("child_process");

const NO_VERDICT = 78;
const ROOT = path.resolve(__dirname, "..");
const ENGINE_PATH = path.join(ROOT, "engine", "etiuda.html");

/* What each key is called IN THE FIXTURES FOLDER. Changing a key here changes what a caller
   asks for; changing a value changes which file on disk answers it. */
const FIXTURE_FILE = { catalog: "etiuda-catalog.js", sample: "sample-catalog.js",
                       catalogV2: "etiuda-catalog-v2.js", sampleV2: "sample-catalog-v2.js",
                       /* The same format 2 catalog as a DOCUMENT rather than a script. The shell
                          reads this shape out of the user-data folder, and a browser cannot load
                          it at all, so it is the shell's fixture and no browser leg asks for it. */
                       catalogEc: "etiuda-catalog.ec",
                       /* The sample as a document, which the watch test needs beside the one
                          above: two catalogs differing in how many cards they hold is what lets
                          a swap be counted rather than asserted. */
                       sampleEc: "sample-catalog.ec",
                       searchEval: "search-eval.js" };
/* And what it must be called BESIDE THE ENGINE, which the engine decides and will not
   tolerate being changed. The two differ because the fixtures folder holds the format 1 file
   and the format 2 file it was converted into, and only one of them is the one this engine
   reads. */
const SIBLING_AS = { catalogV2: "etiuda-catalog.js", sampleV2: "sample-catalog.js" };

/* A refusal is printed in the shape the smoke log already uses, so the same grep that counts
   failures counts this one, and the last line says in words that no verdict was reached. */
function refuse(reason, ...advice) {
  console.log("  FAIL " + reason);
  advice.forEach(l => console.log("       " + l));
  console.log("  SUITE DID NOT COMPLETE: " + reason);
  process.exit(NO_VERDICT);
}

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

/* THE CATALOG FOLDER IS A REAL FOLDER ON THIS MACHINE unless a launch is told otherwise. Since
   2026-09-15 the shell reads Documents/Etiuda before the user-data folder, and on a working desk
   that folder holds somebody's live catalog, so a test that launches the shell without pinning
   the setting is counting their cards and calling them the fixture's. Pinned through the
   PRODUCT's own route - the desk key Settings writes - so pinning it also exercises it. The
   folder is made, because a setting naming a folder that is not there falls through to the
   places below it and the pin would be silently undone. */
const CATALOG_FOLDER_KEY = "eCatalogFolder";
function pinCatalogFolder(userData, folder) {
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  const file = path.join(userData, "desk.json");
  let keys = {};
  try { const d = JSON.parse(fs.readFileSync(file, "utf8")); if (d && d.keys) keys = d.keys; } catch (e) { /* none yet */ }
  keys[CATALOG_FOLDER_KEY] = folder;
  fs.writeFileSync(file, JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "harness",
    saved: new Date().toISOString(), keys: keys }), "utf8");
  return folder;
}

function enginePath() {
  if (!fs.existsSync(ENGINE_PATH))
    refuse("the engine is not at engine/etiuda.html",
           "looked for " + ENGINE_PATH,
           "run this from a checkout of the 2.x repository.");
  return ENGINE_PATH;
}

function engineSource() { return fs.readFileSync(enginePath(), "utf8"); }

/* THE ARTEFACT IS GENERATED NOW, so a scan of its text is a scan of esbuild's reprint wherever
 * a region has moved into src/modules/. The reprint is faithful as a program and unfaithful as
 * text: a top-level `const` comes back as `var`, comments are gone, and a declaration's source
 * spelling is not preserved. Anything that reads the engine AS TEXT therefore reads the source,
 * and the two are tied together by spliceTie() below rather than by trust.
 *
 * sourceDoc() is the document as written: the template with the app script's anchor replaced by
 * the module sources and the monolith. Same shape as the artefact, same scans apply unchanged,
 * and at() turns an offset back into a file and a line so a failure names a file somebody can
 * open. The order is the bundle's: modules, then the entry, then what has not been extracted. */
const SRC_DIR = path.join(ROOT, "src");
const APP_ANCHOR = "/*@APP*/\n";

/* The monolith is gone from this tree since 2026-09-14, and this harness still has to read a
   fixture that has one: text-scan-selftest.js builds such a tree to prove a region is counted
   the same either side of a move. So its presence is asked, never assumed. */
function monolithFiles() {
  return fs.existsSync(path.join(SRC_DIR, "monolith.js")) ? ["src/monolith.js"] : [];
}

function sourceFiles() {
  const dir = path.join(SRC_DIR, "modules");
  const mods = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith(".js")).sort() : [];
  return mods.map(n => "src/modules/" + n).concat(["src/main.js"], monolithFiles());
}

function readSrc(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p))
    refuse("the engine's source is not at " + rel,
           "looked for " + p,
           "the harness reads the engine as text from src/, not from the built artefact.");
  return fs.readFileSync(p, "utf8");
}

/* The template split at its one anchor. Both halves reach the artefact byte for byte, which is
   what spliceTie() checks, so a CSS or markup claim is the same claim on either side. */
function templateParts() {
  const text = readSrc("src/template.html");
  const hits = text.split(APP_ANCHOR).length - 1;
  if (hits !== 1)
    refuse(APP_ANCHOR.trim() + " matched " + hits + " times in src/template.html, expected 1");
  const at = text.indexOf(APP_ANCHOR);
  return { head: text.slice(0, at), tail: text.slice(at + APP_ANCHOR.length) };
}

let SOURCE_DOC = null;
function sourceDoc() {
  if (SOURCE_DOC) return SOURCE_DOC;
  const { head, tail } = templateParts();
  const segs = [];
  let text = "";
  const push = (file, body, line0) => {
    segs.push({ file: file, start: text.length, end: text.length + body.length, line0: line0 });
    text += body;
  };
  push("src/template.html", head, 1);
  sourceFiles().forEach(rel => push(rel, readSrc(rel), 1));
  // The anchor occupies one line of the template, so the tail resumes two lines after the head.
  push("src/template.html", tail, head.split("\n").length + 1);
  const at = function (i) {
    const s = segs.find(g => i >= g.start && i < g.end) || segs[segs.length - 1];
    return s.file + ":" + (s.line0 + text.slice(s.start, Math.max(s.start, i)).split("\n").length - 1);
  };
  let starts = null;
  SOURCE_DOC = {
    text: text,
    files: ["src/template.html"].concat(sourceFiles()),
    at: at,
    /* A line number of the composite, for the scans that count lines rather than characters.
       1-based, as every line number a person reads is. */
    atLine: function (n) {
      if (!starts) { starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1); }
      return at(starts[Math.min(Math.max(n, 1), starts.length) - 1]);
    }
  };
  return SOURCE_DOC;
}

/* WHAT MAKES READING src/ HONEST. The artefact is head + bundle + tail, and both ends are
   copied in verbatim, so they can be proved equal by position in milliseconds.
   Only the bundle is generated, and the module banners esbuild writes above each module say
   which files went into it. What this does NOT prove is that the bundle is the build of those
   files as they stand: that is tests/build-fresh.mjs, which runs the real build and compares. */
function spliceTie() {
  const art = engineSource(), { head, tail } = templateParts();
  const mono = monolithFiles().length ? readSrc("src/monolith.js") : "";
  const problems = [];
  const REBUILD = "run `node tools/build.mjs`";
  if (!art.startsWith(head)) problems.push("the artefact does not open with src/template.html - " + REBUILD);
  if (!art.endsWith(tail)) problems.push("the artefact does not close with src/template.html - " + REBUILD);
  const monoStart = art.length - tail.length - mono.length;
  if (monoStart < head.length || art.slice(monoStart, monoStart + mono.length) !== mono)
    problems.push("src/monolith.js is not spliced verbatim into the artefact - " + REBUILD);
  if (problems.length) return { problems: problems, bundleBytes: 0, modules: [] };
  const bundle = art.slice(head.length, monoStart);
  const banners = (bundle.match(/^ *\/\/ (src\/\S+)$/gm) || []).map(l => l.replace(/^ *\/\/ /, ""));
  const want = sourceFiles().filter(f => f !== "src/monolith.js");
  const missing = want.filter(f => banners.indexOf(f) < 0);
  const extra = banners.filter(f => want.indexOf(f) < 0);
  missing.forEach(f => problems.push(f + " is in src/ and not in the bundle - " + REBUILD));
  extra.forEach(f => problems.push(f + " is in the bundle and not in src/ - " + REBUILD));
  /* TWO COUNTS, because esbuild writes its banner once per OUTPUT PART and a module that is
     emitted in two parts - hoisted function declarations apart from the rest, which is what
     the import ring produces - carries two. Measured 2026-09-14: 152 banner lines over 95
     files here, and 107 over 78 before the monolith went, so the line that printed banners
     and called them modules has always said a bigger number than it meant. `modules` stays
     the banner lines, because the set comparison above is written on them; `moduleFiles` is
     what a reader means by a module. */
  // Bytes, not code units, so this number and tools/build.mjs's own report are one measurement.
  return { problems: problems, bundleBytes: Buffer.byteLength(bundle, "utf8"), modules: banners,
           moduleFiles: [...new Set(banners)] };
}

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
  for (const k of keys) fs.copyFileSync(got[k], path.join(dir, SIBLING_AS[k] || FIXTURE_FILE[k]));
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

/* Removing a lab a browser was just using, which one rmSync cannot do.
 *
 * Windows keeps a handle on a Chromium profile for a moment after the process that held it is
 * gone, so `fs.rmSync(dir, {recursive:true, force:true})` throws EBUSY or EPERM, and the catch
 * that swallows it leaves the folder standing. Measured 2026-09-14: five throwaway Chromium
 * profiles from tests/csp.js and tests/desk.js sat in %TEMP% behind exactly that catch, at
 * 26 KB to 1.9 MB each. A cleanup that is not a check is not a cleanup.
 *
 * So: retry, and return whether the folder is actually gone, which is a verdict the caller can
 * turn into a check rather than a hope. The wait is synchronous on purpose - a finally that has
 * to run before process.exit() cannot await - and Atomics.wait is the only sleep node has that
 * does not need the event loop. Worst case here is tries * ms, 3 s at the defaults.
 *
 * AND GONE IS NOT THE SAME AS STAYS GONE. Measured 2026-09-14, four hours after the first half
 * of this was written: a csp lab was removed, the check said so and passed, and a folder of the
 * same name holding 13 profile files was in %TEMP% afterwards, its files written in the four
 * seconds AFTER the removal. taskkill /T takes the tree it can see; a Chromium helper that
 * outlives it by a moment writes its profile back, and a check taken at the instant of removal
 * reads true for a folder that is about to exist again. So the answer is not given until the
 * folder has been gone for `settle` ms, and if it comes back inside that window it is removed
 * again within the same try budget.
 *
 * Its control is case 19 of tests/engine-selftest.js, three arms: a folder another process is
 * standing in, which this must refuse; the same folder once that process is gone, which it must
 * remove; and a folder a process puts back after it is removed, which it must remove again
 * rather than report gone. THE FIRST ARM IS WINDOWS ONLY and skips elsewhere, because POSIX
 * removes a directory a live process is standing in and the arm would then pass having been
 * unable to fail; the other two run on every platform. */
function removeLab(dir, tries, ms, settle) {
  const gap = new Int32Array(new SharedArrayBuffer(4));
  const n = tries === undefined ? 12 : tries;
  const pause = t => Atomics.wait(gap, 0, 0, t);
  const wait = ms === undefined ? 250 : ms;
  const hold = settle === undefined ? 600 : settle;
  for (let i = 0; i < n; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) { /* the verdict is below */ }
    if (!fs.existsSync(dir)) {
      pause(hold);
      if (!fs.existsSync(dir)) return true;
      continue;   /* something put it back; it is not gone, it is between writes */
    }
    pause(wait);
  }
  return !fs.existsSync(dir);
}

/* ---- THE HARNESS'S OWN WINDOWS, board item 385 ---------------------------------------------
 *
 * A suite that launches the shell twenty-five times takes the screen twenty-five times from
 * whoever is at the desk. The shell honours ETIUDA_TEST_OFFSCREEN=1 by placing every window past
 * the far corner of every display, never showing it and never focusing it; nothing a customer
 * runs sets it. This is where the harness decides to set it, once, so that a driver cannot
 * quietly stop: every launch of the shell in tests/ goes through offscreenEnv().
 *
 * THE DEFAULT IS THE HARNESS'S, NOT THE ENVIRONMENT'S. offscreenEnv() writes the flag over
 * whatever the ambient environment says, so a run started from a shell that happens to carry it
 * proves nothing more than one started without. The five legs whose subject IS the window - the
 * frame inset, its variant control, the refusal window's caption, the two-window control 5f2
 * and 1g's own control - pass
 * ETIUDA_TEST_OFFSCREEN:"" explicitly and say why where they do it; a caller's value wins,
 * because the exception has to be written down at the launch it belongs to.
 */
const OFFSCREEN_KEY = "ETIUDA_TEST_OFFSCREEN";
function offscreenEnv(extra) {
  return Object.assign({}, process.env, { [OFFSCREEN_KEY]: "1" }, extra || {});
}

/* WHETHER A LAUNCH PUT A WINDOW ON SCREEN is not a question the page can answer: a renderer of a
 * window nobody showed still reports its own size, and whether a window has a frame is not in the
 * DOM at all. EnumWindows over the process's own visible top-level windows is the honest measure,
 * and the same helper answers both questions, so `topInset` here is what check 1c has always
 * read. The script is written beside the lab under a fixed name rather than into a fresh temp
 * folder, because %TEMP% on this machine has filled with labs from runs that were killed.
 *
 * `measured` is the difference between "no window" and "could not look", and the callers assert
 * it: a helper that cannot run must redden rather than read as a clean screen. */
const WIN_FACTS_PS1 = [
  "param([int]$TargetPid)",
  'Add-Type @"',
  "using System;",
  "using System.Runtime.InteropServices;",
  "public class W {",
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);',
  "  public delegate bool EnumProc(IntPtr h, IntPtr p);",
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);',
  '  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);',
  '  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);',
  "  [StructLayout(LayoutKind.Sequential)] public struct R { public int left, top, right, bottom; }",
  "  [StructLayout(LayoutKind.Sequential)] public struct P { public int x, y; }",
  "}",
  '"@',
  "$found = New-Object System.Collections.ArrayList",
  "$cb = [W+EnumProc]{",
  "  param($h, $p)",
  "  [uint32]$owner = 0",
  "  [void][W]::GetWindowThreadProcessId($h, [ref]$owner)",
  "  if ($owner -eq $TargetPid -and [W]::IsWindowVisible($h)) {",
  "    $wr = New-Object W+R; [void][W]::GetWindowRect($h, [ref]$wr)",
  "    $cr = New-Object W+R; [void][W]::GetClientRect($h, [ref]$cr)",
  "    $pt = New-Object W+P; $pt.x = 0; $pt.y = 0",
  "    [void][W]::ClientToScreen($h, [ref]$pt)",
  "    [void]$found.Add([pscustomobject]@{",
  "      winW = $wr.right - $wr.left; winH = $wr.bottom - $wr.top",
  "      cliW = $cr.right - $cr.left; cliH = $cr.bottom - $cr.top",
  "      topInset = $pt.y - $wr.top; leftInset = $pt.x - $wr.left",
  "      zoomed = [W]::IsZoomed($h)",
  "    })",
  "  }",
  "  return $true",
  "}",
  "[void][W]::EnumWindows($cb, [IntPtr]::Zero)",
  /* EVERY window, never one of them: which window a caller means is the caller's question and
     this script has no way to know it. Board item 414. */
  "$out = [ordered]@{ windows = $found.Count; all = @($found) }",
  "[pscustomobject]$out | ConvertTo-Json -Compress -Depth 4",
].join("\n");

/* WHICH OF THE WINDOWS IS THE ONE MEANT. Pure, exported and tested in engine-selftest.js, so the
 * rule can be put wrong deliberately without an Electron.
 *
 * `want` is a client rectangle in PHYSICAL pixels, which the caller has from the page it is
 * already driving: innerWidth times devicePixelRatio. That is a SHAPE the subject itself
 * answered for, so it survives a reorder of the window list, a second window of the same class
 * and a decoy larger than the subject - which is what the old rule, the largest by area, could
 * not: it picked whichever window was biggest and called it the app's.
 *
 * Two windows the same size is not a tie this can break, so it is a refusal and not a guess. */
function pickWindow(all, want) {
  const list = Array.isArray(all) ? all : (all ? [all] : []);
  if (!want) {
    const best = list.slice().sort((a, b) => (b.winW * b.winH) - (a.winW * a.winH))[0];
    return { picked: best || null, how: "largest by window area, no client size was asked for",
             candidates: list.length };
  }
  const tol = typeof want.tol === "number" ? want.tol : 2;
  const fits = list.filter(w => Math.abs(w.cliW - want.cliW) <= tol && Math.abs(w.cliH - want.cliH) <= tol);
  if (fits.length === 1) {
    return { picked: fits[0], candidates: list.length,
             how: "the one visible window whose client area is " + want.cliW + "x" + want.cliH
                  + " physical px, the page's own innerWidth x innerHeight x devicePixelRatio,"
                  + " of " + list.length + " visible window(s) of this pid" };
  }
  return { picked: null, candidates: list.length,
           how: (fits.length === 0 ? "no" : String(fits.length)) + " of " + list.length
                + " visible window(s) of this pid have a client area of " + want.cliW + "x"
                + want.cliH + " physical px within " + tol + " px; the client areas seen are "
                + JSON.stringify(list.map(w => w.cliW + "x" + w.cliH)) };
}

let winFactsFile = "";
/* `want` is optional and is `{ cliW, cliH, tol }` in physical pixels; see pickWindow. Without it
   the answer is the largest window, which is what every caller got before board item 414 and is
   right only where the process has one window. The caption is deliberately not read: a window
   title is text of the running product, and this helper's output is pasted into reports. */
function windowFacts(pid, want) {
  if (process.platform !== "win32") return { measured: false, why: "this helper is Win32 and this is " + process.platform };
  try {
    if (!winFactsFile) {
      winFactsFile = path.join(os.tmpdir(), "etiuda-window-facts.ps1");
      fs.writeFileSync(winFactsFile, WIN_FACTS_PS1, "utf8");
    }
    const out = execFileSync("powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", winFactsFile, "-TargetPid", String(pid)],
      { encoding: "utf8", windowsHide: true }).trim();
    const answer = JSON.parse(out || "{}");
    const facts = { measured: typeof answer.windows === "number", windows: answer.windows };
    if (!facts.measured) {
      facts.why = "the helper answered " + JSON.stringify(out.slice(0, 200));
      return facts;
    }
    /* PowerShell's ConvertTo-Json writes a one-element array as a bare object. */
    facts.all = Array.isArray(answer.all) ? answer.all : (answer.all ? [answer.all] : []);
    const chosen = pickWindow(facts.all, want);
    facts.how = chosen.how;
    if (chosen.picked) Object.assign(facts, chosen.picked);
    else if (want) {
      /* Could not look is not nothing there: the count stands, the rectangle does not. */
      facts.measured = false;
      facts.why = chosen.how;
    }
    return facts;
  } catch (e) {
    return { measured: false, why: String(e && e.message || e).split(/\r?\n/)[0] };
  }
}

/* The one sentence five drivers say about their own launches, written once so that five copies
   cannot drift. `who` names the driver, because the message is read in a log that holds several. */
function offscreenVerdict(pid, who) {
  const w = windowFacts(pid);
  const ok = w.measured === true && w.windows === 0;
  return { ok: ok, facts: w, what: who + " launches the shell under " + OFFSCREEN_KEY
    + "=1 and must put nothing on screen: "
    + (w.measured ? w.windows + " visible top-level window(s) for pid " + pid
                  : "NOT MEASURED, which is a failure and not a clean screen - " + w.why)
    + ". The separating control is shell-smoke 1g, where the same app with the variable cleared"
    + " answers one window" };
}

module.exports = { NO_VERDICT, ROOT, ENGINE_PATH, FIXTURE_FILE, SRC_DIR, APP_ANCHOR,
                   CATALOG_FOLDER_KEY, pinCatalogFolder, OFFSCREEN_KEY, offscreenEnv,
                   windowFacts, pickWindow, offscreenVerdict,
                   refuse, sha256, enginePath, engineSource, fixturesDir, fixtures, runFolder, browserPath, inside,
                   sourceFiles, readSrc, templateParts, sourceDoc, spliceTie, removeLab };
