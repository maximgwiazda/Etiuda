/* The desk's sign-in as the person's own (board 980): the providers Etiuda is registered with, the browser path with PKCE and a
 * nonce bound to the desk's own key, a loopback that waits for its own state, the scopes, the licence service's signin/desk signed
 * by the desk's key, the seat certificate kept and written as desks/<id>/seat.json format 2, the quiet renewal at each start and
 * daily, the calm lapse, nothing where no provider is configured, and nothing local gated on any of it. Bare node, no window, no
 * provider and no service reached: the one socket is the loopback on 127.0.0.1.
 *
 *     node tests/desk-signin.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE SHELL'S HALF IS SLICED, as tests/update-offer.mjs slices the version note: the sign-in's section of shell/main.js, from
 * its heading to its wiring, evaluated with the few declarations it reaches sliced from the same file. inviteRead is sliced too,
 * to hold that an invitation no longer starts a sign-in. The wiring is evaluated with stand-ins for the shell around it. The
 * page's half, src/modules/signin.js, is imported: its door's content for each moment, from the view alone.
 *
 * THE SERVICE'S BYTES ARE WRITTEN HERE FROM THE INTERFACE (the line `etiuda-licence-signin-desk`, then provider, the token's
 * SHA-256, the desk key and t, one a line), not taken from the desk's function, so the two are checked against each other.
 *
 * EVERY GUARD IS SHOWN RED (ds-plants): the line carrying its plant tag is put in another form in memory and the same case
 * is read again; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const PAGE = (() => { try { return fs.readFileSync(path.join(ROOT, "src", "modules", "signin.js"), "utf8"); } catch { return ""; } })();
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 27;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 42 + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the slices ------------------------------------------------------------------------------------------------------- */
const HEAD = "/* ---- the desk's sign-in (board 980";
const WIRE = "\n/* The sign-in's wiring:";
const TAIL = "\n/* An IPC message is answered only for the engine's own top frame.";
function between(src, a, b) {
  const at = src.indexOf(a), end = src.indexOf(b, at);
  if (at < 0 || end < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return src.slice(at, end);
}
let SECTION = "", WIRING = "";
try { SECTION = between(MAIN, HEAD, WIRE); WIRING = between(MAIN, WIRE, TAIL); } catch { /* the cases say what is missing */ }
/* A top-level declaration, from its first line to its closing brace at column 0, or its one line. */
function decl(src, start) {
  const at = src.indexOf("\n" + start);
  if (at < 0 || src.indexOf("\n" + start, at + 1) >= 0) throw new Error("not in shell/main.js once: " + start);
  if (/^const /.test(start)) return src.slice(at + 1, src.indexOf("\n", at + 1));
  const end = src.indexOf("\n}", at + 1);
  return src.slice(at + 1, end + 2);
}
const NEEDS = ["const SEALED_TEAM_RE =", "const LINUX_KEYRINGS =", "function sealsForReal(", "function branchIdOf("].map(s => decl(MAIN, s)).join("\n");
const INVITE = ["const INVITE_HIDDEN_RE =", "function inviteRead(", "function inviteRelay("].map(s => decl(MAIN, s)).join("\n");
const NAMES = ["SIGNIN_PROVIDERS", "signinOffered", "signinNonce", "signinAuthorize", "signinPageOk", "signinBack", "signinRefusedWhy", "signinTokens",
  "signinRequest", "signinListen", "signinRun", "signinRenew", "signinKeep", "signinKept", "GOOGLE_HD_NEEDS_EMAIL", "signinRefreshForm",
  "SIGNIN_SERVICE", "signinDeskBytes", "signinDeskBody", "signinServiceAsk", "signinCertOk", "signinAnswer", "signinSeat", "signinLapsed",
  "signinSettle", "signinRenewHeld", "seatFileText", "SEAT_NAME", "signinFileRead", "signinFileText", "branchIdOf", "inviteRead"];
/* The section, evaluated: `swap` is [from, to], put in place of the one line that holds `from`, for a plant. */
function load(swap, where) {
  let sec = SECTION, inv = INVITE;
  if (swap) {
    const inSec = where !== "invite";
    const text = inSec ? sec : inv;
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    if (inSec) sec = text.replace(swap[0], swap[1]); else inv = text.replace(swap[0], swap[1]);
  }
  /* A name the slice lacks comes back undefined, so a case reaching for it fails alone rather than the whole file. */
  const body = NEEDS + "\n" + sec + "\n" + inv + "\nreturn {" + NAMES.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ") + "};";
  /* inviteRead's own readers stand in: a folder is taken as written, no place is kept, no relay channel is read. */
  return new Function("crypto", "Buffer", "URLSearchParams", "AbortController", "setTimeout", "clearTimeout",
    "inviteFolder", "placeKept", "teamChannelOf", body)(crypto, Buffer, URLSearchParams, AbortController, setTimeout, clearTimeout,
    f => String(f || ""), () => null, () => null);
}
let S = {};
try { S = load(); } catch (e) { console.log("  (the section did not load: " + e.message + ")"); }

/* ---- the stand-ins ---------------------------------------------------------------------------------------------------- */
const b64url = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const MS_CLIENT = "00001111-aaaa-2222-bbbb-333344445555", G_CLIENT = "123456789012-abcdefghij.apps.googleusercontent.com";
const TENANT = "aaaabbbb-0000-1111-2222-ccccddddeeee";
/* The providers as a configured build would hold them: the shipped table with client ids filled in. */
const configured = s => ({ microsoft: Object.assign({}, s.SIGNIN_PROVIDERS.microsoft, { clientId: MS_CLIENT }),
  google: Object.assign({}, s.SIGNIN_PROVIDERS.google, { clientId: G_CLIENT }) });
const MS = { id: "microsoft", clientId: MS_CLIENT }, G = { id: "google", clientId: G_CLIENT };
const signKey = crypto.generateKeyPairSync("ed25519"), otherKey = crypto.generateKeyPairSync("ed25519");
const rawPub = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const DESK_KEY = rawPub(signKey.publicKey), OTHER_DESK_KEY = rawPub(otherKey.publicKey);
const DESK_ID = "k-" + crypto.createHash("sha256").update(Buffer.from(DESK_KEY, "hex")).digest("hex").slice(0, 16);
const TEAM = "t-0123456789abcdef";
/* An ID token of the documented shape (Microsoft's and Google's claims), unsigned: the desk reads claims and never a signature. */
function jwt(claims) { return b64url(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })) + "." + b64url(JSON.stringify(claims)) + "." + b64url(crypto.randomBytes(64)); }
const NOW = Date.UTC(2026, 10, 12, 2, 0, 0);
const msClaims = (nonce, at) => ({ iss: "https://login.microsoftonline.com/" + TENANT + "/v2.0", aud: MS_CLIENT, tid: TENANT, oid: "o-1", sub: "s-1",
  iat: (at || NOW) / 1000, exp: (at || NOW) / 1000 + 3600, nonce: nonce });
