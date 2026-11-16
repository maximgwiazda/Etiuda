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
const EXPECTED = 195;
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
  const w = { R, grantDown: !!opt.grantDown, access: "stand-in-folder-token-" + crypto.randomBytes(12).toString("hex"), forms: [], service: [], relay: [], graph: [], other: [], relayAt: [], file: null, codes: {}, drive: { files: [], calls: [] } };
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
      /* An outage at the token address: every refresh (w.tokenDown), or only one asking the folder's scope (w.folderDown). */
      const folderAsked = /Files\.ReadWrite\.AppFolder/.test(new URLSearchParams(body).get("scope") || "");
      if (w.folderDelay && folderAsked) await new Promise(a => setTimeout(a, w.folderDelay));
      if (w.tokenDown || (w.folderDown && folderAsked)) return json(w.tokenDown || w.folderDown, { error: "temporarily_unavailable" });
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
      return json(200, Object.assign({ token_type: "Bearer", id_token: jwt({ iss: "https://accounts.google.com", aud: G_CLIENT, sub: c.sub || SUB, nonce: c.nonce, exp: Math.floor(now / 1000) + 3600 }),
        scope: c.folder ? "openid " + DRIVE_SCOPE : "openid", access_token: c.folder ? c.access || w.access : "stand-in-google-token-not-the-folder", expires_in: 3600 }, c.noRefresh ? {} : { refresh_token: "rt-google" }));
    }
    if (u === STAGING + "signin/desk") {
      w.service.push(body);
      w.signinAt = Date.now();
      if (w.seatRefused === "none") return json(200, { ok: true, code: CODE, certificate: null, doors: [] });
      if (w.seatRefused) return json(w.seatRefused === "full" ? 409 : 403, { ok: false, reason: w.seatRefused });
      const b = JSON.parse(body);
      return json(200, { ok: true, code: CODE, certificate: seatCert(b.desk, Date.now()), doors: [] });
    }
    if (u === STAGING + "store/grant") {
      w.service.push(body);
      if (w.grantGate) { const g = w.grantGate; w.grantGate = null; if (w.onGrant) w.onGrant(); await g; }
      if (w.grantDown) return json(503, { ok: false, reason: "unavailable" });
      if (w.grantRefuse) return json(403, { ok: false, reason: w.grantRefuse });
      /* The service's own rule where a leg asks for it: a grant only to a desk that signed in within the hour. */
      if (w.signinHour && !(Date.now() - (w.signinAt || 0) < 60 * 60 * 1000)) return json(403, { ok: false, reason: "signin" });
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
      w.relayAt.push(method + " " + u);
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
const TAIL_NAMES = ["storeView", "storeRoom", "storeSetNow", "storeAnswerNow", "storeSetAsideDir", "storeSyncFolder", "storeState", "storeTokenTake", "signinRun", "signinRenew", "signinIo", "signinRenewNow", "signinServiceAsk", "storeServiceAt", "storeOnFor", "storeTurn", "branchIdentity", "signinState", "patchDesk", "storeForget", "signinLandingHtml", "signinListen",
  "signinOutNow", "storeLeaveNow", "storeSyncApply", "storeSyncSoon", "storeSyncLocal", "deskSyncedTell", "storeTokenFor"];
const TAIL_STATE = ["storeNow", "storeAccess", "storeFlight", "storeLeaveFlight", "SIGNIN_SERVICE", "SIGNOUT_SERVICE", "STORE_RELAY", "SIGNIN_PROVIDERS", "storeSyncing", "storeConsentFlight", "storeSyncTimer", "storeSyncPristine", "storeAgainTimer"];
const TAIL = "\n__test.T = {" + TAIL_NAMES.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ")
  + ", setJoin: v => { teamJoin = v; }, setPolicyText: v => { joinPolicyRead = joinPolicyFacts(String(v)); if (typeof joinPolicyReadAt !== \"undefined\") { joinPolicyReadAt = Date.now(); joinPolicyAskedAt = Date.now(); joinPolicyAsking = true; } }, setWindow: v => { theWindow = v; }, get: () => ({" + TAIL_STATE.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ") + "}) };";
function boot(src, o) {
  const opt = o || {};
  const UD = opt.ud || fs.mkdtempSync(path.join(WORK, "ud-"));
  const said = [], opened = [], openedPaths = [], ipc = { on: {}, handle: {} }, appOn = {};
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
    app: { getPath: () => UD, setPath: noop, requestSingleInstanceLock: () => true, quit: noop, on: (ev, fn) => { (appOn[ev] = appOn[ev] || []).push(fn); }, getVersion: () => "0.0.0", getLocale: () => "en",
      getPreferredSystemLanguages: () => ["en"], whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false },
      getLoginItemSettings: () => ({ openAtLogin: false, args: [], launchItems: [] }), setLoginItemSettings: noop, setAppUserModelId: noop,
      setJumpList: () => ({ result: "ok" }), getJumpListSettings: () => ({ minItems: 0 }) },
    ipcMain: { on: (ch, fn) => { ipc.on[ch] = fn; }, handle: (ch, fn) => { ipc.handle[ch] = fn; } }, BrowserWindow: Object.assign(function () { return inert; }, { fromWebContents: () => inert, getAllWindows: () => [] }),
    Menu: { setApplicationMenu: noop, buildFromTemplate: t => ({ items: t, popup() {} }) }, dialog: inert, protocol: inert, session: inert, screen: inert,
    shell: new Proxy({}, { get: (t, k) => (k === "openExternal" ? (u => { opened.push(String(u)); return Promise.resolve(opt.browser ? opt.browser(String(u)) : undefined).then(() => undefined); }) : k === "openPath" ? (p => { openedPaths.push(String(p)); return Promise.resolve(opt.openPath ? String(opt.openPath(String(p)) || "") : ""); }) : inert) }),
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
  const fsMod = opt.fsWrap ? opt.fsWrap(nodeRequire("node:fs")) : null;
  try {
    new Function("require", "__dirname", "__filename", "module", "exports", "console", "__test", "setTimeout", "clearTimeout", src + TAIL)(
      n => (n === "electron" ? electron : (fsMod && (n === "fs" || n === "node:fs")) ? fsMod : nodeRequire(n)),
      path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet, holder,
      opt.timers ? opt.timers.set : setTimeout, opt.timers ? opt.timers.clear : clearTimeout);
  } finally {
    for (const k of Object.keys(env)) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  }
  if (opt.policyText && holder.T) holder.T.setPolicyText(opt.policyText);
  return { T: holder.T, UD, said, opened, openedPaths, ipc, appOn, lab: env.ETIUDA_SIGNIN_LAB };
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
  const shell = boot(src, Object.assign({ world, held: true, trace: true, lab: { service: STAGING, clientIds: { microsoft: MS_CLIENT }, root: rawPub(LAB_ROOT.publicKey) } }, o && o.boot));
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
  /* A computer's first merge waits for a cycle that reached the store (sync.cjs merge). */
  const ch = sync && sync.channel();
  if (ch) await ch.idle();
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

/* (jp) THE SAMPLE UNTOUCHED: the store's sync names the shipped sample in the person's folder as untouched, judged by its bytes as
   isTheSample judges it, so a computer joining a store takes the store's word on it (shell/sync/sync.cjs); a copy with one byte changed,
   whatever its name, is the person's own. */
async function pristineScene(src) {
  const { T } = boot(src);
  const dir = T.storeSyncFolder(), shipped = fs.readFileSync(path.join(ROOT, "shell", "sample-catalog.ec"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sample-catalog.ec"), shipped);
  const edited = Buffer.from(shipped);
  edited[edited.length - 2] = edited[edited.length - 2] === 0x20 ? 0x0a : 0x20;
  fs.writeFileSync(path.join(dir, "sample-catalog-copy.ec"), edited);
  const local = T.storeSyncLocal(), pristine = T.get().storeSyncPristine;
  const ok = !!local && typeof local["f:sample-catalog.ec"] === "string" && typeof local["f:sample-catalog-copy.ec"] === "string"
    && Array.isArray(pristine) && pristine.join() === "f:sample-catalog.ec";
  return { ok, detail: brief({ read: local ? Object.keys(local).filter(k => k.startsWith("f:")) : null, pristine }) };
}

/* (rv) A REMOVAL ACROSS VOLUMES: a catalog another computer removed, where the catalog folder sits on another volume than the
   profile (every rename of it refused as EXDEV), is copied under store/kept and unlinked; where the unlink fails, the copy goes, the
   file stays where it was byte for byte, and the removal is answered as not put in place, so the next merge tries again. */
async function removalVolumeScene(src) {
  let unlinkFails = false;
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "renameSync") return (from, to) => { if (/Harbour\.ec$/.test(String(from))) throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); return target.renameSync(from, to); };
      if (prop === "unlinkSync") return f => { if (unlinkFails && /[\\/]Etiuda[\\/]Harbour\.ec$/.test(String(f))) throw Object.assign(new Error("busy"), { code: "EPERM" }); return target.unlinkSync(f); };
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const { T, UD } = boot(src, { fsWrap });
  const dir = T.storeSyncFolder(), at = path.join(dir, "Harbour.ec"), keptDir = path.join(UD, "store", "kept");
  const bytes = Buffer.from(JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "harbour" }));
  const keptNow = () => (fs.existsSync(keptDir) ? fs.readdirSync(keptDir) : []);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(at, bytes);
  unlinkFails = true;
  const half = T.storeSyncApply({ "f:Harbour.ec": null }, []);
  const stayed = fs.existsSync(at) && fs.readFileSync(at).equals(bytes), keptHalf = keptNow();
  unlinkFails = false;
  const done = T.storeSyncApply({ "f:Harbour.ec": null }, []);
  const kept = keptNow(), moved = kept.length === 1 && /Harbour\.ec$/.test(kept[0]) && fs.readFileSync(path.join(keptDir, kept[0])).equals(bytes);
  const ok = Array.isArray(half) && half.join() === "f:Harbour.ec" && stayed && keptHalf.length === 0 && Array.isArray(done) && done.length === 0 && !fs.existsSync(at) && moved;
  return { ok, detail: brief({ half, stayed, keptHalf, done, gone: !fs.existsSync(at), kept }) };
}

/* (k7) KEPT BEFORE IT IS REPLACED: a merge's patch over a catalog and a layer field, each with the version it replaces to keep. Where
   the copy cannot be kept, neither is put in place (the layer's whole key with it) and both are answered as not applied, while a key
   with no copy is; where the copy is kept and the catalog's write then fails, the file stays as it was and the copy is under kept; once
   both succeed the later is in place and the earlier kept. Every refusal is the file system's stand-in's; nothing real is held open. */
async function keepFirstScene(src) {
  let failKept = false, failCat = false;
  const busy = () => Object.assign(new Error("busy"), { code: "EBUSY" });
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "writeFileSync") return (f, ...a) => {
        const s = String(f);
        if (failKept && /[\\/]store[\\/]kept[\\/]/.test(s)) throw busy();
        if (failCat && /[\\/]Etiuda[\\/]Notes\.ec\./.test(s)) throw busy();
        return target.writeFileSync(f, ...a);
      };
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const { T, UD } = boot(src, { fsWrap });
  const dir = T.storeSyncFolder(), at = path.join(dir, "Notes.ec"), keptDir = path.join(UD, "store", "kept");
  const sha = s => crypto.createHash("sha256").update(s).digest("hex");
  const VA = "{\"v\":\"a\"}", VB = "{\"v\":\"b\"}", PA = JSON.stringify({ edits: { c1: "a" } }), PB = JSON.stringify({ edits: { c1: "b" } });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(at, VA);
  T.patchDesk(JSON.stringify({ ePack: PA, eTheme: "light" }));
  const by = "k-" + "1".repeat(16);
  const copies = [{ item: "f:Notes.ec", by, t: 100, h: sha(VA), value: VA }, { item: "k:ePack#edits/c1", by, t: 100, h: sha("\"a\""), value: "\"a\"" }];
  const patch = () => ({ "f:Notes.ec": VB, "k:ePack": PB, "k:eTheme": "dark" });
  const keysNow = () => { try { return JSON.parse(deskText(UD)).keys || {}; } catch { return {}; } };
  const keptNow = () => (fs.existsSync(keptDir) ? fs.readdirSync(keptDir).map(n => { try { return JSON.parse(fs.readFileSync(path.join(keptDir, n), "utf8")).value; } catch { return "?"; } }).sort() : []);
  failKept = true;
  const one = T.storeSyncApply(patch(), copies);
  const s1 = { failed: (one || []).slice().sort(), file: fs.readFileSync(at, "utf8") === VA ? "a" : "b", pack: keysNow().ePack === PA ? "a" : "b", theme: keysNow().eTheme, kept: keptNow().length };
  failKept = false; failCat = true;
  const two = T.storeSyncApply(patch(), copies);
  const s2 = { failed: (two || []).slice().sort(), file: fs.readFileSync(at, "utf8") === VA ? "a" : "b", kept: keptNow() };
  failCat = false;
  const three = T.storeSyncApply(patch(), copies);
  const s3 = { failed: three || [], file: fs.readFileSync(at, "utf8") === VB ? "b" : "a", pack: keysNow().ePack === PB ? "b" : "a", kept: keptNow() };
  const ok = s1.failed.join() === "f:Notes.ec,k:ePack" && s1.file === "a" && s1.pack === "a" && s1.theme === "dark" && s1.kept === 0
    && s2.failed.join() === "f:Notes.ec" && s2.file === "a" && s2.kept.indexOf(VA) >= 0
    && Array.isArray(three) && three.length === 0 && s3.file === "b" && s3.pack === "b" && s3.kept.indexOf(VA) >= 0 && s3.kept.indexOf("\"a\"") >= 0;
  return { ok, detail: brief({ s1, s2, s3 }) };
}

/* (t7) THE LOOK TRIED AGAIN: a look the licence service did not answer is tried again by itself, through main.js's own timers (each
   real, kept here by handle and run at once rather than waited for): at 1, 2, 4, 8, 16, 32 and 64 minutes, then no more; a look from
   outside starts again, and the service back, the look is on and nothing waits. A refusal (another person's store) is not tried again,
   and the switch turned off, a sign out and a quit each leave no timer. */
async function againScene(src) {
  const live = new Map();
  const timers = { set: (fn, ms, ...a) => { const h = setTimeout(fn, ms, ...a); live.set(h, { fn, ms }); return h; }, clear: h => { live.delete(h); clearTimeout(h); } };
  const r = await renewScene(src, { grantDown: true, boot: { timers } }), T = r.shell.T, w = r.world;
  const pending = () => { const h = T.get().storeAgainTimer; return h && live.has(h) ? live.get(h).ms : 0; };
  const fire = async () => { const h = T.get().storeAgainTimer, e = h && live.get(h); if (!e) return false; timers.clear(h); e.fn(); const f = T.get().storeFlight; if (f) await f; return true; };
  const first = r.now ? r.now.state + "/" + r.now.why : "none", gaps = [];
  for (let i = 0; i < 9 && pending(); i++) { gaps.push(pending() / 60000); await fire(); }
  const spent = !pending();
  await T.storeTurn();
  const again = pending() / 60000;
  w.grantDown = false;
  await fire();
  const back = T.get().storeNow ? T.get().storeNow.state : "none", backLeft = pending();
  w.grantRefuse = "store";
  await T.storeTurn();
  const refused = T.get().storeNow ? T.get().storeNow.state + "/" + T.get().storeNow.why : "none", refusedLeft = pending();
  w.grantRefuse = "";
  w.grantDown = true;
  await T.storeTurn();
  const beforeOff = pending();
  await T.storeSetNow("here");
  const offLeft = pending();
  await T.storeSetNow("on");
  const f1 = T.get().storeFlight;
  if (f1) await f1;
  const beforeOut = pending();
  T.signinOutNow();
  const outLeft = pending();
  const quit = await renewScene(src, { grantDown: true, boot: { timers } });
  const beforeQuit = quit.shell.T.get().storeAgainTimer && live.has(quit.shell.T.get().storeAgainTimer);
  for (const fn of quit.shell.appOn["before-quit"] || []) fn({ preventDefault() {} });
  const quitLeft = !!quit.shell.T.get().storeAgainTimer;
  for (const h of [...live.keys()]) timers.clear(h);
  const ok = first === "paused/unreached" && gaps.join() === "1,2,4,8,16,32,64" && spent && again === 1 && back === "on" && !backLeft && refused === "paused/store" && !refusedLeft
    && beforeOff === 60000 && !offLeft && beforeOut === 60000 && !outLeft && beforeQuit && !quitLeft;
  return { ok, detail: brief({ first, gaps, spent, again, back, backLeft, refused, refusedLeft, beforeOff, offLeft, beforeOut, outLeft, beforeQuit, quitLeft }) };
}

/* (t7v) WHAT THE ROW IS TOLD OF A PASSING FAILURE: "again" with the try's own time while one is set, the reason which side was not reached
   (the licence service "unreached", the account's folder "offline"); "spent" once the tries are spent, no time; and nothing of a key, a
   token, a store's id or an address in the view. */
