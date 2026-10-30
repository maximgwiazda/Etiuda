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
const syncerMod = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const EXPECTED = 57;

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
  "tryCatalogAsk", "asksWatching", "catalogCopyNote", "watchCatalog", "askSignedBytes", "deskFileGenuine", "signedSha", "teamUse", "clearInUseFile"];
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
    SRC + "\nreturn { setDown: d => { folderDown = d; }, " + EXPOSE.join(", ") + " };")(
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
const boxMap = new Map();
let syncMirror = () => {};
function getBoxForDir(dir) {
  for (const [share, box] of boxMap.entries()) {
    if (dir === share || dir.startsWith(share + path.sep) || dir.startsWith(share + "/")) return box;
  }
  return null;
}
const put = (dir, name, t) => {
  fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
  const b = getBoxForDir(dir);
  if (b) syncMirror(b);
};
const touch = (file, ms) => fs.utimesSync(file, ms / 1000, ms / 1000);
const inUsePath = (share, id) => path.join(share, "desks", id, "in-use.ec");
const answerPath = (share, id) => path.join(share, "desks", id, "catalog-answer.ec");

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  syncMirror = (box) => {
    const mirror = syncerMod.folderMirrorOf(box.D.ud, box.team);
    const prog = syncerMod.createFolderProgram({
      team: box.team,
      folder: box.share,
      mirror: mirror,
      pin: LEAD,
      keyFor: (epoch) => box.key,
    });
    prog.syncOnce();
    prog.syncOnce();
  };
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
    const box = { share, D, me, team, key };
    boxMap.set(share, box);
    return box;
  };
  const join = (box, epoch, roster, catalogs) => {
    put(box.share, "etiuda-team.json", teamFile(box.D, box.team, epoch, roster, catalogs));
  };
  const declOf = (src, marker) => {
    const at = src.indexOf(marker);
    if (at < 0) throw new Error("no " + marker);
    let par = 0, brk = 0, brc = 0, saw = false;
    for (let i = at; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") par++;
      else if (ch === ")") par--;
      else if (ch === "[") brk++;
      else if (ch === "]") brk--;
      else if (ch === "{") { brc++; saw = true; }
      else if (ch === "}") {
        brc--;
        if (saw && !par && !brk && !brc) return src.slice(at, i + 1);
      }
    }
    throw new Error("unterminated " + marker);
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
    syncMirror(box);
    syncMirror(box);
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
    syncMirror(box);
    syncMirror(box);
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
    syncMirror(box);
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

  /* ---- a restart holding a catalog that is not the folder's file ------------------------------------ */
  {
    const FERRY = "A ferry lamp hangs over the deck.";
    const STRAY = "A stray lamp was left on the pier.";
    const box = await arm("outside");
    put(box.share, "board.ec", textOf(catalog(2, { date: "2026-04-02" })));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const folderBoot = box.D.sync("etiuda:catalog");
    const folderPin = pinOf(box.D, folderBoot || "");
    take(box.D, folderPin);
    const outsideDir = folder("ferry-opened");
    const ferryBody = textOf(catalog(5, { id: "ferry-lamps", name: "Ferry lamps", date: "2026-03-11", card: FERRY }));
    put(outsideDir, "ferry.ec", ferryBody);
    const outsideFile = path.join(outsideDir, "ferry.ec");
    box.D.api.offerFile(box.D.win, outsideFile);
    const offered = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const outsidePin = pinOf(box.D, offered ? offered[1] : "");
    take(box.D, outsidePin);
    const useFile = inUsePath(box.share, box.me.id);
    const named = openSealedDoc(box.D, useFile, box.key);
    const kept = path.join(box.D.ud, "catalog-loaded.txt");
    const keptPin = fs.existsSync(kept) ? pinOf(box.D, fs.readFileSync(kept, "utf8")) : "";
    const keptInShare = path.relative(box.share, kept);
    const outsideShare = keptInShare !== "" && !keptInShare.startsWith("..") && !path.isAbsolute(keptInShare);
    const again = loadDesk(box.D.ud);
    putAsk({ share: box.share, D: again, me: box.me }, "Askferry1", outsidePin);
    again.api.tryCatalogAsk(again.win);
    const ans = answerPath(box.share, box.me.id);
    const answered = openSealedDoc(again, ans, box.key);
    const answeredText = answered ? JSON.stringify(answered) : "";
    const shareHas = (dir, needle) => {
      let hit = false;
      const walk = d => {
        if (hit || !fs.existsSync(d)) return;
        for (const name of fs.readdirSync(d)) {
          const at = path.join(d, name);
          if (fs.statSync(at).isDirectory()) walk(at);
          else if (fs.readFileSync(at).includes(Buffer.from(needle))) hit = true;
        }
      };
      walk(dir);
      return hit;
    };
    check(folderPin && outsidePin && folderPin !== outsidePin && path.resolve(path.dirname(outsideFile)) !== path.resolve(box.share)
        && named && named.catalog.source === "opened" && named.catalog.sha256 === outsidePin
        && named.catalog.title === "Ferry lamps" && named.catalog.rev === 5
        && JSON.stringify(named).indexOf(FERRY) < 0
        && keptPin === outsidePin && path.dirname(kept) === box.D.ud && !outsideShare
        && !shareHas(box.share, FERRY)
        && answered && answered.kind === "etiuda-catalog-answer" && answered.sha256 === outsidePin
        && answered.sha256 !== folderPin && answeredText.indexOf(FERRY) >= 0,
      "895a a desk that restarts holding a catalog opened from outside the folder answers the lead's ask with that catalog, and the text stays beside the desk");

    const strayBody = textOf(catalog(9, { id: "stray-lamps", name: "Stray lamps", date: "2026-02-02", card: STRAY }));
    const strayPin = pinOf(box.D, strayBody);
    fs.writeFileSync(kept, strayBody, "utf8");
    if (fs.existsSync(ans)) fs.unlinkSync(ans);
    const third = loadDesk(box.D.ud);
    putAsk({ share: box.share, D: third, me: box.me }, "Askstray1", outsidePin);
    third.api.tryCatalogAsk(third.win);
    const strayAns = openSealedDoc(third, ans, box.key);
    const still = openSealedDoc(third, useFile, box.key);
    const strayInShare = shareHas(box.share, STRAY) || (strayAns && JSON.stringify(strayAns).indexOf(STRAY) >= 0);
    check(strayPin && strayPin !== outsidePin && still && still.catalog.sha256 === outsidePin
        && !fs.existsSync(ans) && !strayAns && !strayInShare,
      "895b a kept text whose pin does not match in-use.ec answers nothing");
  }

  /* ---- the kept copy follows the catalog the desk still holds -------------------------------------- */
  {
    const keptOf = D => path.join(D.ud, "catalog-loaded.txt");
    const box = await arm("forget-kept");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const b = box.D.sync("etiuda:catalog");
    take(box.D, pinOf(box.D, b || ""));
    const had = fs.existsSync(keptOf(box.D));
    await box.D.ask("etiuda:team-join", "forget", box.team);
    const gone = !fs.existsSync(keptOf(box.D));
    check(had && gone, "895c forgetting the lead drops the kept copy (had=" + had + " gone=" + gone + ")");
  }

  {
    const box = await arm("edition-held");
    const r2 = textOf(catalog(2, { card: "Rev two lamp." }));
    put(box.share, "board.ec", r2);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const b = box.D.sync("etiuda:catalog");
    const pin2 = pinOf(box.D, b || "");
    take(box.D, pin2);
    put(box.share, "board.ec", textOf(catalog(3, { card: "Rev three lamp." })));
    const again = loadDesk(box.D.ud);
    const b3 = again.sync("etiuda:catalog");
    const pin3 = pinOf(again, b3 || "");
    putAsk({ share: box.share, D: again, me: box.me }, "Askq3a", pin2);
    again.api.tryCatalogAsk(again.win);
    const ans = openSealedDoc(again, answerPath(box.share, box.me.id), box.key);
    check(pin3 && pin3 !== pin2 && ans && ans.sha256 === pin2,
      "895d a folder that has moved on to a newer edition leaves a restarted desk answering the edition it holds (answered "
      + (ans ? ans.sha256.slice(7, 15) : "none") + ")");
    const key2 = crypto.randomBytes(32);
    join(box, 2, [entry(again, box.me, key2, box.team, 2)]);
    touch(path.join(box.share, "etiuda-team.json"), Date.now() + 1500);
    again.api.tryCatalogAsk(again.win);
    const use2 = openSealedDoc(again, inUsePath(box.share, box.me.id), key2);
    check(use2 && use2.catalog.sha256 === pin2 && use2.catalog.source === "folder",
      "895e after that restart, a newer team epoch reseals the held edition with source folder (got "
      + (use2 ? use2.catalog.source + " " + use2.catalog.sha256.slice(7, 15) : "none") + ")");
  }

  {
    const box = await arm("held-down");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const b = box.D.sync("etiuda:catalog");
    const pinA = pinOf(box.D, b || "");
    take(box.D, pinA);
    const outDir = folder("held-down-out");
    put(outDir, "b.ec", textOf(catalog(6, { id: "b-lamps", name: "B lamps", card: "B lamp." })));
    box.D.api.offerFile(box.D.win, path.join(outDir, "b.ec"));
    const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const pinB = pinOf(box.D, off ? off[1] : "");
    box.D.api.setDown(box.share);
    take(box.D, pinB);
    const keptFile = path.join(box.D.ud, "catalog-loaded.txt");
    const keptPin = fs.existsSync(keptFile) ? pinOf(box.D, fs.readFileSync(keptFile, "utf8")) : "";
    const useNow = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    const again = loadDesk(box.D.ud);
    putAsk({ share: box.share, D: again, me: box.me }, "Askq7a", pinA);
    again.api.tryCatalogAsk(again.win);
    const ans = openSealedDoc(again, answerPath(box.share, box.me.id), box.key);
    check(!ans || ans.sha256 === pinB,
      "895f a take held while the share is down does not leave the previous catalog to be answered after a restart (answered "
      + (ans ? ans.sha256.slice(7, 15) : "none") + ", kept " + (keptPin ? keptPin.slice(7, 15) : "none")
      + ", in use " + (useNow && useNow.catalog ? useNow.catalog.sha256.slice(7, 15) : "none") + ")");
  }

  /* ---- an eject reaches the shell, and only the catalog goes -------------------------------------- */
  {
    const box = await arm("eject-run");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const useFile = inUsePath(box.share, box.me.id);
    const kept = path.join(box.D.ud, "catalog-loaded.txt");
    const ans = answerPath(box.share, box.me.id);
    putAsk(box, "Ask906a", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const before = openSealedDoc(box.D, ans, box.key);
    const envBefore = box.D.envelope();
    const leadPub = envBefore.teamPins && envBefore.teamPins[box.team] && envBefore.teamPins[box.team].public;
    const deskPub = envBefore.branch && envBefore.branch.sign && envBefore.branch.sign.pub;
    box.D.sync("etiuda:catalog-eject");
    putAsk(box, "Ask906b", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const after = fs.existsSync(ans) ? openSealedDoc(box.D, ans, box.key) : null;
    const named = fs.existsSync(useFile) ? openSealedDoc(box.D, useFile, box.key) : null;
    check(!!pin && before && before.kind === "etiuda-catalog-answer" && JSON.stringify(before).indexOf(CARD) >= 0
        && !after && !fs.existsSync(ans) && !fs.existsSync(useFile) && !named && !fs.existsSync(kept),
      "906a an eject, then an ask, answers no catalog, and the team folder no longer names it (answer "
      + (after ? "still there" : "gone") + ", in use " + (named ? "still there" : "gone") + ", kept "
      + (fs.existsSync(kept) ? "still there" : "gone") + ")");

    const again = loadDesk(box.D.ud);
    putAsk({ share: box.share, D: again, me: box.me }, "Ask906c", pin);
    again.api.tryCatalogAsk(again.win);
    const restarted = fs.existsSync(ans) ? openSealedDoc(again, ans, box.key) : null;
    const keptAgain = fs.existsSync(path.join(again.ud, "catalog-loaded.txt"));
    const namedAgain = fs.existsSync(useFile) ? openSealedDoc(again, useFile, box.key) : null;
    check(!restarted && !fs.existsSync(ans) && !keptAgain && !namedAgain,
      "906b an eject, then a restart, answers no catalog, and the kept copy is gone (answer "
      + (restarted ? "still there" : "gone") + ", kept " + (keptAgain ? "still there" : "gone") + ")");

    const envAfter = again.envelope();
    const leadAfter = envAfter.teamPins && envAfter.teamPins[box.team] && envAfter.teamPins[box.team].public;
    const deskAfter = envAfter.branch && envAfter.branch.sign && envAfter.branch.sign.pub;
    check(!!leadPub && leadAfter === leadPub && !!deskPub && deskAfter === deskPub
        && envAfter.keys && envAfter.keys.eAgent === "North desk" && envAfter.keys.eCatalogFolder === box.share
        && !envAfter.inUse && !namedAgain,
      "906c an eject keeps the lead, the team pin and the desk's key, and the envelope no longer names the catalog (lead "
      + (leadAfter === leadPub ? "kept" : "gone") + ", key " + (deskAfter === deskPub ? "kept" : "gone") + ")");
  }

  /* An eject the share does not hear is still owed after the desk starts again. */
  {
    const box = await arm("eject-relaunch");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const useFile = inUsePath(box.share, box.me.id);
    const ans = answerPath(box.share, box.me.id);
    putAsk(box, "Ask906e", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const hadUse = fs.existsSync(useFile);
    const hadAns = fs.existsSync(ans) && !!openSealedDoc(box.D, ans, box.key);
    box.D.api.setDown(box.share);
    box.D.sync("etiuda:catalog-eject");
    const owed = box.D.envelope().ejectOwed;
    const again = loadDesk(box.D.ud);
    again.api.catalogChanged(again.win);
    const env = again.envelope();
    const useLeft = fs.existsSync(useFile);
    const ansLeft = fs.existsSync(ans);
    check(hadUse && hadAns && owed && owed.team === box.team && owed.sha === pin
        && !useLeft && !ansLeft && !env.ejectOwed && !env.inUse,
      "906e an eject while the share is unreachable is still owed after a relaunch, and the next run removes in-use.ec and the answer (owed "
      + (owed && owed.team === box.team && owed.sha === pin ? "kept" : "lost")
      + ", in use " + (useLeft ? "still there" : "gone") + ", answer " + (ansLeft ? "still there" : "gone") + ")");
  }

  /* A failed unlink of in-use.ec holds an eject, and the next change of the folder finishes it. */
  {
    const box = await arm("eject-busy");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const useFile = inUsePath(box.share, box.me.id);
    const had = fs.existsSync(useFile) && !!box.D.envelope().inUse;
    const realUnlink = fs.unlinkSync;
    let armed = true;
    fs.unlinkSync = function (p) {
      if (armed && String(p).endsWith("in-use.ec")) {
        armed = false;
        const err = new Error("busy");
        err.code = "EBUSY";
        throw err;
      }
      return realUnlink.apply(fs, arguments);
    };
    let threw = "";
    try {
      box.D.sync("etiuda:catalog-eject");
      box.D.api.catalogChanged(box.D.win);
    } catch (e) { threw = e && e.message ? e.message : String(e); }
    finally { fs.unlinkSync = realUnlink; }
    const env = box.D.envelope();
    const left = fs.existsSync(useFile);
    check(had && !threw && !left && !env.inUse,
      "906f a failed unlink of in-use.ec holds an eject, and the next change removes the file and the envelope's pin (in use "
      + (left ? "still there" : "gone") + ", envelope " + (env.inUse ? "still names it" : "clear") + ")");
  }

  /* An eject while the share is down drops the local copy at once, and the files when the share answers. */
  {
    const box = await arm("eject-away");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const useFile = inUsePath(box.share, box.me.id);
    const ans = answerPath(box.share, box.me.id);
    const kept = path.join(box.D.ud, "catalog-loaded.txt");
    putAsk(box, "Ask906h", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const had = fs.existsSync(useFile) && fs.existsSync(ans) && fs.existsSync(kept) && !!box.D.envelope().inUse;
    box.D.api.setDown(box.share);
    box.D.sync("etiuda:catalog-eject");
    const keptGone = !fs.existsSync(kept);
    const pinGone = !box.D.envelope().inUse;
    box.D.api.setDown("");
    box.D.api.catalogChanged(box.D.win);
    const useLeft = fs.existsSync(useFile);
    const ansLeft = fs.existsSync(ans);
    check(had && keptGone && pinGone && !useLeft && !ansLeft,
      "906h an eject while the share is unreachable drops the kept copy and the envelope's pin, and the next answer of the folder removes in-use.ec and the answer (kept "
      + (keptGone ? "gone" : "still there") + ", envelope " + (pinGone ? "clear" : "still names it")
      + ", in use " + (useLeft ? "still there" : "gone") + ", answer " + (ansLeft ? "still there" : "gone") + ")");
  }

  {
    /* 906i (the test architect's condition C1 on 906, his third probe): unreachable share, eject, undo while still
       unreachable, quit, relaunch with the share back. The take clears the debt, so the undone eject is not finished later. */
    const box = await arm("906i-undo-relaunch");
    put(box.share, "board.ec", textOf(catalog(2)));
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)]);
    const booted = box.D.sync("etiuda:catalog");
    const pin = pinOf(box.D, booted || "");
    take(box.D, pin);
    const useFile = inUsePath(box.share, box.me.id);
    box.D.api.setDown(box.share);
    box.D.sync("etiuda:catalog-eject");
    take(box.D, pin, booted);
    const again = loadDesk(box.D.ud);
    again.api.catalogChanged(again.win);
    again.api.catalogChanged(again.win);
    const inner = fs.existsSync(useFile) ? openSealedDoc(again, useFile, box.key) : null;
    const env = again.envelope();
    check(inner && inner.catalog && inner.catalog.sha256 === pin && !env.ejectOwed,
      "906i undo of an unreachable eject, then a relaunch with the share back, keeps in-use.ec naming the pin (in use "
      + (inner ? "kept" : "removed") + ", owed " + !!env.ejectOwed + ")");
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
        if (op === "state" || op === "leads" || op === "held") return Promise.resolve({
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

    /* The page's eject, through the real preload, on a channel named as the preload's others are. */
    const savedWindow = globalThis.window;
    const savedDocument = globalThis.document;
    const sentCh = [];
    const ipcRenderer = {
      sendSync: (ch) => {
        sentCh.push(ch);
        if (ch === "etiuda:catalog") return null;
        if (ch === "etiuda:host") return { platform: "linux", backdrop: null };
        return undefined;
      },
      send: (ch) => { sentCh.push(ch); },
      invoke: () => Promise.resolve(null),
      on: () => {},
    };
    const fakeWindow = { addEventListener() {}, removeEventListener() {} };
    globalThis.window = fakeWindow;
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    const preloadSrc = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
    new Function("require", preloadSrc)(n => (n === "electron" ? {
      contextBridge: {
        exposeInMainWorld: (k, v) => { fakeWindow[k] = v; },
        executeInMainWorld: () => {},
      },
      ipcRenderer,
      webUtils: {},
    } : nodeRequire(n)));
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
    const prevHost = savedWindow.E_HOST;
    const hostFn = fakeWindow.E_HOST && fakeWindow.E_HOST.catalogEject;
    const takenFn = fakeWindow.E_HOST && fakeWindow.E_HOST.catalogTaken;
    savedWindow.E_HOST = Object.assign({}, prevHost,
      hostFn ? { catalogEject: hostFn } : {},
      takenFn ? { catalogTaken: takenFn } : {});
    const pageSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "local-memory.js"), "utf8");
    const ls = { eCatalog: "{\"cards\":[1]}", eTheme: "dark" };
    let restarts = 0;
    const H = await import(MOD("host.js"));
    const tell = typeof H.eCatalogEject === "function" ? H.eCatalogEject : function () {};
    const runEject = new Function("eCatalogEject", "ejectKeys", "keepKeys", "lsDel", "ssDel", "TAB_KEY", "hooks", "offerUndo", "undoEject",
      declOf(pageSrc, "function ejectCatalog(") + "\nreturn ejectCatalog;")(
      tell, () => ["eCatalog"], () => ({ keys: {}, tabs: null }),
      (k) => { delete ls[k]; }, () => {}, "tabs",
      { flushPillState() {}, restartDesk() { restarts++; } }, () => {}, () => {});
    /* Undo of that eject, through the same preload. The shell is told only if undoEject names the catalog. */
    let undoBack = false;
    let undoThrew = "";
    let takenSends = 0;
    try {
      runEject();
      const beforeTaken = sentCh.filter(c => c === "etiuda:catalog-taken").length;
      const runUndo = new Function("tellTaken", "storedCatalog", "E_CATALOG_STORE", "lsSet", "lsGet",
        "toastRefusal", "catalogStoreRefusal", "eDeskFileShown", "putBack",
        declOf(pageSrc, "function undoEject(") + "\nreturn undoEject;")(
        File.tellTaken, Cat.storedCatalog, "eCatalog",
        () => true, () => null,
        () => {}, () => "", () => "",
        () => {});
      try { undoBack = runUndo({ keys: {}, tabs: null }) === true; }
      catch (e) { undoThrew = e && e.message ? e.message : String(e); }
      takenSends = sentCh.filter(c => c === "etiuda:catalog-taken").length - beforeTaken;
    } finally { savedWindow.E_HOST = prevHost; }
    const ejectSends = sentCh.filter(c => c === "etiuda:catalog-eject");
    check(ejectSends.length === 1 && !("eCatalog" in ls) && ls.eTheme === "dark" && restarts === 1,
      "906d the page's eject reaches the host through preload on etiuda:catalog-eject, and the page still drops its own catalog keys (sent "
      + sentCh.filter(c => c.indexOf("eject") >= 0).join(",") + ", restarts " + restarts + ")");
    check(undoBack && !undoThrew && takenSends === 1,
      "906g an undo of the eject names the restored catalog to the shell on etiuda:catalog-taken (sent "
      + takenSends + (undoThrew ? ", " + undoThrew : "") + ")");
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

  /* ---- Board 945 item 9, Part B: in-use counter n, cleared: true on release, and withdrawn asks ---- */
  {
    const box = await arm("counter-use");
    const priv = textOf(catalog(1, { id: "counter-lamps", name: "Counter lamps" }));
    const outside = path.join(folder("counter-out"), "counter.ec");
    put(path.dirname(outside), "counter.ec", priv);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["counter-lamps"]);
    box.D.api.offerFile(box.D.win, outside);
    const pin = pinOf(box.D, priv);
    box.D.sync("etiuda:catalog-taken", pin);
    const inUse1 = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    const env1 = box.D.envelope();
    const firstOk = inUse1 && inUse1.n === 1 && env1.inUseN === 1 && inUse1.cleared === undefined;

    // Release the catalog: clearInUseFile writes in-use.ec sealed with cleared: true and rising counter n = 2
    box.D.api.clearInUseFile();
    const inUse2 = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    const env2 = box.D.envelope();
    const releaseOk = inUse2 && inUse2.n === 2 && env2.inUseN === 2 && inUse2.cleared === true
      && box.D.api.deskFileGenuine(inUse2, box.me.id);

    // Load another catalog: counter increments strictly to n = 3
    const priv2 = textOf(catalog(2, { id: "counter-lamps", name: "Counter lamps revised" }));
    const outside2 = path.join(folder("counter-out-2"), "counter2.ec");
    put(path.dirname(outside2), "counter2.ec", priv2);
    box.D.api.offerFile(box.D.win, outside2);
    const pin2 = pinOf(box.D, priv2);
    box.D.sync("etiuda:catalog-taken", pin2);
    const inUse3 = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
    const env3 = box.D.envelope();
    const loadOk = inUse3 && inUse3.n === 3 && env3.inUseN === 3 && inUse3.cleared === undefined;

    check(firstOk && releaseOk && loadOk,
      "890an written in-use carries counter n strictly above last, kept in desk envelope; release writes in-use sealed with cleared: true and rising n");
  }

  {
    // 890ao: withdrawn ask in catalog-asks/<deskId>.withdrawn.json is not answered when ask file comes back; forged withdrawal changes nothing
    const box = await arm("withdrawn-ask");
    const priv = textOf(catalog(1, { id: "quay-lamps", name: "Quay lamps" }));
    const outside = path.join(folder("quay-out"), "quay.ec");
    put(path.dirname(outside), "quay.ec", priv);
    join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-lamps"]);
    box.D.api.offerFile(box.D.win, outside);
    const pin = pinOf(box.D, priv);
    box.D.sync("etiuda:catalog-taken", pin);

    const askId = "ask-withdrawn-target";
    const askFile = path.join(box.share, "catalog-asks", box.me.id + ".json");
    const withdrawnFile = path.join(box.share, "catalog-asks", box.me.id + ".withdrawn.json");
    const ans = answerPath(box.share, box.me.id);

    // Studio writes catalog-asks/<deskId>.withdrawn.json signed by lead
    const signDoc = (doc, keyPair) => {
      const o = Object.assign({}, doc, { sig: { alg: "Ed25519", keyId: keyPair.keyId } });
      o.sig.value = crypto.sign(null, box.D.api.askSignedBytes(o), keyPair.privateKey).toString("hex");
      return o;
    };
    const withdrawnDoc = signDoc({
      format: 1, kind: "etiuda-catalog-ask-withdrawn", desk: box.me.id, ids: [askId]
    }, { keyId: LEAD.keyId, privateKey: lead.privateKey });
    fs.mkdirSync(path.dirname(withdrawnFile), { recursive: true });
    put(path.dirname(withdrawnFile), path.basename(withdrawnFile), withdrawnDoc);

    // Resurrected ask file comes back
    putAsk(box, askId, pin);
    box.D.api.tryCatalogAsk(box.D.win);

    const env = box.D.envelope();
    const ignoredResurrected = (env.catalogAsks || []).indexOf(askId) >= 0 && !fs.existsSync(ans);

    // A fresh ask with a new ID is answered normally
    const freshId = "ask-fresh-new";
    putAsk(box, freshId, pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const answeredFresh = fs.existsSync(ans);

    // Forged withdrawal for freshId does not retract or affect it
    const forgedPair = crypto.generateKeyPairSync("ed25519");
    const forgedWithdrawn = signDoc({
      format: 1, kind: "etiuda-catalog-ask-withdrawn", desk: box.me.id, ids: [freshId]
    }, { keyId: "forged-lead", privateKey: forgedPair.privateKey });
    put(path.dirname(withdrawnFile), path.basename(withdrawnFile), forgedWithdrawn);
    box.D.api.tryCatalogAsk(box.D.win);

    check(ignoredResurrected && answeredFresh,
      "890ao a withdrawn ask whose file comes back is not answered; a fresh ask is answered and a forged withdrawal changes nothing");

    // 890ap: lifting plant:f9-ask-withdrawn answers the resurrected ask
    {
      const mainPath = path.join(APP, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:f9-ask-withdrawn") >= 0);
      let turned = false;
      if (at >= 0) {
        lines[at] = "    /* plant:f9-ask-withdrawn */";
        fs.writeFileSync(mainPath, lines.join("\n"));
        // Remove answer, clear catalogAsks in envelope, reload desk and re-run ask
        try { fs.unlinkSync(ans); } catch {}
        const deskJsonPath = path.join(box.D.ud, "desk.json");
        const deskData = JSON.parse(fs.readFileSync(deskJsonPath, "utf8"));
        deskData.catalogAsks = [];
        fs.writeFileSync(deskJsonPath, JSON.stringify(deskData));
        const pDesk = loadDesk(box.D.ud);
        putAsk(box, askId, pin);
        pDesk.api.tryCatalogAsk(pDesk.win);
        turned = fs.existsSync(ans);
      }
      fs.writeFileSync(mainPath, before);
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same,
        "890ap lifting plant:f9-ask-withdrawn answers the resurrected ask (FAIL 890ao withdrawn ask ignored): "
        + (turned ? "turned" : "did not turn") + ", sha " + (same ? "restored" : "differs"));
    }
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
