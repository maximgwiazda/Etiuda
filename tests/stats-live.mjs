/* Statistics stay live: a signed span at the team folder's root, and one sealed answer under desks/<id>/stats.estat.
 * Each check is run once against a planted copy of shell/main.js, which must fail, and once against the restored
 * file, which must pass. The plant is the copy the test loaded. The worktree file is not written.
 *
 *     node tests/stats-live.mjs        exit code is the number of failed checks, capped at 63
 *
 * Throwaway keys and catalogs only. No window variable is set.
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
const EXPECTED = 12;
const WORK = path.join(ROOT, "shell", "main.js");
const GOOD = fs.readFileSync(WORK);
const GOOD_HASH = crypto.createHash("sha256").update(GOOD).digest("hex");
const CLOCK = new Date(2026, 3, 15, 12, 0, 0, 0).getTime();

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-stats-live-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), APP, { recursive: true });
const COPY = path.join(APP, "main.js");
const EXPOSE = ["spanSignedBytes", "spanDocument", "setStatsClock", "statsPulse", "flushHeldStats",
  "openSealed", "sealCatalog", "wrapTeamKey", "signedSha", "catalogChanged", "channelHash", "isCatalogName"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });
let seq = 0;

function loadDesk(ud) {
  const src = fs.readFileSync(COPY, "utf8");
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
    src + "\nreturn { " + EXPOSE.join(", ") + " };")(
    n => (n === "electron" ? electron : nodeRequire(n)),
    APP, COPY, { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const sent = [];
  let page = () => "{}";
  const win = { isDestroyed: () => false, webContents: { send: (ch, payload) => {
    sent.push([ch, payload]);
    if (ch === "etiuda:stats-ask") invoke["etiuda:stats-write"](eventFor(), page());
  } } };
  api.setStatsClock(CLOCK);
  return { api, ask, said, ud, sent, win, setPage: fn => { page = fn; }, invoke };
}
function newDesk(folder) {
  const ud = path.join(LAB, "desk-" + (++seq));
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: folder, eUiLang: "en", eAgent: "North desk" } }), "utf8");
  const D = loadDesk(ud);
  D.share = folder;
  return D;
}
const folder = () => { const f = path.join(LAB, "share-" + (++seq)); fs.mkdirSync(f, { recursive: true }); return f; };
const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
const ymd = d => { const p = v => String(v).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
const shift = (s, days) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * 864e5);
  const p = v => String(v).padStart(2, "0");
  return x.getUTCFullYear() + "-" + p(x.getUTCMonth() + 1) + "-" + p(x.getUTCDate());
};
const walk = dir => {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return names.reduce((out, e) => out.concat(e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]), []);
};
const estat = share => walk(share).filter(f => /\.estat$/.test(f));
const oldEstat = share => estat(share).filter(f => f.split(path.sep).indexOf("stats") >= 0 && path.basename(path.dirname(f)) === "stats");

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "quay-lead", public: pubHex(lead.publicKey) };
  const OTHER = { keyId: "other-lead", public: pubHex(other.publicKey) };
  const signTeam = (doc) => {
    const o = JSON.parse(JSON.stringify(doc));
    o.sig = { alg: "Ed25519", keyId: LEAD.keyId };
    o.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(o)), lead.privateKey).toString("hex");
    return JSON.stringify(o, null, 1) + "\n";
  };
  const RING = { format: 1, kind: "etiuda-ring", keys: [
    { catalog: "north-lamps", keyId: LEAD.keyId, alg: "Ed25519", public: LEAD.public }] };
  const spanDoc = (D, span, key, who) => {
    const doc = { format: 1, kind: "etiuda-stats-span", span: span, sig: { alg: "Ed25519", keyId: who.keyId } };
    doc.sig.value = crypto.sign(null, D.api.spanSignedBytes(doc), key).toString("hex");
    return doc;
  };
  const pageBody = n => JSON.stringify({
    engine: "2.0.0",
    cards: [{ id: "c-lamp", n: n, at: "2026-04-02" }],
    intents: [{ id: "i-ask", n: 1 }],
    misses: 1,
    langs: { en: n },
    since: "2026-01-01",
    catalog: { id: "north-lamps", rev: 3, title: "smuggled" },
    pairs: [{ from: "c-lamp", to: "c-wick", n: 4, name: "smuggled" }, { from: "c-lamp", to: "", n: 1 },
      { from: "c-lamp", to: "c-wick", n: 0 }],
    name: "smuggled"
  });
  const entry = (D, who, key, team, epoch, deskForWrap) => ({
    desk: { id: who.id, key: who.key, box: who.box },
    wrap: D.api.wrapTeamKey(key, who.box, team, epoch, deskForWrap || who.id),
  });
  const teamText = (id, epoch, roster) => signTeam({
    format: 1, kind: "etiuda-team", id: id, catalogs: ["north-lamps"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch: epoch, roster: roster,
  });
  async function joined(badWrap) {
    const share = folder();
    put(share, "etiuda-ring.json", RING);
    const D = newDesk(share);
    const me = await D.ask("etiuda:branch-identity", true);
    const team = "t-" + crypto.randomBytes(8).toString("hex");
    const key = crypto.randomBytes(32);
    const who = badWrap ? "k-" + "ab".repeat(8) : me.id;
    put(share, "etiuda-team.json", teamText(team, 1, [entry(D, me, key, team, 1, who)]));
    return { share, D, me, team, key };
  }
  function adopt(box, span, key, who, n) {
    put(box.share, "stats-span.json", spanDoc(box.D, span, key, who));
    box.D.setPage(() => pageBody(n == null ? 2 : n));
    box.D.api.catalogChanged(box.D.win);
  }
  const statsAt = box => path.join(box.share, "desks", box.me.id, "stats.estat");
  const openStats = (box, key) => {
    try { return JSON.parse(box.D.api.openSealed(key || box.key, JSON.parse(fs.readFileSync(statsAt(box), "utf8")))); }
    catch { return null; }
  };
  const ruled = "cards,catalog,desk,engine,format,hash,intents,kind,langs,misses,pairs,period,since,sync";

  async function prove(name, needle, repl, run) {
    const planted = GOOD.toString("utf8").replace(needle, repl);
    if (planted === GOOD.toString("utf8")) throw new Error("plant missed: " + name);
    fs.writeFileSync(COPY, planted);
    let red = false, redWhy = "";
    try { red = !(await run()); }
    catch (e) { red = true; redWhy = e.message; }
    finally { fs.writeFileSync(COPY, GOOD); }
    const back = crypto.createHash("sha256").update(fs.readFileSync(COPY)).digest("hex");
    if (back !== GOOD_HASH) throw new Error("sha256 restore failed: " + name);
    console.log("  red  " + name + (red ? " failed under the plant" : " STILL PASSED under the plant")
      + (redWhy ? " (" + redWhy + ")" : ""));
    let green = false, why = "";
    try { green = await run(); }
    catch (e) { green = false; why = e.stack || e.message; }
    return { ok: red && green === true, why: why, red: red };
  }

  /* ---- 891a: another key, unsigned, or a broken file writes nothing ------------------------------------------ */
  {
    const g = await prove("891a",
      "if (!lead || !spanGenuine(doc, lead)) return;",
      "if (false && (!lead || !spanGenuine(doc, lead))) return;",
      async () => {
        const box = await joined(false);
        if (!box.D.api.isCatalogName("stats-span.json") || box.D.api.isCatalogName("etiuda-request.ereq")) return false;
        adopt(box, "this-month", other.privateKey, OTHER, 2);
        if (fs.existsSync(statsAt(box))) return false;
        put(box.share, "stats-span.json", "{\"format\":1,\"kind\":\"etiuda-stats-span\",\"span\":\"rolling-30\"}");
        box.D.api.catalogChanged(box.D.win);
        if (fs.existsSync(statsAt(box))) return false;
        put(box.share, "stats-span.json", "{");
        box.D.api.catalogChanged(box.D.win);
        if (fs.existsSync(statsAt(box)) || oldEstat(box.share).length) return false;
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const before = fs.readFileSync(statsAt(box));
        const day = ymd(new Date(CLOCK));
        const inner = openStats(box);
        if (!inner || inner.period.from !== shift(day, -29) || inner.period.to !== day) return false;
        adopt(box, "this-month", other.privateKey, OTHER, 9);
        put(box.share, "stats-span.json", "{");
        box.D.api.catalogChanged(box.D.win);
        return Buffer.compare(before, fs.readFileSync(statsAt(box))) === 0 && openStats(box).cards[0].n === 2
          && oldEstat(box.share).length === 0;
      });
    check(g.ok, "891a a span signed by another key, or unsigned, or not JSON, writes nothing and leaves a good answer where it was"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891b: one watch event ----------------------------------------------------------------------------------- */
  {
    const g = await prove("891b",
      "askStats(win, \"span\");",
      "/* askStats(win, \"span\"); */",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const before = box.D.sent.filter(a => a[0] === "etiuda:stats-ask").length;
        put(box.share, "stats-span.json", spanDoc(box.D, "this-month", lead.privateKey, LEAD));
        box.D.api.catalogChanged(box.D.win);
        const asks = box.D.sent.filter(a => a[0] === "etiuda:stats-ask").length - before;
        const inner = openStats(box);
        const day = ymd(new Date(CLOCK));
        return asks === 1 && !!inner && inner.period.from === day.slice(0, 8) + "01" && inner.period.to === day;
      });
    check(g.ok, "891b a span change is answered inside that one watch event"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891c: one write per two minutes, clock driven ----------------------------------------------------------- */
  {
    const g = await prove("891c",
      "if (!bypass && statsLastWrite && (now.getTime() - statsLastWrite) < STATS_PACE_MS) {",
      "if (false && !bypass && statsLastWrite && (now.getTime() - statsLastWrite) < STATS_PACE_MS) {",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const first = fs.readFileSync(statsAt(box));
        const again = async (n) => box.D.ask("etiuda:stats-write", pageBody(n));
        const paced = await again(3);
        const still = Buffer.compare(first, fs.readFileSync(statsAt(box))) === 0;
        box.D.api.setStatsClock(CLOCK + 119999);
        await again(4);
        const inside = Buffer.compare(first, fs.readFileSync(statsAt(box))) === 0;
        box.D.api.setStatsClock(CLOCK + 120000);
        const landed = await again(5);
        const inner = openStats(box);
        return !!(paced && paced.paced && !paced.syncMs) && still && inside
          && !!(landed && landed.ok && landed.syncMs) && !!inner && inner.cards[0].n === 5;
      });
    check(g.ok, "891c a burst of counts is sealed once per two-minute window, and the clock is driven rather than waited out"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891d: nothing changed ------------------------------------------------------------------------------------ */
  {
    const g = await prove("891d",
      "if (key === statsWroteKey) { statsHeld = null; return { ok: true, unchanged: true }; }",
      "if (false && key === statsWroteKey) { statsHeld = null; return { ok: true, unchanged: true }; }",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        box.D.api.setStatsClock(CLOCK + 120000);
        const wrote = await box.D.ask("etiuda:stats-write", pageBody(4));
        const bytes = fs.readFileSync(statsAt(box));
        const same = await box.D.ask("etiuda:stats-write", pageBody(4));
        return !!(wrote && wrote.ok && wrote.syncMs) && !!(same && same.unchanged && !same.syncMs)
          && Buffer.compare(bytes, fs.readFileSync(statsAt(box))) === 0;
      });
    check(g.ok, "891d the same figures are not sealed again, and Last sync is not given a new time"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891e: the sealed answer opens to the ruled fields -------------------------------------------------------- */
  {
    const g = await prove("891e",
      "misses: data.misses | 0,",
      "misses: data.misses | 0, smuggled: \"kept\",",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const raw = JSON.parse(fs.readFileSync(statsAt(box), "utf8"));
        const text = box.D.api.openSealed(box.key, raw);
        const inner = JSON.parse(text);
        const day = ymd(new Date(CLOCK));
        const copy = JSON.parse(text);
        const hash = copy.hash;
        delete copy.hash;
        const hashOk = box.D.api.channelHash(copy) === hash;
        const keys = Object.keys(inner).sort().join(",");
        return raw.format === 2 && raw.kind === "etiuda-sealed" && raw.team === box.team && raw.epoch === 1
          && box.D.api.openSealed(crypto.randomBytes(32), raw) === null
          && keys === ruled && hashOk && JSON.stringify(inner).indexOf("smuggled") < 0
          && JSON.stringify(inner.pairs) === JSON.stringify([{ from: "c-lamp", to: "c-wick", n: 4 }])
          && inner.catalog.id === "north-lamps" && inner.catalog.rev === 3 && Object.keys(inner.catalog).length === 2
          && /^d[0-9a-f]{32}$/.test(inner.desk) && inner.desk !== box.me.id
          && inner.period.from === shift(day, -29) && inner.period.to === day
          && inner.sync === day + " 12:00" && path.basename(path.dirname(statsAt(box))) === box.me.id;
      });
    check(g.ok, "891e the answer is sealed under the team key and opens to exactly the ruled fields, pairs rebuilt, nothing smuggled"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891f: no team key ---------------------------------------------------------------------------------------- */
  {
    const g = await prove("891f",
      "if (!got || !got.seal) return { ok: false };",
      "if (!got || !got.seal) { got = { seal: { team: \"t-0000000000000000\", epoch: 1, key: Buffer.alloc(32, 7) } }; }",
      async () => {
        const box = await joined(true);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const res = await box.D.ask("etiuda:stats-write", pageBody(2));
        return !(res && res.ok) && !fs.existsSync(statsAt(box)) && oldEstat(box.share).length === 0
          && estat(box.share).length === 0;
      });
    check(g.ok, "891f a desk with no team key writes no statistics file"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891g: a stale epoch writes nothing ----------------------------------------------------------------------- */
  {
    const g = await prove("891g",
      "if (!use.member || use.stale || !use.seal) return null;",
      "if (!use.member || !use.seal) return null;",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const before = fs.readFileSync(statsAt(box));
        const key2 = crypto.randomBytes(32);
        put(box.share, "etiuda-team.json", teamText(box.team, 2, [entry(box.D, box.me, key2, box.team, 2, "k-" + "cd".repeat(8))]));
        box.D.api.setStatsClock(CLOCK + 120000);
        const res = await box.D.ask("etiuda:stats-write", pageBody(7));
        const same = Buffer.compare(before, fs.readFileSync(statsAt(box))) === 0;
        const inner = openStats(box);
        return !(res && res.syncMs) && same && !!inner && inner.cards[0].n === 2
          && box.D.api.openSealed(key2, JSON.parse(fs.readFileSync(statsAt(box), "utf8"))) === null;
      });
    check(g.ok, "891g a team file whose epoch the desk cannot open seals nothing, and the answer already written stays"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891h: the old stats/ path -------------------------------------------------------------------------------- */
  {
    const g = await prove("891h",
      "const dest = path.join(dir, \"stats.estat\");\n  if (path.dirname(dest) !== dir || path.basename(dest) !== \"stats.estat\") return null;",
      "const dest = path.join(root, \"stats\", ensureDeskId() + \".estat\");\n  if (path.basename(dest) !== ensureDeskId() + \".estat\") return null;",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const at = statsAt(box);
        return fs.existsSync(at) && path.basename(at) === "stats.estat" && oldEstat(box.share).length === 0;
      });
    check(g.ok, "891h the sealed answer is desks/<id>/stats.estat and the old stats/ path is never written"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891i: closing flushes a held count ---------------------------------------------------------------------- */
  {
    const g = await prove("891i",
      "const bypass = why === \"span\" || why === \"midnight\" || why === \"close\";",
      "const bypass = why === \"span\" || why === \"midnight\";",
      async () => {
        const box = await joined(false);
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const paced = await box.D.ask("etiuda:stats-write", pageBody(6));
        const held = openStats(box).cards[0].n === 2;
        const closed = await box.D.ask("etiuda:stats-close", pageBody(6));
        const flushed = !!(closed && closed.ok && closed.syncMs) && openStats(box).cards[0].n === 6;
        const pacedAgain = await box.D.ask("etiuda:stats-write", pageBody(8));
        box.D.api.flushHeldStats();
        return !!(paced && paced.paced) && held && flushed && !!(pacedAgain && pacedAgain.paced)
          && openStats(box).cards[0].n === 8;
      });
    check(g.ok, "891i closing writes the counts held inside the two-minute window, and the shell flushes the same way"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 891j: midnight moves a rolling span --------------------------------------------------------------------- */
  {
    const g = await prove("891j",
      "askStats(statsWin, \"midnight\");",
      "/* askStats(statsWin, \"midnight\"); */",
      async () => {
        const late = new Date(2026, 3, 15, 23, 0, 0, 0);
        const next = new Date(2026, 3, 16, 0, 30, 0, 0);
        const box = await joined(false);
        box.D.api.setStatsClock(late.getTime());
        adopt(box, "rolling-30", lead.privateKey, LEAD, 2);
        const first = openStats(box);
        box.D.api.setStatsClock(next.getTime());
        box.D.api.statsPulse();
        const moved = openStats(box);
        const from0 = ymd(late), to1 = ymd(next);
        return !!first && first.period.to === from0 && first.period.from === shift(from0, -29)
          && !!moved && moved.period.to === to1 && moved.period.from === shift(to1, -29)
          && moved.cards[0].n === 2;
      });
    check(g.ok, "891j a rolling span moves on at midnight, the clock driven, and the answer is sealed again for the new days"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  /* ---- 894a: an export after an epoch move is not sealed under the old key ------------------------------------- */
  {
    const g = await prove("894a",
      "const stale = cover.epoch !== epoch || epoch < (teamEpochSeen[team] || 0);",
      "const stale = cover.epoch < Math.max(epoch, teamEpochSeen[team] || 0);",
      async () => {
        const box = await joined(false);
        const signed = {
          format: 2, kind: "etiuda-catalog", id: "north-lamps", rev: 2, date: "2026-04-02", name: "North lamps",
          langs: [{ code: "en", label: "EN" }],
          tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
          cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" },
            body: { en: "The quay lamp is wrapped for the crossing." } }],
        };
        signed.sig = { alg: "Ed25519", keyId: LEAD.keyId };
        signed.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(signed)), lead.privateKey).toString("hex");
        const env = box.D.api.sealCatalog(box.key, box.team, 1, JSON.stringify(signed));
        put(box.share, "lamps.ec", JSON.stringify(env, null, 1) + "\n");
        const read = await box.D.ask("etiuda:catalog-read", "lamps.ec");
        const handed = JSON.parse(read.text);
        const pin = box.D.api.signedSha(handed);
        const hex8 = crypto.createHash("sha256").update(String(handed.id)).digest("hex").slice(0, 8);
        const grown = (name) => {
          const doc = JSON.parse(read.text);
          delete doc.sig;
          doc.id = box.me.id + "-" + hex8;
          doc.rev = 1;
          doc.name = name;
          doc.grew = { id: handed.id, rev: handed.rev, sha: pin };
          doc.desk = { id: box.me.id, key: box.me.key, box: box.me.box };
          return doc;
        };
        const stem = "lamps-" + hex8;
        const file = path.join(box.share, "desks", box.me.id, stem + ".ec");
        const first = await box.D.ask("etiuda:branch-write", stem, JSON.stringify(grown("North lamps, first")));
        const env1 = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
        const inner1 = env1 ? box.D.api.openSealed(box.key, env1) : null;
        const before = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
        const key2 = crypto.randomBytes(32);
        put(box.share, "etiuda-team.json", teamText(box.team, 2, [entry(box.D, box.me, key2, box.team, 2, "k-" + "ef".repeat(8))]));
        const second = await box.D.ask("etiuda:branch-write", stem, JSON.stringify(grown("North lamps, second")));
        const after = fs.readFileSync(file);
        const still = box.D.api.openSealed(box.key, JSON.parse(after.toString("utf8")));
        return !!(first && first.ok) && !!inner1 && inner1.indexOf("North lamps, first") >= 0
          && env1.epoch === 1 && !!(second && second.held) && !second.ok
          && Buffer.compare(before, after) === 0 && !!still && still.indexOf("North lamps, first") >= 0
          && still.indexOf("North lamps, second") < 0
          && box.D.api.openSealed(key2, JSON.parse(after.toString("utf8"))) === null;
      });
    check(g.ok, "894a an export after the epoch moves, while the old key is still the newest this desk holds, is not sealed, and the previous file still opens under that key"
      + (g.why ? ": " + g.why.split("\n")[0] : ""));
  }

  const tree = crypto.createHash("sha256").update(fs.readFileSync(WORK)).digest("hex");
  const copy = crypto.createHash("sha256").update(fs.readFileSync(COPY)).digest("hex");
  check(tree === GOOD_HASH && copy === GOOD_HASH,
    "891k the worktree source and the copy were restored to " + GOOD_HASH.slice(0, 16));
} catch (e) {
  console.log("  FAIL the leg did not finish: " + (e && e.stack || e));
  try { fs.writeFileSync(COPY, GOOD); } catch { /* the copy is disposable */ }
  failed++;
}
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
process.exit(Math.min(failed, 63));
