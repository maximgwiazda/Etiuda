/* THE FOLDER SYNCER'S INVARIANTS, AS AN ORACLE (the test architect, 2026-11-17).
 *
 * Three reviews by a second house each broke a mend of the folder syncer by running sequences the mend's own checks did not
 * make. This leg does not check a finding. It states what must hold whatever the code does, and drives the syncer through
 * small scenes with a file layer that fails each read, removal and rename in turn.
 *
 * THE INVARIANTS (Claude alpha's two and the test architect's two, 2026-11-17):
 *   I1  Nothing is decided on an unknown read. A read, a removal or a rename that fails with anything but "no such file"
 *       (EBUSY, EPERM, EACCES) decides nothing: once it clears, the share, the mirror and the outbox end where they end
 *       when nothing failed.
 *   I2  This computer never writes over or removes a share copy whose content it has not read.
 *   I3  A change to the outbox names the record it changes and applies only while that record stands: an edit noted while
 *       an outbox write is being retried still reaches the share.
 *   I4  One way onto the share: a file of this desk's own that reached the share later than the mirror's copy is not put
 *       back to the mirror's.
 *
 * WHAT IT RUNS. Each scene is run once with nothing failing (its end state is the scene's oracle, and where the scene
 * states a `want`, that is checked too), then once for every read, removal and rename the syncer made in that run, with
 * that one call failing: once (mode "once"), and for the rest of its listing (mode "listing"). Each run then gets the
 * fault cleared and four more listings, and must end where the run without a fault ended. I2 is read off every run by
 * the same layer: each removal of, and each write over, a file on the share is checked against what the syncer has read
 * of that file, or written to it, since the program started.
 *
 * WHAT IT DOES NOT SEE, said plainly: the worker thread (it has its own file module, which a leg cannot reach without a
 * hook in the product; the scenes are run through the controller with nothing failing and compared with the single
 * thread, no more); a failing listing or stat (the syncer treats those as the share being away, which other legs hold);
 * shell/main.js (I4 is driven at the syncer, with the share written as main.js writes it today).
 *
 * THIS LEG IS RED ON MAIN ON PURPOSE until the piece built to these invariants lands, and is in no gate list until then.
 *
 *     node tests/syncer-invariants.mjs            the whole sweep
 *     SYNCER_INV_ONLY=s3,s7 node tests/...         some scenes
 *     SYNCER_INV_SAY=1 node tests/...              print every run that diverged, not the first three
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const ONLY = new Set(String(process.env.SYNCER_INV_ONLY || "").split(",").map(s => s.trim()).filter(Boolean));
const SAY_ALL = process.env.SYNCER_INV_SAY === "1";
const LAB = createLab("etiuda-syncer-invariants-");
const noop = () => {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash("sha256").update(b).digest("hex").slice(0, 8);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the desk's checks, as shell/main.js makes them (tests/syncer-outbox-unread.mjs loads them the same way) ---------- */
function loadChecks() {
  const ud = path.join(LAB, "checks");
  fs.mkdirSync(ud, { recursive: true });
  const inert = new Proxy(function () {}, {
    get: (t, p) => (p === "getBounds" ? () => ({ x: 0, y: 0, width: 800, height: 600 }) : p === "isDestroyed" ? () => false : inert),
    set: () => true, apply: () => undefined });
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(String(s)), decryptString: b => Buffer.from(b).toString("utf8") } };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }), "utf8");
  const src = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    src + "\nreturn { get deskTrustChecks() { return typeof deskTrustChecks === 'undefined' ? undefined : deskTrustChecks; } };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, { log: noop, error: noop, warn: noop });
  return typeof api.deskTrustChecks === "function" ? api.deskTrustChecks() : null;
}

/* ---- the failing file layer ------------------------------------------------------------------------------------------
 * The syncer reaches the disk through its io table and through node's fs directly; both end in the same fs functions, so
 * the layer sits there. It acts only while a scene has armed it, and only on paths under that scene's share or mirror. */
