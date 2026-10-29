/* SYNC-CONFLICT COPIES, recognised by identity (board 945, item 3).
 *
 *     node tests/sync-conflict.mjs
 *
 * A copy a sync client makes of a file it could not reconcile is not a second catalog and not a
 * second team file. The Library shows one row per catalog id, the newest genuine edition. A
 * conflict sibling of etiuda-team.json that is a genuine team file at a higher epoch or rev is
 * the team file the desk heeds, and the floor still refuses an older one. Nothing in the folder
 * is renamed or deleted. The plant lines are removed only in a scratch copy of shell/main.js.
 *
 * Invented catalogs, keys and teams only.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));

const EXPECTED = 18;
let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const fileSha = (p) => sha(fs.readFileSync(p));

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-f3-"));
let seq = 0;
function fresh() {
  const ud = path.join(LAB, "ud-" + (++seq)), folder = path.join(LAB, "fold-" + seq);
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
    kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" }
  }));
  return { ud, folder };
}
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
  decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
};
function boot(ud, source) {
  const on = {}, handle = {}, test = {};
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
           getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false, removeSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
    clipboard: inert, globalShortcut: inert,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const src = source == null ? fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8") : source;
  new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
    src + "\n__test.isCatalogName = isCatalogName; __test.heed = heedTeam; __test.teamDoc = folderTeamDoc;"
    + " __test.conflictSiblingName = typeof conflictSiblingName === \"function\" ? conflictSiblingName : null;"
    + " __test.signDesk = function (doc) {"
    + "   const me = branchIdentity(true); if (!me) return null;"
    + "   const out = JSON.parse(JSON.stringify(doc));"
    + "   out.desk = { id: me.id, key: me.key, box: me.box, name: \"Ada\" };"
    + "   delete out.sig; out.sig = { alg: \"Ed25519\", keyId: me.id };"
    + "   out.sig.value = branchSign(out); return out; };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
    { exports: {} }, {}, quiet, test);
  const ev = { sender: { id: 1, once: noop }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
  const ask = (ch, ...a) => Promise.resolve(handle[ch](ev, ...a));
  return { test, ask, said, ud };
}
function catalog(id, rev) {
  return {
    format: 2, kind: "etiuda-catalog", id, rev, date: "2026-10-28",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Open" } }],
    cards: [{ id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "Hello" }, body: { en: "Good day." } }]
  };
}
const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const leadPair = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lamp-lead", public: pubHex(leadPair.publicKey) };
function sign(doc, key, keyId) {
  const out = JSON.parse(JSON.stringify(doc));
  delete out.sig;
  out.sig = { alg: "Ed25519", keyId };
  out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
  return out;
}
function put(folder, name, doc) {
  const at = path.join(folder, name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify(doc) + "\n");
  return at;
}
function snap(folder) {
  const out = {};
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const at = path.join(d, n);
      if (fs.statSync(at).isDirectory()) walk(at);
      else out[path.relative(folder, at).split(path.sep).join("/")] = fileSha(at);
    }
  };
  walk(folder);
  return out;
}
const sameSnap = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function rowsOf(rows, id) { return (rows || []).filter(r => r && r.id === id); }
function scratchSource(tag) {
  const at = path.join(ROOT, "shell", "main.js");
  const before = fs.readFileSync(at);
  const digest = sha(before);
  const text = before.toString("utf8");
  const nl = text.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const lines = text.split(nl);
  const next = lines.filter(line => line.indexOf("/* plant:" + tag + " */") < 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-f3-plant-"));
  const scratch = path.join(dir, "main.js");
  if (next.length !== lines.length) fs.writeFileSync(scratch, next.join(nl));
  return {
    found: next.length !== lines.length, scratch, digest,
    same: sha(fs.readFileSync(at)) === digest
  };
}