const gClaims = nonce => ({ iss: "https://accounts.google.com", aud: G_CLIENT, sub: "1001", email_verified: true, iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: nonce });
const answer = (obj, status) => ({ status: status || 200, bytes: Buffer.from(JSON.stringify(obj)) });
/* The service's own making of the nonce and of the desk's signed bytes, written here from the lines the interface names. */
const serviceNonce = (key, seed) => crypto.createHash("sha256").update("etiuda-licence-signin-nonce\n" + key + "\n" + seed).digest("hex");
const serviceBytes = (provider, idToken, desk, t) => Buffer.from("etiuda-licence-signin-desk\n" + [provider,
  crypto.createHash("sha256").update(idToken).digest("hex"), desk, t].join("\n"), "utf8");
const signWith = k => bytes => crypto.sign(null, bytes, k.privateKey).toString("hex");
const CODE = "7K3MQ9TV2XRBHN4W";
const cert = over => Object.assign({ kind: "etiuda-seat-certificate", format: 1, licence: "a".repeat(32), desk: DESK_KEY, person: "b".repeat(64),
  code: CODE, issued: NOW, until: NOW + 30 * 86400000, via: { kind: "etiuda-delegation" }, sig: { alg: "Ed25519", keyId: "svc-1", value: "c".repeat(128) } }, over);

