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
 *
 * THE DOOR-FINDING (ds17, board 980; Max, 2026-11-12 18:46 and 18:57): the doors the service hands beside a certificate are kept
 * only whole, their lead key's id its canonical one (the test architect's read), kept with the certificate and in the file; a desk
 * signed in with no team offers them by host and lead print, and a press makes the join A4's knock serves, the lead and the box
 * from the door; the envelope keeps that join; the page draws the doors, Polish too. A door names a relay this build trusts
 * (DOOR_RELAYS, its samples in tests/door-relays.json) and is a channel by teamChannelOf, at the keep, the offer and the knock (ds17h).
 *
 * GOOGLE'S CLIENT SECRET (ds13): optional, its value only ever in a package, never in this tree. Every value here is the stand-in
 * STAND_IN, which no provider would issue; a leg that needs a value of a real secret's shape builds it from pieces at run time, so
 * the tree's own scan (ds13g) and any outside scanner find nothing in this file.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const PAGE = (() => { try { return fs.readFileSync(path.join(ROOT, "src", "modules", "signin.js"), "utf8"); } catch { return ""; } })();
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 114;
/* The floor: every check below runs, or the file says it did not complete. */
/* The trace and the declined consent (dt): their legs and plants, counted apart. */
const TRACE_CHECKS = 6, TRACE_PLANTS = 6;
const EXPECTED = 116 + TRACE_CHECKS + (PLANTS_OFF ? 0 : PLANTS + 1 + TRACE_PLANTS); /* +1: dspA, the lost-anchor control */

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
/* THE ROOT A CERTIFICATE TRACES TO (ds22): the slice is given a root of this run's own in NOTE_ROOT's place, so a certificate signed
   here under its delegation is a genuine one; ds22d holds the shipped NOTE_ROOT to the relay's ROOT_PUB. */
const ROOT_KEY = crypto.generateKeyPairSync("ed25519"), SERVICE_KEY = crypto.generateKeyPairSync("ed25519");
const TEST_ROOT = ROOT_KEY.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const NEEDS = ["const BUILTIN_RELAY_URL =", "const SEALED_TEAM_RE =", "const LINUX_KEYRINGS =", "function sealsForReal(", "function branchIdOf(",
  "const SPKI_ED25519 =", "function canonJson("].map(s => decl(MAIN, s)).join("\n") + "\nconst NOTE_ROOT = \"" + TEST_ROOT + "\";";
const INVITE = ["const INVITE_HIDDEN_RE =", "function inviteRead(", "function inviteRelay(", "function teamChannelOf("].map(s => decl(MAIN, s)).join("\n");
const NAMES = ["SIGNIN_PROVIDERS", "signinOffered", "signinNonce", "signinAuthorize", "signinPageOk", "signinBack", "signinRefusedWhy", "signinTokens",
  "signinRequest", "signinListen", "signinRun", "signinRenew", "signinKeep", "signinKept", "GOOGLE_HD_NEEDS_EMAIL", "signinRefreshForm",
  "SIGNIN_SERVICE", "signinDeskBytes", "signinDeskBody", "signinServiceAsk", "signinCertOk", "signinAnswer", "signinSeat", "signinLapsed",
  "signinSettle", "signinRenewHeld", "seatFileText", "SEAT_NAME", "signinFileRead", "signinFileText", "branchIdOf", "inviteRead",
  "SIGNOUT_SERVICE", "signoutDeskBytes", "signoutDeskBody", "signoutAsk", "signinDoorRequest", "signinKnown", "signinPreviewing",
  "signinCodeForm", "signinSecretRead", "SIGNIN_SECRET_FILE", "SIGNIN_SECRET_SHAPE", "sealsForReal", "SIGNIN_WAIT_MS", "signinLabAt", "signinLabRead",
  "signinLabUse", "signinDoorAddressOk", "DOOR_RELAYS", "BUILTIN_RELAY_URL"];
NAMES.push("SIGNIN_TRACE_ASKED", "signinTraceLine", "signinTraceSaid");
/* The section, evaluated: `swap` is [from, to], put in place of the one line that holds `from`, for a plant; `invSwap` the same in the
   invitation's slice as well. */
function load(swap, where, invSwap, needs) {
  let sec = SECTION, inv = INVITE;
  if (swap) {
    const inSec = where !== "invite";
    const text = inSec ? sec : inv;
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    if (inSec) sec = text.replace(swap[0], swap[1]); else inv = text.replace(swap[0], swap[1]);
  }
  if (invSwap) {
    if (inv.split(invSwap[0]).length !== 2) throw new Error("plant anchor not in the invitation's slice once: " + invSwap[0]);
    inv = inv.replace(invSwap[0], invSwap[1]);
  }
  /* A name the slice lacks comes back undefined, so a case reaching for it fails alone rather than the whole file. */
  /* Every answer the section reads from the licence service passes the observer (ds23d), planted or not. */
  const body = (needs || NEEDS) + "\n" + sec + "\n" + inv + "\nif (typeof signinAnswer === \"function\") { const signinAnswerRead = signinAnswer;"
    + " signinAnswer = function (res, deskKey, packed) { const r = signinAnswerRead(res, deskKey, packed); answerSeen(res, r); return r; }; }"
    + "\nreturn {" + NAMES.map(n => n + ": typeof " + n + " === \"undefined\" ? undefined : " + n).join(", ")
    + ", live: () => ({ providers: SIGNIN_PROVIDERS, signin: SIGNIN_SERVICE, signout: SIGNOUT_SERVICE, on: typeof signinLabOn === \"undefined\" ? undefined : signinLabOn,"
    + " packed: signinPacked }), setPacked: v => { signinPacked = v; } };";
  /* inviteRead's own readers stand in: a folder is taken as written and no place is kept; a relay's address is the desk's own rule. */
  return new Function("crypto", "Buffer", "URLSearchParams", "AbortController", "setTimeout", "clearTimeout",
    "inviteFolder", "placeKept", "answerSeen", body)(crypto, Buffer, URLSearchParams, AbortController, setTimeout, clearTimeout,
    f => String(f || ""), () => null, answerSeen);
}
/* THE SERVICE'S OWN ANSWERS (ds23; Hydrogen's review of the sign-in, findings 1 and 11: these legs once mocked "full" as a 409 the
   service never gives). tests/signin-answers.json is every answer the licence service's signin/desk and signout/desk give, driven
   from its core in Studio and written there (tests/licence-service.mjs --write-answers, s110), held here byte for byte; Studio's
   s110c compares it with the pinned engine's copy, so neither tree moves alone. A certificate here is built from the recorded one,
   and every answer a leg hands the desk is held to the record's shapes (ds23d). */
const ANSWERS = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "signin-answers.json"), "utf8")); } catch { return null; } })();
const ANSWER_CASES = ANSWERS && ANSWERS.kind === "etiuda-signin-answers" && Array.isArray(ANSWERS.cases) ? ANSWERS.cases : [];
/* An answer's shape: each object's names sorted, a fixed word kept, and a value that varies by run named by its class (an integer,
   an address, hex or a code of its length, a key's id), so a hand-built answer with this file's values meets the service's own. */
function answerShape(v) {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isInteger(v) ? "<int>" : "<num>";
  if (typeof v === "string") {
    if (/^https?:\/\//.test(v)) return "<url>";
    if (v.length >= 8 && /^[0-9a-f]+$/.test(v)) return "<hex" + v.length + ">";
    if (v.length >= 8 && /^[0-9A-Z]+$/.test(v)) return "<A" + v.length + ">";
    return v.replace(/[0-9a-f]{8,}/g, m => "<hex" + m.length + ">");
  }
  if (Array.isArray(v)) return Array.from(new Set(v.map(x => JSON.stringify(answerShape(x))))).sort();
  if (typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, (k === "id" || k === "keyId") && typeof v[k] === "string" ? "<id>" : answerShape(v[k])]));
  return typeof v;
}
const answerSig = (status, body) => status + " " + JSON.stringify(answerShape(body));
/* An answer an older service gave and this desk still reads, each naming when the service stopped giving it. Nothing else a
   leg hands the desk may be read as meaning anything unless the record holds its shape. */
const PAST_ANSWERS = [
  { status: 409, body: { ok: false, reason: "full" }, until: "Studio 63614038, decision 32: no free seat is now the 200 \"waiting\" answer" },
];
const SERVED = new Set(ANSWER_CASES.filter(c => c.route === "signin/desk").map(c => answerSig(c.status, c.body))
  .concat(PAST_ANSWERS.map(p => answerSig(p.status, p.body))));
/* The observer: while the legs run (and not their plants), each answer the section read, with what it read. */
const ANSWERS_READ = [];
let answersWatched = true;
let answersStray = 0;
function answerSeen(res, r) {
  if (!answersWatched) return;
  if (res && res.stray === true) { answersStray++; return; }
  let body;
  try { body = JSON.parse(Buffer.from(res && res.bytes ? res.bytes : []).toString("utf8")); } catch { body = undefined; }
  ANSWERS_READ.push({ status: res ? res.status : undefined, body, read: r });
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
/* An answer the licence service never gives, handed on purpose to show the desk takes nothing from it beyond the service's own
   shape. ds23d passes it by this mark alone and counts it; any other answer a leg hands the desk is held to tests/signin-answers.json. */
const strayAnswer = (obj, status) => Object.assign(answer(obj, status), { stray: true });
/* The service's own making of the nonce and of the desk's signed bytes, written here from the lines the interface names. */
const serviceNonce = (key, seed) => crypto.createHash("sha256").update("etiuda-licence-signin-nonce\n" + key + "\n" + seed).digest("hex");
const serviceBytes = (provider, idToken, desk, t) => Buffer.from("etiuda-licence-signin-desk\n" + [provider,
  crypto.createHash("sha256").update(idToken).digest("hex"), desk, t].join("\n"), "utf8");
const signWith = k => bytes => crypto.sign(null, bytes, k.privateKey).toString("hex");
/* The service's bytes for the desk's sign-out, written here from the interface: its line `etiuda-licence-signout-desk`, then the
   desk's public half and t, one a line. */
const serviceOutBytes = (desk, t) => Buffer.from("etiuda-licence-signout-desk\n" + [desk, t].join("\n"), "utf8");
const CODE = "7K3MQ9TV2XRBHN4W";
/* The service's signing, written here from the interface (relay/core.cjs's delegationBytes and certBytes, Studio's seatCertBytes):
   a delegation is the line "etiuda-delegation" and the canonical JSON of the document without its signature's value, signed by the
   root; a certificate is the line "etiuda-seat-certificate", then format, licence, desk, person, code, issued, until and the signing
   key's id, one a line, signed by the delegated key. */
const canonOf = v => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canonOf).join(",") + "]"
  : "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canonOf(v[k])).join(",") + "}";
const SERVICE_PUB = SERVICE_KEY.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const VIA_FROM = Math.min(NOW, Date.now()) - 30 * 86400000;
function delegation(over, signer) {
  const d = Object.assign({ kind: "etiuda-delegation", format: 1, key: { id: "svc-1", pub: SERVICE_PUB }, may: ["licence", "relay-grant"],
    from: VIA_FROM, until: VIA_FROM + 360 * 86400000 }, over, { sig: { alg: "ed25519", keyId: "root-1" } });
  d.sig.value = crypto.sign(null, Buffer.from("etiuda-delegation\n" + canonOf(d), "utf8"), (signer || ROOT_KEY).privateKey).toString("hex");
  return d;
}
const VIA = delegation();
const certBytesOf = c => Buffer.from("etiuda-seat-certificate\n" + [c.format, c.licence, c.desk, c.person, c.code, c.issued, c.until, c.sig.keyId].join("\n"), "utf8");
/* A certificate as the service signs one: `over` replaces fields before the signing, and a `sig` given is kept as given. */
function cert(over, signer) {
  const c = Object.assign({ kind: "etiuda-seat-certificate", format: 1, licence: "a".repeat(32), desk: DESK_KEY, person: "b".repeat(64),
    code: CODE, issued: NOW, until: NOW + 30 * 86400000, via: VIA }, over);
  if (over && over.sig) return c;
  c.sig = { alg: "Ed25519", keyId: c.via && c.via.key ? c.via.key.id : "svc-1", value: "" };
  c.sig.value = crypto.sign(null, certBytesOf(c), (signer || SERVICE_KEY).privateKey).toString("hex");
  return c;
}

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
  const held = a({ ok: true, certificate: cert(), code: CODE, doors: [] }), none = a({ ok: true, certificate: null, code: CODE });
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
  const io = renewIo(answer({ id_token: plain, refresh_token: "rt-2" }), answer({ ok: true, certificate: next, code: CODE, doors: [] }));
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
const WIRE_DECLS = ["const SIGNIN_RENEW_MS =", "const SIGNIN_FIRST_MS =", "async function signinRenewNow(", "function armSigninRenew(", "function signinOutNow(",
  "function signinOutSend(", "function signinOutAgain("];
const WIRE_STANDS = ["harnessLaunch", "PLACED_ASIDE", "signinState", "signinOffered", "branchIdentity", "signinIo", "net", "signinRenewHeld",
  "signinSave", "tellSignin", "setTimeout", "pinnedLead", "signinTeamHere", "fs", "path", "sharedFolderForWrite", "SEAT_NAME", "signinView", "signoutAsk", "signinLabHeld", "teamJoin", "cancelJoin", "sendJoin", "theWindow", "unlinkOwn", "stand"];
function loadWire(st, swap) {
  let text = WIRE_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let signinBusy = stand.busy || null, signinTimer = null, signinWrote = \"kept\", signinSaid = stand.said || \"\", signinRenewing = null, signinOutFlight = null;\n"
    + "function signinFlush() { stand.flushes++; return true; }\n" + text
    + "\nreturn { signinRenewNow, armSigninRenew, SIGNIN_RENEW_MS, SIGNIN_FIRST_MS, signinOutNow: typeof signinOutNow === \"undefined\" ? undefined : signinOutNow,"
    + " wrote: () => signinWrote, said: () => signinSaid };";
  return new Function(...WIRE_STANDS, body)(...WIRE_STANDS.map(n => n === "stand" ? st : st[n]));
}
/* The shell around the renewal: Microsoft configured, this desk's identity, the doors answering `reply()` and `serve()`. Real time. */
function wireStand(s, reply, serve) {
  const st = { flushes: 0, saves: 0, tells: 0, asked: 0, posted: 0, offeredAsked: 0, timers: [], store: { held: null }, cancels: 0, sends: 0, unlinked: [] };
  Object.assign(st, {
    harnessLaunch: () => false, PLACED_ASIDE: false, signinLabHeld: () => false,
    signinState: () => st.store, signinOffered: () => { st.offeredAsked++; return [MS]; }, branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }),
    signinIo: () => ({ keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""), sign: signWith(signKey),
      tokenAsk: async () => { st.asked++; return reply ? reply() : answer({}); }, serviceAsk: async () => { st.posted++; return serve ? serve() : answer({}); } }),
    net: { fetch: () => { throw new Error("no network in a leg"); } },
    signinRenewHeld: s.signinRenewHeld, signinSave: () => { st.saves++; }, tellSignin: () => { st.tells++; },
    pinnedLead: () => false, signinTeamHere: () => false, fs, path, sharedFolderForWrite: () => "", SEAT_NAME: "seat.json", signoutAsk: s.signoutAsk,
    signinView: () => ({ offered: [], signedIn: st.store.held ? "microsoft" : "" }),
    teamJoin: null, cancelJoin: () => { st.cancels++; }, sendJoin: () => { st.sends++; }, theWindow: null, unlinkOwn: f => { st.unlinked.push(String(f)); },
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
  const ok = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())), refresh_token: "rt-2" }), () => answer({ ok: true, certificate: next, code: CODE, doors: [] }));
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
  "writeJoin", "fs", "path", "Date", "console", "signinDoorAddressOk", "SIGNIN_DESK_PACKED"];
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
    Date: { now: () => NOW }, console: { error() {} }, signinDoorAddressOk: st.addressOk || s.signinDoorAddressOk,
    SIGNIN_DESK_PACKED: st.packed === undefined ? true : st.packed };
  return new Function(...DOOR_STANDS, text + "\nreturn { signinDoorInvite, signinDoorKept };")(...DOOR_STANDS.map(n => vals[n]));
}
const doorJoin = over => ({ team: TEAM, nonce: "4".repeat(64), commit: "1".repeat(64), asked: NOW, held: 0, name: "Desk",
  invite: { relay: Object.assign({ rt: RT, url: "https://etiuda.dev/relay/v1", door: true, box: LEAD_BOX }, over) } });
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

/* ---- the door-finding (ds17) ------------------------------------------------------------------------------------------ */
const DOOR_LEAD = rawPub(crypto.generateKeyPairSync("ed25519").publicKey);
const DOOR_KEY_ID = "studio-" + crypto.createHash("sha256").update(Buffer.from(DOOR_LEAD, "hex")).digest("hex").slice(0, 16);
const doorOf = over => Object.assign({ team: TEAM, rt: RT, url: "https://etiuda.dev/relay/v1", keyId: DOOR_KEY_ID, lead: DOOR_LEAD, box: LEAD_BOX }, over);
const DOORS_TWO = () => [doorOf(), doorOf({ team: "t-fedcba9876543210", rt: "b1".repeat(16), url: "https://etiuda.dev/relay/v1/" })];
/* The doors beside a certificate are kept whole, in order; any door out of shape, a key id not the lead key's canonical one among
   them, makes no list at all; no certificate, no doors; an answer with none has none. */
CASES.doorsRead = s => {
  const c = cert();
  /* Doors out of shape, none named at all, and doors beside no certificate are answers the service never gives: stray, on purpose. */
  const read = doors => s.signinAnswer(strayAnswer({ ok: true, code: CODE, certificate: c, doors }), DESK_KEY);
  const two = read(DOORS_TWO()), none = read(undefined), noCert = s.signinAnswer(strayAnswer({ ok: true, code: CODE, certificate: null, doors: DOORS_TWO() }), DESK_KEY);
  const bad = [[doorOf({ keyId: "studio-" + "0".repeat(16) })], [doorOf({ keyId: "studio-maxs-laptop-01" })], Array.from({ length: 17 }, () => doorOf()),
    [doorOf({ url: "http://relay.example.test" })], [doorOf({ url: "https://relay.example.test/a b" })], [doorOf({ box: "short" })],
    [Object.assign(doorOf(), { name: "Ops" })], [doorOf({ rt: "zz" })], [doorOf({ team: "team-1" })], [doorOf(), doorOf({ lead: "x" })], "doors"];
  return two.ok === true && JSON.stringify(two.doors) === JSON.stringify(DOORS_TWO()) && none.ok === true && JSON.stringify(none.doors) === "[]"
    && noCert.ok === true && noCert.cert === null && JSON.stringify(noCert.doors) === "[]"
    && bad.every(b => { const r = read(b); return r.ok === true && !!r.cert && Array.isArray(r.doors) && r.doors.length === 0; });
};
/* Kept with the certificate: an answer's doors replace the last, an answer of no certificate leaves none, a refusal keeps them;
   the file holds them and reads them back, and a door out of shape in the file is no list. */
CASES.doorsKept = s => {
  const c = cert();
  const got = s.signinSettle(heldOf({ doors: [] }), { ok: true, code: CODE, cert: c, doors: DOORS_TWO() }, NOW);
  const dropped = s.signinSettle(got, { ok: true, code: CODE, cert: null, doors: DOORS_TWO() }, NOW);
  const refused = s.signinSettle(got, { ok: false, reason: "unreached" }, NOW);
  const back = s.signinFileRead(s.signinFileText({ held: got })).held;
  const forged = s.signinFileRead(s.signinFileText({ held: Object.assign({}, got, { doors: [doorOf({ keyId: "studio-" + "1".repeat(16) })] }) })).held;
  return JSON.stringify(got.doors) === JSON.stringify(DOORS_TWO()) && JSON.stringify(dropped.doors) === "[]" && JSON.stringify(refused.doors) === JSON.stringify(DOORS_TWO())
    && !!back && JSON.stringify(back.doors) === JSON.stringify(DOORS_TWO()) && !!forged && JSON.stringify(forged.doors) === "[]";
};
const DOORJOIN_DECLS = ["function signinDoorsShown(", "function signinDoorJoin(", "function teamPinStands(", "function inviteDoor(", "function policySameFolder("];
const DOORJOIN_STANDS = ["init", "readDesk", "signinState", "branchIdentity", "signinCertOk", "pinnedLead", "joinView", "inviteBeforeFor", "joinCommit",
  "newestEpoch", "teamPins", "teamSeen", "teamPinFrom", "relayMirrorOf", "teamShown", "teamRelayGone", "relayCatalogNamed", "persistDeskEnvelope",
  "relayRun", "catalogFolderChanged", "leadPrint", "crypto", "URL", "Date", "signinDoorAddressOk", "SIGNIN_DESK_PACKED",
  "deskBranch", "branchIdOf", "teamRoster", "teamLeft", "teamBarred", "sayJoinPolicy", "path", "process"];
/* The door's offer and its join with stand-ins: `st` {held, pinned, join, pins, counts}. */
function loadDoorJoin(s, st, swap) {
  let text = DOORJOIN_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the door's join once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { init: st, readDesk: () => ({}), signinState: () => ({ held: st.held }), branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY, box: DESK_BOX }),
    signinCertOk: s.signinCertOk, pinnedLead: () => st.pinned, joinView: () => ({ view: true }),
    inviteBeforeFor: team => { st.beforeSeen = { left: st.left[team], barred: st.barred.has(team) }; return { barred: false, epoch: 0 }; },
    joinCommit: JOIN_LIB.joinCommit, newestEpoch: t => (st.epochs && st.epochs[t]) || 0, teamPins: st.pins, teamSeen: new Set(), teamPinFrom: st.from, relayMirrorOf: rt => "/relay/" + rt,
    teamShown: st.shown, teamRelayGone: st.gone || {}, relayCatalogNamed: new Set(),
    deskBranch: { sign: { pub: DESK_KEY } }, branchIdOf: () => DESK_ID, teamRoster: st.roster || {}, teamLeft: st.left, teamBarred: st.barred,
    sayJoinPolicy: () => st.policy || {}, path, process, persistDeskEnvelope: () => { st.persists++; }, relayRun: () => { st.runs++; },
    catalogFolderChanged: () => {}, leadPrint: pub => crypto.createHash("sha256").update(Buffer.from(String(pub), "hex")).digest("hex").slice(0, 16),
    crypto, URL, Date: { now: () => NOW }, signinDoorAddressOk: st.addressOk || s.signinDoorAddressOk,
    SIGNIN_DESK_PACKED: st.packed === undefined ? true : st.packed };
  const body = "let deskKeys = {}, teamJoin = init.join, teamStamp = \"x\", joinTold = true;\n" + text
    + "\nreturn { signinDoorsShown, signinDoorJoin, join: () => teamJoin };";
  return new Function(...DOORJOIN_STANDS, body)(...DOORJOIN_STANDS.map(n => vals[n]));
}
const doorJoinStand = over => Object.assign({ held: heldOf({ doors: DOORS_TWO() }), pinned: null, join: null, pins: {}, from: {}, shown: {}, persists: 0, runs: 0,
  left: {}, barred: new Set(), policy: null }, over);
/* Offered while signed in with a certificate that stands and no team: each door by host and print; nothing with a lead pinned, a join
   asked, or a certificate ran out. A press makes the door's join: door true, the lead and box from the door, no invitation, the lead
   pinned as an invitation pins it; a door not offered changes nothing. */
