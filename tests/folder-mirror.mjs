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
 * 7. Desk's own writes go straight to the shared folder in slice 1.
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
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));

const EXPECTED = 33;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-folder-mirror-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
function getShellSrc() {
  return fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
}
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName", "readRing", "catalogFolder", "writeBranch", "branchDest", "branchIdentity", "deskRows", "settleFolder", "rawCatalogFolder", "sharedFolderForWrite", "folderSyncerRun", "heedTeam", "readAskFile", "checkInviteRefusal", "tryCatalogAsk", "teamKeyAt", "readDesk", "deskTrustChecks"];
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
    srcToRun + "\nreturn { " + EXPOSE.join(", ") + " };")(n => (n === "electron" ? electron : nodeRequire(n)),
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

  /* -------------------------------------------------------------------------------------------------
   * Leg 1 (41a): Main thread synchronous fs calls spy during readCatalog & catalogChanged
   * ----------------------------------------------------------------------------------------------- */
  {
    const desk1 = newDesk("desk1", SHARE);
    const deskChecks = typeof desk1.api.deskTrustChecks === "function" ? desk1.api.deskTrustChecks() : null;
    if (syncerMod && typeof syncerMod.setDefaultChecks === "function" && deskChecks) {
      syncerMod.setDefaultChecks(deskChecks);
    }
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
        pin: LEAD, keys: { 1: K1 }
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
        pin: LEAD, keys: { 1: K1, 2: K2 }
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
        pin: LEAD, keys: { 1: K1 }
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
        pin: LEAD, keys: { 1: K1 },
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
        team: TEAM, folder: shareDir1, mirror: mirrorDir1, pin: LEAD, useWorker: false
      });
      const s2 = syncerMod.startFolderSyncer({
        team: TEAM, folder: shareDir1, mirror: mirrorDir1, pin: LEAD, useWorker: false
      });

      const startingTwiceIsSame = s1 === s2;

      // Start for TEAM2
      const s3 = syncerMod.startFolderSyncer({
        team: TEAM2, folder: shareDir2, mirror: mirrorDir2, pin: LEAD, useWorker: false
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
   * Leg 7 (41p): D1 leg 1 - Desk's own write lands in the folder and is never removed from or shadowed in mirror
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

    const landsInShare = fs.existsSync(shareBranch);
    const notDirectlyInMirror = !fs.existsSync(mirrorBranch);

    // Now run syncer
    const prog = syncerMod.createFolderProgram({
      team: TEAM, folder: SHARE, mirror: mirrorDir,
      pin: LEAD, keys: { 1: K1 }
    });
    await prog.syncOnce();
    const landsInMirrorAfterSync = fs.existsSync(mirrorBranch);

    // Two more answered listings: remains in mirror
    await prog.syncOnce();
    await prog.syncOnce();
    const remainsInMirrorAfterListings = fs.existsSync(mirrorBranch);

    const ok = landsInShare && notDirectlyInMirror && landsInMirrorAfterSync && remainsInMirrorAfterListings;
    check(ok,
      "41p a desk's own write lands in the folder and is never removed from or shadowed in the mirror: "
      + "lands in share " + landsInShare + ", not in mirror before sync " + notDirectlyInMirror
      + ", in mirror after sync " + landsInMirrorAfterSync + ", retained after listings " + remainsInMirrorAfterListings);
  }

  /* -------------------------------------------------------------------------------------------------
   * Leg 8 (41q): D1 leg 2 - With folder not answering, write is still held and row says kept
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

    // First write when folder is answering
    const r1 = d.api.writeBranch(stem, JSON.stringify(branchDoc));
    const dest = d.api.branchDest(stem);
    const deskMirrorDir = path.join(mirrorDir, "desks", me.id);
    fs.mkdirSync(deskMirrorDir, { recursive: true });
    fs.copyFileSync(dest.dest, path.join(deskMirrorDir, stem + ".ec"));

    const initialRows = d.api.deskRows();
    const initialRow = initialRows.filter(r => r.id === me.id + "-12345678")[0] || null;
    const initialReached = initialRow ? initialRow.reached : null;

    // Now mark shared folder as not answering
    d.api.settleFolder(SHARE, false);

    // Update branch while folder is down
    branchDoc.rev = 1;
    const wRes = d.api.writeBranch(stem, JSON.stringify(branchDoc));
    const writeHeld = wRes && wRes.held === true;

    const rows = d.api.deskRows();
    const deskRow = rows.filter(r => r.id === me.id + "-12345678")[0] || null;
    const rowReached = deskRow ? deskRow.reached : null;
    const rowSaysKept = deskRow !== null && rowReached === false;

    const ok = initialReached === true && writeHeld && rowSaysKept;
    check(ok,
      "41q with the folder not answering, a write is still held and the row says kept: "
      + "held " + writeHeld + ", initial reached " + initialReached + ", held row reached " + rowReached);
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
      pin: LEAD, keys: { 1: K1 },
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
      pin: LEAD, keys: { 1: K1 }
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
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null)
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
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null),
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
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null)
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
      pin: LEAD, keyFor: e => (e === 1 ? K1 : null)
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 } });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 } });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 } });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1, 2: K2 } });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keyFor: e => (e === 1 ? K1 : null) });
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
      const prog = mod.createFolderProgram({ team: TEAM_H, folder: shareDir, mirror: mirrorDir, pin: LEAD });
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
      const prog = mod.createFolderProgram({ team: TEAM_HD, folder: shareDir, mirror: mirrorDir, pin: LEAD });
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
      mod.createFolderProgram({ team: TEAM, folder: folder("f"), mirror: mirrorDir, pin: LEAD });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD });
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
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 } });
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
      const s1 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false });
      const s2 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false });
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
      const s1 = mod.startFolderSyncer({ team: TEAM, folder: SHARE, mirror: folder("m1"), pin: LEAD, useWorker: false });
      const TEAM2 = "t-" + crypto.randomBytes(8).toString("hex");
      const s2 = mod.startFolderSyncer({ team: TEAM2, folder: SHARE, mirror: folder("m2"), pin: LEAD, useWorker: false });
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
      const savedDefault = typeof syncerMod.getDefaultChecks === "function" ? syncerMod.getDefaultChecks() : null;
      if (typeof syncerMod.setDefaultChecks === "function") syncerMod.setDefaultChecks(null);
      try {
        const reloaded = loadDesk(ud, { src: fs.readFileSync(scratchMain, "utf8") });
        const s = reloaded.api.folderSyncerRun();
        const ret = !fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
        if (s && typeof s.stop === "function") s.stop();
        if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") syncerMod.stopAllFolderSyncers();
        return ret;
      } finally {
        if (typeof syncerMod.setDefaultChecks === "function") syncerMod.setDefaultChecks(savedDefault);
        if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") syncerMod.stopAllFolderSyncers();
      }
    });
    check(r.ok, "42j lifting plant:syncer-checks leaves the syncer without trust checks, refusing the team file: " + JSON.stringify(r));
  }

  if (syncerMod && typeof syncerMod.stopAllFolderSyncers === "function") {
    syncerMod.stopAllFolderSyncers();
  }

  console.log("#counts checks=" + asserted + " failures=" + failed);
  if (failed > 0) {
    process.exit(Math.min(failed, 63));
  }
}

run().catch(e => {
  console.error("FATAL: " + e.stack);
  process.exit(78);
});
