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
const EXPECTED = 81;
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
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files", DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
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
  const R = S.relayEnv({ roots: K.ROOTS, limits: opt.limits });
  R.clock.now = Date.now();
  const w = { R, access: "stand-in-folder-token-" + crypto.randomBytes(12).toString("hex"), forms: [], service: [], relay: [], graph: [], other: [], file: null, codes: {}, drive: { files: [], calls: [] } };
  const json = (status, o) => new Response(Buffer.from(JSON.stringify(o)), { status, headers: { "content-type": "application/json" } });
  const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot", FILE = GRAPH + ":/etiuda-store.json:/content";
  w.fetch = async (url, init) => {
    const u = String(url), method = String(init && init.method || "GET"), headers = (init && init.headers) || {};
    const raw = init && init.body !== undefined && init.body !== null ? Buffer.from(init.body) : null, body = raw ? raw.toString("utf8") : "";
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
      if (w.seatRefused === "none") return json(200, { ok: true, code: CODE, certificate: null, doors: [] });
      if (w.seatRefused) return json(w.seatRefused === "full" ? 409 : 403, { ok: false, reason: w.seatRefused });
      const b = JSON.parse(body);
      return json(200, { ok: true, code: CODE, certificate: seatCert(b.desk, Date.now()), doors: [] });
    }
    if (u === STAGING + "store/grant") {
      w.service.push(body);
      if (w.grantGate) { const g = w.grantGate; w.grantGate = null; if (w.onGrant) w.onGrant(); await g; }
      const b = JSON.parse(body), lines = ["etiuda-licence-store-grant", b.desk, b.rt, b.lead, b.t].concat(b.company ? ["company"] : [], b.replace ? ["replace"] : []);
      if (!verifyWith(b.desk, Buffer.from(lines.join("\n"), "utf8"), b.sig)) return json(400, { ok: false, reason: "signature" });
      R.clock.now = Date.now();
      return json(200, { ok: true, grant: storeGrantOf(b.lead, R.clock.now), store: storeCertOf(b.desk, R.clock.now) });
    }
    if (u === STAGING + "store/end") {
      w.service.push(body);
      if (w.endDown) return json(503, { ok: false, reason: "unavailable" });
      if (w.endStatus) return json(w.endStatus, { ok: false, reason: w.endStatus === 400 ? "malformed" : "signin" });
      const b = JSON.parse(body);
      w.ended = verifyWith(b.desk, Buffer.from(["etiuda-licence-store-end", b.desk, b.rt, b.t].join("\n"), "utf8"), b.sig) ? b.rt : "unsigned";
      return json(200, { ok: true });
    }
    if (u.startsWith("https://etiuda.dev/relay/v1/")) {
      w.relay.push(body);
      if (w.relayDown) return json(503, { error: "unavailable" });
      R.clock.now = Date.now();
      const res = await W.fetch(new Request("https://relay.test/relay/v1/" + u.slice("https://etiuda.dev/relay/v1/".length), { method, headers, body: raw && raw.length ? raw : undefined, duplex: "half" }), R.env);
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
    /* Google Drive's app data folder, as Drive answers: the key file listed by name, made by a multipart create, read by id, its
       bytes replaced by a media upload; every request named by its path and whether it carried the folder's token. */
    if (u.startsWith(DRIVE_FILES) || u.startsWith(DRIVE_UPLOAD)) {
      w.drive.calls.push(method + " " + u.replace("https://www.googleapis.com", "").replace(/\?.*$/, "") + " " + (headers.authorization === "Bearer " + w.access ? "folder" : "other"));
      if (headers.authorization !== "Bearer " + w.access) return json(401, { error: { code: 401, errors: [{ reason: "authError" }] } });
      const byId = id => w.drive.files.find(f => f.id === id);
      if (method === "GET" && u.startsWith(DRIVE_FILES + "?spaces=appDataFolder")) {
        const name = /name = '([^']+)'/.exec(decodeURIComponent(u.split("&q=")[1] || ""));
        return json(200, { files: w.drive.files.filter(f => !name || f.name === name[1]).map(f => ({ id: f.id, createdTime: new Date(f.at).toISOString() })) });
      }
      const m = /\/files\/([A-Za-z0-9_-]+)\?(alt=media|uploadType=media)$/.exec(u);
      if (method === "GET" && m && byId(m[1]) && u.startsWith(DRIVE_FILES)) return new Response(Buffer.from(byId(m[1]).text), { status: 200 });
      if (method === "POST" && u === DRIVE_UPLOAD + "?uploadType=multipart") {
        const parts = body.split(/\r\n--etiuda-[0-9a-f]+/), meta = JSON.parse(parts[0].split("\r\n\r\n")[1]);
        if (!Array.isArray(meta.parents) || meta.parents.join() !== "appDataFolder") return json(400, { error: { code: 400, errors: [{ reason: "badRequest" }] } });
        const f = { id: "d" + crypto.randomBytes(6).toString("hex"), name: meta.name, at: Date.now() + w.drive.files.length, text: parts[1].split("\r\n\r\n").slice(1).join("\r\n\r\n") };
        w.drive.files.push(f);
        return json(200, { id: f.id });
      }
      if (method === "PATCH" && m && byId(m[1]) && u.startsWith(DRIVE_UPLOAD)) { byId(m[1]).text = body; return json(200, { id: m[1] }); }
      return json(400, { error: { code: 400, errors: [{ reason: "badRequest" }] } });
    }
    w.other.push(method + " " + u);
    throw new TypeError("fetch failed");
  };
  return w;
}

