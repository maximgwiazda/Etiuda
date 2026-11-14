/* A PERSON'S STORE ON THE DESK: the key's life in the person's own folder (shell/sync/store.cjs). node tests/desk-store.mjs
 * Over stand-ins for OneDrive's App Folder, Google Drive's appDataFolder and the licence service, and the relay itself in memory
 * (relay/worker.mjs on relay/test/stand-ins.cjs); no leg calls a real provider. C1, C2, C3, C4, C6 and C10's line, each guard
 * named by a plant in a copy that turns its leg red, and no product file written. Node builtins only, no window. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "desk-store-plants-"));
const EXPECTED = 18;
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
const safe = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: "threw " + (e && e.message ? e.message : e) }; } };

let ST = null, C = null, S = null, K = null, W = null;
function keyPair() {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { id: "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16), pub, privateKey: p.privateKey, desk: "k-" + pub.slice(0, 16) };
}
const sKey = seed => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
const signWith = (privateKey, bytes) => crypto.sign(null, bytes, privateKey).toString("hex");

/* ---- the folders, as their owners document them ---- */
function graphStandIn() {
  const st = { text: null, drive: true, consent: true, full: false, offline: false, calls: [] };
  st.ask = async (method, url, headers, body) => {
    st.calls.push(method + " " + url.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, ""));
    if (st.offline) throw new TypeError("fetch failed");
    const json = (status, o) => ({ status, bytes: Buffer.from(JSON.stringify(o)) });
    if (!/^Bearer \S+$/.test(String(headers && headers.authorization))) return json(401, { error: { code: "InvalidAuthenticationToken" } });
    if (!st.consent) return json(403, { error: { code: "accessDenied" } });
    if (!st.drive) return json(404, { error: { code: "itemNotFound" } });
    if (method === "GET" && url === ST.GRAPH) return json(200, { id: "approot" });
    const file = ST.GRAPH + ":/" + ST.KEY_FILE + ":/content";
    if (method === "GET" && url === file) return st.text === null ? json(404, { error: { code: "itemNotFound" } }) : { status: 200, bytes: Buffer.from(st.text) };
    if (method === "PUT" && url.startsWith(file)) {
      if (st.full) return json(507, { error: { code: "quotaLimitReached" } });
      if (/conflictBehavior=fail$/.test(url) && st.text !== null) return json(409, { error: { code: "nameAlreadyExists" } });
      const was = st.text;
      st.text = Buffer.from(body).toString("utf8");
      return json(was === null ? 201 : 200, { id: "f" });
    }
    return json(400, { error: { code: "invalidRequest" } });
  };
  return st;
}
function driveStandIn() {
  /* Drive keeps every file a create makes, two of one name included; a list sorted by createdTime when asked, newest first otherwise. */
  const st = { files: [], n: 0, policy: "ok", full: false, offline: false, calls: [] };
  Object.defineProperty(st, "text", { get: () => (st.files.length ? st.files.slice().sort((a, b) => a.at - b.at)[0].text : null),
    set: v => { if (v === null) st.files = []; else if (st.files.length) st.files[0].text = v; } });
  st.ask = async (method, url, headers, body) => {
    st.calls.push(method + " " + url.replace(/^https:\/\/www\.googleapis\.com/, ""));
    if (st.offline) throw new TypeError("fetch failed");
    const json = (status, o) => ({ status, bytes: Buffer.from(JSON.stringify(o)) });
    const err = (status, reason) => json(status, { error: { code: status, errors: [{ reason }] } });
    if (st.policy === "consent") return err(403, "insufficientPermissions");
    if (st.policy === "domain") return err(403, "domainPolicy");
    const byId = id => st.files.find(f => f.id === id);
    if (method === "GET" && url.startsWith(ST.DRIVE + "?spaces=appDataFolder")) {
      const oldest = /orderBy=createdTime(&|$)/.test(url), list = st.files.slice().sort((a, b) => (oldest ? a.at - b.at : b.at - a.at));
      return json(200, { files: list.map(f => ({ id: f.id, createdTime: new Date(T0 + f.at).toISOString() })) });
    }
    const m = /\/files\/([A-Za-z0-9]+)\?(alt=media|uploadType=media)$/.exec(url);
    if (method === "GET" && m && byId(m[1])) return { status: 200, bytes: Buffer.from(byId(m[1]).text) };
    if (st.full && (method === "POST" || method === "PATCH")) return err(403, "storageQuotaExceeded");
    if (method === "POST" && url === ST.DRIVE_UPLOAD + "?uploadType=multipart") {
      const text = Buffer.from(body).toString("utf8"), parts = text.split(/\r\n--etiuda-[0-9a-f]+/);
      const meta = JSON.parse(parts[0].split("\r\n\r\n")[1]);
      if (meta.name !== ST.KEY_FILE || meta.parents.join() !== "appDataFolder") return err(400, "badRequest");
      const f = { id: "id" + crypto.randomBytes(4).toString("hex"), at: ++st.n, text: parts[1].split("\r\n\r\n").slice(1).join("\r\n\r\n") };
      st.files.push(f);
      return json(200, { id: f.id });
    }
    if (method === "PATCH" && m && byId(m[1]) && url.startsWith(ST.DRIVE_UPLOAD)) { byId(m[1]).text = Buffer.from(body).toString("utf8"); return json(200, { id: m[1] }); }
    return err(400, "badRequest");
  };
  return st;
}

