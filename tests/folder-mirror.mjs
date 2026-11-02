/* The desk on a shared-folder team reads from a local mirror kept by a background syncer.
 * Board 945 stage 3 (b), slice 1.
 *
 *     node tests/folder-mirror.mjs        exit code is the number of failed checks, capped at 63
 *
 * 1. The mirror: local copy at <userData>/folder-mirror/<teamId>/, same shape as team folder.
 *    catalogFolder() returns the mirror path for a folder team; nothing that reads from it changes.
 * 2. The syncer runs in a worker thread (node:worker_threads), never on the main thread: lists and reads
 *    the shared folder off-thread so a hung share never freezes the desk. Starts on folder team choice,
 *    stops on team/folder change or quit, and runs one per team.
 * 3. Files are copied into the mirror only whole and genuine, via temporary name and rename.
 * 4. Dependencies: an edition above mirror's team epoch waits in pending until team file lands.
 * 5. Removal: a file leaves the mirror only when missing from two answered listings in a row.
 * 6. Not reached: if folder does not answer, mirror stays unchanged and desk says the existing sentence.
 * 7. Slice 2: the desk's own writes land in the mirror first and reach the shared folder from the syncer's outbox;
 *    an owed path is never overwritten or removed by an older share copy; rev and counter floors per (scope, id);
 *    the shared catalog's compare and swap runs against the share off the main thread.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* The stand-in reads REG.policy at each reg call, and a desk's shell reads the policy once, at its first ask. */
const REG = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), REG);
const regText = rows => "Windows Registry Editor Version 5.00\n\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\n"
  + rows.map(([k, v]) => '"' + k + '"="' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"\n').join("") + "\n";

const EXPECTED = 78;
/* The plants of 45 are skipped where ETIUDA_PLANTS is off, and a skipped leg counts toward the floor. */
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-folder-mirror-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
function getShellSrc() {
  return fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
}
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName", "readRing", "catalogFolder", "writeBranch", "branchDest", "branchIdentity", "deskRows", "settleFolder", "rawCatalogFolder", "sharedFolderForWrite", "folderSyncerRun", "heedTeam", "readAskFile", "checkInviteRefusal", "tryCatalogAsk", "teamKeyAt", "readDesk", "deskTrustChecks", "resumeFromSleep", "folderAnswers", "folderTeamHere", "awaitFolderPrime"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, overrides = {}) {
  const said = [], on = {}, invoke = [], openedPaths = [], dialogOpts = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const shell = { openPath: async p => { openedPaths.push(p); return ""; } };
  const dialog = { showOpenDialog: async opts => { dialogOpts.push(opts); return { canceled: false, filePaths: [opts && opts.defaultPath] }; } };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog, net: inert, protocol: inert, session: inert, shell,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const srcToRun = overrides.src || getShellSrc();
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    srcToRun + "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(", ") + " };")(n => (n === "electron" ? electron : (overrides.require || nodeRequire)(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const ipc = (ch, ...args) => { const e = eventFor(); on[ch](e, ...args); return e.returnValue; };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  return { api, ask, ipc, on, invoke, said, ud, envelope, electron, openedPaths, dialogOpts };
}

function newDesk(name, folder, extraKeys = {}) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  const keys = Object.assign({ eCatalogFolder: folder, eUiLang: "en" }, extraKeys);
  const env = { kind: "etiuda-desk", schema: 1, keys };
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
  return loadDesk(ud);
}

const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };

// Crypto helpers
const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const lead = crypto.generateKeyPairSync("ed25519");
const forger = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lead-01", public: pubHex(lead.publicKey) };
const FORGER = { keyId: "lead-forger", public: pubHex(forger.publicKey) };

const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
function canonJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
}
function signedBytesOf(doc) {
  const copy = {};
  Object.keys(doc).forEach(k => {
    if (k === "hash") return;
    if (k !== "sig") { copy[k] = doc[k]; return; }
    const s = doc.sig;
    if (s && typeof s === "object") {
      copy.sig = {};
      if (s.alg !== undefined) copy.sig.alg = s.alg;
      if (s.keyId !== undefined) copy.sig.keyId = s.keyId;
    }
  });
  return Buffer.from(canonJson(copy), "utf8");
}
const sign = (doc, key, keyId) => {
  const out = JSON.parse(JSON.stringify(doc));
  delete out.sig;
  out.sig = { alg: "Ed25519", keyId: keyId };
  out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
  return out;
};

const catalog = (id, rev, name, date) => sign({
  format: 2, kind: "etiuda-catalog", id: id, rev: rev, name: name, date: date,
  langs: [{ code: "en", label: "EN" }],
  tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [{ id: "c-hello", shelf: "t-op", bodyShape: "plain", title: { en: "Hello" }, body: { en: "Hello world" } }]
}, lead.privateKey, LEAD.keyId);

const text = doc => JSON.stringify(doc, null, 1) + "\n";
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const K1 = crypto.randomBytes(32);
const K2 = crypto.randomBytes(32);

function teamFile(o) {
  return sign(Object.assign({
    format: 1, kind: "etiuda-team", id: o.team || TEAM,
    catalogs: o.catalogs || ["lamp-shop"],
    lead: { keyId: o.keyId || LEAD.keyId, public: o.public || LEAD.public },
    sealed: o.sealed !== false,
    epoch: o.epoch || 1,
    roster: o.roster || []
  }, o.rev !== undefined ? { rev: o.rev } : {}), o.signer || lead.privateKey, o.keyId || LEAD.keyId);
}

function seal(key, epoch, docText, teamId) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const aad = Buffer.from("etiuda-sealed\n" + (teamId || TEAM) + "\n" + epoch, "utf8");
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(docText, "utf8"), c.final(), c.getAuthTag()]);
  return JSON.stringify({
    format: 2, kind: "etiuda-sealed", team: teamId || TEAM, epoch: epoch,
    nonce: nonce.toString("hex"), ct: ct.toString("hex")
  }, null, 1) + "\n";
}