CASES.doorJoin = (s, swap) => {
  if (!JOIN_LIB) return false;
  const print = crypto.createHash("sha256").update(Buffer.from(DOOR_LEAD, "hex")).digest("hex").slice(0, 16);
  const st = doorJoinStand(), w = loadDoorJoin(s, st, swap);
  const shown = w.signinDoorsShown(st.held, NOW);
  const offered = JSON.stringify(shown) === JSON.stringify([{ n: 0, host: "etiuda.dev", print }, { n: 1, host: "etiuda.dev", print }]);
  const quietShown = [doorJoinStand({ pinned: { keyId: "k" } }), doorJoinStand({ join: { team: TEAM } }), doorJoinStand({ held: heldOf({ doors: DOORS_TWO(), cert: cert({ until: NOW }) }) }),
    doorJoinStand({ held: heldOf({ doors: DOORS_TWO(), cert: cert({ desk: OTHER_DESK_KEY }) }) })]
    .every(q => JSON.stringify(loadDoorJoin(s, q, swap).signinDoorsShown(q.held, NOW)) === "[]");
  const r = w.signinDoorJoin(1), j = w.join(), d = DOORS_TWO()[1];
  const made = !!r && r.view === true && r.refused === undefined && !!j && j.team === d.team && j.file === "" && /^[0-9a-f]{64}$/.test(j.nonce)
    && j.commit === JOIN_LIB.joinCommit(d.team, DESK_KEY, DESK_BOX, j.nonce) && j.name === "" && j.invite.id === undefined && j.invite.proof === undefined
    && JSON.stringify(j.invite.lead) === JSON.stringify({ keyId: DOOR_KEY_ID, public: DOOR_LEAD, name: "" })
    && JSON.stringify(j.invite.relay) === JSON.stringify({ rt: d.rt, url: d.url, door: true, box: LEAD_BOX })
    && JSON.stringify(st.pins[d.team]) === JSON.stringify({ keyId: DOOR_KEY_ID, public: DOOR_LEAD }) && st.from[d.team] === "invite"
    && st.shown[d.team].relay === "etiuda.dev" && st.persists === 1 && st.runs === 1;
  const refusedAlike = [doorJoinStand(), doorJoinStand({ pinned: { keyId: "k" } })].every((q, i) => {
    const x = loadDoorJoin(s, q, swap), a = x.signinDoorJoin(i === 0 ? 5 : 0);
    return !!a && a.refused === "door" && x.join() === null && Object.keys(q.pins).length === 0 && q.persists === 0 && q.runs === 0;
  });
  return offered && quietShown && made && refusedAlike;
};
/* The envelope keeps a join at the door, which names no invitation: its relay part with door true, the lead's box and the relay's
   id once named, and no token, seal or wrap; without the box, or carrying a token, it is no join kept. */
const KEPT_DECLS = ["function relayKept(", "function joinKept(", "function beforeKept(", "function teamChannelOf("];
CASES.doorEnvelope = (s, swap) => {
  let text = KEPT_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the envelope's readers once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const lib = new Function("SEALED_TEAM_RE", "JOIN_HEX_RE", text + "\nreturn { relayKept, joinKept };")(/^t-[0-9a-f]{16}$/, /^[0-9a-f]{64}$/);
  const join = relay => ({ team: TEAM, file: "", nonce: "4".repeat(64), commit: "1".repeat(64), asked: NOW, held: 0, name: "",
    invite: { lead: { keyId: DOOR_KEY_ID, public: DOOR_LEAD, name: "" }, pinned: true, before: { barred: false, epoch: 0 }, relay } });
  const door = over => Object.assign({ rt: RT, url: "https://relay.example.test", door: true, box: LEAD_BOX }, over);
  const kept = j => lib.joinKept(JSON.parse(JSON.stringify(j))) !== null;
  return kept(join(door())) && kept(join(door({ inv: DOOR_ID }))) && !kept(join(door({ box: undefined }))) && !kept(join(door({ token: "x" })))
    && !kept(join(door({ door: "yes" }))) && !kept(join(door({ inv: "short" })))
    && !kept(Object.assign(join({ rt: RT, url: "https://relay.example.test", inv: DOOR_ID, token: "x", seal: "y" }), {}))
    && lib.relayKept({ rt: RT, url: "https://relay.example.test", inv: DOOR_ID, token: "x", seal: "y" }) === true;
};
/* The page: signed in, a seat held and no team, the door shows each door by host and print with one Join; Account's row the same;
   Polish too; a press asks the shell by the door's place. */
CASES.doorPage = async () => {
  if (!P) return false;
  const L = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const print = "0123456789abcdef";
  const v = P.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", reached: true, keeps: true,
    doors: [{ n: 0, host: "relay.example.test", print }, { n: 1, host: "x".repeat(300), print }, { n: "2", host: "a", print }] });
  const d = P.signinDoor(v), html = d ? P.signinPanelHtml(d) : "";
  const plain = P.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", reached: true, keeps: true });
  return v.doors.length === 1 && !!d && d.moment === "doors" && html.indexOf('data-signin-act="door" data-signin-door="0"') > 0
    && html.indexOf("relay.example.test") > 0 && html.indexOf(print) > 0 && P.signinDoor(plain).moment === "noteam"
    && d.heading === "A team on this licence" && html.indexOf(">Ask to join</button>") > 0 && html.indexOf(">Join</button>") < 0
    && /\n  "A team on this licence":"Zespół w tej licencji",/.test(L) && /\n  "Ask to join":"Poproś o dołączenie",/.test(L) && !/\n  "Join":/.test(L)
    && /\n  "This licence has a team on the relay\. If the team's lead has admitted this account before, asking to join lets this computer in once the lead's Studio sees the request; otherwise the lead can send an invitation\.":"[^"]+",/.test(L)
    /* No placeholder left on the door's own lines; another feature's (the sign-in lab's "Lab") is not this case's. */
    && !PAGE.split("\n").some(l => /placeholder: Claudette/.test(l) && !/^const SIGNIN_NAMES=/.test(l.trim())) && /signinDoorsHtml\(v\.doors\)/.test(SETTINGS) && /signinDoor: \(n\) => ipcRenderer\.invoke\("etiuda:signin-door", n\)/.test(PRELOAD)
    && /if\(act==="door"\)\{[\s\S]{0,200}signinCall\("signinDoor", n\)/.test(PAGE);
};
/* A press the shell refused at the door ({refused: "door"}: the door no longer offered, or this desk already in a team) is said
   where it was pressed, the panel's door and Account's team row, Polish too; a press taken says nothing, and the next act clears it. */
const DOOR_REFUSED = "This team is no longer offered here, or this computer is already in a team, so nothing was sent.";
const DOOR_REFUSED_PL = "Ten zespół nie jest już tu proponowany albo ten komputer należy już do zespołu, więc nic nie wysłano.";
CASES.doorRefusedSaid = async () => {
  if (!P || typeof P.signinDoorRefusedNow !== "function") return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const el = () => ({ hidden: true, dataset: {}, innerHTML: "", title: "", classList: { toggle() {} }, setAttribute() {}, focus() {}, contains: () => false });
  const dom = { "#signinWrap": el(), "#signinBtn": el(), "#signinPanel": el() };
  const signed = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", reached: true, keeps: true };
  const withDoor = Object.assign({ doors: [{ n: 0, host: "relay.example.test", print: "0123456789abcdef" }] }, signed);
  const btn = { getAttribute: k => (k === "data-signin-door" ? "0" : null) };
  const press = async answer => {
    let now = withDoor;
    const asked = [];
    globalThis.window = { E_HOST: { signinState: () => now, signinDoor: n => { asked.push(n); now = signed; return Promise.resolve(answer); } } };
    globalThis.document = { querySelector: q => dom[q] || null };
    try { await P.signinAct("door", btn); return { asked, panel: P.signinPanelHtml(P.signinDoor(P.signinRead(now))) }; }
    finally { delete globalThis.window; delete globalThis.document; }
  };
  const refused = await press({ view: true, refused: "door" });
  const said = P.signinDoorRefusedNow() === true;
  storage.lsSet("eUiLang", "pl");
  let pl = "";
  try { pl = P.signinPanelHtml(P.signinDoor(P.signinRead(signed))); } finally { storage.lsSet("eUiLang", "en"); }
  const acct = await acctOf(signed);
  globalThis.document = { querySelector: q => dom[q] || null };
  try { P.signinAct("keep"); } finally { delete globalThis.document; }
  const cleared = P.signinDoorRefusedNow() === false && P.signinPanelHtml(P.signinDoor(P.signinRead(signed))).indexOf(DOOR_REFUSED) < 0
    && (await acctOf(signed)).indexOf(DOOR_REFUSED) < 0;
  const taken = await press({ view: true });
  return refused.asked.join() === "0" && said && refused.panel.indexOf("<b>" + DOOR_REFUSED + "</b>") > 0 && pl.indexOf("<b>" + DOOR_REFUSED_PL + "</b>") > 0
    && acct.indexOf(DOOR_REFUSED) > 0 && cleared && taken.asked.join() === "0" && P.signinDoorRefusedNow() === false && taken.panel.indexOf(DOOR_REFUSED) < 0;
};
/* A join at the door the relay or the lead turned away ("turned", the channel's word for the relay's not-enrolled at the door), or
   refused as removed, knocks no more; the channel's word is kept on a door join alone, never on an invitation's; the envelope keeps
   it; the page is told. */
CASES.doorEnded = (s, swap) => {
  let main = MAIN;
  if (swap) {
    if (main.split(swap[0]).length !== 2) throw new Error("plant anchor not in the shell once: " + swap[0]);
    main = main.replace(swap[0], swap[1]);
  }
  const lift = (src, start) => { try { return decl(src, start); } catch { return ""; } };
  const doorText = ["function signinDoorInvite(", "function signinDoorKept("].map(d => lift(main, d)).filter(Boolean).join("\n");
  const ask = join => new Function(...DOOR_STANDS, doorText + "\nreturn { signinDoorInvite };")(join, () => ({ held: heldOf() }),
    () => ({ id: DESK_ID, key: DESK_KEY, box: DESK_BOX }), s.signinCertOk, s.signinDoorRequest, () => {}, null, null, fs, path, { now: () => NOW }, console,
    s.signinDoorAddressOk, true)
    .signinDoorInvite(TEAM, RT);
  const knocks = !!ask(doorJoin()) && ask(doorJoin({ inv: DOOR_ID })) !== null;
  const quiet = ask(doorJoin({ end: "turned" })) === null && ask(doorJoin({ inv: DOOR_ID, end: "removed" })) === null;
  const run = lift(main, "function relayRun(");
  const a = run.indexOf("\n    onInviteEnd: kind => {"), b = a < 0 ? -1 : run.indexOf("\n    },", a);
  if (a < 0 || b < 0) return false;
  const tells = [];
  const endOf = join => {
    const fn = new Function("teamJoin", "team", "persistDeskEnvelope", "sendJoin", "theWindow", "return (" + run.slice(a + 18, b + 6) + ");")(
      join, TEAM, () => tells.push("kept"), () => tells.push("told"), null);
    fn("turned");
    return join.invite.relay.end;
  };
  const invitation = { team: TEAM, invite: { id: "2".repeat(16), relay: { rt: RT, inv: "5".repeat(32), token: "x", seal: "y" } } };
  const kept = endOf(doorJoin({ inv: DOOR_ID })) === "turned" && tells.join() === "kept,told" && endOf(invitation) === undefined && tells.length === 2;
  const lib = new Function("SEALED_TEAM_RE", "JOIN_HEX_RE", KEPT_DECLS.map(d => lift(main, d)).filter(Boolean).join("\n") + "\nreturn { relayKept };")(/^t-[0-9a-f]{16}$/, /^[0-9a-f]{64}$/);
  const door = { rt: RT, url: "https://relay.example.test", door: true, box: LEAD_BOX, inv: DOOR_ID };
  const envelope = lib.relayKept(Object.assign({}, door, { end: "turned" })) === true && lib.relayKept(Object.assign({}, door, { end: "gone" })) === false
    && lib.relayKept({ rt: RT, url: "https://relay.example.test", inv: DOOR_ID, token: "x", seal: "y", end: "turned" }) === false;
  return knocks && quiet && kept && envelope;
};

/* A door names one of the relays this build trusts (DOOR_RELAYS), and is a channel by the desk's own rule, teamChannelOf, which an
   invitation's address alone still meets. Every row of tests/door-relays.json, the samples the licence service is held to as well, is
   answered as the row says: kept from the service's answer (signinSeat with the desk's flag, and signinAnswer), filed, offered and
   knocked at, installed and unpackaged; an invitation on it read or not. The installed list is the built-in relay alone. With
   teamChannelOf narrowed in memory a trusted door goes too; one untrusted door empties the list. The desk's flag is installed or
   packaged, and the wiring hands it to every caller. A plant is put where its anchor is. */
const DOOR_SAMPLES = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "door-relays.json"), "utf8")); } catch { return null; } })();
const DOOR_RULE_TIGHT = ["c.url.length > 512 ||", "c.url.length > 20 ||"];
CASES.doorAddress = async (s, swap) => {
  const rows = DOOR_SAMPLES && DOOR_SAMPLES.kind === "etiuda-door-relays" && Array.isArray(DOOR_SAMPLES.doors) ? DOOR_SAMPLES.doors : [];
  if (!JOIN_LIB || rows.length < 8) return false;
  const inSec = !!swap && SECTION.split(swap[0]).length === 2;
  const base = inSec ? load(swap) : s, tight = load(inSec ? swap : null, undefined, DOOR_RULE_TIGHT);
  const wire = inSec ? null : swap;
  const holds = text => !!wire && text.split(wire[0]).length === 2;
  const doorWire = holds(DOOR_DECLS.map(d => tryDeclText(d)).join("\n")) ? wire : null;
  const joinWire = holds(DOORJOIN_DECLS.map(d => tryDeclText(d)).join("\n")) ? wire : null;
  const wiring = !doorWire && !joinWire && holds(WIRING) ? WIRING.replace(wire[0], wire[1]) : WIRING;
  if (wire && !doorWire && !joinWire && wiring === WIRING) throw new Error("plant anchor not in the section or the door's wiring once: " + wire[0]);
  const lead = { keyId: "studio-1", public: "a".repeat(64), name: "Lead" };
  const invited = (t, url) => !!t.inviteRead("etiuda-join:" + b64url(JSON.stringify({ team: TEAM, secret: "0".repeat(32), lead,
    relay: { rt: RT, url, token: "c".repeat(64), inv: "5".repeat(32) } })), false);
  /* A door at each sample address, most of which the service refuses at door/set and so never hands: stray, on purpose (ds23d). */
  const served = url => strayAnswer({ ok: true, code: CODE, certificate: cert(), doors: [doorOf({ url })] });
  const kept = async (t, url, packed) => t.signinAnswer(served(url), DESK_KEY, packed).doors.length === 1;
  const seated = async (t, url, packed) => {
    const r = await t.signinSeat({ serviceAsk: async () => served(url), sign: signWith(signKey), packed }, "google", DESK_KEY, jwt(gClaims("n")), "3".repeat(64), () => NOW);
    return r.ok === true && r.doors.length === 1;
  };
  const filed = async (t, url, packed) => { const h = t.signinFileRead(t.signinFileText({ held: heldOf({ doors: [doorOf({ url })] }) }), packed).held; return !!h && h.doors.length === 1; };
  const offered = async (t, url, packed) => {
    const st = doorJoinStand({ held: heldOf({ doors: [doorOf({ url })] }), addressOk: t.signinDoorAddressOk, packed });
    return loadDoorJoin(base, st, joinWire).signinDoorsShown(st.held, NOW).length === 1;
  };
  const knocks = async (t, url, packed) => {
    const st = doorStand(doorJoin({ url }));
    st.addressOk = t.signinDoorAddressOk; st.packed = packed;
    return !!loadDoor(base, st, doorWire).signinDoorInvite(TEAM, RT);
  };
  const ways = [kept, seated, filed, offered, knocks];
  const answers = async (t, url, packed) => { const out = []; for (const fn of ways) out.push(await fn(t, url, packed)); return out; };
  let rowsHold = true;
  for (const r of rows) {
    const inst = await answers(base, r.url, true), unp = await answers(base, r.url, false), none = await answers(base, r.url, undefined);
    rowsHold = rowsHold && invited(base, r.url) === r.invitation && inst.every(v => v === r.installed) && unp.every(v => v === r.unpackaged)
      && none.every(v => v === r.installed);
  }
  const spread = rows.some(r => r.installed) && rows.some(r => !r.installed && r.unpackaged) && rows.some(r => !r.unpackaged && r.invitation)
    && rows.every(r => !r.installed || r.unpackaged);
  const shipped = !!base.DOOR_RELAYS && JSON.stringify(base.DOOR_RELAYS.installed) === JSON.stringify([base.BUILTIN_RELAY_URL]);
  let narrowed = true;
  for (const r of rows.filter(x => x.unpackaged)) narrowed = narrowed && !invited(tight, r.url) && (await answers(tight, r.url, false)).every(v => v === false);
  const trusted = rows.find(r => r.installed), foreign = rows.find(r => !r.unpackaged && r.invitation);
  const both = base.signinAnswer(answer({ ok: true, code: CODE, certificate: cert(), doors: [doorOf({ url: trusted.url }), doorOf({ url: foreign.url })] }), DESK_KEY, false);
  /* The desk's flag at start, and the wiring handing it to the file's read and to the service's io. */
  const at = wiring.indexOf("/* plant:door-packed */"), line = at < 0 ? "" : wiring.slice(wiring.lastIndexOf("\n", at) + 1, at);
  const flag = (installed, packaged) => { try { return new Function("INSTALLED", "app", line + "\nreturn SIGNIN_DESK_PACKED;")(installed, { isPackaged: packaged }); } catch { return null; } };
  const flagged = flag(true, false) === true && flag(false, true) === true && flag(true, true) === true && flag(false, false) === false;
  const handed = /\n  signinStore = signinFileRead\(text, SIGNIN_DESK_PACKED\);/.test(wiring) && /\n    packed: SIGNIN_DESK_PACKED,/.test(wiring);
  return rowsHold && spread && shipped && narrowed && both.ok === true && both.doors.length === 0 && flagged && handed;
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
    && x.heldThen === true && st.store.held === null && st.saves === 2 && st.tells === 1 && st.store.out === undefined && !!view && view.signedIn === "" && w.wrote() === "";
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
    /* A 200 is the service's taking, whatever its body (signoutAsk). */
    const taken = serve === serves[serves.length - 1];
    const owed = taken ? st.saves === 2 && st.tells === 1 && st.store.out === undefined : st.saves === 1 && st.tells === 2 && st.store.out === DESK_KEY;
    every = every && st.sent.length === 1 && st.store.held === null && owed && !!view && view.signedIn === "" && w.said() === "" && w.wrote() === "";
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
  "SIGNIN_PROVIDERS", "branchIdentity", "net", "signinIo", "signinRun", "signinSeat", "signinTake", "signinFlush", "signinSave", "tellSignin",
  "signinPageOk", "sealsForReal", "safeStorage"];
function pressStand(sec, swap) {
  const st = { on: {}, handle: {}, out: 0, tells: 0 };
  const viewDecl = (() => { try { return decl(MAIN, "function signinView("); } catch { return ""; } })();
  let text = [viewDecl, ipcSlice('ipcMain.on("etiuda:signin-click"'), ipcSlice('ipcMain.handle("etiuda:signin",')].join("\n");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const out = () => { st.out++; throw new Error("a door out was reached"); };
  const body = "let signinClick = null, signinBusy = null, signinSaid = \"\", signinOutFlight = null;\n" + text + "\nreturn { view: signinView };";
  const r = new Function(...PRESS_STANDS, body)({ on: (ch, fn) => { st.on[ch] = fn; }, handle: (ch, fn) => { st.handle[ch] = fn; } }, () => true, 2000,
    () => ({ held: null }), sec.signinLapsed, sec.signinOffered, sec.signinPreviewing, sec.signinKnown, sec.SIGNIN_PROVIDERS,
    () => { st.out++; return { id: DESK_ID, key: DESK_KEY }; }, { fetch: out }, out, out, out, out, out, out, () => { st.tells++; },
    sec.signinPageOk, sec.sealsForReal, undefined);
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
  /* The words as read, the markup that sets the first sentence apart taken away. */
  const words = h => String(h).replace(/<[^>]*>/g, "");
  const html = typeof P.signinPreviewHtml === "function" ? P.signinPreviewHtml(P.signinRead(on)) : "";
  storage.lsSet("eUiLang", "pl");
  let pl = {}, plA = "";
  try { pl = word(Object.assign({}, on, { said: "signin-preview" })); plA = acct(on); } finally { storage.lsSet("eUiLang", "en"); }
  return before.moment === "before" && before.preview === PREVIEW_LINE && pressed.moment === "refused" && pressed.heading === PREVIEW_PRESSED
    && !pressed.line && pressed.preview === undefined && plain.preview === undefined && P.signinRead({ offered: [], preview: true }).preview === false
    && /data-signin-preview/.test(html) && words(html).indexOf(PREVIEW_LINE) >= 0
    && /data-signin-preview/.test(a) && words(a).indexOf(PREVIEW_LINE) >= 0 && words(aPressed).indexOf(PREVIEW_PRESSED) >= 0 && words(aPressed).indexOf(PREVIEW_LINE) < 0
    && !/data-signin-preview/.test(aOff) && /data-e-open="signin" data-e-provider="google"/.test(aOff)
    && pl.heading === PREVIEW_PRESSED_PL && pl.preview === undefined && words(plA).indexOf(PREVIEW_LINE_PL) >= 0;
};
/* Not shipped: tools/signin-preview.cmd is outside electron-builder's files; read, never run (run, it starts the installed desk):
   per-user first, then all-users, the variable set once for that one start, no setx, no registry. */
/* The line as the product designer placed it: "Preview only." in the ink at 600, the rest the caption's own; in the panel under its
   line (or its heading after a press) and before the providers' buttons, 12 px above and 10 px below; in Account before the buttons
   at the card's full measure, 10 px below. */
CASES.previewLook = async () => {
  if (!P || typeof P.signinPanelHtml !== "function") return false;
  const SET = await import(pathToFileURL(path.join(ROOT, "src", "modules", "settings.js")).href);
  const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {},
    E_HOST: { signinState: () => ({ offered: ["microsoft", "google"], preview: true }) } };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  let acct = "";
  try { acct = SET.settingsPageHtml("account", ""); } finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
  const on = { offered: ["microsoft", "google"], preview: true };
  const before = P.signinPanelHtml(P.signinDoor(P.signinRead(on))), pressed = P.signinPanelHtml(P.signinDoor(P.signinRead(Object.assign({}, on, { said: "signin-preview" }))));
  const LINE = '<p class="sgn-cap sgn-preview" data-signin-preview><b>Preview only.</b> <span>Sign-in is not set up yet, so nothing here is sent.</span></p>';
  const css = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  return before.indexOf('</p>' + LINE + '<div class="sgn-provs">') > 0 && /^<h4>[^<]*<\/h4><p class="sgn-lede">/.test(before)
    && pressed.indexOf("<h4>" + PREVIEW_PRESSED + "</h4>") === 0 && pressed.indexOf("data-signin-preview") < 0
    && acct.indexOf("<div>" + LINE + '<div class="sgn-provs sgn-row">') > 0
    && css.indexOf(".sgn-cap.sgn-preview b{color:var(--ink);font-weight:600}") >= 0 && !/\.sgn-cap\.sgn-preview\{[^}]*font-weight:600/.test(css)
    && css.indexOf(".sgn-lede:has(+ .sgn-preview){margin-bottom:12px}") >= 0 && css.indexOf(".sgn-panel .sgn-preview{margin:12px 0 10px}") >= 0
    && css.indexOf(".sgn-top .sgn-preview{max-width:none;margin:0 0 10px}") >= 0;
};
/* After a press: the heading is the line, so no preview line under it, and its one act is Back, an ordinary button back to the door's
   choice, never Try again. The providers' row in Account carries no class the header's own .row rules reach (its -10px top margin
   swallowed the line's 10px below, measured 0px in a headless Chrome over the built CSS). */
