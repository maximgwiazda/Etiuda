/* A refused read of the outbox (.outbox.json) decides nothing:
 * - Step 1 (team file and conflict siblings), Step 3 (editions), pending queue, and rename retry never land
 *   over a path whose debt cannot be read, and never drop or forget the staged copy; the next scan judges it again.
 * - Step 4 never removes a mirror file while the outbox cannot be read, and ownStays never records a take-back.
 * - writeOutboxRetrying never overwrites an unreadable outbox with an empty one.
 * - ENOENT (outbox truly absent) stays "nothing owed".
 *
 *     node tests/syncer-outbox-unread.mjs
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 33;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  asserted++;
  console.log("  skip " + line);
}

const LAB = createLab("etiuda-syncer-outbox-unread-");
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
const K1 = crypto.randomBytes(32);
const K2 = crypto.randomBytes(32);
const CATALOG = "wick-board.ec";
const OWN_ID = "k-" + crypto.randomBytes(8).toString("hex");

function teamText(rev, epoch = 1) {
  return JSON.stringify(sign({
    format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["wick-board", "sealed"],
    lead: { keyId: LEAD.keyId, public: LEAD.public },
    sealed: true, epoch, rev, roster: []
  }, pair.privateKey, LEAD.keyId));
}
function editionText(rev, id = "wick-board") {
  return JSON.stringify(sign({
    format: 2, kind: "etiuda-catalog", id, rev, name: "Wick Board", date: "2026-04-01",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-wick", shelf: "t-op", bodyShape: "plain", title: { en: "Wick " + rev }, body: { en: "A wick." } }]
  }, pair.privateKey, LEAD.keyId));
}
function seal(key, epoch, docText) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const aad = Buffer.from("etiuda-sealed\n" + TEAM + "\n" + epoch, "utf8");
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(docText, "utf8"), c.final(), c.getAuthTag()]);
  return JSON.stringify({
    format: 2, kind: "etiuda-sealed", team: TEAM, epoch,
    nonce: nonce.toString("hex"), ct: ct.toString("hex")
  }, null, 1) + "\n";
}
function busy(code = "EBUSY") {
  const e = new Error(code);
  e.code = code;
  return e;
}
function stageCopy(mirror, rel, text) {
  const dir = path.join(mirror, ".staging");
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, "staged-" + crypto.randomBytes(4).toString("hex") + ".tmp");
  fs.writeFileSync(tmp, text, "utf8");
  const st = fs.statSync(tmp);
  return { relPath: rel, tmpPath: tmp, size: st.size, mtimeMs: st.mtimeMs };
}
function stagedTmps(mirror) {
  const dir = path.join(mirror, ".staging");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith(".tmp")).map(n => path.join(dir, n));
}
function outboxIo(state) {
  return {
    readdir: d => fs.readdirSync(d),
    stat: p => fs.statSync(p),
    readFile: (p, enc) => {
      if (state.refuse && path.basename(String(p)) === ".outbox.json") {
        state.reads = (state.reads || 0) + 1;
        if (typeof state.refuse === "function") state.refuse(state.reads);
        else throw busy(typeof state.refuse === "string" ? state.refuse : "EBUSY");
      }
      return fs.readFileSync(p, enc);
    },
    writeFile: (p, data) => fs.writeFileSync(p, data),
    unlink: p => fs.unlinkSync(p),
    mkdir: d => fs.mkdirSync(d, { recursive: true }),
    exists: p => fs.existsSync(p),
    rename: (a, b) => {
      if (state.rename) state.rename(a, b);
      else fs.renameSync(a, b);
    }
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const emptyOutbox = JSON.stringify({ kind: "etiuda-folder-outbox", v: 1, owe: {}, floors: {} });

function makeDirs(name) {
  const base = fs.mkdtempSync(path.join(LAB, name + "-"));
  const share = path.join(base, "share");
  const mirror = path.join(base, "mirror");
  fs.mkdirSync(share, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  return { share, mirror };
}

function teamApplyScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const held = teamText(1), newer = teamText(2);
  fs.writeFileSync(path.join(mirror, "etiuda-team.json"), held, "utf8");
  fs.writeFileSync(path.join(share, "etiuda-team.json"), newer, "utf8");
  if (owe) mod.noteOwed(mirror, "etiuda-team.json");
  else fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    const item = stageCopy(mirror, "etiuda-team.json", newer);
    const listing = [["etiuda-team.json", { size: item.size, mtimeMs: item.mtimeMs }]];
    const r1 = prog.applyScan({ answers: true, listing, staged: [item] });
    const heldDuring = fs.readFileSync(path.join(mirror, "etiuda-team.json"), "utf8") === held;
    const stagedKept = fs.existsSync(item.tmpPath);
    const notForgotten = prog.held().forget.indexOf("etiuda-team.json") < 0;
    const notApplied1 = r1.applied.indexOf("etiuda-team.json") < 0;

    state.refuse = false;
    const r2 = prog.applyScan({ answers: true, listing, staged: [] });
    const bytesAfter = fs.readFileSync(path.join(mirror, "etiuda-team.json"), "utf8");
    const stagedAfter = fs.existsSync(item.tmpPath);
    const forgetAfter = prog.held().forget.indexOf("etiuda-team.json") >= 0;
    return {
      heldDuring, stagedKept, notForgotten, notApplied1,
      keptOwnAfter: bytesAfter === held, landedAfter: bytesAfter === newer,
      stagedAfter, forgetAfter, applied2: r2.applied.indexOf("etiuda-team.json") >= 0
    };
  } finally { prog.stop(); }
}

function siblingApplyScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const sib = "etiuda-team (conflicted copy).json";
  const held = teamText(1), newer = teamText(2);
  fs.writeFileSync(path.join(mirror, "etiuda-team.json"), held, "utf8");
  fs.writeFileSync(path.join(share, "etiuda-team.json"), held, "utf8");
  fs.writeFileSync(path.join(share, sib), newer, "utf8");
  if (owe) mod.noteOwed(mirror, "etiuda-team.json");
  else fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    const item = stageCopy(mirror, sib, newer);
    const listing = [["etiuda-team.json", { size: 1, mtimeMs: 1 }], [sib, { size: item.size, mtimeMs: item.mtimeMs }]];
    prog.applyScan({ answers: true, listing, staged: [item] });
    const absentDuring = !fs.existsSync(path.join(mirror, sib));
    const revDuring = prog.state().mirrorRev;
    const stagedKept = fs.existsSync(item.tmpPath);
    const notForgotten = prog.held().forget.indexOf(sib) < 0;

    state.refuse = false;
    prog.applyScan({ answers: true, listing, staged: [] });
    const existsAfter = fs.existsSync(path.join(mirror, sib));
    const revAfter = prog.state().mirrorRev;
    return { absentDuring, revDuring, stagedKept, notForgotten, existsAfter, revAfter };
  } finally { prog.stop(); }
}

function editionApplyScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const held = editionText(2), newer = editionText(3);
  fs.writeFileSync(path.join(mirror, CATALOG), held, "utf8");
  fs.writeFileSync(path.join(share, CATALOG), newer, "utf8");
  if (owe) mod.noteOwed(mirror, CATALOG);
  else fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    const item = stageCopy(mirror, CATALOG, newer);
    const listing = [[CATALOG, { size: item.size, mtimeMs: item.mtimeMs }]];
    const r1 = prog.applyScan({ answers: true, listing, staged: [item] });
    const heldDuring = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === held;
    const stagedKept = fs.existsSync(item.tmpPath);
    const notForgotten = prog.held().forget.indexOf(CATALOG) < 0;
    const notApplied1 = r1.applied.indexOf(CATALOG) < 0;

    state.refuse = false;
    const r2 = prog.applyScan({ answers: true, listing, staged: [] });
    const bytesAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8");
    const stagedAfter = fs.existsSync(item.tmpPath);
    const forgetAfter = prog.held().forget.indexOf(CATALOG) >= 0;
    return {
      heldDuring, stagedKept, notForgotten, notApplied1,
      keptOwnAfter: bytesAfter === held, landedAfter: bytesAfter === newer,
      stagedAfter, forgetAfter, applied2: r2.applied.indexOf(CATALOG) >= 0
    };
  } finally { prog.stop(); }
}

function editionSyncOnceScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const held = editionText(2), newer = editionText(3);
  fs.writeFileSync(path.join(mirror, CATALOG), held, "utf8");
  const shareFile = path.join(share, CATALOG);
  fs.writeFileSync(shareFile, newer, "utf8");
  const past = new Date(Date.now() - 60000);
  fs.utimesSync(shareFile, past, past);
  if (owe) mod.noteOwed(mirror, CATALOG);
  else fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    prog.syncOnce();
    const heldDuring = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === held;
    const stagedDuring = stagedTmps(mirror).length === 1;
    state.refuse = false;
    if (owe) {
      /* Keep the share unavailable for flushOwed so the owed record stays owed during syncOnce. */
      fs.unlinkSync(shareFile);
    }
    prog.syncOnce();
    const bytesAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8");
    const stagedCleared = stagedTmps(mirror).length === 0;
    return {
      heldDuring, stagedDuring, stagedCleared,
      keptOwnAfter: bytesAfter === held, landedAfter: bytesAfter === newer
    };
  } finally { prog.stop(); }
}

