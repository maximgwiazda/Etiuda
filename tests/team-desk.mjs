/* The desk opens a sealed catalog, driven in bare node: the real shell/main.js under stubbed electron, several desks
 * sharing one catalog folder, each with its own desk.json and a stand-in for safeStorage, and the engine's own reader
 * and signature check over what the shell hands the page. Board 834, step 12, slice 4.
 *
 *     node tests/team-desk.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE TEAM FILE IS WHOLE, NOT TRUSTED. It verifies under the lead key it names itself, so a desk pins the lead's key
 * where the ring lists it or at its first admission, and a file under any other key opens nothing after that.
 *
 * THE ORACLE FOR AN OPENED CATALOG IS ITS UNSEALED TWIN. The envelope binds a team and an epoch and not which catalog it
 * carries, so within one team and epoch one sealed file can stand in for another, or an older edition for a newer one.
 * What holds is that each is then judged exactly as the same catalog unsealed: the same parse, the same signature
 * state, the same listing. With no envelope in the folder, a file is handed to the page byte for byte as read.
 *
 * The shell runs from a copy of shell/ in a temp folder, so the folder above it holds no catalog of the checkout's.
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
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
/* Every reg call answers from a stand-in, never from this machine's registry (tests/reg-stand.cjs): until 2026-10-13
   this leg passed only because no machine policy and no proxy were set on the machine that ran it. Before the shell loads. */
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
/* The floor: every leg below runs, or the file says it did not complete. */
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 105 - 12 - 7 - 15 - 1; /* 12 retired with the folder team (RETIRED_TWO_TEAMS_ONE_FOLDER) and 7 with the conflict sibling of the team file and 16 with a folder team's head, ring and wait and the row's fork (each marked RETIRED); the plants of the fork and sibling scenes (14br to 14bx, 14cc, 14cj) are not yet retired with them */

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
/* A check that held a conflict sibling of the team file read as a team file, retired with it: it is said and not asked, and EXPECTED is without it. */
function retire(ok, line) {
  console.log("  RETIRED " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-team-desk-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
if (process.env.ETIUDA_SHELL_MAIN) fs.copyFileSync(process.env.ETIUDA_SHELL_MAIN, path.join(APP, "shell", "main.js"));
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName", "readRing", "deskTrustChecks", "folderAnswers", "catalogFolder", "folderSyncerRun"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

import { relayizeDesk, carryDesks, relayMirrorOf, relayChannelOf } from "./relay-mirror-desk.mjs";
const allDesks = [];
const knownTeamKeys = new Map();
const deskProgs = new Map();
let rootLead = null, LEAD_PIN = null;

/* Every desk that pins a team is put on the team's relay mirror (tests/relay-mirror-desk.mjs): the folder a leg calls the share stands
   for the relay's copy of the team, and carrying it to a desk's mirror, and the desk's own files back, is the stand-in's (it was the folder
   syncer, with the desk's folder-mirror). */
function syncFolder(dir) {
  carryDesks(allDesks, dir);
}

/* One desk: its own user-data folder and desk.json naming the catalog folder, the shell evaluated afresh over it. The
   safeStorage stand-in is reversible and shows nothing of what it holds. While `flaky.down` is "seal" it seals nothing,
   and while it is "all" it opens nothing either, throwing as Electron's does. */
function loadDesk(ud, flaky, plant) {
  const relay = relayizeDesk(ud);
  const said = [], on = {}, invoke = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const down = () => (flaky && flaky.down) || "";
  const safeStorage = {
    isEncryptionAvailable: () => !down(),
    encryptString: s => { if (down()) throw new Error("unavailable"); return Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)); },
    decryptString: b => { if (down() === "all") throw new Error("unavailable"); return Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"); },
  };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    ((plant && plant.src) || SRC) + "\nreturn { " + EXPOSE.join(", ") + ", teamOf: pin => { const v = editionTeam.get(String(pin || '')); return v === undefined ? null : String(v); } };")(n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = async (ch, ...args) => {
    const res = await Promise.resolve(invoke[ch](eventFor(), ...args));
    if (ch === "etiuda:branch-write") syncFolder(relay && relay.store);
    return res;
  };
  const ipc = (ch, ...args) => {
    const e = eventFor();
    on[ch](e, ...args);
    if (ch === "etiuda:desk") syncFolder(relay && relay.store);
    return e.returnValue;
  };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  const close = () => {
    const idx = allDesks.indexOf(deskObj);
    if (idx >= 0) allDesks.splice(idx, 1);
    for (const k of Array.from(deskProgs.keys())) {
      if (k.startsWith(ud + ":")) deskProgs.delete(k);
    }
  };
  const deskObj = { api, ask, ipc, on, invoke, said, ud, envelope, syncer: plant && plant.syncer, close, relay };
  allDesks.push(deskObj);
  return deskObj;
}
/* `team` named: the desk pins its lead under that team (`lead` as given, else LEAD) as a desk joined by invitation does. */
function newDesk(name, folder, flaky, plant, team, lead) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  const pin = lead || LEAD_PIN;
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } },
      team ? { teamPins: { [team]: { keyId: pin.keyId, public: pin.public } } } : {})), "utf8");
  const d = loadDesk(ud, flaky, plant);
  syncFolder(folder);
  return d;
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };
const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((out, e) => out.concat(e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]), []);

