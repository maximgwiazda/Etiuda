/* No desk writes into a catalog file on a share, in bare node: shell/main.js under a stubbed electron over a catalog folder,
 * and shell/preload.js over a stub of the bridge. A desk reads the catalog folder, works from its own copy, and holds no lock
 * beside a catalog, no shared read, write or put-back for the page, and no setting to turn them on. The page's half (the Settings row) is held in
 * tests/module-calls.mjs, and the desk's own file under a setting left on from an older build in tests/card-flag.mjs (nsfe7).
 *
 *   node tests/shared-file-gone.mjs      exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 6;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-sharedgone-"));
const UD = path.join(BASE, "user-data"), DOCS = path.join(BASE, "documents"), FOLDER = path.join(DOCS, "Etiuda");
[UD, FOLDER].forEach(d => fs.mkdirSync(d, { recursive: true }));

const quiet = { log: () => {}, error: () => {}, warn: () => {} };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
  decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
};
function boot() {
  const on = {}, handle = {}, test = {};
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
           getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage: safeStorage,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
    fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8")
    + "\n__test.keepHist = function(file, text) { return historyKeep(file, text, false); };")(
    n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
    { exports: {} }, {}, quiet, test);
  const ev = { sender: { id: 1, once: noop }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
  return {
    test: test, handles: ch => typeof handle[ch] === "function",
    ask: (ch, ...a) => (handle[ch] ? Promise.resolve(handle[ch](ev, ...a)) : Promise.resolve(undefined)),
  };
}
function catalog(id, rev, word) {
  return JSON.stringify({
    format: 2, kind: "etiuda-catalog", id: id, rev: rev, date: "2026-10-0" + Math.min(rev, 9),
    langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: ["a", "b"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain", title: { en: word + " " + x }, body: { en: "Body " + x + "." } }))
  }, null, 1) + "\n";
}
const listing = dir => { try { return fs.readdirSync(dir).sort(); } catch { return []; } };

try {
  const SHOP = path.join(FOLDER, "shop.ec"), LOCK = SHOP + ".lock";
  const older = catalog("shop", 5, "Older one"), current = catalog("shop", 6, "Current one");
  fs.writeFileSync(SHOP, current);
  const A = boot();

  /* nsfe1 and nsfe2: the shell answers no shared read and no shared write, whoever asks and whatever the file. */
  const read = await A.ask("etiuda:shared-read", "shop.ec", "");
  const wrote = await A.ask("etiuda:shared-write", "shop.ec", catalog("shop", 7, "Edited"), sha(Buffer.from(current)), false);
  check(!A.handles("etiuda:shared-read") && !A.handles("etiuda:shared-write") && read === undefined && wrote === undefined
    && fs.readFileSync(SHOP, "utf8") === current && listing(FOLDER).join() === "shop.ec",
    "nsfe1 the shell has no shared read and no shared write: neither channel is handled, the catalog's bytes are as they were and nothing sits beside it ("
    + JSON.stringify({ read: read, wrote: wrote, folder: listing(FOLDER) }) + ")");

  /* nsfe2: the page's bridge offers neither verb, so a page that still asked would find nothing to ask. */
  const exposed = {};
  const was = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
  globalThis.document = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };
  try {
    const ipcRenderer = { sendSync: ch => (ch === "etiuda:host" ? { platform: "win32", backdrop: null } : null), send: noop, invoke: () => Promise.resolve(null), on: noop };
    new Function("require", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(n => (n === "electron"
      ? { contextBridge: { exposeInMainWorld: (k, v) => { exposed[k] = v; }, executeInMainWorld: noop }, ipcRenderer, webUtils: {} } : nodeRequire(n)));
  } finally { globalThis.window = was.window; globalThis.document = was.document; }
  const host = exposed.E_HOST || {};
  check(typeof host.historyList === "function" && typeof host.historyRead === "function" && typeof host.historyPut === "undefined"
    && typeof host.sharedRead === "undefined" && typeof host.sharedWrite === "undefined",
    "nsfe2 the bridge offers the history's list and read, and no put-back, no shared read and no shared write ("
    + JSON.stringify({ list: typeof host.historyList, read: typeof host.historyRead, put: typeof host.historyPut, sharedRead: typeof host.sharedRead, sharedWrite: typeof host.sharedWrite }) + ")");

  /* nsfe3: a put-back on a plain shared folder leaves the shared file byte for byte: the shell has no channel that writes a kept version back,
     whoever asks, with another desk's lock file beside the catalog or none. */
  A.test.keepHist(SHOP, older);
  A.test.keepHist(SHOP, current);
  const listed = ((await A.ask("etiuda:history-list")) || []).filter(v => v.path === path.resolve(SHOP));
  const olderRow = listed.find(v => v.sha === sha(Buffer.from(older)));
  const opened = olderRow ? await A.ask("etiuda:history-read", olderRow.sha, SHOP) : null;
  const foreign = JSON.stringify({ kind: "etiuda-lock", token: "another-desk", at: Date.now() });
  fs.writeFileSync(LOCK, foreign);
  const beside = await A.ask("etiuda:history-put", sha(Buffer.from(older)), SHOP);
  const left = fs.existsSync(LOCK) && fs.readFileSync(LOCK, "utf8") === foreign;
  fs.unlinkSync(LOCK);
  const free = await A.ask("etiuda:history-put", sha(Buffer.from(older)), SHOP);
  check(!A.handles("etiuda:history-put") && beside === undefined && free === undefined && left && fs.readFileSync(SHOP, "utf8") === current
    && listing(FOLDER).join() === "shop.ec",
    "nsfe3 a put-back on a plain shared folder leaves the shared file byte for byte, with another desk's lock beside it or none, and leaves that lock as it was ("
    + JSON.stringify({ beside: beside, free: free, lockLeft: left, folder: listing(FOLDER) }) + ")");

  /* nsfe4: THE CONTROL: the history still lists the older version, offers it, and opens it as its own catalog text. */
  check(!!olderRow && olderRow.put === true && !!opened && opened.text === older.trim(),
    "nsfe4 THE CONTROL: the older version is still listed, still offered, and opens as its own catalog text (" + JSON.stringify({ rows: listed.length, put: olderRow && olderRow.put }) + ")");

  /* nsfe5: no source of the shell takes a lock beside a catalog, by the name the lock was kept under. */
  const main = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  check(main.indexOf("etiuda-lock") < 0 && main.indexOf('file + ".lock"') < 0 && main.indexOf("sharedLock") < 0,
    "nsfe5 shell/main.js names no lock kept beside a catalog and takes none");

  /* nsfe6: no channel of the shell writes a catalog into the catalog folder on the page's asking. */
  const preload = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
  check(preload.indexOf("etiuda:shared-") < 0 && main.indexOf("etiuda:shared-") < 0 && preload.indexOf("etiuda:history-put") < 0 && main.indexOf("etiuda:history-put") < 0,
    "nsfe6 neither shell file names a shared-read, shared-write or history-put channel");
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted >= EXPECTED;
if (!complete) console.log("  FAIL only " + asserted + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " shared file gone: " + (asserted - failed) + " of " + asserted + " legs green");
try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* the temp folder goes with the system's own sweep */ }
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