function step4Scene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const rel = "absent-4.ec";
  fs.writeFileSync(path.join(mirror, rel), editionText(1), "utf8");
  if (owe) mod.noteOwed(mirror, rel);
  else fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    prog.applyScan({ answers: true, listing: [], staged: [] });
    prog.applyScan({ answers: true, listing: [], staged: [] });
    prog.applyScan({ answers: true, listing: [], staged: [] });
    const keptWhileRefused = fs.existsSync(path.join(mirror, rel));
    state.refuse = false;
    prog.applyScan({ answers: true, listing: [], staged: [] });
    prog.applyScan({ answers: true, listing: [], staged: [] });
    const existsAfter = fs.existsSync(path.join(mirror, rel));
    return { keptWhileRefused, existsAfter };
  } finally { prog.stop(); }
}

function pendingScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const rel = "sealed.ec";
  const oldBytes = seal(K1, 1, editionText(2, "sealed"));
  const newBytes = seal(K2, 2, editionText(3, "sealed"));
  fs.writeFileSync(path.join(mirror, "etiuda-team.json"), teamText(1, 1), "utf8");
  fs.writeFileSync(path.join(mirror, rel), oldBytes, "utf8");
  fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  let key2 = null;
  const state = { refuse: false };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keyFor: e => (e === 1 ? K1 : (e === 2 ? key2 : null)),
    checks, io: outboxIo(state), logger: noop
  });
  try {
    const item = stageCopy(mirror, rel, newBytes);
    prog.applyScan({ answers: true, listing: [[rel, { size: item.size, mtimeMs: item.mtimeMs }]], staged: [item] });
    const parked = prog.state().pendingLength === 1;

    /* Move mirrorEpoch to 2 before key2 arrives, so sealed.ec stays parked only for key2. */
    const tItem = stageCopy(mirror, "etiuda-team.json", teamText(2, 2));
    prog.applyScan({
      answers: true,
      listing: [["etiuda-team.json", { size: tItem.size, mtimeMs: tItem.mtimeMs }], [rel, { size: item.size, mtimeMs: item.mtimeMs }]],
      staged: [tItem]
    });

    /* Key2 arrives, and if owed, record debt before refusing reads. */
    key2 = K2;
    if (owe) mod.noteOwed(mirror, rel);
    state.refuse = true;
    prog.applyScan({
      answers: true,
      listing: [["etiuda-team.json", { size: tItem.size, mtimeMs: tItem.mtimeMs }], [rel, { size: item.size, mtimeMs: item.mtimeMs }]],
      staged: []
    });
    const keptWhileRefused = fs.readFileSync(path.join(mirror, rel), "utf8") === oldBytes;
    const stillPending = prog.state().pendingLength === 1;
    const stagedStillThere = fs.existsSync(item.tmpPath);

    state.refuse = false;
    prog.applyScan({ answers: true, listing: [[rel, { size: item.size, mtimeMs: item.mtimeMs }]], staged: [] });
    const bytesAfter = fs.readFileSync(path.join(mirror, rel), "utf8");
    const pendingAfter = prog.state().pendingLength;
    return {
      parked, keptWhileRefused, stillPending, stagedStillThere,
      keptOwnAfter: bytesAfter === oldBytes, landedAfter: bytesAfter === newBytes, pendingAfter
    };
  } finally { prog.stop(); }
}

