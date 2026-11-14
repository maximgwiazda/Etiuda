/* A PERSON'S STORE IN THE SHELL: the key's life (shell/sync/store.cjs) wired into the desk's sign-in (shell/main.js). node tests/desk-store-shell.mjs
 * shell/main.js is evaluated whole under stub electron, as tests/desk-ipc.mjs does, with the reg stand in front of the registry. Its
 * network is a stand-in answering as Microsoft's token address, a sign-in lab's licence service (whose root this file makes), OneDrive's
 * App Folder, and the relay itself in memory (relay/worker.mjs on relay/test/stand-ins.cjs); nothing real is reached. What it holds:
 * the folder's scopes asked only where sync may be on, the look after a seated renewal keeping the store certificate, the folder's
 * access token kept in memory alone, the licence service's door taking its four routes alone, and the relay a store is made at,
 * production's or the one of the trusted relays a sign-in lab names; and Microsoft's folder asked apart, once, after the sign-in in the
 * same browser window, its refusal leaving the desk signed in, and no browser at a renewal (f, a browser stand-in over real HTTP). Each guard is shown red by a plant
 * in a copy of the text in memory; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off. */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), { policy: null });
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 37;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "desk-store-shell-"));

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }
const brief = o => JSON.stringify(o);
const safe = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: "threw " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" / ") : e) }; } };

const C = nodeRequire(path.join(ROOT, "relay", "core.cjs"));
const S = nodeRequire(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
const K = nodeRequire(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
const W = WORKER.routeWith(K.ROOTS, env => env.NOW());

const DAY = 24 * 60 * 60 * 1000;
const CODE = "ABCDEFGHJKMNPQRS", SEED = "5".repeat(64), TID = "aaaabbbb-0000-1111-2222-ccccddddeeee", SUB = "sub-of-the-person";
const MS_CLIENT = "00001111-aaaa-2222-bbbb-333344445555", G_CLIENT = "000011112222-stand.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const STAGING = "https://etiuda.dev/licence-staging/v1/";
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const rawPub = k => k.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
const signWith = (key, bytes) => crypto.sign(null, bytes, key).toString("hex");
const verifyWith = (pub, bytes, sig) => { try { return crypto.verify(null, bytes, crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pub, "hex")]), format: "der", type: "spki" }), Buffer.from(String(sig), "hex")); } catch { return false; } };
const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = c => b64url({ alg: "none" }) + "." + b64url(c) + ".x";
const canon = v => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}");
/* The lab's root and its service key: this run's own, so a seat certificate signed here is a genuine one under the lab's root. */
const LAB_ROOT = crypto.generateKeyPairSync("ed25519"), LAB_SERVICE = crypto.generateKeyPairSync("ed25519");
function seatCert(desk, now) {
  const via = { kind: "etiuda-delegation", format: 1, key: { id: "svc-test", pub: rawPub(LAB_SERVICE.publicKey) }, may: ["licence"], from: now - DAY, until: now + 100 * DAY,
    sig: { alg: "ed25519", keyId: "root-test", value: "" } };
  via.sig.value = signWith(LAB_ROOT.privateKey, Buffer.from("etiuda-delegation\n" + canon(Object.assign({}, via, { sig: { alg: "ed25519", keyId: "root-test" } })), "utf8"));
  const c = { kind: "etiuda-seat-certificate", format: 1, licence: "1".repeat(32), desk, person: "2".repeat(64), code: CODE, issued: now, until: now + 20 * DAY, via,
    sig: { alg: "Ed25519", keyId: "svc-test", value: "" } };
  c.sig.value = signWith(LAB_SERVICE.privateKey, Buffer.from("etiuda-seat-certificate\n" + [c.format, c.licence, c.desk, c.person, c.code, c.issued, c.until, c.sig.keyId].join("\n"), "utf8"));
  return c;
}
/* Store grants and certificates as the licence service signs them: the test delegate of relay/test/grant-kit.cjs, which the relay in memory trusts. */
function storeGrantOf(lead, now) {
  const g = { kind: "etiuda-store-grant", format: 1, lead, code: CODE, issued: now, until: now + 30 * DAY, paid: true,
    via: K.delegationFor(now, { fields: { may: ["licence", "relay-grant"] } }), sig: { alg: "ed25519", keyId: K.DELEGATE.id, value: "" } };
  g.sig.value = signWith(K.DELEGATE.privateKey, C.grantBytes(g));
  return g;
}
function storeCertOf(desk, now) {
  const c = { kind: "etiuda-store-certificate", format: 1, desk, code: CODE, issued: now, until: now + DAY, via: K.delegationFor(now, { fields: { may: ["licence"] } }),
    sig: { alg: "Ed25519", keyId: K.DELEGATE.id, value: "" } };
  c.sig.value = signWith(K.DELEGATE.privateKey, C.storeCertBytes(c));
  return c;
}

