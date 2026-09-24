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
 * sysexits' EX_CONFIG and is out of that range. THE COUNT IS CAPPED AT 63 by exitOf below,
 * ballot 4 of the fourth meeting (2026-09-23): a count of 78 used to read as NO VERDICT, and a
 * count of 256 as success, because bash and Linux read an exit code modulo 256.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const { execFileSync, spawn, spawnSync } = require("child_process");

const NO_VERDICT = 78;
/* A count as an exit code: 0 for none, else the count capped at 63, so that no count reads as
   success modulo 256 or as NO_VERDICT. See the head of this file. */
function exitOf(n) { return n > 0 ? Math.min(n, 63) : 0; }
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

/* ---- NO SUITE LAUNCHES THE SHELL ON THE REAL DESK, board item 467 ---------------------------
 *
 * On 2026-09-17 a run of tests/reinstall.js parked this machine's desk files aside and two of
 * them were back in the profile seconds later, written by another lab's launch; four electron
 * processes came and went in the same minute. Every launcher in this folder already aimed at a
 * folder of its own, and that is exactly why nothing caught the one that did not: the rule was
 * written down in five places and enforced in none.
 *
 * So every launch of the shell in tests/ goes through shellLaunch(), which refuses rather than
 * spawns, and the refusal names the caller because one log holds several of them.
 *
 * TWO FOLDERS ARE REQUIRED OF A LAUNCH and they are not the same folder:
 *
 *   - ITS OWN USER-DATA FOLDER. --user-data-dir pointed anywhere but this machine's own profile.
 *     Electron ignores APPDATA - measured 2026-09-14 - so the flag is the only way to move it.
 *   - ITS OWN CATALOG FOLDER, because since 2026-09-15 the shell reads the catalog folder BEFORE
 *     the user-data folder, and on a working desk that folder holds somebody's live catalog. A
 *     launch confines it either by the desk key, pinned through the product's own route with
 *     pinCatalogFolder, or by ETIUDA_TEST_DOCUMENTS, which moves the default somewhere that is
 *     not this person's Documents.
 *
 * TWO EXEMPTIONS EXIST AND BOTH ARE WRITTEN DOWN AT THE LAUNCH THEY BELONG TO, which is the rule
 * the offscreen flag's exceptions already follow. ownsDesk is tests/reinstall.js, whose subject
 * IS the real profile: it parks the desk files aside and drives the installed app on them.
 * realCatalogFolder is shell-smoke 2k, which asks what a first run with no setting does, and the
 * answer is this machine's Documents/Etiuda: a pin there would delete the question. Both are
 * counted by case 22 of tests/engine-selftest.js, so a third one cannot arrive quietly. Since
 * the desk lock below, ownsDesk is accepted only from a process that HOLDS that lock, so the
 * exemption cannot be taken beside another lab and cannot be taken quietly.
 */
const REAL_USER_DATA = (function () {
  const home = os.homedir();
  if (process.platform === "win32")
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "etiuda");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "etiuda");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "etiuda");
})();
/* THE DEFAULT DOCUMENTS FOLDER AS A GUESS, and it is only a guess: a desk whose Documents is
   redirected into OneDrive answers something else, and Electron asks the shell rather than the
   home directory. So this is the clause that catches a redirect pointed at the obvious wrong
   place, not a proof that the redirect is safe; the pin and the user-data folder are the two
   that hold. */
const REAL_DOCUMENTS = path.join(os.homedir(), "Documents");

/* path.relative over resolved paths, case-folded on win32, and deliberately WITHOUT realpath:
   inside() cannot answer for a folder that is not there yet, and a launch is judged before
   anything has been made. */