async function retryScene(mod, checks, name, owe) {
  const { share, mirror } = makeDirs(name);
  const held = editionText(2), newer = editionText(3);
  fs.writeFileSync(path.join(mirror, CATALOG), held, "utf8");
  fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  let blockRename = true;
  const state = {
    refuse: false,
    rename: (a, b) => {
      if (blockRename && path.basename(b) === CATALOG) throw busy("EBUSY");
      fs.renameSync(a, b);
    }
  };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: noop
  });
  try {
    const item = stageCopy(mirror, CATALOG, newer);
    const listing = [[CATALOG, { size: item.size, mtimeMs: item.mtimeMs }]];
    prog.applyScan({ answers: true, listing, staged: [item] });
    const queued = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === held && fs.existsSync(item.tmpPath);

    if (owe) mod.noteOwed(mirror, CATALOG);
    blockRename = false;
    state.refuse = true;
    await sleep(220);
    const heldDuringRetry = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === held;
    const stagedDuringRetry = fs.existsSync(item.tmpPath);

    state.refuse = false;
    prog.applyScan({ answers: true, listing, staged: [] });
    const bytesAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8");
    return {
      queued, heldDuringRetry, stagedDuringRetry,
      keptOwnAfter: bytesAfter === held, landedAfter: bytesAfter === newer
    };
  } finally { prog.stop(); }
}

function ownStaysScene(mod, checks, name) {
  const { share, mirror } = makeDirs(name);
  const rel = "desks/" + OWN_ID + "/own.ec";
  fs.mkdirSync(path.join(mirror, "desks", OWN_ID), { recursive: true });
  fs.writeFileSync(path.join(mirror, rel), editionText(1), "utf8");
  fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  const state = { refuse: true };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, own: OWN_ID, checks, io: outboxIo(state), logger: noop
  });
  try {
    prog.applyScan({ answers: true, listing: [], staged: [] });
    prog.applyScan({ answers: true, listing: [], staged: [] });
    prog.applyScan({ answers: true, listing: [], staged: [] });
    state.refuse = false;
    const owedWhileRefused = mod.owedList(mirror).length;
    const backWhileRefused = mod.takenBackList(mirror, "desks/" + OWN_ID + "/").length;
    prog.applyScan({ answers: true, listing: [], staged: [] });
    const owedAfterOneClear = mod.owedList(mirror).length;
    prog.applyScan({ answers: true, listing: [], staged: [] });
    const owedAfterAllowed = mod.owedList(mirror).map(x => x.rel);
    return { owedWhileRefused, backWhileRefused, owedAfterOneClear, owedAfterAllowed };
  } finally { prog.stop(); }
}