/* ---- the world the shell's network meets: every request kept, by where it went ---- */
function worldOf(o) {
  const opt = o || {};
  const R = S.relayEnv({ roots: K.ROOTS });
  R.clock.now = Date.now();
  const w = { R, access: "stand-in-folder-token-" + crypto.randomBytes(12).toString("hex"), forms: [], service: [], relay: [], graph: [], other: [], file: null, codes: {} };
  const json = (status, o) => new Response(Buffer.from(JSON.stringify(o)), { status, headers: { "content-type": "application/json" } });
  const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot", FILE = GRAPH + ":/etiuda-store.json:/content";
  w.fetch = async (url, init) => {
    const u = String(url), method = String(init && init.method || "GET"), headers = (init && init.headers) || {};
    const body = init && init.body !== undefined && init.body !== null ? Buffer.from(init.body).toString("utf8") : "";
    if (u === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
      w.forms.push(body);
      /* A code the browser stand-in was given: its ID token carries that request's nonce, and the folder's token only for a code of the folder's own request. */
      const form = new URLSearchParams(body);
      if (form.get("grant_type") === "authorization_code") {
        const c = w.codes[form.get("code")], now = Date.now();
        if (!c) return json(400, { error: "invalid_grant" });
        return json(200, Object.assign({ token_type: "Bearer", id_token: jwt({ iss: "https://login.microsoftonline.com/" + TID + "/v2.0", tid: TID, aud: MS_CLIENT, sub: c.sub || SUB, nonce: c.nonce,
          preferred_username: "person@example.test", exp: Math.floor(now / 1000) + 3600 }), access_token: c.folder ? w.access : "stand-in-graph-token-not-the-folder", expires_in: 3600 }, c.folder ? {} : { refresh_token: "rt-first" }));
      }
      /* As Microsoft answers a refresh asking a scope the person never consented to. */
      if (opt.refuseFolder && /Files\.ReadWrite\.AppFolder/.test(new URLSearchParams(body).get("scope") || ""))
        return json(400, { error: "invalid_grant", error_description: "AADSTS65001: The user or administrator has not consented to use the application." });
      const now = Date.now();
      return json(200, { token_type: "Bearer", id_token: jwt({ iss: "https://login.microsoftonline.com/" + TID + "/v2.0", tid: TID, aud: MS_CLIENT, sub: SUB, preferred_username: "person@example.test", exp: Math.floor(now / 1000) + 3600 }),
        refresh_token: "rt-next", access_token: w.access, expires_in: 3600 });
    }
    if (u === "https://oauth2.googleapis.com/token") {
      w.forms.push(body);
      /* Google's answer names the scopes granted: the folder's only where the person left its line ticked. */
      const c = w.codes[new URLSearchParams(body).get("code")], now = Date.now();
      if (!c) return json(400, { error: "invalid_grant" });
      return json(200, { token_type: "Bearer", id_token: jwt({ iss: "https://accounts.google.com", aud: G_CLIENT, sub: SUB, nonce: c.nonce, exp: Math.floor(now / 1000) + 3600 }),
        scope: c.folder ? "openid " + DRIVE_SCOPE : "openid", access_token: c.folder ? w.access : "stand-in-google-token-not-the-folder", refresh_token: "rt-google", expires_in: 3600 });
    }
    if (u === STAGING + "signin/desk") {
      w.service.push(body);
      const b = JSON.parse(body);
      return json(200, { ok: true, code: CODE, certificate: seatCert(b.desk, Date.now()), doors: [] });
    }
    if (u === STAGING + "store/grant") {
      w.service.push(body);
      const b = JSON.parse(body), lines = ["etiuda-licence-store-grant", b.desk, b.rt, b.lead, b.t].concat(b.company ? ["company"] : [], b.replace ? ["replace"] : []);
      if (!verifyWith(b.desk, Buffer.from(lines.join("\n"), "utf8"), b.sig)) return json(400, { ok: false, reason: "signature" });
      R.clock.now = Date.now();
      return json(200, { ok: true, grant: storeGrantOf(b.lead, R.clock.now), store: storeCertOf(b.desk, R.clock.now) });
    }
    if (u.startsWith("https://etiuda.dev/relay/v1/")) {
      w.relay.push(body);
      R.clock.now = Date.now();
      const res = await W.fetch(new Request("https://relay.test/relay/v1/" + u.slice("https://etiuda.dev/relay/v1/".length), { method, headers, body: body || undefined, duplex: "half" }), R.env);
      return new Response(Buffer.from(await res.arrayBuffer()), { status: res.status });
    }
    if (u.startsWith(GRAPH)) {
      w.graph.push(method + " " + u.slice(GRAPH.length) + " " + String(headers.authorization || ""));
      if (headers.authorization !== "Bearer " + w.access) return json(401, { error: { code: "InvalidAuthenticationToken" } });
      if (method === "GET" && u === GRAPH) return json(200, { id: "approot" });
      if (method === "GET" && u === FILE) return w.file === null ? json(404, { error: { code: "itemNotFound" } }) : new Response(Buffer.from(w.file), { status: 200 });
      if (method === "PUT" && u.startsWith(FILE)) {
        if (/conflictBehavior=fail$/.test(u) && w.file !== null) return json(409, { error: { code: "nameAlreadyExists" } });
        const was = w.file;
        w.file = body;
        return json(was === null ? 201 : 200, { id: "f" });
      }
      return json(400, { error: { code: "invalidRequest" } });
    }
    w.other.push(method + " " + u);
    throw new TypeError("fetch failed");
  };
  return w;
}

/* ---- the shell, evaluated whole: `src` is shell/main.js's text or a planted copy of it ---- */
/* What the leg reads from main.js, appended to its text; a name main.js lacks comes back undefined, so its leg fails alone. */
const TAIL_NAMES = ["signinListen", "signinRun", "signinRenew", "signinIo", "signinRenewNow", "signinServiceAsk", "storeServiceAt", "storeOnFor", "storeTurn", "branchIdentity", "signinState"];
const TAIL_STATE = ["storeNow", "storeAccess", "storeFlight", "storeConsentFlight", "SIGNIN_SERVICE", "SIGNOUT_SERVICE", "STORE_RELAY", "SIGNIN_PROVIDERS"];
const TAIL = "\n__test.T = {" + TAIL_NAMES.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ")
  + ", get: () => ({" + TAIL_STATE.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ") + "}) };";