function underOrEqual(parent, child) {
  const norm = p => { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; };
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const UD_FLAG = "--user-data-dir=";
/* The LAST one, because that is which of two Chromium honours. */
function userDataDirOf(args) {
  const hit = (args || []).map(String).filter(a => a.indexOf(UD_FLAG) === 0).pop();
  return hit ? hit.slice(UD_FLAG.length).replace(/^"([\s\S]*)"$/, "$1") : "";
}

/* WHERE A LAUNCH WOULD LOOK FOR A CATALOG, and whether that is a folder of the harness's own.
   Answers a sentence either way, so the refusal and the log say the same thing. */
function catalogConfinement(ud, env) {
  const docs = (env || {})["ETIUDA_TEST_DOCUMENTS"] || "";
  if (docs) {
    if (!fs.existsSync(docs) || !fs.statSync(docs).isDirectory())
      return { ok: false, why: "ETIUDA_TEST_DOCUMENTS names " + docs + ", which is not a folder;"
        + " the shell makes it or falls back to the real Documents with a line on stderr" };
    if (underOrEqual(docs, REAL_DOCUMENTS) || underOrEqual(REAL_DOCUMENTS, docs))
      return { ok: false, why: "ETIUDA_TEST_DOCUMENTS names " + docs + ", which is this person's own"
        + " Documents (" + REAL_DOCUMENTS + ") or a folder holding it" };
    return { ok: true, how: "ETIUDA_TEST_DOCUMENTS puts the default catalog folder at "
      + path.join(docs, "Etiuda") };
  }
  const file = path.join(ud || REAL_USER_DATA, "desk.json");
  let pinned = "";
  try { pinned = ((JSON.parse(fs.readFileSync(file, "utf8")) || {}).keys || {})[CATALOG_FOLDER_KEY] || ""; }
  catch (e) { pinned = ""; }   /* no desk, or one nothing can read: either way nothing is pinned */
  if (!pinned)
    return { ok: false, why: "no " + CATALOG_FOLDER_KEY + " in " + file + " and no"
      + " ETIUDA_TEST_DOCUMENTS, so the shell would read this desk's own catalog folder" };
  if (!fs.existsSync(pinned) || !fs.statSync(pinned).isDirectory())
    return { ok: false, why: CATALOG_FOLDER_KEY + " in " + file + " names " + pinned + ", which is"
      + " not a folder: a setting naming a folder that is not there falls through to the places"
      + " below it and the pin is silently undone" };
  return { ok: true, how: CATALOG_FOLDER_KEY + " in " + file + " is pinned at " + pinned };
}

/* THE REFUSAL, SEPARATED FROM THE SPAWN, so that every one of these can be driven without an
   Electron and without a window: the selftest asserts the wording and the exit code, and its
   controls prove that nothing was spawned at all. Answers null where the launch is allowed, or
   the lines refuse() would print. */
function shellLaunchRefusal(who, args, options) {
  const opts = options || {};
  const ud = userDataDirOf(args);
  const env = opts.env || process.env;
  const held = deskLockHolder();
  if (held && held.alive && !held.mine)
    return [who + " would launch the shell while another run holds the desk: pid " + held.pid
              + ", " + held.who + ", since " + held.since,
            "that run has parked this machine's desk files aside and is driving the real profile,"
              + " so a launch now writes underneath it.",
            "wait for it; if it died the lock at " + DESK_LOCK + " is broken by the next taker."];
  if (opts.ownsDesk === true && !(held && held.mine))
    return [who + " declares ownsDesk and does not hold the desk lock",
            "the real profile is driven under E.takeDeskLock(), which is what tells the other labs"
              + " to stand off; nothing else may take that exemption.",
            held ? "the lock is pid " + held.pid + "'s (" + held.who + ")"
                 : "there is no lock at " + DESK_LOCK];
  if (!ud && opts.ownsDesk !== true)
    return [who + " would launch the shell with no " + UD_FLAG + ", which is this machine's own"
              + " profile: " + REAL_USER_DATA,
            "give the launch a user-data folder of its own; Electron ignores APPDATA, so the flag is"
              + " the only way to move it.",
            "board item 467: two labs on one desk wrote the real profile on 2026-09-17."];
  if (ud && (underOrEqual(REAL_USER_DATA, ud) || underOrEqual(ud, REAL_USER_DATA)))
    return [who + " would launch the shell with " + UD_FLAG + ud + ", which is this machine's own"
              + " profile: " + REAL_USER_DATA,
            "point it into a lab of this run's own.",
            "board item 467: two labs on one desk wrote the real profile on 2026-09-17."];
  /* THE ONE LEG WHOSE SUBJECT IS THE DEFAULT FOLDER. shell-smoke 2k asks what a first run with
     no setting does, and the answer is Documents/Etiuda on this machine; a pin would delete the
     question. So the exemption is a SENTENCE at the launch it belongs to, the same rule the
     offscreen flag's five exceptions follow, and it is printed, because a launch that reads this
     desk's own folder should be visible in the log of the run that did it. Case 22 of
     engine-selftest counts the declarations in tests/ and holds that count at one. */
  if (typeof opts.realCatalogFolder === "string" && opts.realCatalogFolder.length > 12) {
    console.log("       " + who + " launches on this desk's OWN catalog folder, declared: "
      + opts.realCatalogFolder);
    return null;
  }
  const cat = catalogConfinement(ud, env);
  if (!cat.ok)
    return [who + " would launch the shell with nothing confining the catalog folder: " + cat.why,
            "call E.pinCatalogFolder(userData, folder) before the launch, or hand it ETIUDA_TEST_DOCUMENTS.",
            "the shell reads the catalog folder BEFORE the user-data folder, so an unpinned launch"
              + " counts somebody's own cards as the fixture's."];
  return null;
}

/* The chokepoint. Same shape as child_process.spawn with a name in front, plus one option of its
   own, ownsDesk. A launcher that calls spawn directly is caught by case 22 of engine-selftest. */
function shellLaunch(who, exe, args, options) {
  const opts = Object.assign({}, options || {});
  delete opts.ownsDesk;
  delete opts.realCatalogFolder;
  const bad = shellLaunchRefusal(who, args, options);
  if (bad) refuse(bad[0], ...bad.slice(1));
  return spawn(exe, args, opts);
}

/* ---- THE DESK LOCK, the second half of board item 467 --------------------------------------
 *
 * tests/reinstall.js is the one instrument that borrows the real profile, and on 2026-09-17 it
 * was interrupted twice by launches from elsewhere on this desk. It has always had a lock, but
 * the lock lived inside the profile it was parking and only its own file read it, so it stopped
 * a second reinstall run and nothing else.
 *
 * This one sits under the scratch root, where every lab of every repository can see it, carries
 * the pid, the holder's name and the time, and is consulted by shellLaunch above. A lock whose
 * pid is gone is broken by the next taker with a line saying so, because a run that died holding
 * it must not wedge the harness until somebody deletes a file by hand.
 *
 * ITS ONE HOLE, written down rather than hidden: a pid can be recycled, and a recycled pid reads
 * as a live holder. The cost of that is a refusal nobody needed, which is the safe direction.
 */
const DESK_LOCK = path.join(os.tmpdir(), "etiuda-desk.lock");
/* A ZOMBIE IS NOT A HOLDER, board items 427 and 629. Signal 0 reaches a process that has
   exited and has not been reaped, so on POSIX a dead holder whose parent has not collected it
   reads as alive and the lock it left wedges every launch until somebody deletes a file - which
   is the thing this lock was built not to do. Measured on the first real Linux run of the gates
   on 2026-09-20: case 23c killed its holder, read `alive true` and the next taker refused to
   break the lock. Windows has no such state and its arm is unchanged.

   The state is field three of /proc/<pid>/stat, and field two is the command IN PARENTHESES and
   may hold spaces and brackets of its own, so it is read after the LAST ')', which is what the
   kernel's own documentation says to do. Where there is no /proc at all - macOS - the signal's
   answer stands and this is written down rather than hidden. */
function statIsZombie(text) {
  const close = String(text).lastIndexOf(")");
  if (close < 0) return false;
  return String(text).slice(close + 1).trim().charAt(0) === "Z";
}
function pidAlive(pid) {
  let answered = false;
  try { process.kill(pid, 0); answered = true; } catch (e) { answered = e.code === "EPERM"; }
  if (!answered || process.platform === "win32") return answered;
  try { return !statIsZombie(fs.readFileSync("/proc/" + pid + "/stat", "utf8")); }
  catch (e) {
    /* It went between the two reads; on a system with no /proc the signal is all there is. */
    if (e.code === "ENOENT" && fs.existsSync("/proc/self")) return false;
    return true;
  }
}
function readDeskLock() {
  try {
    const d = JSON.parse(fs.readFileSync(DESK_LOCK, "utf8"));
    return d && typeof d.pid === "number" ? d : null;
  } catch (e) { return null; }
}
/* null where no lock is held, otherwise what it says plus whether its holder is still there and
   whether it is this process's own. A lock is created and then written, two steps, so a reader
   can arrive between them: an unreadable file that exists is looked at once more before it is
   called rubbish. */
function deskLockHolder() {
  let d = readDeskLock();
  if (!d && fs.existsSync(DESK_LOCK)) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    d = readDeskLock();
    if (!d) return { pid: -1, who: "unreadable", since: "unknown", alive: false, mine: false };
  }
  if (!d) return null;
  return Object.assign({}, d, { alive: pidAlive(d.pid), mine: d.pid === process.pid });
}
function takeDeskLock(who) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(DESK_LOCK, "wx");
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, who: who,
                                          since: new Date().toISOString() }));
      } finally { fs.closeSync(fd); }
      return { ok: true, took: true, path: DESK_LOCK };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const held = deskLockHolder();
      if (held && held.mine) return { ok: true, took: false, path: DESK_LOCK, holder: held };
      if (held && held.alive) return { ok: false, path: DESK_LOCK, holder: held };
      console.log("       the desk lock at " + DESK_LOCK + " was left behind by "
        + (held ? "pid " + held.pid + " (" + held.who + ", taken " + held.since + "), which is gone"
                : "a run that wrote nothing readable, twice, 150 ms apart") + "; breaking it");
      try { fs.rmSync(DESK_LOCK, { force: true }); } catch (x) { /* the second attempt says so */ }
    }
  }
  return { ok: false, path: DESK_LOCK, holder: deskLockHolder(),
           why: "the lock could not be taken and could not be broken" };
}
function releaseDeskLock() {
  const held = deskLockHolder();
  if (!held) return { released: false, why: "no lock was held" };
  if (!held.mine) return { released: false, why: "the lock is pid " + held.pid + "'s, not this process's" };
  try { fs.rmSync(DESK_LOCK, { force: true }); } catch (e) { return { released: false, why: String(e && e.message || e) }; }
  return { released: true };
}

