/* A colleague's desk file is handed only where its desk is on the team, driven in bare node. Board 889.
 *
 *     node tests/desk-roster.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CRITERION. On a desk that belongs to a team, a desk file in the shared folder is listed, offered or opened for a
 * colleague only when its signer is a member the colleague's team file admits, on the roster at the epoch the colleague
 * has accepted. A removed member's file, a file signed by a key the roster never held, and a file from a desk whose
 * membership predates a removal are not handed where nobody asked. Opened on purpose (the Library's Load, `asked`), such
 * a file is offered with an honest note that its writer is not on the team, and never handed unasked (Claude alpha's
 * ruling, channel entry 238, 2026-10-13 22:07, under Maxim's 15:51: "Etiuda is meant to empower and enhance, not limit
 * and cage."). A desk with no team keeps today's behaviour.
 *
 * THE NOTE'S CONTRACT, which these checks fix so the fix has one shape to meet: the shell's answer to an asked
 * etiuda:catalog-read of such a file is {name, text, notOnTeam}, notOnTeam a non-empty string saying why ("removed" for a
 * desk the roster held at an earlier epoch, "never" for a key no roster held, or words of the builder's own), and the
 * page's host bridge (src/modules/host.js eReadCatalogFile) carries it through. A file of a current member, and every
 * file read on a desk with no team, is answered {name, text} exactly, as today.
 *
 * WHERE A COLLEAGUE RECEIVES DESK-FILE TEXT, each with a check: the listing asked for (etiuda:catalog-files), the
 * listing sent when the folder or desks/ changes (etiuda:catalog-listing, through catalogChanged), the read nobody asked
 * for (etiuda:catalog-read with a desk, as src/modules/desk-look.js makes it), the read the agent asked for (the
 * Library's Load, src/modules/catalog-offer.js loadCatalogFromFolder), and the bridge that read crosses to the page.
 *
 * Red until the fix lands, which is why tests/engine-selftest.js 31a names this file instead of a chain. The shell runs
 * from a copy of shell/ in a temp folder. Throwaway keys, teams and catalogs only. No window variable is set. Machine
 * policy is the stand-in in tests/reg-stand.cjs.
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
const EXPECTED = 18;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-roster-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "catalogChanged", "branchSignedBytes", "branchIdOf", "branchSign", "channelHash"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud) {
  const said = [], on = {}, invoke = {};
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
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  const envFile = path.join(ud, "desk.json");
  return { api, ask, on, invoke, said, ud, envFile, sent, win };
}
function newDesk(name, dir) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: dir, eUiLang: "en" } }), "utf8");
  return loadDesk(ud);
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };
const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
let clock = Date.now();
const touch = file => { clock += 5000; fs.utimesSync(file, clock / 1000, clock / 1000); };

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "roster-lead", public: pubHex(lead.publicKey) };
  const sign = doc => {
    const o = JSON.parse(JSON.stringify(doc));
    delete o.sig;
    o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), lead.privateKey).toString("hex");
    return o;
  };
  const textOf = doc => JSON.stringify(doc, null, 1) + "\n";
  const CAT = textOf(sign({
    format: 2, kind: "etiuda-catalog", id: "roster-board", rev: 1, name: "Roster Board", date: "2026-03-01",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm" }, body: { en: "Good day, invented." } }],
  }));
  const RING = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "roster-board", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
  const teamFile = (epoch, roster) => textOf(sign({
    format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["roster-board"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch, roster,
  }));
  const entry = (D, who, key, epoch) => ({ desk: { id: who.id, key: who.key, box: who.box }, wrap: D.api.wrapTeamKey(key, who.box, TEAM, epoch, who.id) });
  const facts = t => { try { const d = JSON.parse(t); return { rev: d.rev, name: d.name || "" }; } catch { return { rev: null, name: "" }; } };
  const hex8 = crypto.createHash("sha256").update("roster-board").digest("hex").slice(0, 8);
  const grown = (who, opened, name) => {
    const doc = JSON.parse(opened), from = { id: doc.id, rev: doc.rev };
    delete doc.sig;
    doc.id = who.id + "-" + hex8; doc.rev = 1;
    doc.grew = { id: from.id, rev: from.rev, sha: "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(opened)))).digest("hex") };
    doc.desk = { id: who.id, key: who.key, box: who.box }; doc.name = name;
    return { stem: "roster-" + hex8, doc };
  };
  const FILE = "roster-" + hex8 + ".ec";
  const rowsOf = rows => (rows || []).filter(r => r && r.desk).map(r => r.desk.id + "/" + r.name + "@" + r.rev);
  const lists = async (D, id) => rowsOf(await D.ask("etiuda:catalog-files")).filter(r => r.indexOf(id + "/") === 0);
  const unasked = async (D, id, name) => (await D.ask("etiuda:catalog-read", name || FILE, id)) || {};
  const askedRead = async (D, id, name) => (await D.ask("etiuda:catalog-read", name || FILE, id, true)) || {};
  const exactly = got => JSON.stringify(Object.keys(got).sort()) === JSON.stringify(["name", "text"]);
  const noted = got => !!got.text && typeof got.notOnTeam === "string" && got.notOnTeam !== "";
  const saidOf = (D, from, name) => D.said.slice(from).some(l => l.indexOf(name) >= 0);
  const heed = async D => { await D.ask("etiuda:catalog-read", "board.ec"); };

  /* ---- a team of three at epoch 1: the author, the colleague, and the desk later removed -------------------- */
  const SHARE = folder("share");
  put(SHARE, "etiuda-ring.json", RING);
  const A = newDesk("author", SHARE), C = newDesk("colleague", SHARE), R = newDesk("removed", SHARE);
  const a = await A.ask("etiuda:branch-identity", true), c = await C.ask("etiuda:branch-identity", true),
    r = await R.ask("etiuda:branch-identity", true);
  const K1 = crypto.randomBytes(32), K2 = crypto.randomBytes(32), K3 = crypto.randomBytes(32);
  put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT)));
  const team1 = teamFile(1, [entry(A, a, K1, 1), entry(A, c, K1, 1), entry(A, r, K1, 1)]);
  put(SHARE, "etiuda-team.json", team1);
  const opened = ((await A.ask("etiuda:catalog-read", "board.ec")) || {}).text || "";
  const ga = grown(a, opened, "author one"), gr = grown(r, opened, "removed, written while a member");
  const wa1 = await A.ask("etiuda:branch-write", ga.stem, JSON.stringify(ga.doc));
  await heed(R);
  const wr1 = await R.ask("etiuda:branch-write", gr.stem, JSON.stringify(gr.doc));
  await heed(C);

  /* A key no roster ever held: its own folder under desks/, its own signature, a plain file of its own id. */
  const sk = crypto.generateKeyPairSync("ed25519"), spub = pubHex(sk.publicKey), sid = C.api.branchIdOf(spub);
  const strangerText = (() => {
    const d = JSON.parse(JSON.stringify(ga.doc));
    d.id = sid + "-" + hex8; d.rev = 1; d.name = "a stranger";
    d.desk = { id: sid, key: spub, box: crypto.randomBytes(32).toString("hex") };
    d.hash = C.api.channelHash(d);
    d.sig = { alg: "Ed25519", keyId: sid };
    d.sig.value = crypto.sign(null, C.api.branchSignedBytes(d), sk.privateKey).toString("hex");
    return JSON.stringify(d, null, 1) + "\n";
  })();
  fs.mkdirSync(path.join(SHARE, "desks", sid), { recursive: true });
  put(path.join(SHARE, "desks", sid), FILE, strangerText);

  check(wa1 && wa1.ok === true && (await lists(C, a.id)).length === 1,
    "889a THE CONTROL: while the team lists the author, the colleague lists the author's file: " + (await lists(C, a.id)).join(",")
    + " (author wrote " + JSON.stringify(wa1) + ", the desk later removed wrote " + JSON.stringify(wr1) + ")");
  const ra1 = facts((await unasked(C, a.id)).text);
  check(ra1.rev === 1 && ra1.name === "author one",
    "889b THE CONTROL: the colleague is handed a current member's file where nobody asked: rev " + ra1.rev + ", name " + (ra1.name || "-"));

  /* ---- epoch 2 removes the third desk; the colleague accepts it --------------------------------------------- */
  const team2 = teamFile(2, [entry(A, a, K2, 2), entry(A, c, K2, 2)]);
  put(SHARE, "etiuda-team.json", team2); touch(path.join(SHARE, "etiuda-team.json"));
  await heed(C); await heed(A);
  ga.doc.name = "author two";
  const wa2 = await A.ask("etiuda:branch-write", ga.stem, JSON.stringify(ga.doc));
  const ra2 = facts((await unasked(C, a.id)).text);
  check(ra2.rev === 2 && ra2.name === "author two",
    "889c THE CONTROL: the colleague still reads a member's newer edit after the removal: wrote " + JSON.stringify(wa2)
    + ", read rev " + ra2.rev + ", name " + (ra2.name || "-"));
  const aa = await askedRead(C, a.id);
  check(!!aa.text && exactly(aa),
    "889d THE CONTROL: a current member's file opened on purpose is answered {name, text} with no note: keys "
    + Object.keys(aa).sort().join(","));

  check((await lists(C, r.id)).length === 0,
    "889e a file the removed desk wrote while still a member is not listed once the colleague accepted the removal: "
    + ((await lists(C, r.id)).join(",") || "not listed"));
  const before = C.said.length, rr = await unasked(C, r.id);
  check(!rr.text && saidOf(C, before, FILE),
    "889f nor is it handed where nobody asked, and the desk says so: rev " + facts(rr.text || "").rev
    + ", a line naming the file " + (saidOf(C, before, FILE) ? "yes" : "no"));

  /* The removed desk's own edit after the removal, made by a build that skips the writer's check: its own key, the old
     epoch's seal, a higher rev. */
  {
    const fileR = path.join(SHARE, "desks", r.id, FILE);
    const env = JSON.parse(fs.readFileSync(fileR, "utf8"));
    const inner = JSON.parse(C.api.openSealed(K1, env));
    inner.rev = 2; inner.name = "removed, written after the removal"; delete inner.sig;
    inner.hash = R.api.channelHash(inner);
    inner.sig = { alg: "Ed25519", keyId: r.id };
    inner.sig.value = R.api.branchSign(inner);
    put(path.join(SHARE, "desks", r.id), FILE, JSON.stringify(R.api.sealCatalog(K1, TEAM, 1, JSON.stringify(inner, null, 1) + "\n"), null, 1) + "\n");
    touch(fileR);
  }
  const after = await unasked(C, r.id), afterRows = await lists(C, r.id);
  check(!after.text && afterRows.length === 0,
    "889g the removed desk's edit after the removal, sealed under the old epoch's key it kept, is neither listed nor handed: "
    + (afterRows.join(",") || "not listed") + ", handed rev " + facts(after.text || "").rev);
  const ar = await askedRead(C, r.id);
  check(noted(ar) && facts(ar.text).rev === 2,
    "889h opened on purpose, the removed desk's file is offered with the note that its writer is no longer on the team: rev "
    + facts(ar.text || "").rev + ", note " + JSON.stringify(ar.notOnTeam === undefined ? null : ar.notOnTeam));

  check((await lists(C, sid)).length === 0,
    "889i a file signed by a key no roster held is not listed: " + ((await lists(C, sid)).join(",") || "not listed"));
  const before2 = C.said.length, rs = await unasked(C, sid);
  check(!rs.text && saidOf(C, before2, FILE),
    "889j nor handed where nobody asked, and the desk says so: rev " + facts(rs.text || "").rev
    + ", a line naming the file " + (saidOf(C, before2, FILE) ? "yes" : "no"));
  const as = await askedRead(C, sid);
  check(noted(as),
    "889k opened on purpose, a file under a key no roster held is offered with the note that its writer is not on the team: note "
    + JSON.stringify(as.notOnTeam === undefined ? null : as.notOnTeam));

  /* The listing the shell SENDS when the folder or desks/ changes. */
  C.sent.length = 0;
  C.api.catalogChanged(C.win);
  const pushed = C.sent.filter(s => s[0] === "etiuda:catalog-listing").map(s => rowsOf(s[1])).pop() || [];
  check(pushed.some(x => x.indexOf(a.id + "/") === 0) && !pushed.some(x => x.indexOf(r.id + "/") === 0 || x.indexOf(sid + "/") === 0),
    "889l the listing the shell sends on a change carries the member's file and neither the removed desk's nor the stranger's: "
    + (pushed.map(x => x.split("/")[0] === a.id ? "member" : x.split("/")[0] === r.id ? "removed" : x.split("/")[0] === sid ? "stranger" : "other").join(",") || "nothing sent"));

  /* ---- the epoch 1 team file put back: the colleague has accepted epoch 2, and the restored roster does not re-admit */
  put(SHARE, "etiuda-team.json", team1); touch(path.join(SHARE, "etiuda-team.json"));
  await heed(C);
  const back = await lists(C, r.id), backRead = await unasked(C, r.id);
  check(back.length === 0 && !backRead.text && (await lists(C, a.id)).length === 1,
    "889m with the epoch 1 team file put back, the removed desk is still not listed or handed, and the member still is: "
    + (back.join(",") || "not listed") + ", handed rev " + facts(backRead.text || "").rev);
  const C2 = loadDesk(C.ud);
  const back2 = await lists(C2, r.id), back2Read = await unasked(C2, r.id);
  check(back2.length === 0 && !back2Read.text,
    "889n and so after a restart, the epoch 1 file still in place: " + (back2.join(",") || "not listed")
    + ", handed rev " + facts(back2Read.text || "").rev);

  /* ---- let in again at epoch 3: its files are handed again ----------------------------------------------- */
  put(SHARE, "etiuda-team.json", teamFile(3, [entry(A, a, K3, 3), entry(A, c, K3, 3), entry(A, r, K3, 3)]));
  touch(path.join(SHARE, "etiuda-team.json"));
  await heed(C2);
  const again = await lists(C2, r.id), againRead = facts((await unasked(C2, r.id)).text || "");
  check(again.length === 1 && againRead.rev === 2,
    "889o THE CONTROL: a desk the team lets in again at a newer epoch is listed and handed again: "
    + (again.join(",") || "not listed") + ", rev " + againRead.rev);

  /* ---- the page's bridge: the note crosses src/modules/host.js to the page ------------------------------- */
  {
    const ipcRenderer = {
      sendSync: (ch) => (ch === "etiuda:host" ? { platform: "win32", backdrop: null, deskFile: C2.envFile, home: C2.ud } : null),
      send: noop,
      invoke: (ch, ...args) => new Promise(res => setImmediate(() => res(C2.invoke[ch] ? C2.invoke[ch](eventFor(), ...args) : undefined))),
      on: noop,
    };
    globalThis.window = { addEventListener: noop, removeEventListener: noop };
    globalThis.document = { visibilityState: "visible", addEventListener: noop, removeEventListener: noop };
    const contextBridge = { exposeInMainWorld: (k, v) => { window[k] = v; }, executeInMainWorld: noop };
    new Function("require", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(
      n => (n === "electron" ? { contextBridge, ipcRenderer } : nodeRequire(n)));
    const H = await import(MOD("host.js"));
    const viaPage = (await H.eReadCatalogFile(FILE, sid, true)) || {};
    check(!!viaPage.text && typeof viaPage.notOnTeam === "string" && viaPage.notOnTeam !== "",
      "889p the note reaches the page: the Library's Load of the stranger's file through the preload and host.js answers keys "
      + Object.keys(viaPage).sort().join(",") + ", note " + JSON.stringify(viaPage.notOnTeam === undefined ? null : viaPage.notOnTeam));
  }

  /* ---- a desk with no team: unchanged ---------------------------------------------------------------- */
  {
    const LONE = folder("lone");
    put(LONE, "board.ec", CAT);
    fs.mkdirSync(path.join(LONE, "desks", sid), { recursive: true });
    put(path.join(LONE, "desks", sid), FILE, strangerText);
    const N = newDesk("no-team", LONE);
    await N.ask("etiuda:branch-identity", true);
    const nl = await lists(N, sid), nu = await unasked(N, sid), na = await askedRead(N, sid);
    check(nl.length === 1 && facts(nu.text || "").name === "a stranger" && exactly(nu) && !!na.text && exactly(na),
      "889q THE CONTROL: a desk with no team lists and hands any desk's genuine file as today, answered {name, text}: listed "
      + nl.length + ", unasked keys " + Object.keys(nu).sort().join(",") + ", asked keys " + Object.keys(na).sort().join(","));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "889r every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
