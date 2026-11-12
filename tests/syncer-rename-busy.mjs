/* A rename out of the mirror's .staging folder that the system refuses for a moment is asked again.
 * One that keeps refusing leaves that file staged, is said, and is tried at the next scan. The worker stays up.
 * A share file marked read-only lands writable, and a mirror copy already marked takes the next landing (998).
 *
 *     node tests/syncer-rename-busy.mjs
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 8;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = createLab("etiuda-syncer-rename-busy-");
const noop = () => {};
const inert = new Proxy(function () {}, {
  get: (target, prop) => {
    if (prop === "getBounds") return () => ({ x: 0, y: 0, width: 800, height: 600 });
    if (prop === "isDestroyed") return () => false;
    return inert;
  },
  set: () => true,
  apply: () => undefined
});

function loadChecks() {
  const ud = path.join(LAB, "checks");
  fs.mkdirSync(ud, { recursive: true });
  const quiet = { log: noop, error: noop, warn: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(String(s)), decryptString: b => Buffer.from(b).toString("utf8") }
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }), "utf8");
  const src = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    src + "\nreturn { get deskTrustChecks() { return typeof deskTrustChecks === 'undefined' ? undefined : deskTrustChecks; } };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  return typeof api.deskTrustChecks === "function" ? api.deskTrustChecks() : null;
}

const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const pair = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lead-01", public: pubHex(pair.publicKey) };
const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
const sign = (doc, key, keyId) => {
  const out = JSON.parse(JSON.stringify(doc));
  delete out.sig;
  out.sig = { alg: "Ed25519", keyId: keyId };
  out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
  return out;
};
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const CATALOG = "wick-board.ec";

function teamText() {
  return JSON.stringify(sign({
    format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["wick-board"],
    lead: { keyId: LEAD.keyId, public: LEAD.public },
    sealed: true, epoch: 1, rev: 1, roster: []
  }, pair.privateKey, LEAD.keyId));
}
function editionText() {
  return JSON.stringify(sign({
    format: 2, kind: "etiuda-catalog", id: "wick-board", rev: 1, name: "Wick Board", date: "2026-04-01",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-wick", shelf: "t-op", bodyShape: "plain", title: { en: "Wick" }, body: { en: "A wick." } }]
  }, pair.privateKey, LEAD.keyId));
}

function diskIo(rename) {
  return {
    readdir: d => fs.readdirSync(d),
    stat: p => fs.statSync(p),
    readFile: (p, enc) => fs.readFileSync(p, enc),
    writeFile: (p, data) => fs.writeFileSync(p, data),
    unlink: p => fs.unlinkSync(p),
    mkdir: d => fs.mkdirSync(d, { recursive: true }),
    exists: p => fs.existsSync(p),
    rename
  };
}
function busy(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
function stagedTmps(mirror) {
  const dir = path.join(mirror, ".staging");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith(".tmp")).map(n => path.join(dir, n));
}

/* The scenes of 998, each in a child the parent kills by the wall clock: a rename refused for good blocks the thread that lands
   (Atomics.wait in renameBusy), so no timer in the same process can be trusted to end the leg. A scene may take the syncer's two
   files from a folder of its own, where a plant is lifted. */