/* ---- THE LEASES THIS HARNESS DOES NOT OWN, board item 568 -----------------------------------
 *
 * The desk lock above is this harness's own, and it can only see other runs of this harness.
 * What actually collides on a working machine is wider: a run in another repository, a process
 * that is not a gate at all, and whoever is sitting at the desk. That bookkeeping lives outside
 * this tree and has to stay outside it, so what is written here is an INTERFACE and nothing more.
 *
 * ETIUDA_LEASE holds a command line. A gate that needs one of the things two runs cannot share
 * calls takeLeases, which runs
 *     <command> take <resource> <holder> <minutes>
 *     <command> release <resource> <holder>
 * and reads the exit code: 0 taken or released, anything else held by somebody else. The
 * resources are named here - "desk:profile", "desk:installed-app", "ports:<base>" - and what a
 * name means to whatever is on the other end is not this tree's business. ETIUDA_LEASE_HOLDER
 * names this run; the default carries the gate's own file name and pid, because two instances of
 * one gate are two holders.
 *
 * WHERE THE VARIABLE IS NOT SET A GATE RUNS EXACTLY AS IT DID, which is what a fresh clone and
 * anyone outside this company get. Where it IS set and cannot be run, the gate REFUSES: a guard
 * that cannot find what it needs says so rather than passing, and a lease bridge that silently
 * did nothing would be worse than none, since the brief that set the variable believes it.
 */
const LEASE_CMD = String(process.env.ETIUDA_LEASE || "").trim();
const LEASE_HOLDER = String(process.env.ETIUDA_LEASE_HOLDER || "").trim()
  || ("harness-" + path.basename(String(process.argv[1] || "run")).replace(/\.[^.]+$/, "")
      + "-" + process.pid);
const leasesHeld = [];

function leaseCall(verb, resource, minutes) {
  const parts = LEASE_CMD.split(/\s+/);
  const args = parts.slice(1).concat(verb === "take"
    ? [verb, resource, LEASE_HOLDER, String(minutes)]
    : [verb, resource, LEASE_HOLDER]);
  const r = spawnSync(parts[0], args, { encoding: "utf8", timeout: 30000, windowsHide: true });
  const said = (String(r.stdout || "") + String(r.stderr || "")).trim().split(/\r?\n/)
    .filter(Boolean).join("; ");
  return { ran: !r.error, status: r.status, said: said, why: r.error && String(r.error.message) };
}

/** Take every named lease, or refuse the gate. Returns what it did, so the gate can print it:
 *  a run that took nothing because nothing was asked of it must not read as a run that took
 *  everything. Released on exit rather than in a finally, because refuse() exits past one. */
function takeLeases(resources, minutes, who) {
  if (!LEASE_CMD) return { asked: false, held: [], said: "ETIUDA_LEASE is not set, so "
    + (who || "this gate") + " took no lease and shares this machine with whatever else is on it" };
  const said = [];
  for (const res of resources) {
    const r = leaseCall("take", res, minutes || 60);
    if (!r.ran) {
      releaseLeases();
      refuse("ETIUDA_LEASE is set and could not be run: " + JSON.stringify(LEASE_CMD),
        r.why || "no reason given",
        "the value is a command line, split on spaces and run without a shell; a path holding a"
        + " space cannot be expressed in it",
        "unset the variable to run this gate without leases at all");
    }
    if (r.status !== 0) {
      releaseLeases();
      refuse(res + " is held by another run, so " + (who || "this gate") + " did not start",
        r.said || "the lease command said nothing",
        "this is a refusal and not a failure: nothing about the product was measured");
    }
    leasesHeld.push(res);
    said.push(r.said || res + " taken");
  }
  return { asked: true, held: leasesHeld.slice(), said: said.join("; ") };
}

function releaseLeases() {
  const out = [];
  while (leasesHeld.length) {
    const res = leasesHeld.pop();
    if (LEASE_CMD) out.push(leaseCall("release", res).said || res);
  }
  return out;
}
process.on("exit", () => { releaseLeases(); });