const REAL = {};
const OPS = ["readFileSync", "unlinkSync", "renameSync", "copyFileSync", "writeFileSync"];
for (const op of OPS) REAL[op] = fs[op];
const layer = { armed: false, share: "", mirror: "", trace: [], fault: null, listing: 0, read: new Map(), i2: [], faultHit: null };
const relIn = (base, p) => {
  const r = path.relative(base, path.resolve(String(p)));
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.replace(/\\/g, "/") : null;
};
/* Where a path is, for the trace: "share/<rel>" or "mirror/<rel>", random names made alike so two runs can be compared. */
function placeOf(p) {
  for (const [name, base] of [["share", layer.share], ["mirror", layer.mirror]]) {
    const r = relIn(base, p);
    if (r !== null) return { side: name, rel: r, said: name + "/" + r.replace(/[0-9a-f]{8,}/g, "#").replace(/\d{10,}/g, "#") };
  }
  return null;
}
/* A team's file, as against the syncer's own working files beside it (dot names, locks, temporaries). */
const teamFile = rel => !rel.split("/").some(s => s.startsWith(".")) && !/\.(tmp|lock|stale|part)$/.test(rel) && !/\.tmp\b/.test(rel);
const shaAt = p => { try { return sha(REAL.readFileSync.call(fs, p)); } catch { return null; } };
function fail(code, op, said) {
  const e = new Error(code + ": planted by tests/syncer-invariants.mjs, " + op + " " + said);
  e.code = code;
  return e;
}
/* I2: before a removal of, or a write over, a team file on the share, what is there must be something the syncer read
   there or wrote there itself since the program started. */
function i2Before(op, target) {
  const at = placeOf(target);
  if (!at || at.side !== "share" || !teamFile(at.rel)) return null;
  const cur = shaAt(target);
  if (cur === null) return at;
  const known = layer.read.get(at.rel);
  if (!known || !known.has(cur)) layer.i2.push(op + " " + at.rel + " over content " + cur + " never read");
  return at;
}
function i2After(at, target) {
  if (!at) return;
  const now = shaAt(target);
  if (now !== null) (layer.read.get(at.rel) || layer.read.set(at.rel, new Set()).get(at.rel)).add(now);
}
function wrap(op) {
  fs[op] = function (...args) {
    if (!layer.armed) return REAL[op].apply(fs, args);
    const subject = op === "renameSync" || op === "copyFileSync" ? args[1] : args[0];
    const at = placeOf(subject), from = op === "renameSync" || op === "copyFileSync" ? placeOf(args[0]) : null;
    if (!at && !from) return REAL[op].apply(fs, args);
    const said = op + " " + (from ? from.said + " -> " : "") + (at ? at.said : "(outside)");
    /* writeFileSync is traced and checked for I2 but never failed: a failed write is another matter than a failed read. */
    const faultable = op !== "writeFileSync";
    const index = layer.trace.length;
    layer.trace.push({ said, listing: layer.listing, faultable });
    const f = layer.fault;
    if (f && faultable) {
      const hit = f.mode === "once" ? index === f.index
        : index >= f.index && layer.listing === f.listing && said === f.said;
      if (hit) { layer.faultHit = said; throw fail(f.code, op, said); }
    }
    const writes = op !== "readFileSync";
    const mark = writes && at ? i2Before(op, subject) : null;
    const out = REAL[op].apply(fs, args);
    if (mark) i2After(mark, subject);
    if (op === "readFileSync" && at && at.side === "share" && teamFile(at.rel)) {
      const bytes = Buffer.isBuffer(out) ? out : Buffer.from(String(out), "utf8");
      (layer.read.get(at.rel) || layer.read.set(at.rel, new Set()).get(at.rel)).add(sha(bytes));
    }
    return out;
  };
}
for (const op of OPS) wrap(op);

/* ---- scenes ----------------------------------------------------------------------------------------------------------- */
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const OWN = "k-0123456789abcdef";
const cat = (rev, label, id = "item") => JSON.stringify({ format: 2, kind: "etiuda-catalog", id, rev, name: label }) + "\n";
const join = invite => JSON.stringify({ format: 1, kind: "etiuda-join", desk: OWN, invite }) + "\n";
const put = (base, rel, text) => {
  const p = path.join(base, ...rel.split("/"));
  REAL.writeFileSync.call(fs, (fs.mkdirSync(path.dirname(p), { recursive: true }), p), text, "utf8");
};
const drop = (base, rel) => { try { REAL.unlinkSync.call(fs, path.join(base, ...rel.split("/"))); } catch { /* not there */ } };
const OWN_JOIN = "desks/" + OWN + "/join.json", OWN_CAT = "desks/" + OWN + "/item.ec";