/* ---- cases, each a function of the loaded section so a plant reads the same case again ------------------------------ */
const CASES = {};
/* As shipped no client id is configured, so nothing is offered; a configured table offers what it configures, in its order. */
CASES.offered = s => {
  const shipped = s.signinOffered(), conf = s.signinOffered(configured(s));
  const half = s.signinOffered({ microsoft: Object.assign({}, s.SIGNIN_PROVIDERS.microsoft, { clientId: MS_CLIENT }), google: s.SIGNIN_PROVIDERS.google });
  const odd = s.signinOffered({ elsewhere: { clientId: G_CLIENT }, google: Object.assign({}, s.SIGNIN_PROVIDERS.google, { clientId: "short" }) });
  return Array.isArray(shipped) && shipped.length === 0 && conf.map(p => p.id + ":" + p.clientId).join() === "microsoft:" + MS_CLIENT + ",google:" + G_CLIENT
    && half.map(p => p.id).join() === "microsoft" && odd.length === 0;
};
/* An invitation naming providers no longer carries a sign-in hint: the team's start is retired. */
CASES.noHintStart = s => {
  const doc = { team: TEAM, folder: "\\\\server\\share\\team", secret: "0".repeat(32), lead: { keyId: "studio-1", public: "a".repeat(64), name: "Lead" },
    signin: { providers: [{ id: "microsoft", clientId: MS_CLIENT }] } };
  const read = s.inviteRead("etiuda-join:" + b64url(JSON.stringify(doc)), false);
  return !!read && read.signin === undefined && s.signinOffered().length === 0;
};
CASES.pkce = s => {
  const r = s.signinAuthorize(G, 51234, DESK_KEY);
  const u = new URL(r.url), q = u.searchParams;
  const challenge = b64url(crypto.createHash("sha256").update(r.verifier).digest());
  return u.origin + u.pathname === "https://accounts.google.com/o/oauth2/v2/auth" && q.get("client_id") === G_CLIENT
    && q.get("response_type") === "code" && q.get("redirect_uri") === "http://127.0.0.1:51234" && q.get("code_challenge") === challenge
    && q.get("code_challenge_method") === "S256" && q.get("state") === r.state && r.state.length >= 43 && /^[A-Za-z0-9_-]{43,128}$/.test(r.verifier)
    && q.get("nonce") === r.nonce && /openid/.test(q.get("scope")) && s.signinPageOk(r.url) && !s.signinPageOk("https://accounts.google.example/o/oauth2/v2/auth?x=1");
};
CASES.nonceBound = s => {
  const r = s.signinAuthorize(MS, 50000, DESK_KEY);
  return /^[0-9a-f]{64}$/.test(r.seed) && r.nonce === serviceNonce(DESK_KEY, r.seed) && r.nonce !== serviceNonce(OTHER_DESK_KEY, r.seed);
};
CASES.tokenNonce = s => {
  const seed = "1".repeat(64), mine = serviceNonce(DESK_KEY, seed), theirs = serviceNonce(OTHER_DESK_KEY, seed);
  const ok = s.signinTokens(answer({ id_token: jwt(msClaims(mine)), refresh_token: "r1" }), MS, mine, NOW);
  const other = s.signinTokens(answer({ id_token: jwt(msClaims(theirs)) }), MS, mine, NOW);
  const none = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { nonce: undefined })) }), MS, mine, NOW);
  const aud = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { aud: "someone-else-0000" })) }), MS, mine, NOW);
  const iss = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { iss: "https://login.microsoftonline.com/other/v2.0" })) }), MS, mine, NOW);
  const old = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { exp: NOW / 1000 - 3600 })) }), MS, mine, NOW);
  return ok.ok === true && ok.refreshToken === "r1" && other.reason === "signin-unbound" && none.reason === "signin-unbound"
    && aud.reason === "signin-token" && iss.reason === "signin-token" && old.reason === "signin-token";
};
CASES.state = s => {
  const pending = { state: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ" };
  return s.signinBack("state=" + pending.state + "&code=c1", pending).ok === true && s.signinBack("state=wrong&code=c1", pending).reason === "signin-state"
    && s.signinBack("code=c1", pending).reason === "signin-state" && s.signinBack("state=" + pending.state + "&error=access_denied", pending).reason === "signin-cancelled";
};
/* The organisation's refusal at the provider is told apart from the person's own Cancel and from any other refusal. */
CASES.notAllowed = s => {
  const st = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", pending = { state: st };
  const back = q => s.signinBack("state=" + st + "&" + q, pending).reason;
  return back("error=consent_required") === "signin-notallowed" && back("error=admin_policy_enforced") === "signin-notallowed"
    && back("error=access_denied&error_description=" + encodeURIComponent("AADSTS65001: The user or administrator has not consented")) === "signin-notallowed"
    && back("error=access_denied") === "signin-cancelled" && back("error=server_error") === "signin-refused";
};
/* The whole path at the provider with the browser, the loopback and the provider stood in. */
CASES.flow = async s => {
  let asked = null;
  const io = {
    listen: async pageFor => { let yes; const caught = new Promise(a => { yes = a; }); return { port: 49999, caught, close: () => {}, give: q => { pageFor(q); yes(q); } }; },
    openPage: async url => { const q = new URL(url).searchParams; io.loopQ = "state=" + encodeURIComponent(q.get("state")) + "&code=abc"; io.nonce = q.get("nonce"); return true; },
    tokenAsk: async (url, form) => { asked = { url, form: new URLSearchParams(form.toString()) }; return answer({ id_token: jwt(gClaims(io.nonce)), refresh_token: "rt-1" }); },
    page: () => "",
  };
  const listen = io.listen;
  io.listen = async pageFor => { const l = await listen(pageFor); setTimeout(() => l.give(io.loopQ), 5); return l; };
  const got = await s.signinRun(io, G, DESK_KEY, () => NOW);
  const c = got.ok ? JSON.parse(Buffer.from(got.idToken.split(".")[1], "base64").toString()) : {};
  return got.ok === true && c.nonce === serviceNonce(DESK_KEY, got.seed) && !!asked && asked.url === "https://oauth2.googleapis.com/token"
    && asked.form.get("grant_type") === "authorization_code" && asked.form.get("client_secret") === null && got.refreshToken === "rt-1";
};
/* The request's body has the interface's names and no others, its signature verifies over the service's own bytes with this desk's
   key alone, and a first sign-in sends the seed where a renewal sends none. */
CASES.deskBody = s => {
  const token = jwt(msClaims("n")), seed = "2".repeat(64), t = NOW;
  const first = s.signinDeskBody("microsoft", token, DESK_KEY, seed, t, signWith(signKey));
  const renew = s.signinDeskBody("microsoft", token, DESK_KEY, "", t, signWith(signKey));
  const bytes = serviceBytes("microsoft", token, DESK_KEY, t);
  const ok = b => !!b && crypto.verify(null, bytes, signKey.publicKey, Buffer.from(b.sig, "hex")) && !crypto.verify(null, bytes, otherKey.publicKey, Buffer.from(b.sig, "hex"));
  return ok(first) && ok(renew) && Object.keys(first).join() === "provider,idToken,desk,seed,t,sig" && first.seed === seed && first.desk === DESK_KEY
    && Object.keys(renew).join() === "provider,idToken,desk,t,sig" && first.t === t
    && s.signinDeskBody("elsewhere", token, DESK_KEY, seed, t, signWith(signKey)) === null && s.signinDeskBody("microsoft", token, DESK_KEY, seed, t, () => "") === null;
};
/* The door posts JSON to signin/desk alone: no redirect followed, nothing cached, no cookie, and a body over 8 KiB never sent. */
CASES.serviceDoor = async s => {
  const calls = [];
  const fetchFn = async (u, init) => { calls.push({ u, init }); return { status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from("{}") }; };
  let refused = 0;
  for (const u of ["https://etiuda.dev/licence/v1/signin", "https://evil.example.test/licence/v1/signin/desk", "http://etiuda.dev/licence/v1/signin/desk"]) {
    try { await s.signinServiceAsk(fetchFn, u, { a: 1 }); } catch { refused++; }
  }
  try { await s.signinServiceAsk(fetchFn, s.SIGNIN_SERVICE, { idToken: "x".repeat(9000) }); } catch { refused++; }
  const before = calls.length;
  const res = await s.signinServiceAsk(fetchFn, s.SIGNIN_SERVICE, { provider: "google" });
  const init = calls.length ? calls[calls.length - 1].init : {};
  return refused === 4 && before === 0 && calls.length === 1 && s.SIGNIN_SERVICE === "https://etiuda.dev/licence/v1/signin/desk" && res.status === 200
    && init.method === "POST" && init.redirect === "error" && init.cache === "no-store" && init.credentials === "omit"
    && init.headers["content-type"] === "application/json" && JSON.parse(init.body.toString()).provider === "google";
};
/* The service's answers read as the interface names them; a certificate for another desk or another code is not taken. */
CASES.answers = s => {
  const a = (o, st) => s.signinAnswer(answer(o, st), DESK_KEY);
  const held = a({ ok: true, certificate: cert(), code: CODE }), none = a({ ok: true, certificate: null, code: CODE });
  const theirs = a({ ok: true, certificate: cert({ desk: OTHER_DESK_KEY }), code: CODE }), mixed = a({ ok: true, certificate: cert(), code: "ABCDEFGHJKMNPQRS" });
  return held.ok === true && held.cert && held.cert.code === CODE && held.code === CODE && none.ok === true && none.cert === null
    && theirs.reason === "unreached" && mixed.reason === "unreached"
    && a({ ok: false, reason: "token" }, 403).reason === "token" && a({ ok: false, reason: "signin" }, 403).reason === "signin"
    && a({ ok: false, reason: "full" }, 409).reason === "full" && a({ ok: false, reason: "desks" }, 409).reason === "desks"
    && a({ ok: false, reason: "unavailable" }, 503).reason === "unreached" && a({ ok: false, reason: "slow-down" }, 429).reason === "unreached"
    && s.signinAnswer({ status: 200, bytes: Buffer.from("<html>") }, DESK_KEY).reason === "unreached";
};
/* seat.json is {format: 2, desk, certificate}: the certificate whole, and no token anywhere. */
CASES.seatFile = s => {
  const d = JSON.parse(s.seatFileText(DESK_ID, cert()));
  return Object.keys(d).join() === "format,desk,certificate" && d.format === 2 && d.desk === DESK_ID && JSON.stringify(d.certificate) === JSON.stringify(cert())
    && s.SEAT_NAME === "seat.json";
};
/* A refusal keeps the last certificate; "signin" forgets the refresh token; a service not reached is only marked; an answer of none
   drops the certificate. */
CASES.settle = s => {
  const h = { provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: cert(), at: 1, checked: 1, reached: true, said: "", ask: false };
  const full = s.signinSettle(h, { ok: false, reason: "full" }, NOW), freed = s.signinSettle(h, { ok: false, reason: "signin" }, NOW);
  const away = s.signinSettle(h, { ok: false, reason: "unreached" }, NOW), none = s.signinSettle(h, { ok: true, code: CODE, cert: null }, NOW);
  const fresh = s.signinSettle(Object.assign({}, h, { reached: false, said: "full" }), { ok: true, code: CODE, cert: cert({ issued: NOW + 1 }) }, NOW);
  return full.cert === h.cert && full.said === "full" && full.refresh === "sealed:rt" && full.ask === false
    && freed.cert === h.cert && freed.refresh === "" && freed.ask === true && away.reached === false && away.cert === h.cert && away.at === 1
    && none.cert === null && none.code === CODE && fresh.cert.issued === NOW + 1 && fresh.reached === true && fresh.said === "" && fresh.at === NOW;
};
/* THE CALM LAPSE: lapsed once the kept certificate's until has passed, never with no certificate. */
CASES.lapse = s => {
  const h = c => ({ cert: c });
  return s.signinLapsed(h(cert()), NOW + 29 * 86400000) === false && s.signinLapsed(h(cert()), NOW + 30 * 86400000) === true
    && s.signinLapsed(h(null), NOW + 99 * 86400000) === false && s.signinLapsed(null, NOW) === false;
};
CASES.door = async s => {
  const calls = [];
  const fetchFn = async (u, init) => { calls.push({ u, init }); return { status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from("{}") }; };
  let refused = 0;
  for (const u of ["https://evil.example.test/oauth2/v2.0/token", "http://oauth2.googleapis.com/token", "https://oauth2.googleapis.com/token?x=1",
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"]) {
    try { await s.signinRequest(fetchFn, u, Buffer.from("a=1")); } catch { refused++; }
  }
  const before = calls.length;
  const res = await s.signinRequest(fetchFn, "https://oauth2.googleapis.com/token", Buffer.from("a=1"));
  const init = calls.length ? calls[calls.length - 1].init : {};
  return refused === 4 && before === 0 && calls.length === 1 && res.status === 200 && init.method === "POST" && init.redirect === "error"
    && init.cache === "no-store" && init.credentials === "omit";
};
CASES.keep = s => {
  const vault = backend => ({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend,
    encryptString: t => Buffer.from("sealed:" + t), decryptString: b => String(b).replace(/^sealed:/, "") });
  const basic = s.signinKeep(vault("basic_text"), "linux", "rt-9"), keyring = s.signinKeep(vault("gnome_libsecret"), "linux", "rt-9");
  const win = s.signinKeep(vault("unknown"), "win32", "rt-9");
  return basic === "" && keyring !== "" && keyring.indexOf("rt-9") < 0 && s.signinKept(vault("gnome_libsecret"), keyring) === "rt-9" && win !== "";
};
const get = (port, p) => new Promise(res => {
  const req = http.get({ host: "127.0.0.1", port, path: p, agent: false }, r => { r.resume(); r.on("end", () => res(r.statusCode)); });
  req.on("error", e => res(e.code || "error"));
});
const tick = ms => new Promise(r => setTimeout(r, ms));
const stateIs = want => q => new URLSearchParams(q).get("state") === want;
CASES.loopOnce = async s => {
  const loop = await s.signinListen(http, q => "page " + q.length, 10000, stateIs("a"));
  const stray = await get(loop.port, "/favicon.ico");
  const first = await get(loop.port, "/?state=a&code=b");
  const query = await loop.caught.catch(() => null);
  await tick(50);
  const again = await get(loop.port, "/?state=a&code=b");
  loop.close();
  return stray === 404 && first === 200 && query === "state=a&code=b" && again !== 200 && again !== 404;
};
CASES.loopStray = async s => {
  const loop = await s.signinListen(http, () => "page", 10000, stateIs("good"));
  let settled = false;
  loop.caught.then(() => { settled = true; }, () => { settled = true; });
  const bare = await get(loop.port, "/"), wrong = await get(loop.port, "/?state=bad&code=x");
  await tick(30);
  const waiting = !settled;
  const right = await get(loop.port, "/?state=good&code=y");
  const query = await loop.caught.catch(() => null);
  loop.close();
  return bare === 400 && wrong === 400 && waiting && right === 200 && query === "state=good&code=y";
};
CASES.loopFlow = async s => {
  const codes = [];
  let nonce = "", code = "";
  const io = {
    listen: (pageFor, takes) => s.signinListen(http, pageFor, 10000, takes),
    openPage: async url => {
      const q = new URL(url).searchParams, port = new URL(q.get("redirect_uri")).port;
      nonce = q.get("nonce");
      (async () => {
        codes.push(await get(port, "/"));
        codes.push(await get(port, "/?state=not-this-one&code=stray"));
        codes.push(await get(port, "/?state=" + encodeURIComponent(q.get("state")) + "&code=abc"));
      })();
      return true;
    },
    tokenAsk: async (url, form) => { code = new URLSearchParams(form.toString()).get("code"); return answer({ id_token: jwt(gClaims(nonce)), refresh_token: "rt-1" }); },
    page: ok => ok ? "yes" : "no",
  };
  const got = await s.signinRun(io, G, DESK_KEY, () => NOW);
  await tick(50);
  return got.ok === true && code === "abc" && codes.join() === "400,400,200";
};
CASES.scopes = s => {
  const ms = s.SIGNIN_PROVIDERS.microsoft, g = s.SIGNIN_PROVIDERS.google, want = "openid profile offline_access";
  const scopeOf = p => new URL(s.signinAuthorize(p, 50000, DESK_KEY).url).searchParams.get("scope");
  const refresh = new URLSearchParams(s.signinRefreshForm(MS, "rt").toString()).get("scope");
  return s.GOOGLE_HD_NEEDS_EMAIL === false && ms.scope === want && ms.refreshScope === want && scopeOf(MS) === want && refresh === want
    && g.scope === "openid" && scopeOf(G) === "openid" && !/email/.test(JSON.stringify(s.SIGNIN_PROVIDERS));
};

/* ---- the quiet renewal ------------------------------------------------------------------------------------------------- */
const SEED = "6".repeat(64);
/* The keyring stood in as a visible wrapper, the provider's door as `reply`, the service's as `serve`. */
const renewIo = (reply, serve) => {
  const io = { asked: [], posted: [], keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""), sign: signWith(signKey),
    tokenAsk: async (url, form) => { io.asked.push({ url, form: new URLSearchParams(form.toString()) }); if (reply instanceof Error) throw reply; return reply; },
    serviceAsk: async (url, body) => { io.posted.push({ url, body }); if (serve instanceof Error) throw serve; return serve; } };
  return io;
};
const heldOf = over => Object.assign({ provider: "microsoft", refresh: "sealed:rt-1", sub: "sealed:s-1", seed: SEED, code: CODE, cert: cert(), at: 1, checked: 1,
  reached: true, said: "", ask: false }, over);
/* A refreshed token with no nonce and the seat's sub goes to signin/desk with no seed, signed by this desk's key, and the new
   certificate replaces the last. */
CASES.renewWrite = async s => {
  const plain = jwt(msClaims(undefined)), next = cert({ issued: NOW + 5, until: NOW + 5 + 30 * 86400000 });
  const io = renewIo(answer({ id_token: plain, refresh_token: "rt-2" }), answer({ ok: true, certificate: next, code: CODE }));
  const r = await s.signinRenewHeld(io, MS, DESK_KEY, heldOf(), () => NOW);
  const b = io.posted.length === 1 ? io.posted[0].body : {};
  return r.said === "renewed" && r.held.cert.issued === NOW + 5 && r.held.refresh === "sealed:rt-2" && r.held.sub === "sealed:s-1" && r.held.reached === true
    && io.asked.length === 1 && io.asked[0].form.get("grant_type") === "refresh_token" && io.asked[0].form.get("refresh_token") === "rt-1"
    && b.seed === undefined && b.idToken === plain && b.desk === DESK_KEY && io.posted[0].url === s.SIGNIN_SERVICE
    && crypto.verify(null, serviceBytes("microsoft", plain, DESK_KEY, b.t), signKey.publicKey, Buffer.from(b.sig, "hex"));
};
/* The provider's token for another sub, or another desk's nonce: nothing is posted, the refresh token is forgotten, the person asked. */
CASES.renewRefuse = async s => {
  const run = claims => { const io = renewIo(answer({ id_token: jwt(claims) }), answer({})); return s.signinRenewHeld(io, MS, DESK_KEY, heldOf(), () => NOW).then(r => [r, io]); };
  const [other, io1] = await run(Object.assign(msClaims(undefined), { sub: "s-2" }));
  const [theirs, io2] = await run(msClaims(serviceNonce(OTHER_DESK_KEY, SEED)));
  return other.said === "signin-other" && theirs.said === "signin-unbound" && [other, theirs].every(r => r.held.refresh === "" && r.held.ask === true
    && r.held.cert && r.held.code === CODE) && io1.posted.length === 0 && io2.posted.length === 0;
};
/* The provider or the service away, or the service refusing: the certificate, the code and the provider stay, the desk works on. */
CASES.renewFail = async s => {
  const plain = answer({ id_token: jwt(msClaims(undefined)) });
  const offline = await s.signinRenewHeld(renewIo(new Error("offline"), answer({})), MS, DESK_KEY, heldOf(), () => NOW);
  const away = await s.signinRenewHeld(renewIo(plain, new Error("offline")), MS, DESK_KEY, heldOf(), () => NOW);
  const busy = await s.signinRenewHeld(renewIo(plain, answer({ ok: false, reason: "unavailable" }, 503)), MS, DESK_KEY, heldOf(), () => NOW);
  const freed = await s.signinRenewHeld(renewIo(plain, answer({ ok: false, reason: "signin" }, 403)), MS, DESK_KEY, heldOf(), () => NOW);
  const kept = r => !!r.held.cert && r.held.code === CODE && r.held.provider === "microsoft";
  return offline.said === "signin-unreached" && kept(offline) && offline.held.reached === false && offline.held.refresh === "sealed:rt-1"
    && away.said === "unreached" && kept(away) && away.held.reached === false && busy.said === "unreached" && kept(busy)
    && freed.said === "signin" && kept(freed) && freed.held.refresh === "" && freed.held.ask === true;
};

/* ---- the renewal's wiring, evaluated with stand-ins for the shell around it --------------------------------------------- */
const WIRE_DECLS = ["const SIGNIN_RENEW_MS =", "const SIGNIN_FIRST_MS =", "async function signinRenewNow(", "function armSigninRenew("];
const WIRE_STANDS = ["harnessLaunch", "PLACED_ASIDE", "signinState", "signinOffered", "branchIdentity", "signinIo", "net", "signinRenewHeld",
  "signinSave", "tellSignin", "setTimeout", "stand"];
function loadWire(st, swap) {
  let text = WIRE_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let signinBusy = null, signinTimer = null;\nfunction signinFlush() { stand.flushes++; return true; }\n" + text
    + "\nreturn { signinRenewNow, armSigninRenew, SIGNIN_RENEW_MS, SIGNIN_FIRST_MS };";
  return new Function(...WIRE_STANDS, body)(...WIRE_STANDS.map(n => n === "stand" ? st : st[n]));
}
/* The shell around the renewal: Microsoft configured, this desk's identity, the doors answering `reply()` and `serve()`. Real time. */
function wireStand(s, reply, serve) {
  const st = { flushes: 0, saves: 0, tells: 0, asked: 0, posted: 0, offeredAsked: 0, timers: [], store: { held: null } };
  Object.assign(st, {
    harnessLaunch: () => false, PLACED_ASIDE: false,
    signinState: () => st.store, signinOffered: () => { st.offeredAsked++; return [MS]; }, branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }),
    signinIo: () => ({ keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""), sign: signWith(signKey),
      tokenAsk: async () => { st.asked++; return reply ? reply() : answer({}); }, serviceAsk: async () => { st.posted++; return serve ? serve() : answer({}); } }),
    net: { fetch: () => { throw new Error("no network in a leg"); } },
    signinRenewHeld: s.signinRenewHeld, signinSave: () => { st.saves++; }, tellSignin: () => { st.tells++; },
    setTimeout: (fn, ms) => { st.timers.push({ fn, ms }); return { unref() {} }; },
  });
  return st;
}
CASES.renewHarness = async (s, swap) => {
  const st = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())) }));
  st.harnessLaunch = () => true;
  st.store.held = heldOf();
  const said = await loadWire(st, swap).signinRenewNow();
  return said === "" && st.offeredAsked === 0 && st.asked === 0 && st.posted === 0 && st.saves === 0;
};
CASES.renewDaily = async (s, swap) => {
  const st = wireStand(s), w = loadWire(st, swap);
  st.store.held = heldOf();
  w.armSigninRenew();
  const first = st.timers.length === 1 ? st.timers[0].ms : -1;
  if (st.timers.length === 1) st.timers[0].fn();
  await tick(5);
  if (st.timers.length === 2) st.timers[1].fn();
  await tick(5);
  const later = st.timers.slice(1).map(t => t.ms);
  const h = wireStand(s);
  h.harnessLaunch = () => true;
  loadWire(h, swap).armSigninRenew();
  return w.SIGNIN_RENEW_MS === 24 * 60 * 60 * 1000 && first === w.SIGNIN_FIRST_MS && first > 0 && first <= 10 * 60 * 1000
    && later.join() === [w.SIGNIN_RENEW_MS, w.SIGNIN_RENEW_MS].join() && st.asked === 2 && h.timers.length === 0;
};
/* The wiring end to end: a renewal keeps the new certificate, writes it and tells the page; a provider no longer offered is never asked. */
CASES.renewWire = async (s, swap) => {
  const next = cert({ issued: Date.now(), until: Date.now() + 30 * 86400000 });
  const ok = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())), refresh_token: "rt-2" }), () => answer({ ok: true, certificate: next, code: CODE }));
  ok.store.held = heldOf();
  const said = await loadWire(ok, swap).signinRenewNow();
  const gone = wireStand(s, () => answer({}));
  gone.signinOffered = () => [];
  gone.store.held = heldOf();
  const saidGone = await loadWire(gone, swap).signinRenewNow();
  return said === "renewed" && ok.store.held.cert.issued === next.issued && ok.store.held.refresh === "sealed:rt-2" && ok.saves >= 1 && ok.tells >= 1
    && ok.flushes >= 2 && saidGone === "" && gone.asked === 0 && gone.posted === 0;
};

