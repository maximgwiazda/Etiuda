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
const EXPECTED = 115;

const JOIN_EN = "Once this desk joins, the team's lead can see which catalog it uses, by name and edition. The lead's Studio can take a copy of a catalog the team lists at any time, without asking here, sealed for the team. Any other catalog stays on this desk: its content reaches the lead only if the lead turns on copies of unlisted catalogs in Studio, and this desk is told before anything is sent. A catalog the team does not list can be marked private here, and is then never sent. The desk's use counts only in the team's totals, never on its own.";
const JOIN_PL = "Po dołączeniu lider zespołu widzi, którego katalogu używa to stanowisko (nazwę i wydanie). Kopię katalogu z listy zespołu Studio lidera może pobrać w każdej chwili, bez pytania tutaj, zapieczętowaną dla zespołu. Każdy inny katalog zostaje na tym stanowisku: jego treść trafi do lidera tylko wtedy, gdy lider włączy w Studiu kopie katalogów spoza listy, a to stanowisko zostanie o tym powiadomione, zanim cokolwiek zostanie wysłane. Katalog spoza listy zespołu można tutaj oznaczyć jako prywatny i wtedy nigdy nie jest wysyłany. Wykorzystanie stanowiska wlicza się wyłącznie do sum zespołu i nigdy nie jest pokazywane osobno.";
const STATUS_EN = "The team's lead can see which catalog this desk uses, by name and edition. The lead's Studio can take a copy of a catalog the team lists at any time, without asking here, sealed for the team. Any other catalog stays on this desk, since copies of unlisted catalogs are off. A catalog the team does not list can be marked private here, and is then never sent. The desk's use counts only in the team's totals, never on its own.";
const STATUS_PL = "Lider zespołu widzi, którego katalogu używa to stanowisko (nazwę i wydanie). Kopię katalogu z listy zespołu Studio lidera może pobrać w każdej chwili, bez pytania tutaj, zapieczętowaną dla zespołu. Każdy inny katalog zostaje na tym stanowisku, bo kopie katalogów spoza listy są wyłączone. Katalog spoza listy zespołu można tutaj oznaczyć jako prywatny i wtedy nigdy nie jest wysyłany. Wykorzystanie stanowiska wlicza się wyłącznie do sum zespołu i nigdy nie jest pokazywane osobno.";
const SENT_EN = "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team.";
const SENT_LEAD_EN = "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team's lead alone.";
const SENT_LEAD_PL = "Na prośbę Studia lidera zespołu przesłano kopię katalogu używanego na tym stanowisku wyłącznie liderowi zespołu.";
const SENT_PL = "Na prośbę Studia lidera zespołu przesłano zespołowi kopię katalogu używanego na tym stanowisku.";
const CARD = "The quay lamp is wrapped for the crossing.";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* A planted fault is proof, not a gate: the plants of stage 0 are skipped where ETIUDA_PLANTS is off, and count toward the floor. */
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-catalog-in-use-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "offerFile", "catalogChanged", "readCatalog",
  "tryCatalogAsk", "asksWatching", "catalogCopyNote", "watchCatalog", "askSignedBytes", "deskFileGenuine", "signedSha", "teamUse", "clearInUseFile", "deskTrustChecks", "teamKeyAt", "openAnswerLead", "answerLeadGenuine",
  "writeAnswer", "openBranchLead"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, src) {
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
    (src || SRC) + "\nreturn { setDown: d => { folderDown = d; }, " + EXPOSE.join(", ") + " };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const sync = (ch, ...args) => { const ev = eventFor(); if (on[ch]) on[ch](ev, ...args); return ev.returnValue; };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  return { api, ask, said, ud, envelope, sent, win, sync };
}
function newDesk(name, folder, src) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: folder, eUiLang: "en", eAgent: "North desk" } }), "utf8");
  return loadDesk(ud, src);
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
/* The desk's own files land in its folder team's mirror, and the syncer's outbox carries them to the share (board 945 stage 3
   (b) slice 2), so they are read where the desk writes them; a share no team box knows is read itself. */
