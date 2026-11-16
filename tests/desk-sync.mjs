/* A PERSON'S STORE, THE SYNC: what follows between the person's computers and how it merges (shell/sync/sync.cjs), through the
 * relay channel (shell/relay/channel.cjs) over the relay itself in memory (relay/worker.mjs on relay/test/stand-ins.cjs), with
 * stand-ins for OneDrive's App Folder and the licence service; no leg calls a real provider. node tests/desk-sync.mjs
 * C7, C8 with its sets by member, C10's outbox half and the replace race's adoption, each guard named by a plant in a copy that turns its leg red, and no
 * product file written. Node builtins only, no window. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "desk-sync-"));
const EXPECTED = 74;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 16, 9);
const CODE = "ABCDEFGHJKMNPQRS";
const SPKI = Buffer.from("302a300506032b6570032100", "hex"), PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const brief = o => JSON.stringify(o);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const SAMPLE = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "sample", sample: true, cards: [] });
const safe = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: "threw " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e) }; } };

let ST = null, SY = null, CH = null, C = null, S = null, K = null, W = null;
function keyPair() {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  const id = "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16);
  return { id, pub, privateKey: p.privateKey, desk: id };
}
const sKey = seed => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
const signWith = (privateKey, bytes) => crypto.sign(null, bytes, privateKey).toString("hex");

/* ---- OneDrive's App Folder, as Microsoft documents it; `replica` gives a computer a copy that shows its own write until reconciled ---- */
function graphStandIn() {
  const st = { text: null, down: false };
  st.askFor = view => async (method, url, headers, body) => {
    const json = (status, o) => ({ status, bytes: Buffer.from(JSON.stringify(o)) });
    if (st.down) throw new TypeError("fetch failed");
    if (method === "GET" && url === ST.GRAPH) return json(200, { id: "approot" });
    const file = ST.GRAPH + ":/" + ST.KEY_FILE + ":/content";
    if (method === "GET" && url === file) return view.text === null ? json(404, { error: { code: "itemNotFound" } }) : { status: 200, bytes: Buffer.from(view.text) };
    if (method === "PUT" && url.startsWith(file)) {
      if (/conflictBehavior=fail$/.test(url) && view.text !== null) return json(409, { error: { code: "nameAlreadyExists" } });
      const was = view.text;
      view.text = Buffer.from(body).toString("utf8");
      return json(was === null ? 201 : 200, { id: "f" });
    }
    return json(400, { error: { code: "invalidRequest" } });
  };
  return st;
}
/* ---- the licence service, standing in: grants and one-day store certificates as it signs them; a replace ends the person's other stores ---- */
const via = at => K.delegationFor(at, { fields: { may: ["licence", "relay-grant"] } });
function serviceStandIn(R, sent) {
  const kept = new Set();
  sent.notices = [];
  return async (rt, sPub, extra) => {
    sent.push(JSON.stringify({ rt, sPub, extra }));
    if (sent.down) return { why: "unreached" };
    const now = R.clock.now;
    if (extra && extra.replace === true) for (const old of [...kept].filter(x => x !== rt)) {
      const n = { kind: "etiuda-service-notice", format: 1, what: "store-end", rt: old, code: CODE, issued: now, via: via(now), sig: { alg: "ed25519", keyId: K.DELEGATE.id, value: "" } };
      n.sig.value = signWith(K.DELEGATE.privateKey, C.noticeBytes(n));
      const r = await relayCall(R, [], "POST", "/t/" + old + "/notice", { notice: n });
      sent.notices.push(old + " " + r.status);
      kept.delete(old);
    }
    /* `sent.seat` {lost, trialEnds | paidUntil}: the service's own rule (store/grant), no grant once the seat is gone, the grant ending at the
       trial's or the paid licence's end and at most the relay's longest span on, paid where it is no trial. */
    const seat = sent.seat, trial = !!seat && seat.trialEnds != null;
    if (seat && (now >= seat.lost || now >= (trial ? seat.trialEnds : seat.paidUntil))) return { why: "signin" };
    kept.add(rt);
    const g = { kind: "etiuda-store-grant", format: 1, lead: sPub, code: CODE, issued: now,
      until: seat ? Math.min(trial ? seat.trialEnds : seat.paidUntil, now + C.GRANT_MAX_MS) : now + 30 * DAY, paid: seat ? !trial : true, via: via(now),
      sig: { alg: "ed25519", keyId: K.DELEGATE.id, value: "" } };
    g.sig.value = signWith(K.DELEGATE.privateKey, C.grantBytes(g));
    return { grant: g, cert: deskPub => {
      const c = { kind: "etiuda-store-certificate", format: 1, desk: deskPub, code: CODE, issued: now, until: now + DAY, via: K.delegationFor(now, { fields: { may: ["licence"] } }),
        sig: { alg: "Ed25519", keyId: K.DELEGATE.id, value: "" } };
      c.sig.value = signWith(K.DELEGATE.privateKey, C.storeCertBytes(c));
      return c;
    } };
  };
}
/* ---- the relay: the real one in memory; every body and blob it is sent is kept, to be read ---- */
async function relayCall(R, sent, method, p, json, token) {
  const body = json === undefined ? undefined : JSON.stringify(json);
  if (body) sent.push(body);
  const res = await W.fetch(new Request("https://relay.test/relay/v1" + p, { method, headers: Object.assign({ "content-type": "application/json" },
    token ? { authorization: "Bearer " + token } : {}), body, duplex: "half" }), R.env);
  return { status: res.status, json: await res.json().catch(() => null) };
}
function relayIo(R, sent, me) {
  return {
    async create(keys, grant) {
      const sPub = ST.pubOf(keys.s), t = R.clock.now;
      const r = await relayCall(R, sent, "POST", "/teams", { rt: keys.rt, lead: { keyId: sPub, pub: sPub }, t, grant, sig: signWith(sKey(keys.s), C.create2Bytes(keys.rt, sPub, t, grant)) });
      return r.status === 200 ? { ok: true } : { ok: false, why: r.json && r.json.error };
    },
    async renew(keys, grant) {
      const r = await relayCall(R, sent, "POST", "/t/" + keys.rt + "/grant", { grant });
      return r.status === 200 ? { ok: true } : { ok: false, why: r.json && r.json.error };
    },
    async devices(keys, cert) {
      const t = R.clock.now, list = keys.devices.map(d => ({ id: d.id, pub: d.pub, desk: d.desk }));
      const r = await relayCall(R, sent, "POST", "/t/" + keys.rt + "/devices", { keys: list, rev: keys.rev, t, sig: signWith(sKey(keys.s), C.devicesBytes(keys.rt, keys.rev, t, list)),
        seat: cert, by: { pub: me.pub, sig: signWith(me.privateKey, C.storeDevicesBytes(keys.rt, keys.rev, t, list)) } });
      return r.status === 200 ? { ok: true } : { ok: false, why: r.json && r.json.error };
    },
  };
}
/* The channel's transport over the relay in memory; every upload's bytes are kept, to be read. */
function transport(R, sent, down) {
  return async (method, url, headers, body) => {
    if (down.on) throw new Error("the relay does not answer");
    if (body) sent.push(Buffer.from(body).toString("latin1"));
    const res = await W.fetch(new Request(url, { method, headers, body: body || undefined, duplex: "half" }), R.env);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, header: n => res.headers.get(n), bytes };
  };
}

/* A computer of the person: its key, its sealed copy, its desk (keys and catalog files), its sync state and its mirror. */
function computer(world, label, view) {
  const me = keyPair(), sealed = { keys: null }, desk = { keys: {}, files: {} }, kept = [], down = { on: false };
  const dir = path.join(WORK, world.name + "-" + label);
  let syncState = null, sync = null, heldNow = [];
  const folderView = view || world.f;
  const lookIo = () => ({ folder: ST.folderFor("microsoft", { ask: world.f.askFor(folderView), token: () => "access-token" }), local: () => sealed.keys,
    keep: k => { sealed.keys = JSON.parse(JSON.stringify(k)); }, grant: async (rt, sPub, ...rest) => {
      const g = await world.service(rt, sPub, ...rest);
      return g.why ? g : { grant: g.grant, store: g.cert(me.pub) };
    }, relay: relayIo(world.R, world.relaySent, me), me: { id: me.id, pub: me.pub, desk: me.desk, privateKey: me.privateKey }, url: "https://relay.test/relay/v1", rand: n => crypto.randomBytes(n) });
  function make() {
    sync = SY.createStoreSync({
      me: { id: me.id, pub: me.pub, privateKey: me.privateKey }, mirrorRoot: dir,
      channel: opts => CH.createChannel(Object.assign(opts, { request: transport(world.R, world.uploads, down), clock: () => world.R.clock.now, watch: false, pollMs: 1e9, say: l => { if (process.env.SYNC_SAY) console.log("   say " + label + ": " + l); } })),
      io: m => CH.diskIO(m), load: () => syncState, save: s => { syncState = JSON.parse(JSON.stringify(s)); },
      /* A desk on a team's folder holds every catalog file back, as the shell's storeSyncLocal does. */
      local: () => { heldNow = []; if (desk.team) { heldNow.push("f:"); return SY.localItems(desk.keys, {}, heldNow); } return SY.localItems(desk.keys, desk.files, heldNow); }, held: () => heldNow,
      /* The catalog files that are the shipped sample byte for byte, as the shell judges them (shell/main.js isTheSample). */
      pristine: () => Object.keys(desk.files).filter(n => desk.files[n] === SAMPLE).map(n => "f:" + n),
      /* What the desk refuses to take (desk.refuse) is answered as not put in place, as the shell answers a failed write or patch. */
      apply: (patch, copies) => {
        const failed = [];
        for (const item of Object.keys(patch)) {
          if (desk.refuse && desk.refuse.has(item)) { failed.push(item); continue; }
          const at = item.slice(2), box = item.startsWith("k:") ? desk.keys : desk.files;
          if (patch[item] === null) delete box[at]; else box[at] = patch[item];
        }
        for (const c of copies) { if (desk.refuse && desk.refuse.has(c.item)) failed.push(c.item); else kept.push(c); }
        return failed;
      },
      pubOf: ST.pubOf, canonBytes: CH.signedBytes, now: () => world.R.clock.now,
    });
  }
  make();
  const self = {
    label, me, desk, kept, down, dir, sealed, world,
    look: async () => { const l = await ST.storeLook(lookIo()); sync.turn(l); return l; },
    edit: () => sync.merge(),
    cycle: async () => { const c = sync.channel(); if (!c) return; c.kick(); await c.idle(); },
    sync: () => sync,
    stopAll: () => sync.stop(),
  };
  return self;
}
function worldOf(name) {
  const R = S.relayEnv({ roots: K.ROOTS });
  R.clock.now = T0;
  const w = { name, R, f: graphStandIn(), relaySent: [], serviceSent: [], uploads: [] };
  w.service = serviceStandIn(R, w.serviceSent);
  return w;
}
/* Rounds of cycles and merges until nothing moves, the way the shell runs them: each merge writes the computer's place, each cycle sends and takes. */
async function settle(...cs) {
  for (let i = 0; i < 4; i++) for (const c of cs) { cs[0].world.R.clock.now += 1000; c.edit(); await c.cycle(); c.edit(); }
}
async function twoOn(name) {
  const w = worldOf(name), a = computer(w, "a"), b = computer(w, "b");
  const la = await a.look(), lb = await b.look();
  if (la.state !== "on" || lb.state !== "on") throw new Error("the store did not come on: " + la.state + "/" + lb.state);
  await a.look(); /* a takes the list b's enrolment wrote, so it judges b's blobs */
  return { w, a, b };
}