/* ---- the seat's write, evaluated with stand-ins: the folder, the team, the files ---------------------------------------- */
const FLUSH_DECLS = ["function signinTeamHere(", "function signinFlush("];
const FLUSH_STANDS = ["signinState", "branchIdentity", "pinnedLead", "teamJoin", "sharedFolderForWrite", "folderAnswers", "fs", "path", "writeReplacing",
  "seatFileText", "SEAT_NAME", "console"];
/* `st`: {held, lead, join, root, files (a Set of paths), writes}; the desk's flush as the wiring has it, its mark kept between calls. */
function loadFlush(s, st, swap) {
  let text = FLUSH_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the flush once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { signinState: () => ({ held: st.held }), branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }), pinnedLead: () => st.lead,
    sharedFolderForWrite: () => st.root, folderAnswers: () => true, path,
    fs: { existsSync: p => st.files.has(p), mkdirSync: () => {} }, writeReplacing: (p, t) => { st.files.add(p); st.writes.push({ p, t }); },
    seatFileText: s.seatFileText, SEAT_NAME: s.SEAT_NAME, console: { error() {} } };
  return new Function(...FLUSH_STANDS, "let signinWrote = \"\";\n" + text + "\nreturn signinFlush;")(...FLUSH_STANDS.map(n => n === "teamJoin" ? st.join : vals[n]));
}
/* A desk signed in before it asked to join a folder team writes its seat beside the request at once, as it does where its lead is
   pinned; a relay invitation's join and no team write nothing; the same certificate is written again where its file went or the
   folder changed, and not otherwise. */