const ownDir = (share, id) => {
  const b = getBoxForDir(share);
  return b && b.team && b.D ? path.join(syncerMod.folderMirrorOf(b.D.ud, b.team), "desks", id) : path.join(share, "desks", id);
};
const inUsePath = (share, id) => path.join(ownDir(share, id), "in-use.ec");
const answerPath = (share, id) => path.join(ownDir(share, id), "catalog-answer.ec");

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  /* The lead's box, the X25519 key an answer about a catalog the team does not list is sealed to (board 962, stage 0). */
  const leadBox = crypto.generateKeyPairSync("x25519");
  const BOX = pubHex(leadBox.publicKey);
  syncMirror = (box) => {
    const mirror = syncerMod.folderMirrorOf(box.D.ud, box.team);
    const prog = syncerMod.createFolderProgram({
      team: box.team,
      folder: box.share,
      mirror: mirror,
      pin: LEAD,
      /* The key this desk keeps for the epoch, as the shell's syncer is given: the mirror holds the desk's own files now. */
      keyFor: (epoch) => box.D.api.teamKeyAt(box.team, epoch) || box.key,
      checks: box.D.api.deskTrustChecks(),
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
  /* The lead's switch for a catalog the team does not list (board 962, stage 0b): on in every team file these legs write, and
     shown to the agent at the join, unless a leg passes another switch or null for none. */
  const SWITCH = { format: 1, on: true, by: "Quay lead", at: "2026-11-01T09:00:00.000Z" };
  const teamFile = (D, id, epoch, roster, catalogs, content) => textOf(sign(Object.assign({
    format: 1, kind: "etiuda-team", id, catalogs: catalogs || ["not-this"], lead: Object.assign({}, LEAD, { box: BOX }),
    sealed: true, exportsSealed: false, epoch, roster,
  }, content === null ? {} : { content: content === undefined ? SWITCH : content }), lead.privateKey, LEAD));
  const entry = (D, who, key, team, epoch) => ({
    desk: { id: who.id, key: who.key, box: who.box },
    wrap: D.api.wrapTeamKey(key, who.box, team, epoch, who.id),
  });
  const pinOf = (D, text) => { try { return D.api.signedSha(JSON.parse(text)); } catch { return ""; } };
  const take = (D, pin, text) => text == null ? D.sync("etiuda:catalog-taken", pin) : D.sync("etiuda:catalog-taken", pin, text);
  const fileSha = text => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  const tick = () => new Promise(r => setTimeout(r, 30));
  const expAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  /* Format 2 is an ask made under the lead's switch, naming the team and the switch's at (the one join wrote unless `o` says);
     format 1 is the ask every Studio made before it. */
  const putAsk = (box, id, sha, format, o) => {
    const doc = { format: format || 2, kind: "etiuda-catalog-ask", id: id, desk: box.me.id, sha256: sha, expires: expAt(),
      sig: { alg: "Ed25519", keyId: (o && o.who ? o.who : LEAD).keyId } };
    if (doc.format === 2) {
      doc.team = o && o.team !== undefined ? o.team : box.team;
      doc.content = o && o.at !== undefined ? o.at : (box.at !== undefined ? box.at : SWITCH.at);
    }
    doc.sig.value = crypto.sign(null, box.D.api.askSignedBytes(doc), o && o.key ? o.key : lead.privateKey).toString("hex");
    fs.mkdirSync(path.join(box.share, "catalog-asks"), { recursive: true });
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(doc));
  };
  const openSealedDoc = (D, file, key) => {
    try { return JSON.parse(D.api.openSealed(key, JSON.parse(fs.readFileSync(file, "utf8")))); }
    catch { return null; }
  };
  /* The lead's view of an answer: the team key where it opens, else the lead's box, bound to the folder's desk id. */
  const openLeadDoc = (D, file) => {
    try {
      const t = D.api.openAnswerLead(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), path.basename(path.dirname(file)));
      return t ? JSON.parse(t) : null;
    } catch { return null; }
  };
  const openAnswerDoc = (D, file, key) => openSealedDoc(D, file, key) || openLeadDoc(D, file);
  const arm = async (name, src) => {
    const share = folder(name + "-share");
    put(share, "etiuda-ring.json", RING);
    const D = newDesk(name, share, src);
    const me = await D.ask("etiuda:branch-identity", true);
    const team = "t-" + crypto.randomBytes(8).toString("hex");
    const key = crypto.randomBytes(32);
    const box = { share, D, me, team, key };
    boxMap.set(share, box);
    return box;
  };
  const join = (box, epoch, roster, catalogs, content, unsaid) => {
    put(box.share, "etiuda-team.json", teamFile(box.D, box.team, epoch, roster, catalogs, content));
    const sw = content === undefined ? SWITCH : content;
    box.at = sw && typeof sw.at === "string" ? sw.at : "";
    if (sw && !unsaid) box.D.ask("etiuda:team-join", "content-said", box.team, sw.at);
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
      /* Grown from the team's signed edition of the catalog it lists, so it goes to the share as a desk file (board 962, stage
         0b; stage 5 asks the first hop to be the lead's signed edition, so that edition sits in the share). */
      grew: { id: "not-this", rev: 1, sha: "" },
    };
    const notThis = textOf(catalog(1, { id: "not-this", name: "Not this" }));
    put(box.share, "not-this.ec", notThis);
    deskDoc.grew.sha = pinOf(box.D, notThis);
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
    check(had && !fs.existsSync(inUsePath(box.share, box.me.id)) && !fs.existsSync(path.join(box.share, "desks", box.me.id, "in-use.ec"))
        && !box.D.envelope().inUse,
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
    const openedOld = openAnswerDoc(box.D, ans, box.key);
    check(use.member === true && use.stale === true && use.seal && use.seal.epoch === 1
        && !fs.existsSync(ans) && !openedOld && Buffer.compare(before, fs.readFileSync(file)) === 0,
      "890ac a team file whose new key this desk cannot open seals nothing under the older key");

    const held = await arm("joinheld");
    put(held.share, "board.ec", textOf(catalog(2)));
    const bootedH = held.D.sync("etiuda:catalog");
    const pinH = pinOf(held.D, bootedH || "");
    take(held.D, pinH);
    const missing = !fs.existsSync(inUsePath(held.share, held.me.id));
    /* The switch is shown after the ask lands: saying it at the join would heed the team and name the catalog before the ask. */
    join(held, 1, [entry(held.D, held.me, held.key, held.team, 1)], undefined, undefined, true);
    putAsk(held, "Askjoin1", pinH);
    held.D.api.catalogChanged(held.D.win);
    await held.D.ask("etiuda:team-join", "content-said", held.team, SWITCH.at);
    const joined = openSealedDoc(held.D, inUsePath(held.share, held.me.id), held.key);
    const joinedAns = openAnswerDoc(held.D, answerPath(held.share, held.me.id), held.key);
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
    const lateAns = openAnswerDoc(late.D, answerPath(late.share, late.me.id), keyL);
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
    putAsk(Object.assign({}, box, { D: again }), "Askferry1", outsidePin);
    again.api.tryCatalogAsk(again.win);
    const ans = answerPath(box.share, box.me.id);
    const answered = openAnswerDoc(again, ans, box.key);
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
    putAsk(Object.assign({}, box, { D: third }), "Askstray1", outsidePin);
    third.api.tryCatalogAsk(third.win);
    const strayAns = openAnswerDoc(third, ans, box.key);
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
    putAsk(Object.assign({}, box, { D: again }), "Askq3a", pin2);
    again.api.tryCatalogAsk(again.win);
    const ans = openAnswerDoc(again, answerPath(box.share, box.me.id), box.key);
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
    putAsk(Object.assign({}, box, { D: again }), "Askq7a", pinA);
    again.api.tryCatalogAsk(again.win);
    const ans = openAnswerDoc(again, answerPath(box.share, box.me.id), box.key);
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
    const before = openAnswerDoc(box.D, ans, box.key);
    const envBefore = box.D.envelope();
    const leadPub = envBefore.teamPins && envBefore.teamPins[box.team] && envBefore.teamPins[box.team].public;
    const deskPub = envBefore.branch && envBefore.branch.sign && envBefore.branch.sign.pub;
    box.D.sync("etiuda:catalog-eject");
    putAsk(box, "Ask906b", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const after = fs.existsSync(ans) ? openAnswerDoc(box.D, ans, box.key) : null;
    const named = fs.existsSync(useFile) ? openSealedDoc(box.D, useFile, box.key) : null;
    check(!!pin && before && before.kind === "etiuda-catalog-answer" && JSON.stringify(before).indexOf(CARD) >= 0
        && !after && !fs.existsSync(ans) && !fs.existsSync(useFile) && !named && !fs.existsSync(kept),
      "906a an eject, then an ask, answers no catalog, and the team folder no longer names it (answer "
      + (after ? "still there" : "gone") + ", in use " + (named ? "still there" : "gone") + ", kept "
      + (fs.existsSync(kept) ? "still there" : "gone") + ")");

    const again = loadDesk(box.D.ud);
    putAsk(Object.assign({}, box, { D: again }), "Ask906c", pin);
    again.api.tryCatalogAsk(again.win);
    const restarted = fs.existsSync(ans) ? openAnswerDoc(again, ans, box.key) : null;
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
    const hadAns = fs.existsSync(ans) && !!openAnswerDoc(box.D, ans, box.key);
    box.D.api.setDown(box.share);
    box.D.sync("etiuda:catalog-eject");
    /* On a folder team the eject lands in the mirror and its outbox owes the share the two removals, across a relaunch. */
    const mirror = syncerMod.folderMirrorOf(box.D.ud, box.team), own = "desks/" + box.me.id + "/";
    const owed = box.D.envelope().ejectOwed || (syncerMod.owedAt(mirror, own + "in-use.ec") && syncerMod.owedAt(mirror, own + "catalog-answer.ec")
      ? { team: box.team, sha: pin } : null);
    const again = loadDesk(box.D.ud);
    again.api.catalogChanged(again.win);
    const env = again.envelope();
    syncMirror(box);
    const useLeft = fs.existsSync(useFile) || fs.existsSync(path.join(box.share, own, "in-use.ec"));
    const ansLeft = fs.existsSync(ans) || fs.existsSync(path.join(box.share, own, "catalog-answer.ec"));
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
    const askBoot = { format: 2, kind: "etiuda-catalog-ask", id: "Askboot1", desk: boot.me.id, sha256: againPin, team: boot.team, content: SWITCH.at,
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
    const bootAns = openAnswerDoc(again, answerPath(boot.share, boot.me.id), boot.key);
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
    /* Not said here: saying the switch heeds the team before this leg keeps its history, and the leg reads the share's. */
    join(hist, 1, [entry(hist.D, hist.me, hist.key, hist.team, 1)], undefined, undefined, true);
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
    mem.eUiLang = "en";
    toastEl.classList.remove("show");
    TJ.noteCatalogCopy({ lead: true });
    const enLead = toastEl.textContent;
    mem.eUiLang = "pl";
    toastEl.classList.remove("show");
    TJ.noteCatalogCopy({ lead: true });
    check(enLead === SENT_LEAD_EN && toastEl.textContent === SENT_LEAD_PL
        && lang.indexOf("\"" + SENT_LEAD_EN + "\":\"" + SENT_LEAD_PL + "\"") >= 0,
      "890s0t a copy of a catalog the team does not list says it went to the team's lead alone, in the desk's language (stage 0)");

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
    const answer = openAnswerDoc(box.D, ans, box.key);
    const answerText = answer ? JSON.stringify(answer) : "";
    const uploaded = !!(answer && answer.catalog && answer.catalog.id === "private-lamps" && answerText.indexOf(MARK) >= 0);
    check(!uploaded && !fs.existsSync(ans),
      "890al an ask for another hash writes no answer for a catalog the team file does not name");
    putAsk(box, "Askmatch", pin);
    box.D.api.tryCatalogAsk(box.D.win);
    const matched = openLeadDoc(box.D, ans);
    const matchedText = matched ? JSON.stringify(matched) : "";
    const raw = fs.existsSync(ans) ? fs.readFileSync(ans, "utf8") : "";
    let env = null;
    try { env = JSON.parse(raw); } catch { env = null; }
    check(!!matched && matched.kind === "etiuda-catalog-answer" && matched.sha256 === pin
        && matchedText.indexOf(MARK) >= 0 && raw.indexOf(MARK) < 0
        && !!env && env.kind === "etiuda-answer-sealed" && env.team === box.team && env.keyId === LEAD.keyId
        && !openSealedDoc(box.D, ans, box.key),
      "890am THE CONTROL: an ask naming the loaded catalog's hash is answered, sealed to the lead's box alone: the lead's box opens it, the team key does not, and the share holds no card in the clear");
  }

  /* ---- board 962, stage 0: who can open an answer ------------------------------------------------------
     A catalog the team lists is answered under the team key; one it does not list, to the lead's box alone; one this desk
     opened from another team's envelope, to nobody. A team file with no box takes no answer for a catalog it does not list. */
  {
    const S0_MARK = "marker-stage0-quay-71d2";
    /* The desk joins a team at its share and holds the key of a second team, as one that left it would. */
    const twoTeams = async (name, src) => {
      const box = await arm(name, src);
      const other = { team: "t-" + crypto.randomBytes(8).toString("hex"), key: crypto.randomBytes(32) };
      const dj = JSON.parse(fs.readFileSync(path.join(box.D.ud, "desk.json"), "utf8"));
      const enc = Buffer.from(Buffer.from(other.key.toString("base64"), "utf8").map(b => b ^ 0x5a)).toString("base64");
      dj.teamKeys = Object.assign({}, dj.teamKeys || {}, { [other.team]: { "1": enc } });
      fs.writeFileSync(path.join(box.D.ud, "desk.json"), JSON.stringify(dj), "utf8");
      box.D = loadDesk(box.D.ud, src);
      return { box, other };
    };
    /* Takes a catalog from outside the share, `sealedBy` sealing it for the other team where given, and asks for its pin. */
    const askFor = (box, name, body, sealedBy) => {
      const dir = folder(name + "-out");
      const text = sealedBy ? JSON.stringify(box.D.api.sealCatalog(sealedBy.key, sealedBy.team, 1, body), null, 1) + "\n" : body;
      put(dir, "held.ec", text);
      box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
      const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
      const pin = pinOf(box.D, off ? off[1] : "");
      take(box.D, pin);
      putAsk(box, "Ask" + name.replace(/[^A-Za-z0-9]/g, ""), pin);
      box.D.api.tryCatalogAsk(box.D.win);
      return pin;
    };
    const quayBody = textOf(catalog(4, { id: "quay-held", name: "Quay held", card: S0_MARK }));

    {
      const box = await arm("s0-listed");
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"]);
      const pin = askFor(box, "s0-listed", quayBody, null);
      const ans = answerPath(box.share, box.me.id);
      const viaTeam = openSealedDoc(box.D, ans, box.key);
      let env = null;
      try { env = JSON.parse(fs.readFileSync(ans, "utf8")); } catch { env = null; }
      check(!!pin && !!viaTeam && viaTeam.sha256 === pin && JSON.stringify(viaTeam).indexOf(S0_MARK) >= 0
          && !!env && env.kind === "etiuda-sealed" && env.team === box.team && !openLeadDoc(box.D, ans),
        "s0a an answer about a catalog the team lists stays sealed under the team key, and is not a lead's-box envelope");
    }

    const unlisted = async (name, src) => {
      const box = await arm(name, src);
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
      const pin = askFor(box, name, quayBody, null);
      const ans = answerPath(box.share, box.me.id);
      return { pin, ans, box, askId: "Ask" + name.replace(/[^A-Za-z0-9]/g, ""), viaTeam: openSealedDoc(box.D, ans, box.key),
        viaLead: openLeadDoc(box.D, ans), raw: fs.existsSync(ans) ? fs.readFileSync(ans, "utf8") : "" };
    };
    {
      const u = await unlisted("s0-unlisted");
      const sv = u.viaLead || {};
      const genuine = u.box.D.api.answerLeadGenuine(sv, u.box.me.id, u.box.me.key);
      const strayKey = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
      const moved = JSON.parse(JSON.stringify(sv));
      moved.ask = "Askelsewhere";
      check(genuine && sv.ask === u.askId && sv.team === u.box.team && !!sv.sig && sv.sig.keyId === u.box.me.id
          && !u.box.D.api.deskFileGenuine(sv, u.box.me.id) && !u.box.D.api.answerLeadGenuine(sv, u.box.me.id, strayKey)
          && !u.box.D.api.answerLeadGenuine(moved, u.box.me.id, u.box.me.key),
        "s0g the box answer is signed by this desk's key under the answer's own prefix, over the ask and the team it answers: it is no desk file, no other key verifies it, and it does not hold for another ask");
      check(!!u.pin && !u.viaTeam && !!u.viaLead && u.viaLead.sha256 === u.pin && JSON.stringify(u.viaLead).indexOf(S0_MARK) >= 0
          && u.raw.indexOf(S0_MARK) < 0,
        "s0b an answer about a catalog the team does not list is sealed to the lead's box: the lead opens it, a teammate's team key does not");
      if (PLANTS_OFF) skip("s0c lifting plant:s0-answer-lead turns s0b red: the unlisted answer opens under the team key");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0-answer-lead") >= 0 ? "  /* plant:s0-answer-lead */" : l).join("\n");
        const p = planted !== SRC ? await unlisted("s0-unlisted-plant", planted) : null;
        check(!!p && !!p.viaTeam && JSON.stringify(p.viaTeam).indexOf(S0_MARK) >= 0,
          "s0c lifting plant:s0-answer-lead turns s0b red: the unlisted answer opens under the team key ("
          + (p ? (p.viaTeam ? "team key opens it" : "team key does not open it") : "plant not found") + ")");
      }
    }

    const otherTeam = async (name, sealed, src) => {
      const { box, other } = await twoTeams(name, src);
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"]);
      const pin = askFor(box, name, quayBody, sealed ? other : null);
      const ans = answerPath(box.share, box.me.id);
      return { pin, written: fs.existsSync(ans), use: openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key) };
    };
    {
      const sealed = await otherTeam("s0-other", true);
      const plain = await otherTeam("s0-other-plain", false);
      check(!!sealed.pin && !!sealed.use && sealed.use.catalog.sha256 === sealed.pin && !sealed.written
          && !!plain.pin && plain.pin === sealed.pin && plain.written,
        "s0d a catalog this desk opened from another team's envelope is not answered, though this team lists it; the same catalog in the clear is");
      if (PLANTS_OFF) skip("s0e lifting plant:s0-other-team turns s0d red: another team's catalog is answered");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0-other-team") >= 0 ? "    /* plant:s0-other-team */" : l).join("\n");
        const p = planted !== SRC ? await otherTeam("s0-other-plant", true, planted) : null;
        check(!!p && p.written,
          "s0e lifting plant:s0-other-team turns s0d red: another team's catalog is answered ("
          + (p ? (p.written ? "answered" : "not answered") : "plant not found") + ")");
      }
    }

    /* A working copy grown from another team's catalog carries that team's cards under an id of its own (Argon's finding 1). */
    const grownFrom = async (name, sealed, src) => {
      const { box, other } = await twoTeams(name, src);
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"]);
      const basePin = askFor(box, name, quayBody, sealed ? other : null);
      const grown = catalog(5, { id: box.me.id + "-1a2b3c4d", name: "Quay held, grown", card: S0_MARK, unsigned: true });
      grown.grew = { id: "quay-held", rev: 4, sha: basePin };
      const grownText = textOf(grown);
      const pin = pinOf(box.D, grownText);
      const ans = answerPath(box.share, box.me.id);
      if (fs.existsSync(ans)) fs.unlinkSync(ans);
      take(box.D, pin, grownText);
      putAsk(box, "Askgrown" + name.replace(/[^A-Za-z0-9]/g, ""), pin);
      box.D.api.tryCatalogAsk(box.D.win);
      const use = openSealedDoc(box.D, inUsePath(box.share, box.me.id), box.key);
      return { pin, named: !!use && use.catalog.sha256 === pin, written: fs.existsSync(ans), lead: openLeadDoc(box.D, ans), team: openSealedDoc(box.D, ans, box.key) };
    };
    {
      const sealed = await grownFrom("s0-grown", true);
      const plain = await grownFrom("s0-grown-plain", false);
      check(!!sealed.pin && sealed.named && !sealed.written
          && plain.named && plain.written && !!plain.team && JSON.stringify(plain.team).indexOf(S0_MARK) >= 0,
        "s0j a working copy grown from another team's sealed catalog is not answered; one grown from the same catalog in the clear is, under the team key, since the team lists the catalog it grew from (Claude alpha's ruling of 12:04)");
      if (PLANTS_OFF) skip("s0k lifting plant:s0-grew turns s0j red: the grown copy of another team's catalog is answered");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0-grew") >= 0 ? "  /* plant:s0-grew */" : l).join("\n");
        const p = planted !== SRC ? await grownFrom("s0-grown-plant", true, planted) : null;
        check(!!p && p.written,
          "s0k lifting plant:s0-grew turns s0j red: the grown copy of another team's catalog is answered ("
          + (p ? (p.written ? "answered" : "not answered") : "plant not found") + ")");
      }
    }

    {
      const box = await arm("s0-nobox");
      put(box.share, "etiuda-team.json", textOf(sign({
        format: 1, kind: "etiuda-team", id: box.team, catalogs: ["harbour-board"], lead: LEAD,
        sealed: true, exportsSealed: false, epoch: 1, roster: [entry(box.D, box.me, box.key, box.team, 1)],
      }, lead.privateKey, LEAD)));
      const pin = askFor(box, "s0-nobox", quayBody, null);
      check(!!pin && !fs.existsSync(answerPath(box.share, box.me.id)),
        "s0f a team file that names no lead's box takes no answer for a catalog it does not list");
    }

    /* ---- board 962, stage 0b: the lead's switch and the agent's private mark, checked where the answer is made ----------
       A catalog the team does not list is answered only to an ask made under the switch (format 2), with the lead's signed
       switch on and shown to the agent at that very confirmation; a catalog the agent marked private, or a copy grown from
       one, is answered to nobody, listed or not; a team-key answer is signed by its desk as a box answer is. */
    const B0_MARK = "marker-stage0b-quay-58e4";
    const b0Body = (id) => textOf(catalog(4, { id: id || "quay-held", name: "Quay held", card: B0_MARK }));
    /* A desk on a team whose file lists `catalogs` under `content` (undefined: SWITCH, said unless `unsaid`), asked for its
       catalog by an ask of `format` (2 unless given). */
    const b0Ask = async (name, o) => {
      const opt = o || {};
      const box = await arm(name, opt.src);
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], opt.catalogs || ["harbour-board"], opt.content, opt.unsaid);
      if (opt.private) box.D.ask("etiuda:team-join", "private", opt.private, "on");
      for (const [n, t] of opt.shareFiles || []) put(box.share, n, t);
      const dir = folder(name + "-out");
      put(dir, "held.ec", opt.body || b0Body());
      box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
      const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
      const pin = pinOf(box.D, off ? off[1] : "");
      take(box.D, pin);
      const askId = "Ask" + name.replace(/[^A-Za-z0-9]/g, "");
      putAsk(box, askId, pin, opt.format);
      box.D.api.tryCatalogAsk(box.D.win);
      const ans = answerPath(box.share, box.me.id);
      return { box, pin, askId, ans, written: fs.existsSync(ans), lead: openLeadDoc(box.D, ans), team: openSealedDoc(box.D, ans, box.key),
        again: () => { box.D.api.tryCatalogAsk(box.D.win); return { written: fs.existsSync(ans), lead: openLeadDoc(box.D, ans), team: openSealedDoc(box.D, ans, box.key) }; } };
    };
    {
      const off = await b0Ask("b0-off", { content: null });
      const on = await b0Ask("b0-on");
      /* The lead turns the switch off after the agent was shown it: a newer team file without it, and the ask asked again. */
      const later = await b0Ask("b0-later");
      const laterWas = later.written;
      join(later.box, 1, [entry(later.box.D, later.box.me, later.box.key, later.box.team, 1)], ["harbour-board"], null);
      touch(path.join(later.box.share, "etiuda-team.json"), Date.now() + 2500);
      putAsk(later.box, "Asklater2", later.pin);
      const laterNow = later.again();
      laterNow.written = !!laterNow.lead && laterNow.lead.ask === "Asklater2";
      check(!!off.pin && !off.written && on.written && !!on.lead && on.lead.content === SWITCH.at && JSON.stringify(on.lead).indexOf(B0_MARK) >= 0
          && laterWas && !laterNow.written,
        "b0a a catalog the team does not list is not answered while the lead's switch is off, and is answered to the lead's box, naming the switch, while it is on; turned off after, it is not answered (off "
        + off.written + ", on " + on.written + ", turned off " + laterNow.written + ")");
      if (PLANTS_OFF) skip("b0i lifting plant:s0b-switch turns b0a red: a catalog the team does not list is answered under a switch the agent was not shown");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-switch") >= 0 ? "  /* plant:s0b-switch */" : l).join("\n");
        const p = planted !== SRC ? await b0Ask("b0-off-plant", { unsaid: true, src: planted }) : null;
        check(!!p && p.written && !!p.lead && JSON.stringify(p.lead).indexOf(B0_MARK) >= 0,
          "b0i lifting plant:s0b-switch turns b0a red: a catalog the team does not list is answered under a switch the agent was not shown ("
          + (p ? (p.written ? "answered" : "not answered") : "plant not found") + ")");
      }
    }
    {
      /* The switch is on and not yet shown to the agent: nothing until the screen says it. A switch confirmed again later, at a
         new time, is said again before it applies, and the page cannot say a switch the team file does not hold. */
      const u = await b0Ask("b0-unsaid", { unsaid: true });
      const shownBefore = await u.box.D.ask("etiuda:team-join", "content");
      const wrong = await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "2026-11-02T09:00:00.000Z");
      const wrongNow = u.again();
      const said = await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, SWITCH.at);
      const saidNow = u.again();
      const NEXT = Object.assign({}, SWITCH, { at: "2026-11-03T10:00:00.000Z" });
      join(u.box, 1, [entry(u.box.D, u.box.me, u.box.key, u.box.team, 1)], ["harbour-board"], NEXT, true);
      touch(path.join(u.box.share, "etiuda-team.json"), Date.now() + 3500);
      putAsk(u.box, "Asknext", u.pin);
      const nextBefore = u.again();
      nextBefore.written = !!nextBefore.lead && nextBefore.lead.ask === "Asknext";
      await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, NEXT.at);
      const nextAfter = u.again();
      nextAfter.written = !!nextAfter.lead && nextAfter.lead.ask === "Asknext";
      const kept = u.box.D.envelope().teamContentSaid || {};
      check(!u.written && shownBefore.on === true && shownBefore.said === false && shownBefore.team === u.box.team && shownBefore.by === "Quay lead"
          && wrong.said === false && !wrongNow.written && said.said === true && saidNow.written && !!saidNow.lead
          && !nextBefore.written && nextAfter.written && !!nextAfter.lead && nextAfter.lead.content === NEXT.at && String(kept[u.box.team] || "").split(String.fromCharCode(10)).pop() === NEXT.at,
        "b0b the switch applies only once the agent was shown it: not before, not for a time the team file does not hold, and a switch confirmed again is shown again before it applies ("
        + [u.written, wrongNow.written, saidNow.written, nextBefore.written, nextAfter.written].join(",") + ")");
    }
    {
      const f1 = await b0Ask("b0-format1", { format: 1 });
      const listed1 = await b0Ask("b0-format1-listed", { format: 1, catalogs: ["quay-held"] });
      check(!!f1.pin && !f1.written && listed1.written && !!listed1.team && JSON.stringify(listed1.team).indexOf(B0_MARK) >= 0,
        "b0c with the switch on and shown, an ask of format 1 takes no catalog the team does not list; one it lists is answered under the team key as before");
    }
    {
      const unlistedP = await b0Ask("b0-private", { private: "quay-held" });
      const listedP = await b0Ask("b0-private-listed", { private: "quay-held", catalogs: ["quay-held"] });
      const g = catalog(5, { id: "k-0123456789abcdef-1a2b3c4d", name: "Quay held, grown", card: B0_MARK, unsigned: true });
      g.grew = { id: "quay-held", rev: 4, sha: "sha256:" + "cd".repeat(32) };
      const grown = await b0Ask("b0-private-grown", { private: "quay-held", body: textOf(g) });
      const view = await listedP.box.D.ask("etiuda:team-join", "private", "quay-held", "off");
      const freed = listedP.again();
      await grown.box.D.ask("etiuda:team-join", "private", "quay-held", "off");
      const grownFreed = grown.again();
      const kept = (listedP.box.D.envelope().catalogPrivate || []).length;
      const env = unlistedP.box.D.envelope().catalogPrivate || [];
      const useDoc = openSealedDoc(unlistedP.box.D, inUsePath(unlistedP.box.share, unlistedP.box.me.id), unlistedP.box.key);
      const nowhere = !!useDoc && !/private/i.test(JSON.stringify(useDoc)) && !/private/i.test(JSON.stringify(fs.readdirSync(unlistedP.box.share)));
      check(!unlistedP.written && listedP.written && !grown.written && Array.isArray(view.private) && view.private.length === 0 && freed.written && !!freed.team && grownFreed.written
          && kept === 0 && env.length === 1 && env[0] === "quay-held" && nowhere,
        "b0d a catalog the team does not list, marked private, is answered to nobody, nor a copy grown from it; a listed one takes no mark and is answered (round six); the mark is kept in the desk envelope alone, and taken off, the catalog is answered ("
        + [unlistedP.written, listedP.written, grown.written, freed.written, grownFreed.written].join(",") + ")");
      if (PLANTS_OFF) skip("b0j lifting plant:s0b-private turns b0d red: a catalog marked private is answered");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-private") >= 0 ? "  /* plant:s0b-private */" : l).join("\n");
        const p = planted !== SRC ? await b0Ask("b0-private-plant", { private: "quay-held", src: planted }) : null;
        check(!!p && p.written,
          "b0j lifting plant:s0b-private turns b0d red: a catalog marked private is answered ("
          + (p ? (p.written ? "answered" : "not answered") : "plant not found") + ")");
      }
    }
    {
      /* A switch in a shape this build does not read: a later format, a field it does not know, or `on` not true. */
      const later = await b0Ask("b0-unknown-format", { content: Object.assign({}, SWITCH, { format: 2 }) });
      const extra = await b0Ask("b0-unknown-field", { content: Object.assign({}, SWITCH, { scope: "all" }) });
      const half = await b0Ask("b0-unknown-on", { content: Object.assign({}, SWITCH, { on: "yes" }) });
      const shown = await later.box.D.ask("etiuda:team-join", "content");
      check(!later.written && !extra.written && !half.written && shown.on === false && shown.said === false,
        "b0e a switch this desk cannot read (a later format, a field it does not know, on not true) reads as off, and nothing the team does not list is answered");
    }
    {
      /* A desk older than the switch: askFresh takes format 1 alone, as every desk before stage 0b does. On a tree without the
         switch the source is that desk itself. */
      const NEW = "  if ((format !== 1 && format !== ASK_CONTENT_FORMAT) || doc.kind !== ASK_KIND) return null;";
      const old = SRC.indexOf(NEW) >= 0 ? SRC.replace(NEW, "  if (+doc.format !== 1 || doc.kind !== ASK_KIND) return null;") : SRC;
      const o = await b0Ask("b0-old-desk", { src: old });
      check(!!o.pin && !o.written,
        "b0f a desk whose askFresh takes format 1 alone, as every desk before the switch, answers no ask made under the switch, though its team file holds the switch on");
    }
    {
      const l = await b0Ask("b0-listed-signed", { format: 1, catalogs: ["quay-held"] });
      const inner = l.team || {};
      const keys = Object.keys(inner).sort().join(",");
      const moved = JSON.parse(JSON.stringify(inner));
      moved.team = "t-" + "0".repeat(16);
      check(keys === "ask,catalog,format,kind,sha256,sig,team" && inner.ask === l.askId && inner.team === l.box.team
          && l.box.D.api.answerLeadGenuine(inner, l.box.me.id, l.box.me.key) && !l.box.D.api.answerLeadGenuine(moved, l.box.me.id, l.box.me.key)
          && !openLeadDoc(l.box.D, l.ans),
        "b0g an answer under the team key is signed by its desk as a box answer is, over the ask and the team, and names no switch (got " + keys + ")");
    }
    {
      /* writeAnswer refuses by itself, whoever calls it: an answer to the lead's box under a switch not shown, and a private catalog. */
      const box = await arm("b0-write");
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"], undefined, true);
      const use = box.D.api.teamUse();
      const doc = JSON.parse(b0Body());
      const pin = box.D.api.signedSha(doc);
      let toLead = null, priv = null, shown = null;
      try { toLead = box.D.api.writeAnswer(use, pin, doc, true, "Askwrite1"); } catch (e) { toLead = "threw " + e.message; }
      box.D.ask("etiuda:team-join", "private", "quay-held", "on");
      try { priv = box.D.api.writeAnswer(use, pin, doc, false, "Askwrite2"); } catch (e) { priv = "threw " + e.message; }
      box.D.ask("etiuda:team-join", "private", "quay-held", "off");
      box.D.ask("etiuda:team-join", "content-said", box.team, SWITCH.at);
      try { shown = box.D.api.writeAnswer(box.D.api.teamUse(), pin, doc, true, "Askwrite3"); } catch (e) { shown = "threw " + e.message; }
      check(toLead === false && priv === false && shown === true && !!openLeadDoc(box.D, answerPath(box.share, box.me.id)),
        "b0h writeAnswer itself refuses an answer to the lead's box under a switch not shown, and a private catalog's answer (" + [toLead, priv, shown].join(",") + ")");
    }

    /* ---- board 962, stage 0b, round two: the test architect's holds on Argon's review, and Claude alpha's ruling of 09:58 ----
       The consent goes with the switch and the lead it was given for; an older team file put back is not read; an ask under the
       switch names its team and the switch; the private mark and the switch reach working copies, by the whole grew chain, and
       what the desk put on the share is withdrawn when the mark is set or the switch goes off. */
    let r2ms = 0;
    const teamText = (box, o) => textOf(sign(Object.assign({
      format: 1, kind: "etiuda-team", id: box.team, catalogs: o.catalogs || ["harbour-board"],
      lead: Object.assign({}, o.lead || LEAD, { box: BOX }), sealed: true, exportsSealed: false, epoch: 1,
      roster: [entry(box.D, box.me, box.key, box.team, 1)], rev: o.rev || 0,
    }, o.content === null ? {} : { content: o.content || SWITCH }, o.handover ? { handover: o.handover } : {}),
      o.signer || lead.privateKey, o.who || LEAD));
    /* A newer team file at the share, its time later than any before, so the desk heeds it. */
    const relead = (box, o) => {
      put(box.share, "etiuda-team.json", teamText(box, o));
      r2ms += 2000;
      touch(path.join(box.share, "etiuda-team.json"), Date.now() + r2ms);
      box.at = o.content === null ? "" : (o.content || SWITCH).at;
    };
    const answeredTo = (u, id) => { const r = u.again(); return !!r.lead && r.lead.ask === id; };
    const say = (u, at) => u.box.D.ask("etiuda:team-join", "content-said", u.box.team, at || SWITCH.at);
    const consentOf = (u) => (u.box.D.envelope().teamContentSaid || {})[u.box.team];
    const branchDoc = (box, tail, grewId, card) => ({
      format: 2, kind: "etiuda-catalog", id: box.me.id + "-" + tail, rev: 1, name: "Quay held, at this desk", date: "2026-04-03",
      langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-desk", shelf: "t-op", bodyShape: "plain", title: { en: "Desk" }, body: { en: card || B0_MARK } }],
      desk: { id: box.me.id, key: box.me.key, box: box.me.box, name: "North desk" },
      grew: { id: grewId, rev: 4, sha: "sha256:" + "ab".repeat(32) },
    });
    const branchAt = (box, tail) => path.join(ownDir(box.share, box.me.id), "quay-" + tail + ".ec");
    const writeCopy = (box, tail, grewId) => box.D.ask("etiuda:branch-write", "quay-" + tail, JSON.stringify(branchDoc(box, tail, grewId)));

    /* F1: switch on, said, answered; off; on again at the same time; the same switch signed again with another name. */
    const cycle = async (name, src) => {
      const a = await b0Ask(name, { src });
      const first = a.written;
      relead(a.box, { rev: 1, content: null });
      a.again();
      const cleared = consentOf(a) === undefined, withdrawn = !fs.existsSync(a.ans);
      relead(a.box, { rev: 2 });
      putAsk(a.box, "Askcycle2", a.pin);
      const sameBefore = answeredTo(a, "Askcycle2");
      await say(a);
      const sameAfter = answeredTo(a, "Askcycle2");
      relead(a.box, { rev: 3, content: Object.assign({}, SWITCH, { by: "Another lead" }) });
      putAsk(a.box, "Askcycle3", a.pin);
      const byBefore = answeredTo(a, "Askcycle3");
      await say(a);
      const byAfter = answeredTo(a, "Askcycle3");
      return { first, cleared, withdrawn, sameBefore, sameAfter, byBefore, byAfter };
    };
    {
      const c = await cycle("r2-cycle");
      check(c.first && c.cleared && c.withdrawn && !c.sameBefore && c.sameAfter && !c.byBefore && c.byAfter,
        "r2a the consent goes with the switch: turned off, the consent is forgotten and the answer withdrawn; on again at the same time, or signed again with another name, nothing is answered until the agent is shown it again ("
        + JSON.stringify(c) + ")");
      if (PLANTS_OFF) skip("r2i lifting plant:s0b-consent-heed turns r2a red: the switch on again at the same time is answered on the old consent");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-consent-heed") >= 0 ? "  if (false) {" : l).join("\n");
        const p = planted !== SRC ? await cycle("r2-cycle-plant", planted) : null;
        check(!!p && p.sameBefore,
          "r2i lifting plant:s0b-consent-heed turns r2a red: the switch on again at the same time is answered on the old consent ("
          + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* F1: the team handed over to another lead key, the switch copied across: the new lead's ask waits for the agent. */
      const h = await b0Ask("r2-handover");
      const other2 = crypto.generateKeyPairSync("ed25519");
      const LEAD2 = { keyId: "quay-lead-2", public: pubHex(other2.publicKey) };
      const step = { format: 1, kind: "etiuda-team-handover", team: h.box.team, to: { keyId: LEAD2.keyId, public: LEAD2.public },
        sig: { alg: "Ed25519", keyId: LEAD.keyId } };
      step.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(V2.v2SignedBytes(step))]),
        lead.privateKey).toString("hex");
      relead(h.box, { lead: LEAD2, who: LEAD2, signer: other2.privateKey, handover: [step] });
      h.again();
      const moved = ((h.box.D.envelope().teamPins || {})[h.box.team] || {}).public === LEAD2.public;
      const cleared = consentOf(h) === undefined;
      putAsk(h.box, "Askhand2", h.pin, 2, { who: LEAD2, key: other2.privateKey });
      const before = answeredTo(h, "Askhand2");
      const view = await h.box.D.ask("etiuda:team-join", "content");
      await say(h);
      const after = answeredTo(h, "Askhand2");
      check(h.written && moved && cleared && !before && view.on === true && view.said === false && after,
        "r2b the team handed over to another lead key with the switch copied across: the consent is the old lead's, so the new lead's ask waits until the agent is shown the switch again ("
        + [h.written, moved, cleared, before, view.on, view.said, after].join(",") + ")");
    }
    {
      /* F2: an older team file put back where the desk reads it, listing a catalog the lead has since taken off the list. */
      const roll = async (name, src) => {
        const r = await b0Ask(name, { catalogs: ["quay-held"], format: 1, src });
        const mirrorTeam = path.join(syncerMod.folderMirrorOf(r.box.D.ud, r.box.team), "etiuda-team.json");
        const original = fs.readFileSync(mirrorTeam, "utf8");
        relead(r.box, { rev: 1, catalogs: ["harbour-board"], content: null });
        r.again();
        putAsk(r.box, "Askroll2", r.pin, 1);
        fs.writeFileSync(mirrorTeam, original, "utf8");
        r2ms += 2000;
        touch(mirrorTeam, Date.now() + r2ms);
        const answered = answeredTo(r, "Askroll2") || (!!r.again().team && r.again().team.ask === "Askroll2");
        const view = await r.box.D.ask("etiuda:team-join", "content");
        return { first: r.written, answered, on: view.on };
      };
      const r = await roll("r2-rollback");
      check(r.first && !r.answered && r.on === false,
        "r2c an older team file put back where the desk reads it is not read: the catalog it listed is not answered, and its switch is not shown as on ("
        + JSON.stringify(r) + ")");
      if (PLANTS_OFF) { skip("r2j lifting plant:s0b-floor-use turns r2c red"); skip("r2k lifting plant:s0b-floor-doc turns r2c red"); }
      else {
        const pu = SRC.split("\n").map(l => l.indexOf("plant:s0b-floor-use") >= 0 ? "  const stale = doc.epoch !== epoch || epoch < (teamEpochSeen[team] || 0);" : l).join("\n");
        const p = pu !== SRC ? await roll("r2-rollback-plant-use", pu) : null;
        check(!!p && p.answered, "r2j lifting plant:s0b-floor-use turns r2c red: the catalog the older file listed is answered (" + (p ? JSON.stringify(p) : "plant not found") + ")");
        const pd = SRC.split("\n").map(l => l.indexOf("plant:s0b-floor-doc") >= 0 ? "  return doc && teamWhole(doc) ? doc : null;" : l).join("\n");
        const q = pd !== SRC ? await roll("r2-rollback-plant-doc", pd) : null;
        check(!!q && q.on === true, "r2k lifting plant:s0b-floor-doc turns r2c red: the older file's switch is shown as on (" + (q ? JSON.stringify(q) : "plant not found") + ")");
      }
    }
    {
      /* F2 and F5: an ask under the switch names the team and the switch's time it was made under. */
      const bound = async (name, src) => {
        const k = await b0Ask(name, { src });
        putAsk(k.box, "Askbound2", k.pin, 2, { at: "2026-10-01T09:00:00.000Z" });
        const otherAt = answeredTo(k, "Askbound2");
        putAsk(k.box, "Askbound3", k.pin, 2, { team: "t-" + "0".repeat(16) });
        const otherTeam = answeredTo(k, "Askbound3");
        putAsk(k.box, "Askbound4", k.pin, 2);
        const right = answeredTo(k, "Askbound4");
        return { first: k.written, otherAt, otherTeam, right };
      };
      const b = await bound("r2-bound");
      check(b.first && !b.otherAt && !b.otherTeam && b.right,
        "r2d an ask under the switch is answered only where it names this team and the switch now: one naming an earlier switch, or another team, is not (" + JSON.stringify(b) + ")");
      if (PLANTS_OFF) skip("r2l lifting plant:s0b-ask-bound turns r2d red");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-ask-bound") >= 0 ? "    || false)) return null;" : l).join("\n");
        const p = planted !== SRC ? await bound("r2-bound-plant", planted) : null;
        check(!!p && p.otherAt, "r2l lifting plant:s0b-ask-bound turns r2d red: an ask naming an earlier switch is answered (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* F3 and ruling A: where a working copy goes. Grown from a catalog the team lists: as before. Grown from one it does not
         list: to the lead's box while the switch applies, held otherwise. Private: nowhere. Never in the clear. */
      const copies = async (name, src) => {
        const box = await arm(name, src);
        join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
        const listed = await writeCopy(box, "11111111", "harbour-board");
        const open = await writeCopy(box, "22222222", "quay-held");
        const openRaw = fs.existsSync(branchAt(box, "22222222")) ? fs.readFileSync(branchAt(box, "22222222"), "utf8") : "";
        let env = null;
        try { env = JSON.parse(openRaw); } catch { env = null; }
        let inner = null;
        try { inner = JSON.parse(box.D.api.openBranchLead(leadBox.privateKey, env, box.me.id)); } catch { inner = null; }
        const shut = await arm(name + "-shut", src);
        join(shut, 1, [entry(shut.D, shut.me, shut.key, shut.team, 1)], ["harbour-board"], undefined, true);
        const held = await writeCopy(shut, "33333333", "quay-held");
        const priv = await arm(name + "-private", src);
        join(priv, 1, [entry(priv.D, priv.me, priv.key, priv.team, 1)], ["harbour-board"]);
        await priv.D.ask("etiuda:team-join", "private", "quay-held", "on");
        const withheld = await writeCopy(priv, "44444444", "quay-held");
        return {
          listed: listed.ok === true && fs.existsSync(branchAt(box, "11111111")),
          boxed: open.ok === true && !!env && env.kind === "etiuda-branch-sealed" && !!inner && inner.id === box.me.id + "-22222222"
            && openRaw.indexOf(B0_MARK) < 0 && !openSealedDoc(box.D, branchAt(box, "22222222"), box.key),
          held: held.held === true && !fs.existsSync(branchAt(shut, "33333333")),
          withheld: withheld.ok === true && withheld.withheld === true && !fs.existsSync(branchAt(priv, "44444444")),
        };
      };
      const c = await copies("r2-copies");
      check(c.listed && c.boxed && c.held && c.withheld,
        "r2e a working copy grown from a catalog the team lists goes as before; one grown from a catalog it does not list goes to the lead's box alone while the switch applies, and is held while it does not; a private one goes nowhere (" + JSON.stringify(c) + ")");
      if (PLANTS_OFF) { skip("r2m lifting plant:s0b-branch-switch turns r2e red"); skip("r2n lifting plant:s0b-branch-private turns r2e red"); }
      else {
        const ps = SRC.split("\n").map(l => l.indexOf("plant:s0b-branch-switch") >= 0 ? "  /* plant:s0b-branch-switch */" : l).join("\n");
        const p = ps !== SRC ? await copies("r2-copies-plant-switch", ps) : null;
        check(!!p && !p.held, "r2m lifting plant:s0b-branch-switch turns r2e red: a copy is written under a switch the agent was not shown (" + (p ? JSON.stringify(p) : "plant not found") + ")");
        const pp = SRC.split("\n").map(l => l.indexOf("plant:s0b-branch-private") >= 0 ? "  /* plant:s0b-branch-private */" : l).join("\n");
        const q = pp !== SRC ? await copies("r2-copies-plant-private", pp) : null;
        check(!!q && !q.withheld, "r2n lifting plant:s0b-branch-private turns r2e red: a private copy is written (" + (q ? JSON.stringify(q) : "plant not found") + ")");
      }
    }
    {
      /* Ruling B: marked private, or the switch off, the desk withdraws the answer and the working copies it put on the share. */
      const withdraw = async (name, src) => {
        const a = await b0Ask(name, { src });
        await writeCopy(a.box, "55555555", "quay-held");
        const boxedBefore = fs.existsSync(branchAt(a.box, "55555555"));
        await a.box.D.ask("etiuda:team-join", "private", "quay-held", "on");
        const privAnswer = !fs.existsSync(a.ans), privCopy = !fs.existsSync(branchAt(a.box, "55555555"));
        const o = await b0Ask(name + "-off", { src });
        await writeCopy(o.box, "66666666", "quay-held");
        relead(o.box, { rev: 1, content: null });
        o.again();
        const offAnswer = !fs.existsSync(o.ans), offCopy = !fs.existsSync(branchAt(o.box, "66666666"));
        const l = await arm(name + "-listed", src);
        join(l, 1, [entry(l.D, l.me, l.key, l.team, 1)], ["harbour-board"]);
        await writeCopy(l, "77777777", "harbour-board");
        const listedBefore = fs.existsSync(branchAt(l, "77777777"));
        await l.D.ask("etiuda:team-join", "private", "harbour-board", "on");
        const listedCopy = !fs.existsSync(branchAt(l, "77777777"));
        return { first: a.written && o.written && boxedBefore && listedBefore, privAnswer, privCopy, offAnswer, offCopy, listedCopy };
      };
      const w = await withdraw("r2-withdraw");
      check(w.first && w.privAnswer && w.privCopy && w.offAnswer && w.offCopy && !w.listedCopy,
        "r2f marked private, the desk withdraws the answer and the working copies of a catalog the team does not list; a listed one takes no mark and its copy stays (round six); with the switch off, the answer and the copies sealed to the lead's box (" + JSON.stringify(w) + ")");
      if (PLANTS_OFF) { skip("r2o lifting plant:s0b-withdraw-answer turns r2f red"); skip("r2p lifting plant:s0b-withdraw-branch turns r2f red"); }
      else {
        const pa = SRC.split("\n").map(l => l.indexOf("plant:s0b-withdraw-answer") >= 0 ? "  /* plant:s0b-withdraw-answer */" : l).join("\n");
        const p = pa !== SRC ? await withdraw("r2-withdraw-plant-answer", pa) : null;
        check(!!p && (!p.privAnswer || !p.offAnswer), "r2o lifting plant:s0b-withdraw-answer turns r2f red: an answer stays (" + (p ? JSON.stringify(p) : "plant not found") + ")");
        const pb = SRC.split("\n").map(l => l.indexOf("plant:s0b-withdraw-branch") >= 0 ? "    /* plant:s0b-withdraw-branch */" : l).join("\n");
        const q = pb !== SRC ? await withdraw("r2-withdraw-plant-branch", pb) : null;
        check(!!q && (!q.privCopy || !q.offCopy), "r2p lifting plant:s0b-withdraw-branch turns r2f red: a working copy stays (" + (q ? JSON.stringify(q) : "plant not found") + ")");
      }
    }
    {
      /* F3: a copy of a copy is judged by its whole grew chain. */
      const box = await arm("r2-chain");
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
      await box.D.ask("etiuda:team-join", "private", "quay-held", "on");
      const takeText = (name, doc) => {
        const dir = folder(name);
        put(dir, "held.ec", textOf(doc));
        box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
        const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
        const pin = pinOf(box.D, off ? off[1] : "");
        take(box.D, pin);
        return pin;
      };
      const c1 = catalog(5, { id: "k-0123456789abcdef-11111111", name: "First copy", card: B0_MARK, unsigned: true });
      c1.grew = { id: "quay-held", rev: 4, sha: "sha256:" + "cd".repeat(32) };
      takeText("r2-chain-c1", c1);
      const c2 = catalog(6, { id: "k-fedcba9876543210-22222222", name: "Second copy", card: B0_MARK, unsigned: true });
      c2.grew = { id: c1.id, rev: 5, sha: "sha256:" + "ef".repeat(32) };
      const pin2 = takeText("r2-chain-c2", c2);
      putAsk(box, "Askchain", pin2);
      box.D.api.tryCatalogAsk(box.D.win);
      const answered = fs.existsSync(answerPath(box.share, box.me.id));
      const third = await writeCopy(box, "88888888", c2.id);
      check(!!pin2 && !answered && third.withheld === true && !fs.existsSync(branchAt(box, "88888888")),
        "r2g a copy of a copy of a private catalog is private: not answered, and a copy of it is written nowhere (" + [answered, JSON.stringify(third)].join(",") + ")");
    }
    {
      /* Claude alpha's ruling of 12:04: one test for "listed", by the grew chain, in the answer and the working copy alike. A
         catalog that kept a listed id but grew from an unlisted one is unlisted in both; a desk's copy of a listed one, listed. */
      const oneTest = async (name, src) => {
        const grown = (id, grewId) => { const c = catalog(4, { id, name: "Quay held", card: B0_MARK, unsigned: true });
          c.grew = { id: grewId, rev: 3, sha: "sha256:" + "ab".repeat(32) }; return textOf(c); };
        const a = await b0Ask(name, { catalogs: ["quay-held"], body: grown("quay-held", "harbour-board"), src });
        await writeCopy(a.box, "91919191", "quay-held");
        const aCopy = fs.existsSync(branchAt(a.box, "91919191")) ? JSON.parse(fs.readFileSync(branchAt(a.box, "91919191"), "utf8")) : null;
        /* The desk's copy grew from the lead's signed edition, which sits in the share (stage 5's first hop). */
        const leadEd = b0Body("quay-held"), leadPin = pinOf(a.box.D, leadEd);
        const grownB = JSON.parse(grown("k-0123456789abcdef-12345678", "quay-held"));
        grownB.grew.sha = leadPin;
        const b = await b0Ask(name + "-reverse", { catalogs: ["quay-held"], body: textOf(grownB), src, shareFiles: [["quay-lead.ec", leadEd]] });
        await writeCopy(b.box, "92929292", "k-0123456789abcdef-12345678");
        const bCopy = fs.existsSync(branchAt(b.box, "92929292")) ? JSON.parse(fs.readFileSync(branchAt(b.box, "92929292"), "utf8")) : null;
        return {
          keptId: !!a.lead && !a.team && !!aCopy && aCopy.kind === "etiuda-branch-sealed",
          reverse: !!b.team && !b.lead && !!bCopy && bCopy.kind !== "etiuda-branch-sealed",
        };
      };
      const o = await oneTest("r2-one-test");
      check(o.keptId && o.reverse,
        "r2s one test for listed, by the grew chain: a catalog that kept a listed id but grew from an unlisted one goes to the lead's box as answer and as copy; a desk's copy of a listed catalog goes under the team as both (" + JSON.stringify(o) + ")");
      if (PLANTS_OFF) skip("r2t lifting plant:s0b-chain-listed turns r2s red");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-chain-listed") >= 0 ? "  /* plant:s0b-chain-listed */" : l).join("\n");
        const p = planted !== SRC ? await oneTest("r2-one-test-plant", planted) : null;
        check(!!p && !p.reverse, "r2t lifting plant:s0b-chain-listed turns r2s red: the copy of a listed catalog is judged unlisted (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    /* ---- 962 stage 5 (the design's 3.5): a listed id is not enough. A copy under the listed id itself that is not the lead's own
       signed edition, an agent's own edit, answers as an unlisted catalog: only an ask naming its pin, and to the lead's box alone.
       The lead's own edition answers as before. */
    {
      const s5 = async (name, src) => {
        const own = await b0Ask(name + "-own", { catalogs: ["quay-held"], src,
          body: textOf(catalog(4, { id: "quay-held", name: "Quay held", card: B0_MARK, unsigned: true })) });
        const ownOut = { written: own.written, lead: !!own.lead && JSON.stringify(own.lead).indexOf(B0_MARK) >= 0, team: !!own.team };
        if (fs.existsSync(own.ans)) fs.unlinkSync(own.ans);
        putAsk(own.box, "Asks5other", "sha256:" + "cd".repeat(32));
        const other = own.again();
        const leadEd = await b0Ask(name + "-lead", { catalogs: ["quay-held"], src, body: b0Body("quay-held") });
        return { own: ownOut, otherPin: other.written, leadTeam: !!leadEd.team && JSON.stringify(leadEd.team).indexOf(B0_MARK) >= 0, leadBox: !!leadEd.lead };
      };
      const u = await s5("s5u");
      check(u.own.written && u.own.lead && !u.own.team && !u.otherPin && u.leadTeam && !u.leadBox,
        "962s5u a copy under a listed id that is not the lead's signed edition is answered only to an ask naming its pin, and to the lead's box alone; the lead's own edition is answered under the team key as before ("
        + JSON.stringify(u) + ")");
      if (PLANTS_OFF) skip("962s5u2 lifting plant:s5-listed-lead turns 962s5u red: the agent's own copy under the listed id is answered under the team key");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s5-listed-lead") >= 0 ? "  /* plant:s5-listed-lead */" : l).join("\n");
        const p = planted !== SRC ? await s5("s5u-plant", planted) : null;
        check(!!p && p.own.team && !p.own.lead, "962s5u2 lifting plant:s5-listed-lead turns 962s5u red: the agent's own copy under the listed id is answered under the team key ("
          + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    /* ---- 962 stage 5, round two (Claude alpha: "A copy whose recorded grew chain starts at the team's signed edition keeps 12:04's
       answer"): a copy under an id of its own, grown at its first hop from a catalog that keeps a listed id but is not the lead's
       signed edition, is unlisted in the answer and the working copy alike; with the switch off, no answer and the copy held. */
    {
      const pinV2 = doc => "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(doc))).digest("hex");
      const firstHop = async (name, src) => {
        const parentDoc = catalog(4, { id: "quay-held", name: "Quay held", card: B0_MARK, unsigned: true });
        const copy = catalog(5, { id: "k-0123456789abcdef-56565656", name: "Quay held, grown", card: B0_MARK, unsigned: true });
        copy.grew = { id: "quay-held", rev: 4, sha: pinV2(parentDoc) };
        const a = await b0Ask(name, { catalogs: ["quay-held"], content: null, body: textOf(copy), src, shareFiles: [["quay-own.ec", textOf(parentDoc)]] });
        const tail = "57575757";
        const doc = branchDoc(a.box, tail, "quay-held");
        doc.grew.sha = pinV2(parentDoc);
        const w = await a.box.D.ask("etiuda:branch-write", "quay-" + tail, JSON.stringify(doc));
        return { answered: a.written, team: !!a.team, held: !!w && w.held === true, written: fs.existsSync(branchAt(a.box, tail)) };
      };
      const h = await firstHop("s5u3");
      check(!h.answered && !h.team && h.held && !h.written,
        "962s5u3 a copy grown from a catalog that keeps a listed id but is not the lead's signed edition takes no answer under the team key, and with the switch off its working copy is held, not written ("
        + JSON.stringify(h) + ")");
      if (PLANTS_OFF) skip("962s5u4 lifting plant:s5-first-hop writes the copy's working copy to the share");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s5-first-hop") >= 0 ? "  /* plant:s5-first-hop */" : l).join("\n");
        const p = planted !== SRC ? await firstHop("s5u3-plant", planted) : null;
        check(!!p && p.written && !p.held, "962s5u4 lifting plant:s5-first-hop writes the copy's working copy to the share (FAIL 962s5u3): "
          + (p ? JSON.stringify(p) : "plant not found"));
      }
    }
    /* ---- stage 0b, round five: the test architect's edits on Grok's review ---- */
    {
      /* Edit 1: a copy of a copy whose middle hop this desk never saw is judged by the root it carries (grew.root). */
      const unseen = async (name, src) => {
        const box = await arm(name, src);
        join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
        await box.D.ask("etiuda:team-join", "private", "quay-held", "on");
        const c2 = catalog(6, { id: "k-fedcba9876543210-33333333", name: "Second copy", card: B0_MARK, unsigned: true });
        c2.grew = { id: "k-0123456789abcdef-44444444", rev: 5, sha: "sha256:" + "ef".repeat(32), root: "quay-held" };
        const dir = folder(name + "-out");
        put(dir, "held.ec", textOf(c2));
        box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
        const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
        const pin = pinOf(box.D, off ? off[1] : "");
        take(box.D, pin);
        const lineage = box.D.envelope().catalogLineage || {};
        putAsk(box, "Askunseen", pin);
        box.D.api.tryCatalogAsk(box.D.win);
        const answered = fs.existsSync(answerPath(box.share, box.me.id));
        const copy = await writeCopy(box, "95959595", c2.id);
        return { pin: !!pin, rootKept: (box.D.envelope().catalogRoots || {})["k-fedcba9876543210-33333333"] === "quay-held", answered, copy };
      };
      const u = await unseen("r5-unseen");
      check(u.pin && !u.answered && u.copy.withheld === true,
        "r5a a copy of a copy whose middle hop this desk never stored is judged by the root it carries: its root private, it is not answered and no copy of it is written (" + JSON.stringify(u) + ")");
      if (PLANTS_OFF) skip("r5b lifting plant:s0b-grew-root turns r5a red");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-grew-root") >= 0 ? "  /* plant:s0b-grew-root */" : l).join("\n");
        const p = planted !== SRC ? await unseen("r5-unseen-plant", planted) : null;
        check(!!p && p.answered, "r5b lifting plant:s0b-grew-root turns r5a red: the copy is answered (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* The test architect's edit on round five: grew.root may widen "private", never "listed". A copy grown from an unlisted
         catalog that names a listed one as its root, the switch off: no team-key answer, no copy in the clear, nothing stored. */
      const claimed = async (name, src) => {
        const box = await arm(name, src);
        join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"], null);
        const c = catalog(6, { id: "k-fedcba9876543210-77777777", name: "Claimed copy", card: B0_MARK, unsigned: true });
        c.grew = { id: "harbour-board", rev: 5, sha: "sha256:" + "ef".repeat(32), root: "quay-held" };
        const dir = folder(name + "-out");
        put(dir, "held.ec", textOf(c));
        box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
        const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
        const pin = pinOf(box.D, off ? off[1] : "");
        take(box.D, pin);
        putAsk(box, "Askclaimed", pin, 1);
        box.D.api.tryCatalogAsk(box.D.win);
        const ans = answerPath(box.share, box.me.id);
        const copy = await writeCopy(box, "97979797", c.id);
        return { pin: !!pin, teamAnswer: !!openSealedDoc(box.D, ans, box.key), copyInClear: fs.existsSync(branchAt(box, "97979797")),
          stored: (box.D.envelope().catalogLineage || {})["harbour-board"] };
      };
      const c = await claimed("r5-claimed");
      check(c.pin && !c.teamAnswer && !c.copyInClear && c.stored === undefined,
        "r5f a copy grown from an unlisted catalog that names a listed one as its root is not listed: with the switch off no team-key answer, no copy in the clear, and the claim is not stored (" + JSON.stringify(c) + ")");
      if (PLANTS_OFF) skip("r5g letting the root decide listed turns r5f red");
      else {
        const NL = String.fromCharCode(10);
        /* Stage 5's first-hop check stands behind this one too (its claimed hop is no edition the lead signed), so it is lifted with it. */
        const planted = SRC.split(NL).map(l => l.indexOf("plant:s0b-root-listed") >= 0 ? "  const ids = privateChain(lineageOf(doc));"
          : l.indexOf("plant:s5-first-hop") >= 0 ? "  /* plant:s5-first-hop */" : l).join(NL);
        const p = planted !== SRC ? await claimed("r5-claimed-plant", planted) : null;
        check(!!p && p.teamAnswer, "r5g letting the root decide listed turns r5f red: a team-key answer is written (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* The test architect's second edit on round five: a recorded answer whose catalog is private only through a root its copy
         stated is taken back when that root is marked private, since withdrawClosed reads the private chain. */
      const box = await arm("r5-root-later");
      join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["harbour-board"]);
      const c2 = catalog(6, { id: "k-fedcba9876543210-55555555", name: "Rooted copy", card: B0_MARK, unsigned: true });
      c2.grew = { id: "k-0123456789abcdef-66666666", rev: 5, sha: "sha256:" + "ef".repeat(32), root: "quay-held" };
      const dir = folder("r5-root-later-out");
      put(dir, "held.ec", textOf(c2));
      box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
      const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
      const pin = pinOf(box.D, off ? off[1] : "");
      take(box.D, pin);
      putAsk(box, "Askrootlater", pin);
      box.D.api.tryCatalogAsk(box.D.win);
      const before = fs.existsSync(answerPath(box.share, box.me.id));
      await box.D.ask("etiuda:team-join", "private", "quay-held", "on");
      const after = fs.existsSync(answerPath(box.share, box.me.id));
      check(!!pin && before && !after,
        "r5h an answer written for a copy whose stated root is marked private afterwards is taken back (" + JSON.stringify({ pin: !!pin, before, after }) + ")");
    }
    {
      /* Round six, Claude alpha's ruling: the private mark belongs to catalogs the team does not list. A mark on a listed catalog
         (one kept from before, put in the desk envelope) changes nothing: its team-key answer and its copy go as any listed one's. */
      const listedMark = async (name, src) => {
        const box = await arm(name, src);
        const envPath = path.join(box.D.ud, "desk.json");
        const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
        env.catalogPrivate = ["quay-held"];
        fs.writeFileSync(envPath, JSON.stringify(env), "utf8");
        box.D = loadDesk(box.D.ud, src);
        join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"]);
        const dir = folder(name + "-out");
        put(dir, "held.ec", b0Body());
        box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
        const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
        const pin = pinOf(box.D, off ? off[1] : "");
        take(box.D, pin);
        putAsk(box, "Asklistedmark", pin, 1);
        box.D.api.tryCatalogAsk(box.D.win);
        const ans = answerPath(box.share, box.me.id);
        await writeCopy(box, "98989898", "quay-held");
        return { team: !!openSealedDoc(box.D, ans, box.key), copy: fs.existsSync(branchAt(box, "98989898")) };
      };
      const m = await listedMark("r6-listed-mark");
      check(m.team && m.copy, "r6a a listed catalog the desk holds a private mark for is answered under the team key, and its copy written, as any listed one (" + JSON.stringify(m) + ")");
      if (PLANTS_OFF) skip("r6b letting the mark override the list turns r6a red");
      else {
        const NL6 = String.fromCharCode(10);
        const planted = SRC.split(NL6).map(l => l.indexOf("plant:s0b-private-listed") >= 0 ? "  /* plant:s0b-private-listed */" : l).join(NL6);
        const p = planted !== SRC ? await listedMark("r6-listed-mark-plant", planted) : null;
        check(!!p && !p.team, "r6b letting the mark override the list turns r6a red: the listed catalog is answered to nobody (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
      /* markPrivate on a listed catalog changes nothing, and the view names it among the catalogs the mark is not offered on. */
      const markOn = async (name, src) => {
        const box = await arm(name, src);
        join(box, 1, [entry(box.D, box.me, box.key, box.team, 1)], ["quay-held"]);
        const v = await box.D.ask("etiuda:team-join", "private", "quay-held", "on");
        const u = await box.D.ask("etiuda:team-join", "private", "harbour-board", "on");
        return { listedTaken: v.private.indexOf("quay-held") >= 0, listedShown: Array.isArray(v.listed) && v.listed.indexOf("quay-held") >= 0,
          unlistedTaken: u.private.indexOf("harbour-board") >= 0, stored: (box.D.envelope().catalogPrivate || []).join(",") };
      };
      const o = await markOn("r6-mark-on");
      check(!o.listedTaken && o.listedShown && o.unlistedTaken && o.stored === "harbour-board",
        "r6c the private mark is refused on a listed catalog, which the view names as listed, and taken on an unlisted one (" + JSON.stringify(o) + ")");
      if (PLANTS_OFF) skip("r6d lifting plant:s0b-mark-listed turns r6c red");
      else {
        const NL6 = String.fromCharCode(10);
        const planted = SRC.split(NL6).map(l => l.indexOf("plant:s0b-mark-listed") >= 0 ? "  if (CATALOG_ID_RE.test(id)) {" : l).join(NL6);
        const p = planted !== SRC ? await markOn("r6-mark-on-plant", planted) : null;
        check(!!p && p.listedTaken, "r6d lifting plant:s0b-mark-listed turns r6c red: the listed catalog takes the mark (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* Edit 2: a box answer this desk has no record of (an earlier build's) goes when the switch no longer applies; a team-key
         answer stays. */
      const unkept = async (name, src) => {
        const a = await b0Ask(name, { src });
        const l = await b0Ask(name + "-listed", { catalogs: ["quay-held"], format: 1, src });
        const forget = (box) => {
          const envPath = path.join(box.D.ud, "desk.json");
          const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
          delete env.answerKept;
          fs.writeFileSync(envPath, JSON.stringify(env), "utf8");
          box.D = loadDesk(box.D.ud, src);
        };
        forget(a.box); forget(l.box);
        /* The ask an earlier Studio made, format 1, still standing: only the withdrawal takes the box answer back. */
        putAsk(a.box, a.askId, a.pin, 1);
        relead(a.box, { rev: 1, content: null });
        relead(l.box, { rev: 1, catalogs: ["quay-held"], content: null });
        a.box.D.api.tryCatalogAsk(a.box.D.win);
        l.box.D.api.tryCatalogAsk(l.box.D.win);
        return { first: a.written && l.written, boxGone: !fs.existsSync(a.ans), teamKept: fs.existsSync(l.ans) };
      };
      const k = await unkept("r5-unkept");
      check(k.first && k.boxGone && k.teamKept,
        "r5c with the switch off, a box answer this desk holds no record of is withdrawn; a team-key answer stays (" + JSON.stringify(k) + ")");
      if (PLANTS_OFF) skip("r5d lifting plant:s0b-withdraw-unkept turns r5c red");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-withdraw-unkept") >= 0 ? "  /* plant:s0b-withdraw-unkept */" : l).join("\n");
        const p = planted !== SRC ? await unkept("r5-unkept-plant", planted) : null;
        check(!!p && !p.boxGone, "r5d lifting plant:s0b-withdraw-unkept turns r5c red: the box answer stays (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
    {
      /* F6: the agent shown the switch, an ask already waiting is answered then, with nothing else to wake it. */
      const waiting = async (name, src) => {
        const u = await b0Ask(name, { unsaid: true, src });
        const before = u.written;
        await say(u);
        let doc = null;
        try { doc = openLeadDoc(u.box.D, u.ans); } catch { doc = null; }
        return { before, after: !!doc && doc.ask === u.askId };
      };
      const w = await waiting("r2-waiting");
      check(!w.before && w.after, "r2h the agent shown the switch, the ask already waiting is answered at once (" + JSON.stringify(w) + ")");
      if (PLANTS_OFF) skip("r2q lifting plant:s0b-said-ask turns r2h red");
      else {
        const planted = SRC.split("\n").map(l => l.indexOf("plant:s0b-said-ask") >= 0 ? "  /* plant:s0b-said-ask */" : l).join("\n");
        const p = planted !== SRC ? await waiting("r2-waiting-plant", planted) : null;
        check(!!p && !p.after, "r2q lifting plant:s0b-said-ask turns r2h red: the waiting ask stays unanswered (" + (p ? JSON.stringify(p) : "plant not found") + ")");
      }
    }
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

  /* 15w8: Load of a file says the reason the read gave. A sealed file this desk cannot open is not left on Load the new edition.
     The same #ecYes reads that absence, and a newer edition that is not sealed, which paints the button. */
  {
    const ST = await import(MOD("storage.js"));
    const Offer = await import(MOD("catalog-offer.js"));
    ST.lsSet("eMotionOff", "1");
    ST.lsSet("eUiLang", "en");
    /* Brackets, so this line does not declare a catalog payload: the commit scan refuses that shape. */
    window["E_CATALOG"] = null;
    const w8dir = folder("w8-catalogs");
    const sealedName = "sealed.ec";
    const quietName = "quiet.ec";
    fs.writeFileSync(path.join(w8dir, sealedName), JSON.stringify({
      format: 2, kind: "etiuda-sealed", team: "t-0123456789abcdef", epoch: 1, nonce: "ab", ct: "cd" }));
    fs.writeFileSync(path.join(w8dir, quietName), "{not a catalog");
    const w8 = newDesk("w8desk", w8dir);
    const buttonsOf = (html) => {
      const out = [];
      const re = /<button\b([^>]*)>/gi;
      let m;
      while ((m = re.exec(String(html)))) {
        const attrs = {};
        const ar = /([\w:-]+)="([^"]*)"/g;
        let a;
        while ((a = ar.exec(m[1]))) attrs[a[1]] = a[2];
        out.push({ getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null), onclick: null });
      }
      return out;
    };
    let html = "";
    let buttons = [];
    const box = {
      isConnected: true,
      innerHTML: "",
      querySelectorAll(sel) {
        if (sel === "button[data-ec-load]") return buttons.filter(b => b.getAttribute("data-ec-load") != null);
        return [];
      },
      querySelector() { return null; },
    };
    Object.defineProperty(box, "innerHTML", {
      get() { return html; },
      set(v) { html = String(v); buttons = buttonsOf(html); },
    });
    const made = [];
    const cls = () => {
      const s = new Set();
      return { contains: c => s.has(c), add: (...c) => c.forEach(x => s.add(x)),
        remove: (...c) => c.forEach(x => s.delete(x)),
        toggle: (c, on) => { const next = on === undefined ? !s.has(c) : !!on; if (next) s.add(c); else s.delete(c); return next; } };
    };
    const toastEl = { classList: cls(), textContent: "", innerHTML: "", style: {},
      getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) };
    globalThis.innerHeight = 800;
    globalThis.innerWidth = 1280;
    globalThis.addEventListener = noop;
    globalThis.removeEventListener = noop;
    globalThis.getComputedStyle = () => ({ borderLeftWidth: "0", paddingLeft: "0", borderRightWidth: "0", paddingRight: "0",
      fontStyle: "normal", fontWeight: "400", fontSize: "14px", fontFamily: "sans-serif", letterSpacing: "normal" });
    /* Enough of a document for the offer bubble to paint #ecYes, which is what both readings below ask for. */
    const VOID = { br: 1, img: 1, hr: 1, input: 1, meta: 1, link: 1, source: 1, wbr: 1, area: 1, base: 1, col: 1, embed: 1, track: 1 };
    function selMatch(node, sel) {
      const s = String(sel || "").trim();
      if (!s || !node || node.tagName === "#TEXT") return false;
      if (s.charAt(0) === "#") return node.id === s.slice(1);
      if (s.charAt(0) === ".") return node.className.split(/\s+/).indexOf(s.slice(1)) >= 0;
      const onlyAttr = s.match(/^\[([\w:-]+)\]$/);
      if (onlyAttr) return node.getAttribute(onlyAttr[1]) != null;
      const tagAttr = s.match(/^([A-Za-z][\w:-]*)\[([\w:-]+)\]$/);
      if (tagAttr) return node.tagName.toLowerCase() === tagAttr[1].toLowerCase() && node.getAttribute(tagAttr[2]) != null;
      return node.tagName.toLowerCase() === s.toLowerCase();
    }
    function collect(node, sel) {
      const child = String(sel).match(/^:scope\s*>\s*(.+)$/);
      if (child) return (node.children || []).filter(c => selMatch(c, child[1]));
      const out = [];
      const walk = (n) => {
        (n.children || []).forEach(c => {
          if (selMatch(c, sel)) out.push(c);
          walk(c);
        });
      };
      walk(node);
      return out;
    }
    function parseInto(html, parent) {
      const re = /<!--[\s\S]*?-->|<\/([A-Za-z][\w:-]*)>|<([A-Za-z][\w:-]*)([^>]*)>|([^<]+)/g;
      const stack = [parent];
      let m;
      while ((m = re.exec(html))) {
        const top = stack[stack.length - 1];
        if (m[1]) {
          const name = m[1].toLowerCase();
          for (let i = stack.length - 1; i > 0; i--) {
            if (stack[i].tagName.toLowerCase() === name) { stack.length = i; break; }
          }
          continue;
        }
        if (m[2]) {
          const name = m[2].toLowerCase();
          const node = pageEl(name);
          const attr = /([\w:-]+)(?:="([^"]*)")?/g;
          let a;
          while ((a = attr.exec(m[3] || ""))) node.setAttribute(a[1], a[2] == null ? "" : a[2]);
          top.appendChild(node);
          if (!(VOID[name] || /\/\s*$/.test(m[3] || ""))) stack.push(node);
          continue;
        }
        if (m[4] && m[4].trim()) {
          const tn = pageEl("#text");
          tn.textContent = m[4];
          top.appendChild(tn);
        }
      }
    }
    function pageEl(tag) {
      const attrs = {};
      const children = [];
      let html = "";
      let ownText = "";
      let className = "";
      const extra = new Set();
      const node = {
        tagName: String(tag || "div").toUpperCase(),
        id: "",
        children,
        parentNode: null,
        style: {},
        isConnected: false,
        hidden: false,
        onclick: null,
        onkeydown: null,
        offsetWidth: 0,
        offsetHeight: 0,
        classList: {
          contains: c => extra.has(c) || className.split(/\s+/).indexOf(c) >= 0,
          add: (...c) => c.forEach(x => extra.add(x)),
          remove: (...c) => c.forEach(x => extra.delete(x)),
          toggle: (c, on) => {
            const has = extra.has(c) || className.split(/\s+/).indexOf(c) >= 0;
            const next = on === undefined ? !has : !!on;
            if (next) extra.add(c); else extra.delete(c);
            return next;
          },
        },
        get className() { return className; },
        set className(v) { className = String(v == null ? "" : v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
        setAttribute(k, v) {
          attrs[k] = String(v);
          if (k === "id") node.id = String(v);
          if (k === "class") className = String(v);
        },
        removeAttribute(k) {
          delete attrs[k];
          if (k === "id") node.id = "";
          if (k === "class") className = "";
        },
        appendChild(c) { if (c) { children.push(c); c.parentNode = node; } return c; },
        remove() {
          node.isConnected = false;
          const p = node.parentNode;
          if (p && p.children) {
            const i = p.children.indexOf(node);
            if (i >= 0) p.children.splice(i, 1);
          }
          const at = made.indexOf(node);
          if (at >= 0) made.splice(at, 1);
        },
        focus() {},
        addEventListener() {},
        removeEventListener() {},
        insertAdjacentHTML(where, frag) {
          const holder = pageEl("div");
          holder.innerHTML = frag;
          const kids = holder.children.splice(0, holder.children.length);
          const p = node.parentNode;
          if (!p || !p.children) { kids.forEach(c => node.appendChild(c)); return; }
          const i = p.children.indexOf(node);
          const at = where === "afterend" ? i + 1 : i;
          kids.forEach(c => { c.parentNode = p; });
          p.children.splice(at < 0 ? p.children.length : at, 0, ...kids);
        },
        getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; },
        querySelector(sel) { return collect(node, sel)[0] || null; },
        querySelectorAll(sel) { return collect(node, sel); },
        get textContent() {
          if (node.tagName === "#TEXT") return ownText;
          if (children.length) return children.map(c => c.textContent || "").join("");
          return ownText;
        },
        set textContent(v) { ownText = String(v == null ? "" : v); children.length = 0; html = ownText; },
      };
      Object.defineProperty(node, "innerHTML", {
        get() { return html; },
        set(v) { html = String(v == null ? "" : v); ownText = ""; children.length = 0; parseInto(html, node); },
      });
      return node;
    }
    function findPainted(sel) {
      for (let i = 0; i < made.length; i++) {
        const n = made[i];
        if (!n) continue;
        if (n.id && sel === "#" + n.id) return n;
        if (n.querySelector) {
          const hit = n.querySelector(sel);
          if (hit) return hit;
        }
      }
      return null;
    }
    globalThis.document = {
      addEventListener: noop, removeEventListener: noop,
      getElementById: (id) => (id === "mgCatList" ? box : id === "toast" ? toastEl : findPainted("#" + id)),
      querySelector: (sel) => (sel === "#toast" ? toastEl : findPainted(sel)),
      querySelectorAll: () => [],
      createElement: (tag) => pageEl(tag),
      body: { classList: cls(), appendChild: (n) => { made.push(n); if (n) n.isConnected = true; return n; } },
      documentElement: { classList: cls() },
    };
    /* One selector for the sealed file and for a newer edition that is not sealed. */
    const EDITION_SEL = "#ecYes";
    const editionWords = () => {
      const yes = document.querySelector(EDITION_SEL);
      return yes ? String(yes.textContent || "").replace(/\s+/g, " ").trim() : "";
    };
    const host = {
      readCatalogFile: (name, desk, asked, offer) => w8.ask("etiuda:catalog-read", name, desk, asked, offer),
      catalogFiles: () => w8.ask("etiuda:catalog-files"),
    };
    globalThis.window = { addEventListener: noop, removeEventListener: noop, E_CATALOG: null, E_HOST: host };
    let painted = "paint";
    try { Offer.paintCatalogList(); }
    catch (e) { painted = "threw " + String(e && e.message || e).slice(0, 80); }
    const until = Date.now() + 1500;
    while (!buttons.some(b => b.getAttribute("data-ec-load") === sealedName) && Date.now() < until) await tick();
    const click = async (name) => {
      toastEl.innerHTML = "";
      toastEl.textContent = "";
      made.length = 0;
      const b = buttons.find(x => x.getAttribute("data-ec-load") === name);
      if (b && b.onclick) await Promise.resolve(b.onclick());
      else await Promise.resolve(Offer.loadCatalogFromFolder(name, 0));
      await tick();
      return { said: String(toastEl.innerHTML || toastEl.textContent || ""),
        edition: editionWords(),
        wired: !!(b && b.onclick) };
    };
    const sealedEn = await click(sealedName);
    w8.api.setDown(w8dir);
    const downEn = await click(quietName);
    ST.lsSet("eUiLang", "pl");
    const downPl = await click(quietName);
    ST.lsSet("eUiLang", "en");
    w8.api.setDown("");
    const disk = "could not be read from the disk,";
    const diskPl = "nie udało się odczytać z dysku,";
    const held = sealedEn.said.indexOf(disk) >= 0 && !sealedEn.edition
      && downEn.said.indexOf(disk) >= 0 && downPl.said.indexOf(diskPl) >= 0;
    check(held,
      "15w8 a Load says why the file was not read, in the desk's language, and a sealed file this desk cannot open is not left on Load the new edition: "
      + "sealed " + (sealedEn.said.indexOf(disk) >= 0) + ", edition " + (sealedEn.edition ? "shown" : "absent")
      + ", down " + (downEn.said.indexOf(disk) >= 0) + ", polish " + (downPl.said.indexOf(diskPl) >= 0)
      + ", " + painted + (sealedEn.wired ? ", painted button" : ", direct Load")
      + (held ? "" : " sealed-said " + sealedEn.said.slice(0, 160) + " down-said " + downEn.said.slice(0, 120)));

    /* A newer edition of the same catalog, not sealed. The held file is the newest on disk, so the
       list marks that row loaded and the later rev keeps Load, the same button the sealed file used. */
    const nextName = "next.ec";
    const heldName = "held.ec";
    fs.writeFileSync(path.join(w8dir, heldName), textOf(catalog(1, { id: "w8-lamps", name: "W8 lamps" })));
    fs.writeFileSync(path.join(w8dir, nextName), textOf(catalog(2, { id: "w8-lamps", name: "W8 lamps", card: CARD + " revised" })));
    touch(path.join(w8dir, heldName), Date.now());
    touch(path.join(w8dir, nextName), Date.now() - 120000);
    ST.lsSet("eCatalog", JSON.stringify({
      id: "w8-lamps", rev: 1, langs: [{ code: "en", label: "EN" }],
      cards: [{ id: "c-warm", c: "open", t: "Warm opening", en: CARD }],
    }));
    /* The list's own settle runs inside the paint. The held signature is written after that, or the settle
       marks it unknown and the offer says Load it. */
    Offer.paintCatalogList();
    const untilNext = Date.now() + 1500;
    while (!buttons.some(b => b.getAttribute("data-ec-load") === nextName) && Date.now() < untilNext) await tick();
    ST.lsSet("eCatalogTrust", "valid");
    ST.lsSet("eCatalogSigner", LEAD.keyId);
    ST.lsSet("eCatalogSignerPub", LEAD.public);
    host.catalogLeads = () => [{ keyId: LEAD.keyId, public: LEAD.public }];
    let openEn = { edition: "", wired: false, said: "" };
    let stayed = "";
    let openErr = "";
    try {
      openEn = await click(nextName);
      await tick();
      await tick();
      await tick();
      stayed = editionWords();
    } catch (e) {
      openErr = String(e && e.message ? e.message : e).slice(0, 180);
    }
    const oldMissed = !(made.some(n => n.id === "ecYes") || String(toastEl.innerHTML || "").indexOf("Load the new edition") >= 0);
    const sameSel = openEn.edition === "Load the new edition" && stayed === "Load the new edition" && sealedEn.edition !== "Load the new edition";
    const titleEl = document.querySelector("#ecTitle");
    const trustEl = document.querySelector(".ec-trust");
    check(sameSel && openEn.wired && oldMissed && !openErr,
      "15w8 a newer edition that is not sealed paints Load the new edition, read by the same #ecYes the sealed file left empty: "
      + "open " + JSON.stringify(openEn.edition) + ", stayed " + JSON.stringify(stayed)
      + ", sealed " + JSON.stringify(sealedEn.edition)
      + ", selector #ecYes"
      + (openEn.wired ? ", painted button" : ", direct Load")
      + (oldMissed ? ", body id and toast missed it" : ", old reading saw it")
      + (openErr ? ", " + openErr : "")
      + (sameSel ? "" : " title " + JSON.stringify(titleEl ? titleEl.textContent : "")
        + " trust " + JSON.stringify(trustEl ? String(trustEl.textContent || "").slice(0, 80) : "")
        + " held " + JSON.stringify(ST.lsGet("eCatalogTrust"))
        + " said " + String(openEn.said || "").slice(0, 120)));
    ST.lsSet("eCatalog", "");
    ST.lsSet("eCatalogTrust", "");
    ST.lsSet("eCatalogSigner", "");
    ST.lsSet("eCatalogSignerPub", "");
    host.catalogLeads = undefined;

    fs.writeFileSync(path.join(w8dir, "access.ec"), "x");
    fs.writeFileSync(path.join(w8dir, "gone.ec"), "x");
    fs.writeFileSync(path.join(w8dir, "held.ec"), "x");
    fs.writeFileSync(path.join(w8dir, "blank.ec"), "");
    const origRead = fs.readFileSync;
    const bomb = { code: "", name: "" };
    fs.readFileSync = function (p, enc) {
      if (bomb.code && String(p).endsWith(path.sep + bomb.name)) {
        const err = new Error("planted");
        err.code = bomb.code;
        throw err;
      }
      return origRead.call(fs, p, enc);
    };
    const say = async (name, code) => {
      bomb.code = code;
      bomb.name = name;
      const got = await click(name);
      bomb.code = "";
      bomb.name = "";
      return got.said;
    };
    let access = "", perm = "", gone = "", busy = "", other = "", blank = "", busyPl = "";
    try {
      access = await say("access.ec", "EACCES");
      perm = await say("access.ec", "EPERM");
      gone = await say("gone.ec", "ENOENT");
      busy = await say("held.ec", "EBUSY");
      other = await say("access.ec", "EIO");
      blank = (await click("blank.ec")).said;
      ST.lsSet("eUiLang", "pl");
      busyPl = await say("held.ec", "EBUSY");
      ST.lsSet("eUiLang", "en");
    } finally {
      fs.readFileSync = origRead;
      bomb.code = "";
    }
    const coded = access.indexOf("may not read") >= 0 && perm.indexOf("may not read") >= 0
      && gone.indexOf("no longer where it was") >= 0 && busy.indexOf("Another program holds") >= 0
      && other.indexOf("(EIO)") >= 0 && blank.indexOf("is empty") >= 0
      && busyPl.indexOf("otwarty w innym programie") >= 0;
    check(coded,
      "15w8 one line per reason the read gave: access " + (access.indexOf("may not read") >= 0)
      + ", perm " + (perm.indexOf("may not read") >= 0) + ", gone " + (gone.indexOf("no longer where it was") >= 0)
      + ", held " + (busy.indexOf("Another program holds") >= 0) + ", other " + (other.indexOf("(EIO)") >= 0)
      + ", empty " + (blank.indexOf("is empty") >= 0) + ", polish " + (busyPl.indexOf("otwarty w innym programie") >= 0)
      + (coded ? "" : " access-said " + access.slice(0, 120) + " blank-said " + blank.slice(0, 80)));

    const mainPath = path.join(ROOT, "shell", "main.js");
    const before = fs.readFileSync(mainPath);
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:catalog-read-why") >= 0);
    let turned = false, detail = "plant line absent";
    if (at >= 0) {
      lines[at] = "    return { name: base, text: \"\" }; /* plant:catalog-read-why */";
      const plantUd = path.join(LAB, "w8plant");
      fs.mkdirSync(plantUd, { recursive: true });
      fs.writeFileSync(path.join(plantUd, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
        keys: { eCatalogFolder: w8dir, eUiLang: "en" } }), "utf8");
      const planted = loadDesk(plantUd, lines.join("\n"));
      host.readCatalogFile = (name, desk, asked, offer) => planted.ask("etiuda:catalog-read", name, desk, asked, offer);
      planted.api.setDown(w8dir);
      ST.lsSet("eUiLang", "en");
      const again = await click(quietName);
      turned = again.said.indexOf("could not be read from the disk") < 0;
      detail = turned ? "the line was gone" : "the line was still said";
    }
    const same = fs.readFileSync(mainPath).equals(before);
    check(turned && same, "15wc lifting plant:catalog-read-why turns 15w8 red (a Load that failed says nothing of the folder): "
      + detail + ", sha " + (same ? "restored" : "differs"));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }
}

check(regStand.held(), "890ab every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
