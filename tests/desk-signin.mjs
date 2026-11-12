/* The desk's sign-in (board 980, stages 3 and H): the hint a team names, the browser path with PKCE and a nonce bound to the
 * desk's own key, a loopback that waits for its own state, the scopes, desks/<id>/seat.json sealed to the lead's box and signed
 * by the desk, the quiet renewal that rewrites it daily and at each start, nothing where no hint stands, and nothing local
 * gated on any of it. Bare node, no window, no provider reached: the one socket is the loopback on 127.0.0.1.
 *
 *     node tests/desk-signin.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE SHELL'S HALF IS SLICED, as tests/update-offer.mjs slices the version note: the sign-in's section of shell/main.js, from
 * its heading to its wiring, evaluated with the few declarations it reaches (the HPKE seal, the canonical bytes, the keyring
 * judgement) sliced from the same file. inviteRead is sliced too, with stand-ins for the folder and place readers it calls.
 * The wiring and the page are read as text: where they ask for the offer, and that nothing else reads the sign-in.
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
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 23;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 32 + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the slices ------------------------------------------------------------------------------------------------------- */
const HEAD = "/* ---- the desk's sign-in (board 980, stage 3)";
const WIRE = "\n/* The sign-in's wiring:";
const TAIL = "\n/* An IPC message is answered only for the engine's own top frame.";
function between(src, a, b) {
  const at = src.indexOf(a), end = src.indexOf(b, at);
  if (at < 0 || end < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return src.slice(at, end);
}
const SECTION = between(MAIN, HEAD, WIRE);
const WIRING = between(MAIN, WIRE, TAIL);
/* A top-level declaration, from its first line to its closing brace at column 0, or its one line. */
function decl(src, start) {
  const at = src.indexOf("\n" + start);
  if (at < 0 || src.indexOf("\n" + start, at + 1) >= 0) throw new Error("not in shell/main.js once: " + start);
  if (/^const /.test(start)) return src.slice(at + 1, src.indexOf("\n", at + 1));
  const end = src.indexOf("\n}", at + 1);
  return src.slice(at + 1, end + 2);
}
const NEEDS = ["const SPKI_ED25519 =", "const SEALED_TEAM_RE =", "const HPKE_KEM =", "const HPKE_SUITE =", "const SPKI_X25519 =",
  "function hpkeLabeledExtract(", "function hpkeLabeledExpand(", "function hpkeX25519Public(", "function hpkeShared(", "function hpkeSchedule(",
  "function hpkeSeal(", "function hpkeOpen(", "function canonJson(", "function signedBytesOf(", "const LINUX_KEYRINGS =",
  "function sealsForReal(", "function branchIdOf("].map(s => decl(MAIN, s)).join("\n");
const INVITE = ["const INVITE_HIDDEN_RE =", "function inviteRead(", "function inviteRelay("].map(s => decl(MAIN, s)).join("\n");
const NAMES = ["SIGNIN_PROVIDERS", "signinHint", "signinOffer", "signinNonce", "signinAuthorize", "signinPageOk", "signinBack", "signinTokens",
  "signinRequest", "signinListen", "signinRun", "signinRenew", "signinKeep", "signinKept", "seatDoc", "seatGenuine", "seatOpen",
  "seatSignedBytes", "SEAT_PREFIX", "SEAT_LABEL", "SEAT_NAME", "signinFileRead", "signinFileText", "hpkeSeal", "hpkeOpen", "canonJson", "branchIdOf", "inviteRead",
  "GOOGLE_HD_NEEDS_EMAIL", "signinRefreshForm", "signinRenewHeld"];
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
const S = load();

/* ---- the stand-ins ---------------------------------------------------------------------------------------------------- */
const b64url = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const MS_CLIENT = "00001111-aaaa-2222-bbbb-333344445555", G_CLIENT = "123456789012-abcdefghij.apps.googleusercontent.com";
const TENANT = "aaaabbbb-0000-1111-2222-ccccddddeeee";
const HINT = { signin: { providers: [
  { id: "microsoft", issuer: "https://login.microsoftonline.com/{tenantid}/v2.0", clientId: MS_CLIENT, allow: [TENANT] },
  { id: "google", issuer: "https://accounts.google.com", clientId: G_CLIENT, allow: "personal" },
  { id: "elsewhere", issuer: "https://id.example.test", clientId: "abcdefgh-0000", allow: "personal" },
  { id: "google", issuer: "https://accounts.google.com", clientId: "second-of-one-id-0000", allow: "personal" }] } };
const signKey = crypto.generateKeyPairSync("ed25519"), otherKey = crypto.generateKeyPairSync("ed25519");
const rawPub = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const DESK_KEY = rawPub(signKey.publicKey), OTHER_DESK_KEY = rawPub(otherKey.publicKey), DESK_ID = S.branchIdOf(DESK_KEY);
const box = crypto.generateKeyPairSync("x25519"), wrongBox = crypto.generateKeyPairSync("x25519");
const BOX = rawPub(box.publicKey);
const TEAM = "t-0123456789abcdef";
/* An ID token of the documented shape (Microsoft's and Google's claims), unsigned: the desk reads claims and never a signature. */
function jwt(claims) { return b64url(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })) + "." + b64url(JSON.stringify(claims)) + "." + b64url(crypto.randomBytes(64)); }
const NOW = Date.UTC(2026, 10, 11, 23, 0, 0);
/* A nonce of undefined leaves the claim out, as a refreshed token may. */
const msClaims = (nonce, at) => ({ iss: "https://login.microsoftonline.com/" + TENANT + "/v2.0", aud: MS_CLIENT, tid: TENANT, oid: "o-1", sub: "s-1",
  iat: (at || NOW) / 1000, exp: (at || NOW) / 1000 + 3600, nonce: nonce });