/* ---- THE PORT MAP, board items 568 and 628 --------------------------------------------------
 *
 * A FIXED DEBUGGING PORT IS NOT A FAILED CONNECT. The second Electron logs "address in use" and
 * RUNS ON with no endpoint of its own, so puppeteer.connect reaches the FIRST run's window and
 * the driver measures another run's application. That is a green reading of the wrong thing
 * rather than a red, and it is the known signature of 2026-09-18's `caption undefined px`.
 *
 * ONE SHARED BASE CANNOT FIX IT, which is why 568 left four gates behind. If all five gates read
 * one absolute variable, every gate of one run would start from the same number and collide with
 * its NEIGHBOUR instead of with its twin. What moves a whole run out of another run's way is a
 * SHIFT added to each gate's own base. So the allocation lives here, in one table, and
 * ETIUDA_PORT_SHIFT is the only knob. It replaces ETIUDA_PORT_BASE, which moved one gate of five
 * and was therefore the same trap one level up; nothing outside this tree set it.
 *
 * THE TABLE IS CHECKED RATHER THAN TRUSTED, at every call, because a table is a place where two
 * numbers overlap silently. A gate whose block overlaps another's refuses, and a gate that is
 * not in the table refuses, so the next Electron gate cannot quietly pick a number the way these
 * five did. `size` is how many ports the gate may count up through from its base, not how many
 * it uses today: a gate that outgrows its block hits the overlap check rather than its neighbour.
 *
 * THE SHIFT IS 0 OR AT LEAST THE SPAN. A value in between would land one run's block inside
 * another run's, which is the fault wearing a different number, so it refuses.
 */
const PORT_BLOCKS = {
  "csp":           { base: 9420, size: 4 },    /* two launches: the lab and its stale-pin control */
  "desk":          { base: 9424, size: 4 },
  "catalog-watch": { base: 9428, size: 4 },
  "shell-smoke":   { base: 9460, size: 80 },   /* one port per launch of the shell, and it launches
                                                  it dozens of times; the run says at its end which
                                                  of the block it actually used */
  "reinstall":     { base: 9560, size: 40 },
};
const PORT_SHIFT_KEY = "ETIUDA_PORT_SHIFT";

/* The distance from the lowest port any gate may use to one past the highest. Derived rather
   than written down: a block added to the table moves it without anybody remembering to. */
function portSpan() {
  const names = Object.keys(PORT_BLOCKS);
  const lo = Math.min.apply(null, names.map(n => PORT_BLOCKS[n].base));
  const hi = Math.max.apply(null, names.map(n => PORT_BLOCKS[n].base + PORT_BLOCKS[n].size));
  return hi - lo;
}

/* Every pair, stated as the pair, so a refusal names the two gates and not just "an overlap". */
function portOverlaps() {
  const names = Object.keys(PORT_BLOCKS);
  const bad = [];
  const span = b => b.base + "-" + (b.base + b.size - 1);
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = PORT_BLOCKS[names[i]], b = PORT_BLOCKS[names[j]];
      if (a.base < b.base + b.size && b.base < a.base + a.size)
        bad.push(names[i] + " " + span(a) + " and " + names[j] + " " + span(b));
    }
  return bad;
}

/** The base this gate's launches count up from, after the run's shift. Refuses rather than
 *  returning a number nobody can trust. */
function portBlock(gate) {
  const block = PORT_BLOCKS[gate];
  if (!block)
    refuse("tests/engine.js has no port block called " + JSON.stringify(gate),
      "the blocks it does have: " + Object.keys(PORT_BLOCKS).join(", "),
      "a gate that drives Electron takes a block in the table rather than a number of its own,"
      + " because a number of its own is what two concurrent runs collide on");
  const clash = portOverlaps();
  if (clash.length)
    refuse(clash.length + " pair(s) of port blocks overlap in tests/engine.js: " + clash.join("; "),
      "two gates of ONE run would then reach each other's Electron, which no shift can separate",
      "widen the table rather than the blocks: the ports above 9600 are unused here");
  const raw = String(process.env[PORT_SHIFT_KEY] || "").trim();
  let shift = 0;
  if (raw) {
    if (!/^[0-9]+$/.test(raw))
      refuse(PORT_SHIFT_KEY + " is " + JSON.stringify(raw) + ", which is not a whole number",
        "a count of ports added to every gate's own base, so that two concurrent runs of this"
        + " harness do not share one Electron endpoint",
        "unset it to run this gate on the table's own numbers");
    shift = Number(raw);
    const span = portSpan();
    if (shift !== 0 && shift < span)
      refuse(PORT_SHIFT_KEY + " is " + shift + ", which is smaller than the map's span of " + span,
        "a shift below the span puts this run's block inside another run's, which is the"
        + " collision this exists to remove rather than a smaller version of it",
        "use 0 or at least " + span);
  }
  const base = block.base + shift;
  if (base + block.size - 1 > 65000)
    refuse(PORT_SHIFT_KEY + " is " + shift + ", which puts " + gate + "'s block at "
      + base + "-" + (base + block.size - 1) + ", past the last port this harness will use",
      "an integer from 1024 to 65000 is what a port is");
  return base;
}

/* KILLING A LAUNCH, board item 613, in one place rather than in six. `taskkill /F /PID n /T`
 * takes the tree Windows can see; off Windows there is no tree to ask for, because nothing here
 * spawns detached and a pid is not a process group, so this kills the process it was given and
 * says so. Electron's renderers go with their main process on both, which is what these gates
 * launch; a Chromium helper that outlives its parent is swept by the lab-process count in
 * shell-smoke, which is Windows anyway. Returns what it did, so a caller can say it. */
function killTree(pid) {
  if (!pid) return { killed: false, how: "no pid" };
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], { stdio: "ignore" });
      return { killed: true, how: "taskkill /F /T, the whole tree" };
    } catch (e) { return { killed: false, how: "taskkill said no: it had already gone" }; }
  }
  try { process.kill(pid, "SIGKILL"); return { killed: true, how: "SIGKILL to the one pid" }; }
  catch (e) { return { killed: false, how: "no such process: it had already gone" }; }
}

/* ---- the shortcuts a desk already has, parked like a desk ----------------------------------- */

