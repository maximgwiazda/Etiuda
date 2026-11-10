/* A rename out of the mirror's .staging folder that the system refuses for a moment is asked again.
 * One that keeps refusing leaves that file staged, is said, and is tried at the next scan. The worker stays up.
 *
 *     node tests/syncer-rename-busy.mjs
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 2;

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

function main() {
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

main();