/* ---- the shell, evaluated whole: `src` is shell/main.js's text or a planted copy of it ---- */
/* What the leg reads from main.js, appended to its text; a name main.js lacks comes back undefined, so its leg fails alone. */
const TAIL_NAMES = ["storeView", "storeRoom", "storeSetNow", "storeState", "signinRun", "signinRenew", "signinIo", "signinRenewNow", "signinServiceAsk", "storeServiceAt", "storeOnFor", "storeTurn", "branchIdentity", "signinState", "patchDesk", "storeForget", "signinLandingHtml", "signinListen",
  "signinOutNow", "storeLeaveNow", "storeSyncApply"];
const TAIL_STATE = ["storeNow", "storeAccess", "storeFlight", "storeLeaveFlight", "SIGNIN_SERVICE", "SIGNOUT_SERVICE", "STORE_RELAY", "SIGNIN_PROVIDERS", "storeSyncing", "storeConsentFlight"];
const TAIL = "\n__test.T = {" + TAIL_NAMES.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ")
  + ", setJoin: v => { teamJoin = v; }, get: () => ({" + TAIL_STATE.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ") + "}) };";
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

/* (g) The look that is on starts the store's sync (shell/sync/sync.cjs): a desk key that follows, patched, reaches the relay sealed and
   the sync state beside desk.json, a key that does not follow stays out, and a sign out stops it. */
async function syncScene(src) {
  const r = await renewScene(src);
  const T = r.shell.T, sync = T.get().storeSyncing;
  const ch = sync && sync.channel();
  if (ch) await ch.idle();
  const running = !!sync && sync.running(), before = r.world.relay.length, secret = "kept-out-" + crypto.randomBytes(8).toString("hex");
  T.patchDesk(JSON.stringify({ eTheme: "dark", eTeamKeys: secret }));
  if (sync) { sync.merge(); const c = sync.channel(); if (c) { c.kick(); await c.idle(); } }
  const sent = r.world.relay.length - before;
  let state = null;
  try { state = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store", "sync.json"), "utf8")); } catch { state = null; }
  const ledger = state && state.ledger ? Object.keys(state.ledger) : [];
  const clear = r.world.relay.filter(b => b.indexOf(secret) >= 0 || b.indexOf("\"dark\"") >= 0).length;
  if (T.storeForget) T.storeForget();
  const stopped = !!sync && !sync.running();
  const ok = !!r.now && r.now.state === "on" && running && sent >= 1 && ledger.indexOf("k:eTheme") >= 0 && ledger.indexOf("k:eTeamKeys") < 0 && clear === 0 && stopped;
  return { ok, detail: brief({ state: r.now && r.now.state, running, sent, ledger, clear, stopped }) };
}

/* (gt) A TEAM'S FOLDER IS NOT THE PERSON'S: joined to a folder team, the catalog folder is the team's mirror; the store's sync neither
   takes the team's root catalog into the person's store, nor reads the person's own catalog as removed, nor writes a catalog from the
   store into the team's mirror. */
async function teamFolderScene(src) {
  const r = await renewScene(src), T = r.shell.T, sync = T.get().storeSyncing;
  const own = path.join(r.shell.UD, "Etiuda");
  fs.mkdirSync(own, { recursive: true });
  fs.writeFileSync(path.join(own, "Own.ec"), JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "own" }));
  if (sync) sync.merge();
  const before = sync ? Object.assign({}, sync.state().ledger["f:Own.ec"] || {}) : {};
  T.setJoin({ team: "t-folder-team" });
  const mirror = path.join(r.shell.UD, "folder-mirror", "t-folder-team");
  fs.mkdirSync(mirror, { recursive: true });
  fs.writeFileSync(path.join(mirror, "Team.ec"), JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "team" }));
  if (sync) sync.merge();
  const ledger = sync ? sync.state().ledger : {};
  const failed = T.storeSyncApply({ "f:From the store.ec": "{}" }, []);
  const inMirror = fs.readdirSync(mirror).sort();
  const ok = !!sync && !!before.h && !ledger["f:Team.ec"] && !!ledger["f:Own.ec"] && ledger["f:Own.ec"].h === before.h && inMirror.join() === "Team.ec"
    && Array.isArray(failed) && failed.join() === "f:From the store.ec";
  return { ok, detail: brief({ ownTaken: !!before.h, teamTaken: !!ledger["f:Team.ec"], ownRemoved: !!ledger["f:Own.ec"] && ledger["f:Own.ec"].h === null, inMirror, failed }) };
}

/* (d4f) The page's view and the switch: the first look that made the store says "on" once; This computer forgets the keys and ends
   nothing; Everywhere also posts store/end, signed by this desk over the service's lines, and leaves the ended mark in the folder; On
   again makes a new store over the mark. */
async function switchScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const first = T.storeView();
  const rt = r.now && r.now.state === "on" && w.file ? JSON.parse(w.file).rt : "";
  const all = await T.storeSetNow("everywhere");
  const st = T.storeState(), mark = w.file;
  await T.storeSetNow("on");
  const flight = T.get().storeFlight;
  if (flight) await flight;
  const again = T.storeView(), file = w.file ? JSON.parse(w.file) : null;
  const before = w.service.length, fileBefore = w.file;
  const here = await T.storeSetNow("here");
  const ok = first.line === "on" && first.say === "on" && !!rt && all.line === "off" && st.off === true && st.keys === "" && w.ended === rt
    && /"kind":"etiuda-store-ended"/.test(String(mark)) && String(mark).indexOf(rt) >= 0 && again.line === "on" && !!file && file.kind === "etiuda-store-key" && file.rt !== rt
    && here.line === "off" && T.storeState().off === true && T.storeState().keys === "" && w.service.length === before && sameStore(w.file, fileBefore);
  return { ok, detail: brief({ first: first.line + "/" + first.say, everywhere: all.line, ended: w.ended === rt ? "signed, this store" : w.ended, mark: /etiuda-store-ended/.test(String(mark)),
    againLine: again.line, newStore: !!file && file.rt !== rt, here: here.line, hereSent: w.service.length - before }) };
}