const gClaims = nonce => ({ iss: "https://accounts.google.com", aud: G_CLIENT, sub: "1001", email_verified: true, iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: nonce });
const answer = (obj, status) => ({ status: status || 200, bytes: Buffer.from(JSON.stringify(obj)) });
/* The service's own making of the nonce, written here from the line it names, not from the desk's function. */
const serviceNonce = (key, seed) => crypto.createHash("sha256").update("etiuda-licence-signin-nonce\n" + key + "\n" + seed).digest("hex");
const signWith = k => bytes => crypto.sign(null, bytes, k.privateKey).toString("hex");
const LEAD_KEY_ID = "studio-0123456789abcdef";

/* ---- cases, each a function of the loaded section so a plant reads the same case again ------------------------------ */
const CASES = {};
CASES.hint = s => {
  const h = s.signinHint(HINT);
  return h.length === 2 && h[0].id === "microsoft" && h[0].clientId === MS_CLIENT && h[1].id === "google" && h[1].clientId === G_CLIENT
    && h[1].allow === "personal" && s.signinHint({}).length === 0 && s.signinHint({ signin: { providers: [{ id: "google", clientId: "x" }] } }).length === 0
    && s.signinHint({ signin: { providers: [{ id: "google", issuer: "https://id.example.test", clientId: G_CLIENT }] } }).length === 0
    && s.signinHint({ signin: { providers: [{ id: "elsewhere", clientId: G_CLIENT }] } }).length === 0;
};
CASES.inviteHint = s => {
  const doc = { team: TEAM, folder: "\\\\server\\share\\team", secret: "0".repeat(32), lead: { keyId: "studio-1", public: "a".repeat(64), name: "Lead" } };
  const enc = d => "etiuda-join:" + b64url(JSON.stringify(d));
  const withHint = s.inviteRead(enc(Object.assign({}, doc, HINT)), false), without = s.inviteRead(enc(doc), false);
  return !!withHint && Array.isArray(withHint.signin) && s.signinHint({ signin: { providers: withHint.signin } }).map(p => p.id).join() === "microsoft,google"
    && !!without && without.signin === undefined && s.inviteRead(enc(Object.assign({}, doc, { signin: { providers: "x" } })), false).signin === undefined;
};
CASES.offer = s => {
  const teamDoc = Object.assign({ id: TEAM }, HINT), bare = { id: TEAM };
  const hints = {}; hints[TEAM] = HINT.signin.providers;
  return s.signinOffer(teamDoc, {}, TEAM).length === 2 && s.signinOffer(null, hints, TEAM).length === 2
    && s.signinOffer(bare, hints, TEAM).length === 0 && s.signinOffer(null, hints, "t-ffffffffffffffff").length === 0
    && s.signinOffer(null, {}, "").length === 0;
};
CASES.pkce = s => {
  const p = s.signinHint(HINT)[1], r = s.signinAuthorize(p, 51234, DESK_KEY);
  const u = new URL(r.url), q = u.searchParams;
  const challenge = b64url(crypto.createHash("sha256").update(r.verifier).digest());
  return u.origin + u.pathname === "https://accounts.google.com/o/oauth2/v2/auth" && q.get("client_id") === G_CLIENT
    && q.get("response_type") === "code" && q.get("redirect_uri") === "http://127.0.0.1:51234" && q.get("code_challenge") === challenge
    && q.get("code_challenge_method") === "S256" && q.get("state") === r.state && r.state.length >= 43 && /^[A-Za-z0-9_-]{43,128}$/.test(r.verifier)
    && q.get("nonce") === r.nonce && /openid/.test(q.get("scope")) && s.signinPageOk(r.url) && !s.signinPageOk("https://accounts.google.example/o/oauth2/v2/auth?x=1");
};
CASES.nonceBound = s => {
  const p = s.signinHint(HINT)[0], r = s.signinAuthorize(p, 50000, DESK_KEY);
  return /^[0-9a-f]{64}$/.test(r.seed) && r.nonce === serviceNonce(DESK_KEY, r.seed) && r.nonce !== serviceNonce(OTHER_DESK_KEY, r.seed);
};
CASES.tokenNonce = s => {
  const p = s.signinHint(HINT)[0], seed = "1".repeat(64), mine = serviceNonce(DESK_KEY, seed), theirs = serviceNonce(OTHER_DESK_KEY, seed);
  const ok = s.signinTokens(answer({ id_token: jwt(msClaims(mine)), refresh_token: "r1" }), p, mine, NOW);
  const other = s.signinTokens(answer({ id_token: jwt(msClaims(theirs)) }), p, mine, NOW);
  const none = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { nonce: undefined })) }), p, mine, NOW);
  const aud = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { aud: "someone-else-0000" })) }), p, mine, NOW);
  const iss = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { iss: "https://login.microsoftonline.com/other/v2.0" })) }), p, mine, NOW);
  const old = s.signinTokens(answer({ id_token: jwt(Object.assign(msClaims(mine), { exp: NOW / 1000 - 3600 })) }), p, mine, NOW);
  return ok.ok === true && ok.refreshToken === "r1" && other.reason === "signin-unbound" && none.reason === "signin-unbound"
    && aud.reason === "signin-token" && iss.reason === "signin-token" && old.reason === "signin-token";
};
CASES.state = s => {
  const pending = { state: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ" };
  return s.signinBack("state=" + pending.state + "&code=c1", pending).ok === true && s.signinBack("state=wrong&code=c1", pending).reason === "signin-state"
    && s.signinBack("code=c1", pending).reason === "signin-state" && s.signinBack("state=" + pending.state + "&error=access_denied", pending).reason === "signin-cancelled";
};
/* The whole path with the browser, the loopback and the provider stood in: the token that comes back carries the nonce the
   service makes again from this desk's key and the seed, and only from this desk's key. */
CASES.flow = async s => {
  const p = s.signinHint(HINT)[1];
  let asked = null;
  const io = {
    listen: async pageFor => { let yes; const caught = new Promise(a => { yes = a; }); return { port: 49999, caught, close: () => {}, give: q => { pageFor(q); yes(q); } }; },
    openPage: async url => { const q = new URL(url).searchParams; io.loopQ = "state=" + encodeURIComponent(q.get("state")) + "&code=abc"; io.nonce = q.get("nonce"); return true; },
    tokenAsk: async (url, form) => { asked = { url, form: new URLSearchParams(form.toString()) }; return answer({ id_token: jwt(gClaims(io.nonce)), refresh_token: "rt-1" }); },
    page: () => "",
  };
  const listen = io.listen;
  io.listen = async pageFor => { const l = await listen(pageFor); setTimeout(() => l.give(io.loopQ), 5); return l; };
  const got = await s.signinRun(io, p, DESK_KEY, () => NOW);
  const c = got.ok ? JSON.parse(Buffer.from(got.idToken.split(".")[1], "base64").toString()) : {};
  return got.ok === true && c.nonce === serviceNonce(DESK_KEY, got.seed) && c.nonce !== serviceNonce(OTHER_DESK_KEY, got.seed)
    && !!asked && asked.url === "https://oauth2.googleapis.com/token" && asked.form.get("grant_type") === "authorization_code"
    && /^[A-Za-z0-9_-]{43,128}$/.test(asked.form.get("code_verifier") || "") && asked.form.get("client_secret") === null && got.refreshToken === "rt-1";
};
CASES.seatShape = s => {
  const token = jwt(gClaims("n")), seed = "2".repeat(64);
  const doc = s.seatDoc(BOX, TEAM, LEAD_KEY_ID, DESK_ID, token, seed, signWith(signKey));
  const text = JSON.stringify(doc);
  return !!doc && Object.keys(doc).join() === "format,desk,sealed,sig" && doc.format === 1 && doc.desk === DESK_ID
    && Object.keys(doc.sealed).join() === "kind,team,keyId,enc,ct" && doc.sealed.kind === "etiuda-seat-sealed" && doc.sealed.team === TEAM
    && doc.sealed.keyId === LEAD_KEY_ID && Object.keys(doc.sig).join() === "alg,keyId,value" && doc.sig.alg === "Ed25519"
    && doc.sig.keyId === DESK_ID && text.indexOf(token.split(".")[1]) < 0 && text.indexOf(seed) < 0 && s.SEAT_NAME === "seat.json";
};
/* Opened here with the HPKE rules the leg slices and the info the lead's reader names, not with the desk's own opener alone. */
CASES.seatSealed = s => {
  const token = jwt(gClaims("n")), seed = "3".repeat(64);
  const doc = s.seatDoc(BOX, TEAM, LEAD_KEY_ID, DESK_ID, token, seed, signWith(signKey));
  if (!doc) return false;
  const info = Buffer.from("etiuda-seat-lead\n" + TEAM + "\n" + DESK_ID, "utf8");
  const pt = s.hpkeOpen(box.privateKey, Buffer.from(doc.sealed.enc, "hex"), info, Buffer.alloc(0), Buffer.from(doc.sealed.ct, "hex"));
  const inner = pt ? JSON.parse(pt.toString("utf8")) : {};
  const opened = s.seatOpen(box.privateKey, doc, TEAM);
  return inner.idToken === token && inner.seed === seed && Object.keys(inner).join() === "idToken,seed" && !!opened && opened.idToken === token
    && s.seatOpen(wrongBox.privateKey, doc, TEAM) === null && s.seatOpen(box.privateKey, doc, "t-fedcba9876543210") === null;
};
/* The signed bytes written here from the line list the lead's reader names. */
CASES.seatSigned = s => {
  const doc = s.seatDoc(BOX, TEAM, LEAD_KEY_ID, DESK_ID, jwt(gClaims("n")), "4".repeat(64), signWith(signKey));
  if (!doc) return false;
  const c = doc.sealed;
  const bytes = Buffer.from("etiuda-desk-seat\n" + [doc.format, doc.desk, c.kind, c.team, c.keyId, c.enc, c.ct].join("\n"), "utf8");
  const verified = crypto.verify(null, bytes, signKey.publicKey, Buffer.from(doc.sig.value, "hex"));
  const changed = JSON.parse(JSON.stringify(doc));
  changed.sealed.ct = (changed.sealed.ct[0] === "0" ? "1" : "0") + changed.sealed.ct.slice(1);
  const moved = JSON.parse(JSON.stringify(doc));
  moved.sealed.keyId = "studio-other";
  return verified && s.seatGenuine(doc, DESK_KEY) && !s.seatGenuine(changed, DESK_KEY) && !s.seatGenuine(moved, DESK_KEY)
    && !s.seatGenuine(doc, OTHER_DESK_KEY) && s.seatDoc(BOX, TEAM, LEAD_KEY_ID, DESK_ID, "t", "4".repeat(64), () => "") === null;
};
/* No hint, no sign-in: nothing is opened, listened on or sent. */
CASES.noHint = async s => {
  const touched = [];
  const io = { listen: async () => { touched.push("listen"); return { port: 1, caught: new Promise(() => {}), close: () => {} }; },
    openPage: async () => { touched.push("open"); return true; }, tokenAsk: async () => { touched.push("token"); return answer({}); }, page: () => "" };
  const offered = s.signinOffer(null, {}, "");
  const got = await s.signinRun(io, offered[0], DESK_KEY, () => NOW);
  const renewed = await s.signinRenew(io, offered[0], DESK_KEY, "rt", "5".repeat(64), "s-1", () => NOW);
  return offered.length === 0 && got.reason === "signin-none" && renewed.reason === "signin-ask" && touched.length === 0;
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
/* The loopback answers the GET of "/" it takes and closes; a second asker finds nothing listening. */
CASES.loopOnce = async s => {
  const loop = await s.signinListen(http, q => "page " + q.length, 10000, stateIs("a"));
  const stray = await get(loop.port, "/favicon.ico");
  const first = await get(loop.port, "/?state=a&code=b");
  const query = await loop.caught.catch(() => null);
  await new Promise(r => setTimeout(r, 50));
  const again = await get(loop.port, "/?state=a&code=b");
  loop.close();
  return stray === 404 && first === 200 && query === "state=a&code=b" && again !== 200 && again !== 404;
};
/* A GET of "/" with no state, and one with another state, are answered and ignored; the reply carrying the state ends it. */
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
/* The same through signinRun on a real loopback: two strays first, then the browser's reply, and the code exchanged is the reply's. */
CASES.loopFlow = async s => {
  const p = s.signinHint(HINT)[1], codes = [];
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
  const got = await s.signinRun(io, p, DESK_KEY, () => NOW);
  await tick(50);
  return got.ok === true && code === "abc" && codes.join() === "400,400,200";
};
/* Microsoft is asked for openid, profile and offline_access, at sign-in and refresh; Google for openid; email of nobody. */
CASES.scopes = s => {
  const ms = s.SIGNIN_PROVIDERS.microsoft, g = s.SIGNIN_PROVIDERS.google, want = "openid profile offline_access";
  const scopeOf = i => new URL(s.signinAuthorize(s.signinHint(HINT)[i], 50000, DESK_KEY).url).searchParams.get("scope");
  const refresh = new URLSearchParams(s.signinRefreshForm(s.signinHint(HINT)[0], "rt").toString()).get("scope");
  return s.GOOGLE_HD_NEEDS_EMAIL === false && ms.scope === want && ms.refreshScope === want && scopeOf(0) === want && refresh === want
    && g.scope === "openid" && scopeOf(1) === "openid" && !/email/.test(JSON.stringify(s.SIGNIN_PROVIDERS));
};

/* ---- the quiet renewal ------------------------------------------------------------------------------------------------- */
const SEED = "6".repeat(64);
/* The keyring stood in as a visible wrapper, and the provider's door as `reply` (an answer, or an Error thrown). */
const vaultIo = reply => {
  const io = { asked: [], keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""),
    tokenAsk: async (url, form) => { io.asked.push({ url, form: new URLSearchParams(form.toString()) }); if (reply instanceof Error) throw reply; return reply; } };
  return io;
};
const heldOf = over => Object.assign({ team: TEAM, provider: "microsoft", refresh: "sealed:rt-1", sub: "sealed:s-1", seed: SEED, at: 1, ask: false }, over);
const kept = (r, h) => !r.proof && r.held.ask === true && r.held.team === h.team && r.held.provider === h.provider && r.held.seed === h.seed && r.held.sub === h.sub;
/* A refreshed token with no nonce and the seat's sub is written, with the first sign-in's seed, into a seat.json the lead opens. */
CASES.renewWrite = async s => {
  const p = s.signinHint(HINT)[0], plain = jwt(msClaims(undefined)), held = heldOf();
  const io = vaultIo(answer({ id_token: plain, refresh_token: "rt-2" }));
  const r = await s.signinRenewHeld(io, p, DESK_KEY, held, () => NOW);
  const doc = r.proof ? s.seatDoc(BOX, TEAM, LEAD_KEY_ID, DESK_ID, r.proof.idToken, r.proof.seed, signWith(signKey)) : null;
  const opened = doc ? s.seatOpen(box.privateKey, doc, TEAM) : null;
  const bound = jwt(msClaims(serviceNonce(DESK_KEY, SEED)));
  const r2 = await s.signinRenewHeld(vaultIo(answer({ id_token: bound })), p, DESK_KEY, heldOf(), () => NOW);
  const f = io.asked.length === 1 ? io.asked[0].form : new URLSearchParams();
  return r.said === "renewed" && !!r.proof && r.proof.idToken === plain && r.proof.seed === SEED && r.proof.team === TEAM
    && !!opened && opened.idToken === plain && opened.seed === SEED && s.seatGenuine(doc, DESK_KEY)
    && r.held.refresh === "sealed:rt-2" && r.held.sub === "sealed:s-1" && r.held.ask === false && r.held.at === NOW && r.held.seed === SEED
    && held.refresh === "sealed:rt-1" && f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "rt-1"
    && r2.said === "renewed" && !!r2.proof && r2.proof.idToken === bound && r2.held.refresh === "sealed:rt-1";
};
/* Another sub, another desk's nonce, or no nonce with no sub kept to compare: nothing written, the refresh token forgotten. */
CASES.renewRefuse = async s => {
  const p = s.signinHint(HINT)[0], run = (claims, over) => s.signinRenewHeld(vaultIo(answer({ id_token: jwt(claims) })), p, DESK_KEY, heldOf(over), () => NOW);
  const other = await run(Object.assign(msClaims(undefined), { sub: "s-2" }));
  const otherBound = await run(Object.assign(msClaims(serviceNonce(DESK_KEY, SEED)), { sub: "s-2" }));
  const theirs = await run(msClaims(serviceNonce(OTHER_DESK_KEY, SEED)));
  const unsure = await run(msClaims(undefined), { sub: "" });
  const fresh = s.signinTokens(answer({ id_token: jwt(msClaims(undefined)) }), p, serviceNonce(DESK_KEY, SEED), NOW);
  return other.said === "signin-other" && otherBound.said === "signin-other" && theirs.said === "signin-unbound" && unsure.said === "signin-unbound"
    && [other, otherBound, theirs].every(r => kept(r, heldOf()) && r.held.refresh === "") && kept(unsure, heldOf({ sub: "" }))
    && fresh.reason === "signin-unbound";
};
/* The provider refusing, the network failing or the provider busy: nothing written, everything held stays, the calm state set; the
   refresh token is forgotten only where the provider no longer takes it. */
CASES.renewFail = async s => {
  const p = s.signinHint(HINT)[0], held = heldOf();
  const refused = await s.signinRenewHeld(vaultIo(answer({ error: "invalid_grant" }, 400)), p, DESK_KEY, held, () => NOW);
  const offline = await s.signinRenewHeld(vaultIo(new Error("offline")), p, DESK_KEY, held, () => NOW);
  const busy = await s.signinRenewHeld(vaultIo(answer({ error: "temporarily_unavailable" }, 503)), p, DESK_KEY, held, () => NOW);
  const none = vaultIo(answer({}));
  const empty = await s.signinRenewHeld(none, p, DESK_KEY, heldOf({ refresh: "" }), () => NOW);
  return refused.said === "signin-expired" && kept(refused, held) && refused.held.refresh === ""
    && offline.said === "signin-unreached" && kept(offline, held) && offline.held.refresh === "sealed:rt-1"
    && busy.said === "signin-refused" && kept(busy, held) && busy.held.refresh === "sealed:rt-1"
    && empty.said === "signin-ask" && !empty.proof && none.asked.length === 0 && held.ask === false;
};

/* ---- the renewal's wiring, evaluated with stand-ins for the shell around it --------------------------------------------- */
const WIRE_DECLS = ["const SIGNIN_RENEW_MS =", "const SIGNIN_FIRST_MS =", "async function signinRenewNow(", "function armSigninRenew("];
const WIRE_STANDS = ["harnessLaunch", "PLACED_ASIDE", "signinWhere", "signinState", "branchIdentity", "signinRequest", "net", "safeStorage",
  "signinKeep", "signinKept", "signinRenew", "signinRenewHeld", "signinSave", "tellSignin", "process", "setTimeout", "stand"];
function loadWire(st, swap) {
  let text = WIRE_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let signinPending = null, signinBusy = null, signinTimer = null;\n"
    + "function signinFlush(w) { stand.flushed.push(signinPending); signinPending = null; return true; }\n" + text
    + "\nreturn { signinRenewNow, armSigninRenew, SIGNIN_RENEW_MS, SIGNIN_FIRST_MS };";
  return new Function(...WIRE_STANDS, body)(...WIRE_STANDS.map(n => n === "stand" ? st : st[n]));
}
/* The shell around the renewal: a team naming Microsoft, this desk's identity, the keyring as a visible wrapper, the provider's
   door answering `reply()`, and no network at all. Real time, since the wiring reads Date.now. */
function wireStand(s, reply) {
  const st = { flushed: [], saves: 0, tells: 0, wheres: 0, asked: 0, timers: [], store: { hints: {}, held: null } };
  Object.assign(st, {
    harnessLaunch: () => false, PLACED_ASIDE: false,
    signinWhere: () => { st.wheres++; return { at: { team: TEAM }, providers: [s.signinHint(HINT)[0]] }; },
    signinState: () => st.store, branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }),
    signinRequest: async () => { st.asked++; return reply ? reply() : answer({}); },
    net: { fetch: () => { throw new Error("no network in a leg"); } }, safeStorage: {},
    signinKeep: (store, platform, t) => t ? "sealed:" + t : "", signinKept: (store, x) => String(x || "").replace(/^sealed:/, ""),
    signinRenew: s.signinRenew, signinRenewHeld: s.signinRenewHeld, signinSave: () => { st.saves++; }, tellSignin: () => { st.tells++; },
    process: { platform: "win32" }, setTimeout: (fn, ms) => { st.timers.push({ fn, ms }); return { unref() {} }; },
  });
  return st;
}
/* A harness start renews nothing: signinRenewNow returns before it reads anything. */
CASES.renewHarness = async (s, swap) => {
  const st = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())) }));
  st.harnessLaunch = () => true;
  st.store.held = heldOf();
  const said = await loadWire(st, swap).signinRenewNow();
  return said === "" && st.wheres === 0 && st.asked === 0 && st.saves === 0 && st.flushed.length === 0;
};
/* Once at each start, soon after the window opens, then daily: a named constant of a day, and never from a harness start. */
CASES.renewDaily = async (s, swap) => {
  const st = wireStand(s), w = loadWire(st, swap);
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
    && later.join() === [w.SIGNIN_RENEW_MS, w.SIGNIN_RENEW_MS].join() && st.wheres === 2 && h.timers.length === 0;
};
/* The wiring end to end: a renewal flushes the refreshed token for seat.json and clears the calm state; a refused one flushes
   nothing, keeps the team, the provider and the seed, sets it, and tells the page. */