CASES.flushJoin = async (s, swap) => {
  const held = heldOf(), seatAt = root => path.join(root, "desks", DESK_ID, s.SEAT_NAME);
  const run = (o, steps) => { const st = Object.assign({ held, lead: null, join: null, root: "/share/a", files: new Set(), writes: [] }, o); const f = loadFlush(s, st, swap);
    return steps(st, f); };
  const asking = run({ join: { team: TEAM } }, (st, f) => f() === true && st.writes.length === 1 && st.writes[0].p === seatAt("/share/a")
    && JSON.parse(st.writes[0].t).certificate.sig.value === held.cert.sig.value);
  const relay = run({ join: { team: TEAM, invite: { relay: { rt: "r" } } } }, (st, f) => f() === false && st.writes.length === 0);
  const none = run({}, (st, f) => f() === false && st.writes.length === 0);
  const pinned = run({ lead: { team: TEAM } }, (st, f) => {
    const first = f(), again = f();
    st.files.delete(seatAt("/share/a"));
    const gone = f();
    st.root = "/share/b";
    const moved = f();
    return first === true && again === false && gone === true && moved === true && st.writes.map(w => w.p).join() === [seatAt("/share/a"), seatAt("/share/a"), seatAt("/share/b")].join();
  });
  return asking && relay && none && pinned;
};
/* The flush's callers outside the wiring: a request to join written, and any join taken or finished or folder changed, deferred. */
CASES.flushCallers = () => {
  const ask = tryDeclText("function askJoin("), changed = tryDeclText("function catalogFolderChanged(");
  return /teamJoin = j;\n\s*joinTold = false;\n\s*persistDeskEnvelope\(\);\n\s*signinFlush\(\);\n\s*return joinView\(\);/.test(ask)
    && /if \(!theWindow \|\| theWindow\.isDestroyed\(\)\) return;\n[^\n]*\n\s*setImmediate\(\(\) => signinFlush\(\)\);\n\s*if \(catalogFolder\(\) === watchedFolder\) return;/.test(changed);
};
function tryDeclText(s) { try { return decl(MAIN, s); } catch { return ""; } }