/* A scene: `start` lays the two folders out before the program is made; `steps` are what happens after, in order, where
   "sync" is one listing and a function is an act of this computer or of a colleague on the share; `want`, where given,
   says what must be true at the end whatever the code does (the invariant it stands for is named in `said`). */
const SCENES = [
  { tag: "s1", said: "an edit on this computer reaches the share",
    start: (s, m, mod) => { put(s, "item.ec", cat(1, "One")); put(m, "item.ec", cat(1, "One")); put(m, "item.ec", cat(2, "Two")); mod.noteOwed(m, "item.ec"); },
    steps: ["sync", "sync", "sync"],
    want: e => e.share["item.ec"] === sha(cat(2, "Two")) && e.mirror["item.ec"] === sha(cat(2, "Two")) && !e.owed.length },
  { tag: "s2", said: "a new file here and a colleague's new file there both end on both sides",
    start: (s, m, mod) => { put(s, "theirs.ec", cat(5, "Theirs", "theirs")); put(m, "mine.ec", cat(1, "Mine", "mine")); mod.noteOwed(m, "mine.ec"); },
    steps: ["sync", "sync", "sync"],
    want: e => !!e.share["mine.ec"] && !!e.mirror["theirs.ec"] && e.share["theirs.ec"] === e.mirror["theirs.ec"] && e.share["mine.ec"] === e.mirror["mine.ec"] && !e.owed.length },
  { tag: "s3", said: "a deletion on this computer reaches the share",
    start: (s, m, mod) => { put(s, "item.ec", cat(1, "One")); put(m, "item.ec", cat(1, "One")); drop(m, "item.ec"); mod.noteOwed(m, "item.ec"); },
    steps: ["sync", "sync", "sync"],
    want: e => !e.share["item.ec"] && !e.mirror["item.ec"] && !e.owed.length },
  { tag: "s4", said: "a colleague's newer file lands and nothing here is sent over it",
    start: (s, m) => { put(s, "item.ec", cat(3, "Three")); put(m, "item.ec", cat(2, "Two")); },
    steps: ["sync", "sync", "sync"],
    want: e => e.share["item.ec"] === sha(cat(3, "Three")) && e.mirror["item.ec"] === sha(cat(3, "Three")) && !e.owed.length },
  { tag: "s5", said: "an edit in this desk's own folder reaches the share",
    start: (s, m, mod) => { put(s, OWN_CAT, cat(1, "One")); put(m, OWN_CAT, cat(1, "One")); put(m, OWN_CAT, cat(2, "Two")); mod.noteOwed(m, OWN_CAT); },
    steps: ["sync", "sync", "sync"],
    want: e => e.share[OWN_CAT] === sha(cat(2, "Two")) && e.mirror[OWN_CAT] === sha(cat(2, "Two")) && !e.owed.length },
  { tag: "s6", said: "an edit made while the share moved on does not replace the share's newer file",
    start: (s, m, mod) => { put(s, "item.ec", cat(1, "One")); put(m, "item.ec", cat(1, "One")); put(m, "item.ec", cat(2, "Mine")); mod.noteOwed(m, "item.ec"); },
    steps: [(s) => put(s, "item.ec", cat(5, "Theirs")), "sync", "sync", "sync"],
    want: e => e.share["item.ec"] === sha(cat(5, "Theirs")) },
  { tag: "s7", said: "a deletion owed whose file is back removes neither copy (I1: the record no longer says what the mirror holds)",
    start: (s, m, mod) => { put(s, "item.ec", cat(4, "Old")); put(m, "item.ec", cat(4, "Old")); drop(m, "item.ec"); mod.noteOwed(m, "item.ec"); put(m, "item.ec", cat(9, "Back")); },
    steps: ["sync", "sync", "sync"],
    want: e => !!e.share["item.ec"] && !!e.mirror["item.ec"] },
  { tag: "s8", said: "this desk's later join request on the share is not put back to the mirror's earlier one (I4)",
    start: (s, m) => { put(s, OWN_JOIN, join("first")); put(m, OWN_JOIN, join("first")); },
    steps: ["sync", (s) => drop(s, OWN_JOIN), (s) => put(s, OWN_JOIN, join("second")), "sync", "sync", "sync", "sync"],
    want: e => e.share[OWN_JOIN] === sha(join("second")) },
  { tag: "s9", said: "an edit noted between two listings reaches the share (I3, with the outbox's writes failing in turn)",
    start: (s, m, mod) => { put(s, "item.ec", cat(1, "One")); put(m, "item.ec", cat(1, "One")); put(m, "item.ec", cat(2, "Two")); mod.noteOwed(m, "item.ec"); },
    steps: ["sync", (s, m, mod) => { put(m, "item.ec", cat(3, "Three")); mod.noteOwed(m, "item.ec"); }, "sync", "sync", "sync"],
    want: e => e.share["item.ec"] === sha(cat(3, "Three")) && !e.owed.length },
];