async function againViewScene(src) {
  const live = new Map();
  const timers = { set: (fn, ms, ...a) => { const h = setTimeout(fn, ms, ...a); live.set(h, { fn, ms, at: Date.now() + ms }); return h; }, clear: h => { live.delete(h); clearTimeout(h); } };
  const r = await renewScene(src, { grantDown: true, boot: { timers } }), T = r.shell.T, w = r.world;
  const due = () => { const h = T.get().storeAgainTimer, e = h && live.get(h); return e ? e.at : 0; };
  const fire = async () => { const h = T.get().storeAgainTimer, e = h && live.get(h); if (!e) return false; timers.clear(h); e.fn(); const f = T.get().storeFlight; if (f) await f; return true; };
  const v1 = T.storeView(), at1 = due();
  for (let i = 0; i < 9 && T.get().storeAgainTimer; i++) await fire();
  const spent = T.storeView();
  w.grantDown = false;
  if (T.get().storeAccess) T.get().storeAccess.until = 0;
  w.tokenDown = 503;
  await T.storeTurn();
  const off = T.storeView(), atOff = due();
  for (const h of [...live.keys()]) timers.clear(h);
  const rt = w.file ? JSON.parse(w.file).rt : "", text = JSON.stringify([v1, spent, off]);
  const leaks = [w.access, rt, "etiuda.dev", "graph.microsoft"].filter(x => x && text.indexOf(x) >= 0).length;
  const ok = v1.line === "again" && v1.why === "unreached" && at1 > 0 && v1.at === at1 && spent.line === "spent" && spent.why === "unreached" && !spent.at
    && off.line === "again" && off.why === "offline" && off.at === atOff && atOff > 0 && leaks === 0;
  return { ok, detail: brief({ first: v1.line + "/" + v1.why, atIsTheTry: at1 > 0 && v1.at === at1, spent: spent.line + "/" + spent.why + (spent.at ? "/at" : ""), offline: off.line + "/" + off.why, offAt: off.at === atOff, leaks }) };
}

/* (rf) A REFUSAL IS TOLD AS ONE: the licence service refusing the store's grant for another person's store or for want of a fresh sign-in,
   and the relay refusing the store's making, each reads "refused" with its reason ("store", "signin", and the relay's told only as
   "relay"), and no short try is set. */
async function refusedViewScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  w.grantRefuse = "store";
  await T.storeTurn();
  const store = T.storeView(), storeTry = !!T.get().storeAgainTimer;
  w.grantRefuse = "signin";
  await T.storeTurn();
  const signin = T.storeView(), signinTry = !!T.get().storeAgainTimer;
  w.grantRefuse = "";
  /* A store made afresh here, so the relay is asked to make it. */
  T.storeState().keys = "";
  w.file = null;
  w.relayDown = true;
  await T.storeTurn();
  const relay = T.storeView(), relayTry = !!T.get().storeAgainTimer, look = T.get().storeNow;
  w.relayDown = false;
  const ok = store.line === "refused" && store.why === "store" && signin.line === "refused" && signin.why === "signin" && relay.line === "refused" && relay.why === "relay"
    && !!look && look.state === "paused" && look.why !== "relay" && !storeTry && !signinTry && !relayTry;
  return { ok, detail: brief({ store: store.line + "/" + store.why, signin: signin.line + "/" + signin.why, relay: relay.line + "/" + relay.why, relaySaid: look && look.why, tries: [storeTry, signinTry, relayTry] }) };
}

/* (lk) A LOOK RUNNING IS TOLD: the page is told when a look begins and when it ends; while one runs the row says "first" on a computer
   where no look has had sync on yet and "checking" after; and a start whose renewal has not yet come, nothing looked at in this run,
   says "resuming" where the desk had sync on before and "unconnected" where it never did, not on. Each look is held at the licence service (grantGate) while the row is read. */
async function lookingScene(src) {
  const world = worldOf(), sent = [];
  const gate = () => { let release = null, reached = null; const at = new Promise(a => { reached = a; }); world.grantGate = new Promise(a => { release = a; }); world.onGrant = () => reached(); return { at, release: () => release() }; };
  const shell = boot(src, { world, held: true, lab: { service: STAGING, clientIds: { microsoft: MS_CLIENT }, root: rawPub(LAB_ROOT.publicKey) } }), T = shell.T;
  T.setWindow({ isDestroyed: () => false, webContents: { send: ch => sent.push(String(ch)) } });
  T.branchIdentity(true);
  const told = () => sent.filter(c => c === "etiuda:store").length;
  const g1 = gate(), t0 = told();
  const renewed = T.signinRenewNow();
  await g1.at;
  const mid1 = T.storeView().line, t1 = told();
  g1.release();
  await renewed;
  if (T.get().storeFlight) await T.get().storeFlight;
  const after1 = T.storeView().line, t2 = told();
  const g2 = gate();
  const second = T.storeTurn();
  await g2.at;
  const mid2 = T.storeView().line;
  g2.release();
  await second;
  const after2 = T.storeView().line;
  /* The same desk started again, its renewal not yet come: nothing looked at in this run. */
  const labNow = { service: STAGING, clientIds: { microsoft: MS_CLIENT }, root: rawPub(LAB_ROOT.publicKey) };
  const restarted = boot(src, { ud: shell.UD, world, lab: labNow }).T.storeView().line;
  /* And one whose look has never found sync on (store.json holding no certificate's end): no date. */
  const never = boot(src, { ud: shell.UD, world, lab: labNow, store: {} }).T.storeView();
  const ok = mid1 === "first" && t1 > t0 && after1 === "on" && t2 > t1 && mid2 === "checking" && after2 === "on" && restarted === "resuming" && never.line === "unconnected" && !never.since;
  return { ok, detail: brief({ mid1, toldAtStart: t1 - t0, after1, toldAtEnd: t2 - t1, mid2, after2, restarted, never: never.line + (never.since ? "/" + never.since : "") }) };
}

/* (ps) THE PAUSES AS THE ROW READS THEM: a renewal refused at the service leaves sync running on the look's current certificate, the row on;
   that certificate ended, the row says signing in is refused; with no refusal, a lapse under three days reads "lapsed" and one of three
   or more the dated pause, its date the certificate's end. */
async function pausesScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  w.seatRefused = "no-role";
  await T.signinRenewNow();
  const refusedOn = T.storeView().line, said = T.signinState().held ? T.signinState().held.said : "";
  const until = T.storeState().until;
  T.storeState().until = Date.now() - 1000;
  const refusedEnded = T.storeView().line;
  T.signinState().held.said = "";
  const lapsed = T.storeView().line;
  const at = Date.now() - 4 * DAY;
  T.storeState().until = at;
  const dated = T.storeView();
  const ok = said === "no-role" && until > Date.now() && refusedOn === "on" && refusedEnded === "signin-refused" && lapsed === "lapsed" && dated.line === "paused" && dated.since === at;
  return { ok, detail: brief({ said, refusedOn, refusedEnded, lapsed, dated: dated.line, since: dated.since === at }) };
}

/* (e7) TURNED OFF EVERYWHERE FROM ANOTHER COMPUTER, POLICY HOLDING SYNC ON: this computer makes a new store over the ended mark from what is
   on it, and the row says so ("anew"). Nothing on the desk is lost: its desk.json and its catalog as they were, every item it had synced
   still in its sync state and written into the new store's place. Nothing in the ended store is touched: no grant, making or list asked
   for it, no store/end, and its mirror here byte for byte. The same mark where nothing holds the switch turns sync off here, as before,
   and makes nothing. */
async function anewScene(src) {
  const r = await renewScene(src, { boot: { policyText: regText({ PersonalStore: "on" }) } }), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const sync = T.get().storeSyncing, idle = async () => { const c = sync && sync.channel(); if (c) { c.kick(); await c.idle(); } };
  if (sync && sync.channel()) await sync.channel().idle();
  T.patchDesk(JSON.stringify({ eAgent: "Ada", eTheme: "dark" }));
  const own = T.storeSyncFolder();
  fs.mkdirSync(own, { recursive: true });
  fs.writeFileSync(path.join(own, "Own.ec"), JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "own" }));
  if (sync) sync.merge();
  await idle();
  const oldRt = w.file ? JSON.parse(w.file).rt : "", items = sync ? Object.keys(sync.state().ledger).sort() : [];
  const oldMirror = path.join(UD, "store", "mirror", oldRt);
  const snap = () => { const out = {}; for (const f of [path.join(UD, "desk.json"), path.join(own, "Own.ec")].concat(fs.existsSync(oldMirror) ? filesUnder(oldMirror) : []))
    out[path.relative(UD, f)] = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); return out; };
  const before = snap();
  /* Another computer turned sync off everywhere: the ended mark in the folder in the key's place. */
  w.file = JSON.stringify({ kind: "etiuda-store-ended", format: 1, rt: oldRt });
  const svcFrom = w.service.length, relayFrom = w.relayAt.length;
  await T.storeTurn();
  const view = T.storeView(), now = T.get().storeNow, file = w.file ? JSON.parse(w.file) : null;
  await idle();
  const after = snap(), newRt = file && file.kind === "etiuda-store-key" ? file.rt : "";
  const askedOld = w.service.slice(svcFrom).filter(b => b.indexOf(oldRt) >= 0).length
    + w.relayAt.slice(relayFrom).filter(u => /\/(grant|devices)$/.test(u) && u.indexOf("/t/" + oldRt + "/") >= 0).length;
  const st = sync ? sync.state() : null;
  let place = "";
  try { place = fs.readFileSync(path.join(UD, "store", "mirror", newRt, "desks", T.branchIdentity(false).id, "sync.json"), "utf8"); } catch { place = ""; }
  const changed = Object.keys(before).filter(k => after[k] !== before[k]);
  /* The control: nothing holds the switch. */
  const c = await renewScene(src), cT = c.shell.T, cw = c.world, cRt = cw.file ? JSON.parse(cw.file).rt : "";
  cw.file = JSON.stringify({ kind: "etiuda-store-ended", format: 1, rt: cRt });
  await cT.storeTurn();
  const cView = cT.storeView(), cMark = /etiuda-store-ended/.test(String(cw.file));
  const ok = !!oldRt && items.indexOf("k:eAgent") >= 0 && items.indexOf("f:Own.ec") >= 0 && !!now && now.state === "on" && view.line === "anew" && view.held === true
    && !!newRt && newRt !== oldRt && T.storeState().off !== true && changed.length === 0 && Object.keys(before).length > 2 && askedOld === 0
    && !!st && st.rt === newRt && items.every(i => !!st.ledger[i]) && place.indexOf("k:eAgent") >= 0 && place.indexOf("f:Own.ec") >= 0
    && cView.line === "off" && cT.storeState().off === true && cMark;
  return { ok, detail: brief({ items, look: now && now.state + "/" + now.why, line: view.line, held: view.held, newStore: !!newRt && newRt !== oldRt, offSet: T.storeState().off === true,
    snapped: Object.keys(before).length, changed, askedOld, syncRt: !!st && st.rt === newRt, ledgerKept: !!st && items.every(i => !!st.ledger[i]), placed: place.indexOf("k:eAgent") >= 0 && place.indexOf("f:Own.ec") >= 0,
    control: cView.line + (cT.storeState().off === true ? "/off" : "") + (cMark ? "/mark" : "") }) };
}

/* (t12) A START OFFLINE: a desk that synced, its sync state holding a kept version, starts again with its certificate standing and the
   token address out, so the start's renewal reaches nothing. The sync is loaded (its kept version counted, the row saying the passing failure over it) and the
   look is tried again by itself; once the address answers, the next try turns the store on and the sync runs, with no renewal or restart. */
async function offlineStartScene(src) {
  const live = new Map();
  const timers = { set: (fn, ms, ...a) => { const h = setTimeout(fn, ms, ...a); live.set(h, { fn, ms }); return h; }, clear: h => { live.delete(h); clearTimeout(h); } };
  const r = await renewScene(src), w = r.world, UD = r.shell.UD, first = r.shell.T.get().storeSyncing;
  if (first && first.channel()) await first.channel().idle();
  if (first) first.stop();
  const file = path.join(UD, "store", "sync.json");
  let st = null;
  try { st = JSON.parse(fs.readFileSync(file, "utf8")); } catch { st = null; }
  if (st) { st.kept.push({ item: "k:eTheme", by: "k-" + "0".repeat(16), t: 1, h: "0".repeat(64) }); fs.writeFileSync(file, JSON.stringify(st)); }
  w.tokenDown = 503;
  const s = boot(src, { ud: UD, world: w, lab: labOf(), timers }), T = s.T;
  const said = await T.signinRenewNow();
  if (T.get().storeFlight) await T.get().storeFlight;
  const h = T.get().storeAgainTimer, e = h && live.get(h);
  const away = { said, loaded: !!T.get().storeSyncing && T.get().storeSyncing.state().kept.length === 1, line: T.storeView().line, look: T.get().storeNow ? T.get().storeNow.state + "/" + T.get().storeNow.why : null, again: e ? e.ms / 60000 : 0 };
  w.tokenDown = 0;
  if (e) { timers.clear(h); e.fn(); if (T.get().storeFlight) await T.get().storeFlight; }
  const sync = T.get().storeSyncing;
  const back = { look: T.get().storeNow ? T.get().storeNow.state : null, syncing: !!sync && sync.running() };
  if (sync) sync.stop();
  for (const k of [...live.keys()]) timers.clear(k);
  const ok = !!st && away.said !== "renewed" && away.loaded && away.line === "again" && away.look === "unavailable/offline" && away.again === 1 && back.look === "on" && back.syncing;
  return { ok, detail: brief({ away, back }) };
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
   left owed is posted under B (w3); B's look makes no store of B's on this desk while the desk's content is A's (x). */
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
  const ok = !!a && !intoB && (door !== "owed" || endsPosted(w) === ends) && (door !== "look" || (!n && !b))
    && (!out || (!left.keys && !left.leave));
  return { ok, detail: brief({ door, out: !!out, keptAtOut: !!left.keys || !!left.leave, aKeysInB: intoB, bFile: b ? (b.kind || "?") : null, bStore: !!b && !!a && b.rt !== a.rt, look: n && n.state + "/" + n.why, endsUnderB: endsPosted(w) - ends }) };
}

/* (x) A DIFFERENT ACCOUNT AFTER ANOTHER ON THIS PROFILE, until the desk can ask whose its content is: A synced here; B is
   seated, after A signed out (x1) or straight over A (x1d). Until the person is asked, nothing is uploaded to B's store and nothing is
   merged: no look, no relay call, no store made, the sync stopped and no merge set going by a change on the desk, and the desk's sync
   state, its mirror and desk.json as they were. Same account back is the ordinary case (x2). A, back after B, finds its own switch as it
   left it and is held as B was (x3, x5). */
const storeTree = UD => { const root = path.join(UD, "store"); if (!fs.existsSync(root)) return ""; return filesUnder(root).sort().map(p => path.relative(root, p) + "=" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")).join("|"); };
const deskText = UD => { try { return fs.readFileSync(path.join(UD, "desk.json"), "utf8"); } catch { return null; } };
const storeJson = UD => { try { return JSON.parse(fs.readFileSync(path.join(UD, "store.json"), "utf8")); } catch { return null; } };
async function heldScene(src, out) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const sync = T.get().storeSyncing, ch = sync && sync.channel();
  if (ch) await ch.idle();
  const a = w.file ? JSON.parse(w.file) : null, heldA = T.signinState().held, whoA = (storeJson(UD) || {}).who;
  if (out) T.signinOutNow();
  const tree = storeTree(UD), desk = deskText(UD), relay = w.relay.length;
  seatAnother(T, w, heldA);
  await T.storeTurn();
  T.storeView();
  T.storeSyncSoon();
  const timer = !!T.get().storeSyncTimer;
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  const n = T.get().storeNow, now = T.get().storeSyncing, kept = storeJson(UD) || {};
  const got = { look: n ? n.state : null, relayCalls: w.relay.length - relay, bFolder: !!w.file, syncing: !!now && now.running(), mergeSet: timer,
    syncState: storeTree(UD) === tree ? "as it was" : "changed", desk: deskText(UD) === desk ? "as it was" : "changed", whose: kept.who === whoA ? "A" : "not A" };
  const ok = !!a && a.kind === "etiuda-store-key" && !n && got.relayCalls === 0 && !got.bFolder && !got.syncing && !timer && got.syncState === "as it was" && got.desk === "as it was" && got.whose === "A";
  return { ok, detail: brief(got) };
}
/* (x4) What the desk needs to ask once is kept, and nothing goes: with B seated, store.json names A's account as the state's, B's as last
   seated and as owing the answer; B's sign-out deletes nothing of the store's state, its mirror or desk.json; A back, A owes the answer. */
const whoOf = (provider, sub) => crypto.createHash("sha256").update("etiuda-store-who\n" + provider + "\n" + sub, "utf8").digest("hex").slice(0, 32);
async function recordScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const sync = T.get().storeSyncing, ch = sync && sync.channel();
  if (ch) await ch.idle();
  const heldA = T.signinState().held, whoA = whoOf(heldA.provider, SUB), whoB = whoOf(heldA.provider, "sub-of-another-person");
  const tree = storeTree(UD), desk = deskText(UD);
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const seated = storeJson(UD) || {};
  T.signinOutNow();
  const out = storeJson(UD) || {}, keptTree = storeTree(UD) === tree, keptDesk = deskText(UD) === desk;
  T.signinState().held = heldA;
  T.storeView();
  const back = storeJson(UD) || {};
  const name = v => (v === whoA ? "A" : v === whoB ? "B" : v ? "other" : "none");
  const got = { whose: name(seated.who), last: name(seated.last), ask: name(seated.ask), afterOut: out.who === whoA && out.last === whoB && out.ask === whoB,
    syncState: keptTree ? "as it was" : "changed", desk: keptDesk ? "as it was" : "changed", backWhose: name(back.who), backLast: name(back.last), backAsk: name(back.ask) };
  const ok = got.whose === "A" && got.last === "B" && got.ask === "B" && got.afterOut && keptTree && keptDesk && got.backWhose === "A" && got.backLast === "A" && got.backAsk === "A";
  return { ok, detail: brief(got) };
}
/* (x5) The rule is symmetric: A synced; B is seated and edits the desk; B signs out; A comes back. A was not the account last seated, so
   A's return is held as B's was: nothing looked at, uploaded or merged, B's edit still on the desk, the desk's sync state as B left it. */