/* The folder's file still the same store's key: This computer leaves the store's list (d4h) and leaves the key where it is. */
const sameStore = (a, b) => { try { const x = JSON.parse(a), y = JSON.parse(b); return x.kind === "etiuda-store-key" && x.rt === y.rt && x.k === y.k && x.s === y.s; } catch { return false; } };
/* The keys the relay's store holds enrolled, by the store's own object in memory. */
const enrolled = (w, rt) => { const st = w.R.stores.get(rt); return st ? st.list("dev:").length : -1; };

/* (d4h) This computer, turned off here, leaves the store's list: the relay withdraws its key, the folder's file no longer names it, under
   the last look's store certificate (no new grant asked), and nothing is left owed. */
async function leaveScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const was = w.file ? JSON.parse(w.file) : null, rt = was ? was.rt : "";
  const before = enrolled(w, rt), asked = w.service.length;
  const off = await T.storeSetNow("here");
  const file = w.file ? JSON.parse(w.file) : null, left = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const ok = !!rt && before === 1 && off.line === "off" && enrolled(w, rt) === 0 && !!file && file.rt === rt && file.devices.length === 0 && file.rev === was.rev + 1
    && w.service.length === asked && !left.leave && !left.keys;
  return { ok, detail: brief({ before, after: enrolled(w, rt), line: off.line, fileDevices: file && file.devices.length, rev: file && was ? file.rev - was.rev : null,
    serviceAsked: w.service.length - asked, leaveKept: !!left.leave }) };
}
/* (d4i) The relay not reached at This computer: the folder's file already leaves it out, the keys are kept sealed as owed (no relay team id
   in the file's text), and the next seated renewal, under a fresh store certificate, has the relay withdraw it; then nothing is owed. */
async function leaveOwedScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const rt = w.file ? JSON.parse(w.file).rt : "";
  w.relayDown = true;
  const off = await T.storeSetNow("here");
  const text = fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"), kept = JSON.parse(text);
  const still = enrolled(w, rt), fileDown = w.file ? JSON.parse(w.file) : null;
  w.relayDown = false;
  const grants = w.service.filter(b => /"lead"/.test(b)).length;
  await T.signinRenewNow();
  const flight = T.get().storeLeaveFlight;
  if (flight) await flight;
  const left = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const ok = !!rt && off.line === "off" && !!kept.leave && text.indexOf(rt) < 0 && still === 1 && !!fileDown && fileDown.devices.length === 0
    && enrolled(w, rt) === 0 && !left.leave && w.service.filter(b => /"lead"/.test(b)).length === grants + 1 && T.storeView().line === "off";
  return { ok, detail: brief({ line: off.line, keptSealed: !!kept.leave && text.indexOf(rt) < 0, whileDown: still, folderLeft: fileDown && fileDown.devices.length === 0,
    after: enrolled(w, rt), owedAfter: !!left.leave }) };
}

/* (d4j) The store's room and the account's seat, as the row reads them: a write refused as team-size says full, any other refusal leaves
   it, a write taken empties it; a renewal refused for want of a free seat, or answered with no certificate after this computer synced, says no seat, the switch on; a freed seat
   ("signin") is the sign-in's moment and not this line. */
async function roomSeatScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const on = T.storeView().line;
  T.storeRoom("team-size");
  const full = T.storeView();
  T.storeRoom("rate");
  const still = T.storeView().line;
  T.storeRoom("");
  const emptied = T.storeView().line;
  const seats = {};
  for (const why of ["full", "signin"]) {
    w.seatRefused = why;
    await T.signinRenewNow();
    seats[why] = T.storeView();
  }
  /* A second computer whose renewal is answered with no certificate at all, after it has synced. */
  const b = await renewScene(src);
  b.world.seatRefused = "none";
  await b.shell.T.signinRenewNow();
  seats.none = b.shell.T.storeView();
  const ok = on === "on" && full.line === "full" && full.on === true && still === "full" && emptied === "on"
    && seats.full.line === "noseat" && seats.full.on === true && seats.signin.shown === true && seats.signin.line !== "noseat" && seats.none.line === "noseat" && seats.none.on === true;
  return { ok, detail: brief({ on, full: full.line, afterRate: still, afterTaken: emptied, noneFree: seats.full.line, freed: seats.signin.line, noCertificate: seats.none.shown ? seats.none.line : "not shown" }) };
}

/* (d4k) A store/end refused as one that can never succeed (400) ends the retry: the row returns to "Only on this computer.", nothing
   is kept owed, a line is in the sign-in's trace, and no renewal posts it again. */
const endsPosted = w => w.service.filter(b => { try { const j = JSON.parse(b); return Object.keys(j).sort().join() === "desk,rt,sig,t"; } catch { return false; } }).length;
async function endNeverScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  w.endStatus = 400;
  const off = await T.storeSetNow("everywhere");
  const kept = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8")), posted = endsPosted(w);
  await T.signinRenewNow();
  const traced = r.shell.said.filter(l => /^etiuda: sign-in microsoft store\/end: refused \| status=400/.test(l)).length;
  const ok = off.line === "off" && !kept.owed && posted === 1 && endsPosted(w) === 1 && traced === 1;
  return { ok, detail: brief({ line: off.line, owed: !!kept.owed, posted, postedAfterRenewal: endsPosted(w), traced }) };
}
/* (d4l) A store/end refused for want of a sign-in (403) stays owed, the row saying so: posted again at each renewal while signed in, never
   while signed out, and ended by the 200 that follows. A desk that still holds a sign-in the service has since freed is answered the same
   alike 200 and stops retrying; nothing is lost, since the service posts its own store/end when it frees a seat. */