function walk(base) {
  const out = {};
  const go = (dir, rel) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = path.join(dir, n), r = rel ? rel + "/" + n : n;
      let st = null;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!n.startsWith(".")) go(p, r); continue; }
      if (teamFile(r)) out[r] = shaAt(p);
    }
  };
  go(base, "");
  return out;
}
const endOf = (mod, share, mirror) => ({ share: walk(share), mirror: walk(mirror),
  owed: (() => { try { return mod.owedList(mirror).map(x => x.rel + (x.del ? ":del" : ":" + String(x.sha).slice(0, 8))).sort(); } catch { return ["(outbox unreadable)"]; } })() });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ageLocks(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  const past = new Date(Date.now() - 120000);
  for (const n of names) {
    const p = path.join(dir, n);
    let st = null;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) ageLocks(p);
    else if (/\.lock$/.test(n)) { try { fs.utimesSync(p, past, past); } catch { /* gone meanwhile */ } }
  }
}
let runNo = 0;
/* One run of a scene on the single thread. `fault` is null, or {mode, index, said, listing, code}. */
async function runScene(mod, checks, scene, fault) {
  const base = path.join(LAB, scene.tag + "-" + (++runNo));
  const share = path.join(base, "share"), mirror = path.join(base, "mirror");
  fs.mkdirSync(share, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  scene.start(share, mirror, mod);
  let t = 1763380000000;
  const prog = mod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: null, checks, own: OWN, logger: noop, now: () => t });
  Object.assign(layer, { share, mirror, trace: [], fault, listing: 0, read: new Map(), i2: [], faultHit: null });
  const threw = [];
  const listing = () => {
    layer.listing++;
    t += 5000;
    layer.armed = true;
    try { prog.syncOnce(); } catch (e) { threw.push(String(e && e.code || e && e.message || e).slice(0, 60)); }
    finally { layer.armed = false; }
  };
  try {
    for (const step of scene.steps) {
      if (step === "sync") listing();
      else {
        /* An act of this computer may write the outbox, and that write may be the one that fails. */
        layer.armed = true;
        try { step(share, mirror, mod); } catch (e) { threw.push("act: " + String(e && e.code || e && e.message || e).slice(0, 60)); }
        finally { layer.armed = false; }
      }
    }
    if (fault) {
      /* The fault is over: retry timers run out, then four listings more. */
      layer.fault = null;
      await sleep(130);
      /* A lock this computer could not let go is taken over once it is thirty seconds old (SHARED_LOCK_MS, by the file's
         own time): the wait is stated and bounded, so the leg ages such a lock here and does not count it. */
      ageLocks(share);
      for (let i = 0; i < 4; i++) listing();
      await sleep(70);
      listing();
    }
  } finally { layer.armed = false; try { prog.stop(); } catch { /* stopped */ } }
  return { end: endOf(mod, share, mirror), trace: layer.trace.slice(), i2: layer.i2.slice(), threw, hit: layer.faultHit };
}

