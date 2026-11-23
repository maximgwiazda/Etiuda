/* The desk's history of its catalogs, in bare node: shell/main.js under a stubbed electron, with a user-data folder
 * and a documents folder of its own in the system's temp, and every catalog invented here. What it holds: a catalog
 * the desk reads or writes is kept once per content, beside desk.json and never in the catalog folder; a colleague's
 * file is not kept; a version stays 30 days after it was last seen, the newest of each file longer, and the cap takes
 * the longest unseen first; the list and the open, and which rows offer a putting back, which a signed or sealed catalog
 * never gets; the shell writes nothing back into the catalog folder; and an index that will not read loses nothing. The page's half is the grouping and the
 * acts each row offers, imported from src/modules/catalog-history.js.
 *
 *   node tests/catalog-history.mjs      exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
/* Every reg call is answered by the stand-in, the policy key as not there, so no read of this machine's registry fails into a wait
   for machine policy (tests/reg-stand.cjs; review 09, finding 4). */
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 29 + (process.env.ETIUDA_PLANTS === "off" ? 0 : 2);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");
const DAY = 24 * 60 * 60 * 1000;

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-history-"));
const UD = path.join(BASE, "user-data"), DOCS = path.join(BASE, "documents"), FOLDER = path.join(DOCS, "Etiuda");
const ELSEWHERE = path.join(BASE, "elsewhere");
[UD, FOLDER, ELSEWHERE].forEach(d => fs.mkdirSync(d, { recursive: true }));
const HIST = path.join(UD, "catalog-history");

/* ---- electron, as small as main.js needs ------------------------------------------------------------------------ */
const said = [];
const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: () => {} };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
  decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
};
/* One evaluation of main.js is one run of the app: its handlers, and a line appended to its body that hands over what
   a leg needs to reach. A second boot over the same folders is the next launch. */
