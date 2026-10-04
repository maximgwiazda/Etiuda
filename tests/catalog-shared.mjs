/* Editing the shared catalog directly, in bare node: two desks, each shell/main.js under a stubbed electron with a
 * user-data folder of its own and one documents folder between them, and each page's half the real merge and write of
 * src/modules/catalog-merge.js, given a desk's catalog as an export would write it. Every catalog is invented here.
 * What it holds: edits to different cards from two desks both land, whatever order they come in; a change to a key the
 * file changed since keeps the file's value and leaves the desk's to its own file, once, and it stays there; a desk's
 * later edit of a key it wrote lands, an undone one goes back, and a colleague's change over it is never written over;
 * a signed or sealed catalog, or one grown from a signed edition, never changes; a file beaten between the read and
 * the write is read again, and a lock another desk holds sends the change to the desk's own file; the bytes every
 * write replaces are kept first; nothing is written where nothing changed; a catalog made from nothing is created at
 * the top of the folder, unsigned; and the history lists the folder's versions under a folder setting spelled otherwise.
 * The page side, sliced from src/modules/catalog-file.js and catalog-offer.js: what the layer touches is named by the
 * file's own ids, and the edition a desk wrote itself is offered back to it only when it asks.
 *
 *   node tests/catalog-shared.mjs      exit code is the number of failed checks, capped at 63
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
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 36;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-shared-"));
const DOCS = path.join(BASE, "documents"), FOLDER = path.join(DOCS, "Etiuda");
fs.mkdirSync(FOLDER, { recursive: true });

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
/* One evaluation of main.js is one desk's app, its user data its own and the documents folder shared. */
function boot(name) {
  const UD = path.join(BASE, "user-data-" + name);
  fs.mkdirSync(UD, { recursive: true });
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
    + "\n__test.teamKeys = teamKeys;"
    + " __test.setFolder = v => { if (deskKeys === undefined) deskKeys = readDesk(); deskKeys[CATALOG_FOLDER_KEY] = v; };")(
    n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"),
    { exports: {} }, {}, quiet, test);
  const ev = { sender: { id: 1, once: noop }, senderFrame: { parent: null, url: "file:///C:/lab/engine/etiuda.html" } };
  return {
    ud: UD, test: test,
    read: () => { const e = Object.assign({}, ev); on["etiuda:catalog"](e); return e.returnValue; },
    ask: (ch, ...a) => (handle[ch] ? Promise.resolve(handle[ch](ev, ...a)) : Promise.resolve(undefined)),
  };
}

const V2 = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-v2.js")).href);
const M = await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-merge.js")).href)
  .catch(() => ({ directWrite: () => Promise.resolve({ route: "absent", state: { file: {}, desk: {}, held: [] }, fresh: [] }) }));
const pinOf = d => "sha256:" + sha(V2.v2SignedBytes(d));

/* ---- catalogs, written from nothing ------------------------------------------------------------------------------ */
const copy = v => JSON.parse(JSON.stringify(v));
function catalog(id, extra) {
  return Object.assign({
    format: 2, kind: "etiuda-catalog", id: id, rev: 1, date: "2026-10-01", langs: [{ code: "en", label: "EN" }], commentLang: "en",
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: ["a", "b", "c", "d", "e", "f"].map(x => ({ id: "c-" + x, shelf: "t-op", title: { en: "Title " + x }, body: { en: "Body " + x + "." }, bodyShape: "plain" }))
  }, extra || {});
}
const text = d => JSON.stringify(d, null, 1) + "\n";
const SIGNED = { sig: { alg: "Ed25519", keyId: "studio-0123456789abcdef", value: "ab".repeat(64) } };
const titleOf = (d, id) => { const c = (d.cards || []).find(x => x.id === id); return c ? c.title.en : "(gone)"; };
const onDisk = f => JSON.parse(fs.readFileSync(f, "utf8"));
const stamp = f => { const st = fs.statSync(f); return sha(fs.readFileSync(f)) + "|" + st.mtimeMs; };
const leftovers = () => fs.readdirSync(FOLDER).filter(n => /\.(lock|stale|tmp)$/.test(n));

