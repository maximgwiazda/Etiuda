/* A share's catalog watch drops events and never says so. Where the folder is not this computer's
 * own disk, a stat on an interval is what notices a change, and an unchanged file is not a reload.
 * A folder on this computer's own disk keeps the watch alone. A read that does not return is one
 * look: the ask's limit does not start another, and the share is marked not answering.
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
const EXPECTED = 12;
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
    ? "return { watchCatalog, shareStatTick, catalogChanged, SHARE_STAT_MS, folderHost, shareDropsWatch, spyHost(f) { const was = folderHost; folderHost = function () { f(); return was.apply(this, arguments); }; }, get shareStatPrime() { return shareStatPrime; }, get folderDown() { return folderDown; }, liftDown() { folderDown = \"\"; folderSaidDown = \"\"; } };"
    : "return { watchCatalog, catalogChanged, folderHost, shareDropsWatch };";
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
/* The ask's timer is unref'd, and a stand-in read never settles, so the wait has to keep the loop. */
const until = p => {
  let timer = null;
  const cap = new Promise(r => { timer = setTimeout(() => r("cap"), 30000); });
  return Promise.race([p, cap]).finally(() => clearTimeout(timer));
};
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

  /* folderHost on Linux, handed a mounts text and a stand-in disk: a row is false where the rule does not hold. */
  function linuxMountChecks(api) {
    const tab = (...rows) => () => ["rootfs / rootfs rw 0 0", "/dev/nvme0n1p2 / ext4 rw,relatime 0 0"].concat(rows).join("\n");
    const links = { "/home/alice/linked": "/srv/nas/catalogs", "/home/alice/data": "../../data/team" };
    const asked = [];
    const io = (mounts, link) => ({ platform: "linux", mounts: mounts,
      link: link || (p => { asked.push(p); return links[p] || null; }) });
    const lx = (folder, mounts, link) => api.folderHost(folder, {}, io(mounts, link)).local;
    const home = "/home/alice/catalogs";
    const gone = p => { if (p === "/home/alice/new") { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; } return null; };
    const denied = () => { const e = new Error("EACCES"); e.code = "EACCES"; throw e; };
    const rows = {
      ext4: lx(home, tab()) === true,
      ext4Watch: api.shareDropsWatch(home, {}, io(tab())) === false,
      rclone: lx(home, tab("rclone:team /home/alice/catalogs fuse.rclone rw 0 0")) === false,
      cifsWatch: api.shareDropsWatch(home, {}, io(tab("//nas/share /home/alice/catalogs cifs rw 0 0"))) === true,
      sshfsAbove: lx(home, tab("me@nas:/ /home/alice fuse.sshfs rw 0 0")) === false,
      fuseblk: lx(home, tab("/dev/sda3 /home fuseblk rw 0 0")) === false,
      diskUnderNfs: lx(home, tab("srv:/home /home nfs4 rw 0 0", "/dev/sdb1 /home/alice/catalogs xfs rw 0 0")) === false,
      diskOverDisk: lx(home, tab("/dev/sdb1 /home xfs rw 0 0", "tmpfs /home/alice/catalogs tmpfs rw 0 0")) === true,
      escaped: lx("/media/alice/My Disk/team", tab("/dev/sdc1 /media/alice/My\\040Disk vfat rw 0 0")) === true,
      linkToDisk: lx("/home/alice/data", tab("/dev/sdd1 /data btrfs rw 0 0")) === true,
      linkToNfs: lx("/home/alice/linked", tab("srv:/nas /srv/nas nfs4 rw 0 0")) === false,
      neverAskedNfs: asked.length > 0 && asked.every(p => p !== "/srv/nas" && p.indexOf("/srv/nas/") !== 0),
      notYetThere: lx("/home/alice/new/team", tab(), gone) === true,
      linkUnread: lx(home, tab(), denied) === false,
      mountsThrow: lx(home, () => { throw new Error("ENOENT"); }) === false,
      mountsNull: lx(home, () => null) === false,
      cloud: api.folderHost("/home/alice/Dropbox/team", {}, io(tab())).cloud === "dropbox"
        && lx("/home/alice/Dropbox/team", tab()) === false,
      winSys: api.folderHost("C:\\Users\\alice\\catalogs", { SystemDrive: "C:" }, { platform: "win32" }).local === true,
      winOther: api.folderHost("D:\\catalogs", { SystemDrive: "C:" }, { platform: "win32" }).local === false,
      winUnc: api.folderHost("\\\\nas\\catalogs", { SystemDrive: "C:" }, { platform: "win32" }).host === "nas",
      winSlash: api.folderHost(home, {}, Object.assign(io(tab()), { platform: "win32" })).local === false,
      mac: api.folderHost(home, {}, Object.assign(io(tab()), { platform: "darwin" })).local === false
    };
    const off = Object.keys(rows).filter(k => !rows[k]);
    return { ok: off.length === 0, off: off };
  }
  /* A tick on an armed share asks nothing of where the folder sits: that was decided when the stat was armed. */
  let tickSeq = 0;
  async function tickAsksNoHost() {
    const box = await watchOf("f2-tick-" + (++tickSeq), true);
    let calls = 0;
    box.D.api.spyHost(() => { calls++; });
    await box.D.api.shareStatTick(box.D.win);
    silence(box.from);
    return box.interval.length === 1 && calls === 0;
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
    const lx = linuxMountChecks(local.D.api);
    const tickQuiet = await tickAsksNoHost();
    check(cloud.interval.length === 1 && String(cloud.interval[0].fn).includes("shareStatTick")
      && cloud.watched && local.interval.length === 0 && local.watched && quiet
      && cloud.D.api.SHARE_STAT_MS === SHARE_WANT
      && (process.platform !== "win32" || local.dir.slice(0, 2).toLowerCase() === "c:")
      && lx.ok && tickQuiet,
      "f2a a cloud-shaped folder arms a 30s stat and a folder on this disk does not, and a silent watch offers nothing there;"
      + " on Linux a folder on this computer's own disk is local by its mount and a network, FUSE or unread one is not, a tick asking nothing"
      + " (cloud " + cloud.interval.length + ", local " + local.interval.length + ", watched " + cloud.watched + "/" + local.watched
      + ", quiet " + quiet + ", linux rows off " + JSON.stringify(lx.off) + ", tick quiet " + tickQuiet + ")");
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

  /* A stand-in readdir that never settles. Three ticks, each waited out, start one read on a held
     look and three on a look that drops its hold at the ask's limit. */
  const realReaddir = fsMod.promises.readdir.bind(fsMod.promises);
  async function hungScene(tag) {
    const pending = [];
    let reads = 0;
    let stubbed = false;
    let from = 0;
    try {
      const box = await watchOf("f2f-" + tag, true);
      from = box.from;
      fsMod.promises.readdir = (dir, opts) => {
        reads++;
        return new Promise((resolve, reject) => pending.push({ dir: dir, opts: opts, resolve: resolve, reject: reject }));
      };
      stubbed = true;
      const first = await until(box.D.api.shareStatTick(box.D.win));
      const downLines = box.D.said.filter(s => s.indexOf("did not answer, so it is read as empty until it does") >= 0).length;
      const marked = box.D.api.folderDown === box.dir && downLines === 1;
      /* The down flag would hide a flight that had already been dropped, so the later ticks run with it lifted. */
      box.D.api.liftDown();
      const second = await until(box.D.api.shareStatTick(box.D.win));
      const third = await until(box.D.api.shareStatTick(box.D.win));
      if (first === "cap" || second === "cap" || third === "cap") throw new Error("a tick did not settle");
      box.D.api.watchCatalog(box.D.win);
      const mid = reads;
      const held = pending.splice(0, pending.length);
      await Promise.all(held.map(p => (p.opts === undefined ? realReaddir(p.dir) : realReaddir(p.dir, p.opts)).then(p.resolve, p.reject)));
      let again = false;
      for (let i = 0; i < 1500 && !again; i++) {
        const before = reads;
        box.D.api.shareStatTick(box.D.win);
        again = reads === before + 1;
        if (!again) await pause(20);
      }
      const opened = again && box.D.api.folderDown === "";
      return { one: mid === 1, marked: marked, opened: opened, again: again && reads === mid + 1, mid: mid, reads: reads, downLines: downLines };
    } finally {
      if (stubbed) fsMod.promises.readdir = realReaddir;
      pending.splice(0).forEach(p => { try { p.reject(new Error("dropped")); } catch { /* already settled */ } });
      silence(from);
    }
  }

  /* ---- f2f: three ticks, one read; a timeout marks the share not answering; a settled read may look - */
  try {
    const r = await hungScene("live");
    check(r.one && r.marked && r.opened && r.again,
      "f2f three ticks and a re-arm start one read while it is still out, the down flag lifted included, a timed-out look marks the share not answering, and once that read returns the next tick may look"
      + " (mid " + r.mid + ", reads " + r.reads + ", down " + r.marked + "/" + r.downLines + ", open " + r.opened + ", again " + r.again + ")");
  } catch (e) {
    check(false, "f2f the leg did not finish: " + (e && e.message || e));
  }

  /* ---- f2g: removing the hold lets the ask's limit start another read -------------------------------- */
  {
    const g = await prove("f2g",
      "if (shareStatBusy || shareStatOut) return Promise.resolve(false); /* plant:f2-share-hung */",
      "/* plant:f2-share-hung */",
      async () => {
        const r = await hungScene("plant");
        return r.one && r.marked && r.opened && r.again;
      });
    check(g.ok, "f2g removing the hold at the ask's limit starts a read per tick, and restoring it keeps the one read"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2h ---- */
  {
    const g = await prove("f2h",
      "const disk = p => LINUX_DISK_FS.has(linuxMountType(table, p || \"/\")); /* plant:f2-linux-local */",
      "const disk = p => true; /* plant:f2-linux-local */",
      async () => linuxMountChecks(loadDesk(LAB).api).ok);
    check(g.ok, "f2h taking every filesystem as this computer's disk marks FUSE, network and stacked mounts local, and restoring it holds"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2i ---- */
  {
    const g = await prove("f2i",
      "&& (!best || m.at.length >= best.at.length)) best = m; /* plant:f2-linux-mount */",
      "&& !best) best = m; /* plant:f2-linux-mount */",
      async () => linuxMountChecks(loadDesk(LAB).api).ok);
    check(g.ok, "f2i taking the first mount that holds a folder, not the longest, misses a mount stacked over the disk, and restoring it holds"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2j ---- */
  {
    const g = await prove("f2j",
      "  } catch { return false; } /* plant:f2-linux-unread */",
      "  } catch { return true; } /* plant:f2-linux-unread */",
      async () => linuxMountChecks(loadDesk(LAB).api).ok);
    check(g.ok, "f2j a mounts read that fails taken as local leaves a folder unwatched where nothing is known, and restoring it holds"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2k ---- */
  {
    const g = await prove("f2k",
      "    if (!disk(next)) return false; /* plant:f2-linux-walk */",
      "    /* plant:f2-linux-walk */",
      async () => linuxMountChecks(loadDesk(LAB).api).ok);
    check(g.ok, "f2k following a folder's links into a network mount asks that mount for a stat, and restoring it holds"
      + (g.why ? ": " + g.why.split("\n")[0] : "") + (g.red === false ? " (plant did not fail)" : ""));
  }

  /* ---- f2l ---- */
  {
    const g = await prove("f2l",
      "dir !== shareStatFor && !shareDropsWatch(dir) || !folderAnswers(dir)) return Promise.resolve(false); /* plant:f2-share-decided */",
      "!shareDropsWatch(dir) || !folderAnswers(dir)) return Promise.resolve(false); /* plant:f2-share-decided */",
      tickAsksNoHost);
    check(g.ok, "f2l a tick that decides again where the folder sits reads the mounts every 30s, and restoring it holds"
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