CASES.renewWire = async (s, swap) => {
  const fresh = jwt(msClaims(undefined, Date.now()));
  const ok = wireStand(s, () => answer({ id_token: fresh, refresh_token: "rt-2" }));
  ok.store.held = heldOf({ ask: true });
  const said = await loadWire(ok, swap).signinRenewNow();
  const no = wireStand(s, () => answer({ error: "invalid_grant" }, 400));
  no.store.held = heldOf();
  const saidNo = await loadWire(no, swap).signinRenewNow();
  const h = no.store.held;
  return said === "renewed" && ok.flushed.length === 1 && !!ok.flushed[0] && ok.flushed[0].idToken === fresh && ok.flushed[0].seed === SEED
    && ok.store.held.ask === false && ok.store.held.refresh === "sealed:rt-2" && ok.saves >= 1
    && saidNo === "signin-expired" && no.flushed.length === 0 && h.ask === true && h.team === TEAM && h.provider === "microsoft" && h.seed === SEED
    && h.refresh === "" && no.saves >= 1 && no.tells >= 1;
};

/* ---- the cases on the branch ------------------------------------------------------------------------------------------- */
const LEGS = [
  ["ds1a", "hint", "the team's hint is read: providers this desk can reach, one per id, the issuer its own; unknown ids, bad client ids and foreign issuers passed over"],
  ["ds1b", "inviteHint", "an invitation's hint is read by inviteRead itself, and an invitation without one carries none"],
  ["ds1c", "offer", "the team file's hint wins once read, the invitation's stands for the team being joined, and no team offers nothing"],
  ["ds2a", "pkce", "the authorize URL carries PKCE (S256 over the verifier), the state, the nonce and a 127.0.0.1 loopback, at the provider's own page"],
  ["ds2b", "nonceBound", "the nonce is the service's SHA-256 of its line, this desk's key and the seed, and is not another desk key's"],
  ["ds2c", "tokenNonce", "a token is taken only for this client and issuer, unexpired, carrying this desk's nonce; another key's nonce or none is unbound"],
  ["ds2d", "state", "a wrong or missing state is refused before anything else of the answer is read"],
  ["ds2e", "flow", "the whole path with stand-ins: the token's nonce is made again from this desk's key and the seed alone, no client secret sent"],
  ["ds3a", "seatShape", "seat.json is {format, desk, sealed, sig} and holds neither the token nor the seed in the clear"],
  ["ds3b", "seatSealed", "seat.json opens with the lead's box key for this team alone, to the token and the seed"],
  ["ds3c", "seatSigned", "seat.json is signed by this desk's key over its prefix and the canonical rest, and a changed byte or another key fails"],
  ["ds4a", "noHint", "with no hint nothing is listened on, opened or sent, at a sign-in or a renewal"],
  ["ds4b", "door", "the door asks only a provider's own token address, by POST, no redirect followed, nothing cached, no cookie"],
  ["ds4c", "keep", "the refresh token is sealed by a real keyring and never kept on Linux's basic_text"],
  ["ds4d", "loopOnce", "the loopback answers 404 to anything but GET /, answers the GET / it takes once, and then closes"],
  ["ds6a", "loopStray", "a GET / with no state or another state is answered 400 and ignored, the sign-in still waiting, and the reply with the state ends it"],
  ["ds6b", "loopFlow", "through signinRun on a real loopback, two strays leave the sign-in waiting and the browser's reply completes it with its own code"],
  ["ds6c", "scopes", "Microsoft is asked for openid profile offline_access at sign-in and refresh, Google for openid, email of nobody (the named constant false)"],
  ["ds7a", "renewWrite", "a refreshed token with no nonce and the seat's sub, or this desk's nonce, is written into seat.json with the first seed, and the lead opens it"],
  ["ds7b", "renewRefuse", "another sub, another desk's nonce, or no nonce with no sub to compare writes nothing and forgets the refresh token"],
  ["ds7c", "renewFail", "a refused refresh, a network failure or a busy provider writes nothing, keeps everything held and sets the calm state"],
  ["ds7d", "renewHarness", "signinRenewNow returns at once on a harness start, reading and asking nothing"],
  ["ds7e", "renewDaily", "the renewal runs once at each start, soon after the window, then daily by a named constant, and never from a harness start"],
  ["ds7f", "renewWire", "the wiring flushes a renewed token for seat.json and clears the calm state; a refused one flushes nothing, keeps the seat and tells the page"],
];
for (let [id, name, line] of LEGS) {
  let ok = false;
  try { ok = await CASES[name](S); } catch (e) { ok = false; line += " (threw " + (e && e.message) + ")"; }
  check(ok, id + " " + line);
}