CASES.previewBack = () => {
  if (!P) return false;
  const on = { offered: ["microsoft", "google"], preview: true };
  const pressed = P.signinDoor(P.signinRead(Object.assign({}, on, { said: "signin-preview" })));
  const acts = pressed && pressed.acts ? pressed.acts : [];
  const rowHtml = P.signinProvidersHtml(["microsoft", "google"], true);
  const css = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  return acts.length === 1 && acts[0].act === "choose" && acts[0].label === "Back" && !acts[0].solid
    && !/class="(?:[^"]*\s)?row(?:\s[^"]*)?"/.test(rowHtml) && /class="sgn-provs sgn-row"/.test(rowHtml)
    && css.indexOf(".sgn-provs.sgn-row{flex-direction:row;flex-wrap:wrap;width:fit-content;max-width:100%}") >= 0 && css.indexOf(".sgn-provs.row") < 0;
};
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

/* ---- Google's client secret (ds13) --------------------------------------------------------------------------------------- */
const STAND_IN = "stand-in-not-a-secret";
const SECRET_VAR = "ETIUDA_GOOGLE_CLIENT_SECRET";
const STEP = (() => { try { return createRequire(import.meta.url)(path.join(ROOT, "tools", "signin-secret.cjs")); } catch { return null; } })();
const G_SECRET = { id: "google", clientId: G_CLIENT, clientSecret: STAND_IN };
const formOf = buf => new URLSearchParams(buf.toString());
/* The tree as shipped holds no secret: every provider's clientSecret is "", and nothing is offered with one. */
CASES.secretTable = s => {
  const ids = Object.keys(s.SIGNIN_PROVIDERS || {});
  return ids.length === 2 && ids.every(id => Object.prototype.hasOwnProperty.call(s.SIGNIN_PROVIDERS[id], "clientSecret") && s.SIGNIN_PROVIDERS[id].clientSecret === "")
    && s.signinOffered(configured(s)).every(p => p.clientSecret === "");
};
/* Sent only when present: the code exchange and the refresh carry client_secret where the provider has one, and without one every
   byte of the form is the one written here from the names the forms had before the secret existed. */
CASES.secretSent = async s => {
  const pending = { redirect: "http://127.0.0.1:50000", verifier: "v".repeat(43) };
  const code = formOf(s.signinCodeForm(G_SECRET, pending, "c1")), refresh = formOf(s.signinRefreshForm(G_SECRET, "rt"));
  const plainCode = s.signinCodeForm(G, pending, "c1").toString(), plainRefresh = s.signinRefreshForm(G, "rt").toString();
  const emptyCode = s.signinCodeForm(Object.assign({}, G, { clientSecret: "" }), pending, "c1").toString();
  const wantCode = new URLSearchParams({ client_id: G_CLIENT, grant_type: "authorization_code", code: "c1", redirect_uri: pending.redirect,
    code_verifier: pending.verifier }).toString();
  const wantRefresh = new URLSearchParams({ client_id: G_CLIENT, grant_type: "refresh_token", refresh_token: "rt" }).toString();
  /* From the table and from a package: a table's own secret wins, a package's fills Google alone, Microsoft never takes one. */
  const offered = s.signinOffered(configured(s), { google: STAND_IN, microsoft: STAND_IN });
  const byTable = s.signinOffered({ google: Object.assign({}, configured(s).google, { clientSecret: STAND_IN + "-table" }) }, { google: STAND_IN });
  let asked = null;
  const io = {
    listen: async pageFor => { let yes; const caught = new Promise(a => { yes = a; }); setTimeout(() => yes(io.loopQ), 5); return { port: 49999, caught, close: () => {} }; },
    openPage: async url => { const q = new URL(url).searchParams; io.loopQ = "state=" + encodeURIComponent(q.get("state")) + "&code=abc"; io.nonce = q.get("nonce");
      io.authorize = url; return true; },
    tokenAsk: async (url, form) => { asked = formOf(form); return answer({ id_token: jwt(gClaims(io.nonce)) }); },
    page: () => "",
  };
  const got = await s.signinRun(io, offered.find(p => p.id === "google"), DESK_KEY, () => NOW);
  return code.get("client_secret") === STAND_IN && refresh.get("client_secret") === STAND_IN && code.get("code_verifier") === pending.verifier
    && plainCode === wantCode && plainRefresh === wantRefresh && emptyCode === wantCode
    && offered.find(p => p.id === "google").clientSecret === STAND_IN && offered.find(p => p.id === "microsoft").clientSecret === ""
    && byTable[0].clientSecret === STAND_IN + "-table"
    && got.ok === true && !!asked && asked.get("client_secret") === STAND_IN && io.authorize.indexOf(STAND_IN) < 0;
};
/* The package's file read: {format: 1, google} of a secret's shape gives Google's secret; anything else gives none. */
CASES.secretPacked = s => {
  const r = t => s.signinSecretRead(t);
  const ok = r(JSON.stringify({ format: 1, google: STAND_IN }));
  const spaced = "has a space", short = "short";
  return s.SIGNIN_SECRET_FILE === "signin-secret.json" && ok.google === STAND_IN && Object.keys(ok).join() === "google"
    && Object.keys(r(JSON.stringify({ format: 1, google: spaced }))).length === 0 && Object.keys(r(JSON.stringify({ format: 1, google: short }))).length === 0
    && Object.keys(r(JSON.stringify({ format: 2, google: STAND_IN }))).length === 0 && Object.keys(r(JSON.stringify({ format: 1, microsoft: STAND_IN }))).length === 0
    && Object.keys(r("")).length === 0 && Object.keys(r("not json")).length === 0 && Object.keys(r("[]")).length === 0
    && s.signinOffered().length === 0 && s.signinOffered(configured(s)).find(p => p.id === "google").clientSecret === "";
};
/* Never logged, kept or sent elsewhere: a first sign-in and a quiet renewal with the stand-in, every console method captured, find it
   in the token forms (so the search can find it) and nowhere else: not a line printed, not the service's bodies, which keep exactly
   their names, not what is kept in signin.json, not the outcomes. No line of the section or its wiring that prints names it. */
CASES.secretNever = async s => {
  const said = [], saved = {};
  for (const m of ["log", "error", "warn", "info", "debug"]) { saved[m] = console[m]; console[m] = (...a) => { said.push(a.map(String).join(" ")); }; }
  const forms = [], posted = [], urls = [];
  let first = null, renewed = null;
  try {
    const io = {
      listen: async () => { let yes; const caught = new Promise(a => { yes = a; }); setTimeout(() => yes(io.loopQ), 5); return { port: 49998, caught, close: () => {} }; },
      openPage: async url => { const q = new URL(url).searchParams; io.loopQ = "state=" + encodeURIComponent(q.get("state")) + "&code=abc"; io.nonce = q.get("nonce"); return true; },
      tokenAsk: async (url, form) => { urls.push(url); forms.push(form.toString()); return answer({ id_token: jwt(Object.assign(gClaims(io.nonce), { sub: "s-1" })), refresh_token: "rt-1" }); },
      serviceAsk: async (url, body) => { posted.push(JSON.stringify(body)); return answer({ ok: true, certificate: cert(), code: CODE, doors: [] }); },
      sign: signWith(signKey), keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""), page: () => "",
    };
    first = await s.signinRun(io, G_SECRET, DESK_KEY, () => NOW);
    const seat = first.ok ? await s.signinSeat(io, "google", DESK_KEY, first.idToken, first.seed, () => NOW) : null;
    io.nonce = undefined;
    renewed = await s.signinRenewHeld(io, G_SECRET, DESK_KEY, heldOf({ provider: "google" }), () => NOW);
    first = { first, seat };
  } finally { for (const m of Object.keys(saved)) console[m] = saved[m]; }
  const bodies = posted.map(b => Object.keys(JSON.parse(b)).join());
  const kept = s.signinFileText({ held: renewed && renewed.held });
  const prints = (SECTION + WIRING).split("\n").filter(l => /console\.(log|error|warn|info|debug)\(/.test(l));
  return forms.length === 2 && forms.every(f => formOf(f).get("client_secret") === STAND_IN) && urls.every(u => u === "https://oauth2.googleapis.com/token")
    && posted.length === 2 && bodies.join("|") === "provider,idToken,desk,seed,t,sig|provider,idToken,desk,t,sig"
    && renewed.said === "renewed" && prints.length > 0 && !prints.some(l => /secret|signinPacked/i.test(l))
    && [said.join("\n"), posted.join("\n"), kept, JSON.stringify(first), JSON.stringify(renewed)].every(t => t.indexOf(STAND_IN) < 0);
};
/* The shell reads the package's file once, at start, where it runs installed, beside the asar, through signinSecretRead, and takes
   it from nowhere else: no IPC, no page, and the environment's variable only inside the sign-in lab's read, which a desk installed
   or packaged never enters (ds16a). */
CASES.secretWire = () => {
  const reads = WIRING.split("\n").filter(l => /SIGNIN_SECRET_FILE/.test(l));
  const i = MAIN.indexOf("/* plant:lab-packaged */"), from = MAIN.lastIndexOf("\n", i) + 1, block = i < 0 ? "" : MAIN.slice(from, MAIN.indexOf("\n}\n", i));
  const envLines = MAIN.split("\n").filter(l => new RegExp("process\\.env\\b[^\\n]*" + SECRET_VAR).test(l));
  return reads.length === 1
    && /^if \(INSTALLED\) \{ try \{ signinPacked = signinSecretRead\(fs\.readFileSync\(path\.join\(String\(process\.resourcesPath \|\| ""\), SIGNIN_SECRET_FILE\), "utf8"\)\); \}/.test(reads[0])
    && /^if \(!INSTALLED && !app\.isPackaged && process\.env\.ETIUDA_SIGNIN_LAB\) \{/.test(block)
    && (MAIN.match(/(?<!let )signinPacked = /g) || []).length === 2 && (block.match(/signinPacked = /g) || []).length === 1
    && envLines.length === 1 && block.indexOf(envLines[0]) > 0 && !/ipcMain\.(on|handle)\([^\n]*secret/i.test(MAIN);
};
/* THE PACKAGE STEP (tools/signin-secret.cjs): unset, it writes nothing, removes a stale file and says "absent"; set, it writes the
   file the shell reads and says "present", never the value; a value of no secret's shape stops the pack without printing it. The
   config copies the file into resources only when the variable is set, both desks, and today's resources are otherwise unchanged.
   The file is git-ignored where the build writes it, and the module itself is not. The summary is read from the packaged resources. */
CASES.secretPackage = s => {
  if (!STEP) return false;
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-signin-secret-"));
  try {
    const out = path.join(lab, "dist"), at = STEP.signinSecretAt(out);
    const absent = STEP.signinSecretStep({}, out);
    const wroteNothing = !fs.existsSync(at) && !fs.existsSync(path.dirname(at));
    const present = STEP.signinSecretStep({ [SECRET_VAR]: STAND_IN }, out);
    const text = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : "";
    const readBack = s.signinSecretRead(text).google;
    const stale = STEP.signinSecretStep({ [SECRET_VAR]: "" }, out);
    const spaced = "has a space";
    let refused = "";
    try { STEP.signinSecretStep({ [SECRET_VAR]: spaced }, out); } catch (e) { refused = String(e && e.message); }
    const res = path.join(lab, "resources");
    fs.mkdirSync(res);
    const sumAbsent = STEP.signinSecretSummary(res);
    fs.writeFileSync(path.join(res, s.SIGNIN_SECRET_FILE), text);
    const sumPresent = STEP.signinSecretSummary(res);
    /* The config, loaded in a node of its own with and without the variable (it reads the environment once, at load). */
    const cfgWith = v => {
      const env = Object.assign({}, process.env, { ETIUDA_DIST: out });
      delete env[SECRET_VAR];
      if (v !== null) env[SECRET_VAR] = v;
      const r = spawnSync(process.execPath, ["-e", "const c = require(\"./electron-builder.js\"); process.stdout.write(JSON.stringify([c.win.extraResources, c.linux.extraResources]))"],
        { cwd: ROOT, env, encoding: "utf8" });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
    const off = cfgWith(null), on = cfgWith(STAND_IN);
    const entry = { from: at, to: s.SIGNIN_SECRET_FILE };
    const J = JSON.stringify;
    const ignored = p => spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status === 0;
    return STEP.SIGNIN_SECRET_FILE === s.SIGNIN_SECRET_FILE && STEP.SIGNIN_SECRET_VAR === SECRET_VAR && !!STEP.SHAPE && STEP.SHAPE.source === s.SIGNIN_SECRET_SHAPE.source
      && absent === "Google sign-in secret: absent" && wroteNothing && present === "Google sign-in secret: present" && readBack === STAND_IN
      && stale === "Google sign-in secret: absent" && !fs.existsSync(at) && !!refused && refused.indexOf(spaced) < 0 && !fs.existsSync(at)
      && sumAbsent === "Google sign-in secret: absent" && sumPresent === "Google sign-in secret: present"
      && !!off && !!on && J(on[0]) === J(off[0].concat([entry])) && J(on[1]) === J(off[1].concat([entry]))
      && !J(off).includes(s.SIGNIN_SECRET_FILE) && !J(on).includes(STAND_IN)
      && ignored("dist/.signin/" + s.SIGNIN_SECRET_FILE) && !ignored("tools/signin-secret.cjs");
  } finally { fs.rmSync(lab, { recursive: true, force: true }); }
};
/* No committed file carries a secret: every tracked file is searched for a Google secret's prefix and for a client secret written
   as a value, the stand-in alone allowed. The search is shown to find both shapes, built here at run time, before its silence counts. */
const SECRET_SHAPES = [new RegExp("GOC" + "SPX-[A-Za-z0-9_-]{8,}"),
  /\b(?:client_secret|clientSecret|ETIUDA_GOOGLE_CLIENT_SECRET)\b["']?\s*[:=]\s*["']([^"'\s]+)["']/g];
function secretsIn(text) {
  const hits = [];
  if (SECRET_SHAPES[0].test(text)) hits.push("prefix");
  for (const m of text.matchAll(SECRET_SHAPES[1])) if (m[1] !== STAND_IN) hits.push("value");
  return hits;
}
CASES.secretTree = () => {
  const ls = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = ls.status === 0 ? ls.stdout.split("\0").filter(Boolean) : [];
  const found = [];
  for (const f of files) {
    let text = "";
    try { text = fs.readFileSync(path.join(ROOT, f), "latin1"); } catch { continue; }
    if (secretsIn(text).length) found.push(f);
  }
  const q = "\"";
  const controls = [["GOC", "SPX-", "x".repeat(12)].join(""), "clientSecret: " + q + "x".repeat(12) + q, "client_secret=" + q + "y".repeat(12) + q,
    SECRET_VAR + "=" + q + "z".repeat(12) + q];
  if (found.length) console.log("  (a secret's shape in: " + found.join(", ") + ")");
  return files.length > 500 && found.length === 0 && controls.every(c => secretsIn(c).length > 0)
    && secretsIn("clientSecret: " + q + STAND_IN + q).length === 0 && secretsIn("clientSecret: " + q + q).length === 0;
};

/* ---- the sign-in follow-ups (ds14): the link while the browser is awaited, Linux's preview launcher, no keyring, the press's place - */
/* The shell around a real press with Microsoft configured: the view, the two press handlers and Cancel's, and signinIo, all sliced;
   the browser a stand-in that resolves and opens nothing, the loopback one that waits until closed and records the wait it was
   given; the provider, the service, a write and the network throw if reached. `storage` stands for safeStorage. */
function waitStand(sec, swap, storage, branchId) {
  const st = { on: {}, handle: {}, out: 0, told: [], handed: [], waits: [] };
  const tryDecl = s => { try { return decl(MAIN, s); } catch { return ""; } };
  let text = [tryDecl("function signinView("), tryDecl("function signinIo("), ipcSlice('ipcMain.on("etiuda:signin-click"'),
    ipcSlice('ipcMain.handle("etiuda:signin",'), ipcSlice('ipcMain.handle("etiuda:signin-stop"')].join("\n");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const out = () => { st.out++; throw new Error("a door out was reached"); };
  const vals = {
    ipcMain: { on: (ch, fn) => { st.on[ch] = fn; }, handle: (ch, fn) => { st.handle[ch] = fn; } }, fromEngine: () => true, LINK_CLICK_MS: 2000,
    signinState: () => st.state || ({ held: null }), signinLapsed: sec.signinLapsed, signinOffered: () => [MS], signinPreviewing: () => false,
    signinKnown: sec.signinKnown, SIGNIN_PROVIDERS: sec.SIGNIN_PROVIDERS, branchIdentity: branchId || (() => ({ id: DESK_ID, key: DESK_KEY })), net: { fetch: out },
    signinRun: sec.signinRun, signinSeat: out, signinTake: out, signinFlush: out, signinSave: out,
    tellSignin: () => { st.told.push(st.view()); }, signinPageOk: sec.signinPageOk, sealsForReal: sec.sealsForReal,
    safeStorage: storage === undefined ? { isEncryptionAvailable: () => true } : storage, http: {}, SIGNIN_WAIT_MS: sec.SIGNIN_WAIT_MS,
    signinListen: (h, pageFor, ms) => {
      st.waits.push(ms);
      let no = null;
      const caught = new Promise((yes, n) => { no = n; });
      caught.catch(() => {});
      return Promise.resolve({ port: 49152, caught, close: () => no({ closed: true }) });
    },
    handOut: url => { st.handed.push(url); return Promise.resolve(); },
    signinRequest: out, signinServiceAsk: out, signinSign: out, signinKeep: () => "", signinKept: () => "", signinPageHtml: () => "",
    SIGNIN_TRACE_ASKED: sec.SIGNIN_TRACE_ASKED, SIGNIN_DESK_PACKED: true,
  };
  const names = Object.keys(vals);
  const body = "let signinClick = null, signinBusy = null, signinSaid = \"\", signinOutFlight = null;\n" + text + "\nreturn { view: signinView };";
  st.view = new Function(...names, body)(...names.map(n => vals[n])).view;
  st.press = id => { st.on["etiuda:signin-click"]({ returnValue: undefined }, id); return st.handle["etiuda:signin"]({}, id); };
  return st;
}
const LINK_LINE = "Browser did not open? Paste this link into a browser on this computer.";
const LINK_LINE_PL = "Przeglądarka się nie otworzyła? Łącze można wkleić w przeglądarkę na tym komputerze.";
const UNKEPT_LINE = "No keyring is open on this computer, so the sign-in is not kept: each renewal asks for it again.";
/* The link while the browser is awaited, its browser call resolving and opening nothing: the view carries the provider's page the
   browser was handed, told to the page as the hand-out is made; the loopback is given SIGNIN_WAIT_MS and still waits; Cancel
   ends it as before and the link goes with the wait; no line written while it waited carries the link or its state. */
CASES.linkWait = async (s, swap) => {
  const st = waitStand(s, swap);
  const lines = [], keep = {};
  for (const k of ["log", "error", "warn", "info"]) { keep[k] = console[k]; console[k] = (...a) => { lines.push(a.map(String).join(" ")); }; }
  const writes = { o: process.stdout.write, e: process.stderr.write };
  process.stdout.write = (c, ...r) => { lines.push(String(c)); return true; };
  process.stderr.write = (c, ...r) => { lines.push(String(c)); return true; };
  let settled = false, during = null, ended = null, stopped = null, url = "";
  try {
    const press = st.press("microsoft");
    press.then(() => { settled = true; }, () => { settled = true; });
    await tick(40);
    during = st.view();
    url = st.handed[0] || "";
    stopped = await st.handle["etiuda:signin-stop"]({});
    ended = await press;
  } finally {
    for (const k of Object.keys(keep)) console[k] = keep[k];
    process.stdout.write = writes.o; process.stderr.write = writes.e;
  }
  const state = url ? new URL(url).searchParams.get("state") : "";
  const toldLink = st.told.filter(v => v.link === url);
  return st.handed.length === 1 && s.signinPageOk(url) && !!during && during.busy === "microsoft" && during.link === url && toldLink.length === 1
    && st.told.indexOf(toldLink[0]) <= 1 && st.waits.length === 1 && st.waits[0] === s.SIGNIN_WAIT_MS && s.SIGNIN_WAIT_MS === 5 * 60 * 1000
    && stopped === true && !!ended && ended.said === "signin-cancelled" && ended.busy === "" && ended.link === "" && st.out === 0
    && !!state && !lines.some(l => l.indexOf(url) >= 0 || l.indexOf(state) >= 0);
};
/* Settings, Account drawn as settings.js draws it over a host answering `v`, with desk-first-edition's empty document. */
async function acctOf(v, host) {
  const SET = await import(pathToFileURL(path.join(ROOT, "src", "modules", "settings.js")).href);
  const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: Object.assign({ signinState: () => v }, host || {}) };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  try { return SET.settingsPageHtml("account", ""); } finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
}
const LINK_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=" + MS_CLIENT + "&state=s1&nonce=n1";
/* The block in every waiting place, last, from the view alone: the panel after its acts, Account's card after Cancel; the link
   whole in the field, the line's two sentences, Copy; none outside a wait, none without a link, none in the preview's pressed state;
   Polish too. Copy hands the shell the link (the code's Copy the code), and nothing once the wait has ended. */
CASES.linkPage = async () => {
  if (!P || typeof P.signinLinkHtml !== "function") return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
  const waitV = { offered: ["microsoft", "google"], busy: "microsoft", link: LINK_URL };
  const d = P.signinDoor(P.signinRead(waitV)), panel = P.signinPanelHtml(d);
  const acct = await acctOf(waitV), acctNone = await acctOf({ offered: ["microsoft", "google"], busy: "microsoft" });
  const none = [view({ link: LINK_URL }), view({ busy: "microsoft" }), view({ preview: true, said: "signin-preview", link: LINK_URL }),
    view({ signedIn: "microsoft", code: CODE, seat: "held", link: LINK_URL })].map(v => P.signinPanelHtml(P.signinDoor(v)));
  const field = '<input type="text" class="sgn-link-f" readonly spellcheck="false" autocomplete="off" aria-label="Paste this link into a browser on this computer." value="'
    + LINK_URL.replace(/&/g, "&amp;") + '"><button type="button" class="btn sgn-copy" data-signin-act="copylink"><span>Copy</span><span>Copied</span></button>';
  storage.lsSet("eUiLang", "pl");
  let pl = "";
  try { pl = P.signinPanelHtml(P.signinDoor(P.signinRead(waitV))); } finally { storage.lsSet("eUiLang", "en"); }
  /* Copy, through the host's own-text note the code's Copy uses. */
  const copied = [];
  globalThis.window = { E_HOST: { noteOwnText: x => copied.push(x) } };
  globalThis.document = { querySelector: () => null };
  try {
    P.signinChanged(waitV, false); P.signinAct("copylink");
    P.signinChanged({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held" }, false); P.signinAct("copylink"); P.signinAct("copy");
    P.signinChanged({ offered: ["microsoft"] }, false);
  } finally { delete globalThis.window; delete globalThis.document; }
  return d.moment === "waiting" && d.link === LINK_URL && panel.indexOf('</button></div><div class="sgn-link" data-signin-link>') > 0
    && panel.indexOf(field) > 0 && words(panel).indexOf(LINK_LINE) >= 0 && panel.lastIndexOf("data-signin-link") > panel.lastIndexOf('data-signin-act="stop"')
    && none.every(h => !/data-signin-link/.test(h)) && /data-signin-act="stop">Cancel<\/button><\/span><div class="sgn-link" data-signin-link>/.test(acct)
    && acct.indexOf(field) > 0 && !/data-signin-link/.test(acctNone) && words(pl).indexOf(LINK_LINE_PL) >= 0
    && JSON.stringify(copied) === JSON.stringify([LINK_URL, CODE]);
};
/* As the product designer placed it: the line in the preview line's form, the field 6 px under it taking the width left, never
   wrapping, mono at the caption's size; the panel's block after a hairline 12 px above and below, Account's 12 px under its acts
   with the field at most 560 px; no colour, icon or box of its own; a click in the field selects all of it, in the panel and Account. */
CASES.linkLook = async () => {
  if (!P || typeof P.signinLinkSelect !== "function") return false;
  const css = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const html = P.signinLinkHtml(LINK_URL);
  let selected = 0;
  P.signinLinkSelect({ select() { selected++; } });
  P.signinLinkSelect(null);
  const rule = sel => { const at = css.indexOf("\n" + sel + "{"); return at < 0 ? "" : css.slice(at + sel.length + 2, css.indexOf("}", at)); };
  const own = rule(".sgn-link"), F = ".sgn-link input.sgn-link-f";
  return /^<div class="sgn-link" data-signin-link><p class="sgn-cap"><b>Browser did not open\?<\/b> <span>Paste this link into a browser on this computer\.<\/span><\/p><div class="sgn-link-row"><input [^>]*readonly[^>]*><button/.test(html)
    && !/<svg|<img/.test(html) && P.signinLinkHtml("") === "" && selected === 1
    && rule(".sgn-link .sgn-cap b") === "color:var(--ink);font-weight:600" && /^margin:0;/.test(rule(".sgn-link .sgn-cap"))
    && /margin-top:6px/.test(rule(".sgn-link-row")) && /display:flex/.test(rule(".sgn-link-row"))
    && /flex:1 1 auto;width:auto;min-width:0/.test(rule(F)) && /white-space:nowrap/.test(rule(F))
    /* Mono, 400, the dim ink, under a selector (0,2,1) the header's ".fill input" (0,1,1, which sets the sans face) cannot outrank. */
    && /font:400 12\.5px var\(--mono\)/.test(rule(F)) && /color:var\(--dim\)/.test(rule(F)) && css.indexOf("\n.sgn-link-f{") < 0 && css.indexOf("\n.fill input{") >= 0
    && rule(".sgn-panel .sgn-link") === "margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"
    && rule(".sgn-top .sgn-link") === "margin-top:-2px" && /gap:14px/.test(rule(".sgn-top.col")) && rule(".sgn-top .sgn-link-f") === "max-width:560px"
    && !/color|background|border|box-shadow/.test(own)
    && /closest\("\.sgn-link-f"\)[\s\S]{0,40}signinLinkSelect\(f\)/.test(PAGE) && /querySelectorAll\("\.sgn-link-f"\)\.forEach\(f=>\{ f\.onclick=\(\)=>signinLinkSelect\(f\); \}\)/.test(SETTINGS);
};
/* Not shipped: tools/signin-preview.sh is outside electron-builder's files; read, never run (run, it starts the installed desk): the
   installed .deb's program unless an AppImage is named, --where printing it and leaving before anything starts, the refusal where
   the program is missing or the desk is open, then one exec with the variable for that start alone; LF, as sh needs. */
CASES.previewSh = () => {
  const { minimatch } = createRequire(import.meta.url)("minimatch");
  const cfgText = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8"), fa = cfgText.indexOf("files: [");
  const files = fa < 0 ? [] : new Function("return " + cfgText.slice(fa + 7, cfgText.indexOf("],", fa) + 1))();
  const shipped = p => { let inc = false; for (const pat of files) { const neg = pat.startsWith("!"); if (minimatch(p, neg ? pat.slice(1) : pat, { dot: true })) inc = !neg; } return inc; };
  const at = path.join(ROOT, "tools", "signin-preview.sh"), text = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : "";
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !/^#/.test(l));
  const ORDER = ["set -u", 'if [ "${1:-}" = "--where" ]; then where=1; shift; fi', 'exe="${1:-/opt/Etiuda/etiuda}"', 'if [ ! -x "$exe" ]; then', "exit 1",
    'if [ "$where" = 1 ]; then echo "$exe"; exit 0; fi', "if pgrep -x etiuda >/dev/null 2>&1; then", "exit 1", 'ETIUDA_SIGNIN_PREVIEW=1 exec "$exe"'];
  let from = -1;
  const inOrder = ORDER.every(s => { const i = lines.indexOf(s, from + 1); if (i < 0) return false; from = i; return true; });
  return !!text && text.indexOf("\r") < 0 && /^#!\/bin\/sh\n/.test(text) && files.length > 5 && shipped("shell/main.js") && !shipped("tools/release.mjs")
    && !shipped("tools/signin-preview.sh") && inOrder && lines[lines.length - 1] === 'ETIUDA_SIGNIN_PREVIEW=1 exec "$exe"'
    && lines.filter(l => /\bexec\b/.test(l)).length === 1 && lines.filter(l => /ETIUDA_SIGNIN_PREVIEW/.test(l)).length === 1
    && !lines.some(l => /\b(export|setx|reg|gsettings|xdg-open)\b/.test(l));
};
/* No keyring: the view says whether the system seals for real (sealsForReal over safeStorage), and Account's retired unkept line is gone. */
CASES.keyringLine = async (s, swap) => {
  const viewWith = storage => waitStand(s, swap, storage).view();
  const real = viewWith({ isEncryptionAvailable: () => true }), none = viewWith({ isEncryptionAvailable: () => false }), absent = viewWith(null);
  const signed = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held" };
  const words = h => String(h).replace(/<[^>]*>/g, "");
  const unkept = await acctOf(Object.assign({ keeps: false }, signed));
  const L = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  return real.keeps === true && none.keeps === false && absent.keeps === false && !!P && P.signinRead({}).keeps === true
    && words(unkept).indexOf(UNKEPT_LINE) < 0 && !/data-signin-unkept/.test(unkept) && !/data-signin-unkept/.test(SETTINGS)
    && L.indexOf(UNKEPT_LINE) < 0;
};
/* A provider pressed in Settings, Account is answered there alone: the header's panel stays shut; pressed in the panel, the answer
   opens it as before. */
CASES.accountPress = async () => {
  if (!P) return false;
  const el = () => ({ hidden: true, dataset: {}, innerHTML: "", title: "", classList: { toggle() {} }, setAttribute() {}, focus() {}, contains: () => false });
  const dom = { "#signinWrap": el(), "#signinBtn": el(), "#signinPanel": el() };
  const answer = { offered: ["microsoft", "google"], preview: true, said: "signin-preview" };
  globalThis.window = { E_HOST: { signinState: () => ({ offered: ["microsoft", "google"], preview: true }), signIn: () => Promise.resolve(answer) } };
  globalThis.document = { querySelector: q => dom[q] || null };
  let fromAccount = null, fromPanel = null;
  try {
    P.signinChanged({ offered: ["microsoft", "google"], preview: true }, false);
    P.signinStart("microsoft", "account");
    await tick(5);
    fromAccount = dom["#signinPanel"].hidden;
    P.signinStart("google");
    await tick(5);
    fromPanel = dom["#signinPanel"].hidden;
  } finally { delete globalThis.window; delete globalThis.document; }
  return fromAccount === true && fromPanel === false && /signinStart\(b\.getAttribute\("data-e-provider"\), "account"\)/.test(SETTINGS);
};
/* "Copied" on screen (the product designer's edit to the built block): the code's Copy and the link's are one button, its two
   labels stacked in one cell so it keeps the wider width; a copy the clipboard took turns it to "Copied" for SIGNIN_COPIED_MS, then
   back; a copy refused leaves it; no toast, tick or colour; Polish "Skopiowano". */
CASES.copiedLabel = async () => {
  if (!P || typeof P.signinCopyHtml !== "function") return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const css = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const rule = sel => { const at = css.indexOf("\n" + sel + "{"); return at < 0 ? null : css.slice(at + sel.length + 2, css.indexOf("}", at)); };
  const BTN = act => '<button type="button" class="btn sgn-copy" data-signin-act="' + act + '"><span>Copy</span><span>Copied</span></button>';
  const signed = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held" };
  const noteam = P.signinPanelHtml(P.signinDoor(P.signinRead(signed))), acct = await acctOf(signed);
  storage.lsSet("eUiLang", "pl");
  let pl = "";
  try { pl = P.signinCopyHtml("copy"); } finally { storage.lsSet("eUiLang", "en"); }
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const btn = () => { const set = new Set(); return { set, classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) } }; };
  let took = true;
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: () => took ? Promise.resolve() : Promise.reject(new Error("refused")) } }, configurable: true, writable: true });
  globalThis.window = { isSecureContext: true, E_HOST: { noteOwnText() {} } };
  globalThis.document = { querySelector: () => null };
  const code = btn(), refused = btn(), link = btn();
  let during = false, after = true, linkDuring = false;
  try {
    P.signinChanged(signed, false);
    await P.signinAct("copy", code);
    during = code.set.has("sgn-done");
    took = false; await P.signinAct("copy", refused); took = true;
    P.signinChanged({ offered: ["microsoft"], busy: "microsoft", link: LINK_URL }, false);
    await P.signinAct("copylink", link);
    linkDuring = link.set.has("sgn-done");
    await tick(P.SIGNIN_COPIED_MS + 80);
    after = code.set.has("sgn-done") || link.set.has("sgn-done");
    P.signinChanged({ offered: ["microsoft"] }, false);
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator;
    delete globalThis.window; delete globalThis.document;
  }
  return P.SIGNIN_COPIED_MS === 1500 && P.signinCopyHtml("copy") === BTN("copy") && noteam.indexOf(BTN("copy")) > 0 && acct.indexOf(BTN("copy")) > 0
    && P.signinLinkHtml(LINK_URL).indexOf(BTN("copylink")) > 0 && pl.indexOf("<span>Kopiuj</span><span>Skopiowano</span>") > 0
    && during && !refused.set.has("sgn-done") && linkDuring && !after
    && rule(".sgn-copy") === "display:inline-grid;justify-items:center" && rule(".sgn-copy>span") === "grid-area:1/1"
    && rule(".sgn-copy>span+span,.sgn-copy.sgn-done>span:first-child") === "visibility:hidden" && rule(".sgn-copy.sgn-done>span+span") === "visibility:visible"
    && !/toast|offerUndo/.test(PAGE.slice(PAGE.indexOf("function signinCopied("), PAGE.indexOf("function signinAct(")));
};
/* The identity with no name written (the product designer): the bold line is "Signed in with <provider>" and there is no second
   line, in the panel in every signed-in moment and in Account's card; with a name written, the name over that line. Every provider
   alike, and Polish. */
CASES.identNoName = async () => {
  if (!P) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const lines = h => { const m = /<div class="sgn-id">[\s\S]*?<div>(<b>[^<]*<\/b>(?:<small>[^<]*<\/small>)?)<\/div><\/div>/.exec(String(h)); return m ? m[1] : ""; };
  const NAMES = { microsoft: "Microsoft", google: "Google" };
  const moments = { noteam: { seat: "held" }, nolicence: { seat: "none" }, noseat: { seat: "held", refused: "full" }, offline: { seat: "held", reached: false },
    lapsed: { seat: "lapsed" }, ask: { seat: "held", ask: true } };
  const was = storage.lsGet("eAgent");
  const seen = [];
  let named = [], pl = "";
  try {
    storage.lsDel("eAgent");
    for (const id of Object.keys(NAMES)) for (const m of Object.keys(moments)) {
      const v = Object.assign({ offered: [id], signedIn: id, code: CODE }, moments[m]);
      const d = P.signinDoor(P.signinRead(v)), sub = "Signed in with " + NAMES[id] + (v.reached === false ? " · service not reached just now" : "");
      seen.push(d.moment === m && lines(P.signinPanelHtml(d)) === "<b>" + sub + "</b>" && lines(await acctOf(v)) === "<b>" + sub + "</b>");
    }
    storage.lsSet("eUiLang", "pl");
    try { pl = lines(P.signinPanelHtml(P.signinDoor(P.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held" })))); } finally { storage.lsSet("eUiLang", "en"); }
    storage.lsSet("eAgent", "Ada");
    const v = { offered: ["google"], signedIn: "google", code: CODE, seat: "held" };
    named = [lines(P.signinPanelHtml(P.signinDoor(P.signinRead(v)))), lines(await acctOf(v))];
  } finally { if (was === null || was === undefined) storage.lsDel("eAgent"); else storage.lsSet("eAgent", was); }
  return seen.length === 12 && seen.every(Boolean) && pl === "<b>Zalogowano przez Microsoft</b>"
    && named.every(h => h === "<b>Ada</b><small>Signed in with Google</small>");
};
/* One order in the panel (the product designer): the fact, its line, then the code; no licence's refusal stands over the code's box
   as no team's heading and line do, under the identity and above the acts. */
CASES.panelOrder = () => {
  if (!P) return false;
  const inOrder = (h, keys) => keys.map(k => h.indexOf(k)).every((at, i, a) => at >= 0 && (i === 0 || at > a[i - 1]));
  return ["microsoft", "google"].every(id => {
    const nolicence = P.signinPanelHtml(P.signinDoor(view({ signedIn: id, code: CODE, seat: "none" })));
    const noteam = P.signinPanelHtml(P.signinDoor(view({ signedIn: id, code: CODE, seat: "held" })));
    return inOrder(nolicence, ['class="sgn-id"', 'class="sgn-say"', 'class="sgn-code"', 'class="sgn-acts"'])
      && inOrder(noteam, ['class="sgn-id"', "<h4>", 'class="sgn-lede"', 'class="sgn-code"', 'class="sgn-acts"']);
  });
};

/* ---- the sign-in lab (ds15) ---------------------------------------------------------------------------------------------
   ETIUDA_SIGNIN_LAB names a lab file, which a desk neither installed nor packaged takes at start: a third provider, "lab", and the
   service's door at the lab's. Its addresses here are the provider double's as Studio's tools/oidc-lab.mjs makes them. */
const LAB_ROOT = "d".repeat(64), LAB_CLIENT = "lab-client-0123456789";
function labFile(port, over, pover) {
  const at = "http://127.0.0.1:" + port, named = "https://oidc-lab.localhost:" + port;
  return Object.assign({ provider: Object.assign({ id: "lab", issuer: named, authorize: at + "/authorize", token: at + "/token", jwks: named + "/jwks",
    clientId: LAB_CLIENT, scope: "openid profile offline_access" }, pover), service: at + "/licence/v1/", root: LAB_ROOT }, over);
}
const labText = (port, over, pover) => JSON.stringify(labFile(port, over, pover));
/* The file taken whole, its provider shaped as the shipped two are and the two doors under its service; refused whole where any
   part is not its shape: the lab's addresses on any host but 127.0.0.1 (the issuer and the key set: or https on a .localhost name),
   the service anywhere but http on 127.0.0.1 or https on etiuda.dev, a client id for any provider but the shipped two. */
const STAGING = "https://etiuda.dev/licence-staging/v1/";
const stagingText = over => JSON.stringify(Object.assign({ service: STAGING, clientIds: { microsoft: MS_CLIENT, google: G_CLIENT } }, over));
CASES.labRead = s => {
  const r = s.signinLabRead(labText(4567)), st = s.signinLabRead(stagingText());
  const good = !!r && r.provider.clientId === LAB_CLIENT && r.provider.clientSecret === "" && r.provider.authorize === "http://127.0.0.1:4567/authorize"
    && r.provider.token === "http://127.0.0.1:4567/token" && r.provider.issuer === "https://oidc-lab.localhost:4567" && r.provider.refreshScope === ""
    && Object.keys(r.provider.extra).length === 0 && r.signin === "http://127.0.0.1:4567/licence/v1/signin/desk"
    && r.signout === "http://127.0.0.1:4567/licence/v1/signout/desk" && Object.isFrozen(r) && Object.isFrozen(r.provider) && Object.keys(r.clientIds).length === 0
    && !!st && st.provider === null && st.clientIds.microsoft === MS_CLIENT && st.clientIds.google === G_CLIENT && Object.isFrozen(st.clientIds)
    && st.signin === STAGING + "signin/desk" && st.signout === STAGING + "signout/desk";
  const also = [labText(4567, { root: undefined }), labText(4567, {}, { jwks: undefined }), labText(4567, {}, { clientSecret: "" }),
    labText(4567, {}, { clientSecret: STAND_IN }), labText(4567, {}, { issuer: "http://127.0.0.1:4567" }), labText(4567, { service: "https://etiuda.dev/licence/v1/" }),
    labText(4567, { clientIds: { google: G_CLIENT } }), stagingText({ clientIds: { microsoft: MS_CLIENT } }), stagingText({ clientIds: undefined }),
    stagingText({ root: LAB_ROOT }), stagingText({ service: "https://staging.etiuda.dev/licence/v1/" })].every(t => !!s.signinLabRead(t));
  const taken = [
    "", "not json", "[]", JSON.stringify({ provider: null }), labText(4567, {}, { id: "microsoft" }), labText(4567, {}, { id: undefined }),
    labText(4567, {}, { authorize: "http://192.168.1.20:4567/authorize" }), labText(4567, {}, { token: "http://localhost:4567/token" }),
    labText(4567, {}, { token: "http://127.0.0.1.example.test:4567/token" }), labText(4567, {}, { authorize: "https://login.example.test/authorize" }),
    labText(4567, { service: "http://10.0.0.5:4567/licence/v1/" }), labText(4567, { service: "http://etiuda.dev/licence/v1/" }),
    labText(4567, { service: "https://elsewhere.example.test/licence/v1/" }), labText(4567, { service: "https://etiuda.dev.example.test/licence/v1/" }),
    labText(4567, { service: "https://etiuda.dev:8443/licence/v1/" }), labText(4567, { service: "https://etiuda.dev/licence/v1" }),
    labText(4567, { service: "http://127.0.0.1:4567/licence/v1" }), labText(4567, { service: undefined }), labText(4567, {}, { issuer: "http://192.168.1.20:4567" }),
    labText(4567, {}, { issuer: "https://issuer.example.test" }), labText(4567, {}, { jwks: "http://192.168.1.20:4567/jwks" }),
    labText(0), labText(65536), labText("04567"), labText(4567, {}, { authorize: "http://127.0.0.1/authorize" }),
    labText(4567, {}, { clientId: "short" }), labText(4567, {}, { clientSecret: STAND_IN.slice(0, 5) }), labText(4567, {}, { clientSecret: 7 }),
    labText(4567, {}, { scope: "profile" }), labText(4567, {}, { scope: "openid  profile" }), labText(4567, { root: "abc" }), labText(4567, { root: "D".repeat(64) }),
    stagingText({ clientIds: { lab: MS_CLIENT } }), stagingText({ clientIds: { microsoft: "short" } }), stagingText({ clientIds: { google: 7 } }),
    stagingText({ clientIds: [MS_CLIENT] }), stagingText({ clientIds: null }), stagingText({ provider: null }),
  ].filter(t => s.signinLabRead(t) !== null);
  return good && also && taken.length === 0;
};
const loadIn = swap => load(swap && SECTION.split(swap[0]).length === 2 ? swap : null);
/* The wiring's read of the lab file, evaluated with the shell's facts stood in (`facts`: installed, packaged, the variable's file,
   the environment's Google secret), `swap` put in its text: what it read and said; Google's secret it set is put in the section. */
function labStart(s, facts, swap) {
  const i = WIRING.indexOf("/* plant:lab-packaged */"), from = WIRING.lastIndexOf("\n", i) + 1, to = WIRING.indexOf("\n}\n", i) + 2;
  let text = i < 0 || to < 2 ? "" : WIRING.slice(from, to);
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const reads = [], said = [], env = {};
  if (facts.file !== undefined) env.ETIUDA_SIGNIN_LAB = facts.file;
  if (facts.secret !== undefined) env[SECRET_VAR] = facts.secret;
  const was = s.live().packed;
  const packed = new Function("INSTALLED", "app", "process", "fs", "console", "signinLabUse", "signinLabRead", "signinSecretRead", "signinPacked",
    text + "\nreturn signinPacked;")(facts.installed, { isPackaged: facts.packaged }, { env: env },
    { readFileSync: (p, enc) => { reads.push(String(p)); return fs.readFileSync(p, enc); } }, { error: l => said.push(String(l)) },
    s.signinLabUse, s.signinLabRead, s.signinSecretRead, was);
  if (packed !== was) s.setPacked(packed);
  return { reads, said, text };
}
/* THE FLOOR: installed, packaged or both, the variable naming a good lab file or a staging one and Google's secret in the
   environment, nothing is read and the providers, what is offered, Google's secret and both doors are byte for byte the shipped
   ones. Neither, the lab is taken; a staging file fills the shipped two's client ids alone, the environment's secret goes to Google
   alone, and a file naming another host is refused as a whole, the secret with it. */
CASES.labPackaged = async (s0, swap) => {
  /* A plant in the section is put in every section loaded here, one in the wiring in its read. */
  const load = () => loadIn(swap);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-signin-lab-"));
  try {
    const file = path.join(dir, "lab.json"), far = path.join(dir, "far.json"), staging = path.join(dir, "staging.json");
    fs.writeFileSync(file, labText(4567));
    fs.writeFileSync(far, labText(4567, {}, { token: "http://192.168.1.20:4567/token" }));
    fs.writeFileSync(staging, stagingText());
    const shipped = load().live(), json = o => JSON.stringify(o);
    const asShipped = s => { const l = s.live(); return json(l.providers) === json(shipped.providers) && Object.keys(l.providers).join() === "microsoft,google"
      && Object.isFrozen(l.providers) && l.signin === "https://etiuda.dev/licence/v1/signin/desk" && l.signout === "https://etiuda.dev/licence/v1/signout/desk"
      && l.on === false && Object.keys(l.packed).length === 0 && s.signinOffered().length === 0 && s.signinKnown("lab") === null
      && !s.signinPageOk("http://127.0.0.1:4567/authorize?client_id=x"); };
    let inert = true;
    for (const facts of [{ installed: true, packaged: false }, { installed: false, packaged: true }, { installed: true, packaged: true }]) {
      for (const f of [file, staging]) {
        const s = load(), r = labStart(s, Object.assign({ file: f, secret: STAND_IN }, facts), swap);
        inert = inert && r.text !== "" && r.reads.length === 0 && r.said.length === 0 && asShipped(s);
      }
    }
    const unset = load(), u = labStart(unset, { installed: false, packaged: false, secret: STAND_IN }, swap);
    const lab = load(), t = labStart(lab, { installed: false, packaged: false, file: file }, swap), l = lab.live();
    const refused = load(), f = labStart(refused, { installed: false, packaged: false, file: far, secret: STAND_IN }, swap);
    const st = load(), g = labStart(st, { installed: false, packaged: false, file: staging, secret: STAND_IN }, swap), sl = st.live();
    const sans = p => { const o = Object.assign({}, p); delete o.clientId; return json(o); };
    return inert && u.reads.length === 0 && asShipped(unset)
      && t.reads.length === 1 && t.said.length === 0 && l.on === true && Object.keys(l.providers).join() === "microsoft,google,lab"
      && json(l.providers.microsoft) === json(shipped.providers.microsoft) && json(l.providers.google) === json(shipped.providers.google)
      && l.signin === "http://127.0.0.1:4567/licence/v1/signin/desk" && l.signout === "http://127.0.0.1:4567/licence/v1/signout/desk"
      && json(lab.signinOffered()) === json([{ id: "lab", clientId: LAB_CLIENT, clientSecret: "" }]) && Object.keys(l.packed).length === 0
      && f.reads.length === 1 && f.said.length === 1 && asShipped(refused)
      && g.reads.length === 1 && g.said.length === 0 && Object.keys(sl.providers).join() === "microsoft,google"
      && sans(sl.providers.microsoft) === sans(shipped.providers.microsoft) && sans(sl.providers.google) === sans(shipped.providers.google)
      && sl.signin === STAGING + "signin/desk" && sl.signout === STAGING + "signout/desk"
      && json(st.signinOffered()) === json([{ id: "microsoft", clientId: MS_CLIENT, clientSecret: "" }, { id: "google", clientId: G_CLIENT, clientSecret: STAND_IN }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
/* A provider double and a licence service on 127.0.0.1, test values made here: /authorize answers 302 to the desk's loopback, /token
   an ID token for the lab's client (the code grant's carrying authorize's nonce), and signin/desk a certificate for DESK_KEY. */
async function labDouble() {
  const st = { nonce: "", forms: [], posts: [], port: 0 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const u = new URL(req.url, "http://127.0.0.1"), now = Math.floor(Date.now() / 1000);
      if (req.method === "GET" && u.pathname === "/authorize") {
        st.nonce = u.searchParams.get("nonce");
        res.writeHead(302, { location: u.searchParams.get("redirect_uri") + "/?code=lab-code&state=" + encodeURIComponent(u.searchParams.get("state")) });
        return res.end();
      }
      if (req.method === "POST" && u.pathname === "/token") {
        const form = new URLSearchParams(body), c = { iss: "https://oidc-lab.localhost:" + st.port, aud: LAB_CLIENT, sub: "lab-user", iat: now, exp: now + 3600 };
        st.forms.push(form);
        if (form.get("grant_type") === "authorization_code") c.nonce = st.nonce;
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ id_token: jwt(c), refresh_token: "lab-rt" }));
      }
      if (req.method === "POST" && /^\/licence\/v1\/sign(in|out)\/desk$/.test(u.pathname)) {
        st.posts.push({ path: u.pathname, body: JSON.parse(body) });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(/signin/.test(u.pathname) ? { ok: true, code: CODE, certificate: cert({ issued: Date.now(), until: Date.now() + 86400000 }), doors: [] } : { ok: true }));
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  st.port = server.address().port;
  st.close = () => new Promise(r => { server.closeAllConnections(); server.close(r); });
  return st;
}
/* The real path pointed at the lab, over real HTTP and node's own fetch: the browser alone stood in by a GET that follows the authorize
   page's redirect to the desk's loopback. A sign-in, the certificate, a refresh and a sign out; the shipped service refused meanwhile. */
CASES.labPath = async () => {
  const d = await labDouble();
  try {
    const s = load();
    if (!s.signinLabUse(s.signinLabRead(labText(d.port)))) return false;
    const p = s.signinOffered().find(x => x.id === "lab");
    let followed = 0;
    const io = { listen: (pageFor, takes) => s.signinListen(http, pageFor, 10000, takes),
      openPage: async url => { followed = (await fetch(url, { redirect: "follow" })).status; return true; },
      tokenAsk: (u, f) => s.signinRequest(fetch, u, f), serviceAsk: (u, b) => s.signinServiceAsk(fetch, u, b), sign: signWith(signKey), page: ok => ok ? "ok" : "no" };
    const got = await s.signinRun(io, p, DESK_KEY, Date.now);
    const ans = got.ok ? await s.signinSeat(io, "lab", DESK_KEY, got.idToken, got.seed, Date.now) : { ok: false };
    const renewed = got.ok ? await s.signinRenew(io, p, DESK_KEY, got.refreshToken, got.seed, got.sub, Date.now) : { ok: false };
    const out = await s.signoutAsk(io, DESK_KEY, Date.now);
    let elsewhere = 0;
    for (const u of ["https://etiuda.dev/licence/v1/signin/desk", "http://127.0.0.1:" + (d.port + 1) + "/licence/v1/signin/desk"]) {
      try { await s.signinServiceAsk(fetch, u, {}); } catch { elsewhere++; }
    }
    try { await s.signinRequest(fetch, "http://127.0.0.1:" + (d.port + 1) + "/token", Buffer.from("a=1")); } catch { elsewhere++; }
    const code = d.forms[0] || new URLSearchParams(), again = d.forms[1] || new URLSearchParams();
    return got.ok && followed === 200 && got.sub === "lab-user" && ans.ok && !!ans.cert && ans.code === CODE && renewed.ok && out === true
      && code.get("grant_type") === "authorization_code" && code.get("client_id") === LAB_CLIENT && code.get("code") === "lab-code"
      && !!code.get("code_verifier") && !code.has("client_secret") && again.get("grant_type") === "refresh_token" && again.get("refresh_token") === "lab-rt"
      && !again.has("scope") && d.forms.length === 2 && d.posts.map(x => x.path).join() === "/licence/v1/signin/desk,/licence/v1/signout/desk"
      && d.posts[0].body.provider === "lab" && d.posts[0].body.seed === got.seed && elsewhere === 3;
  } finally { await d.close(); }
};
/* A harness start reaches a provider only while the lab is taken: signinLabHeld is true for a seat held then, and reads nothing while
   no lab is taken; with it, the renewal asks and Sign out posts on a harness start, and without it neither does (ds7d, ds9d). */
CASES.labHarness = async (s, swap) => {
  let text = "";
  try { text = decl(MAIN, "function signinLabHeld("); } catch { text = ""; }
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in signinLabHeld once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const held = (on, provider) => { let reads = 0; const r = new Function("signinLabOn", "signinState", text + "\nreturn signinLabHeld();")(on,
    () => { reads++; return { held: provider ? { provider: provider } : null }; }); return { r, reads }; };
  const a = held(true, "lab"), b = held(true, "microsoft"), c = held(false, "lab"), e = held(true, null);
  const st = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())) }));
  st.harnessLaunch = () => true;
  st.signinLabHeld = () => true;
  st.store.held = heldOf();
  await loadWire(st).signinRenewNow();
  const o = outStand(s);
  o.harnessLaunch = () => true;
  o.signinLabHeld = () => true;
  loadWire(o).signinOutNow();
  await tick(5);
  return !!text && a.r === true && b.r === true && c.r === false && c.reads === 0 && e.r === false && st.asked === 1 && o.sent.length === 1;
};
/* The page draws the lab's provider as it draws the shipped two, and keeps its loopback link while it waits; no other provider's. */
CASES.labPage = () => {
  if (!P) return false;
  const v = P.signinRead({ offered: ["lab"], busy: "lab", link: "http://127.0.0.1:4567/authorize?client_id=x" });
  const html = P.signinProvidersHtml(["lab"], true), door = P.signinDoor(P.signinRead({ offered: ["lab"] }));
  return v.offered.join() === "lab" && v.link === "http://127.0.0.1:4567/authorize?client_id=x"
    && P.signinRead({ offered: ["microsoft"], busy: "microsoft", link: "http://127.0.0.1:4567/authorize?x=1" }).link === ""
    && P.signinRead({ offered: ["lab"], busy: "lab", link: "http://192.168.1.20:4567/authorize?x=1" }).link === ""
    && /data-e-provider="lab"/.test(html) && /<span>Lab<\/span>/.test(html) && !/undefined/.test(html) && !!door && door.providers.join() === "lab";
};
/* Nothing else points the sign-in anywhere: the variable is read in the lab's read alone, and the table and both doors are assigned in
   signinLabUse alone, which is called once; no IPC, preload or page module names the lab's file. */
CASES.labOnly = () => {
  const n = re => (MAIN.match(re) || []).length;
  const i = MAIN.indexOf("/* plant:lab-packaged */"), block = i < 0 ? "" : MAIN.slice(MAIN.lastIndexOf("\n", i), MAIN.indexOf("\n}\n", i));
  const pageNames = fs.readdirSync(path.join(ROOT, "src", "modules")).filter(f => /ETIUDA_SIGNIN_LAB/.test(fs.readFileSync(path.join(ROOT, "src", "modules", f), "utf8")));
  const env = /process\.env\.ETIUDA_SIGNIN_LAB\b|process\.env\[/g;
  return !!block && n(/process\.env\.ETIUDA_SIGNIN_LAB\b/g) === 2 && (block.match(env) || []).length === 2
    && n(/(?<!let )\bSIGNIN_PROVIDERS = /g) === 1 && n(/(?<!let )\bSIGNIN_SERVICE = /g) === 1 && n(/(?<!let )\bSIGNOUT_SERVICE = /g) === 1
    && n(/\bsigninLabUse\(/g) === 2 && n(/\bsigninLabOn = true/g) === 1 && /SIGNIN_PROVIDERS = [^\n]*\n  SIGNIN_SERVICE = lab\.signin;\n  SIGNOUT_SERVICE = lab\.signout;/.test(MAIN)
    && !/ipcMain\.(on|handle)\([^\n]*(signinLab|SIGNIN_LAB)/.test(MAIN) &&!/ETIUDA_SIGNIN_LAB/.test(PRELOAD) && pageNames.length === 0;
};

/* tools/signin-staging.cmd is outside the packaged files and starts this tree's own Electron with a profile of its own, never the
   installed Etiuda, ETIUDA_SIGNIN_LAB the argument's full path for that one start; --where starts nothing. */
CASES.stagingCmd = () => {
  const { minimatch } = createRequire(import.meta.url)("minimatch");
  const cfgText = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8"), fa = cfgText.indexOf("files: [");
  const files = fa < 0 ? [] : new Function("return " + cfgText.slice(fa + 7, cfgText.indexOf("],", fa) + 1))();
  const shipped = p => { let inc = false; for (const pat of files) { const neg = pat.startsWith("!"); if (minimatch(p, neg ? pat.slice(1) : pat, { dot: true })) inc = !neg; } return inc; };
  const at = path.join(ROOT, "tools", "signin-staging.cmd"), text = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : "";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^rem\b/i.test(l) && l !== "@echo off");
  const ORDER = ["setlocal", 'set "ROOT=%~dp0.."', 'set "EXE=%ROOT%\\node_modules\\electron\\dist\\electron.exe"', 'set "PROFILE=%LOCALAPPDATA%\\Etiuda-signin-staging"',
    'if /i "%~1"=="--where" exit /b 0', 'if not exist "%~f1" exit /b 1', 'if not exist "%EXE%" exit /b 1', 'set "ETIUDA_SIGNIN_LAB=%~f1"',
    'start "" "%EXE%" "%ROOT%" "--user-data-dir=%PROFILE%"', "endlocal"];
  const idx = ORDER.map(s => lines.indexOf(s));
  return !!text && files.length > 5 && shipped("shell/main.js") && !shipped("tools/signin-staging.cmd") && idx.every((i, k) => i >= 0 && (k === 0 || i > idx[k - 1]))
    && lines.filter(l => /(^|[&|(]\s*)start\s/i.test(l)).length === 1 && lines.filter(l => /ETIUDA_SIGNIN_LAB/.test(l)).length === 1
    && !/Etiuda\.exe|Programs\\Etiuda|ProgramFiles/i.test(text) && !lines.some(l => /\b(setx|reg)\b/i.test(l));
};

/* ---- no free seat is a wait (ds18): the service answers 200 with no certificate and the reason "waiting", the desk keeps the person
   signed in and renews quietly, and the door and Account say so in the copywriter's words; an older service's 409 "full" as before ---- */
const WAIT_EN = ["No seat is free on the organisation's licence just now.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and the team's lead sees this account's sign-in code among those who have signed in."];
const WAIT_TEAM_EN = ["Ada's team has no free seat just now.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and Ada, the team's lead, sees this account's sign-in code among those who have signed in."];
const WAIT_PL = ["W licencji organizacji nie ma teraz wolnego miejsca.",
  "Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; nikt nie musi nic robić, a lider zespołu widzi kod logowania tego konta wśród osób, które się zalogowały."];
const WAIT_TEAM_PL = ["W zespole Ada's team nie ma teraz wolnego miejsca.",
  "Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; nikt nie musi nic robić, a lider zespołu, Ada, widzi kod logowania tego konta wśród osób, które się zalogowały."];
/* The answer read and settled: "waiting" is a wait, kept as the said reason with the refresh token, asking nobody; an answer of none
   without it stays no licence; the certificate that follows ends the wait; a 409 "full" reads and settles as before. */
CASES.waitRead = s => {
  const a = (o, st) => s.signinAnswer(answer(o, st), DESK_KEY);
  const wait = a({ ok: true, certificate: null, code: CODE, reason: "waiting" }), none = a({ ok: true, certificate: null, code: CODE });
  const other = s.signinAnswer(strayAnswer({ ok: true, certificate: null, code: CODE, reason: "elsewhere" }), DESK_KEY), full = a({ ok: false, reason: "full" }, 409);
  const base = { provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: SEED, code: "", cert: null, at: 0, checked: NOW, reached: true, said: "", ask: false, doors: [] };
  const held = s.signinSettle(base, wait, NOW), seated = s.signinSettle(held, { ok: true, code: CODE, cert: cert({ issued: NOW + 1 }), doors: [] }, NOW + 1);
  const noLic = s.signinSettle(base, none, NOW), old = s.signinSettle(base, full, NOW);
  return wait.ok === true && wait.cert === null && wait.code === CODE && wait.waiting === true && none.ok === true && none.cert === null && none.waiting !== true
    && other.ok === true && other.waiting !== true && full.ok === false && full.reason === "full"
    && held.said === "waiting" && held.cert === null && held.code === CODE && held.refresh === "sealed:rt" && held.ask === false && held.reached === true
    && seated.said === "" && seated.cert.issued === NOW + 1 && noLic.said === "" && old.said === "full" && old.refresh === "sealed:rt" && old.ask === false;
};
/* The quiet renewal while waiting: waited again, the refresh token renewed and nobody asked, so the next renewal runs; once a seat frees,
   the renewal seats the desk. A renewal an older service refuses as full keeps its token and says so, as before. */
CASES.waitRenew = async s => {
  const tok = () => answer({ id_token: jwt(msClaims(undefined)), refresh_token: "rt-2" });
  const waiting = heldOf({ cert: null, said: "waiting" });
  const again = await s.signinRenewHeld(renewIo(tok(), answer({ ok: true, certificate: null, code: CODE, reason: "waiting" })), MS, DESK_KEY, waiting, () => NOW);
  const next = cert({ issued: NOW + 5, until: NOW + 5 + 30 * 86400000 });
  const seated = await s.signinRenewHeld(renewIo(tok(), answer({ ok: true, certificate: next, code: CODE, doors: [] })), MS, DESK_KEY, again.held, () => NOW + 5);
  const full = await s.signinRenewHeld(renewIo(tok(), answer({ ok: false, reason: "full" }, 409)), MS, DESK_KEY, heldOf({ cert: null, said: "full" }), () => NOW);
  return again.held.said === "waiting" && again.held.cert === null && again.held.refresh === "sealed:rt-2" && again.held.ask === false && again.held.reached === true
    && seated.said === "renewed" && seated.held.said === "" && !!seated.held.cert && seated.held.cert.issued === NOW + 5
    && full.said === "full" && full.held.said === "full" && full.held.refresh === "sealed:rt-2" && full.held.ask === false;
};
/* The page imported again with one line put in another form in memory, for a plant on the page's half. */
async function pageWith(swap) {
  const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
  if (PAGE.split(swap[0]).length !== 2) throw new Error("plant anchor not in signin.js once: " + swap[0]);
  const text = PAGE.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + dir);
  return import("data:text/javascript;base64," + Buffer.from(text).toString("base64"));
}
/* The door and Account in the copywriter's words for the wait, the licence form and the team form, English and Polish; an older
   service's "full" told the same; no licence still its own moment; today's words gone from the table. */
CASES.waitPage = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const v = o => pg.signinRead(Object.assign({ offered: ["microsoft"], signedIn: "microsoft", code: CODE }, o));
  const team = { team: { lead: "Ada" }, teamName: "Ada's team" };
  const same = (a, b) => Array.isArray(a) && a.length === 2 && a[0] === b[0] && a[1] === b[1];
  const wait = pg.signinDoor(v({ seat: "none", refused: "waiting" })), full = pg.signinDoor(v({ seat: "held", refused: "full" }));
  const none = pg.signinDoor(v({ seat: "none" }));
  const teamSay = [pg.signinSay("waiting", v({ seat: "none", refused: "waiting" }), team), pg.signinSay("full", v({ seat: "held", refused: "full" }), team)];
  const acct = page ? "" : words(await acctOf({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "none", refused: "waiting" }));
  let pl = null, plTeam = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = pg.signinDoor(v({ seat: "none", refused: "waiting" })).say; plTeam = pg.signinSay("waiting", v({ seat: "none", refused: "waiting" }), team); }
  finally { storage.lsSet("eUiLang", "en"); }
  const L = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  return wait.moment === "noseat" && same(wait.say, WAIT_EN) && wait.acts[0].act === "check" && full.moment === "noseat" && same(full.say, WAIT_EN)
    && none.moment === "nolicence" && teamSay.every(x => same(x, WAIT_TEAM_EN)) && same(pl, WAIT_PL) && same(plTeam, WAIT_TEAM_PL)
    && (page ? true : acct.indexOf(WAIT_EN[0] + " " + WAIT_EN[1]) >= 0 && acct.indexOf("No Etiuda licence has a seat") < 0)
    && !/has no free seat\."|can free a seat or add one/.test(L + PAGE + SETTINGS);
};

/* ---- a refusal is said where the person looks (ds19): what the service refuses at a renewal or Check now, and a sign-in pressed
   while signed in that fails, in the door and in Account, in words that say what to do; Check now not held by a clock set back ---- */
const SAY_DESKS = ["This account is signed in on three computers already.", "A seat holds three computers. Signing out on one of the others frees its place, and this computer checks again by itself."];
const SAY_TOKEN = ["The sign-in service did not accept this account's sign-in.", "Signing in again settles it; until then, Etiuda keeps working with the catalog it has."];
const NEW_FAILED = "The new sign-in did not finish.", KEPT = "This computer stays signed in with the account it had.";
const SAY_PRESSED = why => [NEW_FAILED, why ? KEPT + " " + why : KEPT];
const sayIs = (a, b) => Array.isArray(a) && a.length === 2 && a[0] === b[0] && a[1] === b[1];
const textOf = h => String(h).replace(/<[^>]*>/g, "\n").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const saidIn = (h, pair) => { const x = textOf(h); return x.indexOf(pair[0]) >= 0 && x.indexOf(pair[1]) >= 0; };
/* A renewal's refusal kept as the said reason, in the copywriter's words: "desks" with Check now; "token", or any other reason the shell
   keeps, settled by signing in again, the providers under it; the door and Account alike, Polish too. */
CASES.toldRenewal = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const base = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held" };
  const door = o => pg.signinDoor(pg.signinRead(Object.assign({}, base, o)));
  const desks = door({ refused: "desks" }), token = door({ refused: "token" }), other = door({ refused: "elsewhere" }), none = door({});
  let pl = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = door({ refused: "desks" }).say; } finally { storage.lsSet("eUiLang", "en"); }
  const acct = page ? null : [await acctOf(Object.assign({}, base, { refused: "desks" })), await acctOf(Object.assign({}, base, { refused: "token" }))];
  return sayIs(desks.say, SAY_DESKS) && desks.acts[0].act === "check" && desks.acts[0].label === "Check now" && desks.acts[0].solid === true
    && sayIs(token.say, SAY_TOKEN) && token.providers.join() === "microsoft,google" && sayIs(other.say, SAY_TOKEN) && none.moment === "noteam" && !none.say
    && !!pl && pl[0] === "To konto jest już zalogowane na trzech komputerach." && pl[1] === "Miejsce w licencji obejmuje trzy komputery. Wylogowanie się na jednym z pozostałych zwolni jego miejsce, a ten komputer sam sprawdzi ponownie."
    && (page ? true : saidIn(acct[0], SAY_DESKS) && saidIn(acct[1], SAY_TOKEN)
      && (acct[1].match(/data-e-open="signin"/g) || []).length === 2);
};
/* A sign-in pressed while signed in that fails: the desk stays signed in and says so, then the reason's own heading where it has one;
   Try again choosing again; a cancel or a sign-in done says nothing; the door and Account alike, Polish too. */
CASES.toldPressed = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const base = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held" };
  const door = o => pg.signinDoor(pg.signinRead(Object.assign({}, base, o)));
  const desks = door({ said: "desks" }), away = door({ said: "signin-unreached" }), org = door({ said: "signin-notallowed" }), token = door({ said: "token" });
  const quiet = [door({ said: "signin-cancelled" }), door({ said: "signin-done" })];
  let pl = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = door({ said: "signin-unreached" }).say; } finally { storage.lsSet("eUiLang", "en"); }
  const acct = page ? "" : await acctOf(Object.assign({}, base, { said: "signin-timeout" }));
  return sayIs(desks.say, SAY_PRESSED("This account is already in use on three computers.")) && desks.acts[0].act === "choose" && desks.acts[0].label === "Try again" && !!desks.ident
    && sayIs(away.say, SAY_PRESSED("The sign-in service could not be reached.")) && sayIs(org.say, SAY_PRESSED("This account's organisation has not allowed Etiuda at its sign-in provider."))
    && org.acts[0].label === "Use another account" && sayIs(token.say, SAY_PRESSED(""))
    && quiet.every(d => d.moment === "noteam" && !d.say) && !!pl && pl[0] === "Nowe logowanie nie dobiegło końca."
    && pl[1] === "Ten komputer pozostaje zalogowany kontem, którego używał. Nie udało się połączyć z usługą logowania."
    && (page ? true : saidIn(acct, SAY_PRESSED("The sign-in service could not be reached.")) && /data-signin-act="choose"[^>]*>Try again</.test(acct));
};
/* Check now, the handler evaluated with stand-ins: once per gap, and a clock set back does not hold it up. */
function loadCheck(swap) {
  const a = WIRING.indexOf('ipcMain.handle("etiuda:signin-check",');
  let text = a < 0 ? "" : WIRING.slice(a, WIRING.indexOf("\n});", a) + 4);
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the check once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const st = { at: 1e12, renews: 0, handler: null };
  const ipc = { handle: (ch, fn) => { st.handler = fn; } };
  const clock = { now: () => st.at };
  new Function("ipcMain", "fromEngine", "signinRenewNow", "signinView", "SIGNIN_CHECK_GAP_MS", "Date", "let signinCheckAt = 0;\n" + text)(
    ipc, () => true, async () => { st.renews++; return "renewed"; }, () => ({}), 10 * 1000, clock);
  return st;
}
CASES.checkGap = async (s, swap) => {
  const st = loadCheck(swap);
  if (typeof st.handler !== "function") return false;
  const press = () => st.handler({});
  await press(); const first = st.renews;
  st.at += 3000; await press(); const held = st.renews;
  st.at -= 3600 * 1000; await press(); const back = st.renews;
  st.at += 11 * 1000; await press(); const after = st.renews;
  return first === 1 && held === 1 && back === 2 && after === 3;
};
/* A renewal that reached its end leaves no stale press's refusal standing: the press's said is cleared with it. */
CASES.saidCleared = async (s, swap) => {
  const next = cert({ issued: Date.now(), until: Date.now() + 30 * 86400000 });
  const st = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())), refresh_token: "rt-2" }), () => answer({ ok: true, certificate: next, code: CODE, doors: [] }));
  st.store.held = heldOf();
  st.said = "signin-unreached";
  const w = loadWire(st, swap);
  const before = w.said();
  const r = await w.signinRenewNow();
  return before === "signin-unreached" && r === "renewed" && w.said() === "";
};
/* ---- no refresh token or an unopened sub asks for sign-in again (ds20): Google asks offline, and Check now / daily renewal
   set ask: true with the copywriter's words instead of doing nothing or failing as signin-unbound ---- */