function boot(src, o) {
  const opt = o || {};
  const UD = fs.mkdtempSync(path.join(WORK, "ud-"));
  const said = [], opened = [], ipc = { on: {}, handle: {} };
  const quiet = { log: s => said.push(String(s)), error: s => said.push(String(s)), warn: () => {}, info: () => {}, debug: () => {} };
  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined, construct: () => inert });
  const safeStorage = {
    isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const sealed = s => safeStorage.encryptString(s).toString("base64");
  const electron = {
    app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => true, quit: noop, on: noop, getVersion: () => "0.0.0", getLocale: () => "en",
      getPreferredSystemLanguages: () => ["en"], whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false },
      getLoginItemSettings: () => ({ openAtLogin: false, args: [], launchItems: [] }), setLoginItemSettings: noop, setAppUserModelId: noop,
      setJumpList: () => ({ result: "ok" }), getJumpListSettings: () => ({ minItems: 0 }) },
    ipcMain: { on: (ch, fn) => { ipc.on[ch] = fn; }, handle: (ch, fn) => { ipc.handle[ch] = fn; } }, BrowserWindow: Object.assign(function () { return inert; }, { fromWebContents: () => inert, getAllWindows: () => [] }),
    Menu: { setApplicationMenu: noop, buildFromTemplate: t => ({ items: t, popup() {} }) }, dialog: inert, protocol: inert, session: inert, screen: inert,
    shell: new Proxy({}, { get: (t, k) => (k === "openExternal" ? (u => { opened.push(String(u)); return Promise.resolve(opt.browser ? opt.browser(String(u)) : undefined).then(() => undefined); }) : inert) }),
    systemPreferences: inert, nativeTheme: { themeSource: "system" }, Notification: Object.assign(function () { return inert; }, { isSupported: () => false }),
    Tray: function () { return inert; }, nativeImage: { createFromPath: p => ({ path: p, isEmpty: () => false }) }, safeStorage,
    net: { fetch: (u, init) => (opt.world ? opt.world.fetch(u, init) : Promise.reject(new TypeError("fetch failed"))) },
  };
  if (opt.store) fs.writeFileSync(path.join(UD, "store.json"), JSON.stringify(Object.assign({ format: 1, keys: "", said: "" }, opt.store)));
  if (opt.held) fs.writeFileSync(path.join(UD, "signin.json"), JSON.stringify({ format: 2, held: { provider: "microsoft", refresh: sealed("rt-held"), sub: sealed(SUB),
    seed: SEED, code: CODE, cert: null, at: 1, checked: 1, reached: true, said: "", ask: false } }));
  const env = { ETIUDA_SIGNIN_LAB: opt.lab ? path.join(WORK, path.basename(UD) + "-lab.json") : undefined, ETIUDA_SIGNIN_TRACE: opt.trace ? "1" : undefined };
  if (opt.lab) fs.writeFileSync(env.ETIUDA_SIGNIN_LAB, JSON.stringify(opt.lab));
  const was = {};
  for (const k of Object.keys(env)) { was[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const holder = {};
  try {
    new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test", src + TAIL)(
      n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet, holder);
  } finally {
    for (const k of Object.keys(env)) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  }
  return { T: holder.T, UD, said, opened, ipc, lab: env.ETIUDA_SIGNIN_LAB };
}
function filesUnder(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p)); else out.push(p);
  }
  return out;
}

/* ---- the scenes ---- */
const RAND = n => Buffer.alloc(n, 7);
/* (a) The authorize address and the refresh form of each provider, over the shell's own signinRun and signinRenew with io.store as
   the shell's io answers it: on, the folder's scope beside today's; off, exactly today's request, built here from its documented fields. */
async function requests(T, p, on) {
  let url = "", form = "";
  const deskKey = "3".repeat(64);
  await T.signinRun({ store: on, rand: RAND, listen: async () => ({ port: 49152, caught: new Promise(() => {}), close: () => {} }),
    openPage: u => { url = u; return false; }, page: () => "" }, p, deskKey, Date.now);
  await T.signinRenew({ store: on, tokenAsk: async (u, f) => { form = Buffer.from(f).toString("utf8"); throw new Error("offline"); } }, p, deskKey, "rt-1", SEED, SUB, Date.now);
  return { url, form };
}
function todayUrl(T, p, url) {
  const known = T.get().SIGNIN_PROVIDERS[p.id], q = new URL(url).searchParams;
  const fields = { client_id: p.clientId, response_type: "code", redirect_uri: "http://127.0.0.1:49152", scope: known.scope, state: q.get("state"), nonce: q.get("nonce"),
    code_challenge: q.get("code_challenge"), code_challenge_method: "S256" };
  return known.authorize + "?" + new URLSearchParams(Object.assign(fields, known.extra)).toString();
}
function todayForm(T, p) {
  const known = T.get().SIGNIN_PROVIDERS[p.id];
  return new URLSearchParams(Object.assign({ client_id: p.clientId, grant_type: "refresh_token", refresh_token: "rt-1" }, known.refreshScope ? { scope: known.refreshScope } : {})).toString();
}
const providersOf = T => ["microsoft", "google"].map(id => ({ id, clientId: T.get().SIGNIN_PROVIDERS[id].clientId, clientSecret: "" }));
async function scopesOnScene(src) {
  const { T } = boot(src);
  const [ms, g] = providersOf(T);
  const m = await requests(T, ms, true), gg = await requests(T, g, true);
  const scopeOf = u => new URL(u).searchParams.get("scope"), formScope = f => new URLSearchParams(f).get("scope");
  const policy = { plain: T.storeOnFor(null, false).on, managedUnset: T.storeOnFor({ managed: { type: "dword", value: "1" } }, false).on,
    managedOn: T.storeOnFor({ managed: { type: "dword", value: "1" }, personalstore: { type: "REG_SZ", value: "on" } }, false).on, personOff: T.storeOnFor(null, true).on };
  const ok = scopeOf(m.url) === "openid profile offline_access" && formScope(m.form) === "openid profile offline_access Files.ReadWrite.AppFolder"
    && scopeOf(gg.url) === "openid https://www.googleapis.com/auth/drive.appdata" && formScope(gg.form) === null && gg.form === todayForm(T, g)
    && T.signinIo({ loop: null }).store === true && policy.plain === true && policy.managedUnset === false && policy.managedOn === true && policy.personOff === false;
  return { ok, detail: brief({ ms: scopeOf(m.url), msRefresh: formScope(m.form), google: scopeOf(gg.url), googleRefresh: formScope(gg.form), ioStore: T.signinIo({ loop: null }).store, policy }) };
}
async function scopesOffScene(src) {
  const { T } = boot(src);
  const [ms, g] = providersOf(T);
  /* Off as a managed computer with PersonalStore unset makes it: the shell's own answer for that policy. */
  const off = T.storeOnFor({ managed: { type: "dword", value: "1" } }, false).on;
  const m = await requests(T, ms, off), gg = await requests(T, g, off);
  const same = { msUrl: m.url === todayUrl(T, ms, m.url), msForm: m.form === todayForm(T, ms), gUrl: gg.url === todayUrl(T, g, gg.url), gForm: gg.form === todayForm(T, g) };
  return { ok: off === false && Object.values(same).every(Boolean) && !!m.url && !!gg.url, detail: brief(Object.assign({ off }, same)) };
}
/* (b) and (c): a desk holding a sign-in renews quietly, seated; the look follows, its store certificate kept in memory. */
async function renewScene(src, o) {
  const world = worldOf(o);
  const shell = boot(src, { world, held: true, trace: true, lab: { service: STAGING, clientIds: { microsoft: MS_CLIENT }, root: rawPub(LAB_ROOT.publicKey) } });
  const { T } = shell;
  const me = T.branchIdentity(true);
  const said = await T.signinRenewNow();
  const flight = T.get().storeFlight;
  if (flight) await flight;
  const now = T.get().storeNow, held = T.signinState().held;
  return { world, shell, me, said, now, held };
}
async function lookScene(src) {
  const r = await renewScene(src);
  const n = r.now, file = r.world.file ? JSON.parse(r.world.file) : null;
  const ok = r.said === "renewed" && !!r.held && !!r.held.cert && !!n && n.state === "on" && !!n.store && n.store.kind === "etiuda-store-certificate"
    && n.store.desk === r.me.key && !!file && file.devices.length === 1 && file.devices[0].pub === r.me.key && r.world.R.stores.size > 0;
  return { ok, detail: brief({ said: r.said, seat: !!(r.held && r.held.cert), state: n && n.state, why: n && n.why, store: !!(n && n.store), enrolled: file && file.devices.length,
    other: r.world.other }) };
}
/* (b2) The folder's scope refused at a renewal, as for a person who signed in before it was asked: the seat renews as today, and the
   look says consent without asking the provider again. */