async function run() {
  const SHARE = folder("share");
  const CAT_A1 = text(catalog("lamp-shop", 1, "Lamp Shop", "2026-02-01"));
  const CAT_A2 = text(catalog("lamp-shop", 2, "Lamp Shop", "2026-02-02"));

  // Try importing syncer
  let syncerMod = null;
  try {
    syncerMod = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));
  } catch (e) {
    // Expected on main before implementation
  }

  const initDesk = loadDesk(folder("init-desk-ud"));
  const checks = typeof initDesk.api.deskTrustChecks === "function" ? initDesk.api.deskTrustChecks() : null;

  /* -------------------------------------------------------------------------------------------------
   * Leg 1 (41a): Main thread synchronous fs calls spy during readCatalog & catalogChanged
   * ----------------------------------------------------------------------------------------------- */
  {
    const desk1 = newDesk("desk1", SHARE);
    const deskChecks = typeof desk1.api.deskTrustChecks === "function" ? desk1.api.deskTrustChecks() : null;
    // Setup desk envelope with pinned team
    const envPath = path.join(desk1.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
    env.teamJoin = { team: TEAM, file: "lamp-shop", invite: { id: "inv-01", folder: SHARE, lead: LEAD } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    // Put catalog and team file in the local mirror
    const mirrorDir = path.join(desk1.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(mirrorDir, "lamp-shop.ec"), CAT_A1, "utf8");

    // Put a different file in the shared folder
    fs.writeFileSync(path.join(SHARE, "lamp-shop.ec"), CAT_A2, "utf8");

    // Spy fs calls on the main thread
    const fsSpiedCalls = [];
    const origReaddirSync = fs.readdirSync;
    const origReadFileSync = fs.readFileSync;
    const origStatSync = fs.statSync;

    const recordCall = (fnName, p) => {
      if (typeof p === "string" && path.resolve(p).startsWith(path.resolve(SHARE))) {
        fsSpiedCalls.push({ fn: fnName, path: p });
      }
    };

    fs.readdirSync = function(p, ...args) { recordCall("readdirSync", p); return origReaddirSync.call(fs, p, ...args); };
    fs.readFileSync = function(p, ...args) { recordCall("readFileSync", p); return origReadFileSync.call(fs, p, ...args); };
    fs.statSync = function(p, ...args) { recordCall("statSync", p); return origStatSync.call(fs, p, ...args); };

    let readResult = null;
    try {
      const d = loadDesk(desk1.ud);
      d.api.branchIdentity(true);
      readResult = d.api.readCatalog();
      d.api.catalogChanged({ isDestroyed: () => false, webContents: { send: noop } });
      d.api.readAskFile();
      d.api.checkInviteRefusal();
    } finally {
      fs.readdirSync = origReaddirSync;
      fs.readFileSync = origReadFileSync;
      fs.statSync = origStatSync;
    }

    const mirrorRead = readResult === CAT_A1.trim();
    const noSyncCallsToShare = fsSpiedCalls.length === 0;
    check(mirrorRead && noSyncCallsToShare,
      "41a the desk on a folder team reads its catalog with no synchronous filesystem call under the team folder on the main thread: "
      + "read from mirror " + mirrorRead + ", synchronous calls to share " + fsSpiedCalls.length);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 2 (41b): Genuine team file and edition reach mirror; forged, corrupted, and changing do not
   * ----------------------------------------------------------------------------------------------- */
  {
    if (!syncerMod) {
      check(false, "41b a genuine team file and edition reach the mirror; a forged team file, an edition that fails its check, and a file whose size changed between two listings do not, and are taken once whole and genuine: syncer module missing");
    } else {
      const shareDir = folder("share-41b");
      const mirrorDir = folder("mirror-41b");

      // 1. Genuine team file
      const genuineTeamText = JSON.stringify(teamFile({ epoch: 1, rev: 1 }));
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), genuineTeamText, "utf8");

      // 2. Genuine edition
      fs.writeFileSync(path.join(shareDir, "lamp-shop.ec"), CAT_A1, "utf8");

      // 3. Forged team file in a sibling / sub
      const forgedTeamText = JSON.stringify(teamFile({ epoch: 1, rev: 2, signer: forger.privateKey, keyId: FORGER.keyId, public: FORGER.public }));
      // 4. Corrupted edition
      fs.writeFileSync(path.join(shareDir, "corrupted.ec"), "not valid json", "utf8");

      // 5. Changing size file
      const changingFile = path.join(shareDir, "changing.ec");
      fs.writeFileSync(changingFile, "initial content", "utf8");

      const prog = syncerMod.createFolderProgram({
        team: TEAM, folder: shareDir, mirror: mirrorDir,
        pin: LEAD, keys: { 1: K1 }, checks
      });

      // Pass 1: changing.ec has invalid json
      await prog.syncOnce();

      // Check mirror state after pass 1
      const mirrorHasTeam = fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
      const mirrorHasEdition = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));
      const mirrorHasCorrupt = fs.existsSync(path.join(mirrorDir, "corrupted.ec"));
      const mirrorHasChangingPass1 = fs.existsSync(path.join(mirrorDir, "changing.ec"));

      // Mutate changing.ec before pass 2 (size changes, still invalid)
      fs.writeFileSync(changingFile, "initial content mutated to be longer", "utf8");
      await prog.syncOnce();
      const mirrorHasChangingPass2 = fs.existsSync(path.join(mirrorDir, "changing.ec"));

      // Now leave changing.ec with valid edition for pass 3
      fs.writeFileSync(changingFile, CAT_A1, "utf8");
      await prog.syncOnce();
      const mirrorHasChangingPass3 = fs.existsSync(path.join(mirrorDir, "changing.ec"));

      // D5: Team file rollback - team file in share with rev below mirror's is refused
      const teamOlderRev = JSON.stringify(teamFile({ epoch: 1, rev: 0 }));
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), teamOlderRev, "utf8");
      await prog.syncOnce();
      const mirrorTeamDoc = JSON.parse(fs.readFileSync(path.join(mirrorDir, "etiuda-team.json"), "utf8"));
      const rollbackRefused = mirrorTeamDoc.rev === 1;

      const ok = mirrorHasTeam && mirrorHasEdition && !mirrorHasCorrupt
        && !mirrorHasChangingPass1 && !mirrorHasChangingPass2 && mirrorHasChangingPass3 && rollbackRefused;

      check(ok,
        "41b a genuine team file and edition reach the mirror; a forged team file, an older rev rollback, an edition that fails its check, and a file whose size changed between two listings do not, and are taken once whole and genuine: "
        + "team " + mirrorHasTeam + ", edition " + mirrorHasEdition + ", corrupt " + mirrorHasCorrupt
        + ", rollback refused " + rollbackRefused
        + ", changing p1 " + mirrorHasChangingPass1 + ", p2 " + mirrorHasChangingPass2 + ", p3 " + mirrorHasChangingPass3);
    }
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 3 (41c): Edition at epoch above mirror team file waits in pending and lands once team file arrives
   * ----------------------------------------------------------------------------------------------- */
  {
    if (!syncerMod) {
      check(false, "41c an edition at an epoch above the mirror's team file waits, and lands once that team file arrives: syncer module missing");
    } else {
      const shareDir = folder("share-41c");
      const mirrorDir = folder("mirror-41c");

      // Initial team file at epoch 1
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");

      const prog = syncerMod.createFolderProgram({
        team: TEAM, folder: shareDir, mirror: mirrorDir,
        pin: LEAD, keys: { 1: K1, 2: K2 }, checks
      });
      await prog.syncOnce();

      // Now place an edition sealed at epoch 2 into share
      const sealedEpoch2 = seal(K2, 2, CAT_A2);
      fs.writeFileSync(path.join(shareDir, "edition-e2.ec"), sealedEpoch2, "utf8");

      await prog.syncOnce();
      // Should wait in pending because mirror's team file is at epoch 1
      const landedPrematurely = fs.existsSync(path.join(mirrorDir, "edition-e2.ec"));

      // Now update share's team file to epoch 2
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 2, rev: 1 })), "utf8");
      await prog.syncOnce();

      const landedAfterTeam = fs.existsSync(path.join(mirrorDir, "edition-e2.ec"));
      const mirrorTeamEpoch = JSON.parse(fs.readFileSync(path.join(mirrorDir, "etiuda-team.json"), "utf8")).epoch;

      const ok = !landedPrematurely && landedAfterTeam && mirrorTeamEpoch === 2;
      check(ok,
        "41c an edition at an epoch above the mirror's team file waits, and lands once that team file arrives: "
        + "waited " + !landedPrematurely + ", landed after team " + landedAfterTeam + ", team epoch " + mirrorTeamEpoch);
    }
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 4 (41d): File missing from one answered listing stays in mirror; missing from two, it leaves
   * ----------------------------------------------------------------------------------------------- */
  {
    if (!syncerMod) {
      check(false, "41d a file missing from one answered listing stays in the mirror; missing from two, it leaves: syncer module missing");
    } else {
      const shareDir = folder("share-41d");
      const mirrorDir = folder("mirror-41d");

      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(shareDir, "lamp-shop.ec"), CAT_A1, "utf8");

      const prog = syncerMod.createFolderProgram({
        team: TEAM, folder: shareDir, mirror: mirrorDir,
        pin: LEAD, keys: { 1: K1 }, checks
      });
      await prog.syncOnce();

      const initiallyLanded = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));

      // Remove file from share
      fs.unlinkSync(path.join(shareDir, "lamp-shop.ec"));

      // Answered listing 1: file is absent
      await prog.syncOnce();
      const staysAfterOne = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));

      // Answered listing 2: file is absent again
      await prog.syncOnce();
      const leavesAfterTwo = !fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));

      const ok = initiallyLanded && staysAfterOne && leavesAfterTwo;
      check(ok,
        "41d a file missing from one answered listing stays in the mirror; missing from two, it leaves: "
        + "landed " + initiallyLanded + ", stays after 1 missing " + staysAfterOne + ", leaves after 2 missing " + leavesAfterTwo);
    }
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 5 (41e): Folder that does not answer leaves mirror unchanged and desk says existing sentence
   * ----------------------------------------------------------------------------------------------- */
  {
    const desk5 = newDesk("desk5", SHARE);
    const envPath = path.join(desk5.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(desk5.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(mirrorDir, "lamp-shop.ec"), CAT_A1, "utf8");

    // Injected IO that simulates folder down (timeout/not answering)
    if (!syncerMod) {
      check(false, "41e a folder that does not answer leaves the mirror unchanged and the desk says the existing sentence: syncer module missing");
    } else {
      const logs = [];
      const d = loadDesk(desk5.ud);

      const prog = syncerMod.createFolderProgram({
        team: TEAM, folder: SHARE, mirror: mirrorDir,
        pin: LEAD, keys: { 1: K1 }, checks,
        io: {
          readdir: () => { const err = new Error("network timeout"); err.code = "ETIMEDOUT"; throw err; },
          stat: () => { const err = new Error("network timeout"); err.code = "ETIMEDOUT"; throw err; },
          readFile: () => { throw new Error("timeout"); },
          writeFile: fs.writeFileSync,
          unlink: fs.unlinkSync,
          mkdir: fs.mkdirSync,
          exists: fs.existsSync,
          rename: fs.renameSync
        },
        onStatus: (status) => {
          if (!status.answers) {
            logs.push("etiuda: the catalog folder " + status.folder + " did not answer, so it is read as empty until it does");
          }
        }
      });

      await prog.syncOnce();

      const mirrorUnchanged = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"))
        && fs.readFileSync(path.join(mirrorDir, "lamp-shop.ec"), "utf8") === CAT_A1;
      const saidExistingSentence = logs.some(l => l.includes("did not answer, so it is read as empty until it does"));

      const readResult = d.api.readCatalog();
      const readReturnsLastGenuine = readResult === CAT_A1.trim();

      const ok = mirrorUnchanged && saidExistingSentence && readReturnsLastGenuine;
      check(ok,
        "41e a folder that does not answer leaves the mirror unchanged and the desk says the existing sentence: "
        + "mirror unchanged " + mirrorUnchanged + ", sentence said " + saidExistingSentence + ", read returns genuine " + readReturnsLastGenuine);
    }
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 6 (41f): One syncer per team (starting twice runs one; a team change stops the old one)
   * ----------------------------------------------------------------------------------------------- */
  {
    if (!syncerMod) {
      check(false, "41f one syncer per team (starting twice runs one; a team change stops the old one): syncer module missing");
    } else {
      const shareDir1 = folder("share-41f1");
      const shareDir2 = folder("share-41f2");
      const mirrorDir1 = folder("mirror-41f1");
      const mirrorDir2 = folder("mirror-41f2");
      const TEAM2 = "t-" + crypto.randomBytes(8).toString("hex");

      const s1 = syncerMod.startFolderSyncer({
        team: TEAM, folder: shareDir1, mirror: mirrorDir1, pin: LEAD, useWorker: false, checks
      });
      const s2 = syncerMod.startFolderSyncer({
        team: TEAM, folder: shareDir1, mirror: mirrorDir1, pin: LEAD, useWorker: false, checks
      });

      const startingTwiceIsSame = s1 === s2;

      // Start for TEAM2
      const s3 = syncerMod.startFolderSyncer({
        team: TEAM2, folder: shareDir2, mirror: mirrorDir2, pin: LEAD, useWorker: false, checks
      });

      const oldStopped = s1.stopped === true;
      const newRunning = s3.stopped === false;

      s3.stop();
      syncerMod.stopAllFolderSyncers();

      const ok = startingTwiceIsSame && oldStopped && newRunning;
      check(ok,
        "41f one syncer per team (starting twice runs one; a team change stops the old one): "
        + "same instance " + startingTwiceIsSame + ", old stopped " + oldStopped + ", new running " + newRunning);
    }
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 7 (41p): Slice 2 - Desk's own write lands in the mirror first, reaches the folder through the outbox,
   * and is never removed from or shadowed in the mirror. (Slice 1's leg asserted the write went straight to the share.)
   * ----------------------------------------------------------------------------------------------- */
  {
    const deskP = newDesk("desk-41p", SHARE);
    const envPath = path.join(deskP.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(deskP.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(SHARE, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");

    const d = loadDesk(deskP.ud);
    const me = d.api.branchIdentity(true);
    const stem = "cat-41p-12345678";
    const branchDoc = {
      format: 2, kind: "etiuda-catalog", id: me.id + "-12345678",
      desk: { id: me.id, key: me.key, box: me.box },
      rev: 0, cards: []
    };

    const wRes = d.api.writeBranch(stem, JSON.stringify(branchDoc));
    const shareBranch = path.join(SHARE, "desks", me.id, stem + ".ec");
    const mirrorBranch = path.join(mirrorDir, "desks", me.id, stem + ".ec");

    const inMirrorFirst = !!(wRes && wRes.ok) && fs.existsSync(mirrorBranch);
    const notInShareYet = !fs.existsSync(shareBranch);

    const prog = syncerMod.createFolderProgram({
      team: TEAM, folder: SHARE, mirror: mirrorDir,
      pin: LEAD, keys: { 1: K1 }, checks
    });
    await prog.syncOnce();
    const reachesShare = fs.existsSync(shareBranch) && fs.existsSync(mirrorBranch)
      && fs.readFileSync(shareBranch).equals(fs.readFileSync(mirrorBranch));

    await prog.syncOnce();
    await prog.syncOnce();
    const remainsInMirrorAfterListings = fs.existsSync(mirrorBranch);

    const ok = inMirrorFirst && notInShareYet && reachesShare && remainsInMirrorAfterListings;
    check(ok,
      "41p a desk's own write lands in the mirror first, reaches the folder through the outbox, and is never removed from or shadowed in the mirror: "
      + "in mirror first " + inMirrorFirst + ", not in share before the outbox " + notInShareYet
      + ", reaches share whole " + reachesShare + ", retained after listings " + remainsInMirrorAfterListings);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 8 (41q): Slice 2 - With the folder not answering, a write still lands in the mirror and the row says kept
   * until the outbox lands it. (Slice 1's leg asserted the write was held in memory.)
   * ----------------------------------------------------------------------------------------------- */
  {
    const deskQ = newDesk("desk-41q", SHARE);
    const envPath = path.join(deskQ.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(deskQ.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");

    const d = loadDesk(deskQ.ud);
    const me = d.api.branchIdentity(true);
    const stem = "cat-41q-12345678";
    const branchDoc = {
      format: 2, kind: "etiuda-catalog", id: me.id + "-12345678",
      desk: { id: me.id, key: me.key, box: me.box },
      rev: 0, cards: []
    };
    const prog = syncerMod.createFolderProgram({
      team: TEAM, folder: SHARE, mirror: mirrorDir,
      pin: LEAD, keys: { 1: K1 }, checks
    });
    const rowOf = () => (d.api.deskRows().filter(r => r.id === me.id + "-12345678")[0] || null);

    d.api.writeBranch(stem, JSON.stringify(branchDoc));
    await prog.syncOnce();
    const initialRow = rowOf();
    const initialReached = initialRow ? initialRow.reached : null;

    d.api.settleFolder(SHARE, false);
    branchDoc.rev = 1;
    branchDoc.name = "Edited while the folder is away";
    const wRes = d.api.writeBranch(stem, JSON.stringify(branchDoc));
    const landedInMirror = !!(wRes && wRes.ok && !wRes.held) && wRes.rev === 2;
    const keptRow = rowOf();
    const rowSaysKept = keptRow !== null && keptRow.reached === false;

    d.api.settleFolder(SHARE, true);
    await prog.syncOnce();
    const afterRow = rowOf();
    const reachedAfter = !!afterRow && afterRow.reached === true;
    const shareRev = (() => { try { return JSON.parse(fs.readFileSync(path.join(SHARE, "desks", me.id, stem + ".ec"), "utf8")).rev; } catch { return null; } })();

    const ok = initialReached === true && landedInMirror && rowSaysKept && reachedAfter && shareRev === 2;
    check(ok,
      "41q with the folder not answering, a write still lands in the mirror and the row says kept until the outbox lands it: "
      + "initial reached " + initialReached + ", landed in mirror " + landedInMirror + ", row kept " + rowSaysKept
      + ", reached after " + reachedAfter + ", share rev " + shareRev);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 9 (41r): D3 - A forged file planted straight into the mirror is refused at read
   * ----------------------------------------------------------------------------------------------- */
  {
    const deskR = newDesk("desk-41r", SHARE);
    const envPath = path.join(deskR.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(deskR.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");

    // Plant forged file straight into mirror
    const forgedDoc = sign({
      format: 2, kind: "etiuda-catalog", id: "forged-cat", rev: 1, name: "Forged", date: "2026-02-01",
      langs: [{ code: "en", label: "EN" }], tags: [], cards: []
    }, forger.privateKey, FORGER.keyId);
    fs.writeFileSync(path.join(mirrorDir, "forged-cat.ec"), JSON.stringify(forgedDoc, null, 1) + "\n", "utf8");

    const d = loadDesk(deskR.ud);
    const readResult = d.api.readCatalog();
    const forgedRefused = readResult === null || !readResult.includes("forged-cat");

    check(forgedRefused,
      "41r a forged file planted straight into the mirror is refused at read: "
      + "refused " + forgedRefused + ", read result " + (readResult ? "returned something" : "null"));
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 10 (41s): D5 - A first join with the folder never yet reached shows the not-reached sentence over an empty mirror
   * ----------------------------------------------------------------------------------------------- */
  {
    const UNREACHABLE = path.join(LAB, "non-existent-share-" + crypto.randomBytes(4).toString("hex"));
    const deskS = newDesk("desk-41s", UNREACHABLE);
    const envPath = path.join(deskS.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: UNREACHABLE } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(deskS.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });

    const d = loadDesk(deskS.ud);

    const prog = syncerMod.createFolderProgram({
      team: TEAM, folder: UNREACHABLE, mirror: mirrorDir,
      pin: LEAD, keys: { 1: K1 }, checks,
      onStatus: (status) => {
        if (!status.answers) {
          d.api.settleFolder(status.folder, false);
        }
      }
    });

    await prog.syncOnce();

    const mirrorFiles = fs.readdirSync(mirrorDir).filter(f => !f.startsWith("."));
    const mirrorEmpty = mirrorFiles.length === 0;

    const notReachedSentence = d.said.some(l => l.includes("did not answer, so it is read as empty until it does"));
    const readOverEmpty = d.api.readCatalog();
    const readEmpty = readOverEmpty === null || readOverEmpty === "";

    const ok = mirrorEmpty && notReachedSentence && readEmpty;
    check(ok,
      "41s a first join with the folder never yet reached shows the not-reached sentence over an empty mirror: "
      + "mirror empty " + mirrorEmpty + ", not-reached sentence said " + notReachedSentence + ", read empty " + readEmpty);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 11 (41t): A genuine higher conflict sibling reaches the mirror and is heeded
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareT = folder("share-41t");
    const deskT = newDesk("desk-41t", shareT);
    const envPath = path.join(deskT.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: shareT } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const mirrorDir = path.join(deskT.ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirrorDir, { recursive: true });

    // Canonical team file at rev 1
    fs.writeFileSync(path.join(shareT, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    // Genuine conflict sibling at higher rev 4
    fs.writeFileSync(path.join(shareT, "etiuda-team (1).json"), JSON.stringify(teamFile({ epoch: 1, rev: 4 })), "utf8");

    const prog = syncerMod.createFolderProgram({
      team: TEAM, folder: shareT, mirror: mirrorDir,
      pin: LEAD, keys: { 1: K1 }, checks
    });

    await prog.syncOnce();

    const siblingInMirror = fs.existsSync(path.join(mirrorDir, "etiuda-team (1).json"));
    let mirrorSibRev = 0;
    try {
      mirrorSibRev = JSON.parse(fs.readFileSync(path.join(mirrorDir, "etiuda-team (1).json"), "utf8")).rev;
    } catch {}

    const d = loadDesk(deskT.ud);
    d.api.readCatalog();
    const envAfter = JSON.parse(fs.readFileSync(envPath, "utf8"));
    const floor = envAfter.teamRevSeen && envAfter.teamRevSeen[TEAM] && envAfter.teamRevSeen[TEAM][LEAD.public];
    const heededRev = floor ? floor.rev : 0;

    const ok = siblingInMirror && mirrorSibRev === 4 && heededRev === 4;
    check(ok,
      "41t a genuine higher conflict sibling reaches the mirror and is heeded: "
      + "sibling in mirror " + siblingInMirror + " (rev " + mirrorSibRev + "), heeded rev " + heededRev);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 12 (41u): F1 - Sealed edition reaches mirror with live unwrapped keys; rotates without restart; foreign key stays out
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareU = folder("share-41u");
    const deskU = newDesk("desk-41u", shareU);
    const envPath = path.join(deskU.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    const TEAM_U = "t-" + crypto.randomBytes(8).toString("hex");
    const K_U1 = crypto.randomBytes(32);
    const K_U2 = crypto.randomBytes(32);
    const K_FOREIGN = crypto.randomBytes(32);

    env.teamPins = { [TEAM_U]: LEAD };
    env.teamShown = { [TEAM_U]: { lead: "Lead", folder: shareU } };
    const encK1 = deskU.electron.safeStorage.encryptString(K_U1.toString("base64")).toString("base64");
    env.teamKeys = { [TEAM_U]: { 1: encK1 } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    fs.writeFileSync(path.join(shareU, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_U, epoch: 1, rev: 1 })), "utf8");
    const CAT_U1 = text(catalog("lamp-shop", 1, "Lamp Shop", "2026-02-01"));
    fs.writeFileSync(path.join(shareU, "lamp-shop.ec"), seal(K_U1, 1, CAT_U1, TEAM_U), "utf8");
    fs.writeFileSync(path.join(shareU, "foreign.ec"), seal(K_FOREIGN, 1, text(catalog("foreign", 1, "Foreign", "2026-02-01")), TEAM_U), "utf8");

    const d = loadDesk(deskU.ud);
    const syncer = d.api.folderSyncerRun(null);
    if (syncer && syncer.program) {
      syncer.program.syncOnce();
    }

    const mirrorDir = path.join(deskU.ud, "folder-mirror", TEAM_U);
    const edition1Landed = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));
    const foreignStaysOut = !fs.existsSync(path.join(mirrorDir, "foreign.ec"));

    fs.writeFileSync(path.join(shareU, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_U, epoch: 2, rev: 1 })), "utf8");
    const CAT_U2 = text(catalog("lamp-shop", 2, "Lamp Shop", "2026-02-02"));
    fs.writeFileSync(path.join(shareU, "lamp-shop-e2.ec"), seal(K_U2, 2, CAT_U2, TEAM_U), "utf8");

    const encK2 = deskU.electron.safeStorage.encryptString(K_U2.toString("base64")).toString("base64");
    const liveEnv = d.envelope();
    liveEnv.teamKeys[TEAM_U][2] = encK2;
    fs.writeFileSync(envPath, JSON.stringify(liveEnv), "utf8");
    d.api.readDesk();
    d.api.heedTeam();

    if (syncer && syncer.program) {
      syncer.program.syncOnce();
    }

    const edition2Landed = fs.existsSync(path.join(mirrorDir, "lamp-shop-e2.ec"));
    if (syncer) syncer.stop();

    const ok = edition1Landed && foreignStaysOut && edition2Landed;
    check(ok,
      "41u a sealed edition at the team's epoch reaches the mirror with live team keys; after the team file rotates the epoch, an edition at the new epoch reaches the mirror without a restart; a sealed edition under a key the desk does not hold stays out: "
      + "e1 landed " + edition1Landed + ", foreign out " + foreignStaysOut + ", e2 landed without restart " + edition2Landed);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 13 (41v): F2 - in-use.ec, catalog-answer.ec, unsigned shared catalog, and handed-over lead reach mirror
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareV = folder("share-41v");
    const mirrorV = folder("mirror-41v");
    const TEAM_V = "t-" + crypto.randomBytes(8).toString("hex");
    const deskKeyV = crypto.generateKeyPairSync("ed25519");
    const deskPubV = pubHex(deskKeyV.publicKey);
    const deskIdV = "k-" + crypto.createHash("sha256").update(Buffer.from(deskPubV, "hex")).digest("hex").slice(0, 16);

    const inUseDoc = {
      format: 1, kind: "etiuda-in-use",
      desk: { id: deskIdV, key: deskPubV },
      at: new Date().toISOString(),
      catalog: { id: "lamp-shop", rev: 1, name: "Lamp Shop" },
      sig: { alg: "Ed25519", keyId: deskIdV }
    };
    const bInUse = Buffer.concat([Buffer.from("etiuda-desk-branch\n", "utf8"), signedBytesOf(inUseDoc)]);
    inUseDoc.sig.value = crypto.sign(null, bInUse, deskKeyV.privateKey).toString("hex");

    const inUseSealed = seal(K1, 1, JSON.stringify(inUseDoc), TEAM_V);
    const inUseDir = path.join(shareV, "desks", deskIdV);
    fs.mkdirSync(inUseDir, { recursive: true });
    fs.writeFileSync(path.join(inUseDir, "in-use.ec"), inUseSealed, "utf8");

    const answerDoc = {
      format: 1, kind: "etiuda-catalog-answer",
      sha256: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      catalog: catalog("lamp-shop", 1, "Lamp Shop", "2026-02-01")
    };
    const answerSealed = seal(K1, 1, JSON.stringify(answerDoc), TEAM_V);
    fs.writeFileSync(path.join(inUseDir, "catalog-answer.ec"), answerSealed, "utf8");

    const unsignedDoc = {
      format: 2, kind: "etiuda-catalog", id: "shared-collab", rev: 1, name: "Shared", date: "2026-02-01",
      langs: [{ code: "en", label: "EN" }], tags: [], cards: []
    };
    fs.writeFileSync(path.join(shareV, "shared-collab.ec"), JSON.stringify(unsignedDoc, null, 1) + "\n", "utf8");

    const lead2V = crypto.generateKeyPairSync("ed25519");
    const LEAD2V = { keyId: "lead-v2", public: pubHex(lead2V.publicKey) };
    const stepV = {
      format: 1, kind: "etiuda-team-handover", team: TEAM_V,
      to: { keyId: LEAD2V.keyId, public: LEAD2V.public },
      sig: { alg: "Ed25519", keyId: LEAD.keyId }
    };
    const bStep = Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(JSON.stringify({
      format: 1, kind: "etiuda-team-handover", sig: { alg: "Ed25519", keyId: LEAD.keyId },
      team: TEAM_V, to: { keyId: LEAD2V.keyId, public: LEAD2V.public }
    }), "utf8")]);
    stepV.sig.value = crypto.sign(null, bStep, lead.privateKey).toString("hex");

    const handedTeam = sign({
      format: 1, kind: "etiuda-team", id: TEAM_V, catalogs: ["shared-collab"],
      lead: { keyId: LEAD2V.keyId, public: LEAD2V.public },
      sealed: false, epoch: 1, rev: 2, roster: [],
      handover: [stepV]
    }, lead2V.privateKey, LEAD2V.keyId);
    fs.writeFileSync(path.join(shareV, "etiuda-team.json"), JSON.stringify(handedTeam), "utf8");

    const prog = syncerMod.createFolderProgram({
      team: TEAM_V, folder: shareV, mirror: mirrorV,
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks
    });
    await prog.syncOnce();

    const inUseLands = fs.existsSync(path.join(mirrorV, "desks", deskIdV, "in-use.ec"));
    const answerLands = fs.existsSync(path.join(mirrorV, "desks", deskIdV, "catalog-answer.ec"));
    const sharedLands = fs.existsSync(path.join(mirrorV, "shared-collab.ec"));
    const handedLands = fs.existsSync(path.join(mirrorV, "etiuda-team.json"));

    const ok = inUseLands && answerLands && sharedLands && handedLands;
    check(ok,
      "41v in-use, answer, an unsigned shared catalog and a handed-over lead each reach the mirror: "
      + "in-use " + inUseLands + ", answer " + answerLands + ", unsigned " + sharedLands + ", handed " + handedLands);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 14 (41w): F3 & Drop #1 - Unknown 50MB file is never opened, and unchanged edition is not reread
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareW = folder("share-41w");
    const mirrorW = folder("mirror-41w");
    const TEAM_W = "t-" + crypto.randomBytes(8).toString("hex");

    fs.writeFileSync(path.join(shareW, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_W, epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(shareW, "lamp-shop.ec"), CAT_A1, "utf8");

    const unknownFile = path.join(shareW, "large-video.mp4");
    fs.writeFileSync(unknownFile, Buffer.alloc(1024 * 1024));

    let unknownOpened = false;
    let editionReadCount = 0;

    const prog = syncerMod.createFolderProgram({
      team: TEAM_W, folder: shareW, mirror: mirrorW,
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks,
      io: {
        readdir: fs.readdirSync,
        stat: fs.statSync,
        readFile: (p, enc) => {
          if (p.includes("large-video.mp4")) unknownOpened = true;
          if (p.includes("lamp-shop.ec")) editionReadCount++;
          return fs.readFileSync(p, enc);
        },
        writeFile: fs.writeFileSync,
        unlink: fs.unlinkSync,
        mkdir: (d) => fs.mkdirSync(d, { recursive: true }),
        exists: fs.existsSync,
        rename: fs.renameSync
      }
    });

    await prog.syncOnce();
    const edInMirrorP1 = fs.existsSync(path.join(mirrorW, "lamp-shop.ec"));
    const unknownInMirrorP1 = fs.existsSync(path.join(mirrorW, "large-video.mp4"));
    const p1ReadCount = editionReadCount;

    await prog.syncOnce();
    const p2ReadCount = editionReadCount;

    const notOpened = !unknownOpened && !unknownInMirrorP1;
    const notReread = p2ReadCount === p1ReadCount;

    const ok = edInMirrorP1 && notOpened && notReread;
    check(ok,
      "41w an unknown 50 MB file in the folder is never opened, and an unchanged edition is not reread: "
      + "edition in mirror " + edInMirrorP1 + ", unknown unopened " + notOpened + ", unchanged not reread " + notReread);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 15 (41x): F4 - The worker watches the share, not the mirror
   * ----------------------------------------------------------------------------------------------- */
  {
    const mainSrc = getShellSrc();
    const watchCatalogBody = mainSrc.slice(mainSrc.indexOf("function watchCatalog("), mainSrc.indexOf("function watchDesks("));
    const kicksOnMirror = watchCatalogBody.includes("folderSyncer.kick()");

    const workerSrc = fs.readFileSync(path.join(ROOT, "shell", "folder", "syncer-worker.cjs"), "utf8");
    const workerWatchesShare = workerSrc.includes("fs.watch(folder");

    const ok = !kicksOnMirror && workerWatchesShare;
    check(ok,
      "41x the worker watches the share, not the mirror: "
      + "no mirror kick " + !kicksOnMirror + ", worker watches share " + workerWatchesShare);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 16 (41y): F6 - Protocol JSON kinds get their own check and head waits behind its editions
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareY = folder("share-41y");
    const mirrorY = folder("mirror-41y");
    const TEAM_Y = "t-" + crypto.randomBytes(8).toString("hex");

    fs.writeFileSync(path.join(shareY, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_Y, epoch: 1, rev: 1 })), "utf8");

    const ringDoc = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "lamp-shop", keyId: LEAD.keyId, public: LEAD.public, alg: "Ed25519" }] };
    fs.writeFileSync(path.join(shareY, "etiuda-ring.json"), JSON.stringify(ringDoc), "utf8");

    const headSigned = {
      v: 1, team: TEAM_Y, epoch: 1, rev: 2, t: 1700000000000,
      editions: [{ catalog: "lamp-shop", rev: 2, edition: "Second", published: "2026-02-02" }],
      sig: { alg: "Ed25519", keyId: LEAD.keyId }
    };
    const bHead = Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), signedBytesOf(headSigned)]);
    headSigned.sig.value = crypto.sign(null, bHead, lead.privateKey).toString("hex");
    fs.writeFileSync(path.join(shareY, "etiuda-head.json"), JSON.stringify(headSigned), "utf8");

    const prog = syncerMod.createFolderProgram({
      team: TEAM_Y, folder: shareY, mirror: mirrorY,
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks
    });

    await prog.syncOnce();
    const ringLanded = fs.existsSync(path.join(mirrorY, "etiuda-ring.json"));
    const headWaited = !fs.existsSync(path.join(mirrorY, "etiuda-head.json"));

    fs.writeFileSync(path.join(shareY, "lamp-shop.ec"), CAT_A2, "utf8");

    await prog.syncOnce();
    const edLanded = fs.existsSync(path.join(mirrorY, "lamp-shop.ec"));
    const headLanded = fs.existsSync(path.join(mirrorY, "etiuda-head.json"));

    const ok = ringLanded && headWaited && edLanded && headLanded;
    check(ok,
      "41y protocol JSON kinds get their own check and head waits behind its editions: "
      + "ring on first sight " + ringLanded + ", head waited " + headWaited + ", edition landed " + edLanded + ", head landed after " + headLanded);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 17 (41z): F8 - Open catalog folder opens the shared folder
   * ----------------------------------------------------------------------------------------------- */
  {
    const shareZ = folder("share-41z");
    const deskZ = newDesk("desk-41z", shareZ);
    const envPath = path.join(deskZ.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    const TEAM_Z = "t-" + crypto.randomBytes(8).toString("hex");

    env.teamPins = { [TEAM_Z]: LEAD };
    env.teamShown = { [TEAM_Z]: { lead: "Lead", folder: shareZ } };
    fs.writeFileSync(envPath, JSON.stringify(env), "utf8");

    const d = loadDesk(deskZ.ud);
    /* A desk whose mirror has already taken a listing. Before that mark, the share is not opened on this thread. */
    fs.mkdirSync(path.join(deskZ.ud, "folder-mirror", TEAM_Z), { recursive: true });
    fs.writeFileSync(path.join(deskZ.ud, "folder-mirror", TEAM_Z, ".primed"), "");
    await d.ask("etiuda:open-catalog-folder");
    const opened = d.openedPaths[0] || "";

    const opensShareNotMirror = path.resolve(opened) === path.resolve(shareZ);
    check(opensShareNotMirror,
      "41z open catalog folder opens the shared folder: "
      + "opened " + opened + ", matches share " + opensShareNotMirror);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 18 (42a): F9 - .staging is swept at start, pending reuses its staged copy, and pending is bounded
   * ----------------------------------------------------------------------------------------------- */
  {
    const share9 = folder("share-42a");
    const mirror9 = folder("mirror-42a");
    const TEAM_9 = "t-" + crypto.randomBytes(8).toString("hex");

    const stagingDir = path.join(mirror9, ".staging");
    fs.mkdirSync(stagingDir, { recursive: true });
    const leftover1 = path.join(stagingDir, "leftover-1.tmp");
    const leftover2 = path.join(stagingDir, "leftover-2.tmp");
    fs.writeFileSync(leftover1, "old 1");
    fs.writeFileSync(leftover2, "old 2");

    fs.writeFileSync(path.join(share9, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_9, epoch: 1, rev: 1 })), "utf8");

    const sealedFuture = seal(K1, 10, CAT_A1, TEAM_9);
    fs.writeFileSync(path.join(share9, "future.ec"), sealedFuture, "utf8");

    const prog = syncerMod.createFolderProgram({
      team: TEAM_9, folder: share9, mirror: mirror9,
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks
    });

    const swept1 = !fs.existsSync(leftover1);
    const swept2 = !fs.existsSync(leftover2);

    await prog.syncOnce();

    const sealedFuture2 = seal(K1, 10, CAT_A2, TEAM_9);
    fs.writeFileSync(path.join(share9, "future.ec"), sealedFuture2, "utf8");

    await prog.syncOnce();
    const stFilesPass2 = fs.readdirSync(stagingDir).filter(f => f.endsWith(".tmp"));
    const reusedWithoutLeak = stFilesPass2.length <= 1;

    for (let i = 0; i < 60; i++) {
      fs.writeFileSync(path.join(share9, "f-" + i + ".ec"), seal(K1, 10 + i, CAT_A1, TEAM_9), "utf8");
    }
    await prog.syncOnce();
    const pState = prog.state();
    const bounded = pState.pendingLength <= 50;

    const ok = swept1 && swept2 && reusedWithoutLeak && bounded;
    check(ok,
      "42a .staging is swept at start, pending reuses its staged copy without leaking, and pending is bounded: "
      + "swept " + (swept1 && swept2) + ", reused without leak " + reusedWithoutLeak + ", bounded " + bounded + " (" + pState.pendingLength + ")");
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 18 (42i): E1 - parity leg: desk and syncer trust verdicts agree over corpus
   * Corpus: genuine and forged team files, ring-vouched and handed-over leads, an in-use file,
   * an answer, an unsigned shared catalog, a sealed edition at another epoch.
   * ----------------------------------------------------------------------------------------------- */
  {
    const deskP = loadDesk(folder("parity-desk-ud"));
    const checks = typeof deskP.api.deskTrustChecks === "function" ? deskP.api.deskTrustChecks() : {
      teamWhole: deskP.api.teamWhole || (() => false),
      openSealed: deskP.api.openSealed || (() => null),
      catalogSigValid: deskP.api.catalogSigValid || (() => false),
      branchSignedBytes: deskP.api.branchSignedBytes || (() => Buffer.alloc(0)),
      deskFileGenuine: deskP.api.deskFileGenuine || (() => false),
      handedTo: deskP.api.handedTo || (() => false)
    };
    const shareP = folder("share-parity");
    const mirrorP = folder("mirror-parity");
    const TEAM_P = "t-" + crypto.randomBytes(8).toString("hex");

    // 1. Genuine team file
    const genuineTeamDoc = teamFile({ team: TEAM_P, epoch: 1, rev: 1 });
    const deskGenuineTeam = Boolean(checks.teamWhole(genuineTeamDoc) && genuineTeamDoc.lead && genuineTeamDoc.lead.public === LEAD.public);

    // 2. Forged team file (signed by forger)
    const forgedTeamDoc = teamFile({ team: TEAM_P, epoch: 1, rev: 1, signer: forger.privateKey, keyId: FORGER.keyId, public: FORGER.public });
    const deskForgedTeam = Boolean(checks.teamWhole(forgedTeamDoc) && forgedTeamDoc.lead && forgedTeamDoc.lead.public === LEAD.public);

    // 3. Ring-vouched lead
    const vouchedKey = crypto.generateKeyPairSync("ed25519");
    const VOUCHED = { keyId: "ring-vouched", public: pubHex(vouchedKey.publicKey) };
    const ringDoc = { format: 1, kind: "etiuda-ring", keys: [{ alg: "Ed25519", catalog: "lamp-shop", keyId: VOUCHED.keyId, public: VOUCHED.public }] };
    fs.writeFileSync(path.join(shareP, "etiuda-ring.json"), JSON.stringify(ringDoc), "utf8");
    const ringCatDoc = sign({
      format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Vouched", date: "2026-02-01",
      langs: [{ code: "en", label: "EN" }], tags: [], cards: []
    }, vouchedKey.privateKey, VOUCHED.keyId);
    const deskRingVouched = Boolean(checks.catalogSigValid(ringCatDoc, VOUCHED.public));

    // 4. Handed-over lead
    const lead2P = crypto.generateKeyPairSync("ed25519");
    const LEAD2P = { keyId: "lead-p2", public: pubHex(lead2P.publicKey) };
    const stepP = {
      format: 1, kind: "etiuda-team-handover", team: TEAM_P,
      to: { keyId: LEAD2P.keyId, public: LEAD2P.public },
      sig: { alg: "Ed25519", keyId: LEAD.keyId }
    };
    const bStepP = Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), signedBytesOf(stepP)]);
    stepP.sig.value = crypto.sign(null, bStepP, lead.privateKey).toString("hex");
    const handedTeamDoc = sign({
      format: 1, kind: "etiuda-team", id: TEAM_P, catalogs: ["lamp-shop"],
      lead: { keyId: LEAD2P.keyId, public: LEAD2P.public },
      sealed: false, epoch: 1, rev: 2, roster: [],
      handover: [stepP]
    }, lead2P.privateKey, LEAD2P.keyId);
    const deskHandedOver = Boolean(checks.teamWhole(handedTeamDoc) && checks.handedTo(handedTeamDoc, LEAD));

    // 5. In-use file
    const deskKeyP = crypto.generateKeyPairSync("ed25519");
    const deskPubP = pubHex(deskKeyP.publicKey);
    const deskIdP = "k-" + crypto.createHash("sha256").update(Buffer.from(deskPubP, "hex")).digest("hex").slice(0, 16);
    const inUseDocP = {
      format: 1, kind: "etiuda-in-use",
      desk: { id: deskIdP, key: deskPubP },
      at: new Date().toISOString(),
      catalog: { id: "lamp-shop", rev: 1, name: "Lamp Shop" },
      sig: { alg: "Ed25519", keyId: deskIdP }
    };
    const bInUseP = Buffer.concat([Buffer.from("etiuda-desk-branch\n", "utf8"), signedBytesOf(inUseDocP)]);
    inUseDocP.sig.value = crypto.sign(null, bInUseP, deskKeyP.privateKey).toString("hex");
    const inUseSealedP = seal(K1, 1, JSON.stringify(inUseDocP), TEAM_P);
    const inUseDecrypted = checks.openSealed(K1, JSON.parse(inUseSealedP));
    const inUseParsed = inUseDecrypted ? JSON.parse(inUseDecrypted) : null;
    const deskInUse = Boolean(inUseParsed && inUseParsed.kind === "etiuda-in-use" && checks.deskFileGenuine(inUseParsed, deskIdP));

    // 6. An answer
    const answerDocP = {
      format: 1, kind: "etiuda-catalog-answer",
      sha256: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      catalog: catalog("lamp-shop", 1, "Lamp Shop", "2026-02-01")
    };
    const answerSealedP = seal(K1, 1, JSON.stringify(answerDocP), TEAM_P);
    const answerDecrypted = checks.openSealed(K1, JSON.parse(answerSealedP));
    const answerParsed = answerDecrypted ? JSON.parse(answerDecrypted) : null;
    const deskAnswer = Boolean(answerParsed && +answerParsed.format === 1 && answerParsed.kind === "etiuda-catalog-answer" && answerParsed.catalog);

    // 7. Unsigned shared catalog
    const unsignedDocP = {
      format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Lamp Shop", date: "2026-02-01",
      langs: [{ code: "en", label: "EN" }], tags: [], cards: []
    };
    const deskUnsigned = Boolean(unsignedDocP && +unsignedDocP.format === 2 && unsignedDocP.kind === "etiuda-catalog" && !unsignedDocP.sig);

    // 8. Sealed edition at another epoch
    const editionDocP = catalog("lamp-shop", 2, "Second", "2026-02-02");
    const sealedEpoch2 = seal(K2, 2, text(editionDocP), TEAM_P);
    const deskEpoch2 = Boolean(checks.openSealed(K1, JSON.parse(sealedEpoch2)));

    const deskVerdicts = [deskGenuineTeam, deskForgedTeam, deskRingVouched, deskHandedOver, deskInUse, deskAnswer, deskUnsigned, deskEpoch2];

    // Syncer evaluations
    fs.writeFileSync(path.join(shareP, "etiuda-team.json"), JSON.stringify(genuineTeamDoc), "utf8");
    fs.writeFileSync(path.join(shareP, "vouched.ec"), text(ringCatDoc), "utf8");
    const inUseDirP = path.join(shareP, "desks", deskIdP);
    fs.mkdirSync(inUseDirP, { recursive: true });
    fs.writeFileSync(path.join(inUseDirP, "in-use.ec"), inUseSealedP, "utf8");
    fs.writeFileSync(path.join(inUseDirP, "catalog-answer.ec"), answerSealedP, "utf8");
    fs.writeFileSync(path.join(shareP, "unsigned.ec"), JSON.stringify(unsignedDocP), "utf8");
    fs.writeFileSync(path.join(shareP, "epoch2.ec"), sealedEpoch2, "utf8");

    const progP = syncerMod.createFolderProgram({
      team: TEAM_P, folder: shareP, mirror: mirrorP, pin: LEAD, checks,
      keyFor: ep => (ep === 1 ? K1 : null)
    });
    await progP.syncOnce();

    const syncerGenuineTeam = fs.existsSync(path.join(mirrorP, "etiuda-team.json"));
    const syncerRingVouched = fs.existsSync(path.join(mirrorP, "vouched.ec"));
    const syncerInUse = fs.existsSync(path.join(mirrorP, "desks", deskIdP, "in-use.ec"));
    const syncerAnswer = fs.existsSync(path.join(mirrorP, "desks", deskIdP, "catalog-answer.ec"));
    const syncerUnsigned = fs.existsSync(path.join(mirrorP, "unsigned.ec"));
    const syncerEpoch2 = fs.existsSync(path.join(mirrorP, "epoch2.ec"));

    const shareForged = folder("share-parity-forged");
    const mirrorForged = folder("mirror-parity-forged");
    fs.writeFileSync(path.join(shareForged, "etiuda-team.json"), JSON.stringify(forgedTeamDoc), "utf8");
    const progForged = syncerMod.createFolderProgram({
      team: TEAM_P, folder: shareForged, mirror: mirrorForged, pin: LEAD, checks, keyFor: ep => (ep === 1 ? K1 : null)
    });
    await progForged.syncOnce();
    const syncerForgedTeam = fs.existsSync(path.join(mirrorForged, "etiuda-team.json"));

    const shareHanded = folder("share-parity-handed");
    const mirrorHanded = folder("mirror-parity-handed");
    fs.writeFileSync(path.join(shareHanded, "etiuda-team.json"), JSON.stringify(handedTeamDoc), "utf8");
    const progHanded = syncerMod.createFolderProgram({
      team: TEAM_P, folder: shareHanded, mirror: mirrorHanded, pin: LEAD, checks, keyFor: ep => (ep === 1 ? K1 : null)
    });
    await progHanded.syncOnce();
    const syncerHandedOver = fs.existsSync(path.join(mirrorHanded, "etiuda-team.json"));

    const syncerVerdicts = [syncerGenuineTeam, syncerForgedTeam, syncerRingVouched, syncerHandedOver, syncerInUse, syncerAnswer, syncerUnsigned, syncerEpoch2];

    const agree = deskVerdicts.every((v, i) => v === syncerVerdicts[i]);
    check(agree && deskVerdicts[0] === true && deskVerdicts[1] === false && deskVerdicts[7] === false,
      "42i parity: desk and syncer trust verdicts agree over corpus: "
      + JSON.stringify({ desk: deskVerdicts, syncer: syncerVerdicts }));
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 19 (42k): E2 - a syncer made without checks refuses and nothing starts
   * ----------------------------------------------------------------------------------------------- */
  {
    let refused = false;
    let thrownMsg = "";
    try {
      const s = syncerMod.startFolderSyncer({
        team: TEAM,
        folder: SHARE,
        mirror: folder("mirror-nochecks"),
        pin: LEAD,
        useWorker: false
      });
      if (s && typeof s.stop === "function") s.stop();
    } catch (e) {
      refused = true;
      thrownMsg = (e && e.message) || "";
    }
    const saysChecks = /without the desk's checks/i.test(thrownMsg);
    check(refused && saysChecks,
      "42k a syncer made without checks refuses, saying it was made without the desk's checks: "
      + JSON.stringify({ refused, saysChecks, thrownMsg }));
  }

  /* =================================================================================================
   * Slice 2: the desk's writes go through the mirror and an outbox (board 945 stage 3 (b) slice 2)
   * ================================================================================================= */
  const APP_SYNCER = path.join(APP, "shell", "folder", "syncer.cjs");
  const appSyncer = () => nodeRequire(APP_SYNCER);
  function teamDesk(name, share, extra = {}) {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    const env = Object.assign({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
      teamPins: { [extra.team || TEAM]: LEAD }, teamShown: { [extra.team || TEAM]: { lead: "Lead", folder: share } } }, extra.env || {});
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
    const mirror = path.join(ud, "folder-mirror", extra.team || TEAM);
    fs.mkdirSync(mirror, { recursive: true });
    return { ud, mirror };
  }
  /* The program's own disk calls, with every write into `share` refused with `code`: the folder lists and reads, and takes nothing. */
  const refusingIo = (share, code) => ({
    readdir: d => fs.readdirSync(d), stat: p => fs.statSync(p), readFile: (p, e) => fs.readFileSync(p, e),
    writeFile: (p, data) => {
      if (path.resolve(p).toLowerCase().startsWith(path.resolve(share).toLowerCase() + path.sep)) { const e = new Error(code); e.code = code; throw e; }
      fs.writeFileSync(p, data);
    },
    unlink: p => fs.unlinkSync(p), mkdir: d => fs.mkdirSync(d, { recursive: true }), exists: p => fs.existsSync(p), rename: (a, b) => fs.renameSync(a, b)
  });
  const branchOf = (me, tail, rev) => ({ format: 2, kind: "etiuda-catalog", id: me.id + "-" + tail, desk: { id: me.id, key: me.key, box: me.box }, rev: rev || 0, cards: [] });
  const revAt = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")).rev; } catch { return null; } };
  const owedAtOf = (mirror, rel) => (typeof syncerMod.owedAt === "function" ? syncerMod.owedAt(mirror, rel) : null);
  let bump = Date.now() / 1000 + 100;
  const touch = f => { bump += 5; fs.utimesSync(f, bump, bump); };

  /* -------------------------------------------------------------------------------------------------
   * 44a (point 1, F7.1): a desk's write on a folder team touches nothing under the share on the main thread, lands in the
   * mirror, and reaches the share from the outbox
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44a");
    const { ud, mirror } = teamDesk("desk-44a", share);
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    const d = loadDesk(ud);
    const me = d.api.branchIdentity(true);
    const stem = "cat-44a-0a0b0c0d";
    const spied = [];
    const names = ["readdirSync", "readFileSync", "statSync", "existsSync", "writeFileSync", "renameSync", "mkdirSync", "openSync", "unlinkSync"];
    const orig = {};
    for (const n of names) {
      orig[n] = fs[n];
      fs[n] = function (p, ...rest) {
        if (typeof p === "string" && path.resolve(p).toLowerCase().startsWith(path.resolve(share).toLowerCase())) spied.push(n + " " + p);
        return orig[n].call(fs, p, ...rest);
      };
    }
    let w = null;
    try { w = d.api.writeBranch(stem, JSON.stringify(branchOf(me, "0a0b0c0d"))); }
    finally { for (const n of names) fs[n] = orig[n]; }
    const rel = "desks/" + me.id + "/" + stem + ".ec";
    const mirrorFile = path.join(mirror, "desks", me.id, stem + ".ec"), shareFile = path.join(share, "desks", me.id, stem + ".ec");
    const inMirror = !!(w && w.ok) && fs.existsSync(mirrorFile), notYet = !fs.existsSync(shareFile);
    const owedBefore = owedAtOf(mirror, rel);
    const prog = syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks });
    prog.syncOnce();
    const landed = fs.existsSync(shareFile) && fs.readFileSync(shareFile).equals(fs.readFileSync(mirrorFile));
    const owedAfter = owedAtOf(mirror, rel);
    /* The same through the worker thread: a second write, owed while no syncer runs, reaches the share from the worker. */
    d.api.writeBranch("cat-44a-1e1e1e1e", JSON.stringify(branchOf(me, "1e1e1e1e")));
    const second = path.join(share, "desks", me.id, "cat-44a-1e1e1e1e.ec");
    let byWorker = false, ctl = null;
    try {
      ctl = new syncerMod.FolderSyncerController({ team: TEAM, folder: share, mirror, pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks, pollMs: 200 });
      ctl.start();
      for (let i = 0; i < 300 && !(byWorker = fs.existsSync(second) && !owedAtOf(mirror, "desks/" + me.id + "/cat-44a-1e1e1e1e.ec")); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch { byWorker = false; }
    finally { if (ctl) ctl.stop(); }
    check(spied.length === 0 && inMirror && notYet && owedBefore && landed && !owedAfter && byWorker,
      "44a a desk's write on a folder team touches nothing under the share on the main thread, lands in the mirror and reaches the share from the outbox: "
      + "share calls " + spied.length + (spied.length ? " (" + spied.slice(0, 3).join("; ") + ")" : "") + ", in mirror " + inMirror
      + ", not in share yet " + notYet + ", owed " + owedBefore + ", landed whole " + landed + ", owed after " + owedAfter
      + ", through the worker thread " + byWorker);
  }

  /* -------------------------------------------------------------------------------------------------
   * 44b (point 2, F7.2): an owed file at rev 2 survives a share still answering rev 1, a new owed file survives two
   * listings without it, and both reach the share once it takes writes
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44b");
    const { ud, mirror } = teamDesk("desk-44b", share);
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    const d = loadDesk(ud);
    const me = d.api.branchIdentity(true);
    const stemA = "cat-44b-1a1b1c1d", stemB = "cat-44b-2a2b2c2d";
    const fileA = rel => path.join(rel, "desks", me.id, stemA + ".ec"), fileB = rel => path.join(rel, "desks", me.id, stemB + ".ec");
    d.api.writeBranch(stemA, JSON.stringify(branchOf(me, "1a1b1c1d")));
    syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks }).syncOnce();
    const shareHadRev1 = revAt(fileA(share)) === 1;
    d.api.writeBranch(stemA, JSON.stringify(Object.assign(branchOf(me, "1a1b1c1d"), { name: "Edited" })));
    d.api.writeBranch(stemB, JSON.stringify(branchOf(me, "2a2b2c2d")));
    touch(fileA(share));
    const refused = syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, io: refusingIo(share, "EACCES") });
    refused.syncOnce();
    refused.syncOnce();
    refused.syncOnce();
    const keptRev2 = revAt(fileA(mirror)) === 2 && revAt(fileA(share)) === 1;
    const newSurvives = fs.existsSync(fileB(mirror)) && !fs.existsSync(fileB(share));
    syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks }).syncOnce();
    const bothLanded = revAt(fileA(share)) === 2 && fs.existsSync(fileB(share)) && revAt(fileA(mirror)) === 2 && fs.existsSync(fileB(mirror));
    check(shareHadRev1 && keptRev2 && newSurvives && bothLanded,
      "44b an owed file at rev 2 survives a share still answering rev 1, a new owed file survives listings without it, and both reach the share once it takes writes: "
      + "share had rev 1 " + shareHadRev1 + ", mirror kept rev 2 " + keptRev2 + ", new file survives " + newSurvives + ", both landed " + bothLanded);
  }

  /* -------------------------------------------------------------------------------------------------
   * 44c (point 3): rev and counter floors per (scope, id) at each path: a lagging copy cannot roll an edition, a desk file or
   * in-use's counter back in the mirror, not even after the mirror's copy has gone, while an older edition the folder keeps
   * under a name of its own still reaches it (an older edition opened on purpose, tests/catalog-in-use.mjs 890r)
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44c"), mirror = folder("mirror-44c");
    const TEAM_C = "t-" + crypto.randomBytes(8).toString("hex");
    const kC = crypto.generateKeyPairSync("ed25519"), kPub = pubHex(kC.publicKey);
    const kId = "k-" + crypto.createHash("sha256").update(Buffer.from(kPub, "hex")).digest("hex").slice(0, 16);
    const deskSigned = doc => {
      const out = JSON.parse(JSON.stringify(doc));
      out.sig = { alg: "Ed25519", keyId: kId };
      out.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-desk-branch\n", "utf8"), signedBytesOf(out)]), kC.privateKey).toString("hex");
      return out;
    };
    const deskFile = rev => JSON.stringify(deskSigned({ format: 2, kind: "etiuda-catalog", id: kId + "-0e0e0e0e", desk: { id: kId, key: kPub }, rev, cards: [] }), null, 1) + "\n";
    const inUse = n => seal(K1, 1, JSON.stringify(deskSigned({ format: 1, kind: "etiuda-in-use", desk: { id: kId, key: kPub }, at: "2026-11-01T00:00:00.000Z",
      catalog: { id: "lamp-shop", rev: 1 }, n })), TEAM_C);
    const dDir = path.join(share, "desks", kId);
    fs.mkdirSync(dDir, { recursive: true });
    const put = (f, t) => { fs.writeFileSync(f, t, "utf8"); touch(f); };
    put(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_C, epoch: 1, rev: 1 })));
    put(path.join(share, "lamp-shop.ec"), CAT_A2);
    put(path.join(dDir, "notes-0e0e0e0e.ec"), deskFile(3));
    put(path.join(dDir, "in-use.ec"), inUse(5));
    const prog = syncerMod.createFolderProgram({ team: TEAM_C, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks });
    prog.syncOnce();
    const nAt = f => { try { const env = JSON.parse(fs.readFileSync(f, "utf8")); return JSON.parse(checks.openSealed(K1, env)).n; } catch { return null; } };
    const first = revAt(path.join(mirror, "lamp-shop.ec")) === 2 && revAt(path.join(mirror, "desks", kId, "notes-0e0e0e0e.ec")) === 3
      && nAt(path.join(mirror, "desks", kId, "in-use.ec")) === 5;
    put(path.join(share, "lamp-shop.ec"), CAT_A1);
    put(path.join(share, "lamp-shop (1).ec"), CAT_A1);
    put(path.join(dDir, "notes-0e0e0e0e.ec"), deskFile(2));
    put(path.join(dDir, "in-use.ec"), inUse(4));
    prog.syncOnce();
    const editionHeld = revAt(path.join(mirror, "lamp-shop.ec")) === 2;
    const keptOlder = revAt(path.join(mirror, "lamp-shop (1).ec")) === 1;
    /* The edition leaves the share for two listings, so the mirror's copy goes; the lagging rev 1 then comes back. */
    fs.unlinkSync(path.join(share, "lamp-shop.ec"));
    prog.syncOnce();
    prog.syncOnce();
    const gone = !fs.existsSync(path.join(mirror, "lamp-shop.ec"));
    put(path.join(share, "lamp-shop.ec"), CAT_A1);
    prog.syncOnce();
    const renamedOut = gone && !fs.existsSync(path.join(mirror, "lamp-shop.ec"));
    const deskHeld = revAt(path.join(mirror, "desks", kId, "notes-0e0e0e0e.ec")) === 3;
    const counterHeld = nAt(path.join(mirror, "desks", kId, "in-use.ec")) === 5;
    put(path.join(dDir, "notes-0e0e0e0e.ec"), deskFile(4));
    put(path.join(dDir, "in-use.ec"), inUse(6));
    prog.syncOnce();
    const forward = revAt(path.join(mirror, "desks", kId, "notes-0e0e0e0e.ec")) === 4 && nAt(path.join(mirror, "desks", kId, "in-use.ec")) === 6;
    check(first && editionHeld && keptOlder && renamedOut && deskHeld && counterHeld && forward,
      "44c a lagging copy cannot roll an edition, a desk file or in-use's counter back in the mirror, even after the mirror's copy has gone, an older edition under a name of its own still lands, and a newer one lands: "
      + "first landed " + first + ", edition held " + editionHeld + ", older edition under its own name kept " + keptOlder + ", lagging copy after removal out " + renamedOut
      + ", desk file held " + deskHeld + ", counter held " + counterHeld + ", newer lands " + forward);
  }

  /* -------------------------------------------------------------------------------------------------
   * 44d (point 4, #4): two desks edit the shared catalog: the compare and swap runs against the share off the main thread
   * under the lock, the winning bytes are in the writer's mirror, and the colleague's concurrent edit is never clobbered
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44d");
    const team = "t-" + crypto.randomBytes(8).toString("hex");
    const tf = JSON.stringify(teamFile({ team, sealed: false, catalogs: ["shop"], epoch: 1, rev: 1 }));
    const shop = rev => JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "shop", rev, name: "Shop", date: "2026-11-01",
      langs: [{ code: "en", label: "EN" }], tags: [], cards: [{ id: "c-" + rev, bodyShape: "plain", title: { en: "Card " + rev }, body: { en: "Body " + rev } }] }, null, 1) + "\n";
    fs.writeFileSync(path.join(share, "etiuda-team.json"), tf, "utf8");
    fs.writeFileSync(path.join(share, "shop.ec"), shop(1), "utf8");
    const A = teamDesk("desk-44d-a", share, { team }), B = teamDesk("desk-44d-b", share, { team });
    for (const m of [A.mirror, B.mirror]) { fs.writeFileSync(path.join(m, "etiuda-team.json"), tf, "utf8"); fs.writeFileSync(path.join(m, "shop.ec"), shop(1), "utf8"); }
    const sha = t => crypto.createHash("sha256").update(Buffer.from(t, "utf8")).digest("hex");
    let modA = null, modB = null, out = {};
    const spied = [];
    try {
      const dA = loadDesk(A.ud);
      const rA = await dA.ask("etiuda:shared-read", "shop.ec", "");
      modA = appSyncer();
      delete nodeRequire.cache[nodeRequire.resolve(APP_SYNCER)];
      const dB = loadDesk(B.ud);
      const rB = await dB.ask("etiuda:shared-read", "shop.ec", "");
      modB = appSyncer();
      const names = ["readdirSync", "readFileSync", "statSync", "existsSync", "writeFileSync", "renameSync", "openSync", "unlinkSync"];
      const orig = {};
      for (const n of names) {
        orig[n] = fs[n];
        fs[n] = function (p, ...rest) {
          if (typeof p === "string" && path.resolve(p).toLowerCase().startsWith(path.resolve(share).toLowerCase())) spied.push(n + " " + p);
          return orig[n].call(fs, p, ...rest);
        };
      }
      let wA = null, wB = null;
      try {
        wA = await dA.ask("etiuda:shared-write", "shop.ec", shop(2), rA && rA.sha, false);
        wB = await dB.ask("etiuda:shared-write", "shop.ec", shop(3), rB && rB.sha, false);
      } finally { for (const n of names) fs[n] = orig[n]; }
      const shareNow = fs.readFileSync(path.join(share, "shop.ec"), "utf8");
      const rB2 = await dB.ask("etiuda:shared-write", "shop.ec", shop(3), sha(shop(2)), false);
      out = {
        sameRead: !!rA && !!rB && rA.sha === sha(shop(1)) && rB.sha === rA.sha,
        aOk: !!wA && wA.ok === true, bChanged: !!wB && wB.changed === true && wB.ok === false,
        shareHoldsA: shareNow === shop(2), mirrorA: fs.readFileSync(path.join(A.mirror, "shop.ec"), "utf8") === shop(2),
        noLock: !fs.existsSync(path.join(share, "shop.ec.lock")),
        bAfter: !!rB2 && rB2.ok === true && fs.readFileSync(path.join(share, "shop.ec"), "utf8") === shop(3)
      };
    } catch (e) { out.error = String(e && e.message); }
    finally {
      if (modA) modA.stopAllFolderSyncers();
      if (modB) modB.stopAllFolderSyncers();
    }
    check(!out.error && spied.length === 0 && out.sameRead && out.aOk && out.bChanged && out.shareHoldsA && out.mirrorA && out.noLock && out.bAfter,
      "44d two desks edit the shared catalog: the compare and swap runs against the share off the main thread under the lock, the winning bytes are in the writer's mirror, and the colleague's concurrent edit is never clobbered: "
      + JSON.stringify(Object.assign({ mainThreadShareCalls: spied.length }, out)));
  }

  /* -------------------------------------------------------------------------------------------------
   * 44e (point 5, F5): a wake from sleep never marks the local mirror down; the share is asked again instead
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44e");
    const { ud, mirror } = teamDesk("desk-44e", share);
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(mirror, "lamp-shop.ec"), CAT_A1, "utf8");
    const d = loadDesk(ud);
    let mirrorAnswers = false, shareAsked = false, read = null, err = "";
    try {
      d.api.resumeFromSleep();
      mirrorAnswers = d.api.folderAnswers(d.api.catalogFolder()) && path.resolve(d.api.catalogFolder()) === path.resolve(mirror);
      shareAsked = !d.api.folderAnswers(share);
      read = d.api.readCatalog();
    } catch (e) { err = String(e && e.message); }
    finally { try { appSyncer().stopAllFolderSyncers(); } catch {} }
    check(!err && mirrorAnswers && shareAsked && read === CAT_A1.trim(),
      "44e a wake from sleep never marks the local mirror down, and the share is asked again instead: "
      + "mirror answers " + mirrorAnswers + ", share asked again " + shareAsked + ", reads the mirror " + (read === CAT_A1.trim()) + (err ? ", " + err : ""));
  }

  /* -------------------------------------------------------------------------------------------------
   * 44f (point 5, F5): a first boot under machine policy (TeamFolder and LeadKey, no pin yet) learns the team from
   * the team file and does not take the catalog from the share before the syncer has run; after that it reads the mirror
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44f");
    const team = "t-" + crypto.randomBytes(8).toString("hex");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ team, sealed: false, epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "lamp-shop.ec"), CAT_A1, "utf8");
    const ud = folder("desk-44f");
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }), "utf8");
    const mirror = path.join(ud, "folder-mirror", team);
    let out = {};
    REG.policy = regText([["TeamFolder", share], ["LeadKey", LEAD.public]]);
    const spied = [];
    const spyNames = ["readdirSync", "readFileSync", "statSync", "existsSync"];
    const spyOrig = {};
    const shareRoot = path.resolve(share).toLowerCase();
    for (const n of spyNames) {
      spyOrig[n] = fs[n];
      fs[n] = function (p, ...rest) {
        if (typeof p === "string") {
          const got = path.resolve(p).toLowerCase();
          if (got === shareRoot || got.startsWith(shareRoot + path.sep)) spied.push(n + " " + p);
        }
        return spyOrig[n].call(fs, p, ...rest);
      };
    }
    try {
      const d = loadDesk(ud);
      const before = d.api.catalogFolder();
      const read = d.api.readCatalog();
      const after = d.api.catalogFolder();
      const ft = d.api.folderTeamHere();
      for (const n of spyNames) fs[n] = spyOrig[n];
      const prog = syncerMod.createFolderProgram({ team, folder: share, mirror, pin: LEAD, keys: {}, checks });
      prog.syncOnce();
      const primed = d.api.catalogFolder();
      const read2 = d.api.readCatalog();
      const waiting = read == null && d.said.some(l => l.indexOf("still reading the team's shared folder") >= 0)
        && !d.said.some(l => l.indexOf("no catalog found") >= 0)
        && !spied.some(line => /lamp-shop\.ec/i.test(line));
      out = {
        policyWin: process.platform !== "win32" ? "skipped" : true,
        namedFirst: path.resolve(before) === path.resolve(share), waiting: waiting,
        noFlip: path.resolve(after) === path.resolve(share), pinned: !!ft && ft.team === team,
        mirrorAfterSync: path.resolve(primed) === path.resolve(mirror), readMirror: read2 === CAT_A1.trim()
      };
    } catch (e) { out.error = String(e && e.message); }
    finally {
      for (const n of spyNames) fs[n] = spyOrig[n];
      REG.policy = null;
    }
    const ok = process.platform !== "win32" || (!out.error && out.namedFirst && out.waiting && out.noFlip && out.pinned && out.mirrorAfterSync && out.readMirror);
    check(ok, "44f a first boot under machine policy pins the team from its team file, does not take the catalog from the share before the syncer has run, and then reads the mirror: " + JSON.stringify(out));
  }

  /* -------------------------------------------------------------------------------------------------
   * 44g (point 5, F5): takeInvite stays a direct read of the invitation's folder, and says why where it reads
   * ----------------------------------------------------------------------------------------------- */
  {
    const src = getShellSrc();
    const at = src.indexOf("async function takeInvite(");
    const end = at < 0 ? -1 : src.indexOf("\nasync function ", at + 10) < 0 ? src.length : src.indexOf("\nasync function ", at + 10);
    const body = at < 0 ? "" : src.slice(at, end);
    const said = /Read straight from the invitation's folder, not a mirror: no team is joined yet, so no syncer keeps one/.test(body);
    const readsThere = /path\.join\(parsed\.folder, "invites"/.test(body);
    check(said && readsThere, "44g takeInvite reads the invitation's folder directly, and says where it reads that no team exists yet to keep a mirror: comment " + said + ", direct read " + readsThere);
  }

  /* -------------------------------------------------------------------------------------------------
   * 44h (point 6): honest when it has not landed: while the share refuses (EACCES, ENOSPC) the row says kept, the outbox
   * says why once and tries again, and nothing is dropped
   * ----------------------------------------------------------------------------------------------- */
  {
    const share = folder("share-44h");
    const { ud, mirror } = teamDesk("desk-44h", share);
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    const d = loadDesk(ud);
    const me = d.api.branchIdentity(true);
    const stem = "cat-44h-3a3b3c3d";
    d.api.writeBranch(stem, JSON.stringify(branchOf(me, "3a3b3c3d")));
    const rowOf = () => (d.api.deskRows().filter(r => r.id === me.id + "-3a3b3c3d")[0] || null);
    const said = [];
    const logger = s => said.push(String(s));
    const run = io => syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks, logger, io }).syncOnce();
    run(refusingIo(share, "EACCES"));
    const keptEacces = !!rowOf() && rowOf().reached === false;
    run(refusingIo(share, "EACCES"));
    run(refusingIo(share, "ENOSPC"));
    const keptEnospc = !!rowOf() && rowOf().reached === false;
    const saidOnce = said.filter(l => l.indexOf("(EACCES)") >= 0).length === 1 && said.filter(l => l.indexOf("(ENOSPC)") >= 0).length === 1;
    const notInShare = !fs.existsSync(path.join(share, "desks", me.id, stem + ".ec"));
    run(undefined);
    const reached = !!rowOf() && rowOf().reached === true;
    const inShare = fs.existsSync(path.join(share, "desks", me.id, stem + ".ec"));
    check(keptEacces && keptEnospc && saidOnce && notInShare && reached && inShare,
      "44h while the share refuses the write the row says kept, the outbox says why once a cause and tries again, and the write lands once it can: "
      + "kept on EACCES " + keptEacces + ", kept on ENOSPC " + keptEnospc + ", each cause said once " + saidOnce
      + ", not in share meanwhile " + notInShare + ", reached after " + reached + ", in share " + inShare);
  }

  /* -------------------------------------------------------------------------------------------------
   * Plants: Proved by removal in scratch copy, never in checkout, sha256 restored
   * ----------------------------------------------------------------------------------------------- */
  const syncerFile = path.join(ROOT, "shell", "folder", "syncer.cjs");
  const mainFile = path.join(ROOT, "shell", "main.js");

  async function testPlant(tag, file, testFn) {
    if (!fs.existsSync(file)) return { ok: false, reason: "file does not exist" };
    const before = fs.readFileSync(file);
    const text = before.toString("utf8");
    const lines = text.split("\n");
    const at = lines.findIndex(l => l.includes("plant:" + tag));
    if (at < 0) return { ok: false, reason: "plant:" + tag + " absent in " + path.basename(file) };

    lines.splice(at, 1);
    const mutated = lines.join("\n");
    const scratchDir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
    const scratchFile = path.join(scratchDir, path.basename(file));
    fs.writeFileSync(scratchFile, mutated, "utf8");

    let turned = false;
    try {
      turned = await testFn(scratchFile, scratchDir);
    } catch (e) {
      turned = false;
    }

    const same = fs.readFileSync(file).equals(before);
    return { ok: turned && same, turned, same };
  }

  // 41g: plant:catalog-folder-mirror
  {
    const r = await testPlant("catalog-folder-mirror", mainFile, (scratchMain) => {
      const ud = folder("plant-cfg-desk");
      const env = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" }, teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: SHARE } } };
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
      const reloaded = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      // Without the mirror guard, catalogFolder returns SHARE instead of mirror
      return reloaded.api.catalogFolder() === SHARE;
    });
    check(r.ok, "41g lifting plant:catalog-folder-mirror makes catalogFolder return remote share on folder team: " + JSON.stringify(r));
  }

  // 41h: plant:syncer-team-pin
  {
    const r = await testPlant("syncer-team-pin", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-pin-share");
      const mirrorDir = folder("plant-pin-mirror");
      // Team file signed by forger
      const forgedTeam = JSON.stringify(teamFile({ epoch: 1, rev: 1, signer: forger.privateKey, keyId: FORGER.keyId, public: FORGER.public }));
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), forgedTeam, "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 }, checks });
      prog.syncOnce();
      // Without pin check, forged team file lands
      return fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
    });
    check(r.ok, "41h lifting plant:syncer-team-pin lets a team file with a foreign lead key land in the mirror: " + JSON.stringify(r));
  }

  // 41i: plant:syncer-team-rev
  {
    const r = await testPlant("syncer-team-rev", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-rev-share");
      const mirrorDir = folder("plant-rev-mirror");
      // Mirror has rev 2
      fs.writeFileSync(path.join(mirrorDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 2 })), "utf8");
      // Share has older rev 1
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 }, checks });
      prog.syncOnce();
      const mirrorDoc = JSON.parse(fs.readFileSync(path.join(mirrorDir, "etiuda-team.json"), "utf8"));
      // Without rev check, older rev 1 overwrites rev 2
      return mirrorDoc.rev === 1;
    });
    check(r.ok, "41i lifting plant:syncer-team-rev lets an older team file overwrite a newer one in the mirror: " + JSON.stringify(r));
  }

  // 41j: plant:syncer-edition-sig
  {
    const r = await testPlant("syncer-edition-sig", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-esig-share");
      const mirrorDir = folder("plant-esig-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      // Edition signed by forger
      const forgedEd = sign({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Bad", date: "2026-02-01", langs: [], tags: [], cards: [] },
        forger.privateKey, FORGER.keyId);
      const sealedForged = seal(K1, 1, text(forgedEd));
      fs.writeFileSync(path.join(shareDir, "forged.ec"), sealedForged, "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 }, checks });
      prog.syncOnce();
      // Without signature check, forged edition lands
      return fs.existsSync(path.join(mirrorDir, "forged.ec"));
    });
    check(r.ok, "41j lifting plant:syncer-edition-sig lets a forged edition reach the mirror: " + JSON.stringify(r));
  }

  // 41k: plant:syncer-epoch-pending
  {
    const r = await testPlant("syncer-epoch-pending", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-pend-share");
      const mirrorDir = folder("plant-pend-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      const sealedE2 = seal(K2, 2, CAT_A2);
      fs.writeFileSync(path.join(shareDir, "lamp-e2.ec"), sealedE2, "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1, 2: K2 }, checks });
      prog.syncOnce();
      // Without pending guard, file is applied prematurely to mirror while team is at epoch 1
      return fs.existsSync(path.join(mirrorDir, "lamp-e2.ec"));
    });
    check(r.ok, "41k lifting plant:syncer-epoch-pending drops or prematurely applies an edition above the mirror's epoch: " + JSON.stringify(r));
  }

  // 42b: plant:syncer-live-key
  {
    const r = await testPlant("syncer-live-key", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-key-share");
      const mirrorDir = folder("plant-key-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(shareDir, "edition.ec"), seal(K1, 1, CAT_A1), "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keyFor: e => (e === 1 ? K1 : null), checks });
      let failedKey = false;
      try {
        prog.syncOnce();
        failedKey = !fs.existsSync(path.join(mirrorDir, "edition.ec"));
      } catch {
        failedKey = true;
      }
      return failedKey;
    });
    check(r.ok, "42b lifting plant:syncer-live-key prevents sealed edition from being decrypted and landed: " + JSON.stringify(r));
  }

  // 42c: plant:syncer-team-handover
  {
    const r = await testPlant("syncer-team-handover", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-hand-share");
      const mirrorDir = folder("plant-hand-mirror");
      const TEAM_H = "t-" + crypto.randomBytes(8).toString("hex");
      const lead2 = crypto.generateKeyPairSync("ed25519");
      const LEAD2 = { keyId: "lead-2", public: pubHex(lead2.publicKey) };
      const step = {
        format: 1, kind: "etiuda-team-handover", team: TEAM_H,
        to: { keyId: LEAD2.keyId, public: LEAD2.public },
        sig: { alg: "Ed25519", keyId: LEAD.keyId }
      };
      const bStep = Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), signedBytesOf(step)]);
      step.sig.value = crypto.sign(null, bStep, lead.privateKey).toString("hex");
      const handedTeam = sign({
        format: 1, kind: "etiuda-team", id: TEAM_H, catalogs: ["lamp-shop"],
        lead: { keyId: LEAD2.keyId, public: LEAD2.public },
        sealed: false, epoch: 1, rev: 2, roster: [],
        handover: [step]
      }, lead2.privateKey, LEAD2.keyId);
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(handedTeam), "utf8");
      const prog = mod.createFolderProgram({ team: TEAM_H, folder: shareDir, mirror: mirrorDir, pin: LEAD, checks });
      prog.syncOnce();
      // Without handover support, handed-over team file does not land
      return !fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
    });
    check(r.ok, "42c lifting plant:syncer-team-handover prevents handed-over team file from landing: " + JSON.stringify(r));
  }

  // 42d: plant:syncer-head-wait
  {
    const r = await testPlant("syncer-head-wait", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-head-share");
      const mirrorDir = folder("plant-head-mirror");
      const TEAM_HD = "t-" + crypto.randomBytes(8).toString("hex");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ team: TEAM_HD, epoch: 1, rev: 1 })), "utf8");
      const headSigned = {
        v: 1, team: TEAM_HD, epoch: 1, rev: 2, t: 1700000000000,
        editions: [{ catalog: "lamp-shop", rev: 2, edition: "Second", published: "2026-02-02" }],
        sig: { alg: "Ed25519", keyId: LEAD.keyId }
      };
      const bHead = Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), signedBytesOf(headSigned)]);
      headSigned.sig.value = crypto.sign(null, bHead, lead.privateKey).toString("hex");
      fs.writeFileSync(path.join(shareDir, "etiuda-head.json"), JSON.stringify(headSigned), "utf8");
      const prog = mod.createFolderProgram({ team: TEAM_HD, folder: shareDir, mirror: mirrorDir, pin: LEAD, checks });
      prog.syncOnce();
      // Without head-wait, head lands prematurely before its edition
      return fs.existsSync(path.join(mirrorDir, "etiuda-head.json"));
    });
    check(r.ok, "42d lifting plant:syncer-head-wait lets etiuda-head.json land before its editions: " + JSON.stringify(r));
  }

  // 42e: plant:syncer-staging-sweep
  {
    const r = await testPlant("syncer-staging-sweep", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const mirrorDir = folder("plant-sweep-mirror");
      const stagingDir = path.join(mirrorDir, ".staging");
      fs.mkdirSync(stagingDir, { recursive: true });
      const tmpFile = path.join(stagingDir, "leftover.tmp");
      fs.writeFileSync(tmpFile, "old", "utf8");
      mod.createFolderProgram({ team: TEAM, folder: folder("f"), mirror: mirrorDir, pin: LEAD, checks });
      // Without staging sweep, leftover tmp file remains
      return fs.existsSync(tmpFile);
    });
    check(r.ok, "42e lifting plant:syncer-staging-sweep leaves stale tmp files in .staging on start: " + JSON.stringify(r));
  }

  // 42f: plant:syncer-pending-reuse
  {
    const r = await testPlant("syncer-pending-reuse", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-reuse-share");
      const mirrorDir = folder("plant-reuse-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(shareDir, "future.ec"), seal(K1, 10, CAT_A1), "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, checks });
      prog.syncOnce();
      fs.writeFileSync(path.join(shareDir, "future.ec"), seal(K1, 10, CAT_A2), "utf8");
      prog.syncOnce();
      const stFiles = fs.readdirSync(path.join(mirrorDir, ".staging")).filter(f => f.endsWith(".tmp"));
      // Without pending reuse, multiple tmp files accumulate for the same pending path
      return stFiles.length > 1;
    });
    check(r.ok, "42f lifting plant:syncer-pending-reuse leaks multiple staged files for one pending item: " + JSON.stringify(r));
  }

  // 41m: plant:syncer-two-absent-remove
  {
    const r = await testPlant("syncer-two-absent-remove", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-rm-share");
      const mirrorDir = folder("plant-rm-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(mirrorDir, "temp.ec"), CAT_A1, "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 }, checks });
      prog.syncOnce(); // only 1 missing listing
      // Without two-absent guard, file is removed after only 1 missing listing
      return !fs.existsSync(path.join(mirrorDir, "temp.ec"));
    });
    check(r.ok, "41m lifting plant:syncer-two-absent-remove removes a file missing from only one answered listing: " + JSON.stringify(r));
  }

  // 41n: plant:syncer-singleton
  {
    const r = await testPlant("syncer-singleton", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const s1 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false, checks });
      const s2 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false, checks });
      mod.stopAllFolderSyncers();
      // Without singleton check, s1 !== s2
      return s1 !== s2;
    });
    check(r.ok, "41n lifting plant:syncer-singleton creates two running syncers for the same team: " + JSON.stringify(r));
  }

  // 41o: plant:syncer-team-change
  {
    const r = await testPlant("syncer-team-change", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const s1 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false, checks });
      const TEAM2 = "t-" + crypto.randomBytes(8).toString("hex");
      const s2 = mod.startFolderSyncer({ team: TEAM2, folder: SHARE, mirror: folder("m2"), pin: LEAD, useWorker: false, checks });
      const s1StillRunning = s1.stopped === false;
      mod.stopAllFolderSyncers();
      return s1StillRunning;
    });
    check(r.ok, "41o lifting plant:syncer-team-change leaves the old team's syncer running when switching teams: " + JSON.stringify(r));
  }

  // 42g: plant:open-catalog-shared
  {
    const r = await testPlant("open-catalog-shared", mainFile, async (scratchMain) => {
      const shareG = folder("plant-share-42g");
      const deskG = newDesk("desk-42g", shareG);
      const envPath = path.join(deskG.ud, "desk.json");
      const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
      const TEAM_G = "t-" + crypto.randomBytes(8).toString("hex");
      env.teamPins = { [TEAM_G]: LEAD };
      env.teamShown = { [TEAM_G]: { lead: "Lead", folder: shareG } };
      fs.writeFileSync(envPath, JSON.stringify(env), "utf8");
      const d = loadDesk(deskG.ud, { src: fs.readFileSync(scratchMain, "utf8") });
      let err = false;
      try {
        await d.ask("etiuda:open-catalog-folder");
        err = d.openedPaths.length === 0 || path.resolve(d.openedPaths[0] || "") !== path.resolve(shareG);
      } catch { err = true; }
      return err;
    });
    check(r.ok, "42g lifting plant:open-catalog-shared prevents opening shared folder on folder team: " + JSON.stringify(r));
  }

  // 42h: plant:read-ask-mirror
  {
    const r = await testPlant("read-ask-mirror", mainFile, (scratchMain) => {
      const shareH = folder("plant-share-42h");
      const deskH = newDesk("desk-42h", shareH);
      const envPath = path.join(deskH.ud, "desk.json");
      const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
      const TEAM_H = "t-" + crypto.randomBytes(8).toString("hex");
      env.teamPins = { [TEAM_H]: LEAD };
      env.teamShown = { [TEAM_H]: { lead: "Lead", folder: shareH } };
      fs.writeFileSync(envPath, JSON.stringify(env), "utf8");
      const d = loadDesk(deskH.ud, { src: fs.readFileSync(scratchMain, "utf8") });
      d.api.branchIdentity(true);
      let failedRead = false;
      try {
        const res = d.api.readAskFile();
        failedRead = !res || res.away === true;
      } catch { failedRead = true; }
      return failedRead;
    });
    check(r.ok, "42h lifting plant:read-ask-mirror breaks readAskFile mirror lookup: " + JSON.stringify(r));
  }

  // 42j: plant:syncer-checks
  {
    const r = await testPlant("syncer-checks", mainFile, (scratchMain) => {
      const ud = folder("plant-chk-desk");
      const shareDir = folder("plant-chk-share");
      const mirrorDir = path.join(ud, "folder-mirror", TEAM);
      fs.mkdirSync(shareDir, { recursive: true });
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      const env = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: shareDir, eUiLang: "en" }, teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: shareDir } } };
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
      try {
        const reloaded = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
        const s = reloaded.api.folderSyncerRun();
        const ret = !fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
        if (s && typeof s.stop === "function") s.stop();
        if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") syncerMod.stopAllFolderSyncers();
        return ret;
      } finally {
        if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") syncerMod.stopAllFolderSyncers();
      }
    });
    check(r.ok, "42j lifting plant:syncer-checks leaves the syncer without trust checks, refusing the team file: " + JSON.stringify(r));
  }

  // 42l: plant:syncer-without-checks
  {
    const r = await testPlant("syncer-without-checks", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      try {
        const s = mod.startFolderSyncer({
          team: TEAM,
          folder: folder("plant-nochk-share"),
          mirror: folder("plant-nochk-mirror"),
          pin: LEAD,
          useWorker: false
        });
        if (s && typeof s.stop === "function") s.stop();
        if (mod && typeof mod.stopAllFolderSyncers === "function") mod.stopAllFolderSyncers();
        return true;
      } catch {
        return false;
      }
    });
    check(r.ok, "42l lifting plant:syncer-without-checks lets a syncer start without the desk's checks: " + JSON.stringify(r));
  }

  /* ---- slice 2's plants, each lifted in a scratch copy ---------------------------------------------------------------- */
  const OWN = "desks/k-0123456789abcdef/own.ec";
  const plainShared = rev => JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "shared-44", rev, name: "Shared", date: "2026-11-01",
    langs: [{ code: "en", label: "EN" }], tags: [], cards: [] }, null, 1) + "\n";
  const scratchDesk = (name, share) => {
    const ud = folder(name);
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
      teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { lead: "Lead", folder: share } } }), "utf8");
    const mirror = path.join(ud, "folder-mirror", TEAM);
    fs.mkdirSync(mirror, { recursive: true });
    fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    return { ud, mirror };
  };

  // 44i: plant:outbox-flush
  {
    const r = await testPlant("outbox-flush", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-flush-share"), mirror = folder("plant-flush-mirror");
      fs.mkdirSync(path.join(mirror, "desks", "k-0123456789abcdef"), { recursive: true });
      fs.writeFileSync(path.join(mirror, OWN), "own bytes", "utf8");
      mod.noteOwed(mirror, OWN);
      mod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks }).syncOnce();
      return !fs.existsSync(path.join(share, OWN));
    });
    check(r.ok, "44i lifting plant:outbox-flush leaves an owed write off the share while the outbox counts it landed: " + JSON.stringify(r));
  }

  // 44j: plant:outbox-owe-keep
  {
    const r = await testPlant("outbox-owe-keep", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-keep-share"), mirror = folder("plant-keep-mirror");
      fs.writeFileSync(path.join(mirror, "shared-44.ec"), plainShared(5), "utf8");
      mod.noteOwed(mirror, "shared-44.ec");
      const prog = mod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks });
      fs.mkdirSync(path.join(mirror, ".staging"), { recursive: true });
      const tmp = path.join(mirror, ".staging", "keep.tmp");
      fs.writeFileSync(tmp, plainShared(6), "utf8");
      prog.applyScan({ answers: true, listing: [["shared-44.ec", { size: 1, mtimeMs: 1 }]], staged: [{ relPath: "shared-44.ec", tmpPath: tmp, size: 1, mtimeMs: 1 }] });
      return revAt(path.join(mirror, "shared-44.ec")) === 6;
    });
    check(r.ok, "44j lifting plant:outbox-owe-keep lets a share copy overwrite a write the outbox still owes: " + JSON.stringify(r));
  }

  // 44k: plant:outbox-owe-stay
  {
    const r = await testPlant("outbox-owe-stay", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-stay-share"), mirror = folder("plant-stay-mirror");
      fs.writeFileSync(path.join(mirror, "shared-44.ec"), plainShared(1), "utf8");
      mod.noteOwed(mirror, "shared-44.ec");
      const prog = mod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks });
      prog.applyScan({ answers: true, listing: [], staged: [] });
      prog.applyScan({ answers: true, listing: [], staged: [] });
      prog.applyScan({ answers: true, listing: [], staged: [] });
      return !fs.existsSync(path.join(mirror, "shared-44.ec"));
    });
    check(r.ok, "44k lifting plant:outbox-owe-stay removes a new owed file the share does not list yet: " + JSON.stringify(r));
  }

  // 44l: plant:edition-floor
  {
    const r = await testPlant("edition-floor", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-floor-share"), mirror = folder("plant-floor-mirror");
      fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(mirror, "lamp-shop.ec"), CAT_A2, "utf8");
      fs.writeFileSync(path.join(share, "lamp-shop.ec"), CAT_A1, "utf8");
      mod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks }).syncOnce();
      return revAt(path.join(mirror, "lamp-shop.ec")) === 1;
    });
    check(r.ok, "44l lifting plant:edition-floor lets a lagging rev 1 roll a rev 2 edition back in the mirror: " + JSON.stringify(r));
  }

  // 44m: plant:cas-share-compare
  {
    const r = await testPlant("cas-share-compare", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-cmp-share");
      fs.writeFileSync(path.join(share, "shop.ec"), plainShared(1), "utf8");
      const begun = mod.shareCasBegin(share, "shop.ec", "0".repeat(64), false);
      if (begun.held) mod.shareRelease(begun.held);
      return !!begun.held;
    });
    check(r.ok, "44m lifting plant:cas-share-compare lets a write over bytes it did not read take the lock: " + JSON.stringify(r));
  }

  // 44n: plant:cas-mirror-back
  {
    const r = await testPlant("cas-mirror-back", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const share = folder("plant-back-share"), mirror = folder("plant-back-mirror");
      fs.writeFileSync(path.join(share, "shop.ec"), plainShared(1), "utf8");
      const sha = crypto.createHash("sha256").update(Buffer.from(plainShared(1), "utf8")).digest("hex");
      const begun = mod.shareCasBegin(share, "shop.ec", sha, false);
      const done = begun.held ? mod.shareCasCommit(begun.held, mirror, plainShared(2)) : null;
      return !!done && done.ok && !fs.existsSync(path.join(mirror, "shop.ec"));
    });
    check(r.ok, "44n lifting plant:cas-mirror-back leaves the winning bytes out of the writer's mirror: " + JSON.stringify(r));
  }

  // 44o: plant:mirror-write-root
  {
    const r = await testPlant("mirror-write-root", mainFile, (scratchMain) => {
      const share = folder("plant-root-share");
      const { ud, mirror } = scratchDesk("plant-root-desk", share);
      fs.writeFileSync(path.join(mirror, ".primed"), "");
      const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      const me = d.api.branchIdentity(true);
      d.api.writeBranch("cat-44o-4a4b4c4d", JSON.stringify(branchOf(me, "4a4b4c4d")));
      return fs.existsSync(path.join(share, "desks", me.id, "cat-44o-4a4b4c4d.ec")) && !fs.existsSync(path.join(mirror, "desks", me.id, "cat-44o-4a4b4c4d.ec"));
    });
    check(r.ok, "44o lifting plant:mirror-write-root sends the desk's write straight to the share again: " + JSON.stringify(r));
  }

  // 44p: plant:mirror-owes
  {
    const r = await testPlant("mirror-owes", mainFile, (scratchMain) => {
      const share = folder("plant-owes-share");
      const { ud, mirror } = scratchDesk("plant-owes-desk", share);
      const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      const me = d.api.branchIdentity(true);
      d.api.writeBranch("cat-44p-5a5b5c5d", JSON.stringify(branchOf(me, "5a5b5c5d")));
      syncerMod.createFolderProgram({ team: TEAM, folder: share, mirror, pin: LEAD, keys: { 1: K1 }, checks }).syncOnce();
      return fs.existsSync(path.join(mirror, "desks", me.id, "cat-44p-5a5b5c5d.ec")) && !fs.existsSync(path.join(share, "desks", me.id, "cat-44p-5a5b5c5d.ec"));
    });
    check(r.ok, "44p lifting plant:mirror-owes leaves the desk's write in the mirror and never sends it to the share: " + JSON.stringify(r));
  }

  // 44q: plant:outbox-row-kept
  {
    const r = await testPlant("outbox-row-kept", mainFile, (scratchMain) => {
      const share = folder("plant-row-share");
      const { ud } = scratchDesk("plant-row-desk", share);
      const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      const me = d.api.branchIdentity(true);
      d.api.writeBranch("cat-44q-6a6b6c6d", JSON.stringify(branchOf(me, "6a6b6c6d")));
      const row = d.api.deskRows().filter(x => x.id === me.id + "-6a6b6c6d")[0];
      return !!row && row.reached === true;
    });
    check(r.ok, "44q lifting plant:outbox-row-kept says a write the outbox still owes is with the team: " + JSON.stringify(r));
  }

  // 44r: plant:resume-mirror
  {
    const r = await testPlant("resume-mirror", mainFile, (scratchMain) => {
      const share = folder("plant-resume-share");
      const { ud } = scratchDesk("plant-resume-desk", share);
      const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      try {
        d.api.resumeFromSleep();
        return !d.api.folderAnswers(d.api.catalogFolder());
      } finally { try { appSyncer().stopAllFolderSyncers(); } catch {} }
    });
    check(r.ok, "44r lifting plant:resume-mirror marks the local mirror down after a wake from sleep: " + JSON.stringify(r));
  }

  // 44s: plant:policy-primed
  {
    const r = process.platform !== "win32" ? { ok: true, skipped: "machine policy is read on Windows only" } : await testPlant("policy-primed", mainFile, (scratchMain) => {
      const share = folder("plant-policy-share");
      const team = "t-" + crypto.randomBytes(8).toString("hex");
      fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ team, sealed: false, epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(share, "lamp-shop.ec"), CAT_A1, "utf8");
      const ud = folder("plant-policy-desk");
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }), "utf8");
      REG.policy = regText([["TeamFolder", share], ["LeadKey", LEAD.public]]);
      try {
        const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
        d.api.readCatalog();
        return path.resolve(d.api.catalogFolder()) === path.resolve(path.join(ud, "folder-mirror", team));
      } finally { REG.policy = null; }
    });
    check(r.ok, "44s lifting plant:policy-primed flips a first boot under machine policy to an empty mirror before its syncer has run: " + JSON.stringify(r));
  }

  // 44t: plant:cas-off-thread
  {
    const r = await testPlant("cas-off-thread", mainFile, async (scratchMain) => {
      const share = folder("plant-cas-share");
      const team = "t-" + crypto.randomBytes(8).toString("hex");
      const tf = JSON.stringify(teamFile({ team, sealed: false, catalogs: ["shared-44"], epoch: 1, rev: 1 }));
      fs.writeFileSync(path.join(share, "etiuda-team.json"), tf, "utf8");
      fs.writeFileSync(path.join(share, "shared-44.ec"), plainShared(1), "utf8");
      const ud = folder("plant-cas-desk");
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
        teamPins: { [team]: LEAD }, teamShown: { [team]: { lead: "Lead", folder: share } } }), "utf8");
      const mirror = path.join(ud, "folder-mirror", team);
      fs.mkdirSync(mirror, { recursive: true });
      fs.writeFileSync(path.join(mirror, "etiuda-team.json"), tf, "utf8");
      fs.writeFileSync(path.join(mirror, "shared-44.ec"), plainShared(1), "utf8");
      const sha = crypto.createHash("sha256").update(Buffer.from(plainShared(1), "utf8")).digest("hex");
      const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
      try {
        await d.ask("etiuda:shared-write", "shared-44.ec", plainShared(2), sha, false);
        return revAt(path.join(share, "shared-44.ec")) === 1;
      } finally { try { appSyncer().stopAllFolderSyncers(); } catch {} }
    });
    check(r.ok, "44t lifting plant:cas-off-thread swaps the shared catalog in the mirror and never on the share: " + JSON.stringify(r));
  }

  /* 42m: A DESK WHOSE SYNCER CANNOT START READS THE SHARE AND SAYS WHY (Argon's updates review of 2026-11-01, finding 1). A
     packaged desk missing the syncer's file used to read an empty mirror in silence; now it reads the shared folder itself, as
     before the mirror, says why once, and does not try the syncer again. */
  function syncerGoneDesk(name, src) {
    const ud = folder(name + "-desk");
    const shareDir = folder(name + "-share");
    fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    const env = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: shareDir, eUiLang: "en" }, teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: shareDir } } };
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
    const gone = n => {
      if (/[\\/]folder[\\/]syncer\.cjs$/.test(String(n))) { const e = new Error("Cannot find module '" + n + "'"); e.code = "MODULE_NOT_FOUND"; throw e; }
      return nodeRequire(n);
    };
    const d = loadDesk(ud, { require: gone, src });
    const first = d.api.folderSyncerRun();
    const second = d.api.folderSyncerRun();
    const lines = d.said.filter(l => l.indexOf("could not be kept on this desk, so it reads the shared folder itself") >= 0);
    return { shareDir, ud, first, second, folderNow: d.api.catalogFolder(), lines };
  }
  {
    const r = syncerGoneDesk("syncer-gone");
    const ok = r.first === null && r.second === null && r.folderNow === r.shareDir && r.lines.length === 1
      && r.lines[0].indexOf("Cannot find module") >= 0;
    check(ok, "42m a desk whose syncer cannot be loaded reads the shared folder itself " + (r.folderNow === r.shareDir)
      + " and says why once (" + r.lines.length + " line(s)): " + JSON.stringify(r.lines));
  }
  {
    const r = await testPlant("syncer-broken-share", mainFile, (scratchMain) => {
      const got = syncerGoneDesk("plant-syncer-gone", fs.readFileSync(scratchMain, "utf8"));
      return got.folderNow !== got.shareDir;
    });
    check(r.ok, "42m1 lifting plant:syncer-broken-share sends a desk without its syncer to the empty mirror: " + JSON.stringify(r));
  }
  {
    const r = await testPlant("syncer-start-said", mainFile, (scratchMain) => {
      const got = syncerGoneDesk("plant-syncer-said", fs.readFileSync(scratchMain, "utf8"));
      return got.lines.length === 0;
    });
    check(r.ok, "42m2 lifting plant:syncer-start-said leaves a desk without its syncer silent: " + JSON.stringify(r));
  }

  /* 42n: THE WORKER STARTS FROM ITS SOURCE TEXT, so a packaged desk, whose syncer files sit inside app.asar, does not depend on
     a Worker's loader reading a path there. A real worker syncer mirrors a genuine team file; with the line lifted it does not. */
  const deskChecksForWorker = () => newDesk("checks-for-worker-" + crypto.randomBytes(3).toString("hex"), folder("checks-for-worker-folder")).api.deskTrustChecks();
  async function workerMirrors(mod, name, ceiling) {
    const share = folder(name + "-share"), mirror = folder(name + "-mirror");
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    let s = null;
    try {
      s = mod.startFolderSyncer({ team: TEAM, folder: share, mirror, pin: LEAD, keyFor: () => null, checks: deskChecksForWorker(), pollMs: 200 });
    } catch { return false; }
    const until = Date.now() + (ceiling || 30000);
    let landed = false;
    while (!landed && Date.now() < until) {
      await new Promise(res => setTimeout(res, 150));
      landed = fs.existsSync(path.join(mirror, "etiuda-team.json"));
    }
    try { if (s && typeof s.stop === "function") s.stop(); } catch {}
    return landed;
  }
  {
    const live = await workerMirrors(nodeRequire(syncerFile), "worker-source");
    const r = await testPlant("syncer-worker-source", syncerFile, async (scratchSyncer) => {
      fs.copyFileSync(path.join(ROOT, "shell", "folder", "syncer-worker.cjs"), path.join(path.dirname(scratchSyncer), "syncer-worker.cjs"));
      return !(await workerMirrors(nodeRequire(scratchSyncer), "plant-worker-source", 8000));
    });
    check(live && r.ok, "42n the syncer's worker starts from its source text and mirrors a genuine team file " + live
      + ", and lifting plant:syncer-worker-source stops it: " + JSON.stringify(r));
  }


  /* 44u: A SHARE'S TEAM FILE THAT IS NOT THE LEAD'S IS SAID, ONCE (the test architect's C1 to slice 2). The desk leaves it aside
     and works on the last genuine one, so the line is the only alarm a tampered share gives: it goes through teamSay, once. */
  async function forgedShareSaid(name, src, ceiling) {
    const ud = folder(name + "-desk");
    const shareDir = folder(name + "-share");
    fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 2, signer: forger.privateKey, keyId: FORGER.keyId, public: FORGER.public })), "utf8");
    const env = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: shareDir, eUiLang: "en" }, teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: shareDir } } };
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
    const d = loadDesk(ud, src ? { src } : {});
    const s = d.api.folderSyncerRun();
    const lines = () => d.said.filter(l => l.indexOf("ERR etiuda: ") === 0 && l.indexOf("etiuda-team.json is signed by a key other than the lead's") >= 0);
    const until = Date.now() + (ceiling || 30000);
    while (!lines().length && Date.now() < until) await new Promise(res => setTimeout(res, 150));
    if (s && typeof s.kick === "function") { s.kick(); await new Promise(res => setTimeout(res, 1200)); }
    try { if (s && typeof s.stop === "function") s.stop(); } catch {}
    return lines().length;
  }
  {
    const n = await forgedShareSaid("forged-said");
    check(n === 1, "44u a share's team file that is not the lead's is said through teamSay once, across two listings: " + n + " line(s)");
    const r = await testPlant("syncer-team-said", mainFile, async (scratchMain) => (await forgedShareSaid("plant-forged-said", fs.readFileSync(scratchMain, "utf8"), 8000)) === 0);
    check(r.ok, "44v lifting plant:syncer-team-said leaves a tampered share's team file unsaid: " + JSON.stringify(r));
  }

  /* 45: WHAT THE DESK SEES AFTER A SCAN (Argon's folder-as-built review, findings 2 and 6; the test regimen's rule 17). Each leg
     starts a desk's shell over its own desk.json, starts its syncer as the shell does (folderSyncerRun, a real worker), and
     reads after the scans: the catalog through readCatalog, the mirror on disk. A copy is counted from the scan messages the
     worker sends: each staged entry for a path is one copy of it from the share. `syncerDir`, where given, holds the syncer
     files the shell loads in place of its own, for a plant. */
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const keyIn = k => Buffer.from(Buffer.from(k.toString("base64"), "utf8").map(b => b ^ 0x5a)).toString("base64");
  function deskOver(name, share, env, syncerDir) {
    const ud = folder(name + "-desk");
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" } }, env)), "utf8");
    const swap = syncerDir ? n => (/[\\/]folder[\\/]syncer\.cjs$/.test(String(n)) ? nodeRequire(path.join(syncerDir, "syncer.cjs")) : nodeRequire(n)) : undefined;
    const d = loadDesk(ud, swap ? { require: swap } : {});
    d.write = more => { fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" } }, more)), "utf8"); d.api.readDesk(); };
    return d;
  }
  function watchScans(s) {
    const seen = { scans: 0, copies: new Map() };
    const apply = s.program.applyScan;
    s.program.applyScan = msg => {
      for (const it of (msg && msg.staged) || []) seen.copies.set(it.relPath, (seen.copies.get(it.relPath) || 0) + 1);
      seen.scans++;
      return apply(msg);
    };
    seen.copiesOf = rel => seen.copies.get(rel) || 0;
    seen.next = async (n = 1) => {
      for (let i = 0; i < n; i++) {
        const at = seen.scans, until = Date.now() + 6000;
        s.kick();
        while (seen.scans === at && Date.now() < until) await sleep(25);
      }
    };
    return seen;
  }
  function headBy(key, keyId, team, t) {
    const doc = { v: 1, team, epoch: 1, rev: 1, t, editions: [], sig: { alg: "Ed25519", keyId } };
    doc.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), signedBytesOf(doc)]), key).toString("hex");
    return JSON.stringify(doc);
  }
  const syncerCopy = (scratch, name) => {
    for (const f of ["syncer.cjs", "syncer-worker.cjs"]) if (f !== name) fs.copyFileSync(path.join(ROOT, "shell", "folder", f), path.join(path.dirname(scratch), f));
    return path.dirname(scratch);
  };

  /* Finding 2: the share holds a newer edition at an epoch this desk has no key for, a new catalog at that epoch, and a
     catalog whose signature fails. The desk keeps showing the catalog it had, each file is copied once over four scans, and
     once the key and the team file of that epoch arrive both editions land, from the copy already taken. */
  async function parkScene(name, syncerDir) {
    const share = folder(name + "-share");
    const T = "t-" + crypto.randomBytes(8).toString("hex");
    const KA = crypto.randomBytes(32), KB = crypto.randomBytes(32);
    const team = epoch => JSON.stringify(teamFile({ team: T, epoch, rev: 1 }));
    /* Whole files by rename, as a share's sync tool lands them, so no scan copies one half written. */
    const putAt = (f, t) => { const tmp = path.join(share, f + ".tmp"); fs.writeFileSync(tmp, t, "utf8"); fs.renameSync(tmp, path.join(share, f)); };
    putAt("etiuda-team.json", team(1));
    putAt("lamp-shop.ec", seal(KA, 1, CAT_A1, T));
    const env = { teamPins: { [T]: LEAD }, teamShown: { [T]: { lead: "Lead", folder: share } }, teamKeys: { [T]: { 1: keyIn(KA) } } };
    const d = deskOver(name, share, env, syncerDir);
    const s = d.api.folderSyncerRun(null);
    const out = { s: !!s };
    if (!s) return out;
    try {
      const seen = watchScans(s);
      await seen.next(1);
      const shown = () => { const t = d.api.readCatalog(); try { const c = JSON.parse(t); return c.id + " rev " + c.rev; } catch { return null; } };
      out.before = shown();
      seen.copies.clear();
      const forged = sign(JSON.parse(CAT_A1), forger.privateKey, FORGER.keyId);
      putAt("lamp-shop.ec", seal(KB, 2, CAT_A2, T));
      putAt("tea-room.ec", seal(KB, 2, text(catalog("tea-room", 1, "Tea Room", "2026-02-01")), T));
      putAt("forged.ec", seal(KA, 1, text(forged), T));
      await seen.next(4);
      out.after = shown();
      out.copies = ["lamp-shop.ec", "tea-room.ec", "forged.ec"].map(f => seen.copiesOf(f));
      out.forgedOut = !fs.existsSync(path.join(d.ud, "folder-mirror", T, "forged.ec"));
      d.write(Object.assign({}, env, { teamKeys: { [T]: { 1: keyIn(KA), 2: keyIn(KB) } } }));
      putAt("etiuda-team.json", team(2));
      await seen.next(2);
      try { out.landed = JSON.parse(fs.readFileSync(path.join(d.ud, "folder-mirror", T, "lamp-shop.ec"), "utf8")).epoch; } catch { out.landed = null; }
      out.tea = fs.existsSync(path.join(d.ud, "folder-mirror", T, "tea-room.ec"));
    } finally { s.stop(); }
    return out;
  }
  const parkGreen = r => r.s && r.before === "lamp-shop rev 1" && r.after === "lamp-shop rev 1" && JSON.stringify(r.copies) === "[1,1,1]" && r.forgedOut && r.landed === 2 && r.tea;
  {
    const r = await parkScene("park");
    check(parkGreen(r), "45a a desk whose share holds an edition at an epoch it has no key for, a new catalog at that epoch and a"
      + " catalog whose signature fails keeps showing its catalog after four scans (" + r.before + ", then " + r.after
      + "), copies each file once (" + JSON.stringify(r.copies) + " for the edition, the new catalog and the refused one, counted"
      + " from the worker's scan messages), and lands both once the key and its team file arrive (the mirror's edition at epoch " + r.landed + ", new catalog " + r.tea + ")");
  }
  /* Each lifted in a copy turns its leg red, and no product file is written. Skipped where ETIUDA_PLANTS is off (null). */
  const parkPlant = async (tag, file, red) => (PLANTS_OFF ? null
    : testPlant(tag, path.join(ROOT, "shell", "folder", file), async scratch => red(await parkScene("plant-" + tag, syncerCopy(scratch, file)))));
  const newCopied = r => !!r.copies && r.copies[1] > 1;
  { const r = await parkPlant("worker-held", "syncer-worker.cjs", newCopied); if (r) check(r.ok, "45b lifting plant:worker-held copies a parked file again at every scan: " + JSON.stringify(r)); else skip("45b lifting plant:worker-held copies a parked file again at every scan"); }
  { const r = await parkPlant("syncer-pending-held", "syncer.cjs", newCopied); if (r) check(r.ok, "45c lifting plant:syncer-pending-held leaves a parked file off what the worker holds back, so it is copied at every scan: " + JSON.stringify(r)); else skip("45c lifting plant:syncer-pending-held leaves a parked file off what the worker holds back, so it is copied at every scan"); }
  { const r = await parkPlant("syncer-held-post", "syncer.cjs", newCopied); if (r) check(r.ok, "45d lifting plant:syncer-held-post never tells the worker what is held, so a parked file is copied at every scan: " + JSON.stringify(r)); else skip("45d lifting plant:syncer-held-post never tells the worker what is held, so a parked file is copied at every scan"); }
  { const r = await parkPlant("syncer-refused-held", "syncer.cjs", got => !!got.copies && got.copies[2] > 1); if (r) check(r.ok, "45e lifting plant:syncer-refused-held copies a catalog whose signature failed again at every scan: " + JSON.stringify(r)); else skip("45e lifting plant:syncer-refused-held copies a catalog whose signature failed again at every scan"); }

  /* Finding 6: a desk joins with no lead pinned yet, then is admitted, and the shell calls folderSyncerRun as it does when the
     catalog folder moves; later the lead hands the team to a new key. After each, at the next scan, the lead's head is in the
     mirror and a team file under any other key is refused. */
  async function pinScene(name, syncerDir) {
    const share = folder(name + "-share");
    const T = "t-" + crypto.randomBytes(8).toString("hex");
    const next = crypto.generateKeyPairSync("ed25519");
    const NEXT = { keyId: "lead-next", public: pubHex(next.publicKey) };
    const putAt = (f, t) => { const tmp = path.join(share, f + ".tmp"); fs.writeFileSync(tmp, t, "utf8"); fs.renameSync(tmp, path.join(share, f)); };
    putAt("etiuda-team.json", JSON.stringify(teamFile({ team: T, epoch: 1, rev: 1 })));
    putAt("etiuda-head.json", headBy(lead.privateKey, LEAD.keyId, T, 1700000000000));
    const hex = () => crypto.randomBytes(32).toString("hex");
    const d = deskOver(name, share, { teamJoin: { team: T, file: "lamp-shop", nonce: hex(), commit: hex(), asked: Date.now(), held: 0, name: "" } }, syncerDir);
    const s = d.api.folderSyncerRun(null);
    const out = { s: !!s };
    if (!s) return out;
    const mirror = path.join(d.ud, "folder-mirror", T);
    const headKey = () => { try { return JSON.parse(fs.readFileSync(path.join(mirror, "etiuda-head.json"), "utf8")).sig.keyId; } catch { return null; } };
    const teamLead = () => { try { return JSON.parse(fs.readFileSync(path.join(mirror, "etiuda-team.json"), "utf8")).lead.keyId; } catch { return null; } };
    try {
      const seen = watchScans(s);
      await seen.next(1);
      out.joining = headKey();
      d.write({ teamPins: { [T]: LEAD }, teamShown: { [T]: { lead: "Lead", folder: share } } });
      out.same = d.api.folderSyncerRun(null) === s;
      await seen.next(1);
      out.joinedHead = headKey();
      putAt("etiuda-team.json", JSON.stringify(teamFile({ team: T, epoch: 1, rev: 2, signer: forger.privateKey, keyId: FORGER.keyId, public: FORGER.public })));
      await seen.next(1);
      out.joinedTeam = teamLead();
      const step = { format: 1, kind: "etiuda-team-handover", team: T, to: { keyId: NEXT.keyId, public: NEXT.public }, sig: { alg: "Ed25519", keyId: LEAD.keyId } };
      step.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), signedBytesOf(step)]), lead.privateKey).toString("hex");
      putAt("etiuda-team.json", JSON.stringify(sign({ format: 1, kind: "etiuda-team", id: T, catalogs: ["lamp-shop"], lead: NEXT, sealed: true, epoch: 1, rev: 3, roster: [], handover: [step] }, next.privateKey, NEXT.keyId)));
      putAt("etiuda-head.json", headBy(next.privateKey, NEXT.keyId, T, 1700000100000));
      d.write({ teamPins: { [T]: NEXT }, teamShown: { [T]: { folder: share } } });
      d.api.folderSyncerRun(null);
      await seen.next(1);
      out.handedHead = headKey();
      out.handedTeam = teamLead();
      putAt("etiuda-team.json", JSON.stringify(teamFile({ team: T, epoch: 1, rev: 4 })));
      await seen.next(1);
      out.oldLeadTeam = teamLead();
    } finally { s.stop(); }
    return out;
  }
  const pinGreen = r => r.s && r.same && r.joinedHead === LEAD.keyId && r.joinedTeam === LEAD.keyId
    && r.handedHead === "lead-next" && r.handedTeam === "lead-next" && r.oldLeadTeam === "lead-next";
  {
    const r = await pinScene("pin");
    check(pinGreen(r), "45f after a join the running syncer takes the lead's pin: at the next scan the lead's head is in the mirror ("
      + r.joinedHead + ", while joining " + r.joining + ") and a team file under another key is refused (mirror's lead " + r.joinedTeam
      + "); after a handover the new lead's head and team file are in the mirror (" + r.handedHead + ", " + r.handedTeam
      + ") and a later file under the old lead's key is refused (" + r.oldLeadTeam + "), one syncer throughout " + r.same);
  }
  const pinPlant = async tag => (PLANTS_OFF ? null
    : testPlant(tag, syncerFile, async scratch => { const got = await pinScene("plant-" + tag, syncerCopy(scratch, "syncer.cjs")); return got.s && got.joinedHead !== LEAD.keyId; }));
  { const r = await pinPlant("syncer-new-pin"); if (r) check(r.ok, "45g lifting plant:syncer-new-pin leaves a joined desk's running syncer on no pin, so the lead's head never reaches the mirror: " + JSON.stringify(r)); else skip("45g lifting plant:syncer-new-pin leaves a joined desk's running syncer on no pin, so the lead's head never reaches the mirror"); }
  { const r = await pinPlant("syncer-pin-forgets"); if (r) check(r.ok, "45h lifting plant:syncer-pin-forgets keeps the head refused under no pin held after the pin arrives, so it is never copied again: " + JSON.stringify(r)); else skip("45h lifting plant:syncer-pin-forgets keeps the head refused under no pin held after the pin arrives, so it is never copied again"); }

  /* 46a: a cold start on a folder team whose first listing is held (finding 9, rule 17). The desk reads nothing under the
     share on this thread, says it is still reading, and shows the catalog once that listing lands. */
  {
    const share = folder("share-46a");
    const T = "t-" + crypto.randomBytes(8).toString("hex");
    const putAt = (f, t) => { const tmp = path.join(share, f + ".tmp"); fs.writeFileSync(tmp, t, "utf8"); fs.renameSync(tmp, path.join(share, f)); };
    putAt("etiuda-team.json", JSON.stringify(teamFile({ team: T, epoch: 1, rev: 1 })));
    putAt("lamp-shop.ec", CAT_A1);
    const env = { teamPins: { [T]: LEAD }, teamShown: { [T]: { lead: "Lead", folder: share } } };
    const d = deskOver("prime46", share, env);
    const pl = deskOver("prime46pl", share, Object.assign({}, env, { keys: { eCatalogFolder: share, eUiLang: "pl" } }));
    const hits = [];
    const spyNames = ["readdirSync", "readFileSync", "statSync", "existsSync", "writeFileSync", "renameSync", "mkdirSync", "openSync", "unlinkSync"];
    const spyOrig = {};
    const shareRoot = path.resolve(share).toLowerCase();
    for (const n of spyNames) {
      spyOrig[n] = fs[n];
      fs[n] = function (p, ...rest) {
        if (typeof p === "string") {
          const got = path.resolve(p).toLowerCase();
          if (got === shareRoot || got.startsWith(shareRoot + path.sep)) hits.push(n + " " + path.basename(String(p)));
        }
        return spyOrig[n].call(fs, p, ...rest);
      };
    }
    let opened = null, shown = null, waited = false, err = "";
    const s = d.api.folderSyncerRun(null);
    const held = [];
    let release = false;
    const apply = s && s.program ? s.program.applyScan.bind(s.program) : null;
    if (s && s.program) s.program.applyScan = (msg) => { if (!release) { held.push(msg); return { answers: true, applied: [] }; } return apply(msg); };
    try {
      const until = Date.now() + 4000;
      while (!held.length && Date.now() < until) await sleep(25);
      const early = d.api.readCatalog();
      opened = await d.ask("etiuda:open-catalog-folder");
      const before = hits.length;
      const pending = d.api.awaitFolderPrime();
      release = true;
      for (const msg of held.splice(0)) apply(msg);
      waited = await pending;
      shown = d.api.readCatalog();
      const plRead = pl.api.readCatalog();
      const reading = d.said.some(l => l.indexOf("Etiuda is still reading the team's shared folder, so the catalog is not open yet. Once that is done, Etiuda offers the catalog in a window of its own, and loading it from there opens it.") >= 0);
      const polish = pl.said.some(l => l.indexOf("Etiuda jeszcze wczytuje wspólny folder zespołu, więc katalog nie jest na razie otwarty. Gdy wczytywanie dobiegnie końca, Etiuda zaproponuje katalog w osobnym oknie; wystarczy go stamtąd wczytać, aby się otworzył.") >= 0);
      const slate = d.said.some(l => l.indexOf("no catalog found") >= 0) || pl.said.some(l => l.indexOf("no catalog found") >= 0);
      /* The copywriter's final words (2026-11-02 03:58), no longer marked as a draft on either language's line. */
      const marked = getShellSrc().split(String.fromCharCode(10)).filter(l => l.indexOf("stillReading:") >= 0)
        .every(l => l.indexOf("/* draft words: copywriter */") < 0);
      const quiet = before === 0 && opened === false && early == null && !slate && reading && polish && marked;
      const landed = waited === true && shown === CAT_A1.trim();
      check(!!s && held !== null && quiet && landed,
        "46a a desk whose share's first listing is held reads nothing under that share on the main thread before the prime (" + before
        + (before ? ": " + hits.slice(0, before).join("; ") : "") + "), says it is still reading, and once the listing lands the catalog shows (wait " + waited
        + ", opened the share early " + opened + ", shown " + (shown === CAT_A1.trim()) + ", polish " + polish + ")");
    } catch (e) {
      err = String(e && e.stack || e);
      check(false, "46a a desk whose share's first listing is held reads nothing under that share on the main thread: " + err);
    } finally {
      for (const n of spyNames) fs[n] = spyOrig[n];
      try { if (s && typeof s.stop === "function") s.stop(); } catch {}
      try { appSyncer().stopAllFolderSyncers(); } catch {}
    }
  }
  {
    if (PLANTS_OFF || process.platform !== "win32") skip("46b lifting plant:prime-share-quiet lets a policy desk read the catalog from the share before the mirror is primed");
    else {
      const r = await testPlant("prime-share-quiet", mainFile, (scratchMain) => {
        const share = folder("plant-quiet-share");
        const team = "t-" + crypto.randomBytes(8).toString("hex");
        fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ team, sealed: false, epoch: 1, rev: 1 })), "utf8");
        fs.writeFileSync(path.join(share, "lamp-shop.ec"), CAT_A1, "utf8");
        const ud = folder("plant-quiet-desk");
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eUiLang: "en" } }), "utf8");
        REG.policy = regText([["TeamFolder", share], ["LeadKey", LEAD.public]]);
        try {
          const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
          return d.api.readCatalog() === CAT_A1.trim();
        } finally { REG.policy = null; }
      });
      check(r.ok, "46b lifting plant:prime-share-quiet lets a policy desk read the catalog from the share before the mirror is primed: " + JSON.stringify(r));
    }
  }
  {
    if (PLANTS_OFF) skip("46c lifting plant:prime-no-slate says there is no catalog while the team's mirror is still unprimed");
    else {
      const r = await testPlant("prime-no-slate", mainFile, (scratchMain) => {
        const share = folder("plant-slate-share");
        const team = "t-" + crypto.randomBytes(8).toString("hex");
        fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ team, epoch: 1, rev: 1 })), "utf8");
        fs.writeFileSync(path.join(share, "lamp-shop.ec"), CAT_A1, "utf8");
        const ud = folder("plant-slate-desk");
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
          teamPins: { [team]: LEAD }, teamShown: { [team]: { folder: share } } }), "utf8");
        const d = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
        const read = d.api.readCatalog();
        return read == null && d.said.some(l => l.indexOf("no catalog found") >= 0);
      });
      check(r.ok, "46c lifting plant:prime-no-slate says there is no catalog while the team's mirror is still unprimed: " + JSON.stringify(r));
    }
  }

  /* 46d: a folder desk whose worker failed, and whose mirror was never primed, reads the share and does not say it is
     still reading. 46e lifts the guard those gates share, and the same desk then waits. */
  function brokenUnprimed(name, src) {
    const ud = folder(name + "-desk");
    const shareDir = folder(name + "-share");
    fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(shareDir, "lamp-shop.ec"), CAT_A1, "utf8");
    const env = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: shareDir, eUiLang: "en" }, teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: shareDir } } };
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env), "utf8");
    /* The module loads, so the primed check can be asked, and the worker's start throws. A missing module fails that check closed, which would hide the wait this plant has to show. */
    const failedStart = n => {
      if (!/[\\/]folder[\\/]syncer\.cjs$/.test(String(n))) return nodeRequire(n);
      const real = nodeRequire(n);
      return Object.assign({}, real, { startFolderSyncer() { throw new Error("the worker did not start"); } });
    };
    const d = loadDesk(ud, src ? { require: failedStart, src } : { require: failedStart });
    d.api.folderSyncerRun();
    const read = d.api.readCatalog();
    const primedName = (syncerMod && syncerMod.PRIMED_NAME) || ".primed";
    const primed = fs.existsSync(path.join(ud, "folder-mirror", TEAM, primedName));
    const reading = d.said.some(l => l.indexOf("still reading the team's shared folder") >= 0);
    return { share: read === CAT_A1.trim(), reading, primed };
  }
  {
    const got = brokenUnprimed("broken-unprimed");
    check(got.share && !got.reading && !got.primed,
      "46d a folder desk whose worker failed, mirror unprimed, reads the share and does not say it is still reading (share " + got.share
      + ", reading " + got.reading + ", primed " + got.primed + ")");
  }
  {
    if (PLANTS_OFF) skip("46e lifting plant:broken-reads-share makes a desk whose worker failed wait on an unprimed mirror and say it is still reading");
    else {
      const r = await testPlant("broken-reads-share", mainFile, (scratchMain) => {
        const got = brokenUnprimed("plant-broken-unprimed", fs.readFileSync(scratchMain, "utf8"));
        return !got.share && got.reading;
      });
      check(r.ok, "46e lifting plant:broken-reads-share makes a desk whose worker failed wait on an unprimed mirror and say it is still reading: " + JSON.stringify(r));
    }
  }

  /* 46f: the sentence reaches the page through the shell's team channel while the mirror is unprimed, on the empty desk and on
     Settings' team row, and once the listing lands the page offers the catalog and the sentence is gone. 46g lifts that delivery. */
  const pageMods = path.join(ROOT, "src", "modules");
  const pageUrl = (n) => pathToFileURL(path.join(pageMods, n)).href;
  let pageKit = null;
  async function pageKitOnce() {
    if (pageKit) return pageKit;
    pageKit = {
      HK: await import(pageUrl("hooks.js")),
      ST: await import(pageUrl("storage.js")),
      DOM: await import(pageUrl("dom.js")),
      TJ: await import(pageUrl("team-join.js")),
      SET: await import(pageUrl("settings.js")),
      REN: await import(pageUrl("render.js")),
      OFF: await import(pageUrl("catalog-offer.js")),
    };
    return pageKit;
  }
  /* A document the page's own render and offer can write into. Class selectors stay unmatched, so the empty desk's mark is
     not drawn; the sentence is the markup render wrote. */
  function pageDoc() {
    const ids = new Map();
    const quietClass = { contains: () => false, add() {}, remove() {}, toggle() {} };
    function stubBtn() {
      return {
        onclick: null, isConnected: false, style: {}, textContent: "", classList: quietClass,
        setAttribute() {}, getAttribute: () => null, removeAttribute() {},
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        remove() {}, insertAdjacentHTML() {}, focus() {},
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      };
    }
    function el(tag) {
      const node = {
        nodeType: 1, tagName: String(tag).toUpperCase(), localName: String(tag).toLowerCase(),
        childNodes: [], parentNode: null, attrs: {}, _html: "",
        style: { removeProperty() {} },
        offsetWidth: 0, offsetHeight: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0,
        isConnected: false, onclick: null, classList: quietClass,
        setAttribute(k, v) { node.attrs[k] = String(v); if (k === "id") ids.set(String(v), node); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null; },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k); },
        removeAttribute(k) {
          if (k === "id" && ids.get(node.attrs.id) === node) ids.delete(node.attrs.id);
          delete node.attrs[k];
        },
        appendChild(n) { if (n) { n.parentNode = node; node.childNodes.push(n); } return n; },
        insertBefore(n) { return node.appendChild(n); },
        remove() {
          const p = node.parentNode;
          if (!p) return;
          const i = p.childNodes.indexOf(node);
          if (i >= 0) p.childNodes.splice(i, 1);
          node.parentNode = null;
        },
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
        getContext() { return { measureText: () => ({ width: 0 }), font: "", clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {} }; },
        focus() {}, blur() {}, click() {},
        querySelector(sel) {
          const m = /^#([\w-]+)$/.exec(String(sel));
          if (!m) return null;
          if (node.attrs.id === m[1]) return node;
          if (node._html && node._html.indexOf('id="' + m[1] + '"') >= 0) return stubBtn();
          for (const c of node.childNodes) {
            if (c && c.querySelector) { const hit = c.querySelector(sel); if (hit) return hit; }
          }
          return null;
        },
        querySelectorAll() { return []; },
      };
      Object.defineProperty(node, "id", { get() { return node.attrs.id || ""; }, set(v) { node.setAttribute("id", v); } });
      Object.defineProperty(node, "className", { get() { return node.attrs.class || ""; }, set(v) { node.setAttribute("class", v); } });
      Object.defineProperty(node, "innerHTML", { get() { return node._html; }, set(v) { node._html = String(v); } });
      Object.defineProperty(node, "textContent", {
        get() { return node._html.replace(/<[^>]+>/g, ""); },
        set(v) { node._html = String(v == null ? "" : v); },
      });
      return node;
    }
    const doc = { listeners: {}, visibilityState: "visible", hidden: false, readyState: "complete" };
    doc.createElement = (t) => el(t);
    doc.createElementNS = (_ns, t) => el(t);
    doc.createTextNode = (s) => ({ nodeType: 3, textContent: String(s), data: String(s) });
    doc.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
    doc.documentElement = el("html");
    doc.body = el("body");
    doc.documentElement.appendChild(doc.body);
    const listEl = el("div");
    listEl.id = "list";
    doc.body.appendChild(listEl);
    doc.getElementById = (id) => ids.get(id) || null;
    doc.querySelector = (sel) => { const m = /^#([\w-]+)$/.exec(String(sel)); return m ? (ids.get(m[1]) || null) : null; };
    doc.querySelectorAll = () => [];
    doc.addEventListener = () => {};
    doc.removeEventListener = () => {};
    globalThis.document = doc;
    globalThis.window = { addEventListener() {}, removeEventListener() {}, document: doc };
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 800;
    globalThis.getComputedStyle = () => ({ fontSize: "16px" });
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {};
    globalThis.ResizeObserver = function ResizeObserver() { this.observe = () => {}; this.disconnect = () => {}; };
    globalThis.location = { protocol: "file:" };
    return doc;
  }
  async function pageWhileUnprimed(name, src, releaseScan) {
    pageDoc();
    const kit = await pageKitOnce();
    const LINE = "Etiuda is still reading the team's shared folder, so the catalog is not open yet. Once that is done, Etiuda offers the catalog in a window of its own, and loading it from there opens it.";
    const shownLine = LINE.replace(/'/g, "&#39;");
    const share = folder(name + "-share");
    const T = "t-" + crypto.randomBytes(8).toString("hex");
    const putAt = (f, t) => { const tmp = path.join(share, f + ".tmp"); fs.writeFileSync(tmp, t, "utf8"); fs.renameSync(tmp, path.join(share, f)); };
    putAt("etiuda-team.json", JSON.stringify(teamFile({ team: T, epoch: 1, rev: 1 })));
    putAt("lamp-shop.ec", CAT_A1);
    const env = { teamPins: { [T]: LEAD }, teamShown: { [T]: { lead: "Lead", folder: share } } };
    const d = deskOver(name, share, env);
    if (src) {
      /* A planted shell is a second desk: the first only prepared the files. */
      const ud = d.ud;
      const again = loadDesk(ud, { src });
      d.api = again.api; d.ask = again.ask; d.ipc = again.ipc; d.on = again.on; d.invoke = again.invoke; d.said = again.said;
    }
    const hits = [];
    const spyNames = ["readdirSync", "readFileSync", "statSync", "existsSync", "writeFileSync", "renameSync", "mkdirSync", "openSync", "unlinkSync"];
    const spyOrig = {};
    const shareRoot = path.resolve(share).toLowerCase();
    for (const n of spyNames) {
      spyOrig[n] = fs[n];
      fs[n] = function (p, ...rest) {
        if (typeof p === "string") {
          const got = path.resolve(p).toLowerCase();
          if (got === shareRoot || got.startsWith(shareRoot + path.sep)) hits.push(n + " " + path.basename(String(p)));
        }
        return spyOrig[n].call(fs, p, ...rest);
      };
    }
    const pageListeners = {};
    const errors = [];
    const doc = pageDoc();
    kit.DOM.grabDom();
    kit.ST.lsSet("eUiLang", "en");
    kit.ST.lsSet("eDeckOff", "1");
    kit.HK.hooks.render = () => { try { kit.REN.render(); } catch (e) { errors.push(String(e && e.stack || e)); } };
    kit.HK.hooks.syncAddFab = () => {};
    kit.HK.hooks.syncNextDock = () => {};
    kit.HK.hooks.importCatalogHere = () => {};
    kit.HK.hooks.loadCatalogFromFolder = () => {};
    const win = {
      isDestroyed: () => false,
      webContents: {
        send: (ch, ...args) => {
          for (const fn of (pageListeners[ch] || [])) {
            try { fn({}, ...args); } catch (e) { errors.push(ch + " " + String(e && e.stack || e)); }
          }
        },
      },
    };
    const ipcRenderer = {
      sendSync: (ch, ...args) => {
        const e = eventFor();
        if (d.on[ch]) d.on[ch](e, ...args);
        return e.returnValue;
      },
      send: (ch, ...args) => { if (d.on[ch]) d.on[ch](eventFor(), ...args); },
      invoke: (ch, ...args) => new Promise((resolve) => setImmediate(() => {
        try { resolve(d.invoke[ch] ? d.invoke[ch](eventFor(), ...args) : undefined); }
        catch (e) { errors.push(String(e && e.stack || e)); resolve(undefined); }
      })),
      on: (ch, fn) => { (pageListeners[ch] = pageListeners[ch] || []).push(fn); },
    };
    let s = null, release = false, apply = null;
    const held = [];
    try {
      s = d.api.folderSyncerRun(win);
      apply = s && s.program ? s.program.applyScan.bind(s.program) : null;
      if (s && s.program) s.program.applyScan = (msg) => {
        if (!release) { held.push(msg); return { answers: true, applied: [] }; }
        return apply(msg);
      };
      const untilHeld = Date.now() + 4000;
      while (!held.length && Date.now() < untilHeld) await sleep(25);
      const contextBridge = {
        exposeInMainWorld: (k, v) => { window[k] = v; },
        executeInMainWorld: (o) => o.func(...(o.args || [])),
      };
      new Function("require", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(
        (n) => (n === "electron" ? { contextBridge, ipcRenderer, webUtils: {} } : nodeRequire(n)));
      kit.OFF.wireHostCatalogWatch();
      kit.TJ.wireTeamJoin();
      await sleep(200);
      const row = kit.SET.settingsBodyHtml().indexOf(shownLine) >= 0;
      const desk = (doc.getElementById("list").innerHTML || "").indexOf(shownLine) >= 0;
      const said = d.said.some((l) => l.indexOf(LINE) >= 0);
      const hitsBefore = hits.length;
      let offer = false, gone = false;
      if (releaseScan && apply) {
        release = true;
        for (const msg of held.splice(0)) apply(msg);
        const untilOffer = Date.now() + 2000;
        while (Date.now() < untilOffer && !doc.getElementById("eCatalogOffer")) await sleep(25);
        const offerEl = doc.getElementById("eCatalogOffer");
        const offerHtml = offerEl ? offerEl.innerHTML : "";
        offer = offerHtml.indexOf("lamp-shop") >= 0 && offerHtml.indexOf("Load catalog") >= 0;
        const rowAfter = kit.SET.settingsBodyHtml().indexOf(shownLine) < 0;
        const deskAfter = (doc.getElementById("list").innerHTML || "").indexOf(shownLine) < 0;
        gone = rowAfter && deskAfter;
      }
      return { row, desk, said, hitsBefore, offer, gone, held: held.length, started: !!s, err: errors[0] || "" };
    } finally {
      for (const n of spyNames) fs[n] = spyOrig[n];
      try { if (s && typeof s.stop === "function") s.stop(); } catch {}
      try { appSyncer().stopAllFolderSyncers(); } catch {}
    }
  }
  {
    let got = null, err = "";
    try { got = await pageWhileUnprimed("page-unprimed", "", true); }
    catch (e) { err = String(e && e.stack || e); }
    const ok = !!got && got.row && got.desk && got.said && got.hitsBefore === 0 && got.offer && got.gone && !got.err;
    check(ok, "46f while a folder desk's mirror is unprimed the page shows the still-reading line on the empty desk and the team row, the share unread on this thread ("
      + (got ? got.hitsBefore : "?") + "), and once the listing lands the catalog is offered and the line is gone (row " + (got && got.row)
      + ", desk " + (got && got.desk) + ", said " + (got && got.said) + ", offer " + (got && got.offer) + ", gone " + (got && got.gone)
      + (got && got.err ? ", " + got.err : "") + (err ? ", " + err : "") + ")");
  }
  {
    if (PLANTS_OFF) skip("46g lifting plant:still-reading-shown leaves the still-reading sentence in the log and off the page");
    else {
      const r = await testPlant("still-reading-shown", mainFile, async (scratchMain) => {
        const got = await pageWhileUnprimed("plant-page-unprimed", fs.readFileSync(scratchMain, "utf8"), false);
        return !!got && !got.row && !got.desk && got.said && !got.err;
      });
      check(r.ok, "46g lifting plant:still-reading-shown leaves the still-reading sentence in the log and off the page: " + JSON.stringify(r));
    }
  }

  if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") {
    syncerMod.stopAllFolderSyncers();
  }

  console.log("#counts checks=" + asserted + " skipped=" + skipped + " failures=" + failed + " expected=" + EXPECTED);
  if (asserted + skipped < EXPECTED) console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  if (failed > 0) {
    process.exit(Math.min(failed, 63));
  }
}

run().catch(e => {
  console.error("FATAL: " + e.stack);
  process.exit(78);
});