/* One desk's page: the edition its layer grew from, its catalog as an export would write it, and what it knows of the
   file. `edit` changes one card key in the desk's catalog; `save` is the write the page makes after a save. */
function desk(shell, baseDoc) {
  return { shell: shell, pin: baseDoc ? pinOf(baseDoc) : "", mine: copy(baseDoc || catalog("x")), state: { file: {}, desk: {}, held: [] }, own: "" };
}
function edit(d, id, key, value) {
  const c = d.mine.cards.find(x => x.id === id);
  if (value === undefined) delete c[key]; else c[key] = value;
}
async function save(d, touched, name, hook) {
  let reads = 0;
  const r = await M.directWrite({
    read: () => d.shell.ask("etiuda:shared-read", name || "shop.ec", d.pin).then(x => { reads++; if (hook) hook(reads); return x; }),
    write: (t, s, create) => d.shell.ask("etiuda:shared-write", name || "shop.ec", t, s, create),
    mine: d.mine, touched: touched, state: d.state, pin: d.pin, own: d.own,
    check: V2.v2Problems, hash: V2.v2ContentHash, pinOf: pinOf, today: "2026-10-04",
  });
  d.state = r.state;
  if (r.wrote) d.own = r.others ? "" : r.pin;
  r.reads = reads;
  return r;
}
const cards = (...ids) => ({ cards: ids });

