/* A floor against going backwards, driven in bare node. Red today where the floor is missing,
 * green once a lower edition, an older team file, or a restored desk file is refused, with the
 * controls that a newer edition still lands. Throwaway keys and catalogs only.
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
const EXPECTED = 17;

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
const EXPOSE = ["sealCatalog", "openSealed", "wrapTeamKey", "readCatalog", "catalogChanged"];
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
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (...a) => sent.push(a) } };
  return { api, ask, said, ud, envelope, sent, win };
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