async function refusedScene(src) {
  const r = await renewScene(src, { refuseFolder: true });
  const scopes = r.world.forms.map(f => new URLSearchParams(f).get("scope"));
  const ok = r.said === "renewed" && !!r.held && !!r.held.cert && !!r.now && r.now.state === "unavailable" && r.now.why === "ungiven" && r.now.say === "ungiven"
    && scopes.join() === "openid profile offline_access Files.ReadWrite.AppFolder,openid profile offline_access" && r.world.graph.length === 0 && r.world.service.length === 1;
  return { ok, detail: brief({ said: r.said, seat: !!(r.held && r.held.cert), state: r.now && r.now.state, why: r.now && r.now.why, scopes, folderAsks: r.world.graph.length }) };
}
async function tokenScene(src) {
  const r = await renewScene(src), A = r.world.access;
  const inFiles = filesUnder(r.shell.UD).concat([r.shell.lab]).filter(f => fs.readFileSync(f).toString("utf8").indexOf(A) >= 0).map(f => path.basename(f));
  const inTrace = r.shell.said.filter(l => l.indexOf(A) >= 0).length, traced = r.shell.said.filter(l => /^etiuda: sign-in microsoft refresh: ok/.test(l)).length;
  const inBodies = r.world.service.concat(r.world.relay).filter(b => b.indexOf(A) >= 0).length;
  const used = r.world.graph.filter(g => g.endsWith("Bearer " + A)).length;
  const ok = !!r.now && r.now.state === "on" && inFiles.length === 0 && inTrace === 0 && traced >= 1 && inBodies === 0 && r.world.service.length >= 2 && r.world.relay.length >= 2 && used >= 2;
  return { ok, detail: brief({ state: r.now && r.now.state, inFiles, inTrace, traced, inBodies, serviceBodies: r.world.service.length, relayBodies: r.world.relay.length, folderAsks: used }) };
}
/* (d) The licence service's door takes signin/desk, signout/desk, store/grant and store/end, and nothing else, of the service's own host. */
async function doorScene(src) {
  const { T } = boot(src);
  const calls = [];
  const fetchFn = async (u, init) => { calls.push(u); return new Response(Buffer.from("{}"), { status: 200 }); };
  const base = "https://etiuda.dev/licence/v1/";
  const take = ["signin/desk", "signout/desk", "store/grant", "store/end"].map(r => base + r);
  const refuse = [base + "store/other", base + "store/grant/x", base + "store/grant?x=1", base + "door/set", base + "store", "https://evil.example.test/licence/v1/store/grant",
    "http://etiuda.dev/licence/v1/store/grant", "https://etiuda.dev/licence-staging/v1/store/grant", "https://etiuda.dev/relay/v1/store/grant"];
  let refused = 0, taken = 0;
  for (const u of refuse) { try { await T.signinServiceAsk(fetchFn, u, { a: 1 }); } catch { refused++; } }
  const before = calls.length;
  for (const u of take) { try { await T.signinServiceAsk(fetchFn, u, { a: 1 }); taken++; } catch { /* counted */ } }
  const ok = refused === refuse.length && before === 0 && taken === take.length && calls.join() === take.join() && T.storeServiceAt("store/grant") === base + "store/grant";
  return { ok, detail: brief({ refused, of: refuse.length, taken, reached: calls.length }) };
}