const ASK_EN = ["This computer could not renew its sign-in by itself.", "Signing in again renews it."];
const ASK_PL = ["Ten komputer nie zdołał sam odnowić logowania.", "Wystarczy zalogować się ponownie."];
CASES.renewAsk = async (s, swap) => {
  const sec = typeof swap === "string" ? s : s;
  const gUrl = new URL(sec.signinAuthorize(G, 50000, DESK_KEY).url);
  const st = wireStand(sec, () => answer({ id_token: jwt(msClaims(undefined, Date.now())) }));
  st.store.held = heldOf({ refresh: "" });
  const said = await loadWire(st, Array.isArray(swap) ? swap : undefined).signinRenewNow();
  const ioSub = renewIo(answer({ id_token: jwt(msClaims(undefined)) }), answer({}));
  ioSub.kept = x => (x === "sealed:rt-1" ? "rt-1" : "");
  const badSub = await sec.signinRenewHeld(ioSub, MS, DESK_KEY, heldOf(), () => NOW);
  if (!P) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const vAsk = view({ signedIn: "microsoft", code: CODE, seat: "held", ask: true });
  const doorEn = P.signinDoor(vAsk), acctEn = words(await acctOf(vAsk));
  let doorPl = null;
  storage.lsSet("eUiLang", "pl");
  try { doorPl = P.signinDoor(vAsk); } finally { storage.lsSet("eUiLang", "en"); }
  return gUrl.searchParams.get("access_type") === "offline" && gUrl.searchParams.get("prompt") === "select_account"
    && said === "signin-ask" && st.asked === 0 && st.posted === 0 && st.saves === 1 && st.tells === 1
    && st.store.held.ask === true && st.store.held.refresh === "" && !!st.store.held.cert && st.store.held.code === CODE
    && badSub.said === "signin-ask" && badSub.held.ask === true && badSub.held.refresh === "" && ioSub.asked.length === 0 && ioSub.posted.length === 0
    && doorEn && doorEn.moment === "ask" && doorEn.say[0] === ASK_EN[0] && doorEn.say[1] === ASK_EN[1]
    && acctEn.indexOf(ASK_EN[0] + ASK_EN[1]) >= 0
    && doorPl && doorPl.say[0] === ASK_PL[0] && doorPl.say[1] === ASK_PL[1];
};