async function endSigninScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  w.endStatus = 403;
  const off = await T.storeSetNow("everywhere");
  await T.signinRenewNow();
  await new Promise(a => setTimeout(a, 40));
  const again = endsPosted(w), still = T.storeView().line;
  const held = T.signinState().held;
  T.signinState().held = null;
  await T.signinRenewNow();
  await new Promise(a => setTimeout(a, 40));
  const signedOut = endsPosted(w);
  T.signinState().held = held;
  w.endStatus = 0;
  await T.signinRenewNow();
  for (let i = 0; i < 50 && T.storeView().line !== "off"; i++) await new Promise(a => setTimeout(a, 20));
  const after = T.storeView().line, left = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const ok = off.line === "ending" && again === 2 && still === "ending" && signedOut === 2 && endsPosted(w) === 3 && after === "off" && !left.owed;
  return { ok, detail: brief({ line: off.line, postedByRenewal: again, still, postedSignedOut: signedOut - again, final: endsPosted(w), after, owedAfter: !!left.owed }) };
}

/* (d4g) A store/end the service did not answer is owed: kept sealed in store.json, the row's line "ending" meanwhile, posted again at
   the next renewal and gone once answered. */
async function owedScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const rt = r.now && r.now.state === "on" && w.file ? JSON.parse(w.file).rt : "";
  w.endDown = true;
  const off = await T.storeSetNow("everywhere");
  const text = fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"), kept = JSON.parse(text);
  w.endDown = false;
  w.ended = "";
  await T.signinRenewNow();
  for (let i = 0; i < 50 && !w.ended; i++) await new Promise(a => setTimeout(a, 20));
  await new Promise(a => setTimeout(a, 20));
  const after = T.storeView(), left = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const ok = !!rt && off.line === "ending" && !!kept.owed && text.indexOf(rt) < 0 && w.ended === rt && after.line === "off" && !left.owed;
  return { ok, detail: brief({ whileOwed: off.line, keptSealed: !!kept.owed && text.indexOf(rt) < 0, retried: w.ended === rt ? "signed, this store" : w.ended, after: after.line, left: !!left.owed }) };
}

/* (w) ANOTHER PERSON ON THIS DESK: person A synced here; person B, whose own folder holds no key file, is seated on the same Windows
   profile, after A signed out (w1, whose sign-out leaves no keys in store.json) or straight over A's sign-in. Nothing of A's reaches B:
   no key file with A's K or S is written into B's folder by the look (w1, w1d), by a This computer A left owed (w2), and no store/end A
   left owed is posted under B (w3); B's look makes B's own store. */
const sealedOf = s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)).toString("base64");
function seatAnother(T, w, was, sub) {
  T.signinState().held = Object.assign({}, was, { sub: sealedOf(sub || "sub-of-another-person"), refresh: sealedOf("rt-of-another-person") });
  w.file = null;
}
const hasKeysOf = (text, keys) => !!text && !!keys && (String(text).indexOf(keys.k) >= 0 || String(text).indexOf(keys.s) >= 0);
async function anotherScene(src, door, out) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const a = w.file ? JSON.parse(w.file) : null;
  if (door === "leave") { w.relayDown = true; await T.storeSetNow("here"); w.relayDown = false; }
  if (door === "owed") { w.endDown = true; await T.storeSetNow("everywhere"); w.endDown = false; }
  const heldA = T.signinState().held;
  if (out) T.signinOutNow();
  const left = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8")), ends = endsPosted(w);
  seatAnother(T, w, heldA);
  if (door === "leave") { await T.storeLeaveNow(null); }
  if (door === "owed") { await T.signinRenewNow(); await new Promise(x => setTimeout(x, 40)); }
  if (door === "look") { await T.storeTurn(); }
  const intoB = hasKeysOf(w.file, a), b = w.file ? JSON.parse(w.file) : null;
  const n = T.get().storeNow;
  const ok = !!a && !intoB && (door !== "owed" || endsPosted(w) === ends) && (door !== "look" || (!!n && n.state === "on" && !!b && b.rt !== a.rt && b.k !== a.k))
    && (!out || (!left.keys && !left.leave));
  return { ok, detail: brief({ door, out: !!out, keptAtOut: !!left.keys || !!left.leave, aKeysInB: intoB, bFile: b ? (b.kind || "?") : null, bStore: !!b && !!a && b.rt !== a.rt, look: n && n.state + "/" + n.why, endsUnderB: endsPosted(w) - ends }) };
}

/* (w4) A look of A's still out when B is seated keeps nothing for B: its keys are not sealed here under B's name, and its folder
   token is no longer handed out. */
