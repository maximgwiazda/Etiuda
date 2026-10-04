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
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 37;

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
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "isCatalogName"];
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
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.join(", ") + " };")(n => (n === "electron" ? electron : nodeRequire(n)),
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
  const teamFile = (o) => sign({ format: 1, kind: "etiuda-team", id: o.team || TEAM, catalogs: o.catalogs || ["lamp-shop", "tea-room"],
    lead: { keyId: o.keyId || LEAD.keyId, public: o.public || LEAD.public }, sealed: true, exportsSealed: false,
    epoch: o.epoch, roster: o.roster }, o.signer || lead.privateKey, o.keyId || LEAD.keyId);
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
  put(OWN, "etiuda-team.json", JSON.stringify(teamFile({ epoch: 2, roster: [entry(me9, K2, 2)] })));
  const resealed = await D9.ask("etiuda:branch-write", lamps.stem, edited);
  const env9c = landed(), mine = await ownRow(D9), removed = await ownRow(D12);
  check(said(resealed) === said({ ok: true, rev: 3 }) && env9c.kind === "etiuda-sealed" && env9c.epoch === 2
    && D1.api.openSealed(K1, env9c) === null && D1.api.openSealed(K2, env9c) !== null && !!mine && mine.rev === 3 && removed === null,
    "14ac after a new epoch the same file, written again, is sealed under the newest key the desk keeps: " + said(resealed)
    + ", epoch " + env9c.epoch + "; the writer lists it " + (mine ? "yes" : "no") + ", the desk removed at the epoch "
    + (removed ? "yes" : "no"));

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
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