async function returnScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const sync = T.get().storeSyncing, ch = sync && sync.channel();
  if (ch) await ch.idle();
  const heldA = T.signinState().held, aFile = w.file;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  T.patchDesk(JSON.stringify({ eTheme: "dark" }));
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  T.signinOutNow();
  T.signinState().held = heldA;
  w.file = aFile;
  const tree = storeTree(UD), relay = w.relay.length;
  await T.storeTurn();
  const again = T.get().storeSyncing, c2 = again && again.channel();
  if (c2) await c2.idle();
  T.storeSyncSoon();
  const timer = !!T.get().storeSyncTimer;
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  let ledger = {};
  try { ledger = JSON.parse(fs.readFileSync(path.join(UD, "store", "sync.json"), "utf8")).ledger || {}; } catch { ledger = {}; }
  const desk = deskText(UD) || "";
  const got = { look: T.get().storeNow ? T.get().storeNow.state : null, relayCalls: w.relay.length - relay, syncing: !!again && again.running(), mergeSet: timer,
    syncState: storeTree(UD) === tree ? "as B left it" : "changed", editMerged: !!ledger["k:eTheme"], editOnDesk: /"eTheme":\s*"dark"/.test(desk) };
  const ok = !got.look && got.relayCalls === 0 && !got.syncing && !timer && got.syncState === "as B left it" && !got.editMerged && got.editOnDesk;
  return { ok, detail: brief(got) };
}
async function sameBackScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const a = w.file ? JSON.parse(w.file) : null, heldA = T.signinState().held;
  T.signinOutNow();
  T.signinState().held = heldA;
  await T.storeTurn();
  const n = T.get().storeNow, sync = T.get().storeSyncing, b = w.file ? JSON.parse(w.file) : null;
  const ok = !!a && !!n && n.state === "on" && !!b && b.rt === a.rt && !!sync && sync.running() && sync.state().rt === a.rt;
  return { ok, detail: brief({ look: n && n.state, sameStore: !!b && !!a && b.rt === a.rt, syncing: !!sync && sync.running() }) };
}
async function backOf(src, off) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const heldA = T.signinState().held, rtA = w.file ? JSON.parse(w.file).rt : "";
  if (off) await T.storeSetNow("here");
  const sync = T.get().storeSyncing, ch = sync && sync.channel();
  if (ch) await ch.idle();
  const aFile = w.file;
  T.signinOutNow();
  const tree = storeTree(UD);
  seatAnother(T, w, heldA);
  await T.storeTurn();
  T.signinOutNow();
  T.signinState().held = heldA;
  w.file = aFile;
  const between = storeTree(UD) === tree;
  await T.storeTurn();
  const st = storeJson(UD) || {}, view = T.storeView(), n = T.get().storeNow, again = T.get().storeSyncing;
  return { off: st.off === true, line: view.line, look: n ? n.state : null, between, after: storeTree(UD) === tree, rt: again && again.state().rt === rtA ? "A's" : "other",
    syncing: !!again && again.running() };
}
async function backScene(src) {
  const off = await backOf(src, true), on = await backOf(src, false);
  const ok = off.off && !off.look && off.between && off.after && !on.off && !on.look && on.between && on.after && !on.syncing;
  return { ok, detail: brief({ off, on }) };
}

/* (x6m) "It is mine": lifts the hold, sets who = last = this account and ask = "", runs the look and merge into this account's store,
   carries the desk's content and ledger there; asked once for this account, symmetric for A coming back. */
async function answerMineScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(path.join(catDir, "alpha.ec"), "ALPHA_CAT\n");
  T.patchDesk(JSON.stringify({ eAgent: "Alice", eTheme: "dark" }));
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held, aFile = w.file;
  const whoA = whoOf(heldA.provider, SUB), whoB = whoOf(heldA.provider, "sub-of-another-person");
  T.signinOutNow();
  seatAnother(T, w, heldA);
  const heldB = T.signinState().held;
  await T.storeTurn();
  const viewHeld = T.storeView();
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const ans = await T.storeAnswerNow("mine");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncB = T.get().storeSyncing;
  if (syncB) { syncB.merge(); const c = syncB.channel(); if (c) { c.kick(); await c.idle(); } }
  const st = storeJson(UD) || {}, viewAfter = T.storeView(), ledger = syncB ? syncB.state().ledger : {};
  /* Asked once for B: B out and back is not held. */
  T.signinOutNow();
  T.signinState().held = heldB;
  await T.storeTurn();
  const bBack = T.storeView(), bBackNow = T.get().storeNow;
  /* Symmetric: A back is held again. */
  T.signinOutNow();
  T.signinState().held = heldA;
  w.file = aFile;
  await T.storeTurn();
  const aBack = T.storeView(), aBackNow = T.get().storeNow;
  const ok = viewHeld.line === "ask" && viewHeld.askNow === true && !!ans && ans.ok === true
    && st.who === whoB && st.last === whoB && !st.ask && viewAfter.line === "on" && !viewAfter.askNow
    && !!ledger["k:eAgent"] && !!ledger["f:alpha.ec"] && bBack.line === "on" && !!bBackNow && bBackNow.state === "on"
    && aBack.line === "ask" && aBack.askNow === true && !aBackNow;
  return { ok, detail: brief({ viewHeld: viewHeld.line, ans, who: st.who === whoB, ask: st.ask || "", viewAfter: viewAfter.line, hasAgent: !!ledger["k:eAgent"], hasCat: !!ledger["f:alpha.ec"], bBack: bBack.line, aBack: aBack.line }) };
}

/* (x6j) "It is mine" from a different account joins that account's store as a computer that has never synced: A synced on this desk,
   then removed a catalog B's other computer holds under the same name, and holds a kept version; B, seated, answers "mine". B's other
   computer keeps its catalog through every merge after, the catalog reaches this desk, and nothing of A's ledger or kept list is here. */
async function answerMineJoinsScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const run = async s => { if (!s) return; s.merge(); const c = s.channel(); if (c) { c.kick(); await c.idle(); } };
  const aFile0 = w.file;
  w.file = null;
  const bBoot = boot(src, { world: w, held: true, store: { off: true }, lab: labOf() }), Tb = bBoot.T;
  Tb.branchIdentity(true);
  await Tb.signinRenewNow();
  if (Tb.get().storeFlight) await Tb.get().storeFlight;
  seatAnother(Tb, w, Tb.signinState().held);
  await Tb.storeAnswerNow("mine");
  if (Tb.get().storeFlight) await Tb.get().storeFlight;
  const bDir = Tb.storeSyncFolder(), notes = "{\"made\":\"on B's other computer\"}";
  fs.mkdirSync(bDir, { recursive: true });
  fs.writeFileSync(path.join(bDir, "notes.ec"), notes);
  const bSync = Tb.get().storeSyncing;
  await run(bSync); await run(bSync);
  const bFile = w.file;
  w.file = aFile0;
  await new Promise(a => setTimeout(a, 20));
  const dir = T.storeSyncFolder(), syncA = T.get().storeSyncing;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "notes.ec"), "{\"made\":\"by A\"}");
  await run(syncA);
  await new Promise(a => setTimeout(a, 20));
  fs.rmSync(path.join(dir, "notes.ec"));
  await run(syncA);
  if (syncA) { syncA.state().kept.push({ item: "k:eTheme", by: "k-" + "0".repeat(16), t: 1, h: "0".repeat(64) }); syncA.merge(); }
  const aRemoved = !!syncA && !!syncA.state().ledger["f:notes.ec"] && syncA.state().ledger["f:notes.ec"].h === null;
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  w.file = bFile;
  await T.storeTurn();
  const ans = await T.storeAnswerNow("mine");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncB = T.get().storeSyncing;
  if (syncB && syncB.channel()) await syncB.channel().idle();
  /* B's other computer takes the list that names this desk, so it reads this desk's place. */
  await Tb.storeTurn();
  for (let i = 0; i < 3; i++) { await run(syncB); await run(bSync); }
  const onB = fs.existsSync(path.join(bDir, "notes.ec")) && fs.readFileSync(path.join(bDir, "notes.ec"), "utf8") === notes;
  const here = fs.existsSync(path.join(dir, "notes.ec")) && fs.readFileSync(path.join(dir, "notes.ec"), "utf8") === notes;
  const st = syncB ? syncB.state() : { ledger: {}, kept: ["no sync"] }, view = T.storeView();
  const ok = aRemoved && !!ans && ans.ok === true && onB && here && st.kept.length === 0 && view.line === "on";
  return { ok, detail: brief({ aRemoved, ans: ans && ans.ok, keptOnB: onB, reachedHere: here, kept: st.kept.length, line: view.line, entry: st.ledger["f:notes.ec"] ? (st.ledger["f:notes.ec"].h ? "B's" : "removed") : "none" }) };
}

/* (x6b) The account whose state it is answers "It is mine" after another came, said Not now and went: A turned sync off everywhere
   with the store/end unanswered, signed out; B, seated, answered Not now and signed out; A back answers mine. A's switch stays off and
   its store/end stays owed: the row says ending, nothing is looked at, and the next renewal posts the store/end. */
async function answerMineOwnScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const rt = w.file ? JSON.parse(w.file).rt : "";
  w.endDown = true;
  await T.storeSetNow("everywhere");
  const before = { off: T.storeState().off === true, owed: !!T.storeState().owed, line: T.storeView().line };
  const heldA = T.signinState().held, mark = w.file;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  await T.storeAnswerNow("later");
  T.signinOutNow();
  T.signinState().held = heldA;
  w.file = mark;
  await T.storeTurn();
  const asked = T.storeView().line;
  const relayAt = w.relay.length;
  const ans = await T.storeAnswerNow("mine");
  if (T.get().storeFlight) await T.get().storeFlight;
  const after = { off: T.storeState().off === true, owed: !!T.storeState().owed, line: T.storeView().line, look: T.get().storeNow ? T.get().storeNow.state : null, relayCalls: w.relay.length - relayAt };
  w.endDown = false;
  await T.signinRenewNow();
  await new Promise(a => setTimeout(a, 40));
  const ended = w.ended === rt;
  const ok = before.off && before.owed && before.line === "ending" && asked === "ask" && !!ans && ans.ok === true
    && after.off && after.owed && after.line === "ending" && !after.look && after.relayCalls === 0 && ended;
  return { ok, detail: brief({ before, asked, ans: ans && ans.ok, after, ended }) };
}

/* (x6s) "Start from my account": sets aside desk.json, store.json, userData\store, and own .ec files byte for byte (team folders untouched),
   removes synced desk keys, drops the old sync instance, and loads this account's own store with none of the set-aside content in any relay call;
   a second set-aside lands beside the first, with (2), (3) on the same minute. */
async function answerStartScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  /* Seed B's own pre-existing store from a second computer of B's over the same relay. */
  const aFile0 = w.file;
  w.file = null;
  const bBoot = boot(src, { world: w, held: true, store: { off: true }, lab: labOf() });
  const Tb = bBoot.T;
  Tb.branchIdentity(true);
  await Tb.signinRenewNow();
  if (Tb.get().storeFlight) await Tb.get().storeFlight;
  seatAnother(Tb, w, Tb.signinState().held);
  await Tb.storeAnswerNow("mine");
  if (Tb.get().storeFlight) await Tb.get().storeFlight;
  const bCatDir = Tb.storeSyncFolder();
  fs.mkdirSync(bCatDir, { recursive: true });
  fs.writeFileSync(path.join(bCatDir, "bob.ec"), "BOB_CATALOG_BYTES\n");
  Tb.patchDesk(JSON.stringify({ eAgent: "Bob", eTheme: "light" }));
  const bSync = Tb.get().storeSyncing;
  if (bSync) { bSync.merge(); const c = bSync.channel(); if (c) { c.kick(); await c.idle(); } }
  const bFile = w.file;
  w.file = aFile0;

  /* Now set up A on the desk. */
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  const aBytes = Buffer.from("ALPHA_CATALOG_BYTES\n"), bBytes = Buffer.from("BETA_CATALOG_BYTES\n");
  fs.writeFileSync(path.join(catDir, "alpha.ec"), aBytes);
  fs.writeFileSync(path.join(catDir, "beta.ec"), bBytes);
  T.patchDesk(JSON.stringify({ eAgent: "Alice", eTheme: "dark", ePack: JSON.stringify({ custom: [{ id: "c1", t: "Card A" }] }), "e~sampled": "1" }));
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held, aFile = w.file;
  const whoB = whoOf(heldA.provider, "sub-of-another-person");
  T.signinOutNow();
  seatAnother(T, w, heldA);
  w.file = bFile;
  await T.storeTurn();
  const deskBefore = fs.readFileSync(path.join(UD, "desk.json"));
  const storeBefore = fs.readFileSync(path.join(UD, "store.json"));
  const treeBefore = storeTree(UD);
  const relayFrom = w.relay.length;

  const ans = await T.storeAnswerNow("start");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncB = T.get().storeSyncing;
  if (syncB) { const c = syncB.channel(); if (c) { c.kick(); await c.idle(); } }

  const f1 = ans && ans.folder ? ans.folder : "";
  const asideMatch = path.dirname(f1) === path.join(UD, "Set aside") && /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2}$/.test(path.basename(f1));
  const deskAside = f1 && fs.existsSync(path.join(f1, "desk.json")) ? fs.readFileSync(path.join(f1, "desk.json")) : null;
  const storeAside = f1 && fs.existsSync(path.join(f1, "store.json")) ? fs.readFileSync(path.join(f1, "store.json")) : null;
  const storeDirAside = f1 && fs.existsSync(path.join(f1, "store"))
    ? filesUnder(path.join(f1, "store")).sort().map(p => path.relative(path.join(f1, "store"), p) + "=" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")).join("|") : "";
  const alphaAside = f1 && fs.existsSync(path.join(f1, "alpha.ec")) ? fs.readFileSync(path.join(f1, "alpha.ec")) : null;
  const betaAside = f1 && fs.existsSync(path.join(f1, "beta.ec")) ? fs.readFileSync(path.join(f1, "beta.ec")) : null;
  const byteMatch = !!deskAside && deskAside.equals(deskBefore) && !!storeAside && storeAside.equals(storeBefore)
    && storeDirAside === treeBefore && !!alphaAside && alphaAside.equals(aBytes) && !!betaAside && betaAside.equals(bBytes);

  const leftInCat = fs.readdirSync(catDir).sort().join(",");
  const bobText = fs.existsSync(path.join(catDir, "bob.ec")) ? fs.readFileSync(path.join(catDir, "bob.ec"), "utf8") : "";
  const deskAfter = JSON.parse(fs.readFileSync(path.join(UD, "desk.json"), "utf8")).keys || {};
  const bLedger = syncB ? syncB.state().ledger : {};
  const relayLeak = w.relay.slice(relayFrom).some(buf => /Alice|ALPHA_CATALOG_BYTES|BETA_CATALOG_BYTES|Card A/.test(Buffer.from(buf).toString("utf8")));
  const ledgerLeak = !!(bLedger["f:alpha.ec"] || bLedger["f:beta.ec"] || bLedger["k:ePack"]) || (deskAfter.eAgent !== "Bob") || ("ePack" in deskAfter);

  /* Team folder safety: when storeSyncFolder() is "" (team active), its .ec files are not moved. */
  const teamDir = path.join(UD, "team-dir");
  fs.mkdirSync(teamDir, { recursive: true });
  fs.writeFileSync(path.join(teamDir, "team.ec"), "TEAM_CAT\n");
  T.setJoin({ team: "t1", invite: { folder: teamDir } });
  const teamIgnored = T.storeSyncFolder() === "";
  T.setJoin(null);

  /* Second set-aside beside the first (A returns and answers start), plus deterministic same-minute (2) and (3). */
  T.signinOutNow();
  T.signinState().held = heldA;
  w.file = aFile;
  await T.storeTurn();
  const ans2 = await T.storeAnswerNow("start");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncA2 = T.get().storeSyncing;
  if (syncA2) { const c = syncA2.channel(); if (c) { c.kick(); await c.idle(); } }
  const fixedAt = new Date(2026, 10, 15, 18, 10).getTime();
  const d1 = T.storeSetAsideDir(fixedAt), d2 = T.storeSetAsideDir(fixedAt), d3 = T.storeSetAsideDir(fixedAt);
  const numbering = path.basename(d1) === "2026-11-15 18.10" && path.basename(d2) === "2026-11-15 18.10 (2)" && path.basename(d3) === "2026-11-15 18.10 (3)";

  const st = storeJson(UD) || {};
  const ok = !!ans && ans.ok === true && asideMatch && byteMatch && leftInCat === "bob.ec" && bobText === "BOB_CATALOG_BYTES\n"
    && deskAfter["e~sampled"] === "1" && !relayLeak && !ledgerLeak && teamIgnored && fs.existsSync(path.join(teamDir, "team.ec"))
    && !!ans2 && ans2.ok === true && ans2.folder !== f1 && fs.existsSync(f1) && fs.existsSync(ans2.folder) && numbering && st.who !== whoB;
  return { ok, detail: brief({ okAns: ans && ans.ok, asideMatch, byteMatch, leftInCat, agent: deskAfter.eAgent, sampled: deskAfter["e~sampled"], relayLeak, ledgerLeak, teamIgnored, second: ans2 && ans2.folder !== f1, numbering }) };
}