async function lookOutScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const heldA = T.signinState().held;
  w.file = null;
  let open = null, asked = null;
  w.grantGate = new Promise(a => { open = a; });
  const atGrant = new Promise(a => { w.onGrant = a; });
  T.storeSetNow("here");
  await T.storeSetNow("on");
  const flight = T.get().storeFlight;
  await atGrant;
  seatAnother(T, w, heldA);
  T.storeView();
  const writesBefore = w.graph.filter(g => /^PUT /.test(g) && g.indexOf("Bearer stand-in") >= 0).length;
  open();
  if (flight) await flight;
  const kept = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const writesAfter = w.graph.filter(g => /^PUT /.test(g) && g.indexOf("Bearer stand-in") >= 0).length;
  const ok = !kept.keys && writesAfter === writesBefore;
  return { ok, detail: brief({ keptForB: !!kept.keys, folderWritesAfterB: writesAfter - writesBefore }) };
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
/* The folder's landing pages, the copywriter's words [heading, line, tab title], each closing as the sign-in's own pages close. */
const FOLDER_WORDS = {
  en: { on: ["Sync is on", "Etiuda can now use its folder in this account. This tab can be closed.", "Sync on"],
    off: ["Sync stays off", "Nothing changed. It can be turned on in Account at any time. This tab can be closed.", "Sync off"],
    org: ["Your organisation decides on sync", "Its IT department can allow Etiuda's folder. Etiuda works on this computer as before. This tab can be closed.", "Organisation's decision"] },
  pl: { on: ["Synchronizacja włączona", "Etiuda może już korzystać ze swojego folderu na tym koncie. Tę kartę można zamknąć.", "Synchronizacja włączona"],
    off: ["Synchronizacja pozostaje wyłączona", "Nic się nie zmieniło. Można ją włączyć w Koncie w dowolnej chwili. Tę kartę można zamknąć.", "Synchronizacja wyłączona"],
    org: ["O synchronizacji decyduje organizacja", "Folder Etiudy może dopuścić jej dział IT. Na tym komputerze Etiuda działa jak dotąd. Tę kartę można zamknąć.", "Decyzja organizacji"] },
};
const SEAT_EN = ["Signed in", "This computer has its seat. Etiuda carries on by itself; this tab can be closed.", "Signed in"];
const unHtml = h => String(h).replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const wordsAre = (html, w) => { const x = unHtml(html); return x.indexOf("<h1>" + w[0] + "</h1>") >= 0 && x.indexOf(">" + w[1] + "<") >= 0 && x.indexOf("<title>" + w[2] + " · Etiuda</title>") >= 0; };
const folderPage = (page, k) => page.status === 200 && wordsAre(page.body, FOLDER_WORDS.en[k]);
/* (h) Each folder page in both languages carries its words whole, and the sign-in's own seat page is as it was. */
async function folderPagesScene(src) {
  const { T } = boot(src);
  const got = {};
  for (const lang of ["en", "pl"]) for (const k of ["on", "off", "org"]) got[lang + ":" + k] = wordsAre(T.signinLandingHtml("folder-" + k, lang), FOLDER_WORDS[lang][k]);
  got.seat = wordsAre(T.signinLandingHtml("seat", "en"), SEAT_EN);
  return { ok: Object.values(got).every(Boolean), detail: brief(got) };
}
const flowBrief = r => brief({ said: r.view && r.view.said, seat: !!(r.held && r.held.cert), scopes: r.qs.map(q => q.get("scope")), opened: r.shell.opened.length,
  page: r.page.status, seatPage: seatPage(r.page), heading: (/<h1>([^<]*)<\/h1>/.exec(r.page.body) || [])[1], state: r.now && r.now.state, why: r.now && r.now.why, say: r.now && r.now.say, forms: r.forms, folderAsks: r.world.graph.length });
const DECLINED = "error=access_denied&error_description=" + encodeURIComponent("AADSTS65004: User declined to consent to access the app.");
const ADMIN = "error=consent_required&error_description=" + encodeURIComponent("AADSTS90094: The grant requires admin permission.");
async function refusedFlowScene(src, refuse, why, page) {
  const r = await signinFlow(src, { refuse });
  const second = r.qs[1];
  const ok = !!r.qs[0] && r.qs[0].get("scope") === TODAY_MS && !!r.held && !!r.held.cert && r.view.said === "signin-done" && folderPage(r.page, page)
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
    && r.shell.opened.length === 1 && r.qs.length === 2 && !!r.held && !!r.held.cert && folderPage(r.page, "on") && !!r.now && r.now.state === "on" && used >= 2
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
  return { answer, opened: r.shell.opened.slice(before), page: answer === "asked" ? r.b.pages[r.b.pages.length - 1] || { status: 0, body: "" } : null };
}
async function consentSwitchScene(src) {
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
    && folderPage(on.page, "on") && !!now && now.state === "on" && !!held && !!held.cert && admin.now && admin.now.why === "consent" && adminPress.answer === "none" && adminPress.opened.length === 0;
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
    && q.get("prompt") === null && folderPage(on.page, "on") && !!held && !!held.cert && !!access && access.token === r.world.access && !!now && now.why !== "ungiven";
  /* The store opened on Google: the look on, its key file made in Drive's app data folder by the folder's token and naming the store the look
     holds and the licence service granted, every Drive request made with that token, nothing asked of Graph. */
  const d = r.world.drive, file = d.files.length === 1 ? d.files[0] : null;
  let rt = "";
  try { rt = file ? JSON.parse(file.text).rt : ""; } catch { rt = ""; }
  const granted = r.world.service.map(b => { try { return JSON.parse(b).rt; } catch { return ""; } }).filter(Boolean);
  const opened = !!now && now.state === "on" && !!file && file.name === "etiuda-store.json" && /^[0-9a-f]{32}$/.test(rt) && granted.indexOf(rt) >= 0
    && d.calls.length >= 2 && d.calls.every(c => / folder$/.test(c)) && d.calls.some(c => c.indexOf("POST /upload/drive/v3/files ") === 0) && r.world.graph.length === 0;
  return { ok: ok && opened, detail: brief({ ungiven, answer: on.answer, opened: on.opened.length, scope: q.get("scope"), hint: q.get("login_hint") === SUB, prompt: q.get("prompt"),
    seat: !!(held && held.cert), token: !!access && access.token === r.world.access, state: now && now.state, why: now && now.why, store: opened, files: d.files.length, rtGranted: granted.indexOf(rt) >= 0, drive: d.calls.slice(0, 6), graph: r.world.graph.length }) };
}

/* (gn) A look after the one that made the store hands the relay its new grant (POST /t/<rt>/grant, the grant alone), and the relay's row
   then runs to that grant's end, so the store lapses from the person's last seat and not from its making. */