/* ---- the page's door, imported ---------------------------------------------------------------------------------------- */
let P = null;
/* The page's words in English: node here may report another language, and the cases read the English source. */
try { (await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href)).lsSet("eUiLang", "en"); } catch { /* the cases fail alone */ }
try { P = await import(pathToFileURL(path.join(ROOT, "src", "modules", "signin.js")).href); } catch (e) { console.log("  (signin.js did not load: " + e.message + ")"); }
const view = o => P.signinRead(Object.assign({ offered: ["microsoft", "google"] }, o));
CASES.pageNone = () => !!P && P.signinDoor(P.signinRead(null)) === null && P.signinDoor(P.signinRead({ offered: [] })) === null
  && P.signinShown(P.signinRead({ offered: ["elsewhere"] })) === false;
CASES.pageMoments = () => {
  if (!P) return false;
  const m = o => { const d = P.signinDoor(view(o)); return d ? d.moment : ""; };
  const before = P.signinDoor(view({}));
  return before.moment === "before" && before.providers.join() === "microsoft,google" && m({ busy: "microsoft" }) === "waiting"
    && m({ said: "signin-notallowed" }) === "refused" && m({ said: "desks" }) === "refused" && m({ said: "signin-cancelled" }) === "before"
    && m({ signedIn: "microsoft", code: CODE, seat: "none" }) === "nolicence" && m({ signedIn: "microsoft", code: CODE, seat: "held" }) === "noteam"
    && m({ signedIn: "microsoft", code: CODE, seat: "held", refused: "full" }) === "noseat" && m({ signedIn: "microsoft", code: CODE, seat: "held", ask: true }) === "ask";
};
/* Two refusals told apart in their own words: the organisation at its provider, and no licence with a seat at our service. */
CASES.pageTwoRefusals = () => {
  if (!P) return false;
  const org = P.signinDoor(view({ said: "signin-notallowed" })), lic = P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "none" }));
  return /sign-in provider/.test(org.heading) && /No Etiuda licence has a seat/.test(lic.say[0]) && lic.code === CODE && org.heading !== lic.say[0];
};
/* Nothing from the provider is shown: the identity is the person's own name, the provider's name and the code. */
CASES.pageNothingFromProvider = () => {
  if (!P) return false;
  const p = P.signinParts(view({ signedIn: "google", code: CODE, seat: "held" }));
  return Object.keys(p).sort().join() === "code,initial,name,off,sub,team,teamName" && p.sub === "Signed in with Google" && p.code === CODE
    && P.signinCodeText(CODE) === "7K3M Q9TV 2XRB HN4W";
};

/* ---- the cases on the branch ------------------------------------------------------------------------------------------- */
const LEGS = [
  ["ds1a", "offered", "as shipped no client id is configured and nothing is offered; a configured table offers what it configures, in order"],
  ["ds1b", "noHintStart", "an invitation naming providers carries no sign-in hint: the team's start is retired"],
  ["ds2a", "pkce", "the authorize URL carries PKCE (S256 over the verifier), the state, the nonce and a 127.0.0.1 loopback, at the provider's own page"],
  ["ds2b", "nonceBound", "the nonce is the service's SHA-256 of its line, this desk's key and the seed, and is not another desk key's"],
  ["ds2c", "tokenNonce", "a token is taken only for this client and issuer, unexpired, carrying this desk's nonce; another key's nonce or none is unbound"],
  ["ds2d", "state", "a wrong or missing state is refused before anything else of the answer is read"],
  ["ds2e", "flow", "the whole path at the provider with stand-ins: the token's nonce is made again from this desk's key and the seed, no client secret sent"],
  ["ds2f", "notAllowed", "the organisation's refusal at the provider is its own reason, apart from the person's Cancel and any other refusal"],
  ["ds3a", "deskBody", "signin/desk's body has the interface's names alone, signed by this desk's key over the service's bytes; the seed on a first sign-in only"],
  ["ds3b", "serviceDoor", "the service's door posts JSON to signin/desk alone, no redirect, nothing cached, no cookie, nothing over 8 KiB"],
  ["ds3c", "answers", "the service's answers read as the interface names them; a certificate for another desk or code is not taken"],
  ["ds3d", "seatFile", "seat.json is {format: 2, desk, certificate}, the certificate whole and no token"],
  ["ds3e", "settle", "a refusal keeps the last certificate, a freed seat forgets the refresh token, a service away is only marked, none drops it"],
  ["ds3f", "lapse", "the calm lapse: lapsed once the kept certificate's until has passed, never with no certificate"],
  ["ds4b", "door", "the provider's door asks only its own token address, by POST, no redirect followed, nothing cached, no cookie"],
  ["ds4c", "keep", "the refresh token is sealed by a real keyring and never kept on Linux's basic_text"],
  ["ds4d", "loopOnce", "the loopback answers 404 to anything but GET /, answers the GET / it takes once, and then closes"],
  ["ds6a", "loopStray", "a GET / with no state or another state is answered 400 and ignored, and the reply with the state ends it"],
  ["ds6b", "loopFlow", "through signinRun on a real loopback, two strays leave the sign-in waiting and the browser's reply completes it"],
  ["ds6c", "scopes", "Microsoft is asked for openid profile offline_access at sign-in and refresh, Google for openid, email of nobody"],
  ["ds7a", "renewWrite", "a refreshed token with the seat's sub goes to signin/desk with no seed, signed by this desk's key, and the new certificate is kept"],
  ["ds7b", "renewRefuse", "another sub or another desk's nonce posts nothing, forgets the refresh token and asks the person"],
  ["ds7c", "renewFail", "the provider or the service away, or the service refusing, keeps the certificate and the code; a freed seat asks the person"],
  ["ds7d", "renewHarness", "signinRenewNow returns at once on a harness start, reading and asking nothing"],
  ["ds7e", "renewDaily", "the renewal runs once at each start, soon after the window, then daily by a named constant, and never from a harness start"],
  ["ds7f", "renewWire", "the wiring keeps and writes a renewed certificate and tells the page; a provider no longer offered is never asked"],
  ["ds8a", "pageNone", "the page draws no door where nothing is offered and nobody is signed in"],
  ["ds8b", "pageMoments", "the door's content follows the view: before, waiting, refused, no licence, no team, no seat, sign in again"],
  ["ds8c", "pageTwoRefusals", "the organisation's refusal at its provider and no licence at our service are two moments, each in its own words"],
  ["ds8d", "pageNothingFromProvider", "the identity is the person's own name, the provider's name and the code in fours, nothing from the provider"],
  ["ds9a", "flushJoin", "a desk signed in first writes its seat beside its request to join a folder team, and again where the file went or the folder changed"],
  ["ds9b", "flushCallers", "the seat is written when a request to join is written, and after a join taken or finished or a folder changed"],
];
for (let [id, name, line] of LEGS) {
  let ok = false;
  try { ok = await CASES[name](S); } catch (e) { ok = false; line += " (threw " + (e && e.message) + ")"; }
  check(ok, id + " " + line);
}

