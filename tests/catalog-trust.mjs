/* What the desk says about a catalog's signature, and the two shell doors a page may knock on,
 * driven in bare node: src/modules/catalog-trust.js over the real shell/preload.js over the real
 * handlers of shell/main.js, electron stubbed, the catalog folder and its ring in a temp folder.
 * Board 605 specified a failed signature as a warning; tests/catalog-sig.js proves the verifier,
 * and this file proves that a catalog read by the desk is the one handed to it.
 *
 *   node tests/catalog-trust.mjs       exit code is the number of failed checks, capped at 63
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
const EXPECTED = 18;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the desk: userData, and a catalog folder the desk key names ------------------------- */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-catalog-trust-"));
const UD = path.join(LAB, "userdata"), CF = path.join(LAB, "catalogs");
fs.mkdirSync(UD); fs.mkdirSync(CF);
const DESK = path.join(UD, "desk.json");
fs.writeFileSync(DESK, JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: CF, eUiLang: "en" } }), "utf8");
const RING = path.join(CF, "etiuda-ring.json");

const said = [];
const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const opened = [];
const onHandlers = {}, invokeHandlers = {};
const electron = {
  app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
         whenReady: () => new Promise(noop) },
  ipcMain: { on: (ch, fn) => { onHandlers[ch] = fn; }, handle: (ch, fn) => { invokeHandlers[ch] = fn; } },
  shell: { openPath: async p => { opened.push(p); return ""; } },
  BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
  screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
};
const fakeRequire = n => (n === "electron" ? electron : nodeRequire(n));
const shellSrc = f => fs.readFileSync(path.join(ROOT, "shell", f), "utf8");
new Function("require", "__dirname", "__filename", "module", "exports", "console", shellSrc("main.js"))(
  fakeRequire, path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);

const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = frame => ({ sender: { id: 1, once: noop }, senderFrame: frame, returnValue: undefined });
const ipcRenderer = {
  sendSync: (ch, ...args) => {
    if (ch === "etiuda:catalog") return null;
    if (ch === "etiuda:host") return { platform: "win32", backdrop: null, deskFile: DESK, home: UD };
    const e = eventFor(ENGINE_FRAME);
    onHandlers[ch](e, ...args);
    return e.returnValue;
  },
  send: (ch, ...args) => { if (onHandlers[ch]) onHandlers[ch](eventFor(ENGINE_FRAME), ...args); },
  invoke: (ch, ...args) =>
    new Promise(r => setImmediate(() => r(invokeHandlers[ch] ? invokeHandlers[ch](eventFor(ENGINE_FRAME), ...args) : undefined))),
  on: noop,
};
globalThis.window = { addEventListener: noop, removeEventListener: noop };
globalThis.document = { visibilityState: "visible", addEventListener: noop, removeEventListener: noop };
const contextBridge = { exposeInMainWorld: (k, v) => { window[k] = v; }, executeInMainWorld: noop };
new Function("require", shellSrc("preload.js"))(n => (n === "electron" ? { contextBridge, ipcRenderer } : nodeRequire(n)));

