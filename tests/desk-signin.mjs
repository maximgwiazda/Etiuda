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
 *
 * THE SIGN-IN PREVIEW (ds12): ETIUDA_SIGNIN_PREVIEW=1 draws the door and Account with both providers while none has a client id.
 * Its press is driven through the shell's own click and sign-in handlers, sliced, with every door out stood in and counted.
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
const PLANTS = 43;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 58 + (PLANTS_OFF ? 0 : PLANTS);

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
  "signinSettle", "signinRenewHeld", "seatFileText", "SEAT_NAME", "signinFileRead", "signinFileText", "branchIdOf", "inviteRead",
  "SIGNOUT_SERVICE", "signoutDeskBytes", "signoutDeskBody", "signoutAsk", "signinDoorRequest", "signinKnown", "signinPreviewing"];
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
/* The service's bytes for the desk's sign-out, written here from the interface: its line `etiuda-licence-signout-desk`, then the
   desk's public half and t, one a line. */
const serviceOutBytes = (desk, t) => Buffer.from("etiuda-licence-signout-desk\n" + [desk, t].join("\n"), "utf8");
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
const WIRE_DECLS = ["const SIGNIN_RENEW_MS =", "const SIGNIN_FIRST_MS =", "async function signinRenewNow(", "function armSigninRenew(", "function signinOutNow("];
const WIRE_STANDS = ["harnessLaunch", "PLACED_ASIDE", "signinState", "signinOffered", "branchIdentity", "signinIo", "net", "signinRenewHeld",
  "signinSave", "tellSignin", "setTimeout", "pinnedLead", "signinTeamHere", "fs", "path", "sharedFolderForWrite", "SEAT_NAME", "signinView", "signoutAsk", "stand"];
function loadWire(st, swap) {
  let text = WIRE_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let signinBusy = stand.busy || null, signinTimer = null, signinWrote = \"kept\", signinSaid = \"\";\nfunction signinFlush() { stand.flushes++; return true; }\n" + text
    + "\nreturn { signinRenewNow, armSigninRenew, SIGNIN_RENEW_MS, SIGNIN_FIRST_MS, signinOutNow: typeof signinOutNow === \"undefined\" ? undefined : signinOutNow,"
    + " wrote: () => signinWrote, said: () => signinSaid };";
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
    pinnedLead: () => false, signinTeamHere: () => false, fs, path, sharedFolderForWrite: () => "", SEAT_NAME: "seat.json", signoutAsk: s.signoutAsk,
    signinView: () => ({ offered: [], signedIn: st.store.held ? "microsoft" : "" }),
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
/* The other two ways a desk signed in first comes to a team folder reach catalogFolderChanged, and so the flush: a folder invitation
   taken (its join set, then the folder changed) and an admission heeded (finishJoin, its join cleared and the lead now pinned).
   `swap` is put into the shell's text in memory, as a plant does. */
CASES.flushJoinReach = (s, swap) => {
  let main = MAIN;
  if (swap) {
    if (main.split(swap[0]).length !== 2) throw new Error("plant anchor not in the shell once: " + swap[0]);
    main = main.replace(swap[0], swap[1]);
  }
  const text = d => { try { return decl(main, d); } catch { return ""; } };
  const invite = text("async function takeInvite("), finish = text("function finishJoin(");
  const after = (body, set) => { const at = body.lastIndexOf(set); return at >= 0 && /\n\s*catalogFolderChanged\(\);/.test(body.slice(at)); };
  return after(invite, "\n  teamJoin = j;\n") && /\n\s*return view;\n\}$/.test(invite)
    && after(finish, "\n  teamJoin = null;\n") && /\n\s*catalogFolderChanged\(\);[^\n]*\n[^\n]*\n\s*return true;\n\}$/.test(finish);
};

/* ---- the relay's standing door, from the desk (board 980, A4) ----------------------------------------------------------- */
const DOOR_ID = "f".repeat(32), LEAD_BOX = "d".repeat(64), DESK_BOX = "e".repeat(64), RT = "a0".repeat(16);
/* The engine's own request rules, read from the shell as Studio reads them from its pin (src/engine.mjs joinRulesFrom). */
const JOIN_LIB = (() => {
  try {
    const text = ["const SEALED_TEAM_RE =", "const JOIN_PREFIX =", "const JOIN_KIND =", "const JOIN_HEX_RE =", "const SPKI_ED25519 =",
      "function canonJson(", "function signedBytesOf(", "function joinHash(", "function joinCommit(", "function joinSignedBytes(",
      "function joinGenuine(", "function branchIdOf(", "function memberRequestDoc("].map(d => decl(MAIN, d)).join("\n");
    return new Function("crypto", "Buffer", text + "\nreturn { joinGenuine, joinSignedBytes, joinCommit, memberRequestDoc, JOIN_KIND };")(crypto, Buffer);
  } catch (e) { console.log("  (the request rules did not load: " + e.message + ")"); return null; }
})();
const doorBase = () => ({ format: 1, kind: "etiuda-join", team: TEAM, desk: { id: DESK_ID, key: DESK_KEY, box: DESK_BOX }, date: new Date(NOW).toISOString(),
  commit: "1".repeat(64) });