const SCENE_KILL_MS = 45000;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ringText = note => JSON.stringify({ format: 1, kind: "etiuda-ring", keys: [], note }) + "\n";
async function readOnlyScene(kind, syncerDir) {
  const checks = loadChecks();
  const syncer = nodeRequire(path.join(syncerDir || path.join(ROOT, "shell", "folder"), "syncer.cjs"));
  const share = path.join(LAB, "ro-share-" + kind), mirror = path.join(LAB, "ro-mirror-" + kind);
  fs.mkdirSync(share, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  fs.writeFileSync(path.join(share, "etiuda-team.json"), teamText(), "utf8");
  const shareRing = path.join(share, "etiuda-ring.json"), mirrorRing = path.join(mirror, "etiuda-ring.json");
  const writable = p => { try { return (fs.statSync(p).mode & 0o200) !== 0; } catch { return null; } };
  const holds = (p, note) => { try { return fs.readFileSync(p, "utf8").indexOf('"' + note + '"') >= 0; } catch { return false; } };
  const until = async (ok, ms) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await sleep(50); return ok(); };
  const out = { kind };
  const said = [];
  const marked = [shareRing, mirrorRing];
  try {
    if (kind === "land") {
      /* The worker's copy, as a desk runs it. */
      fs.writeFileSync(shareRing, ringText("first"), "utf8");
      fs.chmodSync(shareRing, 0o444);
      const ctl = new syncer.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: LEAD, checks, pollMs: 200, logger: s => said.push(String(s)) });
      try {
        ctl.start();
        out.landed = await until(() => holds(mirrorRing, "first"), 10000);
        out.mirrorWritable = writable(mirrorRing);
        out.shareStillMarked = writable(shareRing) === false;
        fs.chmodSync(shareRing, 0o666);
        fs.writeFileSync(shareRing, ringText("second, longer"), "utf8");
        out.next = await until(() => holds(mirrorRing, "second, longer"), 10000);
      } finally {
        try { ctl.stop(); } catch {}
      }
    } else if (kind === "thaw") {
      /* One scan of the landing both paths share, so a refusal answers in its own bounded tries rather than a hang. */
      fs.writeFileSync(mirrorRing, ringText("older"), "utf8");
      fs.chmodSync(mirrorRing, 0o444);
      fs.writeFileSync(shareRing, ringText("from the share"), "utf8");
      const prog = syncer.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks, logger: s => said.push(String(s)) });
      prog.syncOnce();
      out.thawed = holds(mirrorRing, "from the share");
      out.mirrorWritable = writable(mirrorRing);
    } else if (kind === "copy") {
      /* A copy between the share and this computer: a source marked read-only and hidden, over a copy already marked both. */
      const from = path.join(share, "desk-file.ec"), to = path.join(mirror, "desk-file.ec");
      marked.push(from, to);
      fs.writeFileSync(from, "from the share", "utf8");
      fs.writeFileSync(to, "older", "utf8");
      for (const p of [from, to]) {
        if (process.platform === "win32") spawnSync("attrib", ["+h", p]);
        fs.chmodSync(p, 0o444);
      }
      const at = fs.statSync(from).mtimeMs;
      try { syncer.copyClear(from, to); } catch (e) { out.threw = (e && e.code) || String(e); }
      out.bytes = (() => { try { return fs.readFileSync(to, "utf8") === "from the share"; } catch { return false; } })();
      out.copyWritable = writable(to);
      out.timeKept = (() => { try { return fs.statSync(to).mtimeMs === at; } catch { return false; } })();
      out.sourceStillMarked = writable(from) === false;
      out.noTemp = fs.readdirSync(mirror).filter(n => n.endsWith(".tmp")).length === 0;
    }
    out.refusedSaid = said.filter(l => l.indexOf("stayed staged") >= 0).length;
  } finally {
    for (const p of marked) { try { fs.chmodSync(p, 0o666); } catch {} }
  }
  return out;
}
function runScene(kind, syncerDir) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [SELF, "--read-only-scene", kind].concat(syncerDir ? [syncerDir] : []),
    { encoding: "utf8", timeout: SCENE_KILL_MS, maxBuffer: 8 * 1024 * 1024 });
  const ms = Date.now() - t0;
  if (res.error || res.signal) return { killed: true, ms, why: String((res.error && res.error.code) || res.signal) };
  const line = String(res.stdout || "").split(/\r?\n/).find(l => l.startsWith("#result "));
  if (!line) return { noResult: true, ms, status: res.status, err: String(res.stderr || "").slice(-400) };
  return Object.assign(JSON.parse(line.slice(8)), { ms });
}
/* The syncer's two files copied into the lab with the line holding plant:<tag> lifted from `file`; the checkout's file is read
   again after, as folder-mirror's plants are. */
function plantScene(tag, file, kind) {
  const dir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
  const src = path.join(ROOT, "shell", "folder");
  const before = fs.readFileSync(path.join(src, file));
  for (const f of ["syncer.cjs", "syncer-worker.cjs"]) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  const lines = before.toString("utf8").split("\n");
  const at = lines.findIndex(l => l.includes("plant:" + tag));
  if (at < 0) return { found: false };
  lines.splice(at, 1);
  fs.writeFileSync(path.join(dir, file), lines.join("\n"), "utf8");
  const res = runScene(kind, dir);
  return { found: true, res, same: fs.readFileSync(path.join(src, file)).equals(before) };
}
const landGreen = r => r.landed === true && r.mirrorWritable === true && r.shareStillMarked === true && r.next === true && r.refusedSaid === 0;
const thawGreen = r => r.thawed === true && r.mirrorWritable === true && r.refusedSaid === 0;
const copyGreen = r => !r.threw && r.bytes === true && r.copyWritable === true && r.timeKept === true && r.sourceStillMarked === true && r.noTemp === true;