/* ---- the wiring and the page, as text ---------------------------------------------------------------------------------- */
const at = (text, s) => text.indexOf(s);
const handler = (() => { const a = at(WIRING, 'ipcMain.handle("etiuda:signin",'); return a < 0 ? "" : WIRING.slice(a, WIRING.indexOf("\n});", a)); })();
const tryDecl = s => { try { return decl(MAIN, s); } catch { return ""; } };
const renew = tryDecl("async function signinRenewNow(");
const armRenew = tryDecl("function armSigninRenew(");
check(!!handler && at(handler, "/* plant:signin-click */") > 0 && at(handler, "/* plant:signin-offered */") > at(handler, "/* plant:signin-click */")
  && at(handler, "signinRun(") > at(handler, "/* plant:signin-offered */") && /signinOffered\(\)\.find\(x => x\.id === id\)/.test(handler)
  && at(handler, "signinSeat(") > at(handler, "signinRun("),
  "ds4e the sign-in runs only for a trusted click on an offered provider's button, then posts to the service");
check(at(renew, "/* plant:renew-offered */") > 0 && at(renew, "signinRenewHeld(") > at(renew, "/* plant:renew-offered */") && /signinOffered\(\)\.find\(/.test(renew),
  "ds4f the quiet renewal sends nothing unless the provider it signed in with is still offered");
check(/if \(PLACED_ASIDE \|\| harnessLaunch\(\) \|\|/.test(armRenew) && /armNoteLook\(\);\n\s*armSigninRenew\(\);/.test(MAIN),
  "ds4g the renewal is armed once the window opens and never from the harness's own window or any harness start");
check(/openPage: url => signinPageOk\(url\) \?/.test(WIRING) && /if \(!run \|\| !run\.url \|\| !signinPageOk\(run\.url\)\) return false;/.test(WIRING)
  && (MAIN.match(/shell\.openExternal\(/g) || []).length === 3,
  "ds4h the browser is handed only a provider's own authorize page, at the sign-in and at Open the browser again");
check(/data-e-open="signin" data-e-provider=/.test(PAGE)
  && /eOpen === "signin"[\s\S]{0,40}\n\s*if \(b\) ipcRenderer\.sendSync\("etiuda:signin-click"/.test(PRELOAD),
  "ds4i the preload names a trusted click on a provider's button, and the page's provider buttons are the only ones it hears");
/* NOTHING LOCAL IS GATED: outside the section and its wiring, the shell names the sign-in at two places alone, neither of which
   decides anything: the require of its loopback and the arming of the renewal. */
function outsideNames(main) {
  let rest = main;
  try { rest = main.replace(between(main, HEAD, TAIL), ""); } catch { /* counted as found */ }
  return rest.match(/\b(?:signin(?:[A-Z]\w*)?|armSignin\w*|seat(?:Doc|Open|Genuine|Info|SignedBytes|FileText)|SEAT_\w+|SIGNIN_\w+)\b/g) || [];
}
const outside = outsideNames(MAIN);
/* And to write the seat after a request to join and a folder change (ds9b), which gates nothing. */
const expectOutside = ["signinListen", "armSigninRenew", "signinFlush", "signinFlush"];
check(outside.slice().sort().join() === expectOutside.slice().sort().join(),
  "ds5a nothing local is gated: outside its section the shell names the sign-in only to require its loopback, to arm the renewal and to write the seat after a join: " + outside.join(" "));
const modules = fs.readdirSync(path.join(ROOT, "src", "modules")).filter(n => n.endsWith(".js"));
const readers = modules.filter(n => /\bsignin(State|Stop|Out|Check|Again)\b|\bsignIn\(|onSignin/.test(fs.readFileSync(path.join(ROOT, "src", "modules", n), "utf8")));
check(readers.join() === "signin.js" && /function signinShown\(v\)\{ return !!\(v && \(v\.offered\.length \|\| v\.signedIn\)\); \}/.test(PAGE)
  && /if\(signinShown\(v\)\) groups\.push/.test(SETTINGS),
  "ds5b on the page only signin.js asks the shell, and with nothing offered neither the door nor Account's card is drawn: " + readers.join(","));
const require = createRequire(import.meta.url);
const syncer = require(path.join(ROOT, "shell", "folder", "syncer.cjs"));
check(syncer.isAllowedPath("desks/k-0123456789abcdef/seat.json") === true && syncer.isAllowedPath("desks/k-0123456789abcdef/seat.json.tmp") === false,
  "ds5c a folder team's mirror carries desks/<id>/seat.json to the share");
/* ACCOUNT: the agent's name moved there from General, Account first, and the team's sign-in row gone. */
const acctAt = SETTINGS.indexOf('{id:"account", icon:"user", name:t("Account")'), genAt = SETTINGS.indexOf('{id:"general", icon:"general"');
const general = (() => { const a = SETTINGS.indexOf("function generalGroups(){"); return a < 0 ? "" : SETTINGS.slice(a, SETTINGS.indexOf("\n}", a)); })();
const account = (() => { const a = SETTINGS.indexOf("function accountGroups(){"); return a < 0 ? "" : SETTINGS.slice(a, SETTINGS.indexOf("\n}", a)); })();
check(acctAt > 0 && genAt > acctAt && SETTINGS.lastIndexOf("{id:", acctAt - 1) < SETTINGS.indexOf("function settingsSections(){") && /row\("name","user",t\("Your name"\)/.test(account)
  && !/setAgentName/.test(general) && !/Team sign-in|signinRow|wireSigninRow/.test(SETTINGS),
  "ds5d Account is Settings' first section and holds the agent's name, which General no longer does; the team's sign-in row is gone");
check(/^\s*"Your name":/m.test(fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8")) && /id="setAgentName"/.test(account)
  && /const n=box\.querySelector\("#setAgentName"\)|box\.querySelector\("#setAgentName"\)/.test(SETTINGS),
  "ds5e the name field keeps its id and its wiring, so it is stored on the keystroke as before");

/* ---- the plants --------------------------------------------------------------------------------------------------------- */
if (!PLANTS_OFF) {
  const plant = async (id, swap, name, where) => {
    let red = false;
    try { const s = load(swap, where); red = !(await CASES[name](s)); } catch { red = true; }
    check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red");
  };
  await plant("dsp1", ["SIGNIN_CLIENT.test(t[id].clientId)) /* plant:offered-client */", "true)"], "offered");
  await plant("dsp2", ["  if (box) out.lead.box = box; /* plant:f6-box-read */", "  if (box) out.lead.box = box;\n  if (doc.signin) out.signin = doc.signin.providers;"], "noHintStart", "invite");
  await plant("dsp4", ["const challenge = signinB64url(crypto.createHash(\"sha256\").update(verifier).digest()); /* plant:pkce */", "const challenge = verifier;"], "pkce");
  await plant("dsp5", ["const nonce = signinNonce(deskKey, seed); /* plant:nonce-bound */", "const nonce = signinB64url(r(32));"], "nonceBound");
  await plant("dsp6", ["if (!renewal && (typeof c.nonce !== \"string\" || !signinSame(c.nonce, nonce))) return { ok: false, reason: \"signin-unbound\" }; /* plant:token-nonce */", ""], "tokenNonce");
  await plant("dsp7", ["if (!signinOurs(query, pending)) return { ok: false, reason: \"signin-state\" }; /* plant:state */", ""], "state");
  await plant("dsp8", ["return \"signin-notallowed\"; /* plant:not-allowed */", "return \"signin-refused\";"], "notAllowed");
  await plant("dsp9", ["const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t })) || \"\"); /* plant:desk-signed */",
    "const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t + 1 })) || \"\");"], "deskBody");
  await plant("dsp10", ["if (seed) body.seed = String(seed); /* plant:seed-first */", "body.seed = String(seed);"], "deskBody");
  await plant("dsp11", ["if (String(url) !== SIGNIN_SERVICE) throw new Error(\"the desk's sign-in is posted to the licence service's signin/desk only\"); /* plant:service-host */", ""], "serviceDoor");
  await plant("dsp12", ["&& String(c.desk) === String(deskKey) && /^[0-9a-f]{64}$/.test(String(c.person)) && SIGNIN_CODE.test(String(c.code)) /* plant:cert-desk */",
    "&& /^[0-9a-f]{64}$/.test(String(c.person)) && SIGNIN_CODE.test(String(c.code))"], "answers");
  await plant("dsp13", ["    refresh: freed ? \"\" : held.refresh }); /* plant:settle-freed */", "    refresh: held.refresh });"], "settle");
  await plant("dsp15", ["return !!held && !!held.cert && now >= held.cert.until; /* plant:lapse-until */", "return !!held && !!held.cert && now >= held.cert.until + 86400000;"], "lapse");
  await plant("dsp16", ["if (!Object.keys(SIGNIN_PROVIDERS).some(id => SIGNIN_PROVIDERS[id].token === u)) throw new Error(\"a token is asked only at a provider's own token address\"); /* plant:door-host */", ""], "door");
  await plant("dsp17", ["body: form, redirect: \"error\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined }); /* plant:door-redirect */",
    "body: form, redirect: \"follow\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined });"], "serviceDoor");
  await plant("dsp18", ["if (!token || !sealsForReal(storage, platform)) return \"\"; /* plant:keep-real */", "if (!token) return \"\";"], "keep");
  await plant("dsp19", ["      shut();\n      caughtYes(query);", "      caughtYes(query);"], "loopOnce");
  await plant("dsp20", ["if (!ours) { res.writeHead(400, { \"content-type\": \"text/html; charset=utf-8\", \"cache-control\": \"no-store\" }); res.end(page); return; } /* plant:loop-state */", ""], "loopStray");
  await plant("dsp21", ["const GOOGLE_HD_NEEDS_EMAIL = false; /* plant:scope-email */", "const GOOGLE_HD_NEEDS_EMAIL = true;"], "scopes");
  await plant("dsp22", ["const ans = await signinSeat(io, p.id, deskKey, got.idToken, \"\", now); /* plant:renew-seedless */",
    "const ans = await signinSeat(io, p.id, deskKey, got.idToken, held.seed, now);"], "renewWrite");
  await plant("dsp23", ["reached: lost ? held.reached : false }), said: got.reason }; /* plant:renew-ask */", "reached: held.reached }), said: got.reason };"], "renewFail");
  const plantWire = async (id, swap, name) => {
    let red = false;
    try { red = !(await CASES[name](S, swap)); } catch { red = true; }
    check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red");
  };
  await plantWire("dsp24", ["  if (harnessLaunch()) return \"\"; /* plant:renew-now-harness */\n", ""], "renewHarness");
  await plantWire("dsp25", ["const SIGNIN_RENEW_MS = 24 * 60 * 60 * 1000; /* plant:renew-daily */", "const SIGNIN_RENEW_MS = 55 * 60 * 1000;"], "renewDaily");
  await plantWire("dsp26", ["if (!p || !me) return \"\"; /* plant:renew-offered */", "if (!me) return \"\";"], "renewWire");
  await plantWire("dsp27", ["return !!teamJoin && !(teamJoin.invite && teamJoin.invite.relay); /* plant:flush-asking */", "return false;"], "flushJoin");
  await plantWire("dsp28", ["if (signinWrote === mark && fs.existsSync(file)) return false; /* plant:flush-mark */", "if (signinWrote === cert.sig.value) return false;"], "flushJoin");
  /* A gate on a local act, put into the desk file's write in memory, is seen. */
  const gated = MAIN.replace("function writeBranch(stem, text) {\n", "function writeBranch(stem, text) {\n  if (!signinView().signedIn) return { ok: false };\n");
  check(gated !== MAIN && outsideNames(gated).slice().sort().join() !== expectOutside.slice().sort().join(),
    "dsp14 plant a sign-in gate on the desk file's write turns ds5a red");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + " plants=" + (PLANTS_OFF ? 0 : PLANTS));
if (asserted !== EXPECTED) { console.log("FAIL the run made " + asserted + " checks of " + EXPECTED + ": it did not complete"); failed++; }
console.log(failed ? "desk-signin: " + failed + " failed" : "desk-signin: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