/* ---- the wiring and the page, as text ---------------------------------------------------------------------------------- */
const at = (text, s) => text.indexOf(s);
const handler = (() => { const a = at(WIRING, 'ipcMain.handle("etiuda:signin",'); return a < 0 ? "" : WIRING.slice(a, WIRING.indexOf("\n});", a)); })();
const renew = decl(MAIN, "async function signinRenewNow(");
const armRenew = decl(MAIN, "function armSigninRenew(");
check(!!handler && at(handler, "/* plant:signin-click */") > 0 && at(handler, "/* plant:signin-offered */") > at(handler, "/* plant:signin-click */")
  && at(handler, "signinRun(") > at(handler, "/* plant:signin-offered */") && /w\.providers\.find\(x => x\.id === id\)/.test(handler),
  "ds4e the sign-in runs only for a trusted click on an offered provider's button, both asked before the loopback or the browser");
check(at(renew, "/* plant:renew-offered */") > 0 && at(renew, "signinRenewHeld(") > at(renew, "/* plant:renew-offered */") && /w\.providers\.find\(/.test(renew),
  "ds4f the quiet renewal sends nothing unless the team still names the provider it signed in with");
check(/if \(PLACED_ASIDE \|\| harnessLaunch\(\) \|\|/.test(armRenew) && /armNoteLook\(\);\n\s*armSigninRenew\(\);/.test(MAIN),
  "ds4g the renewal is armed once the window opens and never from the harness's own window or any harness start");
check(/openPage: url => signinPageOk\(url\) \?/.test(WIRING) && (MAIN.match(/shell\.openExternal\(/g) || []).length === 2,
  "ds4h the browser is handed only a provider's own authorize page, at the one new openExternal");
check(/data-e-open="signin" data-e-provider=/.test(SETTINGS) && /eOpen === "signin"[\s\S]{0,40}\n\s*if \(b\) ipcRenderer\.sendSync\("etiuda:signin-click"/.test(PRELOAD),
  "ds4i the preload names a trusted click on a sign-in button, and the page's buttons are the only ones it hears");
/* NOTHING LOCAL IS GATED: outside the section and its wiring, the shell names the sign-in at five places alone, none of which
   decides anything: inviteRead's hint, the two invitations' yes keeping it, the require of its loopback and the arming. */
function outsideNames(main) {
  const rest = main.replace(between(main, HEAD, TAIL), "");
  const found = rest.match(/\b(?:signin(?:[A-Z]\w*)?|armSignin\w*|seat(?:Doc|Open|Genuine|Info|SignedBytes)|SEAT_\w+|SIGNIN_\w+)\b/g) || [];
  return found;
}
const outside = outsideNames(MAIN);
const expectOutside = ["signinListen", "signinHintKeep", "signin", "signin", "signin", "signin", "signin", "signin", "signin", "signin", "signin", "signin",
  "signinHintKeep", "signin", "signinHintKeep", "signin", "armSigninRenew"];
check(outside.slice().sort().join() === expectOutside.slice().sort().join(),
  "ds5a nothing local is gated: outside its section the shell names the sign-in only to read and keep the hint and to arm the renewal: " + outside.join(" "));
const modules = fs.readdirSync(path.join(ROOT, "src", "modules")).filter(n => n.endsWith(".js"));
const readers = modules.filter(n => /\bsignin(State|Stop)\b|\bsignIn\(|onSignin/.test(fs.readFileSync(path.join(ROOT, "src", "modules", n), "utf8")));
check(readers.join() === "settings.js" && (SETTINGS.match(/h\.signinState\(\)/g) || []).length === 1 && /function signinRow\(\)\{[\s\S]{0,300}if\(!offered\.length\) return null;/.test(SETTINGS),
  "ds5b on the page only Settings' sign-in row reads it, and with nothing offered the row is not drawn: " + readers.join(","));
const require = createRequire(import.meta.url);
const syncer = require(path.join(ROOT, "shell", "folder", "syncer.cjs"));
check(syncer.isAllowedPath("desks/k-0123456789abcdef/seat.json") === true && syncer.isAllowedPath("desks/k-0123456789abcdef/seat.json.tmp") === false,
  "ds5c a folder team's mirror carries desks/<id>/seat.json to the share");

/* ---- the plants --------------------------------------------------------------------------------------------------------- */
if (!PLANTS_OFF) {
  const plant = async (id, swap, name, where) => {
    let red = false;
    try { const s = load(swap, where); red = !(await CASES[name](s)); } catch { red = true; }
    check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red");
  };
  await plant("dsp1", ["    const known = signinKnown(p.id);", "    const known = signinKnown(p.id) || SIGNIN_PROVIDERS.google;"], "hint");
  await plant("dsp2", ["if (signin && signin.length) out.signin = signin.slice(0, 8); /* plant:hint-invite */", "/* plant:hint-invite */"], "inviteHint", "invite");
  await plant("dsp3", ["if (teamDoc && typeof teamDoc === \"object\") return signinHint(teamDoc); /* plant:offer-team-file */", "if (teamDoc && typeof teamDoc === \"object\" && signinHint(teamDoc).length) return signinHint(teamDoc);"], "offer");
  await plant("dsp4", ["const challenge = signinB64url(crypto.createHash(\"sha256\").update(verifier).digest()); /* plant:pkce */", "const challenge = verifier;"], "pkce");
  await plant("dsp5", ["const nonce = signinNonce(deskKey, seed); /* plant:nonce-bound */", "const nonce = signinB64url(r(32));"], "nonceBound");
  await plant("dsp6", ["if (!renewal && (typeof c.nonce !== \"string\" || !signinSame(c.nonce, nonce))) return { ok: false, reason: \"signin-unbound\" }; /* plant:token-nonce */", ""], "tokenNonce");
  await plant("dsp7", ["if (!signinOurs(query, pending)) return { ok: false, reason: \"signin-state\" }; /* plant:state */", ""], "state");
  await plant("dsp8", ["const w = hpkeSeal(Buffer.from(String(box), \"hex\"), seatInfo(teamId, deskId), Buffer.alloc(0), inner); /* plant:seat-sealed */",
    "const w = hpkeSeal(Buffer.from(String(box), \"hex\"), seatInfo(teamId, \"k-0000000000000000\"), Buffer.alloc(0), inner);"], "seatSealed");
  await plant("dsp9", ["doc.sig = { alg: \"Ed25519\", keyId: String(deskId), value: value }; /* plant:seat-signed */", "doc.sig = { alg: \"Ed25519\", keyId: String(deskId), value: (value[0] === \"0\" ? \"1\" : \"0\") + value.slice(1) };"], "seatSigned");
  await plant("dsp10", ["if (!Object.keys(SIGNIN_PROVIDERS).some(id => SIGNIN_PROVIDERS[id].token === u)) throw new Error(\"a token is asked only at a provider's own token address\"); /* plant:door-host */", ""], "door");
  await plant("dsp11", ["body: form, redirect: \"error\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined }); /* plant:door-redirect */",
    "body: form, redirect: \"follow\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined });"], "door");
  await plant("dsp12", ["if (!token || !sealsForReal(storage, platform)) return \"\"; /* plant:keep-real */", "if (!token) return \"\";"], "keep");
  await plant("dsp13", ["      shut();\n      caughtYes(query);", "      caughtYes(query);"], "loopOnce");
  await plant("dsp15", ["if (!ours) { res.writeHead(400, { \"content-type\": \"text/html; charset=utf-8\", \"cache-control\": \"no-store\" }); res.end(page); return; } /* plant:loop-state */", ""], "loopStray");
  await plant("dsp16", ["query => signinOurs(query, pending)); /* plant:loop-takes */", "() => true);"], "loopFlow");
  await plant("dsp17", ["const GOOGLE_HD_NEEDS_EMAIL = false; /* plant:scope-email */", "const GOOGLE_HD_NEEDS_EMAIL = true;"], "scopes");
  await plant("dsp18", ["const renewal = sub !== undefined && c.nonce === undefined; /* plant:renew-none */", "const renewal = false;"], "renewWrite");
  await plant("dsp19", ["if (sub !== undefined && !signinSame(c.sub, sub)) return { ok: false, reason: \"signin-other\" }; /* plant:renew-sub */", ""], "renewRefuse");
  await plant("dsp20", ["refresh: lost ? \"\" : held.refresh, ask: true }), proof: null, said: got.reason }; /* plant:renew-ask */",
    "refresh: lost ? \"\" : held.refresh }), proof: null, said: got.reason };"], "renewFail");
  /* The wiring's plants, put into the evaluated wiring in memory. */
  const plantWire = async (id, swap, name) => {
    let red = false;
    try { red = !(await CASES[name](S, swap)); } catch { red = true; }
    check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red");
  };
  await plantWire("dsp21", ["  if (harnessLaunch()) return \"\"; /* plant:renew-now-harness */\n", ""], "renewHarness");
  await plantWire("dsp22", ["const SIGNIN_RENEW_MS = 24 * 60 * 60 * 1000; /* plant:renew-daily */", "const SIGNIN_RENEW_MS = 55 * 60 * 1000;"], "renewDaily");
  await plantWire("dsp23", ["signinTimer = setTimeout(next, SIGNIN_FIRST_MS); /* plant:renew-start */", "signinTimer = setTimeout(next, SIGNIN_RENEW_MS);"], "renewDaily");
  /* A gate on a local act, put into the desk file's write in memory, is seen. */
  const gated = MAIN.replace("function writeBranch(stem, text) {\n", "function writeBranch(stem, text) {\n  if (!signinView().signedIn) return { ok: false };\n");
  check(gated !== MAIN && outsideNames(gated).slice().sort().join() !== expectOutside.slice().sort().join(),
    "dsp14 plant a sign-in gate on the desk file's write turns ds5a red");
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + " plants=" + (PLANTS_OFF ? 0 : PLANTS));
if (asserted !== EXPECTED) { console.log("FAIL the run made " + asserted + " checks of " + EXPECTED + ": it did not complete"); failed++; }
console.log(failed ? "desk-signin: " + failed + " failed" : "desk-signin: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