/* (x6sn) Open case: an account with NO store yet answers "Start from my account": A's content is set aside, B's new store is made
   with nothing of A's uploaded. */
async function answerStartNewAccountScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(path.join(catDir, "alpha.ec"), "ALPHA_ONLY\n");
  T.patchDesk(JSON.stringify({ eAgent: "Alice", eTheme: "dark" }));
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  w.file = null;
  await T.storeTurn();
  const ans = await T.storeAnswerNow("start");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncB = T.get().storeSyncing;
  if (syncB) { const c = syncB.channel(); if (c) { c.kick(); await c.idle(); } }
  const ledger = syncB ? syncB.state().ledger : { leaked: true };
  const deskAfter = JSON.parse(fs.readFileSync(path.join(UD, "desk.json"), "utf8")).keys || {};
  const bStore = w.file ? JSON.parse(w.file) : null;
  const ok = !!ans && ans.ok === true && fs.existsSync(path.join(ans.folder, "alpha.ec")) && !fs.existsSync(path.join(catDir, "alpha.ec"))
    && !!bStore && Object.keys(ledger).length === 0 && !("eAgent" in deskAfter) && !("eTheme" in deskAfter);
  return { ok, detail: brief({ okAns: ans && ans.ok, newStore: !!bStore, ledgerKeys: Object.keys(ledger), deskKeys: Object.keys(deskAfter) }) };
}

/* (z2c) START TAKES THE LOADED CATALOG ASIDE TOO: the catalog loaded on A's desk is in the set-aside folder's desk.json, gone from the
   desk's own, and the page is told it went; nothing of it reaches B's store. */
async function answerStartCatalogScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const told = [];
  T.setWindow({ isDestroyed: () => false, webContents: { send: (ch, text) => { if (ch === "etiuda:desk-synced") told.push(JSON.parse(text)); } } });
  const cat = JSON.stringify({ kind: "etiuda-catalog", format: 2, id: "a-loaded", cards: [], note: "A_LOADED_ONLY" });
  T.patchDesk(JSON.stringify({ eCatalog: cat, eTheme: "dark" }));
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const ans = await T.storeAnswerNow("start");
  if (T.get().storeFlight) await T.get().storeFlight;
  const syncB = T.get().storeSyncing;
  if (syncB) { const c = syncB.channel(); if (c) { c.kick(); await c.idle(); } }
  const deskAfter = JSON.parse(fs.readFileSync(path.join(UD, "desk.json"), "utf8")).keys || {};
  let aside = {};
  try { aside = JSON.parse(fs.readFileSync(path.join(ans.folder, "desk.json"), "utf8")).keys || {}; } catch { aside = {}; }
  const toldGone = told.some(k => Object.prototype.hasOwnProperty.call(k, "eCatalog") && k.eCatalog === null);
  const leaked = w.relay.filter(b => b.indexOf("A_LOADED_ONLY") >= 0).length;
  const ok = !!ans && ans.ok === true && !("eCatalog" in deskAfter) && aside.eCatalog === cat && toldGone && leaked === 0;
  return { ok, detail: brief({ okAns: ans && ans.ok, onDesk: "eCatalog" in deskAfter, aside: aside.eCatalog === cat, toldGone, leaked }) };
}

/* (x6n) "Not now": nothing changes, the hold stays, askNow becomes false in this run, and a fresh run asks again. */
async function answerNotNowScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const syncA = T.get().storeSyncing;
  if (syncA) { const c = syncA.channel(); if (c) await c.idle(); }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const storeBefore = fs.readFileSync(path.join(UD, "store.json"), "utf8");
  const treeBefore = storeTree(UD), relayBefore = w.relay.length;
  const before = T.storeView();
  const ans = await T.storeAnswerNow("later");
  const after = T.storeView();
  const nextRun = boot(src, { ud: UD, world: w, lab: { service: STAGING, clientIds: { microsoft: MS_CLIENT }, root: rawPub(LAB_ROOT.publicKey) } });
  seatAnother(nextRun.T, w, heldA);
  const fresh = nextRun.T.storeView();
  const ok = before.line === "ask" && before.askNow === true && !!ans && ans.ok === true && after.line === "ask" && after.askNow === false
    && fs.readFileSync(path.join(UD, "store.json"), "utf8") === storeBefore && storeTree(UD) === treeBefore
    && w.relay.length === relayBefore && !T.get().storeNow && fresh.line === "ask" && fresh.askNow === true;
  return { ok, detail: brief({ before, ans, after, fresh }) };
}