async function main() {
  try {
    ST = require(path.join(ROOT, "shell", "sync", "store.cjs"));
    SY = require(path.join(ROOT, "shell", "sync", "sync.cjs"));
    CH = require(path.join(ROOT, "shell", "relay", "channel.cjs"));
    C = require(path.join(ROOT, "relay", "core.cjs"));
    S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
    K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
    const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
    W = WORKER.routeWith(K.ROOTS, env => env.NOW());
  } catch (e) { check(false, "0a the modules load - " + e.message); return; }

  /* S1: what one computer changes reaches the other through the relay, sealed: a setting, an edit over a catalog and a catalog file. */
  async function followsScene() {
    const { w, a, b } = await twoOn("s1");
    a.desk.keys.eUiLang = "pl";
    a.desk.keys["e3f9a1~Pack"] = JSON.stringify({ stars: { c1: 1 } });
    a.desk.files["Harbour notes.ec"] = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "harbour", cards: [] });
    await settle(a, b);
    const plainSent = w.uploads.filter(t => t.indexOf("Harbour notes") >= 0 || t.indexOf("stars") >= 0).length;
    const ok = b.desk.keys.eUiLang === "pl" && b.desk.keys["e3f9a1~Pack"] === a.desk.keys["e3f9a1~Pack"] && b.desk.files["Harbour notes.ec"] === a.desk.files["Harbour notes.ec"]
      && plainSent === 0 && w.uploads.length > 0;
    return { ok, detail: brief({ lang: b.desk.keys.eUiLang || null, pack: !!b.desk.keys["e3f9a1~Pack"], file: !!b.desk.files["Harbour notes.ec"], uploads: w.uploads.length, plainSent }) };
  }
  /* C7: a desk holding a team key, a team mirror's file, a sign-in token and its identity key beside what follows: none of them reaches
     the computer's place in the store, what the relay is sent, or the folder's key file. */
  async function staysScene() {
    const { w, a, b } = await twoOn("c7");
    const secrets = { team: crypto.randomBytes(32).toString("hex"), token: "rt." + crypto.randomBytes(24).toString("base64url"), ident: crypto.randomBytes(32).toString("hex"),
      mirror: "mirrored-" + crypto.randomBytes(12).toString("hex") };
    Object.assign(a.desk.keys, { eUiLang: "en", eTheme: "dark", eTeamKeys: JSON.stringify({ t1: secrets.team }), eSigninRefresh: secrets.token, eBranch: JSON.stringify({ sign: { priv: secrets.ident } }),
      eCatalogFolder: "C:/Users/someone/Documents/Etiuda", e3f9a1Stats: "{}", "e3f9a1~SharedFile": secrets.mirror });
    a.desk.files["relay-mirror.json"] = JSON.stringify({ team: secrets.team });
    a.desk.files["Own.ec"] = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "own" });
    await settle(a, b);
    const place = [];
    const walk = d => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walk(p); else place.push(fs.readFileSync(p, "utf8")); } };
    walk(path.join(a.dir));
    const hay = place.concat(w.uploads, w.relaySent, w.serviceSent, [w.f.text || ""]).join("\n");
    const leaks = Object.keys(secrets).filter(k => hay.indexOf(secrets[k]) >= 0);
    const followed = b.desk.keys.eTheme === "dark" && b.desk.files["Own.ec"] === a.desk.files["Own.ec"];
    const strays = Object.keys(b.desk.keys).filter(k => ["eTeamKeys", "eSigninRefresh", "eBranch", "eCatalogFolder", "e3f9a1Stats", "e3f9a1~SharedFile"].indexOf(k) >= 0)
      .concat(Object.keys(b.desk.files).filter(n => n === "relay-mirror.json"));
    return { ok: leaks.length === 0 && followed && strays.length === 0, detail: brief({ leaks, followed, strays, placeFiles: place.length }) };
  }
  /* C8: two computers offline edit the same item: the later write is in place on both and the earlier kept aside on both, nothing lost;
     an item only one changed takes that change; a setting takes the later write; a version chosen with resolve, handed only the value,
     is put in place and stands on both, the versions kept let go. */
  async function bothScene() {
    const { w, a, b } = await twoOn("c8");
    const L = "e3f9a1~Pack", F = "Quay.ec";
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "first" } });
    a.desk.files[F] = "{\"v\":1}";
    a.desk.keys.eTheme = "light";
    await settle(a, b);
    const shared = b.desk.keys[L] === a.desk.keys[L] && b.desk.files[F] === a.desk.files[F];
    a.down.on = true; b.down.on = true;
    w.R.clock.now += MIN;
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "from a" } });
    a.desk.files[F] = "{\"v\":\"a\"}";
    a.desk.keys["e77~CatOrder"] = "[\"x\"]";
    a.desk.keys.eTheme = "dark";
    a.edit();
    w.R.clock.now += MIN;
    b.desk.keys[L] = JSON.stringify({ edits: { c1: "from b" } });
    b.desk.files[F] = "{\"v\":\"b\"}";
    b.desk.keys.eTheme = "system";
    b.edit();
    a.down.on = false; b.down.on = false;
    await settle(a, b);
    /* The card both changed is the one field of the layer both changed: its two versions, the one in place and the one kept. */
    const C1 = "k:" + L + "#edits/c1";
    const here = (c, item) => (item === C1 ? JSON.stringify(JSON.parse(c.desk.keys[L]).edits.c1) : c.desk.files[item.slice(2)]);
    const versions = (c, item) => [here(c, item)].concat(c.kept.filter(k => k.item === item).map(k => k.value)).sort();
    const want = { [C1]: [JSON.stringify("from a"), JSON.stringify("from b")].sort(), ["f:" + F]: ["{\"v\":\"a\"}", "{\"v\":\"b\"}"] };
    const kept = Object.keys(want).every(item => JSON.stringify(versions(a, item)) === JSON.stringify(want[item]) && JSON.stringify(versions(b, item)) === JSON.stringify(want[item]));
    const newerInPlace = a.desk.keys[L].indexOf("from b") > 0 && b.desk.keys[L].indexOf("from b") > 0 && a.desk.files[F] === "{\"v\":\"b\"}" && b.desk.files[F] === "{\"v\":\"b\"}";
    const oneSide = b.desk.keys["e77~CatOrder"] === "[\"x\"]" && !a.kept.concat(b.kept).some(k => k.item === "k:e77~CatOrder");
    const later = a.desk.keys.eTheme === "system" && b.desk.keys.eTheme === "system" && !a.kept.concat(b.kept).some(k => k.item === "k:eTheme");
    /* The earlier versions chosen on b, where the later is in place, by the value alone: put in place there, they reach a, and the versions
       kept on both are let go. */
    w.R.clock.now += MIN;
    b.sync().resolve(C1, JSON.stringify("from a"));
    b.sync().resolve("f:" + F, "{\"v\":\"a\"}");
    await settle(a, b);
    const chosen = JSON.parse(a.desk.keys[L]).edits.c1 === "from a" && JSON.parse(b.desk.keys[L]).edits.c1 === "from a" && a.desk.files[F] === "{\"v\":\"a\"}" && b.desk.files[F] === "{\"v\":\"a\"}"
      && !a.sync().state().kept.length && !b.sync().state().kept.length;
    const ok = shared && kept && newerInPlace && oneSide && later && chosen;
    return { ok, detail: brief({ shared, kept, newerInPlace, oneSide, later, chosen, a: [here(a, C1), a.desk.files[F]], b: [here(b, C1), b.desk.files[F]], keptA: a.kept.length, keptB: b.kept.length }) };
  }
  /* C8f: two computers offline change different cards of one catalog's layer, and one adds a card of its own: every change stands on both,
     the layer whole, and no version is kept, since no card was changed on both. */
  async function fieldsScene() {
    const { w, a, b } = await twoOn("c8f");
    const L = "e3f9a1~Pack";
    a.desk.keys[L] = JSON.stringify({ overrides: { c1: { t: "one" }, c2: { t: "two" } }, cardOrder: ["c1", "c2"], hidden: [] });
    await settle(a, b);
    a.down.on = true; b.down.on = true;
    w.R.clock.now += MIN;
    a.desk.keys[L] = JSON.stringify({ overrides: { c1: { t: "one, from a" }, c2: { t: "two" } }, cardOrder: ["c1", "c2"], hidden: [] });
    a.edit();
    w.R.clock.now += MIN;
    b.desk.keys[L] = JSON.stringify({ overrides: { c1: { t: "one" }, c2: { t: "two, from b" }, c3: { t: "b's own" } }, cardOrder: ["c1", "c2"], hidden: ["c9"] });
    b.edit();
    a.down.on = false; b.down.on = false;
    await settle(a, b);
    const want = { overrides: { c1: { t: "one, from a" }, c2: { t: "two, from b" }, c3: { t: "b's own" } }, cardOrder: ["c1", "c2"], hidden: ["c9"] };
    const norm = t => { try { const j = JSON.parse(t); return JSON.stringify(Object.keys(j).sort().reduce((o, k) => (o[k] = j[k], o), {})); } catch { return null; } };
    const same = norm(a.desk.keys[L]) === norm(JSON.stringify(want)) && norm(b.desk.keys[L]) === norm(JSON.stringify(want));
    const none = a.kept.length === 0 && b.kept.length === 0;
    return { ok: same && none, detail: brief({ same, none, a: a.desk.keys[L], keptA: a.kept.length, keptB: b.kept.length }) };
  }
  /* Hidden cards and own cards are sets, merged by member: a different card hidden or added on each computer is two changes that both
     stand, and only the same card changed both ways is a conflict. */
  const L8 = "e3f9a1~Pack";
  const packOf = c => { try { return JSON.parse(c.desk.keys[L8]); } catch { return {}; } };
  const setOf = list => JSON.stringify((Array.isArray(list) ? list : []).map(x => (typeof x === "string" ? x : JSON.stringify(x))).sort());
  const repack = (c, fn) => { const p = packOf(c); fn(p); c.desk.keys[L8] = JSON.stringify(p); c.edit(); };
  async function hiddenScene() {
    const { w, a, b } = await twoOn("c8h");
    a.desk.keys[L8] = JSON.stringify({ overrides: { c1: { t: "one" } }, cardOrder: ["c1", "c2", "c3"], hidden: ["c0"] });
    await settle(a, b);
    a.down.on = true; b.down.on = true;
    w.R.clock.now += MIN;
    repack(a, p => p.hidden.push("c1"));
    w.R.clock.now += MIN;
    repack(b, p => p.hidden.push("c2"));
    a.down.on = false; b.down.on = false;
    await settle(a, b);
    const both = setOf(packOf(a).hidden) === setOf(["c0", "c1", "c2"]) && setOf(packOf(b).hidden) === setOf(["c0", "c1", "c2"]);
    const none = a.kept.length === 0 && b.kept.length === 0;
    /* Shown again on one computer: the removal is recorded for that card, so it is shown again on the other too. */
    w.R.clock.now += MIN;
    repack(a, p => { p.hidden = p.hidden.filter(id => id !== "c1"); });
    await settle(a, b);
    const shown = setOf(packOf(a).hidden) === setOf(["c0", "c2"]) && setOf(packOf(b).hidden) === setOf(["c0", "c2"]) && a.kept.length + b.kept.length === 0;
    const kept = packOf(b).overrides && packOf(b).overrides.c1 && packOf(b).overrides.c1.t === "one" && JSON.stringify(packOf(b).cardOrder) === JSON.stringify(["c1", "c2", "c3"]);
    return { ok: both && none && shown && kept, detail: brief({ both, none, shown, kept, a: packOf(a).hidden, b: packOf(b).hidden, keptA: a.kept.length, keptB: b.kept.length }) };
  }
  async function ownScene() {
    const { w, a, b } = await twoOn("c8o");
    const card = (id, t) => ({ id, c: "k1", t: { en: t } });
    a.desk.keys[L8] = JSON.stringify({ custom: [card("u:base", "base")], cardOrder: ["c1"], hidden: [] });
    await settle(a, b);
    a.down.on = true; b.down.on = true;
    w.R.clock.now += MIN;
    repack(a, p => p.custom.push(card("u:aa", "made on a")));
    w.R.clock.now += MIN;
    repack(b, p => p.custom.push(card("u:bb", "made on b")));
    a.down.on = false; b.down.on = false;
    await settle(a, b);
    const want = setOf([card("u:base", "base"), card("u:aa", "made on a"), card("u:bb", "made on b")]);
    const both = setOf(packOf(a).custom) === want && setOf(packOf(b).custom) === want;
    const none = a.kept.length === 0 && b.kept.length === 0;
    /* Deleted on one computer: gone on the other, the rest untouched. */
    w.R.clock.now += MIN;
    repack(b, p => { p.custom = p.custom.filter(m => m.id !== "u:aa"); });
    await settle(a, b);
    const gone = setOf(packOf(a).custom) === setOf([card("u:base", "base"), card("u:bb", "made on b")]) && setOf(packOf(b).custom) === setOf(packOf(a).custom) && a.kept.length + b.kept.length === 0;
    return { ok: both && none && gone, detail: brief({ both, none, gone, a: (packOf(a).custom || []).map(m => m.id), b: (packOf(b).custom || []).map(m => m.id), keptA: a.kept.length, keptB: b.kept.length }) };
  }
  /* The same card shown again on one computer and hidden later on the other, beside a different card hidden on each: that card alone is a
     conflict. The later hide is in place on both, and the earlier showing again is kept aside on both as a removal, the value null; a
     version chosen with resolve stands on both. */
  async function sameScene(chooser) {
    const { w, a, b } = await twoOn("c8x");
    a.desk.keys[L8] = JSON.stringify({ cardOrder: ["c5", "c6", "c7"], hidden: ["c0"] });
    await settle(a, b);
    a.down.on = true; b.down.on = true;
    w.R.clock.now += MIN;
    repack(b, p => p.hidden.push("c5"));
    w.R.clock.now += MIN;
    repack(b, p => { p.hidden = p.hidden.filter(id => id !== "c5"); });
    repack(b, p => p.hidden.push("c7"));
    w.R.clock.now += MIN;
    repack(a, p => p.hidden.push("c5"));
    repack(a, p => p.hidden.push("c6"));
    a.down.on = false; b.down.on = false;
    await settle(a, b);
    const own = setOf(packOf(a).hidden) === setOf(["c0", "c5", "c6", "c7"]) && setOf(packOf(b).hidden) === setOf(["c0", "c5", "c6", "c7"]);
    const all = a.kept.concat(b.kept);
    /* The one conflict kept on both computers: the earlier showing again, b's own on b and taken from b on a, as a removal. */
    const one = all.length === 2 && b.kept.length === 1 && b.kept[0].item.indexOf("c5") >= 0 && b.kept[0].value === null
      && a.kept.length === 1 && a.kept[0].item === b.kept[0].item && a.kept[0].value === null
      && b.sync().state().kept.length === 1 && a.sync().state().kept.length === 1;
    /* Chosen on either computer, by the value alone: the showing again kept aside on b, or the hide in place on a. */
    let chosen = false;
    if (one) {
      w.R.clock.now += MIN;
      const at = chooser === "a" ? a : b, want = chooser === "a" ? ["c0", "c5", "c6", "c7"] : ["c0", "c6", "c7"];
      at.sync().resolve(at.kept[0].item, chooser === "a" ? JSON.stringify("c5") : null);
      await settle(a, b);
      chosen = setOf(packOf(a).hidden) === setOf(want) && setOf(packOf(b).hidden) === setOf(want)
        && a.sync().state().kept.length === 0 && b.sync().state().kept.length === 0 && a.kept.length + b.kept.length === 2;
    }
    return { ok: own && one && chosen, detail: brief({ own, one, chosen, a: packOf(a).hidden, b: packOf(b).hidden, kept: all.map(k => k.item.slice(-12) + "=" + k.value) }) };
  }
  /* C10, the outbox: a's store certificate lapses (two days offline, then the service unreached while online): its edits wait in its own
     place, nothing is sent; at the next look that is on, sync resumes by itself, sends what waited and takes what came. */
  async function outboxScene() {
    const { w, a, b } = await twoOn("c10");
    a.desk.keys.eUiLang = "en";
    a.desk.keys["e3f9a1~Pack"] = JSON.stringify({ edits: { c9: "before" } });
    await settle(a, b);
    /* Changed just before the lapse is met, not yet merged: it waits as anything made while paused does. */
    a.desk.keys["e3f9a1~Pack"] = JSON.stringify({ edits: { c9: "at the lapse" } });
    w.R.clock.now += 2 * DAY;
    w.serviceSent.down = true;
    const paused = await a.look();
    const stopped = !a.sync().running();
    a.desk.files["Paused.ec"] = "{\"made\":\"offline\"}";
    a.edit();
    const sentWhilePaused = w.uploads.length;
    await a.cycle();
    const quiet = w.uploads.length === sentWhilePaused;
    w.serviceSent.down = false;
    const bl = await b.look();
    b.desk.keys.eTheme = "dark";
    b.edit(); await b.cycle();
    const back = await a.look();
    await settle(a, b);
    const ok = paused.state === "paused" && stopped && quiet && bl.state === "on" && back.state === "on" && a.sync().running()
      && b.desk.keys["e3f9a1~Pack"] === JSON.stringify({ edits: { c9: "at the lapse" } }) && b.desk.files["Paused.ec"] === "{\"made\":\"offline\"}" && a.desk.keys.eTheme === "dark";
    return { ok, detail: brief({ paused: paused.state, stopped, quiet, back: back.state, atLapse: b.desk.keys["e3f9a1~Pack"] === JSON.stringify({ edits: { c9: "at the lapse" } }), sent: b.desk.files["Paused.ec"] === "{\"made\":\"offline\"}", took: a.desk.keys.eTheme || null }) };
  }
  /* The replace race on real replicas: two computers set up within the folder's sync lag, each reading back its own write, so both say they
     replace and the later ends the earlier's store. Once a's replica shows the folder's store, a adopts it at its next look, and every edit a
     made, before and after its own store ended, reaches the new store and b. */
  async function raceScene() {
    const w = worldOf("race");
    const ra = { text: null }, rb = { text: null };
    const a = computer(w, "a", ra), b = computer(w, "b", rb);
    const la = await a.look();
    a.desk.keys["e3f9a1~Pack"] = JSON.stringify({ edits: { c1: "a, on its own store" } });
    a.edit(); await a.cycle();
    w.R.clock.now += MIN;
    const lb = await b.look();
    const replaces = w.serviceSent.filter(t => { const j = JSON.parse(t); return j.extra && j.extra.replace === true; }).length;
    const ended = w.serviceSent.notices.length;
    a.desk.files["Late.ec"] = "{\"after\":\"the end\"}";
    a.edit(); await a.cycle();
    /* The replicas reconcile on the later write, b's. */
    ra.text = rb.text;
    w.R.clock.now += MIN;
    const la2 = await a.look();
    rb.text = ra.text; /* and again on a's enrolment */
    await b.look();
    await settle(a, b);
    const ok = la.state === "on" && lb.state === "on" && la.keys.rt !== lb.keys.rt && replaces === 2 && ended === 1 && la2.state === "on" && la2.keys.rt === lb.keys.rt
      && b.desk.keys["e3f9a1~Pack"] === a.desk.keys["e3f9a1~Pack"] && b.desk.files["Late.ec"] === "{\"after\":\"the end\"}";
    return { ok, detail: brief({ a: la.state, b: lb.state, twoStores: !!la.keys && !!lb.keys && la.keys.rt !== lb.keys.rt, replaces, ended, adopted: !!la2.keys && la2.keys.rt === (lb.keys && lb.keys.rt),
      edit: b.desk.keys["e3f9a1~Pack"] === a.desk.keys["e3f9a1~Pack"], late: b.desk.files["Late.ec"] === "{\"after\":\"the end\"}" }) };
  }

  /* C11, the person's seat goes: the store made at T0, its computer looking once a day as the shell does at each renewal, the seat gone
     at L, sixty days on, past the relay's longest grant span; then a day at a time, the store's alarm rung as the runtime rings it. Answers
     what the person meets: whether the store still worked the day before L, the last look's state after L, the days from L to the
     instant the relay's row says it is swept, and the day the store was found emptied. */
  const L_AT = 60;
  async function seatScene(name, seat) {
    const w = worldOf(name), a = computer(w, "a");
    const L = T0 + L_AT * DAY;
    w.serviceSent.seat = Object.assign({ lost: Infinity }, seat(L));
    const first = await a.look();
    if (first.state !== "on") throw new Error("the store did not come on: " + first.state);
    const rt = first.keys.rt;
    a.desk.keys.eTheme = "dark";
    await settle(a);
    const teamAt = () => { const s = w.R.stores.get(rt); return s ? s.get("team") : null; };
    let before = null;
    for (let d = 1; w.R.clock.now + DAY < L; d++) {
      w.R.clock.now = T0 + d * DAY;
      await a.look();
      await w.R.ring(rt);
      if (w.R.clock.now + DAY >= L) before = C.lapseOf(teamAt(), w.R.clock.now).state;
    }
    w.R.clock.now = L;
    const after = await a.look();
    const row = teamAt(), swept = row ? C.lapseOf(row, L).swept : null;
    let emptied = null;
    for (let d = 1; d <= 200 && emptied === null; d++) {
      w.R.clock.now = L + d * DAY;
      await a.look();
      await w.R.ring(rt);
      if (!teamAt()) emptied = d;
    }
    return { before, after: after.state, running: a.sync().running(), days: swept === null ? null : (swept - L) / DAY, emptied };
  }
  const SEATS = {
    C11t: [L => ({ trialEnds: L }), r => r.days === 29 && r.emptied === 29],
    C11u: [L => ({ trialEnds: L + 40 * DAY, lost: L }), r => r.days === 40 && r.emptied === 40],
    C11p: [L => ({ paidUntil: L }), r => r.days === 89 && r.emptied === 89],
    C11f: [L => ({ paidUntil: L + 365 * DAY, lost: L }), r => r.days === 89 && r.emptied === 89],
  };
  const seatLeg = id => async () => {
    const r = await seatScene(id.toLowerCase(), SEATS[id][0]);
    const ok = r.before === "working" && r.after !== "on" && !r.running && SEATS[id][1](r);
    return { ok, detail: brief(r) };
  };

  /* C12, a store the relay swept, made again: two computers on one store, both away until the relay sweeps it (`away`, the seat held
     throughout), or the seat lost, the store swept, and a seat bought again (`regained`). At the next look a fresh store stands in the
     folder, the first computer back made it, the second adopts it, and an edit made on each while away reaches the other. */
  async function remakeScene(name, way) {
    const w = worldOf(name), a = computer(w, "a"), b = computer(w, "b");
    const L = T0 + 10 * DAY;
    w.serviceSent.seat = way === "away" ? { lost: Infinity, paidUntil: T0 + 400 * DAY } : { lost: Infinity, trialEnds: L };
    if ((await a.look()).state !== "on" || (await b.look()).state !== "on") throw new Error("the store did not come on");
    await a.look();
    a.desk.keys.eTheme = "dark";
    await settle(a, b);
    const rt = a.sealed.keys.rt, row = () => (w.R.stores.get(rt) ? w.R.stores.get(rt).get("team") : null);
    for (let d = 1; w.R.clock.now + DAY < L; d++) { w.R.clock.now = T0 + d * DAY; await a.look(); await b.look(); await w.R.ring(rt); }
    /* Away: no look at all; regained: looks go on, refused once the trial is over. The alarm rings each day as the runtime rings it. */
    let sweptOn = null;
    for (let d = 0; d <= 120 && sweptOn === null; d++) {
      w.R.clock.now = L + d * DAY;
      if (way === "regained") { await a.look(); await b.look(); }
      await w.R.ring(rt);
      if (!row()) sweptOn = d;
    }
    a.desk.keys.eUiLang = "pl";
    b.desk.files["Away.ec"] = "{\"made\":\"while away\"}";
    if (way === "regained") w.serviceSent.seat = { lost: Infinity, paidUntil: w.R.clock.now + 400 * DAY };
    w.R.clock.now += DAY;
    const la = await a.look(), lb = await b.look();
    await a.look();
    await settle(a, b);
    const fresh = !!la.keys && la.keys.rt !== rt && !!lb.keys && lb.keys.rt === la.keys.rt && la.made === true && lb.made !== true;
    const reached = b.desk.keys.eUiLang === "pl" && a.desk.files["Away.ec"] === "{\"made\":\"while away\"}" && b.desk.keys.eTheme === "dark";
    const ok = sweptOn !== null && la.state === "on" && lb.state === "on" && fresh && reached && !row();
    return { ok, detail: brief({ sweptOn, a: la.state, b: lb.state, fresh, aMade: la.made, reached, oldGone: !row() }) };
  }

  /* G5a: a catalog file and an edit another computer made that this one could not put in place (a write that failed, a patch refused)
     are not taken as taken: nothing is recorded as removed, the other computer keeps both, and they arrive once the desk takes them. */
  async function unappliedScene() {
    const { w, a, b } = await twoOn("g5a");
    const L = "e3f9a1~Pack";
    b.desk.files["New.ec"] = "{\"v\":1}";
    b.desk.keys[L] = JSON.stringify({ edits: { c1: "from b" } });
    a.desk.refuse = new Set(["f:New.ec", "k:" + L]);
    await settle(a, b);
    const missed = !a.desk.files["New.ec"] && !a.desk.keys[L];
    a.desk.refuse = null;
    await settle(a, b);
    const ok = missed && b.desk.files["New.ec"] === "{\"v\":1}" && a.desk.files["New.ec"] === "{\"v\":1}" && !!b.desk.keys[L] && a.desk.keys[L] === b.desk.keys[L]
      && a.kept.length === 0 && b.kept.length === 0;
    return { ok, detail: brief({ missedWhileRefused: missed, bKeepsFile: !!b.desk.files["New.ec"], aGotFile: !!a.desk.files["New.ec"], bKeepsEdit: !!b.desk.keys[L], aGotEdit: a.desk.keys[L] === b.desk.keys[L], keptA: a.kept.length, keptB: b.kept.length }) };
  }
  /* G5b: a catalog file grown past the cap, and a layer value past its own, on the computer that has them: left out of what it syncs, never
     recorded as removed, so the other computer keeps its copy and its layer. */
  async function oversizeScene() {
    const { w, a, b } = await twoOn("g5b");
    const L = "e3f9a1~Pack";
    a.desk.files["Big.ec"] = "{\"v\":1}";
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "small" } });
    await settle(a, b);
    const shared = b.desk.files["Big.ec"] === "{\"v\":1}" && b.desk.keys[L] === a.desk.keys[L];
    a.desk.files["Big.ec"] = "{\"v\":\"" + "x".repeat(SY.CATALOG_MAX) + "\"}";
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "y".repeat(8 * 1024 * 1024) } });
    await settle(a, b);
    const ok = shared && b.desk.files["Big.ec"] === "{\"v\":1}" && !!b.desk.keys[L] && JSON.parse(b.desk.keys[L]).edits.c1 === "small" && a.desk.files["Big.ec"].length > SY.CATALOG_MAX
      && b.kept.length === 0;
    return { ok, detail: brief({ shared, bKeepsFile: b.desk.files["Big.ec"] === "{\"v\":1}", bKeepsLayer: !!b.desk.keys[L], keptB: b.kept.length }) };
  }

  /* H1: what a computer holds back keeps its place in the store: a catalog it synced, held once its folder is a team's, and an edit whose
     layer then grows past its cap, the second computer away throughout. Its place keeps the catalog's bytes and its sync file the edit's
     value, so a computer that joins after takes both from this place alone, and nothing is kept aside. */
  async function heldPlaceScene() {
    const { w, a, b } = await twoOn("h1");
    const L = "e3f9a1~Pack", F = "Own.ec", text = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "own", cards: [] });
    b.down.on = true;
    a.desk.files[F] = text;
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "small" } });
    await settle(a);
    a.desk.team = true;
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "small" }, notes: { c2: "y".repeat(8 * 1024 * 1024) } });
    await settle(a);
    const blob = fs.existsSync(path.join(a.dir, a.sync().state().rt, SY.fileRel(a.me.id, "f:" + F)));
    w.R.clock.now += HOUR;
    const c = computer(w, "c");
    const lc = await c.look();
    await a.look();
    await settle(a, c); await settle(a, c);
    const onC = c.desk.files[F] === text, editC = !!c.desk.keys[L] && (() => { try { return JSON.parse(c.desk.keys[L]).edits.c1 === "small"; } catch { return false; } })();
    const ok = lc.state === "on" && blob && onC && editC && a.kept.length + c.kept.length === 0;
    return { ok, detail: brief({ c: lc.state, blob, onC, editC, kept: [a.kept.length, c.kept.length] }) };
  }

  /* G5p: a field or map key named __proto__ (or constructor) from another computer's sync file: not an item that follows, and put back
     into a layer it touches nothing beyond that layer; the main process's Object.prototype is never written. */
  async function protoScene() {
    const bad = ["k:e3f9a1~Pack#__proto__/polluted", "k:e3f9a1~Pack#edits/__proto__", "k:e3f9a1~Pack#constructor/polluted", "k:e3f9a1~Pack#hidden[]__proto__"];
    const fine = ["k:e3f9a1~Pack#edits/c1", "k:e3f9a1~Pack#hidden[]c__proto__d", "k:e3f9a1~Pack#prototypes"].filter(i => !SY.follows(i));
    const followed = bad.filter(i => SY.follows(i));
    const doc = { kind: SY.SYNC_KIND, format: 1, by: "k-0123456789abcdef", items: {} };
    for (const i of bad) doc.items[i] = { h: SY.sha("1"), by: "k-0123456789abcdef", t: 1, seen: {}, v: "1" };
    const read = SY.syncRead(JSON.stringify(doc), "k-0123456789abcdef");
    let text = null;
    try { text = SY.layerText({ "k:e3f9a1~Pack#__proto__/polluted": "1", "k:e3f9a1~Pack#edits/c1": "\"kept\"" }, "e3f9a1~Pack"); } catch { text = "threw"; }
    const polluted = ({}).polluted !== undefined;
    delete Object.prototype.polluted;
    const ok = followed.length === 0 && fine.length === 0 && !!read && Object.keys(read.items).length === 0 && !polluted && typeof text === "string" && text.indexOf("kept") >= 0;
    return { ok, detail: brief({ followed, refusedFine: fine, readItems: read ? Object.keys(read.items).length : null, polluted, layer: text }) };
  }

  /* G5k: the same card changed on both computers offline, round after round, b's change the later each round: each round's earlier
     version is kept aside, and one its own writer has since overtaken is let go, so each computer keeps a's last round alone, not one
     per round. */
  async function keptGrowthScene() {
    const { w, a, b } = await twoOn("g5k");
    const L = "e3f9a1~Pack", C1 = "k:" + L + "#edits/c1";
    a.desk.keys[L] = JSON.stringify({ edits: { c1: "start" } });
    await settle(a, b);
    for (let round = 1; round <= 3; round++) {
      a.down.on = true; b.down.on = true;
      w.R.clock.now += MIN;
      a.desk.keys[L] = JSON.stringify({ edits: { c1: "a" + round } });
      a.edit();
      w.R.clock.now += MIN;
      b.desk.keys[L] = JSON.stringify({ edits: { c1: "b" + round } });
      b.edit();
      a.down.on = false; b.down.on = false;
      await settle(a, b);
    }
    const keptA = a.sync().state().kept.filter(k => k.item === C1), keptB = b.sync().state().kept.filter(k => k.item === C1);
    const last = sha(JSON.stringify("a3"));
    const ok = keptA.length === 1 && keptB.length === 1 && keptA[0].by === a.me.id && keptB[0].by === a.me.id && keptA[0].h === last && keptB[0].h === last;
    return { ok, detail: brief({ keptA: keptA.length, keptB: keptB.length }) };
  }
  /* G5i: another computer's sync file past ITEMS_MAX items is refused whole, never read as its first ITEMS_MAX with the rest dropped. */
  async function itemsCapScene() {
    const by = "k-0123456789abcdef", items = {};
    for (let i = 0; i <= 65536; i++) items["k:e" + i.toString(36) + "~Pack#edits/c"] = { h: null, by, t: 1, seen: {} };
    const over = SY.syncRead(JSON.stringify({ kind: SY.SYNC_KIND, format: 1, by, items }), by);
    delete items[Object.keys(items)[0]];
    const at = SY.syncRead(JSON.stringify({ kind: SY.SYNC_KIND, format: 1, by, items }), by);
    const ok = over === null && !!at && Object.keys(at.items).length === 65536;
    return { ok, detail: brief({ overRead: over === null ? "refused" : Object.keys(over.items).length, atCap: at ? Object.keys(at.items).length : null }) };
  }

  /* J1: a second computer joins a store that holds content, an hour after the first set its settings and deleted its sample, holding
     what it had before its first sign-in: its settings give way to the store's, its untouched sample is removed as the store says
     rather than bringing the deleted one back, its own card and catalog stand on both, a setting only it holds reaches the store, and
     no version is kept, since nothing was changed on two computers. */
  async function joinScene() {
    const w = worldOf("j1"), a = computer(w, "a");
    a.desk.files["sample-catalog.ec"] = SAMPLE;
    if ((await a.look()).state !== "on") throw new Error("the store did not come on");
    await settle(a);
    a.desk.keys.eTheme = "dark";
    a.desk.keys.eUiLang = "pl";
    delete a.desk.files["sample-catalog.ec"];
    await settle(a);
    w.R.clock.now += HOUR;
    const b = computer(w, "b");
    Object.assign(b.desk.keys, { eTheme: "light", eUiLang: "en", eMotionOff: "1", [L8]: JSON.stringify({ custom: [{ id: "u:mine", c: "k1", t: { en: "made before sign-in" } }] }) });
    b.desk.files["sample-catalog.ec"] = SAMPLE;
    b.desk.files["Mine.ec"] = "{\"made\":\"before sign-in\"}";
    const lb = await b.look();
    await a.look();
    await settle(a, b);
    const store = a.desk.keys.eTheme === "dark" && b.desk.keys.eTheme === "dark" && a.desk.keys.eUiLang === "pl" && b.desk.keys.eUiLang === "pl";
    const sample = !has(a.desk.files, "sample-catalog.ec") && !has(b.desk.files, "sample-catalog.ec");
    const own = a.desk.files["Mine.ec"] === "{\"made\":\"before sign-in\"}" && b.desk.files["Mine.ec"] === a.desk.files["Mine.ec"]
      && (packOf(a).custom || []).some(m => m.id === "u:mine") && (packOf(b).custom || []).some(m => m.id === "u:mine");
    const onlyHere = a.desk.keys.eMotionOff === "1" && b.desk.keys.eMotionOff === "1";
    const none = a.kept.length + b.kept.length === 0 && a.sync().state().kept.length + b.sync().state().kept.length === 0;
    return { ok: lb.state === "on" && store && sample && own && onlyHere && none,
      detail: brief({ b: lb.state, theme: [a.desk.keys.eTheme, b.desk.keys.eTheme], lang: [a.desk.keys.eUiLang, b.desk.keys.eUiLang], sample: [has(a.desk.files, "sample-catalog.ec"), has(b.desk.files, "sample-catalog.ec")],
        own, onlyHere, kept: [a.sync().state().kept.length, b.sync().state().kept.length] }) };
  }

  /* C2b: a catalog written on a reaches b; a then leaves the store (This computer), and c joins: the catalog's entry on b still names a
     as its writer, and its bytes are under b's place alone, so c takes them from there, by their hash. */
  async function leftWriterScene() {
    const { w, a, b } = await twoOn("c2b");
    const X = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "work", cards: [] });
    a.desk.files["Work.ec"] = X;
    await settle(a, b);
    const onB = b.desk.files["Work.ec"] === X && !!b.sync().state().ledger["f:Work.ec"] && b.sync().state().ledger["f:Work.ec"].by === a.me.id;
    const la = await a.look();
    const left = await ST.storeLeave({ folder: ST.folderFor("microsoft", { ask: w.f.askFor(w.f), token: () => "access-token" }), keys: a.sealed.keys, me: { pub: a.me.pub },
      relay: relayIo(w.R, w.relaySent, a.me), cert: async () => la.store });
    a.stopAll();
    const c = computer(w, "c");
    const lc = await c.look();
    await b.look();
    await settle(b, c);
    const listed = (ST.keyRead(w.f.text) || { devices: [] }).devices.map(d => d.id);
    const ok = onB && left.ok === true && lc.state === "on" && listed.indexOf(a.me.id) < 0 && c.desk.files["Work.ec"] === X && c.kept.length === 0;
    return { ok, detail: brief({ onB, left: left.ok, c: lc.state, aListed: listed.indexOf(a.me.id) >= 0, onC: c.desk.files["Work.ec"] === X, keptC: c.kept.length }) };
  }

  /* S6: one version stands where two computers wrote the same bytes, the winner's own `seen` lower than what the other's entry shows; a
     later edit here is then made over both, so the next merge keeps no copy and calls nothing a conflict. Once with another computer's
     entry the one taken (the review's own sequence), once with this computer's own entry the one that stands. */
  async function seenScene() {
    const A = "k-" + "a".repeat(16), B = "k-" + "b".repeat(16), Cc = "k-" + "c".repeat(16), item = "k:e3f9a1~Pack#notes/c1";
    const v3 = JSON.stringify("v3"), v4 = JSON.stringify("v4"), h3 = SY.sha(v3), dark = { h: SY.sha("dark"), by: A, t: 1, seen: {} };
    const eC = { h: h3, by: Cc, t: 100, seen: { [B]: 200 }, v: v3 };
    const round = (ledger, theirs, now1, now2) => {
      const r1 = SY.mergeOnce({ me: A, now: now1, state: { ledger, kept: [] }, local: Object.assign({ "k:eTheme": "dark" }, ledger[item] ? { [item]: v3 } : {}), theirs });
      const r2 = SY.mergeOnce({ me: A, now: now2, state: r1.state, local: { "k:eTheme": "dark", [item]: v4 }, theirs });
      return { seenC: (r1.state.ledger[item] || { seen: {} }).seen[Cc], copies: r2.copies.length, kept: r2.state.kept.length, stands: !!r2.state.ledger[item] && r2.state.ledger[item].h === SY.sha(v4) };
    };
    const taken = round({ "k:eTheme": dark }, [{ by: B, items: { [item]: { h: h3, by: B, t: 300, seen: { [Cc]: 50 }, v: v3 } } }, { by: Cc, items: { [item]: eC } }], 50, 80);
    const own = round({ "k:eTheme": dark, [item]: { h: h3, by: A, t: 300, seen: { [Cc]: 50 } } }, [{ by: Cc, items: { [item]: { h: h3, by: Cc, t: 100, seen: {}, v: v3 } } }], 350, 400);
    const good = x => x.seenC === 100 && x.copies === 0 && x.kept === 0 && x.stands;
    return { ok: good(taken) && good(own), detail: brief({ taken, own }) };
  }

  /* SA: the same value written on two computers, each merging the other's first entry before either sends again (a setting, a card starred,
     a catalog removed): each stands made over the other, and every merge after, on both computers, runs, keeps the value, keeps nothing
     and moves nothing. mergeOnce alone. */
  async function sameValueScene() {
    const A = "k-" + "a".repeat(16), B = "k-" + "b".repeat(16);
    const placed = (r, me) => SY.syncRead(r.own[SY.syncRel(me)], me);
    const one = (item, local, files) => {
      const fileOf = (by, it, h) => (files && files[it] && SY.sha(files[it]) === h ? files[it] : null);
      const a0 = SY.mergeOnce({ me: A, now: 100, state: { ledger: {}, kept: [] }, local, theirs: [] });
      const b0 = SY.mergeOnce({ me: B, now: 200, state: { ledger: {}, kept: [] }, local, theirs: [] });
      const a1 = SY.mergeOnce({ me: A, now: 300, state: a0.state, local, theirs: [placed(b0, B)], fileOf });
      const b1 = SY.mergeOnce({ me: B, now: 300, state: b0.state, local, theirs: [placed(a0, A)], fileOf });
      const out = { ran: true, moved: 0, copies: 0, kept: 0, stands: true };
      try {
        let sa = a1, sb = b1;
        for (let i = 0; i < 3; i++) {
          const na = SY.mergeOnce({ me: A, now: 400 + i, state: sa.state, local, theirs: [placed(sb, B)], fileOf });
          const nb = SY.mergeOnce({ me: B, now: 400 + i, state: sb.state, local, theirs: [placed(sa, A)], fileOf });
          out.moved += Object.keys(na.patch).length + Object.keys(nb.patch).length;
          out.copies += na.copies.length + nb.copies.length;
          sa = na; sb = nb;
        }
        out.kept = sa.state.kept.length + sb.state.kept.length;
        const h = has(local, item) ? SY.sha(local[item]) : null;
        out.stands = !!sa.state.ledger[item] && sa.state.ledger[item].h === h && !!sb.state.ledger[item] && sb.state.ledger[item].h === h;
      } catch (e) { out.ran = String(e && e.message || e).slice(0, 80); }
      return out;
    };
    const setting = one("k:eTheme", { "k:eTheme": "dark" });
    const star = one("k:e3f9a1~Pack#favourites[]c1", { "k:e3f9a1~Pack#favourites[]c1": JSON.stringify("c1") });
    const good = x => x.ran === true && x.moved === 0 && x.copies === 0 && x.kept === 0 && x.stands;
    return { ok: good(setting) && good(star), detail: brief({ setting, star }) };
  }

  const seat = c => { const s = c.sync(); if (typeof s.seated === "function") s.seated(); };
  /* J5: a second computer joins while the first, which made the store, has sent nothing yet (offline since its look): the joiner still
     joins, so its own setting and its untouched sample give way to the first computer's setting and its removal of the sample once those
     arrive, nothing kept. Each computer's account seated (sync.cjs seated, as main.js storeMine calls it) before its look. */
  async function joinEarlyScene() {
    const F = "sample-catalog.ec";
    const w = worldOf("j5"), a = computer(w, "a");
    a.desk.files[F] = SAMPLE; a.desk.keys.eTheme = "light";
    seat(a);
    a.down.on = true;
    if ((await a.look()).state !== "on") throw new Error("the store did not come on");
    w.R.clock.now += MIN;
    a.desk.keys.eTheme = "dark"; delete a.desk.files[F];
    a.edit();
    w.R.clock.now += HOUR;
    const b = computer(w, "b");
    b.desk.files[F] = SAMPLE; b.desk.keys.eTheme = "blue";
    seat(b);
    const lb = await b.look();
    await a.look();
    await settle(b);
    a.down.on = false;
    await settle(a, b); await settle(a, b);
    const held = { a: a.desk.keys.eTheme, b: b.desk.keys.eTheme, sampleA: has(a.desk.files, F), sampleB: has(b.desk.files, F), kept: a.kept.length + b.kept.length, join: b.sync().state().join };
    const ok = lb.state === "on" && held.a === "dark" && held.b === "dark" && !held.sampleA && !held.sampleB && held.kept === 0;
    return { ok, detail: brief(held) };
  }
  /* J6: a joining computer's changes made after its account was seated and before its first cycle reaches the store are its own writes:
     a setting changed then stands over the store's on both computers, and the shipped sample it removed then stays removed on both, the
     first computer's copy kept there, where what it held when seated gives way. */
  async function joinSinceScene() {
    const F = "sample-catalog.ec";
    const w = worldOf("j6"), a = computer(w, "a");
    a.desk.files[F] = SAMPLE; a.desk.keys.eUiLang = "de"; a.desk.keys.eTheme = "light";
    seat(a);
    if ((await a.look()).state !== "on") throw new Error("the store did not come on");
    await settle(a);
    w.R.clock.now += HOUR;
    const b = computer(w, "b");
    b.desk.files[F] = SAMPLE; b.desk.keys.eUiLang = "en"; b.desk.keys.eTheme = "dark";
    seat(b);
    w.R.clock.now += MIN;
    b.desk.keys.eUiLang = "pl"; delete b.desk.files[F];
    b.down.on = true;
    const lb = await b.look();
    await a.look();
    b.down.on = false;
    await settle(a, b); await settle(a, b);
    const held = { a: a.desk.keys.eUiLang, b: b.desk.keys.eUiLang, themeB: b.desk.keys.eTheme, sampleA: has(a.desk.files, F), sampleB: has(b.desk.files, F) };
    const ok = lb.state === "on" && held.a === "pl" && held.b === "pl" && held.themeB === "light" && !held.sampleA && !held.sampleB;
    return { ok, detail: brief(held) };
  }

  /* K15: a version kept here (A's earlier catalog) is let go only once the version overtaking it is here: A's later write whose sync file
     came before its bytes leaves the kept entry standing and takes nothing; once the bytes come, it is taken and the kept one let go. The
     same where both changed it again, the overtaking side's bytes missing. mergeOnce alone. */
  async function keptArrivedScene() {
    const A = "k-" + "a".repeat(16), B = "k-" + "b".repeat(16), item = "f:Cat.ec";
    const v1 = "{\"v\":1}", v2 = "{\"v\":2}", v3 = "{\"v\":3}", v4 = "{\"v\":4}";
    const k1 = { item, by: A, t: 100, h: SY.sha(v1) }, mineE = { h: SY.sha(v2), by: B, t: 200, seen: {} };
    const run = (theirsE, local, files) => SY.mergeOnce({ me: B, now: 500, state: { ledger: { [item]: mineE }, kept: [k1] }, local, theirs: [{ by: A, items: { [item]: theirsE } }],
      fileOf: (by, it, h) => (files[h] || null) });
    const over = { h: SY.sha(v3), by: A, t: 300, seen: { [B]: 200 } };
    const early = run(over, { [item]: v2 }, {}), late = run(over, { [item]: v2 }, { [SY.sha(v3)]: v3 });
    const both = { h: SY.sha(v3), by: A, t: 300, seen: {} };
    const mine2 = { [item]: v4 };
    const r2 = SY.mergeOnce({ me: B, now: 500, state: { ledger: { [item]: { h: SY.sha(v4), by: B, t: 400, seen: {} } }, kept: [k1] }, local: mine2, theirs: [{ by: A, items: { [item]: both } }], fileOf: () => null });
    const held = { earlyKept: early.state.kept.length, earlyPatch: Object.keys(early.patch).length, lateKept: late.state.kept.length, latePatch: late.patch[item] === v3, conflictKept: r2.state.kept.some(k => k.by === A && k.t === 100) };
    const ok = held.earlyKept === 1 && held.earlyPatch === 0 && held.lateKept === 0 && held.latePatch && held.conflictKept;
    return { ok, detail: brief(held) };
  }

  /* J3: the store holds no entry for the shipped sample (the first computer had none when it synced); a second computer joins with its
     sample untouched: through every merge after the first, it is never recorded as that computer's write, so the first never gets it,
     and nothing is kept. Edited there, it is the person's own and reaches the first. */
  async function joinSampleScene() {
    const w = worldOf("j3"), a = computer(w, "a");
    a.desk.keys.eTheme = "dark";
    if ((await a.look()).state !== "on") throw new Error("the store did not come on");
    await settle(a);
    w.R.clock.now += HOUR;
    const b = computer(w, "b");
    b.desk.files["sample-catalog.ec"] = SAMPLE;
    const lb = await b.look();
    await a.look();
    await settle(a, b);
    await settle(a, b);
    const quiet = !has(a.desk.files, "sample-catalog.ec") && b.desk.files["sample-catalog.ec"] === SAMPLE && !b.sync().state().ledger["f:sample-catalog.ec"]
      && a.kept.length + b.kept.length === 0 && b.desk.keys.eTheme === "dark";
    const edited = SAMPLE.replace("\"cards\":[]", "\"cards\":[],\"note\":\"mine\"");
    w.R.clock.now += MIN;
    b.desk.files["sample-catalog.ec"] = edited;
    await settle(a, b);
    const own = a.desk.files["sample-catalog.ec"] === edited && a.kept.length + b.kept.length === 0;
    return { ok: lb.state === "on" && quiet && own, detail: brief({ b: lb.state, onA: has(a.desk.files, "sample-catalog.ec"), entryOnB: !!b.sync().state().ledger["f:sample-catalog.ec"], kept: [a.kept.length, b.kept.length], quiet, own }) };
  }
  /* J4: a joining computer removes the shipped sample it joined with untouched. Where the first computer holds an entry for it (it synced
     the sample untouched, recording it, as the store's first computer does) and the joiner has not yet put that entry in place (its write
     refused): the removal is the person's own, made over the first computer's entry, so the first computer's copy goes too, the sample
     does not come back to the joiner, and nothing is kept. Where no computer holds an entry: nothing is sent and nothing comes back. */
  async function joinRemoveScene() {
    const F = "sample-catalog.ec", item = "f:" + F;
    const w = worldOf("j4"), a = computer(w, "a");
    a.desk.files[F] = SAMPLE;
    a.desk.keys.eTheme = "dark";
    if ((await a.look()).state !== "on") throw new Error("the store did not come on");
    await settle(a);
    const aEntry = !!a.sync().state().ledger[item] && a.sync().state().ledger[item].by === a.me.id;
    w.R.clock.now += HOUR;
    const b = computer(w, "b");
    b.desk.files[F] = SAMPLE;
    b.desk.refuse = new Set([item]);
    const lb = await b.look();
    await a.look();
    await settle(a, b);
    const waiting = (b.sync().state().untouched || []).indexOf(item) >= 0 && !b.sync().state().ledger[item];
    b.desk.refuse = null;
    w.R.clock.now += MIN;
    delete b.desk.files[F];
    await settle(a, b);
    await settle(a, b);
    const e = b.sync().state().ledger[item];
    const held = { aEntry, waiting, onA: has(a.desk.files, F), backOnB: has(b.desk.files, F), removalByB: !!e && e.h === null && e.by === b.me.id, kept: a.kept.length + b.kept.length };
    const w2 = worldOf("j4n"), c = computer(w2, "c");
    c.desk.keys.eTheme = "dark";
    if ((await c.look()).state !== "on") throw new Error("the store did not come on");
    await settle(c);
    w2.R.clock.now += HOUR;
    const d = computer(w2, "d");
    d.desk.files[F] = SAMPLE;
    await d.look();
    await c.look();
    await settle(c, d);
    w2.R.clock.now += MIN;
    delete d.desk.files[F];
    await settle(c, d);
    await settle(c, d);
    const none = { onC: has(c.desk.files, F), backOnD: has(d.desk.files, F), entryOnD: !!d.sync().state().ledger[item], entryOnC: !!c.sync().state().ledger[item], kept: c.kept.length + d.kept.length };
    const ok = lb.state === "on" && held.aEntry && held.waiting && !held.onA && !held.backOnB && held.removalByB && held.kept === 0
      && !none.onC && !none.backOnD && !none.entryOnD && !none.entryOnC && none.kept === 0;
    return { ok, detail: brief({ held, none }) };
  }

  /* B2: the page's copy of the desk (createDeskBridge). A write naming a tell before the one that took items behind it answers those items'
     entries before the take, and the next write nothing; a write naming that tell answers nothing; a key cleared whole is dropped from a write
     behind it; a key the page may hold but the desk lacks, under a clear of every key that follows, is dropped from a write behind it, and
     kept from a write after it; a load holds every tell before it. */
  async function bridgeScene() {
    const b = SY.createDeskBridge(), X = { h: "a".repeat(64), by: "k-" + "1".repeat(16), t: 5, seen: {} };
    const n1 = b.tell({ ePack: "{}" }, { ePack: { "k:ePack#overrides/c1": X, "k:ePack#overrides/c2": null } });
    const behind = b.write(1, ["ePack"], { ePack: n1 - 1 }), again = b.write(1, ["ePack"], { ePack: n1 - 1 });
    const n2 = b.tell({ ePack: "{}" }, { ePack: { "k:ePack#overrides/c1": X } });
    const taken = b.write(1, ["ePack"], { ePack: n2 });
    const n3 = b.tell({ ePack: null });
    const whole = b.write(1, ["ePack", "eTheme"], { ePack: n3 - 1, eTheme: n3 - 1 });
    const n4 = b.tell({}, null, k => k === "eLinksAside");
    const every = b.write(1, ["eLinksAside"], { eLinksAside: n4 - 1 }), after = b.write(1, ["eLinksAside"], { eLinksAside: n4 });
    b.tell({ eTheme: "dark" }, { eTheme: { "k:eTheme": X } });
    b.load(2);
    const loaded = b.write(2, ["eTheme"], {});
    const ok = JSON.stringify(behind.rewind) === JSON.stringify({ "k:ePack#overrides/c1": X, "k:ePack#overrides/c2": null }) && !behind.dropped.length
      && !Object.keys(again.rewind).length && !Object.keys(taken.rewind).length && whole.dropped.join() === "ePack" && every.dropped.join() === "eLinksAside"
      && !after.dropped.length && !Object.keys(loaded.rewind).length;
    return { ok, detail: brief({ behind, again, taken, whole, every, after, loaded }) };
  }

  const results = {};
  const LEGS = [
    ["K15", keptArrivedScene, "a kept version is let go only once the version overtaking it is here: its sync file before its bytes leaves the kept entry and takes nothing, its bytes come and it is taken and the kept let go; the same in a conflict"],
    ["J5", joinEarlyScene, "a second computer joining before the first, which made the store, has sent anything still joins: its setting and untouched sample give way to the first's setting and removal of the sample once they arrive, nothing kept"],
    ["J6", joinSinceScene, "a joining computer's setting changed and sample removed after its account was seated, before its first cycle, are its own: the setting stands on both and the sample stays removed on both, while what it held when seated gives way"],
    ["H1", heldPlaceScene, "a catalog held back once the folder is a team's, and an edit whose layer grew past its cap, keep their bytes in this computer's place: a computer joining after takes both from it alone, nothing kept aside"],
    ["SA", sameValueScene, "the same value written on two computers, each merging the other's first entry before either sends again: every merge after runs on both, the value stands, nothing kept or moved, for a setting and for a card starred"],
    ["B2", bridgeScene, "the page's copy of the desk: a write from a copy behind a tell answers what that tell took, once; one after it nothing; a key cleared whole, or held under a clear of every key, is dropped from a write behind it and kept from one after; a load holds every tell before it"],
    ["J3", joinSampleScene, "the shipped sample untouched on a computer joining a store that holds no entry for it is never recorded as that computer's write at any merge, so the other computer never gets it and nothing is kept; edited, it is the person's own and reaches the other"],
    ["J4", joinRemoveScene, "a joining computer removing the sample it joined with untouched: where the first computer holds an entry the removal travels over it, the first computer's copy goes and the sample does not return, nothing kept; where none does, nothing is sent and nothing returns"],
    ["S6", seenScene, "where one version stands over two computers' writes, each computer's seen time is the latest over every entry merged, so a later edit here is made over both: no copy kept and no conflict, with another's entry taken or this computer's own standing"],
    ["C2b", leftWriterScene, "a catalog whose writer has left the store reaches a computer that joins after, from the place of a listed computer holding it under the same hash"],
    ["J1", joinScene, "a second computer joining a store that holds content takes the store's settings, removes its untouched sample where the store removed it, keeps its own card and catalog on both, and offers a setting only it holds, with no version kept"],
    ["G5k", keptGrowthScene, "the same card changed on both computers offline three rounds running: each keeps the earlier writer's last round alone, the overtaken ones let go"],
    ["G5i", itemsCapScene, "another computer's sync file past ITEMS_MAX items is refused whole, not read with its tail dropped; one at the cap is read whole"],
    ["G5p", protoScene, "a layer field or map key named __proto__ or constructor from another computer is no item that follows, and put back into a layer never writes Object.prototype"],
    ["G5a", unappliedScene, "a catalog file and an edit this computer could not put in place are not taken as taken: nothing recorded removed, the other computer keeps both, and they arrive once taken"],
    ["G5b", oversizeScene, "a catalog file and a layer value grown past their caps are left out, never recorded as removed: the other computer keeps its copy and its layer"],
    ["S1", followsScene, "a setting, an edit over a catalog and a catalog file changed on one computer reach the other through the relay, nothing of them in the clear"],
    ["C7", staysScene, "a team key, a team mirror's file, a sign-in token and the desk's identity key on the desk reach neither the computer's place, nor the relay, nor the folder's file"],
    ["C8", bothScene, "the same edit and catalog changed on two computers offline: the later write in place on both and the earlier kept aside on both; one side's change and a setting's later write merge without a copy; a version chosen by its value alone is put in place and stands on both"],
    ["C8f", fieldsScene, "different cards of one catalog changed on two computers offline, and a card added on one: every change stands on both and no version is kept"],
    ["C8h", hiddenScene, "a different card hidden on each computer offline: both end hidden on both with no version kept, and a card shown again on one is shown again on both"],
    ["C8o", ownScene, "an own card added on each computer offline: both kept on both with no version kept, and one deleted on one is gone from both"],
    ["C8x", () => sameScene("b"), "the same card shown again on one computer and hidden later on the other, beside a different card hidden on each: that card is the one conflict, the later hide in place on both and the earlier showing again kept on both as a removal; the showing again chosen on the computer that made it stands on both"],
    ["C8y", () => sameScene("a"), "the same conflict chosen on the computer that hid the card, for the hide in place: it stands on both and nothing waits"],
    ["C10o", outboxScene, "a lapsed store certificate pauses sync and sends nothing; edits wait in the outbox and at the next look that is on are sent, and what came is taken"],
    ["C11t", seatLeg("C11t"), "a trial that ends, its store renewed at each look: working the day before, sync stops at the seat's end, and the relay sweeps the store 30 days after the last look that held a seat, 29 days on"],
    ["C11u", seatLeg("C11u"), "a trial seat freed 40 days before the trial would end: sync stops, and the store is swept at the last grant's end, 40 days on, the one case past 30 days after the last look"],
    ["C11p", seatLeg("C11p"), "a paid licence that ends: sync stops, and the store is swept 90 days after the last look that held a seat, 89 days on"],
    ["C11f", seatLeg("C11f"), "a paid seat freed with the licence running: sync stops, and the store is swept 90 days after the last look that held a seat, 89 days on"],
    ["C12a", () => remakeScene("c12a", "away"), "a store the relay swept while both computers were away, the seat held: the first back makes a fresh store, the second adopts it, and what each made while away reaches the other"],
    ["C12r", () => remakeScene("c12r", "regained"), "a seat bought again after the store was swept: a fresh store is made and adopted, and what each computer made meanwhile reaches the other"],
    ["C1a", raceScene, "two computers that each read back their own store both replace and the earlier store ends; the earlier computer adopts the folder's store at its next look and every edit it made reaches the new store"],
  ];
  for (const [id, scene, line] of LEGS) {
    const r = await safe(scene);
    results[id] = r;
    check(r.ok === true, id + " " + line + ": " + r.detail);
  }

  /* ---- the plants: each guard lifted, or a fault put in, in a copy of shell/sync/sync.cjs turns its leg red ---- */
  const PRODUCT = path.join(ROOT, "shell", "sync", "sync.cjs");
  let copies = 0;
  async function planted(change, fn) {
    const digest = sha(fs.readFileSync(PRODUCT)), kept = SY;
    let turned = false, detail = "plant line absent";
    try {
      const text = fs.readFileSync(PRODUCT, "utf8");
      const next = change(text);
      if (next !== null && next !== text) {
        const dir = path.join(WORK, "p" + (++copies));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "sync.cjs"), next);
        SY = require(path.join(dir, "sync.cjs"));
        const r = await safe(fn);
        turned = r.ok !== true;
        detail = turned ? "the leg turned red" : "the leg still held";
      }
    } catch (e) { detail = e && e.message ? e.message : String(e); }
    finally { SY = kept; }
    return { turned, back: sha(fs.readFileSync(PRODUCT)) === digest, detail };
  }
  const lift = tag => text => { const lines = text.split(/\n/), at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
  const swap = (from, to) => text => (text.split(from).length === 2 ? text.split(from).join(to) : null);
  const scenes = Object.fromEntries(LEGS.map(([id, scene]) => [id, scene]));
  const PLANTS = [
    ["kept let go in a conflict", "K15", swap("settled(item, null, top.filter(e => (mine && same(e, mine) ? ownOf(e, item) : valueOf(e, item)) !== undefined)); /* plant:kept-overtaken */", "settled(item, null, top); /* plant:kept-overtaken */"), "a kept version let go in a conflict for one whose bytes have not come"],
    ["kept let go early", "K15", swap("      if (mine && same(win, mine)) {\n        settled(item, win);", "      settled(item, win);\n      if (mine && same(win, mine)) {"), "a kept version let go for one whose bytes have not come, so it is kept nowhere"],
    ["join by the store's files", "J5", swap("(st.join === true || (st.join === undefined && ", "((st.join === true || st.join === undefined) && ("), "joining read from another computer's sync file alone, so a computer joining before the first has sent takes itself for the first"],
    ["since seated unread", "J6", swap("const held0 = item => !before || ", "const held0 = item => true || "), "every item read as held before joining, so a change made after sign-in gives way"],
    ["removed since unrecorded", "J6", lift("join-removed"), "a removal made after sign-in, before the first merge, recorded nowhere, so the store's copy comes back"],
    ["held unplaced", "H1", swap("write(io, placeOf(o.me.id, state.ledger, Object.assign(heldPlaced(io, held), r.after))); /* plant:held-placed */", "write(io, r.own); /* plant:held-placed */"), "this computer's place written from what it holds alone, so a held catalog's bytes are removed and a held edit's value dropped"],
    ["same over each other", "SA", swap("let top = all.filter(a => !all.some(b => b !== a && !same(a, b) && over(b, a) && !over(a, b))); /* plant:top-mutual */", "let top = all.filter(a => !all.some(b => b !== a && !same(a, b) && over(b, a))); /* plant:top-mutual */"), "two entries each made over the other both set aside, so the merge finds no version standing and throws"],
    ["stale write whole", "B2", swap("const late = l.filter(x => x.n > at); /* plant:desk-stale */", "const late = []; /* plant:desk-stale */"), "a write from a copy behind a tell taken as the person's, so what the sync took is read as removed"],
    ["whole clear written back", "B2", swap("if (late.some(x => x.pre === null)) { dropped.push(k); continue; } /* plant:desk-whole */", "/* plant:desk-whole */"), "a key cleared whole written back from a copy behind the clear"],
    ["every clear written back", "B2", lift("desk-every"), "a key the page held behind a clear of every key written back under the next account"],
    ["join older", "J1", swap(" : !held0(item) ? now : joining ? 0 : ", " : !held0(item) ? now : joining ? now : "), "what a joining computer held before is stamped now, so its settings outrank the store's"],
    ["join sample", "J1", lift("join-pristine"), "an untouched sample on a joining computer taken as its own, so the one deleted elsewhere comes back as a conflict"],
    ["bytes by the writer alone", "C2b", swap("for (const id of new Set([by, ...ids, o.me.id])) {", "for (const id of new Set([by])) {"), "a catalog's bytes read only under the computer that wrote it, so once it has left the store they never arrive"],
    ["taken seen by the winner", "S6", swap("seen: maxSeen(unionSeen(...all.filter(e => !same(e, win) && e.by !== win.by)), win.seen) }; /* plant:seen-max */", "seen: Object.assign(unionSeen(...all.filter(e => !same(e, win) && e.by !== win.by)), win.seen) }; /* plant:seen-max */"), "the entry taken carries the winner's own lower seen times over the others', so a later edit here meets one it was made over as a conflict"],
    ["own seen by its own", "S6", swap("{ seen: unionSeen(...top) }); /* plant:seen-max-mine */", "{ seen: Object.assign(unionSeen(...top), mine.seen) }); /* plant:seen-max-mine */"), "this computer's standing entry keeps its own lower seen times over the others', so its next edit meets one it was made over as a conflict"],
    ["untouched recorded later", "J3", lift("untouched-skip"), "the untouched sample skipped only at the joining merge, so the next records it as this computer's write and the other computer gets it"],
    ["untouched removal unrecorded", "J4", lift("untouched-removal"), "the person's removal of an untouched sample recorded nowhere, so the first computer's entry puts it straight back"],
    ["one item added", "C7", swap("return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)); /* plant:follows */", "return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)) || s === \"k:eTeamKeys\"; /* plant:follows */"), "a team's keys follow"],
    ["later stands", "C8", swap("const stay = top.reduce(", "const stay = mine && top.some(e => same(e, mine)) ? mine : top.reduce("), "each computer keeps its own in place, so where its own was the earlier the newer change is not in use"],
    ["own unkept", "C8", swap(" ? ownOf(e, item) : valueOf(e, item); /* plant:keep-own */", " ? undefined : valueOf(e, item); /* plant:keep-own */"), "a computer's own earlier version not kept aside where the later one replaces it"],
    ["choice unapplied", "C8", swap("const failed = o.apply(key ? { [\"k:\" + key]: layerText(after, key) } : { [item]: value }, []); /* plant:choose-applied */", "const failed = []; /* plant:choose-applied */"), "a choice recorded without its value put in place, so the version that stood is read as a newer change"],
    ["last-write-wins", "C8", swap("if (isSetting(item)) top = [", "if (true) top = ["), "a conflict is settled by the later write, the earlier version lost"],
    ["keep-both", "C8", lift("keep-both"), "the other side of a conflict is not kept"],
    ["whole keys", "C8f", swap("const parts = LAYER_RE.test(k) ? fieldsOf(v) : null; /* plant:fields */", "const parts = null; /* plant:fields */"), "a layer merged as one item, so two cards changed on two computers are a conflict"],
    ["hidden whole", "C8h", swap("const SET_IDS = [\"hidden\", ", "const SET_IDS = ["), "hidden cards merged as one list, so a different card hidden on each computer is a conflict"],
    ["removal unrecorded", "C8h", swap("if (was ? was.h === h : h === null) continue; /* plant:recorded */", "if (was ? was.h === h || (h === null && item.indexOf(\"[]\") > 0) : h === null) continue; /* plant:recorded */"), "a card shown again is not recorded for that card, so the other computer keeps it hidden"],
    ["own whole", "C8o", swap("const SET_OWN = [\"custom\", \"intentCustom\"];", "const SET_OWN = [\"intentCustom\"];"), "own cards merged as one list, so a card added on each computer is a conflict"],
    ["removal unkept", "C8x", swap("if (same(e, stay) || kept.some(", "if (same(e, stay) || e.h === null || kept.some("), "a removal kept as no version, so the earlier showing again is lost on both computers"],
    ["member by later write", "C8x", swap("if (isSetting(item)) top = [", "if (isSetting(item) || item.indexOf(\"[]\") > 0) top = ["), "the same card hidden and shown again settled by the later write with nothing kept, the earlier version lost"],
    ["outbox emptied", "C10o", swap("if (old) old.stop().catch(() => {}); /* plant:outbox-kept */", "if (old) { old.stop().catch(() => {}); const l = o.local() || {}; for (const i of Object.keys(state.ledger)) if (has(l, i)) state.ledger[i] = Object.assign({}, state.ledger[i], { h: sha(l[i]) }); } /* plant:outbox-kept */"), "the outbox emptied at the lapse: what waited is taken as sent"],
    ["resume", "C10o", lift("resume"), "sync does not start again at the next look that is on"],
    ["adopt", "C1a", lift("adopt"), "the store adopted is not where this computer's place is written, so its edits stay in the ended store"],
    ["unapplied", "G5a", swap("r = unapplied(state, r, o.apply(r.patch, r.copies), local, o.me.id); /* plant:unapplied */", "o.apply(r.patch, r.copies); /* plant:unapplied */"), "what the desk could not put in place is taken as taken, and the next merge removes it on the other computer"],
    ["held-kept", "G5b", lift("held-kept"), "an item left out for its size is recorded as removed"],
    ["held-value", "G5b", lift("held-value"), "a layer value past its cap is synced whole"],
    ["kept-overtaken", "G5k", lift("kept-overtaken"), "every round of a renewed conflict kept, none let go"],
    ["items-cap", "G5i", lift("items-cap"), "a file past the cap read with its tail dropped"],
    ["follows-proto", "G5p", swap(" && !PROTO_PART.test(s.slice(at)); /* plant:follows-proto */", "; /* plant:follows-proto */"), "a field named __proto__ follows"],
    ["layer-own", "G5p", text => { const x = swap("const pre = \"k:\" + key + \"#\", out = Object.create(null);", "const pre = \"k:\" + key + \"#\", out = {};")(text);
      return x && swap("if (!plain(out[f]) || !has(out, f)) out[f] = Object.create(null);", "if (!plain(out[f])) out[f] = {};")(x); }, "a layer put back on ordinary objects, so a __proto__ field writes Object.prototype"],
  ];
  /* The store's own guards, each lifted in a copy of store.cjs. */
  const STORE_PLANTS = [
    ["store-renew", "C11t", "the renewal lifted: the store lapses 45 days after it was made, the seat still held"],
    ["store-remake", "C12a", "no fresh store where the relay swept the old one: both computers stay on a store that is gone"],
    ["store-remake", "C12r", "no fresh store after a seat bought again: the computers stay on the swept store"],
  ];
  for (const [tag, id, what] of STORE_PLANTS) {
    const line = "p " + id + " " + tag + " lifted in a copy of shell/sync/store.cjs turns " + id + " red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const STORE = path.join(ROOT, "shell", "sync", "store.cjs"), digest = sha(fs.readFileSync(STORE)), was = ST;
    let turned = false, detail = "plant line absent";
    try {
      const next = lift(tag)(fs.readFileSync(STORE, "utf8"));
      if (next !== null) {
        const dir = path.join(WORK, "p-" + tag + "-" + id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "store.cjs"), next);
        ST = require(path.join(dir, "store.cjs"));
        const r = await safe(scenes[id]);
        turned = r.ok !== true;
        detail = turned ? "the leg turned red: " + r.detail : "the leg still held";
      }
    } catch (e) { detail = e && e.message ? e.message : String(e); }
    finally { ST = was; }
    check(results[id] && results[id].ok === true && turned && sha(fs.readFileSync(STORE)) === digest, line + ": " + detail);
  }
  for (const [name, id, change, what] of PLANTS) {
    const line = "p " + id + " " + name + " in a copy of shell/sync/sync.cjs turns " + id + " red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const base = results[id] && results[id].ok === true;
    const p = await planted(change, scenes[id]);
    check(base && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
}

try { await main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
