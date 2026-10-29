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
const EXPECTED = 65;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-team-desk-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName", "readRing"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

/* One desk: its own user-data folder and desk.json naming the catalog folder, the shell evaluated afresh over it. The
   safeStorage stand-in is reversible and shows nothing of what it holds. While `flaky.down` is "seal" it seals nothing,
   and while it is "all" it opens nothing either, throwing as Electron's does. */
function loadDesk(ud, flaky) {
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
    SRC + "\nreturn { " + EXPOSE.join(", ") + ", teamOf: pin => { const v = editionTeam.get(String(pin || '')); return v === undefined ? null : String(v); } };")(n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const ipc = (ch, ...args) => { const e = eventFor(); on[ch](e, ...args); return e.returnValue; };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  return { api, ask, ipc, on, invoke, said, ud, envelope };
}
function newDesk(name, folder, flaky) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
  return loadDesk(ud, flaky);
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };
const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((out, e) => out.concat(e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]), []);

try {
  const SHARE = folder("share");
  const D1 = newDesk("one", SHARE);

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
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519"), forger = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "lamp-lead", public: pubHex(lead.publicKey) };
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
  const ring = { format: 1, kind: "etiuda-ring", keys: ["lamp-shop", "tea-room"].map(c => ({ catalog: c, keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public })) };
  fs.writeFileSync(path.join(SHARE, "etiuda-ring.json"), JSON.stringify(ring), "utf8");

  const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
  const K1 = crypto.randomBytes(32), K2 = crypto.randomBytes(32), KF = crypto.randomBytes(32);
  const seal = (key, epoch, t, team) => JSON.stringify(D1.api.sealCatalog(key, team || TEAM, epoch, t));
  const entry = (who, key, epoch, team) => ({ desk: { id: who.id, key: who.key, box: who.box },
    wrap: D1.api.wrapTeamKey(key, who.box, team || TEAM, epoch, who.id) });
  const teamFile = (o) => sign(Object.assign({ format: 1, kind: "etiuda-team", id: o.team || TEAM, catalogs: o.catalogs || ["lamp-shop", "tea-room"],
    lead: { keyId: o.keyId || LEAD.keyId, public: o.public || LEAD.public }, sealed: true, exportsSealed: o.exportsSealed === true,
    epoch: o.epoch, roster: o.roster }, o.handover ? { handover: o.handover } : {}, o.ring ? { ring: o.ring } : {}, o.rev !== undefined ? { rev: o.rev } : {}), o.signer || lead.privateKey, o.keyId || LEAD.keyId);
  const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), t, "utf8");
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
  const D2 = newDesk("two", SHARE), me2 = await D2.ask("etiuda:branch-identity", true);
  const D5 = newDesk("five", SHARE), me5 = await D5.ask("etiuda:branch-identity", true);
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
  put(SHARE, "lamps.ec", seal(K1, 1, A1));
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
  check(strange === envA2 && !("teamKeys" in env2) && JSON.stringify(env2.teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "14h a desk the roster does not carry opens nothing: it is handed the envelope, keeps no key, and has pinned the lead only"
    + " because the ring lists that key (" + (strange === envA2 ? "envelope" : "opened") + ")");

  /* ---- a team file under another key, after the pin: a forger names the team, the lead's keyId and desk one ---- */
  const forged = teamFile({ epoch: 2, public: pubHex(forger.publicKey), signer: forger.privateKey, roster: [entry(me1, KF, 2)] });
  put(SHARE, "etiuda-team.json", JSON.stringify(forged));
  const envF = seal(KF, 2, A3);
  put(SHARE, "forged.ec", envF);
  const viaForger = await read(D1, "forged.ec");
  const env1f = D1.envelope();
  check(viaForger === envF && epochs(D1) === "1" && JSON.stringify(env1f.teamPins) === JSON.stringify({ [TEAM]: LEAD })
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
  check(await read(D1b, "lamps-3.ec") === A3.trim() && await read(D1b, "lamps.ec") === A2.trim() && await read(D1b, "forged.ec") === envF,
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
  const LONE = folder("lone"), D3 = newDesk("three", LONE), me3 = await D3.ask("etiuda:branch-identity", true);
  const TEAM3 = "t-" + crypto.randomBytes(8).toString("hex");
  put(LONE, "lone.ec", seal(K1, 1, A2, TEAM3));
  put(LONE, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [] })));
  const unpinned = await read(D3, "lone.ec");
  check(JSON.parse(unpinned).kind === "etiuda-sealed" && !("teamPins" in D3.envelope()) && !("teamKeys" in D3.envelope()),
    "14o where no ring lists the lead, a team file that does not admit this desk is trusted for nothing: no pin, no key");
  put(LONE, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [entry(me3, K1, 1, TEAM3)] })));
  check(await read(D3, "lone.ec") === A2.trim() && JSON.stringify(D3.envelope().teamPins) === JSON.stringify({ [TEAM3]: LEAD }),
    "14p where no ring lists the lead, the first file that admits this desk pins its lead and opens the catalog");
  const altered = JSON.parse(JSON.stringify(teamFile({ team: TEAM3, epoch: 2, roster: [entry(me3, K2, 2, TEAM3)] })));
  altered.exportsSealed = true;
  put(LONE, "etiuda-team.json", JSON.stringify(altered));
  put(LONE, "lone-2.ec", seal(K2, 2, A3, TEAM3));
  check(JSON.parse(await read(D3, "lone-2.ec")).kind === "etiuda-sealed" && epochs(D3, TEAM3) === "1"
    && D3.said.some(l => /not a team file whole/.test(l)),
    "14q a team file changed after it was signed is not whole and opens nothing, under the pinned lead's own keyId");

  const RINGED = folder("ringed"), D8 = newDesk("eight", RINGED);
  await D8.ask("etiuda:branch-identity", true);
  fs.writeFileSync(path.join(RINGED, "etiuda-ring.json"), JSON.stringify(ring), "utf8");
  put(RINGED, "etiuda-team.json", JSON.stringify(teamFile({ team: TEAM3, epoch: 1, roster: [], public: pubHex(forger.publicKey), signer: forger.privateKey })));
  put(RINGED, "lone.ec", seal(K1, 1, A2, TEAM3));
  check(JSON.parse(await read(D8, "lone.ec")).kind === "etiuda-sealed" && !("teamPins" in D8.envelope()),
    "14z a ring that lists the lead's key for the team's catalogs vouches for that key only: a file whose lead is another key"
    + " gets no pin from it");

  /* ---- an admission arriving while the desk runs --------------------------------------------------------------- */
  const LATE = folder("late"), D6 = newDesk("six", LATE), me6 = await D6.ask("etiuda:branch-identity", true);
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
  check(await read(D1, "nested.ec") === nested,
    "14s an envelope sealed inside another is handed as it is, never opened twice into a catalog");
  const later = Object.assign(JSON.parse(envA2), { epoch: 3 });
  put(SHARE, "epoch-3.ec", JSON.stringify(later));
  check(JSON.parse(await read(D1, "epoch-3.ec")).epoch === 3,
    "14t an envelope naming an epoch the desk holds no key for opens nothing");
  const ownLine = path.join(D1.ud, "desk.json");
  const deskJson = fs.readFileSync(ownLine, "utf8");
  check(!/"teamKeys":\{[^}]*[0-9a-f]{64}/.test(deskJson) && /"teamKeys":\{"t-[0-9a-f]{16}":\{"1":"[A-Za-z0-9+/=]+","2":"[A-Za-z0-9+/=]+"\}\}/.test(deskJson),
    "14u the desk envelope holds each epoch's key sealed, under its team and epoch, and no 64-character hex beside them");

  /* ---- the controls' own controls --------------------------------------------------------------------------- */
  const logged = [D0, D1, D2, D3, D5, D6].reduce((all, D) => all.concat(D.said), []).join("\n");
  check(logged.length > 0 && [K1, K2, KF].every(k => spellings(k).every(x => logged.indexOf(x) < 0)),
    "14v no shell's log holds a team key in any spelling, over " + logged.split("\n").length + " logged lines");
  const D7 = newDesk("seven", SHARE);
  check(JSON.parse(await read(D7, "lamps.ec")).kind === "etiuda-sealed" && !("branch" in D7.envelope()),
    "14w a desk with no identity of its own is on no roster: it opens nothing and makes no key pair to find out");
  const leadOff = teamFile({ epoch: 1, roster: [entry(me1, K1, 1)] });
  delete leadOff.sig;
  put(SHARE, "etiuda-team.json", JSON.stringify(leadOff));
  const D1c = loadDesk(D1.ud);
  check(await read(D1c, "lamps.ec") === A2.trim() && JSON.stringify(D1c.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "14x an unsigned team file takes nothing away: the kept key opens what it opened and the pin stands");

  /* ---- the desk's own file: what the page writes after an edit, grown from the catalog it was handed ----------- */
  const OWN = folder("own"), D9 = newDesk("nine", OWN), me9 = await D9.ask("etiuda:branch-identity", true);
  const D12 = newDesk("twelve", OWN), me12 = await D12.ask("etiuda:branch-identity", true);
  const D13 = newDesk("thirteen", OWN);
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
  const freshW = await loadDesk(D9.ud).ask("etiuda:branch-write", lamps.stem, edited);
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
    const out12 = [await D12.ask("etiuda:branch-write", lamps12.stem, lamps12.text),
      await loadDesk(D12.ud).ask("etiuda:branch-write", lamps12.stem, lamps12.text)];
    const none12 = !fs.existsSync(file12), K3 = crypto.randomBytes(32);
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
      const t = await read(loadDesk(D9.ud), "lamp-copy.ec"); fs.unlinkSync(path.join(OWN, "lamp-copy.ec")); return t; })()) : "";
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
    put(OWN, "etiuda-team.json", JSON.stringify(bent));
    const bentOut = await exportAs(D9, "Bent.ec", lampFrom);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 3, roster: [], exportsSealed: false })));
    const leftOut = await exportAs(D9, "Left.ec", lampFrom);
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
    check(said(bentOut.r) === said({ name: "Bent.ec", ok: false, sealed: true }) && bentOut.text === null
      && said(leftOut.r) === said({ name: "Left.ec", ok: false, sealed: true }) && leftOut.text === null
      && !fs.readdirSync(SAVED).some(n => /^(Bent|Left)/.test(n)),
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
      const Q = newDesk("quaydesk", QUAY);
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
    {
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
      check(kilnA === A2.trim() && kilnB === A2.trim() && kilnGot.out === null
        && said(kilnGot.r) === said({ name: "Kiln.ec", ok: false, sealed: true }),
        "14az both teams' envelopes of one pin in A's folder, the export at A is refused: " + said(kilnGot.r)
        + ", a file " + (kilnGot.out === null ? "no" : "yes"));
    }
  }

  /* ---- the folder's team file no longer lists the catalog: no team covers it where the file is written ---------- */
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)], catalogs: ["tea-room"] })));
  const unsure = await loadDesk(D9.ud).ask("etiuda:branch-write", lamps.stem,
    JSON.stringify(Object.assign(JSON.parse(lamps.text), { name: "Lamp Shop, edited twice" })));
  check(D9.envelope().teamOpened.indexOf("lamp-shop") >= 0 && said(unsure) === said({ ok: false, held: true })
    && landed().epoch === 2 && holding("Good day, Lamp Shop.") === 0 && holding("edited twice") === 0,
    "14ad where the team file at the folder written to does not list the catalog, the desk holds its file and writes nothing"
    + " in the clear: " + said(unsure) + ", the share's file still the epoch " + landed().epoch + " envelope");
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));

  /* ---- two teams, one catalog id: the desk lists the other team's folder, then writes in its own --------------- */
  {
    const OTHER = folder("other"), TB = "t-" + crypto.randomBytes(8).toString("hex"), KB = crypto.randomBytes(32);
    const point = (D, dir) => {
      const e = D.envelope();
      e.keys = Object.assign({}, e.keys, { eCatalogFolder: dir });
      fs.writeFileSync(path.join(D.ud, "desk.json"), JSON.stringify(e), "utf8");
      return loadDesk(D.ud);
    };
    const name = n => JSON.stringify(Object.assign(JSON.parse(lamps.text), { name: n }));
    const who = t => t === TEAM ? "A" : t === TB ? "B" : t ? "X, a third" : "none";
    let P = point(D9, OWN);
    const r0 = await read(P, "lamps.ec");
    const w0 = await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, before the other folder"));
    const e0 = landed();
    check(r0 === A2.trim() && !!w0.ok && e0.team === TEAM && e0.epoch === 2 && D1.api.openSealed(K2, e0) !== null,
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
    check(!!listed && listed.id === "lamp-shop" && !!w1.ok && e1.team === TEAM && D1.api.openSealed(K2, e1) !== null && byB === null,
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
    put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
    check(planted.every(r => said(r) === said({ ok: false, held: true })) && e2.team === TEAM
      && (D1.api.openSealed(K2, e2) || "").indexOf("after the other folder") >= 0
      && D1.api.openSealed(KB, e2) === null && holding("planted team file") === 0,
      "14af a team file in the folder naming the other team, under a key other than its pinned lead's or changed after signing,"
      + " moves nothing: the desk holds its file, " + planted.map(said).join(", ") + ", and the share's file stays team "
      + who(e2.team) + "'s");

    /* A team file planted at the folder for a team nobody pinned, wrapping a key for this desk, admits it at once. */
    const TX = "t-" + crypto.randomBytes(8).toString("hex"), KX = crypto.randomBytes(32);
    const restoreA = () => put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
    const teamX = JSON.stringify(teamFile({ team: TX, epoch: 1, roster: [entry(me9, KX, 1, TX)], public: pubHex(forger.publicKey),
      signer: forger.privateKey }));
    const openedBy = (e, k) => (e.kind === "etiuda-sealed" ? D1.api.openSealed(k, e) : null) || "";
    put(OWN, "etiuda-team.json", teamX);
    const wX = await P.ask("etiuda:branch-write", lamps.stem, name("Lamp Shop, under a fresh team"));
    const eX = landed();
    restoreA();
    check(said(wX) === said({ ok: false, held: true }) && eX.team === TEAM && openedBy(eX, KX) === ""
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
      && openedBy(eB, K2).indexOf("Other Shop") < 0 && holding("Other Shop") === 0,
      "14ah a desk holding team B's edition of an id team A also covers, its folder moved to team A's share in the same run,"
      + " does not seal B's catalog for team A: " + said(wB) + ", team A's key opens B's text in the share's file "
      + (openedBy(eB, K2).indexOf("Other Shop") >= 0 ? "yes" : "no"));

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
    }
    const eAX = landed();
    fs.unlinkSync(copyX);
    restoreA();
    check(wAX.every(r => said(r) === said({ ok: false, held: true })) && eAX.team === TEAM && openedBy(eAX, KX) === "",
      "14ai one signed edition opened from envelopes of two teams seals the desk's own file for neither, whichever is listed"
      + " first, even where the second team's file stands at the folder: " + wAX.map(said).join(", ")
      + ", the share's file sealed for team " + who(eAX.team));
  }

  /* ---- the lead hands the team to a new key: a statement signed by the pinned key, in the team file ---------------
     The statement's bytes are made here from the engine's own v2SignedBytes behind the handover prefix, not by the shell. */
  {
    const ROT = folder("rotate"), R = newDesk("rotate", ROT), meR = await R.ask("etiuda:branch-identity", true);
    const TR = "t-" + crypto.randomBytes(8).toString("hex"), KR = [0, 1, 2, 3, 4, 5].map(() => crypto.randomBytes(32));
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
    const opens = async epoch => { put(ROT, "lamps.ec", seal(KR[epoch], epoch, A2, TR)); return (await read(R, "lamps.ec")) === A2.trim(); };
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

  /* ---- a keep that fails: safeStorage away for one read, the team file unchanged after it ----------------------- */
  const FLAKY = folder("flaky"), flaky10 = { down: "" }, flaky11 = { down: "" };
  const D10 = newDesk("ten", FLAKY, flaky10), D11 = newDesk("eleven", FLAKY, flaky11);
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
  check(ringAsked === JSON.stringify(embeddedRing) && JSON.stringify(ringRead) === JSON.stringify(embeddedRing),
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

  // Helper to make signed head
  const makeHead = (team, editions, t, key, keyId) => {
    const doc = { v: 1, team: team, epoch: 1, rev: 1, editions: editions, t: t,
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
  check(!!row1 && !!row1.head && row1.head.edition === "Lamp Shop v3" && row1.head.published === "2026-02-03" && row1.head.t === headNow,
    "14bd a newer genuine etiuda-head.json on a folder team shows its edition and publish time in leadsView(): "
    + (row1 && row1.head ? row1.head.edition + " / " + row1.head.published : "no head"));

  // 14be: forged head shows nothing in leadsView()
  const forgedHead = JSON.parse(JSON.stringify(freshHead));
  forgedHead.sig.value = (forgedHead.sig.value[0] === "a" ? "b" : "a") + forgedHead.sig.value.slice(1);
  put(F6, "etiuda-head.json", JSON.stringify(forgedHead));
  const leadsForged = await DF6.ask("etiuda:team-join", "leads");
  const rowForged = ((leadsForged && leadsForged.leads) || []).find(r => r.team === T6);
  check(!!rowForged && !rowForged.head,
    "14be a forged etiuda-head.json on a folder team shows nothing in leadsView(): "
    + (rowForged && !rowForged.head ? "nothing shown" : "showed head"));

  // 14bf: foreign-key head shows nothing in leadsView()
  const foreignHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 3, edition: "Lamp Shop v3", published: "2026-02-03" }], headNow, forger.privateKey, "foreign-key");
  put(F6, "etiuda-head.json", JSON.stringify(foreignHead));
  const leadsForeign = await DF6.ask("etiuda:team-join", "leads");
  const rowForeign = ((leadsForeign && leadsForeign.leads) || []).find(r => r.team === T6);
  check(!!rowForeign && !rowForeign.head,
    "14bf a foreign-key etiuda-head.json on a folder team shows nothing in leadsView(): "
    + (rowForeign && !rowForeign.head ? "nothing shown" : "showed head"));

  // 14bg: older head (rev below the edition the desk has) shows nothing in leadsView()
  // The desk in F6 has opened lamps.ec (A2, rev 2). A head with rev 1 is older.
  const olderHead = makeHead(T6, [{ catalog: "lamp-shop", rev: 1, edition: "Lamp Shop v1", published: "2026-02-01" }], headNow + 1000);
  put(F6, "etiuda-head.json", JSON.stringify(olderHead));
  const leadsOlder = await DF6.ask("etiuda:team-join", "leads");
  const rowOlder = ((leadsOlder && leadsOlder.leads) || []).find(r => r.team === T6);
  check(!!rowOlder && !rowOlder.head,
    "14bg an older etiuda-head.json (rev 1 below the desk's rev 2) on a folder team shows nothing in leadsView(): "
    + (rowOlder && !rowOlder.head ? "nothing shown" : "showed head"));

  // 14bh: channel.cjs readRing with folder doc
  const Ch = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
  const chProg = Ch.createProgram({ pin: { teamId: T6, keyId: LEAD.keyId, public: LEAD.public } });
  const folderDocWithRing = teamFile({ team: T6, epoch: 1, roster: [], ring: embeddedRing });
  const folderDocNoRing = teamFile({ team: T6, epoch: 1, roster: [] });
  const chWithRing = chProg.readRing({ teamDoc: folderDocWithRing, looseRing: looseRing });
  const chLoose = chProg.readRing({ teamDoc: folderDocNoRing, looseRing: looseRing });
  const chNone = chProg.readRing({ teamDoc: folderDocNoRing, looseRing: null });
  check(chWithRing.source === "team" && JSON.stringify(chWithRing.ring) === JSON.stringify(embeddedRing)
    && chLoose.source === "loose" && JSON.stringify(chLoose.ring) === JSON.stringify(looseRing)
    && chNone.source === "none" && chNone.ring === null,
    "14bh channel.cjs readRing accepts embedded ring in folder teamDoc and falls back to looseRing without one: "
    + chWithRing.source + " / " + chLoose.source + " / " + chNone.source);
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "rs1 every reg call was answered by the stand-in, the policy key's at least once and no other key of the machine's hive (Windows), none off it (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