/* (x6f) Failure halfway during set-aside puts back everything moved, removes the half-made folder, leaves the hold and says so. */
async function answerStartRollbackScene(src) {
  let failOnBeta = false;
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "renameSync") {
        return (from, to) => {
          if (failOnBeta && /beta\.ec$/i.test(String(from))) throw new Error("disk full");
          return target.renameSync(from, to);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const r = await renewScene(src, { boot: { fsWrap } }), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  const aBytes = Buffer.from("ALPHA_KEEP\n"), bBytes = Buffer.from("BETA_KEEP\n");
  fs.writeFileSync(path.join(catDir, "alpha.ec"), aBytes);
  fs.writeFileSync(path.join(catDir, "beta.ec"), bBytes);
  T.patchDesk(JSON.stringify({ eAgent: "Alice" }));
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const deskBefore = fs.readFileSync(path.join(UD, "desk.json"));
  const storeBefore = fs.readFileSync(path.join(UD, "store.json"));
  const treeBefore = storeTree(UD);
  failOnBeta = true;
  const ans = await T.storeAnswerNow("start");
  failOnBeta = false;
  const asideDir = path.join(UD, "Set aside");
  const leftovers = fs.existsSync(asideDir) ? fs.readdirSync(asideDir) : [];
  const view = T.storeView();
  const ok = !!ans && ans.ok === false && storeTree(UD) === treeBefore
    && fs.readFileSync(path.join(catDir, "alpha.ec")).equals(aBytes) && fs.readFileSync(path.join(catDir, "beta.ec")).equals(bBytes)
    && fs.readFileSync(path.join(UD, "desk.json")).equals(deskBefore) && fs.readFileSync(path.join(UD, "store.json")).equals(storeBefore)
    && leftovers.length === 0 && view.line === "ask" && r.shell.said.some(l => /set aside|aside/i.test(l));
  return { ok, detail: brief({ ans, treeOk: storeTree(UD) === treeBefore, leftovers, line: view.line, said: r.shell.said.slice(-2) }) };
}

/* (x6w) After an answer lifts the hold, A's keys, leave, owed end and folder token still never reach B. */
async function answerNeighboursScene(src) {
  if (typeof boot(src).T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  /* Leave owed by A, then B seated and answers mine -> B's folder never gets A's keys. */
  const rLeave = await renewScene(src), Tl = rLeave.shell.T, wl = rLeave.world;
  const aLeave = wl.file ? JSON.parse(wl.file) : null;
  wl.relayDown = true; await Tl.storeSetNow("here"); wl.relayDown = false;
  seatAnother(Tl, wl, Tl.signinState().held);
  await Tl.storeAnswerNow("mine");
  if (Tl.get().storeFlight) await Tl.get().storeFlight;
  await Tl.storeLeaveNow(null);
  const leaveLeaked = hasKeysOf(wl.file, aLeave);

  /* store/end owed by A, then B seated and answers mine -> B's renewal never posts A's store/end. */
  const rOwed = await renewScene(src), To = rOwed.shell.T, wo = rOwed.world;
  wo.endDown = true; await To.storeSetNow("everywhere"); wo.endDown = false;
  const endsBefore = endsPosted(wo);
  seatAnother(To, wo, To.signinState().held);
  await To.storeAnswerNow("mine");
  if (To.get().storeFlight) await To.get().storeFlight;
  await To.signinRenewNow();
  await new Promise(x => setTimeout(x, 40));
  const endLeaked = endsPosted(wo) > endsBefore;

  /* A's folder access token in memory -> B seated and answers start -> B's look asks its own token, never A's. */
  const rTok = await renewScene(src), Tt = rTok.shell.T, wt = rTok.world;
  const oldTok = wt.access, heldA = Tt.signinState().held;
  wt.access = "b-own-folder-token";
  const graphFrom = wt.graph.length;
  seatAnother(Tt, wt, heldA);
  await Tt.storeAnswerNow("start");
  if (Tt.get().storeFlight) await Tt.get().storeFlight;
  const usedOldTok = wt.graph.slice(graphFrom).some(g => g.indexOf("Bearer " + oldTok) >= 0);

  /* B's own org refusal recorded while held is kept when B answers, while A's org refusal never leaks to B. */
  const rOrg = await renewScene(src), To2 = rOrg.shell.T, wo2 = rOrg.world;
  seatAnother(To2, wo2, To2.signinState().held);
  To2.storeTokenTake({ provider: "microsoft", token: "", until: 0, why: "org" });
  await To2.storeAnswerNow("mine");
  if (To2.get().storeFlight) await To2.get().storeFlight;
  const orgKept = To2.storeView().why === "consent";

  const ok = !leaveLeaked && !endLeaked && !usedOldTok && orgKept;
  return { ok, detail: brief({ leaveLeaked, endLeaked, usedOldTok, orgKept }) };
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

/* (s5) THE SWITCH MOVED WHILE A LOOK IS OUT: a look held at the licence service when the person turns sync off here changes nothing once
   it is answered: no key kept, no call to the relay, the folder's list still without this desk, the sync stopped and the row Off. A look
   held there when the person turns sync off and on again is not the look On waits on: On starts its own, which turns the store on. */
async function switchMidLookScene(src) {
  const hold = w => { let open = null; w.grantGate = new Promise(a => { open = a; }); const at = new Promise(a => { w.onGrant = a; }); return { at, open: () => open() }; };
  const r = await renewScene(src), T = r.shell.T, w = r.world, me = r.me;
  const g = hold(w);
  const flight = T.storeTurn();
  await g.at;
  await T.storeSetNow("here");
  const relayAt = w.relay.length;
  g.open();
  await flight;
  const sync = T.get().storeSyncing, listed = w.file ? (JSON.parse(w.file).devices || []).some(d => d.pub === me.key) : null;
  const off = { keys: !!T.storeState().keys, relayCalls: w.relay.length - relayAt, listed, syncing: !!sync && sync.running(), line: T.storeView().line };
  const r2 = await renewScene(src), T2 = r2.shell.T, w2 = r2.world;
  const g2 = hold(w2);
  const old = T2.storeTurn();
  await g2.at;
  await T2.storeSetNow("here");
  await T2.storeSetNow("on");
  const mine = T2.get().storeFlight;
  g2.open();
  await old;
  if (mine) await mine;
  const s2 = T2.get().storeSyncing, n2 = T2.get().storeNow;
  const on = { own: !!mine && mine !== old, look: n2 ? n2.state : null, syncing: !!s2 && s2.running(), keys: !!T2.storeState().keys, line: T2.storeView().line };
  const ok = !off.keys && off.relayCalls === 0 && off.listed === false && !off.syncing && off.line === "off"
    && on.own && on.look === "on" && on.syncing && on.keys && on.line === "on";
  return { ok, detail: brief({ off, on }) };
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
    world.codes[code] = { nonce: q.get("nonce"), folder: (folder || asks) && !mode.untick, sub: mode.sub, access: mode.access, noRefresh: mode.noRefresh };
    return "code=" + code;
  };
  b.go = async url => {
    if (mode.hold) await mode.hold;
    b.urls.push(url);
    const q = new URL(url).searchParams, port = new URL(q.get("redirect_uri")).port;
    let r = await loopGet(port, "/?" + answer(q, false) + "&state=" + encodeURIComponent(q.get("state")));
    if (r.status === 303) r = await loopGet(port, r.location);
    for (let i = 0; i < 3 && r.status === 303 && r.location.indexOf(MS_AUTH + "?") === 0; i++) {
      b.urls.push(r.location);
      const q2 = new URL(r.location).searchParams;
      if (mode.holdFolder) { b.atFolder = true; await mode.holdFolder; }
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
  world.folderDelay = mode.folderDelay || 0;
  const b = browserOf(world, mode);
  const shell = boot(src, { world, lab: labOf(), store: mode.store, policyText: mode.policyText, browser: u => { setTimeout(() => { b.last = b.go(u).catch(() => {}); }, 5); } });
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
/* (fa) A FOLDER TOKEN IS THE SEATED ACCOUNT'S: a second Google sign-in whose seat the service refuses leaves the folder's token the
   seated account's, not the refused one's (fa1); and an account signed in straight over another, with no folder token of its own yet, is
   never handed the other's (fa2). */
async function pressAgain(r, provider) {
  const last = r.b.last;
  r.shell.ipc.on["etiuda:signin-click"](r.e, provider);
  await r.shell.ipc.handle["etiuda:signin"](r.e, provider);
  await until(() => r.b.last !== last, 5000);
  await r.b.last;
  await new Promise(a => setTimeout(a, 60));
  const look = r.shell.T.get().storeFlight;
  if (look) await look;
}
async function refusedAccountScene(src) {
  const r = await signinFlow(src, { provider: "google" }), T = r.shell.T;
  const heldA = T.signinState().held, tokA = T.get().storeAccess ? T.get().storeAccess.token : "";
  r.world.seatRefused = "signin";
  r.mode.sub = "sub-of-another-person";
  r.mode.access = "stand-in-folder-token-of-another-" + crypto.randomBytes(6).toString("hex");
  await pressAgain(r, "google");
  const a = T.get().storeAccess, held = T.signinState().held;
  const ok = !!tokA && tokA === r.world.access && !!held && held.sub === heldA.sub && !(a && a.token === r.mode.access);
  return { ok, detail: brief({ firstToken: !!tokA, stillA: !!held && held.sub === heldA.sub, tokenIsRefusedAccounts: !!a && a.token === r.mode.access }) };
}
async function overAnotherScene(src) {
  const r = await signinFlow(src, { quiet: true }), T = r.shell.T, w = r.world;
  const tokA = T.get().storeAccess ? T.get().storeAccess.token : "", onA = T.get().storeNow;
  /* B seated over A with no folder step of its own (its quiet refresh too slow for the landing, say): B's own refresh answers B's token. */
  seatAnother(T, w, T.signinState().held);
  w.access = "stand-in-folder-token-of-another-" + crypto.randomBytes(6).toString("hex");
  const from = w.graph.length;
  await T.storeTurn();
  const n = T.get().storeNow, usedA = w.graph.slice(from).filter(g => g.endsWith("Bearer " + tokA)).length;
  /* Held since the desk's content is A's (x1d): B makes no look, and A's token is asked with nowhere. */
  const ok = !!tokA && !!onA && onA.state === "on" && !n && usedA === 0;
  return { ok, detail: brief({ firstOn: onA && onA.state, look: n && n.state + "/" + n.why, folderAskedWithA: usedA }) };
}
/* (g1b) THE CONSENT WINDOW IS A SIGN-IN IN PROGRESS: while the switch's own request waits on the browser, the page is told the desk is
   busy (and Cancel reaches it), and an answer that comes back after another account took the seat is not taken for that account, nor
   looked with. */
async function consentBusyScene(src) {
  const r = await signinFlow(src, { refuse: DECLINED }), T = r.shell.T, w = r.world;
  r.mode.refuse = undefined;
  let release = null;
  r.mode.hold = new Promise(a => { release = a; });
  const before = r.shell.opened.length, last = r.b.last;
  r.shell.ipc.on["etiuda:store-on-click"](r.e);
  const answer = await r.shell.ipc.handle["etiuda:store-consent"](r.e);
  await until(() => r.shell.opened.length > before, 5000);
  await new Promise(a => setTimeout(a, 40));
  const e2 = Object.assign({}, r.e);
  r.shell.ipc.on["etiuda:signin-state"](e2);
  const busy = e2.returnValue ? e2.returnValue.busy : "";
  seatAnother(T, w, T.signinState().held);
  const graphFrom = w.graph.length, formsFrom = w.forms.length;
  r.mode.hold = null;
  release();
  await until(() => r.b.last !== last, 5000);
  await r.b.last;
  const flight = T.get().storeConsentFlight;
  if (flight) await flight;
  const look = T.get().storeFlight;
  if (look) await look;
  const a = T.get().storeAccess, asked = w.graph.slice(graphFrom).length, refreshed = w.forms.slice(formsFrom).filter(x => new URLSearchParams(x).get("grant_type") === "refresh_token").length;
  const ok = answer === "asked" && busy === "microsoft" && !(a && a.token === w.access) && asked === 0 && refreshed === 0;
  return { ok, detail: brief({ answer, busy, tokenTakenForB: !!a && a.token === w.access, folderAskedAfter: asked, lookRefreshedAfter: refreshed }) };
}
/* (t) AN OUTAGE IS NOT A REFUSAL: the token address answering 503 or 429 to the look's quiet refresh, or to a renewal's folder refresh
   while the plain one answers, keeps no "no consent" for the folder: the look says offline, and once the address answers the store is on. */
async function outageScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, out = {};
  for (const status of [503, 429]) {
    if (T.get().storeAccess) T.get().storeAccess.until = 0;
    w.tokenDown = status;
    await T.storeTurn();
    const a = T.get().storeAccess, n = T.get().storeNow;
    w.tokenDown = 0;
    await T.storeTurn();
    out[status] = { during: n && n.state + "/" + n.why, cachedRefusal: !!a && a.token === "", after: T.get().storeNow && T.get().storeNow.state };
  }
  if (T.get().storeAccess) T.get().storeAccess.until = 0;
  w.folderDown = 503;
  await T.signinRenewNow();
  const lf = T.get().storeFlight;
  if (lf) await lf;
  const a = T.get().storeAccess, n = T.get().storeNow;
  w.folderDown = 0;
  out.renewal = { cachedRefusal: !!a && a.token === "", look: n && n.state + "/" + n.why };
  const ok = [503, 429].every(s => out[s].during === "unavailable/offline" && !out[s].cachedRefusal && out[s].after === "on") && !out.renewal.cachedRefusal && out.renewal.look !== "unavailable/ungiven";
  return { ok, detail: brief(out) };
}
/* (gm) A store made while the licence service was out: store.json names it (made, no key in it), and the look that finds the service
   back makes it at the relay as the one that replaces; the store is on and the name gone. */
async function madeOutageShellScene(src) {
  const r = await renewScene(src, { grantDown: true }), T = r.shell.T, w = r.world;
  const rt = w.file ? JSON.parse(w.file).rt : "", first = r.now;
  const kept = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  w.grantDown = false;
  await T.storeTurn();
  const n = T.get().storeNow, after = JSON.parse(fs.readFileSync(path.join(r.shell.UD, "store.json"), "utf8"));
  const replace = w.service.filter(b => { try { const j = JSON.parse(b); return j.rt === rt && j.replace === true; } catch { return false; } }).length;
  const team = !!(w.R.stores.get(rt) && w.R.stores.get(rt).get("team"));
  const ok = !!rt && !!first && first.state === "paused" && kept.made === rt && !!n && n.state === "on" && team && replace >= 2 && !after.made;
  return { ok, detail: brief({ first: first && first.state + "/" + first.why, named: kept.made === rt, then: n && n.state + "/" + n.why, team, replaceAsked: replace, nameLeft: !!after.made }) };
}
/* (f7) THE FOLDER'S STEP IS STILL THE SIGN-IN: while the browser, sent on for the folder, has not answered, the page is told the sign-in
   is in progress and Cancel closes the loopback, so the browser's late answer reaches nothing and no folder token is kept. */
async function folderCancelScene(src) {
  let release = null;
  const mode = { holdFolder: new Promise(a => { release = a; }) };
  const world = worldOf({ refuseFolder: true }), b = browserOf(world, mode);
  const shell = boot(src, { world, lab: labOf(), browser: u => { setTimeout(() => { b.last = b.go(u).catch(() => {}); }, 5); } });
  const T = shell.T, e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" }, returnValue: undefined };
  shell.ipc.on["etiuda:signin-click"](e, "microsoft");
  await shell.ipc.handle["etiuda:signin"](e, "microsoft");
  await until(() => b.atFolder === true, 8000);
  const e2 = Object.assign({}, e);
  shell.ipc.on["etiuda:signin-state"](e2);
  const busy = e2.returnValue ? e2.returnValue.busy : "";
  const stopped = await shell.ipc.handle["etiuda:signin-stop"](e);
  mode.holdFolder = null;
  release();
  await until(() => b.pages.length > 0, 8000);
  await new Promise(a => setTimeout(a, 60));
  const a = T.get().storeAccess, reached = b.pages.length ? b.pages[0].status : -1;
  const ok = !!T.signinState().held && busy === "microsoft" && stopped === true && reached === 0 && !(a && a.token);
  return { ok, detail: brief({ seated: !!T.signinState().held, busy, stopped, lateAnswerReached: reached, folderToken: !!(a && a.token) }) };
}
/* (f7q) Cancel while the folder's quiet refresh is still out, the code already back: the loopback closes at once, so the window is never
   sent on for the folder. */
async function folderCancelQuietScene(src) {
  const world = worldOf({ refuseFolder: true }), b = browserOf(world, {});
  world.folderDelay = 1500;
  const shell = boot(src, { world, lab: labOf(), browser: u => { setTimeout(() => { b.last = b.go(u).catch(() => {}); }, 5); } });
  const T = shell.T, e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" }, returnValue: undefined };
  shell.ipc.on["etiuda:signin-click"](e, "microsoft");
  await shell.ipc.handle["etiuda:signin"](e, "microsoft");
  const stopped = await shell.ipc.handle["etiuda:signin-stop"](e);
  await until(() => b.pages.length > 0, 8000);
  await new Promise(a => setTimeout(a, 1700));
  const ok = !!T.signinState().held && stopped === true && b.urls.length === 1;
  return { ok, detail: brief({ seated: !!T.signinState().held, stopped, browserSteps: b.urls.length, page: b.pages.length ? b.pages[0].status : -1 }) };
}
/* (f8) A folder step slower than the plain landing's cap: the quiet refresh taking longer than eight seconds and refused, the window is
   still sent on for the folder, which lands its own page and opens the store. */
async function folderSlowScene(src) {
  const r = await signinFlow(src, { folderDelay: 8600 });
  const ok = !!r.held && !!r.held.cert && r.b.urls.length === 2 && folderPage(r.page, "on") && !!r.now && r.now.state === "on";
  return { ok, detail: brief({ seat: !!(r.held && r.held.cert), browserSteps: r.b.urls.length, page: r.page.status + (folderPage(r.page, "on") ? " folder-on" : ""), state: r.now && r.now.state + "/" + r.now.why }) };
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
/* (g6h) POLICY HOLDING SYNC ON, THE FOLDER NEVER ALLOWED: the row says so ("ungiven-held"), and the row's button asks the provider as the
   switch's On does: nothing without the person's trusted click, one request with it, then the look, sync on and still held. */
const REG_HEAD = "Windows Registry Editor Version 5.00\r\n\r\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\r\n";
const regText = vals => REG_HEAD + Object.entries(vals).map(([k, v]) => "\"" + k + "\"=\"" + String(v) + "\"\r\n").join("") + "\r\n";
async function heldUngivenScene(src) {
  const r = await signinFlow(src, { refuse: DECLINED, policyText: regText({ PersonalStore: "on" }) }), T = r.shell.T;
  const view = T.storeView();
  const unclicked = await pressOn(r, false);
  r.mode.refuse = undefined;
  const on = await pressOn(r, true);
  const after = T.storeView();
  const ok = view.line === "ungiven-held" && view.held === true && unclicked.answer === "click" && unclicked.opened.length === 0 && on.answer === "asked" && on.opened.length === 1
    && folderPage(on.page, "on") && after.line === "on" && after.held === true;
  return { ok, detail: brief({ view: view.line, held: view.held, unclicked: unclicked.answer, answer: on.answer, opened: on.opened.length, after: after.line, afterHeld: after.held }) };
}

/* (g2r) A second Google authorization of the same account that names no refresh token (the switch's consent sign-in) keeps the one
   already sealed, as a renewal does, so the person is not asked to sign in again. */
async function keepRefreshScene(src) {
  const r = await signinFlow(src, { provider: "google", untick: true }), T = r.shell.T;
  const was = T.signinState().held ? T.signinState().held.refresh : "";
  r.mode.untick = false;
  r.mode.noRefresh = true;
  const on = await pressOn(r, true);
  const held = T.signinState().held;
  const ok = !!was && on.answer === "asked" && !!held && !!held.cert && held.refresh === was;
  return { ok, detail: brief({ sealedFirst: !!was, answer: on.answer, seat: !!(held && held.cert), refreshKept: !!held && held.refresh === was, refreshLeft: !!held && !!held.refresh }) };
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
/* (gk) A conflict's notice ends once opened: a version kept reads conflict; the page telling the shell it showed that line (the
   no-argument store-opened channel) ends the notice, the kept entry and its copy where they were and the mark kept in sync.json; a version
   kept after it is a new notice. Nothing reaches the sync's choose. */
async function conflictOpenedScene(src) {
  const r = await renewScene(src), T = r.shell.T, sync = T.get().storeSyncing, UD = r.shell.UD;
  const told = r.shell.ipc.on["etiuda:store-opened"], e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } };
  if (typeof told !== "function" || !sync) return { ok: false, detail: brief({ channel: typeof told, sync: !!sync }) };
  const keptDir = path.join(UD, "store", "kept");
  fs.mkdirSync(keptDir, { recursive: true });
  fs.writeFileSync(path.join(keptDir, "copy.txt"), "{\"value\":\"the earlier\"}");
  const entry = k => ({ item: "k:e3f9a1~Pack#edits/c1", by: "k-" + "0".repeat(16), t: k, h: "0".repeat(64) });
  sync.state().kept.push(entry(1));
  const first = T.storeView().line;
  const other = { returnValue: "unset", senderFrame: { parent: null, url: "https://elsewhere.test/" } };
  told(other);
  const stranger = T.storeView().line;
  told(e);
  const after = T.storeView().line;
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(path.join(UD, "store", "sync.json"), "utf8")); } catch { disk = null; }
  const stays = sync.state().kept.length === 1 && fs.readFileSync(path.join(keptDir, "copy.txt"), "utf8") === "{\"value\":\"the earlier\"}";
  sync.state().kept.push(entry(2));
  const again = T.storeView().line;
  const ok = first === "conflict" && stranger === "conflict" && after === "on" && stays && !!disk && disk.kept.length === 1 && disk.kept[0].opened === true && again === "conflict";
  return { ok, detail: brief({ first, stranger, after, stays, marked: !!disk && !!disk.kept[0] && disk.kept[0].opened === true, again }) };
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
async function openSetAsideScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } };
  const open = r.shell.ipc.handle["etiuda:open-set-aside"];
  if (typeof open !== "function") return { ok: false, detail: "no etiuda:open-set-aside channel" };

  const before = await open(e);
  const openedBefore = r.shell.openedPaths.length;

  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const a1 = await T.storeAnswerNow("start");
  const f1 = a1 && a1.folder ? a1.folder : "";
  const r1 = await open(e);
  const p1 = r.shell.openedPaths.slice();

  const otherDir = path.join(UD, "elsewhere");
  fs.mkdirSync(otherDir, { recursive: true });
  const withArg = await open(e, otherDir);
  const openedAfterArg = r.shell.openedPaths.length;

  T.signinOutNow();
  T.signinState().held = heldA;
  await T.storeTurn();
  const a2 = await T.storeAnswerNow("start");
  const f2 = a2 && a2.folder ? a2.folder : "";
  const root = path.join(UD, "Set aside");
  const r2 = await open(e);
  const p2 = r.shell.openedPaths.slice();

  fs.rmSync(f1, { recursive: true, force: true });
  fs.rmSync(f2, { recursive: true, force: true });
  const rGone = await open(e);
  const created = fs.existsSync(f2);
  const openedAfterGone = r.shell.openedPaths.length;

  const ok = before && before.ok === false && openedBefore === 0
    && !!f1 && !!f2 && f2 !== f1
    && r1 === true && p1.length === 1 && p1[0] === f1
    && withArg === false && openedAfterArg === 1
    && r2 === true && p2.length === 2 && p2[1] === root
    && rGone && rGone.ok === false && rGone.why === "gone" && !created && openedAfterGone === 2;
  return { ok, detail: brief({ before, openedBefore, f1: path.basename(f1), f2: path.basename(f2), r1, p1: p1.map(x => path.basename(x)), withArg, openedAfterArg, r2, p2: p2.map(x => path.basename(x)), rGone, created, openedAfterGone }) };
}

/* (x6p) Set-aside moves whose first rename fails busy (EBUSY/EPERM) retry via renamePatiently and succeed on the second attempt. */
async function answerStartBusyRenameScene(src) {
  let busyOn = false;
  const seen = { store: 0, alpha: 0 }, attempts = { store: 0, alpha: 0 };
  const busy = code => Object.assign(new Error("busy " + code), { code });
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "renameSync") {
        return (from, to) => {
          const s = String(from);
          if (busyOn && path.basename(s) === "store") {
            attempts.store++;
            if (seen.store === 0) { seen.store++; throw busy("EBUSY"); }
          }
          if (busyOn && /alpha\.ec$/i.test(s)) {
            attempts.alpha++;
            if (seen.alpha === 0) { seen.alpha++; throw busy("EPERM"); }
          }
          return target.renameSync(from, to);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const r = await renewScene(src, { boot: { fsWrap } }), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  const aBytes = Buffer.from("ALPHA_BUSY_KEEP\n");
  fs.writeFileSync(path.join(catDir, "alpha.ec"), aBytes);
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  busyOn = true;
  const ans = await T.storeAnswerNow("start");
  busyOn = false;
  const f1 = ans && ans.folder ? ans.folder : "";
  const alphaMoved = f1 && fs.existsSync(path.join(f1, "alpha.ec")) && fs.readFileSync(path.join(f1, "alpha.ec")).equals(aBytes);
  const storeMoved = f1 && fs.existsSync(path.join(f1, "store")) && !fs.existsSync(path.join(UD, "store"));
  const ok = !!ans && ans.ok === true && attempts.store === 2 && attempts.alpha === 2 && !!alphaMoved && !!storeMoved;
  return { ok, detail: brief({ okAns: ans && ans.ok, attempts, alphaMoved: !!alphaMoved, storeMoved: !!storeMoved }) };
}

/* (x6k) A set-aside whose later step fails (beta.ec's move) and whose move back of `failBack` fails too, "" for none. What the stand-in
   for the file system refuses is only ever a rename, so nothing real is held open. */
async function keptOf(src, failBack) {
  let failing = false;
  const inAside = s => String(s).indexOf(path.sep + "Set aside" + path.sep) >= 0;
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "renameSync") {
        return (from, to) => {
          if (failing && !inAside(from) && /beta\.ec$/i.test(String(from))) throw new Error("disk full");
          if (failing && failBack && inAside(from) && path.basename(String(from)) === failBack) throw new Error("disk full");
          return target.renameSync(from, to);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const r = await renewScene(src, { boot: { fsWrap } }), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { why: "no storeAnswerNow" };
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  const aBytes = Buffer.from("ALPHA_KEPT_WHOLE\n"), bBytes = Buffer.from("BETA_KEPT_WHOLE\n");
  fs.writeFileSync(path.join(catDir, "alpha.ec"), aBytes);
  fs.writeFileSync(path.join(catDir, "beta.ec"), bBytes);
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const treeBefore = storeTree(UD);
  failing = true;
  const ans = await T.storeAnswerNow("start");
  failing = false;
  const root = path.join(UD, "Set aside"), dirs = fs.existsSync(root) ? fs.readdirSync(root) : [];
  const f = ans && typeof ans.folder === "string" ? ans.folder : "";
  const read = p => (p && fs.existsSync(p) ? fs.readFileSync(p) : null);
  const opened = await r.shell.ipc.handle["etiuda:open-set-aside"]({ senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } });
  const alphaAside = read(f && path.join(f, "alpha.ec")), alphaHome = read(path.join(catDir, "alpha.ec")), betaHome = read(path.join(catDir, "beta.ec"));
  return { kept: !!ans && ans.ok === false && ans.kept === true, under: !!f && path.dirname(f) === root && fs.existsSync(f), dirs: dirs.length,
    treeBefore: treeBefore !== "", storeHome: storeTree(UD) === treeBefore ? "whole" : storeTree(UD) === "" ? "none" : "changed",
    storeAside: f && treeBefore && storeTree(f) === treeBefore ? "whole" : "no",
    alphaAside: alphaAside ? alphaAside.equals(aBytes) : null, alphaHome: alphaHome ? alphaHome.equals(aBytes) : null, betaHome: betaHome ? betaHome.equals(bBytes) : null,
    logged: !!f && r.shell.said.some(l => l.indexOf(f) >= 0), opened: opened === true ? (r.shell.openedPaths.slice(-1)[0] === f ? "it" : "another") : opened && opened.why || "no",
    line: T.storeView().line };
}
/* (x6k) The catalog's move back failing, then the store folder's, then none: nothing the person had is deleted. */
async function answerStartKeptScene(src) {
  const cat = await keptOf(src, "alpha.ec"), store = await keptOf(src, "store"), none = await keptOf(src, "");
  const ok = cat.kept && cat.under && cat.dirs === 1 && cat.alphaAside === true && cat.alphaHome === null && cat.betaHome === true && cat.treeBefore && cat.storeHome === "whole"
      && cat.logged && cat.opened === "it" && cat.line === "ask"
    && store.kept && store.under && store.dirs === 1 && store.treeBefore && store.storeAside === "whole" && store.storeHome === "none" && store.alphaHome === true && store.betaHome === true
      && store.alphaAside === null && store.logged && store.opened === "it" && store.line === "ask"
    && !none.kept && none.dirs === 0 && none.treeBefore && none.storeHome === "whole" && none.alphaHome === true && none.betaHome === true && none.opened === "gone" && none.line === "ask";
  return { ok, detail: brief({ cat, store, none }) };
}
/* (x6r) After a restart the button's channel opens the desk's folder when it is the only dated one under Set aside, or Set aside
   itself when more than one dated folder (including a hand-made one beside the desk's) exists; all removed, it answers gone; a name
   in store.json of another shape is ignored and opens nothing. (Moved from "opens the desk's" to "opens Set aside holding both",
   because more than one dated folder under Set aside must keep every folder one click away without ever opening a hand-made one.) */
async function openAfterRestartScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } };
  const restart = async () => { const s = boot(src, { ud: UD, world: w, lab: labOf() }); const got = await s.ipc.handle["etiuda:open-set-aside"](e); return { got, paths: s.openedPaths.slice(), aside: s.T.storeState().aside }; };
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  const a1 = await T.storeAnswerNow("start");
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  const f1 = a1 && a1.folder ? a1.folder : "";
  const onlyOne = await restart();
  T.signinOutNow();
  T.signinState().held = heldA;
  await T.storeTurn();
  const a2 = await T.storeAnswerNow("start");
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  const f2 = a2 && a2.folder ? a2.folder : "", root = path.join(UD, "Set aside");
  const decoy = path.join(root, "2099-12-31 23.59");
  fs.mkdirSync(decoy, { recursive: true });
  const many = await restart();
  fs.rmSync(f1, { recursive: true, force: true });
  fs.rmSync(f2, { recursive: true, force: true });
  fs.rmSync(decoy, { recursive: true, force: true });
  const gone = await restart();
  const elsewhere = path.join(UD, "elsewhere");
  fs.mkdirSync(elsewhere, { recursive: true });
  const st = storeJson(UD) || {};
  fs.writeFileSync(path.join(UD, "store.json"), JSON.stringify(Object.assign({}, st, { aside: "../elsewhere" })));
  const shaped = await restart();
  const name = p => (p ? path.basename(p) : "");
  const ok = !!f1 && !!f2 && f1 !== f2
    && onlyOne.got === true && onlyOne.paths.length === 1 && onlyOne.paths[0] === f1
    && many.got === true && many.paths.length === 1 && many.paths[0] === root
    && gone.got && gone.got.ok === false && gone.got.why === "gone" && gone.paths.length === 0
    && shaped.got && shaped.got.ok === false && shaped.got.why === "gone" && shaped.paths.length === 0 && shaped.aside === "";
  return { ok, detail: brief({ f1: name(f1), f2: name(f2), onlyOne: { got: onlyOne.got, paths: onlyOne.paths.map(name) },
    many: { got: many.got, paths: many.paths.map(name) }, gone: { got: gone.got, paths: gone.paths.map(name) },
    shaped: { got: shaped.got, paths: shaped.paths.map(name), aside: shaped.aside } }) };
}
/* (x6l) A LINK IS NO SET-ASIDE FOLDER: under Set aside an entry with the name store.json keeps, a link (a junction) to a folder elsewhere,
   as the file system's stand-in answers for it: followed it is a folder, unfollowed a link. Open this folder opens nothing and answers gone;
   a real folder of that name in its place is opened. Nothing real is linked. */