/* The same scene through the controller and its worker, nothing failing. */
async function runWorker(mod, checks, scene) {
  const base = path.join(LAB, scene.tag + "-w" + (++runNo));
  const share = path.join(base, "share"), mirror = path.join(base, "mirror");
  fs.mkdirSync(share, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  scene.start(share, mirror, mod);
  const ctl = new mod.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: null, checks, own: OWN, logger: noop, pollMs: 150 });
  try {
    ctl.start();
    for (const step of scene.steps) {
      if (step === "sync") { try { await ctl.flushNow(4000); } catch { /* judged by the end state */ } await sleep(450); }
      else step(share, mirror, mod);
    }
    await sleep(900);
    try { await ctl.flushNow(4000); } catch { /* as above */ }
    await sleep(450);
  } finally { try { ctl.stop(); } catch { /* stopped */ } }
  await sleep(100);
  return endOf(mod, share, mirror);
}

const MODES = [["once", "EBUSY"], ["once", "EPERM"], ["listing", "EBUSY"], ["listing", "EACCES"]];
const scenes = SCENES.filter(s => !ONLY.size || ONLY.has(s.tag));
const EXPECTED = scenes.length * 5;

async function main() {
  const mod = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));
  const checks = loadChecks();
  if (!checks) { check(false, "the desk's checks could not be loaded from shell/main.js"); process.exit(1); }
  const totals = { runs: 0, diverged: 0, i2: 0 };
  for (const scene of scenes) {
    const clean = await runScene(mod, checks, scene, null);
    const again = await runScene(mod, checks, scene, null);
    check(same(clean.end, again.end) && (!scene.want || scene.want(clean.end)) && !clean.threw.length,
      scene.tag + "a with nothing failing, " + scene.said + ": " + JSON.stringify({ end: clean.end, twiceAlike: same(clean.end, again.end), threw: clean.threw }));
    check(!clean.i2.length, scene.tag + "b I2 with nothing failing, no file on the share is removed or written over unread: " + JSON.stringify(clean.i2.slice(0, 4)));

    const bad = { once: [], listing: [] }, unread = new Set();
    let runs = 0;
    for (let k = 0; k < clean.trace.length; k++) {
      const call = clean.trace[k];
      if (!call.faultable) continue;
      for (const [mode, code] of MODES) {
        const r = await runScene(mod, checks, scene, { mode, index: k, said: call.said, listing: call.listing, code });
        runs++;
        if (!r.hit) continue; /* the call was not made this time (its place moved); nothing was planted */
        for (const v of r.i2) unread.add(v.replace(/ over content [0-9a-f]+/, ""));
        /* Judged against the end with nothing failing, and nothing else: where that end already breaks the scene's want,
           check a says so once and these two count only what a fault changed. */
        const ok = same(r.end, clean.end);
        if (!ok) bad[mode].push({ code, call: call.said, listing: call.listing, end: r.end, threw: r.threw.slice(0, 2) });
      }
    }
    totals.runs += runs; totals.diverged += bad.once.length + bad.listing.length; totals.i2 += unread.size;
    const show = list => (SAY_ALL ? list : list.slice(0, 3));
    check(!bad.once.length, scene.tag + "c I1, each read, removal and rename failing once in turn (" + runs + " runs over " + clean.trace.filter(c => c.faultable).length
      + " calls, both modes): the end is the end with nothing failing: diverged " + bad.once.length + " " + JSON.stringify(show(bad.once)));
    check(!bad.listing.length, scene.tag + "d I1, each failing for the rest of its listing: the end is the end with nothing failing: diverged "
      + bad.listing.length + " " + JSON.stringify(show(bad.listing)) + (unread.size ? "; I2 under a fault: " + JSON.stringify([...unread].slice(0, 4)) : ""));

    let worker = null, wErr = "";
    try { worker = await runWorker(mod, checks, scene); } catch (e) { wErr = String(e && e.message || e).slice(0, 120); }
    check(!!worker && same(worker, clean.end), scene.tag + "e through the controller and its worker, nothing failing, the end is the single thread's: "
      + JSON.stringify(worker ? { same: same(worker, clean.end), worker } : { error: wErr }));
  }
  if (asserted !== EXPECTED) check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + " runs=" + totals.runs + " diverged=" + totals.diverged);
  console.log("syncer-invariants: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  for (const op of OPS) fs[op] = REAL[op];
  process.exit(Math.min(failed, 63));
}

main().catch(e => {
  console.error(String(e && e.stack || e));
  process.exit(78);
});