/* BOARD ITEM 514, AND WHAT IT COST. The reinstall loop is the one instrument that runs the real
   NSIS installer against the real user's Desktop and Start Menu, and an installer writes its
   shortcut BY NAME: where one of that name is already there - which is every desk with the
   product installed - the install overwrites it and the uninstall deletes it, and what is missing
   at the end is the user's file rather than the run's. Measured on this desk on 2026-09-18 at
   04:21: the loop left no shortcut of the product's name on the Desktop or in the Start Menu, its
   one-entry-appeared check read zero added at both places (so it could not tell a shortcut that
   was never made from one that was already there), and the end-of-run check counted ADDITIONS
   only and stayed green while a file the run had destroyed was gone.

   So a shortcut gets what a desk file gets: renamed aside before the install, so the installer
   never meets one of its own name, and renamed back on the way out. The sha256 is taken at park
   time so the caller can assert the bytes that came back are the bytes that went in, rather than
   assert that a rename returned without throwing.

   `homes` is [{ what, tag, dir }]: `what` for the log, `tag` to keep two files of one name apart
   in the parking folder, `dir` the folder to take it from. Nothing here knows what a .lnk is; the
   name is handed in whole, because what the installer writes is the caller's question. */
function parkNamedShortcuts(homes, name, parkDir) {
  const parked = [];
  for (const home of homes || []) {
    const from = path.join(home.dir, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(parkDir, { recursive: true });
    const to = path.join(parkDir, home.tag + "-" + name);
    /* A rename rather than a copy, for the reason the desk files are renamed: it is atomic, and a
       shortcut that is moved cannot be half-copied. */
    fs.renameSync(from, to);
    parked.push({ what: home.what, tag: home.tag, from: from, to: to,
                  sha: crypto.createHash("sha256").update(fs.readFileSync(to)).digest("hex") });
  }
  return parked;
}

/* Puts back what parkNamedShortcuts took, and removes whatever is standing at the original path
   first: the user's copy is the one in hand, so a file of that name there now is the run's own,
   left by an install whose uninstall did not take it. One row per parked file, each carrying the
   sha256 of the bytes that are there at the end, so the caller asserts the restore. */
function restoreNamedShortcuts(parked) {
  const out = [];
  for (const p of parked || []) {
    const row = { what: p.what, from: p.from, back: false, same: false, tookRunsOwn: false, sha: null, why: null };
    try {
      if (fs.existsSync(p.from)) { fs.rmSync(p.from, { force: true }); row.tookRunsOwn = true; }
      fs.renameSync(p.to, p.from);
      row.back = fs.existsSync(p.from);
      if (row.back) {
        row.sha = crypto.createHash("sha256").update(fs.readFileSync(p.from)).digest("hex");
        row.same = row.sha === p.sha;
      }
    } catch (e) { row.why = String(e && e.message || e); }
    out.push(row);
  }
  return out;
}

/* ---- what the installer and the app will call the desk's folders, asked of Windows ------------
 *
 * MEASURED 2026-09-24, and it is why a "scratch profile" made of two variables is not one. NSIS
 * (electron-builder's own makensis 3.0.4.1, a probe writing $LOCALAPPDATA, $APPDATA, $DESKTOP and
 * $SMPROGRAMS) and Electron 44 (app.getPath appData, desktop, documents) both resolve the desk's
 * folders through the shell, which follows USERPROFILE and IGNORES the APPDATA and LOCALAPPDATA
 * variables. With those two pointed at a temp folder both still answered the real Roaming,
 * Local, Desktop and Start Menu; with USERPROFILE pointed there too, both answered the temp
 * home. [Environment]::GetFolderPath gave exactly NSIS's answer in all three environments, so
 * it is the question asked here.
 *
 * So a harness file that derives these paths from the environment and then runs the installer
 * or the app parks one folder while the product writes another. placesMismatch() is how such a
 * file refuses first: `expect` maps a shell folder name to the path the file itself will act
 * on, and every disagreement comes back as a sentence. Windows only; elsewhere there is no shell
 * to ask and the answer is empty. */
const SHELL_FOLDERS = ["LocalApplicationData", "ApplicationData", "Desktop", "Programs"];
function shellFolders(env) {
  if (process.platform !== "win32") return {};
  const out = String(execFileSync("powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command",
     "foreach ($n in '" + SHELL_FOLDERS.join("','") + "') { $n + [char]9 + [Environment]::GetFolderPath($n) }"],
    { encoding: "utf8", windowsHide: true, timeout: 60000, env: env || process.env }));
  const map = {};
  for (const line of out.split(/\r?\n/)) {
    const at = line.indexOf("\t");
    if (at > 0) map[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return map;
}
function placesMismatch(expect, env) {
  const shell = shellFolders(env);
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  const said = [];
  for (const name of Object.keys(expect || {})) {
    if (!shell[name]) said.push("Windows gave no " + name + " folder");
    else if (!expect[name] || !same(expect[name], shell[name]))
      said.push("this run would act on " + expect[name] + " as " + name + ", but Windows, and so the"
        + " installer and the app, answer " + shell[name]);
  }
  return { shell, said };
}

/* ---- a file the run did not write, kept rather than deleted ---------------------------------
 *
 * THE ENVELOPE, board carve A of 2026-09-24. The reinstall loop's 0a found a desk.json in the
 * real profile seconds after parking it, on two days, and its way out deleted the file having
 * logged only the name, so nobody knows what wrote it. The shell writes the envelope itself
 * (shell/main.js deskEnvelopeBody): `app` is the writing build's version, or "harness" where a
 * harness file wrote it, and `saved` is when. So those are read and printed, with the size, the
 * modification time and the NAMES of the keys - never a value, since a desk may hold a catalog.
 * A catalog file (.ec) is somebody's content and is not opened at all: size and date only. */
function deskEnvelope(file) {
  const out = { name: path.basename(file), bytes: null, mtime: null };
  let st;
  try { st = fs.statSync(file); } catch (e) { out.why = "gone before it could be read (" + (e && e.code) + ")"; return out; }
  out.mtime = st.mtime.toISOString();
  if (st.isDirectory()) { out.bytes = "a folder"; return out; }
  out.bytes = st.size;
  if (!/\.json(\.tmp)?$/i.test(out.name)) return out;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const k of ["kind", "schema", "app", "saved", "desk"]) if (d && k in d) out[k] = d[k];
    out.keys = d && d.keys && typeof d.keys === "object" ? Object.keys(d.keys).sort() : null;
    out.also = d && typeof d === "object"
      ? Object.keys(d).filter(k => ["kind", "schema", "app", "saved", "desk", "keys"].indexOf(k) < 0).sort() : [];
  } catch (e) { out.why = "not a JSON document: " + String(e && e.message || e).slice(0, 80); }
  return out;
}
function envelopeLine(e) {
  const bits = [e.name, e.bytes === "a folder" ? "a folder" : e.bytes + " bytes", "modified " + e.mtime];
  if ("app" in e) bits.push("app " + JSON.stringify(e.app));
  if ("saved" in e) bits.push("saved " + JSON.stringify(e.saved));
  if ("desk" in e) bits.push("desk " + JSON.stringify(e.desk));
  if ("kind" in e) bits.push("kind " + JSON.stringify(e.kind));
  if (e.keys) bits.push(e.keys.length + " key(s): " + e.keys.join(", "));
  if (e.also && e.also.length) bits.push("also " + e.also.join(", "));
  if (e.why) bits.push(e.why);
  return bits.join(", ");
}

