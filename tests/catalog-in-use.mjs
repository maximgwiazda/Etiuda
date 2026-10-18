/* The catalog a joined desk has loaded, named for the team and never its cards, and a copy when
 * that team's lead asks. Red where the shell writes nothing, writes the cards, answers the wrong
 * ask, or leaves the copy up after the ask has gone.
 *
 *     node tests/catalog-in-use.mjs        exit code is the number of failed checks, capped at 63
 *
 * The shell runs from a copy of shell/ in a temp folder. No window variable is set. Machine
 * policy is the stand-in in tests/reg-stand.cjs. Throwaway keys and catalogs only.
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
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const EXPECTED = 39;

const JOIN_EN = "Once this desk joins, the team's lead can see which catalog it uses, by name and edition, and the lead's Studio can take a copy of it at any time, without asking here. The copy is sealed for the team, so anyone on the team can open it. The desk's use counts only in the team's totals, never on its own.";
const JOIN_PL = "Po dołączeniu lider zespołu widzi, którego katalogu używa to stanowisko (nazwę i wydanie), a Studio lidera może w każdej chwili pobrać jego kopię, bez pytania tutaj. Kopia jest zapieczętowana dla zespołu, więc może ją otworzyć każdy w zespole. Wykorzystanie stanowiska wlicza się wyłącznie do sum zespołu i nigdy nie jest pokazywane osobno.";
const STATUS_EN = "The team's lead can see which catalog this desk uses, by name and edition, and the lead's Studio can take a copy of it at any time, without asking here. The copy is sealed for the team, so anyone on the team can open it. The desk's use counts only in the team's totals, never on its own.";
const STATUS_PL = "Lider zespołu widzi, którego katalogu używa to stanowisko (nazwę i wydanie), a Studio lidera może w każdej chwili pobrać jego kopię, bez pytania tutaj. Kopia jest zapieczętowana dla zespołu, więc może ją otworzyć każdy w zespole. Wykorzystanie stanowiska wlicza się wyłącznie do sum zespołu i nigdy nie jest pokazywane osobno.";
const SENT_EN = "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team.";
const SENT_PL = "Na prośbę Studia lidera zespołu przesłano zespołowi kopię katalogu używanego na tym stanowisku.";
const CARD = "The quay lamp is wrapped for the crossing.";

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-catalog-in-use-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "offerFile", "catalogChanged", "readCatalog",
  "tryCatalogAsk", "asksWatching", "catalogCopyNote", "watchCatalog", "askSignedBytes", "deskFileGenuine", "signedSha", "teamUse"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud) {
  const said = [];
  const on = {}, invoke = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop, info: noop };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
      getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage, powerMonitor: inert,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.join(", ") + " };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  return { api, ask, said, ud, envelope, sent, win, sync };
}
function newDesk(name, folder) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: folder, eUiLang: "en", eAgent: "North desk" } }), "utf8");
  return loadDesk(ud);
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };
const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
const touch = (file, ms) => fs.utimesSync(file, ms / 1000, ms / 1000);
const inUsePath = (share, id) => path.join(share, "desks", id, "in-use.ec");
const answerPath = (share, id) => path.join(share, "desks", id, "catalog-answer.ec");

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  const OTHER = { keyId: "other-lead", public: pubHex(other.publicKey) };
  const sign = (doc, key, who) => {
    const o = JSON.parse(JSON.stringify(doc));
    delete o.sig;
    o.sig = { alg: "Ed25519", keyId: who.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), key).toString("hex");
    return o;
  };
  const textOf = doc => JSON.stringify(doc, null, 1) + "\n";
  const catalog = (rev, opts) => {
    const o = opts || {};
    const doc = {
      format: 2, kind: "etiuda-catalog", id: o.id || "north-lamps", rev, date: o.date || "2026-04-02",
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
        body: { en: o.card || CARD } }],
    };
    if (o.name !== null) doc.name = o.name === undefined ? "North lamps" : o.name;
    return o.unsigned ? doc : sign(doc, lead.privateKey, LEAD);
  };
  const RING = { format: 1, kind: "etiuda-ring", keys: [
    { catalog: "north-lamps", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const teamFile = (D, id, epoch, roster, catalogs) => textOf(sign({
    format: 1, kind: "etiuda-team", id, catalogs: catalogs || ["not-this"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch, roster,
  }, lead.privateKey, LEAD));
  const entry = (D, who, key, team, epoch) => ({
    desk: { id: who.id, key: who.key, box: who.box },
    wrap: D.api.wrapTeamKey(key, who.box, team, epoch, who.id),
  });
  const pinOf = (D, text) => { try { return D.api.signedSha(JSON.parse(text)); } catch { return ""; } };
  const take = (D, pin, text) => text == null ? D.sync("etiuda:catalog-taken", pin) : D.sync("etiuda:catalog-taken", pin, text);
  const fileSha = text => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  const tick = () => new Promise(r => setTimeout(r, 30));
  const expAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const putAsk = (box, id, sha) => {
    const doc = { format: 1, kind: "etiuda-catalog-ask", id: id, desk: box.me.id, sha256: sha, expires: expAt(),
      sig: { alg: "Ed25519", keyId: LEAD.keyId } };
    doc.sig.value = crypto.sign(null, box.D.api.askSignedBytes(doc), lead.privateKey).toString("hex");
    fs.mkdirSync(path.join(box.share, "catalog-asks"), { recursive: true });
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(doc));
  };
  const openSealedDoc = (D, file, key) => {
    try { return JSON.parse(D.api.openSealed(key, JSON.parse(fs.readFileSync(file, "utf8")))); }
    catch { return null; }
  };
  const arm = async (name) => {
    const share = folder(name + "-share");
    put(share, "etiuda-ring.json", RING);
    const D = newDesk(name, share);
    const me = await D.ask("etiuda:branch-identity", true);
    const team = "t-" + crypto.randomBytes(8).toString("hex");
    const key = crypto.randomBytes(32);
    return { share, D, me, team, key };
  };
  const join = (box, epoch, roster, catalogs) => {
    put(box.share, "etiuda-team.json", teamFile(box.D, box.team, epoch, roster, catalogs));
  };

  /* ---- boot of the folder's own file ---------------------------------------------------------- */
  {
    const box = await arm("boot");
    const body = textOf(catalog(2, { date: "2026-04-02" }));
    put(box.share, "board.ec", body);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const file = inUsePath(box.share, box.me.id);
    const inner = openSealedDoc(box.D, file, box.key);
    const genuine = !!(inner && box.D.api.deskFileGenuine(inner, box.me.id));
    const cat = inner && inner.catalog || {};
    const noCard = !!inner && JSON.stringify(inner).indexOf(CARD) < 0 && !inner.catalog.cards;
    check(!!booted && pin.indexOf("sha256:") === 0 && fs.existsSync(file) && inner && inner.kind === "etiuda-in-use"
        && inner.format === 1 && cat.source === "folder" && cat.sha256 === pin && cat.signer === "quay-lead"
        && cat.title === "North lamps" && cat.id === "north-lamps" && cat.rev === 2 && inner.desk.name === "North desk"
        && genuine && noCard && box.D.envelope().inUse && box.D.envelope().inUse.sha === pin,
      "890a the folder's catalog, once the page takes it, is named in in-use.ec: source folder, the lead's key, no card");

    const bytes = fs.readFileSync(file);
    take(box.D, pin);
    const same = Buffer.compare(bytes, fs.readFileSync(file)) === 0;
    check(same, "890b taking the same catalog again, at the same epoch, leaves the sealed file byte for byte");

    const before = fs.readFileSync(file);
    take(box.D, "sha256:" + "ab".repeat(32));
    check(Buffer.compare(before, fs.readFileSync(file)) === 0,
      "890c a pin the shell never handed writes nothing");

    put(box.share, "side.ec", textOf(catalog(1, { id: "side-lamps", name: "Side lamps", card: "A side lamp sits in the crate." })));
    const peeked = await box.D.ask("etiuda:catalog-read", "side.ec", "", false, false);
    const sidePin = pinOf(box.D, (peeked && peeked.text) || "");
    take(box.D, sidePin);
    check(sidePin && peeked && peeked.text && Buffer.compare(before, fs.readFileSync(file)) === 0,
      "890d a read nobody asked for is not a hand: its pin writes nothing");

    const key2 = crypto.randomBytes(32);
    join(box, 2, [entry(box.D, box.me, key2, box.team, 2)], ["north-lamps"]);
    touch(path.join(box.share, "etiuda-team.json"), Date.now() + 1500);
    take(box.D, pin);
    const bumped = openSealedDoc(box.D, file, key2);
    const oldOpens = openSealedDoc(box.D, file, box.key);
    check(bumped && bumped.catalog.sha256 === pin && !oldOpens && box.D.envelope().inUse.epoch === 2,
      "890e a newer epoch of the team file seals in-use again, and the previous key no longer opens it");

    /* side.ec is a second catalog, newer than board.ec. A restart would boot that one and the
       original pin would not be a hand, so the file would stay for a reason other than the skip. */
    fs.unlinkSync(path.join(box.share, "side.ec"));
    const stable = fs.readFileSync(file);
    const again = loadDesk(box.D.ud);
    const bootedAgain = again.sync("etiuda:catalog");
    const againPin = pinOf(again, bootedAgain || "");
    again.sync("etiuda:catalog-taken", againPin);
    check(againPin === pin && Buffer.compare(stable, fs.readFileSync(file)) === 0,
      "890f a desk that starts again, with the same catalog and epoch, does not rewrite in-use.ec");

    const askedSha = "sha256:" + "cd".repeat(32);
    const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const askOf = (D, id, desk, sha, expires, keyPair, keyId) => {
      const doc = { format: 1, kind: "etiuda-catalog-ask", id: id, desk: desk, sha256: sha, expires: expires,
        sig: { alg: "Ed25519", keyId: keyId } };
      doc.sig.value = crypto.sign(null, D.api.askSignedBytes(doc), keyPair).toString("hex");
      return doc;
    };
    fs.mkdirSync(path.join(box.share, "catalog-asks"), { recursive: true });
    const good = askOf(box.D, "Askgood1", box.me.id, askedSha, exp, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(good));
    box.D.api.tryCatalogAsk(box.D.win);
    const ans = answerPath(box.share, box.me.id);
    const answer = openSealedDoc(box.D, ans, key2);
    const answerText = answer ? JSON.stringify(answer) : "";
    check(answer && answer.kind === "etiuda-catalog-answer" && answer.format === 1 && answer.sha256 === pin
        && answer.sha256 !== askedSha && answerText.indexOf(CARD) >= 0 && box.D.api.catalogCopyNote() === "Askgood1",
      "890g an ask signed by this desk's lead is answered once with the loaded catalog, which the team file lists, cards included");

    const ansBytes = fs.readFileSync(ans);
    box.D.api.tryCatalogAsk(box.D.win);
    const once = Buffer.compare(ansBytes, fs.readFileSync(ans)) === 0;
    fs.unlinkSync(ans);
    box.D.api.tryCatalogAsk(box.D.win);
    check(once && !fs.existsSync(ans),
      "890h the same ask is not answered again, even after its answer has been removed");

    const forged = askOf(box.D, "Askbad1", box.me.id, askedSha, exp, other.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(forged));
    box.D.api.tryCatalogAsk(box.D.win);
    check(!fs.existsSync(ans), "890i an ask signed by the wrong key writes nothing");

    const foreign = askOf(box.D, "Askbad2", box.me.id, askedSha, exp, other.privateKey, OTHER.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(foreign));
    box.D.api.tryCatalogAsk(box.D.win);
    check(!fs.existsSync(ans), "890j an ask signed by another lead's key writes nothing");

    const kept = askOf(box.D, "Askkeep", box.me.id, pin, exp, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(kept));
    box.D.api.tryCatalogAsk(box.D.win);
    const had = fs.existsSync(ans);
    const expired = askOf(box.D, "Askold", box.me.id, pin, past, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(expired));
    box.D.api.tryCatalogAsk(box.D.win);
    check(had && !fs.existsSync(ans), "890k an expired ask writes nothing and the answer already sent is removed");

    const againGood = askOf(box.D, "Askback", box.me.id, pin, exp, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(againGood));
    box.D.api.tryCatalogAsk(box.D.win);
    const back = fs.existsSync(ans);
    const stranger = askOf(box.D, "Askwho", "k-" + "ab".repeat(8), pin, exp, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(stranger));
    box.D.api.tryCatalogAsk(box.D.win);
    check(back && !fs.existsSync(ans), "890l an ask that names another desk writes nothing, and the answer is removed");

    const ours = askOf(box.D, "Askstay", box.me.id, pin, exp, lead.privateKey, LEAD.keyId);
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(ours));
    box.D.api.tryCatalogAsk(box.D.win);
    const stayed = fs.readFileSync(ans);
    const otherId = "k-" + "cd".repeat(8);
    put(box.share, path.join("catalog-asks", otherId + ".json"),
      JSON.stringify(askOf(box.D, "Askother", otherId, pin, exp, lead.privateKey, LEAD.keyId)));
    box.D.api.tryCatalogAsk(box.D.win);
    check(Buffer.compare(stayed, fs.readFileSync(ans)) === 0,
      "890m an ask filed under another desk's name is not this desk's, and its own answer stays");

    fs.unlinkSync(path.join(box.share, "catalog-asks", box.me.id + ".json"));
    box.D.api.tryCatalogAsk(box.D.win);
    check(!fs.existsSync(ans), "890n when the ask is gone, the answer is removed");

    box.D.api.watchCatalog(box.D.win);
    check(box.D.api.asksWatching() === true, "890o while the desk runs, catalog-asks is watched");
  }

  /* ---- the other confirming routes ---------------------------------------------------------------- */
  {
    const box = await arm("routes");
    put(box.share, "board.ec", textOf(catalog(5, { name: "North lamps new" })));
    put(box.share, "old.ec", textOf(catalog(1, { date: "2026-01-01", name: "North lamps old" })));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    box.D.api.catalogChanged(box.D.win);
    const watched = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const watchedPin = pinOf(box.D, watched ? watched[1] : "");
    take(box.D, watchedPin);
    const watchedInner = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    check(watchedInner && watchedInner.catalog.source === "folder" && watchedInner.catalog.rev === 5,
      "890s a catalog the folder's watch offers, once taken, is source folder");

    const openedFile = path.join(folder("routes-opened"), "picked.ec");
    put(path.dirname(openedFile), "picked.ec", textOf(catalog(4, { name: "North\u200blamps", unsigned: false })));
    box.D.api.offerFile(box.D.win, openedFile);
    const offered = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const offeredPin = pinOf(box.D, offered ? offered[1] : "");
    take(box.D, offeredPin);
    const offeredInner = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    check(offeredInner && offeredInner.catalog.source === "opened" && offeredInner.catalog.title === "Northlamps"
        && offeredInner.catalog.signer === "quay-lead",
      "890p a file the agent opened is source opened, and a hidden character is taken out of the title");

    const bareFile = path.join(folder("routes-bare"), "bare.ec");
    put(path.dirname(bareFile), "bare.ec", textOf(catalog(1, { id: "bare-lamps", name: null, unsigned: true, card: "Bare glass." })));
    box.D.sent.length = 0;
    box.D.api.offerFile(box.D.win, bareFile);
    const bare = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const barePin = pinOf(box.D, bare ? bare[1] : "");
    take(box.D, barePin);
    const bareInner = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    check(bareInner && bareInner.catalog.source === "opened" && bareInner.catalog.signer === "" && !("title" in bareInner.catalog)
        && JSON.stringify(bareInner).indexOf("Bare glass.") < 0,
      "890q an unsigned catalog with no name has an empty signer and no title, and still no card");

    const older = await box.D.ask("etiuda:catalog-read", "old.ec", "", true, false);
    const olderPin = pinOf(box.D, (older && older.text) || "");
    take(box.D, olderPin);
    const olderInner = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    check(olderInner && olderInner.catalog.source === "opened" && olderInner.catalog.rev === 1 && olderInner.catalog.title === "North lamps old",
      "890r an older edition opened on purpose is source opened");

    const stem = "north-abcd1234";
    const deskDoc = {
      format: 2, kind: "etiuda-catalog", id: box.me.id + "-abcd1234", rev: 1, name: "Desk lamps", date: "2026-04-03",
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-desk", shelf: "t-op", bodyShape: "plain", title: { en: "Desk" },
        body: { en: "A desk copy waits on the bench." } }],
      desk: { id: box.me.id, key: box.me.key, box: box.me.box, name: "North desk" },
    };
    const wrote = await box.D.ask("etiuda:branch-write", stem, JSON.stringify(deskDoc));
    const read = await box.D.ask("etiuda:catalog-read", stem + ".ec", box.me.id, true, false);
    const deskPin = pinOf(box.D, (read && read.text) || "");
    take(box.D, deskPin);
    const deskInner = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    check(wrote && wrote.ok === true && deskInner && deskInner.catalog.source === "desk-file"
        && JSON.stringify(deskInner).indexOf("A desk copy waits on the bench.") < 0,
      "890t a desk file the agent opened is source desk-file, and its card text stays out of in-use");
  }

  /* ---- no key, and leaving -------------------------------------------------------------------------- */
  {
    const share = folder("lone-share");
    put(share, "etiuda-ring.json", RING);
    put(share, "board.ec", textOf(catalog(2)));
    const D = newDesk("lone", share);
    const me = await D.ask("etiuda:branch-identity", true);
    const booted = D.sync("etiuda:catalog");
    take(D, pinOf(D, booted || ""));
    check(booted && !fs.existsSync(inUsePath(share, me.id)) && !D.envelope().inUse,
      "890u a desk with no team key writes no in-use file");

    const box = await arm("leave");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const bootedL = box.D.sync("etiuda:catalog");
    take(box.D, pinOf(box.D, bootedL || ""));
    const had = fs.existsSync(inUsePath(box.share, box.me.id));
    await box.D.ask("etiuda:team-join", "forget", box.team);
    check(had && !fs.existsSync(inUsePath(box.share, box.me.id)) && !box.D.envelope().inUse,
      "890v forgetting the lead removes in-use.ec");

    const drop = await arm("drop");
    put(drop.share, "board.ec", textOf(catalog(2)));
    join(drop, 1, [entry(drop.D, drop.me, drop.key, drop.team, 1)]);
    const bootedD = drop.D.sync("etiuda:catalog");
    take(drop.D, pinOf(drop.D, bootedD || ""));
    const hadD = fs.existsSync(inUsePath(drop.share, drop.me.id));
    join(drop, 1, []);
    touch(path.join(drop.share, "etiuda-team.json"), Date.now() + 2500);
    drop.D.api.catalogChanged(drop.D.win);
    check(hadD && !fs.existsSync(inUsePath(drop.share, drop.me.id)),
      "890w a team file that drops this desk removes in-use.ec");
  }

  /* ---- a key this desk cannot open, and a catalog already loaded ------------------------------------ */
  {
    const box = await arm("stalekey");
    const body = textOf(catalog(2));
    put(box.share, "board.ec", body);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const file = inUsePath(box.share, box.me.id);
    const before = fs.readFileSync(file);
    const stranger = crypto.generateKeyPairSync("x25519");
    const strangerBox = stranger.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    const key2 = crypto.randomBytes(32);
    join(box, 2, [entry(box.D, { id: box.me.id, key: box.me.key, box: strangerBox }, key2, box.team, 2)]);
    touch(path.join(box.share, "etiuda-team.json"), Date.now() + 3500);
    const use = box.D.api.teamUse();
    putAsk(box, "Askstale", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const ans = answerPath(box.share, box.me.id);
    const openedOld = openSealedDoc(box.D, ans, box.key);
    check(use.member === true && use.stale === true && use.seal && use.seal.epoch === 1
        && !fs.existsSync(ans) && !openedOld && Buffer.compare(before, fs.readFileSync(file)) === 0,
      "890ac a team file whose new key this desk cannot open seals nothing under the older key");

    const held = await arm("joinheld");
    put(held.share, "board.ec", textOf(catalog(2)));
    const bootedH = held.D.sync("etiuda:catalog");
    const pinH = pinOf(held.D, bootedH || "");
    take(held.D, pinH);
    const missing = !fs.existsSync(inUsePath(held.share, held.me.id));
    join(held, 1, [entry(held.D, held.me, held.key, held.team, 1)]);
    putAsk(held, "Askjoin1", pinH);
    held.D.api.catalogChanged(held.D.win);
    const joined = openSealedDoc(held.D, inUsePath(held.share, held.me.id), held.key);
    const joinedAns = openSealedDoc(held.D, answerPath(held.share, held.me.id), held.key);
    check(missing && pinH && joined && joined.catalog.source === "folder" && joined.catalog.rev === 2
        && joinedAns && joinedAns.kind === "etiuda-catalog-answer" && JSON.stringify(joinedAns).indexOf(CARD) >= 0,
      "890ae a desk that joins with its catalog already loaded names that catalog and answers the ask, with no second take");

    const spin = await arm("rotate");
    put(spin.share, "board.ec", textOf(catalog(2)));
    join(spin, 1, [entry(spin.D, spin.me, spin.key, spin.team, 1)]);
    const bootedS = spin.D.sync("etiuda:catalog");
    take(spin.D, pinOf(spin.D, bootedS || ""));
    const keyS = crypto.randomBytes(32);
    join(spin, 2, [entry(spin.D, spin.me, keyS, spin.team, 2)]);
    touch(path.join(spin.share, "etiuda-team.json"), Date.now() + 4500);
    spin.D.api.catalogChanged(spin.D.win);
    const spun = inUsePath(spin.share, spin.me.id);
    const openedNew = openSealedDoc(spin.D, spun, keyS);
    const openedPrev = openSealedDoc(spin.D, spun, spin.key);
    check(openedNew && openedNew.catalog.sha256 === pinOf(spin.D, bootedS || "") && !openedPrev,
      "890ah when the team epoch moves, the catalog already loaded is sealed again, with no take");

    const late = await arm("asklate");
    put(late.share, "board.ec", textOf(catalog(2)));
    join(late, 1, [entry(late.D, late.me, late.key, late.team, 1)]);
    const bootedL = late.D.sync("etiuda:catalog");
    const pinL = pinOf(late.D, bootedL || "");
    take(late.D, pinL);
    const keyL = crypto.randomBytes(32);
    join(late, 2, [entry(late.D, late.me, keyL, late.team, 2)]);
    touch(path.join(late.share, "etiuda-team.json"), Date.now() + 5500);
    putAsk(late, "Asklate1", pinL);
    late.D.api.tryCatalogAsk(late.D.win);
    const lateUse = inUsePath(late.share, late.me.id);
    const lateNew = openSealedDoc(late.D, lateUse, keyL);
    const lateAns = openSealedDoc(late.D, answerPath(late.share, late.me.id), keyL);
    check(pinL && lateNew && lateNew.catalog.sha256 === pinL && !openSealedDoc(late.D, lateUse, late.key)
        && lateAns && lateAns.kind === "etiuda-catalog-answer",
      "890aj an ask that arrives before any folder change after the epoch moves finds the loaded catalog sealed again");

    const miss = await arm("mismatch");
    put(miss.share, "board.ec", textOf(catalog(2)));
    join(miss, 1, [entry(miss.D, miss.me, miss.key, miss.team, 1)]);
    const bootedM = miss.D.sync("etiuda:catalog");
    const pinM = pinOf(miss.D, bootedM || "");
    const other = textOf(catalog(1, { id: "side-lamps", name: "Side lamps", card: "A side lamp sits in the crate." }));
    take(miss.D, pinM, other);
    check(pinM && pinOf(miss.D, other) !== pinM && !fs.existsSync(inUsePath(miss.share, miss.me.id)),
      "890ai a pin the catalog text does not back writes nothing");
  }

  /* ---- what the person at the desk reads, and a catalog the page already holds --------------------- */
  {
    const boot = await arm("pageboot");
    put(boot.share, "board.ec", textOf(catalog(2, { date: "2026-04-02" })));
    join(boot, 1, [entry(boot.D, boot.me, boot.key, boot.team, 1)]);
    const firstBoot = boot.D.sync("etiuda:catalog");
    const bootPin = pinOf(boot.D, firstBoot || "");
    take(boot.D, bootPin);
    const bootFile = inUsePath(boot.share, boot.me.id);
    const bootStable = fs.readFileSync(bootFile);
    const again = loadDesk(boot.D.ud);
    const bootedAgain = again.sync("etiuda:catalog");
    const againPin = pinOf(again, bootedAgain || "");
    const askBoot = { format: 1, kind: "etiuda-catalog-ask", id: "Askboot1", desk: boot.me.id, sha256: againPin,
      expires: expAt(), sig: { alg: "Ed25519", keyId: LEAD.keyId } };
    askBoot.sig.value = crypto.sign(null, again.api.askSignedBytes(askBoot), lead.privateKey).toString("hex");
    fs.mkdirSync(path.join(boot.share, "catalog-asks"), { recursive: true });
    put(boot.share, path.join("catalog-asks", boot.me.id + ".json"), JSON.stringify(askBoot));
    let takenCalls = 0;
    let takenDesk = again;

    const mem = Object.create(null);
    mem.eUiLang = "en";
    /* The language store probes window.localStorage once, at the moment its module loads. */
    const store = {
      getItem: k => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; },
    };
    globalThis.localStorage = store;
    globalThis.innerHeight = 800;
    globalThis.getComputedStyle = () => ({
      borderLeftWidth: "0", paddingLeft: "0", borderRightWidth: "0", paddingRight: "0",
      fontStyle: "normal", fontWeight: "400", fontSize: "14px", fontFamily: "sans-serif", letterSpacing: "normal",
    });
    const classList = () => {
      const s = new Set();
      return {
        contains: c => s.has(c),
        add: (...c) => { c.forEach(x => s.add(x)); },
        remove: (...c) => { c.forEach(x => s.delete(x)); },
        toggle: (c, on) => { const next = on === undefined ? !s.has(c) : !!on; if (next) s.add(c); else s.delete(c); return next; },
      };
    };
    const toastEl = { classList: classList(), textContent: "", innerHTML: "", style: {},
      getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) };
    let pasted = { value: "north-invite" };
    let showSealed = false;
    globalThis.window = { addEventListener: noop, removeEventListener: noop, localStorage: store,
      E_CATALOG: JSON.parse(bootedAgain), E_HOST: {
      teamJoin: (op) => {
        if (op === "read") return Promise.resolve({ offer: { folder: "C:\\lab\\north", lead: "North lead", code: "12345", local: true } });
        if (op === "state" || op === "leads") return Promise.resolve({
          sealed: showSealed ? { file: "north.ec", team: "t-0123456789abcdef" } : null, join: null, leads: [] });
        return Promise.resolve({});
      },
      onTeamJoin: noop,
      onCatalogCopy: fn => { globalThis.window.__copy = fn; },
      catalogMtime: 0,
      openedWith: false,
      catalogTaken: (p, text) => { takenCalls++; takenDesk.sync("etiuda:catalog-taken", p, text); },
    } };
    globalThis.document = {
      addEventListener: noop, removeEventListener: noop, getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: sel => sel === "#toast" ? toastEl : (sel === "[data-join-paste]" ? pasted : null),
      body: { classList: classList(), appendChild: noop },
    };
    const HK = await import(MOD("hooks.js"));
    HK.hooks.render = noop;
    HK.hooks.loadCatalogFromFolder = noop;
    HK.hooks.flushPillState = noop;
    HK.hooks.restartDesk = noop;
    const Cat = await import(MOD("catalog.js"));
    const File = await import(MOD("catalog-file.js"));
    const Offer = await import(MOD("catalog-offer.js"));
    const heldRuntime = Cat.parseCatalogFile(bootedAgain);
    const storedOk = Cat.storeCatalog(Object.assign({}, heldRuntime, { pin: againPin }));
    let bootErr = "";
    try { Offer.eOfferCatalogAtBoot(); }
    catch (e) { bootErr = e && e.message ? e.message : String(e); }
    const bootAns = openSealedDoc(again, answerPath(boot.share, boot.me.id), boot.key);
    const offerSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-offer.js"), "utf8");
    const bootAt = offerSrc.indexOf("function eOfferCatalogAtBoot");
    const bootFn = offerSrc.slice(bootAt, offerSrc.indexOf("function toastIfSameCatalog", bootAt));
    check(againPin === bootPin && storedOk === true && takenCalls === 1 && !bootErr
        && Buffer.compare(bootStable, fs.readFileSync(bootFile)) === 0
        && bootAns && bootAns.kind === "etiuda-catalog-answer" && JSON.stringify(bootAns).indexOf(CARD) >= 0
        && bootFn.indexOf("nameHeldCatalog()") > bootFn.indexOf("pinStoredFrom(eCatalog())"),
      "890ad a desk that starts again names the catalog it already holds, without a take, and answers the ask"
        + (bootErr ? " (" + bootErr + ", sends " + takenCalls + ")" : ""));

    const hist = await arm("history");
    const olderText = textOf(catalog(1, { date: "2026-01-01", name: "North lamps old", card: "An older lamp waits." }));
    const newerText = textOf(catalog(3, { name: "North lamps new" }));
    const histFile = path.join(hist.share, "board.ec");
    put(hist.share, "board.ec", olderText);
    join(hist, 1, [entry(hist.D, hist.me, hist.key, hist.team, 1)]);
    await hist.D.ask("etiuda:catalog-files");
    await tick();
    put(hist.share, "board.ec", newerText);
    await hist.D.ask("etiuda:catalog-files");
    await tick();
    const histBoot = hist.D.sync("etiuda:catalog");
    const histPin = pinOf(hist.D, histBoot || "");
    take(hist.D, histPin);
    const histUse = inUsePath(hist.share, hist.me.id);
    const current = openSealedDoc(hist.D, histUse, hist.key);
    const openedOld = await hist.D.ask("etiuda:history-read", fileSha(olderText), histFile);
    const afterRead = openSealedDoc(hist.D, histUse, hist.key);
    const olderPin = pinOf(hist.D, (openedOld && openedOld.text) || "");
    take(hist.D, olderPin);
    const afterPin = openSealedDoc(hist.D, histUse, hist.key);
    takenDesk = hist.D;
    const beforeTell = takenCalls;
    const olderCat = Cat.parseCatalogFile((openedOld && openedOld.text) || "");
    const told = File.tellTaken(olderCat);
    const named = openSealedDoc(hist.D, histUse, hist.key);
    const fileSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-file.js"), "utf8");
    const histSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-history.js"), "utf8");
    const takeAt = fileSrc.indexOf("function takeCatalog(");
    const takeFn = fileSrc.slice(takeAt, fileSrc.indexOf("function sampleUntouched(", takeAt));
    const openAt = histSrc.indexOf("function historyOpen(");
    const openFn = histSrc.slice(openAt, histSrc.indexOf("function historyPutBack(", openAt));
    check(current && current.catalog.rev === 3 && afterRead && afterRead.catalog.rev === 3
        && afterPin && afterPin.catalog.rev === 3 && told === true && takenCalls === beforeTell + 1
        && named && named.catalog.source === "opened" && named.catalog.rev === 1 && named.catalog.title === "North lamps old"
        && takeFn.indexOf("tellTaken(c)") >= 0 && openFn.indexOf("activateCatalog(") >= 0,
      "890af an earlier edition opened from history is named, source opened, and the read alone is not a hand");

    const drop = await arm("jsdrop");
    put(drop.share, "board.ec", textOf(catalog(2)));
    join(drop, 1, [entry(drop.D, drop.me, drop.key, drop.team, 1)]);
    const dropBoot = drop.D.sync("etiuda:catalog");
    take(drop.D, pinOf(drop.D, dropBoot || ""));
    const dropUse = inUsePath(drop.share, drop.me.id);
    const dropBefore = openSealedDoc(drop.D, dropUse, drop.key);
    const dropped = textOf(catalog(4, { id: "drop-lamps", name: "Dropped lamps", card: "A lamp from the drop." }));
    const droppedPin = pinOf(drop.D, dropped);
    take(drop.D, droppedPin);
    const afterBare = openSealedDoc(drop.D, dropUse, drop.key);
    takenDesk = drop.D;
    const beforeDrop = takenCalls;
    const droppedCat = Cat.parseCatalogFile(dropped);
    const dropTold = File.tellTaken(droppedCat);
    const dropNamed = openSealedDoc(drop.D, dropUse, drop.key);
    const dropFn = fileSrc.slice(fileSrc.indexOf("function wireCatalogDrop("), fileSrc.indexOf("function importCatalogPicked("));
    const importFn = fileSrc.slice(fileSrc.indexOf("function importCatalogText("), fileSrc.indexOf("function importCatalogHosted("));
    check(dropBefore && dropBefore.catalog.rev === 2 && afterBare && afterBare.catalog.rev === 2
        && dropTold === true && takenCalls === beforeDrop + 1
        && dropNamed && dropNamed.catalog.source === "opened" && dropNamed.catalog.rev === 4
        && dropNamed.catalog.title === "Dropped lamps" && JSON.stringify(dropNamed).indexOf("A lamp from the drop.") < 0
        && dropFn.indexOf("importCatalogText(") >= 0 && importFn.indexOf("activateCatalog(") >= 0,
      "890ag a catalog dropped as text the shell never handed is named, source opened");

    const TJ = await import(MOD("team-join.js"));
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 20));
    TJ.openJoinPaste();
    const paste = TJ.teamJoinEmptyHtml();
    const readBtn = { hasAttribute: a => a === "data-join", getAttribute: a => (a === "data-join" ? "read" : null) };
    TJ.wireTeamJoinEmpty({ querySelectorAll: () => [readBtn] });
    await Promise.resolve(readBtn.onclick && readBtn.onclick());
    const confirm = TJ.teamJoinEmptyHtml();
    const backBtn = { hasAttribute: a => a === "data-join", getAttribute: a => (a === "data-join" ? "back" : null) };
    TJ.wireTeamJoinEmpty({ querySelectorAll: () => [backBtn] });
    await Promise.resolve(backBtn.onclick && backBtn.onclick());
    showSealed = true;
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 20));
    const sealed = TJ.teamJoinEmptyHtml();
    /* The page escapes an apostrophe as &#39; before it paints. The words are the sentence. */
    const shown = s => String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    check(shown(paste).indexOf(JOIN_EN) >= 0 && shown(confirm).indexOf(JOIN_EN) >= 0 && shown(sealed).indexOf(JOIN_EN) >= 0
        && shown(sealed).indexOf("Once the team's lead lets this desk in") >= 0,
      "890x the joining sentence is on the paste, the confirm and the sealed ask, and the ask's own sentence stays");

    mem.eUiLang = "pl";
    TJ.openJoinPaste();
    const pastePl = TJ.teamJoinEmptyHtml();
    check(pastePl.indexOf(JOIN_PL) >= 0 && pastePl.indexOf(JOIN_EN) < 0,
      "890y the joining sentence is the Polish one when the desk's language is Polish");

    const settings = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
    const lang = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
    const statusLine = settings.split(/\r?\n/).filter(l => l.indexOf("teamRowHtml(l,") >= 0).join("\n");
    check(statusLine.indexOf("i===all.findIndex(x=>!x.removed)?t(\"" + STATUS_EN + "\")") >= 0
        && lang.indexOf("\"" + STATUS_EN + "\":\"" + STATUS_PL + "\"") >= 0
        && lang.indexOf("\"" + JOIN_EN + "\":\"" + JOIN_PL + "\"") >= 0
        && lang.indexOf("\"" + SENT_EN + "\":\"" + SENT_PL + "\"") >= 0,
      "890z the team's status sentence is the hint of the first team row whose roster still lists this desk, and both languages are in the string table");

    mem.eUiLang = "en";
    toastEl.classList.remove("show");
    TJ.noteCatalogCopy();
    const enToast = toastEl.textContent;
    mem.eUiLang = "pl";
    toastEl.classList.remove("show");
    TJ.noteCatalogCopy();
    check(enToast === SENT_EN && toastEl.textContent === SENT_PL,
      "890aa the quiet note is shown, in the desk's language, when a copy was sent");
  }

  /* ---- a catalog the team file does not name, and an ask that names another hash ------------------- */
  {
    const MARK = "marker-private-quay-3c91";
    const box = await arm("private");
    const priv = textOf(catalog(1, { id: "private-lamps", name: "Private lamps", card: MARK }));
    const outside = path.join(folder("private-out"), "private.ec");
    put(path.dirname(outside), "private.ec", priv);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
    const pin = pinOf(box.D, priv);
    const asked = "sha256:" + "ab".repeat(32);
    putAsk(box, "Askone", asked);
    box.D.api.offerFile(box.D.win, outside);
    box.D.sync("etiuda:catalog-taken", pin);
    const ans = answerPath(box.share, box.me.id);
    const inUse = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    const inUseText = inUse ? JSON.stringify(inUse) : "";
    const inUseMeta = !!(inUse && inUse.catalog && inUse.catalog.id === "private-lamps" && inUseText.indexOf(MARK) < 0);
    check(pin !== asked && inUseMeta,
      "890ak in-use for a catalog the team file does not name carries "
      + (inUse && inUse.catalog ? Object.keys(inUse.catalog).sort().join(",") : "nothing")
      + " and not the card");
    const answer = openSealedDoc(box.D, ans, box.key);
    const answerText = answer ? JSON.stringify(answer) : "";
    const uploaded = !!(answer && answer.catalog && answer.catalog.id === "private-lamps" && answerText.indexOf(MARK) >= 0);
    check(!uploaded && !fs.existsSync(ans),
      "890al an ask for another hash writes no answer for a catalog the team file does not name");
    putAsk(box, "Askmatch", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const matched = openSealedDoc(box.D, ans, box.key);
    const matchedText = matched ? JSON.stringify(matched) : "";
    const raw = fs.existsSync(ans) ? fs.readFileSync(ans, "utf8") : "";
    check(!!matched && matched.kind === "etiuda-catalog-answer" && matched.sha256 === pin
        && matchedText.indexOf(MARK) >= 0 && raw.indexOf(MARK) < 0,
      "890am THE CONTROL: an ask naming the loaded catalog's hash is answered, sealed, and the share does not hold the card in the clear");
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }
}

check(regStand.held(), "890ab every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
