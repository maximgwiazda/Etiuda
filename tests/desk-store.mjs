/* A PERSON'S STORE ON THE DESK: the key's life in the person's own folder (shell/sync/store.cjs). node tests/desk-store.mjs
 * Over stand-ins for OneDrive's App Folder, Google Drive's appDataFolder and the licence service, and the relay itself in memory
 * (relay/worker.mjs on relay/test/stand-ins.cjs); no leg calls a real provider. C1, C2, C3, C4, C6, C10's line and E1 (off everywhere), each guard
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
const EXPECTED = 38;
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
    if (st.status) return json(st.status, { error: { code: st.code || "serviceNotAvailable" } });
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
    if (st.status) return err(st.status, st.reason || "backendError");
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
    if (sent.refuse) return { why: sent.refuse };
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
  return { label, me, sealed, said, look: more => ST.storeLook(Object.assign(io(), more)) };
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
     the one that lost joins at its first look or, where the store was not yet made at the relay, its next. One folder both computers
     see: replicas that each show their own write send two replaces, which is tests/desk-sync.mjs C1a. */
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
  /* T2: the folder throttled or down (Graph 503 or 429, Drive 503, 429 or 403 rateLimitExceeded or userRateLimitExceeded): offline,
     never a reason the person is told; the provider's lasting refusals keep their reasons (C3). */
  async function transientScene() {
    const out = {};
    let all = true;
    for (const [kind, set] of [["microsoft:503", f => { f.status = 503; }], ["microsoft:429", f => { f.status = 429; f.code = "TooManyRequests"; }],
      ["google:503", f => { f.status = 503; }], ["google:429", f => { f.status = 429; f.reason = "rateLimitExceeded"; }],
      ["google:403-rate", f => { f.status = 403; f.reason = "rateLimitExceeded"; }], ["google:403-user", f => { f.status = 403; f.reason = "userRateLimitExceeded"; }]]) {
      const w = worldOf(kind.split(":")[0]), a = computer(w, "a");
      set(w.f);
      const l = await a.look();
      out[kind] = l.state + "/" + l.why;
      all = all && l.state === "unavailable" && l.why === "offline";
    }
    return { ok: all, detail: brief(out) };
  }
  /* M1: a store made while the licence service was out (its grant unreached): the look that finds the service back still says it
     replaces and makes it at the relay, where this computer names the store it made (io.made); without that the store stays unmade. */
  async function madeOutageScene() {
    const w = worldOf("microsoft"), a = computer(w, "a");
    w.serviceSent.down = true;
    const l1 = await a.look();
    w.serviceSent.down = false;
    const l2 = await a.look({ made: l1.keys ? l1.keys.rt : "" });
    const last = w.serviceSent.length ? JSON.parse(w.serviceSent[w.serviceSent.length - 1]) : {};
    const team = l2.keys ? !!(w.R.stores.get(l2.keys.rt) && w.R.stores.get(l2.keys.rt).get("team")) : false;
    const ok = l1.state === "paused" && l1.why === "unreached" && l1.made === true && l2.state === "on" && l2.keys.rt === l1.keys.rt && team
      && last.extra && last.extra.replace === true;
    return { ok, detail: brief({ first: l1.state + "/" + l1.why, firstMade: l1.made, second: l2.state + "/" + (l2.why || ""), sameStore: !!l2.keys && !!l1.keys && l2.keys.rt === l1.keys.rt, team, replace: !!(last.extra && last.extra.replace) }) };
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

  /* E1: turned off everywhere, the ended mark in the folder in the key's place: a computer still holding K and S reads it, answers ended
     and writes nothing back; one the person turned on there since (fresh) makes a new store over the mark. On both folders. */
  async function endedScene(kind) {
    const w = worldOf(kind), a = computer(w, "a"), b = computer(w, "b");
    const la = await a.look(), lb = await b.look();
    const mark = la.keys ? ST.endedText(la.keys.rt) : "";
    w.f.text = mark;
    const lb2 = await b.look();
    const kept = w.f.text;
    const la2 = await a.look({ fresh: true });
    const fresh = ST.keyRead(w.f.text);
    const ok = la.state === "on" && lb.state === "on" && lb2.state === "ended" && kept === mark && ST.endedRead(kept)
      && la2.state === "on" && la2.made === true && !!fresh && fresh.rt !== la.keys.rt && fresh.rt === la2.keys.rt;
    return { ok, detail: brief({ b: lb2.state, markKept: kept === mark, fresh: la2.state, made: la2.made, newStore: !!fresh && !!la.keys && fresh.rt !== la.keys.rt }) };
  }

  /* L1: This computer leaves (storeLeave): the folder's list without it written first, so the relay refusing leaves the folder right
     and not done; tried again, the list is posted though the folder already leaves it out; a list the relay holds already is done; the
     folder holding another store or the ended mark asks nothing; the folder unreached is not done. */
  async function leaveScene() {
    const me = { pub: "a".repeat(64) }, other = { id: "k-other", pub: "b".repeat(64), desk: "k-bbbbbbbbbbbbbbbb" };
    const keys = { k: "1".repeat(64), s: "2".repeat(64), rt: "3".repeat(32), url: "https://etiuda.dev/relay/v1", devices: [{ id: "k-me", pub: me.pub, desk: "k-aaaaaaaaaaaaaaaa" }, other], rev: 4 };
    const mem = { text: ST.keyText(keys), offline: false };
    const folder = { read: async () => (mem.offline ? { ok: false, why: "offline" } : { ok: true, text: mem.text }),
      write: async t => { mem.text = t; return { ok: true }; }, create: async t => { mem.text = t; return { ok: true }; } };
    const posts = [];
    let answer = { ok: false, why: "relay" };
    const io = () => ({ folder, keys, me, cert: async () => ({ kind: "etiuda-store-certificate" }), relay: { devices: async next => { posts.push(next); return answer; } } });
    const down = await ST.storeLeave(io()), fileDown = ST.keyRead(mem.text);
    answer = { ok: true };
    const up = await ST.storeLeave(io());
    answer = { ok: false, why: "replay-rev" };
    const held = await ST.storeLeave(io());
    const n = posts.length;
    mem.text = ST.keyText(Object.assign({}, keys, { rt: "4".repeat(32) }));
    const replaced = await ST.storeLeave(io());
    mem.text = ST.endedText(keys.rt);
    const ended = await ST.storeLeave(io());
    mem.offline = true;
    const offline = await ST.storeLeave(io());
    const only = l => !!l && l.devices.length === 1 && l.devices[0].pub === other.pub && l.rev === 5;
    const ok = down.ok === false && only(fileDown) && up.ok === true && only(posts[1]) && held.ok === true && replaced.ok === true && ended.ok === true
      && posts.length === n && offline.ok === false && offline.why === "offline";
    return { ok, detail: brief({ down, folderLeftItOut: only(fileDown), up, retriedList: only(posts[1]), held, replaced, ended, postsAfter: posts.length - n, offline }) };
  }

  /* G1: the folder's key file replaced by another store's, well formed, and the service refusing that store as another person's: this
     computer's sealed copy is still its own store, kept only once the service grants a store (and on a grant, the folder's). */
  async function grantRefusedScene() {
    const w = worldOf("microsoft"), a = computer(w, "a");
    const la = await a.look();
    const mine = a.sealed.keys ? JSON.parse(JSON.stringify(a.sealed.keys)) : null;
    const other = ST.freshKeys(n => crypto.randomBytes(n), "https://relay.test/relay/v1");
    w.f.text = ST.keyText(other);
    w.serviceSent.refuse = "store";
    const refused = await a.look();
    const kept = a.sealed.keys;
    w.serviceSent.refuse = "";
    const granted = await a.look();
    const after = a.sealed.keys, folder = ST.keyRead(w.f.text);
    const ok = la.state === "on" && !!mine && refused.state === "paused" && refused.why === "store" && !!kept && kept.rt === mine.rt && kept.k === mine.k && kept.s === mine.s
      && !!after && !!folder && after.rt === folder.rt && after.rt !== mine.rt;
    return { ok, detail: brief({ first: la.state, refused: refused.state + "/" + refused.why, keptOwn: !!kept && !!mine && kept.rt === mine.rt && kept.k === mine.k, granted: granted.state, keptFolders: !!after && !!folder && after.rt === folder.rt }) };
  }

  /* W6: a second computer's enrolment failing at one step, the folder's write or the relay's list, by a refusal, by the process ending
     at that step, or (the relay) by an answer lost after it took the list: the next look enrols it and it opens a session, and a third
     computer enrols after it; the failed look never says on. */
  async function enrolFaultScene() {
    const out = {};
    let all = true;
    for (const [name, at, how] of [["folder refused", "folder", "refuse"], ["folder ended", "folder", "die"], ["relay refused", "relay", "refuse"],
      ["relay ended", "relay", "die"], ["relay answer lost", "relay", "lost"]]) {
      const w = worldOf("microsoft"), a = computer(w, "a"), b = computer(w, "b"), c = computer(w, "c");
      const la = await a.look();
      let armed = true;
      const folder = w.folder(), relay = relayIo(w.R, w.relaySent, b.me);
      const fault = async (here, real) => {
        if (!armed || at !== here) return real();
        armed = false;
        if (how === "die") throw new Error("the process ended here");
        if (how === "lost") await real();
        return { ok: false, why: here === "folder" ? "offline" : "relay" };
      };
      const faulty = { folder: Object.assign({}, folder, { write: t => fault("folder", () => folder.write(t)) }),
        relay: Object.assign({}, relay, { devices: (k, cert) => fault("relay", () => relay.devices(k, cert)) }) };
      let first = "";
      w.R.clock.now += 1000;
      try { const l = await b.look(faulty); first = l.state + "/" + (l.why || ""); } catch { first = "ended"; }
      w.R.clock.now += 1000;
      const lb = await b.look();
      w.R.clock.now += 1000;
      const lc = await c.look();
      const file = ST.keyRead(w.f.text);
      const openB = lb.state === "on" ? await opens(w.R, lb.keys.rt, b.me, lb.store) : "off", openC = lc.state === "on" ? await opens(w.R, lc.keys.rt, c.me, lc.store) : "off";
      all = all && la.state === "on" && !armed && first !== "on/" && lb.state === "on" && openB === "open" && lc.state === "on" && openC === "open" && !!file && file.devices.length === 3;
      out[name] = first + " > b " + lb.state + "/" + (lb.why || "") + " " + openB + ", c " + lc.state + "/" + (lc.why || "") + " " + openC + ", listed " + (file ? file.devices.length : 0);
    }
    return { ok: all, detail: brief(out) };
  }

  /* R7: a look that failed for a passing reason (the folder offline, the licence service unreached, the relay not answering or its rate)
     is tried again by itself at growing gaps, seven times in a little over two hours, then not; any other answer, on, ended or a refusal,
     never. Read from storeLook's own answers where the stand-ins give them. */
  async function againScene() {
    const gaps = [];
    for (let i = 0; i <= 8; i++) gaps.push(ST.lookAgainIn({ state: "paused", why: "unreached" }, i));
    const grows = gaps.slice(0, 7).every((g, i) => g > 0 && (i === 0 || g > gaps[i - 1])) && gaps[7] === 0 && gaps[8] === 0;
    const total = gaps.reduce((s, g) => s + g, 0);
    const passing = [["unavailable", "offline"], ["paused", "unreached"], ["paused", "relay"], ["paused", "rate"]].filter(([state, why]) => !(ST.lookAgainIn({ state, why }, 0) > 0));
    const never = [["on", ""], ["ended", ""], ["paused", "signin"], ["paused", "store"], ["paused", "seat-lapsed"], ["paused", "bad-signature"], ["unavailable", "consent"],
      ["unavailable", "ungiven"], ["unavailable", "no-drive"], ["unavailable", "full"], ["unavailable", "refused"], ["unavailable", ""]].filter(([state, why]) => ST.lookAgainIn({ state, why }, 0) !== 0);
    const looks = {};
    { const w = worldOf("microsoft"), a = computer(w, "a"); w.f.offline = true; looks.offline = await a.look(); }
    { const w = worldOf("microsoft"), a = computer(w, "a"); w.serviceSent.down = true; looks.unreached = await a.look(); }
    { const w = worldOf("microsoft"), a = computer(w, "a"); w.serviceSent.refuse = "store"; looks.refused = await a.look(); }
    { const w = worldOf("microsoft"), a = computer(w, "a"); looks.on = await a.look(); }
    const fromLooks = ST.lookAgainIn(looks.offline, 0) > 0 && ST.lookAgainIn(looks.unreached, 0) > 0 && ST.lookAgainIn(looks.refused, 0) === 0 && ST.lookAgainIn(looks.on, 0) === 0;
    const ok = grows && total > 2 * HOUR && total < 3 * HOUR && !passing.length && !never.length && fromLooks;
    return { ok, detail: brief({ gaps, total, passingNotTried: passing, triedAnyway: never, looks: Object.keys(looks).map(k => k + " " + looks[k].state + "/" + (looks[k].why || "")) }) };
  }

  const results = {};
  const LEGS = [
    ["R7", againScene, "a look that failed for a passing reason is tried again at growing gaps, seven times in a little over two hours, then not; on, ended or a refusal never"],
    ["W6", enrolFaultScene, "a second computer's enrolment failing at the folder's write or the relay's list (refused, the process ended there, or the relay's answer lost): the next look enrols it and it opens a session, and a third computer enrols after it"],
    ["G1", grantRefusedScene, "a key file of another store in the folder, refused by the service as another person's, leaves this computer's sealed copy its own; granted, the folder's store is kept"],
    ["L1", leaveScene, "This computer leaves: the folder's list without it written before the relay is asked, posted again when tried again though the folder already leaves it out; a list the relay holds, another store or the ended mark is done, the folder unreached is not"],
    ["C1", () => firstAndSecondScene("microsoft"), "on OneDrive's App Folder the first computer finds no key and makes the store, and a second computer of the person reads it and opens a session at its first look; neither shows nor asks anything"],
    ["C1g", () => firstAndSecondScene("google"), "the same on Google Drive's appDataFolder"],
    ["C1r", () => raceScene("microsoft"), "two computers with no keys setting up at once on OneDrive end on one store, one replace asked, nothing ended"],
    ["C1rg", () => raceScene("google"), "the same on Drive, where both files are made and the one made first is read by both"],
    ["C2", keysStayScene, "K and S reach the person's folder and each computer's own sealing alone: no body sent to the service or the relay holds either"],
    ["C3", unreachedScene, "the folder unreached (offline, no drive, Drive off by the organisation, consent refused, full), on each provider, answers unavailable with its reason and throws nothing; each reason is said once, offline never"],
    ["T2", transientScene, "the folder throttled or down, Graph 503 or 429 and Drive 503, 429 or a rate-limit 403, answers offline, never a reason told"],
    ["M1", madeOutageScene, "a store made while the licence service was out is still granted as a replacement and made at the relay at the next look, its maker naming it"],
    ["C4", deletedScene, "the file deleted while a computer holds K and S is written back, the same store; with none holding them the next sign-in makes a new store and asks the service for it"],
    ["C6", policyScene, "a managed computer with PersonalStore unset does not sync; on or company it does, held; elsewhere sync is on unless the person turned it off"],
    ["E1", () => endedScene("microsoft"), "turned off everywhere on OneDrive: a computer holding K and S reads the ended mark, answers ended and writes nothing back; turned on there since, a new store is made over the mark"],
    ["E1g", () => endedScene("google"), "the same on Drive"],
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
    ["every answer again", "R7", swap("  if (!look || (look.state !== \"unavailable\" && look.state !== \"paused\") || PASSING.indexOf(String(look.why)) < 0) return 0; /* plant:again-passing */", "  if (!look) return 0; /* plant:again-passing */"), "a look that is on, or refused, tried again"],
    ["no bound", "R7", swap("tries < LOOK_AGAIN_MS.length ? LOOK_AGAIN_MS[tries] : 0; /* plant:again-bound */", "true ? LOOK_AGAIN_MS[Math.min(tries, LOOK_AGAIN_MS.length - 1)] : 0; /* plant:again-bound */"), "tried again for ever, every hour"],
    ["relay first", "W6", swap("    const w = await io.folder.write(keyText(next)); /* plant:enrol-folder-first */",
      "    const p = await io.relay.devices(next, got.store);\n    if (!p.ok) return { state: \"paused\", why: p.why || \"relay\", keys };\n    const w = await io.folder.write(keyText(next)); /* plant:enrol-folder-first */"),
      "the relay asked before the folder, so a folder write that fails leaves the relay a revision ahead"],
    ["owed list taken", "W6", swap("const taken = k => !!local && local.rt === k.rt && local.rev === k.rev && mine(local); /* plant:enrol-taken */", "const taken = k => mine(k); /* plant:enrol-taken */"),
      "a list the folder holds is taken as the relay's, so one the relay never took is not posted again"],
    ["held list refused", "W6", swap("if (!d.ok && d.why !== \"replay-rev\") return", "if (!d.ok) return"), "a list the relay holds already read as a refusal"],
    ["seal after grant", "G1", swap("  const sPub = pubOf(keys.s);\n", "  io.keep(keys);\n  const sPub = pubOf(keys.s);\n"), "the folder's keys sealed before the service has granted their store"],
    ["made", "C1", lift("made"), "the first computer makes the file but not the store at the relay"],
    ["made", "C1g", lift("made"), "the same on Drive"],
    ["a copy to the service", "C2", swap("const got = await io.grant(keys.rt, sPub, { replace: made });", "const got = await io.grant(keys.rt, sPub, { replace: made, s: keys.s });"), "S rides beside the grant's request"],
    ["the re-read", "C1r", swap("    keys = again.ok && again.text !== null ? keyRead(again.text) : null;", "    keys = again.ok ? fresh : null;"), "each computer keeps the store it made, so two are made and one ends the other"],
    ["the re-read", "C1rg", swap("    keys = again.ok && again.text !== null ? keyRead(again.text) : null;", "    keys = again.ok ? fresh : null;"), "the same on Drive"],
    ["say-once", "C3", lift("say-once"), "a reason is said at every look"],
    ["made-named", "M1", swap("let made = !!io.made && keys !== null && keys.rt === io.made; /* plant:made-named */", "let made = false; /* plant:made-named */"), "the store this computer made is forgotten at the next look"],
    ["graph-transient", "T2", lift("graph-transient"), "Graph's 503 and 429 read as a refusal"],
    ["drive-transient", "T2", lift("drive-transient"), "Drive's 503, 429 and rate-limit 403 read as a refusal or no Drive"],
    ["write-back", "C4", lift("write-back"), "the deleted file is not written back, so a new store is made"],
    ["policy-managed", "C6", lift("policy-managed"), "a managed computer with the policy unset syncs"],
    ["pause-days", "C10", lift("pause-days"), "the paused line shows at the first lapse"],
    ["ended-off", "E1", lift("ended-off"), "the ended mark is read as no key, so the computer does not turn off"],
    ["leave-folder", "L1", swap("  if (listed) {\n    const w", "  if (false) {\n    const w"), "the folder keeps naming the computer, so the next to enrol puts it back"],
    ["leave-relay", "L1", swap("await io.relay.devices(next, cert); /* plant:leave-relay */", "({ ok: true }); /* plant:leave-relay */"), "the relay is never asked"],
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