/* KEEPS EACH FILE, BY RENAME, IN `toDir`, AND NEVER DELETES ONE. A name already there gets a
   numbered twin rather than being written over, because renameSync replaces an existing file on
   Windows without a word. Each row carries the sha256 before and after, so the caller asserts that
   what was kept is what was found. `toDir` should be on the same volume as the files, which a
   folder beside them always is: a rename across volumes fails, and a failed row says so and
   leaves the file where it was. */
function keepAside(files, toDir) {
  const rows = [];
  for (const from of files || []) {
    const row = { from: from, to: null, moved: false, sha: null, same: null, why: null };
    try {
      const st = fs.statSync(from);
      if (st.isFile()) row.sha = sha256(from);
      fs.mkdirSync(toDir, { recursive: true });
      let to = path.join(toDir, path.basename(from));
      for (let n = 2; fs.existsSync(to); n++) to = path.join(toDir, path.basename(from) + "." + n);
      fs.renameSync(from, to);
      row.to = to;
      row.moved = !fs.existsSync(from) && fs.existsSync(to);
      if (row.sha) row.same = sha256(to) === row.sha;
    } catch (e) { row.why = String(e && e.message || e); }
    rows.push(row);
  }
  return rows;
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
 * proves nothing more than one started without. A caller's value wins, because an exception has
 * to be written down at the launch it belongs to.
 *
 * THE FLAG HAS THREE VALUES SINCE BOARD ITEM 537, and the middle one is why a seat can run
 * shell-smoke while somebody is at the desk:
 *   1  placed past the far corner of every display and never shown. The default here.
 *   2  the same placement, shown WITHOUT focus. A window with a frame, a client area and a
 *      rectangle to measure, on no display. The five legs whose subject IS the window - the
 *      frame inset, its variant control, the refusal window's caption, the two-window control
 *      5f2 and 1a's own launch - take this, where they used to clear the flag and put a real
 *      window on whoever's screen it was.
 *   "" an ordinary launch. Exactly ONE leg still asks for it, shell-smoke 1g3, because proving
 *      that value 2 is a placement rather than a shell which stopped showing windows is that
 *      leg's whole subject and cannot be done without a window on a display.
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
  '  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc cb, IntPtr p);',
  "  public delegate bool MonProc(IntPtr h, IntPtr dc, IntPtr r, IntPtr p);",
  "  [StructLayout(LayoutKind.Sequential)] public struct R { public int left, top, right, bottom; }",
  "  [StructLayout(LayoutKind.Sequential)] public struct P { public int x, y; }",
  "}",
  '"@',
  /* THE DISPLAYS FIRST, because whether a window is ON one is answered by its RECTANGLE and by
     nothing else, board item 537. MonitorFromWindow answers the primary monitor for a minimised
     window parked at -25600,-25600 even under MONITOR_DEFAULTTONULL, measured over 569 samples
     with one disagreement and it was that one. EnumDisplayMonitors answers in GetWindowRect's
     own coordinates, so this process's DPI awareness moves both sides together and no scale
     factor enters the comparison. The monitor rectangle arrives as a pointer rather than a ref
     struct: a scriptblock delegate with a by-ref parameter is where this binding goes wrong. */
  "$mons = New-Object System.Collections.ArrayList",
  "$mcb = [W+MonProc]{",
  "  param($h, $dc, $r, $p)",
  "  $m = [System.Runtime.InteropServices.Marshal]::PtrToStructure($r, [type]('W+R'))",
  "  [void]$mons.Add($m)",
  "  return $true",
  "}",
  "[void][W]::EnumDisplayMonitors([IntPtr]::Zero, [IntPtr]::Zero, $mcb, [IntPtr]::Zero)",
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
  "    $on = $false",
  "    foreach ($m in $mons) {",
  "      if ($wr.left -lt $m.right -and $wr.right -gt $m.left -and",
  "          $wr.top -lt $m.bottom -and $wr.bottom -gt $m.top) { $on = $true } }",
  "    [void]$found.Add([pscustomobject]@{",
  "      winW = $wr.right - $wr.left; winH = $wr.bottom - $wr.top",
  "      cliW = $cr.right - $cr.left; cliH = $cr.bottom - $cr.top",
  "      topInset = $pt.y - $wr.top; leftInset = $pt.x - $wr.left",
  "      left = $wr.left; top = $wr.top",
  "      onDisplay = $on",
  "      zoomed = [W]::IsZoomed($h)",
  "    })",
  "  }",
  "  return $true",
  "}",
  "[void][W]::EnumWindows($cb, [IntPtr]::Zero)",
  /* EVERY window, never one of them: which window a caller means is the caller's question and
     this script has no way to know it. Board item 414. */
  "$out = [ordered]@{ windows = $found.Count; all = @($found);",
  "  windowsOnDisplay = @($found | Where-Object { $_.onDisplay }).Count;",
  "  displays = @($mons | ForEach-Object { '' + $_.left + ',' + $_.top + ' ' + ($_.right - $_.left) + 'x' + ($_.bottom - $_.top) }) }",
  "[pscustomobject]$out | ConvertTo-Json -Compress -Depth 4",
].join("\n");

