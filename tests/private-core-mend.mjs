/* The Private mark's core (board 1014, the test architect's fault-injection probe of 2026-11-22, four findings). What counts
 * as the team's is what the team's lead signed, never the bare id: a personal catalog under an id the team lists, or a copy
 * whose first hop the lead did not sign, takes the mark and keeps it. An answer about a catalog now Private is taken back
 * whatever seal it went under. Nothing names a personal catalog to the team before this desk is told, and a catalog marked
 * Private is never named at all: not in in-use.ec, not in the statistics. The page is never told Private for a catalog that
 * is being sent. A shared root file of one is not written again, and the root file this desk wrote is taken off, and
 * only that file. Statistics on the share are emptied or taken off when it is marked, even after this process has
 * forgotten them. A card from it is not shared, and the page says so in one line.
 *
 *     node tests/private-core-mend.mjs        exit code is the number of failed checks, capped at 63
 *
 * Red where a Private catalog's content or name reaches a file the lead or a teammate can open, where a personal catalog is
 * named before the desk is told, or where the page's view lists as Private a catalog the desk answers with. Each deciding
 * line is planted once (plant:pcm-*), skipped with ETIUDA_PLANTS=off. The shell runs from a copy of shell/ in a temp folder,
 * driven through its own handlers. No window variable is set. Throwaway keys and catalogs only.
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
const EXPECTED = 42;

const CARD = "The quay lamp is wrapped for the crossing.";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-private-core-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "offerFile", "catalogChanged", "tryCatalogAsk", "askSignedBytes",
  "signedSha", "deskTrustChecks", "teamKeyAt", "openAnswerLead", "openBranchLead", "tryHeldBranches", "openStatsSealed",
  "writeStatsAnswer"];
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
    (src || SRC) + "\nreturn { setDown: d => { folderDown = d; }, setStats: (s, p) => { statsSpan = s; statsPeriod = p; }, "
      + "forgetStatsNamed: () => { statsWroteNamed = null; if (typeof statsNamedKept !== "undefined") statsNamedKept = null; }, noteSharedWrote: (file, text) => historyKeep(file, text, true), "
      + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(", ") + " };")(
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
/* The desk's own files land in its folder team's mirror, and the syncer carries them to the share. */
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
  const leadBox = crypto.generateKeyPairSync("x25519");
  const BOX = pubHex(leadBox.publicKey);
  syncMirror = (box) => {
    const mirror = syncerMod.folderMirrorOf(box.D.ud, box.team);
    const prog = syncerMod.createFolderProgram({
      team: box.team, folder: box.share, mirror: mirror, pin: LEAD,
      keyFor: (epoch) => box.D.api.teamKeyAt(box.team, epoch) || box.key,
      checks: box.D.api.deskTrustChecks(),
    });
    prog.syncOnce();
    prog.syncOnce();
  };
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
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: o.card || CARD } }],
    };
    if (o.name !== null) doc.name = o.name === undefined ? "North lamps" : o.name;
    return o.unsigned ? doc : sign(doc, lead.privateKey, LEAD);
  };
  const RING = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "north-lamps", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const teamFile = (D, id, epoch, roster, catalogs) => textOf(sign({
    format: 1, kind: "etiuda-team", id, catalogs: catalogs || ["not-this"], lead: Object.assign({}, LEAD, { box: BOX }),
    sealed: true, exportsSealed: false, epoch, roster,
  }, lead.privateKey, LEAD));
  const entry = (D, who, key, team, epoch) => ({ desk: { id: who.id, key: who.key, box: who.box }, wrap: D.api.wrapTeamKey(key, who.box, team, epoch, who.id) });
  const pinOf = (D, text) => { try { return D.api.signedSha(JSON.parse(text)); } catch { return ""; } };
  const take = (D, pin) => D.sync("etiuda:catalog-taken", pin);
  const expAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const putAsk = (box, id, sha) => {
    const doc = { format: 2, kind: "etiuda-catalog-ask", id: id, desk: box.me.id, sha256: sha, expires: expAt(),
      sig: { alg: "Ed25519", keyId: LEAD.keyId }, team: box.team };
    doc.sig.value = crypto.sign(null, box.D.api.askSignedBytes(doc), lead.privateKey).toString("hex");
    fs.mkdirSync(path.join(box.share, "catalog-asks"), { recursive: true });
    put(box.share, path.join("catalog-asks", box.me.id + ".json"), JSON.stringify(doc));
  };
  const openSealedDoc = (D, file, key) => { try { return JSON.parse(D.api.openSealed(key, JSON.parse(fs.readFileSync(file, "utf8")))); } catch { return null; } };
  const openLeadDoc = (D, file) => {
    try { const t = D.api.openAnswerLead(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), path.basename(path.dirname(file))); return t ? JSON.parse(t) : null; }
    catch { return null; }
  };
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
  const join = (box, catalogs, untold) => {
    put(box.share, "etiuda-team.json", teamFile(box.D, box.team, 1, [entry(box.D, box.me, box.key, box.team, 1)], catalogs));
    if (!untold) box.D.ask("etiuda:team-join", "content-said", box.team, "");
  };

  const MARK = "marker-pcm-1014-private-3c9a";
  const FORK = "k-0123456789abcdef-1a2b3c4d";
  const bodyOf = (id, o) => textOf(catalog(4, Object.assign({ id, name: "Quay held", card: MARK }, o || {})));
  const strangerBody = id => textOf(sign(catalog(4, { id, name: "Quay held", card: MARK, unsigned: true }), other.privateKey, { keyId: "stranger" }));
  const walk = dir => { const out = []; const rec = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else out.push(p); } }; rec(dir); return out; };
  /* Every file on the share and the desk's mirror, read raw and under every key the lead or a teammate holds: where `needle`
     (the card text by default) appears. */
  const leaks = (box, needle) => {
    const hits = [], want = needle || MARK;
    for (const f of [box.share, syncerMod.folderMirrorOf(box.D.ud, box.team)].flatMap(walk)) {
      let raw = ""; try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
      const desk = path.basename(path.dirname(f));
      let env = null; try { env = JSON.parse(raw); } catch { env = null; }
      const views = [raw];
      try { views.push(box.D.api.openSealed(box.key, env)); } catch {}
      try { views.push(box.D.api.openAnswerLead(leadBox.privateKey, env, desk)); } catch {}
      try { views.push(box.D.api.openBranchLead(leadBox.privateKey, env, desk)); } catch {}
      try { views.push(box.D.api.openStatsSealed(leadBox.privateKey, env, desk)); } catch {}
      if (views.some(v => typeof v === "string" && v.indexOf(want) >= 0)) hits.push(path.relative(path.dirname(box.share), f).replace(/\\/g, "/"));
    }
    return Array.from(new Set(hits));
  };
  const setup = async (name, o) => {
    const opt = o || {};
    const box = await arm(name, opt.src);
    join(box, opt.catalogs || ["harbour-board"], opt.untold);
    if (opt.private) await box.D.ask("etiuda:team-join", "private", opt.private, "on");
    const dir = folder(name + "-out");
    put(dir, "held.ec", opt.body || bodyOf(opt.id || "quay-held"));
    box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
    const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop();
    const pin = pinOf(box.D, off ? off[1] : "");
    take(box.D, pin);
    return { box, pin, ans: answerPath(box.share, box.me.id) };
  };
  const ask = (u, id) => { putAsk(u.box, id, u.pin); u.box.D.api.tryCatalogAsk(u.box.D.win); };
  const answered = u => ({ file: fs.existsSync(u.ans), lead: !!openLeadDoc(u.box.D, u.ans), team: !!openSealedDoc(u.box.D, u.ans, u.box.key) });
  const leadReads = u => { const d = openSealedDoc(u.box.D, u.ans, u.box.key) || openLeadDoc(u.box.D, u.ans); return !!d && JSON.stringify(d).indexOf(MARK) >= 0; };
  const mark = (u, id, on) => u.box.D.ask("etiuda:team-join", "private", id, on ? "on" : "off");
  const view = u => u.box.D.ask("etiuda:team-join", "content");
  const teamText = (box, o) => textOf(sign({
    format: 1, kind: "etiuda-team", id: box.team, catalogs: o.catalogs, lead: Object.assign({}, LEAD, { box: BOX }), sealed: true,
    exportsSealed: false, epoch: 1, roster: [entry(box.D, box.me, box.key, box.team, 1)], rev: o.rev,
  }, lead.privateKey, LEAD));
  let ms = 0;
  const relead = (box, o) => { put(box.share, "etiuda-team.json", teamText(box, o)); ms += 2000; touch(path.join(box.share, "etiuda-team.json"), Date.now() + ms); box.D.api.tryCatalogAsk(box.D.win); };
  /* in-use.ec as a teammate reads it, on the desk's mirror and on the share once the syncer has run. */
  const inUseSeen = u => {
    syncMirror(u.box);
    const mine = openSealedDoc(u.box.D, inUsePath(u.box.share, u.box.me.id), u.box.key);
    const onShare = openSealedDoc(u.box.D, path.join(u.box.share, "desks", u.box.me.id, "in-use.ec"), u.box.key);
    const names = d => !!d && !!d.catalog && (d.catalog.id === "quay-held" || d.catalog.title === "Quay held" || d.catalog.id === "harbour-board");
    return { mirror: names(mine), share: names(onShare), cleared: !!mine && mine.cleared === true && !!onShare && onShare.cleared === true };
  };
  const NL = "\n";
  const lift = (tag, with_) => { const s = SRC.split(NL).map(l => l.indexOf(tag) >= 0 ? with_ : l).join(NL); return s === SRC ? null : s; };
  const planted = async (id, tag, with_, scene, red, what) => {
    if (PLANTS_OFF) { skip(id + " lifting " + tag + " turns its check red"); return; }
    const src = lift(tag, with_);
    const r = src ? await scene(src) : null;
    check(!!r && red(r), id + " lifting " + tag + " turns its check red: " + what + " (" + (r ? JSON.stringify(r) : "plant not found") + ")");
  };

  /* pcm1 (finding 1, the probe's S7a2): a personal catalog, signed by a stranger, marked Private, under an id the lead lists later. */
  const pcm1 = async src => {
    const u = await setup("pcm1-" + (src ? "p" : "g"), { private: "quay-held", body: strangerBody("quay-held"), src });
    relead(u.box, { rev: 1, catalogs: ["quay-held"] });
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    ask(u, "AskPcm1");
    const v = await view(u);
    return { answer: answered(u), leaks: leaks(u.box), shownPrivate: v.private.indexOf("quay-held") >= 0 };
  };
  const r1 = await pcm1();
  check(!r1.answer.file && r1.leaks.length === 0 && r1.shownPrivate,
    "pcm1 a stranger-signed catalog marked Private stays unanswered once the lead lists its id, and the page is told Private (" + JSON.stringify(r1) + ")");
  await planted("pcm1p", "plant:pcm-private-signed", "  if (chainListed(doc, use && use.catalogs)) return false;", pcm1,
    r => r.answer.file || r.leaks.length > 0, "judged by the bare id, the catalog is answered");

  /* pcm2 (finding 1, S7a3): a working copy grown from that catalog, after the lead lists the id. */
  const pcm2 = async () => {
    const u = await setup("pcm2", { private: "quay-held", body: strangerBody("quay-held") });
    relead(u.box, { rev: 1, catalogs: ["quay-held"] });
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    const doc = { format: 2, kind: "etiuda-catalog", id: u.box.me.id + "-d4d4d4d4", rev: 1, name: "Quay held, at this desk", date: "2026-04-03",
      langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-desk", shelf: "t-op", bodyShape: "plain", title: { en: "Desk" }, body: { en: MARK } }],
      desk: { id: u.box.me.id, key: u.box.me.key, box: u.box.me.box, name: "North desk" }, grew: { id: "quay-held", rev: 4, sha: "sha256:" + "ab".repeat(32) } };
    const w = await u.box.D.ask("etiuda:branch-write", "quay-d4d4d4d4", JSON.stringify(doc));
    syncMirror(u.box);
    const v = await view(u);
    return { write: w, leaks: leaks(u.box), shownPrivate: v.private.indexOf("quay-held") >= 0 };
  };
  const r2 = await pcm2();
  check(r2.leaks.length === 0 && r2.shownPrivate,
    "pcm2 a working copy of that Private catalog is written nowhere a lead or teammate opens once its id is listed (" + JSON.stringify(r2) + ")");

  /* pcm3 (finding 1, S8): a stranger-signed catalog carrying an id the team lists takes the mark and is then not answered; unmarked,
     it is personal, answered to the lead's box alone. */
  const pcm3 = async src => {
    const u = await setup("pcm3-" + (src ? "p" : "g"), { catalogs: ["harbour-board"], body: strangerBody("harbour-board"), src });
    const v = await mark(u, "harbour-board", true);
    ask(u, "AskPcm3");
    return { taken: v.private.indexOf("harbour-board") >= 0, answer: answered(u), leaks: leaks(u.box), named: inUseSeen(u) };
  };
  const r3 = await pcm3();
  check(r3.taken && !r3.answer.file && r3.leaks.length === 0 && !r3.named.mirror && !r3.named.share,
    "pcm3 a stranger-signed catalog under a listed id takes the mark, is not answered and is not named (" + JSON.stringify(r3) + ")");
  await planted("pcm3p", "plant:pcm-mark-signed", "  if (CATALOG_ID_RE.test(id) && !(on && idListedHere(id))) {", pcm3,
    r => !r.taken, "judged by the bare id, the mark is refused");
  {
    const u = await setup("pcm3h", { catalogs: ["harbour-board"], body: strangerBody("harbour-board") });
    ask(u, "AskPcm3h");
    const a = answered(u);
    check(a.file && a.lead && !a.team, "pcm3h unmarked, that catalog is personal: answered to the lead's box alone, not under the team key (" + JSON.stringify(a) + ")");
  }

  /* pcm4 (finding 2, S7b3): a copy answered under the team key while its root was listed, the root delisted, the copy marked. */
  const pcm4 = async src => {
    const E = catalog(4, { id: "quay-held", card: "the lead's own card" });
    const g = catalog(5, { id: FORK, name: "Quay held, mine", card: MARK, unsigned: true });
    const box = await arm("pcm4-" + (src ? "p" : "g"), src);
    g.grew = { id: "quay-held", rev: 4, sha: box.D.api.signedSha(E) };
    put(box.share, "quay-held.ec", textOf(E));
    join(box, ["quay-held"]);
    const dir = folder("pcm4-" + (src ? "p" : "g") + "-out"); put(dir, "held.ec", textOf(g)); box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
    const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop(); const pin = pinOf(box.D, off ? off[1] : ""); take(box.D, pin);
    const u = { box, pin, ans: answerPath(box.share, box.me.id) };
    ask(u, "AskPcm4"); const first = answered(u);
    relead(box, { rev: 1, catalogs: ["harbour-board"] });
    const v = await mark(u, FORK, true);
    box.D.api.tryCatalogAsk(box.D.win); syncMirror(box);
    return { first, taken: v.private.indexOf(FORK) >= 0, leadReads: leadReads(u), answerFile: fs.existsSync(u.ans),
      onShare: fs.existsSync(path.join(box.share, "desks", box.me.id, "catalog-answer.ec")) };
  };
  const r4 = await pcm4();
  check(r4.first.team && r4.taken && !r4.leadReads && !r4.answerFile && !r4.onShare,
    "pcm4 a team-key answer whose chain is now Private is taken back from the mirror and the share (" + JSON.stringify(r4) + ")");
  await planted("pcm4p", "plant:pcm-withdraw-any",
    "  if (answerKept && answerKept.lead && (!open || privateChain(answerKept.ids).some(id => catalogPrivate.has(id)))) removeAnswer();", pcm4,
    r => r.answerFile || r.onShare, "only a box answer is taken back");

  /* pcm5 (finding 3, S6): a copy marked Private before the lead listed its root, its first hop not the lead's edition. */
  const pcm5 = async () => {
    const g = catalog(5, { id: FORK, name: "Quay held, mine", card: MARK, unsigned: true });
    g.grew = { id: "quay-held", rev: 4, sha: "sha256:" + "cd".repeat(32) };
    const u = await setup("pcm5", { private: FORK, body: textOf(g) });
    ask(u, "AskPcm5a"); const before = answered(u);
    relead(u.box, { rev: 1, catalogs: ["quay-held"] });
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    putAsk(u.box, "AskPcm5b", u.pin); u.box.D.api.tryCatalogAsk(u.box.D.win);
    const v = await view(u);
    return { before, after: answered(u), leaks: leaks(u.box), shownPrivate: v.private.indexOf(FORK) >= 0 };
  };
  const r5 = await pcm5();
  check(!r5.before.file && !r5.after.file && r5.leaks.length === 0 && r5.shownPrivate,
    "pcm5 a copy marked Private before its root is listed is still not answered, and the mark still shows (" + JSON.stringify(r5) + ")");

  /* pcm6 (the page): the lead's own signed edition under an id this desk had marked, once listed, is the team's and is answered
     under the team key; the page is then not told Private for it. */
  const pcm6 = async src => {
    const u = await setup("pcm6-" + (src ? "p" : "g"), { private: "quay-held", src });
    relead(u.box, { rev: 1, catalogs: ["quay-held"] });
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    ask(u, "AskPcm6");
    const v = await view(u);
    return { answer: answered(u), shownPrivate: v.private.indexOf("quay-held") >= 0 };
  };
  const r6 = await pcm6();
  check(r6.answer.team && !r6.shownPrivate,
    "pcm6 a catalog answered as the team's is not shown Private to the page (" + JSON.stringify(r6) + ")");
  await planted("pcm6p", "plant:pcm-view-sent", "    private: Array.from(catalogPrivate).sort(), listed: team && Array.isArray(doc.catalogs) ? doc.catalogs.map(String) : [],",
    pcm6, r => r.answer.team && r.shownPrivate, "the page is told Private for a catalog being sent");

  /* pcm7 (finding 4, S10): an untold desk names no personal catalog; told, it names it; a team catalog is named either way. */
  const pcm7 = async src => {
    const u = await setup("pcm7-" + (src ? "p" : "g"), { untold: true, src });
    const untold = inUseSeen(u);
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    const told = inUseSeen(u);
    return { untold, told };
  };
  const r7 = await pcm7();
  check(!r7.untold.mirror && !r7.untold.share && r7.untold.cleared && r7.told.mirror && r7.told.share,
    "pcm7 in-use.ec names a personal catalog only once the desk is told, and until then says cleared, naming none (" + JSON.stringify(r7) + ")");
  await planted("pcm7p", "plant:pcm-in-use-gate", "    /* plant lifted */", pcm7,
    r => r.untold.mirror || r.untold.share, "the personal catalog is named before the desk is told");
  {
    const box = await arm("pcm7t");
    const E = catalog(4, { id: "quay-held", card: "the lead's own card" });
    join(box, ["quay-held"], true);
    const dir = folder("pcm7t-out"); put(dir, "held.ec", textOf(E)); box.D.api.offerFile(box.D.win, path.join(dir, "held.ec"));
    const off = box.D.sent.filter(a => a[0] === "etiuda:catalog-file").pop(); take(box.D, pinOf(box.D, off ? off[1] : ""));
    const t = inUseSeen({ box });
    check(t.mirror && t.share, "pcm7t a team catalog the lead signed is named on an untold desk, as before (" + JSON.stringify(t) + ")");
  }
  {
    const u = await setup("pcm7u", { untold: true, private: "quay-held" });
    const a = inUseSeen(u);
    await u.box.D.ask("etiuda:team-join", "content-said", u.box.team, "");
    const b = inUseSeen(u);
    check(!a.mirror && !a.share && !b.mirror && !b.share, "pcm7u a Private catalog is named neither before nor after the desk is told (" + JSON.stringify({ a, b }) + ")");
  }

  /* pcm8 (the naming check): a catalog marked Private is never named. Marked before it is taken, nothing names it; marked after,
     in-use.ec goes from the mirror and the share; unmarked, it is named again. */
  {
    const u = await setup("pcm8a", { private: "quay-held" });
    const s = inUseSeen(u);
    check(!s.mirror && !s.share, "pcm8a a catalog marked Private before it is taken is not named in in-use.ec (" + JSON.stringify(s) + ")");
  }
  const pcm8 = async src => {
    const u = await setup("pcm8-" + (src ? "p" : "g"), { src });
    const before = inUseSeen(u);
    await mark(u, "quay-held", true);
    const marked = inUseSeen(u);
    await mark(u, "quay-held", false);
    const unmarked = inUseSeen(u);
    return { before, marked, unmarked };
  };
  const r8 = await pcm8();
  check(r8.before.mirror && r8.before.share && !r8.marked.mirror && !r8.marked.share && r8.marked.cleared && r8.unmarked.mirror && r8.unmarked.share,
    "pcm8 marking the catalog in use takes its name off the mirror and the share, and unmarking puts it back (" + JSON.stringify(r8) + ")");
  await planted("pcm8p", "plant:pcm-reseal-judge",
    "  if (inUseKept && inUseKept.sha === pin && inUseKept.epoch === use.seal.epoch && inUseKept.team === use.seal.team) return;", pcm8,
    r => r.marked.mirror || r.marked.share, "a mark set after the take leaves the name on the share");

  /* pcm9 (the naming check, statistics): the counts sealed to the lead name no Private catalog. */
  const pcm9 = async (src, priv) => {
    const u = await setup("pcm9-" + (src ? "p" : "g") + (priv ? "x" : "o"), { private: priv ? "quay-held" : "", src });
    u.box.D.api.setStats("lab", { from: "2026-11-01", to: "2026-11-30" });
    const r = u.box.D.api.writeStatsAnswer(JSON.stringify({ catalog: { id: "quay-held", rev: 4 }, cards: [{ id: "c-warm", n: 2 }], intents: [], misses: 0, langs: {} }), "", "close");
    const file = path.join(ownDir(u.box.share, u.box.me.id), "stats.estat");
    let doc = null;
    try { doc = JSON.parse(u.box.D.api.openStatsSealed(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), u.box.me.id)); } catch { doc = null; }
    return { written: !!(r && r.ok) && !!doc, catalog: doc ? doc.catalog || null : null };
  };
  const r9 = await pcm9(null, true), r9o = await pcm9(null, false);
  check(r9.written && !r9.catalog && r9o.written && !!r9o.catalog && r9o.catalog.id === "quay-held",
    "pcm9 the statistics name the catalog in use, but never one marked Private (" + JSON.stringify({ priv: r9, open: r9o }) + ")");
  await planted("pcm9p", "plant:pcm-stats-whole", "    /* plant lifted */", src => pcm9(src, true),
    r => !!r.catalog, "the statistics name the Private catalog");
  /* pcm9w (Claude alpha, 2026-11-22, by Claudius): nothing of a Private catalog is reported, not its name, id or edition, not its
     cards' ids, not per-card or intent counts, not that the desk used a private catalog for so many replies. Statistics sent while
     one is in use carry nothing of it, whether the page names the catalog or not. */
  const pcm9w = async src => {
    const u = await setup("pcm9w-" + (src ? "p" : "g"), { private: "quay-held", src });
    u.box.D.api.setStats("lab", { from: "2026-11-01", to: "2026-11-30" });
    const file = path.join(ownDir(u.box.share, u.box.me.id), "stats.estat");
    const read = () => { try { return u.box.D.api.openStatsSealed(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), u.box.me.id) || ""; } catch { return ""; } };
    const page = { cards: [{ id: "c-warm", n: 2, langs: { en: 2 } }], intents: [{ id: "i-quay-ask", n: 3 }], misses: 4, langs: { en: 5 },
      pairs: [{ from: "c-warm", to: "c-cold", n: 1 }], suggestTaken: 1, suggestOpen: 2 };
    const out = [];
    for (const named of [true, false]) {
      const data = Object.assign(named ? { catalog: { id: "quay-held", rev: 4 } } : {}, page);
      u.box.D.api.writeStatsAnswer(JSON.stringify(Object.assign({}, data, { misses: named ? 4 : 5 })), "", "close");
      const t = read();
      let d = null; try { d = JSON.parse(t); } catch { d = null; }
      out.push({ named, written: !!d, carries: !d ? ["unread"] : ["quay-held", "c-warm", "c-cold", "i-quay-ask"].filter(x => t.indexOf(x) >= 0)
        .concat(d.catalog ? ["catalog"] : [], (d.cards || []).length ? ["cards"] : [], (d.intents || []).length ? ["intents"] : [],
          d.misses ? ["misses"] : [], Object.keys(d.langs || {}).length ? ["langs"] : [], d.pairs ? ["pairs"] : [],
          d.suggestTaken || d.suggestOpen ? ["suggest"] : []) });
    }
    return out;
  };
  const r9w = await pcm9w();
  check(r9w.every(x => x.written && x.carries.length === 0),
    "pcm9w statistics sent while a Private catalog is in use carry nothing of it: no name, id, card id, count or reply total (" + JSON.stringify(r9w) + ")");
  await planted("pcm9wp", "plant:pcm-stats-whole", "    /* plant lifted */", pcm9w,
    r => r.some(x => x.carries.length > 0), "the statistics carry the Private catalog's cards and counts");
  /* pcm9m: statistics written before the mark are written again at once without the catalog's name when it is marked. */
  const pcm9m = async src => {
    const u = await setup("pcm9m-" + (src ? "p" : "g"), { src });
    u.box.D.api.setStats("lab", { from: "2026-11-01", to: "2026-11-30" });
    u.box.D.api.writeStatsAnswer(JSON.stringify({ catalog: { id: "quay-held", rev: 4 }, cards: [{ id: "c-warm", n: 2 }], intents: [], misses: 0, langs: {} }), "", "close");
    const file = path.join(ownDir(u.box.share, u.box.me.id), "stats.estat");
    const read = () => { try { return JSON.parse(u.box.D.api.openStatsSealed(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), u.box.me.id)); } catch { return null; } };
    const before = read();
    await mark(u, "quay-held", true);
    const after = read();
    return { before: before ? before.catalog || null : null, after: after ? after.catalog || null : "unread", counts: !!after && Array.isArray(after.cards) && after.cards.length === 0 };
  };
  const r9m = await pcm9m();
  check(!!r9m.before && r9m.after === null && r9m.counts,
    "pcm9m statistics that named the catalog are written again with nothing of it, name or counts, the moment it is marked Private (" + JSON.stringify(r9m) + ")");
  await planted("pcm9mp", "plant:pcm-stats-mark", "    /* plant lifted */", pcm9m, r => !!r.after, "the statistics on the share still name it");

  /* pcm10 (the test architect's HOLD 1, 2026-11-22): the page judges a row by the shell's own teamListedDoc answer, which contentView
     sends as teamCatalogPins, the signed pins of the catalogs this desk holds that are the team's. The lead's signed edition under a listed
     id is among them; a stranger-signed catalog under that id, and a copy whose first hop the lead did not sign, are not. The mark is
     taken on the listed id while a personal catalog under it is held. */
  const pcm10 = async src => {
    const E = catalog(4, { id: "quay-held", card: "the lead's own card" });
    const S = sign(catalog(4, { id: "quay-held", name: "Quay held, mine", card: MARK, unsigned: true }), other.privateKey, { keyId: "stranger" });
    const F = catalog(5, { id: FORK, name: "Quay held, forked", card: MARK, unsigned: true });
    F.grew = { id: "quay-held", rev: 4, sha: "sha256:" + "cd".repeat(32) };
    /* The stranger's file is the catalog in use, opened from outside the team's folder: a folder team's syncer takes no catalog into
       the mirror that the lead did not sign, so that is how a desk holds one. */
    const u = await setup("pcm10-" + (src ? "p" : "g"), { catalogs: ["quay-held"], body: textOf(S), src });
    const box = u.box;
    put(box.share, "quay-held.ec", textOf(E));
    put(box.share, "quay-fork.ec", textOf(F));
    const v = await box.D.ask("etiuda:team-join", "content");
    const pins = Array.isArray(v.teamCatalogPins) ? v.teamCatalogPins : null;
    const m = await box.D.ask("etiuda:team-join", "private", "quay-held", "on");
    return { pins: !!pins, lead: !!pins && pins.indexOf(box.D.api.signedSha(E)) >= 0, stranger: !!pins && pins.indexOf(box.D.api.signedSha(S)) >= 0,
      fork: !!pins && pins.indexOf(box.D.api.signedSha(F)) >= 0, markTaken: m.private.indexOf("quay-held") >= 0 };
  };
  const r10 = await pcm10();
  check(r10.pins && r10.lead && !r10.stranger && !r10.fork && r10.markTaken,
    "pcm10 contentView's teamCatalogPins holds the lead's signed edition under the listed id and neither a stranger-signed file under it nor an unsigned fork, and the mark is taken on that id (" + JSON.stringify(r10) + ")");
  await planted("pcm10p", "plant:pcm-team-pins", "    /* plant lifted */", pcm10,
    r => !r.lead || r.stranger || r.fork, "teamCatalogPins no longer follows teamListedDoc");

  /* pcm9s: a mark after the process has forgotten the statistics, and again after the span is gone. */
  const pcm9s = async src => {
    const u = await setup("pcm9s-" + (src ? "p" : "g"), { src });
    u.box.D.api.setStats("lab", { from: "2026-11-01", to: "2026-11-30" });
    const file = path.join(ownDir(u.box.share, u.box.me.id), "stats.estat");
    const read = () => { try { return JSON.parse(u.box.D.api.openStatsSealed(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), u.box.me.id)); } catch { return null; } };
    u.box.D.api.writeStatsAnswer(JSON.stringify({ catalog: { id: "quay-held", rev: 4 }, cards: [{ id: "c-warm", n: 2 }], intents: [], misses: 0, langs: {} }), "", "close");
    u.box.D.api.forgetStatsNamed();
    await mark(u, "quay-held", true);
    const live = read();
    /* Taken off with no span held, the file naming the catalog again first: one already emptied names nothing, and stays. */
    await mark(u, "quay-held", false);
    u.box.D.api.writeStatsAnswer(JSON.stringify({ catalog: { id: "quay-held", rev: 4 }, cards: [{ id: "c-warm", n: 2 }], intents: [], misses: 0, langs: {} }), "", "close");
    u.box.D.api.forgetStatsNamed();
    u.box.D.api.setStats("", null);
    await mark(u, "quay-held", true);
    return { live: live ? (live.catalog || null) : "unread", counts: !!live && Array.isArray(live.cards) && live.cards.length === 0, dropped: fs.existsSync(file) };
  };
  const r9s = await pcm9s();
  check(r9s.live === null && r9s.counts && !r9s.dropped,
    "pcm9s marking Private empties statistics the process has forgotten, and takes the file off once no span is held (" + JSON.stringify(r9s) + ")");
  await planted("pcm9sp", "plant:pcm-stats-mark", "    /* plant lifted */", pcm9s,
    r => !!(r.live && r.live.id) || r.dropped, "statistics the process forgot still name the catalog, or the file stays once the span is gone");

  /* pcm9n (withdraw-names-only-private, review rho's narrowing of 5cf2f1e3): a mark on another catalog, in a process that has not
     written the statistics itself, leaves statistics that name a catalog not private, span held or not. */
  const pcm9n = async src => {
    const u = await setup("pcm9n-" + (src ? "p" : "g"), { src });
    u.box.D.api.setStats("lab", { from: "2026-11-01", to: "2026-11-30" });
    const file = path.join(ownDir(u.box.share, u.box.me.id), "stats.estat");
    const read = () => { try { return JSON.parse(u.box.D.api.openStatsSealed(leadBox.privateKey, JSON.parse(fs.readFileSync(file, "utf8")), u.box.me.id)); } catch { return null; } };
    u.box.D.api.writeStatsAnswer(JSON.stringify({ catalog: { id: "quay-held", rev: 4 }, cards: [{ id: "c-warm", n: 2 }], intents: [], misses: 0, langs: {} }), "", "close");
    u.box.D.api.forgetStatsNamed();
    await mark(u, "quay-other", true);
    const live = read();
    u.box.D.api.forgetStatsNamed();
    u.box.D.api.setStats("", null);
    await mark(u, "quay-third", true);
    const left = read();
    return { live: live && live.catalog ? live.catalog.id : null, counts: !!live && Array.isArray(live.cards) && live.cards.length === 1,
      kept: fs.existsSync(file), left: left && left.catalog ? left.catalog.id : null };
  };
  const r9n = await pcm9n();
  check(r9n.live === "quay-held" && r9n.counts && r9n.kept && r9n.left === "quay-held",
    "pcm9n withdraw-names-only-private marking another catalog Private leaves statistics that name a catalog not private, with their counts, in a process that did not write them, span held or not (" + JSON.stringify(r9n) + ")");
  await planted("pcm9np", "plant:pcm-withdraw-named", "    /* plant lifted */", pcm9n,
    r => r.live !== "quay-held" || !r.counts || !r.kept, "statistics naming a team catalog are emptied or taken off by a mark on another");

  /* pcm11: on a folder team, the root file this desk wrote goes, and only that file. No shared-write: that starts a worker. */
  const pcm11 = async src => {
    const u = await setup("pcm11-" + (src ? "p" : "g"), { src });
    const root = path.dirname(path.dirname(ownDir(u.box.share, u.box.me.id)));
    const mineText = bodyOf("quay-held", { unsigned: true });
    const signedText = bodyOf("quay-held");
    const swapFirst = bodyOf("quay-held", { unsigned: true });
    const mine = path.join(root, "quay-held.ec");
    const neighbor = path.join(root, "harbour.ec");
    const signed = path.join(root, "quay-signed.ec");
    const swapped = path.join(root, "quay-swapped.ec");
    fs.writeFileSync(mine, mineText);
    fs.writeFileSync(neighbor, bodyOf("harbour-board", { unsigned: true, name: "Harbour", card: "harbour lamp" }));
    fs.writeFileSync(signed, signedText);
    fs.writeFileSync(swapped, swapFirst);
    u.box.D.api.noteSharedWrote(mine, mineText);
    u.box.D.api.noteSharedWrote(signed, signedText);
    u.box.D.api.noteSharedWrote(swapped, swapFirst);
    fs.writeFileSync(swapped, bodyOf("harbour-board", { unsigned: true, name: "Harbour", card: "other lamp" }));
    await mark(u, "quay-held", true);
    const idOf = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")).id; } catch { return ""; } };
    return { gone: !fs.existsSync(mine), neighbor: idOf(neighbor) === "harbour-board", signed: fs.existsSync(signed) && idOf(signed) === "quay-held", swapped: idOf(swapped) === "harbour-board" };
  };
  const r11 = await pcm11();
  check(r11.gone && r11.neighbor && r11.signed && r11.swapped,
    "pcm11 marking Private takes off the unsigned root file this desk wrote, and leaves a neighbor, a signed file and a file that now holds another catalog (" + JSON.stringify(r11) + ")");
  await planted("pcm11p", "plant:pcm-shared-root", "    /* plant lifted */", pcm11,
    r => !r.gone, "the root file this desk wrote stays on the share");

  /* pcm11w: off a team, the real shared write is refused once the catalog is private, and the file it wrote is gone. */
  const pcm11w = async src => {
    const tag = "pcm11w-" + (src ? "p" : "g");
    const share = folder(tag + "-share");
    const D = newDesk(tag, share, src);
    const text = bodyOf("quay-held", { unsigned: true });
    const first = await D.ask("etiuda:shared-write", "quay-held.ec", text, "", true);
    const neighbor = path.join(share, "harbour.ec");
    fs.writeFileSync(neighbor, bodyOf("harbour-board", { unsigned: true, name: "Harbour", card: "harbour lamp" }));
    await D.ask("etiuda:team-join", "private", "quay-held", "on");
    const mine = path.join(share, "quay-held.ec");
    const gone = !fs.existsSync(mine);
    let neighborId = "";
    try { neighborId = JSON.parse(fs.readFileSync(neighbor, "utf8")).id; } catch { neighborId = ""; }
    const second = await D.ask("etiuda:shared-write", "quay-held.ec", text, "", true);
    return { first: !!(first && first.ok), gone, neighbor: neighborId === "harbour-board",
      refused: !!(second && second.ok === false && second.refused === true && second.private === true), back: fs.existsSync(mine) };
  };
  const r11w = await pcm11w();
  check(r11w.first && r11w.gone && r11w.neighbor && r11w.refused && !r11w.back,
    "pcm11w a shared write of a Private catalog is refused, and the unsigned root file that write had put down is gone (" + JSON.stringify(r11w) + ")");
  await planted("pcm11wp", "plant:pcm-shared-private", "    /* plant lifted */", pcm11w,
    r => !r.refused || r.back, "a shared write after the mark puts the catalog back");

  /* pcm12: sharing a card from the catalog in use, once it is private, is refused before any team is asked. */
  const pcm12 = async src => {
    const u = await setup("pcm12-" + (src ? "p" : "g"), { private: "quay-held", src });
    const r = await u.box.D.ask("etiuda:team-join", "share-to", "k-0123456789abcdef", JSON.stringify({ id: "c-warm", title: { en: "Warm opening" } }), "");
    return { ok: !!(r && r.ok), reason: (r && r.reason) || "" };
  };
  const r12 = await pcm12();
  check(r12.ok === false && r12.reason === "private",
    "pcm12 sharing a card from a Private catalog is refused (" + JSON.stringify(r12) + ")");
  await planted("pcm12p", "plant:pcm-share-private", "    /* plant lifted */", pcm12,
    r => r.reason !== "private", "the share is refused for some other reason, or it is sent");

  /* The page's own refusal, sliced from the modules: the shell lift does not reach these files. */
  const pageSrc = name => fs.readFileSync(path.join(ROOT, "src", "modules", name), "utf8");
  const sliceFn = (src, marker) => {
    const at = src.indexOf(marker);
    if (at < 0 || src.indexOf(marker, at + 1) > -1) throw new Error("not there exactly once: " + marker);
    for (let i = src.indexOf("{", at), depth = 0; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
    }
    throw new Error("unterminated: " + marker);
  };
  const pageLift = (file, tag, with_) => {
    const raw = pageSrc(file);
    const s = raw.split(NL).map(l => l.indexOf(tag) >= 0 ? with_ : l).join(NL);
    return s === raw ? null : s;
  };
  const withScope = own => new Proxy({}, {
    has: () => true,
    get: (o, k) => (k === Symbol.unscopables ? undefined : (k in own ? own[k] : (k in globalThis ? globalThis[k] : (() => { throw new ReferenceError(String(k) + " is not defined"); })()))),
  });
  const runWriteShared = async src => {
    const own = { sharedEditing: () => true, teamContentNow: () => ({ private: ["quay-held"] }), lyGet: () => "" };
    let writeShared;
    try {
      writeShared = new Function("scope", "with(scope){\n" + sliceFn(src, "function sharedPrivateNow(") + "\n" + sliceFn(src, "function writeShared(") + "\nreturn writeShared;\n}")(withScope(own));
    } catch (e) { return { route: "", threw: true, err: String(e && e.message || e) }; }
    try {
      const r = await writeShared(false, { id: "quay-held", pin: "sha256:" + "ab".repeat(32) }, true, "layer");
      return { route: r && r.route || "", threw: false };
    } catch (e) { return { route: "", threw: true, err: String(e && e.message || e) }; }
  };
  const SHARE_EN = "This catalog is private, so this card stays on this desk.";
  const SHARE_PL = "Ten katalog jest prywatny, więc ta karta zostaje na tym stanowisku.";
  const runSharePage = src => {
    const own = { hooks: { currentCatalog: () => ({ id: "quay-held" }) }, teamContentNow: () => ({ private: ["quay-held"] }), t: s => s };
    let api;
    try {
      api = new Function("scope", "with(scope){\n" + sliceFn(src, "function sharePrivateNow(") + "\n" + sliceFn(src, "function wholeRefusalLine(") + "\nreturn { sharePrivateNow, wholeRefusalLine };\n}")(withScope(own));
    } catch (e) { return { marked: false, line: "", err: String(e && e.message || e) }; }
    try { return { marked: api.sharePrivateNow() === true, line: api.wholeRefusalLine("private") }; }
    catch (e) { return { marked: false, line: "", err: String(e && e.message || e) }; }
  };
  const langText = pageSrc("ui-lang.js"), cardText = pageSrc("card-share.js");
  const words = langText.indexOf("/* words: placeholder */") >= 0 && langText.indexOf('"' + SHARE_EN + '":"' + SHARE_PL + '"') >= 0
    && cardText.indexOf('t("' + SHARE_EN + '")') >= 0 && cardText.indexOf("if(sharePrivateNow())") >= 0;
  const pageWrite = await runWriteShared(pageSrc("catalog-file.js"));
  check(pageWrite.route === "none" && !pageWrite.threw,
    "pcmPage writeShared of a catalog the page knows is private resolves to route none and does not write (" + JSON.stringify(pageWrite) + ")");
  if (PLANTS_OFF) skip("pcmPagep lifting plant:pcm-write-shared turns its check red");
  else {
    const lifted = pageLift("catalog-file.js", "plant:pcm-write-shared", "  on=false;");
    const red = lifted ? await runWriteShared(lifted) : null;
    check(!!red && (red.threw || red.route !== "none"),
      "pcmPagep lifting plant:pcm-write-shared turns its check red: the shared write is not refused (" + (red ? JSON.stringify(red) : "plant not found") + ")");
  }
  const pageShare = runSharePage(cardText);
  check(pageShare.marked && pageShare.line === SHARE_EN && words,
    "pcmSharePage a private catalog is refused in one line, in English and in Polish (" + JSON.stringify(pageShare) + ", words " + words + ")");
  if (PLANTS_OFF) skip("pcmSharePagep lifting plant:pcm-share-page turns its check red");
  else {
    const lifted = pageLift("card-share.js", "plant:pcm-share-page", "  marked=false;");
    const red = lifted ? runSharePage(lifted) : null;
    check(!!red && red.marked === false,
      "pcmSharePagep lifting plant:pcm-share-page turns its check red: the page still calls the catalog private (" + (red ? JSON.stringify(red) : "plant not found") + ")");
  }

  /* Holds: a told desk with a personal catalog it has not marked still names it and answers the lead's box. */
  {
    const u = await setup("pcmh");
    ask(u, "AskPcmh");
    const a = answered(u), s = inUseSeen(u);
    check(a.lead && !a.team && s.mirror && s.share, "pcmh an unmarked personal catalog on a told desk is named and answered to the lead's box (" + JSON.stringify({ a, s }) + ")");
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }
}

check(regStand.held(), "pcmr every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
