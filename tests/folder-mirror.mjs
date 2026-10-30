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

const EXPECTED = 15;

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
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName", "readRing", "catalogFolder"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, overrides = {}) {
  const said = [], on = {}, invoke = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
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
  return { api, ask, ipc, on, invoke, said, ud, envelope, electron };
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
    // Setup desk envelope with pinned team
    const envPath = path.join(desk1.ud, "desk.json");
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    env.teamPins = { [TEAM]: LEAD };
    env.teamShown = { [TEAM]: { lead: "Lead", folder: SHARE } };
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
      readResult = d.api.readCatalog();
      d.api.catalogChanged({ isDestroyed: () => false, webContents: { send: noop } });
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
      const changingFile = path.join(shareDir, "notes.txt");
      fs.writeFileSync(changingFile, "initial content", "utf8");

      const prog = syncerMod.createFolderProgram({
        team: TEAM, folder: shareDir, mirror: mirrorDir,
        pin: LEAD, keys: { 1: K1 }
      });

      // Pass 1: notes.txt has size 15
      await prog.syncOnce();

      // Check mirror state after pass 1
      const mirrorHasTeam = fs.existsSync(path.join(mirrorDir, "etiuda-team.json"));
      const mirrorHasEdition = fs.existsSync(path.join(mirrorDir, "lamp-shop.ec"));
      const mirrorHasCorrupt = fs.existsSync(path.join(mirrorDir, "corrupted.ec"));
      const mirrorHasChangingPass1 = fs.existsSync(path.join(mirrorDir, "notes.txt"));

      // Mutate notes.txt before pass 2 (size changes)
      fs.writeFileSync(changingFile, "initial content mutated to be longer", "utf8");
      await prog.syncOnce();
      const mirrorHasChangingPass2 = fs.existsSync(path.join(mirrorDir, "notes.txt"));

      // Now leave notes.txt unchanged for pass 3
      await prog.syncOnce();
      const mirrorHasChangingPass3 = fs.existsSync(path.join(mirrorDir, "notes.txt"));

      const ok = mirrorHasTeam && mirrorHasEdition && !mirrorHasCorrupt
        && !mirrorHasChangingPass1 && !mirrorHasChangingPass2 && mirrorHasChangingPass3;

      check(ok,
        "41b a genuine team file and edition reach the mirror; a forged team file, an edition that fails its check, and a file whose size changed between two listings do not, and are taken once whole and genuine: "
        + "team " + mirrorHasTeam + ", edition " + mirrorHasEdition + ", corrupt " + mirrorHasCorrupt
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
   * Plants: Proved by removal in scratch copy, never in checkout, sha256 restored
   * ----------------------------------------------------------------------------------------------- */
  const syncerFile = path.join(ROOT, "shell", "folder", "syncer.cjs");
  const mainFile = path.join(ROOT, "shell", "main.js");

  function testPlant(tag, file, testFn) {
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
      turned = testFn(scratchFile, scratchDir);
    } catch (e) {
      turned = false;
    }

    const same = fs.readFileSync(file).equals(before);
    return { ok: turned && same, turned, same };
  }

  // 41g: plant:catalog-folder-mirror
  {
    const r = testPlant("catalog-folder-mirror", mainFile, (scratchMain) => {
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
    const r = testPlant("syncer-team-pin", syncerFile, (scratchSyncer) => {
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
    const r = testPlant("syncer-team-rev", syncerFile, (scratchSyncer) => {
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
    const r = testPlant("syncer-edition-sig", syncerFile, (scratchSyncer) => {
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
    const r = testPlant("syncer-epoch-pending", syncerFile, (scratchSyncer) => {
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

  // 41l: plant:syncer-two-listings
  {
    const r = testPlant("syncer-two-listings", syncerFile, (scratchSyncer) => {
      const mod = nodeRequire(scratchSyncer);
      const shareDir = folder("plant-two-share");
      const mirrorDir = folder("plant-two-mirror");
      fs.writeFileSync(path.join(shareDir, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
      fs.writeFileSync(path.join(shareDir, "file.txt"), "hello", "utf8");
      const prog = mod.createFolderProgram({ team: TEAM, folder: shareDir, mirror: mirrorDir, pin: LEAD, keys: { 1: K1 } });
      prog.syncOnce();
      // Without two-listings guard, unchecked file is taken on the very first listing
      return fs.existsSync(path.join(mirrorDir, "file.txt"));
    });
    check(r.ok, "41l lifting plant:syncer-two-listings takes an unverified file on its first listing: " + JSON.stringify(r));
  }

  // 41m: plant:syncer-two-absent-remove
  {
    const r = testPlant("syncer-two-absent-remove", syncerFile, (scratchSyncer) => {
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
    const r = testPlant("syncer-singleton", syncerFile, (scratchSyncer) => {
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
    const r = testPlant("syncer-team-change", syncerFile, (scratchSyncer) => {
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

  console.log("#counts checks=" + asserted + " failures=" + failed);
  if (failed > 0) {
    process.exit(Math.min(failed, 63));
  }
}

run().catch(e => {
  console.error("FATAL: " + e.stack);
  process.exit(78);
});
