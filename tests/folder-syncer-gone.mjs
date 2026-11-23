/* The folder syncer is gone: nothing in the engine starts, writes or reads a folder team's syncer, mirror, outbox or move. Driven in
 * bare node: the real shell/main.js under stubbed electron over a desk.json that still names a folder team, with a share, a local
 * mirror and an outbox on disk that an older build would have kept.
 *
 *     node tests/folder-syncer-gone.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CRITERION. shell/folder/ (the syncer and its worker) is not in the tree or the package lists. The desk starts, runs and quits
 * without requiring a syncer. A write or a removal of a file under <userData>/folder-mirror owes nothing to a share: no outbox is
 * made or changed. The catalog folder is the person's setting, never a local copy kept for a folder team, and a team's row says
 * nothing of an outbox. What a relay team still needs of the syncer's copy, a file copied that clears the read-only mark, is the
 * shell's own (copyClear).
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 15;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const LAB = createLab("etiuda-folder-syncer-gone-");
/* ETIUDA_SHELL_MAIN names another shell/main.js to judge, as tests/folder-team-held.mjs takes it: a tree before this one, for its reds. */
const SRC = fs.readFileSync(process.env.ETIUDA_SHELL_MAIN || path.join(ROOT, "shell", "main.js"), "utf8");
const EXPOSE = ["catalogFolder", "leadsView", "writeReplacing", "unlinkOwn", "copyClear", "storeSyncFolder"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

/* A desk loaded over `ud`, with every module the shell asks to require written down, the app's own handlers kept. */
function loadDesk(ud, src) {
  const said = [], on = {}, invoke = {}, required = [], appOn = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: (ev, fn) => { appOn[ev] = fn; }, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: { openPath: async () => "" },
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8")
    }
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const ret = "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? null : " + n).join(", ") + " };";
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", (src || SRC) + ret)(
    n => { required.push(String(n)); return n === "electron" ? electron : nodeRequire(n); },
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  if (typeof on["etiuda:desk"] === "function") on["etiuda:desk"](eventFor());
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  return { api, ask, said, required, appOn };
}

const pair = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lead-01", public: pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex") };
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const TEAM2 = "t-" + crypto.randomBytes(8).toString("hex");
const ME = "k-" + "a1".repeat(8);
const catalogText = id => JSON.stringify({ format: 2, kind: "etiuda-catalog", id, rev: 1, name: id, date: "2026-04-01",
  langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [{ id: "c-1", shelf: "t-op", bodyShape: "plain", title: { en: "One" }, body: { en: "One." } }] });
const listing = dir => { try { return fs.readdirSync(dir).sort().join(","); } catch { return "no folder"; } };

/* A desk that holds a folder team, as an older build left it: the share is its catalog folder setting, and the mirror holds a copy
   of the team's folder with a catalog the share lacks and an outbox that owes the share something. */
function makeDesk(name) {
  const ud = path.join(LAB, name, "ud"), share = path.join(LAB, name, "share");
  const mirror = path.join(ud, "folder-mirror", TEAM), mirror2 = path.join(ud, "folder-mirror", TEAM2);
  for (const d of [ud, share, mirror, mirror2, path.join(mirror, "desks", ME)]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(share, "share-news.ec"), catalogText("share-news"), "utf8");
  fs.writeFileSync(path.join(mirror, "owed-notes.ec"), catalogText("owed-notes"), "utf8");
  fs.writeFileSync(path.join(mirror, ".outbox.json"), JSON.stringify({ kind: "etiuda-folder-outbox", v: 1,
    owe: { "owed-notes.ec": { owe: true, sha: "0".repeat(64) } }, floors: {} }), "utf8");
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" },
    teamPins: { [TEAM]: LEAD }, teamKeys: { [TEAM]: { "1": "kept" } }, teamEpochSeen: { [TEAM]: 1 }, teamShown: { [TEAM]: { lead: "Ada", folder: share } } }), "utf8");
  return { ud, share, mirror, mirror2, outbox: path.join(mirror, ".outbox.json"), outbox2: path.join(mirror2, ".outbox.json") };
}

const named = s => /syncer|[\\/]folder[\\/]/.test(s);
const lift = (src, tag) => { const lines = src.split("\n"), at = lines.findIndex(l => l.includes("plant:" + tag)); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };

try {
  /* fsg1: the files are not in the tree, and no list that packages or tests the desk names them. */
  const left = fs.existsSync(path.join(ROOT, "shell", "folder")) ? fs.readdirSync(path.join(ROOT, "shell", "folder")) : [];
  check(left.length === 0, "fsg1 shell/folder holds no syncer and no worker: " + JSON.stringify(left));

  const builder = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8"), release = fs.readFileSync(path.join(ROOT, "tools", "release.mjs"), "utf8");
  check(!/shell\/folder\//.test(builder) && !/shell\/folder\//.test(release),
    "fsg2 the builder's file list and the release's expected list name nothing under shell/folder: builder " + /shell\/folder\//.test(builder) + ", release " + /shell\/folder\//.test(release));

  /* fsg3: the shell's own text names none of the machinery. */
  const NAMES = ["FolderSyncer", "folderSyncer", "mirrorOwes", "folderMirrorOf", "heldLocalCopy", "inHeldCopy", "folderOutboxOwes", "deskTrustChecks", "folder-mirror", ".outbox.json", "syncer"];
  const found = NAMES.filter(n => SRC.indexOf(n) >= 0);
  check(found.length === 0, "fsg3 shell/main.js names no syncer, mirror or outbox: " + JSON.stringify(found));

  /* fsg4, fsg5: the desk starts, answers its team rows and quits without requiring a syncer. */
  const A = makeDesk("held");
  const desk = loadDesk(A.ud);
  let rows = null;
  try { rows = (await desk.ask("etiuda:team-join", "leads")).leads; } catch (e) { rows = [{ error: e.message }]; }
  check(!desk.required.some(named), "fsg4 starting the desk and asking its team rows requires no syncer: " + JSON.stringify(desk.required.filter(named)));
  let prevented = false, quitErr = "";
  try { if (desk.appOn["before-quit"]) desk.appOn["before-quit"]({ preventDefault() { prevented = true; } }); } catch (e) { quitErr = e.message; }
  check(!!desk.appOn["before-quit"] && !quitErr && !prevented && !desk.required.some(named),
    "fsg5 a quit flushes no folder team's outbox, waits for none and requires no syncer: " + JSON.stringify({ handler: !!desk.appOn["before-quit"], quitErr, prevented, required: desk.required.filter(named) }));

  /* fsg6: the catalog folder is the person's setting, not the local copy kept for the folder team. */
  let folder = "";
  try { folder = desk.api.catalogFolder(); } catch (e) { folder = "threw " + e.message; }
  check(path.resolve(folder) === path.resolve(A.share), "fsg6 the catalog folder is the share the person set, though a local copy of the team is on disk: " + folder);

  /* fsg7: a team's row says nothing of an outbox, though one is on disk owing a file. */
  const row = Array.isArray(rows) ? rows.filter(r => r && r.team === TEAM)[0] : null;
  check(!!row && !("folderOwed" in row) && !("folderCopy" in row), "fsg7 the held team's row names no outbox and no local copy: " + JSON.stringify(row && Object.keys(row).filter(k => /owed|copy/i.test(k))));

  /* fsg8: the store's sync reads the person's folder with no look at a local copy. */
  let syncRoot = null;
  try { syncRoot = desk.api.storeSyncFolder(); } catch (e) { syncRoot = "threw " + e.message; }
  check(!(typeof syncRoot === "string" && syncRoot && path.resolve(syncRoot) === path.resolve(A.mirror)) && !String(syncRoot).startsWith("threw"),
    "fsg8 the store's sync never takes the local copy as its folder: " + JSON.stringify(syncRoot));

  /* fsg9, fsg10: a write and a removal of the desk's own file under the mirror make no outbox and change none. */
  const before = fs.readFileSync(A.outbox, "utf8");
  let wrote = "";
  try { desk.api.writeReplacing(path.join(A.mirror2, "mine.ec"), catalogText("mine")); wrote = "wrote"; } catch (e) { wrote = "threw " + e.message; }
  check(wrote === "wrote" && fs.existsSync(path.join(A.mirror2, "mine.ec")) && !fs.existsSync(A.outbox2),
    "fsg9 a write of a file under the folder mirror owes nothing to a share, so no outbox is made: " + wrote + ", mirror holds " + listing(A.mirror2));
  let unlinked = "";
  try { desk.api.unlinkOwn(path.join(A.mirror2, "mine.ec")); unlinked = "removed"; } catch (e) { unlinked = "threw " + e.message; }
  check(unlinked === "removed" && !fs.existsSync(path.join(A.mirror2, "mine.ec")) && !fs.existsSync(A.outbox2) && fs.readFileSync(A.outbox, "utf8") === before,
    "fsg10 a removal of the desk's own file under the folder mirror owes nothing either, and the outbox an older build kept is left as it was: " + unlinked + ", mirror " + listing(A.mirror2));

  /* fsg11: nothing the desk did started a worker or wrote under the mirror: the three listings are as they were made. */
  check(listing(A.mirror) === ".outbox.json,desks,owed-notes.ec" && listing(A.share) === "share-news.ec",
    "fsg11 nothing the desk did wrote into the share or the team's mirror: share " + listing(A.share) + ", mirror " + listing(A.mirror));

  /* fsg12 to fsg14: copyClear, the one thing of the syncer a relay team's follow used, is the shell's own: a copy that clears the read-only mark. */
  const C = path.join(LAB, "copy");
  fs.mkdirSync(C, { recursive: true });
  const from = path.join(C, "from.ec"), to = path.join(C, "to.ec");
  fs.writeFileSync(from, "the new bytes", "utf8"); fs.chmodSync(from, 0o444);
  fs.writeFileSync(to, "the old bytes", "utf8"); fs.chmodSync(to, 0o444);
  const old = new Date("2026-01-02T03:04:05Z"); fs.utimesSync(from, old, old);
  const copyAt = (api, dest) => { try { api.copyClear(from, dest); return null; } catch (e) { return e && (e.code || e.message); } };
  const wantable = file => { try { return !!(fs.statSync(file).mode & 0o200); } catch { return false; } };
  const err = copyAt(desk.api, to);
  const copied = !err && fs.readFileSync(to, "utf8") === "the new bytes";
  check(typeof desk.api.copyClear === "function" && copied, "fsg12 copyClear puts the source's bytes over a read-only copy: " + (err || (copied ? "copied" : "not copied")));
  check(copied && wantable(to), "fsg13 the copy it made is writable, the source's read-only mark cleared (a later copy can replace it): mode " + (fs.existsSync(to) ? (fs.statSync(to).mode & 0o777).toString(8) : "absent"));
  check(copied && (process.platform === "win32" || Math.abs(fs.statSync(to).mtimeMs - old.getTime()) < 2000), "fsg14 it keeps the source's last-write time off Windows, as the file copy does on Windows: " + (fs.existsSync(to) ? fs.statSync(to).mtime.toISOString() : "absent"));

  /* fsg15: each deciding line of copyClear, lifted alone, turns its check red. */
  const plantRed = (tag, judge) => {
    const lifted = lift(SRC, tag);
    if (lifted === null) return "plant line absent";
    fs.mkdirSync(path.join(LAB, "plant-" + tag, "ud"), { recursive: true });
    const d = loadDesk(path.join(LAB, "plant-" + tag, "ud"), lifted);
    const dest = path.join(LAB, "plant-" + tag, "to.ec");
    fs.writeFileSync(dest, "the old bytes", "utf8"); fs.chmodSync(dest, 0o444);
    const e = copyAt(d.api, dest);
    return judge(e, dest) ? "the check lifted" : "the check still held";
  };
  if (PLANTS_OFF) skip("fsg15 lifting plant:copy-clear-mark or plant:copy-clear-time turns fsg13 or fsg14 red");
  else {
    const mark = plantRed("copy-clear-mark", (e, dest) => !!e || !wantable(dest));
    const time = process.platform === "win32" ? "the check lifted" : plantRed("copy-clear-time", (e, dest) => !!e || Math.abs(fs.statSync(dest).mtimeMs - old.getTime()) >= 2000);
    check(mark === "the check lifted" && time === "the check lifted", "fsg15 lifting plant:copy-clear-mark turns fsg13 red, and plant:copy-clear-time fsg14 off Windows: " + JSON.stringify({ mark, time }));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