async function writeProtectScene(mod, name) {
  const { mirror } = makeDirs(name);
  const relA = "other.ec", relB = "added.ec";
  fs.writeFileSync(path.join(mirror, relA), editionText(1), "utf8");
  fs.writeFileSync(path.join(mirror, relB), editionText(2), "utf8");
  mod.noteOwed(mirror, relA);

  /* Non-busy read error (EIO) must throw and leave relA intact in .outbox.json. */
  const stateEio = { refuse: "EIO" };
  let threwEio = false;
  try { mod.noteOwed(mirror, relB, outboxIo(stateEio)); } catch { threwEio = true; }
  const keptRelA = mod.owedAt(mirror, relA) && !mod.owedAt(mirror, relB);

  /* Busy read error twice then allowed retries and keeps both relA and relB. */
  const stateBusy = {
    refuse: n => { if (n <= 2) throw busy("EBUSY"); }
  };
  mod.noteOwed(mirror, relB, outboxIo(stateBusy));
  const end = Date.now() + 1500;
  while (Date.now() < end && !mod.owedAt(mirror, relB)) await sleep(30);
  const bothKept = mod.owedAt(mirror, relA) && mod.owedAt(mirror, relB);
  return { threwEio, keptRelA, bothKept };
}

async function transientCanPassScene(mod, checks, name) {
  const { share, mirror } = makeDirs(name);
  const held = editionText(2), newer = editionText(3);
  const relA = "other.ec", relB = "added.ec";
  fs.writeFileSync(path.join(mirror, CATALOG), held, "utf8");
  fs.writeFileSync(path.join(mirror, relA), editionText(1), "utf8");
  fs.writeFileSync(path.join(mirror, relB), editionText(2), "utf8");
  mod.noteOwed(mirror, relA);
  const codes = ["EAGAIN", "EMFILE", "ENFILE", "EPERM", "EACCES", "EBUSY"];
  const logs = [];
  const state = { refuse: () => { if (state.code) throw busy(state.code); } };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: outboxIo(state), logger: m => logs.push(m)
  });
  let heldAll = true, stagedAll = true, notForgottenAll = true;
  try {
    const item = stageCopy(mirror, CATALOG, newer);
    const listing = [[CATALOG, { size: item.size, mtimeMs: item.mtimeMs }]];
    for (const c of codes) {
      state.code = c;
      const r = prog.applyScan({ answers: true, listing, staged: c === codes[0] ? [item] : [] });
      if (fs.readFileSync(path.join(mirror, CATALOG), "utf8") !== held || r.applied.indexOf(CATALOG) >= 0) heldAll = false;
      if (!fs.existsSync(item.tmpPath)) stagedAll = false;
      if (prog.held().forget.indexOf(CATALOG) >= 0) notForgottenAll = false;
    }
    const noLogsDuring = logs.length === 0;
    state.code = "";
    const rAfter = prog.applyScan({ answers: true, listing, staged: [] });
    const landedAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === newer && rAfter.applied.indexOf(CATALOG) >= 0;

    let calls = 0;
    const noteIo = outboxIo({
      refuse: () => {
        calls++;
        if (calls === 1) throw busy("EAGAIN");
        if (calls === 2) throw busy("EMFILE");
      }
    });
    let threwSync = false;
    try { mod.noteOwed(mirror, relB, noteIo); } catch { threwSync = true; }
    const end = Date.now() + 1500;
    while (Date.now() < end && !mod.owedAt(mirror, relB)) await sleep(30);
    const bothKept = !threwSync && mod.owedAt(mirror, relA) && mod.owedAt(mirror, relB);
    return { heldAll, stagedAll, notForgottenAll, noLogsDuring, landedAfter, bothKept };
  } finally { prog.stop(); }
}

function unreadableBoundScene(mod, checks, name) {
  const { share, mirror } = makeDirs(name);
  const rev2 = editionText(2), rev3 = editionText(3), rev4 = editionText(4);
  fs.writeFileSync(path.join(mirror, CATALOG), rev2, "utf8");
  fs.writeFileSync(path.join(mirror, ".outbox.json"), emptyOutbox, "utf8");
  let clockNow = 1_000_000;
  const logs = [];
  const state = { refuse: "EBUSY" };
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks,
    io: outboxIo(state), logger: m => logs.push(m), now: () => clockNow
  });
  try {
    const item1 = stageCopy(mirror, CATALOG, rev3);
    const listing1 = [[CATALOG, { size: item1.size, mtimeMs: item1.mtimeMs }]];
    prog.applyScan({ answers: true, listing: listing1, staged: [item1] });
    clockNow += 3 * 60 * 1000;
    prog.applyScan({ answers: true, listing: listing1, staged: [] });
    const silentBefore = logs.length === 0;
    clockNow += 1000;
    prog.applyScan({ answers: true, listing: listing1, staged: [] });
    const heldPast = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev2;
    const stagedPast = fs.existsSync(item1.tmpPath);
    const saidOnce = logs.length === 1;
    clockNow += 3000;
    prog.applyScan({ answers: true, listing: listing1, staged: [] });
    const notRepeated = logs.length === 1;

    state.refuse = false;
    clockNow += 3000;
    prog.applyScan({ answers: true, listing: listing1, staged: [] });
    const landedAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev3 && !fs.existsSync(item1.tmpPath);

    state.refuse = "EIO";
    clockNow += 3000;
    const item2 = stageCopy(mirror, CATALOG, rev4);
    const listing2 = [[CATALOG, { size: item2.size, mtimeMs: item2.mtimeMs }]];
    prog.applyScan({ answers: true, listing: listing2, staged: [item2] });
    const clearedOnGoodRead = logs.length === 1;
    clockNow += 3 * 60 * 1000 + 1000;
    prog.applyScan({ answers: true, listing: listing2, staged: [] });
    const heldSecond = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev3;
    const saidAgainAfterClear = logs.length === 2;
    clockNow += 3000;
    prog.applyScan({ answers: true, listing: listing2, staged: [] });
    const notRepeated2 = logs.length === 2;
    return {
      silentBefore, heldPast, stagedPast, saidOnce, notRepeated,
      landedAfter, clearedOnGoodRead, heldSecond, saidAgainAfterClear, notRepeated2
    };
  } finally { prog.stop(); }
}