/* The request at the door carries the seat as seat.json has it and the relay's id, beside the request's own fields, and names no
   invitation; nothing where the id is not the relay's, the request names an invitation, or the certificate is another desk's or ran out. */
CASES.doorRequest = s => {
  const c = cert(), base = doorBase(), d = s.signinDoorRequest(base, DESK_ID, DESK_KEY, c, DOOR_ID, NOW);
  const kept = !!d && Object.keys(base).every(k => JSON.stringify(d[k]) === JSON.stringify(base[k]));
  return kept && d.door === DOOR_ID && JSON.stringify(d.seat) === JSON.stringify(JSON.parse(s.seatFileText(DESK_ID, c))) && d.seat.format === 2
    && d.seat.desk === DESK_ID && d.invite === undefined && base.seat === undefined && base.door === undefined
    && s.signinDoorRequest(base, DESK_ID, DESK_KEY, c, DOOR_ID.slice(1), NOW) === null
    && s.signinDoorRequest(base, DESK_ID, DESK_KEY, c, DOOR_ID.toUpperCase(), NOW) === null
    && s.signinDoorRequest(Object.assign({ invite: { id: "2".repeat(16), proof: "3".repeat(64) } }, base), DESK_ID, DESK_KEY, c, DOOR_ID, NOW) === null
    && s.signinDoorRequest(base, DESK_ID, OTHER_DESK_KEY, c, DOOR_ID, NOW) === null
    && s.signinDoorRequest(base, DESK_ID, DESK_KEY, c, DOOR_ID, c.until) === null
    && s.signinDoorRequest(base, DESK_ID, DESK_KEY, null, DOOR_ID, NOW) === null;
};
const DOOR_DECLS = ["function signinDoorInvite(", "function signinDoorKept("];
const DOOR_STANDS = ["teamJoin", "signinState", "branchIdentity", "signinCertOk", "signinDoorRequest", "persistDeskEnvelope", "memberRequestDoc",
  "writeJoin", "fs", "path", "Date", "console"];
/* `st`: {join, held, files (a Map of path to text), writes, persists}; the door's two wiring functions with stand-ins, the request
   signed by this desk's key as writeJoin signs it. */
function loadDoor(s, st, swap) {
  let text = DOOR_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the door's wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { teamJoin: st.join, signinState: () => ({ held: st.held }), branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY, box: DESK_BOX }),
    signinCertOk: s.signinCertOk, signinDoorRequest: s.signinDoorRequest, persistDeskEnvelope: () => { st.persists++; },
    memberRequestDoc: JOIN_LIB.memberRequestDoc,
    writeJoin: (doc, at) => {
      doc.sig = { alg: "Ed25519", keyId: DESK_ID };
      doc.sig.value = crypto.sign(null, JOIN_LIB.joinSignedBytes(doc), signKey.privateKey).toString("hex");
      const t = JSON.stringify(doc, null, 1) + "\n";
      st.files.set(at, t);
      st.writes.push({ at, doc });
      return t;
    },
    fs: { readFileSync: p => { if (!st.files.has(p)) throw new Error("ENOENT"); return st.files.get(p); } }, path,
    Date: { now: () => NOW }, console: { error() {} } };
  return new Function(...DOOR_STANDS, text + "\nreturn { signinDoorInvite, signinDoorKept };")(...DOOR_STANDS.map(n => vals[n]));
}
const doorJoin = over => ({ team: TEAM, nonce: "4".repeat(64), commit: "1".repeat(64), asked: NOW, held: 0, name: "Desk",
  invite: { relay: Object.assign({ rt: RT, url: "https://relay.example.test", door: true, box: LEAD_BOX }, over) } });
const doorStand = (join, held) => ({ join: join, held: held === undefined ? heldOf() : held, files: new Map(), writes: [], persists: 0 });
/* The channel's invite() for a join at the door: the certificate and the lead's box, the relay's id once named; no knock without a
   certificate of this desk that stands; another join (an invitation's, another team's or relay's) is not the door's to answer. */