async function asideLinkScene(src) {
  const name = "2026-11-16 10.00";
  let linked = "";
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "statSync") return (f, ...a) => (linked && String(f) === linked ? { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false } : target.statSync(f, ...a));
      if (prop === "lstatSync") return (f, ...a) => (linked && String(f) === linked ? { isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true } : target.lstatSync(f, ...a));
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const { UD, ipc, openedPaths } = boot(src, { fsWrap, store: { aside: name } });
  const e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } }, open = ipc.handle["etiuda:open-set-aside"];
  const root = path.join(UD, "Set aside"), at = path.join(root, name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(at, "");
  linked = at;
  const asLink = await open(e), pathsLink = openedPaths.slice();
  linked = "";
  fs.rmSync(at);
  fs.mkdirSync(at);
  const asFolder = await open(e), pathsFolder = openedPaths.slice();
  const ok = !!asLink && asLink.ok === false && asLink.why === "gone" && pathsLink.length === 0 && asFolder === true && pathsFolder.length === 1 && pathsFolder[0] === at;
  return { ok, detail: brief({ asLink, pathsLink: pathsLink.length, asFolder, pathsFolder: pathsFolder.map(p => path.basename(p)) }) };
}
/* (x6a) Open this folder when more than one set-aside exists: a kept failure then a success opens Set aside itself (both in the same run
   and after a restart), removing the named folder leaves Set aside opening itself (never the other folder directly), one set-aside opens
   its own dated folder, a hand-made dated folder beside it opens Set aside itself, and nothing there answers gone. */