/* ---- a desk with no keyring says so plainly at sign-in (ds21): no identity is made, and the retired Account line is gone ---- */
const KEYRING_EN = ["Signing in needs a keyring, and none is open on this computer.",
  "Installing or unlocking GNOME Keyring or KDE Wallet, then reopening Etiuda, lets this computer sign in."];
const KEYRING_PL = ["Logowanie wymaga magazynu kluczy, a na tym komputerze żaden nie jest otwarty.",
  "Po zainstalowaniu lub odblokowaniu GNOME Keyring albo Portfela KDE i ponownym otwarciu Etiudy ten komputer będzie mógł się zalogować."];
CASES.noKeyring = async (s, swapOrPage) => {
  const swap = Array.isArray(swapOrPage) ? swapOrPage : undefined;
  const pg = swapOrPage && !Array.isArray(swapOrPage) && typeof swapOrPage.signinDoor === "function" ? swapOrPage : P;
  if (!pg) return false;
  let idCalls = 0;
  const st = waitStand(s, swap, { isEncryptionAvailable: () => false }, () => { idCalls++; return null; });
  const pressed = await st.press("microsoft");
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const vKeyring = pg.signinRead({ offered: ["microsoft", "google"], said: "signin-keyring", keeps: false });
  const doorEn = pg.signinDoor(vKeyring), acctEn = swapOrPage ? "" : words(await acctOf(vKeyring));
  let doorPl = null;
  storage.lsSet("eUiLang", "pl");
  try { doorPl = pg.signinDoor(vKeyring); } finally { storage.lsSet("eUiLang", "en"); }
  const L = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  return s.sealsForReal({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "basic_text" }, "linux") === false
    && idCalls === 0 && st.out === 0 && !!pressed && pressed.said === "signin-keyring"
    && st.told.some(v => v.said === "signin-keyring")
    && !!doorEn && doorEn.moment === "refused" && doorEn.heading === KEYRING_EN[0] && doorEn.line === KEYRING_EN[1]
    && (swapOrPage ? true : acctEn.indexOf(KEYRING_EN[0] + KEYRING_EN[1]) >= 0 && acctEn.indexOf(UNKEPT_LINE) < 0)
    && !!doorPl && doorPl.moment === "refused" && doorPl.heading === KEYRING_PL[0] && doorPl.line === KEYRING_PL[1]
    && L.indexOf("Na tym komputerze nie jest otwarty żaden magazyn kluczy") < 0 && SETTINGS.indexOf(UNKEPT_LINE) < 0;
};
/* ---- the door and the sign out agree with the relay (ds21, decision 33; Hydrogen's review of the desk's sign-in, 3, 4 and 6) ----- */
const OTHER_LEAD = rawPub(crypto.generateKeyPairSync("ed25519").publicKey);
const OTHER_KEY_ID = "studio-" + crypto.createHash("sha256").update(Buffer.from(OTHER_LEAD, "hex")).digest("hex").slice(0, 16);
const shownOf = (s, over, swap) => { const q = doorJoinStand(over); return loadDoorJoin(s, q, swap).signinDoorsShown(q.held, NOW).map(d => d.n).join(); };
/* Machine policy binds a door as it binds an invitation: none where it names a folder, only the named lead's where it names a lead,
   none where it names both (a door has no folder); a press at a door it does not offer changes nothing. */