CASES.doorInvite = (s, swap) => {
  const ask = (join, held, team, rt) => loadDoor(s, doorStand(join, held), swap).signinDoorInvite(team || TEAM, rt || RT);
  const first = ask(doorJoin()), named = ask(doorJoin({ inv: DOOR_ID })), c = heldOf().cert;
  const invitation = { team: TEAM, invite: { id: "2".repeat(16), relay: { rt: RT, inv: "5".repeat(32), token: "x", seal: "y" } } };
  return !!first && JSON.stringify(first.door) === JSON.stringify(c) && first.box === LEAD_BOX && first.inv === undefined && Object.keys(first).join() === "door,box"
    && !!named && named.inv === DOOR_ID
    && ask(doorJoin(), null) === null && ask(doorJoin(), Object.assign(heldOf(), { cert: null })) === null
    && ask(doorJoin(), Object.assign(heldOf(), { cert: cert({ desk: OTHER_DESK_KEY }) })) === null
    && ask(doorJoin(), Object.assign(heldOf(), { cert: cert({ until: NOW }) })) === null
    && ask(doorJoin({ box: "short" })) === null && ask(doorJoin(), undefined, TEAM, "9".repeat(32)) === null
    && ask(invitation) === undefined && ask(doorJoin(), undefined, "t-fedcba9876543210") === undefined && ask(null) === undefined;
};
/* The relay named the id: kept with the join, and the request written once into the mirror, with the seat and that id, signed by
   this desk as the engine's own rules (and Studio's, through its pin) take it; the same id again writes nothing, a request being
   withdrawn is left alone, and nothing is written without a certificate. */
