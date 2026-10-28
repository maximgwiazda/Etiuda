/* A floor against going backwards, driven in bare node. Red today where the floor is missing,
 * green once a lower edition, an older team file, or a restored desk file is refused, with the
 * controls that a newer edition still lands. A fresh folder opens the highest rev the ring
 * verifies, and each mark kept in the desk file is never lowered. A second read of an older
 * desk file in the same process keeps the higher number. A key added to the share's ring does
 * not raise the catalog mark. A desk with its lead pinned chooses only that lead's editions
 * unasked, and a file the agent opens is offered whatever its rev, signer or signature, and
 * raises a mark only once the page says the agent took it. A file opened from outside the folder
 * stays the one read, and a newer edition the lead signs after that is offered and becomes the
 * one read once the agent takes it. A team file's rev is floored per team
 * and lead key at its epoch, absent reading as 0, the floor kept across a restart; its channel is
 * kept with the team, and on the relay the only ring believed is the one inside the signed file.
 * Throwaway keys and catalogs only.
 *
 *     node tests/rollback-floor.mjs        exit code is the number of failed checks, capped at 63
 *
 * The shell runs from a copy of shell/ in a temp folder, so the folder above it holds no catalog
 * of the checkout's. Two plants still rewrite shell/main.js; the whole file runs in a scratch
 * copy of the tree, so a kill leaves the checkout as it was. No window variable is set. Machine
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
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
if (!PLANTS_OFF && process.env.ETIUDA_PLANTS_COPY !== "1") {
  const { runInPlantsCopy } = await import("./plants-tree.mjs");
  process.exit(await runInPlantsCopy(ROOT, fileURLToPath(import.meta.url), "rollback-floor"));
}
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const EXPECTED = 77;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-rollback-floor-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "offerFile", "keepCatalogRev", "keepReadRev",
  "catalogSigValid"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, src = SRC) {
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
    src + "\nreturn { " + EXPOSE.join(", ") + " };")(
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
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
  return loadDesk(ud);
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };
const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
const touch = (file, ms) => fs.utimesSync(file, ms / 1000, ms / 1000);
const held = w => !!(w && w.ok === false && w.held === true);
const epochsOf = (D, team) => Object.keys(((D.envelope().teamKeys || {})[team]) || {}).sort((a, b) => a - b).join(",") || "-";

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  const sign = (doc) => {
    const o = JSON.parse(JSON.stringify(doc));
    delete o.sig;
    o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), lead.privateKey).toString("hex");
    return o;
  };
  const textOf = doc => JSON.stringify(doc, null, 1) + "\n";
  const catalog = (rev, date) => sign({
    format: 2, kind: "etiuda-catalog", id: "quay-board", rev, name: "Quay Board", date,
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
      body: { en: "Good day, edition " + rev + "." } }],
  });
  const CAT1 = textOf(catalog(1, "2026-03-01"));
  const CAT2 = textOf(catalog(2, "2026-03-02"));
  const CAT1LATER = textOf(catalog(1, "2026-04-09"));
  const CAT1SAME = textOf(catalog(1, "2026-03-02"));
  const CAT3 = textOf(catalog(3, "2026-03-03"));
  const RING = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const teamFile = (id, epoch, roster) => textOf(sign({
    format: 1, kind: "etiuda-team", id, catalogs: ["quay-board"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch, roster,
  }));
  const entry = (D, who, key, team, epoch) => ({
    desk: { id: who.id, key: who.key, box: who.box },
    wrap: D.api.wrapTeamKey(key, who.box, team, epoch, who.id),
  });
  const readText = async (D, name, whose) => ((await D.ask("etiuda:catalog-read", name, whose)) || {}).text || "";
  const facts = text => {
    try {
      const d = JSON.parse(text);
      return { rev: d && d.rev != null ? d.rev : null, name: d && d.name || "", kind: d && d.kind || "" };
    } catch { return { rev: null, name: "", kind: "" }; }
  };
  const grown = (D, who, opened) => {
    const doc = JSON.parse(opened);
    const from = { id: doc.id, rev: doc.rev };
    const hex8 = crypto.createHash("sha256").update(String(from.id)).digest("hex").slice(0, 8);
    delete doc.sig;
    doc.id = who.id + "-" + hex8;
    doc.rev = 1;
    doc.grew = { id: from.id, rev: from.rev,
      sha: "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(opened)))).digest("hex") };
    doc.desk = { id: who.id, key: who.key, box: who.box };
    doc.name = "Quay desk";
    return { stem: "quay-" + hex8, text: JSON.stringify(doc), doc };
  };

  /* ---- a removed desk, then the older team file put back, then a newer epoch that lists it -------- */
  {
    const SHARE = folder("team");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("member", SHARE);
    const me = await D.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32), K3 = crypto.randomBytes(32);
    put(SHARE, "board.ec", JSON.stringify(D.api.sealCatalog(K1, TEAM, 1, CAT2)));
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(D, me, K1, TEAM, 1)]));
    const opened = await readText(D, "board.ec");
    const g = grown(D, me, opened);
    const write1 = await D.ask("etiuda:branch-write", g.stem, g.text);
    check(write1 && write1.ok === true && write1.rev === 1 && epochsOf(D, TEAM) === "1",
      "888a a desk the team file lists writes its own file, and keeps that epoch: "
      + (write1 && write1.ok ? "wrote rev " + write1.rev : "held") + ", epochs " + epochsOf(D, TEAM));

    put(SHARE, "etiuda-team.json", teamFile(TEAM, 2, []));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now());
    g.doc.name = "while removed";
    const writeRemoved = await D.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    check(held(writeRemoved) && epochsOf(D, TEAM) === "1",
      "888b a newer team file that leaves the desk off the roster holds the next write: "
      + (held(writeRemoved) ? "held" : "wrote") + ", epochs " + epochsOf(D, TEAM));

    put(SHARE, "etiuda-team.json", teamFile(TEAM, 3, [entry(D, me, K3, TEAM, 3)]));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 1000);
    g.doc.name = "newer epoch";
    const writeNewer = await D.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const ep3 = epochsOf(D, TEAM);
    check(writeNewer && writeNewer.ok === true && ep3.split(",").indexOf("3") >= 0,
      "888c a newer team file that lists the desk again is kept, and the write lands: "
      + (writeNewer && writeNewer.ok ? "wrote rev " + writeNewer.rev : "held") + ", epochs " + ep3);

    const oldTeam = teamFile(TEAM, 1, [entry(D, me, K1, TEAM, 1)]);
    put(SHARE, "etiuda-team.json", oldTeam);
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 2000);
    g.doc.name = "restored older";
    const writeOld = await D.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    check(held(writeOld),
      "888d putting the older team file back, after a newer epoch was accepted, holds the next write: "
      + (held(writeOld) ? "held" : "wrote rev " + (writeOld && writeOld.rev)));
  }

  /* ---- the same epoch, the roster drops the desk, no newer file ----------------------------------- */
  {
    const SHARE = folder("same");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("same", SHARE);
    const me = await D.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    const file = roster => teamFile(TEAM, 1, roster);
    put(SHARE, "board.ec", JSON.stringify(D.api.sealCatalog(K1, TEAM, 1, CAT2)));
    put(SHARE, "etiuda-team.json", file([entry(D, me, K1, TEAM, 1)]));
    const g = grown(D, me, await readText(D, "board.ec"));
    const on = await D.ask("etiuda:branch-write", g.stem, g.text);
    check(on && on.ok === true, "888e while the roster lists the desk, at that epoch, the write lands: "
      + (on && on.ok ? "wrote rev " + on.rev : "held"));
    put(SHARE, "etiuda-team.json", file([]));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now());
    g.doc.name = "dropped";
    const off = await D.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    check(held(off),
      "888f a roster that drops the desk without raising the epoch holds the next write: "
      + (held(off) ? "held" : "wrote rev " + (off && off.rev)));
  }

  /* ---- the kept keys are gone, the removal file stands, then the older file is put back ----------- */
  {
    const SHARE = folder("wrap");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("wrap", SHARE);
    const me = await D.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    const oldTeam = teamFile(TEAM, 1, [entry(D, me, K1, TEAM, 1)]);
    put(SHARE, "board.ec", JSON.stringify(D.api.sealCatalog(K1, TEAM, 1, CAT2)));
    put(SHARE, "etiuda-team.json", oldTeam);
    const opened = facts(await readText(D, "board.ec"));
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 2, []));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now());
    await readText(D, "board.ec");
    const saved = JSON.parse(fs.readFileSync(path.join(D.ud, "desk.json"), "utf8"));
    delete saved.teamKeys;
    fs.writeFileSync(path.join(D.ud, "desk.json"), JSON.stringify(saved));
    const D2 = loadDesk(D.ud);
    const under = facts(await readText(D2, "board.ec"));
    check(opened.rev === 2 && under.kind === "etiuda-sealed",
      "888g with the keys gone and the removal file standing, the sealed catalog stays sealed: opened rev "
      + opened.rev + ", then kind " + (under.kind || "-"));
    put(SHARE, "etiuda-team.json", oldTeam);
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 1000);
    const back = facts(await readText(D2, "board.ec"));
    const ep = epochsOf(D2, TEAM);
    check(back.kind === "etiuda-sealed" && ep === "-",
      "888h restoring the older team file does not open that catalog and does not keep its epoch: kind "
      + (back.kind || "-") + ", rev " + back.rev + ", epochs " + ep);
  }

  /* ---- a colleague reads a desk file whose older bytes were put back ------------------------------ */
  {
    const SHARE = folder("own");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("owner", SHARE);
    const B = newDesk("colleague", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const file = path.join(SHARE, "desks", me.id, g.stem + ".ec");
    const firstBytes = fs.readFileSync(file);
    g.doc.name = "second";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const before = facts(await readText(B, g.stem + ".ec", me.id));
    const ownerRev = Object.values(A.envelope().branchRevs || {}).indexOf(2) >= 0;
    check(before.rev === 2 && before.name === "second" && ownerRev,
      "888i before the older bytes are put back, the colleague reads the edition the owner wrote: rev "
      + before.rev + ", name " + (before.name || "-"));
    fs.writeFileSync(file, firstBytes);
    touch(file, Date.now());
    const after = facts(await readText(B, g.stem + ".ec", me.id));
    check(after.rev == null || after.rev >= 2,
      "888j after the older bytes are put back, the colleague is not handed an earlier edition than the one already read: rev "
      + after.rev + ", name " + (after.name || "-"));
  }

  /* ---- the page: a stored edition, then a lower one, a higher one, and the listing ----------------- */
  {
    const mem = new Map();
    const store = {
      getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)),
      removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
    };
    globalThis.localStorage = store;
    globalThis.sessionStorage = store;
    class El {
      constructor(tag) {
        this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.attrs = new Map();
        this.style = {}; this.hidden = false; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} };
      }
      setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); if (k === "id") this.id = String(v); }
      getAttribute(k) { return this.attrs.has(String(k).toLowerCase()) ? this.attrs.get(String(k).toLowerCase()) : null; }
      hasAttribute(k) { return this.attrs.has(String(k).toLowerCase()); }
      appendChild(n) { this.childNodes.push(n); return n; }
      insertAdjacentHTML() {}
      addEventListener() {}
      removeEventListener() {}
      focus() {}
      getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
      querySelector(sel) {
        if (sel === "#ecYes" || sel === "#ecNo") return { onclick: null, focus() {} };
        if (sel === ".ec-holds" || sel === ".tour-actions") return { insertAdjacentHTML() {} };
        return null;
      }
      querySelectorAll() { return []; }
    }
    const toast = new El("div"); toast.id = "toast";
    const body = new El("body");
    const doc = {
      body, documentElement: body, activeElement: null,
      createElement: tag => new El(tag),
      getElementById: id => {
        if (id === "toast") return toast;
        const found = [];
        const walk = n => { if (n && n.id === id) found.push(n); (n && n.childNodes || []).forEach(walk); };
        walk(body);
        return found.pop() || null;
      },
      querySelector: sel => (sel === "#toast" ? toast : null), querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
    };
    Object.assign(globalThis, {
      document: doc, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      addEventListener() {}, removeEventListener() {},
      requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 0),
      cancelAnimationFrame: id => clearTimeout(id),
      matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
    });
    globalThis.window = globalThis;
    const CAT = await import(MOD("catalog.js"));
    const OFFER = await import(MOD("catalog-offer.js"));
    const keep = c => CAT.storeCatalog(c);
    const clear = () => { const b = doc.getElementById("eCatalogOffer"); if (b) b.id = "gone-" + Math.random(); };
    const c2 = CAT.parseCatalogFile(CAT2);
    keep(c2);
    const older = OFFER.eOfferCatalog(CAT.parseCatalogFile(CAT1), "older.ec", "C:/quay", false, false, false);
    clear();
    const later = OFFER.eOfferCatalog(CAT.parseCatalogFile(CAT1LATER), "later.ec", "C:/quay", false, false, false);
    clear();
    const same = OFFER.eOfferCatalog(CAT.parseCatalogFile(CAT1SAME), "same.ec", "C:/quay", false, false, false);
    clear();
    keep(CAT.parseCatalogFile(CAT1));
    const higher = OFFER.eOfferCatalog(c2, "newer.ec", "C:/quay", false, false, false);
    clear();
    check(older === false, "888k a lower rev with an earlier edition date is not offered over the one stored: " + (older ? "offered" : "quiet"));
    check(later === false, "888l a lower rev with a later edition date is not offered over the one stored: " + (later ? "offered" : "quiet"));
    check(same === false, "888p a lower rev with the same edition date is not offered over the one stored: " + (same ? "offered" : "quiet"));
    check(higher === true, "888m a higher rev is still offered: " + (higher ? "offered" : "quiet"));

    const files = { "low.ec": CAT1, "high.ec": CAT3 };
    let listingFn = null;
    const calls = [];
    globalThis.E_HOST = {
      catalogFolder: "C:/quay",
      onCatalogFile: () => {},
      onCatalogListing: fn => { listingFn = fn; },
      readCatalogFile: name => { calls.push(String(name)); return Promise.resolve({ name: String(name), text: files[name] || "" }); },
    };
    OFFER.wireHostCatalogWatch();
    localStorage.setItem("eTourDone_v3", "1");
    localStorage.setItem("eTourInvite_v3", "1");
    keep(c2);
    const row = (rev, name, sha) => [{ name, mtime: 5, id: "quay-board", rev, sha, builtIn: false, desk: null }];
    if (listingFn) listingFn(row(1, "low.ec", "sha256:low"));
    await new Promise(r => setTimeout(r, 200));
    const lowCalls = calls.slice();
    clear();
    if (listingFn) listingFn(row(3, "high.ec", "sha256:high"));
    await new Promise(r => setTimeout(r, 200));
    const heldNow = CAT.storedCatalog() || {};
    check(!!listingFn && heldNow.id === "quay-board" && heldNow.rev === 2 && lowCalls.indexOf("low.ec") < 0,
      "888n once the tour is done, a listing row below the held rev is not read: wired " + !!listingFn
      + ", held rev " + heldNow.rev + ", reads " + (lowCalls.join(",") || "-"));
    check(calls.indexOf("high.ec") >= 0,
      "888o a listing row above the held rev is still read: reads " + (calls.join(",") || "-"));
  }

  /* ---- a fresh folder: the highest rev the ring verifies, then the offer, then a second process ---- */
  const staged = (dir) => {
    const base = Date.UTC(2026, 0, 15);
    put(dir, "older.ec", CAT2);
    put(dir, "newer.ec", CAT1);
    const loud = catalog(9, "2026-05-01");
    delete loud.sig;
    put(dir, "loud.ec", textOf(loud));
    touch(path.join(dir, "older.ec"), base);
    touch(path.join(dir, "newer.ec"), base + 60000);
    touch(path.join(dir, "loud.ec"), base + 120000);
  };
  const fileSends = (D) => D.sent.filter(a => a[0] === "etiuda:catalog-file");
  /* The lead's own slot, once the mark is one rev per signing public. A bare number is the shape this branch never stored. */
  const markOf = (D) => {
    const v = (D.envelope().catalogRevs || {})["quay-board"];
    if (v && typeof v === "object") return v[LEAD.public];
    return v;
  };
  const emptyKeys = (ud) => {
    const saved = JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
    saved.teamKeys = { "t-aabbccddeeff0011": { "1": "bm90LWEga2V5" } };
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(saved));
    delete saved.teamKeys;
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(saved));
  };
  const rewriteDesk = (D, edit) => {
    const file = path.join(D.ud, "desk.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    edit(saved);
    fs.writeFileSync(file, JSON.stringify(saved));
  };
  const rereadDesk = (D) => {
    D.sync("etiuda:desk");
    D.sync("etiuda:desk-refused-seen");
  };
  {
    const SHARE = folder("fresh");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("fresh", SHARE);
    staged(SHARE);
    const opened = facts(D.api.readCatalog() || "");
    const noted = "catalogRevs" in D.envelope();
    check(opened.rev === 2 && !noted,
      "888r a fresh desk opens the highest rev the ring verifies, not the newest file, and does not note it yet: rev "
      + opened.rev + (noted ? ", noted" : ""));
  }
  {
    const SHARE = folder("offer");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("offer", SHARE);
    staged(SHARE);
    D.api.catalogChanged(D.win);
    const first = fileSends(D).map(a => facts(a[1]).rev);
    fs.unlinkSync(path.join(SHARE, "older.ec"));
    fs.unlinkSync(path.join(SHARE, "loud.ec"));
    touch(path.join(SHARE, "newer.ec"), Date.UTC(2026, 5, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const held = facts(D.sync("etiuda:catalog") || "");
    const sentAfter = fileSends(D).length;
    check(first.length === 1 && first[0] === 2 && sentAfter === 0 && markOf(D) === 2 && held.rev === 2,
      "888s once that rev was handed on, a later file of an earlier rev is not offered and does not replace it: first "
      + (first.join(",") || "-") + ", then sends " + sentAfter + ", held rev " + held.rev + ", mark " + markOf(D));
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 6, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const higher = fileSends(D).map(a => facts(a[1]).rev);
    check(higher.length === 1 && higher[0] === 3 && markOf(D) === 3,
      "888y a higher rev is still offered, and the mark rises to it: sent " + (higher.join(",") || "-") + ", mark " + markOf(D));
  }
  {
    const SHARE = folder("second");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("second", SHARE);
    staged(SHARE);
    const first = facts(D.sync("etiuda:catalog") || "");
    fs.unlinkSync(path.join(SHARE, "older.ec"));
    touch(path.join(SHARE, "newer.ec"), Date.UTC(2026, 5, 2));
    emptyKeys(D.ud);
    const D2 = loadDesk(D.ud);
    const again = D2.sync("etiuda:catalog");
    const keysGone = !("teamKeys" in D2.envelope());
    check(first.rev === 2 && markOf(D2) === 2 && again == null && keysGone,
      "888t a second process, with teamKeys emptied, is not handed a lower rev than the one already read: first "
      + first.rev + ", then " + (again == null ? "nothing" : "rev " + facts(again).rev) + ", mark " + markOf(D2)
      + (keysGone ? "" : ", keys kept"));
  }
  {
    const SHARE = folder("named");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("named", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const got = await D.ask("etiuda:catalog-read", "newer.ec");
    const onDisk = facts(fs.readFileSync(path.join(SHARE, "newer.ec"), "utf8"));
    check(booted.rev === 2 && onDisk.rev === 1 && !!got && got.text === "" && markOf(D) === 2,
      "888u a named read of an earlier edition is not handed on once a higher rev was, and the mark stays: boot "
      + booted.rev + ", file rev " + onDisk.rev + ", handed "
      + ((got && got.text) ? "rev " + facts(got.text).rev : "nothing") + ", mark " + markOf(D));
  }
  {
    const SHARE = folder("asked");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("asked", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "newer.ec"));
    const sentAfter = fileSends(D).map(a => facts(a[1]).rev);
    check(booted.rev === 2 && sentAfter.length === 1 && sentAfter[0] === 1 && markOf(D) === 2,
      "888x a file asked for by name, of an earlier rev, is offered, and the mark stays: boot " + booted.rev
      + ", sends " + (sentAfter.join(",") || "-") + ", mark " + markOf(D));
  }
  {
    const SHARE = folder("refused");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("refused", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    fs.unlinkSync(path.join(SHARE, "older.ec"));
    touch(path.join(SHARE, "newer.ec"), Date.UTC(2026, 5, 3));
    const next = D.sync("etiuda:catalog-refused", "older.ec");
    const nextRev = next && next.json ? facts(next.json).rev : null;
    check(booted.rev === 2 && next == null && markOf(D) === 2,
      "888z refusing the file just handed does not adopt an earlier rev in its place: boot "
      + booted.rev + ", next " + (next == null ? "nothing" : "rev " + nextRev) + ", mark " + markOf(D));
  }

  /* ---- the epoch mark and the desk-file mark: a write never lowers either, and emptying teamKeys does not ---- */
  {
    const SHARE = folder("epoch-mark");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("epoch-mark", SHARE);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const seen = (desk) => (desk.envelope().teamEpochSeen || {})[TEAM];
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 4, []));
    D.api.readCatalog();
    const high = seen(D);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, []));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 5000);
    D.api.readCatalog();
    const heldEpoch = seen(D);
    emptyKeys(D.ud);
    const D2 = loadDesk(D.ud);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, []));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 9000);
    D2.api.readCatalog();
    const keysGone = !("teamKeys" in D2.envelope());
    check(high === 4 && heldEpoch === 4 && seen(D2) === 4 && keysGone,
      "888v the epoch mark is never lowered, and it survives a restart with teamKeys emptied: "
      + high + ", then " + heldEpoch + ", then " + seen(D2) + (keysGone ? "" : ", keys kept"));
  }
  {
    const SHARE = folder("revs-mark");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("revs-owner", SHARE);
    const B = newDesk("revs-reader", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const file = path.join(SHARE, "desks", me.id, g.stem + ".ec");
    const firstBytes = fs.readFileSync(file);
    g.doc.name = "second";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const handed = await B.ask("etiuda:catalog-read", g.stem + ".ec", me.id);
    const before = facts((handed && handed.text) || "");
    let id = "";
    try { id = JSON.parse(handed.text).id; } catch { id = ""; }
    const marked = (B.envelope().readRevs || {})[id];
    fs.writeFileSync(file, firstBytes);
    touch(file, Date.now());
    const after = facts(await readText(B, g.stem + ".ec", me.id));
    const markedAfter = (B.envelope().readRevs || {})[id];
    emptyKeys(B.ud);
    const emptied = JSON.parse(fs.readFileSync(path.join(B.ud, "desk.json"), "utf8"));
    const B2 = loadDesk(B.ud);
    const loaded = B2.envelope();
    const again = facts(await readText(B2, g.stem + ".ec", me.id));
    const marked2 = (B2.envelope().readRevs || {})[id];
    const stayed = !!(emptied.readRevs && emptied.readRevs[id] === 2 && !("teamKeys" in emptied)
      && loaded.readRevs && loaded.readRevs[id] === 2 && !("teamKeys" in loaded));
    check(before.rev === 2 && marked === 2 && (after.rev == null || after.rev >= 2) && markedAfter === 2
      && stayed && (again.rev == null || again.rev >= 2) && marked2 === 2,
      "888w a desk file's rev mark is never lowered, and it survives a restart with teamKeys emptied: read "
      + before.rev + ", mark " + marked + ", after " + after.rev + " / " + markedAfter
      + ", emptied " + (stayed ? "kept the mark" : "lost the mark")
      + ", restarted " + again.rev + " / " + marked2);
  }

  /* ---- a second read of an older desk file, in the same process, then the mark written again ---- */
  {
    const SHARE = folder("epoch-reread");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("epoch-reread", SHARE);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const seen = () => (D.envelope().teamEpochSeen || {})[TEAM];
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 4, []));
    D.api.readCatalog();
    const high = seen();
    rewriteDesk(D, saved => { (saved.teamEpochSeen = saved.teamEpochSeen || {})[TEAM] = 1; });
    rereadDesk(D);
    const heldEpoch = seen();
    rewriteDesk(D, saved => { (saved.teamEpochSeen = saved.teamEpochSeen || {})[TEAM] = 6; });
    rereadDesk(D);
    const raised = seen();
    check(high === 4 && heldEpoch === 4 && raised === 6,
      "888aa a second read of an older desk file does not lower the epoch mark, and a higher one still raises it: "
      + high + ", then " + heldEpoch + ", then " + raised);
  }
  {
    const SHARE = folder("revs-reread");
    const D = newDesk("revs-reread", SHARE);
    const id = "k-0123456789abcdef-0123abcd";
    D.api.keepReadRev(id, 2);
    const high = (D.envelope().readRevs || {})[id];
    rewriteDesk(D, saved => { (saved.readRevs = saved.readRevs || {})[id] = 1; });
    rereadDesk(D);
    const heldRev = (D.envelope().readRevs || {})[id];
    rewriteDesk(D, saved => { (saved.readRevs = saved.readRevs || {})[id] = 3; });
    rereadDesk(D);
    const raised = (D.envelope().readRevs || {})[id];
    check(high === 2 && heldRev === 2 && raised === 3,
      "888ab a second read of an older desk file does not lower a desk file's rev mark, and a higher one still raises it: "
      + high + ", then " + heldRev + ", then " + raised);
  }
  {
    const SHARE = folder("cat-direct");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("cat-direct", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.api.keepCatalogRev(CAT1);
    const held = markOf(D);
    check(booted.rev === 2 && held === 2,
      "888ac a lower rev handed straight to the catalog mark is not kept: boot " + booted.rev + ", mark " + held);
  }
  {
    const SHARE = folder("rev-direct");
    const D = newDesk("rev-direct", SHARE);
    const id = "k-fedcba9876543210-abcd0123";
    D.api.keepReadRev(id, 2);
    const high = (D.envelope().readRevs || {})[id];
    D.api.keepReadRev(id, 1);
    const held = (D.envelope().readRevs || {})[id];
    check(high === 2 && held === 2,
      "888ad a lower rev handed straight to a desk file's rev mark is not kept: " + high + ", then " + held);
  }
  {
    const SHARE = folder("cat-reread");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("cat-reread", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const high = markOf(D);
    rewriteDesk(D, saved => { (saved.catalogRevs = saved.catalogRevs || {})["quay-board"] = { [LEAD.public]: 1 }; });
    rereadDesk(D);
    const held = markOf(D);
    rewriteDesk(D, saved => { (saved.catalogRevs = saved.catalogRevs || {})["quay-board"] = { [LEAD.public]: 5 }; });
    rereadDesk(D);
    const raised = markOf(D);
    check(booted.rev === 2 && high === 2 && held === 2 && raised === 5,
      "888ae a second read of an older desk file does not lower the catalog mark, and a higher one still raises it: "
      + high + ", then " + held + ", then " + raised);
  }

  /* ---- removed at epoch 2 with no wrap, then the epoch 1 file put back --------------------------- */
  {
    const SHARE = folder("plain-back");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("plain-writer", SHARE);
    const B = newDesk("plain-reader", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    const listed = teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]);
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    put(SHARE, "etiuda-team.json", listed);
    const g = grown(A, me, await readText(A, "board.ec"));
    const wrote = await A.ask("etiuda:branch-write", g.stem, g.text);
    const file = path.join(SHARE, "desks", me.id, g.stem + ".ec");
    const seen = facts(await readText(B, g.stem + ".ec", me.id));
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 2, []));
    touch(path.join(SHARE, "etiuda-team.json"), Date.now());
    B.api.readCatalog();
    const heldEpoch = (B.envelope().teamEpochSeen || {})[TEAM];
    g.doc.name = "while removed";
    const removed = await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    put(SHARE, "etiuda-team.json", listed);
    touch(path.join(SHARE, "etiuda-team.json"), Date.now() + 2000);
    g.doc.name = "epoch 1 put back";
    const back = await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const again = facts(await readText(B, g.stem + ".ec", me.id));
    const askedBack = (await B.ask("etiuda:catalog-read", g.stem + ".ec", me.id, true)) || {};
    const asked = facts(askedBack.text || "");
    const outer = JSON.parse(fs.readFileSync(file, "utf8"));
    const onDisk = facts(outer.kind === "etiuda-sealed" ? (A.api.openSealed(K1, outer) || "") : JSON.stringify(outer));
    check(wrote && wrote.ok === true && wrote.rev === 1 && seen.rev === 1 && heldEpoch === 2
      && held(removed) && held(back) && again.rev === null && asked.rev === 1 && !!askedBack.notOnTeam && onDisk.rev === 1,
      "888af removed at epoch 2 with no key, then the epoch 1 file put back, the next write holds: "
      + (wrote && wrote.ok ? "wrote rev " + wrote.rev : "no first write")
      + ", colleague saw " + seen.rev + ", epoch mark " + heldEpoch
      + ", removal " + (held(removed) ? "held" : "wrote")
      + ", put back " + (held(back) ? "held" : "wrote rev " + (back && back.rev))
      + ", colleague then " + again.rev + " unasked and " + asked.rev + " asked (note " + JSON.stringify(askedBack.notOnTeam || null) + ")"
      + ", on disk " + onDisk.rev);
  }

  /* ---- a colleague's signed file names another desk's file id at a huge rev ---------------------- */
  {
    const SHARE = folder("stranger-mark");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("mark-owner", SHARE);
    const B = newDesk("mark-reader", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const first = facts(await readText(B, g.stem + ".ec", me.id));
    const ownerFileId = g.doc.id;
    const marked = (B.envelope().readRevs || {})[ownerFileId];
    g.doc.name = "second";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const pair = crypto.generateKeyPairSync("ed25519");
    const pub = pubHex(pair.publicKey);
    const strangerId = "k-" + crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16);
    // A desk on the roster, so the read reaches the mark rule and not the refusal of a desk off the roster (board 889).
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1),
      { desk: { id: strangerId, key: pub, box: "ab".repeat(32) } }]));
    const lure = {
      format: 2, kind: "etiuda-catalog", id: ownerFileId, rev: 1e15, name: "Planted quay",
      date: "2026-08-01",
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
        body: { en: "A file signed in the wrong folder." } }],
      desk: { id: strangerId, key: pub, box: "ab".repeat(32) },
    };
    lure.sig = { alg: "Ed25519", keyId: strangerId };
    lure.sig.value = crypto.sign(null, Buffer.concat([
      Buffer.from("etiuda-desk-branch\n", "utf8"), Buffer.from(V2.v2SignedBytes(lure)),
    ]), pair.privateKey).toString("hex");
    const lureDir = path.join(SHARE, "desks", strangerId);
    fs.mkdirSync(lureDir, { recursive: true });
    put(lureDir, "planted.ec", textOf(lure));
    const opened = facts(await readText(B, "planted.ec", strangerId));
    const afterLure = (B.envelope().readRevs || {})[ownerFileId];
    const real = facts(await readText(B, g.stem + ".ec", me.id));
    const afterReal = (B.envelope().readRevs || {})[ownerFileId];
    check(first.rev === 1 && marked === 1 && opened.rev === 1e15 && afterLure === 1
      && real.rev === 2 && afterReal === 2,
      "888ag a signed file in another desk's folder, naming this file at a huge rev, sets no mark: "
      + "first " + first.rev + " mark " + marked
      + ", lure rev " + opened.rev + " mark " + afterLure
      + ", then the real file " + real.rev + " mark " + afterReal);
  }

  /* ---- an unsigned file of the same catalog id, double-clicked at a huge rev --------------------- */
  {
    const SHARE = folder("unsigned-mark");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("unsigned-mark", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const huge = catalog(1e15, "2026-08-01");
    delete huge.sig;
    put(SHARE, "planted.ec", textOf(huge));
    D.api.offerFile(D.win, path.join(SHARE, "planted.ec"));
    const afterClick = markOf(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 6, 2));
    const D2 = loadDesk(D.ud);
    const again = facts(D2.sync("etiuda:catalog") || "");
    const mark3 = markOf(D2);
    put(SHARE, "fourth.ec", textOf(catalog(4, "2026-03-04")));
    touch(path.join(SHARE, "fourth.ec"), Date.UTC(2026, 7, 1));
    D2.sent.length = 0;
    D2.api.catalogChanged(D2.win);
    const sent = fileSends(D2).map(a => facts(a[1]).rev);
    check(booted.rev === 2 && afterClick === 2 && again.rev === 3 && mark3 === 3
      && sent.length === 1 && sent[0] === 4 && markOf(D2) === 4,
      "888ah an unsigned file of the same id at a huge rev, double-clicked, does not raise the catalog mark: "
      + "boot " + booted.rev + ", after the click " + afterClick
      + ", next boot " + again.rev + " mark " + mark3
      + ", watch " + (sent.join(",") || "-") + ", mark " + markOf(D2));
  }

  /* ---- an unsigned file in this desk's own folder at a huge rev ---------------------------------- */
  {
    const SHARE = folder("unsigned-rev");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("rev-owner", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    g.doc.name = "second";
    const second = await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const ownerFileId = g.doc.id;
    const savedPath = path.join(A.ud, "desk.json");
    const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    saved.branchRevs[ownerFileId] = 1;
    fs.writeFileSync(savedPath, JSON.stringify(saved));
    const A2 = loadDesk(A.ud);
    const poison = JSON.parse(JSON.stringify(g.doc));
    poison.rev = 1e15;
    poison.name = "planted high";
    delete poison.sig;
    delete poison.hash;
    const planted = path.join(SHARE, "desks", me.id, "planted.ec");
    fs.writeFileSync(planted, JSON.stringify(poison) + "\n");
    const plantedRev = JSON.parse(fs.readFileSync(planted, "utf8")).rev;
    g.doc.name = "third";
    const third = await A2.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const kept = (A2.envelope().branchRevs || {})[ownerFileId];
    check(second && second.rev === 2 && plantedRev === 1e15 && third && third.rev === 3 && kept === 3,
      "888ai a file this desk did not sign, sitting in its folder at a huge rev, does not raise the next write: "
      + "had rev " + (second && second.rev) + ", planted " + plantedRev
      + ", wrote " + (third && third.rev) + ", kept " + kept);
  }

  /* ---- a well-formed signature that does not verify, at a huge rev -------------------------------- */
  {
    const SHARE = folder("forged-mark");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("forged-mark", SHARE);
    staged(SHARE);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const forged = catalog(1e15, "2026-08-01");
    forged.sig = { alg: "Ed25519", keyId: LEAD.keyId, value: "ab".repeat(64) };
    put(SHARE, "forged.ec", textOf(forged));
    D.api.offerFile(D.win, path.join(SHARE, "forged.ec"));
    const afterForge = markOf(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 6, 2));
    const D2 = loadDesk(D.ud);
    const again = facts(D2.sync("etiuda:catalog") || "");
    const mark3 = markOf(D2);
    put(SHARE, "fourth.ec", textOf(catalog(4, "2026-03-04")));
    touch(path.join(SHARE, "fourth.ec"), Date.UTC(2026, 7, 1));
    D2.sent.length = 0;
    D2.api.catalogChanged(D2.win);
    const sent = fileSends(D2).map(a => facts(a[1]).rev);
    check(forged.sig.value.length === 128 && booted.rev === 2 && afterForge === 2 && again.rev === 3 && mark3 === 3
      && sent.length === 1 && sent[0] === 4 && markOf(D2) === 4,
      "888aj a file whose signature is well formed and does not verify, double-clicked at a huge rev, does not raise the catalog mark: "
      + "boot " + booted.rev + ", after the click " + afterForge
      + ", next boot " + again.rev + " mark " + mark3
      + ", watch " + (sent.join(",") || "-") + ", mark " + markOf(D2));
  }

  /* ---- a file in this desk's folder, signed by some other key, at a huge rev ---------------------- */
  {
    const SHARE = folder("other-key");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("other-key", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    g.doc.name = "second";
    const second = await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const ownerFileId = g.doc.id;
    const savedPath = path.join(A.ud, "desk.json");
    const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    saved.branchRevs[ownerFileId] = 1;
    fs.writeFileSync(savedPath, JSON.stringify(saved));
    const A2 = loadDesk(A.ud);
    const poison = JSON.parse(JSON.stringify(g.doc));
    poison.rev = 1e15;
    poison.name = "planted by another key";
    delete poison.hash;
    delete poison.sig;
    const pair = crypto.generateKeyPairSync("ed25519");
    const pub = pubHex(pair.publicKey);
    const strangerId = "k-" + crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16);
    poison.sig = { alg: "Ed25519", keyId: strangerId };
    poison.sig.value = crypto.sign(null, Buffer.concat([
      Buffer.from("etiuda-desk-branch\n", "utf8"), Buffer.from(V2.v2SignedBytes(poison)),
    ]), pair.privateKey).toString("hex");
    const planted = path.join(SHARE, "desks", me.id, "planted-other.ec");
    fs.writeFileSync(planted, JSON.stringify(poison) + "\n");
    const plantedDoc = JSON.parse(fs.readFileSync(planted, "utf8"));
    g.doc.name = "third";
    const third = await A2.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const kept = (A2.envelope().branchRevs || {})[ownerFileId];
    check(second && second.rev === 2 && plantedDoc.rev === 1e15 && strangerId !== me.id
      && plantedDoc.sig && plantedDoc.sig.value.length === 128 && third && third.rev === 3 && kept === 3,
      "888ak a file signed by a key other than this desk's, sitting in its folder at a huge rev, does not raise the next write: "
      + "had rev " + (second && second.rev) + ", planted " + plantedDoc.rev
      + ", wrote " + (third && third.rev) + ", kept " + kept);
  }

  /* ---- a second key added to the ring signs this catalog at a huge rev --------------------------- */
  const intrPair = crypto.generateKeyPairSync("ed25519");
  const INTR = { keyId: "quay-intruder", public: pubHex(intrPair.publicKey) };
  const intruderCat = (rev, date) => {
    const o = {
      format: 2, kind: "etiuda-catalog", id: "quay-board", rev, name: "Quay Board", date,
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
        body: { en: "Good day, edition " + rev + "." } }],
    };
    o.sig = { alg: "Ed25519", keyId: INTR.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), intrPair.privateKey).toString("hex");
    return textOf(o);
  };
  const POISON = intruderCat(1e15, "2026-08-01");
  const ringAdded = {
    format: 1, kind: "etiuda-ring",
    keys: RING.keys.concat([{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.public }]),
  };
  const sentRevs = (D) => fileSends(D).map(a => facts(a[1]).rev);
  {
    const SHARE = folder("ring-added");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("ring-added", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const markBoot = markOf(D);
    put(SHARE, "etiuda-ring.json", ringAdded);
    put(SHARE, "planted.ec", POISON);
    touch(path.join(SHARE, "planted.ec"), Date.UTC(2026, 7, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchSent = sentRevs(D);
    const markWatch = markOf(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 7, 2));
    const readThird = facts(((await D.ask("etiuda:catalog-read", "third.ec")) || {}).text || "").rev;
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "third.ec"));
    const offerThird = sentRevs(D);
    fs.unlinkSync(path.join(SHARE, "planted.ec"));
    const D2 = loadDesk(D.ud);
    D2.sent.length = 0;
    D2.api.catalogChanged(D2.win);
    const watchAgain = sentRevs(D2);
    const again = facts(D2.sync("etiuda:catalog") || "");
    const readAgain = facts(((await D2.ask("etiuda:catalog-read", "third.ec")) || {}).text || "").rev;
    D2.sent.length = 0;
    D2.api.offerFile(D2.win, path.join(SHARE, "third.ec"));
    const offerAgain = sentRevs(D2);
    check(booted.rev === 2 && markBoot === 2 && markWatch === 2
      && readThird === 3 && offerThird.length === 1 && offerThird[0] === 3
      && watchAgain.length === 1 && watchAgain[0] === 3 && again.rev === 3 && readAgain === 3
      && offerAgain.length === 1 && offerAgain[0] === 3,
      "888al a key added to the share's ring, signing the same catalog at a huge rev, does not raise the mark, and the genuine next rev still arrives: "
      + "boot " + booted.rev + " mark " + markBoot
      + ", watch sent " + (watchSent.join(",") || "-") + " mark " + markWatch
      + ", library " + readThird + ", asked " + (offerThird.join(",") || "-")
      + "; planted file removed, watch " + (watchAgain.join(",") || "-")
      + ", boot " + (again.rev == null ? "nothing" : again.rev)
      + ", library " + readAgain + ", asked " + (offerAgain.join(",") || "-"));
  }
  {
    const SHARE = folder("ring-absent");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("ring-absent", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    put(SHARE, "etiuda-ring.json", RING);
    put(SHARE, "planted.ec", POISON);
    touch(path.join(SHARE, "planted.ec"), Date.UTC(2026, 7, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchSent = sentRevs(D);
    const markWatch = markOf(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 7, 2));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchNext = sentRevs(D);
    const readThird = facts(((await D.ask("etiuda:catalog-read", "third.ec")) || {}).text || "").rev;
    check(booted.rev === 2 && markWatch === 2 && watchSent.length === 0
      && watchNext.length === 1 && watchNext[0] === 3 && markOf(D) === 3 && readThird === 3,
      "888am the same planted file, its key absent from the ring, does not raise the mark, and the genuine next rev is offered: "
      + "boot " + booted.rev + ", watch sent " + (watchSent.join(",") || "-") + " mark " + markWatch
      + ", next " + (watchNext.join(",") || "-") + " mark " + markOf(D) + ", library " + readThird);
  }
  {
    const SHARE = folder("ring-untouched");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("ring-untouched", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const ringFile = path.join(SHARE, "etiuda-ring.json");
    const before = crypto.createHash("sha256").update(fs.readFileSync(ringFile)).digest("hex");
    put(SHARE, "planted.ec", POISON);
    touch(path.join(SHARE, "planted.ec"), Date.UTC(2026, 7, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchSent = sentRevs(D);
    const markWatch = markOf(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 7, 2));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchNext = sentRevs(D);
    const readThird = facts(((await D.ask("etiuda:catalog-read", "third.ec")) || {}).text || "").rev;
    const after = crypto.createHash("sha256").update(fs.readFileSync(ringFile)).digest("hex");
    check(booted.rev === 2 && markWatch === 2 && watchSent.length === 0 && before === after
      && watchNext.length === 1 && watchNext[0] === 3 && markOf(D) === 3 && readThird === 3,
      "888an the same planted file, the ring file left byte for byte, does not raise the mark, and the genuine next rev is offered: "
      + "boot " + booted.rev + ", watch sent " + (watchSent.join(",") || "-") + " mark " + markWatch
      + ", ring " + (before === after ? "unchanged" : "rewritten")
      + ", next " + (watchNext.join(",") || "-") + " mark " + markOf(D) + ", library " + readThird);
  }

  /* ---- a lead is pinned: another key in the ring does not choose, and an open still offers it ---- */
  {
    const SHARE = folder("per-key");
    const ringBoth = {
      format: 1, kind: "etiuda-ring",
      keys: RING.keys.concat([{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.public }]),
    };
    put(SHARE, "etiuda-ring.json", ringBoth);
    const ud = path.join(LAB, "per-key");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
      kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" },
      teamPins: { "t-aabbccddeeff0011": { keyId: LEAD.keyId, public: LEAD.public } },
    }), "utf8");
    const D = loadDesk(ud);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const markBoot = markOf(D);
    put(SHARE, "planted.ec", POISON);
    touch(path.join(SHARE, "planted.ec"), Date.UTC(2026, 7, 1));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchSent = sentRevs(D);
    const markWatch = markOf(D);
    D.api.keepCatalogRev(POISON);
    const slots = (D.envelope().catalogRevs || {})["quay-board"] || {};
    put(SHARE, "low-intr.ec", intruderCat(1, "2026-08-02"));
    touch(path.join(SHARE, "low-intr.ec"), Date.UTC(2026, 7, 3));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const lowWatch = sentRevs(D);
    put(SHARE, "third.ec", CAT3);
    touch(path.join(SHARE, "third.ec"), Date.UTC(2026, 7, 4));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const highWatch = sentRevs(D);
    fs.unlinkSync(path.join(SHARE, "third.ec"));
    put(SHARE, "back.ec", CAT1);
    touch(path.join(SHARE, "back.ec"), Date.UTC(2026, 7, 5));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const putBack = sentRevs(D);
    const markBack = markOf(D);
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "planted.ec"));
    const asked = sentRevs(D);
    const afterAsk = (D.envelope().catalogRevs || {})["quay-board"] || {};
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "low-intr.ec"));
    const lowAsked = sentRevs(D);
    const slotsEnd = (D.envelope().catalogRevs || {})["quay-board"] || {};
    const askedRead = facts(((await D.ask("etiuda:catalog-read", "planted.ec", null, true)) || {}).text || "").rev;
    const quietRead = ((await D.ask("etiuda:catalog-read", "planted.ec", null, false, true)) || {}).text || "";
    check(booted.rev === 2 && markBoot === 2 && watchSent.length === 0 && markWatch === 2
      && slots[INTR.public] === 1e15 && slots[LEAD.public] === 2 && lowWatch.length === 0
      && highWatch.length === 1 && highWatch[0] === 3 && putBack.length === 0 && markBack === 3
      && asked.length === 1 && asked[0] === 1e15 && afterAsk[LEAD.public] === 3
      && lowAsked.length === 1 && lowAsked[0] === 1 && slotsEnd[LEAD.public] === 3 && slotsEnd[INTR.public] === 1e15
      && askedRead === 1e15 && quietRead === "",
      "888ao a lead is pinned, so another key's catalog is not chosen and does not move the lead's mark, and opening it still offers it: "
      + "boot " + booted.rev + " mark " + markBoot
      + ", watch " + (watchSent.join(",") || "-") + " mark " + markWatch
      + ", intruder slot " + slots[INTR.public] + ", lead slot " + slots[LEAD.public]
      + ", lower intruder watch " + (lowWatch.join(",") || "-")
      + ", genuine next " + (highWatch.join(",") || "-")
      + ", put back " + (putBack.join(",") || "-") + " mark " + markBack
      + ", opened " + (asked.join(",") || "-") + " lead " + afterAsk[LEAD.public]
      + ", lower opened " + (lowAsked.join(",") || "-")
      + ", asked read " + askedRead + ", read to offer unasked " + (quietRead ? "handed" : "nothing"));
  }
  {
    const SHARE = folder("open-any");
    put(SHARE, "etiuda-ring.json", RING);
    const ud = path.join(LAB, "open-any");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
      kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" },
      teamPins: { "t-aabbccddeeff0011": { keyId: LEAD.keyId, public: LEAD.public } },
    }), "utf8");
    const D = loadDesk(ud);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const bareDoc = catalog(4, "2026-08-03");
    delete bareDoc.sig;
    put(SHARE, "own.ec", textOf(bareDoc));
    touch(path.join(SHARE, "own.ec"), Date.UTC(2026, 7, 6));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchBare = sentRevs(D);
    const other = sign({
      format: 2, kind: "etiuda-catalog", id: "other-board", rev: 1, name: "Other Board", date: "2026-08-04",
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
        body: { en: "Good day, other board." } }],
    });
    put(SHARE, "other.ec", textOf(other));
    touch(path.join(SHARE, "other.ec"), Date.UTC(2026, 7, 7));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const watchOther = sentRevs(D);
    const markHeld = markOf(D);
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "own.ec"));
    const askedBare = sentRevs(D);
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "other.ec"));
    const askedOther = sentRevs(D);
    check(booted.rev === 2 && watchBare.length === 0 && watchOther.length === 0 && markHeld === 2
      && askedBare.length === 1 && askedBare[0] === 4
      && askedOther.length === 1 && askedOther[0] === 1 && markOf(D) === 2,
      "888ap an unsigned variant, and a catalog with another id, are not chosen on their own and are offered when opened: "
      + "boot " + booted.rev
      + ", unsigned watch " + (watchBare.join(",") || "-") + ", opened " + (askedBare.join(",") || "-")
      + ", other watch " + (watchOther.join(",") || "-") + ", opened " + (askedOther.join(",") || "-")
      + ", mark " + markOf(D));
  }

  /* ---- a lead is pinned: the boot chooses that lead's edition, and an unasked read hands nothing else ---- */
  {
    const SHARE = folder("pinned-boot");
    put(SHARE, "etiuda-ring.json", {
      format: 1, kind: "etiuda-ring",
      keys: RING.keys.concat([{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.public }]),
    });
    put(SHARE, "board.ec", CAT2);
    put(SHARE, "planted.ec", POISON);
    const bare = catalog(7, "2026-03-07");
    delete bare.sig;
    put(SHARE, "own.ec", textOf(bare));
    put(SHARE, "wrapped.ec", "window.E_CATALOG = " + POISON.trim() + ";");
    const deskIn = (name, pins) => {
      const ud = path.join(LAB, name);
      fs.mkdirSync(ud, { recursive: true });
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({
        kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }, pins ? { teamPins: pins } : {})), "utf8");
      return loadDesk(ud);
    };
    const P = deskIn("pinned-boot-desk", { "t-aabbccddeeff0011": { keyId: LEAD.keyId, public: LEAD.public } });
    const booted = facts(P.sync("etiuda:catalog") || "");
    const slots = (P.envelope().catalogRevs || {})["quay-board"] || {};
    const quiet = {}, shown = {};
    for (const n of ["planted.ec", "own.ec", "wrapped.ec"]) {
      quiet[n] = ((await P.ask("etiuda:catalog-read", n, null, false, true)) || {}).text || "";
      shown[n] = ((await P.ask("etiuda:catalog-read", n)) || {}).text || "";
    }
    const askedText = ((await P.ask("etiuda:catalog-read", "wrapped.ec", null, true)) || {}).text || "";
    const asked = facts(askedText.slice(askedText.indexOf("{"), askedText.lastIndexOf("}") + 1)).rev;
    const U = deskIn("unpinned-boot-desk", null);
    const free = facts(U.sync("etiuda:catalog") || "");
    check(booted.rev === 2 && slots[LEAD.public] === 2 && slots[INTR.public] === undefined
      && !quiet["planted.ec"] && !quiet["own.ec"] && !quiet["wrapped.ec"] && Object.keys(shown).every(n => !!shown[n])
      && asked === 1e15 && free.rev === 1e15,
      "888aq a desk with its lead pinned boots the lead's edition, not another key's higher rev or an unsigned one, and a read meant to offer them unasked hands neither: "
      + "boot " + booted.rev + ", lead slot " + slots[LEAD.public] + ", other slot " + (slots[INTR.public] === undefined ? "none" : slots[INTR.public])
      + ", to offer " + Object.keys(quiet).map(n => n + " " + (quiet[n] ? "handed" : "nothing")).join(", ")
      + ", to show " + Object.keys(shown).filter(n => shown[n]).length + " of 3 handed"
      + ", asked wrapped " + asked + "; the same folder unpinned boots " + free.rev);
  }

  /* ---- a colleague's desk file below the mark, opened on purpose ---------------------------------- */
  {
    const SHARE = folder("own-asked");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("owner-asked", SHARE);
    const B = newDesk("colleague-asked", SHARE);
    const me = await A.ask("etiuda:branch-identity", true);
    const other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const file = path.join(SHARE, "desks", me.id, g.stem + ".ec");
    const firstBytes = fs.readFileSync(file);
    g.doc.name = "second";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const before = facts(await readText(B, g.stem + ".ec", me.id));
    fs.writeFileSync(file, firstBytes);
    touch(file, Date.now());
    const quietText = await readText(B, g.stem + ".ec", me.id);
    const asked = facts(((await B.ask("etiuda:catalog-read", g.stem + ".ec", me.id, true)) || {}).text || "");
    const markAfter = (B.envelope().readRevs || {})[g.doc.id];
    const quietAgain = await readText(B, g.stem + ".ec", me.id);
    check(before.rev === 2 && !quietText && asked.rev === 1 && asked.name === "first" && markAfter === 2 && !quietAgain,
      "888ar a colleague's file below the mark is handed when the agent opens it, the mark stays, and an unasked read still gets nothing: "
      + "read " + before.rev + ", unasked " + (quietText ? "handed" : "nothing") + ", asked rev " + asked.rev + " " + (asked.name || "-")
      + ", mark " + markAfter + ", unasked again " + (quietAgain ? "handed" : "nothing"));
  }

  /* ---- an older edition opened on purpose, then the page asks again, as a reload does ----------------- */
  {
    const SHARE = folder("reopened");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("reopened", SHARE);
    put(SHARE, "board.ec", CAT2);
    put(SHARE, "back.ec", CAT1);
    touch(path.join(SHARE, "back.ec"), Date.UTC(2026, 0, 2));
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.api.offerFile(D.win, path.join(SHARE, "back.ec"));
    const again = facts(D.sync("etiuda:catalog") || "");
    check(booted.rev === 2 && again.rev === 1 && markOf(D) === 2,
      "888as an older edition the agent opened is handed again when the page asks again, and the mark stays: boot " + booted.rev
      + ", asked again " + (again.rev == null ? "nothing" : again.rev) + ", mark " + markOf(D));
  }
  {
    const SHARE = folder("script-form");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("script-form", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    put(SHARE, "wrapped-low.ec", "window.E_CATALOG = " + CAT1.trim() + ";");
    const quiet = ((await D.ask("etiuda:catalog-read", "wrapped-low.ec")) || {}).text || "";
    const askedText = ((await D.ask("etiuda:catalog-read", "wrapped-low.ec", null, true)) || {}).text || "";
    check(booted.rev === 2 && !quiet && askedText.indexOf("E_CATALOG") >= 0 && markOf(D) === 2,
      "888at a lower rev written as a script is below the mark as its document form is: boot " + booted.rev
      + ", unasked " + (quiet ? "handed" : "nothing") + ", asked " + (askedText ? "handed" : "nothing") + ", mark " + markOf(D));
  }
  {
    /* The ring in the share rewritten to list another key and not the lead's: the pin, not the ring, says whose edition it is. */
    const SHARE = folder("ring-swapped");
    put(SHARE, "etiuda-ring.json", { format: 1, kind: "etiuda-ring",
      keys: [{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.public }] });
    put(SHARE, "board.ec", CAT2);
    put(SHARE, "planted.ec", POISON);
    const ud = path.join(LAB, "ring-swapped");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" }, teamPins: { "t-aabbccddeeff0011": { keyId: LEAD.keyId, public: LEAD.public } } }), "utf8");
    const D = loadDesk(ud);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const toOffer = ((await D.ask("etiuda:catalog-read", "planted.ec", null, false, true)) || {}).text || "";
    check(booted.rev === 2 && !toOffer,
      "888au with the ring listing another key and not the lead's, a desk with its lead pinned still boots the lead's edition and does not offer the other: boot "
      + (booted.rev == null ? "nothing" : booted.rev) + ", other key to offer " + (toOffer ? "handed" : "nothing"));
  }

  /* ---- what the agent opened raises a mark only when the page says it was taken (etiuda:catalog-taken) ---- */
  const pinOf = text => "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(text)))).digest("hex");
  const marks = D => { const v = D.envelope(); return JSON.stringify([v.catalogRevs || {}, v.readRevs || {}, v.branchRevs || {}, v.teamEpochSeen || {}]); };
  {
    const SHARE = folder("declined"), AWAY = folder("declined-away");
    put(SHARE, "etiuda-ring.json", RING);
    put(AWAY, "next.ec", CAT3);
    const D = newDesk("declined", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const before = marks(D);
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(AWAY, "next.ec"));
    const offered = sentRevs(D);
    const again = facts(D.sync("etiuda:catalog") || "");
    const after = marks(D);
    const next = facts(loadDesk(D.ud).sync("etiuda:catalog") || "");
    check(booted.rev === 2 && offered.length === 1 && offered[0] === 3 && again.rev === 3 && after === before && next.rev === 2,
      "888av a higher edition opened on purpose and never taken leaves every mark as it was, and the next boot still chooses the folder's edition: boot "
      + booted.rev + ", offered " + (offered.join(",") || "-") + ", asked again " + again.rev
      + ", marks " + (after === before ? "unchanged" : "moved") + ", next boot " + (next.rev == null ? "nothing" : next.rev));
  }
  {
    const SHARE = folder("taken"), AWAY = folder("taken-away");
    put(SHARE, "etiuda-ring.json", RING);
    put(AWAY, "next.ec", CAT3);
    const D = newDesk("taken", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.api.offerFile(D.win, path.join(AWAY, "next.ec"));
    const handed = markOf(D);
    D.sync("etiuda:catalog-taken", pinOf(CAT3));
    const took = markOf(D);
    const CAT4 = textOf(catalog(4, "2026-03-04"));
    put(SHARE, "four.ec", CAT4);
    const read4 = facts(((await D.ask("etiuda:catalog-read", "four.ec", null, true)) || {}).text || "").rev;
    const read = markOf(D);
    D.sync("etiuda:catalog-taken", pinOf(CAT4));
    const took4 = markOf(D);
    fs.unlinkSync(path.join(SHARE, "four.ec"));
    const next = facts(loadDesk(D.ud).sync("etiuda:catalog") || "");
    check(booted.rev === 2 && handed === 2 && took === 3 && read4 === 4 && read === 3 && took4 === 4 && next.rev == null,
      "888aw an edition opened on purpose and taken raises the mark to that rev, from a double-click and from the Library's Load alike: boot "
      + booted.rev + ", handed " + handed + ", taken " + took + ", Load read " + read4 + " mark " + read + ", taken " + took4
      + "; the folder's older edition at the next boot " + (next.rev == null ? "not chosen" : next.rev));
  }
  {
    const SHARE = folder("forged"), AWAY = folder("forged-away");
    put(SHARE, "etiuda-ring.json", RING);
    put(AWAY, "next.ec", CAT3);
    const D = newDesk("forged", SHARE);
    put(SHARE, "board.ec", CAT2);
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.api.offerFile(D.win, path.join(AWAY, "next.ec"));
    const before = marks(D);
    const CAT5 = textOf(catalog(5, "2026-03-05")), CAT9 = textOf(catalog(9, "2026-03-09"));
    put(SHARE, "five.ec", CAT5);
    const shown = facts(((await D.ask("etiuda:catalog-read", "five.ec")) || {}).text || "").rev;
    for (const pin of [pinOf(CAT9), pinOf(CAT5), "sha256:" + "0".repeat(64), "", "not a pin"]) D.sync("etiuda:catalog-taken", pin);
    const after = marks(D);
    D.sync("etiuda:catalog-taken", pinOf(CAT3));
    const real = markOf(D);
    check(booted.rev === 2 && shown === 5 && after === before && markOf(loadDesk(D.ud)) === 3 && real === 3,
      "888ax a taken the shell never handed on purpose raises nothing, never-handed bytes and bytes only shown alike, and the edition it did hand still can be: boot "
      + booted.rev + ", shown " + shown + ", marks after five forged " + (after === before ? "unchanged" : "moved") + ", the handed one taken " + real);
  }
  {
    const SHARE = folder("colleague-taken");
    put(SHARE, "etiuda-ring.json", RING);
    const A = newDesk("owner-taken", SHARE), B = newDesk("colleague-taken", SHARE);
    const me = await A.ask("etiuda:branch-identity", true), other = await B.ask("etiuda:branch-identity", true);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex"), K1 = crypto.randomBytes(32);
    put(SHARE, "etiuda-team.json", teamFile(TEAM, 1, [entry(A, me, K1, TEAM, 1), entry(A, other, K1, TEAM, 1)]));
    put(SHARE, "board.ec", JSON.stringify(A.api.sealCatalog(K1, TEAM, 1, CAT2)));
    const g = grown(A, me, await readText(A, "board.ec"));
    g.doc.name = "first";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const askRead = async () => ((await B.ask("etiuda:catalog-read", g.stem + ".ec", me.id, true)) || {}).text || "";
    const first = await askRead();
    const markFirst = (B.envelope().readRevs || {})[g.doc.id];
    g.doc.name = "second";
    await A.ask("etiuda:branch-write", g.stem, JSON.stringify(g.doc));
    const second = await askRead();
    const markSecond = (B.envelope().readRevs || {})[g.doc.id];
    B.sync("etiuda:catalog-taken", pinOf(second));
    const took = (B.envelope().readRevs || {})[g.doc.id];
    B.sync("etiuda:catalog-taken", pinOf(first));
    const tookFirst = (B.envelope().readRevs || {})[g.doc.id];
    check(facts(first).rev === 1 && facts(second).rev === 2 && markFirst === undefined && markSecond === undefined && took === 2 && tookFirst === 2,
      "888ay a colleague's file opened on purpose raises its mark only when taken, and an older one taken after does not lower it: reads "
      + facts(first).rev + "," + facts(second).rev + ", mark after the reads " + (markSecond === undefined ? "none" : markSecond)
      + ", taken " + took + ", the first taken after " + tookFirst);
  }

  /* ---- a file the agent opened, its bytes then rewritten, and the watch ---------------- */
  {
    const SHARE = folder("nu-opened-rewritten");
    put(SHARE, "etiuda-ring.json", RING);
    put(SHARE, "board.ec", CAT2);
    const ud = path.join(LAB, "nu-opened-desk");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" }, teamPins: { "t-aabbccddeeff0011": { keyId: LEAD.keyId, public: LEAD.public } } }), "utf8");
    const D = loadDesk(ud);
    const booted = facts(D.sync("etiuda:catalog") || "").rev;
    put(SHARE, "opened.ec", CAT3);
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(SHARE, "opened.ec"));
    const handed = D.sent.filter(a => a[0] === "etiuda:catalog-file").map(a => facts(a[1]).rev);
    const variant = catalog(9, "2026-03-09");
    delete variant.sig;
    put(SHARE, "opened.ec", textOf(variant));
    D.sent.length = 0;
    D.api.catalogChanged(D.win);
    const unasked = D.sent.filter(a => a[0] === "etiuda:catalog-file").map(a => facts(a[1]).rev + (a[4] ? " asked" : " unasked"));
    const slot = ((D.envelope().catalogRevs || {})["quay-board"] || {})[LEAD.public];
    check(unasked.length === 0,
      "888az a file the agent opened, rewritten unsigned after the hand-over, is not offered unasked to a desk with its lead pinned: "
      + "boot " + booted + ", opened " + handed.join(",") + ", watch then sent " + (unasked.join(",") || "nothing") + ", lead slot " + slot);
  }

  /* ---- a file opened from outside stays the one read until the agent takes a newer lead edition, or leaves it ---- */
  const OPEN_TEAM = "t-" + crypto.randomBytes(8).toString("hex");
  const sideOf = (id, rev, name) => textOf(sign({
    format: 2, kind: "etiuda-catalog", id, rev, name, date: "2026-03-01",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
      body: { en: "Good day, " + name + ", edition " + rev + "." } }],
  }));
  const outsideDesk = (name, share) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
      kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: share, eUiLang: "en" },
      teamPins: { [OPEN_TEAM]: { keyId: LEAD.keyId, public: LEAD.public } },
    }), "utf8");
    return loadDesk(ud);
  };
  const hostOpened = D => !!(D.sync("etiuda:host") || {}).openedWith;
  const SIDE = sideOf("quay-side", 1, "Quay Side");
  const CAT5 = textOf(catalog(5, "2026-03-05"));
  const armOutside = (name) => {
    const share = folder(name + "-share"), away = folder(name + "-away");
    put(share, "etiuda-ring.json", RING);
    put(share, "etiuda-team.json", teamFile(OPEN_TEAM, 1, []));
    put(share, "board.ec", CAT2);
    put(away, "side.ec", SIDE);
    const D = outsideDesk(name, share);
    const booted = facts(D.sync("etiuda:catalog") || "");
    D.sent.length = 0;
    D.api.offerFile(D.win, path.join(away, "side.ec"));
    return { D: D, share: share, booted: booted };
  };
  const folderRead = D => {
    const read = facts(D.api.readCatalog() || "");
    return !hostOpened(D) && read.rev === 2 && read.name === "Quay Board";
  };
  {
    const other = armOutside("newer-other");
    const held = facts(other.D.api.readCatalog() || "");
    put(other.share, "five.ec", CAT5);
    other.D.sent.length = 0;
    other.D.api.catalogChanged(other.D.win);
    const sent = fileSends(other.D);
    const again = facts(other.D.api.readCatalog() || "");
    const once = sent.length === 1 && facts(sent[0][1]).rev === 5 && !sent[0][4];
    other.D.sent.length = 0;
    other.D.api.catalogChanged(other.D.win);
    const twice = fileSends(other.D).length;
    const mark = markOf(other.D);
    const sameShare = folder("newer-same"), sameAway = folder("newer-same-away");
    put(sameShare, "etiuda-ring.json", RING);
    put(sameShare, "etiuda-team.json", teamFile(OPEN_TEAM, 1, []));
    put(sameShare, "board.ec", CAT2);
    put(sameAway, "old.ec", CAT1);
    const same = outsideDesk("newer-same", sameShare);
    same.sync("etiuda:catalog");
    same.sent.length = 0;
    same.api.offerFile(same.win, path.join(sameAway, "old.ec"));
    put(sameShare, "five.ec", CAT5);
    same.sent.length = 0;
    same.api.catalogChanged(same.win);
    const sentSame = fileSends(same);
    const heldSame = facts(same.api.readCatalog() || "");
    const onceSame = sentSame.length === 1 && facts(sentSame[0][1]).rev === 5 && !sentSame[0][4];
    check(other.booted.rev === 2 && held.rev === 1 && held.name === "Quay Side" && hostOpened(other.D)
      && once && again.rev === 1 && again.name === "Quay Side" && hostOpened(other.D) && twice === 0 && mark === 5
      && onceSame && heldSame.rev === 1 && heldSame.name === "Quay Board" && hostOpened(same),
      "888bb a newer edition the lead signs after an outside file was opened is offered, and that file stays the one read: "
      + "boot " + other.booted.rev
      + ", team catalog offered " + (once ? "rev 5 unasked" : "no")
      + ", still read " + again.rev + " " + (again.name || "-")
      + (hostOpened(other.D) ? ", opened" : ", released")
      + ", second watch " + twice + ", mark " + mark
      + "; same catalog offered " + (onceSame ? "rev 5 unasked" : "no")
      + ", still read " + heldSame.rev + " " + (heldSame.name || "-")
      + (hostOpened(same) ? ", opened" : ", released"));
  }
  {
    const taken = armOutside("newer-taken");
    put(taken.share, "five.ec", CAT5);
    taken.D.sent.length = 0;
    taken.D.api.catalogChanged(taken.D.win);
    taken.D.sync("etiuda:catalog-taken", pinOf(CAT5), CAT5);
    const read = facts(taken.D.api.readCatalog() || "");
    const open = hostOpened(taken.D);
    const next = facts(loadDesk(taken.D.ud).sync("etiuda:catalog") || "");
    check(read.rev === 5 && read.name === "Quay Board" && !open && next.rev === 5,
      "888bc taking that offer reads the lead's edition, and the next boot does too: read "
      + (read.rev == null ? "nothing" : read.rev) + " " + (read.name || "-")
      + (open ? ", still opened" : ", released")
      + ", next boot " + (next.rev == null ? "nothing" : next.rev));
  }
  {
    const quiet = armOutside("newer-none");
    quiet.D.sent.length = 0;
    quiet.D.api.catalogChanged(quiet.D.win);
    const none = fileSends(quiet.D).length;
    put(quiet.share, "other.ec", sideOf("quay-other", 4, "Quay Other"));
    put(quiet.share, "intr.ec", intruderCat(7, "2026-03-07"));
    quiet.D.sent.length = 0;
    quiet.D.api.catalogChanged(quiet.D.win);
    const still = fileSends(quiet.D).length;
    const held = facts(quiet.D.api.readCatalog() || "");
    check(none === 0 && still === 0 && held.rev === 1 && held.name === "Quay Side" && hostOpened(quiet.D),
      "888bd an outside file with no newer edition the lead signed is offered nothing, nor a catalog the team file does not list, nor a file another key signed: "
      + "first watch " + none + ", then " + still
      + ", read " + held.rev + " " + (held.name || "-")
      + (hostOpened(quiet.D) ? ", opened" : ", released"));
  }
  {
    const forgotten = armOutside("leave-forget");
    await forgotten.D.ask("etiuda:team-join", "forget", OPEN_TEAM);
    const forgetOk = folderRead(forgotten.D);
    const left = armOutside("leave-leave");
    await left.D.ask("etiuda:team-join", "leave", OPEN_TEAM);
    const leaveOk = folderRead(left.D);
    const ejected = armOutside("leave-eject");
    ejected.D.sync("etiuda:desk-patch-save", JSON.stringify({ eCatalog: null }));
    const ejectOk = folderRead(ejected.D);
    const opened = armOutside("leave-open");
    await opened.D.ask("etiuda:catalog-read", "board.ec", "", true);
    opened.D.sync("etiuda:catalog-taken", pinOf(CAT2), CAT2);
    const openOk = folderRead(opened.D);
    check(forgetOk && leaveOk && ejectOk && openOk,
      "888be leaving the outside file clears it, by forget, leave, eject and opening another: "
      + (forgetOk ? "forget" : "FORGET") + " " + (leaveOk ? "leave" : "LEAVE") + " "
      + (ejectOk ? "eject" : "EJECT") + " " + (openOk ? "open" : "OPEN"));
  }

  /* ---- a bare number where the catalog mark is a table of signing keys ----------------------------- */
  {
    const SHARE = folder("bare-mark");
    put(SHARE, "etiuda-ring.json", RING);
    put(SHARE, "board.ec", CAT2);
    const ud = path.join(LAB, "bare-mark");
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" }, catalogRevs: { "quay-board": 5, "other-board": 7 } }), "utf8");
    const D = loadDesk(ud);
    const booted = facts(D.sync("etiuda:catalog") || "");
    const kept = JSON.stringify(D.envelope().catalogRevs || {});
    check(booted.rev === 2 && kept === JSON.stringify({ "quay-board": { [LEAD.public]: 2 } }),
      "888ba a bare number under a catalog id in desk.json is no mark: it floors nothing and is not carried into the envelope: boot "
      + (booted.rev == null ? "nothing" : booted.rev) + ", marks " + kept.replace(LEAD.public, "<lead>"));
  }

  /* ---- the team file's revision and its channel ------------------------------------------------- */
  const revTeam = (team, epoch, roster, more) => textOf(sign(Object.assign({
    format: 1, kind: "etiuda-team", id: team, catalogs: ["quay-board"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch, roster,
  }, more || {})));
  const member = n => ({ desk: { id: "k-" + String(n).repeat(16), key: "ab".repeat(32), box: "cd".repeat(32) } });
  const ids = (...ns) => ns.map(n => "k-" + String(n).repeat(16)).join(",");
  const rosterNow = (D, team) => (((D.envelope().teamRoster || {})[team] || {}).desks || []).join(",") || "-";
  const floorNow = (D, team) => JSON.stringify(((D.envelope().teamRevSeen || {})[team] || {})[LEAD.public] || null);
  const RT = "0123456789abcdef0123456789abcdef";
  const RELAY = { kind: "relay", rt: RT, url: "https://relay.quay.test/relay/v1" };
  const ringIntr = { format: 1, kind: "etiuda-ring",
    keys: [{ catalog: "quay-board", keyId: INTR.keyId, alg: "Ed25519", public: INTR.public }] };
  const saidSince = (D, from, ...parts) => D.said.slice(from).some(l => parts.every(p => l.indexOf(p) >= 0));
  /* A desk whose lead is pinned for TEAM before anything is read, as an invitation leaves it. */
  const pinnedDesk = (name, SHARE, team) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: SHARE, eUiLang: "en" }, teamPins: { [team]: { keyId: LEAD.keyId, public: LEAD.public } } }), "utf8");
    return loadDesk(ud);
  };
  {
    const SHARE = folder("team-rev");
    put(SHARE, "etiuda-ring.json", RING);
    const D = newDesk("team-rev", SHARE);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const at = path.join(SHARE, "etiuda-team.json");
    let t = Date.now();
    const heed = (desk, text) => { put(SHARE, "etiuda-team.json", text); t += 5000; touch(at, t); desk.api.readCatalog(); };

    heed(D, revTeam(TEAM, 1, [member(1)]));
    const a1 = rosterNow(D, TEAM);
    heed(D, revTeam(TEAM, 1, [member(2)]));
    const a2 = rosterNow(D, TEAM);
    const env = D.envelope(), bare = !("teamRevSeen" in env) && !("teamChannel" in env);
    heed(D, revTeam(TEAM, 1, [member(1), member(2)], { rev: 1 }));
    const a3 = rosterNow(D, TEAM);
    const fromA = D.said.length;
    heed(D, revTeam(TEAM, 1, [member(3)]));
    const a4 = rosterNow(D, TEAM);
    check(a1 === ids(1) && a2 === ids(2) && bare && a3 === ids(1, 2) && a4 === ids(1, 2) && saidSince(D, fromA, at, "older"),
      "900a a team file with no rev reads as rev 0: two such files at one epoch are taken in turn as before and keep no floor"
      + " or channel in desk.json, and once rev 1 is taken a file with none at that epoch is refused and said: rosters "
      + [a1, a2, a3, a4].join(" | ") + ", envelope " + (bare ? "bare" : "carries a floor or channel")
      + ", said " + saidSince(D, fromA, at, "older"));

    heed(D, revTeam(TEAM, 1, [member(1)], { rev: 3 }));
    const b1 = rosterNow(D, TEAM);
    const fromB = D.said.length;
    heed(D, revTeam(TEAM, 1, [member(1), member(2), member(3)], { rev: 2 }));
    const b2 = rosterNow(D, TEAM);
    const saidB = saidSince(D, fromB, at, "rev 2, below 3 at key number 1");
    check(b1 === ids(1) && b2 === ids(1) && saidB,
      "900b a team file with a lower rev at the same epoch is refused, its roster unused, and the desk says so: rosters "
      + b1 + " then " + b2 + ", said " + saidB);

    heed(D, revTeam(TEAM, 1, [member(2)], { rev: 4 }));
    const c1 = rosterNow(D, TEAM), f1 = floorNow(D, TEAM);
    heed(D, revTeam(TEAM, 2, [member(3)], { rev: 1 }));
    const c2 = rosterNow(D, TEAM), f2 = floorNow(D, TEAM);
    check(c1 === ids(2) && f1 === JSON.stringify({ epoch: 1, rev: 4 }) && c2 === ids(3) && f2 === JSON.stringify({ epoch: 2, rev: 1 }),
      "900c a higher rev is taken and raises the floor kept for the team and lead key, and a newer epoch starts its own: "
      + c1 + " floor " + f1 + ", then " + c2 + " floor " + f2);

    const D2 = loadDesk(D.ud);
    const fromD = D2.said.length;
    heed(D2, revTeam(TEAM, 2, [member(1)]));
    const d1 = rosterNow(D2, TEAM), fd = floorNow(D2, TEAM);
    check(d1 === ids(3) && fd === JSON.stringify({ epoch: 2, rev: 1 }) && saidSince(D2, fromD, at, "older"),
      "900d the floor survives a restart: the next process refuses a file with no rev at that epoch and says so: roster "
      + d1 + ", floor " + fd + ", said " + saidSince(D2, fromD, at, "older"));

    heed(D2, revTeam(TEAM, 2, [member(1)], { rev: 2, channel: RELAY, ring: RING }));
    const e1 = JSON.stringify((D2.envelope().teamChannel || {})[TEAM] || null);
    heed(D2, revTeam(TEAM, 2, [member(2)], { rev: 3, channel: { kind: "folder" } }));
    const e2 = JSON.stringify((D2.envelope().teamChannel || {})[TEAM] || null), e2r = rosterNow(D2, TEAM);
    check(e1 === JSON.stringify(RELAY) && e2 === "null" && e2r === ids(2),
      "900e the channel is kept with the team as its signed file names it, and a folder channel keeps none: relay "
      + e1 + ", then folder " + e2 + " with roster " + e2r);

    const fromF = D2.said.length;
    heed(D2, revTeam(TEAM, 2, [member(3)], { rev: "4" }));
    const f3 = rosterNow(D2, TEAM);
    heed(D2, revTeam(TEAM, 2, [member(3)], { rev: 5, channel: { kind: "pigeon" } }));
    const f4 = rosterNow(D2, TEAM);
    heed(D2, revTeam(TEAM, 2, [member(3)], { rev: 6, channel: { kind: "relay", rt: RT, url: "http://relay.quay.test/relay/v1" } }));
    const f5 = rosterNow(D2, TEAM);
    const saidF = D2.said.slice(fromF).filter(l => l.indexOf(at) >= 0 && l.indexOf("does not read") >= 0).length;
    check(f3 === ids(2) && f4 === ids(2) && f5 === ids(2) && saidF >= 1,
      "900f a rev that is not a whole number, a channel of another kind and a relay not on https are each refused and said: rosters "
      + [f3, f4, f5].join(" | ") + ", lines " + saidF);

    const fromM = D2.said.length;
    heed(D2, revTeam(TEAM, 1, [member(1)], { rev: 9 }));
    const mRoster = rosterNow(D2, TEAM), mFloor = floorNow(D2, TEAM);
    const saidM = saidSince(D2, fromM, at, "key number 1, below 2");
    check(mRoster === ids(2) && mFloor === JSON.stringify({ epoch: 2, rev: 3 }) && saidM,
      "900m a team file of an older epoch than the floor is refused, its roster unused, and the desk says the key number is below: roster "
      + mRoster + ", floor " + mFloor + ", said " + saidM);

    heed(D2, revTeam(TEAM, 3, [member(4)], { rev: 1 }));
    const nRoster = rosterNow(D2, TEAM), nFloor = floorNow(D2, TEAM);
    check(nRoster === ids(4) && nFloor === JSON.stringify({ epoch: 3, rev: 1 }),
      "900n a newer epoch is still taken and raises the floor: roster " + nRoster + ", floor " + nFloor);
  }
  /* plant:epoch-rev. Deleting that line, leaving the file valid script, lets a lower epoch through the floor. A lower
     rev at the same epoch is still refused. The desk this file already loaded keeps the copy it started with. */
  {
    if (PLANTS_OFF) {
      skip("900p lifting plant:epoch-rev lets a lower epoch through, the same-epoch floor still refuses, and the file is put back");
    } else {
      const src = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(src);
      const digest = crypto.createHash("sha256").update(before).digest("hex");
      let turned = false, detail = "plant line absent";
      try {
        const lines = before.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:epoch-rev") >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          const text = lines.join("\n");
          const start = text.indexOf("function teamRevRefused");
          const end = text.indexOf("function rosterIdsOf");
          const fn = new Function(text.slice(start, end) + "\nreturn teamRevRefused;")();
          const lower = fn({ epoch: 2, rev: 3 }, 1, 9);
          const sameEpoch = fn({ epoch: 2, rev: 3 }, 2, 1);
          turned = lower === false && sameEpoch === true;
          detail = "lower epoch refused " + lower + ", same epoch lower rev refused " + sameEpoch;
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const restored = crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex") === digest;
      check(turned && restored,
        "900p lifting plant:epoch-rev lets a lower epoch through, the same-epoch floor still refuses, and the file is put back: "
        + detail + ", sha " + (restored ? "restored" : "differs"));
    }
  }
  /* Board 931 (6): a lead-signed team file at a newer epoch with no rev raises the floor to that epoch at rev 0 and does
     not delete it, so an older epoch put back on the share is still refused. With no floor kept, a file with no rev
     still keeps none (900a). */
  const risen = (name, load) => {
    const SHARE = folder(name);
    put(SHARE, "etiuda-ring.json", RING);
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"),
      JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
    const D = load(ud);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const at = path.join(SHARE, "etiuda-team.json");
    let t = Date.now();
    const heed = (desk, text) => { put(SHARE, "etiuda-team.json", text); t += 5000; touch(at, t); desk.api.readCatalog(); };
    heed(D, revTeam(TEAM, 1, [member(1)], { rev: 3 }));
    const was = floorNow(D, TEAM);
    heed(D, revTeam(TEAM, 2, [member(2)]));
    const raised = floorNow(D, TEAM), rosterRaised = rosterNow(D, TEAM);
    const from = D.said.length;
    heed(D, revTeam(TEAM, 1, [member(1)]));
    const back = rosterNow(D, TEAM), saidBack = saidSince(D, from, at, "key number 1, below 2");
    return { D, TEAM, heed, at, load, was, raised, rosterRaised, back, saidBack };
  };
  {
    const R = risen("floor-raise", ud => loadDesk(ud));
    check(R.was === JSON.stringify({ epoch: 1, rev: 3 }) && R.raised === JSON.stringify({ epoch: 2, rev: 0 })
      && R.rosterRaised === ids(2),
      "931a a lead-signed team file at a newer epoch with no rev is taken and raises the floor to that epoch at rev 0, and does"
      + " not delete it: floor " + R.was + " then " + R.raised + ", roster " + R.rosterRaised);
    check(R.back === ids(2) && R.saidBack,
      "931b the epoch 1 file put back after that is not taken, its roster unused, and the desk says the key number is below: roster "
      + R.back + ", said " + R.saidBack);

    const D2 = loadDesk(R.D.ud);
    const fromR = D2.said.length;
    R.heed(D2, revTeam(R.TEAM, 1, [member(1)], { rev: 9 }));
    const rosterBack = rosterNow(D2, R.TEAM), floorBack = floorNow(D2, R.TEAM), saidBelow = saidSince(D2, fromR, R.at, "key number 1, below 2");
    check(rosterBack === ids(2) && floorBack === JSON.stringify({ epoch: 2, rev: 0 }) && saidBelow,
      "931c a floor at rev 0 survives a restart: the next process refuses an epoch 1 file, whatever its rev, and keeps the floor: roster "
      + rosterBack + ", floor " + floorBack + ", said " + saidBelow);

    R.heed(D2, revTeam(R.TEAM, 2, [member(3)], { rev: 1 }));
    const u1 = rosterNow(D2, R.TEAM), fu = floorNow(D2, R.TEAM);
    check(u1 === ids(3) && fu === JSON.stringify({ epoch: 2, rev: 1 }),
      "931d a file at that epoch with a rev is taken and raises the floor from rev 0 as before: roster " + u1 + ", floor " + fu);

    const SHARE = folder("floor-none");
    put(SHARE, "etiuda-ring.json", RING);
    const D3 = newDesk("floor-none", SHARE), TEAM3 = "t-" + crypto.randomBytes(8).toString("hex");
    const at3 = path.join(SHARE, "etiuda-team.json");
    put(SHARE, "etiuda-team.json", revTeam(TEAM3, 2, [member(1)]));
    touch(at3, Date.now() + 5000);
    D3.api.readCatalog();
    const kept3 = floorNow(D3, TEAM3), roster3 = rosterNow(D3, TEAM3);
    check(kept3 === "null" && roster3 === ids(1),
      "931e a team file with no rev and no floor kept is taken and keeps no floor, as before: roster " + roster3 + ", floor " + kept3);
  }
  /* plant:floor-raise. Lifting the tagged line in shell/main.js, leaving the file valid script, brings back the delete: the
     floor is then deleted again and the epoch 1 file put back is not refused at it (its roster stays out either way, by the
     epoch seen). The file is put back by sha256. */
  {
    if (PLANTS_OFF) {
      skip("931p lifting plant:floor-raise deletes the floor again, so the epoch 1 file is no longer refused at it, and the file is put back");
    } else {
      const src = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(src);
      const digest = crypto.createHash("sha256").update(before).digest("hex");
      let turned = false, detail = "plant line absent";
      try {
        const lines = before.toString("utf8").split(/\n/);
        const at = lines.findIndex(l => l.indexOf("plant:floor-raise") >= 0);
        if (at >= 0) {
          lines.splice(at, 1);
          const lifted = lines.join("\n");
          const R = risen("floor-raise-lifted", ud => loadDesk(ud, lifted));
          turned = R.raised === "null" && !R.saidBack;
          detail = "floor " + R.raised + ", epoch 1 file put back gives roster " + R.back + ", said below " + R.saidBack;
        }
      } catch (e) {
        detail = e && e.message ? e.message : String(e);
      }
      const restored = crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex") === digest;
      check(turned && restored,
        "931p lifting plant:floor-raise deletes the floor again, so the epoch 1 file is no longer refused at it, and the file is put back: "
        + detail + ", sha " + (restored ? "restored" : "differs"));
    }
  }
  {
    const SHARE = folder("relay-ring");
    put(SHARE, "etiuda-ring.json", ringIntr);
    const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
    const D = pinnedDesk("relay-ring", SHARE, TEAM);
    const at = path.join(SHARE, "etiuda-team.json");
    let t = Date.now();
    const heed = (desk, text) => { put(SHARE, "etiuda-team.json", text); t += 5000; touch(at, t); desk.api.readCatalog(); };
    const leadDoc = JSON.parse(CAT2), intrDoc = JSON.parse(intruderCat(5, "2026-08-05"));
    const ringKeys = async desk => {
      const text = (await desk.ask("etiuda:catalog-ring")) || "";
      try { return JSON.parse(text).keys.map(k => k.keyId).join(",") || "-"; } catch { return text ? "?" : "none"; }
    };
    const believes = async desk => [desk.api.catalogSigValid(leadDoc) === LEAD.public ? "lead" : "-",
      desk.api.catalogSigValid(intrDoc) === INTR.public ? "intruder" : "-", await ringKeys(desk)].join("/");

    heed(D, revTeam(TEAM, 1, [], { rev: 1, channel: RELAY, ring: RING }));
    const g1 = await believes(D);
    heed(D, revTeam(TEAM, 1, [], { rev: 2, channel: RELAY }));
    const g2 = await believes(D);
    heed(D, revTeam(TEAM, 1, [], { rev: 3 }));
    const g3 = await believes(D);
    check(g1 === "lead/-/" + LEAD.keyId && g2 === "-/-/none" && g3 === "-/intruder/" + INTR.keyId,
      "900g on the relay the ring is the one inside the signed team file and etiuda-ring.json is not read even where it names a key,"
      + " no ring in the file is no ring, and a folder channel reads etiuda-ring.json as before (catalog signer and the page's ring): "
      + [g1, g2, g3].join(" | "));

    const current = revTeam(TEAM, 1, [], { rev: 4, channel: RELAY, ring: RING });
    heed(D, current);
    const h1 = await believes(D);
    const D2 = loadDesk(D.ud);
    const fromH = D2.said.length;
    heed(D2, revTeam(TEAM, 1, [], { rev: 2, channel: RELAY, ring: ringIntr }));
    const h2 = await believes(D2);
    check(h1 === "lead/-/" + LEAD.keyId && h2 === "-/-/none" && saidSince(D2, fromH, at, "older"),
      "900h after a restart on the relay, with only a refused older team file to read, no ring is believed, signed or not: "
      + h1 + ", then " + h2 + ", said " + saidSince(D2, fromH, at, "older"));

    const D3 = loadDesk(D.ud);
    const fromJ = D3.said.length;
    heed(D3, current);
    const j1 = await believes(D3), fj = floorNow(D3, TEAM), saidJ = saidSince(D3, fromJ, at, "older");
    check(j1 === "lead/-/" + LEAD.keyId && fj === JSON.stringify({ epoch: 1, rev: 4 }) && !saidJ,
      "900j after a restart on the relay, the same team file at a rev equal to the floor is heeded, its signed ring believed,"
      + " and nothing is said to be older: " + j1 + ", floor " + fj + ", said older " + saidJ);

    const kept = JSON.stringify((D3.envelope().teamChannel || {})[TEAM] || null);
    await D3.ask("etiuda:team-join", "leave", TEAM);
    const left = D3.envelope(), gone = !((left.teamChannel || {})[TEAM]) && !((left.teamPins || {})[TEAM]);
    check(kept === JSON.stringify(RELAY) && gone && floorNow(D3, TEAM) === JSON.stringify({ epoch: 1, rev: 4 }),
      "900k Leave this team keeps no channel for the team in desk.json, and its floor stays: channel before " + kept
      + ", after " + JSON.stringify((left.teamChannel || {})[TEAM] || null) + ", floor " + floorNow(D3, TEAM));
  }
  {
    const pinOf = (name, ring, more) => {
      const SHARE = folder(name);
      if (ring) put(SHARE, "etiuda-ring.json", ring);
      const D = newDesk(name, SHARE);
      const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
      put(SHARE, "etiuda-team.json", revTeam(TEAM, 1, [], Object.assign({ rev: 1 }, more)));
      D.api.readCatalog();
      return ((D.envelope().teamPins || {})[TEAM] || {}).public === LEAD.public ? "pinned" : "not pinned";
    };
    const relayFileRing = pinOf("first-relay", RING, { channel: RELAY });
    const folderFileRing = pinOf("first-folder", RING, { channel: { kind: "folder" } });
    const relaySigned = pinOf("first-signed", null, { channel: RELAY, ring: RING });
    check(relayFileRing === "not pinned" && folderFileRing === "pinned" && relaySigned === "not pinned",
      "900i a first pin with no invitation: on the relay etiuda-ring.json vouches for nothing and neither does the signed file's own"
      + " ring, while on the folder the ring file vouches as before; the third arm, the relay's first step's allowance, is"
      + " inverted by its fourth (board 907): " + [relayFileRing, folderFileRing, relaySigned].join(" | "));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "888q every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)" + (skipped ? ", " + skipped + " skipped" : ""));
process.exit(Math.min(failed, 63));