/* WHICH OF THE WINDOWS IS THE ONE MEANT. Pure, exported and tested in engine-selftest.js, so the
 * rule can be put wrong deliberately without an Electron.
 *
 * `want` is the page's own box, `{ cssW, cssH, dpr }`, which the caller has from the page it is
 * already driving. That is a SHAPE the subject itself answered for, so it survives a reorder of
 * the window list, a second window of the same class and a decoy larger than the subject - which
 * is what the old rule, the largest by area, could not: it picked whichever window was biggest
 * and called it the app's.
 *
 * THE UNITS ARE NOT ASSUMED, THEY ARE TRIED. What GetClientRect answers in is a property of the
 * desk, not of this harness: on the desk this was written on, at a scale factor of 1.25, the
 * client rectangle came back as 1280x881 for a page reporting 1282x882 CSS px, so the Win32
 * numbers were CSS pixels and a rule multiplying by the ratio missed by 320 px and reddened four
 * legs. On a desk where they are physical pixels the same page would answer 1603x1103. Both
 * scales are therefore tried and the one that matched is named in `how`, because a measurement
 * that silently picks between two conversions is a measurement nobody can check. A decoy would
 * have to wear one of the two sizes to be picked, and the tolerance is four pixels.
 *
 * Two windows the same size is not a tie this can break, so it is a refusal and not a guess. */
function pickWindow(all, want) {
  const list = Array.isArray(all) ? all : (all ? [all] : []);
  if (!want) {
    const best = list.slice().sort((a, b) => (b.winW * b.winH) - (a.winW * a.winH))[0];
    return { picked: best || null, how: "largest by window area, no client size was asked for",
             candidates: list.length };
  }
  const tol = typeof want.tol === "number" ? want.tol : 4;
  const dpr = typeof want.dpr === "number" && want.dpr > 0 ? want.dpr : 1;
  const scales = dpr === 1 ? [1] : [1, dpr];
  const at = (w, s) => Math.abs(w.cliW - want.cssW * s) <= tol && Math.abs(w.cliH - want.cssH * s) <= tol;
  const hit = [];
  for (const w of list) {
    const s = scales.filter(s2 => at(w, s2))[0];
    if (s !== undefined) hit.push({ w: w, scale: s });
  }
  const asked = "the page's own " + want.cssW + "x" + want.cssH + " CSS px at scale "
                + scales.join(" or ") + ", within " + tol + " px";
  if (hit.length === 1) {
    return { picked: hit[0].w, candidates: list.length, scale: hit[0].scale,
             how: "the one visible window of " + list.length + " whose client area, "
                  + hit[0].w.cliW + "x" + hit[0].w.cliH + ", is " + asked
                  + " (it matched at scale " + hit[0].scale + ")" };
  }
  return { picked: null, candidates: list.length,
           how: (hit.length === 0 ? "no" : String(hit.length)) + " of " + list.length
                + " visible window(s) of this pid have a client area of " + asked
                + "; the client areas seen are " + JSON.stringify(list.map(w => w.cliW + "x" + w.cliH)) };
}

let winFactsFile = "";
/* `want` is optional and is `{ cssW, cssH, dpr }`, the page's own box; see pickWindow. Without it
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
    const facts = { measured: typeof answer.windows === "number", windows: answer.windows,
                    /* How many of them a display would actually show, and what was compared
                       against. A count rather than a flag, since one pid can own more than one. */
                    windowsOnDisplay: answer.windowsOnDisplay,
                    displays: Array.isArray(answer.displays) ? answer.displays
                              : (answer.displays ? [answer.displays] : []) };
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

/* ---- A TALLY IS NOT A VERDICT, board items 442 and 531 --------------------------------------
 *
 * THREE WAYS A GREEN TALLY IS NOT A PASS, all three measured rather than imagined:
 *   - the run stopped early. Measured 2026-09-12 with the catalog absent: tests/smoke.js left a
 *     log of 70 ok lines, no FAIL, no tally and no verdict, and anything counting lines saw a
 *     clean partial run.
 *   - a section did not run. A suite that quietly shrinks is a suite that has stopped looking,
 *     so the number of checks is DECLARED and a run that does not match it has no verdict.
 *   - the declaration is stale, which is the same fault read the other way and is why more
 *     checks than declared is a refusal too rather than a pleasant surprise.
 * Board item 531 is the second of the three, in tests/shell-smoke.js: one run of two on
 * 2026-09-18 ended inside check 2d of 7 at 44 checks, and the file declared no count to be held
 * to. THE RULE IS HERE AND NOT IN EITHER DRIVER so that two copies cannot drift, and it is a
 * PURE FUNCTION so tests/engine-selftest.js can put it wrong on purpose - a guard that has never
 * refused anything has been written rather than tested.
 *
 * `expected` null or undefined means no declaration, which is said out loud rather than passed
 * over: a caller that has not counted its checks is told that this reading cannot see a missing
 * section. Returns the exit code, the lines to print, and whether there is a verdict at all.
 */
/* ---- WHAT A GREEN RUN OFF WINDOWS MUST NEVER BE TAKEN TO PROVE, board item 613 --------------
 *
 * 41 of this company's 71 leaf gates run on Linux unchanged, 24 want a small change, and 6 are
 * Windows by nature. So the honest shape is two harnesses: Linux proves the application, Windows
 * keeps proving the installer and the shell's own guards. The danger in that shape is not the
 * gates that fail - those are loud - but the reader who takes a green Linux run for a green run.
 *
 * The list is here rather than in a document because a document is not read at the moment the
 * verdict is given, and suiteVerdict prints it on any run that is not on Windows. It is worded
 * as what was NOT proved, never as a reassurance.
 *
 * SINCE 629 IT HAS TWO CALLERS, so it is a function rather than a block inside suiteVerdict.
 * The two drivers that end on suiteVerdict are both Windows gates and neither of them will ever
 * run on the Linux job; the gate that WILL is tests/test.js, which has its own verdict line and
 * does not tally checks at all. One body, printed by whoever gives a verdict, because two copies
 * of this list would be two lists within a month. The header carries the NUMBER of things, and
 * .github/workflows/gates.yml reads that number back and counts the lines under it, so a notice
 * that quietly shrank would redden the job rather than shorten the summary.
 */