try {
  const SHARE = folder("share");
  /* The lead and the team first: a desk on a relay team pins its lead from the start, by its invitation. */
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519"), forger = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "lamp-lead", public: pubHex(lead.publicKey) };
  rootLead = LEAD;
  LEAD_PIN = LEAD;
  const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
  const D1 = newDesk("one", SHARE, null, null, TEAM);

  /* ---- the page: the engine's own modules over the real preload, answered by the first desk's shell ------------- */
  const ipcRenderer = {
    sendSync: (ch, ...args) => {
      if (ch === "etiuda:catalog") return null;
      if (ch === "etiuda:host") return { platform: "win32", backdrop: null, deskFile: path.join(D1.ud, "desk.json"), home: D1.ud };
      return D1.ipc(ch, ...args);
    },
    send: (ch, ...args) => { if (D1.on[ch]) D1.ipc(ch, ...args); },
    invoke: (ch, ...args) => new Promise(r => setImmediate(() => r(D1.invoke[ch] ? D1.invoke[ch](eventFor(), ...args) : undefined))),
    on: noop,
  };
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.document = { visibilityState: "visible", addEventListener: noop, removeEventListener: noop };
  const contextBridge = { exposeInMainWorld: (k, v) => { window[k] = v; }, executeInMainWorld: noop };
  new Function("require", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(
    n => (n === "electron" ? { contextBridge, ipcRenderer } : nodeRequire(n)));
  const V2 = await import(MOD("catalog-v2.js"));
  const CAT = await import(MOD("catalog.js"));
  const TR = await import(MOD("catalog-trust.js"));

  /* ---- the lead, the ring, and catalogs invented from nothing -------------------------------------------------- */
  const sign = (doc, key, keyId) => {
    const out = JSON.parse(JSON.stringify(doc));
    delete out.sig;
    out.sig = { alg: "Ed25519", keyId: keyId };
    out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
    return out;
  };
  const catalog = (id, rev, name, date) => sign({ format: 2, kind: "etiuda-catalog", id: id, rev: rev, name: name, date: date,
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day, " + name + "." } },
            { id: "c-thanks", shelf: "t-op", bodyShape: "plain", title: { en: "Thanks" }, body: { en: "Thank you for waiting." } }] },
    lead.privateKey, LEAD.keyId);
  const text = doc => JSON.stringify(doc, null, 1) + "\n";
  const A1 = text(catalog("lamp-shop", 1, "Lamp Shop", "2026-02-01")), A2 = text(catalog("lamp-shop", 2, "Lamp Shop", "2026-02-02"));
  const A3 = text(catalog("lamp-shop", 3, "Lamp Shop", "2026-02-03")), B1 = text(catalog("tea-room", 1, "Tea Room", "2026-02-01"));
  /* Edition 2 told apart by its epoch, so a read of the mirror says which envelope it opened: the mirror keeps the edition
     before while a newer one waits for its key. */
  const A2At = epoch => text(catalog("lamp-shop", 2, "Lamp Shop", "2026-03-" + String(10 + epoch)));
  let clock = Date.now();
  const put = (dir, name, t) => {
    clock += 1000;
    const p = path.join(dir, name);
    fs.writeFileSync(p, t, "utf8");
    try { fs.utimesSync(p, clock / 1000, clock / 1000); } catch {}
    syncFolder(dir);
  };
  const ring = { format: 1, kind: "etiuda-ring", keys: ["lamp-shop", "tea-room"].map(c => ({ catalog: c, keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public })) };
  put(SHARE, "etiuda-ring.json", JSON.stringify(ring));

  const K1 = crypto.randomBytes(32), K2 = crypto.randomBytes(32), K3 = crypto.randomBytes(32), KF = crypto.randomBytes(32);
  const seal = (key, epoch, t, team) => {
    if (key) knownTeamKeys.set((team || TEAM) + ":" + epoch, key);
    return JSON.stringify(D1.api.sealCatalog(key, team || TEAM, epoch, t));
  };
  const entry = (who, key, epoch, team) => {
    if (key) knownTeamKeys.set((team || TEAM) + ":" + epoch, key);
    return { desk: { id: who.id, key: who.key, box: who.box },
      wrap: D1.api.wrapTeamKey(key, who.box, team || TEAM, epoch, who.id) };
  };
  const teamFile = (o) => sign(Object.assign({ format: 1, kind: "etiuda-team", id: o.team || TEAM, catalogs: o.catalogs || ["lamp-shop", "tea-room"],
    lead: { keyId: o.keyId || LEAD.keyId, public: o.public || LEAD.public }, sealed: true, exportsSealed: o.exportsSealed === true,
    epoch: o.epoch, roster: o.roster }, o.handover ? { handover: o.handover } : {}, o.ring ? { ring: o.ring } : {}, o.rev !== undefined ? { rev: o.rev } : {}, { channel: o.channel || relayChannelOf(o.team || TEAM) }), o.signer || lead.privateKey, o.keyId || LEAD.keyId);
  const epochs = (D, team) => Object.keys(((D.envelope().teamKeys || {})[team || TEAM]) || {}).sort().join();
  const read = async (D, name) => ((await D.ask("etiuda:catalog-read", name)) || {}).text;
  const row = async (D, name) => ((await D.ask("etiuda:catalog-files")) || []).find(r => r.name === name) || null;
  const facts = r => r ? JSON.stringify([r.cards, r.edition, r.macros, r.intents, r.cats, r.id, r.rev, r.grew, r.sha]) : "no row";
  /* What the page makes of a text: the engine's one reader, then the signature state against the ring beside it. */
  const judged = async t => {
    let c;
    try { c = CAT.parseCatalogFile(t); } catch (e) { return "refused"; }
    return JSON.stringify([c, CAT.catalogDocOf(c), await TR.catalogTrust(c)]);
  };

  /* ---- 14a, the control: nothing sealed, nothing changes ------------------------------------------------------ */
  const PLAIN = folder("plain"), D0 = newDesk("zero", PLAIN);
  fs.writeFileSync(path.join(PLAIN, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
  put(PLAIN, "twin-a2.ec", A2);
  const plainRead = await read(D0, "twin-a2.ec"), plainBoot = D0.api.readCatalog(), plainRow = facts(await row(D0, "twin-a2.ec"));
  put(PLAIN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [] })));
  const teamRead = await read(D0, "twin-a2.ec"), teamBoot = D0.api.readCatalog(), teamRow = facts(await row(D0, "twin-a2.ec"));
  check(plainRead === A2 && plainBoot === A2.trim() && teamRead === A2 && teamBoot === A2.trim() && teamRow === plainRow
    && !("teamKeys" in D0.envelope()),
    "14a THE CONTROL: an unsealed catalog is handed to the page byte for byte, read by name and at boot, with and without a"
    + " team file beside it, and its listing row is the same (" + A2.length + " bytes, row " + (teamRow === plainRow ? "equal" : "differs") + ")");

  /* ---- before the desk is admitted --------------------------------------------------------------------------- */
  const me1 = await D1.ask("etiuda:branch-identity", true);
  const D2 = newDesk("two", SHARE, null, null, TEAM), me2 = await D2.ask("etiuda:branch-identity", true);
  const D5 = newDesk("five", SHARE, null, null, TEAM), me5 = await D5.ask("etiuda:branch-identity", true);
  const envA2 = seal(K1, 1, A2);
  put(SHARE, "lamps.ec", envA2);
  const before = await read(D1, "lamps.ec");
  const beforeRow = await row(D1, "lamps.ec");
  check(before === envA2 && await judged(before) === "refused" && D1.api.readCatalog() === null && beforeRow && beforeRow.cards === -1,
    "14b with no team file, a sealed catalog is handed as the envelope it is, which the page's reader refuses; boot finds no"
    + " catalog and the listing row reads " + (beforeRow ? beforeRow.cards : "nothing") + " cards");

  /* ---- the first admission: the lead's team file wraps the team key for desks one and five ------------------- */
  put(SHARE, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(me1, K1, 1), entry(me5, K1, 1)] })));
  const opened = await read(D1, "lamps.ec");
  const twinA2 = await judged(A2);
  check(opened === A2.trim() && await judged(opened) === twinA2 && twinA2 !== "refused" && JSON.parse(twinA2)[2] === V2.V2_SIG_VALID,
    "14c admitted, the desk opens the envelope and hands the page the catalog inside, judged exactly as its unsealed twin:"
    + " the same parse and the same signature state (" + (twinA2 === "refused" ? "refused" : JSON.parse(twinA2)[2]) + ")");
  const env1 = D1.envelope();
  check(JSON.stringify(env1.teamPins) === JSON.stringify({ [TEAM]: LEAD }) && epochs(D1) === "1",
    "14d the desk pins the lead's key for the team and keeps the epoch's key in its envelope: pins "
    + Object.keys(env1.teamPins || {}).length + ", epochs kept " + epochs(D1));
  const rowA2 = facts(await row(D1, "lamps.ec")), rowTwin = facts(await row(D0, "twin-a2.ec"));
  check(rowA2 === rowTwin && D1.api.readCatalog() === A2.trim(),
    "14e the listing reads the envelope as its twin (cards, edition, counts, id, edition number, grew, hash), the row no longer"
    + " remembered as unreadable, and boot is handed the catalog inside: " + rowA2);

  /* ---- the S2 read's two cases, through the reader ----------------------------------------------------------- */
  put(SHARE, "lamps.ec", seal(K1, 1, B1));
  const swapped = await read(D1, "lamps.ec"), twinB1 = await judged(B1);
  check(swapped === B1.trim() && await judged(swapped) === twinB1 && JSON.parse(twinB1)[0].id === "tea-room",
    "14f another catalog's envelope under this catalog's name is judged as that other catalog unsealed: id "
    + (twinB1 === "refused" ? "refused" : JSON.parse(twinB1)[0].id) + ", the same parse and signature state as its twin");
  /* The share's older copy never rolls the mirror back (the syncer's rev floor), so the reader's case is planted in the mirror. */
  put(SHARE, "lamps.ec", seal(K1, 1, A1));
  fs.writeFileSync(path.join(relayMirrorOf(D1.ud, TEAM), "lamps.ec"), seal(K1, 1, A1), "utf8");
  const older = await read(D1, "lamps.ec"), twinA1 = await judged(A1);
  check(older === A1.trim() && await judged(older) === twinA1 && JSON.parse(twinA1)[0].rev === 1
    && facts(await row(D1, "lamps.ec")) !== rowA2,
    "14g an older edition's envelope in place of the newer is judged as that older edition unsealed: edition number "
    + (twinA1 === "refused" ? "refused" : JSON.parse(twinA1)[0].rev) + ", the same parse and signature state as its twin");
  put(SHARE, "lamps.ec", envA2);

  check((await read(D5, "lamps.ec")) === A2.trim(), "14y desk five, on the same roster, opens the same envelope with its own wrap");

  /* ---- outside the team ---------------------------------------------------------------------------------------- */
  const strange = await read(D2, "lamps.ec");
  const env2 = D2.envelope();
  /* 14h, moved. It said: a desk the roster does not carry opens nothing: it is handed the envelope, keeps no key, and pins no lead, though the
     ring lists that key, since a ring pins nothing (review 14). Its lead is pinned by its invitation now, so the pin is the invitation's and
     stays so; it says: opens nothing, keeps no key, and its pin is the lead its invitation named and no other. */
  check(strange === envA2 && !("teamKeys" in env2) && JSON.stringify(env2.teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "14h a desk the roster does not carry opens nothing: it is handed the envelope, keeps no key, and its pin stays the lead its invitation"
    + " named, whatever the ring lists (" + (strange === envA2 ? "envelope" : "opened") + ")");

  /* ---- a team file under another key, after the pin: a forger names the team, the lead's keyId and desk one ---- */
  const forged = teamFile({ epoch: 2, public: pubHex(forger.publicKey), signer: forger.privateKey, roster: [entry(me1, KF, 2)] });
  put(SHARE, "etiuda-team.json", JSON.stringify(forged));
  const envF = seal(KF, 2, A3);
  put(SHARE, "forged.ec", envF);
  const viaForger = await read(D1, "forged.ec");
  const env1f = D1.envelope();
  check((viaForger === envF || viaForger === "") && epochs(D1) === "1" && JSON.stringify(env1f.teamPins) === JSON.stringify({ [TEAM]: LEAD })
    && D1.said.filter(l => /signed by a key other than the lead's/.test(l)).length === 1,
    "14i THE CONTROL: a team file signed by a key other than the pinned one opens nothing: its envelope is handed as it is,"
    + " no key is kept from it, the pin stands, and the log says so once");
  check(await read(D1, "lamps.ec") === A2.trim(),
    "14j and the key the desk kept before it still opens the team's own edition");

  /* ---- a new epoch: the lead removes desk five ------------------------------------------------------------------ */
  put(SHARE, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me1, K2, 2)] })));
  put(SHARE, "lamps-3.ec", seal(K2, 2, A3));
  const newer = await read(D1, "lamps-3.ec"), still = await read(D1, "lamps.ec");
  check(newer === A3.trim() && still === A2.trim() && epochs(D1) === "1,2",
    "14k after a new epoch the desk opens the edition sealed under it and still opens the one sealed before, from the key it"
    + " kept: epochs kept " + epochs(D1));
  const fiveOld = await read(D5, "lamps.ec"), fiveNew = await read(D5, "lamps-3.ec");
  check(fiveOld === A2.trim() && JSON.parse(fiveNew).kind === "etiuda-sealed",
    "14l a desk removed at the new epoch opens what was sealed while it was on the roster and not what is sealed after: "
    + (fiveOld === A2.trim() ? "old opens" : "old shut") + ", " + (fiveNew === A3.trim() ? "new opens" : "new shut"));

  /* ---- what is kept, and where -------------------------------------------------------------------------------- */
  const D1b = loadDesk(D1.ud);
  put(SHARE, "etiuda-team.json", JSON.stringify(forged));
  const rL3 = await read(D1b, "lamps-3.ec");
  const rL = await read(D1b, "lamps.ec");
  const rF = await read(D1b, "forged.ec");
  check(rL3 === A3.trim() && rL === A2.trim() && (rF === envF || rF === ""),
    "14m a fresh run of the shell reads the pin and both keys back from desk.json: both editions open, and the file under"
    + " the other key still opens nothing");
  const spellings = k => [k.toString("hex"), k.toString("hex").toUpperCase(), k.toString("base64"), k.toString("base64url"),
    JSON.stringify(Array.from(k))];
  const files = walk(LAB).filter(f => f.indexOf(path.join(LAB, "app")) !== 0);
  const found = (k, list) => list.reduce((n, f) => {
    const b = fs.readFileSync(f), s = b.toString("utf8").replace(/\s+/g, "");
    return n + spellings(k).filter(x => s.indexOf(x.replace(/\s+/g, "")) >= 0).length + (b.indexOf(k) >= 0 ? 1 : 0);
  }, 0);
  const probe = path.join(LAB, "probe.txt");
  fs.writeFileSync(probe, "x" + K1.toString("base64url") + "x");
  const control = found(K1, [probe]);
  fs.unlinkSync(probe);
  check(found(K1, files) === 0 && found(K2, files) === 0 && control === 1,
    "14n neither team key is in any file the desks or the folder hold, in six spellings over " + files.length
    + " files, and the scan finds a key planted in one (" + control + ")");

  /* ---- first admission where no ring speaks, and a file that admits nobody ----------------------------------- */
  const RETIRED_TWO_TEAMS_ONE_FOLDER = true, RETIRED_SIBLING_TEAM_FILES = true;
  const TEAM3 = "t-" + crypto.randomBytes(8).toString("hex");
  const LONE = folder("lone"), D3 = newDesk("three", LONE, null, null, TEAM3), me3 = await D3.ask("etiuda:branch-identity", true);
  put(LONE, "lone.ec", seal(K1, 1, A2, TEAM3));
  put(LONE, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [] })));
  const unpinned = await read(D3, "lone.ec");
  /* 14o, moved. It said: where no ring lists the lead, a team file that does not admit this desk is trusted for nothing: no pin, no key.
     A desk's lead is pinned by its invitation now, so the pin is there from the start and unchanged; it says: a team file that does not
     admit this desk gives it nothing: no key, the pin the invitation made as it was. */
  check(JSON.parse(unpinned).kind === "etiuda-sealed" && JSON.stringify(D3.envelope().teamPins) === JSON.stringify({ [TEAM3]: LEAD }) && !("teamKeys" in D3.envelope()),
    "14o a team file that does not admit this desk gives it nothing: no key, and the lead its invitation pinned stays the pin");
  put(LONE, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [entry(me3, K1, 1, TEAM3)] })));
  check(await read(D3, "lone.ec") === A2.trim() && JSON.stringify(D3.envelope().teamPins) === JSON.stringify({ [TEAM3]: LEAD }),
    "14p the first file that admits this desk gives it the key and opens the catalog, under the lead its invitation pinned (was: pins its lead where no ring lists it)");
  const altered = JSON.parse(JSON.stringify(teamFile({ team: TEAM3, epoch: 2, roster: [entry(me3, K2, 2, TEAM3)] })));
  altered.exportsSealed = true;
  put(LONE, "etiuda-team.json", JSON.stringify(altered));
  put(LONE, "lone-2.ec", seal(K2, 2, A3, TEAM3));
  const rLone2 = await read(D3, "lone-2.ec");
  check((!rLone2 || JSON.parse(rLone2).kind === "etiuda-sealed") && epochs(D3, TEAM3) === "1"
    && D3.said.some(l => /not a team file whole/.test(l)),
    "14q a team file changed after it was signed is not whole and opens nothing, under the pinned lead's own keyId");

  const RINGED = folder("ringed"), D8 = newDesk("eight", RINGED, null, null, TEAM3);
  await D8.ask("etiuda:branch-identity", true);
  fs.writeFileSync(path.join(RINGED, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
  put(RINGED, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [], public: pubHex(forger.publicKey), signer: forger.privateKey })));
  put(RINGED, "lone.ec", seal(K1, 1, A2, TEAM3));
  const rLone8 = await read(D8, "lone.ec");
  /* 14z, moved. It said: a ring that lists the lead's key for the team's catalogs vouches for that key only: a file whose lead is another key
     gets no pin from it (no pin at all). The pin is the invitation's now: a file whose lead is another key opens nothing and changes no pin. */
  check((!rLone8 || JSON.parse(rLone8).kind === "etiuda-sealed") && JSON.stringify(D8.envelope().teamPins) === JSON.stringify({ [TEAM3]: LEAD }),
    "14z a file whose lead is another key than the one this desk's invitation pinned opens nothing and changes no pin");

  /* ---- an admission arriving while the desk runs --------------------------------------------------------------- */
  const LATE = folder("late"), D6 = newDesk("six", LATE, null, null, TEAM3), me6 = await D6.ask("etiuda:branch-identity", true);
  put(LATE, "late.ec", seal(K1, 1, A2, TEAM3));
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  D6.api.catalogChanged(win);
  const quietBefore = sent.filter(a => a[0] === "etiuda:catalog-file").length;
  put(LATE, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [entry(me6, K1, 1, TEAM3)] })));
  D6.api.catalogChanged(win);
  const offered = sent.filter(a => a[0] === "etiuda:catalog-file");
  check(D6.api.isCatalogName("etiuda-team.json") && !D6.api.isCatalogName("etiuda-team.json.tmp") && quietBefore === 0
    && offered.length === 1 && offered[0][1] === A2.trim() && offered[0][2] === "late.ec",
    "14r the team file is watched with the catalogs, and an admission arriving while the desk runs offers the catalog it"
    + " opens: " + quietBefore + " offer before, " + offered.length + " after, of " + (offered[0] ? offered[0][2] : "nothing"));

  /* ---- the shapes a desk refuses before it opens anything ------------------------------------------------------ */
  const nested = JSON.stringify(D1.api.sealCatalog(K1, TEAM, 1, envA2));
  put(SHARE, "nested.ec", nested);
  const rNested = await read(D1, "nested.ec");
  check(rNested === nested || rNested === "",
    "14s an envelope sealed inside another is handed as it is, never opened twice into a catalog");
  const later = Object.assign(JSON.parse(envA2), { epoch: 3 });
  put(SHARE, "epoch-3.ec", JSON.stringify(later));
  const rLater = await read(D1, "epoch-3.ec");
  check((!rLater || JSON.parse(rLater).epoch === 3),
    "14t an envelope naming an epoch the desk holds no key for opens nothing");
  const ownLine = path.join(D1.ud, "desk.json");
  const deskJson = fs.readFileSync(ownLine, "utf8");
  check(!/"teamKeys":\{[^}]*[0-9a-f]{64}/.test(deskJson) && /"teamKeys":\{"t-[0-9a-f]{16}":\{"1":"[A-Za-z0-9+/=]+","2":"[A-Za-z0-9+/=]+"\}\}/.test(deskJson),
    "14u the desk envelope holds each epoch's key sealed, under its team and epoch, and no 64-character hex beside them");

  /* ---- the controls' own controls --------------------------------------------------------------------------- */
  const logged = [D0, D1, D2, D3, D5, D6].reduce((all, D) => all.concat(D.said), []).join("\n");
  check(logged.length > 0 && [K1, K2, KF].every(k => spellings(k).every(x => logged.indexOf(x) < 0)),
    "14v no shell's log holds a team key in any spelling, over " + logged.split("\n").length + " logged lines");
  const D7 = newDesk("seven", SHARE, null, null, TEAM);
  check(JSON.parse(await read(D7, "lamps.ec")).kind === "etiuda-sealed" && !("branch" in D7.envelope()),
    "14w a desk with no identity of its own is on no roster: it opens nothing and makes no key pair to find out");
  const leadOff = teamFile({ epoch: 1, roster: [entry(me1, K1, 1)] });
  delete leadOff.sig;
  put(SHARE, "etiuda-team.json", JSON.stringify(leadOff));
  const D1c = loadDesk(D1.ud);
  check(await read(D1c, "lamps.ec") === A2.trim() && JSON.stringify(D1c.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "14x an unsigned team file takes nothing away: the kept key opens what it opened and the pin stands");

  /* ---- the desk's own file: what the page writes after an edit, grown from the catalog it was handed ----------- */
  const OWN = folder("own"), D9 = newDesk("nine", OWN, null, null, TEAM), me9 = await D9.ask("etiuda:branch-identity", true);
  const D12 = newDesk("twelve", OWN, null, null, TEAM), me12 = await D12.ask("etiuda:branch-identity", true);
  const D13 = newDesk("thirteen", OWN, null, null, TEAM);
  await D13.ask("etiuda:branch-identity", true);
  fs.writeFileSync(path.join(OWN, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(me9, K1, 1), entry(me12, K1, 1)] })));
  put(OWN, "lamps.ec", seal(K1, 1, A2));
  put(OWN, "tea.ec", B1);
  /* The page's branchCatalog over a handed text: the desk's id ending in eight hex of the grown-from id, and grew. */
  const grownFrom = (handed, who, name) => {
    const doc = JSON.parse(handed), from = { id: doc.id, rev: doc.rev };
    const hex8 = crypto.createHash("sha256").update(String(from.id)).digest("hex").slice(0, 8);
    delete doc.sig;
    doc.id = who.id + "-" + hex8;
    doc.rev = 1;
    // The edition's pin as the engine's pinned() makes it: the signed bytes of the catalog handed.
    doc.grew = { id: from.id, rev: from.rev, sha: "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(handed)))).digest("hex") };
    doc.desk = { id: who.id, key: who.key, box: who.box };
    return { stem: name + "-" + hex8, text: JSON.stringify(doc), file: path.join(OWN, "desks", who.id, name + "-" + hex8 + ".ec") };
  };
  const holding = needle => walk(OWN).filter(f => fs.readFileSync(f, "utf8").indexOf(needle) >= 0).length;
  const lamps = grownFrom(await read(D9, "lamps.ec"), me9, "lamps");
  const lampsId = JSON.parse(lamps.text).id;
  const landed = () => (fs.existsSync(lamps.file) ? JSON.parse(fs.readFileSync(lamps.file, "utf8")) : {});
  const ownRow = async D => ((await D.ask("etiuda:catalog-files")) || []).find(r => !!r.desk && r.desk.id === me9.id && r.id === lampsId) || null;
  const said = r => JSON.stringify(r);
  const sealedW = await D9.ask("etiuda:branch-write", lamps.stem, lamps.text);
  const env9 = landed(), inner9 = env9.kind === "etiuda-sealed" ? D1.api.openSealed(K1, env9) : null;
  const signed9 = inner9 ? JSON.parse(inner9) : {};
  const again = await D9.ask("etiuda:branch-write", lamps.stem, lamps.text);
  const edited = JSON.stringify(Object.assign(JSON.parse(lamps.text), { name: "Lamp Shop, edited" }));
  const freshDesk = loadDesk(D9.ud);
  const freshW = await freshDesk.ask("etiuda:branch-write", lamps.stem, edited);
  freshDesk.close();
  const env9b = landed(), inTeam = await ownRow(D12), outside = await ownRow(D13);
  check(JSON.parse(lamps.text).grew.id === "lamp-shop" && said(sealedW) === said({ ok: true, rev: 1 })
    && env9.team === TEAM && env9.epoch === 1 && inner9 === JSON.stringify(Object.assign(JSON.parse(lamps.text),
      { rev: 1, hash: signed9.hash, sig: signed9.sig }), null, 1) + "\n"
    && said(again) === said({ ok: true, unchanged: true, rev: 1 }) && said(freshW) === said({ ok: true, rev: 2 })
    && env9b.kind === "etiuda-sealed" && env9b.epoch === 1 && holding("Good day, Lamp Shop.") === 0
    && outside === null && !!inTeam && inTeam.rev === 2 && inTeam.grew.id === "lamp-shop",
    "14aa the desk's own file of a catalog it opened from an envelope lands as an envelope under the team's key, the signed file"
    + " inside it, also from a fresh run of the shell that has not opened the catalog; a desk without the key cannot open it and"
    + " does not list it, a desk on the roster lists it as genuine: " + said(sealedW) + ", " + said(again) + ", " + said(freshW)
    + ", the catalog's text in " + holding("Good day, Lamp Shop.") + " file(s) of the share, listed by the outsider "
    + (outside ? "yes" : "no") + ", by the member " + (inTeam ? "yes" : "no"));
  const teaHanded = await read(D9, "tea.ec"), tea = grownFrom(teaHanded, me9, "tea");
  const teaW = await D9.ask("etiuda:branch-write", tea.stem, tea.text);
  const teaOut = fs.existsSync(tea.file) ? fs.readFileSync(tea.file, "utf8") : "";
  const teaBack = teaOut ? JSON.parse(teaOut) : {};
  check(teaHanded === B1 && JSON.stringify(teaW) === JSON.stringify({ ok: true, rev: 1 })
    && teaOut === JSON.stringify(Object.assign(JSON.parse(tea.text), { rev: 1, hash: teaBack.hash, sig: teaBack.sig }), null, 1) + "\n",
    "14AA THE CONTROL: on the same admitted desk, its own file of an unsealed catalog is written as the page sent it, with"
    + " the edition, hash and signature the shell adds: " + JSON.stringify(teaW) + ", " + teaOut.length + " bytes");

  /* ---- a new epoch removes desk twelve: the desk's next write stands under the newest key it keeps --------------- */
  const lamps12 = grownFrom(await read(D12, "lamps.ec"), me12, "lamps");
  const file12 = path.join(OWN, "desks", me12.id, path.basename(lamps12.file));
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
  const resealed = await D9.ask("etiuda:branch-write", lamps.stem, edited);
  const env9c = landed(), mine = await ownRow(D9), removed = await ownRow(D12);
  check(said(resealed) === said({ ok: true, rev: 3 }) && env9c.kind === "etiuda-sealed" && env9c.epoch === 2
    && D1.api.openSealed(K1, env9c) === null && D1.api.openSealed(K2, env9c) !== null && !!mine && mine.rev === 3 && removed === null,
    "14ac after a new epoch the same file, written again, is sealed under the newest key the desk keeps: " + said(resealed)
    + ", epoch " + env9c.epoch + "; the writer lists it " + (mine ? "yes" : "no") + ", the desk removed at the epoch "
    + (removed ? "yes" : "no"));

  /* ---- the desk removed at that epoch writes nothing, in this run or a fresh one, until the lead lets it in again -- */
  {
    const d12b = loadDesk(D12.ud);
    const out12 = [await D12.ask("etiuda:branch-write", lamps12.stem, lamps12.text),
      await d12b.ask("etiuda:branch-write", lamps12.stem, lamps12.text)];
    d12b.close();
    const none12 = !fs.existsSync(file12);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me12, K3, 3)] })));
    const back12 = await D12.ask("etiuda:branch-write", lamps12.stem, lamps12.text);
    const env12 = fs.existsSync(file12) ? JSON.parse(fs.readFileSync(file12, "utf8")) : {};
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
    check(out12.every(r => said(r) === said({ ok: false, held: true })) && none12 && said(back12) === said({ ok: true, rev: 1 })
      && env12.kind === "etiuda-sealed" && env12.epoch === 3 && D1.api.openSealed(K3, env12) !== null
      && D1.api.openSealed(K1, env12) === null && holding("Good day, Lamp Shop.") === 0,
      "14aj a desk the team file leaves off its roster at an epoch newer than any key it keeps holds its own file, in the run"
      + " that opened the catalog and in a fresh one, and writes nothing the old epoch's key opens: " + out12.map(said).join(", ")
      + ", a file on the share " + (none12 ? "no" : "yes") + "; let in again at epoch 3, it writes " + said(back12)
      + " sealed under epoch " + env12.epoch);
  }

  /* ---- Export: what the page made from a catalog that came sealed leaves this desk sealed, and nothing else changes - */
  {
    const SAVED = folder("saved");
    process.env.ETIUDA_TEST_SAVE_AS = SAVED;
    const made = text(catalog("lamp-export", 1, "Lamp Shop", "2026-02-04"));
    const lampFrom = { id: "lamp-shop", sha: JSON.parse(lamps.text).grew.sha }, teaFrom = { id: "tea-room", sha: "sha256:" + "0".repeat(64) };
    const exportAs = async (D, name, from) => {
      await D.ask("etiuda:choose-catalog-save", "Export", name, "Catalogs");
      const r = await D.ask("etiuda:write-catalog-save", made, from);
      const at = path.join(SAVED, name);
      return { r: r, text: fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null };
    };
    const inSaved = needle => walk(SAVED).filter(f => fs.readFileSync(f, "utf8").indexOf(needle) >= 0).length;
    /* The lead's word on exports, as Studio writes it for every team it makes: sealed. 14ar turns it to false. */
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)], exportsSealed: true })));
    const sealedOut = await exportAs(D9, "Lamp Shop.ec", lampFrom), env = sealedOut.text ? JSON.parse(sealedOut.text) : {};
    const byMember = env.kind === "etiuda-sealed" ? (await (async () => { put(OWN, "lamp-copy.ec", sealedOut.text);
      const d578 = loadDesk(D9.ud);
      const t = await read(d578, "lamp-copy.ec"); d578.close(); fs.unlinkSync(path.join(OWN, "lamp-copy.ec")); return t; })()) : "";
    check(said(sealedOut.r) === said({ name: "Lamp Shop.ec", ok: true, sealed: true }) && env.team === TEAM && env.epoch === 2
      && D1.api.openSealed(K2, env) === made && byMember === made.trim() && inSaved("Good day, Lamp Shop.") === 0,
      "14ao an export the page made from a catalog that came sealed is written sealed for that team under the newest key the"
      + " desk keeps, the page's text inside it byte for byte, and a member opens it: " + said(sealedOut.r) + ", epoch " + env.epoch
      + ", the catalog's text in " + inSaved("Good day, Lamp Shop.") + " file(s) of the save folder");
    const plain = [await exportAs(D9, "Tea.ec", teaFrom), await exportAs(D9, "Loose.ec", null), await exportAs(D13, "Outside.ec", lampFrom)];
    check(plain.every(p => said(p.r) === said({ name: p.r.name, ok: true }) && p.text === made),
      "14AO THE CONTROL: an export made from an unsealed catalog, from no catalog, or on a desk that never opened an envelope is"
      + " written as the page sent it: " + plain.map(p => said(p.r) + " " + (p.text === made ? "byte for byte" : "changed")).join(", "));
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)], catalogs: ["tea-room"] })));
    const refused = await exportAs(D9, "Refused.ec", lampFrom);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
    check(said(refused.r) === said({ name: "Refused.ec", ok: false, sealed: true }) && refused.text === null
      && !fs.readdirSync(SAVED).some(n => /^Refused/.test(n)),
      "14ap where the desk cannot seal for the team, here the folder's team file no longer listing the catalog, the export is"
      + " refused and nothing is written: " + said(refused.r) + ", a file " + (refused.text === null ? "no" : "yes"));
    /* THE PLAIN ARM (Studio's Desks screen, "A desk's export"): the team file the desk trusts says exportsSealed false. */
    const plainArm = await exportAs(D9, "Let out.ec", lampFrom);
    check(said(plainArm.r) === said({ name: "Let out.ec", ok: true }) && plainArm.text === made,
      "14ar where the team's file at the folder, whole under the pinned lead and listing the catalog, says exportsSealed false,"
      + " an export made from that team's sealed catalog is written as the page sent it: " + said(plainArm.r) + ", "
      + (plainArm.text === made ? "byte for byte" : "changed"));
    const bent = JSON.parse(JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)], exportsSealed: true })));
    bent.exportsSealed = false;
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)], exportsSealed: true })));
    put(OWN, "etiuda-team.json", JSON.stringify(bent));
    const bentOut = await exportAs(D9, "Bent.ec", lampFrom);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [], exportsSealed: false })));
    const leftOut = await exportAs(D9, "Left.ec", lampFrom);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me9, K3, 3)] })));
    /* The bent file never reaches the mirror, so the export follows the last genuine file, which says sealed. */
    const bentSealed = !!bentOut.text && bentOut.text !== made && (() => { try { return JSON.parse(bentOut.text).kind === "etiuda-sealed"; } catch { return false; } })();
    check(((said(bentOut.r) === said({ name: "Bent.ec", ok: false, sealed: true }) && bentOut.text === null)
        || (said(bentOut.r) === said({ name: "Bent.ec", ok: true, sealed: true }) && bentSealed))
      && said(leftOut.r) === said({ name: "Left.ec", ok: false, sealed: true }) && leftOut.text === null
      && !fs.readdirSync(SAVED).some(n => /^Left/.test(n)),
      "14aR THE CONTROL: exportsSealed false in a team file changed after signing, or from a team that has left this desk off"
      + " its roster at a newer epoch, lets nothing out: " + said(bentOut.r) + ", " + said(leftOut.r));
    /* The page's half: host.js hands the host the catalog the export was made from, and the host's sealed answer back. */
    const H = await import(MOD("host.js"));
    const realWrite = D1.invoke["etiuda:write-catalog-save"], got = [];
    D1.invoke["etiuda:write-catalog-save"] = (e, t, from) => { got.push(from); return { name: "Page.ec", ok: true, sealed: from !== null }; };
    const viaPage = [await H.eSaveCatalogFile("Export", "Page.ec", "Catalogs", () => made, { id: "lamp-shop", sha: lampFrom.sha, extra: 1 }),
      await H.eSaveCatalogFile("Export", "Page.ec", "Catalogs", () => made)];
    D1.invoke["etiuda:write-catalog-save"] = realWrite;
    check(said(got) === said([{ id: "lamp-shop", sha: lampFrom.sha }, null])
      && said(viaPage) === said([{ name: "Page.ec", ok: true, sealed: true }, { name: "Page.ec", ok: true, sealed: false }]),
      "14aq the page's save hands the host the catalog an export was made from, as {id, sha} and nothing else, or null, and"
      + " reads back whether the host sealed it: " + said(got) + ", " + said(viaPage));

    /* The same inner text, sealed for a second team, read in this run. The pin's team is the shell's own map. */
    {
      const QUAY = folder("quay"), BERTH = folder("berth");
      const Q = newDesk("quaydesk", QUAY, null, null, TEAM);
      const meQ = await Q.ask("etiuda:branch-identity", true);
      fs.writeFileSync(path.join(QUAY, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
      fs.writeFileSync(path.join(BERTH, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
      const TB = "t-" + crypto.randomBytes(8).toString("hex"), KB = crypto.randomBytes(32);
      put(QUAY, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meQ, K1, 1)], exportsSealed: true })));
      put(QUAY, "lamps.ec", seal(K1, 1, A2));
      const openedQ = await read(Q, "lamps.ec");
      const pinQ = (await row(Q, "lamps.ec") || {}).sha || "";
      const SAVEQ = folder("quay-save");
      const prevSave = process.env.ETIUDA_TEST_SAVE_AS;
      process.env.ETIUDA_TEST_SAVE_AS = SAVEQ;
      const body = "Good day, Quay board.";
      const madeQ = text(catalog("lamp-export", 4, "Quay board", "2026-10-04"));
      const exportQ = async (name, from) => {
        await Q.ask("etiuda:choose-catalog-save", "Export", name, "Catalogs");
        const r = await Q.ask("etiuda:write-catalog-save", madeQ, from);
        const at = path.join(SAVEQ, name);
        return { r: r, text: fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null };
      };
      const fromQ = { id: "lamp-shop", sha: pinQ };
      const beforeQ = await exportQ("Before.ec", fromQ);
      let beforeEnv = {};
      try { beforeEnv = JSON.parse(beforeQ.text) || {}; } catch { beforeEnv = {}; }
      const beforeOpen = beforeEnv.kind === "etiuda-sealed" ? D1.api.openSealed(K1, beforeEnv) : null;
      check(openedQ === A2.trim() && Q.api.teamOf(pinQ) === TEAM && beforeEnv.team === TEAM && beforeEnv.epoch === 1
        && beforeOpen === madeQ && (beforeQ.text || "").indexOf(body) < 0,
        "14as THE CONTROL: before a second team's envelope, the export is sealed for the first team and the pin's team is"
        + " that team: " + said(beforeQ.r) + ", team " + beforeEnv.team + ", pin " + Q.api.teamOf(pinQ));
      put(BERTH, "etiuda-team.json", JSON.stringify(teamFile({ team: TB, epoch: 1, roster: [entry(meQ, KB, 1, TB)], exportsSealed: true })));
      put(BERTH, "lamps.ec", seal(KB, 1, A2, TB));
      const pointQ = dir => {
        const e = Q.envelope();
        e.keys = Object.assign({}, e.keys, { eCatalogFolder: dir });
        fs.writeFileSync(path.join(Q.ud, "desk.json"), JSON.stringify(e), "utf8");
        Q.ipc("etiuda:desk");
      };
      pointQ(BERTH);
      const readB = await read(Q, "lamps.ec");
      const pinAfter = Q.api.teamOf(pinQ);
      pointQ(QUAY);
      const afterQ = await exportQ("After.ec", fromQ);
      let afterEnv = {};
      try { afterEnv = JSON.parse(afterQ.text) || {}; } catch { afterEnv = {}; }
      const afterOpen = afterEnv.kind === "etiuda-sealed" ? D1.api.openSealed(K1, afterEnv) : null;
      const byB = afterEnv.kind === "etiuda-sealed" ? D1.api.openSealed(KB, afterEnv) : null;
      check(readB === A2.trim() && pinAfter === TEAM && afterEnv.team === TEAM && afterOpen === madeQ && byB === null,
        "14at after a second team's envelope of the same inner text, the pin's team stays the first team and the export"
        + " is still sealed for it: pin " + JSON.stringify(pinAfter) + ", " + said(afterQ.r) + ", team " + afterEnv.team
        + ", the second team's key opens it " + (byB ? "yes" : "no"));
      check(!!afterQ.text && afterQ.text !== madeQ && afterQ.text.indexOf(body) < 0 && afterEnv.kind === "etiuda-sealed",
        "14au an export after that second envelope is not the catalog in the clear: the body "
        + (afterQ.text && afterQ.text.indexOf(body) >= 0 ? "is in the file" : "is not in the file"));
      put(QUAY, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meQ, K1, 1)], catalogs: ["tea-room"], exportsSealed: true })));
      const refusedQ = await exportQ("Uncovered.ec", fromQ);
      const refusedSaid = Q.said.some(s => s.indexOf("cannot seal") >= 0);
      put(QUAY, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meQ, K1, 1)], exportsSealed: true })));
      const stillQ = await exportQ("Still.ec", fromQ);
      let stillEnv = {};
      try { stillEnv = JSON.parse(stillQ.text) || {}; } catch { stillEnv = {}; }
      process.env.ETIUDA_TEST_SAVE_AS = prevSave;
      check(said(refusedQ.r) === said({ name: "Uncovered.ec", ok: false, sealed: true }) && refusedQ.text === null && refusedSaid
        && stillEnv.kind === "etiuda-sealed" && stillEnv.team === TEAM,
        "14av a catalog the team file does not list is refused, and the catalog the first team covers still exports sealed:"
        + " " + said(refusedQ.r) + ", then " + said(stillQ.r) + ", team " + stillEnv.team);
    }

    /* The folder's own team seals an export when that team held the pin, whichever envelope was read first,
       and when that team's envelope lies unread in the folder after another team's was read.
       A claim that does not open, and a folder that holds the pin under two teams, still refuse. */
    /* 14aw, 14ax, 14ay, 14az and 14ba (5 asserted) are RETIRED likewise: they held the export at one team's folder where another team's envelope of the
       same pin had been read, in either order. */
    if (!RETIRED_TWO_TEAMS_ONE_FOLDER) {
      const prevSave = process.env.ETIUDA_TEST_SAVE_AS;
      const take = async (D, save, name, made, pin) => {
        process.env.ETIUDA_TEST_SAVE_AS = save;
        await D.ask("etiuda:choose-catalog-save", "Export", name, "Catalogs");
        const r = await D.ask("etiuda:write-catalog-save", made, { id: "lamp-shop", sha: pin });
        const at = path.join(save, name);
        const out = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null;
        let env = {};
        try { env = JSON.parse(out) || {}; } catch { env = {}; }
        return { r: r, out: out, env: env };
      };
      const opensWith = (env, key) => env && env.kind === "etiuda-sealed" ? D1.api.openSealed(key, env) : null;
      const pair = async (label) => {
        const homeA = folder(label + "-a"), homeB = folder(label + "-b");
        const D = newDesk(label, homeA);
        const me = await D.ask("etiuda:branch-identity", true);
        fs.writeFileSync(path.join(homeA, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
        fs.writeFileSync(path.join(homeB, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
        const TB = "t-" + crypto.randomBytes(8).toString("hex"), KB = crypto.randomBytes(32);
        const point = dir => {
          const e = D.envelope();
          e.keys = Object.assign({}, e.keys, { eCatalogFolder: dir });
          fs.writeFileSync(path.join(D.ud, "desk.json"), JSON.stringify(e), "utf8");
          D.ipc("etiuda:desk");
        };
        const admit = async (dir, team, key) => {
          put(dir, "etiuda-team.json", JSON.stringify(teamFile({ team: team, epoch: 1, roster: [entry(me, key, 1, team)], exportsSealed: true })));
          put(dir, "lamps.ec", seal(key, 1, A2, team));
          point(dir);
          return await read(D, "lamps.ec");
        };
        const pinOf = async () => (await row(D, "lamps.ec") || {}).sha || "";
        return { D: D, homeA: homeA, homeB: homeB, TB: TB, KB: KB, point: point, admit: admit, pinOf: pinOf };
      };
      const cove = await pair("cove");
      const coveB = await cove.admit(cove.homeB, cove.TB, cove.KB);
      const covePin = await cove.pinOf();
      const coveA = await cove.admit(cove.homeA, TEAM, K1);
      const coveNamed = cove.D.api.teamOf(covePin);
      const coveMade = text(catalog("lamp-export", 4, "Cove board", "2026-10-18"));
      const coveBody = "Good day, Cove board.";
      const coveGot = await take(cove.D, folder("cove-save"), "Cove.ec", coveMade, covePin);
      const coveByA = opensWith(coveGot.env, K1), coveByB = opensWith(coveGot.env, cove.KB);
      check(coveB === A2.trim() && coveA === A2.trim() && coveNamed === cove.TB && coveGot.env.team === TEAM
        && coveGot.env.kind === "etiuda-sealed" && coveByA === coveMade && coveByB === null
        && !!coveGot.out && coveGot.out.indexOf(coveBody) < 0,
        "14aw with team B's envelope read before team A's, the export at A's folder is sealed for A and the pin stays"
        + " the team read first: pin " + JSON.stringify(coveNamed) + ", " + said(coveGot.r) + ", team " + coveGot.env.team
        + ", A's key opens it " + (coveByA === coveMade ? "yes" : "no") + ", B's key opens it " + (coveByB ? "yes" : "no")
        + ", the body " + (coveGot.out && coveGot.out.indexOf(coveBody) >= 0 ? "is in the file" : "is not in the file"));
      const inlet = await pair("inlet");
      const inletA = await inlet.admit(inlet.homeA, TEAM, K1);
      const inletPin = await inlet.pinOf();
      const inletB = await inlet.admit(inlet.homeB, inlet.TB, inlet.KB);
      const inletNamed = inlet.D.api.teamOf(inletPin);
      const inletMade = text(catalog("lamp-export", 4, "Inlet board", "2026-10-18"));
      const inletBody = "Good day, Inlet board.";
      const inletGot = await take(inlet.D, folder("inlet-save"), "Inlet.ec", inletMade, inletPin);
      const inletByB = opensWith(inletGot.env, inlet.KB), inletByA = opensWith(inletGot.env, K1);
      check(inletA === A2.trim() && inletB === A2.trim() && inletNamed === TEAM && inletGot.env.team === inlet.TB
        && inletGot.env.kind === "etiuda-sealed" && inletByB === inletMade && inletByA === null
        && !!inletGot.out && inletGot.out.indexOf(inletBody) < 0,
        "14ax with team A's envelope read before team B's, the export at B's folder is sealed for B and the pin stays"
        + " the team read first: pin " + JSON.stringify(inletNamed) + ", " + said(inletGot.r) + ", team " + inletGot.env.team
        + ", B's key opens it " + (inletByB === inletMade ? "yes" : "no") + ", A's key opens it " + (inletByA ? "yes" : "no"));
      const moor = await pair("moor");
      const moorB = await moor.admit(moor.homeB, moor.TB, moor.KB);
      const moorPin = await moor.pinOf();
      const moorMe = await moor.D.ask("etiuda:branch-identity", true);
      put(moor.homeA, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM, epoch: 1, roster: [entry(moorMe, K1, 1, TEAM)], exportsSealed: true })));
      put(moor.homeA, "lamps.ec", seal(K1, 1, A2, TEAM));
      moor.point(moor.homeA);
      const moorMade = text(catalog("lamp-export", 4, "Moor board", "2026-10-18"));
      const moorBody = "Good day, Moor board.";
      const moorGot = await take(moor.D, folder("moor-save"), "Moor.ec", moorMade, moorPin);
      const moorNamed = moor.D.api.teamOf(moorPin);
      const moorByA = opensWith(moorGot.env, K1), moorByB = opensWith(moorGot.env, moor.KB);
      check(moorB === A2.trim() && moorNamed === moor.TB && moorGot.env.team === TEAM && moorGot.env.kind === "etiuda-sealed"
        && moorByA === moorMade && moorByB === null
        && !!moorGot.out && moorGot.out.indexOf(moorBody) < 0,
        "14ba with team B's envelope read and team A's envelope lying unread in A's folder, the export at A's folder is sealed for A"
        + " and the pin stays the team read first: pin " + JSON.stringify(moorNamed) + ", " + said(moorGot.r) + ", team " + moorGot.env.team
        + ", A's key opens it " + (moorByA === moorMade ? "yes" : "no") + ", B's key opens it " + (moorByB ? "yes" : "no")
        + ", the body " + (moorGot.out && moorGot.out.indexOf(moorBody) >= 0 ? "is in the file" : "is not in the file"));
      const reed = await pair("reed");
      const reedA = await reed.admit(reed.homeA, TEAM, K1);
      const reedPin = await reed.pinOf();
      put(reed.homeA, "lamps.ec", seal(reed.KB, 1, A2, TEAM));
      const reedForged = await read(reed.D, "lamps.ec");
      const reedNamed = reed.D.api.teamOf(reedPin);
      const reedMade = text(catalog("lamp-export", 4, "Reed board", "2026-10-18"));
      const reedGot = await take(reed.D, folder("reed-save"), "Reed.ec", reedMade, reedPin);
      const reedByA = opensWith(reedGot.env, K1), reedByB = opensWith(reedGot.env, reed.KB);
      check(reedA === A2.trim() && reedForged !== A2.trim() && reedNamed === TEAM && reedGot.env.team === TEAM
        && reedByA === reedMade && reedByB === null,
        "14ay an envelope sealed under team B's key claiming team A, read after A's, does not open, and the export at A's"
        + " folder stays sealed for A: opened " + (reedForged === A2.trim() ? "yes" : "no") + ", pin " + JSON.stringify(reedNamed)
        + ", " + said(reedGot.r) + ", team " + reedGot.env.team);
      const kiln = await pair("kiln");
      const kilnA = await kiln.admit(kiln.homeA, TEAM, K1);
      const kilnPin = await kiln.pinOf();
      const kilnB = await kiln.admit(kiln.homeB, kiln.TB, kiln.KB);
      kiln.point(kiln.homeA);
      put(kiln.homeA, "other.ec", seal(kiln.KB, 1, A2, kiln.TB));
      const kilnMade = text(catalog("lamp-export", 4, "Kiln board", "2026-10-18"));
      const kilnGot = await take(kiln.D, folder("kiln-save"), "Kiln.ec", kilnMade, kilnPin);
      if (prevSave === undefined) delete process.env.ETIUDA_TEST_SAVE_AS;
      else process.env.ETIUDA_TEST_SAVE_AS = prevSave;
      const kilnByA = opensWith(kilnGot.env, K1), kilnByB = opensWith(kilnGot.env, kiln.KB);
      check(kilnA === A2.trim() && kilnB === A2.trim()
        && ((kilnGot.out === null && said(kilnGot.r) === said({ name: "Kiln.ec", ok: false, sealed: true }))
          || (kilnGot.env.team === TEAM && kilnByA === kilnMade && kilnByB === null)),
        "14az both teams' envelopes of one pin in A's folder: team B's never reaches A's mirror, and the export at A is refused or"
        + " sealed for A alone: " + said(kilnGot.r) + ", a file " + (kilnGot.out === null ? "no" : "yes, team " + kilnGot.env.team
        + ", B's key opens it " + (kilnByB ? "yes" : "no")));
    }
  }

  /* ---- the folder's team file no longer lists the catalog: no team covers it where the file is written ---------- */
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me9, K3, 3)], catalogs: ["tea-room"] })));
  const d824 = loadDesk(D9.ud);
  const unsure = await d824.ask("etiuda:branch-write", lamps.stem,
    JSON.stringify(Object.assign(JSON.parse(lamps.text), { name: "Lamp Shop, edited twice" })));
  d824.close();
  check(D9.envelope().teamOpened.indexOf("lamp-shop") >= 0 && said(unsure) === said({ ok: false, held: true })
    && !fs.existsSync(lamps.file) && holding("Good day, Lamp Shop.") === 0 && holding("edited twice") === 0,
    "14ad where the team file at the folder written to does not list the catalog, the desk holds its file and writes nothing"
    + " in the clear, and its copy is gone since 14ap's team file stopped listing the catalog: " + said(unsure) + ", the share's file "
    + (fs.existsSync(lamps.file) ? "still there, epoch " + landed().epoch : "gone"));
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me9, K3, 3)] })));

  /* ---- two teams, one catalog id: the desk lists the other team's folder, then writes in its own --------------- */
  /* TWO TEAMS IN ONE FOLDER, RETIRED with the folder team: these checks (14ae to 14ai, 7 asserted) held a desk that moves its catalog folder from one
     team's shared folder to another's and reads two teams' envelopes of one catalog id side by side. A desk is on one relay team's mirror, whose
     files are that team's alone, so two teams never meet in one folder; the code stays under the switch as the record of what each held. */
  if (!RETIRED_TWO_TEAMS_ONE_FOLDER) {
    const OTHER = folder("other"), TB = "t-" + crypto.randomBytes(8).toString("hex"), KB = crypto.randomBytes(32);
    const point = (D, dir) => {
      const e = D.envelope();
      e.keys = Object.assign({}, e.keys, { eCatalogFolder: dir });
      fs.writeFileSync(path.join(D.ud, "desk.json"), JSON.stringify(e), "utf8");
      D.close();
      return loadDesk(D.ud);
    };
    const name = n => JSON.stringify(Object.assign(JSON.parse(lamps.text), { name: n }));
    const who = t => t === TEAM ? "A" : t === TB ? "B" : t ? "X, a third" : "none";
    check(((D9.envelope().teamEpochSeen || {})[TEAM] || 0) >= 3,
      "14AEs desk nine's seen epoch after 14aR is still at least 3 at 14AE's start: " + ((D9.envelope().teamEpochSeen || {})[TEAM] || 0));
    let P = point(D9, OWN);
    const r0 = await read(P, "lamps.ec");
    const w0 = await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, before the other folder"));
    const e0 = landed();
    check(r0 === A2.trim() && !!w0.ok && e0.team === TEAM && e0.epoch === 3 && D1.api.openSealed(K3, e0) !== null,
      "14AE THE CONTROL: one team, in its own folder, the desk's own file lands sealed for that team: " + said(w0) + ", team "
      + who(e0.team) + ", epoch " + e0.epoch);
    fs.writeFileSync(path.join(OTHER, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
    put(OTHER, "etiuda-team.json", JSON.stringify(teamFile({ team: TB, epoch: 1, roster: [entry(me9, KB, 1, TB)] })));
    put(OTHER, "sales.ec", seal(KB, 1, text(catalog("lamp-shop", 1, "Other Shop", "2026-03-01")), TB));
    P = point(P, OTHER);
    const listed = ((await P.ask("etiuda:catalog-files")) || []).find(r => r.name === "sales.ec");
    P = point(P, OWN);
    const w1 = await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, after the other folder"));
    const e1 = landed();
    const byB = e1.kind === "etiuda-sealed" ? D1.api.openSealed(KB, e1) : null;
    check(!!listed && listed.id === "lamp-shop" && !!w1.ok && e1.team === TEAM && D1.api.openSealed(K3, e1) !== null && byB === null,
      "14ae a desk in two teams that each have a catalog of one id lists the other team's folder, then writes its own file in"
      + " its own team's folder: it lands sealed for the team covering it there, " + said(w1) + ", team " + who(e1.team)
      + ", the other team's key opens it " + (byB !== null ? "yes" : "no"));
    const forgedB = teamFile({ team: TB, epoch: 1, roster: [], public: pubHex(forger.publicKey), signer: forger.privateKey });
    const alteredB = JSON.parse(JSON.stringify(teamFile({ team: TB, epoch: 1, roster: [entry(me9, KB, 1, TB)] })));
    alteredB.exportsSealed = true;
    const planted = [];
    for (const f of [forgedB, alteredB]) {
      put(OWN, "etiuda-team.json", JSON.stringify(f));
      planted.push(await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, under a planted team file")));
    }
    const e2 = landed();
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me9, K3, 3)] })));
    check(planted.every(r => said(r) === said({ ok: false, held: true }) || r.ok === true) && e2.team === TEAM
      && (D1.api.openSealed(K3, e2) || "").indexOf("Lamp Shop") >= 0
      && D1.api.openSealed(KB, e2) === null && holding("planted team file") === 0,
      "14af a team file in the folder naming the other team, under a key other than its pinned lead's or changed after signing,"
      + " moves nothing: the desk holds its file, " + planted.map(said).join(", ") + ", and the share's file stays team "
      + who(e2.team) + "'s");

    /* A team file planted at the folder for a team nobody pinned, wrapping a key for this desk, admits it at once. */
    const TX = "t-" + crypto.randomBytes(8).toString("hex"), KX = crypto.randomBytes(32);
    const restoreA = () => put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [entry(me9, K3, 3)] })));
    const teamX = JSON.stringify(teamFile({ team: TX, epoch: 1, roster: [entry(me9, KX, 1, TX)], public: pubHex(forger.publicKey),
      signer: forger.privateKey }));
    const openedBy = (e, k) => (e.kind === "etiuda-sealed" ? D1.api.openSealed(k, e) : null) || "";
    put(OWN, "etiuda-team.json", teamX);
    const wX = await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, under a fresh team"));
    const eX = landed();
    restoreA();
    check((said(wX) === said({ ok: false, held: true }) || wX.ok === true) && eX.team === TEAM && openedBy(eX, KX) === ""
      && holding("under a fresh team") === 0,
      "14ag a team file planted at the folder for a fresh team, signed by a key nobody pinned and wrapping a key for this desk,"
      + " does not receive the desk's own file of the edition team A sealed: " + said(wX) + ", the share's file sealed for team "
      + who(eX.team) + ", the fresh team's key opens it " + (openedBy(eX, KX) ? "yes" : "no"));

    /* The page holds team B's edition of the id while the folder is moved, in the same run, to team A's share. */
    const move = dir => {
      const e = P.envelope();
      e.keys = Object.assign({}, e.keys, { eCatalogFolder: dir });
      fs.writeFileSync(path.join(P.ud, "desk.json"), JSON.stringify(e), "utf8");
      P.ipc("etiuda:desk");
    };
    move(OTHER);
    const bEdition = grownFrom(await read(P, "sales.ec"), me9, "lamps");
    move(OWN);
    const wB = await P.ask("etiuda:branch-write", bEdition.stem,
      JSON.stringify(Object.assign(JSON.parse(bEdition.text), { name: "Other Shop, edited" })));
    const eB = landed();
    check(JSON.parse(bEdition.text).grew.id === "lamp-shop" && said(wB) === said({ ok: false, held: true })
      && openedBy(eB, K3).indexOf("Other Shop") < 0 && holding("Other Shop") === 0,
      "14ah a desk holding team B's edition of an id team A also covers, its folder moved to team A's share in the same run,"
      + " does not seal B's catalog for team A: " + said(wB) + ", team A's key opens B's text in the share's file "
      + (openedBy(eB, K3).indexOf("Other Shop") >= 0 ? "yes" : "no"));

    /* The same signed edition in the folder twice, sealed for team A and for a team planted beside it. */
    put(OWN, "etiuda-team.json", teamX);
    const copyX = path.join(OWN, "lamps-x.ec");
    put(OWN, "lamps-x.ec", seal(KX, 1, A2, TX));
    const lampsAt = fs.statSync(path.join(OWN, "lamps.ec")).mtimeMs;
    const wAX = [];
    for (const s of [-60, 60]) {                 // the listing reads newest first: the copy after team A's, then before it
      fs.utimesSync(copyX, new Date(lampsAt + s * 1000), new Date(lampsAt + s * 1000));
      const Q = loadDesk(P.ud);
      await Q.ask("etiuda:catalog-files");
      wAX.push(await Q.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, beside a copy")));
      Q.close();
    }
    const eAX = landed();
    fs.unlinkSync(copyX);
    restoreA();
    check(wAX.every(r => said(r) === said({ ok: false, held: true }) || r.ok === true) && eAX.team === TEAM && openedBy(eAX, KX) === "",
      "14ai one signed edition opened from envelopes of two teams seals the desk's own file for neither, whichever is listed"
      + " first, even where the second team's file stands at the folder: " + wAX.map(said).join(", ")
      + ", the share's file sealed for team " + who(eAX.team));
  }

  /* ---- the lead hands the team to a new key: a statement signed by the pinned key, in the team file ---------------
     The statement's bytes are made here from the engine's own v2SignedBytes behind the handover prefix, not by the shell. */
  {
    const TR = "t-" + crypto.randomBytes(8).toString("hex");
    const ROT = folder("rotate"), R = newDesk("rotate", ROT, null, null, TR), meR = await R.ask("etiuda:branch-identity", true);
    const KR = [0, 1, 2, 3, 4, 5].map(() => crypto.randomBytes(32));
    const keys = [lead, 2, 3, 4, 5].map(k => (k === lead ? lead : crypto.generateKeyPairSync("ed25519")));
    const L = keys.map((k, i) => ({ keyId: "lead-" + i, public: pubHex(k.publicKey) }));
    L[0] = LEAD;
    const handover = (from, i, to, o) => {
      const s = { format: 1, kind: "etiuda-team-handover", team: (o && o.team) || TR, from: L[from], to: L[to], sig: { alg: "Ed25519", keyId: L[from].keyId } };
      s.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(V2.v2SignedBytes(s))]),
        keys[i].privateKey).toString("hex");
      return s;
    };
    const ledBy = (i, epoch, ho) => JSON.stringify(teamFile({ team: TR, catalogs: ["lamp-shop"], keyId: L[i].keyId, public: L[i].public,
      signer: keys[i].privateKey, epoch: epoch, roster: [entry(meR, KR[epoch], epoch, TR)], handover: ho }));
    const pinOf = D => JSON.stringify((D.envelope().teamPins || {})[TR] || null);
    const opens = async epoch => { put(ROT, "lamps.ec", seal(KR[epoch], epoch, A2At(epoch), TR)); return (await read(R, "lamps.ec")) === A2At(epoch).trim(); };
    put(ROT, "etiuda-team.json", ledBy(0, 1));
    const first = await opens(1) && pinOf(R) === JSON.stringify(LEAD);

    put(ROT, "etiuda-team.json", ledBy(1, 2, [handover(0, 0, 1)]));
    const moved = await opens(2), pin1 = pinOf(R), fresh1 = pinOf(loadDesk(R.ud));
    check(first && moved && pin1 === JSON.stringify(L[1]) && fresh1 === pin1 && epochs(R, TR) === "1,2"
      && R.said.some(l => l.indexOf("hands team " + TR) >= 0),
      "14ak a team file under a new key, carrying a handover the pinned lead's key signed naming that key, moves the pin to it:"
      + " the new epoch's envelope opens " + (moved ? "yes" : "no") + ", the pin is the new key " + (pin1 === JSON.stringify(L[1]) ? "yes" : "no")
      + " and stays so in a fresh run, epochs kept " + epochs(R, TR));

    put(ROT, "etiuda-team.json", ledBy(0, 3));
    check(!(await opens(3)) && pinOf(R) === JSON.stringify(L[1]) && epochs(R, TR) === "1,2",
      "14al after the handover, a file under the old lead's key is refused like any other key: epoch 3 kept "
      + (epochs(R, TR).indexOf("3") >= 0 ? "yes" : "no") + ", the pin still the new key");

    const tampered = handover(1, 1, 2);
    tampered.to = L[3];
    const refused = [
      ["no handover", ledBy(2, 3)],
      ["signed by the new key itself", ledBy(2, 3, [handover(1, 2, 2)])],
      ["another team's handover", ledBy(2, 3, [handover(1, 1, 2, { team: TEAM })])],
      ["a handover to a key other than the file's lead", ledBy(2, 3, [handover(1, 1, 3)])],
      ["a handover changed after signing", ledBy(3, 3, [tampered])],
      ["a handover from a key this desk never pinned", ledBy(2, 3, [handover(0, 0, 2)])],
      /* The genuine handover to key 2, under a lead that keeps key 2's label over key 3's public half and signs with
         key 3: refused only where the chain's end is compared by its public half as well as its label. */
      ["a lead with the handed-to key's label over another key", JSON.stringify(teamFile({ team: TR, catalogs: ["lamp-shop"],
        keyId: L[2].keyId, public: L[3].public, signer: keys[3].privateKey, epoch: 3, roster: [entry(meR, KR[3], 3, TR)],
        handover: [handover(1, 1, 2)] }))],
    ];
    const kept = [];
    for (const [why, file] of refused) {
      put(ROT, "etiuda-team.json", file);
      kept.push(why + ": " + ((await opens(3)) || pinOf(R) !== JSON.stringify(L[1]) || epochs(R, TR) !== "1,2" ? "taken" : "refused"));
    }
    check(kept.every(s => /refused$/.test(s)),
      "14am a team file under another key whose handover is missing, self-signed, another team's, to another key, altered,"
      + " from a key the desk does not trust, or to a lead wearing the new key's label over another key moves nothing and keeps nothing: " + kept.join("; "));

    put(ROT, "etiuda-team.json", ledBy(4, 4, [handover(2, 2, 3), handover(3, 3, 4), handover(1, 1, 2)]));
    const chained = await opens(4);
    check(chained && pinOf(R) === JSON.stringify(L[4]) && epochs(R, TR) === "1,2,4",
      "14an a desk that missed a handover follows the chain from the key it pinned, in any order in the file, to the file's"
      + " lead: opens " + (chained ? "yes" : "no") + ", the pin the last key " + (pinOf(R) === JSON.stringify(L[4]) ? "yes" : "no")
      + ", epochs kept " + epochs(R, TR));
  }

  /* ---- a lead key in two hands: a desk never follows a stolen key into a fork, and says when it sees one ------------
     A genuine handover from a key that had already handed the team on, or two genuine successors of the pinned key in one
     look, proves that key is in someone else's hands. The legs run whole on the product, and each plant on a copy of
     shell/main.js or shell/folder/syncer.cjs with its guarding line removed; neither product file is ever written. */
  {
    const FORK_LATER = "Someone has used this team's old lead key to hand the team to another key as well";
    const FORK_TWO = "This team's lead key was handed to two different new keys at once";
    let forkN = 0;
    /* A folder team led by key 0, a desk admitted to it under that key, and keys 1 to 3. `plant` is {src} or {syncer}. */
    async function forkWorld(plant) {
      const n = "fork-" + (++forkN);
      /* The team and its first lead are made first: a desk on a relay team pins its lead from the start, by its invitation. */
      const T = "t-" + crypto.randomBytes(8).toString("hex"), KT = [0, 1, 2, 3, 4].map(() => crypto.randomBytes(32));
      const keys = [0, 1, 2, 3].map(() => crypto.generateKeyPairSync("ed25519")), stranger = crypto.generateKeyPairSync("ed25519");
      const L = keys.map((k, i) => ({ keyId: n + "-lead-" + i, public: pubHex(k.publicKey) }));
      const FD = folder(n), D = newDesk(n, FD, null, plant, T, L[0]), me = await D.ask("etiuda:branch-identity", true);
      const step = (from, to, signer) => {
        const s = { format: 1, kind: "etiuda-team-handover", team: T, from: L[from], to: L[to], sig: { alg: "Ed25519", keyId: L[from].keyId } };
        s.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(V2.v2SignedBytes(s))]),
          (signer || keys[from]).privateKey).toString("hex");
        return s;
      };
      const w = { n, FD, D, me, T, KT, L, plant,
        step: (from, to) => step(from, to),
        forged: (from, to) => step(from, to, stranger),
        led: (i, epoch, ho) => JSON.stringify(teamFile({ team: T, catalogs: ["lamp-shop"], keyId: L[i].keyId, public: L[i].public,
          signer: keys[i].privateKey, epoch: epoch, roster: [entry(me, KT[epoch], epoch, T)], handover: ho })) };
      w.pin = () => (((w.D.envelope().teamPins || {})[T]) || {}).public;
      w.opens = async epoch => { put(FD, "lamps.ec", seal(KT[epoch], epoch, A2At(epoch), T)); return (await read(w.D, "lamps.ec")) === A2At(epoch).trim(); };
      w.row = async () => ((((await w.D.ask("etiuda:team-join", "leads")) || {}).leads) || []).find(l => l.team === T) || null;
      w.said = s => w.D.said.filter(l => l.indexOf(s) >= 0).length;
      /* Both files written before one sync, as a share's sync tool lands a conflict sibling beside the file. */
      w.both = (a, b) => {
        for (const [name, t] of [["etiuda-team.json", a], ["etiuda-team (1).json", b]]) {
          clock += 1000;
          fs.writeFileSync(path.join(FD, name), t, "utf8");
          fs.utimesSync(path.join(FD, name), clock / 1000, clock / 1000);
        }
        syncFolder(FD);
      };
      /* The desk's shell started afresh over its own record; the syncer of the run before goes with it. */
      w.restart = () => {
        w.D.close();
        w.D = loadDesk(w.D.ud, null, plant);
        return w.D;
      };
      put(FD, "etiuda-team.json", w.led(0, 1));
      w.admitted = await w.opens(1) && w.pin() === L[0].public;
      return w;
    }
    /* One after the other: the desk follows key 0 to key 1, then the share's file hands key 0 to key 2. After a restart the
       same file is put back, then key 0 is handed to key 3. */
    async function laterScene(plant) {
      const w = await forkWorld(plant);
      put(w.FD, "etiuda-team.json", w.led(1, 2, [w.step(0, 1)]));
      const followed = await w.opens(2) && w.pin() === w.L[1].public;
      put(w.FD, "etiuda-team.json", w.led(2, 3, [w.step(0, 2)]));
      const k2Opens = await w.opens(3), pinAfter = w.pin(), saidFirst = w.said(FORK_LATER), rowFirst = await w.row();
      put(w.FD, "etiuda-team.json", w.led(2, 3, [w.step(0, 2)]));
      await read(w.D, "lamps.ec");
      const saidAgain = w.said(FORK_LATER);
      w.restart();
      put(w.FD, "etiuda-team.json", w.led(2, 3, [w.step(0, 2)]));
      await read(w.D, "lamps.ec");
      const saidRestart = w.said(FORK_LATER), rowRestart = await w.row();
      put(w.FD, "etiuda-team.json", w.led(3, 3, [w.step(0, 3)]));
      await read(w.D, "lamps.ec");
      const saidNew = w.said(FORK_LATER), pinEnd = w.pin();
      return { w, followed, k2Opens, pinAfter, saidFirst, rowFirst, saidAgain, saidRestart, rowRestart, saidNew, pinEnd };
    }
    /* Two at once: the share's file and a conflict sibling hand key 0 to key 1 and to key 2 in one sync. The sibling then
       goes, and the desk follows the one file left. */
    async function twoScene(plant) {
      const w = await forkWorld(plant);
      w.both(w.led(1, 2, [w.step(0, 1)]), w.led(2, 2, [w.step(0, 2)]));
      const opened = await w.opens(2), pinAfter = w.pin(), said = w.said(FORK_TWO), row = await w.row();
      /* What the syncer keeps of the share for the shell to read: the team file it had, and no sibling. */
      const mdir = relayMirrorOf(w.D.ud, w.T), mt = JSON.parse(fs.readFileSync(path.join(mdir, "etiuda-team.json"), "utf8"));
      const mirrorTeam = mt.lead.keyId + ":" + mt.epoch + (fs.existsSync(path.join(mdir, "etiuda-team (1).json")) ? " and a sibling" : "");
      fs.unlinkSync(path.join(w.FD, "etiuda-team (1).json"));
      syncFolder(w.FD);
      const resolved = await w.opens(2) && w.pin() === w.L[1].public;
      return { w, opened, pinAfter, said, row, mirrorTeam, resolved };
    }

    const ls = await laterScene(null);
    /* RETIRED, P4 (no folder is read as a team): the row's fork notice (a key's handover seen twice, or a later one) was raised by the folder's own reading of a team file; a team file read from a relay's mirror raises it through the relay channel (tests/relay-channel.mjs), and the shell's heed no longer gives the row the fork. It said what its sentence below says. */
    retire(ls.w.admitted && ls.followed && !ls.k2Opens && ls.pinAfter === ls.w.L[1].public && ls.saidFirst === 1
      && !!ls.rowFirst && !!ls.rowFirst.fork && ls.rowFirst.fork.kind === "later" && ls.rowFirst.fork.seen === false
      && ls.saidAgain === 1 && ls.saidRestart === 0 && !!ls.rowRestart && !!ls.rowRestart.fork && ls.saidNew === 1 && ls.pinEnd === ls.w.L[1].public,
      "14bm a desk that followed key 0 to key 1 and then sees a genuine handover of key 0 to key 2 stays on key 1, says so once and"
      + " gives the team's row the fork for its notice, says nothing more at the next look or after a restart, and says a later"
      + " handover of key 0 to key 3 as a fork of its own: followed " + ls.followed + ", key 2's epoch opens " + ls.k2Opens
      + ", pin key 1 " + (ls.pinAfter === ls.w.L[1].public) + ", said " + ls.saidFirst + " then " + ls.saidAgain + ", after the restart "
      + ls.saidRestart + ", key 3 " + ls.saidNew + ", row " + JSON.stringify(ls.rowFirst && ls.rowFirst.fork));

    const ts = await twoScene(null);
    /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
    retire(ts.w.admitted && !ts.opened && ts.pinAfter === ts.w.L[0].public && ts.mirrorTeam === ts.w.L[0].keyId + ":1" && ts.said === 1
      && !!ts.row && !!ts.row.fork && ts.row.fork.kind === "two" && ts.resolved,
      "14bn a desk pinned to key 0 whose share holds the team file and a conflict sibling handing key 0 to key 1 and to key 2"
      + " follows neither and keeps what it has, says so once with the fork on the team's row, and follows the one file left"
      + " once the sibling goes: epoch 2 opens " + ts.opened + ", pin key 0 " + (ts.pinAfter === ts.w.L[0].public)
      + ", the syncer's copy " + ts.mirrorTeam + ", said " + ts.said + ", row " + JSON.stringify(ts.row && ts.row.fork) + ", followed afterwards " + ts.resolved);

    /* A forged second successor: key 0's step to key 2 signed by a stranger, after the handover and beside it. */
    const fa = await forkWorld(null);
    put(fa.FD, "etiuda-team.json", fa.led(1, 2, [fa.step(0, 1)]));
    const faFollowed = await fa.opens(2);
    put(fa.FD, "etiuda-team.json", fa.led(2, 3, [fa.forged(0, 2)]));
    const faOpens = await fa.opens(3), faRow = await fa.row();
    /* 14bo, moved. It also said: and beside the genuine file in one sync (a conflict sibling) the desk follows key 1 and says nothing. No sibling is a
       team file now, so that half is gone with the siblings; the half after the handover stays. */
    check(faFollowed && !faOpens && fa.pin() === fa.L[1].public && fa.said(FORK_LATER) + fa.said(FORK_TWO) === 0 && !!faRow && !faRow.fork,
      "14bo a second successor whose step key 0 did not sign shows no fork: after the handover its file is refused as before and"
      + " nothing is said (epoch 3 opens " + faOpens + ", row fork " + !!(faRow && faRow.fork) + ")");

    /* The shell's own look, where a team file is read from the folder itself: both successors written beside each other in
       the folder the shell reads, past the syncer. */
    async function heedScene(plant) {
      const w = await forkWorld(plant);
      const mirror = relayMirrorOf(w.D.ud, w.T);
      fs.writeFileSync(path.join(mirror, "etiuda-team.json"), w.led(1, 2, [w.step(0, 1)]), "utf8");
      fs.writeFileSync(path.join(mirror, "etiuda-team (1).json"), w.led(2, 2, [w.step(0, 2)]), "utf8");
      await read(w.D, "lamps.ec");
      return { w, pin: w.pin(), said: w.said(FORK_TWO), row: await w.row() };
    }
    const hs = await heedScene(null);
    /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
    retire(hs.w.admitted && hs.pin === hs.w.L[0].public && hs.said === 1 && !!hs.row && !!hs.row.fork && hs.row.fork.kind === "two",
      "14bp the shell reading the team file and a conflict sibling that hand key 0 to two keys follows neither and says so, so a"
      + " folder read without the syncer holds the same rule: pin key 0 " + (hs.pin === hs.w.L[0].public) + ", said " + hs.said
      + ", row " + JSON.stringify(hs.row && hs.row.fork));

    /* One genuine handover, stored as the conflict sibling, the canonical file still the old lead's. */
    async function handoverSibling(plant) {
      const w = await forkWorld(plant);
      w.both(w.led(0, 1), w.led(1, 2, [w.step(0, 1)]));
      const opened = await w.opens(2);
      const canon = JSON.parse(fs.readFileSync(path.join(w.FD, "etiuda-team.json"), "utf8"));
      const sib = JSON.parse(fs.readFileSync(path.join(w.FD, "etiuda-team (1).json"), "utf8"));
      return { w, opened, pin: w.pin(), two: w.said(FORK_TWO), row: await w.row(),
        canonLead: canon.lead && canon.lead.public, sibLead: sib.lead && sib.lead.public };
    }
    const ho = await handoverSibling(null);
    /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
    retire(ho.w.admitted && ho.canonLead === ho.w.L[0].public && ho.sibLead === ho.w.L[1].public
      && ho.opened && ho.pin === ho.w.L[1].public && ho.two === 0,
      "14ca a handover in the conflict sibling, the canonical file still the old lead's, and the desk follows: "
      + "canonical the old lead " + (ho.canonLead === ho.w.L[0].public) + ", sibling the new lead " + (ho.sibLead === ho.w.L[1].public)
      + ", epoch 2 opens " + ho.opened + ", pin the new lead " + (ho.pin === ho.w.L[1].public) + ", said two " + ho.two);

    /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
    retire(hs.w.admitted && hs.pin === hs.w.L[0].public && hs.said === 1 && !!hs.row && !!hs.row.fork && hs.row.fork.kind === "two",
      "14cb THE CONTROL: two successors, the canonical file and a conflict sibling, are still refused as two and the pin stays"
      + " the old lead: pin key 0 " + (hs.pin === hs.w.L[0].public) + ", said " + hs.said
      + ", row " + JSON.stringify(hs.row && hs.row.fork));

    /* Canonical stays under key 0; sibling hands key 0 to key 1, then sibling alone moves to key 1 with no step from
       key 0, and then hands key 1 to key 2 with the one step key 1 to key 2. */
    async function pinnedSibling(plant) {
      const w = await forkWorld(plant);
      w.both(w.led(0, 1), w.led(1, 2, [w.step(0, 1)]));
      const firstOpens = await w.opens(2), pin1 = w.pin();
      put(w.FD, "etiuda-team (1).json", w.led(1, 3));
      const sibL1Opens = await w.opens(3), pin1Stay = w.pin();
      put(w.FD, "etiuda-team (1).json", w.led(2, 4, [w.step(1, 2)]));
      const sibL2Opens = await w.opens(4), pin2 = w.pin();
      const canon = JSON.parse(fs.readFileSync(path.join(w.FD, "etiuda-team.json"), "utf8"));
      return { w, firstOpens, pin1, sibL1Opens, pin1Stay, sibL2Opens, pin2,
        two: w.said(FORK_TWO), later: w.said(FORK_LATER), canonLead: canon.lead && canon.lead.public };
    }
    const ps = await pinnedSibling(null);
    /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
    retire(ps.w.admitted && ps.firstOpens && ps.pin1 === ps.w.L[1].public
      && ps.canonLead === ps.w.L[0].public
      && ps.sibL1Opens && ps.pin1Stay === ps.w.L[1].public
      && ps.sibL2Opens && ps.pin2 === ps.w.L[2].public
      && ps.two === 0 && ps.later === 0,
      "14cf after a sibling handover L0 to L1 with canonical still L0, the desk reads a sibling by L1 with no step from L0"
      + " and then a sibling handing L1 to L2: canonical L0 " + (ps.canonLead === ps.w.L[0].public)
      + ", L1 opens " + ps.sibL1Opens + ", L2 opens " + ps.sibL2Opens + ", pin L2 " + (ps.pin2 === ps.w.L[2].public)
      + ", fork two " + ps.two + " later " + ps.later);

    /* Nothing is loosened: under a pinned L1 with canonical still L0, a sibling under an untrusted lead, a sibling not
       ahead, an altered sibling, and a sibling of another pinned team's id stay refused. */
    /* 14cg and 14ci (and the conflict-sibling fixtures round them) are RETIRED with the conflict sibling of the team file: see the retired checks above. */
    if (!RETIRED_SIBLING_TEAM_FILES) {
      const rw = await forkWorld(null);
      rw.both(rw.led(0, 1), rw.led(1, 2, [rw.step(0, 1)]));
      const rwPin1 = await rw.opens(2) && rw.pin() === rw.L[1].public;
      const rwMirror = relayMirrorOf(rw.D.ud, rw.T);
      const putMirror = (dir, name, txt) => {
        clock += 1000;
        const p = path.join(dir, name);
        fs.writeFileSync(p, txt, "utf8");
        try { fs.utimesSync(p, clock / 1000, clock / 1000); } catch {}
      };
      put(rw.FD, "etiuda-team (1).json", rw.led(3, 3));
      putMirror(rwMirror, "etiuda-team (1).json", rw.led(3, 3));
      const untrustedOpens = await rw.opens(3), untrustedPinOk = rw.pin() === rw.L[1].public;
      putMirror(rwMirror, "etiuda-team.json", rw.led(0, 3));
      putMirror(rwMirror, "etiuda-team (1).json", rw.led(1, 3));
      const equalOpens = await rw.opens(3);
      putMirror(rwMirror, "etiuda-team.json", rw.led(0, 4));
      putMirror(rwMirror, "etiuda-team (1).json", rw.led(1, 3));
      const lowerOpens = await rw.opens(3);
      putMirror(rwMirror, "etiuda-team.json", rw.led(0, 1));
      const badSib = JSON.parse(rw.led(1, 3));
      badSib.sig.value = badSib.sig.value.slice(0, -1) + (badSib.sig.value.endsWith("0") ? "1" : "0");
      putMirror(rwMirror, "etiuda-team (1).json", JSON.stringify(badSib));
      const badSibOpens = await rw.opens(3);

      const T_oth = "t-ff" + crypto.randomBytes(7).toString("hex");
      const FD_oth = folder("sib-other-team"), FD_main = folder("sib-main-team");
      const D_oth = newDesk("sib-other", FD_oth);
      const me_oth = await D_oth.ask("etiuda:branch-identity", true);
      const KO1 = crypto.randomBytes(32), KO2 = crypto.randomBytes(32), KM1 = crypto.randomBytes(32);
      put(FD_oth, "etiuda-team.json", JSON.stringify(teamFile({ team: T_oth, epoch: 1, roster: [entry(me_oth, KO1, 1, T_oth)] })));
      put(FD_oth, "lamps.ec", seal(KO1, 1, A2At(1), T_oth));
      const othPinned = (await read(D_oth, "lamps.ec")) === A2At(1).trim();
      D_oth.close();
      const envOth = JSON.parse(fs.readFileSync(path.join(D_oth.ud, "desk.json"), "utf8"));
      envOth.keys.eCatalogFolder = FD_main;
      fs.writeFileSync(path.join(D_oth.ud, "desk.json"), JSON.stringify(envOth), "utf8");
      const kMain = crypto.generateKeyPairSync("ed25519");
      const LMain = { keyId: "other-main-0", public: pubHex(kMain.publicKey) };
      const T_main = "t-00" + crypto.randomBytes(7).toString("hex");
      put(FD_main, "etiuda-team.json", JSON.stringify(teamFile({ team: T_main, keyId: LMain.keyId, public: LMain.public,
        signer: kMain.privateKey, epoch: 1, roster: [entry(me_oth, KM1, 1, T_main)] })));
      put(FD_main, "lamps.ec", seal(KM1, 1, A2At(1), T_main));
      const D_oth2 = loadDesk(D_oth.ud);
      syncFolder(FD_main);
      const mainPinned = (await read(D_oth2, "lamps.ec")) === A2At(1).trim();
      const othMirror = relayMirrorOf(D_oth2.ud, T_main);
      putMirror(othMirror, "etiuda-team (1).json", JSON.stringify(teamFile({ team: T_oth, epoch: 2, roster: [entry(me_oth, KO2, 2, T_oth)] })));
      put(FD_main, "lamps.ec", seal(KO2, 2, A2At(2), T_oth));
      const otherTeamOpens = (await read(D_oth2, "lamps.ec")) === A2At(2).trim();
      D_oth2.close();
      /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
      retire(rwPin1 && !untrustedOpens && untrustedPinOk && !equalOpens && !lowerOpens && !badSibOpens
        && othPinned && mainPinned && !otherTeamOpens,
        "14cg nothing is loosened for a conflict sibling under a pinned lead: untrusted opens " + untrustedOpens
        + ", equal rank opens " + equalOpens + ", lower epoch opens " + lowerOpens
        + ", altered signature opens " + badSibOpens + ", other pinned team opens " + otherTeamOpens);

      /* A desk with no pin yet behaves as today: refuses an L1 sibling without a step from L0, follows one with it. */
      const FD_np = folder("sib-nopin"), D_np = newDesk("sib-nopin", FD_np);
      const me_np = await D_np.ask("etiuda:branch-identity", true);
      const kn0 = crypto.generateKeyPairSync("ed25519"), kn1 = crypto.generateKeyPairSync("ed25519");
      const LN0 = { keyId: "np-lead-0", public: pubHex(kn0.publicKey) };
      const LN1 = { keyId: "np-lead-1", public: pubHex(kn1.publicKey) };
      const T_np = "t-" + crypto.randomBytes(8).toString("hex"), KN2 = crypto.randomBytes(32);
      const npCanon = JSON.stringify(teamFile({ team: T_np, keyId: LN0.keyId, public: LN0.public, signer: kn0.privateKey, epoch: 1, roster: [] }));
      const npSibNoStep = JSON.stringify(teamFile({ team: T_np, keyId: LN1.keyId, public: LN1.public, signer: kn1.privateKey,
        epoch: 2, roster: [entry(me_np, KN2, 2, T_np)] }));
      const npStep = { format: 1, kind: "etiuda-team-handover", team: T_np, from: LN0, to: LN1, sig: { alg: "Ed25519", keyId: LN0.keyId } };
      npStep.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(V2.v2SignedBytes(npStep))]), kn0.privateKey).toString("hex");
      const npSibWithStep = JSON.stringify(teamFile({ team: T_np, keyId: LN1.keyId, public: LN1.public, signer: kn1.privateKey,
        epoch: 2, roster: [entry(me_np, KN2, 2, T_np)], handover: [npStep] }));
      put(FD_np, "etiuda-team.json", npCanon);
      put(FD_np, "etiuda-team (1).json", npSibNoStep);
      putMirror(relayMirrorOf(D_np.ud, T_np), "etiuda-team (1).json", npSibNoStep);
      put(FD_np, "lamps.ec", seal(KN2, 2, A2At(2), T_np));
      const noPinRefused = (await read(D_np, "lamps.ec")) !== A2At(2).trim() && !((D_np.envelope().teamPins || {})[T_np]);
      put(FD_np, "etiuda-team (1).json", npSibWithStep);
      const noPinFollowed = (await read(D_np, "lamps.ec")) === A2At(2).trim()
        && ((D_np.envelope().teamPins || {})[T_np] || {}).public === LN1.public;
      D_np.close();
      /* RETIRED, P4 (no folder is read as a team): a conflict sibling of the team file was the file a sync tool made of one it could not reconcile, and the desk heeded the genuine one at a higher epoch or rev; a team file arrives over the relay, which makes none, so no sibling is a team file (tests/sync-conflict.mjs f3i, f3m and f4b hold that). It said what its sentence below says. */
      retire(noPinRefused && noPinFollowed,
        "14ci a desk with no pin yet still refuses a sibling without a step from canonical and follows one with it: refused "
        + noPinRefused + ", followed " + noPinFollowed);
    }

    /* The agent dismisses the notice: the shell keeps it, a restart included, for that fork only. */
    const dz = await laterScene(null);
    await dz.w.D.ask("etiuda:team-join", "fork-seen", dz.w.T);
    const dzRow = await dz.w.row();
    dz.w.restart();
    await read(dz.w.D, "lamps.ec");
    const dzFresh = await dz.w.row();
    /* RETIRED, P4 (no folder is read as a team): the row's fork notice (a key's handover seen twice, or a later one) was raised by the folder's own reading of a team file; a team file read from a relay's mirror raises it through the relay channel (tests/relay-channel.mjs), and the shell's heed no longer gives the row the fork. It said what its sentence below says. */
    retire(!!dzRow && !!dzRow.fork && dzRow.fork.seen === true && !!dzFresh && !!dzFresh.fork && dzFresh.fork.seen === true,
      "14bq a dismissed fork notice stays dismissed for that fork, a restart included: seen " + (dzRow && dzRow.fork && dzRow.fork.seen)
      + ", after the restart " + (dzFresh && dzFresh.fork && dzFresh.fork.seen));

    /* The page: the team's notice in the copywriter's words, English for one fork and Polish for the other, and its
       dismissal sent to the shell. A DOM as much as a lasting notice touches, as tests/relay-channel.mjs 978 draws it. */
    {
      const nodes = new Map();
      const mk = tag => ({ tag, id: "", className: "", textContent: "", type: "", children: [], attrs: {}, style: {}, parent: null, onclick: null,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parent = this; this.children.push(c); if (c.id) nodes.set(c.id, c); return c; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); if (this.id && nodes.get(this.id) === this) nodes.delete(this.id); this.parent = null; },
        get firstChild() { return this.children[0] || null; } });
      const textOf = e => (e.textContent || "") + (e.children || []).map(textOf).join("");
      const pause = ms => new Promise(r => setTimeout(r, ms));
      const was = { document: globalThis.document, host: window.E_HOST, add: globalThis.addEventListener, remove: globalThis.removeEventListener };
      const asked = [];
      let shown = { en: "", pl: "" }, dismissed = false, seenAfter = null;
      try {
        const pl = await laterScene(null), pt = await twoScene(null);
        let deskNow = pl, took = null;
        globalThis.document = { body: mk("body"), documentElement: mk("html"), createElement: mk,
          createTextNode: s => ({ textContent: String(s), children: [] }), getElementById: id => nodes.get(id) || null,
          querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        window.E_HOST = { teamJoin: (...a) => { asked.push(a[0]); return deskNow.w.D.ask("etiuda:team-join", ...a); }, onTeamJoin: fn => { took = fn; } };
        const HK = await import(MOD("hooks.js"));
        HK.hooks.render = () => {};
        const ST = await import(MOD("storage.js")), TJ = await import(MOD("team-join.js"));
        const notice = () => { const n = nodes.get("eTeamFork"); return n && n.children[0] ? textOf(n.children[0]) : ""; };
        ST.lsSet("eUiLang", "en");
        TJ.wireTeamJoin();
        await pause(30);
        shown.en = notice();
        deskNow = pt;
        ST.lsSet("eUiLang", "pl");
        took(await pt.w.D.ask("etiuda:team-join", "state"));
        await pause(30);
        shown.pl = notice();
        ST.lsSet("eUiLang", "en");
        const buttons = [];
        (function walk(e) { if (e.tag === "button") buttons.push(e); for (const c of e.children || []) walk(c); })(nodes.get("eTeamFork") || { children: [] });
        if (buttons.length) { buttons[buttons.length - 1].onclick(); dismissed = true; }
        await pause(30);
        const r = await pt.w.row();
        seenAfter = r && r.fork ? r.fork.seen : null;
      } finally {
        globalThis.document = was.document;
        window.E_HOST = was.host;
        globalThis.addEventListener = was.add;
        globalThis.removeEventListener = was.remove;
      }
      const LATER_EN = "Someone has used this team's old lead key to hand the team to another key as well, so that key is evidently in someone else's hands. This desk stays with the key it already follows, and the catalogs on it stay as they are. Tell the team's lead about it.";
      const TWO_PL = "Klucz lidera tego zespołu przekazano jednocześnie dwóm różnym nowym kluczom, więc stanowisko nie podąża za żadnym z nich. Katalogi na nim zostają bez zmian. Proszę powiedzieć o tym liderowi zespołu.";
      /* RETIRED, P4 (no folder is read as a team): the row's fork notice (a key's handover seen twice, or a later one) was raised by the folder's own reading of a team file; a team file read from a relay's mirror raises it through the relay channel (tests/relay-channel.mjs), and the shell's heed no longer gives the row the fork. It said what its sentence below says. */
      retire(shown.en === LATER_EN && shown.pl === TWO_PL && dismissed && asked.indexOf("fork-seen") >= 0 && seenAfter === true,
        "14by the page shows the fork on the team's lasting notice in the copywriter's words, here one after the other in English and"
        + " two at once in Polish, and a dismissal reaches the shell: English " + JSON.stringify(shown.en) + ", Polish " + JSON.stringify(shown.pl)
        + ", dismissed " + dismissed + ", asked " + asked.filter(a => a === "fork-seen").length + ", seen " + seenAfter);
    }

    /* A dismissed fork stays dismissed. A later fork of the same kind, with its own key, is said.
       The second file lands after a restart, which is when the shell says a new fork of a key it has
       already followed. The page keeps the dismissal in its own memory across that restart. */
    async function dismissedThenLater(TJ) {
      const nodes = new Map();
      const mk = tag => ({ tag, id: "", className: "", textContent: "", type: "", children: [], attrs: {}, style: {}, parent: null, onclick: null,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parent = this; this.children.push(c); if (c.id) nodes.set(c.id, c); return c; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); if (this.id && nodes.get(this.id) === this) nodes.delete(this.id); this.parent = null; },
        get firstChild() { return this.children[0] || null; } });
      const textOf = e => (e.textContent || "") + (e.children || []).map(textOf).join("");
      const pause = ms => new Promise(r => setTimeout(r, ms));
      const hexKey = k => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);
      const was = { document: globalThis.document, host: window.E_HOST, add: globalThis.addEventListener, remove: globalThis.removeEventListener };
      const LATER_EN = "Someone has used this team's old lead key to hand the team to another key as well, so that key is evidently in someone else's hands. This desk stays with the key it already follows, and the catalogs on it stay as they are. Tell the team's lead about it.";
      const out = { firstShown: "", downAfter: true, secondShown: "", seenFirst: null, saidSecond: 0,
        keyFirst: "", keySecond: "", envFirst: "", envSecond: "", secondSeen: null, secondKind: "", LATER_EN, hexKey };
      try {
        const w = await forkWorld(null);
        put(w.FD, "etiuda-team.json", w.led(1, 2, [w.step(0, 1)]));
        const followed = await w.opens(2) && w.pin() === w.L[1].public;
        put(w.FD, "etiuda-team.json", w.led(2, 3, [w.step(0, 2)]));
        await read(w.D, "lamps.ec");
        const rowFirst = await w.row();
        const firstLast = ((w.D.envelope().teamForks || {})[w.T] || {}).last;
        out.envFirst = firstLast && firstLast.key || "";
        out.keyFirst = rowFirst && rowFirst.fork ? rowFirst.fork.key || "" : "";
        let took = null;
        globalThis.document = { body: mk("body"), documentElement: mk("html"), createElement: mk,
          createTextNode: s => ({ textContent: String(s), children: [] }), getElementById: id => nodes.get(id) || null,
          querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        window.E_HOST = { teamJoin: (...a) => w.D.ask("etiuda:team-join", ...a), onTeamJoin: fn => { took = fn; } };
        const HK = await import(MOD("hooks.js"));
        HK.hooks.render = () => {};
        const ST = await import(MOD("storage.js"));
        const page = TJ || await import(MOD("team-join.js"));
        const notice = () => { const n = nodes.get("eTeamFork"); return n && n.children[0] ? textOf(n.children[0]) : ""; };
        ST.lsSet("eUiLang", "en");
        page.wireTeamJoin();
        await pause(30);
        out.firstShown = followed && notice() === LATER_EN ? "shown" : notice();
        const buttons = [];
        (function walk(e) { if (e.tag === "button") buttons.push(e); for (const c of e.children || []) walk(c); })(nodes.get("eTeamFork") || { children: [] });
        if (buttons.length) buttons[buttons.length - 1].onclick();
        await pause(30);
        const rowDismissed = await w.row();
        out.seenFirst = rowDismissed && rowDismissed.fork ? rowDismissed.fork.seen : null;
        out.downAfter = !nodes.get("eTeamFork");
        w.restart();
        put(w.FD, "etiuda-team.json", w.led(3, 3, [w.step(0, 3)]));
        await read(w.D, "lamps.ec");
        out.saidSecond = w.said(FORK_LATER);
        const rowSecond = await w.row();
        out.keySecond = rowSecond && rowSecond.fork ? rowSecond.fork.key || "" : "";
        out.secondSeen = rowSecond && rowSecond.fork ? rowSecond.fork.seen : null;
        out.secondKind = rowSecond && rowSecond.fork ? rowSecond.fork.kind : "";
        const secondLast = ((w.D.envelope().teamForks || {})[w.T] || {}).last;
        out.envSecond = secondLast && secondLast.key || "";
        if (took) took(await w.D.ask("etiuda:team-join", "state"));
        await pause(30);
        out.secondShown = notice();
      } finally {
        globalThis.document = was.document;
        window.E_HOST = was.host;
        globalThis.addEventListener = was.add;
        globalThis.removeEventListener = was.remove;
      }
      return out;
    }
    {
      const d = await dismissedThenLater(null);
      /* RETIRED, P4 (no folder is read as a team): the row's fork notice (a key's handover seen twice, or a later one) was raised by the folder's own reading of a team file; a team file read from a relay's mirror raises it through the relay channel (tests/relay-channel.mjs), and the shell's heed no longer gives the row the fork. It said what its sentence below says. */
      retire(d.firstShown === "shown" && d.seenFirst === true && d.downAfter && d.saidSecond === 1
        && d.hexKey(d.keyFirst) && d.hexKey(d.keySecond) && d.keyFirst !== d.keySecond && d.secondShown === d.LATER_EN,
        "14cd a dismissed fork stays dismissed, and a second fork with a different key is said: first " + d.firstShown
        + ", seen " + d.seenFirst + ", down " + d.downAfter + ", said after the restart " + d.saidSecond
        + ", row keys differ " + (d.hexKey(d.keyFirst) && d.hexKey(d.keySecond) && d.keyFirst !== d.keySecond)
        + ", envelope keys differ " + (d.hexKey(d.envFirst) && d.hexKey(d.envSecond) && d.envFirst !== d.envSecond)
        + ", second kind " + d.secondKind + " seen " + d.secondSeen
        + ", second " + JSON.stringify(d.secondShown));
    }

    /* The page, for a desk left behind (the test architect's E1 on the lead box): the team's row as the shell gives it
       (tests/relay-channel.mjs 939l drives the shell's half), shown in English, taken down by a view without it, shown again
       in Polish, and dismissed: "stranded-seen" with the team goes to the shell and the notice stays down. The host is a
       stand-in that answers every ask with that view, the row turning seen once "stranded-seen" arrives. */
    {
      const nodes = new Map();
      const mk = tag => ({ tag, id: "", className: "", textContent: "", type: "", children: [], attrs: {}, style: {}, parent: null, onclick: null,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parent = this; this.children.push(c); if (c.id) nodes.set(c.id, c); return c; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); if (this.id && nodes.get(this.id) === this) nodes.delete(this.id); this.parent = null; },
        get firstChild() { return this.children[0] || null; } });
      const textOf = e => (e.textContent || "") + (e.children || []).map(textOf).join("");
      const pause = ms => new Promise(r => setTimeout(r, ms));
      const was = { document: globalThis.document, host: window.E_HOST, add: globalThis.addEventListener, remove: globalThis.removeEventListener };
      const T = "t-" + crypto.randomBytes(4).toString("hex");
      const asked = [];
      let state = "left", took = null;
      const view = () => ({ leads: [Object.assign({ team: T, print: "0123456789abcdef", admitted: true, seen: true, lead: "Ada Quay", folder: "", relay: "relay.test" },
        state === "gone" ? {} : { stranded: { seen: state === "seen" } })] });
      const shown = { en: "", gone: null, pl: "", hidden: null, stays: null };
      try {
        globalThis.document = { body: mk("body"), documentElement: mk("html"), createElement: mk,
          createTextNode: s => ({ textContent: String(s), children: [] }), getElementById: id => nodes.get(id) || null,
          querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        window.E_HOST = { teamJoin: (...a) => { asked.push(a.slice(0, 2)); if (a[0] === "stranded-seen" && a[1] === T) state = "seen"; return Promise.resolve(view()); },
          onTeamJoin: fn => { took = fn; } };
        const HK = await import(MOD("hooks.js"));
        HK.hooks.render = () => {};
        const ST = await import(MOD("storage.js")), TJ = await import(MOD("team-join.js"));
        const notice = () => { const n = nodes.get("eTeamStranded"); return n && n.children[0] ? textOf(n.children[0]) : ""; };
        ST.lsSet("eUiLang", "en");
        TJ.wireTeamJoin();
        await pause(30);
        shown.en = notice();
        state = "gone";
        took(view());
        shown.gone = !nodes.get("eTeamStranded");
        state = "left";
        ST.lsSet("eUiLang", "pl");
        took(view());
        shown.pl = notice();
        ST.lsSet("eUiLang", "en");
        const buttons = [];
        (function walk(e) { if (e.tag === "button") buttons.push(e); for (const c of e.children || []) walk(c); })(nodes.get("eTeamStranded") || { children: [] });
        if (buttons.length) buttons[buttons.length - 1].onclick();
        await pause(30);
        shown.hidden = !nodes.get("eTeamStranded");
        took(view());
        shown.stays = !nodes.get("eTeamStranded");
      } finally {
        globalThis.document = was.document;
        window.E_HOST = was.host;
        globalThis.addEventListener = was.add;
        globalThis.removeEventListener = was.remove;
      }
      const STRANDED_EN = "While this desk was switched off, the team moved to a new key and its keys were secured anew, so this desk cannot open what comes next. It sends nothing new to the team, and everything on this computer stays as it is. To join, a new invitation from the team's lead is needed.";
      const STRANDED_PL = "Gdy to stanowisko było wyłączone, zespół przeszedł pod nowy klucz, a jego klucze zabezpieczono od nowa, więc stanowisko nie otworzy tego, co przychodzi teraz. Nie wysyła niczego nowego do zespołu, a wszystko na tym komputerze zostaje bez zmian. Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.";
      const seenAsks = asked.filter(a => a[0] === "stranded-seen");
      check(shown.en === STRANDED_EN && shown.gone === true && shown.pl === STRANDED_PL && seenAsks.length === 1 && seenAsks[0][1] === T
        && state === "seen" && shown.hidden === true && shown.stays === true,
        "14bz the page shows a desk left behind on the team's lasting notice in the copywriter's words, in English and in Polish, a view"
        + " without it takes it down, and its dismissal sends stranded-seen for the team and keeps it down: English " + JSON.stringify(shown.en)
        + ", without it " + (shown.gone ? "down" : "still up") + ", Polish " + JSON.stringify(shown.pl) + ", asked stranded-seen "
        + seenAsks.length + (seenAsks[0] ? " for " + (seenAsks[0][1] === T ? "the team" : JSON.stringify(seenAsks[0][1])) : "")
        + ", dismissed " + (shown.hidden ? "down" : "still up") + ", after the next view " + (shown.stays ? "down" : "up again"));
    }

    /* The plants: each guarding line removed from a copy, the scene that line guards run on it. */
    const shaOf = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    async function liftDesk(file, tag, fn) {
      const src = path.join(ROOT, "shell", file), digest = shaOf(src);
      let turned = false, detail = "plant line absent";
      try {
        const lines = fs.readFileSync(src, "utf8").split("\n");
        const at = lines.findIndex(l => l.indexOf("plant:" + tag + " ") >= 0 || l.endsWith("plant:" + tag + " */"));
        if (at >= 0) {
          lines.splice(at, 1);
          let plant;
          if (file === "main.js") plant = { src: lines.join("\n") };
          else {
            const dir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
            fs.writeFileSync(path.join(dir, "syncer.cjs"), lines.join("\n"), "utf8");
            plant = { syncer: nodeRequire(path.join(dir, "syncer.cjs")) };
          }
          turned = await fn(plant);
          detail = turned ? "the check lifted" : "the check still held";
        }
      } catch (e) { detail = e && e.stack ? e.stack : String(e); }
      return { turned, back: shaOf(src) === digest, detail };
    }
    const lifts = [
      ["14br", "main.js", "fork-in-desk", "shows no fork, so the desk says nothing of key 0 handed on twice and follows one of two successors",
        async p => { const a = await laterScene(p), b = await heedScene(p); return a.saidFirst === 0 && b.pin !== b.w.L[0].public; }],
      ["14bs", "main.js", "fork-once-desk", "says the same fork again after a restart",
        async p => (await laterScene(p)).saidRestart > 0],
      ["14bt", "main.js", "fork-was", "forgets the keys the desk followed, so after a restart key 0 handed to key 3 is not said",
        async p => (await laterScene(p)).saidNew === 0],
      ["14bu", "main.js", "fork-two-heed", "follows one of two successors the shell reads in its own look",
        async p => { const h = await heedScene(p); return h.pin === h.w.L[1].public; }],
      ["14bv", "main.js", "fork-row", "keeps the fork from the team's row, so the notice never shows",
        async p => { const a = await laterScene(p); return a.saidFirst === 1 && !!a.rowFirst && !a.rowFirst.fork; }],
      /* 14bw RETIRED with 14bq (the row's fork, which a team read from the relay's mirror no longer gets from the shell's heed): it said that lifting
         plant:fork-seen in a scratch copy of shell/main.js forgets the dismissal. */
      ["14bx", "folder/syncer.cjs", "syncer-fork-two", "lets the syncer take one of two successors in one sync into the copy the shell reads",
        async p => { const t = await twoScene(p); return t.mirrorTeam !== t.w.L[0].keyId + ":1"; }],
    ];
    for (const [id, file, tag, what, fn] of lifts) {
      const r = await liftDesk(file, tag, fn);
      check(r.turned && r.back, id + " lifting plant:" + tag + " in shell/" + file + " " + what + ", and the product file is never written: "
        + r.detail + ", sha " + (r.back ? "restored" : "differs"));
    }
    /* A copy of a page module with one plant line taken out, its imports pointed back at the tree. */
    async function plantedPage(file, tag) {
      const at = path.join(ROOT, "src", "modules", file), before = fs.readFileSync(at);
      const lines = before.toString("utf8").split(/\n/);
      const i = lines.findIndex(l => l.indexOf("plant:" + tag) >= 0);
      if (i < 0) return { mod: null, same: fs.readFileSync(at).equals(before), detail: "plant line absent" };
      lines.splice(i, 1);
      const dir = fs.mkdtempSync(path.join(LAB, "plant-" + tag + "-"));
      const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
      fs.writeFileSync(path.join(dir, file), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      return { mod, same: fs.readFileSync(at).equals(before), detail: "loaded" };
    }
    if (PLANTS_OFF) skip("14cc lifting plant:sib-handover in a scratch copy of shell/main.js leaves the desk on the old lead");
    else {
      const r = await liftDesk("main.js", "sib-handover", async p => {
        const h = await handoverSibling(p);
        return h.pin !== h.w.L[1].public;
      });
      check(r.turned && r.back,
        "14cc lifting plant:sib-handover in a scratch copy of shell/main.js leaves the desk on the old lead, and the product file is never written: "
        + r.detail + ", sha " + (r.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("14cj lifting plant:sib-pin in a scratch copy of shell/main.js strands the desk on canonical L0 after L0 to L1");
    else {
      const r = await liftDesk("main.js", "sib-pin", async p => {
        const s = await pinnedSibling(p);
        return s.firstOpens && !s.sibL1Opens && !s.sibL2Opens && s.pin2 !== s.w.L[2].public;
      });
      check(r.turned && r.back,
        "14cj lifting plant:sib-pin in a scratch copy of shell/main.js strands the desk on canonical L0 after L0 to L1, and the product file is never written: "
        + r.detail + ", sha " + (r.back ? "restored" : "differs"));
    }
    if (PLANTS_OFF) skip("14ce lifting plant:fork-note-key in a scratch copy of src/modules/team-join.js leaves the second fork unsaid");
    else {
      const planted = await plantedPage("team-join.js", "fork-note-key");
      let stayed = false;
      if (planted.mod) {
        const d = await dismissedThenLater(planted.mod);
        stayed = d.firstShown === "shown" && d.seenFirst === true && d.downAfter && d.secondShown !== d.LATER_EN;
      }
      check(!!planted.mod && planted.same && stayed,
        "14ce lifting plant:fork-note-key in a scratch copy of src/modules/team-join.js leaves the second fork unsaid, and the product file is never written: "
        + planted.detail + ", sha " + (planted.same ? "restored" : "differs") + ", second stayed down " + stayed);
    }
  }

  /* ---- a keep that fails: safeStorage away for one read, the team file unchanged after it ----------------------- */
  const FLAKY = folder("flaky"), flaky10 = { down: "" }, flaky11 = { down: "" };
  const D10 = newDesk("ten", FLAKY, flaky10, null, TEAM), D11 = newDesk("eleven", FLAKY, flaky11, null, TEAM);
  const me10 = await D10.ask("etiuda:branch-identity", true), me11 = await D11.ask("etiuda:branch-identity", true);
  put(FLAKY, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(me10, K1, 1), entry(me11, K1, 1)] })));
  put(FLAKY, "lamps.ec", seal(K1, 1, A2));
  const shut = t => JSON.parse(t).kind === "etiuda-sealed";
  const retried = [];
  for (const [D, f, how] of [[D10, flaky10, "all"], [D11, flaky11, "seal"]]) {
    f.down = how;
    const away = await read(D, "lamps.ec");
    f.down = "";
    const back = await read(D, "lamps.ec");
    retried.push({ ok: shut(away) && back === A2.trim() && epochs(D) === "1",
      said: how + ": " + (shut(away) ? "shut" : "opened") + " while away, " + (back === A2.trim() ? "opened" : "still shut") + " once back" });
  }
  check(retried.every(r => r.ok),
    "14ab a team key that could not be kept is tried again at the next read, the team file unchanged, whether safeStorage"
    + " could open nothing or seal nothing: " + retried.map(r => r.said).join("; "));

  /* ---- Board 945 item 6: the head and the ring in a folder team's file -------------------------------------- */
  const F6 = folder("folder-f6"), DF6 = newDesk("desk-f6", F6);
  const meF6 = await DF6.ask("etiuda:branch-identity", true);
  const T6 = "t-" + crypto.randomBytes(8).toString("hex");
  const K6 = crypto.randomBytes(32);
  const embeddedRing = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "lamp-shop", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const looseRing = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "tea-room", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };

  // 14bb: folder team with embedded ring in team file, no loose ring file
  put(F6, "etiuda-team.json", JSON.stringify(teamFile({ team: T6, epoch: 1, roster: [entry(meF6, K6, 1, T6)], ring: embeddedRing })));
  put(F6, "lamps.ec", seal(K6, 1, A2, T6));
  await read(DF6, "lamps.ec");
  const ringAsked = await DF6.ask("etiuda:catalog-ring");
  const ringRead = DF6.api.readRing();
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(ringAsked === JSON.stringify(embeddedRing) && JSON.stringify(ringRead) === JSON.stringify(embeddedRing),
    "14bb a folder team file with an embedded ring is read from the team file itself, with no loose etiuda-ring.json: "
    + (ringAsked === JSON.stringify(embeddedRing) ? "embedded" : "missed"));

  // 14bc: folder team file without embedded ring falls back to loose etiuda-ring.json
  const K6_2 = crypto.randomBytes(32);
  put(F6, "etiuda-ring.json", JSON.stringify(looseRing));
  put(F6, "etiuda-team.json", JSON.stringify(teamFile({ team: T6, epoch: 2, roster: [entry(meF6, K6_2, 2, T6)] })));
  put(F6, "lamps.ec", seal(K6_2, 2, A2, T6));
  await read(DF6, "lamps.ec");
  const ringFallback = await DF6.ask("etiuda:catalog-ring");
  check(ringFallback === JSON.stringify(looseRing),
    "14bc a folder team file without an embedded ring falls back to loose etiuda-ring.json: "
    + (ringFallback === JSON.stringify(looseRing) ? "loose" : "missed"));

  // Helper to make signed head. Studio signs a head at the team file's epoch, 2 since 14bc; a head below it is left out (962s5t6).
  const makeHead = (team, editions, t, key, keyId, epoch) => {
    const doc = { v: 1, team: team, epoch: epoch || 2, rev: 1, editions: editions, t: t,
      sig: { alg: "Ed25519", keyId: keyId || LEAD.keyId } };
    const Ch = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
    const bytes = Buffer.concat([Buffer.from("etiuda-relay-head\n", "utf8"), Ch.signedBytes(doc)]);
    doc.sig.value = crypto.sign(null, bytes, key || lead.privateKey).toString("hex");
    return doc;
  };

  // 14bd: newer genuine head shown on folder team in leadsView()
  const headNow = Date.now();
  const freshHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 3, edition: "Lamp Shop v3", published: "2026-02-03" }], headNow);
  put(F6, "etiuda-head.json", JSON.stringify(freshHead));
  const leads1 = await DF6.ask("etiuda:team-join", "leads");
  const row1 = ((leads1 && leads1.leads) || []).find(r => r.team === T6);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(!!row1 && !!row1.head && row1.head.edition === "Lamp Shop v3" && row1.head.published === "2026-02-03" && row1.head.t === headNow,
    "14bd a newer genuine etiuda-head.json on a folder team shows its edition and publish time in leadsView(): "
    + (row1 && row1.head ? row1.head.edition + " / " + row1.head.published : "no head"));

  // 962s5t6: the folder's epoch floor beside 14bd. A genuine, newer head signed at epoch 1, below the team file's epoch 2, shows
  // nothing; lifting plant:folder-head-epoch shows it.
  const lowHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 4, edition: "Lamp Shop v4", published: "2026-02-04" }], headNow + 500, null, null, 1);
  put(F6, "etiuda-head.json", JSON.stringify(lowHead));
  const rowLow = (((await DF6.ask("etiuda:team-join", "leads")) || {}).leads || []).find(r => r.team === T6);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(!!rowLow && !rowLow.head, "962s5t6 a genuine newer head below the folder team file's epoch shows nothing in leadsView(): "
    + (rowLow && rowLow.head ? rowLow.head.edition : "nothing"));
  if (PLANTS_OFF) skip("962s5t7 lifting plant:folder-head-epoch shows the head below the team file's epoch");
  else {
    const lines = SRC.split("\n"), at = lines.findIndex(l => l.indexOf("plant:folder-head-epoch") >= 0);
    let shown = "plant line absent";
    if (at >= 0) {
      lines.splice(at, 1);
      const DP = loadDesk(DF6.ud, null, { src: lines.join("\n") });
      await DP.ask("etiuda:branch-identity", true);
      const rowP = (((await DP.ask("etiuda:team-join", "leads")) || {}).leads || []).find(r => r.team === T6);
      shown = rowP && rowP.head ? rowP.head.edition : "nothing";
    }
    check(shown === "Lamp Shop v4", "962s5t7 lifting plant:folder-head-epoch shows the head below the team file's epoch (FAIL 962s5t6): " + shown);
  }

  // 14bj: forged head shows nothing in leadsView()
  const forgedHead = JSON.parse(JSON.stringify(freshHead));
  forgedHead.sig.value = (forgedHead.sig.value[0] === "a" ? "b" : "a") + forgedHead.sig.value.slice(1);
  put(F6, "etiuda-head.json", JSON.stringify(forgedHead));
  const leadsForged = await DF6.ask("etiuda:team-join", "leads");
  const rowForged = ((leadsForged && leadsForged.leads) || []).find(r => r.team === T6);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(!!rowForged && !rowForged.head,
    "14bj a forged etiuda-head.json on a folder team shows nothing in leadsView(): "
    + (rowForged && !rowForged.head ? "nothing shown" : "showed head"));

  // 14bk: foreign-key head shows nothing in leadsView()
  const foreignHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 3, edition: "Lamp Shop v3", published: "2026-02-03" }], headNow, forger.privateKey, "foreign-key");
  put(F6, "etiuda-head.json", JSON.stringify(foreignHead));
  const leadsForeign = await DF6.ask("etiuda:team-join", "leads");
  const rowForeign = ((leadsForeign && leadsForeign.leads) || []).find(r => r.team === T6);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(!!rowForeign && !rowForeign.head,
    "14bk a foreign-key etiuda-head.json on a folder team shows nothing in leadsView(): "
    + (rowForeign && !rowForeign.head ? "nothing shown" : "showed head"));

  // 14bl: older head (rev below the edition the desk has) shows nothing in leadsView()
  // The desk in F6 has opened lamps.ec (A2, rev 2). A head with rev 1 is older.
  const olderHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 1, edition: "Lamp Shop v1", published: "2026-02-01" }], headNow + 1000);
  put(F6, "etiuda-head.json", JSON.stringify(olderHead));
  const leadsOlder = await DF6.ask("etiuda:team-join", "leads");
  const rowOlder = ((leadsOlder && leadsOlder.leads) || []).find(r => r.team === T6);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(!!rowOlder && !rowOlder.head,
    "14bl an older etiuda-head.json (rev 1 below the desk's rev 2) on a folder team shows nothing in leadsView(): "
    + (rowOlder && !rowOlder.head ? "nothing shown" : "showed head"));

  // 14bh: channel.cjs readRing with folder doc
  const Ch = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
  const chProg = Ch.createProgram({ pin: { teamId: T6, keyId: LEAD.keyId, public: LEAD.public } });
  const folderDocWithRing = teamFile({ team: T6, epoch: 1, roster: [], ring: embeddedRing });
  const folderDocNoRing = teamFile({ team: T6, epoch: 1, roster: [] });
  const chWithRing = chProg.readRing({ teamDoc: folderDocWithRing, looseRing: looseRing });
  const chLoose = chProg.readRing({ teamDoc: folderDocNoRing, looseRing: looseRing });
  const chNone = chProg.readRing({ teamDoc: folderDocNoRing, looseRing: null });
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(chWithRing.source === "team" && JSON.stringify(chWithRing.ring) === JSON.stringify(embeddedRing)
    && chLoose.source === "loose" && JSON.stringify(chLoose.ring) === JSON.stringify(looseRing)
    && chNone.source === "none" && chNone.ring === null,
    "14bh channel.cjs readRing accepts embedded ring in folder teamDoc and falls back to looseRing without one: "
    + chWithRing.source + " / " + chLoose.source + " / " + chNone.source);

  // 14bi: a relay pin still ignores a folder file's ring and never reads the loose file
  const relayRt = crypto.randomBytes(16).toString("hex");
  const relayProg = Ch.createProgram({ pin: { teamId: T6, rt: relayRt, lead: { keyId: LEAD.keyId, public: LEAD.public } } });
  const relayDoc = teamFile({ team: T6, epoch: 1, rev: 1, roster: [], ring: embeddedRing, channel: { kind: "relay", rt: relayRt } });
  const bareRelayDoc = teamFile({ team: T6, epoch: 1, rev: 1, roster: [], channel: { kind: "relay", rt: relayRt } });
  const folderOnRelay = relayProg.readRing({ teamDoc: folderDocWithRing, looseRing: looseRing });
  const ownOnRelay = relayProg.readRing({ teamDoc: relayDoc, looseRing: looseRing });
  const bareOnRelay = relayProg.readRing({ teamDoc: bareRelayDoc, looseRing: looseRing });
  const loadedFolder = relayProg.loadTeamFile(folderDocWithRing);
  /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
  retire(folderOnRelay.source === "loose" && JSON.stringify(folderOnRelay.ring) === JSON.stringify(looseRing)
    && ownOnRelay.source === "team" && JSON.stringify(ownOnRelay.ring) === JSON.stringify(embeddedRing)
    && bareOnRelay.source === "none" && bareOnRelay.ring === null
    && loadedFolder.ok === false && loadedFolder.reason === "wrong-team",
    "14bi a relay pin keeps the relay ring rule: a folder file is the wrong team, the relay file's own ring is read, and a loose ring is not: "
    + folderOnRelay.source + " / " + ownOnRelay.source + " / " + bareOnRelay.source + " / " + (loadedFolder.ok ? "loaded" : loadedFolder.reason));
  /* A folder key that has not arrived yet. The bound is the relay channel's pending retry ceiling, sixty seconds. */
  const WAIT_MS = 60 * 1000;
  const keyMiss = D => D.said.some(l => l.indexOf("holds no key") >= 0);
  const joinNow = D => D.invoke["etiuda:team-join"](eventFor(), "state");
  const quietWin = () => ({ isDestroyed: () => false, webContents: { send: () => {} } });

  /* ---- an edition at the next epoch, before the team file that carries its key -------------------------------- */
  {
    const AHEAD = folder("ahead"), DA = newDesk("ahead", AHEAD, null, null, TEAM), meA = await DA.ask("etiuda:branch-identity", true);
    fs.writeFileSync(path.join(AHEAD, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
    const sentA = [];
    const winA = { isDestroyed: () => false, webContents: { send: (...a) => sentA.push(a) } };
    put(AHEAD, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meA, K1, 1)] })));
    put(AHEAD, "lamps.ec", seal(K1, 1, A2));
    DA.api.catalogChanged(winA);
    const held = DA.api.readCatalog();
    sentA.length = 0;
    DA.said.length = 0;
    put(AHEAD, "lamps.ec", seal(K2, 2, A3));
    DA.api.catalogChanged(winA);
    const quietRead = DA.api.readCatalog();
    const quietJoin = joinNow(DA);
    const quietOffers = sentA.filter(a => a[0] === "etiuda:catalog-file").length;
    const quiet = quietRead === A2.trim() && !(quietJoin && quietJoin.sealed) && !keyMiss(DA) && quietOffers === 0;
    put(AHEAD, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(meA, K2, 2)] })));
    DA.api.catalogChanged(winA);
    const openedNew = DA.api.readCatalog();
    const offers = sentA.filter(a => a[0] === "etiuda:catalog-file");
    /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
    retire(quiet && held === A2.trim() && openedNew === A3.trim() && offers.some(a => a[1] === A3.trim() && a[2] === "lamps.ec")
      && !keyMiss(DA),
      "14be an edition sealed one epoch ahead of the team file keeps the edition in use and says nothing, and opens once"
      + " the file lands: held " + (held === A2.trim() ? "yes" : "no") + ", quiet " + (quiet ? "yes" : "no")
      + ", opened " + (openedNew === A3.trim() ? "yes" : "no") + ", offered "
      + (offers.some(a => a[1] === A3.trim()) ? "yes" : "no"));
  }

  /* ---- the team file never comes: the wait ends in the words a sealed edition already gets -------------------- */
  {
    const LATE = folder("latekey"), DB = newDesk("latekey", LATE, null, null, TEAM), meB = await DB.ask("etiuda:branch-identity", true);
    fs.writeFileSync(path.join(LATE, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
    const winB = quietWin();
    put(LATE, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meB, K1, 1)] })));
    put(LATE, "lamps.ec", seal(K1, 1, A2));
    const realNow = Date.now;
    const t0 = realNow();
    let earlyQuiet = false, midQuiet = false, lateSaid = false, lateFile = "";
    Date.now = () => t0;
    try {
      DB.api.catalogChanged(winB);
      DB.said.length = 0;
      put(LATE, "lamps.ec", seal(K2, 2, A3));
      DB.api.catalogChanged(winB);
      const earlyJoin = joinNow(DB);
      earlyQuiet = DB.api.readCatalog() === A2.trim() && !(earlyJoin && earlyJoin.sealed) && !keyMiss(DB);
      Date.now = () => t0 + WAIT_MS - 1;
      DB.api.catalogChanged(winB);
      const midJoin = joinNow(DB);
      midQuiet = DB.api.readCatalog() === A2.trim() && !(midJoin && midJoin.sealed) && !keyMiss(DB);
      Date.now = () => t0 + WAIT_MS;
      DB.api.catalogChanged(winB);
      const lateJoin = joinNow(DB);
      lateSaid = !!(lateJoin && lateJoin.sealed && lateJoin.sealed.team === TEAM) && keyMiss(DB);
      lateFile = lateJoin && lateJoin.sealed ? lateJoin.sealed.file : "";
    } finally { Date.now = realNow; }
    /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
    retire(earlyQuiet && midQuiet && lateSaid && lateFile === "lamps.ec",
      "14bf a team file that never comes keeps the edition until the wait's last moment and then says this desk holds no"
      + " key, naming the file: quiet before " + (earlyQuiet ? "yes" : "no") + ", at "
      + (WAIT_MS - 1) + " ms " + (midQuiet ? "yes" : "no") + ", at " + WAIT_MS + " ms "
      + (lateSaid ? "said" : "silent") + " for " + (lateFile || "nothing"));
  }

  /* ---- a desk the new epoch's team file has already left off is refused at once, as before -------------------- */
  {
    const GONE = folder("gone"), DG = newDesk("gone", GONE, null, null, TEAM), meG = await DG.ask("etiuda:branch-identity", true);
    fs.writeFileSync(path.join(GONE, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
    const winG = quietWin();
    put(GONE, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meG, K1, 1)] })));
    put(GONE, "old.ec", seal(K1, 1, A2));
    put(GONE, "lamps.ec", seal(K1, 1, A2));
    DG.api.catalogChanged(winG);
    DG.said.length = 0;
    put(GONE, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [] })));
    put(GONE, "lamps.ec", seal(K2, 2, A3));
    DG.api.catalogChanged(winG);
    const view = joinNow(DG);
    const oldOpens = await read(DG, "old.ec");
    const neu = await read(DG, "lamps.ec");
    let neuEpoch = 0, neuKind = "";
    try { const d = JSON.parse(neu); neuKind = d.kind; neuEpoch = d.epoch; } catch { neuKind = "not json"; }
    check(!!(view && view.sealed && view.sealed.file === "lamps.ec" && view.sealed.team === TEAM) && keyMiss(DG)
      && oldOpens === A2.trim() && neuKind === "etiuda-sealed" && neuEpoch === 2,
      "14bg a desk the team file has removed at the new epoch is told at once, and still opens what was sealed while it"
      + " was on the roster: sealed " + (view && view.sealed ? view.sealed.file : "nothing")
      + ", the words " + (keyMiss(DG) ? "said" : "absent") + ", the older edition "
      + (oldOpens === A2.trim() ? "opens" : "shut") + ", the new one " + neuKind + " at epoch " + neuEpoch);
  }

  /* A cold start, with no sync pass before the read: the first listing is held, the share is not read on this thread,
     and the catalog shows once that listing lands. */
  {
    const share = folder("prime-14ch-share");
    const ud = path.join(LAB, "prime-14ch-desk");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(share, "etiuda-team.json"), JSON.stringify(teamFile({ epoch: 1, rev: 1 })), "utf8");
    fs.writeFileSync(path.join(share, "lamp-shop.ec"), A1, "utf8");
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
      teamPins: { [TEAM]: LEAD }, teamShown: { [TEAM]: { folder: share } } }), "utf8");
    const d = loadDesk(ud);
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
    const s = d.api.folderSyncerRun(null);
    const held = [];
    let release = false;
    const apply = s && s.program ? s.program.applyScan.bind(s.program) : null;
    if (s && s.program) s.program.applyScan = (msg) => { if (!release) { held.push(msg); return { answers: true, applied: [] }; } return apply(msg); };
    let early = null, shown = null, err = "";
    try {
      const until = Date.now() + 4000;
      while (!held.length && Date.now() < until) await new Promise(res => setTimeout(res, 25));
      early = d.api.readCatalog();
      const shareClosed = d.api.folderAnswers(share) === false;
      const before = hits.length;
      release = true;
      for (const msg of held.splice(0)) apply(msg);
      shown = d.api.readCatalog();
      const reading = d.said.some(l => l.indexOf("still reading the team's shared folder") >= 0);
      const slate = d.said.some(l => l.indexOf("no catalog found") >= 0);
      /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
      retire(!!s && before === 0 && early == null && shareClosed && reading && !slate && shown === A1.trim(),
        "14ch a desk started on a folder team reads nothing under the share before the first listing lands (" + before
        + (before ? ": " + hits.slice(0, before).join("; ") : "") + "), says it is still reading, and then the catalog shows (shown "
        + (shown === A1.trim()) + ", share closed " + shareClosed + ")");
    } catch (e) {
      err = String(e && e.stack || e);
      /* RETIRED, P4 (no folder is read as a team): a folder team's head, ring, epoch wait and first listing were read off its team file in the share (the seal wait and the folder's own ring and head are gone; relay-channel's head and ring checks hold a team's). It said what its sentence below says. */
      retire(false, "14ch a desk started on a folder team reads nothing under the share before the first listing lands: " + err);
    } finally {
      for (const n of spyNames) fs[n] = spyOrig[n];
      try { if (s && typeof s.stop === "function") s.stop(); } catch {}
    }
  }

  /* ---- a flag can be made where the desk's file would reach a lead: branchReach asks the write's own gate and seal step ----
     The cases are driven on one team desk: each takes the catalog, asks the channel, then writes the file the page would send,
     and the two must agree. The plants lift a line of the gate in a scratch copy of main.js: the answer follows the gate. */
  {
    const FLG = folder("flag");
    let DF = newDesk("flag", FLG, null, null, TEAM);
    const meF = await DF.ask("etiuda:branch-identity", true);
    const TX2 = "t-" + crypto.randomBytes(8).toString("hex"), KX2 = crypto.randomBytes(32);
    const listing = ["lamp-shop", "tea-room", "kiln-hall"];
    fs.writeFileSync(path.join(FLG, "etiuda-ring.json"), JSON.stringify({ format: 1, kind: "etiuda-ring",
      keys: ["lamp-shop", "tea-room", "kiln-hall", "mug-bar", "jar-store"].map(c => ({ catalog: c, keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public })) }), "utf8");
    const teamA = () => put(FLG, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 1, roster: [entry(meF, K1, 1)], catalogs: listing })));
    teamA();
    const sha8 = id => crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 8);
    const pinOf = t => "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(t)))).digest("hex");
    const made = (id, name) => text(catalog(id, 1, name, "2026-02-01"));
    const LAMP = made("lamp-shop", "Lamp Shop"), TEA = made("tea-room", "Tea Room"), KILN = made("kiln-hall", "Kiln Hall");
    const MUG = made("mug-bar", "Mug Bar"), JAR = made("jar-store", "Jar Store");
    /* A copy a colleague made: unsigned, under an id of its own, growing from the edition `sha` names. */
    const copyOf = (id, from, sha) => { const d = JSON.parse(from); delete d.sig; d.id = id; d.rev = 1; d.grew = { id: JSON.parse(from).id, rev: 1, sha: sha }; return JSON.stringify(d); };
    /* The desk's file of a catalog as the page builds it (branchCatalog), and where the write puts it. */
    const grow = handed => {
      const from = JSON.parse(handed), doc = JSON.parse(handed);
      delete doc.sig;
      doc.id = meF.id + "-" + sha8(from.id);
      doc.rev = 1;
      doc.grew = { id: from.id, rev: from.rev, sha: pinOf(handed) };
      if (from.grew && from.grew.id) doc.grew.root = String(from.grew.root || from.grew.id);
      doc.desk = { id: meF.id, key: meF.key, box: meF.box };
      const stem = "mine-" + sha8(from.id);
      return { stem: stem, text: JSON.stringify(doc), file: path.join(FLG, "desks", meF.id, stem + ".ec") };
    };
    const take = (D, handed) => D.ipc("etiuda:catalog-taken", pinOf(handed), handed);
    const ownFiles = () => (fs.existsSync(path.join(FLG, "desks", meF.id)) ? fs.readdirSync(path.join(FLG, "desks", meF.id)) : []).filter(n => !/^in-use/.test(n));
    /* Take the catalog, ask the channel, write the file: what each said, and what landed. */
    const flagCase = async (D, handed) => {
      take(D, handed);
      const g = grow(handed), reach = D.ipc("etiuda:branch-reach");
      const w = await D.ask("etiuda:branch-write", g.stem, g.text);
      const raw = fs.existsSync(g.file) ? JSON.parse(fs.readFileSync(g.file, "utf8")) : null;
      const inner = raw && raw.kind === "etiuda-sealed" ? JSON.parse(D1.api.openSealed(K1, raw) || "null") : null;
      return { reach: reach, w: w, raw: raw, inner: inner, g: g };
    };
    const agreed = r => r.reach === true ? !!r.w.ok && !r.w.held && !!r.raw : !r.raw && (!!r.w.held || r.w.withheld === true);
    const shown = r => "answer " + r.reach + ", write " + said(r.w) + ", file " + (r.raw ? (r.raw.kind === "etiuda-sealed" ? "sealed, team " + (r.raw.team === TEAM ? "A" : "other") + " epoch " + r.raw.epoch : "plain") : "none");

    /* the team lists the catalog itself: the file is the edition's own copy, plain where the edition was never sealed */
    put(FLG, "tea.ec", TEA);
    const teaHanded = await read(DF, "tea.ec");
    const rTea = await flagCase(DF, teaHanded);
    check(teaHanded === TEA && rTea.reach === true && agreed(rTea) && rTea.raw.kind === "etiuda-catalog" && rTea.raw.grew.id === "tea-room",
      "14fa a team's own listed catalog: the channel says yes, and the file lands plain, as the gate and the seal step answer: " + shown(rTea));

    /* a copy under an id of its own, listed by the first hop of its chain, which a lead signed */
    const copy = copyOf("tea-copy", TEA, pinOf(TEA));
    const rCopy = await flagCase(DF, copy);
    check(rCopy.reach === true && agreed(rCopy) && rCopy.raw.kind === "etiuda-catalog" && rCopy.raw.grew.id === "tea-copy" && rCopy.raw.grew.root === "tea-room",
      "14fb a copy whose chain's first hop the lead signed: yes, and the file lands: " + shown(rCopy));

    /* asking writes no record of the file it would have written, and no file */
    const copy2 = copyOf("tea-copy-two", TEA, pinOf(TEA));
    take(DF, copy2);
    const deskBytes = fs.readFileSync(path.join(DF.ud, "desk.json")), filesBefore = ownFiles().join();
    const asked2 = DF.ipc("etiuda:branch-reach");
    check(asked2 === true && Buffer.compare(deskBytes, fs.readFileSync(path.join(DF.ud, "desk.json"))) === 0 && ownFiles().join() === filesBefore,
      "14fc asking leaves the desk's record and the share as they were: the answer " + asked2 + ", the desk's file "
      + (Buffer.compare(deskBytes, fs.readFileSync(path.join(DF.ud, "desk.json"))) === 0 ? "unchanged" : "changed") + ", own files "
      + (ownFiles().join() === filesBefore ? "the same" : "changed"));

    /* a catalog the agent marked private, the team not listing it: nothing leaves */
    put(FLG, "mug.ec", MUG);
    await DF.ask("etiuda:team-join", "private", "mug-bar", "on");
    const rMug = await flagCase(DF, await read(DF, "mug.ec"));
    check(rMug.reach === false && agreed(rMug) && rMug.w.withheld === true,
      "14fd a private catalog: no, and the write withholds the file: " + shown(rMug));

    /* a catalog the team does not list: held at this desk, nothing leaves (the lead's box is not in this fixture) */
    put(FLG, "jar.ec", JAR);
    const rJar = await flagCase(DF, await read(DF, "jar.ec"));
    check(rJar.reach === false && agreed(rJar) && rJar.w.held === true,
      "14fe a catalog the team does not list: no, and the write holds the file: " + shown(rJar));

    /* a catalog opened from the team's envelope: the file is sealed under the team's key, as the seal step answers */
    put(FLG, "lamps.ec", seal(K1, 1, LAMP));
    const rLamp = await flagCase(DF, await read(DF, "lamps.ec"));
    check(rLamp.reach === true && agreed(rLamp) && rLamp.raw.kind === "etiuda-sealed" && rLamp.raw.team === TEAM && rLamp.raw.epoch === 1
      && !!rLamp.inner && rLamp.inner.grew.id === "lamp-shop",
      "14ff a listed catalog opened from the team's envelope: yes, and the file lands sealed under the team's key: " + shown(rLamp));

    /* a listed catalog opened from the team's envelope where the team's file has moved to an epoch this desk holds no key for:
       the write has no seal for it and holds, so the channel says no; the team's file back at its epoch, it says yes again */
    const beforeEpoch = await flagCase(DF, await read(DF, "lamps.ec"));
    fs.unlinkSync(beforeEpoch.g.file);
    put(FLG, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(meF, K1, 1)], catalogs: listing })));
    const rStale = await flagCase(DF, await read(DF, "lamps.ec"));
    check(beforeEpoch.reach === true && agreed(beforeEpoch) && rStale.reach === false && agreed(rStale) && rStale.w.held === true,
      "14fg a listed catalog opened from the team's envelope, with no seal to be had: no, and the write holds the file: with the key "
      + shown(beforeEpoch) + "; without " + shown(rStale));
    teamA();

    /* The plants: a line of the gate lifted from a copy of main.js, the same cases on it. */
    const liftMain = tag => {
      const lines = SRC.split("\n"), at = lines.findIndex(l => l.indexOf("plant:" + tag + " ") >= 0);
      if (at < 0) return null;
      lines.splice(at, 1);
      return { src: lines.join("\n") };
    };
    const planted = async (tag, handed) => {
      const plant = liftMain(tag);
      if (!plant) return null;
      const P = loadDesk(DF.ud, null, plant);
      try { return await flagCase(P, handed); } finally { P.close(); }
    };
    if (PLANTS_OFF) skip("NOT RUN 14fh lifting plant:s5-first-hop in a scratch copy of shell/main.js: the channel follows the gate");
    else {
      const forged = copyOf("tea-forged", TEA, "sha256:" + "ab".repeat(32));
      const real = await flagCase(DF, forged);
      const lifted = await planted("s5-first-hop", forged);
      check(!!lifted && real.reach === false && agreed(real) && lifted.reach === true && agreed(lifted),
        "14fh lifting plant:s5-first-hop lists a copy whose first hop no lead signed, and the channel follows: the shell as built says "
        + shown(real) + "; with the line lifted " + (lifted ? shown(lifted) : "the plant line is absent"));
    }
    if (PLANTS_OFF) skip("NOT RUN 14fi lifting plant:s0b-chain-listed in a scratch copy of shell/main.js: the channel follows the gate");
    else {
      fs.unlinkSync(rTea.g.file);
      const lifted = await planted("s0b-chain-listed", teaHanded);
      check(!!lifted && lifted.reach === false && agreed(lifted),
        "14fi lifting plant:s0b-chain-listed lists no catalog, and the channel follows: the team's own listed catalog, which 14fa wrote, now gives "
        + (lifted ? shown(lifted) : "the plant line is absent"));
    }
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "rs1 every reg call was answered by the stand-in, the policy key's at least once and no stray key of the machine's hive (Windows; the proxy keys are answered as missing), none off it (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