function damagedOutboxScene(mod, checks, name) {
  const { share, mirror } = makeDirs(name);
  const { mirror: mirror2 } = makeDirs(name + "-note");
  const rev2 = editionText(2), rev3 = editionText(3), rev4 = editionText(4);
  fs.writeFileSync(path.join(mirror, CATALOG), rev2, "utf8");
  let clockNow = Date.now();
  const d = new Date(clockNow), p = n => String(n).padStart(2, "0");
  const day = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  const logs = [];
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks,
    io: outboxIo({}), logger: m => logs.push(m), now: () => clockNow
  });
  const outboxClean = dir => {
    const pOut = path.join(dir, ".outbox.json");
    if (!fs.existsSync(pOut)) return true;
    try { const d = JSON.parse(fs.readFileSync(pOut, "utf8")); return d && d.kind === "etiuda-folder-outbox" && d.v === 1 && Object.keys(d.owe || {}).length === 0; }
    catch { return false; }
  };
  try {
    const bad1 = "{not-json";
    fs.writeFileSync(path.join(mirror, ".outbox.json"), bad1, "utf8");
    const item1 = stageCopy(mirror, CATALOG, rev3);
    prog.applyScan({ answers: true, listing: [[CATALOG, { size: item1.size, mtimeMs: item1.mtimeMs }]], staged: [item1] });
    const aside1 = path.join(mirror, ".outbox.json." + day + ".aside");
    const aside1Ok = fs.existsSync(aside1) && fs.readFileSync(aside1, "utf8") === bad1 && outboxClean(mirror);
    const log1Ok = logs.length === 1 && /what this computer still owed the folder may need sending again/i.test(logs[0]);
    const landed1 = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev3;

    const bad2 = JSON.stringify({ kind: "wrong-kind", v: 1, owe: {} });
    fs.writeFileSync(path.join(mirror, ".outbox.json"), bad2, "utf8");
    clockNow += 60_000;
    const item2 = stageCopy(mirror, CATALOG, rev4);
    prog.applyScan({ answers: true, listing: [[CATALOG, { size: item2.size, mtimeMs: item2.mtimeMs }]], staged: [item2] });
    const aside2 = path.join(mirror, ".outbox.json." + day + ".2.aside");
    const aside2Ok = fs.existsSync(aside2) && fs.readFileSync(aside2, "utf8") === bad2 && outboxClean(mirror);
    const aside1Kept = fs.existsSync(aside1) && fs.readFileSync(aside1, "utf8") === bad1;
    const log2Ok = logs.length === 2 && /what this computer still owed the folder may need sending again/i.test(logs[1]);
    const landed2 = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev4;

    const bad3 = JSON.stringify({ kind: "etiuda-folder-outbox", v: 2, owe: {} });
    fs.writeFileSync(path.join(mirror, ".outbox.json"), bad3, "utf8");
    clockNow += 60_000;
    const item3 = stageCopy(mirror, CATALOG, editionText(5));
    prog.applyScan({ answers: true, listing: [[CATALOG, { size: item3.size, mtimeMs: item3.mtimeMs }]], staged: [item3] });
    const aside3 = path.join(mirror, ".outbox.json." + day + ".3.aside");
    const aside3FormatOk = fs.existsSync(aside3) && fs.readFileSync(aside3, "utf8") === bad3 && outboxClean(mirror);
    const log3Ok = logs.length === 3 && /what this computer still owed the folder may need sending again/i.test(logs[2]);
    const landed3 = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === editionText(5);

    const bad4 = "{damaged-note";
    fs.writeFileSync(path.join(mirror2, CATALOG), rev2, "utf8");
    fs.writeFileSync(path.join(mirror2, ".outbox.json"), bad4, "utf8");
    let noteNoEio = true;
    try { mod.noteOwed(mirror2, CATALOG); } catch { noteNoEio = false; }
    const noteOwedOk = mod.owedAt(mirror2, CATALOG);
    const dNow = new Date();
    const today = dNow.getFullYear() + "-" + p(dNow.getMonth() + 1) + "-" + p(dNow.getDate());
    const aside4 = path.join(mirror2, ".outbox.json." + today + ".aside");
    const aside4Ok = fs.existsSync(aside4) && fs.readFileSync(aside4, "utf8") === bad4;
    return { aside1Ok, log1Ok, landed1, aside2Ok, aside1Kept, log2Ok, landed2, aside3FormatOk, log3Ok, landed3, noteNoEio, noteOwedOk, aside4Ok };
  } finally { prog.stop(); }
}