function main() {
  const land = runScene("land");
  check(landGreen(land),
    "998a a share file marked read-only lands in the mirror writable, the share keeps its mark, and its next version lands over it: "
    + JSON.stringify(land));
  const thaw = runScene("thaw");
  check(thawGreen(thaw), "998b a mirror copy left read-only by an older desk takes the next landing and is writable after it: " + JSON.stringify(thaw));
  const copy = runScene("copy");
  check(copyGreen(copy), "998c a copy between the share and this computer replaces a copy marked read-only and hidden, and holds the bytes and"
    + " the last-write time without the mark, the source keeping its own: " + JSON.stringify(copy));
  const plants = [
    ["stage-clear-mark", "syncer-worker.cjs", "land", landGreen, "998d lifting plant:stage-clear-mark lands a read-only share file read-only"],
    ["land-clear-mark", "syncer.cjs", "thaw", thawGreen, "998e lifting plant:land-clear-mark leaves a read-only mirror copy refusing every landing"],
    ["copy-clear-mark", "syncer.cjs", "copy", copyGreen, "998f lifting plant:copy-clear-mark leaves a marked copy refusing the next"],
  ];
  for (const [tag, file, kind, green, line] of plants) {
    if (PLANTS_OFF) { asserted++; console.log("  skip " + line); continue; }
    const p = plantScene(tag, file, kind);
    check(p.found && !green(p.res) && p.same, line + ": " + JSON.stringify(p));
  }

  const checks = loadChecks();
  const syncer = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));
  const shareA = path.join(LAB, "share-a");
  const mirrorA = path.join(LAB, "mirror-a");
  fs.mkdirSync(shareA, { recursive: true });
  fs.mkdirSync(mirrorA, { recursive: true });
  const edition = editionText();
  fs.writeFileSync(path.join(shareA, "etiuda-team.json"), teamText(), "utf8");
  fs.writeFileSync(path.join(shareA, CATALOG), edition, "utf8");

  const tries = new Map();
  let threw = "";
  const ioA = diskIo((from, to) => {
    const n = (tries.get(to) || 0) + 1;
    tries.set(to, n);
    if (n <= 2) throw busy("EPERM");
    fs.renameSync(from, to);
  });
  const progA = syncer.createFolderProgram({
    team: TEAM, folder: shareA, mirror: mirrorA, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks, io: ioA
  });
  try { progA.syncOnce(); }
  catch (e) { threw = (e && e.code) || String(e); }
  const landed = fs.existsSync(path.join(mirrorA, CATALOG)) && fs.readFileSync(path.join(mirrorA, CATALOG), "utf8") === edition
    && fs.existsSync(path.join(mirrorA, "etiuda-team.json"));
  check(landed && !threw,
    "974r a rename that refuses twice and then succeeds lands the file: landed " + landed + (threw ? ", threw " + threw : ""));

  const shareB = path.join(LAB, "share-b");
  const mirrorB = path.join(LAB, "mirror-b");
  fs.mkdirSync(shareB, { recursive: true });
  fs.mkdirSync(mirrorB, { recursive: true });
  fs.writeFileSync(path.join(shareB, "etiuda-team.json"), teamText(), "utf8");
  fs.writeFileSync(path.join(shareB, CATALOG), edition, "utf8");
  const said = [];
  let catalogRenames = 0;
  let refuse = true;
  const ioB = diskIo((from, to) => {
    if (path.basename(to) === CATALOG) {
      catalogRenames++;
      if (refuse) throw busy("EPERM");
    }
    fs.renameSync(from, to);
  });
  const progB = syncer.createFolderProgram({
    team: TEAM, folder: shareB, mirror: mirrorB, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks,
    logger: s => said.push(String(s)), io: ioB
  });
  let threwB = "", after = null, retried = 0;
  try {
    progB.syncOnce();
    const first = catalogRenames;
    const held = stagedTmps(mirrorB);
    const heldBytes = held.length === 1 && fs.readFileSync(held[0], "utf8") === edition;
    const saidOnce = said.filter(l => l.indexOf("EPERM") >= 0 && l.indexOf(CATALOG) >= 0 && l.indexOf("stayed staged") >= 0).length === 1;
    const teamLanded = fs.existsSync(path.join(mirrorB, "etiuda-team.json"));
    const catalogAbsent = !fs.existsSync(path.join(mirrorB, CATALOG));
    progB.syncOnce();
    retried = catalogRenames - first;
    const stillSaidOnce = said.filter(l => l.indexOf("stayed staged") >= 0).length === 1;
    const stillHeld = !fs.existsSync(path.join(mirrorB, CATALOG)) && stagedTmps(mirrorB).length === 1;
    refuse = false;
    progB.syncOnce();
    const bytes = fs.existsSync(path.join(mirrorB, CATALOG)) && fs.readFileSync(path.join(mirrorB, CATALOG), "utf8") === edition;
    const shareUntouched = fs.readFileSync(path.join(shareB, CATALOG), "utf8") === edition;
    const cleared = stagedTmps(mirrorB).length === 0;
    after = { first, heldBytes, saidOnce, teamLanded, catalogAbsent, retried, stillSaidOnce, stillHeld, bytes, shareUntouched, cleared };
  } catch (e) {
    threwB = (e && e.code) || String(e);
  }
  const ok = !!after && !threwB && after.first > 0 && after.heldBytes && after.saidOnce && after.teamLanded && after.catalogAbsent
    && after.retried > 0 && after.stillSaidOnce && after.stillHeld && after.bytes && after.shareUntouched && after.cleared;
  check(ok,
    "974r a rename that keeps refusing leaves the worker alive, the file staged and the refusal said, and the next scan retries it: "
    + (after ? JSON.stringify(after) : "no result") + (threwB ? ", threw " + threwB : ""));

  if (asserted !== EXPECTED) check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  console.log("syncer-rename-busy: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  process.exit(Math.min(failed, 63));
}

if (process.argv[2] === "--read-only-scene") {
  readOnlyScene(process.argv[3], process.argv[4]).then(
    out => { process.stdout.write("#result " + JSON.stringify(out) + "\n"); process.exit(0); },
    e => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1); });
} else {
  main();
}