/* ---- the licence service, standing in: store grants and certificates signed by the test delegate, as the service signs them ---- */
const via = at => K.delegationFor(at, { fields: { may: ["licence", "relay-grant"] } });
/* As the service does: a grant that says it replaces ends the person's other stores, by the notice posted to the relay. */
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
    kept.add(rt);
    const g = { kind: "etiuda-store-grant", format: 1, lead: sPub, code: CODE, issued: now, until: now + 30 * DAY, paid: true, via: via(now),
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
/* ---- the relay: the real one in memory; what the desk sends it is kept, to be read ---- */
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
    async devices(keys, cert) {
      const t = R.clock.now, list = keys.devices.map(d => ({ id: d.id, pub: d.pub, desk: d.desk }));
      const r = await relayCall(R, sent, "POST", "/t/" + keys.rt + "/devices", { keys: list, rev: keys.rev, t, sig: signWith(sKey(keys.s), C.devicesBytes(keys.rt, keys.rev, t, list)),
        seat: cert, by: { pub: me.pub, sig: signWith(me.privateKey, C.storeDevicesBytes(keys.rt, keys.rev, t, list)) } });
      return r.status === 200 ? { ok: true } : { ok: false, why: r.json && r.json.error };
    },
  };
}
async function opens(R, rt, me, cert) {
  const ch = await relayCall(R, [], "POST", "/t/" + rt + "/hello", {});
  const n = ch.json && ch.json.challenge;
  if (!n) return "hello " + ch.status;
  const s = await relayCall(R, [], "POST", "/t/" + rt + "/session", { challenge: n, key: me.id, pub: me.pub, sig: signWith(me.privateKey, C.helloBytes(rt, n, me.id)), seat: cert });
  return s.status === 200 ? "open" : "session " + (s.json && s.json.error);
}
/* A computer of the person: its own key at the relay and its own sealed copy, over one folder, service and relay. */
function computer(world, label) {
  const me = keyPair(), sealed = { keys: null }, said = [];
  const io = () => ({ folder: world.folder(), local: () => sealed.keys, keep: k => { sealed.keys = JSON.parse(JSON.stringify(k)); }, grant: async (rt, sPub, ...rest) => {
    const g = await world.service(rt, sPub, ...rest);
    return g.why ? g : { grant: g.grant, store: g.cert(me.pub) };
  }, relay: relayIo(world.R, world.relaySent, me), me, url: "https://relay.test/relay/v1", rand: n => crypto.randomBytes(n), ask: () => said.push("asked"), say: () => said.push("said") });
  return { label, me, sealed, said, look: () => ST.storeLook(io()) };
}
function worldOf(kind) {
  const R = S.relayEnv({ roots: K.ROOTS });
  R.clock.now = T0;
  const f = kind === "google" ? driveStandIn() : graphStandIn();
  const w = { R, f, relaySent: [], serviceSent: [] };
  w.folder = () => ST.folderFor(kind || "microsoft", { ask: f.ask, token: () => "access-token" });
  w.service = serviceStandIn(R, w.serviceSent);
  return w;
}