CASES.doorKept = (s, swap) => {
  if (!JOIN_LIB) return false;
  const mirror = path.join("/relay", RT), at = path.join(mirror, "desks", DESK_ID, "join.json");
  const st = doorStand(doorJoin()), w = loadDoor(s, st, swap);
  const wrote = w.signinDoorKept(TEAM, mirror, DOOR_ID), again = w.signinDoorKept(TEAM, mirror, DOOR_ID);
  const doc = st.writes.length ? JSON.parse(st.files.get(at)) : null;
  const good = !!doc && JOIN_LIB.joinGenuine(doc, DESK_ID) && doc.door === DOOR_ID && doc.invite === undefined && doc.team === TEAM
    && doc.commit === st.join.commit && doc.desk.box === DESK_BOX && doc.seat && doc.seat.desk === DESK_ID
    && JSON.stringify(doc.seat.certificate) === JSON.stringify(heldOf().cert);
  /* A seat changed after signing is no longer the desk's own request. */
  const forged = doc ? JOIN_LIB.joinGenuine(Object.assign({}, doc, { seat: Object.assign({}, doc.seat, { desk: "k-0000000000000000" }) }), DESK_ID) : true;
  const once = wrote === true && again === false && st.writes.length === 1 && st.writes[0].at === at && st.join.invite.relay.inv === DOOR_ID && st.persists === 1;
  const quiet = (join, held, id) => { const q = doorStand(join, held); const r = loadDoor(s, q, swap).signinDoorKept(TEAM, mirror, id || DOOR_ID); return r === false && q.writes.length === 0; };
  return good && !forged && once
    && quiet(doorJoin({ withdrawing: true })) && quiet(doorJoin({ withdrawn: true })) && quiet(doorJoin(), null) && quiet(doorJoin(), undefined, "zz")
    && quiet({ team: TEAM, invite: { relay: { rt: RT, inv: "5".repeat(32), token: "x" } } }) && quiet(null);
};
/* The relay channel on a desk is given both: the door's invite() ahead of the invitation's reading, and onDoor. */
CASES.doorChannel = (s, swap) => {
  let main = MAIN;
  if (swap) {
    if (main.split(swap[0]).length !== 2) throw new Error("plant anchor not in the shell once: " + swap[0]);
    main = main.replace(swap[0], swap[1]);
  }
  let run = "";
  try { run = decl(main, "function relayRun("); } catch { run = ""; }
  return /\n    invite: \(\) => \{\n[^\n]*\n\s*const door = signinDoorInvite\(team, want\.rt\);[^\n]*\n\s*if \(door !== undefined\) return door;\n\s*const j = teamJoin/.test(run)
    && /\n    onDoor: id => \{ signinDoorKept\(team, mirror, id\); \},/.test(run);
};

/* ---- the desk's Sign out at the service --------------------------------------------------------------------------------- */
/* signout/desk's body has the interface's three names alone, signed by this desk's key over the service's bytes. */
CASES.signoutBody = s => {
  const t = NOW, b = s.signoutDeskBody(DESK_KEY, t, signWith(signKey)), bytes = serviceOutBytes(DESK_KEY, t);
  const ok = !!b && crypto.verify(null, bytes, signKey.publicKey, Buffer.from(b.sig, "hex")) && !crypto.verify(null, bytes, otherKey.publicKey, Buffer.from(b.sig, "hex"));
  return ok && Object.keys(b).join() === "desk,t,sig" && b.desk === DESK_KEY && b.t === t && s.signoutDeskBytes({ desk: DESK_KEY, t: t }).equals(bytes)
    && s.SIGNOUT_SERVICE === "https://etiuda.dev/licence/v1/signout/desk"
    && s.signoutDeskBody("short", t, signWith(signKey)) === null && s.signoutDeskBody(DESK_KEY, 1.5, signWith(signKey)) === null
    && s.signoutDeskBody(DESK_KEY, t, () => "") === null;
};
/* The shell around the Sign out: a desk signed in with Microsoft configured, the service's door standing in, `serve()` its answer. */
function outStand(s, serve) {
  const st = wireStand(s);
  st.store.held = heldOf();
  st.sent = [];
  st.signinIo = () => ({ sign: signWith(signKey), serviceAsk: (url, body) => {
    st.sent.push({ url, body, heldThen: !!st.store.held });
    return serve ? serve() : answer({ ok: true });
  } });
  return st;
}
/* Sign out posts exactly one signout/desk, three names, a fresh t, a signature that verifies, before the local sign-in is cleared. */
CASES.signoutPost = async (s, swap) => {
  const st = outStand(s), w = loadWire(st, swap);
  const before = Date.now(), view = w.signinOutNow(), after = Date.now();
  await tick(5);
  const x = st.sent[0] || {}, b = x.body || {};
  return st.sent.length === 1 && x.url === s.SIGNOUT_SERVICE && /\/signout\/desk$/.test(String(x.url)) && Object.keys(b).join() === "desk,t,sig" && b.desk === DESK_KEY
    && b.t >= before && b.t <= after && crypto.verify(null, serviceOutBytes(DESK_KEY, b.t), signKey.publicKey, Buffer.from(b.sig, "hex"))
    && x.heldThen === true && st.store.held === null && st.saves === 1 && st.tells === 1 && !!view && view.signedIn === "" && w.wrote() === "";
};
/* The service away or refusing changes nothing here: the sign-in is cleared, nothing new is said, nothing is left unhandled. */
CASES.signoutAway = async (s, swap) => {
  const serves = [() => { throw new Error("offline"); }, () => Promise.reject(new Error("offline")), () => answer({ ok: false, reason: "unavailable" }, 503),
    () => answer({ ok: false, reason: "signin" }, 403), () => ({ status: 200, bytes: Buffer.from("<html>") })];
  let every = true;
  for (const serve of serves) {
    const st = outStand(s, serve), w = loadWire(st, swap);
    const view = w.signinOutNow();
    await tick(5);
    every = every && st.sent.length === 1 && st.store.held === null && st.saves === 1 && st.tells === 1 && !!view && view.signedIn === "" && w.said() === "" && w.wrote() === "";
  }
  return every;
};
/* Nothing is sent where no client id is configured, the desk was never signed in, or it has no identity, or on a harness start; the
   sign-in is cleared all the same, except while a sign-in is in the browser, which Sign out leaves alone as before. */
CASES.signoutNone = async (s, swap) => {
  const run = async (tune) => { const st = outStand(s); tune(st); const w = loadWire(st, swap); const view = w.signinOutNow(); await tick(5); return { st, view }; };
  const noClient = await run(st => { st.signinOffered = () => []; });
  const never = await run(st => { st.store.held = null; });
  const noId = await run(st => { st.branchIdentity = () => null; });
  const harness = await run(st => { st.harnessLaunch = () => true; });
  const busy = await run(st => { st.busy = { provider: "microsoft" }; });
  const cleared = r => r.st.sent.length === 0 && r.st.store.held === null && !!r.view;
  return cleared(noClient) && cleared(never) && cleared(noId) && cleared(harness) && busy.st.sent.length === 0 && busy.st.store.held !== null && busy.st.saves === 0;
};
/* The same door carries signout/desk and nothing else of the service's: its address, no redirect, nothing cached, no cookie. */
CASES.signoutDoor = async s => {
  const calls = [];
  const fetchFn = async (u, init) => { calls.push({ u, init }); return { status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from("{\"ok\":true}") }; };
  let refused = 0;
  for (const u of ["https://etiuda.dev/licence/v1/signout", "https://evil.example.test/licence/v1/signout/desk", "http://etiuda.dev/licence/v1/signout/desk",
    "https://etiuda.dev/licence/v1/signout/desk?x=1"]) {
    try { await s.signinServiceAsk(fetchFn, u, { a: 1 }); } catch { refused++; }
  }
  const before = calls.length;
  const res = await s.signinServiceAsk(fetchFn, s.SIGNOUT_SERVICE, { desk: DESK_KEY });
  const init = calls.length ? calls[calls.length - 1].init : {};
  return refused === 4 && before === 0 && calls.length === 1 && calls[0].u === "https://etiuda.dev/licence/v1/signout/desk" && res.status === 200
    && init.method === "POST" && init.redirect === "error" && init.cache === "no-store" && init.credentials === "omit"
    && init.headers["content-type"] === "application/json" && JSON.parse(init.body.toString()).desk === DESK_KEY;
};

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

/* ---- the sign-in preview (ds12) ----------------------------------------------------------------------------------------- */
const PREVIEW_LINE = "Preview only. Sign-in is not set up yet, so nothing here is sent.";
const PREVIEW_PRESSED = "Sign-in is not set up yet, so nothing was sent. This is a preview.";
const PREVIEW_LINE_PL = "Tylko podgląd. Logowanie nie jest jeszcze uruchomione, więc nic stąd nie zostanie wysłane.";
const PREVIEW_PRESSED_PL = "Logowanie nie jest jeszcze uruchomione, więc nic nie wysłano. To tylko podgląd.";
/* The section loaded under ETIUDA_SIGNIN_PREVIEW `v` (null: absent), `swap` put in the section where its anchor is. */
function loadEnv(v, swap) {
  const was = process.env.ETIUDA_SIGNIN_PREVIEW;
  if (v === null) delete process.env.ETIUDA_SIGNIN_PREVIEW; else process.env.ETIUDA_SIGNIN_PREVIEW = v;
  try { return load(swap && SECTION.split(swap[0]).length === 2 ? swap : null); }
  finally { if (was === undefined) delete process.env.ETIUDA_SIGNIN_PREVIEW; else process.env.ETIUDA_SIGNIN_PREVIEW = was; }
}
/* An IPC statement of the wiring, from its first line to its closing "});". */
function ipcSlice(start) {
  const a = WIRING.indexOf("\n" + start);
  return a < 0 ? "" : WIRING.slice(a + 1, WIRING.indexOf("\n});", a) + 4);
}
/* The view and the two handlers a press goes through, over the section `sec`, every door out stood in and counted: the identity
   (which may make the desk's key), the browser and loopback (signinIo), the provider (signinRun), the service, a write, the network. */
const PRESS_STANDS = ["ipcMain", "fromEngine", "LINK_CLICK_MS", "signinState", "signinLapsed", "signinOffered", "signinPreviewing", "signinKnown",
  "SIGNIN_PROVIDERS", "branchIdentity", "net", "signinIo", "signinRun", "signinSeat", "signinTake", "signinFlush", "signinSave", "tellSignin"];
function pressStand(sec, swap) {
  const st = { on: {}, handle: {}, out: 0, tells: 0 };
  const viewDecl = (() => { try { return decl(MAIN, "function signinView("); } catch { return ""; } })();
  let text = [viewDecl, ipcSlice('ipcMain.on("etiuda:signin-click"'), ipcSlice('ipcMain.handle("etiuda:signin",')].join("\n");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const out = () => { st.out++; throw new Error("a door out was reached"); };
  const body = "let signinClick = null, signinBusy = null, signinSaid = \"\";\n" + text + "\nreturn { view: signinView };";
  const r = new Function(...PRESS_STANDS, body)({ on: (ch, fn) => { st.on[ch] = fn; }, handle: (ch, fn) => { st.handle[ch] = fn; } }, () => true, 2000,
    () => ({ held: null }), sec.signinLapsed, sec.signinOffered, sec.signinPreviewing, sec.signinKnown, sec.SIGNIN_PROVIDERS,
    () => { st.out++; return { id: DESK_ID, key: DESK_KEY }; }, { fetch: out }, out, out, out, out, out, out, () => { st.tells++; });
  st.view = r.view;
  st.press = async id => {
    const e = { returnValue: undefined };
    st.on["etiuda:signin-click"](e, id);
    try { return await st.handle["etiuda:signin"]({}, id); } catch (err) { st.out++; return null; }
  };
  return st;
}
/* Off by default: absent, "0", "yes" or " 1", nothing is offered and nothing is a preview; "1" alone offers both as a preview. */
CASES.previewOff = (s, swap) => {
  const seen = [null, "0", "yes", " 1", "1"].map(v => { const sec = loadEnv(v, swap), w = pressStand(sec, swap).view(); return JSON.stringify([w.offered, w.preview]); });
  return seen.slice(0, 4).every(x => x === "[[],false]") && seen[4] === '[["microsoft","google"],true]';
};
/* Inert with real ids: the section with Microsoft's client id filled in, the variable set, offers Microsoft alone and no preview, and a
   press of Google is the ordinary "not offered", nothing reached; the decision alone: asked, and nothing configured. */
CASES.previewInert = (s, swap) => {
  const anchor = 'microsoft: Object.freeze({ clientId: "",';
  if (SECTION.split(anchor).length !== 2) return false;
  const keep = SECTION;
  let real = null, withId = null;
  try {
    real = loadEnv("1", swap);
    SECTION = keep.replace(anchor, 'microsoft: Object.freeze({ clientId: "' + MS_CLIENT + '",');
    withId = loadEnv("1", swap);
  } finally { SECTION = keep; }
  const st = pressStand(withId, swap), w = st.view();
  return real.signinPreviewing(true, configured(real)) === false && real.signinPreviewing(true) === true && real.signinPreviewing(false) === false
    && withId.signinPreviewing() === false && JSON.stringify([w.offered, w.preview]) === '[["microsoft"],false]'
    && st.press("google").then(v => !!v && v.said === "signin-none" && st.out === 0);
};
/* Nothing reaches out: a trusted press of either provider is answered "signin-preview" before the identity, the browser, the
   loopback, the provider, the service, a write or the network; an untrusted press and an unknown provider are not the preview's. */
CASES.previewPress = async (s, swap) => {
  const st = pressStand(loadEnv("1", swap), swap);
  const untrusted = await st.handle["etiuda:signin"]({}, "microsoft");
  const ms = await st.press("microsoft"), g = await st.press("google"), odd = await st.press("elsewhere");
  return !!untrusted && untrusted.said === "" && !!ms && ms.said === "signin-preview" && ms.busy === "" && ms.preview === true
    && !!g && g.said === "signin-preview" && !!odd && odd.said === "signin-none" && st.out === 0 && st.tells >= 2;
};
/* Visibly a preview: the line in the door's content in every moment the preview reaches and in Account's card, the press's line as
   the door's heading; none of it without the preview; Polish too. */
CASES.previewPage = async () => {
  if (!P) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const SET = await import(pathToFileURL(path.join(ROOT, "src", "modules", "settings.js")).href);
  const word = v => { const d = P.signinDoor(P.signinRead(v)); return d ? d : {}; };
  /* Account drawn as settings.js draws it, over a host answering the view and a document that holds nothing (desk-first-edition's). */
  const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
  const acct = v => {
    globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: { signinState: () => v } };
    globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
      body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
    try { return SET.settingsPageHtml("account", ""); } finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
  };
  const on = { offered: ["microsoft", "google"], preview: true }, off = { offered: ["microsoft", "google"] };
  const before = word(on), pressed = word(Object.assign({}, on, { said: "signin-preview" })), plain = word(off);
  const a = acct(on), aPressed = acct(Object.assign({}, on, { said: "signin-preview" })), aOff = acct(off);
  const html = typeof P.signinPreviewHtml === "function" ? P.signinPreviewHtml(P.signinRead(on)) : "";
  storage.lsSet("eUiLang", "pl");
  let pl = {}, plA = "";
  try { pl = word(Object.assign({}, on, { said: "signin-preview" })); plA = acct(on); } finally { storage.lsSet("eUiLang", "en"); }
  return before.moment === "before" && before.preview === PREVIEW_LINE && pressed.moment === "refused" && pressed.heading === PREVIEW_PRESSED
    && !pressed.line && pressed.preview === PREVIEW_LINE && plain.preview === undefined && P.signinRead({ offered: [], preview: true }).preview === false
    && /data-signin-preview/.test(html) && html.indexOf(PREVIEW_LINE) >= 0
    && /data-signin-preview/.test(a) && a.indexOf(PREVIEW_LINE) >= 0 && aPressed.indexOf(PREVIEW_PRESSED) >= 0 && aPressed.indexOf(PREVIEW_LINE) >= 0
    && !/data-signin-preview/.test(aOff) && /data-e-open="signin" data-e-provider="google"/.test(aOff)
    && pl.heading === PREVIEW_PRESSED_PL && pl.preview === PREVIEW_LINE_PL && plA.indexOf(PREVIEW_LINE_PL) >= 0;
};
/* Not shipped: tools/signin-preview.cmd is outside electron-builder's files; read, never run (run, it starts the installed desk):
   per-user first, then all-users, the variable set once for that one start, no setx, no registry. */