/* (e) The relay a store is made at: production's, or the one of DOOR_RELAYS the sign-in lab names; a lab naming any other is refused whole. */
async function relayScene(src) {
  const lab = relay => ({ service: STAGING, clientIds: { microsoft: MS_CLIENT }, relay });
  const plain = boot(src).T.get(), staging = boot(src, { lab: lab("https://etiuda.dev/relay-staging/v1") }).T.get(), other = boot(src, { lab: lab("https://relay.example.test/relay/v1") }).T.get();
  const got = { plain: plain.STORE_RELAY, staging: staging.STORE_RELAY, stagingService: staging.SIGNIN_SERVICE, other: other.STORE_RELAY, otherService: other.SIGNIN_SERVICE };
  const ok = got.plain === "https://etiuda.dev/relay/v1" && got.staging === "https://etiuda.dev/relay-staging/v1" && got.stagingService === STAGING + "signin/desk"
    && got.other === "https://etiuda.dev/relay/v1" && got.otherService === "https://etiuda.dev/licence/v1/signin/desk";
  return { ok, detail: brief(got) };
}

/* (f) MICROSOFT'S FOLDER ASKED APART: the sign-in asks today's scopes alone; once its code is back, the same browser window is sent on from
   the loopback's landing to ask the folder alone; a refusal, or an administrator's approval needed, leaves the desk signed in and says
   "consent" once; a renewal asks the folder quietly and never opens a browser. The browser is a stand-in over real HTTP to the loopback. */