async function renewGrantScene(src) {
  const r = await renewScene(src), T = r.shell.T, R = r.world.R;
  const rt = r.world.file ? JSON.parse(r.world.file).rt : "", row = () => (rt && R.stores.get(rt) ? R.stores.get(rt).get("team") : null);
  const before = row() ? row().until : null;
  await new Promise(x => setTimeout(x, 25));
  await T.signinRenewNow();
  const flight = T.get().storeFlight;
  if (flight) await flight;
  const renewals = r.world.relay.map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(b => b && Object.keys(b).join() === "grant");
  const last = renewals.length ? renewals[renewals.length - 1].grant : null, after = row() ? row().until : null;
  const now = T.get().storeNow;
  const ok = !!now && now.state === "on" && renewals.length === 1 && !!last && last.kind === "etiuda-store-grant" && after === last.until && before !== null && after > before;
  return { ok, detail: brief({ state: now && now.state, renewals: renewals.length, moved: before !== null && after !== null ? after - before : null, toGrant: !!last && after === last.until }) };
}

/* (gc, gs, gr) Where the sync meets the row and the switch. gc: the versions the sync keeps for the person's choice are the row's
   conflict count. gs: This computer and Everywhere stop the sync's channel at once, not at the next look. gr: a write the store's relay
   refuses for its room turns the row full, and the next write it takes turns it on (the relay in memory, its room made small). */
async function conflictsScene(src) {
  const r = await renewScene(src), T = r.shell.T, sync = T.get().storeSyncing;
  const on = T.storeView().line, kept = sync ? sync.state().kept : null;
  if (kept) kept.push({ item: "k:eTheme", by: "k-" + "0".repeat(16), t: Date.now(), h: "0".repeat(64), value: "dark" });
  const two = T.storeView();
  if (kept) kept.length = 0;
  const none = T.storeView().line;
  const ok = on === "on" && !!kept && two.line === "conflict" && none === "on";
  return { ok, detail: brief({ on, kept: kept ? "the sync's list" : "no sync", withOne: two.line, emptied: none }) };
}
async function switchStopScene(src) {
  const got = {};
  for (const what of ["here", "everywhere"]) {
    const r = await renewScene(src), T = r.shell.T, sync = T.get().storeSyncing;
    const before = !!sync && sync.running();
    r.world.relayDown = true;
    const at = T.storeSetNow(what), mid = !!sync && sync.running();
    await at;
    got[what] = { before, atOnce: mid, after: !!sync && sync.running() };
  }
  const ok = Object.values(got).every(g => g.before && !g.atOnce && !g.after);
  return { ok, detail: brief(got) };
}
async function roomWireScene(src) {
  const r = await renewScene(src, { limits: { teamMax: 64 * 1024 } }), T = r.shell.T, sync = T.get().storeSyncing;
  const settle = async () => { if (!sync) return; sync.merge(); const c = sync.channel(); if (c) { c.kick(); await c.idle(); } };
  await settle();
  const on = T.storeView().line, before = r.world.relay.length;
  T.patchDesk(JSON.stringify({ eAgent: "a".repeat(160 * 1024) }));
  await settle();
  const full = T.storeView().line, tried = r.world.relay.length - before;
  T.patchDesk(JSON.stringify({ eAgent: "Ada" }));
  await settle();
  const after = T.storeView().line;
  const ok = on === "on" && tried >= 1 && full === "full" && after === "on";
  return { ok, detail: brief({ on, tried, full, after }) };
}