CASES.doorPolicy = (s, swap) => {
  const mixed = heldOf({ doors: [doorOf(), doorOf({ team: "t-fedcba9876543210", lead: OTHER_LEAD, keyId: OTHER_KEY_ID })] });
  const share = "\\\\server\\team";
  const free = shownOf(s, { held: mixed }, swap), folder = shownOf(s, { held: mixed, policy: { folder: share } }, swap);
  const lead = shownOf(s, { held: mixed, policy: { lead: DOOR_LEAD } }, swap), other = shownOf(s, { held: mixed, policy: { lead: OTHER_LEAD } }, swap);
  const both = shownOf(s, { held: mixed, policy: { lead: DOOR_LEAD, folder: share } }, swap);
  const q = doorJoinStand({ held: mixed, policy: { lead: OTHER_LEAD } }), x = loadDoorJoin(s, q, swap), r = x.signinDoorJoin(0);
  return free === "0,1" && folder === "" && lead === "0" && other === "1" && both === ""
    && !!r && r.refused === "door" && x.join() === null && Object.keys(q.pins).length === 0 && q.persists === 0;
};
/* No door while a pinned team stands (its roster still names this desk, or it holds no key yet, and the relay has not refused it);
   a team taken off leaves the doors; a door of a team pinned under another lead is no door, under the same lead it is. */
CASES.doorPins = (s, swap) => {
  const T1 = "t-1111111111111111", pin = { [T1]: { keyId: OTHER_KEY_ID, public: OTHER_LEAD } };
  const standing = shownOf(s, { pins: Object.assign({}, pin) }, swap);
  const relayGone = shownOf(s, { pins: Object.assign({}, pin), gone: { [T1]: true } }, swap);
  const rosterOff = shownOf(s, { pins: Object.assign({}, pin), epochs: { [T1]: 2 }, roster: { [T1]: { epoch: 2, desks: ["k-0000000000000000"] } } }, swap);
  const rosterOn = shownOf(s, { pins: Object.assign({}, pin), epochs: { [T1]: 2 }, roster: { [T1]: { epoch: 2, desks: [DESK_ID] } } }, swap);
  const otherLead = shownOf(s, { pins: { [TEAM]: { keyId: OTHER_KEY_ID, public: OTHER_LEAD } }, gone: { [TEAM]: true } }, swap);
  const sameLead = shownOf(s, { pins: { [TEAM]: { keyId: DOOR_KEY_ID, public: DOOR_LEAD } }, gone: { [TEAM]: true } }, swap);
  return standing === "" && relayGone === "0,1" && rosterOff === "0,1" && rosterOn === "" && otherLead === "1" && sameLead === "0,1";
};
/* A team this desk left, or whose key it said did not match, is offered at its door, and the press asks again: the leave and the
   doubt are lifted, after the snapshot Cancel puts back has taken them. */
CASES.doorUnbar = (s, swap) => {
  const LEFT = "2026-09-01T08:30:00.000Z";
  const run = (left, barred) => {
    const q = doorJoinStand({ left: left ? { [TEAM]: LEFT } : {}, barred: new Set(barred ? [TEAM] : []) }), x = loadDoorJoin(s, q, swap);
    const offered = x.signinDoorsShown(q.held, NOW).some(d => d.n === 0), r = x.signinDoorJoin(0);
    return { offered, r, q, j: x.join() };
  };
  const lifted = o => o.offered && !!o.j && o.r.refused === undefined && o.q.left[TEAM] === undefined && !o.q.barred.has(TEAM) && !!o.q.beforeSeen && o.q.beforeSeen.barred === true;
  const l = run(true, true), d = run(false, true);
  return lifted(l) && l.q.beforeSeen.left === LEFT && lifted(d) && d.q.beforeSeen.left === undefined;
};
/* Cancel and the end of a withdrawal, with stand-ins: `st` {join, accepted, withdrawn, unlinked, undone, ended}. */
const CANCEL_DECLS = ["function cancelJoin(", "function refusedWithdrawEnds("];
const CANCEL_STANDS = ["init", "readDesk", "inviteAccepted", "withdrawJoin", "deskBranch", "unlinkOwn", "joinFile", "newestEpoch", "undoInvite",
  "persistDeskEnvelope", "joinView", "endRefusedRelay"];
function loadCancel(st, swap) {
  let text = CANCEL_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in Cancel once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { init: st, readDesk: () => ({}), inviteAccepted: () => st.accepted === true, withdrawJoin: j => { st.withdrawn.push(j); return { view: "withdrawing" }; },
    deskBranch: {}, unlinkOwn: f => { st.unlinked.push(f); }, joinFile: () => "/relay/" + RT + "/desks/" + DESK_ID + "/join.json", newestEpoch: () => 0,
    undoInvite: () => { st.undone++; }, persistDeskEnvelope: () => {}, joinView: () => ({ view: true }), endRefusedRelay: j => { st.ended.push(j); } };
  const body = "let deskKeys = {}, teamJoin = init.join, joinTold = true;\n" + text + "\nreturn { cancelJoin, refusedWithdrawEnds, join: () => teamJoin };";
  return new Function(...CANCEL_STANDS, body)(...CANCEL_STANDS.map(n => vals[n]));
}
const cancelStand = (join, accepted) => ({ join, accepted, withdrawn: [], unlinked: [], undone: 0, ended: [] });
const doorAsked = over => { const j = doorJoin(over); j.invite.before = { barred: false, epoch: 0 }; j.invite.lead = { keyId: DOOR_KEY_ID, public: DOOR_LEAD, name: "" }; return j; };
const relayAsked = over => ({ team: TEAM, nonce: "4".repeat(64), commit: "1".repeat(64), asked: NOW, held: 0, name: "Desk",
  invite: { id: "2".repeat(16), proof: "3".repeat(64), lead: { keyId: DOOR_KEY_ID, public: DOOR_LEAD, name: "Ada" }, before: { barred: false, epoch: 0 },
    relay: Object.assign({ rt: RT, url: "https://etiuda.dev/relay/v1", inv: "5".repeat(32), token: "x", seal: "y" }, over) } });
/* Cancel at a door the relay named takes the request back there as an invitation's is, the join kept until the relay has taken it;
   a door request never named, or one the relay turned away, goes at once as before; an accepted invitation is withdrawn as before. */
CASES.doorCancel = (s, swap) => {
  const run = (join, accepted) => { const st = cancelStand(join, accepted), x = loadCancel(st, swap), r = x.cancelJoin(); return { st, r, j: x.join(), join }; };
  const named = run(doorAsked({ inv: DOOR_ID }), true), unnamed = run(doorAsked(), false), turned = run(doorAsked({ inv: DOOR_ID, end: "turned" }), true);
  const invited = run(relayAsked(), true);
  return named.st.withdrawn.length === 1 && named.st.withdrawn[0] === named.join && named.j === named.join && named.r.view === "withdrawing" && named.st.unlinked.length === 0
    && unnamed.st.withdrawn.length === 0 && unnamed.j === null && unnamed.st.unlinked.length === 1 && unnamed.st.undone === 1
    && turned.st.withdrawn.length === 0 && turned.j === null && turned.st.undone === 1
    && invited.st.withdrawn.length === 1 && invited.j === invited.join;
};
/* The relay having taken a door request's withdrawal, or holding none to take, the join ends and what it changed is put back: a door
   request has no Ask again. An invitation's waits withdrawn as before; a refused one ends as before. */
CASES.doorWithdrawnEnds = (s, swap) => {
  const st = cancelStand(null, false), x = loadCancel(st, swap);
  const door = doorAsked({ inv: DOOR_ID, withdrawing: true }), refused = Object.assign(relayAsked({ withdrawing: true }), { refused: true });
  const a = x.refusedWithdrawEnds(door), b = x.refusedWithdrawEnds(relayAsked({ withdrawing: true })), c = x.refusedWithdrawEnds(refused);
  return a === true && b === false && c === true && st.ended.length === 2 && st.ended[0] === door && st.ended[1] === refused;
};
/* A door request being withdrawn: the channel is given its id and the lead's box and no certificate, signed in or out, the
   certificate lapsed or standing, so it resumes the request's session and never knocks again; unnamed or turned away, nothing. */
CASES.doorWithdrawInvite = (s, swap) => {
  const ask = (join, held) => loadDoor(s, doorStand(join, held), swap).signinDoorInvite(TEAM, RT);
  const shape = o => !!o && o.door === null && o.box === LEAD_BOX && o.inv === DOOR_ID && Object.keys(o).join() === "door,box,inv";
  const out = ask(doorJoin({ inv: DOOR_ID, withdrawing: true }), null), lapsed = ask(doorJoin({ inv: DOOR_ID, withdrawing: true }), heldOf({ cert: cert({ until: NOW }) }));
  const held = ask(doorJoin({ inv: DOOR_ID, withdrawing: true }));
  const unnamed = ask(doorJoin({ withdrawing: true })), turned = ask(doorJoin({ inv: DOOR_ID, withdrawing: true, end: "turned" }));
  const away = loadDoor(s, doorStand(doorJoin({ inv: DOOR_ID, withdrawing: true })), swap).signinDoorInvite(TEAM, "9".repeat(32));
  return shape(out) && shape(lapsed) && shape(held) && unnamed === null && turned === null && away === null;
};
/* Sign out on a folder team takes seat.json out through the desk's own removal, so the share is owed it, never by a bare unlink. */
CASES.signoutUnlinkOwn = async (s, swap) => {
  const st = outStand(s);
  let raw = 0;
  st.signinTeamHere = () => true;
  st.sharedFolderForWrite = () => path.join(path.sep, "share", "team");
  st.fs = Object.assign({}, fs, { unlinkSync: () => { raw++; } });
  loadWire(st, swap).signinOutNow();
  await tick(5);
  return st.unlinked.length === 1 && st.unlinked[0] === path.join(path.sep, "share", "team", "desks", DESK_ID, "seat.json") && raw === 0 && st.store.held === null;
};
/* Sign out while the quiet renewal's signin/desk is out: signout/desk goes only once that renewal has its answer, so the service
   takes the sign out last; the renewal's answer is not kept. */
CASES.signoutAfterRenew = async (s, swap) => {
  let release = null;
  const gate = new Promise(r => { release = r; }), order = [];
  const st = wireStand(s);
  st.store.held = heldOf();
  st.signinIo = () => ({ keep: t => t ? "sealed:" + t : "", kept: x => String(x || "").replace(/^sealed:/, ""), sign: signWith(signKey),
    tokenAsk: async () => answer({ id_token: jwt(msClaims(undefined, Date.now())), refresh_token: "rt-2" }),
    serviceAsk: async url => {
      if (url === s.SIGNOUT_SERVICE) { order.push("out"); return answer({ ok: true }); }
      order.push("renew"); await gate; order.push("answered");
      return answer({ ok: true, code: CODE, certificate: cert({ issued: Date.now(), until: Date.now() + 86400000 }), doors: [] });
    } });
  const w = loadWire(st, swap), renewing = w.signinRenewNow();
  await tick(5);
  w.signinOutNow();
  await tick(5);
  const meanwhile = order.join();
  release();
  await renewing;
  await tick(10);
  return meanwhile === "renew" && order.join() === "renew,answered,out" && st.store.held === null && st.store.out === undefined;
};
/* A sign out the service did not take is owed: kept in the file with the desk key, asked again at the renewal's next turn while
   nobody is signed in, and the mark goes once the service takes it; nothing owed, nothing sent. */
CASES.signoutOwed = async (s, swap) => {
  let up = false;
  const st = outStand(s, () => { if (!up) throw new Error("offline"); return answer({ ok: true }); });
  const w = loadWire(st, swap);
  w.signinOutNow();
  await tick(5);
  const owed = st.sent.length === 1 && st.store.held === null && st.store.out === DESK_KEY;
  const text = s.signinFileText(st.store), back = s.signinFileRead(text);
  const kept = JSON.parse(text).out === DESK_KEY && back.out === DESK_KEY && s.signinFileRead(s.signinFileText({ held: null })).out === undefined
    && s.signinFileRead(JSON.stringify({ format: 2, held: null, out: "zz" })).out === undefined;
  up = true;
  await w.signinRenewNow();
  await tick(5);
  const again = st.sent.length === 2 && st.sent[1].body.desk === DESK_KEY && st.store.out === undefined;
  await w.signinRenewNow();
  await tick(5);
  return owed && kept && again && st.sent.length === 2;
};
/* Sign out lets go of a request made at a team's door, which the certificate no longer stands for, through Cancel; an invitation's
   request, and no request, are left as they were. */
CASES.signoutDoorJoin = async (s, swap) => {
  const run = async join => { const st = outStand(s); st.teamJoin = join; loadWire(st, swap).signinOutNow(); await tick(5); return st; };
  const door = await run(doorJoin({ inv: DOOR_ID })), invited = await run(relayAsked()), none = await run(null);
  return door.cancels === 1 && door.sends === 1 && door.store.held === null && invited.cancels === 0 && none.cancels === 0;
};
/* The page is told a sign out is owed only while nobody is signed in and none is out; Account says so under Not signed in, in the
   copywriter's words, Polish too, and says nothing where none is owed. */
const OUT_OWED_EN = "This computer is signed out. Its place among the account's three computers is freed by itself as soon as the sign-in service can be reached.";
const OUT_OWED_PL = "Ten komputer jest wylogowany. Jego miejsce wśród trzech komputerów konta zwolni się samo, gdy tylko usługa logowania będzie osiągalna.";
CASES.outOwedView = (s, swap) => {
  const ws = waitStand(s, swap);
  ws.state = { held: null, out: DESK_KEY };
  const owed = ws.view().outOwed === true;
  ws.state = { held: null };
  return owed && ws.view().outOwed === false;
};
CASES.outOwedPage = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const read = pg.signinRead({ offered: ["microsoft"], outOwed: true }).outOwed === true && pg.signinRead({ offered: ["microsoft"], signedIn: "microsoft", outOwed: true }).outOwed === false
    && pg.signinRead({ offered: ["microsoft"] }).outOwed === false;
  if (page) return read;
  const owed = await acctOf({ offered: ["microsoft"], outOwed: true }), quiet = await acctOf({ offered: ["microsoft"] });
  let pl = "";
  storage.lsSet("eUiLang", "pl");
  try { pl = words(await acctOf({ offered: ["microsoft"], outOwed: true })); } finally { storage.lsSet("eUiLang", "en"); }
  return read && words(owed).indexOf(OUT_OWED_EN) >= 0 && /data-signin-out-owed/.test(owed) && !/data-signin-out-owed/.test(quiet) && pl.indexOf(OUT_OWED_PL) >= 0;
};
/* ---- the seat's signature (ds22, Hydrogen's finding 8; Claude alpha's decision 35): a certificate is taken only where a
   delegation from the root signed its key and that key signed it, as the relay's door takes one ---------------------------- */
const DAY_MS = 86400000, OTHER_ROOT = crypto.generateKeyPairSync("ed25519"), OTHER_SERVICE = crypto.generateKeyPairSync("ed25519");
/* Each forgery a hostile answer or an edited signin.json could carry, beside the genuine one. */
function certForgeries() {
  const keyIdOff = cert({ via: delegation({ key: { id: "svc-2", pub: SERVICE_PUB } }) });
  keyIdOff.sig = { alg: "Ed25519", keyId: "svc-1", value: "" };
  keyIdOff.sig.value = crypto.sign(null, certBytesOf(keyIdOff), SERVICE_KEY.privateKey).toString("hex");
  return {
    "a shape-valid made-up signature": cert({ sig: { alg: "Ed25519", keyId: "svc-1", value: "c".repeat(128) } }),
    "signed by a key the delegation does not name": cert({}, OTHER_SERVICE),
    "a delegation from a root this desk does not ship": cert({ via: delegation({}, OTHER_ROOT) }),
    "a delegation that may not sign licences": cert({ via: delegation({ may: ["relay-grant"] }) }),
    "issued before the delegation's first day": cert({ issued: VIA_FROM - 3 * DAY_MS, until: VIA_FROM - 2 * DAY_MS }),
    "a field changed after the signing": Object.assign(cert(), { person: "d".repeat(64) }),
    "a delegation changed after the root signed it": cert({ via: Object.assign({}, VIA, { until: VIA.until + DAY_MS }) }),
    "signed under a key id not the delegation's": keyIdOff,
    "longer than the service's thirty days": cert({ until: NOW + 31 * DAY_MS }),
    "a field beyond the certificate's": Object.assign(cert(), { name: "Ops" }),
  };
}
CASES.certSigned = s => {
  const ok = c => s.signinCertOk(c, DESK_KEY) === true;
  const forged = certForgeries();
  return ok(cert()) && ok(cert({ issued: NOW - DAY_MS, until: NOW - 1 })) && Object.keys(forged).every(k => !ok(forged[k]));
};
/* The desk and the relay's door judge every sample alike, the genuine one taken by both. */
CASES.certAsDoor = s => {
  const R = createRequire(import.meta.url)(path.join(ROOT, "relay", "core.cjs"));
  const samples = Object.assign({ genuine: cert() }, certForgeries());
  const door = c => R.certWhy(c, DESK_KEY, [String(c.licence)], NOW, [TEST_ROOT]) === null;
  return door(samples.genuine) && Object.keys(samples).every(k => door(samples[k]) === (s.signinCertOk(samples[k], DESK_KEY) === true));
};
/* The review's own sequence: a forged answer with a made-up signature and a stranger's door on the trusted relay is no seat and
   offers no door; signin.json edited to hold a forged certificate holds no seat, and a genuine one, lapsed too, stays. */