try {
  const SHOP = path.join(FOLDER, "shop.ec");
  const base = catalog("shop");
  fs.writeFileSync(SHOP, text(base));
  const A = boot("ann"), B = boot("bea");
  A.read(); B.read();
  await tick(5);
  check(V2.v2Problems(base).length === 0 && typeof M.mergeShared === "function",
    "0  THE CONTROL: the invented catalog is sound by the engine's own reader, and the merge is there to run");

  /* ---- different cards from two desks, the later desk never reloading ------------------------------------------- */
  const ann = desk(A, base), bea = desk(B, base);
  edit(bea, "c-b", "title", { en: "Bea's b" });
  const rB = await save(bea, cards("c-b"));
  const afterB = fs.readFileSync(SHOP, "utf8");
  edit(ann, "c-a", "title", { en: "Ann's a" });
  const rA = await save(ann, cards("c-a"));
  const now1 = onDisk(SHOP);
  check(rB.wrote === true && rA.wrote === true && titleOf(now1, "c-a") === "Ann's a" && titleOf(now1, "c-b") === "Bea's b"
    && titleOf(now1, "c-c") === "Title c",
    "1a edits to different cards from two desks both land, the second desk still on the edition the first one changed ("
    + titleOf(now1, "c-a") + ", " + titleOf(now1, "c-b") + ")");
  check(now1.rev === 3 && !now1.sig && now1.modified === true && now1.hash === V2.v2ContentHash(now1) && V2.v2Problems(now1).length === 0,
    "1b each write raised the edition (now " + now1.rev + "), and the file is unsigned, its hash its own and sound by the engine's reader");
  const annIdx = JSON.parse(fs.readFileSync(path.join(A.ud, "catalog-history", "index.json"), "utf8")).versions;
  check(annIdx.some(v => v.path === path.resolve(SHOP) && v.sha === sha(Buffer.from(afterB))) && annIdx.some(v => v.path === path.resolve(SHOP) && v.sha === sha(fs.readFileSync(SHOP)) && v.wrote),
    "1c the bytes a write replaced (Bea's edition) are in the writing desk's history, beside what it wrote");
  check(rB.others === false && bea.own === pinOf(JSON.parse(afterB)) && rB.pin === bea.own && rA.others === true && ann.own === "",
    "1d a write of the desk's own change alone is its own, by the pin the page keeps it from being offered; one that carried a colleague's change is not, so that edition is offered");

  /* ---- the same key --------------------------------------------------------------------------------------------- */
  edit(bea, "c-a", "title", { en: "Bea's a" });
  const sameBefore = fs.readFileSync(SHOP, "utf8");
  const rB2 = await save(bea, cards("c-b", "c-a"));
  const now2 = onDisk(SHOP);
  check(rB2.route === "branch" && titleOf(now2, "c-a") === "Ann's a" && rB2.fresh.length === 1 && /c-a\u0001title$/.test(rB2.fresh[0])
    && rB2.wrote !== true && fs.readFileSync(SHOP, "utf8") === sameBefore,
    "2a a key the file changed since keeps the file's value, the file is not written, and the desk is told once that its version waits in its own file ("
    + titleOf(now2, "c-a") + ", " + rB2.fresh.length + " notice)");
  const me = await B.ask("etiuda:branch-identity", true), tail = sha(Buffer.from("shop")).slice(0, 8);
  const ownDoc = Object.assign(copy(bea.mine), { id: me.id + "-" + tail, desk: { id: me.id, key: me.key, box: me.box, name: "Bea" } });
  const ownWrote = await B.ask("etiuda:branch-write", "shop-" + tail, JSON.stringify(ownDoc));
  const OWN = path.join(FOLDER, "desks", me.id, "shop-" + tail + ".ec");
  check(rB2.route === "branch" && !!ownWrote && ownWrote.ok && fs.existsSync(OWN) && titleOf(onDisk(OWN), "c-a") === "Bea's a",
    "2b and the route that answer names writes the desk's own file, which holds Bea's version of the card");
  edit(bea, "c-a", "title", { en: "Bea's a, again" });
  const rB3 = await save(bea, cards("c-b", "c-a"));
  check(rB3.route === "branch" && rB3.fresh.length === 0 && titleOf(onDisk(SHOP), "c-a") === "Ann's a",
    "2c edited again, a held key stays held: the colleague's value stands and no second notice is given");
  edit(ann, "c-a", "title", { en: "Ann's a, again" });
  const rA2 = await save(ann, cards("c-a"));
  check(rA2.wrote === true && rA2.route === "none" && titleOf(onDisk(SHOP), "c-a") === "Ann's a, again",
    "2d a desk's second edit of a key it wrote itself lands, with nothing held (" + titleOf(onDisk(SHOP), "c-a") + ")");
  edit(ann, "c-a", "title", { en: "Title a" });
  const rA3 = await save(ann, cards());
  check(rA3.wrote === true && titleOf(onDisk(SHOP), "c-a") === "Title a",
    "2e an edit the desk undoes, so the layer no longer touches the card, goes back into the file as the edition had it");
  edit(ann, "c-c", "title", { en: "Ann's c" });
  await save(ann, cards("c-c"));
  const hand = onDisk(SHOP); hand.cards.find(x => x.id === "c-c").title = { en: "Title c" }; hand.rev++;
  fs.writeFileSync(SHOP, text(hand));
  await A.ask("etiuda:catalog-files"); await tick(5);
  edit(ann, "c-d", "title", { en: "Ann's d" });
  const rA4 = await save(ann, cards("c-c", "c-d"));
  const now4 = onDisk(SHOP);
  check(titleOf(now4, "c-c") === "Title c" && titleOf(now4, "c-d") === "Ann's d" && rA4.fresh.some(l => /c-c\u0001title$/.test(l)),
    "2f a colleague's change over a key the desk wrote is never written over by the desk's next save, and the desk's own value is held ("
    + titleOf(now4, "c-c") + ")");

  bea.mine.cards = bea.mine.cards.filter(x => x.id !== "c-d" && x.id !== "c-f");
  const rB4 = await save(bea, cards("c-b", "c-a", "c-d", "c-f"));
  const now6 = onDisk(SHOP);
  check(titleOf(now6, "c-d") === "Ann's d" && rB4.fresh.some(l => /cardsc-d$/.test(l)),
    "2g a card the desk removes stays in the file where a colleague edited it since, and the removal is held (" + titleOf(now6, "c-d") + ")");
  check(rB4.wrote === true && titleOf(now6, "c-f") === "(gone)" && now6.cards.length === 5,
    "2h a card the desk removes that nobody else touched leaves the file (" + now6.cards.length + " cards)");

  /* ---- signed, sealed, and grown from a signed edition ---------------------------------------------------------- */
  const SIG = path.join(FOLDER, "lead.ec"), sigDoc = catalog("lead", SIGNED);
  fs.writeFileSync(SIG, text(sigDoc));
  await A.ask("etiuda:catalog-files"); await tick(5);
  const lead = desk(A, sigDoc), sig0 = stamp(SIG);
  edit(lead, "c-a", "title", { en: "Not for a signed one" });
  const rS = await save(lead, cards("c-a"), "lead.ec");
  check(rS.route === "branch" && rS.why === "signed" && stamp(SIG) === sig0,
    "3a with the setting on, a catalog the lead signed keeps its bytes and its time, and the change goes to the desk's own file");
  const TEAM = "t-00112233aabbccdd", envelope = { format: 2, kind: "etiuda-sealed", team: TEAM, epoch: 1, nonce: "00".repeat(12), ct: "11".repeat(40) };
  const SEALED = path.join(FOLDER, "sealed.ec");
  fs.writeFileSync(SEALED, text(envelope));
  const sealed0 = stamp(SEALED), rSe = await save(desk(A, base), cards("c-a"), "sealed.ec");
  check(rSe.route === "branch" && rSe.why === "signed" && stamp(SEALED) === sealed0,
    "3b a sealed catalog is never read for this nor written, and keeps its bytes and its time");
  const forced = await A.ask("etiuda:shared-write", "shop.ec", text(Object.assign(onDisk(SHOP), SIGNED)), sha(fs.readFileSync(SHOP)), false);
  check(!!forced && forced.ok === false && forced.refused === true && !onDisk(SHOP).sig,
    "3c the host refuses to write a signed catalog however it is asked, and the file keeps its bytes");
  const GREW = path.join(FOLDER, "grew.ec"), grewSigned = catalog("grew", SIGNED);
  fs.writeFileSync(GREW, text(grewSigned));
  await A.ask("etiuda:catalog-files"); await tick(5);
  const plain = catalog("grew", { rev: 2 });
  fs.writeFileSync(GREW, text(plain));
  const grew0 = stamp(GREW), heir = desk(A, grewSigned);
  edit(heir, "c-a", "title", { en: "Over the lead's edition" });
  const rG = await save(heir, cards("c-a"), "grew.ec");
  check(rG.route === "branch" && rG.why === "signed" && stamp(GREW) === grew0,
    "3d a desk whose edition the lead signed never writes the file, even after somebody saved it unsigned");

  /* ---- beaten, locked ------------------------------------------------------------------------------------------- */
  const cleo = desk(A, base);
  cleo.state = copy(ann.state); cleo.own = ann.own;
  Object.assign(cleo, { mine: copy(ann.mine) });
  edit(cleo, "c-e", "title", { en: "Cleo's e" });
  let once = false;
  const rC = await save(cleo, cards("c-c", "c-d", "c-e"), "shop.ec", n => {
    if (n !== 1 || once) return;
    once = true;
    const d = onDisk(SHOP); d.cards.find(x => x.id === "c-b").body = { en: "Changed between the read and the write." }; d.rev++;
    fs.writeFileSync(SHOP, text(d));
  });
  const now5 = onDisk(SHOP);
  check(rC.wrote === true && rC.reads === 2 && titleOf(now5, "c-e") === "Cleo's e" && now5.cards.find(x => x.id === "c-b").body.en === "Changed between the read and the write.",
    "4a a file changed between the read and the write is read and merged once more, and both changes stand (" + rC.reads + " reads)");
  edit(cleo, "c-e", "title", { en: "Cleo's e, again" });
  let n2 = 0;
  const rC2 = await save(cleo, cards("c-c", "c-d", "c-e"), "shop.ec", () => {
    const d = onDisk(SHOP); d.cards.find(x => x.id === "c-b").body = { en: "Beaten " + (++n2) + "." }; d.rev++;
    fs.writeFileSync(SHOP, text(d));
  });
  check(rC2.route === "branch" && rC2.why === "beaten" && titleOf(onDisk(SHOP), "c-e") === "Cleo's e" && onDisk(SHOP).cards.find(x => x.id === "c-b").body.en === "Beaten 2.",
    "4b beaten twice, the desk writes nothing over the file and its change goes to its own file (" + rC2.why + ")");
  const LOCK = SHOP + ".lock";
  fs.writeFileSync(LOCK, "{\"kind\":\"etiuda-lock\",\"token\":\"another desk\"}");
  const lock0 = stamp(LOCK), shop0 = stamp(SHOP);
  const rL = await save(cleo, cards("c-c", "c-d", "c-e"));
  check(rL.route === "branch" && rL.why === "busy" && stamp(SHOP) === shop0 && stamp(LOCK) === lock0,
    "5a a lock another desk took moments ago is left alone: the file and the lock keep their bytes, and the change goes to the desk's own file");
  const old = (Date.now() - 40 * 1000) / 1000;
  fs.utimesSync(LOCK, old, old);
  const rL2 = await save(cleo, cards("c-c", "c-d", "c-e"));
  check(rL2.wrote === true && titleOf(onDisk(SHOP), "c-e") === "Cleo's e, again",
    "5b a lock older than 30 seconds is a desk that stopped mid-write, and is taken over");
  check(leftovers().length === 0,
    "5c every write let its lock go and left no temp file beside the catalog (" + (leftovers().join(", ") || "none") + ")");

  /* ---- nothing changed ------------------------------------------------------------------------------------------ */
  const idle0 = stamp(SHOP), dora = desk(B, base);
  const rD = await save(dora, cards());
  check(rD.route === "none" && rD.wrote !== true && stamp(SHOP) === idle0,
    "6a THE CONTROL: a layer that touches nothing writes nothing, and the file keeps its bytes and its time");
  const cur = onDisk(SHOP), same = desk(A, base);
  same.mine = copy(cur); same.mine.rev = 1;
  const rD2 = await save(same, cards("c-a", "c-b"));
  check(rD2.wrote !== true && stamp(SHOP) === idle0,
    "6b a touched card that already reads as the file has it writes nothing either: no edition is raised for no change");

  /* ---- a catalog made from nothing ------------------------------------------------------------------------------ */
  const NEW = path.join(FOLDER, "Etiuda catalog.ec"), eve = desk(A, null);
  eve.mine = catalog("loose-0123456789");
  const rE = await save(eve, {}, "Etiuda catalog.ec");
  const made = fs.existsSync(NEW) ? onDisk(NEW) : {};
  check(rE.wrote === true && made.id === "loose-0123456789" && made.rev === 1 && !made.sig && !made.desk && !made.grew && made.cards.length === 6
    && V2.v2Problems(made).length === 0,
    "7a a catalog made from nothing goes to the top of the folder, unsigned, with no desk and no edition it grew from (edition " + made.rev + ")");
  eve.mine.cards.push({ id: "c-g", shelf: "t-op", title: { en: "Title g" }, body: { en: "Body g." }, bodyShape: "plain" });
  const rE2 = await save(eve, {}, "Etiuda catalog.ec");
  check(rE2.wrote === true && onDisk(NEW).rev === 2 && onDisk(NEW).cards.length === 7,
    "7b and it is written again, its edition raised, as the desk adds to it");
  const OTHER = path.join(FOLDER, "Taken.ec");
  fs.writeFileSync(OTHER, text(catalog("somebody-else")));
  const taken0 = stamp(OTHER), finn = desk(A, null);
  finn.mine = catalog("loose-fedcba9876543210");
  const rF = await save(finn, {}, "Taken.ec");
  check(rF.wrote !== true && rF.why === "other" && stamp(OTHER) === taken0,
    "7c a name already holding another catalog is never written over, and the page moves to the next name");

  /* ---- a colleague's value this desk's write carried, its person never shown it --------------------------------- */
  const SEEN = path.join(FOLDER, "seen.ec"), seenBase = catalog("seen");
  const ORD = path.join(FOLDER, "order.ec"), ordBase = catalog("order");
  fs.writeFileSync(SEEN, text(seenBase));
  fs.writeFileSync(ORD, text(ordBase));
  await A.ask("etiuda:catalog-files"); await B.ask("etiuda:catalog-files"); await tick(5);
  const ann8 = desk(A, seenBase), bea8 = desk(B, seenBase);
  edit(ann8, "c-a", "title", { en: "Ann's a" });
  const r8a = await save(ann8, cards("c-a"), "seen.ec");
  edit(bea8, "c-a", "body", { en: "Bea's body." });
  const r8b = await save(bea8, cards("c-a"), "seen.ec");
  const carried = titleOf(onDisk(SEEN), "c-a"), shown = titleOf(bea8.mine, "c-a");
  edit(bea8, "c-a", "title", { en: "Bea's a" });
  const r8c = await save(bea8, cards("c-a"), "seen.ec");
  check(r8a.wrote === true && r8b.wrote === true && carried === "Ann's a" && shown === "Title a"
    && titleOf(onDisk(SEEN), "c-a") === "Ann's a" && r8c.fresh.some(l => /c-a\u0001title$/.test(l)),
    "8a a colleague's title a desk's own write carried, while the desk still shows the edition's, is not written over by the desk's later edit there: it is held, with a notice ("
    + titleOf(onDisk(SEEN), "c-a") + ", " + r8c.fresh.length + " notice)");
  const ann9 = desk(A, ordBase), bea9 = desk(B, ordBase);
  const order = d => (d.cards || []).map(c => c.id.slice(2)).join("");
  const move = (d, id, to) => { const i = d.mine.cards.findIndex(c => c.id === id), [c] = d.mine.cards.splice(i, 1); d.mine.cards.splice(to, 0, c); };
  move(bea9, "c-f", 0);
  await save(bea9, { order: true }, "order.ec");
  move(bea9, "c-f", 5);
  await save(bea9, { order: false }, "order.ec");
  move(ann9, "c-a", 5);
  const r9a = await save(ann9, { order: true }, "order.ec"), annOrder = order(onDisk(ORD));
  edit(bea9, "c-c", "title", { en: "Bea's c" });
  const r9b = await save(bea9, cards("c-c"), "order.ec");
  move(bea9, "c-e", 0);
  const r9c = await save(bea9, Object.assign(cards("c-c"), { order: true }), "order.ec");
  check(r9a.wrote === true && annOrder === "bcdefa" && r9b.wrote === true && order(bea9.mine) === "eabcdf"
    && order(onDisk(ORD)) === "bcdefa" && r9c.fresh.some(l => /^order\u0001cards$/.test(l)),
    "8b the same in the order of the cards: a colleague's move the desk's write carried is not undone by the desk's later move, which is held, with a notice ("
    + annOrder + " then " + order(onDisk(ORD)) + ", " + r9c.fresh.length + " notice)");

  /* ---- the history under a folder setting spelled otherwise ------------------------------------------------------ */
  A.test.setFolder(FOLDER.split(path.sep).join("/") + "/");
  const rows = ((await A.ask("etiuda:history-list")) || []).filter(v => v.path === path.resolve(SHOP));
  check(rows.length > 1 && rows.every(v => v.place === "folder") && rows.some(v => v.put === true),
    "9a with the folder setting in forward slashes and a trailing one, the history still lists the folder's versions as the folder's, and offers them back ("
    + rows.map(v => v.place).filter((x, i, a) => a.indexOf(x) === i).join() + ")");

  /* ---- the page side: what the layer touches, and the desk's own edition ------------------------------------------ */
  {
    const pageSrc = f => fs.readFileSync(path.join(ROOT, "src", "modules", f), "utf8");
    const slice = (src, marker) => {
      const at = src.indexOf(marker);
      if (at < 0 || src.indexOf(marker, at + 1) > -1) throw new Error("not there exactly once: " + marker);
      for (let i = src.indexOf("{", at), depth = 0; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
      }
      throw new Error("unterminated: " + marker);
    };
    const page = { pack: {}, base: true, ly: {}, docs: new Map(), active: null, trusted: [] };
    const own = {
      get pack() { return page.pack; }, cardOrderIsBase: () => page.base, lyGet: k => (k in page.ly ? page.ly[k] : null),
      catalogDocOf: c => page.docs.get(c) || null, sha256Hex: b => sha(Buffer.from(b)), v2SignedBytes: V2.v2SignedBytes,
      storedCatalog: () => page.active, eCatalogSignature: c => (c ? String(c.id) + "@" + c.rev : ""), nsGet: () => null,
      catalogTrust: c => { page.trusted.push(c); throw new Error("offered"); },
    };
    const scope = new Proxy({}, { has: () => true, get: (o, k) => (k === Symbol.unscopables ? undefined : k in own ? own[k] : k in globalThis ? globalThis[k] : (() => { throw new ReferenceError(String(k) + " is not defined"); })()) });
    const fileSrc = pageSrc("catalog-file.js");
    const P = new Function("scope", "with(scope){\n" + ["function pinned(", "function sharedTouched(", "function sharedOwnPin(", "function sharedOwnWrite("]
      .map(m => slice(fileSrc, m)).join("\n") + "\n" + slice(pageSrc("catalog-offer.js"), "function eOfferCatalogDialog(")
      + "\nreturn { sharedTouched, sharedOwnWrite, eOfferCatalogDialog };\n}")(scope);
    const facts = [{ k: { en: "Hours" }, v: { en: "Nine to five" } }];
    page.pack = { overrides: { "c-a": { title: "Ann's a" } }, custom: [{ id: "c-own", title: "Mine" }], removed: ["c-gone"],
      catLabels: { "t-op": "Greetings" }, facts: facts, intentCustom: [], intentOverrides: {} };
    const t1 = P.sharedTouched();
    check(JSON.stringify(t1) === JSON.stringify({ cards: ["c-a", "c-own", "c-gone"], tags: ["t-op"], head: ["facts"], requests: false, order: false }),
      "10a a layer with an override, a card of its own, a removal, a category renamed and facts names exactly those, by the file's ids ("
      + JSON.stringify(t1) + ")");
    page.pack = {};
    const t0 = P.sharedTouched();
    check(JSON.stringify(t0) === JSON.stringify({ cards: [], tags: [], head: [], requests: false, order: false }),
      "10b THE CONTROL: an empty layer touches nothing (" + JSON.stringify(t0) + ")");
    page.pack = { intentCustom: [{ id: "r-1" }], who: ["Agent"] };
    page.base = false;
    const t2 = P.sharedTouched();
    page.base = true;
    check(t2.requests === true && t2.order === true && JSON.stringify(t2.head) === JSON.stringify(["role"]) && t2.cards.length === 0,
      "10c a request of the desk's own, the role list and a moved card are named as the requests, the role and the order (" + JSON.stringify(t2) + ")");

    const written = catalog("shop-own", { rev: 4 }), shown = catalog("shop-own", { rev: 3 });
    const held = { id: "shop-own", rev: 4, cards: [] };
    page.docs.set(held, written);
    page.active = { id: "shop-own", rev: 3, cards: [] };
    page.docs.set(page.active, shown);
    const offer = (asked, ownPin) => {
      page.ly = ownPin == null ? {} : { SharedOwn: ownPin };
      page.trusted.length = 0;
      let r;
      try { r = P.eOfferCatalogDialog(held, { asked: asked, refusedKey: "", accept: () => {} }); }
      catch (e) { r = e.message; }
      return { r: r, offered: page.trusted.length === 1 };
    };
    const unasked = offer(false, pinOf(written)), asked = offer(true, pinOf(written));
    check(unasked.r === false && !unasked.offered && P.sharedOwnWrite(held) === true,
      "10d the edition this desk wrote, found unasked, is not offered back to it (" + JSON.stringify(unasked) + ")");
    check(asked.offered,
      "10e the same edition is offered when the desk asks for it (" + JSON.stringify(asked) + ")");
    const other = offer(false, pinOf(shown)), none = offer(false, null);
    check(other.offered && none.offered && P.sharedOwnWrite(held) === false,
      "10f THE CONTROL: found unasked, an edition this desk did not write is offered, with another pin kept as its own or none ("
      + JSON.stringify([other, none]) + ")");
  }
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted >= EXPECTED;
if (!complete) console.log("  FAIL only " + asserted + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " catalog shared: " + (asserted - failed) + " of " + asserted + " legs green");
try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* the temp folder goes with the system's own sweep */ }
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