async function main() {
  try {
    ST = require(path.join(ROOT, "shell", "sync", "store.cjs"));
    C = require(path.join(ROOT, "relay", "core.cjs"));
    S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
    K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
    const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
    W = WORKER.routeWith(K.ROOTS, env => env.NOW());
  } catch (e) { check(false, "0a the modules load - " + e.message); return; }

  /* C1: the first computer finds no key and makes the store (the file in the folder, the store at the relay, itself enrolled), and a
     second computer of the same person reads it and syncs at its first look; neither shows nor asks anything. On both folders. */
  async function firstAndSecondScene(kind) {
    const w = worldOf(kind), a = computer(w, "a"), b = computer(w, "b");
    const la = await a.look();
    const fileAfterA = ST.keyRead(w.f.text);
    const openA = la.state === "on" ? await opens(w.R, la.keys.rt, a.me, la.store) : "off";
    const lb = await b.look();
    const openB = lb.state === "on" ? await opens(w.R, lb.keys.rt, b.me, lb.store) : "off";
    const file = ST.keyRead(w.f.text);
    const ok = la.state === "on" && la.made === true && !!fileAfterA && openA === "open" && lb.state === "on" && lb.made === false && lb.keys.rt === la.keys.rt
      && openB === "open" && !!file && file.devices.length === 2 && a.said.length === 0 && b.said.length === 0;
    return { ok, detail: brief({ a: la.state, made: la.made, openA, b: lb.state, sameStore: lb.keys && la.keys && lb.keys.rt === la.keys.rt, openB, enrolled: file && file.devices.length, said: a.said.concat(b.said) }) };
  }
  /* C1r: two of the person's computers, neither holding keys, look at the same instant: both end on one store (the file the folder
     kept, the one made first on Drive, which keeps both), the relay holds one store, one grant says it replaces, and nothing is ended;
     the one that lost joins at its first look or, where the store was not yet made at the relay, its next. */
  async function raceScene(kind) {
    const w = worldOf(kind), a = computer(w, "a"), b = computer(w, "b");
    const [la, lb0] = await Promise.all([a.look(), b.look()]);
    /* The one that lost may meet the store before its maker has made it at the relay: it waits (paused) and joins at its next look. */
    const lb = lb0.state === "on" ? lb0 : await b.look();
    const teams = [...w.R.stores.values()].filter(st => st.get("team")).length;
    const replaces = w.serviceSent.filter(t => { const j = JSON.parse(t); return j.extra && j.extra.replace === true; }).length;
    const openA = la.state === "on" ? await opens(w.R, la.keys.rt, a.me, la.store) : "off", openB = lb.state === "on" ? await opens(w.R, lb.keys.rt, b.me, lb.store) : "off";
    const ok = la.state === "on" && lb.state === "on" && la.keys.rt === lb.keys.rt && teams === 1 && replaces === 1 && w.serviceSent.notices.length === 0
      && openA === "open" && openB === "open" && (lb0.state === "on" || lb0.state === "paused");
    return { ok, detail: brief({ a: la.state, bFirst: lb0.state, b: lb.state, oneStore: !!la.keys && !!lb.keys && la.keys.rt === lb.keys.rt, teams, replaces, ended: w.serviceSent.notices, openA, openB }) };
  }
  /* C2: K and S go to the person's folder and this computer's sealing alone: nothing the service or the relay was sent holds either. */
  async function keysStayScene() {
    const w = worldOf("microsoft"), a = computer(w, "a"), b = computer(w, "b");
    const la = await a.look(), lb = await b.look();
    const k = la.keys && la.keys.k, s = la.keys && la.keys.s;
    const leaks = w.serviceSent.concat(w.relaySent).filter(t => (k && t.indexOf(k) >= 0) || (s && t.indexOf(s) >= 0));
    const sealedHas = a.sealed.keys && a.sealed.keys.k === k && b.sealed.keys && b.sealed.keys.s === s;
    const ok = la.state === "on" && lb.state === "on" && !!k && !!s && leaks.length === 0 && sealedHas && w.serviceSent.length >= 2 && w.relaySent.length >= 3;
    return { ok, detail: brief({ serviceBodies: w.serviceSent.length, relayBodies: w.relaySent.length, leaks: leaks.length, sealedHas }) };
  }
  /* C3: the folder unreached, by each cause, on each provider: the look answers unavailable with the reason and throws nothing; the desk
     says each reason once (offline never), and nothing again until another reason or sync comes. */
  async function unreachedScene() {
    const out = {};
    const causes = [
      ["microsoft", "offline", f => { f.offline = true; }], ["microsoft", "no-drive", f => { f.drive = false; }], ["microsoft", "consent", f => { f.consent = false; }],
      ["microsoft", "full", f => { f.full = true; }], ["google", "offline", f => { f.offline = true; }], ["google", "no-drive", f => { f.policy = "domain"; }],
      ["google", "consent", f => { f.policy = "consent"; }], ["google", "full", f => { f.full = true; }],
    ];
    let all = true;
    for (const [kind, why, set] of causes) {
      const w = worldOf(kind), a = computer(w, "a");
      set(w.f);
      const l = await a.look();
      out[kind + ":" + why] = l.state + "/" + l.why;
      all = all && l.state === "unavailable" && l.why === why;
    }
    let kept = "";
    const said = [];
    for (const why of ["no-drive", "no-drive", "no-drive", "offline", "no-drive", "consent", "consent"]) {
      const r = ST.sayOnce(kept, { state: "unavailable", why });
      kept = r.kept;
      if (r.say) said.push(r.say);
    }
    const on = ST.sayOnce(kept, { state: "on" });
    const again = ST.sayOnce(on.kept, { state: "unavailable", why: "consent" });
    const ok = all && said.join() === "no-drive,consent" && on.say === null && again.say === "consent";
    return { ok, detail: brief({ looks: out, said, afterSync: again.say }) };
  }
  /* C4: the folder's file deleted while a computer holds K and S: its next look writes it back, the same store; with no computer holding
     them, the next sign-in makes a new store, and the service is asked a grant for it (the service ends the old one, Studio's S4a). */
  async function deletedScene() {
    const w = worldOf("microsoft"), a = computer(w, "a");
    const la = await a.look();
    w.f.text = null;
    const back = await a.look();
    const rewritten = ST.keyRead(w.f.text);
    w.f.text = null;
    const c = computer(w, "c");
    const lc = await c.look();
    const fresh = ST.keyRead(w.f.text);
    const askedNew = w.serviceSent.some(t => fresh && JSON.parse(t).rt === fresh.rt);
    const ok = la.state === "on" && back.state === "on" && !!rewritten && rewritten.rt === la.keys.rt && rewritten.k === la.keys.k
      && lc.state === "on" && lc.made === true && !!fresh && fresh.rt !== la.keys.rt && askedNew;
    return { ok, detail: brief({ rewrittenSame: !!rewritten && rewritten.rt === (la.keys && la.keys.rt), newStore: !!fresh && fresh.rt !== (la.keys && la.keys.rt), askedNew }) };
  }
  /* C6: on a managed computer with PersonalStore unset, sync is off and held; set "on" or "company" it is on and held; "off" off; on an
     unmanaged computer it is on from sign-in unless the person turned it off. */
  async function policyScene() {
    const p = (m, v, off) => JSON.stringify(ST.storePolicy(m, v, off));
    const got = { managedUnset: p(true, undefined), managedOn: p(true, "on"), managedCompany: p(true, "Company"), off: p(false, "off"), plain: p(false), personOff: p(false, undefined, true) };
    const ok = got.managedUnset === '{"on":false,"company":false,"held":true}' && got.managedOn === '{"on":true,"company":false,"held":true}'
      && got.managedCompany === '{"on":true,"company":true,"held":true}' && got.off === '{"on":false,"company":false,"held":true}'
      && got.plain === '{"on":true,"company":false,"held":false}' && got.personOff === '{"on":false,"company":false,"held":false}';
    return { ok, detail: brief(got) };
  }
  /* C10's line: a lapsed store certificate says nothing before three days, then "Paused since" its lapse; nothing beside a sign-in
     refusal, and nothing once a new certificate is held. */
  async function pausedScene() {
    const cert = { until: T0 };
    const early = ST.pausedLine(cert, T0 + 3 * DAY - MIN), late = ST.pausedLine(cert, T0 + 3 * DAY), refused = ST.pausedLine(cert, T0 + 4 * DAY, true);
    const resumed = ST.pausedLine({ until: T0 + 5 * DAY }, T0 + 4 * DAY);
    const ok = early === null && !!late && late.since === T0 && refused === null && resumed === null;
    return { ok, detail: brief({ early, late, refused, resumed }) };
  }

  const results = {};
  const LEGS = [
    ["C1", () => firstAndSecondScene("microsoft"), "on OneDrive's App Folder the first computer finds no key and makes the store, and a second computer of the person reads it and opens a session at its first look; neither shows nor asks anything"],
    ["C1g", () => firstAndSecondScene("google"), "the same on Google Drive's appDataFolder"],
    ["C1r", () => raceScene("microsoft"), "two computers with no keys setting up at once on OneDrive end on one store, one replace asked, nothing ended"],
    ["C1rg", () => raceScene("google"), "the same on Drive, where both files are made and the one made first is read by both"],
    ["C2", keysStayScene, "K and S reach the person's folder and each computer's own sealing alone: no body sent to the service or the relay holds either"],
    ["C3", unreachedScene, "the folder unreached (offline, no drive, Drive off by the organisation, consent refused, full), on each provider, answers unavailable with its reason and throws nothing; each reason is said once, offline never"],
    ["C4", deletedScene, "the file deleted while a computer holds K and S is written back, the same store; with none holding them the next sign-in makes a new store and asks the service for it"],
    ["C6", policyScene, "a managed computer with PersonalStore unset does not sync; on or company it does, held; elsewhere sync is on unless the person turned it off"],
    ["C10", pausedScene, "a lapsed store certificate says nothing before three days, then Paused since its lapse; nothing beside a sign-in refusal or once renewed"],
  ];
  for (const [id, scene, line] of LEGS) {
    const r = await safe(scene);
    results[id] = r;
    check(r.ok === true, id + " " + line + ": " + r.detail);
  }

  /* ---- the plants: each guard lifted, or a fault put in, in a copy of shell/sync/store.cjs turns its leg red ---- */
  const PRODUCT = path.join(ROOT, "shell", "sync", "store.cjs");
  let copies = 0;
  async function planted(change, fn) {
    const digest = sha(fs.readFileSync(PRODUCT)), kept = ST;
    let turned = false, detail = "plant line absent";
    try {
      const text = fs.readFileSync(PRODUCT, "utf8");
      const next = change(text);
      if (next !== null && next !== text) {
        const dir = path.join(WORK, "p" + (++copies));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "store.cjs"), next);
        ST = require(path.join(dir, "store.cjs"));
        const r = await safe(fn);
        turned = r.ok !== true;
        detail = turned ? "the leg turned red" : "the leg still held";
      }
    } catch (e) { detail = e && e.message ? e.message : String(e); }
    finally { ST = kept; }
    return { turned, back: sha(fs.readFileSync(PRODUCT)) === digest, detail };
  }
  const lift = tag => text => { const lines = text.split(/\n/), at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0); if (at < 0) return null; lines.splice(at, 1); return lines.join("\n"); };
  const swap = (from, to) => text => (text.split(from).length === 2 ? text.split(from).join(to) : null);
  const scenes = Object.fromEntries(LEGS.map(([id, scene]) => [id, scene]));
  const PLANTS = [
    ["made", "C1", lift("made"), "the first computer makes the file but not the store at the relay"],
    ["made", "C1g", lift("made"), "the same on Drive"],
    ["a copy to the service", "C2", swap("const got = await io.grant(keys.rt, sPub, { replace: made });", "const got = await io.grant(keys.rt, sPub, { replace: made, s: keys.s });"), "S rides beside the grant's request"],
    ["the re-read", "C1r", swap("    keys = again.ok && again.text !== null ? keyRead(again.text) : null;", "    keys = again.ok ? fresh : null;"), "each computer keeps the store it made, so two are made and one ends the other"],
    ["the re-read", "C1rg", swap("    keys = again.ok && again.text !== null ? keyRead(again.text) : null;", "    keys = again.ok ? fresh : null;"), "the same on Drive"],
    ["say-once", "C3", lift("say-once"), "a reason is said at every look"],
    ["write-back", "C4", lift("write-back"), "the deleted file is not written back, so a new store is made"],
    ["policy-managed", "C6", lift("policy-managed"), "a managed computer with the policy unset syncs"],
    ["pause-days", "C10", lift("pause-days"), "the paused line shows at the first lapse"],
  ];
  for (const [name, id, change, what] of PLANTS) {
    const line = "p " + id + " " + name + " in a copy of shell/sync/store.cjs turns " + id + " red (" + what + "), and the product file is never written";
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