CASES.certForgedAnswer = s => {
  const forged = certForgeries()["a shape-valid made-up signature"];
  const ans = s.signinAnswer(answer({ ok: true, code: CODE, certificate: forged, doors: [doorOf()] }), DESK_KEY);
  const rooted = s.signinAnswer(answer({ ok: true, code: CODE, certificate: certForgeries()["a delegation from a root this desk does not ship"], doors: [doorOf()] }), DESK_KEY);
  const file = c => s.signinFileRead(s.signinFileText({ held: heldOf({ cert: c, doors: [] }) })).held;
  const lapsed = cert({ issued: NOW - 25 * DAY_MS, until: NOW - 2 * DAY_MS });
  return ans.ok === false && ans.reason === "unreached" && !ans.doors && rooted.ok === false
    && file(forged).cert === null && file(certForgeries()["a field changed after the signing"]).cert === null
    && JSON.stringify(file(cert()).cert) === JSON.stringify(cert()) && JSON.stringify(file(lapsed).cert) === JSON.stringify(lapsed);
};
/* The root the shipped desk checks against is the vendor's, the relay's ROOT_PUB, and the check names it. */
CASES.certRoot = () => {
  const R = createRequire(import.meta.url)(path.join(ROOT, "relay", "core.cjs"));
  const m = /\nconst NOTE_ROOT = "([0-9a-f]{64})";/.exec(MAIN);
  return !!m && m[1] === R.ROOT_PUB && SECTION.split("signinVerified(NOTE_ROOT, ").length === 2;
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
  ["ds9b", "signoutPost", "Sign out posts exactly one signout/desk, the three names, a fresh t and a signature that verifies, before the sign-in is cleared, and nothing stays owed once it is taken"],
  ["ds9c", "signoutAway", "with the service unreached, throwing or answering 503 or a refusal, Sign out still clears the sign-in, says no refusal, and keeps the place owed, the page told once more"],
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
  ["ds12f", "previewLook", "the preview's line as the designer placed it: \"Preview only.\" at 600, the rest the caption's; in the panel before the providers, in Account at the card's measure"],
  ["ds12g", "previewBack", "after a press the preview's heading stands alone with one ordinary Back to the door; the providers' row in Account is no header row"],
  ["ds13a", "secretTable", "the tree holds no client secret: every provider's clientSecret is \"\" and a configured table offers none"],
  ["ds13b", "secretSent", "client_secret goes with Google's code exchange and refresh only where a secret is present, and without one every byte is as before"],
  ["ds13c", "secretPacked", "the package's signin-secret.json gives Google's secret where it is {format: 1, google} of a secret's shape, and nothing else"],
  ["ds13d", "secretNever", "the stand-in secret is in the token forms and in no printed line, no licence service body (whose names are unchanged), no kept file, no outcome"],
  ["ds13e", "secretWire", "the shell reads the package's file once at start, installed, beside the asar, from no IPC or page, and the variable only inside the sign-in lab's read"],
  ["ds13f", "secretPackage", "the package step writes nothing and says absent without the variable, writes the file and says present with it, never the value; the file is git-ignored and copied only when set"],
  ["ds13g", "secretTree", "no tracked file carries a client secret's prefix or a client secret written as a value, the search shown to find both"],
  ["ds14a", "linkWait", "with a browser call that resolves and opens nothing, the page is told the provider's page as it is handed out and the loopback waits SIGNIN_WAIT_MS as before; Cancel takes the link with the wait; no line written carries it"],
  ["ds14b", "linkPage", "the link block stands last in every waiting place, the panel after its acts and Account after Cancel, and nowhere outside a wait or in the preview's pressed state; Polish too; its Copy copies the link"],
  ["ds14c", "linkLook", "the link block as the designer placed it: the line in the preview line's form, the field 6 px under it, never wrapping, 12 px and a hairline in the panel, 12 px and 560 px in Account, no box; a click selects all"],
  ["ds14d", "previewSh", "tools/signin-preview.sh is outside the packaged files: the .deb's program unless an AppImage is named, --where starts nothing, one exec with the variable for that start alone"],
  ["ds14e", "keyringLine", "the view says whether the system seals for real, and Account's retired unkept line is gone"],
  ["ds14f", "accountPress", "a provider pressed in Settings, Account is answered there alone and the header's panel stays shut; pressed in the panel, the answer opens it as before"],
  ["ds17a", "doorsRead", "the doors beside a certificate are kept whole and in order; a door out of shape, its key id not the lead key's canonical one among them, makes no list; no certificate, no doors"],
  ["ds17b", "doorsKept", "the doors are kept with the certificate and in the file, dropped with it, kept through a refusal, and a door out of shape in the file is no list"],
  ["ds17c", "doorJoin", "signed in with no team the doors are offered by host and lead print; a press makes the door's join, the lead and the box from the door and no invitation, the lead pinned; a door not offered changes nothing"],
  ["ds17d", "doorEnvelope", "the envelope keeps a join at the door, its box and the relay's id, and not one without the box or carrying a token; an invitation's join is kept as before"],
  ["ds17e", "doorPage", "the door's panel and Account draw each door by host and print with one Ask to join under the copywriter's heading and line, Polish too, no placeholder left, and a press asks the shell by the door's place"],
  ["ds17f", "doorRefusedSaid", "a press the shell refused at the door is said where it was pressed, the panel and Account's team row, in the copywriter's sentence, Polish too; a press taken says nothing, and the next act clears it"],
  ["ds17h", "doorAddress", "a door names a relay this build trusts and is a channel by the desk's own rule: every row of tests/door-relays.json is kept, filed, offered and knocked at as it says, installed and unpackaged, while an invitation to a valid https channel off the list is still read; the installed list is the built-in relay; the desk's flag is installed or packaged and reaches every caller"],
  ["ds17g", "doorEnded", "a join at the door the relay or the lead turned away, or refused as removed, knocks no more; \"turned\" is kept on a door join alone, the envelope keeps it, and the page is told"],
  ["ds14g", "copiedLabel", "the code's Copy and the link's read Copied for SIGNIN_COPIED_MS after a copy the clipboard took, then Copy, holding the wider width; a refused copy leaves it; Polish too"],
  ["ds15a", "identNoName", "with no name written the identity's bold line is \"Signed in with\" its provider and there is no second line, in the panel's every signed-in moment and in Account; a name written stands over it; Polish too"],
  ["ds15b", "panelOrder", "the panel tells no licence as it tells no team: the fact, its line, then the code's box, under the identity and above the acts"],
  ["ds16a", "labPackaged", "THE LAB IS INERT PACKAGED: installed, packaged or both, ETIUDA_SIGNIN_LAB naming a lab or a staging file and Google's secret in the environment, nothing is read and the providers, what is offered, the secret and both doors are byte for byte the shipped ones; unpackaged, the lab is taken, a staging file fills the shipped two's client ids alone, the secret goes to Google alone, and a file naming another host is refused whole"],
  ["ds16b", "labRead", "the lab file is taken whole or not at all: the service http on 127.0.0.1 or https on etiuda.dev; client ids for the shipped two alone; the provider \"lab\" optional, its authorize and token http on 127.0.0.1 alone, its issuer and key set also https on a .localhost name, openid; a root optional, of 64 hex"],
  ["ds16c", "labPath", "pointed at a lab over real HTTP, the real path runs unchanged: the browser's redirect to the loopback, the code exchange with PKCE, the token checks, signin/desk's certificate, a refresh, a sign out; the shipped door and other ports refused"],
  ["ds16d", "labHarness", "a harness start renews and signs out only while the lab is taken, and reads nothing for it while no lab is taken"],
  ["ds16e", "labPage", "the page draws the lab's provider as it draws the shipped two and keeps its 127.0.0.1 link while it waits, no other provider's http link"],
  ["ds16f", "labOnly", "nothing else points the sign-in: the variable read in the lab's read alone, the table and both doors assigned in signinLabUse alone, called once; no IPC, preload or page module names the file"],
  ["ds16g", "stagingCmd", "tools/signin-staging.cmd is outside the packaged files and starts this tree's own Electron with a profile of its own, never the installed desk, with ETIUDA_SIGNIN_LAB for that start alone"],
  ["ds18a", "waitRead", "no free seat is a wait: the service's 200 with no certificate and the reason \"waiting\" is kept as the said reason with the refresh token, asking nobody; none without it stays no licence; the certificate after it ends the wait; a 409 \"full\" reads as before"],
  ["ds18b", "waitRenew", "the quiet renewal while waiting waits again with its token renewed and nobody asked, and seats the desk once a seat frees; an older service's \"full\" keeps its token as before"],
  ["ds21a", "doorPolicy", "machine policy binds a door as an invitation: no door where it names a folder, only the named lead's where it names a lead, none where it names both; a press at a door not offered changes nothing"],
  ["ds21b", "doorPins", "no door while a pinned team stands; a team the roster or the relay took off leaves the doors; a door of a team pinned under another lead is not offered, under the same lead it is"],
  ["ds21c", "doorUnbar", "a team left, or whose key did not match, is offered at its door, and the press lifts the leave and the doubt after Cancel's snapshot has taken them"],
  ["ds21d", "doorCancel", "Cancel at a door the relay named withdraws the request there and keeps the join until the relay takes it; a door request never named or turned away goes at once; an accepted invitation as before"],
  ["ds21e", "doorWithdrawnEnds", "a door request's withdrawal taken, or nothing left to take, ends the join and puts back what it changed; an invitation's waits withdrawn as before"],
  ["ds21f", "doorWithdrawInvite", "a door request being withdrawn gives the channel its id and the lead's box and never the certificate, signed in or out, so it resumes and never knocks again; unnamed or turned away, nothing"],
  ["ds21g", "signoutUnlinkOwn", "Sign out on a folder team takes seat.json out through the desk's own removal, owed to the share, never a bare unlink"],
  ["ds21h", "signoutAfterRenew", "Sign out during a renewal sends signout/desk only once the renewal has its answer, so the service takes the sign out last, and the renewal's answer is not kept"],
  ["ds21i", "signoutOwed", "a sign out the service did not take is owed in the file with the desk key, asked again at the renewal's next turn while signed out, and cleared once taken"],
  ["ds21j", "signoutDoorJoin", "Sign out lets go of a request made at a team's door through Cancel; an invitation's request, or none, is left alone"],
  ["ds21k", "outOwedView", "the page is told a sign out is owed only while nobody is signed in and none is out"],
  ["ds21l", "outOwedPage", "the page keeps an owed sign out only while signed out, and Account says so under Not signed in in the copywriter's words, Polish too, and nothing otherwise"],
  ["ds18c", "waitPage", "the door and Account tell the wait in the copywriter's words, the licence form and the team form, English and Polish, Check now first; an older service's \"full\" the same; no licence its own moment; today's words gone"],
  ["ds19a", "toldRenewal", "a renewal or Check now the service refuses is said in the door and Account in the copywriter's words: \"desks\" with Check now, \"token\" or any other kept reason settled by signing in again, the providers under it; Polish too"],
  ["ds19b", "toldPressed", "a sign-in pressed while signed in that fails says the desk stays signed in, then the reason's own heading where it has one, with Try again or Use another account; a cancel or a sign-in done says nothing; the door and Account, Polish too"],
  ["ds19c", "checkGap", "Check now asks once per SIGNIN_CHECK_GAP_MS, and a clock set back since the last press does not hold it up"],
  ["ds19d", "saidCleared", "a renewal that reached its end clears a failed press's said, so no stale refusal stands over the desk"],
  ["ds20a", "renewAsk", "Google authorizes with access_type=offline and select_account alone; a renewal with no refresh token or an unopenable sub asks for sign-in again without reaching the provider, in the copywriter's English and Polish words"],
  ["ds20b", "noKeyring", "pressing a provider with no keyring open makes no identity and tells the person plainly in the copywriter's English and Polish words; Account's unkept line is retired"],
  ["ds22a", "certSigned", "a seat certificate is taken only where a delegation from the shipped root, one that may sign licences on the day it was issued, names the key that signed it, for this desk, thirty days at most; each forgery of signature, signer, root, licence right, window, field or key id is not"],
  ["ds22b", "certAsDoor", "the desk takes a certificate exactly where the relay's door takes it (relay/core.cjs certWhy), sample by sample, the genuine one by both"],
  ["ds22c", "certForgedAnswer", "a forged answer, a made-up signature or a stranger's root with a door on the trusted relay, is no seat and offers no door; signin.json edited to a forged certificate holds no seat, while a genuine one, lapsed too, stays"],
  ["ds22d", "certRoot", "the root the desk checks a certificate against is the vendor's, the relay's ROOT_PUB, and the check names it"],
];
for (let [id, name, line] of LEGS) {
  let ok = false;
  try { ok = await CASES[name](S); } catch (e) { ok = false; line += " (threw " + (e && e.message) + ")"; }
  check(ok, id + " " + line);
}

/* ---- the sign-in trace and the declined consent (dt): the provider's own words on this desk's console under ETIUDA_SIGNIN_TRACE=1
   alone, never a code, verifier, secret or token; AADSTS65004 read as the person's Cancel ---------------------------------------- */
function loadTrace(v, swap) {
  const was = process.env.ETIUDA_SIGNIN_TRACE;
  if (v === null) delete process.env.ETIUDA_SIGNIN_TRACE; else process.env.ETIUDA_SIGNIN_TRACE = v;
  try { return load(swap && SECTION.split(swap[0]).length === 2 ? swap : null); }
  finally { if (was === undefined) delete process.env.ETIUDA_SIGNIN_TRACE; else process.env.ETIUDA_SIGNIN_TRACE = was; }
}
/* signinIo as the wiring has it, over `sec`, its console a stand-in that records each line. */
function traceIo(sec, swap) {
  let text = "";
  try { text = decl(MAIN, "function signinIo("); } catch { return { io: {}, lines: [] }; }
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const lines = [], rec = (...a) => { lines.push(a.map(String).join(" ")); };
  const names = ["http", "signinListen", "signinPageOk", "tellSignin", "handOut", "signinRequest", "net", "signinServiceAsk", "signinSign", "signinKeep",
    "safeStorage", "signinKept", "signinPageHtml", "SIGNIN_TRACE_ASKED", "console", "SIGNIN_DESK_PACKED"];
  const no = () => { throw new Error("not in this leg"); };
  const make = new Function(...names, text + "\nreturn signinIo;");
  const io = make({}, no, no, no, no, no, {}, no, no, no, {}, no, no, sec.SIGNIN_TRACE_ASKED, { log: rec, error: rec, warn: rec, info: rec }, true)({ loop: null });
  return { io, lines };
}
/* Every write to this process's console and standard streams while `fn` runs. */
async function consoleDuring(fn) {
  const lines = [], keep = {}, writes = { o: process.stdout.write, e: process.stderr.write };
  for (const k of ["log", "error", "warn", "info", "debug"]) { keep[k] = console[k]; console[k] = (...a) => { lines.push(a.map(String).join(" ")); }; }
  process.stdout.write = c => { lines.push(String(c)); return true; };
  process.stderr.write = c => { lines.push(String(c)); return true; };
  try { await fn(); } finally {
    for (const k of Object.keys(keep)) console[k] = keep[k];
    process.stdout.write = writes.o; process.stderr.write = writes.e;
  }
  return lines;
}
/* One sign-in at Google with the package's secret: the loopback brings `loopQ(state)`, the token door answers `reply(seen)`; `trace`
   records the trace's lines where given. */
const T_CODE = "code-planted-" + "4".repeat(24), T_RT = "rt-planted-" + "5".repeat(24), T_AT = "at-planted-" + "6".repeat(24);
async function traceFlow(s, loopQ, reply, withTrace) {
  const lines = [], seen = {};
  const io = {
    listen: async () => { let yes; const caught = new Promise(a => { yes = a; }); setTimeout(() => yes(seen.q), 5); return { port: 49999, caught, close: () => {} }; },
    openPage: async url => { const q = new URL(url).searchParams; seen.state = q.get("state"); seen.nonce = q.get("nonce"); seen.q = loopQ(seen.state); return true; },
    tokenAsk: async (url, form) => { seen.form = new URLSearchParams(form.toString()); return reply(seen); },
    page: () => "",
  };
  if (withTrace) io.trace = line => { lines.push(line); };
  const got = await s.signinRun(io, G_SECRET, DESK_KEY, () => NOW);
  return { got, lines, seen };
}
const okLoop = st => "state=" + encodeURIComponent(st) + "&code=" + T_CODE;
const hidesAll = (line, seen, extra) => [T_CODE, T_RT, T_AT, STAND_IN, seen.form ? seen.form.get("code_verifier") : "no-form"].concat(extra || [])
  .every(v => line.indexOf(v) < 0) && line.indexOf("eyJ") < 0;
/* Off unless asked: absent, "0", "yes" or " 1" give signinIo no trace and a failing sign-in writes nothing anywhere; "1" alone
   writes one line through console.error. */
CASES.traceDefault = async (s, swap) => {
  const seen = [null, "0", "yes", " 1", "1"].map(v => { const t = traceIo(loadTrace(v, swap), swap); if (typeof t.io.trace === "function") t.io.trace("probe"); return t.lines.length; });
  const sec = load(swap && SECTION.split(swap[0]).length === 2 ? swap : null);
  const refuse = () => answer({ error: "invalid_client", error_description: "AADSTS7000218: planted" }, 401);
  let quiet = null, loud = null;
  const writtenQuiet = await consoleDuring(async () => { quiet = await traceFlow(sec, okLoop, refuse, false); });
  const writtenLoud = await consoleDuring(async () => { loud = await traceFlow(sec, okLoop, refuse, true); });
  return seen.join() === "0,0,0,0,1" && quiet.got.reason === "signin-refused" && writtenQuiet.length === 0
    && loud.got.reason === "signin-refused" && loud.lines.length === 1 && writtenLoud.length === 0;
};
/* The provider's refusal at the loopback: its error and error_description, the reason the desk shows; nothing of a reply whose
   state is not this sign-in's. */
CASES.traceAuthorize = async s => {
  const q = (e, d) => st => "state=" + encodeURIComponent(st) + "&error=" + e + "&error_description=" + encodeURIComponent(d);
  const declined = await traceFlow(s, q("access_denied", "AADSTS65004: User declined to consent to access the app. Trace ID: t-1"), () => answer({}), true);
  const reply = await traceFlow(s, q("invalid_request", "AADSTS50011: The redirect URI does not match"), () => answer({}), true);
  const stray = await traceFlow(s, () => "state=another&error=access_denied&error_description=AADSTS65004", () => answer({}), true);
  const l1 = declined.lines[0] || "", l2 = reply.lines[0] || "", l3 = stray.lines[0] || "";
  return declined.got.reason === "signin-cancelled" && declined.lines.length === 1 && l1.indexOf("authorize: signin-cancelled") > 0
    && l1.indexOf("error=access_denied") > 0 && l1.indexOf("AADSTS65004: User declined") > 0
    && reply.got.reason === "signin-refused" && l2.indexOf("error=invalid_request") > 0 && l2.indexOf("AADSTS50011") > 0
    && stray.got.reason === "signin-state" && /authorize: signin-state$/.test(l3);
};
/* The token door's refusal: error, error_description and error_codes, with the code, the verifier, the secret, every token in the
   answer and any JWT read [hidden], even where the description repeats them; a refused ID token names its claims; a success says
   whether a refresh token came, and nothing of it. */
CASES.traceToken = async s => {
  const loose = jwt({ planted: "a JWT standing alone" });
  const refuse = seen => answer({ error: "invalid_client", error_codes: [7000218], trace_id: "t-2",
    error_description: "AADSTS7000218: The request body must contain client_secret. Echo " + T_CODE + " " + seen.form.get("code_verifier") + " "
      + STAND_IN + " " + T_RT + " " + T_AT + " " + loose, id_token: jwt(gClaims(seen.nonce)), refresh_token: T_RT, access_token: T_AT }, 401);
  const bad = await traceFlow(s, okLoop, refuse, true);
  const good = await traceFlow(s, okLoop, seen => answer({ id_token: jwt(gClaims(seen.nonce)), refresh_token: T_RT, access_token: T_AT }), true);
  const none = await traceFlow(s, okLoop, seen => answer({ id_token: jwt(gClaims(seen.nonce)) }), true);
  const aud = await traceFlow(s, okLoop, seen => answer({ id_token: jwt(Object.assign(gClaims(seen.nonce), { aud: "someone-else-0000" })), refresh_token: T_RT }), true);
  const lb = bad.lines[0] || "", lg = good.lines[0] || "", ln = none.lines[0] || "", la = aud.lines[0] || "";
  return bad.got.reason === "signin-refused" && bad.lines.length === 1 && lb.indexOf("token: signin-refused") > 0 && lb.indexOf("status=401") > 0
    && lb.indexOf("error=invalid_client") > 0 && lb.indexOf("AADSTS7000218: The request body") > 0 && lb.indexOf("error_codes=7000218") > 0
    && hidesAll(lb, bad.seen, [loose]) && (lb.match(/\[hidden\]/g) || []).length >= 6
    && good.got.ok === true && /token: ok \| status=200 \| detail=refresh token given$/.test(lg) && hidesAll(lg, good.seen)
    && none.got.ok === true && /detail=refresh token none$/.test(ln)
    && aud.got.reason === "signin-token" && la.indexOf("aud someone-else-0000") > 0 && la.indexOf("nonce this sign-in's") > 0 && hidesAll(la, aud.seen);
};
/* The quiet refresh: the provider's refusal with the refresh token and the secret hidden; a success says whether the new ID token
   carries a nonce and whether the refresh token was replaced. */
CASES.traceRenew = async s => {
  const seed = "2".repeat(64), lines = [];
  const io = reply => ({ tokenAsk: async () => reply, trace: line => { lines.push(line); } });
  const expired = await s.signinRenew(io(answer({ error: "invalid_grant", error_description: "Token has been expired or revoked. " + T_RT + " " + STAND_IN }, 400)),
    G_SECRET, DESK_KEY, T_RT, seed, "1001", () => NOW);
  const renewed = await s.signinRenew(io(answer({ id_token: jwt(Object.assign(gClaims(undefined), { nonce: undefined })) })), G_SECRET, DESK_KEY, T_RT, seed, "1001", () => NOW);
  const off = await s.signinRenew({ tokenAsk: async () => { throw new Error("net::ERR_PROXY_CONNECTION_FAILED"); }, trace: line => { lines.push(line); } },
    G_SECRET, DESK_KEY, T_RT, seed, "1001", () => NOW);
  const [le, lr, lo] = lines;
  return lines.length === 3 && expired.reason === "signin-expired" && le.indexOf("refresh: signin-expired") > 0 && le.indexOf("error=invalid_grant") > 0
    && le.indexOf("Token has been expired or revoked") > 0 && le.indexOf(T_RT) < 0 && le.indexOf(STAND_IN) < 0
    && renewed.ok === true && /refresh: ok \| status=200 \| detail=nonce none, refresh token kept$/.test(lr)
    && off.reason === "signin-unreached" && lo.indexOf("refresh: signin-unreached | detail=net::ERR_PROXY_CONNECTION_FAILED") > 0;
};
/* The licence service's answer: its status and its own reason where it refuses, the ID token hidden; a failed connection's message. */
CASES.traceService = async s => {
  const lines = [], idTok = jwt(gClaims("n")), seed = "3".repeat(64);
  const io = serve => ({ serviceAsk: serve, sign: signWith(signKey), trace: line => { lines.push(line); } });
  const stale = await s.signinSeat(io(async () => answer({ ok: false, reason: "stale", echo: idTok }, 403)), "google", DESK_KEY, idTok, seed, () => NOW);
  const gone = await s.signinSeat(io(async () => { throw new Error("no answer in time"); }), "google", DESK_KEY, idTok, seed, () => NOW);
  const ok = await s.signinSeat(io(async () => answer({ ok: true, code: CODE, certificate: null })), "google", DESK_KEY, idTok, seed, () => NOW);
  const [ls, lg, lk] = lines;
  return lines.length === 3 && stale.reason === "unreached" && /service: unreached \| status=403 \| reason=stale$/.test(ls) && ls.indexOf("eyJ") < 0
    && gone.reason === "unreached" && /service: unreached \| detail=no answer in time$/.test(lg)
    && ok.ok === true && /service: ok \| status=200 \| detail=certificate none$/.test(lk);
};
/* AADSTS65004, the person declining the consent page, is their Cancel; the organisation's consent codes stay "not allowed". */
CASES.declined = s => {
  const st = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", pending = { state: st };
  const back = q => s.signinBack("state=" + st + "&" + q, pending).reason;
  const d = c => "&error_description=" + encodeURIComponent(c + ": planted");
  return back("error=access_denied" + d("AADSTS65004")) === "signin-cancelled" && back("error=consent_required" + d("AADSTS65004")) === "signin-cancelled"
    && back("error=access_denied" + d("AADSTS65001")) === "signin-notallowed"
    && back("error=access_denied" + d("AADSTS90094")) === "signin-notallowed" && back("error=consent_required") === "signin-notallowed";
};
const TRACE_LEGS = [
  ["dt1", "traceDefault", "the trace is off unless ETIUDA_SIGNIN_TRACE is \"1\": otherwise signinIo carries none and a refused sign-in writes nothing to the console or either stream; on, one line through console.error"],
  ["dt2", "traceAuthorize", "a refusal at the loopback traces its error and error_description with the reason shown; a stray state traces nothing of the reply"],
  ["dt3", "traceToken", "the token door's refusal traces status, error, error_description and error_codes, never the code, verifier, secret, a token or a JWT, even echoed; a refused ID token names its claims; a success says whether a refresh token came"],
  ["dt4", "traceRenew", "the quiet refresh traces the provider's refusal with its token and the secret hidden, whether the new ID token carries a nonce, and a failed connection's message"],
  ["dt5", "traceService", "the licence service's refusal traces its status and its own reason, the ID token hidden; a failed connection and a success are named"],
  ["dt6", "declined", "AADSTS65004 at the loopback is signin-cancelled, whatever the error beside it, the person's own Cancel; AADSTS65001, 90094 and consent_required stay signin-notallowed"],
];
for (let [id, name, line] of TRACE_LEGS) {
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
  && at(outNow, "signinOutSend(") > 0 && at(outNow, "signinOutSend(") < at(outNow, "s.held = null;"),
  "ds9f Sign out is answered for the engine's own frame alone, and the desk's place is freed at the service before the sign-in is cleared");
check(!!handler && at(handler, "/* plant:signin-click */") > 0 && at(handler, "/* plant:signin-offered */") > at(handler, "/* plant:signin-click */")
  && at(handler, "signinRun(") > at(handler, "/* plant:signin-offered */") && /signinOffered\(\)\.find\(x => x\.id === id\)/.test(handler)
  && at(handler, "signinSeat(") > at(handler, "signinRun("),
  "ds4e the sign-in runs only for a trusted click on an offered provider's button, then posts to the service");
