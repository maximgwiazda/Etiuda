/* A rename out of the mirror's .staging folder that the system refuses for a moment is asked again.
 * One that keeps refusing leaves that file staged, is said, and is tried at the next scan. The worker stays up.
 * A share file marked read-only lands writable, and a mirror copy already marked takes the next landing (998).
 * An outbox read refused for a moment still clears what landed; one refused every time keeps the record for the next pass.
 * A same-size rewrite that keeps its stamp, as a FAT volume's two-second tick does, lands where the stamp was within 3 s of
 * the reading before it, by the worker and by the program alike; one stamped a minute before is still passed over (955).
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
import { monitorEventLoopDelay } from "node:perf_hooks";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 21;

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
  let othersKept = () => true;
  try {
    if (kind === "land") {
      /* The worker's copy, as a desk runs it. */
      fs.writeFileSync(shareRing, ringText("first"), "utf8");
      fs.chmodSync(shareRing, 0o444);
      /* The boundary: the team file and another desk's file on the share, marked read-only, keep their marks. */
      const otherFile = path.join(share, "desks", "k-" + crypto.randomBytes(8).toString("hex"), "x.ec");
      fs.mkdirSync(path.dirname(otherFile), { recursive: true });
      fs.writeFileSync(otherFile, "another desk's", "utf8");
      for (const p of [path.join(share, "etiuda-team.json"), otherFile]) { fs.chmodSync(p, 0o444); marked.push(p); }
      othersKept = () => writable(path.join(share, "etiuda-team.json")) === false && writable(otherFile) === false;
      const ctl = new syncer.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: LEAD, checks, pollMs: 200, logger: s => said.push(String(s)) });
      try {
        ctl.start();
        out.landed = await until(() => holds(mirrorRing, "first"), 10000);
        out.mirrorWritable = writable(mirrorRing);
        out.shareStillMarked = writable(shareRing) === false && othersKept();
        fs.chmodSync(shareRing, 0o666);
        fs.writeFileSync(shareRing, ringText("second, longer"), "utf8");
        out.next = await until(() => holds(mirrorRing, "second, longer"), 10000);
      } finally {
        try { ctl.stop(); } catch {}
      }
    } else if (kind === "tick" || kind === "tick-settled") {
      /* The ring rewritten at its own size and given back its stamp. A stamp ahead of the clock is one no reading has passed by
         3 s, however slowly the worker starts; the settled one is a minute behind it. */
      const stamp = Math.floor(Date.now() / 1000) + (kind === "tick" ? 20 : -60);
      fs.writeFileSync(shareRing, ringText("tick-aaaa"), "utf8");
      fs.utimesSync(shareRing, stamp, stamp);
      const ctl = new syncer.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: LEAD, checks, pollMs: 200, logger: s => said.push(String(s)) });
      try {
        ctl.start();
        out.landed = await until(() => holds(mirrorRing, "tick-aaaa"), 10000);
        fs.writeFileSync(shareRing, ringText("tick-bbbb"), "utf8");
        fs.utimesSync(shareRing, stamp, stamp);
        out.sameStamp = fs.statSync(shareRing).mtimeMs === stamp * 1000;
        out.next = await until(() => holds(mirrorRing, "tick-bbbb"), kind === "tick" ? 6000 : 1500);
      } finally {
        try { ctl.stop(); } catch {}
      }
    } else if (kind === "tick-program") {
      /* The program a desk runs where no worker starts: one scan lands the ring, a rewrite inside its stamp lands at the next. */
      const stamp = Math.floor(Date.now() / 1000) + 20;
      fs.writeFileSync(shareRing, ringText("tick-aaaa"), "utf8");
      fs.utimesSync(shareRing, stamp, stamp);
      const prog = syncer.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks, logger: s => said.push(String(s)) });
      prog.syncOnce();
      out.landed = holds(mirrorRing, "tick-aaaa");
      fs.writeFileSync(shareRing, ringText("tick-bbbb"), "utf8");
      fs.utimesSync(shareRing, stamp, stamp);
      out.sameStamp = fs.statSync(shareRing).mtimeMs === stamp * 1000;
      prog.syncOnce();
      out.next = holds(mirrorRing, "tick-bbbb");
      if (typeof prog.stop === "function") prog.stop();
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
      const past = Math.floor(Date.now() / 1000) - 60;
      fs.utimesSync(from, past, past);
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
    } else if (kind === "stall" || kind === "transient") {
      const cjsFs = nodeRequire("node:fs");
      const edition = editionText();
      fs.writeFileSync(path.join(share, CATALOG), edition, "utf8");
      const realRename = cjsFs.renameSync;
      let attempts = 0, firstAt = 0;
      cjsFs.renameSync = function (from, to) {
        if (path.basename(String(to)) === CATALOG) {
          attempts++;
          if (!firstAt) firstAt = Date.now();
          if (kind === "stall" || attempts <= 2) throw busy("EPERM");
        }
        return realRename.call(cjsFs, from, to);
      };
      const hist = monitorEventLoopDelay({ resolution: 10 });
      let lastTick = Date.now(), tickMaxGapMs = 0;
      const ticker = setInterval(() => {
        const now = Date.now();
        const gap = now - lastTick;
        if (gap > tickMaxGapMs) tickMaxGapMs = gap;
        lastTick = now;
      }, 10);
      hist.enable();
      const pollMs = 5000;
      const ctl = new syncer.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks, pollMs, logger: s => said.push(String(s)) });
      try {
        ctl.start();
        if (kind === "stall") {
          const end = Date.now() + 8000;
          let kicked = false;
          while ((attempts < 2 || Date.now() - firstAt < 600 || !kicked) && Date.now() < end) {
            await sleep(25);
            if (!kicked && firstAt && Date.now() - firstAt >= 200) { kicked = true; ctl.kick(); }
          }
          await sleep(100);
          out.stagedKept = stagedTmps(mirror).length === 1;
          out.catalogAbsent = !fs.existsSync(path.join(mirror, CATALOG));
        } else {
          out.landed = await until(() => fs.existsSync(path.join(mirror, CATALOG)) && fs.readFileSync(path.join(mirror, CATALOG), "utf8") === edition, 4000);
          out.landAfterFirstMs = firstAt ? Date.now() - firstAt : null;
          out.noTemp = stagedTmps(mirror).length === 0;
        }
        out.attempts = attempts;
      } finally {
        clearInterval(ticker);
        hist.disable();
        cjsFs.renameSync = realRename;
        try { ctl.stop(); } catch {}
      }
      out.histMaxMs = Math.round(hist.max / 1e6);
      out.tickMaxGapMs = tickMaxGapMs;
      out.maxStallMs = Math.max(out.histMaxMs, out.tickMaxGapMs);
    } else if (kind === "copy-stall") {
      const cjsFs = nodeRequire("node:fs");
      const from = path.join(share, "desk-file.ec"), to = path.join(mirror, "desk-file.ec");
      fs.writeFileSync(from, "from the share", "utf8");
      const realRename = cjsFs.renameSync;
      let attempts = 0;
      cjsFs.renameSync = function (a, b) {
        if (path.resolve(String(b)) === path.resolve(to)) {
          attempts++;
          throw busy("EPERM");
        }
        return realRename.call(cjsFs, a, b);
      };
      const hist = monitorEventLoopDelay({ resolution: 10 });
      let lastTick = Date.now(), tickMaxGapMs = 0;
      const ticker = setInterval(() => {
        const now = Date.now();
        const gap = now - lastTick;
        if (gap > tickMaxGapMs) tickMaxGapMs = gap;
        lastTick = now;
      }, 10);
      hist.enable();
      try {
        await sleep(20);
        try { syncer.copyClear(from, to); } catch (e) { out.threw = (e && e.code) || String(e); }
        await sleep(20);
      } finally {
        clearInterval(ticker);
        hist.disable();
        cjsFs.renameSync = realRename;
      }
      out.attempts = attempts;
      out.histMaxMs = Math.round(hist.max / 1e6);
      out.tickMaxGapMs = tickMaxGapMs;
      out.maxStallMs = Math.max(out.histMaxMs, out.tickMaxGapMs);
    } else if (kind === "outbox-read-once") {
      const cjsFs = nodeRequire("node:fs");
      const deskId = "k-" + crypto.randomBytes(8).toString("hex");
      const rel = "desks/" + deskId + "/outbox-busy.ec";
      const mirrorFile = path.join(mirror, rel);
      const shareFile = path.join(share, rel);
      fs.mkdirSync(path.dirname(mirrorFile), { recursive: true });
      fs.writeFileSync(mirrorFile, "outbox-read-payload", "utf8");
      syncer.noteOwed(mirror, rel);
      const realReadFile = cjsFs.readFileSync;
      let outboxReads = 0, firstAt = 0, owedEvents = 0;
      const outboxCleared = () => {
        try {
          const doc = JSON.parse(realReadFile.call(cjsFs, path.join(mirror, ".outbox.json"), "utf8"));
          return !(doc && doc.owe && doc.owe[rel]);
        } catch { return false; }
      };
      cjsFs.readFileSync = function (p, enc) {
        if (path.basename(String(p)) === ".outbox.json" && fs.existsSync(shareFile)) {
          outboxReads++;
          if (!firstAt) firstAt = Date.now();
          if (outboxReads === 1) throw busy("EBUSY");
        }
        return realReadFile.call(cjsFs, p, enc);
      };
      const hist = monitorEventLoopDelay({ resolution: 10 });
      let lastTick = Date.now(), tickMaxGapMs = 0;
      const ticker = setInterval(() => {
        const now = Date.now();
        const gap = now - lastTick;
        if (gap > tickMaxGapMs) tickMaxGapMs = gap;
        lastTick = now;
      }, 10);
      hist.enable();
      const ctl = new syncer.FolderSyncerController({
        team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks, pollMs: 150,
        logger: s => said.push(String(s)), onOwed: () => { owedEvents++; }
      });
      try {
        ctl.program.landed([{ rel, del: false, ok: false, code: "EACCES" }]);
        owedEvents = 0;
        ctl.start();
        out.cleared = await until(outboxCleared, 1500);
        out.clearAfterFirstMs = firstAt ? Date.now() - firstAt : null;
        out.outboxReads = outboxReads;
        out.owedEvents = owedEvents;
        out.shareMatches = fs.existsSync(shareFile) && realReadFile.call(cjsFs, shareFile, "utf8") === "outbox-read-payload";
        out.saidKept = said.filter(l => l.indexOf("is kept on this computer") >= 0 && l.indexOf(rel) >= 0).length;
        out.saidReached = said.filter(l => l.indexOf("has reached the team's folder") >= 0 && l.indexOf(rel) >= 0).length;
      } finally {
        clearInterval(ticker);
        hist.disable();
        cjsFs.readFileSync = realReadFile;
        try { ctl.stop(); } catch {}
      }
      out.owedAfter = syncer.owedAt(mirror, rel);
      out.histMaxMs = Math.round(hist.max / 1e6);
      out.tickMaxGapMs = tickMaxGapMs;
      out.maxStallMs = Math.max(out.histMaxMs, out.tickMaxGapMs);
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
function plantScene(tag, file, kind, swap) {
  const dir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
  const src = path.join(ROOT, "shell", "folder");
  const before = fs.readFileSync(path.join(src, file));
  for (const f of ["syncer.cjs", "syncer-worker.cjs"]) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  const lines = before.toString("utf8").split("\n");
  const at = lines.findIndex(l => l.includes("plant:" + tag));
  if (at < 0) return { found: false };
  if (swap) lines[at] = swap(lines[at], lines); else lines.splice(at, 1);
  fs.writeFileSync(path.join(dir, file), lines.join("\n"), "utf8");
  const res = runScene(kind, dir);
  return { found: true, res, same: fs.readFileSync(path.join(src, file)).equals(before) };
}
const landGreen = r => r.landed === true && r.mirrorWritable === true && r.shareStillMarked === true && r.next === true && r.refusedSaid === 0;
const thawGreen = r => r.thawed === true && r.mirrorWritable === true && r.refusedSaid === 0;
const copyGreen = r => !r.threw && r.bytes === true && r.copyWritable === true && r.timeKept === true && r.sourceStillMarked === true && r.noTemp === true;
const tickGreen = r => !r.killed && !r.noResult && r.landed === true && r.sameStamp === true && r.next === true;
const settledGreen = r => !r.killed && !r.noResult && r.landed === true && r.sameStamp === true && r.next === false;
const outboxReadGreen = r => !r.killed && !r.noResult && r.cleared === true && r.owedAfter === false
  && r.shareMatches === true && r.outboxReads >= 2 && r.owedEvents === 1 && r.saidKept === 1 && r.saidReached === 1 && r.maxStallMs < 50;

async function main() {
  const land = runScene("land");
  check(landGreen(land),
    "998a a share file marked read-only lands in the mirror writable, the share keeps its mark, and its next version lands over it, the team file and another desk's file on the share keeping their marks too: "
    + JSON.stringify(land));
  const thaw = runScene("thaw");
  check(thawGreen(thaw), "998b a mirror copy left read-only by an older desk takes the next landing and is writable after it: " + JSON.stringify(thaw));
  const copy = runScene("copy");
  check(copyGreen(copy), "998c a copy between the share and this computer replaces a copy marked read-only and hidden, and holds the bytes and"
    + " the last-write time without the mark, the source keeping its own: " + JSON.stringify(copy));
  const stall = runScene("stall");
  check(!stall.killed && !stall.noResult && stall.attempts >= 2 && stall.stagedKept === true && stall.catalogAbsent === true
    && stall.refusedSaid === 1 && stall.maxStallMs < 50,
    "998r a landing whose rename refuses for good keeps the main thread's longest stall under 50 ms across scans: " + JSON.stringify(stall));
  const transient = runScene("transient");
  check(!transient.killed && !transient.noResult && transient.landed === true && transient.noTemp === true
    && transient.attempts === 3 && transient.landAfterFirstMs < 1500 && transient.maxStallMs < 50,
    "998s a landing whose rename refuses twice still lands soon without waiting for the next scan and under 50 ms stall: " + JSON.stringify(transient));
  const copyStall = runScene("copy-stall");
  check(!copyStall.killed && !copyStall.noResult && copyStall.threw === "EPERM" && copyStall.maxStallMs < 50,
    "998t copyClear refused on the main thread returns under 50 ms without blocking the event loop: " + JSON.stringify(copyStall));
  const tick = runScene("tick");
  check(tickGreen(tick), "955n the worker reads again a share file stamped within 3 s of its reading, so a rewrite of the same size and stamp lands: " + JSON.stringify(tick));
  const tickProgram = runScene("tick-program");
  check(tickGreen(tickProgram), "955o the program a desk runs without a worker lands the same rewrite at its next scan: " + JSON.stringify(tickProgram));
  const settled = runScene("tick-settled");
  check(settledGreen(settled), "955p control: a file stamped a minute before its reading is still passed over at the same size and stamp: " + JSON.stringify(settled));
  const outboxReadOnce = runScene("outbox-read-once");
  check(outboxReadGreen(outboxReadOnce),
    "998u landed clears the outbox record and its waiting line when the outbox read is refused once with EBUSY and then allowed, under 50 ms stall: "
    + JSON.stringify(outboxReadOnce));
  const plants = [
    ["stage-clear-mark", "syncer-worker.cjs", "land", landGreen, "998d lifting plant:stage-clear-mark lands a read-only share file read-only"],
    ["land-clear-mark", "syncer.cjs", "thaw", thawGreen, "998e lifting plant:land-clear-mark leaves a read-only mirror copy refusing every landing"],
    ["copy-clear-mark", "syncer.cjs", "copy", copyGreen, "998f lifting plant:copy-clear-mark leaves a marked copy refusing the next"],
    ["outbox-read-retry", "syncer.cjs", "outbox-read-once", outboxReadGreen, "998v lifting plant:outbox-read-retry leaves a single refused outbox read un-cleared"],
    ["stamp-settled", "syncer.cjs", "tick", tickGreen, "955q lifting plant:stamp-settled leaves the worker passing over the rewrite inside the stamp"],
  ];
  plants.push(["stage-clear-mark", "syncer-worker.cjs", "land", landGreen,
    "998m control: a worker that clears the share's file in place of its own staged copy turns 998a red",
    l => l.replace("S.clearReadOnly(tmpFile)", "S.clearReadOnly(srcFile)")]);
  if (process.platform === "win32") {
    plants.push(["copy-clear-time", "syncer.cjs", "copy", copyGreen,
      "998g control: a copy without CopyFile or utimesSync loses the source's last-write time",
      (l, lines) => {
        const c = lines.findIndex(x => x.includes("fs.copyFileSync(from, tmp);"));
        if (c >= 0) lines[c] = "    fs.writeFileSync(tmp, fs.readFileSync(from));";
        return "    /* plant:copy-clear-time lifted */";
      }]);
  } else {
    plants.push(["copy-clear-time", "syncer.cjs", "copy", copyGreen,
      "998g lifting plant:copy-clear-time loses the source's last-write time off Windows"]);
  }
  for (const [tag, file, kind, green, line, swap] of plants) {
    if (PLANTS_OFF) { asserted++; console.log("  skip " + line); continue; }
    const p = plantScene(tag, file, kind, swap);
    check(p.found && !green(p.res) && p.same, line + ": " + JSON.stringify(p));
  }
  {
    const line = "998h control: utimesSync keeps the source's last-write time even when the copy writes now";
    if (PLANTS_OFF) { asserted++; console.log("  skip " + line); }
    else {
      const p = plantScene("copy-clear-time", "syncer.cjs", "copy", (l, lines) => {
        const c = lines.findIndex(x => x.includes("fs.copyFileSync(from, tmp);"));
        if (c >= 0) lines[c] = "    fs.writeFileSync(tmp, fs.readFileSync(from));";
        return l.replace("if (process.platform !== \"win32\") ", "");
      });
      check(p.found && copyGreen(p.res) && p.same, line + ": " + JSON.stringify(p));
    }
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
  const endA = Date.now() + 2000;
  while (!fs.existsSync(path.join(mirrorA, CATALOG)) && Date.now() < endA) await sleep(25);
  if (typeof progA.stop === "function") progA.stop();
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

  if (typeof progB.stop === "function") progB.stop();

  const shareC = path.join(LAB, "share-c");
  const mirrorC = path.join(LAB, "mirror-c");
  const deskC = "k-" + crypto.randomBytes(8).toString("hex");
  const relC = "desks/" + deskC + "/always.ec";
  const relOther = "desks/" + deskC + "/other.ec";
  fs.mkdirSync(shareC, { recursive: true });
  fs.mkdirSync(path.join(mirrorC, "desks", deskC), { recursive: true });
  fs.writeFileSync(path.join(mirrorC, relC), "always-bytes", "utf8");
  fs.writeFileSync(path.join(mirrorC, relOther), "other-bytes", "utf8");
  const shaC = crypto.createHash("sha256").update(Buffer.from("always-bytes", "utf8")).digest("hex");
  let refuseOutboxRead = false, readTriesC = 0, owedEventsC = 0;
  const ioC = {
    readdir: d => fs.readdirSync(d),
    stat: p => fs.statSync(p),
    readFile: (p, enc) => {
      if (refuseOutboxRead && path.basename(String(p)) === ".outbox.json") {
        readTriesC++;
        throw busy("EBUSY");
      }
      return fs.readFileSync(p, enc);
    },
    writeFile: (p, data) => fs.writeFileSync(p, data),
    unlink: p => fs.unlinkSync(p),
    mkdir: d => fs.mkdirSync(d, { recursive: true }),
    exists: p => fs.existsSync(p),
    rename: (a, b) => fs.renameSync(a, b)
  };
  const progC = syncer.createFolderProgram({
    team: TEAM, folder: shareC, mirror: mirrorC, pin: LEAD, keys: { 1: crypto.randomBytes(32) }, checks,
    io: ioC, logger: noop, onOwed: () => { owedEventsC++; }
  });
  let threwC = "";
  progC.owe(relC);
  progC.owe(relOther);
  const owedBeforeC = progC.isOwed(relC) && progC.isOwed(relOther);
  refuseOutboxRead = true;
  try { progC.landed([{ rel: relC, sha: shaC, del: false, ok: true, size: 12, mtimeMs: 100 }]); }
  catch (e) { threwC = (e && e.code) || String(e); }
  await sleep(1250);
  const triesAt1250 = readTriesC;
  await sleep(150);
  const triesStable = readTriesC === triesAt1250;
  const owedWhileRefused = owedEventsC === 0;
  refuseOutboxRead = false;
  const keptBoth = progC.isOwed(relC) && progC.isOwed(relOther);
  progC.landed([{ rel: relC, sha: shaC, del: false, ok: true, size: 12, mtimeMs: 100 }]);
  const clearedNext = !progC.isOwed(relC) && progC.isOwed(relOther) && owedEventsC === 1;
  if (typeof progC.stop === "function") progC.stop();
  check(!threwC && owedBeforeC && triesAt1250 === 20 && triesStable && owedWhileRefused && keptBoth && clearedNext,
    "998w control: an outbox read refused every time stops at 20 tries, leaves the record and sibling in place, and clears on the next pass: "
    + JSON.stringify({ threwC, owedBeforeC, triesAt1250, triesStable, owedWhileRefused, keptBoth, clearedNext }));

  if (asserted !== EXPECTED) check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  console.log("syncer-rename-busy: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  process.exit(Math.min(failed, 63));
}

if (process.argv[2] === "--read-only-scene") {
  readOnlyScene(process.argv[3], process.argv[4]).then(
    out => { process.stdout.write("#result " + JSON.stringify(out) + "\n"); process.exit(0); },
    e => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1); });
} else {
  main().catch(e => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(78); });
}
