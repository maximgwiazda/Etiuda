/* A share's catalog watch drops events and never says so. Where the folder is not this computer's
 * own disk, a stat on an interval is what notices a change, and an unchanged file is not a reload.
 * A folder on this computer's own disk keeps the watch alone.
 *
 *     node tests/catalog-share-stat.mjs        exit code is the number of failed checks, capped at 63
 *
 * The shell runs from a copy of shell/ in a temp folder. The plant is that copy. The worktree file
 * is not written. No window variable is set. Throwaway keys and catalogs only.
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
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const EXPECTED = 5;
const WORK = path.join(ROOT, "shell", "main.js");
const GOOD = fs.readFileSync(WORK);
const GOOD_HASH = crypto.createHash("sha256").update(GOOD).digest("hex");
const SHARE_WANT = 30000;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-catalog-share-stat-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), APP, { recursive: true });
const COPY = path.join(APP, "main.js");
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const fsMod = nodeRequire("node:fs");
const realWatch = fsMod.watch;
const realSetInterval = global.setInterval;
const watchCalls = [];
const armed = [];
fsMod.watch = function (dir) {
  watchCalls.push(String(dir));
  const w = { on() { return w; }, close() {} };
  return w;
};
global.setInterval = (fn, ms, ...rest) => {
  const id = realSetInterval(fn, ms, ...rest);
  if (id && id.unref) id.unref();
  armed.push({ fn: fn, ms: ms, id: id });
  return id;
};

function loadDesk(ud) {
  const src = fs.readFileSync(COPY, "utf8");
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
      getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false, removeSwitch: noop } },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage: inert, powerMonitor: inert,
    globalShortcut: inert, clipboard: inert,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const tail = src.includes("function shareStatTick(")
    ? "return { watchCatalog, shareStatTick, catalogChanged, SHARE_STAT_MS, get shareStatPrime() { return shareStatPrime; } };"
    : "return { watchCatalog, catalogChanged };";
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", src + "\n" + tail)(
    n => (n === "electron" ? electron : nodeRequire(n)),
    APP, COPY, { exports: {} }, {}, quiet);
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  return { api, said, ud, sent, win };
}
let seq = 0;
function newDesk(folder) {
  const ud = path.join(LAB, "desk-" + (++seq));
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: folder, eUiLang: "en", eAgent: "North desk" } }), "utf8");
  const D = loadDesk(ud);
  D.share = folder;
  return D;
}
const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
const pause = ms => new Promise(r => setTimeout(r, ms));
const offers = D => D.sent.filter(a => a[0] === "etiuda:catalog-file").length;
function silence(from) {
  armed.slice(from).forEach(a => { try { clearInterval(a.id); } catch { /* already cleared */ } });
}

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  const textOf = doc => JSON.stringify(doc, null, 1) + "\n";
  const sign = (doc) => {
    const o = JSON.parse(JSON.stringify(doc));
    o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), lead.privateKey).toString("hex");
    return textOf(o);
  };
  const catalog = (rev, card) => sign({
    format: 2, kind: "etiuda-catalog", id: "north-lamps", rev: rev, date: "2026-04-02", name: "North lamps",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: card } }],
  });
  const RING = { format: 1, kind: "etiuda-ring", keys: [
    { catalog: "north-lamps", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const SHORT = "The quay lamp.";
  const LONG = "The quay lamp is wrapped for the evening crossing and the tide is turning.";
  function seed(dir) {
    fs.mkdirSync(dir, { recursive: true });
    put(dir, "etiuda-ring.json", RING);
    put(dir, "north.ec", catalog(1, SHORT));
  }
  function rewrite(dir) {
    const file = path.join(dir, "north.ec");
    fs.writeFileSync(file, catalog(2, LONG), "utf8");
    const ms = Date.now() + 5000;
    fs.utimesSync(file, ms / 1000, ms / 1000);
  }
  async function watchOf(name, cloud) {
    const dir = cloud ? path.join(LAB, "OneDrive", name) : path.join(LAB, "plain", name);
    seed(dir);
    const D = newDesk(dir);
    const from = armed.length;
    const watches = watchCalls.length;
    D.api.watchCatalog(D.win);
    const interval = armed.slice(from).filter(a => a.ms === SHARE_WANT);
    const watched = watchCalls.length > watches;
    if (D.api.shareStatPrime) await D.api.shareStatPrime;
    return { dir: dir, D: D, interval: interval, watched: watched, from: from };
  }

  async function prove(name, needle, repl, run) {
    const planted = GOOD.toString("utf8").replace(needle, repl);
    if (planted === GOOD.toString("utf8")) return { ok: false, why: "plant missed", red: false };
    fs.writeFileSync(COPY, planted);
    let red = false, redWhy = "";
    try { red = !(await run()); }
    catch (e) { red = true; redWhy = e.message; }
    finally { fs.writeFileSync(COPY, GOOD); }
    const back = crypto.createHash("sha256").update(fs.readFileSync(COPY)).digest("hex");
    const tree = crypto.createHash("sha256").update(fs.readFileSync(WORK)).digest("hex");
    if (back !== GOOD_HASH || tree !== GOOD_HASH) throw new Error("sha256 restore failed: " + name);
    console.log("  red  " + name + (red ? " failed under the plant" : " STILL PASSED under the plant")
      + (redWhy ? " (" + redWhy + ")" : ""));
    let green = false, why = "";
    try { green = await run(); }
    catch (e) { green = false; why = e.stack || e.message; }
    return { ok: red && green === true, why: why, red: red };
  }

  /* ---- f2a: a cloud-shaped folder is stat'd; a folder on this disk is not -------------------------- */
  try {
    const cloud = await watchOf("f2a-cloud", true);
    const local = await watchOf("f2a-local", false);
    const before = offers(local.D);
    rewrite(local.dir);
    await pause(450);
    const quiet = offers(local.D) === before;
    silence(cloud.from);
    check(cloud.interval.length === 1 && String(cloud.interval[0].fn).includes("shareStatTick")
      && cloud.watched && local.interval.length === 0 && local.watched && quiet
      && cloud.D.api.SHARE_STAT_MS === SHARE_WANT && local.dir.slice(0, 2).toLowerCase() === "c:",
      "f2a a cloud-shaped folder arms a 30s stat and a folder on this disk does not, and a silent watch offers nothing there"
      + " (cloud " + cloud.interval.length + ", local " + local.interval.length + ", watched " + cloud.watched + "/" + local.watched
      + ", quiet " + quiet + ")");
  } catch (e) {
    check(false, "f2a the leg did not finish: " + (e && e.message || e));
  }

  /* ---- f2b: an unchanged file is not offered; a change the watch never reports is -------------------- */
  try {
    const box = await watchOf("f2b", true);
    const tick = box.D.api.shareStatTick;
    if (typeof tick !== "function") throw new Error("no shareStatTick");
    await tick(box.D.win);
    await pause(450);
    const held = offers(box.D) === 0;
    rewrite(box.dir);
    await tick(box.D.win);
    await pause(450);
    const once = offers(box.D) === 1;
    await tick(box.D.win);
    await pause(450);
    const still = offers(box.D) === 1;
    silence(box.from);
    check(held && once && still && box.interval.length === 1,
      "f2b an unchanged file is not offered, a change fs.watch never reports is offered once, and a second look sends nothing more"
      + " (held " + held + ", once " + once + ", still " + still + ")");
  } catch (e) {
    check(false, "f2b the leg did not finish: " + (e && e.message || e));
  }

  /* ---- f2c: removing the schedule leaves the change unseen ------------------------------------------- */
  {
    const g = await prove("f2c",
      "catalogSettle = setTimeout(() => catalogChanged(win), 300); /* plant:f2-share-stat */",
      "/* plant:f2-share-stat */",
      async () => {
        const box = await watchOf("f2c", true);
        if (typeof box.D.api.shareStatTick !== "function") return false;
        rewrite(box.dir);
        await box.D.api.shareStatTick(box.D.win);
        await pause(450);
        silence(box.from);
        return offers(box.D) === 1;
      });
    check(g.ok, "f2c removing the stat's schedule leaves a change unseen, and restoring it offers the file"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2d: removing the unchanged guard offers a file that did not change --------------------------- */
  {
    const g = await prove("f2d",
      "if (!moved) return; /* plant:f2-share-quiet */",
      "/* plant:f2-share-quiet */",
      async () => {
        const box = await watchOf("f2d", true);
        if (typeof box.D.api.shareStatTick !== "function") return false;
        await box.D.api.shareStatTick(box.D.win);
        await pause(450);
        silence(box.from);
        return offers(box.D) === 0;
      });
    check(g.ok, "f2d removing the unchanged guard offers a file that did not change, and restoring it stays quiet"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  const tree = crypto.createHash("sha256").update(fs.readFileSync(WORK)).digest("hex");
  check(tree === GOOD_HASH, "f2e the worktree shell was not written (" + tree.slice(0, 12) + ")");
} catch (e) {
  console.log("  FAIL the leg did not finish: " + (e && e.stack || e));
  failed++;
} finally {
  fsMod.watch = realWatch;
  global.setInterval = realSetInterval;
  armed.forEach(a => { try { clearInterval(a.id); } catch { /* already cleared */ } });
  try { fs.writeFileSync(COPY, GOOD); } catch { /* the copy is disposable */ }
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }
}
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
process.exit(Math.min(failed, 63));