async function openManySetAsidesScene(src) {
  let failing = false;
  const inAside = s => String(s).indexOf(path.sep + "Set aside" + path.sep) >= 0;
  const fsWrap = real => new Proxy(real, {
    get(target, prop) {
      if (prop === "renameSync") {
        return (from, to) => {
          if (failing && !inAside(from) && /beta\.ec$/i.test(String(from))) throw new Error("disk full");
          if (failing && inAside(from) && path.basename(String(from)) === "alpha.ec") throw new Error("disk full");
          return target.renameSync(from, to);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  const r = await renewScene(src, { boot: { fsWrap } }), T = r.shell.T, w = r.world, UD = r.shell.UD;
  if (typeof T.storeAnswerNow !== "function") return { ok: false, detail: "no storeAnswerNow" };
  const e = { senderFrame: { parent: null, url: "file:///desk/engine/etiuda.html" } };
  const open = r.shell.ipc.handle["etiuda:open-set-aside"];
  const catDir = T.storeSyncFolder();
  fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(path.join(catDir, "alpha.ec"), Buffer.from("ALPHA_MANY\n"));
  fs.writeFileSync(path.join(catDir, "beta.ec"), Buffer.from("BETA_MANY\n"));
  const syncA = T.get().storeSyncing;
  if (syncA) { syncA.merge(); const c = syncA.channel(); if (c) { c.kick(); await c.idle(); } }
  const heldA = T.signinState().held;
  T.signinOutNow();
  seatAnother(T, w, heldA);
  await T.storeTurn();
  failing = true;
  const a1 = await T.storeAnswerNow("start");
  failing = false;
  const f1 = a1 && a1.folder ? a1.folder : "";
  const afterKept = await open(e);
  const pAfterKept = r.shell.openedPaths.slice(-1)[0] || "";
  const a2 = await T.storeAnswerNow("start");
  if (T.get().storeSyncTimer) clearTimeout(T.get().storeSyncTimer);
  const f2 = a2 && a2.folder ? a2.folder : "", root = path.join(UD, "Set aside");
  const twoNow = await open(e);
  const pTwoNow = r.shell.openedPaths.slice(-1)[0] || "";
  const restart = async () => { const s = boot(src, { ud: UD, world: w, lab: labOf() }); const got = await s.ipc.handle["etiuda:open-set-aside"](e); return { got, paths: s.openedPaths.slice() }; };
  const twoRestart = await restart();
  fs.rmSync(f2, { recursive: true, force: true });
  const namedGoneOtherLeft = await restart();

  const rc = await renewScene(src), Tc = rc.shell.T, wc = rc.world, UDc = rc.shell.UD;
  const restartC = async () => { const s = boot(src, { ud: UDc, world: wc, lab: labOf() }); const got = await s.ipc.handle["etiuda:open-set-aside"](e); return { got, paths: s.openedPaths.slice() }; };
  const heldC = Tc.signinState().held;
  Tc.signinOutNow();
  seatAnother(Tc, wc, heldC);
  await Tc.storeTurn();
  const ac = await Tc.storeAnswerNow("start");
  if (Tc.get().storeSyncTimer) clearTimeout(Tc.get().storeSyncTimer);
  const fc = ac && ac.folder ? ac.folder : "", rootC = path.join(UDc, "Set aside");
  const oneControlNow = await rc.shell.ipc.handle["etiuda:open-set-aside"](e);
  const pOneControlNow = rc.shell.openedPaths.slice(-1)[0] || "";
  const oneControlRestart = await restartC();
  const handMade = path.join(rootC, "2099-12-31 23.59");
  fs.mkdirSync(handMade, { recursive: true });
  const withHandMade = await restartC();
  fs.rmSync(fc, { recursive: true, force: true });
  fs.rmSync(handMade, { recursive: true, force: true });
  const emptyDir = await restartC();
  fs.rmSync(rootC, { recursive: true, force: true });
  const noRoot = await restartC();

  const name = p => (p ? path.basename(p) : "");
  const ok = !!a1 && a1.ok === false && a1.kept === true && !!f1
    && !!a2 && a2.ok === true && !!f2 && f2 !== f1
    && afterKept === true && pAfterKept === f1
    && twoNow === true && pTwoNow === root
    && twoRestart.got === true && twoRestart.paths.length === 1 && twoRestart.paths[0] === root
    && namedGoneOtherLeft.got === true && namedGoneOtherLeft.paths.length === 1 && namedGoneOtherLeft.paths[0] === root
    && !!fc && oneControlNow === true && pOneControlNow === fc
    && oneControlRestart.got === true && oneControlRestart.paths.length === 1 && oneControlRestart.paths[0] === fc
    && withHandMade.got === true && withHandMade.paths.length === 1 && withHandMade.paths[0] === rootC
    && emptyDir.got && emptyDir.got.ok === false && emptyDir.got.why === "gone" && emptyDir.paths.length === 0
    && noRoot.got && noRoot.got.ok === false && noRoot.got.why === "gone" && noRoot.paths.length === 0;
  return { ok, detail: brief({ f1: name(f1), f2: name(f2), pAfterKept: name(pAfterKept), pTwoNow: name(pTwoNow),
    twoRestart: twoRestart.paths.map(name), namedGoneOtherLeft: namedGoneOtherLeft.paths.map(name),
    fc: name(fc), pOneControlNow: name(pOneControlNow), oneControlRestart: oneControlRestart.paths.map(name),
    withHandMade: withHandMade.paths.map(name), emptyDir: emptyDir.got, noRoot: noRoot.got }) };
}

/* (z14) THE ROW TOLD AND TRUE: a merge that keeps a version tells the page, so an open row says the conflict; a renewal that lost its
   refresh token (ask, nothing said) reads as a refused sign-in, not as "not connected yet"; and of two looks overlapping, the first
   ending leaves the row saying a look runs while the second still does. */
async function rowToldScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const sync = T.get().storeSyncing, ch = sync && sync.channel();
  if (ch) await ch.idle();
  let told = 0;
  T.setWindow({ isDestroyed: () => false, webContents: { send: ch2 => { if (ch2 === "etiuda:store") told++; } } });
  const before = told;
  if (sync) { sync.state().kept.push({ item: "k:eTheme", by: "k-" + "0".repeat(16), t: 5, h: "0".repeat(64) }); sync.merge(); }
  const keptTold = told > before;
  let open1, open2;
  w.grantGate = new Promise(a => { open1 = a; });
  let atGrant = new Promise(a => { w.onGrant = a; });
  const one = T.storeTurn();
  await atGrant;
  w.grantGate = new Promise(a => { open2 = a; });
  atGrant = new Promise(a => { w.onGrant = a; });
  const two = T.storeSetNow("on");
  await atGrant;
  open1();
  await one;
  await new Promise(a => setTimeout(a, 20));
  const during = T.storeView().line;
  open2();
  await two;
  if (T.get().storeFlight) await T.get().storeFlight;
  w.onGrant = null;
  w.grantDown = true;
  await T.storeTurn();
  if (T.get().storeFlight) await T.get().storeFlight;
  w.grantDown = false;
  const held = T.signinState().held;
  held.ask = true; held.said = "";
  const asked = T.storeView().line;
  const ok = keptTold && during === "checking" && asked === "signin-refused";
  return { ok, detail: brief({ keptTold, during, asked }) };
}

/* (z6) A LOOK MORE THAN AN HOUR AFTER THE LAST SIGN-IN RENEWS IT FIRST: the service grants a store only to a desk it saw sign in within
   the hour. A look whose last reached sign-in is two hours old renews it, then is granted and is on; with the provider out (the renewal
   unreached), the refusal is a look tried again within minutes, not a day, and the row says the service was not reached. */
async function signinHourScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  w.signinHour = true;
  const age = () => { w.signinAt = Date.now() - 2 * 60 * 60 * 1000; T.signinState().held.at = w.signinAt; };
  age();
  const before = w.service.length;
  await T.storeTurn();
  if (T.get().storeFlight) await T.get().storeFlight;
  const renewed = w.service.slice(before).some(b => { try { return !!JSON.parse(b).idToken; } catch { return false; } }), first = T.get().storeNow;
  age();
  w.tokenDown = 503;
  await T.storeTurn();
  if (T.get().storeFlight) await T.get().storeFlight;
  const second = T.get().storeNow, again = !!T.get().storeAgainTimer, line = T.storeView().line;
  w.tokenDown = 0;
  const ok = renewed && !!first && first.state === "on" && !!second && second.why === "unreached" && again && line !== "refused";
  return { ok, detail: brief({ renewed, first: first && first.state + "/" + (first.why || ""), second: second && second.state + "/" + (second.why || ""), again, line }) };
}

/* (z11) NO MERGE WHILE NO ACCOUNT IS SEATED: a change on the desk arms the merge a moment later; a sign out clears it, and a change made
   signed out arms none, so nothing made signed out enters the earlier account's sync state or mirror. */
async function signedOutScene(src) {
  const r = await renewScene(src), T = r.shell.T, UD = r.shell.UD;
  const ch = T.get().storeSyncing && T.get().storeSyncing.channel();
  if (ch) await ch.idle();
  T.patchDesk(JSON.stringify({ eTheme: "dark" }));
  const armed = !!T.get().storeSyncTimer;
  T.signinOutNow();
  const cleared = !T.get().storeSyncTimer;
  const syncText = () => { try { return fs.readFileSync(path.join(UD, "store", "sync.json"), "utf8"); } catch { return ""; } };
  const before = syncText();
  T.patchDesk(JSON.stringify({ eUiLang: "pl" }));
  T.storeSyncSoon();
  const none = !T.get().storeSyncTimer;
  await new Promise(a => setTimeout(a, 2300));
  const same = syncText() === before;
  const ok = armed && cleared && none && same;
  return { ok, detail: brief({ armed, cleared, none, same }) };
}

/* (z4) A FOLDER TOKEN IS KEPT ONLY FOR THE ACCOUNT IT WAS ASKED FOR: one asked for account A, another account seated while the refresh
   is out, is not kept, and the folder is not opened with it for the account seated; and a look whose token is answered after a sign out
   says nothing and arms no retry. */
async function tokenAccountScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world;
  const p = providersOf(T)[0], heldA = T.signinState().held, fileA = w.file;
  T.storeForget();
  w.folderDelay = 200;
  const asked = T.storeTokenFor(p, heldA);
  await new Promise(a => setTimeout(a, 40));
  seatAnother(T, w, heldA);
  const got = await asked;
  const access = T.get().storeAccess, bound = !!access && access.token === w.access;
  T.storeForget();
  seatAnother(T, w, heldA, SUB);
  w.file = fileA;
  const look = T.storeTurn();
  await new Promise(a => setTimeout(a, 40));
  T.signinOutNow();
  await look;
  if (T.get().storeFlight) await T.get().storeFlight.catch(() => null);
  const after = T.get(), quiet = after.storeNow === null && !after.storeAgainTimer;
  w.folderDelay = 0;
  const ok = !!got.why && !bound && quiet;
  return { ok, detail: brief({ got, bound, accessWho: access ? "kept" : "none", storeNow: after.storeNow && after.storeNow.state, again: !!after.storeAgainTimer }) };
}

/* (z2) A FIELD TAKEN BEHIND THE PAGE IS NOT THE PERSON'S REMOVAL: two computers of one person on one store (two shells on one world).
   B adds an edit to one card of a layer; A's page, owing a write of that layer (a star) when A's merge takes B's edit, ignores the tell
   and its whole-key write lands after it. B's edit stands on both and A's star too, nothing kept. Then A's page takes the tell, and the
   person removes B's edit here: that removal reaches B. A key the shell cleared whole (as Start from my account does) under a page
   owing it stays cleared after the page's write lands, and the page, told again, takes the clear; its next write is kept. */
async function takenFieldScene(src) {
  const r = await renewScene(src), T = r.shell.T, w = r.world, UD = r.shell.UD;
  const bBoot = boot(src, { world: w, held: true, lab: labOf() }), Tb = bBoot.T;
  Tb.branchIdentity(true);
  await Tb.signinRenewNow();
  if (Tb.get().storeFlight) await Tb.get().storeFlight;
  await T.storeTurn();
  if (T.get().storeFlight) await T.get().storeFlight;
  const run = async s => { if (!s) return; s.merge(); const c = s.channel(); if (c) { c.kick(); await c.idle(); } };
  const syncA = T.get().storeSyncing, syncB = Tb.get().storeSyncing;
  const packOf = UDx => { try { return JSON.parse(JSON.parse(deskText(UDx)).keys.ePack || "null"); } catch { return null; } };
  /* A's page, standing in for src/modules/storage.js: its copy, the key it owes, the tell it took per key, and every tell sent it. */
  const tells = [], page = { map: {}, took: {}, owes: false };
  T.setWindow({ isDestroyed: () => false, webContents: { send: (ch, text, n) => { if (ch === "etiuda:desk-synced") tells.push([JSON.parse(text), n]); } } });
  const ev = { sender: { id: 41, once: () => {} }, senderFrame: { parent: null, url: "file:///C:/Etiuda/engine/etiuda.html" } };
  page.map = JSON.parse(r.shell.ipc.on["etiuda:desk"](ev) || (ev.returnValue || "{}")) || {};
  if (!page.map || typeof page.map !== "object") page.map = {};
  const take = () => { while (tells.length) { const [keys, n] = tells.shift(); if (page.owes) continue; for (const k of Object.keys(keys)) { if (keys[k] === null) delete page.map[k]; else page.map[k] = keys[k]; if (Number.isSafeInteger(n)) page.took[k] = n; } } };
  const send = async keys => {
    const out = {}, took = {};
    for (const k of keys) { out[k] = page.map[k] === undefined ? null : page.map[k]; if (page.took[k] !== undefined) took[k] = page.took[k]; }
    return r.shell.ipc.handle["etiuda:desk-patch"](ev, JSON.stringify(out), JSON.stringify(took));
  };
  const settle = async () => { for (let i = 0; i < 3; i++) { await run(syncA); take(); await run(syncB); } };
  page.map.ePack = JSON.stringify({ overrides: { c0: { t: "base" } } });
  await send(["ePack"]);
  await settle();
  const shared = !!packOf(bBoot.UD) && !!packOf(bBoot.UD).overrides && !!packOf(bBoot.UD).overrides.c0;
  Tb.patchDesk(JSON.stringify({ ePack: JSON.stringify({ overrides: { c0: { t: "base" }, c1: { t: "from B" } } }) }));
  await run(syncB);
  page.owes = true;
  page.map.ePack = JSON.stringify({ overrides: { c0: { t: "base" } }, favourites: ["c2"] });
  await run(syncA);
  take();
  page.owes = false;
  await send(["ePack"]);
  await settle(); await settle();
  const one = { a: packOf(UD), b: packOf(bBoot.UD) };
  const both = p => !!p && !!p.overrides && !!p.overrides.c1 && p.overrides.c1.t === "from B" && Array.isArray(p.favourites) && p.favourites.indexOf("c2") >= 0;
  const keptOne = syncA.state().kept.length + syncB.state().kept.length;
  /* The page took the tells since; the person removes B's edit here. */
  take();
  const p = JSON.parse(page.map.ePack || "{}");
  if (p.overrides) delete p.overrides.c1;
  page.map.ePack = JSON.stringify(p);
  await send(["ePack"]);
  await settle(); await settle();
  const two = { a: packOf(UD), b: packOf(bBoot.UD) };
  const gone = q => !!q && !!q.overrides && !q.overrides.c1 && !!q.overrides.c0;
  const keptTwo = syncA.state().kept.length + syncB.state().kept.length;
  /* Cleared whole by the shell under a page owing the key: the clear stands, the page is told again and takes it, its next write kept. */
  page.owes = true;
  page.map.eCatOrder = JSON.stringify(["mine"]);
  if (T.patchDesk(JSON.stringify({ ePack: null }))) T.deskSyncedTell({ ePack: null });
  take();
  page.owes = false;
  await send(["ePack", "eCatOrder"]);
  const cleared = packOf(UD) === null;
  await new Promise(a => setImmediate(a));
  take();
  page.map.ePack = JSON.stringify({ favourites: ["c9"] });
  await send(["ePack"]);
  const after = packOf(UD), retold = page.map.ePack !== undefined && page.took.ePack !== undefined;
  const ok = shared && both(one.a) && both(one.b) && keptOne === 0 && gone(two.a) && gone(two.b) && keptTwo === 0 && cleared && !!after && Array.isArray(after.favourites) && after.favourites[0] === "c9";
  return { ok, detail: brief({ shared, one: { a: one.a, b: one.b }, keptOne, two: { a: two.a && two.a.overrides, b: two.b && two.b.overrides }, keptTwo, cleared, after, retold }) };
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
  ["gk", conflictOpenedScene, "a conflict's notice ends once the page tells the shell it showed the line, on the engine's own channel alone: the kept version and its copy stay, the mark is kept in sync.json, and a version kept after it is a new notice"],
  ["gs", switchStopScene, "This computer and Everywhere stop the store's sync at once, the relay unreached, not at the next look"],
  ["gr", roomWireScene, "a write the store's relay refuses for its room turns the row full, and the next write it takes turns it on"],
  ["jp", pristineScene, "the store's sync names the shipped sample untouched in the person's folder by its bytes, and a copy with one byte changed as the person's own"],
  ["rv", removalVolumeScene, "a catalog another computer removed, the catalog folder on another volume than the profile: copied aside and unlinked; an unlink that fails leaves it where it was, the copy gone, the removal not taken as applied"],
  ["k7", keepFirstScene, "a merge's copy is kept before what it copies is replaced: a copy that cannot be kept leaves the catalog and the layer as they were, answered not applied, a key with no copy put in place; a catalog write failing after its copy is kept leaves the file as it was; both succeeding, the later is in place and the earlier kept"],
  ["t7", againScene, "a look the licence service did not answer is tried again by itself at 1, 2, 4, 8, 16, 32 and 64 minutes, then no more, until a look from outside; back, it is on and nothing waits; a refusal is not tried again, and the switch turned off, a sign out and a quit leave no timer"],
  ["t7v", againViewScene, "the row is told a passing failure as again, with the reason and the try's own time, while a try is set, and as spent once the tries are spent; nothing of a key, a token, a store or an address"],
  ["rf", refusedViewScene, "a refusal by the licence service (another's store, a fresh sign-in wanted) or by the relay is told as refused with its reason, the relay's only as relay, and no short try is set"],
  ["lk", lookingScene, "the page is told when a look begins and ends; while it runs the row says first where no look has had sync on here, checking after; a start before its renewal, nothing looked at, says unconnected, with no date where no look ever found sync on"],
  ["ps", pausesScene, "a renewal refused at the service leaves sync on its current certificate, the row on; that certificate ended, signing in refused; no refusal, a lapse under three days lapsed and one of three or more the dated pause"],
  ["g6h", heldUngivenScene, "policy holding sync on and the folder never allowed, the row says so and its button asks the provider only for the person's trusted click, once, then the look turns sync on, still held"],
  ["e7", anewScene, "turned off everywhere from another computer, policy holding sync on: a new store from what is on this computer, the row saying so; nothing on the desk lost, nothing asked of the ended store, its mirror as it was; with nothing holding the switch, off as before"],
  ["t12", offlineStartScene, "a desk starting with its certificate standing and neither the provider nor the service reached loads its sync with what it keeps, the row saying the folder is not reached and the look tried again by itself, which it is; the address back, the next try turns the store on and the sync runs"],
  ["gt", teamFolderScene, "joined to a folder team, the store's sync takes no team catalog into the person's store, reads the person's own catalog as removed nowhere, and writes nothing from the store into the team's mirror"],
  ["g1b", consentBusyScene, "while the switch's request for the folder waits on the browser the desk is busy to the page, and an answer after another account took the seat is neither taken for it nor looked with"],
  ["g2r", keepRefreshScene, "the switch's Google consent sign-in answered with no refresh token keeps the refresh token already sealed for the same account"],
  ["t1", outageScene, "the token address answering 503 or 429 to the look's refresh, or to a renewal's folder refresh, keeps no refusal for the folder: the look says offline and the store is on once it answers"],
  ["gm", madeOutageShellScene, "a store made while the licence service was out is named in store.json and made at the relay as the replacement once the service answers"],
  ["f7", folderCancelScene, "while the browser sent on for the folder has not answered, the sign-in is in progress to the page and Cancel closes the loopback, so a late answer keeps no folder token"],
  ["f7q", folderCancelQuietScene, "Cancel while the folder's quiet refresh is out, the code already back, closes the loopback at once: the window is never sent on"],
  ["f8", folderSlowScene, "a folder step slower than eight seconds still sends the window on for the folder, lands its page and opens the store"],
  ["fa1", refusedAccountScene, "a second Google sign-in whose seat is refused leaves the folder's token the seated account's"],
  ["fa2", overAnotherScene, "an account seated straight over another, with no folder step of its own, is never handed the other's folder token: its look asks its own"],
  ["w1", s => anotherScene(s, "look", true), "person A synced and signed out, which leaves no store keys here; person B seated on the same profile with an empty folder: B's look writes nothing of A's K or S into B's folder, and makes no store of B's while the desk's content is A's (x1)"],
  ["w1d", s => anotherScene(s, "look", false), "the same where B signs in straight over A's sign-in"],
  ["w2", s => anotherScene(s, "leave", false), "a This computer A left owed is not written into B's folder with A's keys"],
  ["w3", s => anotherScene(s, "owed", false), "a store/end A left owed is not posted while B is seated"],
  ["w4", lookOutScene, "a look of A's still out when B is seated seals nothing here for B and writes nothing more to the folder"],
  ["s5", switchMidLookScene, "the switch turned off while a look is out: once answered the look keeps no key, calls the relay no more, leaves the folder's list without this desk, starts no sync and the row says Off; turned off and on again, On starts a look of its own, which turns the store on"],
  ["x1", s => heldScene(s, true), "A synced and signed out; B seated on the same profile: nothing is looked at, uploaded or merged for B (no relay call, no store in B's folder, the sync stopped, no merge set going), and the desk's sync state, mirror and desk.json stay as they were, the store state A's"],
  ["x1d", s => heldScene(s, false), "the same where B signs in straight over A"],
  ["x4", recordScene, "with B seated over A's content store.json names A's account as the state's and B's as last seated and owing the answer, what a later build needs to ask once; B's sign-out deletes nothing of the store's state, mirror or desk.json; A back, A owes the answer in turn"],
  ["x5", returnScene, "A synced; B seated edits the desk and signs out; A back is not the account last seated, so it is held too: no look, no relay call, no merge, B's edit still on the desk and in no store, the sync state as B left it"],
  ["x2", sameBackScene, "the ordinary case: the same account signed out and back finds its store on, the same store, its sync running, nothing asked"],
  ["x3", backScene, "A turned sync off here, signed out; B came and went; A back finds its own switch as it left it, and, not the account last seated, is held as B was: no look, the sync stopped, the desk's sync state as A left it"],
  ["x6m", answerMineScene, "It is mine lifts the hold, sets who = last = this account, clears ask, merges the desk into this account's store, asks once, and holds the earlier account coming back"],
  ["x6j", answerMineJoinsScene, "It is mine from a different account joins its store as a computer that has never synced: a catalog the earlier account removed here stays on the new account's other computer and reaches this desk, and the earlier account's kept versions are gone from the row"],
  ["x6b", answerMineOwnScene, "the account whose state it is answers It is mine after another account said Not now: its switch stays off and its store/end owed, the row says ending, nothing is looked at, and the next renewal posts the store/end"],
  ["x6s", answerStartScene, "Start from my account sets aside desk.json, store.json, userData/store and own .ec files byte for byte (team folders untouched), clears synced desk keys, uploads none of it, loads this account's own store, and puts a second set-aside beside the first"],
  ["x6sn", answerStartNewAccountScene, "Start from my account for an account with no store yet sets A's content aside and makes B's store empty with nothing of A's uploaded"],
  ["x6n", answerNotNowScene, "Not now leaves store.json and the hold unchanged, suppresses auto-ask in this run, and asks again on a new run"],
  ["x6f", answerStartRollbackScene, "a failure halfway during set-aside puts back everything moved, leaves no half-made folder, keeps the hold and says so"],
  ["x6w", answerNeighboursScene, "after an answer lifts the hold, A's keys, owed leave, owed store/end and folder token still never reach B"],
  ["x6o", openSetAsideScene, "opening the set-aside folder uses its no-arg IPC channel, opens the dated folder when one exists and Set aside itself when two do, refuses page args, and opens/creates nothing when gone"],
  ["x6p", answerStartBusyRenameScene, "set-aside moves whose first rename fails busy retry via renamePatiently and succeed"],
  ["x6k", answerStartKeptScene, "a set-aside whose later step fails and whose move back of the catalog, or of the store folder, fails keeps that whole in the set-aside folder, which stays, the log names it, the answer carries it and the button opens it; where every move back succeeds the folder goes"],
  ["x6r", openAfterRestartScene, "after a restart the button's channel opens the desk's single dated folder, or Set aside itself when a second or hand-made dated folder is beside it; all removed it answers gone, and a name of another shape in store.json is ignored"],
  ["x6l", asideLinkScene, "a link under Set aside bearing the name store.json keeps is never opened as the set-aside folder: Open this folder answers gone; a real folder of that name is opened"],
  ["z2c", answerStartCatalogScene, "Start from my account takes the loaded catalog aside with the rest: in the set-aside desk.json, gone from the desk's, the page told, nothing of it in B's store"],
  ["z14", rowToldScene, "a merge keeping a version tells the page; a renewal that lost its refresh token reads as a refused sign-in; the first of two overlapping looks ending leaves the row saying a look runs"],
  ["z6", signinHourScene, "a look more than an hour after the last sign-in renews it first and is granted, on; with the renewal unreached the refusal is tried again within minutes, the row not saying refused"],
  ["z11", signedOutScene, "a change on the desk arms the merge, a sign out clears it, and a change made signed out arms none and changes nothing of the sync state"],
  ["z4", tokenAccountScene, "a folder token asked for one account and answered with another seated is not kept for it, and a look whose token is answered after a sign out says nothing and arms no retry"],
  ["z2", takenFieldScene, "an edit another computer made, taken into a layer behind a page that owed a write of it, stands on both computers with the page's own change once that write lands, nothing kept; a field the person then removes here, the tell taken, is removed there; a key the shell cleared whole stays cleared under such a write, and the page told again takes it"],
  ["x6a", openManySetAsidesScene, "with two set-asides (a kept failure then a success) or with the named folder removed and another dated folder left or with a hand-made dated folder beside the desk's, Open this folder opens Set aside itself before and after a restart; with one set-aside it opens that folder; with none it answers gone"],
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
  ["c", swap("  if (folder) signinFolderTake(io, folderRes || (signinTransient(folderFirst) ? folderFirst : { status: 0 }), p.id, now()); /* plant:folder-take-renew */\n",
    "  if (folder) signinFolderTake(io, folderRes || (signinTransient(folderFirst) ? folderFirst : { status: 0 }), p.id, now()); /* plant:folder-take-renew */\n  signinTrace(io, p.id, \"refresh\", \"ok\", { detail: String(JSON.parse(Buffer.from(folderRes.bytes).toString()).access_token) });\n"), "the token traced past the trace's own hiding"],
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
  ["gn", swap(" renew: async (k, g) => (ours() ? storeRelayRenew(k, g) : { ok: false, why: \"relay\" }),", ""), "the look hands the relay no renewal, so the store lapses from its making"],
  ["g2", swap("const token = !lacks && ", "const token = "), "Google's answer without the folder's scope taken as the folder's token"],
  ["g2", swap("  const folder = L.folderFor(p.id, {", "  const folder = L.folderFor(\"microsoft\", {"), "the store's folder asked of Microsoft whatever the sign-in, so the store never opens in Google Drive"],
  ["f3", swap("    loop.land(folder || kind || \"back\"); /* plant:folder-land */", "    loop.land(kind || \"back\"); /* plant:folder-land */"), "the second step lands the sign-in's page, not the folder's"],
  ["h", swap("Nothing changed. It can be turned on in Account at any time. This tab can be closed.", "Nothing changed. It can be turned on in Account at any time. You can close this tab."), "a folder page closing in other words than the sign-in's"],
  ["gc", swap("function storeConflicts() { return storeSyncView().kept; } /* plant:store-conflicts */", "function storeConflicts() { return 0; } /* plant:store-conflicts */"), "the row counts no conflict"],
  ["gk", swap("kept.filter(k => !k.opened).length : 0 }; } /* plant:store-kept-opened */", "kept.length : 0 }; } /* plant:store-kept-opened */"), "the row counts every version kept, opened or not, so the notice never ends"],
  ["gs", swap("  storeSyncStop(); /* plant:store-set-stop */\n", ""), "the switch leaves the sync running"],
  ["gr", swap("      room: storeRoom, /* plant:store-room */\n", ""), "the store's channel tells the row nothing"],
  ["f7", swap("    if (!run.after) signinBusy = null; /* plant:folder-busy */", "    signinBusy = null; /* plant:folder-busy */"), "the sign-in ends before its folder step, so Cancel cannot reach it"],
  ["f7q", swap("{ if (typeof run.loop.cancel === \"function\") run.loop.cancel(); else run.loop.close(); } /* plant:stop-cancel */", "run.loop.close(); /* plant:stop-cancel */"), "Cancel closes nothing once the code is back"],
  ["f8", swap("  if (io.store === true && signinFolderApart(p.id)) run.landMs = SIGNIN_FOLDER_LAND_MS; /* plant:folder-land-ms */", ""), "the plain landing's cap cuts the folder step"],
  ["gm", swap("  const made = (look.state === \"paused\" || look.state === \"unavailable\") && look.made === true && look.keys ? look.keys.rt : look.state === \"on\" ? \"\" : storeState().made; /* plant:store-made-kept */", "  const made = \"\"; /* plant:store-made-kept */"), "the store made here is not named, so the next look forgets it"],
  ["t1", swap(" || signinTransient(res)) return; /* plant:folder-transient */", ") return; /* plant:folder-transient */"), "an outage at the token address kept as the folder refused"],
  ["t1", swap("  if (signinTransient(res)) return { why: \"offline\" };", ""), "the look's refresh answered by an outage read as consent never given"],
  ["g2r", swap(" || (sameAccount() ? was.refresh || \"\" : \"\"), /* plant:take-keeps-refresh */", ", /* plant:take-keeps-refresh */"), "the sealed refresh token replaced by none"],
  ["g1b", swap("  signinBusy = run; /* plant:consent-busy */", "  /* plant:consent-busy */"), "the consent's wait is no sign-in in progress to the page"],
  ["g1b", swap("{ folderToken: t => { if (same()) storeTokenTake(t); } }); /* plant:consent-held */", "{ folderToken: t => { storeTokenTake(t); } }); /* plant:consent-held */"), "the consent's answer taken for whoever is seated"],
  ["g1b", text => { const x = swap("return signinState().held && storeWho(signinState().held) === storeWho(held) ? storeTurn() : null; }); /* plant:consent-same-look */", "return signinState().held ? storeTurn() : null; }); /* plant:consent-same-look */")(text);
    return x && swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */")(x); }, "the look after the consent run for whoever is seated, the hold lifted"],
  ["fa1", swap("io = Object.assign(signinIo(run), { folderToken: t => { folderGot = t; } });", "io = signinIo(run);"), "the run's folder token kept before the sign-in is taken"],
  ["fa2", text => { const x = swap("storeAccess.who === storeWho(held) ? storeAccess : null; /* plant:access-who */", "true ? storeAccess : null; /* plant:access-who */")(text);
    const y = x && swap("  if (storeAccess && storeAccess.who !== who) storeAccess = null;", "")(x);
    return y && swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */")(y); }, "a folder token reused for whoever is seated, the hold lifted"],
  ["jp", swap(" if (isTheSample(f)) pristine.push(\"f:\" + n); } /* plant:sync-pristine */", " } /* plant:sync-pristine */"), "the untouched sample not named, so a joining computer brings back a sample deleted elsewhere"],
  ["rv", swap("      storeMoveFile(at, storeSyncDir(\"kept\", Date.now() + \"-\" + name)); /* plant:sync-remove-volume */", "      renamePatiently(at, storeSyncDir(\"kept\", Date.now() + \"-\" + name)); /* plant:sync-remove-volume */"), "a removal moved by rename alone, so a catalog folder on another volume never takes one"],
  ["k7", swap("    if (blocked.has(item)) continue; /* plant:keep-first */\n", ""), "the patch put in place whether or not its copy was kept, so a failed keep loses the version it replaced"],
  ["t7", swap("  storeAgainAfter(look); /* plant:store-again */\n", ""), "no look is tried again by itself"],
  ["t7", swap("  storeAgainStop(); /* plant:store-again-out */\n", ""), "a sign out leaves the timer running"],
  ["t7", swap("  storeAgainStop(); /* plant:store-again-quit */\n", ""), "a quit leaves the timer running"],
  ["t7v", swap("again: storeAgainTimer ? storeAgainAt : 0, /* plant:store-view-again */", "again: 0, /* plant:store-view-again */"), "the row is told no try is set, so it says spent while one is"],
  ["t7v", swap("  storeAgainAt = Date.now() + ms; /* plant:store-again-at */", "  storeAgainAt = Date.now(); /* plant:store-again-at */"), "the try's time told as now, not when it comes"],
  ["rf", swap("if (res && res.status === 403 && plainObj(j) && (j.reason === \"signin\" || j.reason === \"store\")) return { why: j.reason };", "if (false) return { why: j.reason };"), "the service's refusal read as not reached, so the row says it tries again"],
  ["lk", swap("  storeLooking++; tellStore(); /* plant:store-look-told */", "  /* plant:store-look-told */"), "the look's start neither kept nor told, so the row says what it said before"],
  ["lk", swap("looking: storeLooking > 0, ever: s.told === true, /* plant:store-view-looking */", "looking: false, ever: false, /* plant:store-view-looking */"), "the row told neither that a look runs nor that one had sync on before"],
  ["ps", swap("signinRefused: !!(held && (held.said || held.ask === true)), conflicts:", "signinRefused: false, conflicts:"), "the row not told the sign-in is refused, so an ended certificate reads as a lapse"],
  ["g6h", swap(" || !storePolicyNow().on) return \"none\"; /* plant:consent-ungiven */", " || storePolicyNow().held) return \"none\"; /* plant:consent-ungiven */"), "the press refused wherever policy holds the switch, so the row's button asks nothing"],
  ["e7", swap("  if (look.state === \"ended\" && pol.held === true && pol.on === true && ours()) { storeAnew = true; tellStore(); look = await L.storeLook(Object.assign({}, io, { fresh: true })); } /* plant:store-anew */\n", ""), "the ended mark followed under a held switch, so sync stops here in silence"],
  ["e7", swap("    anew: storeAnew, /* plant:store-view-anew */\n", ""), "the new store made but the row not told, so it says on"],
  ["t12", swap("  else if (s.held && s.held.cert && s.held.reached === false) storeTurn(); /* plant:store-renew-unreached */\n", ""), "a renewal that reached nothing makes no look, so the sync waits unloaded and nothing is tried again"],
  ["gt", swap("if (sayJoinPolicy().folder || relayHere() || folderTeamHere() || Object.keys(teamNeedsFolder).length) return \"\"; /* plant:sync-team-folder */", "if (false) return \"\"; /* plant:sync-team-folder */"), "the store's sync lists and writes the team's mirror as the person's folder"],
  ["w1", swap("  if (s.keys || s.leave || storeLeaveHere) {", "  if (false) {"), "a sign-out leaves the store's keys in store.json"],
  ["w1d", text => { const x = swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */")(text);
    return x && swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */")(x); }, "the keys kept for A are B's, the hold lifted"],
  ["w2", text => { const x = swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */")(text);
    return x && swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */")(x); }, "the leave kept for A is B's, the hold lifted"],
  ["w3", text => { const x = swap("  if (s.who === who) return true; /* plant:store-mine */", "  if (true) { s.who = who; return true; } /* plant:store-mine */")(text);
    return x && swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */")(x); }, "the store/end owed for A is B's, the hold lifted"],
  ["s5", swap(" && storeSwitchNo === switchAt && storeOn(); /* plant:store-look-ours */", "; /* plant:store-look-ours */"), "a look ends as though the switch had not moved: it keeps the keys and starts the sync under a row that says Off"],
  ["s5", swap("    storeFlight = null; /* plant:store-on-fresh */\n", ""), "On waits on the look already out, begun before the switch was turned off"],
  ["x1", swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */"), "another account takes the desk's store state and looks, makes and syncs as its own"],
  ["x1", swap("  if (!storeSyncing || storeHeld()) return; /* plant:store-held-merge */", "  if (!storeSyncing) return; /* plant:store-held-merge */"), "a change on the desk sets the merge going while another account is seated"],
  ["x4", swap("    if (s.keys || s.leave || s.ask !== who || s.last !== who) { s.keys = \"\"; s.leave = \"\"; s.ask = who; s.last = who; storeSave(); } /* plant:store-ask */", "    if (s.keys || s.leave) { s.keys = \"\"; s.leave = \"\"; storeSave(); } /* plant:store-ask */"), "the account owing the answer, and the one last seated, are not kept"],
  ["x5", swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = !!s.who && s.who !== who; /* plant:store-held */"), "the hold keyed on whose the state is, so A's return merges B's edit"],
  ["x1d", swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */"), "another account seated straight over takes the store as its own"],
  ["x3", swap("  held = !!last && (last !== who || s.ask === who); /* plant:store-held */", "  held = false; /* plant:store-held */"), "B's seat takes the state, so B's turn leaves its store in the desk's sync state before A is back"],
  ["w4", swap("  const ours = () => storeState().who === who && storeWho(signinState().held) === who && storeSwitchNo === switchAt && storeOn(); /* plant:store-look-ours */", "  const ours = () => true; /* plant:store-look-ours */"), "a look ends under whoever is seated"],
  ["d", swap(".indexOf(String(url)) < 0) throw new Error(\"the licence service's door takes", ".indexOf(String(url)) < -1) throw new Error(\"the licence service's door takes"), "the door takes any route"],
  ["x6m", swap("  s.who = who; s.last = who; s.ask = \"\"; /* plant:answer-mine-who */", "  s.last = who; /* plant:answer-mine-who */"), "It is mine leaves ask and who unchanged, so the hold stays"],
  ["x6j", swap("  if (choice === \"mine\" && s.who !== who && !storeSyncFresh()) return { ok: false, choice: \"mine\", folder: \"\", view: storeView() }; /* plant:answer-mine-fresh */\n", ""), "It is mine carries the earlier account's ledger and kept list into the new account's store"],
  ["x6b", swap("? { off: s.off === true, owed: s.owed, here: storeOwedHere } : null; /* plant:answer-mine-own */", "? null : null; /* plant:answer-mine-own */"), "It is mine by the account whose state it is turns its switch on and drops its owed store/end"],
  ["x6s", swap("  if (Object.keys(clear).length && !patchDesk(JSON.stringify(clear))) throw new Error(\"desk.json could not be updated\"); /* plant:answer-aside-clear */", "  /* plant:answer-aside-clear */"), "Start from my account does not clear synced desk keys before the new store syncs"],
  ["x6sn", swap("  storeSyncStop(); storeSyncing = null; /* plant:answer-aside-syncing */", "  storeSyncStop(); /* plant:answer-aside-syncing */"), "Start from my account keeps the old sync instance in memory"],
  ["x6n", swap("  storeNotNow.add(who); /* plant:answer-notnow */", "  /* plant:answer-notnow */"), "Not now does not remember the dismissal for this run"],
  ["x6f", swap("  if (movedStore) storeMoveFile(movedStore.to, movedStore.from); /* plant:answer-aside-rollback */", "  /* plant:answer-aside-rollback */"), "a failure during set-aside does not put userData/store back"],
  ["x6w", swap("  s.keys = \"\"; s.leave = \"\"; s.owed = \"\"; s.made = \"\"; /* plant:answer-mine-keys */", "  /* plant:answer-mine-keys */"), "answering the hold leaves the earlier account's keys, leave and owed end"],
  ["x6o", swap("  if (args.length) return false; /* plant:open-aside-no-args */", "  if (false) return false; /* plant:open-aside-no-args */"), "the channel accepts a path argument handed by the page"],
  ["x6o", swap("  if (!folder || !isDir) return { ok: false, why: \"gone\" }; /* plant:open-aside-gone */", "  /* plant:open-aside-gone */"), "a gone set-aside folder still calls shell.openPath"],
  ["x6p", swap("  try { renamePatiently(from, to); } /* plant:aside-move-patient */", "  try { fs.renameSync(from, to); } /* plant:aside-move-patient */"), "storeMoveFile uses a bare fs.renameSync instead of renamePatiently"],
  ["x6p", swap("    if (fs.existsSync(sDir)) { renamePatiently(sDir, sDest); movedStore = { from: sDir, to: sDest }; } /* plant:aside-store-patient */", "    if (fs.existsSync(sDir)) { fs.renameSync(sDir, sDest); movedStore = { from: sDir, to: sDest }; } /* plant:aside-store-patient */"), "storeSetAside moves userData/store with a bare fs.renameSync"],
  ["x6k", swap("    if (aside && back) { try { fs.rmSync(aside, { recursive: true, force: true }); } catch {} } /* plant:aside-kept */", "    if (aside) { try { fs.rmSync(aside, { recursive: true, force: true }); } catch {} } /* plant:aside-kept */"), "the set-aside folder removed whether or not every move back succeeded"],
  ["x6r", swap("    s.aside ? { aside: s.aside } : {}), null, 1)", "    {}), null, 1)"), "the set-aside folder's name not kept in store.json, so a restart forgets it"],
  ["x6r", swap(".test(d.aside) ? d.aside : \"\" }; /* plant:store-aside-name */", ".test(d.aside) || ok && typeof d.aside === \"string\" ? d.aside : \"\" }; /* plant:store-aside-name */"), "any name in store.json read as the set-aside folder's"],
  ["x6l", swap("    try { return fs.lstatSync(path.join(root, n)).isDirectory(); } catch { return false; } /* plant:aside-lstat */", "    try { return fs.statSync(path.join(root, n)).isDirectory(); } catch { return false; } /* plant:aside-lstat */"), "the dated folder judged by a stat that follows a link, so a link named like it is opened as it"],
  ["z2c", swap("    if (Object.prototype.hasOwnProperty.call(deskKeys || {}, \"eCatalog\")) clear.eCatalog = null; /* plant:aside-catalog */\n", ""), "the loaded catalog left on the desk for the next account"],
  ["z14", swap("      if (kept !== storeKeptTold) { storeKeptTold = kept; tellStore(); } /* plant:kept-told */", "      /* plant:kept-told */"), "a merge that keeps a version tells the page nothing"],
  ["z14", swap("    signinRefused: !!(held && (held.said || held.ask === true)), conflicts: storeConflicts(), /* plant:view-signin-ask */", "    signinRefused: !!(held && held.said), conflicts: storeConflicts(), /* plant:view-signin-ask */"), "a lost refresh token read as nothing wrong"],
  ["z14", swap("finally { storeLooking--; tellStore(); } /* plant:store-look-count */", "finally { storeLooking = 0; tellStore(); } /* plant:store-look-count */"), "the first look ending ends the row's word for both"],
  ["z6", swap("      const fresh = await storeSigninFresh(); /* plant:grant-signin-fresh */", "      const fresh = true; /* plant:grant-signin-fresh */"), "the grant asked with an hour-old sign-in, refused for a day"],
  ["z6", swap("      return got && got.why === \"signin\" && !fresh ? { why: \"unreached\" } : got; /* plant:grant-signin-again */", "      return got; /* plant:grant-signin-again */"), "a refusal the renewal could not mend left for a day, the row saying refused"],
  ["z11", swap("storeSyncStop(); storeSyncCalm(); /* plant:forget-calm */", "storeSyncStop(); /* plant:forget-calm */"), "the merge armed before a sign out runs after it"],
  ["z11", swap(" && !!storeWho(signinState().held); /* plant:store-seated-merge */", "; /* plant:store-seated-merge */"), "a change made signed out arms the merge into the earlier account's sync state"],
  ["z4", swap("  if (storeWho(signinState().held) !== storeWho(held)) return { why: \"offline\" }; /* plant:token-who */\n", ""), "the token kept for whoever is seated when it comes"],
  ["z4", swap("  if (token.why) return ours() ? storeSettle({ state: \"unavailable\", why: token.why }) : null; /* plant:token-ours */", "  if (token.why) return storeSettle({ state: \"unavailable\", why: token.why }); /* plant:token-ours */"), "a look whose token failed settles after a sign out, saying unavailable and arming a retry"],
  ["z2", swap("    if (storeSyncing && Object.keys(rewind).length) storeSyncing.untake(rewind); /* plant:desk-untake */\n", ""), "what the sync took is not taken again once the page's write from a copy without it lands, so the next merge reads it as this computer's removal"],
  ["z2", swap("    for (const k of w.dropped) delete patch[k];\n", ""), "a key the shell cleared whole is written back by the page's write from a copy that still held it"],
  ["x6a", swap("  return dated.length === 1 && dated[0] === name ? path.join(root, name) : root; /* plant:open-aside-many */", "  return name ? path.join(root, name) : \"\"; /* plant:open-aside-many */"), "the count taken out, so the latest is always opened"],
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
