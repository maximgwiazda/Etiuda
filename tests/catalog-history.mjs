/* The desk's history of its catalogs, in bare node: shell/main.js under a stubbed electron, with a user-data folder
 * and a documents folder of its own in the system's temp, and every catalog invented here. What it holds: a catalog
 * the desk reads or writes is kept once per content, beside desk.json and never in the catalog folder; a colleague's
 * file is not kept; a version stays 30 days after it was last seen, the newest of each file longer, and the cap takes
 * the longest unseen first; the list, the open and the putting back, which a signed or sealed catalog never gets and
 * which never writes over one; and an index that will not read loses nothing. The page's half is the grouping and the
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
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 26;

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
function boot() {
  const on = {}, handle = {}, test = {};
  const electron = {
    app: { getPath: n => (n === "documents" ? DOCS : UD), setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
           getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert,
    screen: inert, shell: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage: safeStorage,
  };
  new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test",
    fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8")
    + "\n__test.catalogChanged = catalogChanged; __test.teamKeys = teamKeys;"
    + " __test.historyKept = typeof historyKept === \"function\" ? historyKept : null;")(
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

  const opened = await A.ask("etiuda:history-read", old ? old.sha : "", SHOP);
  const stranger = await A.ask("etiuda:history-read", old ? old.sha : "", OTHER);
  check(!!opened && opened.name === "shop.ec" && opened.text === shop1.trim() && stranger === null,
    "2c an earlier version opens as its own catalog text, and a hash the history never kept for that file answers nothing");

  const put = await A.ask("etiuda:history-put", old ? old.sha : "", SHOP);
  await tick(5);
  check(!!put && put.ok === true && fs.readFileSync(SHOP, "utf8") === shop1 && put.replaced === sha(Buffer.from(shop2)) && unzip(put.replaced).length > 0,
    "2d putting back writes the earlier version over the file byte for byte, and names the bytes it replaced, which are kept");
  const undo = await A.ask("etiuda:history-put", put ? put.replaced : "", SHOP);
  check(!!undo && undo.ok === true && fs.readFileSync(SHOP, "utf8") === shop2,
    "2e and those bytes go back the same way, which is the Undo");

  const SIGNEDF = path.join(FOLDER, "signed.ec"), s1 = catalog("signed", 1, "Lead", SIGNED), s2 = catalog("signed", 2, "Lead again", SIGNED);
  write(SIGNEDF, s1, Date.now() - 50000); await A.ask("etiuda:catalog-files"); await tick(5);
  write(SIGNEDF, s2, Date.now() - 40000); await A.ask("etiuda:catalog-files"); await tick(5);
  const sRows = ((await A.ask("etiuda:history-list")) || []).filter(v => v.path === SIGNEDF);
  const sPut = await A.ask("etiuda:history-put", sha(Buffer.from(s1)), SIGNEDF);
  check(sRows.length === 2 && sRows.every(v => v.signed && !v.put) && !!sPut && sPut.ok === false && fs.readFileSync(SIGNEDF, "utf8") === s2,
    "2f THE CONTROL: a signed catalog's earlier edition opens but never goes back, and asked anyway the file keeps its bytes ("
    + sRows.length + " versions)");

  const PLAIN = path.join(FOLDER, "plain.ec"), p1 = catalog("plain", 1, "Plain"), p2 = catalog("plain", 2, "Now signed", SIGNED);
  write(PLAIN, p1, Date.now() - 30000); await A.ask("etiuda:catalog-files"); await tick(5);
  write(PLAIN, p2, Date.now() - 20000); await A.ask("etiuda:catalog-files"); await tick(5);
  const pRow = ((await A.ask("etiuda:history-list")) || []).find(v => v.path === PLAIN && v.sha === sha(Buffer.from(p1)));
  const pPut = await A.ask("etiuda:history-put", sha(Buffer.from(p1)), PLAIN);
  check(!!pRow && pRow.put === false && !!pPut && pPut.ok === false && fs.readFileSync(PLAIN, "utf8") === p2,
    "2g an unsigned version is not put back over a file a lead has since signed: the list offers nothing and the file keeps its bytes");

  const oPut = await A.ask("etiuda:history-put", sha(Buffer.from(before)), OUT);
  check(!!oPut && oPut.ok === false && fs.readFileSync(OUT, "utf8") === exported,
    "2h a version of a file outside the catalog folder is refused, however it is asked: the file there keeps its bytes");

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