CASES.previewCmd = () => {
  const { minimatch } = createRequire(import.meta.url)("minimatch");
  const cfgText = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8"), fa = cfgText.indexOf("files: [");
  const files = fa < 0 ? [] : new Function("return " + cfgText.slice(fa + 7, cfgText.indexOf("],", fa) + 1))();
  const shipped = p => { let inc = false; for (const pat of files) { const neg = pat.startsWith("!"); if (minimatch(p, neg ? pat.slice(1) : pat, { dot: true })) inc = !neg; } return inc; };
  const at = path.join(ROOT, "tools", "signin-preview.cmd"), text = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : "";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^rem\b/i.test(l) && l !== "@echo off");
  const ORDER = ["setlocal", 'set "EXE=%LOCALAPPDATA%\\Programs\\Etiuda\\Etiuda.exe"', 'if not exist "%EXE%" set "EXE=%ProgramFiles%\\Etiuda\\Etiuda.exe"',
    'if not exist "%EXE%" exit /b 1', 'if /i "%~1"=="--where" exit /b 0', 'set "ETIUDA_SIGNIN_PREVIEW=1"', 'start "" "%EXE%"', "endlocal"];
  const idx = ORDER.map(s => lines.indexOf(s));
  return !!text && files.length > 5 && shipped("shell/main.js") && shipped("engine/etiuda.html") && !shipped("tools/release.mjs")
    && !shipped("tools/signin-preview.cmd") && idx.every((i, k) => i >= 0 && (k === 0 || i > idx[k - 1]))
    && lines.filter(l => /(^|[&|(]\s*)start\s/i.test(l)).length === 1 && lines.filter(l => /ETIUDA_SIGNIN_PREVIEW/.test(l)).length === 1
    && !lines.some(l => /\b(setx|reg)\b/i.test(l));
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
  ["ds9a", "signoutBody", "signout/desk's body has the interface's three names alone, signed by this desk's key over the service's bytes"],
  ["ds9b", "signoutPost", "Sign out posts exactly one signout/desk, the three names, a fresh t and a signature that verifies, before the sign-in is cleared"],
  ["ds9c", "signoutAway", "with the service unreached, throwing or answering 503 or a refusal, Sign out still clears the sign-in and says nothing new"],
  ["ds9d", "signoutNone", "no signout/desk is sent where no client id is configured or the desk was never signed in; a sign-in in the browser is left alone"],
  ["ds9e", "signoutDoor", "the service's door carries signout/desk at its own address alone, no redirect, nothing cached, no cookie"],
  ["ds10a", "flushJoin", "a desk signed in first writes its seat beside its request to join a folder team, and again where the file went or the folder changed"],
  ["ds10b", "flushCallers", "the seat is written when a request to join is written, and after a join taken or finished or a folder changed"],
  ["ds10c", "flushJoinReach", "a folder invitation taken and an admission heeded both reach the folder change, and so the seat's write"],
  ["ds11a", "doorRequest", "a request at the relay's door carries the seat as seat.json has it and the relay's id, and names no invitation"],
  ["ds11b", "doorInvite", "the channel knocks at the door with this desk's standing certificate and the lead's box, and with nothing else"],
  ["ds11c", "doorKept", "the id the relay names is kept and the request written once, with the seat and that id, signed as the desk's own"],
  ["ds11d", "doorChannel", "the desk's relay channel is given the door's invite() ahead of the invitation's, and onDoor"],
  ["ds12a", "previewOff", "the sign-in preview is off by default: ETIUDA_SIGNIN_PREVIEW absent, \"0\", \"yes\" or \" 1\" offers nothing; \"1\" alone offers both as a preview"],
  ["ds12b", "previewInert", "the preview changes nothing where a provider has a client id: that one offered, no preview, another provider's press the ordinary not offered"],
  ["ds12c", "previewPress", "in the preview a trusted press of either provider is answered signin-preview with no identity, browser, loopback, provider, service, write or request"],
  ["ds12d", "previewPage", "the preview's line stands in the door's content and Account's card, the press's line as the heading, none without the preview; Polish too"],
  ["ds12e", "previewCmd", "tools/signin-preview.cmd is outside the packaged files and starts the installed desk, per-user first, with the variable for that start alone"],
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
const outNow = tryDecl("function signinOutNow(");
const outHandler = (() => { const a = at(WIRING, 'ipcMain.handle("etiuda:signin-out",'); return a < 0 ? "" : WIRING.slice(a, WIRING.indexOf("\n});", a)); })();
check(!!outHandler && /^ipcMain\.handle\("etiuda:signin-out", \(e\) => \{\n  if \(!fromEngine\(e\)\) return null;\n  return signinOutNow\(\);/.test(outHandler)
  && at(outNow, "signoutAsk(") > 0 && at(outNow, "signoutAsk(") < at(outNow, "s.held = null;"),
  "ds9f Sign out is answered for the engine's own frame alone, and the desk's place is freed at the service before the sign-in is cleared");
check(!!handler && at(handler, "/* plant:signin-click */") > 0 && at(handler, "/* plant:signin-offered */") > at(handler, "/* plant:signin-click */")
  && at(handler, "signinRun(") > at(handler, "/* plant:signin-offered */") && /signinOffered\(\)\.find\(x => x\.id === id\)/.test(handler)
  && at(handler, "signinSeat(") > at(handler, "signinRun("),
  "ds4e the sign-in runs only for a trusted click on an offered provider's button, then posts to the service");
check(at(renew, "/* plant:renew-offered */") > 0 && at(renew, "signinRenewHeld(") > at(renew, "/* plant:renew-offered */") && /signinOffered\(\)\.find\(/.test(renew),
  "ds4f the quiet renewal sends nothing unless the provider it signed in with is still offered");
check(/if \(PLACED_ASIDE \|\| harnessLaunch\(\) \|\|/.test(armRenew) && /armNoteLook\(\);\n\s*armSigninRenew\(\);/.test(MAIN),
  "ds4g the renewal is armed once the window opens and never from the harness's own window or any harness start");
check(/openPage: url => signinPageOk\(url\) \?/.test(WIRING) && /if \(!run \|\| !run\.url \|\| !signinPageOk\(run\.url\)\) return false;/.test(WIRING)
  && (MAIN.match(/shell\.openExternal\(/g) || []).length === 1 && /function handOut\(url\) \{ return shell\.openExternal\(url\); \}/.test(MAIN)
  && /signinPageOk\(url\) \? Promise\.resolve\(handOut\(url\)\)/.test(WIRING) && /plant:again-page \*\/\n  handOut\(run\.url\);/.test(WIRING),
  "ds4h the browser is handed only a provider's own authorize page, at the sign-in and at Open the browser again, through the shell's one way out (handOut, the call tests/links.js stubs)");
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
/* And to write the seat after a request to join and a folder change (ds10b), and to knock at a relay team's door with the
   certificate and write the request there (ds11d), none of which gates anything. */
const expectOutside = ["signinListen", "armSigninRenew", "signinFlush", "signinFlush", "signinDoorInvite", "signinDoorKept"];
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
  await plant("dsp11", ["if (String(url) !== SIGNIN_SERVICE && String(url) !== SIGNOUT_SERVICE) throw new Error(\"the licence service's door takes signin/desk and signout/desk only\"); /* plant:service-host */", ""], "serviceDoor");
  await plant("dsp27", ["if (String(url) !== SIGNIN_SERVICE && String(url) !== SIGNOUT_SERVICE) throw new Error(\"the licence service's door takes signin/desk and signout/desk only\"); /* plant:service-host */", ""], "signoutDoor");
  await plant("dsp28", ["const SIGNOUT_DESK_LINE = \"etiuda-licence-signout-desk\"; /* plant:signout-line */", "const SIGNOUT_DESK_LINE = \"etiuda-licence-signin-desk\";"], "signoutBody");
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
  await plantWire("dsp29", ["signoutAsk(signinIo({ loop: null }), me.key, Date.now); /* plant:signout-post */", ""], "signoutPost");
  await plantWire("dsp30", ["&& signinOffered().length) { /* plant:signout-offered */", ") {"], "signoutNone");
  await plantWire("dsp31", ["return !!teamJoin && !(teamJoin.invite && teamJoin.invite.relay); /* plant:flush-asking */", "return false;"], "flushJoin");
  await plantWire("dsp32", ["if (signinWrote === mark && fs.existsSync(file)) return false; /* plant:flush-mark */", "if (signinWrote === cert.sig.value) return false;"], "flushJoin");
  await plantWire("dsp33", ["  catalogFolderChanged(); /* plant:invite-folder-changed */\n", ""], "flushJoinReach");
  await plantWire("dsp34", ["  catalogFolderChanged(); /* plant:finish-join-watched */\n", ""], "flushJoinReach");
  await plant("dsp35", ["if (!signinCertOk(cert, deskKey) || !(cert.until > now)) return null; /* plant:door-cert */", "if (!signinCertOk(cert, deskKey)) return null;"], "doorRequest");
  await plant("dsp36", ["return Object.assign({}, doc, { seat: JSON.parse(seatFileText(deskId, cert)), door: String(door) }); /* plant:door-fields */",
    "return Object.assign({}, doc, { seat: JSON.parse(seatFileText(deskId, cert)) });"], "doorRequest");
  await plantWire("dsp37", ["|| !signinCertOk(cert, me.key) || !(cert.until > Date.now())) return null; /* plant:door-invite-cert */", ") return null;"], "doorInvite");
  await plantWire("dsp38", ["if (inv.inv !== id) { inv.inv = id; persistDeskEnvelope(); } /* plant:door-kept */", ""], "doorKept");
  await plantWire("dsp39", ["if (had && had.door === id) return false; /* plant:door-once */", ""], "doorKept");
  await plantWire("dsp40", ["      const door = signinDoorInvite(team, want.rt); /* plant:door-invite */\n      if (door !== undefined) return door;\n", ""], "doorChannel");
  await plantWire("dsp41", ["    onDoor: id => { signinDoorKept(team, mirror, id); }, /* plant:door-on */\n", ""], "doorChannel");
  await plantWire("dsp42", ["return (asked === undefined ? SIGNIN_PREVIEW_ASKED : asked) === true && signinOffered(table).length === 0; /* plant:preview-inert */",
    "return (asked === undefined ? SIGNIN_PREVIEW_ASKED : asked) === true;"], "previewInert");
  await plantWire("dsp43", ["if (!p && signinPreviewing() && signinKnown(id)) { signinSaid = \"signin-preview\"; tellSignin(); return signinView(); } /* plant:preview-press */", ""], "previewPress");
  await plantWire("dsp44", ["const SIGNIN_PREVIEW_ASKED = process.env.ETIUDA_SIGNIN_PREVIEW === \"1\"; /* plant:preview-asked */",
    "const SIGNIN_PREVIEW_ASKED = process.env.ETIUDA_SIGNIN_PREVIEW !== undefined;"], "previewOff");
  /* A gate on a local act, put into the desk file's write in memory, is seen. */
  const gated = MAIN.replace("function writeBranch(stem, text) {\n", "function writeBranch(stem, text) {\n  if (!signinView().signedIn) return { ok: false };\n");
  check(gated !== MAIN && outsideNames(gated).slice().sort().join() !== expectOutside.slice().sort().join(),
    "dsp14 plant a sign-in gate on the desk file's write turns ds5a red");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + " plants=" + (PLANTS_OFF ? 0 : PLANTS));
if (asserted !== EXPECTED) { console.log("FAIL the run made " + asserted + " checks of " + EXPECTED + ": it did not complete"); failed++; }
console.log(failed ? "desk-signin: " + failed + " failed" : "desk-signin: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