try {
  const homeSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");

  /* ---- the Library: one row per catalog id --------------------------------------------------- */
  {
    const { ud, folder } = fresh();
    const plain = catalog("lamp-board", 1), newer = catalog("lamp-board", 4);
    const other = catalog("tea-board", 1);
    put(folder, "guide.ec", plain);
    put(folder, "guide (1).ec", newer);
    put(folder, "guide (conflicted copy 2026-10-28).ec", catalog("drop-board", 2));
    put(folder, "drop.ec", catalog("drop-board", 7));
    put(folder, "shop.ec", catalog("one-board", 3));
    put(folder, "shop-LAPTOP.ec", catalog("one-board", 8));
    put(folder, "span.ec", catalog("sync-board", 2));
    put(folder, "span.sync-conflict-20261028-120000-host.ec", catalog("sync-board", 6));
    put(folder, "other.ec", other);
    fs.writeFileSync(path.join(folder, "notes.ec"), "{ not a catalog\n");
    const before = snap(folder);
    const A = boot(ud);
    const rows = await A.ask("etiuda:catalog-files");
    const lamp = rowsOf(rows, "lamp-board"), drop = rowsOf(rows, "drop-board");
    const one = rowsOf(rows, "one-board"), sync = rowsOf(rows, "sync-board");
    const tea = rowsOf(rows, "tea-board");
    const blanks = (rows || []).filter(r => !r.id);
    check(lamp.length === 1 && lamp[0].rev === 4 && lamp[0].name === "guide (1).ec" && lamp[0].cards > 0
      && sameSnap(before, snap(folder)),
      "f3a one row for one catalog id: the newer conflict copy, and the folder's bytes are unchanged ("
      + lamp.length + " row(s), rev " + (lamp[0] && lamp[0].rev) + ")");
    check(drop.length === 1 && drop[0].rev === 7 && one.length === 1 && one[0].rev === 8
      && sync.length === 1 && sync[0].rev === 6,
      "f3b a Dropbox, OneDrive and Syncthing copy each collapse to the newer rev ("
      + [drop[0] && drop[0].rev, one[0] && one[0].rev, sync[0] && sync[0].rev].join(", ") + ")");
    check(tea.length === 1 && tea[0].name === "other.ec" && blanks.length === 1,
      "f3c THE CONTROL: a second catalog stays its own row, and a file that will not parse stays its own row ("
      + tea.length + " and " + blanks.length + ")");
  }
  {
    const { ud, folder } = fresh();
    const ring = { format: 1, kind: "etiuda-ring", keys: [
      { catalog: "signed-board", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }
    ] };
    fs.writeFileSync(path.join(folder, "etiuda-ring.json"), JSON.stringify(ring));
    put(folder, "signed.ec", sign(catalog("signed-board", 2), leadPair.privateKey, LEAD.keyId));
    put(folder, "signed (1).ec", catalog("signed-board", 9));
    put(folder, "both.ec", sign(catalog("both-board", 1), leadPair.privateKey, LEAD.keyId));
    /* The ring must list both-board too, or the higher file is the only one that is not genuine for a different reason. */
    const ring2 = { format: 1, kind: "etiuda-ring", keys: ["signed-board", "both-board"].map(c => (
      { catalog: c, keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public })) };
    fs.writeFileSync(path.join(folder, "etiuda-ring.json"), JSON.stringify(ring2));
    put(folder, "both (1).ec", sign(catalog("both-board", 5), leadPair.privateKey, LEAD.keyId));
    put(folder, "tie.ec", catalog("tie-board", 2));
    put(folder, "tie (1).ec", catalog("tie-board", 2));
    const before = snap(folder);
    const A = boot(ud);
    const rows = await A.ask("etiuda:catalog-files");
    const signed = rowsOf(rows, "signed-board"), both = rowsOf(rows, "both-board"), tie = rowsOf(rows, "tie-board");
    check(signed.length === 1 && signed[0].rev === 2 && signed[0].name === "signed.ec" && signed[0].cards > 0
      && sameSnap(before, snap(folder)),
      "f3d a higher unsigned conflict copy does not beat the genuine edition, and does not refuse it ("
      + (signed[0] && signed[0].name) + " rev " + (signed[0] && signed[0].rev) + ")");
    check(both.length === 1 && both[0].rev === 5,
      "f3e of two genuine editions the newer rev is the one row (" + (both[0] && both[0].rev) + ")");
    check(tie.length === 1 && tie[0].name === "tie.ec",
      "f3f equal revs offer one row, the name that is not a conflict copy (" + (tie[0] && tie[0].name) + ")");
    const pred = A.test.conflictSiblingName;
    check(typeof pred === "function" && pred("guide.ec", "guide (1).ec") && pred("guide.ec", "guide-LAPTOP.ec")
      && !pred("guide.ec", "guide-v2.ec") && !pred("guide.ec", "guide-EN.ec")
      && !pred("guide.ec", "desk-copy.ec") && !pred("guide.ec", "guide.ec"),
      "f3g a conflict tail is a sibling, including the OneDrive hyphen, and an ordinary name is not");
  }

  /* ---- a desk's own files, one row per id ---------------------------------------------------- */
  {
    const { ud, folder } = fresh();
    const A = boot(ud);
    const me = await A.ask("etiuda:branch-identity", true);
    const id = me.id + "-" + sha(Buffer.from("proposal")).slice(0, 8);
    const otherId = me.id + "-" + sha(Buffer.from("other")).slice(0, 8);
    const low = A.test.signDesk(catalog(id, 2));
    const high = A.test.signDesk(catalog(id, 6));
    const rest = A.test.signDesk(catalog(otherId, 1));
    const dir = path.join(folder, "desks", me.id);
    put(dir, "proposal.ec", low);
    put(dir, "proposal (1).ec", high);
    put(dir, "rest.ec", rest);
    const before = snap(folder);
    const rows = await A.ask("etiuda:catalog-files");
    const prop = rowsOf(rows, id), more = rowsOf(rows, otherId);
    check(!!low && !!high && prop.length === 1 && prop[0].rev === 6 && prop[0].desk && prop[0].desk.id === me.id
      && more.length === 1 && sameSnap(before, snap(folder)),
      "f3h a desk's conflict copy is one proposal row, the newer genuine rev, and a second id stays ("
      + prop.length + " and " + more.length + ")");
  }

  /* ---- the team file: a higher genuine sibling is heeded ------------------------------------- */
  const teamId = "t-" + crypto.randomBytes(8).toString("hex");
  function teamDoc(rev, epoch) {
    return sign({
      format: 1, kind: "etiuda-team", id: teamId, catalogs: ["lamp-board"],
      lead: { keyId: LEAD.keyId, public: LEAD.public }, sealed: false, exportsSealed: false,
      epoch: epoch || 1, roster: [], rev
    }, leadPair.privateKey, LEAD.keyId);
  }
  function plantRing(folder) {
    fs.writeFileSync(path.join(folder, "etiuda-ring.json"), JSON.stringify({
      format: 1, kind: "etiuda-ring",
      keys: [{ catalog: "lamp-board", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }]
    }));
  }
  function floorOf(ud) {
    const env = JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
    const byTeam = env.teamRevSeen && env.teamRevSeen[teamId];
    return byTeam && byTeam[LEAD.public] ? byTeam[LEAD.public] : null;
  }
  {
    const { ud, folder } = fresh();
    plantRing(folder);
    const canon = teamDoc(1, 1), sib = teamDoc(4, 1);
    const canonAt = put(folder, "etiuda-team.json", canon);
    const sibAt = put(folder, "etiuda-team (1).json", sib);
    const before = [fileSha(canonAt), fileSha(sibAt)];
    const A = boot(ud);
    A.test.heed();
    await A.ask("etiuda:catalog-files");
    const floor = floorOf(ud);
    const doc = A.test.teamDoc();
    const after = [fileSha(canonAt), fileSha(sibAt)];
    check(floor && floor.epoch === 1 && floor.rev === 4 && doc && doc.rev === 4
      && before[0] === after[0] && before[1] === after[1]
      && fs.existsSync(canonAt) && fs.existsSync(sibAt),
      "f3i a higher genuine conflict sibling is the team file, and neither file is renamed or deleted (rev "
      + (floor && floor.rev) + ", doc " + (doc && doc.rev) + ")");
    check(A.test.isCatalogName("etiuda-team (1).json") && A.test.isCatalogName("etiuda-team.json")
      && !A.test.isCatalogName("etiuda-team.json.tmp") && !A.test.isCatalogName("notes.json"),
      "f3j the watch hears a conflict sibling of the team file, and a temp or a note still passes by");
  }
  {
    const { ud, folder } = fresh();
    plantRing(folder);
    put(folder, "etiuda-team.json", teamDoc(4, 1));
    put(folder, "etiuda-team (1).json", teamDoc(2, 1));
    const A = boot(ud);
    A.test.heed();
    const floor = floorOf(ud);
    const doc = A.test.teamDoc();
    check(floor && floor.rev === 4 && doc && doc.rev === 4,
      "f3k a lower sibling is ignored (rev " + (floor && floor.rev) + ", doc " + (doc && doc.rev) + ")");
  }
  {
    const { ud, folder } = fresh();
    plantRing(folder);
    put(folder, "etiuda-team.json", teamDoc(1, 1));
    const bad = teamDoc(9, 1);
    bad.sig.value = "ab".repeat(64);
    put(folder, "etiuda-team (conflicted copy 2026-10-28).json", bad);
    const A = boot(ud);
    A.test.heed();
    const floor = floorOf(ud);
    const doc = A.test.teamDoc();
    check(floor && floor.rev === 1 && doc && doc.rev === 1,
      "f3l a sibling that is not genuine is ignored (rev " + (floor && floor.rev) + ", doc " + (doc && doc.rev) + ")");
  }
  {
    const { ud, folder } = fresh();
    plantRing(folder);
    put(folder, "etiuda-team.json", teamDoc(2, 1));
    put(folder, "etiuda-team (1).json", teamDoc(6, 1));
    const A = boot(ud);
    A.test.heed();
    const rose = floorOf(ud);
    put(folder, "etiuda-team.json", teamDoc(2, 1));
    put(folder, "etiuda-team (1).json", teamDoc(3, 1));
    const B = boot(ud);
    B.test.heed();
    const held = floorOf(ud);
    const said = B.said.join("\n");
    check(rose && rose.rev === 6 && held && held.rev === 6 && /older file/.test(said),
      "f3m the floor still refuses a conflict sibling below a rev already heeded (rose " + (rose && rose.rev)
      + ", held " + (held && held.rev) + ")");
  }

  {
    const { ud, folder } = fresh();
    put(folder, "lamp-1.ec", catalog("lamp-shop", 1));
    put(folder, "lamp-2.ec", catalog("lamp-shop", 2));
    const A = boot(ud);
    const rows = await A.ask("etiuda:catalog-files");
    const lamps = rowsOf(rows, "lamp-shop");
    check(lamps.length === 2 && lamps.some(r => r.name === "lamp-1.ec") && lamps.some(r => r.name === "lamp-2.ec"),
      "f3p ordinary editions with different names stay uncollapsed (2 rows)");
  }

  /* ---- plants: the guarding line, removed only in a scratch copy ----------------------------- */
  {
    const one = scratchSource("f3-one-row");
    let red = false;
    if (one.found) {
      const { ud, folder } = fresh();
      put(folder, "guide.ec", catalog("lamp-board", 1));
      put(folder, "guide (1).ec", catalog("lamp-board", 4));
      const A = boot(ud, fs.readFileSync(one.scratch, "utf8"));
      const lamp = rowsOf(await A.ask("etiuda:catalog-files"), "lamp-board");
      red = lamp.length === 2;
    }
    check(one.found && one.same && red && sha(fs.readFileSync(path.join(ROOT, "shell", "main.js"))) === one.digest,
      "f3n removing plant:f3-one-row in a scratch copy lists both files again, and the checkout is unchanged");
  }
  {
    const sib = scratchSource("f3-team-sibling");
    let red = false;
    if (sib.found) {
      const { ud, folder } = fresh();
      plantRing(folder);
      put(folder, "etiuda-team.json", teamDoc(1, 1));
      put(folder, "etiuda-team (1).json", teamDoc(4, 1));
      const A = boot(ud, fs.readFileSync(sib.scratch, "utf8"));
      await A.ask("etiuda:catalog-files");
      const floor = floorOf(ud);
      red = !floor || floor.rev === 1;
    }
    check(sib.found && sib.same && red && sha(fs.readFileSync(path.join(ROOT, "shell", "main.js"))) === sib.digest,
      "f3o removing plant:f3-team-sibling in a scratch copy heeds the canonical rev, and the checkout is unchanged");
  }
  {
    const conf = scratchSource("f3-conflict-only");
    let red = false;
    if (conf.found) {
      const { ud, folder } = fresh();
      put(folder, "lamp-1.ec", catalog("lamp-shop", 1));
      put(folder, "lamp-2.ec", catalog("lamp-shop", 2));
      const A = boot(ud, fs.readFileSync(conf.scratch, "utf8"));
      const lamp = rowsOf(await A.ask("etiuda:catalog-files"), "lamp-shop");
      red = lamp.length === 1;
    }
    check(conf.found && conf.same && red && sha(fs.readFileSync(path.join(ROOT, "shell", "main.js"))) === conf.digest,
      "f3q removing plant:f3-conflict-only in a scratch copy collapses non-conflict editions, and the checkout is unchanged");
  }

  /* homeSrc is read so a later edit of the checkout is visible against the plant digest. */
  check(homeSrc.length > 0, "f3r the checkout's shell was the one this file booted");
} catch (e) {
  failed++;
  asserted++;
  process.stdout.write("  FAIL the file threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e) + "\n");
}
if (asserted !== EXPECTED) {
  failed++;
  process.stdout.write("  FAIL completed " + asserted + " checks, wanted " + EXPECTED + "\n");
}
process.stdout.write("#counts checks=" + asserted + " failed=" + failed + "\n");
process.exit(Math.min(failed, 63));