function damagedRenameBusyScene(mod, checks, name) {
  const { share, mirror } = makeDirs(name);
  const rev2 = editionText(2), rev3 = editionText(3);
  fs.writeFileSync(path.join(mirror, CATALOG), rev2, "utf8");
  const badBusy = "corrupt-while-busy";
  fs.writeFileSync(path.join(mirror, ".outbox.json"), badBusy, "utf8");
  const logs = [];
  let blockRename = true;
  const state = {
    rename: (a, b) => {
      if (blockRename && path.basename(String(a)) === ".outbox.json") throw busy("EBUSY");
      fs.renameSync(a, b);
    }
  };
  const clockNow = Date.now();
  const d = new Date(clockNow), p = n => String(n).padStart(2, "0");
  const day = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  const prog = mod.createFolderProgram({
    team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks,
    io: outboxIo(state), logger: m => logs.push(m), now: () => clockNow
  });
  try {
    const item = stageCopy(mirror, CATALOG, rev3);
    const listing = [[CATALOG, { size: item.size, mtimeMs: item.mtimeMs }]];
    prog.applyScan({ answers: true, listing, staged: [item] });
    const heldDuring = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev2;
    const stagedKept = fs.existsSync(item.tmpPath);
    const stillAtOutbox = fs.existsSync(path.join(mirror, ".outbox.json")) && fs.readFileSync(path.join(mirror, ".outbox.json"), "utf8") === badBusy;
    const noAsideDuring = !fs.readdirSync(mirror).some(n => n.startsWith(".outbox.json.") && n.endsWith(".aside"));
    const noLogDuring = logs.length === 0;

    blockRename = false;
    prog.applyScan({ answers: true, listing, staged: [] });
    const aside = path.join(mirror, ".outbox.json." + day + ".aside");
    const movedAfter = fs.existsSync(aside) && fs.existsSync(path.join(mirror, ".outbox.json"))
      ? JSON.parse(fs.readFileSync(path.join(mirror, ".outbox.json"), "utf8")).kind === "etiuda-folder-outbox"
      : fs.existsSync(aside);
    const asideBytesOk = movedAfter && fs.readFileSync(aside, "utf8") === badBusy;
    const logAfterOk = logs.length === 1 && /what this computer still owed the folder may need sending again/i.test(logs[0]);
    const landedAfter = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === rev3;
    return { heldDuring, stagedKept, stillAtOutbox, noAsideDuring, noLogDuring, movedAfter, asideBytesOk, logAfterOk, landedAfter };
  } finally { prog.stop(); }
}

function plantScratch(tag) {
  const dir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
  const src = path.join(ROOT, "shell", "folder");
  const syncerPath = path.join(src, "syncer.cjs");
  const before = fs.readFileSync(syncerPath);
  for (const f of ["syncer.cjs", "syncer-worker.cjs"]) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  const lines = before.toString("utf8").split("\n");
  const at = lines.findIndex(l => l.includes("plant:" + tag));
  if (at < 0) return { found: false, mod: null, same: fs.readFileSync(syncerPath).equals(before) };
  lines.splice(at, 1);
  const scratch = path.join(dir, "syncer.cjs");
  fs.writeFileSync(scratch, lines.join("\n"), "utf8");
  return { found: true, mod: nodeRequire(scratch), same: fs.readFileSync(syncerPath).equals(before) };
}