const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TODAY_MS = "openid profile offline_access", FOLDER_ALONE = "openid Files.ReadWrite.AppFolder";
const labOf = () => ({ service: STAGING, clientIds: { microsoft: MS_CLIENT, google: G_CLIENT }, root: rawPub(LAB_ROOT.publicKey) });
function loopGet(port, at) {
  return new Promise(resolve => {
    const req = http.get({ host: "127.0.0.1", port, path: at }, res => {
      const parts = [];
      res.on("data", c => parts.push(c));
      res.on("end", () => resolve({ status: res.statusCode, location: String(res.headers.location || ""), body: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", () => resolve({ status: 0, location: "", body: "" }));
    req.setTimeout(20000, () => req.destroy());
  });
}
let codeN = 0;
/* The person's browser at Microsoft: `mode.refuse`, where given, is the query Microsoft brings back for a request asking the folder (the
   person declining, or a tenant whose administrator must approve); any other request is answered with a code. Every authorize address
   the browser meets is kept, opened or redirected to. */
function browserOf(world, mode) {
  const b = { urls: [], pages: [], again: [] };
  let finish = null;
  b.done = new Promise(a => { finish = a; });
  const answer = (q, folder) => {
    const asks = /Files\.ReadWrite\.AppFolder|drive\.appdata/.test(q.get("scope") || "");
    if (asks && mode.refuse) return mode.refuse;
    const code = "code-" + (++codeN) + "-" + crypto.randomBytes(6).toString("hex");
    world.codes[code] = { nonce: q.get("nonce"), folder: (folder || asks) && !mode.untick };
    return "code=" + code;
  };
  b.go = async url => {
    b.urls.push(url);
    const q = new URL(url).searchParams, port = new URL(q.get("redirect_uri")).port;
    let r = await loopGet(port, "/?" + answer(q, false) + "&state=" + encodeURIComponent(q.get("state")));
    if (r.status === 303) r = await loopGet(port, r.location);
    for (let i = 0; i < 3 && r.status === 303 && r.location.indexOf(MS_AUTH + "?") === 0; i++) {
      b.urls.push(r.location);
      const q2 = new URL(r.location).searchParams;
      r = await loopGet(port, "/?" + answer(q2, true) + "&state=" + encodeURIComponent(q2.get("state")));
      if (r.status === 303) r = await loopGet(port, r.location);
      b.again.push(await loopGet(port, "/?code=again&state=" + encodeURIComponent(q2.get("state"))));
    }
    b.pages.push(r);
    finish();
  };
  return b;
}
/* One press of Microsoft's button through the shell's own handler, sync on unless `mode.store` says otherwise. */
async function signinFlow(src, mode) {
  const world = worldOf({ refuseFolder: mode.quiet !== true });
  const b = browserOf(world, mode);
  const shell = boot(src, { world, lab: labOf(), store: mode.store, browser: u => { setTimeout(() => { b.last = b.go(u).catch(() => {}); }, 5); } });
  const { T } = shell;
  const e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" }, returnValue: undefined };
  const provider = mode.provider || "microsoft";
  shell.ipc.on["etiuda:signin-click"](e, provider);
  const view = await shell.ipc.handle["etiuda:signin"](e, provider);
  const held = T.signinState().held;
  await Promise.race([b.done, new Promise(a => setTimeout(a, 20000))]);
  await new Promise(a => setTimeout(a, 60));
  const flight = T.get().storeFlight;
  if (flight) await flight;
  const forms = world.forms.map(f => { const x = new URLSearchParams(f); return x.get("grant_type") + (x.get("scope") ? " " + x.get("scope") : ""); });
  const qs = b.urls.map(u => new URL(u).searchParams);
  return { world, shell, view, held, now: T.get().storeNow, page: b.pages[0] || { status: 0, body: "" }, qs, b, forms, e, mode };
}
const seatPage = page => page.status === 200 && page.body.indexOf("<h1>Signed in</h1>") >= 0;
const flowBrief = r => brief({ said: r.view && r.view.said, seat: !!(r.held && r.held.cert), scopes: r.qs.map(q => q.get("scope")), opened: r.shell.opened.length,
  page: r.page.status, seatPage: seatPage(r.page), state: r.now && r.now.state, why: r.now && r.now.why, say: r.now && r.now.say, forms: r.forms, folderAsks: r.world.graph.length });
const DECLINED = "error=access_denied&error_description=" + encodeURIComponent("AADSTS65004: User declined to consent to access the app.");
const ADMIN = "error=consent_required&error_description=" + encodeURIComponent("AADSTS90094: The grant requires admin permission.");
async function refusedFlowScene(src, refuse, why) {
  const r = await signinFlow(src, { refuse });
  const second = r.qs[1];
  const ok = !!r.qs[0] && r.qs[0].get("scope") === TODAY_MS && !!r.held && !!r.held.cert && r.view.said === "signin-done" && seatPage(r.page)
    && r.qs.length === 2 && r.shell.opened.length === 1 && second.get("scope") === FOLDER_ALONE && second.get("redirect_uri") === r.qs[0].get("redirect_uri")
    && !!r.now && r.now.state === "unavailable" && r.now.why === why && r.now.say === why && r.world.graph.length === 0
    && r.forms.join() === "authorization_code,refresh_token " + TODAY_MS + " Files.ReadWrite.AppFolder" && r.b.again.every(x => x.status !== 303);
  return { ok, detail: flowBrief(r) };
}
async function grantFlowScene(src) {
  const r = await signinFlow(src, {});
  const first = r.qs[0], second = r.qs[1];
  const used = r.world.graph.filter(g => g.endsWith("Bearer " + r.world.access)).length;
  const ok = !!first && first.get("scope") === TODAY_MS && !!second && second.get("scope") === FOLDER_ALONE && second.get("prompt") === null
    && second.get("redirect_uri") === first.get("redirect_uri") && second.get("login_hint") === "person@example.test" && second.get("response_mode") === "query"
    && second.get("state") !== first.get("state") && second.get("code_challenge_method") === "S256"
    && r.shell.opened.length === 1 && r.qs.length === 2 && !!r.held && !!r.held.cert && seatPage(r.page) && !!r.now && r.now.state === "on" && used >= 2
    && r.forms.join() === "authorization_code,refresh_token " + TODAY_MS + " Files.ReadWrite.AppFolder,authorization_code" && r.b.again.every(x => x.status !== 303);
  return { ok, detail: flowBrief(r) + " hint=" + (second && second.get("login_hint")) + " prompt=" + (second && second.get("prompt")) };
}
async function quietFlowScene(src) {
  const r = await signinFlow(src, { quiet: true });
  const ok = r.qs.length === 1 && r.qs[0].get("scope") === TODAY_MS && r.shell.opened.length === 1 && !!r.held && !!r.held.cert && seatPage(r.page)
    && !!r.now && r.now.state === "on" && r.forms.join() === "authorization_code,refresh_token " + TODAY_MS + " Files.ReadWrite.AppFolder";
  return { ok, detail: flowBrief(r) };
}
async function offFlowScene(src) {
  const r = await signinFlow(src, { store: { off: true } });
  const ok = r.qs.length === 1 && r.qs[0].get("scope") === TODAY_MS && r.shell.opened.length === 1 && !!r.held && !!r.held.cert && seatPage(r.page)
    && r.now === null && r.forms.join() === "authorization_code" && r.world.graph.length === 0;
  return { ok, detail: flowBrief(r) };
}
/* A renewal whose folder scope is refused, the desk having said "consent" already: no browser, no loopback, nothing more said. */
async function renewQuietScene(src) {
  const world = worldOf({ refuseFolder: true });
  const shell = boot(src, { world, held: true, lab: labOf(), store: { said: "ungiven" }, browser: () => {} });
  shell.T.branchIdentity(true);
  const said = await shell.T.signinRenewNow();
  const flight = shell.T.get().storeFlight;
  if (flight) await flight;
  const now = shell.T.get().storeNow, held = shell.T.signinState().held;
  const ok = said === "renewed" && !!held && !!held.cert && shell.opened.length === 0 && !!now && now.state === "unavailable" && now.why === "ungiven" && now.say === null
    && world.graph.length === 0;
  return { ok, detail: brief({ said, seat: !!(held && held.cert), opened: shell.opened.length, state: now && now.state, why: now && now.why, say: now && now.say }) };
}
/* The loopback's onward step, once: a second onward is refused, the first request's state is no longer taken, and the folder's reply is
   taken once and then landed. */
async function onwardOnceScene(src) {
  const { T } = boot(src);
  const loop = await T.signinListen(http, k => "page " + k, 10000, q => /(^|&)state=s1(&|$)/.test(q), 5000);
  const back = await loopGet(loop.port, "/?state=s1&code=c1");
  await loop.caught;
  const url = MS_AUTH + "?client_id=x&state=s2";
  const one = loop.onward(url, q => /(^|&)state=s2(&|$)/.test(q), 5000), two = loop.onward(url, () => true, 5000);
  const sent = await loopGet(loop.port, back.location);
  const old = await loopGet(loop.port, "/?state=s1&code=c1");
  const reply = await loopGet(loop.port, "/?state=s2&code=c2");
  const query = one ? await Promise.race([one.catch(() => null), new Promise(a => setTimeout(() => a("unanswered"), 3000))]) : null;
  const repeat = await loopGet(loop.port, "/?state=s2&code=c2");
  loop.land("seat");
  const page = await loopGet(loop.port, reply.location);
  const ok = back.status === 303 && !!one && two === null && sent.status === 303 && sent.location === url && old.status === 400 && reply.status === 303
    && query === "state=s2&code=c2" && repeat.status === 404 && page.status === 200 && page.body === "page seat";
  return { ok, detail: brief({ back: back.status, one: !!one, two: two === null ? null : "a second", sent: sent.status, old: old.status, reply: reply.status, query, repeat: repeat.status, page: page.status }) };
}

/* (g) THE SWITCH WHERE CONSENT WAS NEVER GIVEN: after a declined folder (Microsoft) or an unticked one (Google), the look says "ungiven",
   the state the Account row shows as Off with its switch; a trusted click on On and the switch's call open exactly one request at the
   provider naming the account, and its answer lands as the second step's or a sign-in's does. The organisation's refusal keeps "consent",
   and the call opens nothing. */
const until = async (cond, ms) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise(a => setTimeout(a, 20)); return cond(); };
async function pressOn(r, clicked) {
  const before = r.shell.opened.length, last = r.b.last;
  if (clicked) r.shell.ipc.on["etiuda:store-on-click"](r.e);
  const answer = await r.shell.ipc.handle["etiuda:store-consent"](r.e);
  if (answer === "asked") { await until(() => r.b.last !== last, 5000); await r.b.last; }
  const flight = r.shell.T.get().storeConsentFlight;
  if (flight) await flight;
  const look = r.shell.T.get().storeFlight;
  if (look) await look;
  return { answer, opened: r.shell.opened.slice(before) };
}
async function switchScene(src) {
  const r = await signinFlow(src, { refuse: DECLINED });
  const ungiven = !!r.now && r.now.why === "ungiven";
  const unclicked = await pressOn(r, false);
  r.mode.refuse = undefined;
  const on = await pressOn(r, true);
  const q = on.opened.length === 1 ? new URL(on.opened[0]).searchParams : new URLSearchParams();
  const now = r.shell.T.get().storeNow, held = r.shell.T.signinState().held;
  const admin = await signinFlow(src, { refuse: ADMIN });
  const adminPress = await pressOn(admin, true);
  const ok = ungiven && unclicked.answer === "click" && unclicked.opened.length === 0 && on.answer === "asked" && on.opened.length === 1
    && on.opened[0].indexOf(MS_AUTH + "?") === 0 && q.get("scope") === FOLDER_ALONE && q.get("login_hint") === "person@example.test" && q.get("prompt") === null
    && !!now && now.state === "on" && !!held && !!held.cert && admin.now && admin.now.why === "consent" && adminPress.answer === "none" && adminPress.opened.length === 0;
  return { ok, detail: brief({ ungiven, unclicked: unclicked.answer, answer: on.answer, opened: on.opened.length, scope: q.get("scope"), hint: q.get("login_hint"), prompt: q.get("prompt"),
    state: now && now.state, why: now && now.why, adminWhy: admin.now && admin.now.why, adminPress: adminPress.answer, adminOpened: adminPress.opened.length }) };
}
async function googleSwitchScene(src) {
  const r = await signinFlow(src, { provider: "google", untick: true });
  const first = r.qs[0] || new URLSearchParams();
  const ungiven = !!r.now && r.now.why === "ungiven" && !!r.held && !!r.held.cert;
  r.mode.untick = false;
  const on = await pressOn(r, true);
  const q = on.opened.length === 1 ? new URL(on.opened[0]).searchParams : new URLSearchParams();
  const held = r.shell.T.signinState().held, access = r.shell.T.get().storeAccess, now = r.shell.T.get().storeNow;
  const ok = ungiven && first.get("scope") === "openid " + DRIVE_SCOPE && on.answer === "asked" && on.opened.length === 1
    && on.opened[0].indexOf("https://accounts.google.com/o/oauth2/v2/auth?") === 0 && q.get("scope") === "openid " + DRIVE_SCOPE && q.get("login_hint") === SUB
    && q.get("prompt") === null && !!held && !!held.cert && !!access && access.token === r.world.access && !!now && now.why !== "ungiven";
  return { ok, detail: brief({ ungiven, answer: on.answer, opened: on.opened.length, scope: q.get("scope"), hint: q.get("login_hint") === SUB, prompt: q.get("prompt"),
    seat: !!(held && held.cert), token: !!access && access.token === r.world.access, why: now && now.why }) };
}

const LEGS = [
  ["a1", scopesOnScene, "where sync may be on, Microsoft's refresh form carries Files.ReadWrite.AppFolder, its authorize address today's (the folder asked apart, f), and Google's authorize address drive.appdata, its refresh as today; a managed computer with PersonalStore unset is off, set on is on"],
  ["a2", scopesOffScene, "where sync is off (a managed computer, PersonalStore unset), each provider's authorize address and refresh form are today's, byte for byte"],
  ["b", lookScene, "a seated quiet renewal is followed by the look: the key file made in the person's App Folder, this desk enrolled at the relay, the store certificate kept"],
  ["b2", refusedScene, "a renewal whose folder scope is refused renews the seat as today, and the look says \"ungiven\" once (consent never given), the provider not asked again"],
  ["c", tokenScene,"the folder's access token reaches the folder alone: no file, no trace line and no body to the licence service or the relay holds it"],
  ["e", relayScene, "a store is made at production's relay, or at the one of the trusted relays a sign-in lab names; a lab naming another is refused whole"],
  ["f0", offFlowScene, "where sync is off, Microsoft's sign-in asks today's scopes and nothing after: no folder asked, quietly or in the browser, no look"],
  ["f1", s => refusedFlowScene(s, DECLINED, "ungiven"), "Microsoft's sign-in asks today's scopes alone; the folder, declined in the same browser window, leaves the desk signed in with its seat, the landing as today's, and \"ungiven\" said once, which the switch mends"],
  ["f2", s => refusedFlowScene(s, ADMIN, "consent"), "the same where the folder needs an administrator's approval: signed in with its seat, \"consent\" (the organisation's, no switch) said once, the provider not asked again"],
  ["f3", grantFlowScene, "the folder granted in the second step: the loopback's landing sends the same window on to ask it alone, no account choice, the person's name as hint; the folder's token opens the store"],
  ["f4", quietFlowScene, "an account that already allows the folder is asked nothing more: the quiet refresh answers it, one browser screen"],
  ["f5", renewQuietScene, "a renewal whose folder scope is refused asks it quietly, opens no browser and says nothing more"],
  ["f6", onwardOnceScene, "the loopback sends the window on at most once per sign-in, and takes the folder's reply once"],
  ["g1", switchScene, "after a declined folder the look says \"ungiven\", Off with its switch: On without a trusted click opens nothing; with one, exactly one request for the folder alone naming the account, which lands the store on; an administrator's need keeps \"consent\" and the call opens nothing"],
  ["g2", googleSwitchScene, "on Google the folder line unticked at sign-in says \"ungiven\"; On opens exactly one Google sign-in asking the folder with it, naming the account, and the same account's seat and the folder's token are kept"],
  ["d", doorScene, "the licence service's door takes signin/desk, signout/desk, store/grant and store/end of its own host, and refuses every other route"],
];
const results = {};
const scenes = Object.fromEntries(LEGS.map(([id, scene]) => [id, scene]));
for (const [id, scene, line] of LEGS) {
  const r = await safe(() => scene(MAIN));
  results[id] = r;
  check(r.ok === true, id + " " + line + ": " + r.detail);
}

/* ---- the plants: each guard put in another form in a copy of shell/main.js's text, which turns its leg red ---- */
const swap = (from, to) => text => (text.split(from).length === 2 ? text.split(from).join(to) : null);
const PLANTS = [
  ["a1", swap("    const folder = io.store === true && !signinFolderApart(p.id) ? signinFolderScope(p.id, access) : \"\";\n    pending =", "    const folder = \"\";\n    pending ="), "the sign-in asks no folder scope"],
  ["a1", swap("    : known.refreshScope && folder ? known.refreshScope + \" \" + folder : known.refreshScope;", "    : known.refreshScope;"), "the refresh asks no folder scope"],
  ["a2", swap("    const folder = io.store === true && !signinFolderApart(p.id) ? signinFolderScope(p.id, access) : \"\";\n    pending =", "    const folder = signinFolderScope(p.id, access);\n    pending ="), "the sign-in asks the folder's scope where sync is off"],
  ["a2", swap("  const folder = io.store === true ? signinFolderScope(p.id, access) : \"\";\n  let res = null, folderRes = null;", "  const folder = signinFolderScope(p.id, access);\n  let res = null, folderRes = null;"), "the renewal asks it where sync is off"],
  ["b", swap("  if (r.said === \"renewed\") storeTurn(); /* plant:store-renew */\n", ""), "the look taken out of the renewal"],
  ["b2", swap("  if (folder && res.status !== 200) {\n    try {", "  if (false) {\n    try {"), "the refused scope is not asked again without it"],
  ["c", swap("{ format: 1, keys: s.keys || \"\", said: s.said || \"\" }", "{ format: 1, keys: s.keys || \"\", said: s.said || \"\", t: storeAccess && storeAccess.token }"), "the token written to the state file"],
  ["c", swap("  if (folder) signinFolderTake(io, folderRes || { status: 0 }, p.id, now()); /* plant:folder-take-renew */\n",
    "  if (folder) signinFolderTake(io, folderRes || { status: 0 }, p.id, now()); /* plant:folder-take-renew */\n  signinTrace(io, p.id, \"refresh\", \"ok\", { detail: String(JSON.parse(Buffer.from(folderRes.bytes).toString()).access_token) });\n"), "the token traced past the trace's own hiding"],
  ["e", swap("  if (!(d.relay === undefined || DOOR_RELAYS.installed.concat(DOOR_RELAYS.unpackaged).indexOf(d.relay) >= 0)) return null; /* plant:lab-relay */\n", ""), "a lab may name any relay"],
  ["f0", swap("if (io.store === true && signinFolderApart(p.id)) signinFolderAfter(", "if (signinFolderApart(p.id)) signinFolderAfter("), "the folder asked after the sign-in where sync is off"],
  ["f1", swap("function signinFolderApart(id) { return id === \"microsoft\"; }", "function signinFolderApart(id) { return false; }"), "Microsoft's folder asked with the sign-in"],
  ["f2", swap("    io.folderToken({ provider: p.id, token: \"\", until: 0, why: org ? \"org\" : \"ungiven\" }); /* plant:folder-refused */\n", ""), "a refusal not kept, so the provider is asked again"],
  ["f3", swap("SIGNIN_WAIT_MS) : null; /* plant:folder-onward */", "SIGNIN_WAIT_MS) && null : null; /* plant:folder-onward */"), "the window never sent on"],
  ["f3", swap("  delete extra.prompt; /* plant:folder-no-prompt */\n", ""), "the second step asks the account choice again"],
  ["f4", swap("if (res && res.status === 200) { signinFolderTake(io, res, p.id, now()); return; } /* plant:folder-quiet */", "if (false) { return; } /* plant:folder-quiet */"), "the quiet answer ignored, the window sent on regardless"],
  ["f5", swap("  if (folder && res.status !== 200) {\n    try {", "  if (folder && res.status !== 200) {\n    handOut(signinAuthorize(p, 1, deskKey, null, \"\", folder).url);\n    try {"), "a renewal opens the browser on a refusal"],
  ["f6", swap("if (!clean || landed || sent) return null; /* plant:onward-once */", "if (!clean || landed) return null; /* plant:onward-once */"), "the loopback sends the window on more than once"],
  ["g1", swap("function storeUngiven() { return storeState().org === true ? \"consent\" : \"ungiven\"; }", "function storeUngiven() { return \"consent\"; }"), "a consent never given read as the organisation's, so no switch"],
  ["g1", swap("    await handOut(pending.url); /* plant:consent-open */", "    await handOut(pending.url); handOut(pending.url); /* plant:consent-open */"), "the switch opens the request twice"],
  ["g2", swap("const token = !lacks && ", "const token = "), "Google's answer without the folder's scope taken as the folder's token"],
  ["d", swap(".indexOf(String(url)) < 0) throw new Error(\"the licence service's door takes", ".indexOf(String(url)) < -1) throw new Error(\"the licence service's door takes"), "the door takes any route"],
];
for (const [id, change, what] of PLANTS) {
  const line = "p " + id + " in a copy of shell/main.js turns " + id + " red (" + what + ")";
  if (PLANTS_OFF) { skip(line); continue; }
  const next = change(MAIN);
  if (next === null) { check(false, line + ": the plant's anchor is not in shell/main.js once"); continue; }
  const r = await safe(() => scenes[id](next));
  check(results[id] && results[id].ok === true && r.ok !== true, line + ": " + (r.ok !== true ? "the leg turned red, " : "the leg still held, ") + String(r.detail).slice(0, 300));
}

try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