check(at(renew, "/* plant:renew-offered */") > 0 && at(renew, "signinRenewHeld(") > at(renew, "/* plant:renew-offered */") && /signinOffered\(\)\.find\(/.test(renew),
  "ds4f the quiet renewal sends nothing unless the provider it signed in with is still offered");
check(/if \(PLACED_ASIDE \|\| harnessLaunch\(\) \|\|/.test(armRenew) && /armNoteLook\(\);\n\s*armSigninRenew\(\);/.test(MAIN),
  "ds4g the renewal is armed once the window opens and never from the harness's own window or any harness start");
check(/openPage: url => \{ if \(!signinPageOk\(url\)\) return false; run\.url = url; tellSignin\(\); return Promise\.resolve\(handOut\(url\)\)/.test(WIRING)
  && /if \(!run \|\| !run\.url \|\| !signinPageOk\(run\.url\)\) return false;/.test(WIRING)
  && (MAIN.match(/shell\.openExternal\(/g) || []).length === 1 && /function handOut\(url\) \{ return shell\.openExternal\(url\); \}/.test(MAIN)
  && /plant:again-page \*\/\n  handOut\(run\.url\);/.test(WIRING),
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
   certificate and write the request there (ds11d), and for Buy to carry the sign-in code to the order page (tests/desk-buy.mjs), none
   of which gates anything. */
const expectOutside = ["signinListen", "armSigninRenew", "signinFlush", "signinFlush", "signinDoorInvite", "signinDoorKept", "signinView"];
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

/* ---- ds23: the desk read against the service's own answers ---------------------------------------------------------------- */
answersWatched = false;
/* What the desk makes of each case the service records, by its name there. A case the record gains with no line here, or a line
   here naming a case the record no longer holds, is red (ds23b): the desk has no reading for an answer the service gives, or reads
   one it no longer gives. A held certificate stands in for what the desk kept before the answer. */
const HELD_BEFORE = () => ({ provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: cert(), at: 1, checked: 1, reached: true, said: "", ask: false });
const unreached = r => r.ok === false && r.reason === "unreached";
const DESK_READS = {
  "seated": (r, c, s) => r.ok === true && !!r.cert && r.cert.desk === c.body.certificate.desk && r.code === c.body.code && r.doors.length === 0
    && s.signinSettle(HELD_BEFORE(), r, NOW).cert === r.cert,
  "seated-doors": (r, c) => r.ok === true && !!r.cert && r.doors.length === c.body.doors.length && r.doors.length > 0,
  "none": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.code === c.body.code && h.cert === null && h.said === ""; },
  "waiting": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.code === c.body.code && h.said === "waiting" && h.ask === false && h.refresh === "sealed:rt"; },
  "signin": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === false && r.reason === "signin" && h.refresh === "" && h.ask === true; },
  "desks": r => r.ok === false && r.reason === "desks",
  "token": r => r.ok === false && r.reason === "token",
  "malformed": unreached, "stale": unreached, "signature": unreached, "replayed": unreached, "slow-down": unreached, "unavailable": unreached,
  "signed-out": (r, c) => r === true,
};
const recordedAnswer = c => ({ status: c.status, bytes: Buffer.from(JSON.stringify(c.body)) });
const caseNames = ANSWER_CASES.map(c => c.case);
check(ANSWER_CASES.length >= 14 && new Set(caseNames).size === caseNames.length && ANSWER_CASES.every(c => (c.route === "signin/desk" || c.route === "signout/desk")
  && Number.isInteger(c.status) && c.body && typeof c.body === "object" && typeof c.means === "string" && c.means),
  "ds23a tests/signin-answers.json is the licence service's record of its desk answers: " + ANSWER_CASES.length + " cases, each named once, of signin/desk and signout/desk");
const unread = caseNames.filter(n => !Object.prototype.hasOwnProperty.call(DESK_READS, n)), gone = Object.keys(DESK_READS).filter(n => caseNames.indexOf(n) < 0);
check(ANSWER_CASES.length > 0 && unread.length === 0 && gone.length === 0,
  "ds23b every answer the service records has a reading here, and every reading here an answer the service records"
  + (unread.length ? "; the desk has no reading for: " + unread.join(" ") : "") + (gone.length ? "; read here, given no longer: " + gone.join(" ") : ""));
/* Where the section checks a certificate's chain to a root it is given (NOTE_ROOT among the declarations it needs), the record's own
   test root stands in, so the service's certificates are read as the service signed them. */
const ROOTED = ANSWERS && /^[0-9a-f]{64}$/.test(String(ANSWERS.root)) ? NEEDS.replace(/\nconst NOTE_ROOT = "[0-9a-f]{64}";/, "\nconst NOTE_ROOT = \"" + ANSWERS.root + "\";") : NEEDS;
const S23 = ROOTED === NEEDS ? S : load(null, undefined, undefined, ROOTED);
const misread = [];
for (const c of ANSWER_CASES) {
  const want = DESK_READS[c.case];
  if (!want) continue;
  let got = null;
  try {
    if (c.route === "signout/desk") got = await S23.signoutAsk({ sign: signWith(signKey), serviceAsk: async () => recordedAnswer(c) }, DESK_KEY, () => NOW);
    else got = S23.signinAnswer(recordedAnswer(c), c.body.certificate ? c.body.certificate.desk : DESK_KEY, true);
    if (!want(got, c, S23)) misread.push(c.case + " read as " + JSON.stringify(got).slice(0, 120));
  } catch (e) { misread.push(c.case + " threw " + (e && e.message)); }
}
check(ANSWER_CASES.length > 0 && misread.length === 0,
  "ds23c the desk reads each answer the service records as its reading here (the wait as a wait, no licence as none, each refusal as itself, the rest as not reached)"
  + (misread.length ? ": " + misread.join("; ") : ""));
/* Every answer the legs above handed the desk: of a shape the service gives (or gave, PAST_ANSWERS), or read as not reached, so no
   leg rests on an answer the service never gives. */
const invented = ANSWERS_READ.filter(a => !SERVED.has(answerSig(a.status, a.body)) && !unreached(a.read || {}))
  .map(a => a.status + " " + JSON.stringify(a.body === undefined ? "(not JSON)" : a.body).slice(0, 100) + " read as " + JSON.stringify(a.read).slice(0, 60));
check(SERVED.size > 0 && ANSWERS_READ.length >= 20 && invented.length === 0,
  "ds23d every answer the legs hand the desk is one the service gives, by the record's shapes, or is read as not reached: " + ANSWERS_READ.length + " read, "
  + answersStray + " handed as stray on purpose"
  + (invented.length ? "; hand-written and read as meaning something: " + Array.from(new Set(invented)).join(" | ") : ""));

/* ---- the plants --------------------------------------------------------------------------------------------------------- */
if (!PLANTS_OFF) {
  /* A PLANT WHOSE ANCHOR IS GONE IS NO PLANT: the swap never happened, so a red would be the throw's and not the line's. Such a plant
     reads NOT red and names the lost anchor (the lead engineer's ν″, 2026-11-13: dsp60 passed silently after its line moved). Every
     other throw is still the planted line breaking its case, and reads red. dspA is the control: a made-up anchor is not red. */
  const ANCHOR_LOST = /plant anchor not in|not in shell\/main\.js once/;
  const plantRed = async (run) => {
    try { return { red: !(await run()), lost: "" }; }
    catch (e) { const m = String(e && e.message || e); return ANCHOR_LOST.test(m) ? { red: false, lost: m } : { red: true, lost: "" }; }
  };
  const said = (r) => (r.lost ? " (anchor gone: " + r.lost.slice(0, 90) + ")" : "");
  const plant = async (id, swap, name, where) => {
    const r = await plantRed(async () => CASES[name](load(swap, where)));
    check(r.red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red" + said(r));
  };
  const ghost = await plantRed(async () => CASES.offered(load(["/* no such anchor anywhere */", ""])));
  check(ghost.red === false && !!ghost.lost, "dspA control: a plant whose anchor is not in the text reads not red and says so" + said(ghost));
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
    const r = await plantRed(async () => CASES[name](S, swap));
    check(r.red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red" + said(r));
  };
  await plantWire("dsp24", ["  if (harnessLaunch() && !signinLabHeld()) return \"\"; /* plant:renew-now-harness */\n", ""], "renewHarness");
  await plantWire("dsp25", ["const SIGNIN_RENEW_MS = 24 * 60 * 60 * 1000; /* plant:renew-daily */", "const SIGNIN_RENEW_MS = 55 * 60 * 1000;"], "renewDaily");
  await plantWire("dsp26", ["if (!p || !me) return \"\"; /* plant:renew-offered */", "if (!me) return \"\";"], "renewWire");
  await plantWire("dsp29", ["const send = () => signoutAsk(signinIo({ loop: null }), key, Date.now); /* plant:signout-post */", "const send = () => Promise.resolve(false);"], "signoutPost");
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
  await plant("dsp45", ["function signinSecretPart(p) { return typeof p.clientSecret === \"string\" && p.clientSecret ? { client_secret: p.clientSecret } : {}; } /* plant:secret-present */",
    "function signinSecretPart(p) { return { client_secret: String(p.clientSecret || \"\") }; }"], "secretSent");
  await plantWire("dsp47", ["link: signinBusy && signinPageOk(signinBusy.url) ? signinBusy.url : \"\",", "link: \"\","], "linkWait");
  await plantWire("dsp48", ["run.url = url; tellSignin(); return Promise", "run.url = url; return Promise"], "linkWait");
  await plantWire("dsp49", ["keeps: sealsForReal(safeStorage, process.platform) }; /* plant:view-link */", "keeps: true };"], "keyringLine");
  await plantWire("dsp50", ["if (!INSTALLED && !app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {", "if (!INSTALLED && process.env.ETIUDA_SIGNIN_LAB) {"], "labPackaged");
  await plantWire("dsp51", ["if (!INSTALLED && !app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {", "if (!app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {"], "labPackaged");
  await plantWire("dsp52", ["return signinLabOn && !!signinState().held; /* plant:lab-held */", "return !!signinState().held;"], "labHarness");
  await plant("dsp55", ["(?:[a-z0-9-]+\\.)*etiuda\\.dev(?:\\/[A-Za-z0-9._~-]+)*\\/$/.test(u)); /* plant:lab-service */", "[a-z0-9.-]+(?:\\/[A-Za-z0-9._~-]+)*\\/$/.test(u)); /* plant:lab-service */"], "labRead"); /* anchored on its own line: Buy's ORDER_PAGE_SHAPE holds the same host pattern */
  await plant("dsp56", ["|| Object.keys(ids).some(id => (id !== \"microsoft\" && id !== \"google\") || typeof ids[id] !== \"string\" || !SIGNIN_CLIENT.test(ids[id]))) return null; /* plant:lab-ids */",
    ") return null;"], "labRead");
  await plantWire("dsp57", ["t[id] = lab.clientIds[id] ? Object.freeze(", "t[id] = false ? Object.freeze("], "labPackaged");
  await plantWire("dsp58", ["  else if (process.env.ETIUDA_GOOGLE_CLIENT_SECRET) signinPacked", "  else if (false) signinPacked"], "labPackaged");
  await plant("dsp53", ["/^http:\\/\\/127\\.0\\.0\\.1:([0-9]{1,5})", "/^http:\\/\\/[a-z0-9.]+:([0-9]{1,5})"], "labRead");
  await plant("dsp54", ["|| !(d.root === undefined || /^[0-9a-f]{64}$/.test(String(d.root)))) return null; /* plant:lab-shape */", ") return null;"], "labRead");
  await plant("dsp59", ["if (d.keyId !== \"studio-\" + crypto.createHash(\"sha256\").update(Buffer.from(d.lead, \"hex\")).digest(\"hex\").slice(0, 16)) return []; /* plant:door-key-id */", ""], "doorsRead");
  await plant("dsp60", ["return { ok: true, code: String(j.code), cert: j.certificate, doors: signinDoorsOk(j.doors, packed) }; /* plant:door-read */", "return { ok: true, code: String(j.code), cert: j.certificate, doors: [] };"], "doorsRead");
  await plant("dsp61", ["doors: ans.cert ? (ans.doors || []) : [],", "doors: ans.doors || [],"], "doorsKept");
  await plantWire("dsp62", ["|| !(held.cert.until > now) || pinnedLead() || teamJoin) return []; /* plant:door-shown */", ") return [];"], "doorJoin");
  await plantWire("dsp63", ["if (!d || !me) return Object.assign({}, joinView(), { refused: \"door\" }); /* plant:door-join-offered */", "if (!me) return joinView();"], "doorJoin");
  await plantWire("dsp64", ["relay: { rt: d.rt, url: d.url, door: true, box: d.box } } }; /* plant:door-join-box */", "relay: { rt: d.rt, url: d.url, door: true, box: d.lead } } };"], "doorJoin");
  await plantWire("dsp65", ["return !!c && c.kind === \"relay\" && r.door === true && /^[0-9a-f]{64}$/.test(String(r.box)) /* plant:door-kept-box */", "return !!c && c.kind === \"relay\" && r.door === true"], "doorEnvelope");
  await plantWire("dsp66", ["&& inv.id === undefined && inv.proof === undefined; /* plant:door-envelope */", "&& false;"], "doorEnvelope");
  await plantWire("dsp67", ["if (inv.end !== undefined) return null; /* plant:door-ended-quiet */", ""], "doorEnded");
  await plantWire("dsp69", ["|| !signinDoorAddressOk(d, packed) /* plant:door-address-keep */", ""], "doorAddress");
  await plantWire("dsp70", ["teamChannelOf({ channel: { kind: \"relay\", rt: d.rt, url: d.url } }) : null; /* plant:door-address-rule */",
    "(String(d.url).length <= 256 && /^https:\\/\\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\\/[A-Za-z0-9._~-]+)*\\/?$/.test(String(d.url)) ? { kind: \"relay\", url: String(d.url) } : null) : null;"], "doorAddress");
  await plantWire("dsp71", ["    if (!signinDoorAddressOk(d, SIGNIN_DESK_PACKED)) return null; /* plant:door-address-offer */\n", ""], "doorAddress");
  await plantWire("dsp72", ["  if (!signinDoorAddressOk(inv, SIGNIN_DESK_PACKED)) return null; /* plant:door-address-knock */\n", ""], "doorAddress");
  await plantWire("dsp73", ["return DOOR_RELAYS.installed.indexOf(at) >= 0 || (packed === false && DOOR_RELAYS.unpackaged.indexOf(at) >= 0); /* plant:door-address-trusted */", "return true;"], "doorAddress");
  await plantWire("dsp74", ["(packed === false && DOOR_RELAYS.unpackaged", "(packed !== true && DOOR_RELAYS.unpackaged"], "doorAddress");
  await plantWire("dsp75", ["const SIGNIN_DESK_PACKED = INSTALLED || !!app.isPackaged; /* plant:door-packed */", "const SIGNIN_DESK_PACKED = !!app.isPackaged; /* plant:door-packed */"], "doorAddress");
  await plantWire("dsp76", ["  signinStore = signinFileRead(text, SIGNIN_DESK_PACKED); /* plant:door-file-packed */", "  signinStore = signinFileRead(text); /* plant:door-file-packed */"], "doorAddress");
  await plantWire("dsp77", ["    packed: SIGNIN_DESK_PACKED, /* plant:door-io-packed */\n", ""], "doorAddress");
  await plantWire("dsp78", ["const ans = signinAnswer(res, deskKey, io.packed); /* plant:door-seat-packed */", "const ans = signinAnswer(res, deskKey); /* plant:door-seat-packed */"], "doorAddress");
  await plantWire("dsp68", ["|| (kind === \"turned\" && !!inv && inv.door === true);", "|| kind === \"turned\";"], "doorEnded");
  await plant("dsp46", ["return Object.freeze(typeof v === \"string\" && SIGNIN_SECRET_SHAPE.test(v) ? { google: v } : {}); /* plant:secret-shape */",
    "return Object.freeze(typeof v === \"string\" ? { google: v } : {});"], "secretPacked");
  await plant("dtp1", ["if (/\\bAADSTS65004\\b/.test(String(said || \"\"))) return \"signin-cancelled\"; /* plant:declined */", ""], "declined");
  await plant("dtp2", ["    for (const v of h) t = t.split(v).join(\"[hidden]\"); /* plant:trace-hide */", ""], "traceToken");
  await plant("dtp3", ["    t = t.replace(/eyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]*(\\.[A-Za-z0-9_-]*)?/g, \"[hidden]\"); /* plant:trace-jwt */", ""], "traceToken");
  await plantWire("dtp4", ["const SIGNIN_TRACE_ASKED = process.env.ETIUDA_SIGNIN_TRACE === \"1\"; /* plant:trace-asked */",
    "const SIGNIN_TRACE_ASKED = process.env.ETIUDA_SIGNIN_TRACE !== undefined;"], "traceDefault");
  await plantWire("dtp5", ["trace: SIGNIN_TRACE_ASKED ? line => console.error(line) : null, /* plant:trace-wired */", "trace: line => console.error(line),"], "traceDefault");
  await plantWire("dtp6", ["if (!io || typeof io.trace !== \"function\") return; /* plant:trace-off */",
    "if (!io || typeof io.trace !== \"function\") { console.error(signinTraceLine(provider, step, shown, said, hide)); return; }"], "traceDefault");
  await plant("dsp79", ["if (j.certificate === null) return { ok: true, code: String(j.code), cert: null, doors: [], waiting: j.reason === \"waiting\" }; /* plant:wait-read */",
    "if (j.certificate === null) return { ok: true, code: String(j.code), cert: null, doors: [] };"], "waitRead");
  await plant("dsp80", ["said: ans.waiting === true ? \"waiting\" : \"\", ask: false }); /* plant:wait-settle */", "said: \"\", ask: false });"], "waitRead");
  await plantWire("dsp93", ["  if (Object.keys(teamPins).some(teamPinStands)) return []; /* plant:door-pin-stands */\n", ""], "doorPins");
  await plantWire("dsp94", ["    if (inviteDoor({ lead: { public: d.lead } })) return null; /* plant:door-policy */\n", ""], "doorPolicy");
  await plantWire("dsp95", ["    if (pin && (pin.keyId !== d.keyId || pin.public !== d.lead)) return null; /* plant:door-pinned */\n", ""], "doorPins");
  await plantWire("dsp96", ["  delete teamLeft[d.team]; teamBarred.delete(d.team); /* plant:door-join-unbar */\n", ""], "doorUnbar");
  await plantWire("dsp97", ["return withdrawJoin(j); /* plant:door-cancel-withdraw */", "return null;"], "doorCancel");
  await plantWire("dsp98", ["  if (j.refused !== true && j.invite.relay.door !== true) return false; /* plant:door-withdrawn-ends */", "  if (j.refused !== true) return false;"], "doorWithdrawnEnds");
  await plantWire("dsp99", ["  if (inv.withdrawing === true) return inv.rt === rt &&", "  if (false) return inv.rt === rt &&"], "doorWithdrawInvite");
  await plantWire("dsp99a", ["try { unlinkOwn(path.join(sharedFolderForWrite(), \"desks\", me.id, SEAT_NAME)); }", "try { fs.unlinkSync(path.join(sharedFolderForWrite(), \"desks\", me.id, SEAT_NAME)); }"], "signoutUnlinkOwn");
  await plantWire("dsp99b", ["  signinRenewing = pending; /* plant:renew-marked */\n", ""], "signoutAfterRenew");
  await plantWire("dsp99c", ["const flight = (signinRenewing ? signinRenewing.then(send, send) : send()).then(ok => { /* plant:signout-after-renew */", "const flight = send().then(ok => {"], "signoutAfterRenew");
  await plant("dsp99d", ["  if (/^[0-9a-f]{64}$/.test(String(d.out))) out.out = String(d.out); /* plant:out-kept */\n", ""], "signoutOwed");
  await plantWire("dsp99e", ["  if (!held && s.out) { await signinOutAgain(); return \"\"; } /* plant:renew-out */\n", ""], "signoutOwed");
  await plantWire("dsp99f", ["  return signinOutSend(s.out); /* plant:out-again */", "  return Promise.resolve(false);"], "signoutOwed");
  await plantWire("dsp99g", ["{ cancelJoin(); sendJoin(theWindow); } /* plant:signout-door */", "{ }"], "signoutDoorJoin");
  await plantWire("dsp99h", ["    outOwed: !signedIn && !!signinState().out && !signinOutFlight, /* plant:out-owed-view */", "    outOwed: false,"], "outOwedView");
  /* The seat's signature (ds22): each check of the chain, and the file's reading of it. */
  await plant("dsp100", ["if (!signinVerified(NOTE_ROOT, viaBytes, d.sig.value)) return false; /* plant:cert-root */", ""], "certSigned");
  await plant("dsp101", ["return signinVerified(d.key.pub, bytes, c.sig.value); /* plant:cert-sig */", "return true;"], "certSigned");
  await plant("dsp102", ["if (c.sig.keyId !== d.key.id) return false; /* plant:cert-via-key */", ""], "certSigned");
  await plant("dsp103", ["if (d.may.indexOf(\"licence\") < 0) return false; /* plant:cert-may */", ""], "certSigned");
  await plant("dsp104", ["if (!at || !first || !last || !(first <= at && at <= last)) return false; /* plant:cert-window */", ""], "certSigned");
  await plant("dsp105", ["cert: h.cert && typeof h.cert === \"object\" && signinCertOk(h.cert, h.cert.desk) ? h.cert : null, /* plant:file-cert */", "cert: h.cert && typeof h.cert === \"object\" && Number.isSafeInteger(h.cert.until) ? h.cert : null,"], "certForgedAnswer");
  await plant("dsp106", ["&& c.until - c.issued <= SIGNIN_CERT_SPAN_MS /* plant:cert-span */", ""], "certSigned");
  /* The page's half, imported again with the line planted. */
  const plantPage = async (id, swap, name) => {
    const r = await plantRed(async () => CASES[name](S, await pageWith(swap)));
    check(r.red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red" + said(r));
  };
  await plantPage("dsp81", ["function signinNoSeat(v){ return v.refused===\"waiting\" || v.refused===\"full\"; } /* plant:no-seat */",
    "function signinNoSeat(v){ return v.refused===\"full\"; }"], "waitPage");
  await plantPage("dsp99i", ["outOwed: !signedIn && o.outOwed===true,", "outOwed: o.outOwed===true,"], "outOwedPage");
  await plantPage("dsp82", ["case \"waiting\": case \"full\": /* plant:wait-say */", "case \"full\":"], "waitPage");
  await plantPage("dsp91", ["\"signin-none\",\"signin-preview\",\"signin-keyring\"];", "\"signin-none\",\"signin-preview\"];"], "noKeyring");
  await plantPage("dsp92", ["    case \"signin-keyring\":\n      return [t(\"Signing in needs a keyring, and none is open on this computer.\"), t(\"Installing or unlocking GNOME Keyring or KDE Wallet, then reopening Etiuda, lets this computer sign in.\")];\n", ""], "noKeyring");
  await plant("dsp87", ["extra: Object.freeze({ prompt: \"select_account\", access_type: \"offline\" }) }), /* plant:google-offline */",
    "extra: Object.freeze({ prompt: \"select_account\" }) }),"], "renewAsk");
  await plantWire("dsp88", ["if (!held || signinBusy) return \"\"; /* plant:renew-no-token */",
    "if (!held || !held.refresh || signinBusy) return \"\";"], "renewAsk");
  await plant("dsp89", ["const got = token && sub ? await signinRenew(io, p, deskKey, token, held.seed, sub, now) : { ok: false, reason: \"signin-ask\" }; /* plant:renew-sub-kept */",
    "const got = token ? await signinRenew(io, p, deskKey, token, held.seed, sub, now) : { ok: false, reason: \"signin-ask\" };"], "renewAsk");
  await plantWire("dsp90", ["  if (!sealsForReal(safeStorage, process.platform)) { signinSaid = \"signin-keyring\"; tellSignin(); return signinView(); } /* plant:signin-keyring */\n",
    ""], "noKeyring");
  /* A gate on a local act, put into the desk file's write in memory, is seen. */
  await plantPage("dsp83", ["if(!r || r===\"signin\" || signinNoSeat(v)) return null; /* plant:told-renewal */", "return null;"], "toldRenewal");
  await plantPage("dsp84", ["  if(FAIL_FIRST.indexOf(v.said)>=0) return {kind:\"pressed\",", "  if(false) return {kind:\"pressed\","], "toldPressed");
  await plantWire("dsp85", ["if (since >= 0 && since < SIGNIN_CHECK_GAP_MS)", "if (since < SIGNIN_CHECK_GAP_MS)"], "checkGap");
  await plantWire("dsp86", ["  signinSaid = \"\"; /* plant:renew-said */\n", ""], "saidCleared");
  const gated = MAIN.replace("function writeBranch(stem, text) {\n", "function writeBranch(stem, text) {\n  if (!signinView().signedIn) return { ok: false };\n");
  check(gated !== MAIN && outsideNames(gated).slice().sort().join() !== expectOutside.slice().sort().join(),
    "dsp14 plant a sign-in gate on the desk file's write turns ds5a red");
}

/* The service's own answers (ds23): four checks, counted apart so the legs' own sum stays where its builders keep it. */
const ANSWER_CHECKS = 4;
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + (EXPECTED + ANSWER_CHECKS) + " plants=" + (PLANTS_OFF ? 0 : PLANTS));
if (asserted !== EXPECTED + ANSWER_CHECKS) { console.log("FAIL the run made " + asserted + " checks of " + (EXPECTED + ANSWER_CHECKS) + ": it did not complete"); failed++; }
console.log(failed ? "desk-signin: " + failed + " failed" : "desk-signin: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