const LEGS = [
  ["d4h", leaveScene, "This computer leaves the store's list: the relay withdraws its key and the folder's file names it no more, under the last look's store certificate, nothing left owed"],
  ["d4i", leaveOwedScene, "the relay not reached at This computer: the folder's file leaves it out at once, the keys kept sealed as owed, and the next seated renewal has the relay withdraw it"],
  ["d4j", roomSeatScene, "the row says full once a write is refused as team-size and on once one is taken, and no seat where the renewal is refused for want of one; a freed seat is the sign-in's"],
  ["d4k", endNeverScene, "a store/end refused as malformed (400) ends the retry: Only on this computer., nothing owed, one line in the trace, no renewal posts it again"],
  ["d4l", endSigninScene, "a store/end refused for want of a sign-in (403) stays owed and Off everywhere: posted at each renewal while signed in, never signed out, ended by the 200 that follows"],
  ["d4g", owedScene, "a store/end the service did not answer is kept sealed, the row says so, and the next renewal posts it again; answered, the line and the mark are gone"],
  ["d4f", switchScene, "the first look that made the store says on once; Everywhere posts store/end signed by this desk and leaves the ended mark; On makes a new store over it; This computer forgets the keys and ends nothing"],
  ["a1", scopesOnScene, "where sync may be on, Microsoft's refresh form carries Files.ReadWrite.AppFolder, its authorize address today's (the folder asked apart, f), and Google's authorize address drive.appdata, its refresh as today; a managed computer with PersonalStore unset is off, set on is on"],
  ["a2", scopesOffScene, "where sync is off (a managed computer, PersonalStore unset), each provider's authorize address and refresh form are today's, byte for byte"],
  ["b", lookScene, "a seated quiet renewal is followed by the look: the key file made in the person's App Folder, this desk enrolled at the relay, the store certificate kept"],
  ["b2", refusedScene, "a renewal whose folder scope is refused renews the seat as today, and the look says \"ungiven\" once (consent never given), the provider not asked again"],
  ["c", tokenScene,"the folder's access token reaches the folder alone: no file, no trace line and no body to the licence service or the relay holds it"],
  ["e", relayScene, "a store is made at production's relay, or at the one of the trusted relays a sign-in lab names; a lab naming another is refused whole"],
  ["f0", offFlowScene, "where sync is off, Microsoft's sign-in asks today's scopes and nothing after: no folder asked, quietly or in the browser, no look"],
  ["f1", s => refusedFlowScene(s, DECLINED, "ungiven", "off"), "Microsoft's sign-in asks today's scopes alone; the folder, declined in the same browser window, leaves the desk signed in with its seat, the landing as today's, and \"ungiven\" said once, which the switch mends"],
  ["f2", s => refusedFlowScene(s, ADMIN, "consent", "org"), "the same where the folder needs an administrator's approval: signed in with its seat, \"consent\" (the organisation's, no switch) said once, the provider not asked again"],
  ["f3", grantFlowScene, "the folder granted in the second step: the loopback's landing sends the same window on to ask it alone, no account choice, the person's name as hint; the folder's token opens the store"],
  ["f4", quietFlowScene, "an account that already allows the folder is asked nothing more: the quiet refresh answers it, one browser screen"],
  ["f5", renewQuietScene, "a renewal whose folder scope is refused asks it quietly, opens no browser and says nothing more"],
  ["f6", onwardOnceScene, "the loopback sends the window on at most once per sign-in, and takes the folder's reply once"],
  ["g1", consentSwitchScene, "after a declined folder the look says \"ungiven\", Off with its switch: On without a trusted click opens nothing; with one, exactly one request for the folder alone naming the account, which lands the store on; an administrator's need keeps \"consent\" and the call opens nothing"],
  ["gn", renewGrantScene, "a look after the one that made the store hands the relay its new grant alone, and the relay's row runs to that grant's end"],
  ["g2", googleSwitchScene, "on Google the folder line unticked at sign-in says \"ungiven\"; On opens exactly one Google sign-in asking the folder with it, naming the account, and the same account's seat and the folder's token are kept; the store opens in Drive's app data folder by that token"],
  ["h", folderPagesScene, "the folder's three landing pages carry the copywriter's words whole in English and Polish, closing as the sign-in's pages close, and the seat page is unchanged"],
  ["d", doorScene, "the licence service's door takes signin/desk, signout/desk, store/grant and store/end of its own host, and refuses every other route"],
  ["g", syncScene, "the look that is on starts the store's sync: a desk key that follows reaches the relay sealed, one that does not stays out, and a sign out stops it"],
  ["gc", conflictsScene, "the versions the sync keeps for the person's choice are the row's conflict count: one kept reads conflict, none reads on"],
  ["gs", switchStopScene, "This computer and Everywhere stop the store's sync at once, the relay unreached, not at the next look"],
  ["gr", roomWireScene, "a write the store's relay refuses for its room turns the row full, and the next write it takes turns it on"],
  ["gt", teamFolderScene, "joined to a folder team, the store's sync takes no team catalog into the person's store, reads the person's own catalog as removed nowhere, and writes nothing from the store into the team's mirror"],
  ["w1", s => anotherScene(s, "look", true), "person A synced and signed out, which leaves no store keys here; person B seated on the same profile with an empty folder: B's look writes nothing of A's K or S into B's folder and makes B's own store"],
  ["w1d", s => anotherScene(s, "look", false), "the same where B signs in straight over A's sign-in"],
  ["w2", s => anotherScene(s, "leave", false), "a This computer A left owed is not written into B's folder with A's keys"],
  ["w3", s => anotherScene(s, "owed", false), "a store/end A left owed is not posted while B is seated"],
  ["w4", lookOutScene, "a look of A's still out when B is seated seals nothing here for B and writes nothing more to the folder"],
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
  ["b", swap(" storeTurn(); } /* plant:store-renew */\n", " } /* plant:store-renew */\n"), "the look taken out of the renewal"],
  ["b2", swap("  if (folder && res.status !== 200) {\n    try {", "  if (false) {\n    try {"), "the refused scope is not asked again without it"],
  ["c", swap("{ format: 1, keys: s.keys || \"\", said: s.said || \"\" }", "{ format: 1, keys: s.keys || \"\", said: s.said || \"\", t: storeAccess && storeAccess.token }"), "the token written to the state file"],
  ["c", swap("  if (folder) signinFolderTake(io, folderRes || { status: 0 }, p.id, now()); /* plant:folder-take-renew */\n",
    "  if (folder) signinFolderTake(io, folderRes || { status: 0 }, p.id, now()); /* plant:folder-take-renew */\n  signinTrace(io, p.id, \"refresh\", \"ok\", { detail: String(JSON.parse(Buffer.from(folderRes.bytes).toString()).access_token) });\n"), "the token traced past the trace's own hiding"],
  ["e", swap("  if (!(d.relay === undefined || DOOR_RELAYS.installed.concat(DOOR_RELAYS.unpackaged).indexOf(d.relay) >= 0)) return null; /* plant:lab-relay */\n", ""), "a lab may name any relay"],
  ["g", swap("  if (sync) sync.turn(look); /* plant:store-sync-turn */\n", ""), "the look's answer does not turn the sync"],
  ["d4j", swap("seatless: !!held && (!held.cert || held.said === \"full\"), full: storeFullNow }); /* plant:store-view-room */", "seatless: false, full: false }); /* plant:store-view-room */"), "the row is told neither the room nor the seat"],
  ["d4k", swap("  if (!res || res.status !== 400) return \"owed\"; /* plant:store-end-never */", "  if (true) return \"owed\"; /* plant:store-end-never */"), "a 400 kept owed for ever"],
  ["d4k", swap("  signinTrace({ trace: SIGNIN_TRACE_ASKED ? line => console.error(line) : null }, held ? held.provider : \"\", \"store/end\", \"refused\", signinTraceSaid(res, []));\n", ""), "a 400 ends the retry with no line in the trace"],
  ["d4l", swap("  if (!res || res.status !== 400) return \"owed\"; /* plant:store-end-never */", "  if (!res || res.status >= 500) return \"owed\"; /* plant:store-end-never */"), "a 403 ends the retry as a 400 does"],
  ["d4l", swap("  signinFlush();\n  const s = signinState(), held = s.held;\n", "  signinFlush();\n  storeEndAgain().catch(() => false);\n  const s = signinState(), held = s.held;\n"), "posted while signed out, where the service ends nothing"],
  ["d4g", swap("  storeEndAgain().catch(() => false); /* plant:store-end-again */\n", ""), "the owed store/end is never posted again"],
  ["d4h", swap("  if (leaving) await storeLeaveNow(cert); /* plant:store-leave */\n", ""), "This computer leaves nothing"],
  ["d4h", swap("  const current = cert && Number.isSafeInteger(cert.until) && cert.until > Date.now() ? cert : null;", "  const current = null;"), "the leave asks the service for a new grant rather than using the look's certificate"],
  ["d4i", swap("  if (r.said === \"renewed\") { storeLeaveNow(null); storeTurn(); } /* plant:store-renew */", "  if (r.said === \"renewed\") { storeTurn(); } /* plant:store-renew */"), "the owed leave is never tried again"],
  ["d4f", swap("  if (keys) await storeEndEverywhere(keys).catch(() => false);\n", ""), "Everywhere ends nothing"],
  ["d4f", swap("    if (folder && !tok.why) await folder.write(L.endedText(keys.rt)).catch(() => null); /* plant:store-end-mark */\n", ""), "Everywhere leaves the key in the folder"],
  ["f0", swap("if (io.store === true && signinFolderApart(p.id)) signinFolderAfter(", "if (signinFolderApart(p.id)) signinFolderAfter("), "the folder asked after the sign-in where sync is off"],
  ["f1", swap("function signinFolderApart(id) { return id === \"microsoft\"; }", "function signinFolderApart(id) { return false; }"), "Microsoft's folder asked with the sign-in"],
  ["f2", swap("    io.folderToken({ provider: p.id, token: \"\", until: 0, why: org ? \"org\" : \"ungiven\" }); /* plant:folder-refused */\n", ""), "a refusal not kept, so the provider is asked again"],
  ["f3", swap("SIGNIN_WAIT_MS) : null; /* plant:folder-onward */", "SIGNIN_WAIT_MS) && null : null; /* plant:folder-onward */"), "the window never sent on"],
  ["f3", swap("  delete extra.prompt; /* plant:folder-no-prompt */\n", ""), "the second step asks the account choice again"],
  ["f4", swap("if (res && res.status === 200) { signinFolderTake(io, res, p.id, now()); return \"\"; } /* plant:folder-quiet */", "if (false) { return \"\"; } /* plant:folder-quiet */"), "the quiet answer ignored, the window sent on regardless"],
  ["f5", swap("  if (folder && res.status !== 200) {\n    try {", "  if (folder && res.status !== 200) {\n    handOut(signinAuthorize(p, 1, deskKey, null, \"\", folder).url);\n    try {"), "a renewal opens the browser on a refusal"],
  ["f6", swap("if (!clean || landed || sent) return null; /* plant:onward-once */", "if (!clean || landed) return null; /* plant:onward-once */"), "the loopback sends the window on more than once"],
  ["g1", swap("function storeUngiven() { return storeState().org === true ? \"consent\" : \"ungiven\"; }", "function storeUngiven() { return \"consent\"; }"), "a consent never given read as the organisation's, so no switch"],
  ["g1", swap("    await handOut(pending.url); /* plant:consent-open */", "    await handOut(pending.url); handOut(pending.url); /* plant:consent-open */"), "the switch opens the request twice"],
  ["gn", swap("renew: storeRelayRenew, ", ""), "the look hands the relay no renewal, so the store lapses from its making"],
  ["g2", swap("const token = !lacks && ", "const token = "), "Google's answer without the folder's scope taken as the folder's token"],
  ["g2", swap("  const folder = L.folderFor(p.id, {", "  const folder = L.folderFor(\"microsoft\", {"), "the store's folder asked of Microsoft whatever the sign-in, so the store never opens in Google Drive"],
  ["f3", swap("    loop.land(folder || kind || \"back\"); /* plant:folder-land */", "    loop.land(kind || \"back\"); /* plant:folder-land */"), "the second step lands the sign-in's page, not the folder's"],
  ["h", swap("Nothing changed. It can be turned on in Account at any time. This tab can be closed.", "Nothing changed. It can be turned on in Account at any time. You can close this tab."), "a folder page closing in other words than the sign-in's"],
  ["gc", swap("function storeConflicts() { return storeSyncView().kept; } /* plant:store-conflicts */", "function storeConflicts() { return 0; } /* plant:store-conflicts */"), "the row counts no conflict"],
  ["gs", swap("  storeSyncStop(); /* plant:store-set-stop */\n", ""), "the switch leaves the sync running"],
  ["gr", swap("      room: storeRoom, /* plant:store-room */\n", ""), "the store's channel tells the row nothing"],
  ["gt", swap("if (sayJoinPolicy().folder || relayHere() || folderTeamHere() || Object.keys(teamNeedsFolder).length) return \"\"; /* plant:sync-team-folder */", "if (false) return \"\"; /* plant:sync-team-folder */"), "the store's sync lists and writes the team's mirror as the person's folder"],
  ["w1", swap("  if (s.keys || s.leave || storeLeaveHere) {", "  if (false) {"), "a sign-out leaves the store's keys in store.json"],
  ["w1d", swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */"), "the keys kept for A are B's"],
  ["w2", swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */"), "the leave kept for A is B's"],
  ["w3", swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */"), "the store/end owed for A is B's"],
  ["w4", swap("  const ours = () => storeState().who === who && storeWho(signinState().held) === who; /* plant:store-look-ours */", "  const ours = () => true; /* plant:store-look-ours */"), "a look ends under whoever is seated"],
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