function boot(src) {
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
    (src || fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8"))
    + "\n__test.catalogChanged = catalogChanged; __test.teamKeys = teamKeys;"
    + " __test.historyKept = typeof historyKept === \"function\" ? historyKept : null;"
    + " __test.relayHere = function() { return relayHere(); };"
    + " __test.bindRelay = function(team, pinPublic, rt) {"
    + " if (deskKeys === undefined) deskKeys = {};"
    + " teamPins[team] = { keyId: \"lead-key\", public: pinPublic };"
    + " teamPinFrom[team] = \"invite\";"
    + " teamJoin = { team: team, file: \"\", nonce: \"aa\".repeat(16), commit: \"bb\".repeat(16), asked: 1, held: 1, name: \"Desk\","
    + " invite: { id: \"cc\".repeat(4), proof: \"dd\".repeat(16), lead: { keyId: \"lead-key\", public: pinPublic, name: \"Lead\" }, pinned: true,"
    + " relay: { rt: rt, url: \"https://etiuda.dev/relay/v1\", inv: \"ee\".repeat(8), token: \"tok\", seal: \"sea\" } } };"
    + " };"
    + " __test.setFolder = v => { if (deskKeys === undefined) deskKeys = readDesk(); deskKeys[CATALOG_FOLDER_KEY] = v; };"
    + " __test.keepHist = function(file, text) { return historyKeep(file, text, false); };")(
    n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
    { exports: {} }, {}, quiet, test);
  const ev = { sender: { id: 1, once: noop }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
  return {
    test: test,
    read: () => { const e = Object.assign({}, ev); on["etiuda:catalog"](e); return e.returnValue; },
    ask: (ch, ...a) => (handle[ch] ? Promise.resolve(handle[ch](ev, ...a)) : Promise.resolve(undefined)),
  };
}

/* ---- catalogs, written from nothing -------------------------------------------------------------------------------- */
function catalog(id, rev, word, extra) {
  return JSON.stringify(Object.assign({
    format: 2, kind: "etiuda-catalog", id: id, rev: rev, date: "2026-10-0" + Math.min(rev, 9),
    langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: ["a", "b"].map(x => ({ id: "c-" + x, shelf: "t-op", bodyShape: "plain", title: { en: word + " " + x }, body: { en: "Body " + x + "." } }))
  }, extra || {}), null, 1) + "\n";
}
// A signature's shape only: the history reads whether a catalog carries one, never whether it verifies.
const SIGNED = { sig: { alg: "Ed25519", keyId: "studio-0123456789abcdef", value: "ab".repeat(64) } };
const listing = dir => { try { return fs.readdirSync(dir).sort(); } catch { return []; } };
const index = () => { try { return JSON.parse(fs.readFileSync(path.join(HIST, "index.json"), "utf8")).versions; } catch { return null; } };
const blobs = () => listing(HIST).filter(n => /^[0-9a-f]{64}\.gz$/.test(n));
const unzip = s => { try { return zlib.gunzipSync(fs.readFileSync(path.join(HIST, s + ".gz"))); } catch { return Buffer.alloc(0); } };
const of = file => (index() || []).filter(v => v.path === path.resolve(file));
const write = (file, text, at) => { fs.writeFileSync(file, text); if (at) fs.utimesSync(file, at / 1000, at / 1000); };

try {
  let A = boot();
  const SHOP = path.join(FOLDER, "shop.ec"), OTHER = path.join(FOLDER, "other.ec");
  const shop1 = catalog("shop", 1, "Hello");
  write(SHOP, shop1);
  const stamp0 = fs.statSync(SHOP).mtimeMs;
  A.read();
  await tick(5);
  const v1 = of(SHOP);
  check(v1.length === 1 && blobs().length === 1 && Buffer.compare(unzip(v1[0].sha), Buffer.from(shop1)) === 0 && v1[0].sha === sha(Buffer.from(shop1)),
    "1a a catalog the desk reads from its folder is kept: one version for the file, one copy, and the copy is the file's bytes exactly ("
    + v1.length + " version(s), " + blobs().length + " cop(ies))");
  check(listing(FOLDER).join() === "shop.ec" && fs.readFileSync(SHOP, "utf8") === shop1 && fs.statSync(SHOP).mtimeMs === stamp0
    && fs.existsSync(path.join(UD, "catalog-history", "index.json")),
    "1b THE CONTROL: the history sits in the user-data folder, and the catalog folder holds what it held, its file's bytes and time untouched ("
    + listing(FOLDER).join() + ")");

  A.test.catalogChanged(null); A.read();
  await tick(5);
  check(of(SHOP).length === 1 && blobs().length === 1,
    "1c read twice more, the same bytes keep no second version and no second copy (" + of(SHOP).length + ", " + blobs().length + ")");

  const shop2 = catalog("shop", 2, "Welcome");
  write(SHOP, shop2, Date.now() + 2000);
  A.test.catalogChanged(null);
  await tick(5);
  const v2 = of(SHOP).sort((a, b) => a.first - b.first);
  check(v2.length === 2 && Buffer.compare(unzip(v2[0].sha), Buffer.from(shop1)) === 0 && Buffer.compare(unzip(v2[1].sha), Buffer.from(shop2)) === 0,
    "1d a new edition over the same file is a second version, and the first is still its own bytes exactly (" + v2.length + " versions)");

  write(OTHER, catalog("other", 1, "Other"), Date.now() - 60000);
  const theirs = path.join(FOLDER, "desks", "k-0123456789abcdef");
  fs.mkdirSync(theirs, { recursive: true });
  const THEIRS = path.join(theirs, "shop-0a0b0c0d.ec");
  write(THEIRS, catalog("k-0123456789abcdef-0a0b0c0d", 1, "Theirs", { desk: { id: "k-0123456789abcdef", key: "cd".repeat(32), box: "ef".repeat(32), name: "Ann" } }));
  const rows = await A.ask("etiuda:catalog-files");
  await tick(5);
  check(Array.isArray(rows) && rows.some(r => r.name === "other.ec") && of(OTHER).length === 1,
    "1e a catalog in the folder the desk never loaded is kept as the Library's listing reads it (" + of(OTHER).length + " version)");
  check(of(THEIRS).length === 0 && !(index() || []).some(v => /[\\/]desks[\\/]/.test(v.path) && v.path.indexOf("k-0123456789abcdef") > -1),
    "1f THE CONTROL: a colleague's file under desks/ that the same listing read is not kept; it is that desk's to keep");

  /* The desk's own file, written through the real branch write with its key behind the stand-in for safeStorage. */
  const me = await A.ask("etiuda:branch-identity", true);
  const tail = sha(Buffer.from("shop")).slice(0, 8);
  const ownText = catalog(me ? me.id + "-" + tail : "x", 1, "Mine", { desk: me ? { id: me.id, key: me.key, box: me.box, name: "Ala K." } : {} });
  const wrote = await A.ask("etiuda:branch-write", "shop-" + tail, ownText);
  const OWN = me ? path.join(FOLDER, "desks", me.id, "shop-" + tail + ".ec") : "";
  const ownV = OWN ? of(OWN) : [];
  check(!!wrote && wrote.ok === true && ownV.length === 1 && ownV[0].wrote === true && ownV[0].signed === "desk"
    && Buffer.compare(unzip(ownV[0].sha), fs.readFileSync(OWN)) === 0,
    "1g the desk's own file is kept as it was written, marked as written by this desk and signed by it (" + ownV.length + " version)");

  /* An export over a file of the same name elsewhere: the file it replaces first, then what it wrote. */
  const OUT = path.join(ELSEWHERE, "shop.ec"), before = catalog("shop", 9, "Before");
  write(OUT, before);
  process.env.ETIUDA_TEST_SAVE_AS = ELSEWHERE;
  await A.ask("etiuda:choose-catalog-save", "Export", "shop.ec", "Etiuda catalog");
  const exported = catalog("shop-x", 1, "Exported");
  const saved = await A.ask("etiuda:write-catalog-save", exported, null);
  delete process.env.ETIUDA_TEST_SAVE_AS;
  const outV = of(OUT);
  check(!!saved && saved.ok === true && outV.length === 2 && outV.some(v => v.sha === sha(Buffer.from(before)) && !v.wrote)
    && outV.some(v => v.sha === sha(Buffer.from(exported)) && v.wrote),
    "1h an export over an existing file keeps the bytes it replaces, then what it wrote (" + outV.length + " versions)");

  /* 1i (Grok's review 23, finding 6): where the history cannot keep anything (its folder is a file here), an export over an
     existing file and the desk's own write each stop, the file left byte for byte as it was; the same two with the history
     back write as before. */
  {
    const OUT2 = path.join(ELSEWHERE, "r23", "shop.ec"), was = catalog("shop", 7, "Was here");
    fs.mkdirSync(path.dirname(OUT2), { recursive: true });
    write(OUT2, was);
    const ownWas = OWN ? fs.readFileSync(OWN, "utf8") : "";
    const ownNext = catalog(me ? me.id + "-" + tail : "x", 1, "Mine again", { desk: me ? { id: me.id, key: me.key, box: me.box, name: "Ala K." } : {} });
    const exportTo = async () => {
      process.env.ETIUDA_TEST_SAVE_AS = path.dirname(OUT2);
      try {
        await A.ask("etiuda:choose-catalog-save", "Export", "shop.ec", "Etiuda catalog");
        return await A.ask("etiuda:write-catalog-save", catalog("shop-y", 1, "Exported again"), null);
      } finally { delete process.env.ETIUDA_TEST_SAVE_AS; }
    };
    fs.renameSync(HIST, HIST + ".away");
    fs.writeFileSync(HIST, "not a folder");
    let broken = null;
    try {
      const out = await exportTo(), own = await A.ask("etiuda:branch-write", "shop-" + tail, ownNext);
      broken = { exportOk: !!out && out.ok === true, exportKept: fs.readFileSync(OUT2, "utf8") === was,
        ownOk: !!own && own.ok === true, ownKept: !!OWN && fs.readFileSync(OWN, "utf8") === ownWas };
    } finally {
      fs.unlinkSync(HIST);
      fs.renameSync(HIST + ".away", HIST);
    }
    const outBack = await exportTo(), ownBack = await A.ask("etiuda:branch-write", "shop-" + tail, ownNext);
    const back = { exportOk: !!outBack && outBack.ok === true, exportWrote: fs.readFileSync(OUT2, "utf8") !== was,
      ownOk: !!ownBack && ownBack.ok === true, ownWrote: !!OWN && fs.readFileSync(OWN, "utf8") !== ownWas,
      wasKept: of(OUT2).some(v => v.sha === sha(Buffer.from(was))) };
    check(!broken.exportOk && broken.exportKept && !broken.ownOk && broken.ownKept
      && back.exportOk && back.exportWrote && back.ownOk && back.ownWrote && back.wasKept,
      "1i where the history cannot keep the bytes a write replaces, an export and the desk's own write stop and the file stays as it"
      + " was; THE CONTROL, the history back, both write and the replaced bytes are kept: " + JSON.stringify({ broken: broken, back: back }));
    /* The plants, lifted in a second run of a copy over the same folders: each write goes through again with the history broken. */
    if (process.env.ETIUDA_PLANTS === "off") { console.log("  SKIP 1i lifting plant:export-keeps-first and plant:branch-keeps-first (ETIUDA_PLANTS=off)"); }
    else {
      const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8").split("\n");
      const lift = (tag, line) => { const at = MAIN.map((l, i) => (l.indexOf(tag) >= 0 ? i : -1)).filter(i => i >= 0); if (at.length !== 1) return null; const c = MAIN.slice(); c[at[0]] = line; return c.join("\n"); };
      const liftedSrc = lift("plant:export-keeps-first", "    if (false) {");
      let turned = null;
      if (liftedSrc && lift("plant:branch-keeps-first", "") !== null) {
        const src = liftedSrc.split("\n").map(l => (l.indexOf("plant:branch-keeps-first") >= 0 ? "" : l)).join("\n");
        const B = boot(src);
        await B.ask("etiuda:branch-identity", true);
        const outWas = fs.readFileSync(OUT2, "utf8"), ownNow = OWN ? fs.readFileSync(OWN, "utf8") : "";
        const ownThird = catalog(me ? me.id + "-" + tail : "x", 1, "Mine a third time", { desk: me ? { id: me.id, key: me.key, box: me.box, name: "Ala K." } : {} });
        fs.renameSync(HIST, HIST + ".away");
        fs.writeFileSync(HIST, "not a folder");
        try {
          process.env.ETIUDA_TEST_SAVE_AS = path.dirname(OUT2);
          await B.ask("etiuda:choose-catalog-save", "Export", "shop.ec", "Etiuda catalog");
          await B.ask("etiuda:write-catalog-save", catalog("shop-z", 1, "Lifted"), null);
          delete process.env.ETIUDA_TEST_SAVE_AS;
          await B.ask("etiuda:branch-write", "shop-" + tail, ownThird);
          turned = { exportOver: fs.readFileSync(OUT2, "utf8") !== outWas, ownOver: !!OWN && fs.readFileSync(OWN, "utf8") !== ownNow };
        } finally {
          delete process.env.ETIUDA_TEST_SAVE_AS;
          fs.unlinkSync(HIST);
          fs.renameSync(HIST + ".away", HIST);
        }
      }
      check(!!turned && turned.exportOver && turned.ownOver,
        "1i lifting plant:export-keeps-first and plant:branch-keeps-first writes over both files with the history broken: " + JSON.stringify(turned));
    }
  }

  /* ---- the list, the open and the putting back ---------------------------------------------------------------------- */
  const list = await A.ask("etiuda:history-list");
  const L = Array.isArray(list) ? list : [];
  const shopRows = L.filter(v => v.path === SHOP), cur = shopRows.filter(v => v.current), old = shopRows.find(v => v.sha === sha(Buffer.from(shop1)));
  check(shopRows.length === 2 && cur.length === 1 && cur[0].sha === sha(Buffer.from(shop2)) && cur[0].place === "folder" && !!old && old.put === true && cur[0].put === false,
    "2a the list names each version's file: the one shop.ec holds now is current and offers nothing to put back, the older one may go back ("
    + shopRows.map(v => (v.current ? "current" : "earlier") + (v.put ? " put" : "")).join(", ") + ")");
  check(L.filter(v => v.path === OWN).every(v => v.place === "own" && v.put === false) && L.filter(v => v.path === OUT).every(v => v.place === "other" && v.put === false)
    && L.some(v => v.path === OWN) && L.some(v => v.path === OUT),
    "2b the desk's own file and a file outside the catalog folder are listed in their places, and neither ever goes back");

  /* nsfe8 (moved from catalog-shared's 9a, retired with that leg): with the folder setting in forward slashes and a trailing one, the
     history still lists the folder's versions as the folder's and offers them back. */
  const slashed = boot();
  slashed.test.setFolder(FOLDER.split(path.sep).join("/") + "/");
  const slashedRows = ((await slashed.ask("etiuda:history-list")) || []).filter(v => v.path === path.resolve(SHOP));
  check(slashedRows.length > 1 && slashedRows.every(v => v.place === "folder") && slashedRows.some(v => v.put === true),
    "nsfe8 with the folder setting in forward slashes and a trailing one, the history still lists the folder's versions as the folder's, and offers them back ("
    + slashedRows.map(v => v.place).filter((x, i, a) => a.indexOf(x) === i).join() + ")");

  const opened = await A.ask("etiuda:history-read", old ? old.sha : "", SHOP);
  const stranger = await A.ask("etiuda:history-read", old ? old.sha : "", OTHER);
  check(!!opened && opened.name === "shop.ec" && opened.text === shop1.trim() && stranger === null,
    "2c an earlier version opens as its own catalog text, and a hash the history never kept for that file answers nothing");

  /* 2d and 2e RETIRED (a put-back on a plain shared folder leaves the shared file byte for byte; tests/shared-file-gone.mjs nsfe3): 2d said putting back writes
     the earlier version over the file byte for byte and names the bytes it replaced, 2e that those bytes go back the same way, which was the Undo. A version is
     put back on this desk by the page now, as the catalog in use, and the shell writes nothing into the catalog folder. */

  const SIGNEDF = path.join(FOLDER, "signed.ec"), s1 = catalog("signed", 1, "Lead", SIGNED), s2 = catalog("signed", 2, "Lead again", SIGNED);
  write(SIGNEDF, s1, Date.now() - 50000); await A.ask("etiuda:catalog-files"); await tick(5);
  write(SIGNEDF, s2, Date.now() - 40000); await A.ask("etiuda:catalog-files"); await tick(5);
  const sRows = ((await A.ask("etiuda:history-list")) || []).filter(v => v.path === SIGNEDF);
  check(sRows.length === 2 && sRows.every(v => v.signed && !v.put) && fs.readFileSync(SIGNEDF, "utf8") === s2,
    "2f THE CONTROL: a signed catalog's earlier edition opens but is never offered back, and the file keeps its bytes ("
    + sRows.length + " versions)");

  const PLAIN = path.join(FOLDER, "plain.ec"), p1 = catalog("plain", 1, "Plain"), p2 = catalog("plain", 2, "Now signed", SIGNED);
  write(PLAIN, p1, Date.now() - 30000); await A.ask("etiuda:catalog-files"); await tick(5);
  write(PLAIN, p2, Date.now() - 20000); await A.ask("etiuda:catalog-files"); await tick(5);
  const pRow = ((await A.ask("etiuda:history-list")) || []).find(v => v.path === PLAIN && v.sha === sha(Buffer.from(p1)));
  check(!!pRow && pRow.put === false && fs.readFileSync(PLAIN, "utf8") === p2,
    "2g an unsigned version is not offered back for a file a lead has since signed: the list offers nothing and the file keeps its bytes");

  /* 2h RETIRED with the shell's put-back: it said a version of a file outside the catalog folder is refused, however it is asked. No shell write is asked now; 2b
     holds that such a file's rows offer nothing. */

  /* ---- sealed: kept as sealed, opened only by a desk holding the key ---------------------------------------------- */
  const TEAM = "t-00112233aabbccdd", key = crypto.randomBytes(32);
  A.test.teamKeys[TEAM] = { 1: safeStorage.encryptString(key.toString("base64")).toString("base64") };
  const inner = catalog("sealed-one", 1, "Secretword", SIGNED), nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from("etiuda-sealed\n" + TEAM + "\n1", "utf8"));
  const ct = Buffer.concat([c.update(inner, "utf8"), c.final(), c.getAuthTag()]);
  const envelope = JSON.stringify({ format: 2, kind: "etiuda-sealed", team: TEAM, epoch: 1, nonce: nonce.toString("hex"), ct: ct.toString("hex") }, null, 1) + "\n";
  const SEALEDF = path.join(FOLDER, "sealed.ec");
  write(SEALEDF, envelope, Date.now() - 10000); await A.ask("etiuda:catalog-files"); await tick(5);
  const sv = of(SEALEDF)[0];
  const sOpen = await A.ask("etiuda:history-read", sv ? sv.sha : "", SEALEDF);
  check(!!sv && Buffer.compare(unzip(sv.sha), Buffer.from(envelope)) === 0 && unzip(sv.sha).indexOf("Secretword") < 0 && !!sv.sealed
    && !!sOpen && sOpen.text.indexOf("Secretword") > -1 && JSON.parse(sOpen.text).id === "sealed-one",
    "3a a sealed catalog is kept sealed, its copy the envelope's bytes with no word of the catalog in them, and it opens for the desk holding its key");
  delete A.test.teamKeys[TEAM];
  const sShut = await A.ask("etiuda:history-read", sv ? sv.sha : "", SEALEDF);
  check(!!sShut && sShut.text === "",
    "3b THE CONTROL: without the key the same version answers no text");

  /* ---- keeping: the 30 days, the newest of each file, the cap ------------------------------------------------------ */
  const K = A.test.historyKept;
  const now = Date.UTC(2026, 9, 4);
  const V = (id, p, last, gz, s) => ({ id: id, sha: s || sha(Buffer.from(id)), path: p, first: last, last: last, gz: gz || 10 });
  const set = [V("p-old", "/p", now - 40 * DAY), V("p-newest", "/p", now - 31 * DAY), V("q-29", "/q", now - 29 * DAY), V("q-1", "/q", now - DAY)];
  const kept = K ? K(set, now, 30, 1e9).map(v => v.id).sort().join() : "no historyKept";
  check(kept === "p-newest,q-1,q-29",
    "4a a version unseen for 30 days goes, one seen within them stays, and the newest of a file stays however old (" + kept + ")");
  const capSet = [V("a", "/a", now - 5 * DAY, 40), V("b", "/a", now - 4 * DAY, 40), V("c", "/a", now - 3 * DAY, 40), V("d", "/a", now, 40),
    V("e", "/e", now - 6 * DAY, 40, sha(Buffer.from("d"))), V("f", "/e", now - DAY, 40, sha(Buffer.from("d")))];
  const capped = K ? K(capSet, now, 30, 100).map(v => v.id).sort().join() : "no historyKept";
  check(capped === "c,d,f",
    "4b past the cap the longest unseen go first, the newest of each file never, and one content kept for two files weighs once, so c outlives a and b (" + capped + ")");

  /* 4d (Grok's review 23, finding 8): the cap binds the newest of each file too, once nothing else is left to drop, so the
     history cannot grow with every path the desk has opened; the longest unseen of them goes first. */
  const pinSet = [V("x", "/x", now - 9 * DAY, 40), V("y", "/y", now - 2 * DAY, 40), V("z", "/z", now - DAY, 40), V("w", "/w", now - 20 * DAY, 40)];
  const pinCapped = K ? K(pinSet, now, 30, 100).map(v => v.id).sort().join() : "no historyKept";
  const roomy = K ? K(pinSet, now, 30, 1e9).map(v => v.id).sort().join() : "no historyKept";
  check(pinCapped === "y,z" && roomy === "w,x,y,z",
    "4d past the cap with only the newest of each file left, the longest unseen of those go too (" + pinCapped + "); THE CONTROL, under the cap, every one stays (" + roomy + ")");
  if (process.env.ETIUDA_PLANTS === "off") console.log("  SKIP 4d lifting plant:history-cap-pinned (ETIUDA_PLANTS=off)");
  else {
    const MAIN4 = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8").split("\n");
    const at4 = MAIN4.map((l, i) => (l.indexOf("plant:history-cap-pinned") >= 0 ? i : -1)).filter(i => i >= 0);
    let liftedCap = null;
    if (at4.length === 1) {
      const c = MAIN4.slice(); c[at4[0]] = "";
      const P4 = boot(c.join("\n")).test.historyKept;
      liftedCap = P4 ? P4(pinSet, now, 30, 100).map(v => v.id).sort().join() : null;
    }
    check(liftedCap === "w,x,y,z", "4d lifting plant:history-cap-pinned keeps every newest past the cap again (" + liftedCap + ")");
  }

  /* For real, a month on: the edition shop.ec held first is dropped from the index and its copy from the disk. */
  const realNow = Date.now;
  Date.now = () => realNow() + 31 * DAY;
  try {
    write(SHOP, catalog("shop", 3, "Later"), Date.now());
    A.test.catalogChanged(null);
    await tick(5);
  } finally { Date.now = realNow; }
  const after = of(SHOP).map(v => v.sha), live = new Set((index() || []).map(v => v.sha));
  check(after.indexOf(sha(Buffer.from(shop1))) < 0 && blobs().indexOf(sha(Buffer.from(shop1)) + ".gz") < 0
    && after.indexOf(sha(Buffer.from(shop2))) > -1 && blobs().every(n => live.has(n.slice(0, 64))) && [...live].every(s => blobs().indexOf(s + ".gz") > -1),
    "4c a month on, the edition shop.ec held first has left the index and the disk, the one it held until now stays, and every copy is named by the index and every name has its copy");

  /* ---- an index that will not read ------------------------------------------------------------------------------------ */
  const copies = blobs().length;
  // Copies older than the 30 days: a rebuild that dated them by their files would let the next save prune them.
  const aged = (Date.now() - 40 * DAY) / 1000;
  blobs().forEach(n => fs.utimesSync(path.join(HIST, n), aged, aged));
  fs.mkdirSync(HIST, { recursive: true });
  fs.writeFileSync(path.join(HIST, "index.json"), "{ not an index");
  A = boot();
  const rebuilt = (await A.ask("etiuda:history-list")) || [];
  check(copies > 0 && rebuilt.length === copies && blobs().length === copies && rebuilt.every(v => v.path === "" && v.put === false),
    "5a an index that will not read is made again from the copies at the next launch, every copy listed and none deleted ("
    + rebuilt.length + " of " + copies + ")");
  write(SHOP, catalog("shop", 4, "After"), Date.now() + 4000);
  A.test.catalogChanged(null);
  await tick(5);
  check(Array.isArray(index()) && index().length === copies + 1 && blobs().length === copies + 1,
    "5b and the next version kept writes a sound index again, the rebuilt copies still in it (" + (index() || []).length + ")");

  /* A relay desk's mirror is not a folder the person edits. The write and the putting back are refused, and the file stays. */
  {
    const rt = "ab".repeat(16), team = "t-" + "11".repeat(8);
    const mirror = path.join(UD, "relay", rt), file = path.join(mirror, "mirror.ec");
    fs.mkdirSync(mirror, { recursive: true });
    const first = catalog("mirrorcat", 1, "Mirror"), second = catalog("mirrorcat", 2, "Changed");
    write(file, second);
    const R = boot();
    R.test.bindRelay(team, "ab".repeat(32), rt);
    R.test.keepHist(file, first);
    R.test.keepHist(file, second);
    const here = R.test.relayHere();
    const before = fs.readFileSync(file, "utf8");
    const list = (await R.ask("etiuda:history-list")) || [];
    const older = list.find(v => v.path === path.resolve(file) && v.sha === sha(Buffer.from(first)));
    check(!!here && before === second && !!older && older.put === false,
      "15ib a relay desk does not offer an earlier version back for a catalog in its mirror (was 15ib, which held the shared write and the shell's put-back refused there too, retired with them): "
      + JSON.stringify({ here: !!here, held: before === second, offered: !!(older && older.put) }));
  }

  /* 2q23 and 2r23 RETIRED with the shell's put-back (Grok's review 23, finding 2): 2q23 held that an index row saying a signed copy is free puts nothing back,
     the stored bytes judged as they are about to be written, and 2r23 lifted plant:put-back-bytes to show it. The shell writes no version back now; the page
     puts back only a version the list offers, and the list's rule is held by 2f and 2g. */

  /* ---- the page's half ------------------------------------------------------------------------------------------------ */
  globalThis.window = globalThis.window || {};
  const H = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-history.js")).href)
    .catch(() => ({ historyGroups: () => [], historyActs: () => [], eHasHistory: () => null }));
  const g = H.historyGroups([{ sha: "1", path: "/x", first: 5 }, { sha: "2", path: "/y", first: 9 }, { sha: "3", path: "/x", first: 7 }, { path: "/z" }]);
  check(g.map(x => x.map(v => v.sha).join("")).join("|") === "2|31",
    "6a the view groups by file, the file seen most recently first, and each file's versions newest first");
  const acts = [{ put: true }, { put: true, current: true }, { put: false }, { put: "yes" }].map(v => H.historyActs(v).join("+"));
  check(acts.join(",") === "open+put,open,open,open",
    "6b every row opens, and only a version the host may put back, and not the one its file holds now, offers Put back (" + acts.join(", ") + ")");
  const bare = H.eHasHistory();
  window.E_HOST = { historyList: noop, historyRead: noop, historyPut: noop };
  const hosted = H.eHasHistory();
  delete window.E_HOST;
  check(bare === false && hosted === true,
    "6c the Library's door is there only under a host that keeps a history; a browser has none (" + bare + ", " + hosted + ")");
  /* nsfe9: the door needs no put-back verb of the host: a version is put back on this desk by the page, so a host with a list and a read has it. */
  window.E_HOST = { historyList: noop, historyRead: noop };
  const noPutVerb = H.eHasHistory();
  delete window.E_HOST;
  check(noPutVerb === true, "nsfe9 the Library's door is there under a host that lists and reads versions and offers no put-back verb (" + noPutVerb + ")");
  /* nsfe10: which way a Put back goes is told by the row, which the shell marks mine where the bytes in the file are ones this desk wrote: in place, with
     an Undo, only for such a row and only under a host that offers the verb; any other row, and any host without it, takes the version as the catalog in use. */
  const route = typeof H.historyPutRoute === "function" ? H.historyPutRoute : () => "absent";
  const routes = [route({ mine: true }, { historyPut: noop }), route({ mine: false }, { historyPut: noop }), route({ mine: true }, {}), route({}, { historyPut: noop })];
  check(routes.join() === "place,desk,desk,desk", "nsfe10 a Put back goes in place only for a row this desk's own, under a host with the verb, and on this desk as the catalog in use otherwise (" + routes.join() + ")");
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted >= EXPECTED;
if (!complete) console.log("  FAIL only " + asserted + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " catalog history: " + (asserted - failed) + " of " + asserted + " legs green");
try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* the temp folder goes with the system's own sweep */ }
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