/* ---- a catalog, and the signing the authoring program does ------------------------------- */
const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const pair = crypto.generateKeyPairSync("ed25519"), stranger = crypto.generateKeyPairSync("ed25519");
const KEY_ID = "trust-harness";

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const CAT = await import(MOD("catalog.js"));
  const TR = await import(MOD("catalog-trust.js"));
  const ST = await import(MOD("storage.js"));
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "shell", "sample-catalog.ec"), "utf8"));
  const sign = (doc, key, keyId) => {
    const out = JSON.parse(JSON.stringify(doc));
    delete out.hash;
    out.sig = { alg: V2.V2_SIG_ALG, keyId: keyId || KEY_ID };
    out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
    return out;
  };
  const ringFile = () => fs.writeFileSync(RING, JSON.stringify({ format: V2.V2_RING_FORMAT, kind: V2.V2_RING_KIND,
    keys: [{ catalog: fixture.id, keyId: KEY_ID, alg: V2.V2_SIG_ALG, public: pubHex(pair.publicKey) }] }), "utf8");
  /* THE ROUTE A FILE TAKES: its text through the engine's one reader, then the state of what came out. */
  const stateOf = text => TR.catalogTrust(CAT.parseCatalogFile(text));
  const signed = sign(fixture, pair.privateKey);

  ringFile();
  const valid = await stateOf(JSON.stringify(signed));
  check(valid === V2.V2_SIG_VALID,
    "1a a catalog signed by the key the ring beside it lists for it reads valid, through parseCatalogFile and the host's ring: " + valid);

  const bent = JSON.parse(JSON.stringify(signed));
  bent.name = bent.name + " again";
  const invalid = await stateOf(JSON.stringify(bent));
  check(invalid === V2.V2_SIG_INVALID, "1b the same file changed after it was signed reads invalid: " + invalid);

  const bare = JSON.parse(JSON.stringify(signed));
  delete bare.sig;
  const none = await stateOf(JSON.stringify(bare));
  check(none === V2.V2_SIG_NONE, "1c the same file with no signature reads none: " + none);

  const foreign = await stateOf(JSON.stringify(sign(fixture, stranger.privateKey, "someone-else")));
  check(foreign === V2.V2_SIG_UNKNOWN, "1d the same file signed by a key the ring does not list reads unknown: " + foreign);

  const wrapped = await stateOf("window.E_CATALOG = " + JSON.stringify(signed) + ";");
  check(wrapped === V2.V2_SIG_VALID, "1e the script container carries the same signature: " + wrapped);

  fs.unlinkSync(RING);
  const ringless = await stateOf(JSON.stringify(signed));
  check(ringless === V2.V2_SIG_UNKNOWN,
    "1f with the ring taken away the valid file reads unknown, so 1a read the ring and not a key of its own: " + ringless);

  fs.writeFileSync(RING, " ".repeat(70000), "utf8");
  const big = await invokeHandlers["etiuda:catalog-ring"](eventFor(ENGINE_FRAME));
  const stray = (ringFile(), await invokeHandlers["etiuda:catalog-ring"](eventFor({ parent: null, url: "https://example.com/etiuda.html" })));
  const mine = await invokeHandlers["etiuda:catalog-ring"](eventFor(ENGINE_FRAME));
  check(big === "" && stray === "" && JSON.parse(mine).kind === V2.V2_RING_KIND,
    "1g the shell hands the ring to the engine only, and not a file larger than any ring: "
    + big.length + " and " + stray.length + " character(s), against " + mine.length + " for the engine");

  /* ---- what the desk keeps, and what it says ------------------------------------------------ */
  const kept = CAT.parseCatalogFile(JSON.stringify(signed));
  await TR.catalogTrust(kept);
  TR.recordCatalogTrust(kept);
  const heldValid = TR.heldCatalogTrust();
  TR.recordCatalogTrust(V2.catalogFromV2(JSON.parse(JSON.stringify(signed))));
  const heldNone = TR.heldCatalogTrust();
  check(heldValid === V2.V2_SIG_VALID && heldNone === "",
    "2a an activation records the state of the catalog it stores, and a catalog with no file behind it clears it: "
    + JSON.stringify(heldValid) + " then " + JSON.stringify(heldNone));

  const meta = s => TR.trustMetaHtml(s, false);
  check(meta(V2.V2_SIG_VALID) === "" && TR.trustMetaHtml(V2.V2_SIG_NONE, true) === ""
    && /unsigned/.test(meta(V2.V2_SIG_NONE)) && /changed since it was signed/.test(meta(V2.V2_SIG_INVALID))
    && /does not know/.test(meta(V2.V2_SIG_UNKNOWN)) && meta("") === "",
    "2b the Library's row says nothing of a valid signature or of the sample's absent one, and names the other three");

  ST.nsSet("CatalogTrust", V2.V2_SIG_VALID);
  const downgrade = TR.trustOfferLine(V2.V2_SIG_NONE, true), fresh = TR.trustOfferLine(V2.V2_SIG_NONE, false);
  ST.nsSet("CatalogTrust", V2.V2_SIG_NONE);
  const stillNone = TR.trustOfferLine(V2.V2_SIG_NONE, true);
  check(/is signed, and this edition is not/.test(downgrade) && fresh === "" && stillNone === ""
    && /changed since/.test(TR.trustOfferLine(V2.V2_SIG_INVALID, false))
    && TR.trustOfferLine(V2.V2_SIG_VALID, true) === "",
    "2c the offer says unsigned only where an edition would undo the signature the desk holds, and always says invalid");

  ST.lsSet("eUiLang", "pl");
  const pl = [TR.trustMetaHtml(V2.V2_SIG_INVALID, false), TR.trustOfferLine(V2.V2_SIG_UNKNOWN, false)];
  ST.lsSet("eUiLang", "en");
  check(/zmieniony od czasu podpisania/.test(pl[0]) && /^Ten plik podpisano kluczem/.test(pl[1]),
    "2f a desk that reads Polish is told in Polish, on both surfaces");

  /* A host that never answers must not hold a load: the wait ends and the catalog loads unrecorded. */
  const host = window.E_HOST;
  window.E_HOST = Object.assign({}, host, { catalogRing: () => new Promise(noop) });
  const t0 = Date.now();
  const hung = await TR.whenTrusted(CAT.parseCatalogFile(JSON.stringify(signed)));
  const waited = Date.now() - t0;
  window.E_HOST = host;
  check(hung === "" && waited >= 1500 && waited < 5000,
    "2d a ring that never arrives ends the wait unanswered rather than holding the load: "
    + JSON.stringify(hung) + " after " + waited + " ms");

  /* The ring may arrive after the catalog: the Library reads it again once, where the file this
     load was handed is the catalog in use. */
  ST.nsSet("CatalogTrust", V2.V2_SIG_UNKNOWN);
  let repainted = 0;
  const heldCopy = CAT.parseCatalogFile(JSON.stringify(signed));
  TR.recheckHeldTrust(CAT.parseCatalogFile(JSON.stringify(signed)), heldCopy, () => repainted++);
  await new Promise(r => setTimeout(r, 200));
  check(TR.heldCatalogTrust() === V2.V2_SIG_VALID && repainted === 1,
    "2e a ring placed after the catalog was loaded is read at the Library's next paint: "
    + TR.heldCatalogTrust() + ", repainted " + repainted + " time(s)");

  /* ---- the folder the Library opens --------------------------------------------------------- */
  const open = invokeHandlers["etiuda:open-catalog-folder"];
  const plant = path.join(LAB, "not-a-folder.cmd");
  fs.writeFileSync(plant, "rem planted\r\n", "utf8");
  onHandlers["etiuda:desk-save"](eventFor(ENGINE_FRAME), JSON.stringify({ eCatalogFolder: plant }));
  const onFile = await open(eventFor(ENGINE_FRAME));
  check(onFile === false && opened.length === 0,
    "3a a catalog folder setting that names a file is not handed to openPath, which would launch it: answered "
    + onFile + ", " + opened.length + " path(s) opened");
  onHandlers["etiuda:desk-save"](eventFor(ENGINE_FRAME), JSON.stringify({ eCatalogFolder: CF }));
  const onDir = await open(eventFor(ENGINE_FRAME));
  check(onDir === true && opened.length === 1 && opened[0] === CF,
    "3A THE CONTROL: the same door with a folder opens that folder, so 3a is the file and not a door that opens nothing");
  const fromPage = await open(eventFor({ parent: null, url: "https://example.com/etiuda.html" }));
  check(fromPage === false && opened.length === 1, "3b and it opens nothing for a document that is not the engine");

  const errs = said.filter(l => /^ERR /.test(l) && !/is not a folder|larger than any ring/.test(l));
  check(!errs.length, "5a main logged no error beyond the refusals it was asked for"
    + (errs.length ? ": " + errs.length + ", first " + errs[0] : ""));
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* reported below */ }
  check(!fs.existsSync(LAB), "4a the temp folder is gone");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