async function main() {
  const checks = loadChecks();
  const syncer = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));

  const tOwed = teamApplyScene(syncer, checks, "team-owed", true);
  check(tOwed.heldDuring && tOwed.stagedKept && tOwed.notForgotten && tOwed.notApplied1
    && tOwed.keptOwnAfter && !tOwed.stagedAfter && tOwed.forgetAfter,
    "u1a team file with outbox read refused holds mirror and staged copy un-forgotten, then keeps own copy once read is allowed and owed: " + JSON.stringify(tOwed));

  const tClear = teamApplyScene(syncer, checks, "team-clear", false);
  check(tClear.heldDuring && tClear.stagedKept && tClear.notForgotten && tClear.notApplied1
    && tClear.landedAfter && tClear.applied2,
    "u1b team file with outbox read refused holds mirror and staged copy un-forgotten, then lands share copy once read is allowed and nothing owed: " + JSON.stringify(tClear));

  const sibOwed = siblingApplyScene(syncer, checks, "sib-owed", true);
  check(sibOwed.absentDuring && sibOwed.revDuring === 1 && sibOwed.stagedKept && sibOwed.notForgotten
    && !sibOwed.existsAfter && sibOwed.revAfter === 1,
    "u1c team conflict sibling with outbox read refused holds off and keeps staged copy, then stays off when owed: " + JSON.stringify(sibOwed));

  const sibClear = siblingApplyScene(syncer, checks, "sib-clear", false);
  check(sibClear.absentDuring && sibClear.revDuring === 1 && sibClear.stagedKept && sibClear.notForgotten
    && sibClear.existsAfter && sibClear.revAfter === 2,
    "u1d team conflict sibling with outbox read refused holds off and keeps staged copy, then lands when nothing owed: " + JSON.stringify(sibClear));

  const eOwed = editionApplyScene(syncer, checks, "ed-owed", true);
  check(eOwed.heldDuring && eOwed.stagedKept && eOwed.notForgotten && eOwed.notApplied1
    && eOwed.keptOwnAfter && !eOwed.stagedAfter && eOwed.forgetAfter,
    "u2a edition with outbox read refused holds mirror and staged copy un-forgotten, then keeps own copy once read is allowed and owed: " + JSON.stringify(eOwed));

  const eClear = editionApplyScene(syncer, checks, "ed-clear", false);
  check(eClear.heldDuring && eClear.stagedKept && eClear.notForgotten && eClear.notApplied1
    && eClear.landedAfter && eClear.applied2,
    "u2b edition with outbox read refused holds mirror and staged copy un-forgotten, then lands share copy once read is allowed and nothing owed: " + JSON.stringify(eClear));

  const sClear = editionSyncOnceScene(syncer, checks, "sync-clear", false);
  check(sClear.heldDuring && sClear.stagedDuring && sClear.landedAfter && sClear.stagedCleared,
    "u2c syncOnce with settled share copy and outbox read refused holds staged copy and lands it on next scan once read is allowed and nothing owed: " + JSON.stringify(sClear));

  const sOwed = editionSyncOnceScene(syncer, checks, "sync-owed", true);
  check(sOwed.heldDuring && sOwed.stagedDuring && sOwed.keptOwnAfter && sOwed.stagedCleared,
    "u2d syncOnce with settled share copy and outbox read refused keeps own copy on next scan once read is allowed and owed: " + JSON.stringify(sOwed));

  const st4Owed = step4Scene(syncer, checks, "step4-owed", true);
  check(st4Owed.keptWhileRefused && st4Owed.existsAfter,
    "u3a step 4 keeps an absent mirror file while outbox read is refused and once allowed when owed: " + JSON.stringify(st4Owed));

  const st4Clear = step4Scene(syncer, checks, "step4-clear", false);
  check(st4Clear.keptWhileRefused && !st4Clear.existsAfter,
    "u3b step 4 keeps an absent mirror file while outbox read is refused and removes it after 2 clear scans once nothing owed: " + JSON.stringify(st4Clear));

  const pOwed = pendingScene(syncer, checks, "pend-owed", true);
  check(pOwed.parked && pOwed.keptWhileRefused && pOwed.stillPending && pOwed.stagedStillThere && pOwed.keptOwnAfter && pOwed.pendingAfter === 0,
    "u4a pending item with outbox read refused stays parked and keeps own copy once read is allowed and owed: " + JSON.stringify(pOwed));

  const pClear = pendingScene(syncer, checks, "pend-clear", false);
  check(pClear.parked && pClear.keptWhileRefused && pClear.stillPending && pClear.stagedStillThere && pClear.landedAfter && pClear.pendingAfter === 0,
    "u4b pending item with outbox read refused stays parked and lands once read is allowed and nothing owed: " + JSON.stringify(pClear));

  const rOwed = await retryScene(syncer, checks, "retry-owed", true);
  check(rOwed.queued && rOwed.heldDuringRetry && rOwed.stagedDuringRetry && rOwed.keptOwnAfter,
    "u5a rename retry with outbox read refused never lands and keeps own copy once read is allowed and owed: " + JSON.stringify(rOwed));

  const rClear = await retryScene(syncer, checks, "retry-clear", false);
  check(rClear.queued && rClear.heldDuringRetry && rClear.stagedDuringRetry && rClear.landedAfter,
    "u5b rename retry with outbox read refused never lands and lands once read is allowed and nothing owed: " + JSON.stringify(rClear));

  const ownRes = ownStaysScene(syncer, checks, "own-stays");
  check(ownRes.owedWhileRefused === 0 && ownRes.backWhileRefused === 0 && ownRes.owedAfterOneClear === 0 && ownRes.owedAfterAllowed.length === 1,
    "u6 ownStays decides no take-back while outbox read is refused and still detects absence once read is allowed: " + JSON.stringify(ownRes));

  const wrRes = await writeProtectScene(syncer, "write-protect");
  check(wrRes.threwEio && wrRes.keptRelA && wrRes.bothKept,
    "u7 writeOutboxRetrying refuses to overwrite an unreadable outbox and retries busy reads without losing records: " + JSON.stringify(wrRes));

  const trRes = await transientCanPassScene(syncer, checks, "transient-can-pass");
  check(trRes.heldAll && trRes.stagedAll && trRes.notForgottenAll && trRes.noLogsDuring && trRes.landedAfter && trRes.bothKept,
    "u10a transient can-pass refusals decide nothing meanwhile and lose nothing after: " + JSON.stringify(trRes));

  const ubRes = unreadableBoundScene(syncer, checks, "unreadable-bound");
  check(ubRes.silentBefore && ubRes.heldPast && ubRes.stagedPast && ubRes.saidOnce && ubRes.notRepeated
    && ubRes.landedAfter && ubRes.clearedOnGoodRead && ubRes.heldSecond && ubRes.saidAgainAfterClear && ubRes.notRepeated2,
    "u11a outbox unreadable past bound logs once, still holds, and clears on a good read: " + JSON.stringify(ubRes));

  const dmRes = damagedOutboxScene(syncer, checks, "damaged-outbox");
  check(dmRes.aside1Ok && dmRes.log1Ok && dmRes.landed1 && dmRes.aside2Ok && dmRes.aside1Kept
    && dmRes.log2Ok && dmRes.landed2 && dmRes.aside3FormatOk && dmRes.log3Ok && dmRes.landed3
    && dmRes.noteNoEio && dmRes.noteOwedOk && dmRes.aside4Ok,
    "u12a damaged outbox moves aside under a dated name keeping bytes without overwriting, logs once, reads empty, and noteOwed clears EIO: " + JSON.stringify(dmRes));

  const dbRes = damagedRenameBusyScene(syncer, checks, "damaged-rename-busy");
  check(dbRes.heldDuring && dbRes.stagedKept && dbRes.stillAtOutbox && dbRes.noAsideDuring && dbRes.noLogDuring
    && dbRes.movedAfter && dbRes.asideBytesOk && dbRes.logAfterOk && dbRes.landedAfter,
    "u12b damaged outbox whose move aside is refused stays undecided until move succeeds: " + JSON.stringify(dbRes));

  {
    const { share, mirror } = makeDirs("enoent-control");
    const heldTeam = teamText(1), newTeam = teamText(2);
    const heldEd = editionText(2), newEd = editionText(3);
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), heldTeam, "utf8");
    fs.writeFileSync(path.join(mirror, CATALOG), heldEd, "utf8");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), newTeam, "utf8");
    fs.writeFileSync(path.join(share, CATALOG), newEd, "utf8");
    const prog = syncer.createFolderProgram({
      team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, logger: noop
    });
    try {
      prog.syncOnce();
      const teamLanded = fs.readFileSync(path.join(mirror, "etiuda-team.json"), "utf8") === newTeam;
      const edLanded = fs.readFileSync(path.join(mirror, CATALOG), "utf8") === newEd;
      check(teamLanded && edLanded, "u8 control: missing outbox (ENOENT) still lands team file and edition as nothing owed: "
        + JSON.stringify({ teamLanded, edLanded }));
    } finally { prog.stop(); }
  }

  /* Plants: lifting each guard in a scratch copy turns its check red. */
  const plants = [
    ["team-owe-unread", "u9a lifting plant:team-owe-unread lets a staged team file land while outbox read is refused",
      mod => { const r = teamApplyScene(mod, checks, "p-team", false); return r.heldDuring && r.stagedKept; }],
    ["team-sibling-owe-unread", "u9b lifting plant:team-sibling-owe-unread lets a staged team conflict sibling land while outbox read is refused",
      mod => { const r = siblingApplyScene(mod, checks, "p-sib", false); return r.absentDuring && r.revDuring === 1 && r.stagedKept; }],
    ["outbox-unread-keep", "u9c lifting plant:outbox-unread-keep lets a staged edition land while outbox read is refused",
      mod => { const r = editionApplyScene(mod, checks, "p-ed", false); return r.heldDuring && r.stagedKept; }],
    ["outbox-unread-stay", "u9d lifting plant:outbox-unread-stay removes an absent mirror file while outbox read is refused",
      mod => step4Scene(mod, checks, "p-step4", false).keptWhileRefused],
    ["pending-owe-unread", "u9e lifting plant:pending-owe-unread lets a pending edition land while outbox read is refused",
      mod => { const r = pendingScene(mod, checks, "p-pend", false); return r.keptWhileRefused && r.stillPending; }],
    ["retry-owe-unread", "u9f lifting plant:retry-owe-unread lets a rename retry land while outbox read is refused",
      async mod => { const r = await retryScene(mod, checks, "p-retry", false); return r.heldDuringRetry && r.stagedDuringRetry; }],
    ["own-stays-owe-unread", "u9g lifting plant:own-stays-owe-unread records own files taken back while outbox read is refused",
      mod => { const r = ownStaysScene(mod, checks, "p-own"); return r.owedWhileRefused === 0 && r.backWhileRefused === 0 && r.owedAfterOneClear === 0; }],
    ["outbox-write-unread", "u9h lifting plant:outbox-write-unread overwrites an unreadable outbox with an empty one",
      async mod => { const r = await writeProtectScene(mod, "p-wr"); return r.threwEio && r.keptRelA; }],
    ["outbox-can-pass", "u10p lifting plant:outbox-can-pass fails to retry EMFILE/EAGAIN in outboxBusyRetrying",
      async mod => { const r = await transientCanPassScene(mod, checks, "p-tr"); return r.bothKept; }],
    ["outbox-unread-bound", "u11p lifting plant:outbox-unread-bound stays silent when outbox is unreadable past the bound",
      mod => { const r = unreadableBoundScene(mod, checks, "p-ub"); return r.saidOnce; }],
    ["outbox-unread-clear", "u11q lifting plant:outbox-unread-clear fails to clear unreadable state after a good read",
      mod => { const r = unreadableBoundScene(mod, checks, "p-uc"); return r.saidAgainAfterClear; }],
    ["outbox-damaged-aside", "u12p lifting plant:outbox-damaged-aside leaves a damaged outbox undecided instead of moving it aside",
      mod => { const r = damagedOutboxScene(mod, checks, "p-dm"); return r.aside1Ok && r.landed1; }],
  ];
  for (const [tag, line, runCheck] of plants) {
    if (PLANTS_OFF) { skip(line); continue; }
    const p = plantScratch(tag);
    let ok = false;
    if (p.found) ok = !(await runCheck(p.mod));
    check(p.found && ok && p.same, line + ": " + JSON.stringify({ found: p.found, turnedRed: ok, same: p.same }));
  }

  if (asserted !== EXPECTED) check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  console.log("syncer-outbox-unread: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  process.exit(Math.min(failed, 63));
}

main().catch(e => {
  console.error(String(e && e.stack || e));
  process.exit(78);
});
