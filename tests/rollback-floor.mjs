/* A floor against going backwards, driven in bare node. Red today where the floor is missing,
 * green once a lower edition, an older team file, or a restored desk file is refused, with the
 * controls that a newer edition still lands. A fresh folder opens the highest rev the ring
 * verifies, and each mark kept in the desk file is never lowered. A second read of an older
 * desk file in the same process keeps the higher number. A key added to the share's ring does
 * not raise the catalog mark. A desk with its lead pinned chooses only that lead's editions
 * unasked, and a file the agent opens is offered whatever its rev, signer or signature.
 * Throwaway keys and catalogs only.
 *
 *     node tests/rollback-floor.mjs        exit code is the number of failed checks, capped at 63
 *
 * The shell runs from a copy of shell/ in a temp folder, so the folder above it holds no catalog
 * of the checkout's. No window variable is set. Machine policy is the stand-in in tests/reg-stand.cjs.
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
const EXPECTED = 47;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-rollback-floor-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged", "offerFile", "keepCatalogRev", "keepReadRev"];
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
    const outer = JSON.parse(fs.readFileSync(file, "utf8"));
    const onDisk = facts(outer.kind === "etiuda-sealed" ? (A.api.openSealed(K1, outer) || "") : JSON.stringify(outer));
    check(wrote && wrote.ok === true && wrote.rev === 1 && seen.rev === 1 && heldEpoch === 2
      && held(removed) && held(back) && again.rev === 1 && onDisk.rev === 1,
      "888af removed at epoch 2 with no key, then the epoch 1 file put back, the next write holds: "
      + (wrote && wrote.ok ? "wrote rev " + wrote.rev : "no first write")
      + ", colleague saw " + seen.rev + ", epoch mark " + heldEpoch
      + ", removal " + (held(removed) ? "held" : "wrote")
      + ", put back " + (held(back) ? "held" : "wrote rev " + (back && back.rev))
      + ", colleague then " + again.rev + ", on disk " + onDisk.rev);
  }

  /* ---- a stranger's signed file names another desk's file id at a huge rev ----------------------- */
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
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "888q every reg call was answered by the stand-in (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