const NOT_PROVED_OFF_WINDOWS = [
  "the content policy as the shell serves it, which only a launched Electron carries",
  "the desk's state file, its carry and its backup",
  "the catalog folder watch, and the offer that arrives without a reload",
  "any painted window: the frame, the band's inset, the mark, the dot field",
  "the packaged allowlist and the pin travelling inside the asar",
  "the installer itself, the .ec association, the Start Menu entry and the real profile",
  "that electron . and the packaged app agree on the screen",
];

/* The lines themselves, empty on Windows. A caller prints them at its own verdict and indents
   them the way it indents everything else; nothing here assumes an indent, because the two
   callers already differ. */
function offWindowsNotice() {
  if (process.platform === "win32") return [];
  const lines = ["NOT WINDOWS (" + process.platform + "), so whatever this run says, it did not"
    + " look at " + NOT_PROVED_OFF_WINDOWS.length + " things:"];
  NOT_PROVED_OFF_WINDOWS.forEach(x => lines.push("  - " + x));
  return lines;
}

function suiteVerdict(o) {
  const a = o || {};
  const checks = Number(a.checks) || 0;
  const fails = Number(a.fails) || 0;
  const want = (a.expected === undefined || a.expected === null) ? null : Number(a.expected);
  const lines = [];
  let noVerdict = false;
  if (want === null)
    lines.push("no declared check count, so a section skipped in this run would not be noticed here");
  else if (checks !== want) {
    noVerdict = true;
    lines.push("THE RUN IS NOT THE SUITE: " + checks + " check(s) ran and " + want
      + " are declared. " + (checks < want
        ? (want - checks) + " never ran, so this tally is not a verdict"
        : (checks - want) + " more than declared, so the declaration is stale") + ".");
  }
  if (!a.reachedEnd) {
    noVerdict = true;
    lines.push("SUITE DID NOT COMPLETE: it stopped after " + checks
      + " check(s), and the tally above is not a verdict");
  }
  /* Board item 613. Said at the verdict, on every run that is not on Windows, because this is
     where a reader decides what the run means. */
  offWindowsNotice().forEach(l => lines.push(l));
  return { exit: noVerdict ? NO_VERDICT : exitOf(fails), noVerdict: noVerdict, lines: lines };
}

/* The one sentence five drivers say about their own launches, written once so that five copies
   cannot drift. `who` names the driver, because the message is read in a log that holds several. */
function offscreenVerdict(pid, who) {
  /* NOT RUN IS NOT A PASS AND NOT A FAILURE, board item 613. windowFacts is PowerShell and
     user32, so off Windows it answers measured:false, and every caller of this reads that as a
     failed check. That reading is right on Windows - "I could not look" and "there was nothing
     there" must never merge into a green - and wrong off it, where the helper was never able to
     look at all and the gate is red for the platform rather than for the product. So the
     platform case is named separately and the caller is told to record it as not run. */
  if (process.platform !== "win32")
    return { ok: false, skipped: true, facts: null,
      what: who + " cannot ask whether a window is on screen on " + process.platform
        + ": the helper is PowerShell and user32. NOT RUN, which is neither a pass nor a"
        + " failure, and it means this run has not looked at the screen at all" };
  const w = windowFacts(pid);
  const ok = w.measured === true && w.windows === 0;
  return { ok: ok, skipped: false, facts: w, what: who + " launches the shell under " + OFFSCREEN_KEY
    + "=1 and must put nothing on screen: "
    + (w.measured ? w.windows + " visible top-level window(s) for pid " + pid
                  : "NOT MEASURED, which is a failure and not a clean screen - " + w.why)
    + ". The separating control is shell-smoke 1g3, where the same app with the variable cleared"
    + " answers one window on a display" };
}

/* ---- AND HOW A GATE RECORDS IT, board item 628 ----------------------------------------------
 *
 * Four gates ask the verdict above and all four wrote the same eight lines to handle it: check
 * on Windows, print `  NOT RUN` off it. The printing was right and the RECORD was not. A line
 * that neither counter reads leaves the run one check shorter than the same run on Windows, and
 * `tools/gate-run.mjs` sees `{"ok":13,"fail":0}` where a full run says 14 - two greens that are
 * not the same green, with nothing in the object to tell them apart. A count that quietly falls
 * is the fault 550 was cut to remove, one gate over.
 *
 * So the not-run is a COUNT. The gate hands in its own `check` and its own `notRun` list, and
 * declares `notRun=` on its `#counts` line beside the checks it ran. Written here rather than in
 * each gate because four copies of a rule drift, and because a selftest can then drive the real
 * thing under a patched platform rather than a copy of it.
 */
function offscreenCheck(pid, who, check, notRun) {
  const v = offscreenVerdict(pid, who);
  if (v.skipped) {
    notRun.push(who + "'s offscreen verdict");
    console.log("  NOT RUN " + v.what);
  } else {
    check(v.ok, v.what);
  }
  return v;
}

module.exports = { NO_VERDICT, exitOf, ROOT, ENGINE_PATH, FIXTURE_FILE, SRC_DIR, APP_ANCHOR,
                   CATALOG_FOLDER_KEY, pinCatalogFolder, OFFSCREEN_KEY, offscreenEnv,
                   REAL_USER_DATA, REAL_DOCUMENTS, underOrEqual, userDataDirOf,
                   catalogConfinement, shellLaunchRefusal, shellLaunch,
                   DESK_LOCK, deskLockHolder, takeDeskLock, releaseDeskLock, pidAlive,
                   statIsZombie,
                   LEASE_HOLDER, takeLeases, releaseLeases, PORT_BLOCKS, portBlock, portSpan, portOverlaps,
                   parkNamedShortcuts, restoreNamedShortcuts,
                   SHELL_FOLDERS, shellFolders, placesMismatch, deskEnvelope, envelopeLine, keepAside,
                   windowFacts, pickWindow, offscreenVerdict, offscreenCheck, killTree,
                   NOT_PROVED_OFF_WINDOWS, offWindowsNotice,
                   suiteVerdict,
                   refuse, sha256, enginePath, engineSource, fixturesDir, fixtures, runFolder, browserPath, inside,
                   sourceFiles, readSrc, templateParts, sourceDoc, spliceTie, removeLab };
