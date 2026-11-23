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
const PLANTS = 343;
/* The floor: every check below runs, or the file says it did not complete. */
/* The trace and the declined consent (dt): their legs and plants, counted apart. */
const TRACE_CHECKS = 6, TRACE_PLANTS = 6;
const EXPECTED = 220 + TRACE_CHECKS + (PLANTS_OFF ? 0 : PLANTS + 1 + TRACE_PLANTS); /* +1: dspA, the lost-anchor control */

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
  "signinRequest", "signinListen", "signinRun", "signinRenew", "signinKeep", "signinKept", "signinRefreshForm",
  "SIGNIN_SERVICE", "signinDeskBytes", "signinDeskBody", "signinServiceAsk", "signinCertOk", "signinAnswer", "signinSeat", "signinLapsed",
  "signinSettle", "signinRenewHeld", "seatFileText", "SEAT_NAME", "signinFileRead", "signinFileText", "branchIdOf", "inviteRead",
  "SIGNOUT_SERVICE", "signoutDeskBytes", "signoutDeskBody", "signoutAsk", "signinDoorRequest", "signinKnown", "signinPreviewing",
  "signinCodeForm", "signinSecretRead", "SIGNIN_SECRET_FILE", "SIGNIN_SECRET_SHAPE", "sealsForReal", "SIGNIN_WAIT_MS", "signinLabAt", "signinLabRead",
  "signinLabUse", "signinDoorAddressOk", "DOOR_RELAYS", "BUILTIN_RELAY_URL", "signinDoorsSigned", "signinRevokedOk", "signinRevokedNext", "signinRevokedHas", "signinCertEarly", "SIGNIN_SKEW_MS", "signinFileMarkText", "signinFileHeld", "signinMarkBytes", "SIGNIN_FILE_MAX"];
NAMES.push("SIGNIN_TRACE_ASKED", "signinTraceLine", "signinTraceSaid");
NAMES.push("signinLanding", "signinLandingHtml", "signinLandingCsp", "SIGNIN_LAND_MS");
NAMES.push("signinAccessFor", "signinClaims", "signinPinOk");
NAMES.push("signinWorks", "signinViewOf", "signinClockObserve", "signinClockRead", "signinClockText", "signinClockBytes", "signinVerified");
NAMES.push("signinBuyOf", "signinBuyKept");
NAMES.push("signinClockStart", "signinWorksOf", "signinSaidOf", "signinHoldingOf", "signinTrialsOf", "signinWordsOf", "SIGNIN_LEAD_MAX");
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
].concat(["seated", "seated-doors"].map(name => {
  /* The seated answers before their doors came signed: the record's own, doorsSig taken off. The desk keeps the seat, offers no door. */
  const c = ANSWER_CASES.find(x => x.case === name), body = Object.assign({}, c ? c.body : {});
  delete body.doorsSig;
  delete body.revoked;
  return { status: 200, body, until: "Studio f62490a1, decision 35: a certificate's doors now come with doorsSig" };
}));
/* The record is made with REVOKED set, so its answers that name a seat or ask for a sign-in carry `revoked`; a service with REVOKED
   unset gives each of them without it, an answer of today and not a past one. */
const UNREVOKED = ANSWER_CASES.filter(c => c.route === "signin/desk" && c.body && c.body.revoked !== undefined)
  .map(c => { const body = Object.assign({}, c.body); delete body.revoked; return { status: c.status, body }; });
/* Before the offer: the record's answers carry "storeOffer": true (the store gate, Studio's service); the service deployed today gives
   each of them without it, an answer of today and not a past one. */
const BEFORE_OFFER = ANSWER_CASES.filter(c => c.route === "signin/desk" && c.body && c.body.storeOffer !== undefined).concat(PAST_ANSWERS, UNREVOKED)
  .filter(c => c.body && c.body.storeOffer !== undefined).map(c => { const body = Object.assign({}, c.body); delete body.storeOffer; return { status: c.status, body }; });
/* Before the seat and trials (B-1): the record's answers carry `seat` and `trials` beside a certificate or none; the service deployed
   today gives each of them without both, an answer of today and not a past one. */
const BEFORE_SEAT = ANSWER_CASES.filter(c => c.route === "signin/desk").concat(PAST_ANSWERS, UNREVOKED, BEFORE_OFFER)
  .filter(c => c.body && (c.body.seat !== undefined || c.body.trials !== undefined))
  .map(c => { const body = Object.assign({}, c.body); delete body.seat; delete body.trials; return { status: c.status, body }; });
const SERVED = new Set(ANSWER_CASES.filter(c => c.route === "signin/desk").map(c => answerSig(c.status, c.body))
  .concat(PAST_ANSWERS.concat(UNREVOKED, BEFORE_OFFER, BEFORE_SEAT).map(p => answerSig(p.status, p.body))));
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
/* The desk's clock and network as signinView reads them (signinClockNow), stood in: this desk's key, its clock at NOW, online. */
const CLOCK_STAND = () => ({ key: DESK_KEY, desk: NOW, last: 0, online: true });
const msClaims = (nonce, at) => ({ iss: "https://login.microsoftonline.com/" + TENANT + "/v2.0", aud: MS_CLIENT, tid: TENANT, oid: "o-1", sub: "s-1",
  iat: (at || NOW) / 1000, exp: (at || NOW) / 1000 + 3600, nonce: nonce });
const gClaims = nonce => ({ iss: "https://accounts.google.com", aud: G_CLIENT, sub: "1001", email_verified: true, iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: nonce });
/* The service's answer: a certificate's doors are signed beside it as the service signs them (doorsSigOf) unless the answer names
   its own doorsSig, which an older service's answer does as undefined. */
const answer = (obj, status) => ({ status: status || 200, bytes: Buffer.from(JSON.stringify(obj && typeof obj === "object" && obj.certificate
  && obj.certificate.sig && Array.isArray(obj.doors) && !("doorsSig" in obj) ? Object.assign({}, obj, { doorsSig: doorsSigOf(obj.certificate, obj.doors) }) : obj)) });
/* An answer the licence service never gives, handed on purpose to show the desk takes nothing from it beyond the service's own
   shape. ds23d passes it by this mark alone and counts it; any other answer a leg hands the desk is held to tests/signin-answers.json. */
const strayAnswer = (obj, status) => Object.assign(answer(obj, status), { stray: true });
/* The service's own making of the nonce and of the desk's signed bytes, written here from the lines the interface names. */
const serviceNonce = (key, seed) => crypto.createHash("sha256").update("etiuda-licence-signin-nonce\n" + key + "\n" + seed).digest("hex");
/* A first sign-in's seed is the bytes' last line, "seed:" and its hex, where the body carries one (the service's requests.mjs seedLine,
   since review 2's finding 12); a renewal, which sends no seed, signs the lines before it alone. */
const serviceBytes = (provider, idToken, desk, t, seed) => Buffer.from("etiuda-licence-signin-desk\n" + [provider,
  crypto.createHash("sha256").update(idToken).digest("hex"), desk, t].concat(seed ? ["seed:" + seed] : []).join("\n"), "utf8");
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
/* A desk-only licence's certificate carries deskOnly: true, signed as the line "desk-only" after the key id; any other has neither. */
const certBytesOf = c => Buffer.from("etiuda-seat-certificate\n" + [c.format, c.licence, c.desk, c.person, c.code, c.issued, c.until, c.sig.keyId]
  .concat(c.pooled === true ? ["pooled"] : []).concat(c.deskOnly === true ? ["desk-only"] : []).join("\n"), "utf8");
/* The doors beside a certificate as the service signs them, written here from the interface (Studio's seatDoorsBytes): the line
   "etiuda-seat-doors", the certificate's signature value, the number of doors, then each door's team, rt, url, keyId, lead and box,
   one a line, in the order handed, by the key that signed the certificate. */
function doorsSigOf(c, doors, signer) {
  const fields = [c.sig.value, doors.length].concat(...doors.map(d => [d.team, d.rt, d.url, d.keyId, d.lead, d.box]));
  return crypto.sign(null, Buffer.from("etiuda-seat-doors\n" + fields.join("\n"), "utf8"), (signer || SERVICE_KEY).privateKey).toString("hex");
}
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
  const ok = (b, bytes) => !!b && crypto.verify(null, bytes, signKey.publicKey, Buffer.from(b.sig, "hex")) && !crypto.verify(null, bytes, otherKey.publicKey, Buffer.from(b.sig, "hex"));
  /* The first sign-in's seed is inside what the desk signs, so a copy with it taken out does not verify as a renewal's bytes. */
  return ok(first, serviceBytes("microsoft", token, DESK_KEY, t, seed)) && !crypto.verify(null, serviceBytes("microsoft", token, DESK_KEY, t), signKey.publicKey, Buffer.from(first.sig, "hex"))
    && ok(renew, serviceBytes("microsoft", token, DESK_KEY, t)) && Object.keys(first).join() === "provider,idToken,desk,seed,t,sig" && first.seed === seed && first.desk === DESK_KEY
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
/* A managed tenant (a large company's licence that follows the roles its IT assigns): the service's word that it is managed, and why, read
   from a seated answer and a no-role refusal and kept on the seat, and nothing read from an ordinary answer. */
CASES.managedRead = s => {
  const a = (o, st) => s.signinAnswer(answer(o, st), DESK_KEY);
  const held = { provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: null, at: 1, checked: 1, reached: true, said: "", ask: false };
  const seated = a({ ok: true, certificate: cert(), code: CODE, doors: [], managed: true, cause: "assigned" });
  const plain = a({ ok: true, certificate: cert(), code: CODE, doors: [] });
  const no = a({ ok: false, reason: "no-role", managed: true }, 403);
  const h1 = s.signinSettle(held, seated, NOW), h2 = s.signinSettle(held, no, NOW), h3 = s.signinSettle(h1, plain, NOW);
  return seated.ok === true && seated.managed === true && seated.cause === "assigned" && plain.ok === true && plain.managed === undefined
    && no.reason === "no-role" && no.managed === true && h1.managed === true && h1.cause === "assigned" && h2.managed === true && h3.managed === false;
};
/* The store offered: "storeOffer": true beside a seating answer is the one offer; absent, null, "true", 1 or false is none. A seating answer
   says it afresh (a renewal without it ends it); one that does not reach leaves it as it was; it is kept in signin.json. */
CASES.storeOffer = s => {
  /* The offer as the service gives it, a known field because the record names it; a value no service gives is handed as stray, on purpose. */
  const a = (o, st) => s.signinAnswer(answer(o, st), DESK_KEY), stray = (o, st) => s.signinAnswer(strayAnswer(o, st), DESK_KEY);
  const base = { ok: true, certificate: cert(), code: CODE, doors: [] };
  const yes = a(Object.assign({ storeOffer: true }, base)), none = a({ ok: true, certificate: null, code: CODE, storeOffer: true });
  const not = [null, "true", 1, false, {}].map(v => stray(Object.assign({ storeOffer: v }, base)).storeOffer).concat([a(base).storeOffer]);
  const held = { provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: null, at: 1, checked: 1, reached: true, said: "", ask: false };
  const h1 = s.signinSettle(held, yes, NOW), h2 = s.signinSettle(h1, { ok: false, reason: "unreached" }, NOW), h3 = s.signinSettle(h2, a(base), NOW);
  return yes.storeOffer === true && none.storeOffer === true && not.every(v => v === false) && h1.storeOffer === true && h2.storeOffer === true && h3.storeOffer === false;
};
/* Board 1020: "pays" and "held" beside a seating answer. Of "pays" the desk reads `deskOnly` alone (a team's changes nothing here), its provider
   and a portal only where it is Stripe's own login link; of "held" the first entry it can read, newest first. Each seating answer says them
   afresh (a renewal without them ends them); one that does not reach leaves them; signin.json keeps them and reads them typed again. */
CASES.buyWords = s => {
  const stray = o => s.signinAnswer(strayAnswer(Object.assign({ ok: true, certificate: cert(), code: CODE, doors: [] }, o)), DESK_KEY, true);
  const PORTAL = "https://billing.stripe.com/p/login/test_aB3dE5gH7jK9mN1pQ3rS5tU7";
  const E = (kind, at) => ({ kind, provider: "stripe", at: at === undefined ? NOW : at });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const yes = stray({ pays: { deskOnly: { provider: "stripe", portal: PORTAL } } });
  const team = stray({ pays: { team: { provider: "stripe", portal: PORTAL } } });
  const both = stray({ pays: { team: { provider: "stripe" }, deskOnly: { provider: "paddle" } } });
  const odd = ["http://billing.stripe.com/p/login/aB3dE5gH7jK9", "https://billing.example.com/p/login/aB3dE5gH7jK9", "https://billing.stripe.com/p/login/aB3dE5gH7jK9?x=1", 7]
    .map(p => stray({ pays: { deskOnly: { provider: "stripe", portal: p } } }).buy);
  const live = stray({ pays: { deskOnly: { provider: "stripe", portal: "https://billing.stripe.com/p/login/aB3dE5gH7jK9" } } }).buy;
  const nobody = [{ deskOnly: { provider: "someone" } }, { deskOnly: [] }, [], "pays", null].map(p => stray({ pays: p }).buy);
  const one = stray({ held: [E("already-pays")] }), kinds = ["already-pays", "managed", "review", "pending"].map(k => stray({ held: [E(k)] }).buy.held.kind);
  const skip = stray({ held: [E("mystery"), { kind: "review", provider: "elsewhere", at: NOW }, E("review", 0), E("review", 1.5), null, E("managed", NOW - 5), E("pending")] });
  const none = [{ held: E("review") }, { held: [] }, { held: [E("mystery")] }, { held: "review" }].map(o => stray(o).buy);
  const wait = s.signinAnswer(strayAnswer({ ok: true, certificate: null, code: CODE, reason: "waiting", held: [E("already-pays")] }), DESK_KEY, true);
  const held0 = heldOf({ cert: null });
  const h1 = s.signinSettle(held0, yes, NOW), h2 = s.signinSettle(h1, { ok: false, reason: "unreached" }, NOW), h3 = s.signinSettle(h2, stray({}), NOW);
  const h4 = s.signinSettle(h3, stray({ pays: { deskOnly: { provider: "stripe" } }, held: [E("pending")] }), NOW);
  const back = h => s.signinFileRead(s.signinFileText({ held: h })).held;
  const kept = back(h4), fresh = back(h3);
  const forged = JSON.parse(s.signinFileText({ held: h1 })); forged.held.buy.pays.portal = "http://x.example/p/login/aB3dE5gH7jK9"; forged.held.buy.held = { kind: "mystery", provider: "stripe", at: NOW };
  const forgedBack = s.signinFileRead(JSON.stringify(forged)).held;
  const view = s.signinViewOf(h1, viewFacts({})), view4 = s.signinViewOf(h4, viewFacts({})), view3 = s.signinViewOf(h3, viewFacts({}));
  return same(yes.buy, { pays: { provider: "stripe", portal: PORTAL } }) && team.buy === undefined && same(both.buy, { pays: { provider: "paddle" } })
    && odd.every(b => same(b, { pays: { provider: "stripe" } })) && same(live, { pays: { provider: "stripe", portal: "https://billing.stripe.com/p/login/aB3dE5gH7jK9" } })
    && nobody.every(b => b === undefined)
    && same(one.buy, { held: E("already-pays") }) && same(kinds, ["already-pays", "managed", "review", "pending"])
    && same(skip.buy, { held: E("managed", NOW - 5) }) && none.every(b => b === undefined)
    && wait.waiting === true && same(wait.buy, { held: E("already-pays") })
    && same(h1.buy, yes.buy) && same(h2.buy, yes.buy) && h3.buy === undefined && same(h4.buy, { pays: { provider: "stripe" }, held: E("pending") })
    && same(kept.buy, h4.buy) && fresh.buy === undefined && same(forgedBack.buy, { pays: { provider: "stripe" } })
    && same(view.buy, { pays: { provider: "stripe", portal: true } }) && same(view4.buy, { pays: { provider: "stripe", portal: false }, held: E("pending") })
    && view3.buy === undefined && JSON.stringify(view).indexOf("billing.stripe.com") < 0;
};
/* The service's answers read as the interface names them; a certificate for another desk or another code is not taken. */
CASES.answers = s => {
  const a = (o, st) => s.signinAnswer(answer(o, st), DESK_KEY);
  const held = a({ ok: true, certificate: cert(), code: CODE, doors: [] }), none = a({ ok: true, certificate: null, code: CODE });
  const theirs = a({ ok: true, certificate: cert({ desk: OTHER_DESK_KEY }), code: CODE }), mixed = a({ ok: true, certificate: cert(), code: "ABCDEFGHJKMNPQRS" });
  return held.ok === true && held.cert && held.cert.code === CODE && held.code === CODE && none.ok === true && none.cert === null
    && theirs.reason === "unreached" && mixed.reason === "unreached"
    && a({ ok: false, reason: "token" }, 403).reason === "token" && a({ ok: false, reason: "signin" }, 403).reason === "signin"
    && a({ ok: false, reason: "no-role", managed: true }, 403).reason === "no-role" && a({ ok: false, reason: "access-token", managed: true }, 409).reason === "access-token"
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
/* A refusal keeps the last certificate; "signin" forgets the refresh token and sets the certificate aside (dsfe1); a service not reached is only marked; an answer of none
   keeps a held certificate to its own end, `ended` stamped (B-2b; the stamp itself, keepNone), and takes none where none was held. */
CASES.settle = s => {
  const h = { provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: cert(), at: 1, checked: 1, reached: true, said: "", ask: false };
  const full = s.signinSettle(h, { ok: false, reason: "full" }, NOW), freed = s.signinSettle(h, { ok: false, reason: "signin" }, NOW);
  const away = s.signinSettle(h, { ok: false, reason: "unreached" }, NOW), none = s.signinSettle(h, { ok: true, code: CODE, cert: null }, NOW);
  const fresh = s.signinSettle(Object.assign({}, h, { reached: false, said: "full" }), { ok: true, code: CODE, cert: cert({ issued: NOW + 1 }) }, NOW);
  return full.cert === h.cert && full.said === "full" && full.refresh === "sealed:rt" && full.ask === false
    && freed.cert === null && freed.freed === NOW && freed.refresh === "" && freed.ask === true && away.reached === false && away.cert === h.cert && away.at === 1
    && none.cert === h.cert && none.ended === NOW && none.code === CODE && s.signinSettle(Object.assign({}, h, { cert: null }), { ok: true, code: CODE, cert: null }, NOW).cert === null
    && fresh.cert.issued === NOW + 1 && fresh.reached === true && fresh.said === "" && fresh.at === NOW;
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
  const first = await fetchLoop(loop.port, "/?state=a&code=b");
  const query = await loop.caught.catch(() => null);
  loop.land("seat");
  const landed = await get(loop.port, String(first.headers.location || ""));
  await tick(50);
  const again = await get(loop.port, "/?state=a&code=b");
  loop.close();
  return stray === 404 && first.status === 303 && landed === 200 && query === "state=a&code=b" && again !== 200 && again !== 404;
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
  return bare === 400 && wrong === 400 && waiting && right === 303 && query === "state=good&code=y";
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
  return got.ok === true && code === "abc" && codes.join() === "400,400,303";
};
CASES.scopes = s => {
  const ms = s.SIGNIN_PROVIDERS.microsoft, g = s.SIGNIN_PROVIDERS.google, want = "openid profile email offline_access", wantIn = want, gWant = "openid email profile";
  const scopeOf = p => new URL(s.signinAuthorize(p, 50000, DESK_KEY).url).searchParams.get("scope");
  const refresh = new URLSearchParams(s.signinRefreshForm(MS, "rt").toString()).get("scope");
  return ms.scope === wantIn && ms.refreshScope === want && scopeOf(MS) === wantIn && refresh === want
    && g.scope === gWant && scopeOf(G) === gWant && g.refreshScope === "";
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
/* What the desk holds; doors given are signed under its certificate as the service signs them, unless a doorsSig is given. */
const heldOf = over => {
  const h = Object.assign({ provider: "microsoft", refresh: "sealed:rt-1", sub: "sealed:s-1", seed: SEED, code: CODE, cert: cert(), at: 1, checked: 1,
    reached: true, said: "", ask: false }, over);
  if (Array.isArray(h.doors) && h.cert && h.cert.sig && !(over && "doorsSig" in over)) h.doorsSig = doorsSigOf(h.cert, h.doors);
  return h;
};
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
/* The provider or the service away, or the service refusing: the certificate, the code and the provider stay, the desk works on; a freed seat
   keeps the code and the provider, its certificate set aside (dsfe1). */
CASES.renewFail = async s => {
  const plain = answer({ id_token: jwt(msClaims(undefined)) });
  const offline = await s.signinRenewHeld(renewIo(new Error("offline"), answer({})), MS, DESK_KEY, heldOf(), () => NOW);
  const away = await s.signinRenewHeld(renewIo(plain, new Error("offline")), MS, DESK_KEY, heldOf(), () => NOW);
  const busy = await s.signinRenewHeld(renewIo(plain, answer({ ok: false, reason: "unavailable" }, 503)), MS, DESK_KEY, heldOf(), () => NOW);
  const freed = await s.signinRenewHeld(renewIo(plain, answer({ ok: false, reason: "signin" }, 403)), MS, DESK_KEY, heldOf(), () => NOW);
  const kept = r => !!r.held.cert && r.held.code === CODE && r.held.provider === "microsoft";
  return offline.said === "signin-unreached" && kept(offline) && offline.held.reached === false && offline.held.refresh === "sealed:rt-1"
    && away.said === "unreached" && kept(away) && away.held.reached === false && busy.said === "unreached" && kept(busy)
    && freed.said === "signin" && freed.held.cert === null && freed.held.code === CODE && freed.held.provider === "microsoft" && freed.held.refresh === "" && freed.held.ask === true;
};

/* ---- the renewal's wiring, evaluated with stand-ins for the shell around it --------------------------------------------- */
const WIRE_DECLS = ["const SIGNIN_RENEW_MS =", "const SIGNIN_FIRST_MS =", "async function signinRenewNow(", "function armSigninRenew(", "function signinOutNow(",
  "function signinOutSend(", "function signinOutAgain(", "function signinLeave(", "function signinAccountKept(", "function signinPolicyRefuses(", "function signinOutWanted("];
const WIRE_STANDS = ["harnessLaunch", "PLACED_ASIDE", "signinState", "signinOffered", "branchIdentity", "signinIo", "net", "signinRenewHeld",
  "signinSave", "tellSignin", "setTimeout", "pinnedLead", "signinTeamHere", "fs", "path", "catalogFolder", "SEAT_NAME", "signinView", "signoutAsk", "signinLabHeld", "teamJoin", "cancelJoin", "sendJoin", "theWindow", "unlinkOwn", "stand", "signinRevokedNext",
  "storeTurn", "storeForget", "storeEndAgain", "storeLeaveNow"];
/* The store's look after a renewal, its forgetting at a sign out, an owed store/end posted again and an owed leave tried again
   (tests/desk-store-shell.mjs holds them): counted, never run here. */
const WIRE_DEFAULTS = { storeTurn: st => () => { st.storeTurns = (st.storeTurns || 0) + 1; }, storeForget: () => () => {},
  storeEndAgain: st => () => { st.storeEnds = (st.storeEnds || 0) + 1; return Promise.resolve(false); },
  storeLeaveNow: st => () => { st.storeLeaves = (st.storeLeaves || 0) + 1; return Promise.resolve(true); } };
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
  return new Function(...WIRE_STANDS, body)(...WIRE_STANDS.map(n => n === "stand" ? st : n === "signinRevokedNext" && !st[n] ? S.signinRevokedNext
    : !st[n] && WIRE_DEFAULTS[n] ? WIRE_DEFAULTS[n](st) : st[n]));
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
    pinnedLead: () => false, signinTeamHere: () => false, fs, path, catalogFolder: () => "", SEAT_NAME: "seat.json", signoutAsk: s.signoutAsk,
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
const FLUSH_STANDS = ["signinState", "branchIdentity", "pinnedLead", "teamJoin", "catalogFolder", "folderAnswers", "fs", "path", "writeReplacing",
  "seatFileText", "SEAT_NAME", "console", "signinRevokedHas", "signinCertOk", "signinCertEarly", "Date"];
/* `st`: {held, lead, join, root, files (a Set of paths), writes}; the desk's flush as the wiring has it, its mark kept between calls. */
function loadFlush(s, st, swap) {
  let text = FLUSH_DECLS.map(d => { try { return decl(MAIN, d); } catch { return ""; } }).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the flush once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { signinState: () => ({ held: st.held }), branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }), pinnedLead: () => st.lead,
    catalogFolder: () => st.root, folderAnswers: () => true, path,
    fs: { existsSync: p => st.files.has(p), mkdirSync: () => {} }, writeReplacing: (p, t) => { st.files.add(p); st.writes.push({ p, t }); },
    seatFileText: s.seatFileText, SEAT_NAME: s.SEAT_NAME, console: { error() {} }, signinRevokedHas: s.signinRevokedHas, signinCertOk: s.signinCertOk, signinCertEarly: s.signinCertEarly,
    Date: { now: () => NOW } };
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
/* A certificate whose desk is another key (the desk's key made again since it was given) is never written as this desk's seat. */
CASES.flushOwnKey = async (s, swap) => {
  const run = held => { const st = { held, lead: { team: TEAM }, join: null, root: "/share/a", files: new Set(), writes: [] }; const r = loadFlush(s, st, swap)(); return { r, n: st.writes.length }; };
  const other = run(heldOf({ cert: cert({ desk: OTHER_DESK_KEY }) })), own = run(heldOf());
  return other.r === false && other.n === 0 && own.r === true && own.n === 1;
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
  "writeJoin", "fs", "path", "Date", "console", "signinDoorAddressOk", "SIGNIN_DESK_PACKED", "signinRevokedHas", "signinCertEarly", "signinSeatRenew"];
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
    Date: { now: () => NOW }, console: { error() {} }, signinDoorAddressOk: st.addressOk || s.signinDoorAddressOk, signinRevokedHas: s.signinRevokedHas,
    signinCertEarly: s.signinCertEarly, SIGNIN_DESK_PACKED: st.packed === undefined ? true : st.packed, signinSeatRenew: st.renew };
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
  const noKnock = x => x === null || (!!x && !(x.door && typeof x.door === "object"));
  const invitation = { team: TEAM, invite: { id: "2".repeat(16), relay: { rt: RT, inv: "5".repeat(32), token: "x", seal: "y" } } };
  return !!first && JSON.stringify(first.door) === JSON.stringify(c) && first.box === LEAD_BOX && first.inv === undefined && Object.keys(first).join() === "door,box"
    && !!named && named.inv === DOOR_ID
    && ask(doorJoin(), null) === null && noKnock(ask(doorJoin(), Object.assign(heldOf(), { cert: null })))
    && noKnock(ask(doorJoin(), Object.assign(heldOf(), { cert: cert({ desk: OTHER_DESK_KEY }) })))
    && noKnock(ask(doorJoin(), Object.assign(heldOf(), { cert: cert({ until: NOW }) })))
    && ask(doorJoin({ box: "short" })) === null && ask(doorJoin(), undefined, TEAM, "9".repeat(32)) === null
    && ask(invitation) === undefined && ask(doorJoin(), undefined, "t-fedcba9876543210") === undefined && ask(null) === undefined;
};
/* Signed in with no certificate it may knock with (none yet, another desk key's, one run out, one its own revocation list covers), the door's
   invite() hands the channel a seatless request, the lead's box and no certificate, so the channel asks the renewal and waits for it; it
   asks none itself. Signed out it hands nothing, a wrong relay team id nothing, and a standing certificate knocks. */
CASES.doorAsksSeat = (s, swap) => {
  const asks = (held, rt) => {
    const st = doorStand(doorJoin(), held);
    st.asked = 0;
    st.renew = () => { st.asked++; return Promise.resolve(); };
    return { got: loadDoor(s, st, swap).signinDoorInvite(TEAM, rt || RT), asked: st.asked };
  };
  const seatless = x => !!x.got && x.got.seatless === true && x.got.box === LEAD_BOX && x.got.door === false && x.asked === 0;
  const named = (() => { const st = doorStand(doorJoin({ inv: DOOR_ID }), Object.assign(heldOf(), { cert: null })); return loadDoor(s, st, swap).signinDoorInvite(TEAM, RT); })();
  const none = asks(Object.assign(heldOf(), { cert: null })), revoked = asks(heldOf({ revoked: revokedList(1, [heldOf().cert.via.key.pub]) }));
  const other = asks(Object.assign(heldOf(), { cert: cert({ desk: OTHER_DESK_KEY }) })), ended = asks(Object.assign(heldOf(), { cert: cert({ until: NOW }) }));
  const standing = asks(heldOf()), out = asks(null), wrongRt = asks(Object.assign(heldOf(), { cert: null }), "9".repeat(32));
  return seatless(none) && seatless(revoked) && seatless(other) && seatless(ended) && !!standing.got && !!standing.got.door && standing.asked === 0
    && out.got === null && out.asked === 0 && wrongRt.got === null && wrongRt.asked === 0 && !!named && named.inv === DOOR_ID && named.door === false;
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
  const got = s.signinSettle(heldOf({ doors: [] }), { ok: true, code: CODE, cert: c, doors: DOORS_TWO(), doorsSig: doorsSigOf(c, DOORS_TWO()) }, NOW);
  const dropped = s.signinSettle(got, { ok: true, code: CODE, cert: null, doors: DOORS_TWO() }, NOW);
  const refused = s.signinSettle(got, { ok: false, reason: "unreached" }, NOW);
  const back = s.signinFileRead(s.signinFileText({ held: got })).held;
  const forged = s.signinFileRead(s.signinFileText({ held: Object.assign({}, got, { doors: [doorOf({ keyId: "studio-" + "1".repeat(16) })] }) })).held;
  return JSON.stringify(got.doors) === JSON.stringify(DOORS_TWO()) && JSON.stringify(dropped.doors) === "[]" && JSON.stringify(refused.doors) === JSON.stringify(DOORS_TWO())
    && !!back && JSON.stringify(back.doors) === JSON.stringify(DOORS_TWO()) && !!forged && JSON.stringify(forged.doors) === "[]";
};
const DOORJOIN_DECLS = ["function signinDoorsShown(", "function signinDoorJoin(", "function teamPinStands(", "function inviteDoor("];
const DOORJOIN_STANDS = ["init", "readDesk", "signinState", "branchIdentity", "signinCertOk", "pinnedLead", "joinView", "inviteBeforeFor", "joinCommit",
  "newestEpoch", "teamPins", "teamSeen", "teamPinFrom", "relayMirrorOf", "teamShown", "teamRelayGone", "relayCatalogNamed", "persistDeskEnvelope",
  "relayRun", "catalogFolderChanged", "leadPrint", "crypto", "URL", "Date", "signinDoorAddressOk", "SIGNIN_DESK_PACKED",
  "deskBranch", "branchIdOf", "teamRoster", "teamLeft", "teamBarred", "sayJoinPolicy", "path", "process", "signinDoorsSigned", "signinRevokedHas", "signinCertEarly",
  "policyWaits"];
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
    SIGNIN_DESK_PACKED: st.packed === undefined ? true : st.packed, signinDoorsSigned: s.signinDoorsSigned, signinRevokedHas: s.signinRevokedHas,
    signinCertEarly: s.signinCertEarly, policyWaits: () => false };
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
const KEPT_DECLS = ["function relayKept(", "function joinKept(", "function beforeKept(", "function teamChannelOf(", "function knownRelayAddress("];
/* What knownRelayAddress reads, as a harness start: relay.example.test is a leg's stand-in, which only a harness start keeps. */
const KEPT_STANDS = "const BUILTIN_RELAY_URL = \"https://etiuda.dev/relay/v1\", STAGING_RELAY_URL = \"https://etiuda.dev/relay-staging/v1\";\n"
  + "const harnessLaunch = () => true, testServiceOn = false;\n";
CASES.doorEnvelope = (s, swap) => {
  let text = KEPT_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the envelope's readers once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const lib = new Function("SEALED_TEAM_RE", "JOIN_HEX_RE", KEPT_STANDS + text + "\nreturn { relayKept, joinKept };")(/^t-[0-9a-f]{16}$/, /^[0-9a-f]{64}$/);
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
    && /\n  "A team on this licence":"Zespół w tej licencji",/.test(L) && /\n  "Ask to join":"Poproś o dołączenie",/.test(L) /* board 1017 moved this: "Join" was no string; it is the invitation's press now, the door's stays Ask to join */
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
    s.signinDoorAddressOk, true, s.signinRevokedHas, s.signinCertEarly)
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
  const lib = new Function("SEALED_TEAM_RE", "JOIN_HEX_RE", KEPT_STANDS + KEPT_DECLS.map(d => lift(main, d)).filter(Boolean).join("\n") + "\nreturn { relayKept };")(/^t-[0-9a-f]{16}$/, /^[0-9a-f]{64}$/);
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
  /* A test service build (tools/test-service.cjs) is packaged and takes staging's relay too (tests/test-service.mjs). */
  const flag = (installed, packaged, ts) => { try { return new Function("INSTALLED", "app", "testServiceOn", line + "\nreturn SIGNIN_DESK_PACKED;")(installed, { isPackaged: packaged }, !!ts); } catch { return null; } };
  const flagged = flag(true, false) === true && flag(false, true) === true && flag(true, true) === true && flag(false, false) === false
    && flag(true, true, true) === false;
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
/* A managed tenant's account remembered (signinTake keeps "managed" beside no seat where a sign-in was refused with it): Sign out
   forgets it, signed in or not, so Buy, which needs no sign-in, is offered again (the test architect's read of decision 49's pass). */
CASES.signoutManaged = async (s, swap) => {
  const st = outStand(s);
  st.store.held = Object.assign(heldOf(), { managed: true });
  st.store.licenceManaged = true;
  const w = loadWire(st, swap);
  w.signinOutNow();
  await tick(5);
  const st2 = outStand(s);
  st2.store.held = null;
  st2.store.licenceManaged = true;
  const w2 = loadWire(st2, swap);
  w2.signinOutNow();
  await tick(5);
  return st.store.held === null && !("licenceManaged" in st.store) && st2.store.held === null && !("licenceManaged" in st2.store)
    && s.signinFileText(st2.store).indexOf("licenceManaged") < 0;
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
/* ASK YOUR LEAD (a team is its lead's own; decision 47, held for Max's ruling): the ask, the code, Check now and Account; under the
   hairline the person's own trial and its end where its certificate is held, and nothing there once it is had; Polish too. */
CASES.pageAskLead = async () => {
  if (!P) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const until = Date.UTC(2026, 10, 27, 12, 0, 0);
  const running = P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "held", deskOnly: true, askLead: true, trialUntil: until }));
  const had = P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "none", askLead: true }));
  const html = running ? P.signinPanelHtml(running) : "", hadHtml = had ? P.signinPanelHtml(had) : "";
  storage.lsSet("eUiLang", "pl");
  let pl = "";
  try { pl = P.signinPanelHtml(P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "held", deskOnly: true, askLead: true, trialUntil: until }))); }
  finally { storage.lsSet("eUiLang", "en"); }
  return !!running && running.moment === "asklead" && !("code" in running) && running.acts.map(a => a.act).join() === "check,account"
    && html.indexOf("Etiuda licence seats the people its leads add.") > 0 && html.indexOf("The team&#39;s lead invites this account by its email address") > 0 /* board 1017 moved this: it once said give the lead the code */
    && /<p class="sgn-say sgn-own"><b>This account&#39;s own trial is running\.<\/b><span>Fourteen days, until 27 Nov, on up to three computers\./.test(html)
    && html.indexOf('sgn-own"') > html.indexOf("data-signin-act") && !!had && had.moment === "asklead" && hadHtml.indexOf("sgn-own") < 0
    && pl.indexOf("Licencja Etiudy tej organizacji daje miejsce osobom, które dodają jej liderzy.") > 0 && pl.indexOf("Trwa własny okres próbny tego konta.") > 0 && pl.indexOf("do 27 lis") > 0
    && P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "held", deskOnly: true })).moment === "noteam";
};
/* Finding 6: signin.json keeps askLead across a restart, with a desk-only trial cert and with no cert; absent reads false. */
CASES.askLeadFile = s => {
  const trial = cert({ deskOnly: true, until: NOW + 14 * 86400000 });
  const withTrial = s.signinFileRead(s.signinFileText({ held: heldOf({ cert: trial, askLead: true, doors: [] }) })).held;
  const noCert = s.signinFileRead(s.signinFileText({ held: heldOf({ cert: null, askLead: true, doors: [] }) })).held;
  const plain = s.signinFileRead(s.signinFileText({ held: heldOf({ cert: trial, askLead: false, doors: [] }) })).held;
  return !!withTrial && withTrial.askLead === true && !!noCert && noCert.askLead === true && !!plain && plain.askLead === false;
};
/* Two refusals told apart in their own words: the organisation at its provider, and no licence with a seat at our service. */
CASES.pageTwoRefusals = () => {
  if (!P) return false;
  const org = P.signinDoor(view({ said: "signin-notallowed" })), lic = P.signinDoor(view({ signedIn: "microsoft", code: CODE, seat: "none" }));
  /* Board 1017 moved this: the no-licence moment once carried the code; it carries none now. */
  return /sign-in provider/.test(org.heading) && /No Etiuda licence has a seat/.test(lic.say[0]) && !("code" in lic) && org.heading !== lic.say[0];
};
/* Nothing from the provider is shown: the identity is the person's own name and the provider's name. Board 1017 moved this: the
   parts once carried the code, in fours; they carry none now, and nothing groups it. */
CASES.pageNothingFromProvider = () => {
  if (!P) return false;
  const p = P.signinParts(view({ signedIn: "google", code: CODE, seat: "held" }));
  return Object.keys(p).sort().join() === "initial,name,off,sub,team,teamName" && p.sub === "Signed in with Google" && !("signinCodeText" in P);
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
  "signinPageOk", "sealsForReal", "safeStorage", "signinViewOf", "signinClockNow"];
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
    sec.signinPageOk, sec.sealsForReal, undefined, sec.signinViewOf, CLOCK_STAND);
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
    signinKnown: sec.signinKnown, signinAccessFor: sec.signinAccessFor, SIGNIN_PROVIDERS: sec.SIGNIN_PROVIDERS, branchIdentity: branchId || (() => ({ id: DESK_ID, key: DESK_KEY })), net: { fetch: out },
    signinRun: sec.signinRun, signinLanding: sec.signinLanding, signinSeat: out, signinTake: out, signinFlush: out, signinSave: out,
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
    /* signinIo's store answer, off, so the press asks today's scopes; its token hand-off never reached. */
    storeOn: () => false, storeTokenTake: out, signinViewOf: sec.signinViewOf, signinClockNow: CLOCK_STAND,
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
async function acctOf(v, host, setMod) {
  const SET = setMod || await import(pathToFileURL(path.join(ROOT, "src", "modules", "settings.js")).href);
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
   Polish too. Copy hands the shell the link, and nothing once the wait has ended; no Copy hands the code (board 1017). */
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
  /* Copy, through the clipboard write the code's Copy makes. */
  const copied = [];
  const navCopy = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: x => { copied.push(x); return Promise.resolve(); } } }, configurable: true, writable: true });
  globalThis.window = { isSecureContext: true };
  globalThis.document = { querySelector: () => null };
  try {
    P.signinChanged(waitV, false); P.signinAct("copylink");
    P.signinChanged({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held" }, false); P.signinAct("copylink"); P.signinAct("copy");
    P.signinChanged({ offered: ["microsoft"] }, false);
  } finally { delete globalThis.window; delete globalThis.document; if (navCopy) Object.defineProperty(globalThis, "navigator", navCopy); else delete globalThis.navigator; }
  return d.moment === "waiting" && d.link === LINK_URL && panel.indexOf('</button></div><div class="sgn-link" data-signin-link>') > 0
    && panel.indexOf(field) > 0 && words(panel).indexOf(LINK_LINE) >= 0 && panel.lastIndexOf("data-signin-link") > panel.lastIndexOf('data-signin-act="stop"')
    && none.every(h => !/data-signin-link/.test(h)) && /data-signin-act="stop">Cancel<\/button><\/span><div class="sgn-link" data-signin-link>/.test(acct)
    && acct.indexOf(field) > 0 && !/data-signin-link/.test(acctNone) && words(pl).indexOf(LINK_LINE_PL) >= 0
    /* Board 1017 moved this: the code's Copy once copied the code too ([LINK_URL, CODE]); no code is copied now. */
    && JSON.stringify(copied) === JSON.stringify([LINK_URL]);
};
/* Finding 9: during the folder step (busy with no link, where Open the browser again does nothing), the button is not offered in the panel or Account. */
CASES.waitingAgain = async (s, page, setMod) => {
  const pg = page || P;
  if (!pg) return false;
  const withLink = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], busy: "microsoft", link: LINK_URL }));
  const noLink = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], busy: "microsoft", link: "" }));
  const panelWith = pg.signinPanelHtml(withLink), panelNo = pg.signinPanelHtml(noLink);
  const acctWith = page ? "" : await acctOf({ offered: ["microsoft"], busy: "microsoft", link: LINK_URL }, undefined, setMod);
  const acctNo = page ? "" : await acctOf({ offered: ["microsoft"], busy: "microsoft", link: "" }, undefined, setMod);
  /* Verify with the shell's own signinFolderAfter + etiuda:signin-again: during the folder step, run.url is "" and signin-again answers false. */
  const afterFn = tryDeclText("function signinFolderAfter("), viewFn = tryDeclText("function signinView("), againIpc = ipcSlice('ipcMain.handle("etiuda:signin-again",');
  let hold = null, handed = 0, againFn = null;
  const run = { loop: { onward: () => new Promise(() => {}), land: () => {} }, provider: "microsoft", url: LINK_URL };
  const sh = new Function("signinState", "signinBusy", "signinPageOk", "handOut", "fromEngine", "ipcMain", "signinFolderAsk", "storeTurn", "storeTokenTake", "tellSignin",
    "signinOffered", "signinPreviewing", "signinLapsed", "signinDoorsShown", "signinRelaySeat", "signinOutFlight", "sealsForReal", "safeStorage", "process", "deskStranded", "signinAccountKept", "SIGNIN_PROVIDERS", "signinSaid", "signinViewOf", "signinClockNow",
    afterFn + "\n" + viewFn + "\n" + againIpc + "\nreturn { signinFolderAfter, signinView };")(
    () => ({ held: { provider: "microsoft", code: CODE, seed: SEED }, managed: { any: false } }), run, s.signinPageOk, () => { handed++; }, () => true,
    { handle: (ch, fn) => { againFn = fn; } }, () => new Promise(r => { hold = r; }), () => {}, () => {}, () => {},
    () => [MS], () => false, () => false, () => [], () => "", null, () => true, {}, { platform: "win32" }, false, () => false, s.SIGNIN_PROVIDERS, "", s.signinViewOf, CLOCK_STAND);
  sh.signinFolderAfter(run, { tokenAsk: async () => ({ status: 0 }) }, MS, DESK_KEY, { sub: "s-1" });
  const duringView = sh.signinView(), againAns = await againFn({});
  const folderDoor = pg.signinDoor(pg.signinRead(duringView));
  if (hold) hold("");
  return withLink.acts.map(a => a.act).join() === "again,stop" && noLink.acts.map(a => a.act).join() === "stop"
    && /data-signin-act="again"/.test(panelWith) && !/data-signin-act="again"/.test(panelNo) && /data-signin-act="stop"/.test(panelNo)
    && (page ? true : /data-signin-act="again"/.test(acctWith) && !/data-signin-act="again"/.test(acctNo) && /data-signin-act="stop"/.test(acctNo))
    && duringView.busy === "microsoft" && duringView.link === "" && againAns === false && handed === 0
    && !!folderDoor && folderDoor.acts.map(a => a.act).join() === "stop";
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
CASES.accountPress = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const el = () => ({ hidden: true, dataset: {}, innerHTML: "", title: "", classList: { toggle() {} }, setAttribute() {}, focus() {}, contains: () => false });
  const dom = { "#signinWrap": el(), "#signinBtn": el(), "#signinPanel": el() };
  const answer = { offered: ["microsoft", "google"], preview: true, said: "signin-preview" };
  globalThis.window = { E_HOST: { signinState: () => ({ offered: ["microsoft", "google"], preview: true }), signIn: () => Promise.resolve(answer) } };
  globalThis.document = { querySelector: q => dom[q] || null };
  let fromAccount = null, fromPanel = null;
  try {
    pg.signinChanged({ offered: ["microsoft", "google"], preview: true }, false);
    pg.signinStart("microsoft", "account");
    await tick(5);
    fromAccount = dom["#signinPanel"].hidden;
    pg.signinStart("google");
    await tick(5);
    fromPanel = dom["#signinPanel"].hidden;
  } finally { delete globalThis.window; delete globalThis.document; }
  return fromAccount === true && fromPanel === false && /signinStart\(b\.getAttribute\("data-e-provider"\), "account"\)/.test(SETTINGS);
};
/* "Copied" on screen (the product designer's edit to the built block): the link's Copy, its two
   labels stacked in one cell so it keeps the wider width; board 1017 moved this, as the code's Copy it once also held is gone; a copy the clipboard took turns it to "Copied" for SIGNIN_COPIED_MS, then
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
  globalThis.window = { isSecureContext: true };
  globalThis.document = { querySelector: () => null };
  const code = btn(), refused = btn(), link = btn();
  let during = false, after = true, linkDuring = false;
  try {
    P.signinChanged(signed, false);
    await P.signinAct("copy", code);
    during = !code.set.has("sgn-done");
    P.signinChanged({ offered: ["microsoft"], busy: "microsoft", link: LINK_URL }, false);
    took = false; await P.signinAct("copylink", refused); took = true;
    await P.signinAct("copylink", link);
    linkDuring = link.set.has("sgn-done");
    await tick(P.SIGNIN_COPIED_MS + 80);
    after = code.set.has("sgn-done") || link.set.has("sgn-done");
    P.signinChanged({ offered: ["microsoft"] }, false);
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator;
    delete globalThis.window; delete globalThis.document;
  }
  return P.SIGNIN_COPIED_MS === 1500 && P.signinCopyHtml("copy") === BTN("copy") && noteam.indexOf("sgn-copy") < 0 && acct.indexOf("sgn-copy") < 0
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
/* One order in the panel (the product designer): the fact, its line; no licence's refusal stands as no team's heading and line do,
   under the identity and above the acts. Board 1017 moved this: the code's box once stood between the line and the acts; none now. */
CASES.panelOrder = () => {
  if (!P) return false;
  const inOrder = (h, keys) => keys.map(k => h.indexOf(k)).every((at, i, a) => at >= 0 && (i === 0 || at > a[i - 1]));
  return ["microsoft", "google"].every(id => {
    const nolicence = P.signinPanelHtml(P.signinDoor(view({ signedIn: id, code: CODE, seat: "none" })));
    const noteam = P.signinPanelHtml(P.signinDoor(view({ signedIn: id, code: CODE, seat: "held" })));
    return inOrder(nolicence, ['class="sgn-id"', 'class="sgn-say"', 'class="sgn-acts"'])
      && inOrder(noteam, ['class="sgn-id"', "<h4>", 'class="sgn-lede"', 'class="sgn-acts"']) && (nolicence + noteam).indexOf("sgn-code") < 0;
  });
};

/* ---- the sign-in lab (ds15) ---------------------------------------------------------------------------------------------
   ETIUDA_SIGNIN_LAB names a lab file, which a desk neither installed nor packaged takes at start: a third provider, "lab", and the
   service's door at the lab's. Its addresses here are the provider double's as Studio's tools/oidc-lab.mjs makes them. */
const LAB_ROOT = "d".repeat(64), LAB_CLIENT = "lab-client-0123456789";
function labFile(port, over, pover) {
  const at = "http://127.0.0.1:" + port, named = "https://oidc-lab.localhost:" + port;
  return Object.assign({ provider: Object.assign({ id: "lab", issuer: named, authorize: at + "/authorize", token: at + "/token", jwks: named + "/jwks",
    clientId: LAB_CLIENT, scope: "openid profile email offline_access" }, pover), service: at + "/licence/v1/", root: LAB_ROOT }, over);
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
    let followed = 0, following = null, loop = null;
    const io = { listen: (pageFor, takes) => s.signinListen(http, pageFor, 10000, takes).then(l => (loop = l)),
      openPage: async url => { following = fetch(url, { redirect: "follow" }).then(r => r.status); return true; },
      tokenAsk: (u, f) => s.signinRequest(fetch, u, f), serviceAsk: (u, b) => s.signinServiceAsk(fetch, u, b), sign: signWith(signKey), page: ok => ok ? "ok" : "no" };
    const got = await s.signinRun(io, p, DESK_KEY, Date.now);
    const ans = got.ok ? await s.signinSeat(io, "lab", DESK_KEY, got.idToken, got.seed, Date.now) : { ok: false };
    if (loop) loop.land(s.signinLanding(got, ans));
    followed = following ? await following : 0;
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
   signinLabUse alone, which is called by the lab's read and the test service build's (tests/test-service.mjs); no IPC, preload or page
   module names the lab's file. */
CASES.labOnly = () => {
  const n = re => (MAIN.match(re) || []).length;
  const i = MAIN.indexOf("/* plant:lab-packaged */"), block = i < 0 ? "" : MAIN.slice(MAIN.lastIndexOf("\n", i), MAIN.indexOf("\n}\n", i));
  const pageNames = fs.readdirSync(path.join(ROOT, "src", "modules")).filter(f => /ETIUDA_SIGNIN_LAB/.test(fs.readFileSync(path.join(ROOT, "src", "modules", f), "utf8")));
  const env = /process\.env\.ETIUDA_SIGNIN_LAB\b|process\.env\[/g;
  return !!block && n(/process\.env\.ETIUDA_SIGNIN_LAB\b/g) === 2 && (block.match(env) || []).length === 2
    /* The two other assignments are machine policy's pin (decision 49, tests/desk-managed.mjs), which narrows the shipped table and never
       names one, and the shipped table itself while policy has not answered (tests/join-policy.mjs 19p). */
    && n(/(?<!let )\bSIGNIN_PROVIDERS = /g) === 3 && n(/\n  const pinned = signinPinTable\(signinTableBase, managed\);\n/g) === 1
    && n(/\n  SIGNIN_PROVIDERS = managed\.waiting === true \? signinTableBase : pinned; \/\* plant:signin-file-unpinned \*\/\n/g) === 1
    && n(/\n  SIGNIN_PROVIDERS = pinned; \/\* plant:pin-taken \*\/\n/g) === 1
    && n(/(?<!let )\bSIGNIN_SERVICE = /g) === 1 && n(/(?<!let )\bSIGNOUT_SERVICE = /g) === 1
    && n(/\bsigninLabUse\(/g) === 3 && /\(testServiceOn = signinLabUse\(signinLabRead\(JSON\.stringify\(fields\)\)\)\)/.test(MAIN) && n(/\bsigninLabOn = true/g) === 1 && /SIGNIN_PROVIDERS = [^\n]*\n  SIGNIN_SERVICE = lab\.signin;\n  SIGNOUT_SERVICE = lab\.signout;/.test(MAIN)
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
/* Board 1017 moved the second lines, which once said the team's lead sees this account's sign-in code among those who have signed in. */
const WAIT_EN = ["No seat is free on the organisation's licence just now.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nothing is needed here."];
const WAIT_TEAM_EN = ["Ada's team has no free seat just now.",
  "The sign-in worked. This computer takes a seat by itself as soon as one is free; nothing is needed here. The team's lead: Ada."];
const WAIT_PL = ["W licencji organizacji nie ma teraz wolnego miejsca.",
  "Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; tutaj nie trzeba nic robić."];
const WAIT_TEAM_PL = ["Ada's team nie ma teraz wolnego miejsca.",
  "Logowanie się powiodło. Ten komputer sam zajmie miejsce, gdy tylko któreś się zwolni; tutaj nie trzeba nic robić. Lider zespołu: Ada."];
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
const SAY_NOTASSIGNED_EN = ["This account's organisation has not allowed Etiuda at its sign-in provider.", "Its IT department can allow it; another account can be used meanwhile."];
const SAY_NOTASSIGNED_PL = ["Organizacja tego konta nie dopuściła Etiudy u swojego dostawcy logowania.", "Może to zmienić jej dział IT; do tego czasu można użyć innego konta."];
const NEW_FAILED = "The new sign-in did not finish.", KEPT = "This computer stays signed in with the account it had.";
const SAY_PRESSED = why => [NEW_FAILED, why ? KEPT + " " + why : KEPT];
const sayIs = (a, b) => Array.isArray(a) && a.length === 2 && a[0] === b[0] && a[1] === b[1];
const textOf = h => String(h).replace(/<[^>]*>/g, "\n").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const saidIn = (h, pair) => { const x = textOf(h); return x.indexOf(pair[0]) >= 0 && x.indexOf(pair[1]) >= 0; };
/* A renewal's refusal kept as the said reason, in the copywriter's words: "desks" with Check now; "signin-notassigned" in its own
   words with no sign-in offered; "token", or any other reason the shell keeps, settled by signing in again, the providers under it;
   the door and Account alike, Polish too. */
CASES.toldRenewal = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const base = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held" };
  const door = o => pg.signinDoor(pg.signinRead(Object.assign({}, base, o)));
  const desks = door({ refused: "desks" }), token = door({ refused: "token" }), other = door({ refused: "elsewhere" }), none = door({});
  const notassigned = door({ refused: "signin-notassigned" }), notassignedM = door({ refused: "signin-notassigned", managed: { on: true, contact: "IT" } });
  let pl = null, plNotassigned = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = door({ refused: "desks" }).say; plNotassigned = door({ refused: "signin-notassigned" }).say; } finally { storage.lsSet("eUiLang", "en"); }
  const acct = page ? null : [await acctOf(Object.assign({}, base, { refused: "desks" })), await acctOf(Object.assign({}, base, { refused: "token" })),
    await acctOf(Object.assign({}, base, { refused: "signin-notassigned" }))];
  return sayIs(desks.say, SAY_DESKS) && desks.acts[0].act === "check" && desks.acts[0].label === "Check now" && desks.acts[0].solid === true
    && sayIs(token.say, SAY_TOKEN) && token.providers.join() === "microsoft,google" && sayIs(other.say, SAY_TOKEN) && none.moment === "noteam" && !none.say
    && notassigned.moment === "renewal" && sayIs(notassigned.say, SAY_NOTASSIGNED_EN) && !notassigned.providers && notassigned.acts.map(a => a.act).join() === "account"
    && notassignedM.moment === "renewal" && notassignedM.say[0] === "Your organisation has not given this account access to Etiuda." && /IT/.test(notassignedM.say[1]) && !notassignedM.providers
    && !!pl && pl[0] === "To konto jest już zalogowane na trzech komputerach." && pl[1] === "Miejsce w licencji obejmuje trzy komputery. Wylogowanie się na jednym z pozostałych zwolni jego miejsce, a ten komputer sam sprawdzi ponownie."
    && !!plNotassigned && sayIs(plNotassigned, SAY_NOTASSIGNED_PL)
    && (page ? true : saidIn(acct[0], SAY_DESKS) && saidIn(acct[1], SAY_TOKEN)
      && (acct[1].match(/data-e-open="signin"/g) || []).length === 2
      && saidIn(acct[2], SAY_NOTASSIGNED_EN) && (acct[2].match(/data-e-open="signin"/g) || []).length === 0);
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
  new Function("ipcMain", "fromEngine", "signinRenewNow", "signinPressNow", "signinView", "SIGNIN_CHECK_GAP_MS", "Date", "let signinCheckAt = 0;\n" + text)(
    ipc, () => true, async () => { st.renews++; return "renewed"; }, async () => { st.renews++; return true; }, () => ({}), 10 * 1000, clock);
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
/* Machine policy binds a door as it binds an invitation: only the named lead's where it names a lead; a press at a door it does not
   offer changes nothing. Was also none where it names a folder, or both; now a team works over the relay only and a folder in the
   policy is not read, so a folder binds nothing and both bind as the lead alone. */
CASES.doorPolicy = (s, swap) => {
  const mixed = heldOf({ doors: [doorOf(), doorOf({ team: "t-fedcba9876543210", lead: OTHER_LEAD, keyId: OTHER_KEY_ID })] });
  const share = "\\\\server\\team";
  const free = shownOf(s, { held: mixed }, swap), folder = shownOf(s, { held: mixed, policy: { folder: share } }, swap);
  const lead = shownOf(s, { held: mixed, policy: { lead: DOOR_LEAD } }, swap), other = shownOf(s, { held: mixed, policy: { lead: OTHER_LEAD } }, swap);
  const both = shownOf(s, { held: mixed, policy: { lead: DOOR_LEAD, folder: share } }, swap);
  const q = doorJoinStand({ held: mixed, policy: { lead: OTHER_LEAD } }), x = loadDoorJoin(s, q, swap), r = x.signinDoorJoin(0);
  return free === "0,1" && folder === "0,1" && lead === "0" && other === "1" && both === "0"
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
const CANCEL_DECLS = ["function cancelJoin(", "function refusedWithdrawEnds(", "function signinLeave("];
const CANCEL_STANDS = ["init", "readDesk", "inviteAccepted", "withdrawJoin", "deskBranch", "unlinkOwn", "joinFile", "newestEpoch", "undoInvite",
  "persistDeskEnvelope", "joinView", "endRefusedRelay", "requestSent", "signinOutWanted", "signinTeamHere", "sendJoin", "storeForget", "signinOutSend"];
function loadCancel(st, swap) {
  let text = CANCEL_DECLS.map(d => tryDeclText(d)).filter(Boolean).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in Cancel once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const vals = { init: st, readDesk: () => ({}), inviteAccepted: () => st.accepted === true, withdrawJoin: j => { st.withdrawn.push(j); return { view: "withdrawing" }; },
    deskBranch: {}, unlinkOwn: f => { st.unlinked.push(f); }, joinFile: () => "/relay/" + RT + "/desks/" + DESK_ID + "/join.json", newestEpoch: () => 0,
    undoInvite: () => { st.undone++; }, persistDeskEnvelope: () => {}, joinView: () => ({ view: true }), endRefusedRelay: j => { st.ended.push(j); },
    requestSent: () => st.sent !== false, signinOutWanted: () => false, signinTeamHere: () => false, sendJoin: () => {}, storeForget: () => {}, signinOutSend: () => {} };
  const body = "let deskKeys = {}, teamJoin = init.join, joinTold = true, signinWrote = \"\", theWindow = null, SEAT_NAME = \"seat.json\", path = null, catalogFolder = () => \"\";\n" + text + "\nreturn { cancelJoin, refusedWithdrawEnds, signinLeave, join: () => teamJoin };";
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
  st.catalogFolder = () => path.join(path.sep, "share", "team");
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

/* Cancel and Sign out take a request back through the relay only where one went up (Argon 50, finding 4): at a door and by a
   token the join goes at once, what it changed put back, where nothing was uploaded; where the request went up, or its reply was
   lost, the join stays withdrawing until the relay takes the deletion. */
CASES.cancelUnsent = (s, swap) => {
  const run = (join, sent, out) => {
    const st = cancelStand(join, true), had = join;
    st.sent = sent;
    const x = loadCancel(st, swap);
    if (out) x.signinLeave({ held: null }, null); else x.cancelJoin();
    return { st, j: x.join(), had };
  };
  const goes = o => o.st.withdrawn.length === 0 && o.j === null && o.st.undone === 1 && o.st.unlinked.length === 1;
  const stays = o => o.st.withdrawn.length === 1 && o.st.withdrawn[0] === o.had && o.j === o.had && o.st.undone === 0;
  const door = () => doorAsked({ inv: DOOR_ID }), token = () => relayAsked();
  return goes(run(door(), false, false)) && stays(run(door(), true, false)) && goes(run(token(), false, false)) && stays(run(token(), true, false))
    && goes(run(door(), false, true)) && stays(run(door(), true, true));
};

/* ---- leaving an account by signing in as another (review 2026-11-16, findings 11, 8, 1 and 2) ------------------------------- */
/* The press, Sign out and the renewal as the wiring has them, sliced together over stand-ins that count every door out: the provider
   (signinRun, naming the account `st.sub`), the service (signinSeat answering `st.answer`, signoutAsk), the team's folder, the door's
   join, the store. Every post to the service is kept in `st.order` by route and account, in the order sent. */
const SWITCH_DECLS = ["function signinTake(", "function signinHeldIs(", "function signinAccountKept(", "function signinPolicyRefuses(", "function signinOtherHeld(", "function signinOutNow(",
  "function signinLeave(", "function signinOutWanted(", "async function signinSwitchOut(", "function signinOutSend(", "function signinOutAgain(", "function signinTeamHere(", "function signinFlush(", "async function signinRenewNow("];
const SWITCH_STANDS = ["ipcMain", "fromEngine", "LINK_CLICK_MS", "signinState", "signinOffered", "signinPreviewing", "signinKnown", "tellSignin", "net",
  "sealsForReal", "safeStorage", "process", "branchIdentity", "signinIo", "storeOn", "signinFolderApart", "SIGNIN_FOLDER_LAND_MS", "signinAccessFor", "signinRun",
  "signinSeat", "signinSeatAccess", "storeTokenTake", "storeEndAgain", "storeLeaveNow", "signinFolderAfter", "storeTurn", "signinLanding", "signinSave",
  "signinKeep", "signinKept", "signinSame", "signinSettle", "harnessLaunch", "signinLabHeld", "teamJoin", "cancelJoin", "sendJoin", "theWindow", "pinnedLead",
  "unlinkOwn", "path", "catalogFolder", "SEAT_NAME", "storeForget", "signoutAsk", "signinCertEarly", "signinRevokedHas", "signinCertOk", "folderAnswers",
  "fs", "writeReplacing", "seatFileText", "console", "signinRenewHeld", "signinRevokedNext", "signinClaims", "signinPinOk"];
const SUB_B = "s-2";
function switchStand(s, o) {
  const opt = o || {};
  const st = { order: [], runAccess: [], took: [], unlinked: [], writes: [], cancels: 0, sends: 0, forgets: 0, saves: 0, tells: 0, ends: 0, leaves: 0, turns: 0,
    store: { held: heldOf(opt.held || {}), managed: opt.managed || null }, sub: SUB_B, answer: { ok: true, code: CODE, cert: null, doors: [] }, outOk: true };
  if (opt.licenceManaged) st.store.licenceManaged = true;
  const who = () => (st.store.held ? String(st.store.held.sub).replace(/^sealed:/, "") : "none");
  Object.assign(st, {
    ipcMain: { on: (ch, fn) => { st.on = st.on || {}; st.on[ch] = fn; }, handle: (ch, fn) => { st.handle = st.handle || {}; st.handle[ch] = fn; } },
    fromEngine: () => true, LINK_CLICK_MS: 2000, signinState: () => st.store, signinOffered: () => [MS], signinPreviewing: () => false, signinKnown: () => true,
    tellSignin: () => { st.tells++; }, net: { fetch: () => { throw new Error("no network in a leg"); } }, sealsForReal: () => true, safeStorage: {},
    process: { platform: "win32" }, branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }), signinIo: () => ({ store: false }), storeOn: () => false,
    signinFolderApart: () => false, SIGNIN_FOLDER_LAND_MS: 0, signinAccessFor: opt.accessFor || s.signinAccessFor,
    signinRun: async (io, p, key, now, access) => { st.runAccess.push(access); if (st.runGate) await st.runGate; return { ok: true, idToken: "id-" + st.sub, seed: "b".repeat(64), sub: st.sub, refreshToken: "rt-" + st.sub }; },
    signinSeat: async () => { st.order.push("signin/desk " + st.sub); return typeof st.answer === "function" ? st.answer() : st.answer; },
    signinSeatAccess: null, storeTokenTake: () => {}, storeEndAgain: () => { st.ends++; return Promise.resolve(false); },
    storeLeaveNow: () => { st.leaves++; return Promise.resolve(true); }, signinFolderAfter: () => {}, storeTurn: () => { st.turns++; },
    signinLanding: () => "landed", signinSave: () => { st.saves++; },
    signinKeep: (ss, pl, t) => (t ? "sealed:" + t : ""), signinKept: (ss, x) => String(x || "").replace(/^sealed:/, ""), signinSame: (a, b) => a === b,
    signinSettle: s.signinSettle, harnessLaunch: () => false, signinLabHeld: () => false, teamJoin: opt.join || null,
    cancelJoin: () => { st.cancels++; }, sendJoin: () => { st.sends++; }, theWindow: null, pinnedLead: () => (opt.join ? null : { team: TEAM }),
    unlinkOwn: f => { st.unlinked.push(String(f) + " " + who()); }, path, catalogFolder: () => path.join(path.sep, "share", "team"), SEAT_NAME: "seat.json",
    storeForget: () => { st.forgets++; }, signoutAsk: async () => { const o = "signout/desk " + who(); st.order.push(o); await (st.outGate || tick(2)); st.order.push(o + " answered"); return st.outOk; },
    signinCertEarly: () => false, signinRevokedHas: () => false, signinCertOk: c => !!c, folderAnswers: () => true,
    fs: { existsSync: () => false, mkdirSync: () => {} }, writeReplacing: f => { st.writes.push(String(f)); }, seatFileText: s.seatFileText, console: { error() {} },
    signinRenewHeld: async (io, p, key, held) => { st.order.push("renewal"); if (st.renewGate) await st.renewGate; return { held, said: "renewed" }; },
    signinRevokedNext: S.signinRevokedNext, signinClaims: s.signinClaims, signinPinOk: s.signinPinOk,
  });
  return st;
}
function loadSwitch(st, swap) {
  let text = SWITCH_DECLS.map(d => tryDeclText(d)).filter(Boolean).concat([ipcSlice('ipcMain.on("etiuda:signin-click"'), ipcSlice('ipcMain.handle("etiuda:signin",')]).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the switch's wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let signinBusy = null, signinClick = null, signinSaid = \"\", signinWrote = \"kept\", signinRenewing = null, signinOutFlight = null, signinTimer = null;\n"
    + "function signinView() { const h = signinState().held; return { signedIn: h ? h.provider : \"\", said: signinSaid, busy: signinBusy ? signinBusy.provider : \"\" }; }\n"
    + text + "\nreturn { signinOutNow: typeof signinOutNow === \"undefined\" ? undefined : signinOutNow, signinRenewNow, signinOutSend,"
    + " wrote: () => signinWrote, flight: () => signinOutFlight, setRenewing: v => { signinRenewing = v; } };";
  const w = new Function(...SWITCH_STANDS, body)(...SWITCH_STANDS.map(n => st[n]));
  w.press = async id => { st.on["etiuda:signin-click"]({}, id || "microsoft"); return st.handle["etiuda:signin"]({}, id || "microsoft"); };
  return w;
}
/* What a scene's stand-ins say the desk did for account A ("s-1"): the posts for it, its seat.json taken out, its door's join let go,
   the store forgotten, its organisation's licence forgotten, the seat's mark cleared. */
const leftOfA = (st, w) => ({ out: st.order.filter(x => x === "signout/desk s-1").length, unlinked: st.unlinked.filter(x => / s-1$/.test(x)).length, cancels: st.cancels,
  sends: st.sends, forgets: st.forgets, managedGone: !("licenceManaged" in st.store), wrote: w.wrote(), owed: st.store.out === DESK_KEY });
/* (11) Signed in as A, seated, in a folder team (its seat.json written there) or asking at a relay team's door: "Use another account"
   and a sign-in as B does for A all Sign out does, by the same stand-ins, whatever B's answer: a certificate, none, full, a refusal,
   the service unreached; A's signout/desk goes before B's signin/desk, which a later one would undo. B is held where the service
   took B, and nobody where it did not. A sign-in as A again leaves nothing. */
const B_ANSWERS = () => ({ cert: { ok: true, code: CODE, cert: cert(), doors: [] }, none: { ok: true, code: CODE, cert: null, doors: [] },
  full: { ok: false, reason: "full" }, refused: { ok: false, reason: "desks" }, unreached: { ok: false, reason: "unreached" } });
CASES.switchLeaves = async (s, swap) => {
  let every = true;
  const seen = [];
  for (const join of [null, doorJoin({ inv: DOOR_ID })]) {
    const ctl = switchStand(s, { join, licenceManaged: true }), cw = loadSwitch(ctl, swap);
    cw.signinOutNow();
    await tick(5);
    const out = leftOfA(ctl, cw);
    const control = out.out === 1 && out.forgets === 1 && out.managedGone && out.wrote === "" && (join ? out.cancels === 1 && out.unlinked === 0 : out.unlinked === 1 && out.cancels === 0);
    for (const [kind, ans] of Object.entries(B_ANSWERS())) {
      const st = switchStand(s, { join, licenceManaged: true }), w = loadSwitch(st, swap);
      st.answer = ans;
      const v = await w.press();
      await tick(5);
      const left = leftOfA(st, w), b = st.store.held, taken = kind === "cert" || kind === "none" || kind === "full";
      const order = st.order.indexOf("signout/desk s-1 answered") >= 0 && st.order.indexOf("signout/desk s-1 answered") < st.order.indexOf("signin/desk s-2");
      const same = ["out", "unlinked", "cancels", "sends", "forgets", "managedGone"].every(k => left[k] === out[k]);
      const held = taken ? !!b && b.sub === "sealed:s-2" && (kind === "cert") === !!b.cert : b === null;
      const ok = control && same && order && held;
      if (!ok) seen.push((join ? "door " : "folder ") + kind + " " + JSON.stringify({ left, out, order: st.order, held: b ? b.sub : null, said: v && v.said }));
      every = every && ok;
    }
  }
  const again = switchStand(s), aw = loadSwitch(again, swap);
  again.sub = "s-1";
  again.answer = B_ANSWERS().cert;
  await aw.press();
  await tick(5);
  const kept = again.order.join() === "signin/desk s-1" && again.unlinked.length === 0 && again.forgets === 0 && again.cancels === 0;
  if (seen.length) console.log("    switch: " + seen.join(" | "));
  return every && kept;
};
/* (8) Sign out while the quiet renewal is out, then a sign-in at once (the test architect's reproduction): the sign out, queued behind
   the renewal, is answered before the new sign-in's signin/desk is sent, so the service never frees the place the sign-in just took;
   nothing stays owed and the desk is signed in. */
CASES.outThenSignin = async (s, swap) => {
  let release = null;
  const st = switchStand(s), w = loadSwitch(st, swap);
  st.renewGate = new Promise(r => { release = r; });
  st.sub = "s-1";
  st.answer = B_ANSWERS().cert;
  const renewing = w.signinRenewNow();
  await tick(5);
  w.signinOutNow();
  const press = w.press();
  await tick(5);
  release();
  await press;
  await renewing;
  await tick(10);
  const o = st.order, out = o.indexOf("signout/desk none answered"), seat = o.indexOf("signin/desk s-1");
  return out >= 0 && seat > out && o.filter(x => x === "signout/desk none").length === 1 && !!st.store.held && st.store.held.sub === "sealed:s-1"
    && st.store.out === undefined;
};
/* (8) A sign out queued behind a renewal is sent, when its turn comes, only while it is still owed: one a sign-in took the place from
   meanwhile is not sent. */
CASES.outStillOwed = async (s, swap) => {
  const run = async (taken) => {
    let release = null;
    const st = switchStand(s), w = loadSwitch(st, swap);
    st.store.held = null;
    st.store.out = DESK_KEY;
    w.setRenewing(new Promise(r => { release = r; }));
    const flight = w.signinOutSend(DESK_KEY);
    if (taken) delete st.store.out;
    release();
    await flight;
    await tick(5);
    return st.order.filter(x => /^signout\/desk/.test(x)).length;
  };
  return (await run(false)) === 2 && (await run(true)) === 0;
};
/* (1) An unmanaged desk signed in with an account on the service's access path (held.access, Microsoft's registration and the
   service's id filled in): a new sign-in asks the provider today's scopes, as for any account, and the new account is handed no access
   flag where the service seated it on its ID token alone; a managed computer still asks the service's scope (the control). */
const SERVICE_TABLE = ['extra: Object.freeze({ response_mode: "query", prompt: "select_account" }), service: "" }),',
  'extra: Object.freeze({ response_mode: "query", prompt: "select_account" }), service: "11111111-2222-4333-8444-555555555555" }),'];
CASES.accessNotHeld = async (s, swap) => {
  const sec = load(SERVICE_TABLE);
  const run = async managed => {
    const st = switchStand(s, { held: { access: true }, managed: managed ? { managed: true, shared: true } : null, accessFor: sec.signinAccessFor });
    st.answer = B_ANSWERS().cert;
    await loadSwitch(st, swap).press();
    await tick(5);
    return { asked: st.runAccess[0], access: !!st.store.held && st.store.held.access === true, sub: st.store.held && st.store.held.sub };
  };
  const plain = await run(false), managed = await run(true), scope = sec.signinAccessFor(MS, true, null);
  return /^api:\/\/.+\/Licence\.Use$/.test(scope) && plain.asked === undefined && plain.access === false && plain.sub === "sealed:s-2"
    && managed.asked === scope && managed.access === true;
};
/* (2) Whether this account has held a seat here is kept (`seated`): set by its first certificate, kept through an answer of none, through
   signin.json and a restart; a file an older build wrote with a certificate reads as seated; an account never given one is not. */
CASES.seatedKept = async (s, swap) => {
  /* On a managed, unshared computer, the account held signed in first, before Managed was set or after, with no seat ever: another
     account's sign-in replaces it and Sign out signs it out; one that held a seat (none now) is kept from both. */
  const M = { managed: true, shared: false, any: true };
  const press = async held => { const st = switchStand(s, { held, managed: M }); st.answer = B_ANSWERS().cert; await loadSwitch(st, swap).press(); await tick(5); return st.store.held ? st.store.held.sub : null; };
  const out = async held => { const st = switchStand(s, { held, managed: M }); loadSwitch(st, swap).signinOutNow(); await tick(5); return st.store.held ? st.store.held.sub : null; };
  const desk = [await press({ cert: null }), await press({ cert: null, seated: true }), await out({ cert: null }), await out({ cert: null, seated: true })].join();
  if (desk !== "sealed:s-2,sealed:s-1,,sealed:s-1") return false;
  const once = s.signinSettle(heldOf({ cert: null }), { ok: true, code: CODE, cert: cert(), doors: [] }, NOW);
  const lost = s.signinSettle(once, { ok: true, code: CODE, cert: null }, NOW);
  const back = s.signinFileRead(s.signinFileText({ held: lost })).held, never = s.signinFileRead(s.signinFileText({ held: heldOf({ cert: null }) })).held;
  /* Since B-2b an answer of none keeps the certificate, so that the file carries `seated` alone is shown by a seat whose certificate it no longer holds. */
  const voided = s.signinFileRead(s.signinFileText({ held: Object.assign({}, lost, { cert: null }) })).held;
  const older = s.signinFileRead(s.signinFileText({ held: Object.assign(heldOf(), { seated: undefined }) })).held;
  return once.seated === true && lost.seated === true && lost.cert === once.cert && lost.ended === NOW && !!back && back.seated === true && !!never && never.seated !== true
    && !!voided && voided.seated === true && voided.cert === null
    && !!older && older.seated === true && s.signinSettle(heldOf({ cert: null }), { ok: true, code: CODE, cert: null }, NOW).seated !== true;
};
/* (09/1) The account's organisation as its provider named it is kept with the sign-in (`org`), so a policy set later is held to it:
   taken from the new account's ID token, read back from signin.json; a tenant id not of its shape is read as none. */
CASES.orgKept = async (s, swap) => {
  const st = switchStand(s), w = loadSwitch(st, swap), other = "ffffffff-0000-4111-8222-333333333333";
  st.signinRun = async () => ({ ok: true, idToken: jwt({ sub: "s-2", tid: other.toUpperCase() }), seed: "b".repeat(64), sub: "s-2", refreshToken: "rt-2" });
  st.answer = B_ANSWERS().cert;
  await loadSwitch(st, swap).press();
  await tick(5);
  const h = st.store.held, back = h ? s.signinFileRead(s.signinFileText({ held: h })).held : null;
  const odd = s.signinFileRead(s.signinFileText({ held: Object.assign(heldOf(), { org: { tid: "not-a-tenant", hd: "Example.COM" } }) })).held;
  return !!h && !!h.org && h.org.tid === other && h.org.hd === "" && !!back && JSON.stringify(back.org) === JSON.stringify(h.org) && !!odd && odd.org.tid === "" && odd.org.hd === "example.com" && !!w;
};
/* (11, Claude alpha's decision of the evening) The held account is left only once the service has answered a call of the switch. The
   service not taking the held account's signout/desk: no switch, the desk still the account it had, with its seat.json, its door's join
   and its store, no signout owed, no signin/desk sent for the new account, and the page saying the new sign-in did not finish and the
   computer stays signed in. The signout taken and the service then unreached for the new account: signed out, said as its own moment.
   Where no signout is sent (a harness start), the new account's signin/desk is the first call: unreached, the desk stays as it was. */
const SWITCH_OUT_LINE_EN = "This computer is now signed out of the account it had. Signing in, with either account, works once the sign-in service answers, and nothing on this desk is lost meanwhile.";
const SWITCH_OUT_LINE_PL = "Ten komputer jest teraz wylogowany z konta, którego używał. Logowanie dowolnym z tych kont będzie możliwe, gdy usługa logowania odpowie, a do tego czasu nic na tym stanowisku nie ginie.";
const SWITCH_UNMADE_REASON_EN = "The sign-in service did not confirm the change of account.";
const SWITCH_UNMADE_REASON_PL = "Usługa logowania nie potwierdziła zmiany konta.";
CASES.switchUnanswered = async (s, swap) => {
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const wordsOk = (pg) => {
    if (!pg) return false;
    const unmade = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", said: "signin-switch-unmade" }));
    const ord = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", said: "unreached" }));
    const lateDoor = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], said: "signin-switch-out" }));
    let plUnmade = null, plLate = null;
    storage.lsSet("eUiLang", "pl");
    try {
      plUnmade = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", said: "signin-switch-unmade" }));
      plLate = pg.signinDoor(pg.signinRead({ offered: ["microsoft"], said: "signin-switch-out" }));
    } finally { storage.lsSet("eUiLang", "en"); }
    return !!unmade && unmade.moment === "pressed" && sayIs(unmade.say, SAY_PRESSED(SWITCH_UNMADE_REASON_EN))
      && unmade.acts[0] && unmade.acts[0].act === "choose" && unmade.acts[0].label === "Try again"
      && !!ord && ord.moment === "pressed" && sayIs(ord.say, SAY_PRESSED("The sign-in service could not be reached."))
      && !!lateDoor && lateDoor.moment === "refused" && lateDoor.heading === "The sign-in service could not be reached." && lateDoor.line === SWITCH_OUT_LINE_EN
      && !!plUnmade && plUnmade.say[0] === "Nowe logowanie nie dobiegło końca."
      && plUnmade.say[1] === "Ten komputer pozostaje zalogowany kontem, którego używał. " + SWITCH_UNMADE_REASON_PL
      && !!plLate && plLate.heading === "Nie udało się połączyć z usługą logowania." && plLate.line === SWITCH_OUT_LINE_PL;
  };
  if (swap && !Array.isArray(swap)) return wordsOk(swap);
  const run = async (tune) => { const st = switchStand(s, { join: tune.join }); Object.assign(st, tune.st || {}); st.answer = tune.answer || B_ANSWERS().cert;
    const w = loadSwitch(st, swap), v = await w.press(); await tick(10); return { st, w, v }; };
  let whole = true;
  for (const join of [null, doorJoin({ inv: DOOR_ID })]) {
    const r = await run({ join, st: { outOk: false } });
    whole = whole && !!r.st.store.held && r.st.store.held.sub === "sealed:s-1" && !!r.st.store.held.cert && r.st.unlinked.length === 0 && r.st.cancels === 0
      && r.st.forgets === 0 && r.st.store.out === undefined && r.st.order.indexOf("signin/desk s-2") < 0 && r.st.order.indexOf("signout/desk s-1") >= 0 && r.v.said === "signin-switch-unmade"
      && r.w.wrote() === "kept";
  }
  const late = await run({ answer: B_ANSWERS().unreached });
  const lateOk = late.st.store.held === null && late.v.said === "signin-switch-out" && late.st.store.out === undefined;
  const first = await run({ st: { harnessLaunch: () => true }, answer: B_ANSWERS().unreached }), firstTaken = await run({ st: { harnessLaunch: () => true }, answer: B_ANSWERS().none });
  const firstOk = !!first.st.store.held && first.st.store.held.sub === "sealed:s-1" && first.st.forgets === 0 && first.st.unlinked.length === 0 && first.st.order.indexOf("signout/desk s-1") < 0
    && !!firstTaken.st.store.held && firstTaken.st.store.held.sub === "sealed:s-2" && firstTaken.st.forgets === 1 && firstTaken.st.unlinked.length === 1;
  return whole && wordsOk(P) && lateOk && firstOk;
};
/* Nothing written to signin.json while a switch's signout is still out says a signout is owed for an account the desk still holds; a
   start from such a file signs nobody out, while Sign out still keeps its owed mark. */
CASES.switchOutWindow = async (s, swap) => {
  let release = null;
  const st = switchStand(s), w = loadSwitch(st, swap);
  st.outGate = new Promise(r => { release = r; });
  const pressing = w.press();
  await tick(5);
  const inFlight = st.order.indexOf("signout/desk s-1") >= 0 && st.order.indexOf("signout/desk s-1 answered") < 0 && !!st.store.held;
  const text = s.signinFileText(st.store), back = s.signinFileRead(text);
  const noOwed = JSON.parse(text).out === undefined && st.store.out === undefined && back.out === undefined && !!back.held;
  const rst = outStand(s, () => answer({ ok: true }));
  rst.store = back;
  rst.signinRenewHeld = async (io, p, key, held) => ({ held, said: "renewed" });
  await loadWire(rst).signinRenewNow();
  const rstOut = outStand(s, () => answer({ ok: true }));
  rstOut.store = Object.assign({}, back, { held: null });
  await loadWire(rstOut).signinRenewNow();
  release();
  const v = await pressing;
  await tick(5);
  const done = !!st.store.held && st.store.held.sub === "sealed:s-2" && st.store.out === undefined && v.said === "signin-done";
  const ost = outStand(s, () => { throw new Error("offline"); });
  loadWire(ost).signinOutNow();
  await tick(5);
  return inFlight && noOwed && rst.sent.length === 0 && rstOut.sent.length === 0 && done
    && ost.sent.length === 1 && ost.store.held === null && ost.store.out === DESK_KEY;
};
/* Sign out and the switch share one leaving (signinLeave): Sign out is its guards, that call, and its words; the press calls it for
   another account only, its signout already decided by signinSwitchOut on the same condition (signinOutWanted), at most once on any
   path and before the new account is taken. A step added to Sign out outside signinLeave turns this red. */
CASES.switchShared = () => {
  const outNow = tryDeclText("function signinOutNow("), leave = tryDeclText("function signinLeave("), press = ipcSlice('ipcMain.handle("etiuda:signin",');
  const switchOut = tryDeclText("async function signinSwitchOut(");
  const shape = /^function signinOutNow\(\) \{\n  if \(signinBusy\) return signinView\(\);\n  const s = signinState\(\), me = branchIdentity\(false\);\n  if \([^\n]*\) return signinView\(\); \/\* plant:out-managed \*\/\n  signinLeave\(s, me\);\n  signinSaid = "";\n  signinSave\(\);\n  tellSignin\(\);\n  return signinView\(\);\n\}$/.test(outNow);
  const calls = press.match(/signinLeave\([^)]*\)/g) || [], take = press.indexOf("signinTake(");
  const once = calls.length === 2 && calls.every(c => c === "signinLeave(st, me, true)") && press.lastIndexOf("signinLeave(") < take
    && /if \(out === true\) \{ signinLeave/.test(press) && /if \(other && out === null && /.test(press);
  return shape && once && leave.indexOf("signinOutWanted(s, me)") > 0 && switchOut.indexOf("signinOutWanted(s, me)") > 0 && leave.indexOf("signinOutSend(") > 0
    && leave.indexOf("storeForget()") > 0 && leave.indexOf("s.held = null;") > 0;
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
/* The desk and the relay's door judge every sample alike, the genuine one taken by both, with ONE NAMED EXCEPTION: a genuine
   desk-only certificate, which the desk takes and the door refuses as "shape" (certWhy holds exactly ten fields). A desk-only
   licence hands no doors, so none reaches a door. */
CASES.certAsDoor = s => {
  const R = createRequire(import.meta.url)(path.join(ROOT, "relay", "core.cjs"));
  const samples = Object.assign({ genuine: cert() }, certForgeries());
  const why = c => R.certWhy(c, DESK_KEY, [String(c.licence)], NOW, [TEST_ROOT]), door = c => why(c) === null;
  const deskOnly = cert({ deskOnly: true });
  return door(samples.genuine) && Object.keys(samples).every(k => door(samples[k]) === (s.signinCertOk(samples[k], DESK_KEY) === true))
    && why(deskOnly) === "shape" && s.signinCertOk(deskOnly, DESK_KEY) === true;
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
/* THE LAB'S ROOT (the test architect's overrule of 2026-11-13): unpackaged, a lab file's root is honoured beside the shipped one,
   so a development desk takes a certificate from the local licence lab; installed, packaged or both the file is never read and a
   certificate under its root is no seat; no lab, or a lab naming no root, honours the shipped root alone. */
const LAB_ROOT_KEY = crypto.generateKeyPairSync("ed25519");
CASES.labRoot = async (s0, swap) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-signin-labroot-"));
  try {
    const rooted = path.join(dir, "rooted.json"), rootless = path.join(dir, "rootless.json");
    fs.writeFileSync(rooted, labText(4567, { root: rawPub(LAB_ROOT_KEY.publicKey) }));
    fs.writeFileSync(rootless, labText(4567, { root: undefined }));
    const labCert = cert({ via: delegation({}, LAB_ROOT_KEY) }), strayCert = cert({ via: delegation({}, OTHER_ROOT) });
    const takes = (facts, file) => {
      const s = loadIn(swap);
      labStart(s, Object.assign({ file }, facts), swap);
      return [s.signinCertOk(labCert, DESK_KEY) === true, s.signinCertOk(cert(), DESK_KEY) === true, s.signinCertOk(strayCert, DESK_KEY) === true].join();
    };
    const dev = { installed: false, packaged: false };
    return takes(dev, rooted) === "true,true,false" && takes(dev, rootless) === "false,true,false" && takes(dev, undefined) === "false,true,false"
      && [{ installed: true, packaged: false }, { installed: false, packaged: true }, { installed: true, packaged: true }].every(x => takes(x, rooted) === "false,true,false");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
/* THE TEST SERVICE BUILD'S FIELDS TRAVEL INSIDE THE ASAR (the test architect's hold and Claude alpha's ruling, 2026-11-13): the
   wiring takes them from the package.json packed beside this shell file and never reads a file beside the asar. A test-service.json,
   root included, planted beside the asar changes nothing in an ordinary package, and in a test service package the asar's fields win. */
const TS_ROOT_KEY = crypto.generateKeyPairSync("ed25519");
function tsStart(s, facts, swap) {
  const i = WIRING.indexOf("/* THE TEST SERVICE BUILD (tools/test-service.cjs)"), to = WIRING.indexOf("/* plant:door-packed */", i);
  let text = i < 0 || to < 0 ? "" : WIRING.slice(i, WIRING.indexOf("\n", to));
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const reads = [];
  const r = new Function("INSTALLED", "app", "process", "fs", "path", "console", "__dirname", "signinLabUse", "signinLabRead",
    text + "\nreturn { on: testServiceOn, packed: SIGNIN_DESK_PACKED };")(true, { isPackaged: true }, { resourcesPath: facts.resources, env: {} },
    { readFileSync: (p, enc) => { reads.push(String(p)); return fs.readFileSync(p, enc); } }, path, { error: () => {} }, facts.shell,
    s.signinLabUse, s.signinLabRead);
  return Object.assign(r, { reads });
}
CASES.testServiceAsar = async (s0, swap) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-signin-ts-"));
  try {
    const loose = { service: "https://etiuda.dev/licence-planted/v1/", clientIds: { microsoft: MS_CLIENT, google: G_CLIENT }, root: rawPub(LAB_ROOT_KEY.publicKey) };
    const layout = (name, fields) => {
      const res = path.join(dir, name, "resources"), shell = path.join(res, "app.asar", "shell");
      fs.mkdirSync(shell, { recursive: true });
      fs.writeFileSync(path.join(res, "app.asar", "package.json"), JSON.stringify(Object.assign({ name: "etiuda", version: "0.0.0" },
        fields ? { etiudaTestService: fields } : {})));
      fs.writeFileSync(path.join(res, "test-service.json"), JSON.stringify(loose));
      return { resources: res, shell: shell };
    };
    const planted = cert({ via: delegation({}, LAB_ROOT_KEY) }), asarCert = cert({ via: delegation({}, TS_ROOT_KEY) });
    const staging = doorOf({ url: "https://etiuda.dev/relay-staging/v1" });
    const noLoose = r => !r.reads.some(f => /test-service\.json$/.test(f));
    const s1 = loadIn(swap), a = tsStart(s1, layout("plain"), swap);
    const ordinary = a.on === false && a.packed === true && s1.live().on !== true && s1.live().signin === "https://etiuda.dev/licence/v1/signin/desk"
      && s1.signinCertOk(planted, DESK_KEY) !== true && s1.signinCertOk(cert(), DESK_KEY) === true
      && s1.signinDoorAddressOk(staging, a.packed) === false && noLoose(a);
    const fields = { service: STAGING, clientIds: { microsoft: MS_CLIENT, google: G_CLIENT }, root: rawPub(TS_ROOT_KEY.publicKey) };
    const s2 = loadIn(swap), b = tsStart(s2, layout("tested", fields), swap);
    const asarWins = b.on === true && b.packed === false && s2.live().signin === STAGING + "signin/desk"
      && s2.signinCertOk(asarCert, DESK_KEY) === true && s2.signinCertOk(planted, DESK_KEY) !== true
      && s2.signinDoorAddressOk(staging, b.packed) === true && noLoose(b);
    return ordinary && asarWins;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
/* A DESK-ONLY LICENCE (Max's test of 2026-11-13; Claude alpha, 03:31): its certificate says so in a signed field, and a desk holding
   one with no team is told it works without a team, in the copywriter's pair, instead of being told to wait for a lead. An older
   certificate, without the field, reads as not desk-only. */
const DESK_ONLY_EN = ["Working without a team", "This computer has its seat, and Etiuda works with its own catalog. Nothing else is needed."];
const DESK_ONLY_PL = ["Praca bez zespołu", "Ten komputer ma swoje miejsce w licencji, a Etiuda działa na własnym katalogu. Nic więcej nie trzeba."];
/* Board 1017 moved this line, which once said a lead admits it by the code below. */
const NO_TEAM_LINE = "No team has admitted this account yet. A lead can invite it by its email address or send a link; the invitation then appears here with one Join.";
/* The shell's signinView over `held`, the rest stood in. */
function viewOver(held, relaySeat) {
  const text = decl(MAIN, "function signinView(");
  return new Function("signinOffered", "signinState", "signinPreviewing", "SIGNIN_PROVIDERS", "signinLapsed", "signinDoorsShown", "signinPageOk",
    "sealsForReal", "safeStorage", "process", "signinRelaySeat", "signinViewOf", "signinClockNow", "let signinBusy = null, signinSaid = \"\";\n" + text + "\nreturn signinView();")(
    () => [{ id: "microsoft" }], () => ({ held }), () => false, {}, (h, now) => !!h && !!h.cert && now >= h.cert.until, () => [], () => false,
    () => true, {}, { platform: "win32" }, relaySeat || (() => ""), S.signinViewOf, CLOCK_STAND);
}
CASES.deskOnlyCert = s => {
  const ok = c => s.signinCertOk(c, DESK_KEY) === true;
  const only = cert({ deskOnly: true }), plain = cert();
  const stripped = Object.assign({}, only); delete stripped.deskOnly;
  const back = c => s.signinFileRead(s.signinFileText({ held: heldOf({ cert: c, doors: [] }) })).held.cert;
  const fresh = { issued: Date.now() - DAY_MS, until: Date.now() + 20 * DAY_MS };
  const onlyNow = cert(Object.assign({ deskOnly: true }, fresh)), plainNow = cert(fresh);
  return ok(only) && ok(plain) && !ok(stripped) && !ok(Object.assign(cert(), { deskOnly: true })) && !ok(cert({ deskOnly: false })) && !ok(cert({ deskOnly: "yes" }))
    && !!back(only) && back(only).deskOnly === true && !!back(plain) && back(plain).deskOnly === undefined && back(stripped) === null
    && viewOver(heldOf({ cert: onlyNow })).deskOnly === true && viewOver(heldOf({ cert: plainNow })).deskOnly === false
    && viewOver(heldOf({ cert: null })).deskOnly === false && viewOver(null).deskOnly === false;
};
CASES.deskOnlyPage = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const base = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", reached: true, doors: [] };
  const v = o => pg.signinRead(Object.assign({}, base, o));
  const only = pg.signinDoor(v({ deskOnly: true })), plain = pg.signinDoor(v({})), forged = pg.signinRead(Object.assign({}, base, { signedIn: "", deskOnly: true }));
  let pl = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = pg.signinDoor(v({ deskOnly: true })); } finally { storage.lsSet("eUiLang", "en"); }
  const acct = page ? "" : words(await acctOf(Object.assign({}, base, { deskOnly: true }))), acctPlain = page ? "" : words(await acctOf(base));
  return only.moment === "noteam" && only.heading === DESK_ONLY_EN[0] && only.line === DESK_ONLY_EN[1] && !("code" in only) /* board 1017 moved this: the code once still showed */
    && plain.moment === "noteam" && plain.heading === "Signed in. No team yet" && plain.line === NO_TEAM_LINE && forged.deskOnly === false
    && !!pl && pl.heading === DESK_ONLY_PL[0] && pl.line === DESK_ONLY_PL[1]
    && (page ? true : acct.indexOf(DESK_ONLY_EN[0]) >= 0 && acct.indexOf(DESK_ONLY_EN[1]) >= 0 && acct.indexOf(NO_TEAM_LINE) < 0 && acctPlain.indexOf(NO_TEAM_LINE) >= 0);
};
/* The root the shipped desk checks against is the vendor's, the relay's ROOT_PUB, and the check names it. */
CASES.certRoot = () => {
  const R = createRequire(import.meta.url)(path.join(ROOT, "relay", "core.cjs"));
  const m = /\nconst NOTE_ROOT = "([0-9a-f]{64})";/.exec(MAIN);
  return !!m && m[1] === R.ROOT_PUB && SECTION.split("signinVerified(NOTE_ROOT, viaBytes, ").length === 2;
};

/* The doors are the service's only under its signature (decision 35): signed by the key that signed the certificate beside them,
   over those doors in that order under that certificate. An older service's answer, with none, holds the seat and offers no door,
   saying nothing; a stranger's door added, a door changed, another key's signature or another certificate's is no door. */
CASES.doorsSigned = s => {
  const c = cert(), other = cert({ person: "e".repeat(64) }), two = DOORS_TWO();
  const read = (doors, sig) => s.signinAnswer(answer({ ok: true, code: CODE, certificate: c, doors, doorsSig: sig }), DESK_KEY);
  const good = read(two, doorsSigOf(c, two)), older = read(two, undefined);
  const stranger = doorOf({ lead: OTHER_DESK_KEY, keyId: "studio-" + crypto.createHash("sha256").update(Buffer.from(OTHER_DESK_KEY, "hex")).digest("hex").slice(0, 16) });
  const forged = [read(two.concat([stranger]), doorsSigOf(c, two)), read([two[0], Object.assign({}, two[1], { box: "0".repeat(64) })], doorsSigOf(c, two)),
    read(two, doorsSigOf(c, two, OTHER_SERVICE)), read(two, doorsSigOf(other, two)), read(two.slice().reverse(), doorsSigOf(c, two)), read(two, "c".repeat(128))];
  const settled = s.signinSettle(heldOf({ doors: [] }), older, NOW);
  return good.ok === true && JSON.stringify(good.doors) === JSON.stringify(two) && good.doorsSig === doorsSigOf(c, two)
    && older.ok === true && !!older.cert && JSON.stringify(older.doors) === "[]" && older.doorsSig === ""
    && JSON.stringify(settled.cert) === JSON.stringify(c) && settled.said === "" && settled.reached === true && JSON.stringify(settled.doors) === "[]"
    && forged.every(r => r.ok === true && !!r.cert && JSON.stringify(r.doors) === "[]");
};
/* signin.json keeps doors only with their signature under the certificate it holds: doors edited, the signature taken out (a file an
   older build wrote among them) or no certificate is no door, and the certificate stays. */
CASES.doorsFile = s => {
  const c = cert(), two = DOORS_TWO();
  const back = h => s.signinFileRead(s.signinFileText({ held: h })).held;
  const kept = back(heldOf({ cert: c, doors: two })), edited = back(heldOf({ cert: c, doors: [doorOf({ box: "0".repeat(64) })], doorsSig: doorsSigOf(c, [doorOf()]) }));
  const unsigned = back(heldOf({ cert: c, doors: two, doorsSig: undefined })), certless = back(heldOf({ cert: null, doors: two, doorsSig: doorsSigOf(c, two) }));
  return JSON.stringify(kept.doors) === JSON.stringify(two) && kept.doorsSig === doorsSigOf(c, two)
    && JSON.stringify(edited.doors) === "[]" && JSON.stringify(edited.cert) === JSON.stringify(c)
    && JSON.stringify(unsigned.doors) === "[]" && JSON.stringify(unsigned.cert) === JSON.stringify(c) && JSON.stringify(certless.doors) === "[]";
};
/* The knock a waiting Join owes (board 1017) outlasts a restart: signin.json keeps the team it is owed at, and nothing that is not a team id. */
CASES.knockFile = s => {
  const back = h => s.signinFileRead(s.signinFileText({ held: h })).held, team = "t-0123456789abcdef";
  return back(heldOf({ joinKnock: team })).joinKnock === team && !("joinKnock" in back(heldOf({ joinKnock: "t-xyz" })))
    && !("joinKnock" in back(heldOf({ joinKnock: 7 }))) && !("joinKnock" in back(heldOf({})));
};
/* What the desk holds in memory is offered only under the signature too, and a press on such a door joins nothing. */
CASES.doorsShownSigned = (s, swap) => {
  const signed = doorJoinStand(), bare = doorJoinStand({ held: heldOf({ doors: DOORS_TWO(), doorsSig: "" }) });
  const other = doorJoinStand({ held: heldOf({ doors: DOORS_TWO(), doorsSig: doorsSigOf(cert(), [doorOf()]) }) });
  const w = loadDoorJoin(s, bare, swap), pressed = w.signinDoorJoin(0);
  return loadDoorJoin(s, signed, swap).signinDoorsShown(signed.held, NOW).length === 2 && w.signinDoorsShown(bare.held, NOW).length === 0
    && loadDoorJoin(s, other, swap).signinDoorsShown(other.held, NOW).length === 0
    && !!pressed && pressed.refused === "door" && w.join() === null && Object.keys(bare.pins).length === 0;
};

/* ---- the revoked keys' list (ds25; board 980, Claude alpha's rulings of 09:07 and 09:09): the desk takes it, signed, at each
   answer that carries it, keeps the last it took, and reads a seat under a listed key as the calm lapse until a sign-in mends it -- */
/* A list as the vendor signs one, written here from the interface (relay/core.cjs revocationBytes): the line "etiuda-revocations",
   the serial and the keys joined by commas, sorted, by the root. */
function revokedList(serial, keys, signer, over) {
  const r = Object.assign({ kind: "etiuda-revocations", format: 1, serial, keys: keys.slice().sort(), sig: { alg: "ed25519", keyId: "root-1" } }, over);
  r.sig.value = crypto.sign(null, Buffer.from("etiuda-revocations\n" + r.serial + "\n" + r.keys.join(","), "utf8"), (signer || ROOT_KEY).privateKey).toString("hex");
  return r;
}
const STRANGER_PUB = "ef".repeat(32);
const OTHER_SERVICE_PUB = OTHER_SERVICE.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
/* The shell's view over `held` with the section's own signinLapsed, the rest stood in. */
const viewWith = (s, held) => new Function("signinOffered", "signinState", "signinPreviewing", "SIGNIN_PROVIDERS", "signinLapsed", "signinDoorsShown",
  "signinPageOk", "sealsForReal", "safeStorage", "process", "signinRelaySeat", "signinViewOf", "signinClockNow", "Date", "let signinBusy = null, signinSaid = \"\", signinOutFlight = null;\n"
  + decl(MAIN, "function signinView(") + "\nreturn signinView();")(() => [{ id: "microsoft" }], () => ({ held }), () => false, {}, s.signinLapsed,
  () => [], () => false, () => true, {}, { platform: "win32" }, () => "", s.signinViewOf, CLOCK_STAND, { now: () => NOW });
/* The view reads the wall clock as the test's own NOW: a stand-in for Date, or a certificate dated NOW plus days stops being early once the real date passes it. */
/* Taken at a first sign-in and at the renewal, from a refusal as well, and kept in signin.json. */
CASES.revokedTaken = async s => {
  const list = revokedList(1, [STRANGER_PUB]), later = revokedList(2, [STRANGER_PUB, "aa".repeat(32)]);
  const io = { serviceAsk: async () => answer({ ok: true, certificate: cert(), code: CODE, doors: [], revoked: list }), sign: signWith(signKey), packed: true };
  const ans = await s.signinSeat(io, "microsoft", DESK_KEY, jwt(msClaims(undefined)), SEED, () => NOW);
  const first = s.signinSettle(heldOf({ cert: null, code: "" }), ans, NOW);
  const rio = renewIo(answer({ id_token: jwt(msClaims(undefined)), refresh_token: "rt-2" }),
    answer({ ok: true, certificate: cert({ issued: NOW + 5, until: NOW + 5 + 30 * DAY_MS }), code: CODE, doors: [], revoked: later }));
  const renewed = await s.signinRenewHeld(rio, MS, DESK_KEY, heldOf({ revoked: list }), () => NOW);
  const refused = s.signinSettle(heldOf({ revoked: list }), s.signinAnswer(answer({ ok: false, reason: "signin", revoked: later }, 403), DESK_KEY), NOW);
  const back = s.signinFileRead(s.signinFileText({ held: first })).held;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return same(ans.revoked, list) && same(first.revoked, list) && renewed.said === "renewed" && same(renewed.held.revoked, later)
    && same(refused.revoked, later) && refused.said === "signin" && !!back && same(back.revoked, list) && s.signinLapsed(first, NOW) === false;
};
/* A list not the vendor's, or not later than the kept one, is not taken: another root, a made-up signature, keys out of order, an
   older or the same serial, a later serial that drops a kept key, a field beyond the list's; from an answer or the file alike. */
CASES.revokedForged = s => {
  const kept = revokedList(2, [STRANGER_PUB]);
  const unsorted = revokedList(3, [STRANGER_PUB, "aa".repeat(32)]);
  unsorted.keys = unsorted.keys.slice().reverse();
  const bad = [revokedList(3, [STRANGER_PUB], OTHER_ROOT), Object.assign(revokedList(3, [STRANGER_PUB]), { sig: { alg: "ed25519", keyId: "root-1", value: "c".repeat(128) } }),
    unsorted, revokedList(1, [STRANGER_PUB, "aa".repeat(32)]), revokedList(2, [STRANGER_PUB, "aa".repeat(32)]), revokedList(3, ["aa".repeat(32)]),
    revokedList(3, [STRANGER_PUB], null, { note: "x" })];
  const held = heldOf({ revoked: kept });
  const viaAnswer = x => s.signinSettle(held, s.signinAnswer(strayAnswer({ ok: true, certificate: cert(), code: CODE, doors: [], revoked: x }), DESK_KEY), NOW).revoked;
  const fromNone = x => s.signinRevokedNext(null, x);
  const file = x => s.signinFileRead(s.signinFileText({ held: heldOf({ revoked: x }) })).held.revoked;
  const forgedOnly = bad.slice(0, 3).concat(bad.slice(6));
  return bad.every(x => s.signinRevokedNext(kept, x) === kept && JSON.stringify(viaAnswer(x)) === JSON.stringify(kept))
    && forgedOnly.every(x => fromNone(x) === null && file(x) === null) && JSON.stringify(file(kept)) === JSON.stringify(kept);
};
/* Offline, and with an answer that carries none, the last list taken judges: the seat under its key stays lapsed. */
CASES.revokedOffline = async s => {
  const kept = revokedList(1, [SERVICE_PUB]), held = heldOf({ revoked: kept });
  const offline = await s.signinRenewHeld(renewIo(new Error("offline"), answer({})), MS, DESK_KEY, held, () => NOW);
  const away = await s.signinRenewHeld(renewIo(answer({ id_token: jwt(msClaims(undefined)) }), new Error("offline")), MS, DESK_KEY, held, () => NOW);
  const unreached = s.signinSettle(held, s.signinAnswer(answer({ ok: false, reason: "unavailable" }, 503), DESK_KEY), NOW);
  const older = s.signinSettle(held, s.signinAnswer(answer({ ok: true, certificate: cert(), code: CODE, doors: [] }), DESK_KEY), NOW);
  return [offline.held, away.held, unreached, older].every(h => JSON.stringify(h.revoked) === JSON.stringify(kept) && s.signinLapsed(h, NOW) === true);
};
/* A seat under a listed key reads as the calm lapse: the view says "lapsed", the page its lapse as it always has, and no standing
   use of the certificate happens: no door offered, no knock, no request written, no seat.json. */
CASES.revokedLapse = (s, swap) => {
  const list = revokedList(1, [SERVICE_PUB]), other = revokedList(1, [STRANGER_PUB]);
  const h = heldOf({ revoked: list, doors: DOORS_TWO() }), free = heldOf({ revoked: other, doors: DOORS_TWO() });
  const lapsed = s.signinLapsed(h, NOW) === true && s.signinLapsed(free, NOW) === false && s.signinLapsed(heldOf({ doors: DOORS_TWO() }), NOW) === false;
  const view = viewWith(s, h).seat === "lapsed" && viewWith(s, free).seat === "held";
  const page = !!P && P.signinDoor(P.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "lapsed", reached: true })).moment === "lapsed";
  const swapIn = names => (swap && names.some(n => decl(MAIN, "function " + n + "(").indexOf(swap[0]) >= 0) ? swap : undefined);
  const offered = held => { const st = doorJoinStand({ held }); return loadDoorJoin(s, st, swapIn(["signinDoorsShown", "signinDoorJoin"])).signinDoorsShown(st.held, NOW).length; };
  const flushed = held => { const st = { held, lead: { team: TEAM }, join: null, root: "/share/a", files: new Set(), writes: [] }; return loadFlush(s, st, swapIn(["signinFlush"]))(); };
  const knocked = held => { const st = doorStand(doorJoin(), held); return loadDoor(s, st, swapIn(["signinDoorInvite", "signinDoorKept"])).signinDoorInvite(TEAM, RT); };
  const wrote = held => { const st = doorStand(doorJoin(), held); return loadDoor(s, st, swapIn(["signinDoorInvite", "signinDoorKept"])).signinDoorKept(TEAM, path.join("/relay", RT), DOOR_ID); };
  const noDoor = x => x === null || (!!x && !(x.door && typeof x.door === "object"));
  return lapsed && view && page && offered(h) === 0 && offered(free) === 2 && flushed(h) === false && flushed(free) === true
    && noDoor(knocked(h)) && !!knocked(free) && !!knocked(free).door && wrote(h) === false && wrote(free) === true;
};
/* Review 15b, finding 2: a certificate issued past now and the five minutes is live nowhere yet, read as the calm lapse; one inside
   the five minutes stands as any other. */
CASES.certEarly = (s, swap) => {
  const early = cert({ issued: NOW + 10 * DAY_MS, until: NOW + 25 * DAY_MS }), near = cert({ issued: NOW + 4 * 60 * 1000, until: NOW + 20 * DAY_MS });
  const he = heldOf({ cert: early, doors: DOORS_TWO() }), hn = heldOf({ cert: near, doors: DOORS_TWO() });
  const swapIn = names => (swap && names.some(n => decl(MAIN, "function " + n + "(").indexOf(swap[0]) >= 0) ? swap : undefined);
  const lapsed = s.signinLapsed(he, NOW) === true && s.signinLapsed(hn, NOW) === false && viewWith(s, he).seat === "lapsed" && viewWith(s, hn).seat === "held";
  const asked = c => s.signinDoorRequest({ format: 1, kind: "etiuda-join" }, DESK_ID, DESK_KEY, c, DOOR_ID, NOW);
  const offered = held => { const st = doorJoinStand({ held }); return loadDoorJoin(s, st, swapIn(["signinDoorsShown", "signinDoorJoin"])).signinDoorsShown(st.held, NOW).length; };
  const flushed = held => { const st = { held, lead: { team: TEAM }, join: null, root: "/share/a", files: new Set(), writes: [] }; return loadFlush(s, st, swapIn(["signinFlush"]))(); };
  const knocked = held => { const st = doorStand(doorJoin(), held); return loadDoor(s, st, swapIn(["signinDoorInvite", "signinDoorKept"])).signinDoorInvite(TEAM, RT); };
  return s.signinCertOk(early, DESK_KEY) === true && lapsed && asked(early) === null && !!asked(near) && offered(he) === 0 && offered(hn) === 2
    && flushed(he) === false && flushed(hn) === true && (knocked(he) === null || !(knocked(he).door && typeof knocked(he).door === "object")) && !!knocked(hn) && !!knocked(hn).door;
};
/* Review 15b, finding 1: the list that judges a held seat cannot be taken back by editing signin.json. The file as the desk writes it
   carries this desk's mark; the list deleted, or replaced by an older genuine one, leaves no seat, and nothing to flush or knock with,
   until the next answer. The wiring reads with this desk's key and saves with its mark. */
CASES.fileMark = (s, swap) => {
  const kept = revokedList(2, [SERVICE_PUB, STRANGER_PUB]), older = revokedList(1, [STRANGER_PUB]);
  const text = s.signinFileMarkText(s.signinFileText({ held: heldOf({ revoked: kept }) }), signWith(signKey));
  const read = (t, key) => s.signinFileHeld(s.signinFileRead(t), t, key === undefined ? DESK_KEY : key);
  const edit = fn => { const d = JSON.parse(text); fn(d); return JSON.stringify(d, null, 1) + "\n"; };
  const whole = read(text), dropped = read(edit(d => { delete d.revoked; })), rolled = read(edit(d => { d.revoked = older; }));
  const unmarked = read(edit(d => { delete d.mark; })), otherKey = read(text, OTHER_DESK_KEY);
  const plain = s.signinFileHeld(s.signinFileRead(s.signinFileText({ held: heldOf() })), s.signinFileText({ held: heldOf() }), DESK_KEY);
  const none = c => !!c && c.held && c.held.cert === null && c.held.code === "" && c.held.provider === "microsoft" && c.held.refresh === "sealed:rt-1";
  const wire = swap && WIRING.split(swap[0]).length === 2 ? WIRING.replace(swap[0], swap[1]) : WIRING;
  const wired = /\n  signinStore = signinFileHeld\(signinStore, text, me \? me\.key : ""\);/.test(wire)
    && /signinFileMarkText\(signinFileText\(signinState\(\)\), signinSign\)/.test(wire);
  return !!whole.held.cert && whole.held.code === CODE && s.signinLapsed(whole.held, NOW) === true && whole.revoked.serial === 2
    && none(dropped) && none(rolled) && none(unmarked) && none(otherKey) && none(plain) && wired
    && !!s.signinFileRead(edit(d => { delete d.revoked; })).held.cert;
};
/* Review 15b, finding 4: a genuine certificate for this desk's key under another person and another licence, put into a file this desk
   wrote, breaks the desk's mark and holds no seat; the same certificate given by the service, and so written by the desk, stands. */
CASES.fileOtherPerson = s => {
  const theirs = cert({ person: "c".repeat(64), licence: "d".repeat(32), code: "HJKMNPQRSTVWXY2A" });
  const mine = s.signinFileMarkText(s.signinFileText({ held: heldOf({ doors: [] }) }), signWith(signKey));
  const d = JSON.parse(mine); d.held.cert = theirs; d.held.code = theirs.code;
  const swapped = JSON.stringify(d, null, 1) + "\n";
  const given = s.signinFileMarkText(s.signinFileText({ held: heldOf({ cert: theirs, code: theirs.code, doors: [] }) }), signWith(signKey));
  const take = t2 => s.signinFileHeld(s.signinFileRead(t2), t2, DESK_KEY).held;
  return s.signinCertOk(theirs, DESK_KEY) === true && !!s.signinFileRead(swapped).held.cert && take(swapped).cert === null && take(swapped).code === ""
    && !!take(given).cert && take(given).code === theirs.code;
};
/* Review 15b, finding 7 (a question, answered with a bound): a signin.json past SIGNIN_FILE_MAX is not read at all and is no sign-in;
   one of the size the desk writes is read once and seats the desk. */
CASES.fileMax = (s, swap) => {
  let text = decl(MAIN, "function signinState(");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  const kept = s.signinFileMarkText(s.signinFileText({ held: heldOf({ doors: [] }) }), signWith(signKey));
  const run = size => {
    let reads = 0;
    const fsStand = { statSync: () => ({ size }), readFileSync: () => { reads++; return kept; } };
    /* signinState also reads machine policy and pins the provider table by it (the sync line's managed half): no policy here. */
    const st = new Function("fs", "path", "app", "SIGNIN_FILE", "SIGNIN_FILE_MAX", "signinFileRead", "SIGNIN_DESK_PACKED", "branchIdentity", "signinFileHeld",
      "managedPolicy", "signinPinTable", "signinOffered", "let signinStore, SIGNIN_PROVIDERS = {}, signinTableBase, signinPinStamp = \"\";\n" + text + "\nreturn signinState();")(fsStand, path, { getPath: () => "/ud" }, "signin.json",
      s.SIGNIN_FILE_MAX, s.signinFileRead, true, () => ({ key: DESK_KEY }), s.signinFileHeld, () => ({ any: false }), table => table, () => []);
    return { reads, held: !!st.held, cert: !!(st.held && st.held.cert) };
  };
  const small = run(kept.length), over = run(s.SIGNIN_FILE_MAX + 1);
  return s.SIGNIN_FILE_MAX === 256 * 1024 && kept.length < 16 * 1024 && small.reads === 1 && small.cert && over.reads === 0 && !over.held;
};
/* Review 15b, finding 6: the code the page shows, and Buy hands the order page, is the held certificate's; with no certificate, the code held. */
/* The code line lives in signinViewOf, the section, so its plant is the section's. */
CASES.viewCertCodeWire = s => viewWith(s, heldOf({ code: "ABCDEFGHJKMNPQRS" })).code === CODE;
CASES.viewCertCode = s => {
  const split = viewWith(s, heldOf({ code: "ABCDEFGHJKMNPQRS" })), bare = viewWith(s, heldOf({ cert: null, code: "ABCDEFGHJKMNPQRS" }));
  return split.code === CODE && bare.code === "ABCDEFGHJKMNPQRS";
};
/* Review 15b, finding 5: the file's certificate is judged against this desk's key, never against the desk it names: another desk's
   genuine certificate, or one naming a desk that is no key, holds no seat here even under a mark this desk made. */
CASES.fileDeskKey = s => {
  const at = c => { const t = s.signinFileMarkText(s.signinFileText({ held: heldOf({ cert: c, doors: [] }) }), signWith(signKey)); return s.signinFileHeld(s.signinFileRead(t), t, DESK_KEY).held; };
  const other = cert({ desk: OTHER_DESK_KEY }), odd = cert({ desk: "not-a-desk-key" });
  return s.signinFileRead(s.signinFileText({ held: heldOf({ cert: other, doors: [] }) })).held.cert !== null && at(other).cert === null && at(other).code === ""
    && at(odd).cert === null && !!at(cert()).cert;
};
/* Review 15b, finding 3: an ended certificate is kept for the lapse's words and never written as the seat; one still running is. */
CASES.certEndedFlush = (s, swap) => {
  const swapIn = names => (swap && names.some(n => decl(MAIN, "function " + n + "(").indexOf(swap[0]) >= 0) ? swap : undefined);
  const flushed = held => { const st = { held, lead: { team: TEAM }, join: null, root: "/share/a", files: new Set(), writes: [] }; return loadFlush(s, st, swapIn(["signinFlush"]))(); };
  const ended = heldOf({ cert: cert({ issued: NOW - 20 * DAY_MS, until: NOW - 1000 }) }), edge = heldOf({ cert: cert({ issued: NOW - 20 * DAY_MS, until: NOW }) });
  return s.signinLapsed(ended, NOW) === true && flushed(ended) === false && flushed(edge) === false && flushed(heldOf()) === true;
};
/* The next sign-in mends it: a certificate under a key the list does not name ends the lapse, the list kept. */
CASES.revokedMend = s => {
  const list = revokedList(1, [SERVICE_PUB]), h = heldOf({ revoked: list });
  const fresh = cert({ via: delegation({ key: { id: "svc-2", pub: OTHER_SERVICE_PUB } }) }, OTHER_SERVICE);
  const mended = s.signinSettle(h, s.signinAnswer(answer({ ok: true, certificate: fresh, code: CODE, doors: [], revoked: list }), DESK_KEY), NOW);
  return s.signinLapsed(h, NOW) === true && s.signinCertOk(fresh, DESK_KEY) === true && JSON.stringify(mended.cert) === JSON.stringify(fresh)
    && s.signinLapsed(mended, NOW) === false && viewWith(s, mended).seat === "held" && JSON.stringify(mended.revoked) === JSON.stringify(list);
};

/* The list outlives a sign-out: kept beside held in signin.json, not inside it, and a sign-in afterwards, as this account or another,
   starts from it, so an answer carrying an older list takes nothing back. With none kept, the answer's list is taken. */
function takeWith(s, state, swap) {
  let text = decl(MAIN, "function signinTake(");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  return new Function("signinState", "signinKeep", "safeStorage", "process", "signinSettle", "signinSave", "signinClaims", text + "\nreturn signinTake;")(
    () => state, (st, p, v) => (v ? "sealed:" + v : ""), {}, { platform: "win32" }, s.signinSettle, () => {}, s.signinClaims);
}
CASES.revokedSurvives = (s, swap) => {
  const kept = revokedList(2, [STRANGER_PUB]), older = revokedList(1, ["aa".repeat(32)]);
  const signedIn = { held: heldOf({ revoked: kept }), revoked: kept };
  const text = s.signinFileText(signedIn), onDisk = JSON.parse(text);
  const out = s.signinFileRead(s.signinFileText({ held: null, revoked: kept }));
  const got = { refreshToken: "rt-9", sub: "sub-9", seed: SEED };
  const answerOlder = s.signinAnswer(answer({ ok: true, certificate: cert(), code: CODE, doors: [], revoked: older }), DESK_KEY);
  const again = { held: out.held, revoked: out.revoked };
  const tookAgain = takeWith(s, again, swap)("google", got, answerOlder, NOW);
  const fresh = { held: null, revoked: null };
  takeWith(s, fresh, swap)("microsoft", got, answerOlder, NOW);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return onDisk.held && onDisk.held.revoked === undefined && same(onDisk.revoked, kept) && out.held === null && same(out.revoked, kept)
    && s.signinFileRead(text).held && same(s.signinFileRead(text).held.revoked, kept)
    && tookAgain === true && again.held.provider === "google" && same(again.held.revoked, kept) && same(again.revoked, kept)
    && same(fresh.revoked, older) && same(fresh.held.revoked, older);
};

/* ---- the cases on the branch ------------------------------------------------------------------------------------------- */
/* ---- the page the browser lands on (ds24): the loopback answers the sign-in's own reply 303 to a path of its own, holds that path's
   one GET until the desk knows how the sign-in ended (at most SIGNIN_LAND_MS, then the neutral page), serves it once and closes ----- */
/* One GET on the loopback, read whole: {status, headers, body}, or {status: <error code>} where nothing answered. */
const fetchLoop = (port, p) => new Promise(res => {
  const req = http.get({ host: "127.0.0.1", port, path: p, agent: false }, r => {
    let body = "";
    r.setEncoding("utf8");
    r.on("data", c => { body += c; });
    r.on("end", () => res({ status: r.statusCode, headers: r.headers, body }));
  });
  req.on("error", e => res({ status: e.code || "error", headers: {}, body: "" }));
  req.setTimeout(3000, () => req.destroy(Object.assign(new Error("no answer"), { code: "TIMEOUT" })));
});
/* The copywriter's words, written here from her brief (words-signin-landing-page-2026-11-13, the outcome set and the fitted table),
   not taken from the shell's table, so the two are checked against each other: [headline, line, tab]. */
const LAND_WORDS = {
  en: {
    seat: ["Signed in", "This computer has its seat. Etiuda carries on by itself; this tab can be closed.", "Signed in"],
    noseat: ["Signed in, no seat yet", "Etiuda shows why, and what comes next. This tab can be closed.", "No seat yet"],
    appfail: ["The sign-in could not be finished", "Etiuda shows why. This tab can be closed.", "Not finished"],
    cancelled: ["The sign-in was cancelled", "Nothing was changed. This tab can be closed; signing in can wait until it suits.", "Cancelled"],
    org: ["Not allowed by this organisation", "Its IT department can allow it; meanwhile another account can be tried. This tab can be closed.", "Not allowed"],
    earlier: ["This tab is from an earlier sign-in", "It was not used, and nothing was changed. This tab can be closed.", "An earlier sign-in"],
    back: ["The sign-in is back with Etiuda", "Etiuda finishes it and shows the result. This tab can be closed.", "Sign-in received"],
    foot: "Shown by Etiuda on this computer; this page itself sends nothing anywhere." },
  pl: {
    seat: ["Zalogowano", "Ten komputer ma już miejsce w licencji. Etiuda sama przechodzi dalej; tę kartę można zamknąć.", "Zalogowano"],
    noseat: ["Zalogowano, jeszcze bez miejsca", "Etiuda pokazuje, dlaczego i co dalej. Tę kartę można zamknąć.", "Jeszcze bez miejsca"],
    appfail: ["Nie udało się dokończyć logowania", "Etiuda pokazuje, dlaczego. Tę kartę można zamknąć.", "Nie dokończono"],
    cancelled: ["Logowanie anulowano", "Nic się nie zmieniło. Tę kartę można zamknąć; z logowaniem można poczekać do dogodnej chwili.", "Anulowano"],
    org: ["Organizacja nie dopuściła Etiudy", "Może to zmienić jej dział IT. Tymczasem w Etiudzie można użyć innego konta; tę kartę można zamknąć.", "Bez zgody organizacji"],
    earlier: ["To karta wcześniejszego logowania", "Nie została użyta i nic się nie zmieniło. Tę kartę można zamknąć.", "Wcześniejsze logowanie"],
    back: ["Logowanie wróciło do Etiudy", "Etiuda je dokończy i pokaże wynik. Tę kartę można zamknąć.", "Logowanie odebrane"],
    foot: "Tę stronę wyświetla Etiuda na tym komputerze; sama strona niczego nie wysyła." },
};
const htmlText = h => String(h).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/* Whether `page` is the landing for `kind` in `lang`: its headline in the h1, its line, its tab title before the app's name, its foot. */
const landIs = (page, kind, lang) => {
  const w = LAND_WORDS[lang][kind], t = htmlText(page);
  return !!w && t.indexOf("<h1>" + w[0] + "</h1>") > 0 && t.indexOf(">" + w[1] + "<") > 0 && t.indexOf("<title>" + w[2] + " · Etiuda</title>") > 0
    && t.indexOf(LAND_WORDS[lang].foot) > 0 && t.indexOf("<html lang=\"" + lang + "\">") > 0;
};
/* The landing's policy: nothing fetched, framed or run, the served page's own style alone by its hash. */
const cspHolds = (csp, page) => {
  const m = /<style>([\s\S]*?)<\/style>/.exec(String(page));
  const hash = m ? "'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'" : "none";
  return typeof csp === "string" && /^default-src 'none'; /.test(csp) && csp.indexOf("style-src " + hash + ";") > 0 && !/unsafe|script-src|\*/.test(csp)
    && /frame-ancestors 'none'/.test(csp) && !/<script|https?:\/\/|\ssrc=|@import|url\((?!#)|\sstyle=/i.test(page);
};
const landPage = s => kind => s.signinLandingHtml(kind, "en");
/* The callback taken: a 303 whose Location is a path of the loopback's own with no query, nothing of the code or the state in it;
   the outcome landed, that path's one GET is the seat's page under the strict policy, and the loopback then closes. */
CASES.landSeat = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-1"), 5000);
  const back = await fetchLoop(loop.port, "/?code=c-secret-1&state=st-1");
  const query = await loop.caught.catch(() => null), at = String(back.headers.location || "");
  loop.land("seat");
  const page = await fetchLoop(loop.port, at);
  await tick(30);
  const after = await fetchLoop(loop.port, at);
  return back.status === 303 && /^\/[0-9a-f]{16}$/.test(at) && at.indexOf("c-secret-1") < 0 && at.indexOf("st-1") < 0 && back.body === ""
    && back.headers["cache-control"] === "no-store" && back.headers["referrer-policy"] === "no-referrer" && query === "code=c-secret-1&state=st-1"
    && page.status === 200 && landIs(page.body, "seat", "en") && cspHolds(page.headers["content-security-policy"], page.body)
    && page.headers["cache-control"] === "no-store" && page.body.indexOf("c-secret-1") < 0 && page.body.indexOf("st-1") < 0
    && typeof after.status !== "number";
};
/* The clean path asked before the desk knows: the GET is held, not answered, until land(), which answers it with that outcome. */
CASES.landHeld = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-2"), 5000);
  const back = await fetchLoop(loop.port, "/?state=st-2&code=c2");
  let page = null;
  const asked = fetchLoop(loop.port, String(back.headers.location || "")).then(r => { page = r; return r; });
  await tick(80);
  const heldOpen = page === null;
  loop.land("noseat");
  await asked;
  return back.status === 303 && heldOpen && page.status === 200 && landIs(page.body, "noseat", "en");
};
/* The cap: nothing landed within landMs, the held GET is answered the neutral page, and the loopback closes; a landing after is nothing. */
CASES.landCap = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-3"), 150);
  const back = await fetchLoop(loop.port, "/?state=st-3&code=c3");
  const at = String(back.headers.location || ""), t0 = Date.now();
  const page = await fetchLoop(loop.port, at), took = Date.now() - t0;
  loop.land("seat");
  await tick(30);
  const after = await fetchLoop(loop.port, at);
  return back.status === 303 && page.status === 200 && landIs(page.body, "back", "en") && took >= 100 && took < 3000 && typeof after.status !== "number";
};
/* Cancel after the reply, before the desk has landed: the held GET is answered the cancelled page and the loopback closes at once,
   where close() alone would leave it to the cap. */
CASES.landCancel = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-9"), 5000);
  const back = await fetchLoop(loop.port, "/?state=st-9&code=c9");
  const at = String(back.headers.location || "");
  const asked = fetchLoop(loop.port, at);
  await tick(60);
  if (typeof loop.cancel === "function") loop.cancel();
  const page = await asked;
  await tick(30);
  const after = await fetchLoop(loop.port, "/other");
  return back.status === 303 && page.status === 200 && landIs(page.body, "cancelled", "en") && typeof after.status !== "number";
};
/* A stray before the reply is answered 400 with the earlier tab's page and the wait goes on; after the reply, another GET of "/" and
   any other path are 404 and the landing still serves its path. */
CASES.landStray = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-4"), 5000);
  let settled = false;
  loop.caught.then(() => { settled = true; }, () => { settled = true; });
  const stray = await fetchLoop(loop.port, "/?state=other&code=x");
  await tick(30);
  const waiting = !settled;
  const back = await fetchLoop(loop.port, "/?state=st-4&code=c4"), at = String(back.headers.location || "");
  const again = await fetchLoop(loop.port, "/?state=st-4&code=c4"), guess = await fetchLoop(loop.port, "/" + "0".repeat(16));
  const withQuery = await fetchLoop(loop.port, at + "?code=c4");
  loop.land("cancelled");
  const page = await fetchLoop(loop.port, at);
  return stray.status === 400 && landIs(stray.body, "earlier", "en") && cspHolds(stray.headers["content-security-policy"], stray.body) && waiting
    && back.status === 303 && again.status === 404 && guess.status === 404 && withQuery.status === 404 && page.status === 200 && landIs(page.body, "cancelled", "en");
};
/* The clean path is served once: a second GET of it while the first is held is refused at once, and the first still gets the page. */
CASES.landOnce = async s => {
  const loop = await s.signinListen(http, landPage(s), 10000, stateIs("st-5"), 5000);
  const back = await fetchLoop(loop.port, "/?state=st-5&code=c5"), at = String(back.headers.location || "");
  const first = fetchLoop(loop.port, at);
  await tick(40);
  const second = await fetchLoop(loop.port, at);
  loop.land("seat");
  const one = await first;
  return back.status === 303 && second.status === 404 && one.status === 200 && landIs(one.body, "seat", "en");
};
/* Every way a sign-in ends, as the landing says it: through signinRun for the provider's own replies (its refusal "at" authorize), and
   from the service's answers. */
CASES.landKinds = async s => {
  const run = async (loopQ, reply) => {
    const io = {
      listen: async () => { let yes; const caught = new Promise(a => { yes = a; }); io.give = yes; return { port: 49999, caught, close: () => {} }; },
      openPage: async url => { const q = new URL(url).searchParams; io.nonce = q.get("nonce"); setTimeout(() => io.give(loopQ(q.get("state"))), 2); return true; },
      tokenAsk: async () => { if (reply instanceof Error) throw reply; return typeof reply === "function" ? reply(io.nonce) : reply; }, page: () => "",
    };
    return s.signinRun(io, MS, DESK_KEY, () => NOW);
  };
  const q = (e, d) => st => "state=" + encodeURIComponent(st) + "&error=" + e + (d ? "&error_description=" + encodeURIComponent(d) : "");
  const code = st => "state=" + encodeURIComponent(st) + "&code=abc";
  const ok = nonce => answer({ id_token: jwt(msClaims(nonce)), refresh_token: "rt" });
  const cases = [
    [await run(q("access_denied"), ok), null, "cancelled"],
    [await run(q("access_denied", "AADSTS65004: User declined to consent"), ok), null, "cancelled"],
    [await run(q("consent_required"), ok), null, "org"],
    [await run(q("access_denied", "AADSTS65001: not consented"), ok), null, "org"],
    [await run(q("invalid_request", "AADSTS90094: admin approval"), ok), null, "org"],
    [await run(q("server_error"), ok), null, "appfail"],
    [await run(code, answer({ error: "invalid_grant" }, 400)), null, "appfail"],
    [await run(code, answer({ error: "invalid_client" }, 401)), null, "appfail"],
    [await run(code, new Error("offline")), null, "appfail"],
  ];
  const got = await run(code, ok);
  const cert1 = cert();
  const answers = [[{ ok: true, code: CODE, cert: cert1 }, "seat"], [{ ok: true, code: CODE, cert: null, waiting: true }, "noseat"],
    [{ ok: true, code: CODE, cert: null }, "noseat"], [{ ok: false, reason: "full" }, "noseat"], [{ ok: false, reason: "desks" }, "appfail"],
    [{ ok: false, reason: "token" }, "appfail"], [{ ok: false, reason: "signin" }, "appfail"], [{ ok: false, reason: "unreached" }, "appfail"]];
  const wrong = cases.filter(c => s.signinLanding(c[0], c[1]) !== c[2]).map(c => c[2] + ":" + s.signinLanding(c[0], c[1]))
    .concat(answers.filter(a => s.signinLanding(got, a[0]) !== a[1]).map(a => a[1] + ":" + s.signinLanding(got, a[0])));
  if (wrong.length) console.log("  (landings wrong: " + wrong.join(", ") + ")");
  return got.ok === true && wrong.length === 0 && s.signinLanding(got) === "appfail" && s.signinLanding(null) === "appfail";
};
/* Every kind's page in both languages carries the copywriter's words, its tab title and foot, no script, no address and nothing a
   keyboard cannot type; a kind it does not know is the could-not-finish page. */
CASES.landWords = s => {
  const kinds = Object.keys(LAND_WORDS.en).filter(k => k !== "foot"), bad = [];
  for (const lang of ["en", "pl"]) for (const k of kinds) {
    const page = s.signinLandingHtml(k, lang);
    if (!landIs(page, k, lang) || !cspHolds(s.signinLandingCsp(page), page) || /[‐-―‘-‟… ]/.test(page)) bad.push(lang + ":" + k);
  }
  if (bad.length) console.log("  (pages wrong: " + bad.join(", ") + ")");
  return bad.length === 0 && kinds.length === 7 && landIs(s.signinLandingHtml("nothing-known", "en"), "appfail", "en")
    && landIs(s.signinLandingHtml("seat", "de"), "seat", "en");
};
/* Every landing is one response: the mark's symbol and its mask each once, every id on the page once, the mark drawn twice by
   reference to that symbol, the icon data: and nothing else that could make the browser ask for anything. */
CASES.landMark = s => {
  const bad = [];
  for (const lang of ["en", "pl"]) for (const k of Object.keys(LAND_WORDS.en).filter(x => x !== "foot")) {
    const page = s.signinLandingHtml(k, lang), ids = [...page.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]);
    const once = re => (page.match(re) || []).length === 1;
    const refs = [...page.matchAll(/(?:href|xlink:href)="([^"]*)"|url\(([^)]*)\)/g)].map(m => m[1] || m[2]);
    if (!(once(/<symbol id="m" /g) && once(/<mask /g) && once(/<mask id="[^"]+"/g) && new Set(ids).size === ids.length && ids.indexOf("m") >= 0
      && (page.match(/<use href="#m"\/>/g) || []).length === 2 && refs.every(r => r === "data:," || (r.charAt(0) === "#" && ids.indexOf(r.slice(1)) >= 0))
      && once(/<link /g) && once(/<link rel="icon" href="data:,">/g) && !/<(script|img|iframe|object|embed|image|audio|video|source|font|base|meta http-equiv)\b/i.test(page)
      && !/\ssrc=|\sstyle=|@import|https?:/i.test(page) && page.length > 60000 && page.length < 100000)) bad.push(lang + ":" + k);
  }
  if (bad.length) console.log("  (pages that fetch or repeat: " + bad.join(", ") + ")");
  return bad.length === 0;
};
/* The press lands the loopback with how it ended, once, after the service's answer: a seat; no seat yet; the person's Cancel at the
   provider; the service away. The shell around the press sliced as waitStand slices it, the loopback a stand-in recording land(). */
function landStand(sec, swap, serve, loopQ) {
  const st = { on: {}, handle: {}, landed: [], told: [] };
  const tryDecl = d => { try { return decl(MAIN, d); } catch { return ""; } };
  let text = [tryDecl("function signinView("), tryDecl("function signinIo("), ipcSlice('ipcMain.on("etiuda:signin-click"'), ipcSlice('ipcMain.handle("etiuda:signin",')].join("\n");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  let give = null, nonce = "";
  const vals = {
    ipcMain: { on: (ch, fn) => { st.on[ch] = fn; }, handle: (ch, fn) => { st.handle[ch] = fn; } }, fromEngine: () => true, LINK_CLICK_MS: 2000,
    signinState: () => ({ held: null }), signinLapsed: sec.signinLapsed, signinOffered: () => [MS], signinPreviewing: () => false,
    signinKnown: sec.signinKnown, signinAccessFor: sec.signinAccessFor, SIGNIN_PROVIDERS: sec.SIGNIN_PROVIDERS, branchIdentity: () => ({ id: DESK_ID, key: DESK_KEY }), net: { fetch: () => { throw new Error("no"); } },
    signinRun: sec.signinRun, signinLanding: sec.signinLanding, signinTake: () => true, signinFlush: () => true, signinSave: () => {},
    signinSeat: async () => { if (serve instanceof Error) throw serve; return serve; },
    tellSignin: () => { st.told.push(1); }, signinPageOk: sec.signinPageOk, sealsForReal: () => true,
    safeStorage: { isEncryptionAvailable: () => true }, http: {}, SIGNIN_WAIT_MS: sec.SIGNIN_WAIT_MS,
    signinListen: () => { const caught = new Promise(a => { give = a; }); return Promise.resolve({ port: 49152, caught, close: () => {}, land: k => { st.landed.push(k); } }); },
    handOut: url => { const q = new URL(url).searchParams; nonce = q.get("nonce"); setTimeout(() => give(loopQ(q.get("state"))), 2); return Promise.resolve(); },
    signinRequest: async () => answer({ id_token: jwt(msClaims(nonce, Date.now())), refresh_token: "rt" }), signinServiceAsk: () => { throw new Error("no"); },
    signinSign: () => "", signinKeep: () => "", signinKept: () => "", signinPageHtml: () => "",
    SIGNIN_TRACE_ASKED: false, SIGNIN_DESK_PACKED: true,
    /* The store off and its look after a seat counted, never run: tests/desk-store-shell.mjs holds them. */
    storeOn: () => false, storeTokenTake: () => {}, storeTurn: () => { st.storeTurns = (st.storeTurns || 0) + 1; }, storeLeaveNow: () => Promise.resolve(true),
    storeEndAgain: () => Promise.resolve(false), signinViewOf: sec.signinViewOf, signinClockNow: CLOCK_STAND,
  };
  const names = Object.keys(vals);
  const body = "let signinClick = null, signinBusy = null, signinSaid = \"\", signinOutFlight = null;\n" + text + "\nreturn { view: signinView };";
  st.view = new Function(...names, body)(...names.map(n => vals[n])).view;
  st.press = id => { st.on["etiuda:signin-click"]({ returnValue: undefined }, id); return st.handle["etiuda:signin"]({}, id); };
  return st;
}
CASES.landWired = async (s, swap) => {
  const code = st => "state=" + encodeURIComponent(st) + "&code=abc";
  const press = async (serve, loopQ) => { const st = landStand(s, swap, serve, loopQ); const v = await st.press("microsoft"); return [st.landed.join(), v.said]; };
  const seat = await press({ ok: true, code: CODE, cert: cert() }, code);
  const none = await press({ ok: true, code: CODE, cert: null, waiting: true }, code);
  const gone = await press(new Error("offline"), code);
  const cancelled = await press({ ok: true }, st => "state=" + encodeURIComponent(st) + "&error=access_denied");
  const all = [seat, none, gone, cancelled].map(x => x.join("/")).join(", ");
  if (all !== "seat/signin-done, noseat/signin-done, appfail/unreached, cancelled/signin-cancelled") console.log("  (landed: " + all + ")");
  return seat.join() === "seat,signin-done" && none.join() === "noseat,signin-done" && gone.join() === "appfail,unreached"
    && cancelled.join() === "cancelled,signin-cancelled";
};
/* The address the browser ends at, over real HTTP with node's own fetch following the redirects as a browser does: the lab's authorize
   page 302 to the loopback with the code and state, the loopback 303 to its own path; the page's address carries neither, and the
   page says how it ended once the desk lands it. */
CASES.landAddress = async () => {
  const d = await labDouble();
  try {
    const s = load();
    if (!s.signinLabUse(s.signinLabRead(labText(d.port)))) return false;
    const p = s.signinOffered().find(x => x.id === "lab");
    let loop = null, followed = null;
    const io = { listen: (pageFor, takes) => s.signinListen(http, pageFor, 10000, takes, 5000).then(l => (loop = l)),
      openPage: async url => { followed = fetch(url, { redirect: "follow" }).then(async r => ({ status: r.status, url: r.url, redirected: r.redirected, body: await r.text() })); return true; },
      tokenAsk: (u, f) => s.signinRequest(fetch, u, f), serviceAsk: (u, b) => s.signinServiceAsk(fetch, u, b), sign: signWith(signKey), page: landPage(s) };
    const got = await s.signinRun(io, p, DESK_KEY, Date.now);
    const ans = got.ok ? await s.signinSeat(io, "lab", DESK_KEY, got.idToken, got.seed, Date.now) : { ok: false };
    loop.land(s.signinLanding(got, ans));
    const f = await followed;
    const u = new URL(f.url);
    return got.ok && ans.ok && f.status === 200 && f.redirected && u.hostname === "127.0.0.1" && u.search === "" && /^\/[0-9a-f]{16}$/.test(u.pathname)
      && f.url.indexOf("lab-code") < 0 && f.url.indexOf("state") < 0 && landIs(f.body, "seat", "en") && f.body.indexOf("lab-code") < 0;
  } finally { await d.close(); }
};

/* ---- THE RELAY'S SEAT (ds49; decision 49, option (b)): on a team whose licence follows Entra the relay refuses a desk whose seat
   certificate ran out once colleagues prove past it (tests/relay-seats.mjs). The shell keeps the team whose relay refused, renews a
   run-out certificate before a session at most hourly, and Account says what it means to the person in the copywriter's words. ---- */
const SEAT_REMOVED_EN = ["Your organisation no longer gives this account access to Etiuda.", "This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. The organisation's IT department can give access again."];
const SEAT_RENEW_EN = ["This account's sign-in needs renewing.", "This desk keeps its catalog and works with it as before. Signing in again, under Account, brings the team's new editions back."];
const SEAT_REMOVED_PL = ["Organizacja nie przyznaje już temu kontu dostępu do Etiudy.", "To stanowisko zachowuje swój katalog i działa z nim jak dotąd, ale nowe wydania od zespołu już do niego nie trafiają. Dostęp może przywrócić dział IT organizacji."];
const SEAT_RENEW_PL = ["Logowanie tego konta wymaga odnowienia.", "To stanowisko zachowuje swój katalog i działa z nim jak dotąd. Po ponownym zalogowaniu się w części Konto nowe wydania od zespołu znów zaczną docierać."];
const NO_ROLE_EN = ["This account has no Etiuda role in its organisation, so it holds no seat.", "Its IT department can assign one."];
/* The service's "no-role" (a token of a licence that follows Entra without an Etiuda role) is read as itself, at a renewal and at a first
   sign-in; the certificate in hand is kept to its own end and no sign-in is asked. Handed as stray until this tree's copy of the service's
   record holds it (Studio records it since a9ad7cd3; ds23b then wants its reading). */
CASES.relaySeatAnswer = s => {
  const ans = s.signinAnswer(strayAnswer({ ok: false, reason: "no-role" }, 403), DESK_KEY);
  const held = heldOf({});
  const settled = s.signinSettle(held, ans, NOW);
  return ans.ok === false && ans.reason === "no-role" && settled.said === "no-role" && settled.ask === false && !!settled.cert
    && settled.cert.sig.value === held.cert.sig.value && settled.refresh === held.refresh;
};
/* The shell's own declarations of the relay's seat, evaluated with stand-ins; swap is a plant's. */
function relaySeatWire(swap, stand) {
  const names = ["function signinRelaySeatTold(", "function signinRelaySeat(", "function signinSeatCert(", "function signinSeatRenew(", "function signinRelaySeatIo("];
  let text = decl(MAIN, "const SIGNIN_SEAT_RENEW_MS") + "\n" + decl(MAIN, "const SIGNIN_PRESS_GAP_MS") + "\n" + names.map(n => decl(MAIN, n)).join("\n");
  if (swap) { if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]); text = text.replace(swap[0], swap[1]); }
  const st = stand || {};
  return new Function("st", "let signinRelaySeatTeam = \"\", signinSeatRenewAt = 0, signinRenewing = null;\n"
    + "const tellSignin = () => { st.told = (st.told || 0) + 1; }, signinRenewNow = () => { st.renewed = (st.renewed || 0) + 1; return Promise.resolve(st.said || \"renewed\"); };\n"
    + "const signinState = () => ({ held: st.held }), branchIdentity = () => st.me, signinCertOk = (c, k) => !!c && c.desk === k, signinRevokedHas = (l, c) => !!l && l.indexOf(c.sig.value) >= 0;\n"
    + "const Date = { now: () => st.now };\n"
    + text + "\nreturn { signinRelaySeatTold, signinRelaySeat, signinSeatCert, signinSeatRenew, signinRelaySeatIo, team: () => signinRelaySeatTeam, pending: p => { signinRenewing = p; } };")(st);
}
/* The team whose relay refused is kept and told once; the words follow the last renewal: "removed" where the service found no role,
   "renew" otherwise; another team's open leaves it, its own open or a channel let go clears it; no sign-in held is no words. */
CASES.relaySeatWire = (s, swap) => {
  const st = {}, w = relaySeatWire(swap, st);
  const io = w.signinRelaySeatIo("t-1");
  io.onSeat("refused");
  const told1 = st.told, renew = w.signinRelaySeat(heldOf({})), removed = w.signinRelaySeat(heldOf({ said: "no-role" })), none = w.signinRelaySeat(null);
  io.onSeat("refused");
  const told2 = st.told;
  w.signinRelaySeatIo("t-2").onSeat("open");
  const kept = w.team();
  io.onSeat("open");
  const cleared = w.team() === "" && w.signinRelaySeat(heldOf({})) === "";
  io.onSeat("refused");
  w.signinRelaySeatIo(null);
  return told1 === 1 && renew === "renew" && removed === "removed" && none === "" && told2 === 1 && kept === "t-1" && cleared && w.team() === "" && st.told === 4;
};
/* The certificate a session carries is the desk's own and standing, or none; a run-out one is renewed before a session at most once an
   hour, and a renewal already out is waited on rather than doubled. */
CASES.seatRenewGap = async (s, swap) => {
  const c = cert();
  const st = { now: NOW, me: { key: DESK_KEY }, held: heldOf({ cert: c }) }, w = relaySeatWire(swap, st);
  const own = w.signinSeatCert() === c;
  st.me = { key: OTHER_DESK_KEY };
  const other = w.signinSeatCert() === null;
  st.me = { key: DESK_KEY };
  st.held = heldOf({ cert: c, revoked: [c.sig.value] });
  const revoked = w.signinSeatCert() === null;
  await w.signinSeatRenew();
  st.now += 10 * 60 * 1000;
  await w.signinSeatRenew();
  const withinHour = st.renewed;
  st.now += 60 * 60 * 1000;
  let out = null;
  w.pending(new Promise(r => { out = r; }));
  const waiting = w.signinSeatRenew();
  out();
  await waiting;
  const whilePending = st.renewed;
  w.pending(null);
  await w.signinSeatRenew();
  const reached = st.renewed;
  st.now += 2 * 60 * 60 * 1000;
  st.said = "unreached";
  await w.signinSeatRenew();
  st.now += 6 * 60 * 1000;
  await w.signinSeatRenew();
  const unreached = st.renewed;
  return own && other && revoked && withinHour === 1 && whilePending === 1 && reached === 2 && unreached === 4;
};
/* Account and the door say the relay's refusal as what it is to the person, never a fault of the team or its lead: no longer given
   access, or the sign-in to renew (with the providers under it); nothing while signed out; the service's no-role at a first sign-in and at
   a renewal in the copywriter's words; Polish too. */
CASES.relaySeatPage = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const base = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held" };
  const door = o => pg.signinDoor(pg.signinRead(Object.assign({}, base, o)));
  const removed = door({ relaySeat: "removed", refused: "no-role" }), renew = door({ relaySeat: "renew", ask: true }), out = door({ signedIn: "", relaySeat: "renew" });
  const noRoleFirst = door({ signedIn: "", said: "no-role" }), noRoleRenewal = door({ refused: "no-role" });
  let pl = null;
  storage.lsSet("eUiLang", "pl");
  try { pl = [door({ relaySeat: "removed" }).say, door({ relaySeat: "renew" }).say]; } finally { storage.lsSet("eUiLang", "en"); }
  const blames = JSON.stringify([removed.say, renew.say]).match(/lead|relay|team's fault|lider/gi);
  return removed.moment === "relayseat" && sayIs(removed.say, SEAT_REMOVED_EN) && !removed.providers
    && renew.moment === "relayseat" && sayIs(renew.say, SEAT_RENEW_EN) && renew.providers.join() === "microsoft,google"
    && out.moment === "before" && noRoleFirst.moment === "refused" && noRoleFirst.heading === NO_ROLE_EN[0] && noRoleFirst.line === NO_ROLE_EN[1]
    && noRoleRenewal.moment === "renewal" && sayIs(noRoleRenewal.say, NO_ROLE_EN) && !!pl && sayIs(pl[0], SEAT_REMOVED_PL) && sayIs(pl[1], SEAT_RENEW_PL) && !blames;
};
/* Finding 7: a sign-in that succeeds, a renewal that succeeds, and Sign out clear the relay seat's "needs renewing" mark at once and wake the relay. */
CASES.relaySeatCleared = async (s, swap) => {
  const st = switchStand(s, { held: { sub: "sealed:s-1" } });
  st.sub = "s-1";
  st.relaySoon = () => { st.relaySoons = (st.relaySoons || 0) + 1; };
  st.signinRenewHeld = async (io, p, key, held) => ({ held: Object.assign({}, held, { cert: cert({ issued: NOW + 2 }), said: "" }), said: "renewed" });
  const decls = ["const SIGNIN_SEAT_RENEW_MS", "const SIGNIN_PRESS_GAP_MS", "function signinRelaySeatTold(", "function signinRelaySeatClear(", "function signinRelaySeat(", "async function signinPressNow(", ...SWITCH_DECLS];
  let text = decls.map(d => tryDeclText(d)).filter(Boolean).concat([ipcSlice('ipcMain.on("etiuda:signin-click"'), ipcSlice('ipcMain.handle("etiuda:signin",')]).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in relaySeatCleared once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const names = [...SWITCH_STANDS, "relaySoon"];
  const body = "let signinRelaySeatTeam = \"\", signinSeatRenewAt = 0, signinBusy = null, signinClick = null, signinSaid = \"\", signinWrote = \"kept\", signinRenewing = null, signinOutFlight = null, signinTimer = null, signinPressAt = 0, relayPressOwed = false;\n"
    + "function signinView() { const h = signinState().held; return { signedIn: h ? h.provider : \"\", relaySeat: h ? signinRelaySeat(h) : \"\", said: signinSaid }; }\n"
    + text + "\nreturn { signinRelaySeatTold, signinView, signinOutNow, signinRenewNow, team: () => signinRelaySeatTeam, renewAt: () => signinSeatRenewAt, setRenewAt: n => { signinSeatRenewAt = n; } };";
  const w = new Function(...names, body)(...names.map(n => st[n]));
  const press = async () => { st.on["etiuda:signin-click"]({}, "microsoft"); return st.handle["etiuda:signin"]({}, "microsoft"); };
  w.signinRelaySeatTold("t-1", "refused");
  w.setRenewAt(NOW);
  const before = w.signinView().relaySeat;
  const pageBefore = P ? P.signinDoor(P.signinRead({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, seat: "held", relaySeat: before })) : null;
  st.answer = { ok: true, code: CODE, cert: cert({ issued: NOW + 1 }), doors: [] };
  const afterSignin = await press();
  await new Promise(r => setTimeout(r, 5));
  const keptBySignin = w.team() === "t-1" && w.renewAt() > 0 && w.renewAt() !== NOW && afterSignin.relaySeat === "renew" && st.relaySoons === 1;
  w.setRenewAt(NOW + 1);
  await w.signinRenewNow();
  const keptByQuiet = w.team() === "t-1" && w.renewAt() === NOW + 1 && w.signinView().relaySeat === "renew" && st.relaySoons === 2;
  await w.signinRenewNow({ relay: true });
  const keptByRelay = w.team() === "t-1" && w.renewAt() === NOW + 1 && st.relaySoons === 2;
  await w.signinRenewNow({ person: true });
  const keptByCheck = w.team() === "t-1" && w.renewAt() === NOW + 1 && st.relaySoons === 2;
  w.signinRelaySeatTold("t-1", "open");
  const clearedByOpen = w.team() === "" && w.signinView().relaySeat === "";
  w.signinRelaySeatTold("t-1", "refused");
  w.setRenewAt(NOW + 2);
  w.signinOutNow();
  const clearedByOut = w.team() === "" && w.renewAt() === 0 && st.relaySoons === 3;
  return before === "renew" && !!pageBefore && pageBefore.say[0] === SEAT_RENEW_EN[0] && keptBySignin && keptByQuiet && keptByRelay && keptByCheck && clearedByOpen && clearedByOut;
};
/* A POOLED DESK'S CERTIFICATE (Claude alpha's ruling of 2026-11-14 01:07; the relay's grace reads the mark): the desk takes it exactly where
   the relay does, signed or not. */
CASES.pooledCert = s => {
  const req = createRequire(import.meta.url), core = req(path.join(ROOT, "relay", "core.cjs"));
  const day = { until: NOW + 86400000 }, pooled = cert(Object.assign({ pooled: true }, day)), forged = Object.assign(cert(day), { pooled: true });
  const odd = cert(Object.assign({ pooled: "yes" }, day)), long = cert({ pooled: true, until: NOW + 86400000 + 60000 });
  const kept = s.signinFileRead(s.signinFileText({ held: heldOf({ cert: pooled, doors: [] }) })).held.cert;
  const relay = c => core.certWhy(c, DESK_KEY, [c.licence], NOW, [TEST_ROOT]) === null;
  return s.signinCertOk(pooled, DESK_KEY) === true && !s.signinCertOk(forged, DESK_KEY) && !s.signinCertOk(odd, DESK_KEY)
    && !!kept && kept.pooled === true && relay(pooled) && !relay(forged) && !relay(odd) && !s.signinCertOk(long, DESK_KEY) && !relay(long);
};
/* ---- THE DESK WORKS, ON A CLOCK OF ITS OWN (B-2a): signinWorks, the view's new fields, the desk's clock and its keeping --------
   The main process answers whether this desk works (signinWorks) on a clock anchored on the service's signed time and moved only
   forward (signinClockObserve), kept in signin.json beside the file's own mark (signinClockText), and the view carries it; nothing on
   the desk or the page decides anything by it yet, and every judgement before it still reads the system clock. */
const YEAR_MS = 365 * 86400000, HOUR_MS = 3600000;
/* The truth table: no certificate, another desk's, a revoked signer, ended on the desk's clock, before the clock reached it, current. */
CASES.worksTable = s => {
  const w = (held, at) => s.signinWorks(held, DESK_KEY, at), c = cert();
  return w(null, NOW) === false && w(heldOf({ cert: null }), NOW) === false
    && w(heldOf({ cert: cert({ desk: OTHER_DESK_KEY }) }), NOW) === false && s.signinWorks(heldOf(), OTHER_DESK_KEY, NOW) === false
    && w(heldOf({ revoked: revokedList(1, [SERVICE_PUB]) }), NOW) === false && w(heldOf({ revoked: revokedList(1, [STRANGER_PUB]) }), NOW) === true
    && w(heldOf(), c.until) === false && w(heldOf(), c.until + YEAR_MS) === false && w(heldOf(), c.until - 1) === true
    && w(heldOf(), NOW - 1) === false && w(heldOf(), 0) === false && w(heldOf(), NOW + 0.5) === false && w(heldOf(), undefined) === false
    && w(heldOf(), NOW) === true && w(heldOf(), NOW + 86400000) === true
    /* The system clock is no argument of it: a year fast, today's calm lapse reads lapsed while the desk works. */
    && s.signinLapsed(heldOf(), NOW + YEAR_MS) === true;
};
/* signinViewOf over `held` and the facts signinView gathers, each fact overridable. */
const viewFacts = over => Object.assign({ offered: ["microsoft"], preview: false, shown: ["microsoft"], wall: NOW, busy: null, said: "", doors: [],
  relaySeat: "", outOwed: false, licenceManaged: false, keeps: true, stranded: false, accountKept: false, deskKey: DESK_KEY, deskNow: NOW + HOUR_MS,
  last: 0, online: true }, over);
/* The five new fields, [works, now, until, stoppedAt, online], in each state. */
CASES.viewFields = s => {
  const c = cert(), at = NOW + HOUR_MS, last = NOW - 86400000;
  const of = (held, over) => JSON.stringify((v => [v.works, v.now, v.until, v.stoppedAt, v.online])(s.signinViewOf(held, viewFacts(over))));
  const is = (...a) => JSON.stringify(a);
  return of(null) === is(false, at, 0, 0, true) && of(null, { online: false, deskNow: 0 }) === is(false, 0, 0, 0, false)
    && of(heldOf({ seated: true })) === is(true, at, c.until, 0, true)
    && of(heldOf({ seated: true }), { offered: ["google"] }) === is(true, at, c.until, 0, true)
    && of(heldOf({ seated: true }), { deskNow: c.until }) === is(false, c.until, c.until, c.until, true)
    && of(heldOf({ seated: true, revoked: revokedList(1, [SERVICE_PUB]) })) === is(false, at, c.until, at, true)
    && of(heldOf({ seated: true, cert: null }), { last }) === is(false, at, 0, last, true)
    && of(heldOf({ cert: null }), { last }) === is(false, at, 0, 0, true)
    && of(heldOf({ seated: true, cert: null }), { last: 0 }) === is(false, at, 0, 0, true)
    && of(heldOf({ seated: true }), { online: undefined }) === is(true, at, c.until, 0, true);
};
/* The wiring hands signinViewOf the desk's clock, key and network as signinClockNow reads them, never the system clock. */
CASES.viewClockWire = (s, swap) => {
  let text = decl(MAIN, "function signinView(");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const v = (held, key) => new Function("signinOffered", "signinState", "signinPreviewing", "SIGNIN_PROVIDERS", "signinDoorsShown", "sealsForReal", "safeStorage",
    "process", "signinRelaySeat", "signinViewOf", "signinClockNow", "let signinBusy = null, signinSaid = \"\", signinOutFlight = null;\n" + text + "\nreturn signinView();")(
    () => [MS], () => ({ held }), () => false, {}, () => [], () => true, {}, { platform: "win32" }, () => "", s.signinViewOf,
    () => ({ key: key || DESK_KEY, desk: NOW + 5, last: 7, online: false }));
  const stopped = v(heldOf({ seated: true, cert: null })), on = v(heldOf()), other = v(heldOf(), OTHER_DESK_KEY);
  return stopped.works === false && stopped.now === NOW + 5 && stopped.stoppedAt === 7 && stopped.online === false
    && on.works === true && on.until === cert().until && on.now === NOW + 5 && other.works === false;
};
/* TODAY'S VIEW, BYTE FOR BYTE: signinView as it stood at engine main 158d1826, its plant tags taken out, read beside the shell's over the
   same stand-ins in each state; the shell's carries exactly the five new fields more, and with them taken out the same JSON. */
const ORACLE_VIEW = `function signinView() {
  const st = signinState(), held = st.held, real = signinOffered().map(p => p.id), now = Date.now(), preview = signinPreviewing();
  const offered = preview ? Object.keys(SIGNIN_PROVIDERS) : real;
  const signedIn = held && real.indexOf(held.provider) >= 0 ? held.provider : "";
  /* The code shown and handed to Buy is the held certificate's own where one is held, as the answer took it. */
  let code = signedIn ? held.code : "";
  if (signedIn && held.cert && typeof held.cert.code === "string") code = held.cert.code;
  const view = { offered: offered, preview: preview, signedIn: signedIn, code: code,
    seat: !signedIn ? "" : held.cert ? (signinLapsed(held, now) ? "lapsed" : "held") : "none",
    deskOnly: !!signedIn && !!held.cert && held.cert.deskOnly === true,
    /* Ask your lead, and the person's own trial's end where its certificate is the one held (a team is its lead's own). */
    askLead: !!signedIn && held.askLead === true,
    trialUntil: !!signedIn && held.askLead === true && !!held.cert && held.cert.deskOnly === true ? Number(held.cert.until) || 0 : 0,
    licenceManaged: signedIn ? held.managed === true : signinState().licenceManaged === true, cause: signedIn && held.managed === true ? held.cause || "" : "",
    at: signedIn ? held.at : 0, reached: !signedIn || held.reached !== false, ask: !!signedIn && held.ask === true,
    refused: signedIn ? held.said : "", busy: signinBusy ? signinBusy.provider : "", said: signinSaid,
    doors: signedIn ? signinDoorsShown(held, now) : [],
    relaySeat: signedIn ? signinRelaySeat(held) : "",
    outOwed: !signedIn && !!signinState().out && !signinOutFlight,
    link: signinBusy && signinPageOk(signinBusy.url) ? signinBusy.url : "", keeps: sealsForReal(safeStorage, process.platform) };
  /* Only where machine policy sets any of its six values, so an unmanaged desk's view is the same object as before. */
  const m = st.managed;
  if (m && m.any) view.managed = { on: m.managed, shared: m.shared, personal: m.personal, provider: m.provider, tenant: !!m.tenant, closed: m.closed, contact: m.contact,
    stranded: deskKeyStranded(m) };
  if (view.managed) view.managed.keeps = signinAccountKept(st);
  /* Policy has not answered: the page says the desk waits for it, and never that the computer is managed. */
  if (m && m.waiting === true) view.managed.waiting = true;
  return view;
}`;
const VIEW_NEW = ["works", "now", "until", "stoppedAt", "online", "ended", "holding", "trials", "registered"];
function viewPair(s, st, swap) {
  let text = decl(MAIN, "function signinView(");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const store = Object.assign({ held: st.held }, st.store || {});
  const names = ["signinOffered", "signinState", "signinPreviewing", "SIGNIN_PROVIDERS", "signinLapsed", "signinDoorsShown", "signinPageOk", "sealsForReal",
    "safeStorage", "process", "signinRelaySeat", "deskKeyStranded", "signinAccountKept", "signinViewOf", "signinClockNow"];
  const vals = [() => st.offered.map(id => ({ id })), () => store, () => st.preview === true, { microsoft: {}, google: {} }, s.signinLapsed,
    () => st.doors || [], s.signinPageOk, () => st.keeps !== false, {}, { platform: "win32" }, () => st.relaySeat || "", () => st.stranded === true,
    () => st.kept === true, s.signinViewOf, CLOCK_STAND];
  const head = "let signinBusy = " + JSON.stringify(st.busy || null) + ", signinSaid = " + JSON.stringify(st.said || "") + ", signinOutFlight = "
    + (st.flight ? "{}" : "null") + ";\n";
  const run = t => new Function(...names, head + t + "\nreturn signinView();")(...vals);
  return { now: run(text), old: run(ORACLE_VIEW) };
}
const VIEW_STATES = () => {
  const policy = { any: true, managed: true, shared: false, personal: false, provider: "microsoft", tenant: true, closed: true, contact: "IT, ext. 1" };
  return [
    { offered: [], held: null }, { offered: ["microsoft"], held: null, store: { out: DESK_KEY } }, { offered: ["microsoft"], held: null, store: { out: DESK_KEY }, flight: true },
    { offered: ["microsoft"], held: null, store: { licenceManaged: true } }, { offered: ["microsoft"], held: heldOf({ seated: true }) },
    { offered: ["microsoft"], held: heldOf({ cert: cert({ issued: NOW - 29 * 86400000, until: NOW - 86400000 }) }) },
    { offered: ["microsoft"], held: heldOf({ revoked: revokedList(1, [SERVICE_PUB]) }) },
    { offered: ["microsoft"], held: heldOf({ cert: null, askLead: true, managed: true, cause: "own-licence", said: "waiting", reached: false, ask: true }) },
    { offered: ["microsoft"], held: heldOf({ cert: cert({ deskOnly: true }), askLead: true }) },
    { offered: ["microsoft"], held: heldOf({ provider: "google" }), store: { licenceManaged: true } },
    { offered: ["microsoft"], held: null, busy: { provider: "microsoft", url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=1" }, said: "signin-cancelled" },
    { offered: [], preview: true, held: null },
    { offered: ["microsoft"], held: heldOf(), store: { managed: Object.assign({}, policy, { waiting: true }) }, stranded: true, kept: true },
    { offered: ["microsoft"], held: null, store: { managed: policy } },
    { offered: ["microsoft"], held: heldOf({ doors: [] }), relaySeat: "renew", doors: [{ n: 0, host: "relay.example.test", print: "0123456789abcdef" }], keeps: false },
  ];
};
CASES.viewSame = (s, swap) => VIEW_STATES().every(st => {
  const { now, old } = viewPair(s, st, swap), trimmed = Object.assign({}, now);
  VIEW_NEW.forEach(k => { delete trimmed[k]; });
  return JSON.stringify(trimmed) === JSON.stringify(old) && Object.keys(now).filter(k => !(k in old)).sort().join() === VIEW_NEW.slice().sort().join();
});
/* The clock's rules: each observation by the larger of the wall's and the monotonic difference, never below zero; a clock read from the
   file (mono null) by the wall's alone, floored; no anchor, no time; a certificate this desk takes moves it forward to `issued`, never
   back, never another desk's; `last` follows the held certificate's end. */
CASES.clockRules = s => {
  const o = (c, wall, mono) => s.signinClockObserve(c, wall, mono, null, DESK_KEY).desk;
  const c = { desk: NOW, wall: 1e12, mono: 500, last: 0 }, file = Object.assign({}, c, { mono: null });
  const anchor = (clock, held) => s.signinClockObserve(clock, 5, 1, held, DESK_KEY);
  return o(c, 1e12 + 5000, 500 + 3000) === NOW + 5000 && o(c, 1e12 + 2000, 500 + 9000) === NOW + 9000
    && o(c, 1e12 - YEAR_MS, 500 + 10000) === NOW + 10000 && o(c, 1e12 - 5, 495) === NOW
    && o(file, 1e12 + 3 * HOUR_MS, 77) === NOW + 3 * HOUR_MS && o(file, 1e12 - YEAR_MS, 77) === NOW
    && o(null, NOW + YEAR_MS, 1) === 0 && o({ desk: 0, wall: 1, mono: 1, last: 0 }, NOW, 2) === 0
    && anchor(null, heldOf()).desk === NOW && anchor({ desk: NOW + 86400000, wall: 5, mono: 1, last: 0, issued: NOW }, heldOf()).desk === NOW + 86400000
    && anchor({ desk: NOW - 86400000, wall: 5, mono: 1, last: 0, issued: NOW - 30 * 86400000 }, heldOf()).desk === NOW
    && anchor({ desk: NOW + 86400000, wall: 5, mono: 1, last: 0, issued: NOW - 86400000 }, heldOf()).desk === NOW && anchor(null, heldOf()).issued === NOW
    && anchor(null, heldOf({ cert: cert({ desk: OTHER_DESK_KEY }) })).desk === 0
    && anchor(null, heldOf()).last === cert().until && anchor({ desk: NOW, wall: 5, mono: 1, last: 99 }, heldOf({ cert: null })).last === 99;
};
/* THE CLOCK BESIDE THE FILE'S MARK: a desk of today reads a file this one wrote exactly as the file without the clock, its own mark
   and the seat whole; the clock is the two fields beside it; with no anchor or nothing to sign, the text as it was. */
CASES.clockApart = s => {
  const marked = s.signinFileMarkText(s.signinFileText({ held: heldOf({ seated: true, doors: [] }) }), signWith(signKey));
  const text = s.signinClockText(marked, { desk: NOW + 86400000, wall: NOW, mono: 5, last: cert().until }, signWith(signKey));
  const today = t => s.signinFileHeld(s.signinFileRead(t), t, DESK_KEY);
  const d = JSON.parse(text), bare = JSON.parse(text);
  delete bare.clock; delete bare.clockMark;
  return text !== marked && JSON.stringify(today(text)) === JSON.stringify(today(marked)) && !!today(text).held.cert && today(text).held.code === CODE
    && d.mark === JSON.parse(marked).mark && JSON.stringify(bare) === JSON.stringify(JSON.parse(marked)) && Object.keys(d.clock).sort().join() === "desk,issued,last,wall"
    && s.signinClockText(marked, { desk: 0, wall: NOW, last: 0 }, signWith(signKey)) === marked
    && s.signinClockText(marked, { desk: NOW, wall: NOW, last: 0 }, () => "") === marked;
};
/* The clock's wiring, sliced, with the shell around it stood in: the file's text in st.file, the system clock st.wall, the monotonic
   st.mono, the network st.online; writes, ticks and tells counted. A second clockWire over the same st is the next run. */
const CLOCK_DECLS = ["const SIGNIN_TICK_MS =", "function signinMono(", "function signinOnlineNow(", "function signinClockNow(", "function signinTick(", "function signinSave("];
function clockWire(s, st, swap) {
  let text = CLOCK_DECLS.map(d => decl(MAIN, d)).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  /* B-2b: the run's first clock (signinClockStart), and the stop it arms (signinStopArm, counted in st.arms; its soon in st.soons). The
     desk's key is st.key where a leg sets it, null for no key yet. */
  const names = ["signinState", "branchIdentity", "Date", "performance", "path", "app", "fs", "SIGNIN_FILE", "SIGNIN_FILE_MAX", "signinClockRead",
    "signinClockObserve", "signinClockText", "setInterval", "net", "tellSignin", "writeReplacing", "signinFileMarkText", "signinFileText", "signinSign", "console",
    "signinClockStart", "setTimeout", "signinStopArm"];
  const vals = [() => ({ held: st.held }), () => (st.key === null ? null : { key: st.key || DESK_KEY }), { now: () => st.wall }, { now: () => st.mono }, path, { getPath: () => "/ud" },
    { statSync: () => { if (st.file === null) throw new Error("ENOENT"); return { size: st.file.length }; }, readFileSync: () => st.file },
    "signin.json", s.SIGNIN_FILE_MAX, s.signinClockRead, s.signinClockObserve, s.signinClockText,
    (fn, ms) => { st.ticks.push({ fn, ms }); return { unref() { st.unrefs++; } }; }, { isOnline: () => st.online }, () => { st.tells++; },
    (f, t) => { st.file = t; st.writes++; }, s.signinFileMarkText, s.signinFileText, signWith(signKey), { error: () => {}, log: () => {} },
    s.signinClockStart, (fn, ms) => { st.soons.push({ fn, ms }); return { unref() {} }; }, () => { st.arms++; }];
  return new Function(...names, "let signinClock = null, signinClockKept = 0, signinOnline = null, signinTicker = null, signinClockKey = \"\", signinStopFor = \"\";\n" + text
    + "\nreturn { signinClockNow, signinTick, signinSave, SIGNIN_TICK_MS, SIGNIN_CLOCK_KEEP_MS };")(...vals);
}
const clockStand = over => Object.assign({ held: null, file: null, wall: NOW, mono: 1000, online: true, ticks: [], unrefs: 0, tells: 0, writes: 0, soons: [], arms: 0 }, over);
const clockRun = (st, ms) => { st.wall += ms; st.mono += ms; };
/* The system clock five minutes slow, and ten, at a fresh sign-in: the desk works from the certificate's issue, and runs on. Today's
   calm lapse reads the certificate as lapsed (issued in the future) all the while. */
CASES.clockSlow = (s, swap) => [5 * 60000 + 30000, 10 * 60000].every(slow => {
  /* The sign-in in this run: no certificate at the first ask, then the service's (B-2b, as clockFast). */
  const st = clockStand({ held: null, wall: NOW - slow }), w = clockWire(s, st, swap);
  w.signinClockNow();
  st.held = heldOf();
  const first = w.signinClockNow().desk, lapsed = s.signinLapsed(st.held, st.wall);
  clockRun(st, HOUR_MS);
  const later = w.signinClockNow().desk;
  return first === NOW && later === NOW + HOUR_MS && s.signinWorks(st.held, DESK_KEY, first) === true && s.signinWorks(st.held, DESK_KEY, later) === true
    && lapsed === true;
});
/* A year fast at the sign-in: the desk works and runs on, and the next run carries on from the kept clock. Today's calm lapse reads
   the certificate as ended. */
CASES.clockFast = (s, swap) => {
  /* The sign-in in this run: no certificate at the first ask, then the one the service gave (B-2b: a run that starts holding one with
     no clock kept restarts at the later of its issue and the system clock, clockMark). */
  const st = clockStand({ held: null, wall: NOW + YEAR_MS }), w = clockWire(s, st, swap);
  const none = w.signinClockNow().desk === 0;
  st.held = heldOf();
  const first = none && w.signinClockNow().desk === NOW && s.signinLapsed(st.held, st.wall) === true;
  clockRun(st, HOUR_MS);
  w.signinSave();
  const ran = w.signinClockNow().desk === NOW + HOUR_MS;
  st.wall += HOUR_MS; st.mono = 5;
  const next = clockWire(s, st, swap).signinClockNow().desk;
  return first && ran && next === NOW + 2 * HOUR_MS && s.signinWorks(st.held, DESK_KEY, next) === true;
};
/* Set back a year between two runs: the desk's time stands while it was closed and never more, and it stops at the certificate's end
   after thirty days of running. Today's calm lapse reads the set-back clock's certificate as issued in the future, lapsed. */
CASES.clockBackClosed = (s, swap) => {
  const st = clockStand({ held: heldOf(), wall: NOW }), w = clockWire(s, st, swap), until = cert().until;
  w.signinClockNow();
  clockRun(st, 2 * 86400000);
  w.signinSave();
  const kept = w.signinClockNow().desk === NOW + 2 * 86400000;
  st.wall = NOW + 3 * 86400000 - YEAR_MS; st.mono = 7;
  const w2 = clockWire(s, st, swap);
  const stood = w2.signinClockNow().desk === NOW + 2 * 86400000 && s.signinLapsed(st.held, st.wall) === true;
  clockRun(st, 28 * 86400000 - 1);
  const still = s.signinWorks(st.held, DESK_KEY, w2.signinClockNow().desk) === true;
  clockRun(st, 1);
  const end = w2.signinClockNow().desk;
  return kept && stood && still && end === until && s.signinWorks(st.held, DESK_KEY, end) === false;
};
/* Set back a year while running: the monotonic clock carries the desk on; the next run counts nothing while the system clock stays
   behind where the desk's reckoning left it, and the time closed once it is put right. */
CASES.clockBackRunning = (s, swap) => {
  const st = clockStand({ held: heldOf(), wall: NOW, mono: 1000 }), w = clockWire(s, st, swap);
  w.signinClockNow();
  st.wall = NOW - YEAR_MS; st.mono += 10000;
  const a = w.signinClockNow().desk === NOW + 10000;
  clockRun(st, 86400000);
  const b = w.signinClockNow().desk === NOW + 10000 + 86400000;
  w.signinSave();
  st.wall += HOUR_MS; st.mono = 3;
  const w2 = clockWire(s, st, swap), behind = w2.signinClockNow().desk === NOW + 10000 + 86400000;
  w2.signinSave();
  st.wall = NOW + 10000 + 86400000 + 2 * HOUR_MS; st.mono = 4;
  return a && b && behind && clockWire(s, st, swap).signinClockNow().desk === NOW + 10000 + 86400000 + 2 * HOUR_MS;
};
/* An old answer replayed: its certificate, genuine and older, rewinds nothing, in the run or the next, and stands ended on the desk's
   clock; today's calm lapse on a clock set back to its days reads it as held. */
CASES.clockReplay = (s, swap) => {
  const renewed = cert({ issued: NOW + 35 * 86400000, until: NOW + 65 * 86400000 }), old = heldOf();
  const st = clockStand({ held: heldOf({ cert: renewed }), wall: NOW + 35 * 86400000 }), w = clockWire(s, st, swap);
  const anchored = w.signinClockNow().desk === NOW + 35 * 86400000;
  clockRun(st, 5 * 86400000);
  st.held = old;
  const after = w.signinClockNow().desk;
  w.signinSave();
  st.wall = NOW + 86400000; st.mono = 9;
  const next = clockWire(s, st, swap).signinClockNow().desk;
  return anchored && after === NOW + 40 * 86400000 && next === after && s.signinWorks(old, DESK_KEY, after) === false && s.signinLapsed(old, NOW + 86400000) === false;
};
/* A clock missing, edited or marked by another key restarts at the later of the held certificate's `issued` and the system clock (B-2b;
   B-2a restarted at the issue alone), and the seat read from the file is the same as with the clock whole; another desk key reads none. */
CASES.clockMark = (s, swap) => {
  const st = clockStand({ held: heldOf({ seated: true }), wall: NOW }), w = clockWire(s, st, swap);
  w.signinClockNow();
  clockRun(st, 3 * 86400000);
  w.signinSave();
  const text = st.file, seat = t => JSON.stringify(s.signinFileHeld(s.signinFileRead(t), t, DESK_KEY));
  const restart = (t, wall) => clockWire(s, clockStand({ held: st.held, file: t, wall: wall === undefined ? st.wall : wall, mono: 1 }), swap).signinClockNow().desk;
  const edits = [d => { delete d.clockMark; }, d => { delete d.clock; }, d => { d.clock.desk -= 86400000; }, d => { d.clockMark = "0".repeat(128); },
    d => { d.clock.more = 1; }, d => { d.clock.desk = "1"; }];
  const broken = edits.every(e => { const d = JSON.parse(text); e(d); const t = JSON.stringify(d, null, 1) + "\n";
    return restart(t, NOW + 86400000) === NOW + 86400000 && restart(t, NOW - YEAR_MS) === NOW && seat(t) === seat(text); });
  return restart(text) === NOW + 3 * 86400000 && restart(text, NOW + 86400000) === NOW + 3 * 86400000 && broken
    && !!s.signinClockRead(text, DESK_KEY) && s.signinClockRead(text, OTHER_DESK_KEY) === null;
};
/* The tick: armed once by the first ask, every SIGNIN_TICK_MS and unref'd; it keeps the clock in the file at its first turn and then
   hourly, writes nothing while no certificate has anchored the clock, and tells the page once each time the network comes or goes. */
CASES.clockTick = (s, swap) => {
  const st = clockStand({ held: heldOf() }), w = clockWire(s, st, swap);
  w.signinClockNow(); w.signinClockNow();
  const armed = st.ticks.length === 1 && st.ticks[0].ms === 10000 && w.SIGNIN_TICK_MS === 10000 && w.SIGNIN_CLOCK_KEEP_MS === HOUR_MS && st.unrefs === 1;
  const tick = () => st.ticks[0].fn();
  tick();
  const first = st.writes === 1 && !!s.signinClockRead(st.file, DESK_KEY);
  clockRun(st, 10000); tick();
  const quiet = st.writes === 1 && st.tells === 0;
  clockRun(st, HOUR_MS); tick();
  const hourly = st.writes === 2 && s.signinClockRead(st.file, DESK_KEY).desk === NOW + HOUR_MS + 10000;
  st.online = false; tick(); tick();
  const off = st.tells === 1;
  st.online = true; tick();
  const bare = clockStand(), wb = clockWire(s, bare, swap);
  wb.signinClockNow(); bare.ticks[0].fn(); clockRun(bare, 2 * HOUR_MS); bare.ticks[0].fn();
  return armed && first && quiet && hourly && off && st.tells === 2 && bare.writes === 0 && bare.file === null;
};
/* The page keeps the five fields, typed and bounded. deskWorks is the one read of works outside signinRead and deskDoorState reads
   the remaining four: no other page module names works or stoppedAt, and the rest of signin.js names none of the five on a view. */
CASES.readFields = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const r = o => JSON.stringify((v => [v.works, v.now, v.until, v.stoppedAt, v.online])(pg.signinRead(o)));
  const is = (...a) => JSON.stringify(a);
  const sliceFn = (sig) => { const a = PAGE.indexOf(sig), b = a < 0 ? -1 : PAGE.indexOf("\n}\n", a); return a < 0 || b < 0 ? null : [a, b + 2, PAGE.slice(a, b + 2)]; };
  const rd = sliceFn("function signinRead(v){"), wk = sliceFn("function deskWorks(v){"), sm = sliceFn("function deskDoorState(v){");
  if (!rd || !wk || !sm) return false;
  const cuts = [rd, wk, sm].sort((a, b) => a[0] - b[0]);
  let outside = "", pos = 0;
  for (const [a, b] of cuts) { outside += PAGE.slice(pos, a); pos = b; }
  outside += PAGE.slice(pos);
  const worksReads = /\bsigninV\.works\b/.test(wk[2]) && /\bv\.works\b/.test(wk[2]);
  const seamReads = /\bdeskWorks\(v\)/.test(sm[2]) && !/\bv\.works\b/.test(sm[2]) && /\bv\.now\b/.test(sm[2]) && /\bv\.until\b/.test(sm[2])
    && /\bv\.stoppedAt\b/.test(sm[2]) && /\bv\.online\b/.test(sm[2]);
  const quiet = worksReads && seamReads && fs.readdirSync(path.join(ROOT, "src", "modules")).filter(n => n.endsWith(".js") && n !== "signin.js")
    .every(n => !/\.(?:works|stoppedAt)\b/.test(fs.readFileSync(path.join(ROOT, "src", "modules", n), "utf8")))
    && !/\b(?:v|o|s|sv|view|signinV)\.(?:works|now|until|stoppedAt|online)\b/.test(outside);
  return r({ works: true, now: NOW, until: NOW + 1, stoppedAt: NOW - 1, online: false }) === is(true, NOW, NOW + 1, NOW - 1, false)
    && r(null) === is(false, 0, 0, 0, true) && r({ works: "yes", now: "1", until: -5, stoppedAt: 1.5, online: 0 }) === is(false, 0, 0, 0, true)
    && r({ now: 9e15, until: Infinity, stoppedAt: NaN }) === is(false, 0, 0, 0, true) && quiet;
};
/* ---- THE DESK KEEPS ITS CERTIFICATE TO ITS END, KNOWS WHAT ITS SEAT IS, AND STOPS AT THE END (B-2b) ----------------------------
   The answer's seat and trials read and kept (holding, trials); a certificate kept through an answer of none, `ended` stamped on the
   desk's clock; the stop at the certificate's end, told to the page, on any start; the clock's two mends; the quick replies refused
   while the desk does not work; no provider, no work. Every answer handed here that the service would not give is stray. */
const B2B_LEAD = "Lead Name";
/* A recorded case as the service sends it (ds23's recordedAnswer, which is declared after the legs run). */
const b2bRecorded = c => ({ status: c.status, bytes: Buffer.from(JSON.stringify(c.body)) });
const okAnswer = (extra, withCert) => strayAnswer(Object.assign({ ok: true, code: CODE, certificate: withCert === false ? null : cert(), doors: [] }, extra));
const readOk = (s, extra, withCert) => s.signinAnswer(okAnswer(extra, withCert), DESK_KEY, true);
/* The seat and trials read from an answer: the five words or no seat; a team's lead as plain text of at most SIGNIN_LEAD_MAX; each
   trial an end; an answer without them read exactly as before. */
CASES.answerWords = s => {
  const ch = n => String.fromCharCode(n);
  const lead = v => { const r = readOk(s, { seat: { on: "team", ends: NOW, lead: v } }); return r.holding ? r.holding.lead : undefined; };
  /* The record's certificates trace to its own test root, so its answers are read by the section with that root (as ds23 reads them). */
  const rooted = ANSWERS && /^[0-9a-f]{64}$/.test(String(ANSWERS.root)) ? load(null, undefined, undefined, NEEDS.split("const NOTE_ROOT = \"" + TEST_ROOT + "\";").join("const NOTE_ROOT = \"" + ANSWERS.root + "\";")) : s;
  const record = rooted !== s && ANSWER_CASES.filter(c => c.route === "signin/desk" && c.status === 200 && (c.body.seat || c.body.trials)).every(c => {
    const r = rooted.signinAnswer(b2bRecorded(c), c.body.certificate ? c.body.certificate.desk : DESK_KEY, true);
    return JSON.stringify(r.holding || null) === JSON.stringify(c.body.seat || null) && JSON.stringify(r.trials || null) === JSON.stringify(c.body.trials || null);
  });
  const plain = readOk(s, {}), plainNone = readOk(s, {}, false);
  return record && SIGNIN_OK_WORDS.every(on => readOk(s, { seat: { on, ends: NOW } }).holding.on === on)
    && readOk(s, { seat: { on: "free", ends: NOW } }).holding === undefined && readOk(s, { seat: ["trial"] }).holding === undefined
    && readOk(s, { seat: { on: "trial", ends: "soon" } }).holding.ends === 0 && readOk(s, { seat: { on: "own", ends: NOW, lead: B2B_LEAD } }).holding.lead === undefined
    && lead(B2B_LEAD) === B2B_LEAD && lead("  Ann O'Neil & Co  ") === "Ann O'Neil & Co" && lead("<b>Lead</b>") === undefined && lead("Lead" + ch(7)) === undefined
    && lead("Lead" + ch(0x202e) + "x") === undefined && lead("L".repeat(s.SIGNIN_LEAD_MAX)) === "L".repeat(s.SIGNIN_LEAD_MAX)
    && lead("L".repeat(s.SIGNIN_LEAD_MAX + 1)) === undefined && lead(42) === undefined && lead("   ") === undefined
    && JSON.stringify(readOk(s, { trials: { desk: -1, studio: NOW, other: NOW } }).trials) === JSON.stringify({ studio: NOW })
    && readOk(s, { trials: {} }).trials === undefined && readOk(s, { trials: [NOW] }).trials === undefined
    && readOk(s, { seat: { on: "trial", ends: NOW }, trials: { desk: NOW } }, false).trials.desk === NOW
    && !("holding" in plain) && !("trials" in plain) && !("holding" in plainNone) && !("trials" in plainNone) && plain.ok === true && !!plain.cert;
};
const SIGNIN_OK_WORDS = ["trial", "studio-trial", "own", "team", "org"];
/* The words kept: the seat goes with the certificate it came with and stays with it through an answer of none; the trials stay until an
   answer names others; signin.json keeps all three and reads them typed; the same account signed in again keeps them, another drops them. */
CASES.wordsKept = async (s, swap) => {
  const seat = { on: "team", ends: NOW + 9 * DAY_MS, lead: B2B_LEAD }, trials = { desk: NOW - DAY_MS };
  const a = s.signinSettle(heldOf({ cert: null }), readOk(s, { seat, trials }), NOW);
  const b = s.signinSettle(a, readOk(s, {}, false), NOW, NOW + 5);
  const c = s.signinSettle(b, readOk(s, { trials: { desk: NOW - DAY_MS, studio: NOW + DAY_MS } }), NOW);
  const back = h => s.signinFileRead(s.signinFileText({ held: h })).held;
  const odd = back(Object.assign({}, b, { holding: { on: "team", ends: 1, lead: "<i>x</i>" }, trials: { desk: "x" } }));
  const loose = back(Object.assign({}, a, { cert: null, holding: seat }));
  const view = s.signinViewOf(b, viewFacts({}));
  /* The same account signed in again and answered none keeps all three; another account's sign-in starts with what its answer names. */
  const press = async (sub, ans) => { const st = switchStand(s, { held: Object.assign({}, b, { sub: "sealed:s-1" }) }); st.sub = sub; st.answer = ans; await loadSwitch(st, swap).press(); await tick(5); return st.store.held; };
  const same = await press("s-1", { ok: true, code: CODE, cert: null, doors: [] }), other = await press("s-2", { ok: true, code: CODE, cert: null, doors: [], trials: { studio: NOW } });
  return JSON.stringify(a.holding) === JSON.stringify(seat) && JSON.stringify(a.trials) === JSON.stringify(trials)
    && b.cert === a.cert && JSON.stringify(b.holding) === JSON.stringify(seat) && JSON.stringify(b.trials) === JSON.stringify(trials)
    && c.holding === undefined && c.trials.studio === NOW + DAY_MS
    && JSON.stringify(back(b).holding) === JSON.stringify(seat) && JSON.stringify(back(b).trials) === JSON.stringify(trials) && back(b).ended === NOW + 5
    && odd.holding.lead === undefined && odd.trials === undefined && loose.holding === undefined && JSON.stringify(loose.trials) === JSON.stringify(trials)
    && JSON.stringify(view.holding) === JSON.stringify(seat) && JSON.stringify(view.trials) === JSON.stringify(trials) && view.holding !== b.holding
    && s.signinViewOf(b, viewFacts({ offered: [] })).holding === null
    && !!same && same.cert === b.cert && same.ended === NOW + 5 && JSON.stringify(same.holding) === JSON.stringify(seat)
    && !!other && other.cert === null && other.holding === undefined && JSON.stringify(other.trials) === JSON.stringify({ studio: NOW }) && other.ended === undefined;
};
/* signinFileRead as it stands at engine main 158d1826, which B-2a left unchanged: today's desk and B-2a's read a file of this desk with
   its seat, trials and `ended` exactly as the same file without them. */
const ORACLE_FILE_READ = `function signinFileRead(text, packed) {
  let d = null;
  try { d = JSON.parse(String(text)); } catch { d = null; }
  const out = { held: null };
  if (!d || typeof d !== "object" || +d.format !== 2) return out;
  const h = d.held, num = v => Number.isFinite(v) ? v : 0;
  if (h && typeof h === "object" && signinKnown(h.provider) && /^[0-9a-f]{64}$/.test(String(h.seed)))
    out.held = { provider: String(h.provider), refresh: typeof h.refresh === "string" ? h.refresh : "", sub: typeof h.sub === "string" ? h.sub : "",
      seed: String(h.seed), code: SIGNIN_CODE.test(String(h.code)) ? String(h.code) : "",
      cert: h.cert && typeof h.cert === "object" && signinCertOk(h.cert, h.cert.desk) ? h.cert : null, /* plant:file-cert */
      at: num(h.at), checked: num(h.checked), reached: h.reached !== false, said: typeof h.said === "string" ? h.said : "", ask: h.ask === true,
      askLead: h.askLead === true, /* plant:file-ask-lead */
      doors: [], doorsSig: "", revoked: null, managed: h.managed === true, cause: h.cause === "own-licence" || h.cause === "assigned" ? h.cause : "", storeOffer: h.storeOffer === true };
  /* The list is beside \`held\`, and the held seat judges by it. */
  out.revoked = signinRevokedOk(d.revoked) ? d.revoked : null; /* plant:revoked-file */
  if (out.held) out.held.revoked = out.revoked;
  if (out.held && h.access === true) out.held.access = true; /* the service's answer "access-token", remembered (section 11.11) */
  if (out.held && (h.seated === true || out.held.cert)) out.held.seated = true; /* plant:seated-file */
  if (out.held && h.org && typeof h.org === "object") out.held.org = { tid: SIGNIN_TENANT.test(String(h.org.tid)) ? String(h.org.tid).toLowerCase() : "", /* plant:org-file */
    hd: typeof h.org.hd === "string" && h.org.hd.length <= 253 ? h.org.hd.toLowerCase() : "" };
  if (out.held && out.held.cert) {
    const doors = signinDoorsOk(h.doors, packed), sig = typeof h.doorsSig === "string" ? h.doorsSig : "";
    if (signinDoorsSigned(doors, sig, out.held.cert)) Object.assign(out.held, { doors: doors, doorsSig: sig }); /* plant:file-doors-signed */
  }
  /* The desk key whose sign out the service has not taken yet: asked again at the renewal's next turn (signinOutAgain). */
  if (/^[0-9a-f]{64}$/.test(String(d.out))) out.out = String(d.out); /* plant:out-kept */
  /* A sign-in the service refused for a managed tenant keeps no seat, but the desk remembers it offers nothing to buy (signinTake). */
  if (d.licenceManaged === true) out.licenceManaged = true;
  return out;
}`;
CASES.olderReaders = s => {
  const old = load([decl(MAIN, "function signinFileRead("), ORACLE_FILE_READ]);
  const held = heldOf({ seated: true, doors: [], ended: NOW + 7, holding: { on: "team", ends: NOW + DAY_MS, lead: B2B_LEAD }, trials: { desk: NOW, studio: NOW + 1 } });
  const write = h => s.signinClockText(s.signinFileMarkText(s.signinFileText({ held: h }), signWith(signKey)), { desk: NOW + 1, wall: NOW, last: 0, issued: NOW }, signWith(signKey));
  const bare = Object.assign({}, held); delete bare.ended; delete bare.holding; delete bare.trials;
  const take = (r, t) => JSON.stringify(r.signinFileHeld(r.signinFileRead(t), t, DESK_KEY));
  const now = s.signinFileRead(write(held)).held;
  return old.signinFileRead !== s.signinFileRead && take(old, write(held)) === take(old, write(bare)) && JSON.parse(take(old, write(held))).held.cert !== null
    && now.ended === NOW + 7 && now.holding.lead === B2B_LEAD && now.trials.studio === NOW + 1;
};
/* AN ANSWER OF NONE KEEPS THE CERTIFICATE TO ITS END: "none", "waiting" and an ask with no trial of one's own each keep it, `ended` the
   desk's time at the first, kept through a second, a refusal and the file, cleared by a seating answer; a renewal stamps the desk's clock,
   never the system's; the view works until the certificate's end on the desk's clock and then stops on that end, never a later day. */
CASES.keepNone = async (s, swap) => {
  const c = cert(), held = heldOf({ seated: true, doors: [] }), D = NOW + 3 * DAY_MS;
  const of = name => s.signinAnswer(b2bRecorded(ANSWER_CASES.find(x => x.case === name)), DESK_KEY, true);
  const each = ["none", "waiting", "ask-lead"].every(n => { const h = s.signinSettle(held, of(n), NOW + 9, D); return h.cert === held.cert && h.ended === D && h.doors.length === 0 && h.doorsSig === ""; });
  const first = s.signinSettle(held, of("none"), NOW, D), second = s.signinSettle(first, of("waiting"), NOW, D + DAY_MS);
  const refused = s.signinSettle(second, { ok: false, reason: "desks" }, NOW), away = s.signinSettle(second, { ok: false, reason: "unreached" }, NOW);
  const seated = s.signinSettle(second, readOk(s, {}), NOW, D + 2 * DAY_MS);
  const filed = s.signinFileRead(s.signinFileText({ held: second })).held;
  /* The renewal stamps the desk's clock as signinIo hands it, not the system clock it is given. */
  const io = Object.assign(renewIo(answer({ id_token: jwt(msClaims(undefined)), refresh_token: "rt-2" }), b2bRecorded(ANSWER_CASES.find(x => x.case === "none"))), { deskNow: () => D + 77 });
  const renewed = await s.signinRenewHeld(io, MS, DESK_KEY, held, () => NOW);
  const v = (h, at) => s.signinViewOf(h, viewFacts({ deskNow: at }));
  const running = v(first, D), atEnd = v(first, c.until), after = v(first, c.until + 5 * DAY_MS);
  /* B-2a's case: the certificate dropped by an answer of none, its end kept as the last; the view never names that future end. */
  const dropped = s.signinViewOf(heldOf({ seated: true, cert: null }), viewFacts({ deskNow: D, last: c.until }));
  return each && first.ended === D && second.ended === D && refused.ended === D && refused.cert === held.cert && away.ended === D
    && seated.ended === undefined && seated.cert !== c && !!seated.cert && filed.ended === D && filed.cert !== null
    && renewed.held.cert === held.cert && renewed.held.ended === D + 77 && renewed.said === "renewed"
    && running.works === true && running.ended === D && running.stoppedAt === 0 && running.seat === "none" && running.until === c.until
    && atEnd.works === false && atEnd.stoppedAt === c.until && after.works === false && after.stoppedAt === c.until
    && dropped.works === false && dropped.stoppedAt === D && s.signinWorks(Object.assign({}, first, { revoked: revokedList(1, [SERVICE_PUB]) }), DESK_KEY, D) === false;
};
/* EVERY JUDGEMENT THAT READ NO CERTIFICATE AS THE SERVICE'S NONE KEEPS ITS MEANING: the view before `works` is the view of the same seat
   with the certificate dropped, in each state; no knock at a team's door and no request written there. */
CASES.saidMeaning = (s, swap) => {
  const variants = [heldOf({ seated: true, ended: NOW + 1, doors: [] }), heldOf({ seated: true, ended: NOW + 1, cert: cert({ deskOnly: true }), askLead: true, doors: [] }),
    heldOf({ seated: true, ended: NOW + 1, said: "waiting", code: "ABCDEFGHJKMNPQRS", doors: [] }), heldOf({ ended: NOW + 1, managed: true, cause: "assigned", doors: [] })];
  const head = v => { const o = Object.assign({}, v); VIEW_NEW.forEach(k => { delete o[k]; }); return JSON.stringify(o); };
  const same = variants.every(h => { const was = Object.assign({}, h, { cert: null, doors: [], doorsSig: "" }); delete was.ended;
    return head(s.signinViewOf(h, viewFacts({}))) === head(s.signinViewOf(was, viewFacts({}))) && s.signinViewOf(h, viewFacts({})).works === true; });
  const ended = heldOf({ ended: NOW + 1 });
  const mirror = path.join("/relay", RT);
  const knock = loadDoor(s, doorStand(doorJoin(), ended), swap).signinDoorInvite(TEAM, RT), standing = loadDoor(s, doorStand(doorJoin()), swap).signinDoorInvite(TEAM, RT);
  const st = doorStand(doorJoin(), ended), kept = loadDoor(s, st, swap).signinDoorKept(TEAM, mirror, DOOR_ID);
  return same && s.signinSaidOf(ended).cert === null && s.signinSaidOf(heldOf()).cert !== null && knock === null && !!standing && !!standing.door
    && kept === false && st.writes.length === 0;
};
/* THE STOP, in real time: a certificate taken in this run that ends three seconds on leaves the pushed view not working after four, the
   page told once, on a start that names no harness rule at all. Then, on stand-in time: past its end the desk asks one renewal for that
   certificate, never a second, and one more for the next certificate past its end; while it works it asks none. */
const STOP_DECLS = ["const SIGNIN_STOP_MAX_MS =", "function signinStopArm(", "function signinResumeHear(", "function signinWorksNow("];
function stopWire(s, st, swap) {
  let text = CLOCK_DECLS.concat(STOP_DECLS).map(d => decl(MAIN, d)).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the stop's wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const names = ["signinState", "branchIdentity", "Date", "performance", "path", "app", "fs", "SIGNIN_FILE", "SIGNIN_FILE_MAX", "signinClockRead",
    "signinClockObserve", "signinClockText", "setInterval", "net", "tellSignin", "writeReplacing", "signinFileMarkText", "signinFileText", "signinSign", "console",
    "signinClockStart", "setTimeout", "clearTimeout", "signinWorksOf", "signinOffered", "signinRenewNow", "require"];
  const vals = [() => ({ held: st.held }), () => ({ key: DESK_KEY }), st.clock || Date, st.mono || performance, path, { getPath: () => "/ud", isReady: () => st.ready === true },
    { statSync: () => { throw new Error("ENOENT"); }, readFileSync: () => "" }, "signin.json", s.SIGNIN_FILE_MAX, s.signinClockRead, s.signinClockObserve, s.signinClockText,
    () => ({ unref() {} }), { isOnline: () => true }, () => { st.told.push({ at: Date.now(), view: st.view() }); },
    () => {}, s.signinFileMarkText, s.signinFileText, signWith(signKey), { error: () => {}, log: () => {} },
    s.signinClockStart, st.setTimeout || setTimeout, st.clearTimeout || clearTimeout, s.signinWorksOf, () => st.offered || [MS],
    () => { st.renews++; return Promise.resolve(""); }, m => ({ powerMonitor: { on: (ev, fn) => { st.resumes.push(ev); st.onResume = fn; } } })];
  const w = new Function(...names, "let signinClock = null, signinClockKept = 0, signinOnline = null, signinTicker = null, signinClockKey = \"\";\n"
    + "let signinStopTimer = null, signinStopFor = \"\", signinWorksSeen = null, signinEndAsked = \"\", signinResumeHeard = false, signinRenewing = null;\n" + text
    + "\nreturn { signinClockNow, signinTick, signinStopArm, signinWorksNow, timer: () => signinStopTimer };")(...vals);
  st.view = () => s.signinViewOf(st.held, viewFacts({ deskNow: w.signinClockNow().desk, offered: (st.offered || [MS]).map(p => p.id) }));
  return w;
}
const stopStand = over => Object.assign({ held: null, told: [], renews: 0, resumes: [], ready: true }, over);
CASES.stopTimer = async (s, swap) => {
  const st = stopStand(), w = stopWire(s, st, swap), t0 = Date.now();
  w.signinClockNow();
  st.held = heldOf({ seated: true, cert: cert({ issued: t0, until: t0 + 3000 }) });
  const before = w.signinClockNow().desk === t0 && w.signinWorksNow() === true;
  await tick(4000);
  const last = st.told[st.told.length - 1], late = last ? last.at - t0 : -1;
  if (w.timer()) clearTimeout(w.timer());
  /* Stand-in time: past the end, one renewal per certificate, at each arm. */
  let at = NOW + 40 * DAY_MS, mono = 1;
  const pst = stopStand({ held: heldOf(), clock: { now: () => at }, mono: { now: () => mono }, setTimeout: () => ({ unref() {} }), clearTimeout: () => {} });
  const pw = stopWire(s, pst, swap);
  pw.signinClockNow(); pw.signinStopArm(); pw.signinStopArm(); pw.signinTick();
  const once = pst.renews === 1;
  /* The next certificate, issued later, sets the desk's time to its issue; past its own end it is asked for once more. */
  pst.held = heldOf({ cert: cert({ issued: NOW + 10 * DAY_MS, until: NOW + 20 * DAY_MS }) });
  pw.signinStopArm();
  const runs = pst.renews === 1;
  mono += 11 * DAY_MS;
  pw.signinStopArm(); pw.signinStopArm();
  const again = runs && pst.renews === 2;
  const wst = stopStand({ held: heldOf(), clock: { now: () => NOW }, mono: { now: () => 1 }, setTimeout: () => ({ unref() {} }), clearTimeout: () => {} }), ww = stopWire(s, wst, swap);
  ww.signinClockNow(); ww.signinStopArm();
  return before && st.told.length === 1 && !!last && last.view.works === false && last.view.stoppedAt === t0 + 3000 && late >= 2900 && late < 4000
    && once && again && wst.renews === 0 && !/harnessLaunch|signinLabHeld/.test(STOP_DECLS.map(d => decl(MAIN, d)).join("\n"));
};
/* The stop's wiring: the tick arms it, a certificate newly held arms it once after the turn, a resume arms it, heard once the app is
   ready and only then; a timer is never armed further than SIGNIN_STOP_MAX_MS, nor while the desk does not work. */
CASES.stopWired = (s, swap) => {
  /* A plant goes where its line is: the clock's wiring, or the stop's alone. */
  const inClock = swap && CLOCK_DECLS.map(d => decl(MAIN, d)).join("\n").split(swap[0]).length === 2 ? swap : undefined;
  const st = clockStand({ held: null }), w = clockWire(s, st, inClock);
  w.signinClockNow(); w.signinClockNow();
  const quiet = st.soons.length === 0;
  st.held = heldOf();
  w.signinClockNow(); w.signinClockNow();
  const armed = st.soons.length === 1 && st.soons[0].ms === 0;
  st.held = heldOf({ cert: cert({ issued: NOW + 1 }) });
  w.signinClockNow();
  st.ticks[0].fn();
  const ticked = st.soons.length === 2 && st.arms === 1;
  const timers = [], rst = stopStand({ held: heldOf(), ready: false, clock: { now: () => NOW }, mono: { now: () => 1 },
    setTimeout: (fn, ms) => { timers.push(ms); return { unref() {} }; }, clearTimeout: () => {} }), rw = stopWire(s, rst, swap);
  rw.signinStopArm();
  const notYet = rst.resumes.length === 0;
  rst.ready = true;
  rw.signinStopArm(); rw.signinStopArm();
  const heard = rst.resumes.join() === "resume" && typeof rst.onResume === "function";
  const day = timers.filter(ms => ms > 0);
  const nst = stopStand({ held: heldOf(), offered: [], clock: { now: () => NOW }, mono: { now: () => 1 }, setTimeout: (fn, ms) => { timers.push(-ms); return { unref() {} }; }, clearTimeout: () => {} });
  stopWire(s, nst, swap).signinStopArm();
  return quiet && armed && ticked && notYet && heard && day.length >= 3 && day.every(ms => ms === DAY_MS)
    && !timers.some(ms => ms < 0) && nst.renews === 0;
};
/* THE CLOCK'S FIRST MEND: a forward jump while running, then corrected, leaves the desk's time ahead until the next certificate, issued
   later than any taken, sets it back to its issue; a replay, older, still moves nothing. */
CASES.clockLater = (s, swap) => {
  const st = clockStand({ held: null, wall: NOW }), w = clockWire(s, st, swap), a = heldOf(), b = heldOf({ cert: cert({ issued: NOW + HOUR_MS, until: NOW + 30 * DAY_MS }) });
  w.signinClockNow();
  st.held = a;
  const anchored = w.signinClockNow().desk === NOW;
  st.wall += YEAR_MS; st.mono += 10000;
  const jumped = w.signinClockNow().desk === NOW + YEAR_MS && s.signinWorks(a, DESK_KEY, NOW + YEAR_MS) === false;
  st.wall -= YEAR_MS; st.mono += 10000;
  const stood = w.signinClockNow().desk === NOW + YEAR_MS + 10000;
  st.held = b;
  const righted = w.signinClockNow().desk === NOW + HOUR_MS && s.signinWorks(b, DESK_KEY, NOW + HOUR_MS) === true;
  clockRun(st, 1000);
  st.held = a;
  const replay = w.signinClockNow().desk === NOW + HOUR_MS + 1000 && s.signinWorks(a, DESK_KEY, NOW + HOUR_MS + 1000) === true;
  return anchored && jumped && stood && righted && replay;
};
/* THE CLOCK'S SECOND MEND, AND ITS BOUND: with the record deleted before every start, a run restarts at the later of the certificate's
   issue and the system clock. An honest clock then ends the certificate at its own end, however many starts; a clock two days slow
   works on and stops two days late; a clock a year fast finds it ended at once (and asks one renewal: stopTimer); a clock set back before
   the issue, with the record deleted before each start, restarts each run at the issue, one span of running per run and never more
   within one (the bound that holds; the relay judges a team's content by its own clock). */
CASES.clockLost = (s, swap) => {
  const held = heldOf(), until = cert().until;
  const start = wall => clockWire(s, clockStand({ held, file: null, wall, mono: 1 }), swap).signinClockNow().desk;
  const honest = [];
  for (let d = 0; d <= 31; d++) honest.push(s.signinWorks(held, DESK_KEY, start(NOW + d * DAY_MS)));
  /* Two days slow: a fresh certificate's issue lies ahead of the clock, and the run starts at the issue; near the end the slow clock
     still reads two days short of it, so the desk runs on two days past the true end. */
  const slow = start(NOW - 2 * DAY_MS), slowLate = start(until - 1), slowEnd = start(until);
  const fast = start(NOW + YEAR_MS);
  const st = clockStand({ held, file: null, wall: NOW - YEAR_MS, mono: 1 }), w = clockWire(s, st, swap);
  const back = w.signinClockNow().desk;
  clockRun(st, 30 * DAY_MS);
  const inRun = w.signinClockNow().desk;
  return honest.slice(0, 30).every(Boolean) && honest.slice(30).every(x => x === false) && honest.length === 32
    && slow === NOW && s.signinWorks(held, DESK_KEY, slow) === true && s.signinWorks(held, DESK_KEY, slowLate) === true && s.signinWorks(held, DESK_KEY, slowEnd) === false
    && fast === NOW + YEAR_MS && s.signinWorks(held, DESK_KEY, fast) === false
    && back === NOW && inRun === until && s.signinWorks(held, DESK_KEY, inRun) === false && start(NOW - YEAR_MS) === NOW;
};
/* A file written by B-2a's clock (its bytes: desk, wall and last, marked by this desk's key) is no clock here, and the run restarts at the
   later of the issue and the system clock, the seat whole; the issue is under the mark, so one edited with the mark kept is no clock. */
CASES.clockB2a = (s, swap) => {
  const marked = s.signinFileMarkText(s.signinFileText({ held: heldOf({ seated: true, doors: [] }) }), signWith(signKey));
  const old = { desk: NOW + 5 * DAY_MS, wall: NOW + 5 * DAY_MS, last: cert().until };
  const d = JSON.parse(marked);
  d.clock = old; d.clockMark = signWith(signKey)(Buffer.from("etiuda-signin-clock\n" + [old.desk, old.wall, old.last].join("\n"), "utf8"));
  const b2a = JSON.stringify(d, null, 1) + "\n";
  const run = (t, wall) => clockWire(s, clockStand({ held: heldOf({ seated: true }), file: t, wall, mono: 1 }), swap).signinClockNow().desk;
  const seat = t => JSON.stringify(s.signinFileHeld(s.signinFileRead(t), t, DESK_KEY));
  const mine = s.signinClockText(marked, { desk: NOW + 5 * DAY_MS, wall: NOW + 5 * DAY_MS, last: 0, issued: NOW }, signWith(signKey));
  const edited = JSON.parse(mine); edited.clock.issued = NOW - DAY_MS;
  const e = JSON.stringify(edited, null, 1) + "\n";
  return s.signinClockRead(b2a, DESK_KEY) === null && run(b2a, NOW + 2 * DAY_MS) === NOW + 2 * DAY_MS && run(b2a, NOW - YEAR_MS) === NOW && seat(b2a) === seat(marked)
    && !!s.signinClockRead(mine, DESK_KEY) && run(mine, NOW + 2 * DAY_MS) === NOW + 5 * DAY_MS && s.signinClockRead(e, DESK_KEY) === null;
};
/* The test architect's candidate (his read of B-2a, 2026-11-17 23:53): a start whose first ask comes before the desk's key exists still
   reads the kept clock once the key answers, and loses no time counted. */
CASES.clockKeyLate = (s, swap) => {
  const st = clockStand({ held: heldOf({ seated: true }), wall: NOW }), w = clockWire(s, st, swap);
  w.signinClockNow();
  clockRun(st, 3 * DAY_MS);
  w.signinSave();
  const next = clockStand({ held: st.held, file: st.file, wall: st.wall - DAY_MS, mono: 1, key: null }), w2 = clockWire(s, next, swap);
  const before = w2.signinClockNow().desk;
  next.key = undefined;
  return before === 0 && w2.signinClockNow().desk === NOW + 3 * DAY_MS;
};
/* A CLOCK SET BACK, THEN PUT RIGHT (Grok psi's B1, the backward half, which its verification found): the correction is no time passed.
   A desk kept at the true time starts on a system clock read at a firmware date, and is put right a minute later in the run, or after
   an hour's running and the next start: the desk's time lands at the true time, the closed days counted once, never the years between. */
CASES.clockKeptBack = (s, swap) => {
  const FIRM = Date.UTC(2010, 0, 1), held = heldOf();
  const kept = () => { const st = clockStand({ held, wall: NOW }), w = clockWire(s, st, swap); w.signinClockNow(); clockRun(st, DAY_MS); w.signinSave(); return st.file; };
  const a = clockStand({ held, file: kept(), wall: FIRM, mono: 5 }), wa = clockWire(s, a, swap);
  const seen = wa.signinClockNow().desk;
  a.wall = NOW + 3 * DAY_MS + 60000; a.mono += 60000;
  const inRun = wa.signinClockNow().desk;
  const b = clockStand({ held, file: kept(), wall: FIRM, mono: 5 }), wb = clockWire(s, b, swap);
  wb.signinClockNow(); clockRun(b, HOUR_MS); wb.signinSave();
  b.wall = NOW + 3 * DAY_MS; b.mono = 9;
  const next = clockWire(s, b, swap).signinClockNow().desk;
  return seen === NOW + DAY_MS && inRun === NOW + 3 * DAY_MS + 60000 && next === NOW + 3 * DAY_MS
    && s.signinWorks(held, DESK_KEY, inRun) === true && s.signinWorks(held, DESK_KEY, next) === true;
};
/* A running clock stepped back two hours and forward two hours: the desk's time moves by the real time passed and no more, in the run
   and in the next; a sleep after the step (the monotonic clock standing, the system clock on) still counts the time asleep. */
CASES.clockStepBack = (s, swap) => {
  const st = clockStand({ held: heldOf(), wall: NOW, mono: 1000 }), w = clockWire(s, st, swap);
  const t0 = w.signinClockNow().desk;
  st.wall -= 2 * HOUR_MS; clockRun(st, 60000);
  const back = w.signinClockNow().desk;
  clockRun(st, 60000); st.wall += 2 * HOUR_MS;
  const put = w.signinClockNow().desk;
  clockRun(st, HOUR_MS);
  w.signinSave();
  st.wall += DAY_MS; st.mono = 3;
  const w2 = clockWire(s, st, swap), next = w2.signinClockNow().desk;
  st.wall -= 2 * HOUR_MS; w2.signinClockNow();
  st.wall += 2 * HOUR_MS + 3 * HOUR_MS;
  const slept = w2.signinClockNow().desk;
  return t0 === NOW && back === NOW + 60000 && put === NOW + 120000 && next === NOW + 120000 + HOUR_MS + DAY_MS
    && slept === next + 3 * HOUR_MS;
};
/* THE STOP MENDED ONLINE: a running desk whose clock is carried past its certificate's end (a forward step, which stays until the next
   certificate) stops and asks one renewal at once; the renewal's certificate, issued on the service's time, sets the desk's time back
   to its issue and the desk works again, no second renewal asked. */
CASES.clockStopRenewed = (s, swap) => {
  let at = NOW + DAY_MS, mono = 1;
  const st = stopStand({ held: heldOf({ seated: true }), clock: { now: () => at }, mono: { now: () => mono }, setTimeout: () => ({ unref() {} }), clearTimeout: () => {} });
  const w = stopWire(s, st, swap);
  w.signinClockNow(); w.signinStopArm();
  const works = w.signinWorksNow() === true && st.renews === 0;
  at += 40 * DAY_MS; mono += 1000;
  w.signinStopArm(); w.signinStopArm();
  const stopped = w.signinWorksNow() === false && st.renews === 1;
  st.held = heldOf({ seated: true, cert: cert({ issued: NOW + DAY_MS + 2000, until: NOW + 31 * DAY_MS }) });
  w.signinStopArm();
  return works && stopped && w.signinClockNow().desk === NOW + DAY_MS + 2000 && w.signinWorksNow() === true && st.renews === 1;
};
/* THE QUICK REPLIES ON A DESK THAT DOES NOT WORK: neither the key nor the tray opens them, and the desk's window comes forward instead;
   on a desk that works they open as before, and a second press still closes one that stands. */
CASES.pickRefused = (s, swap) => {
  let text = decl(MAIN, "function pickToggle(");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in pickToggle once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const run = (works, visible) => {
    const st = { focus: 0, hide: 0, asked: 0, caret: 0, works };
    const names = ["pickWin", "hidePicker", "theWindow", "signinWorksNow", "focusDesk", "hidePickNote", "caretWhich", "caretSelection", "pickTrace", "pickWithClip", "console"];
    const vals = [{ isDestroyed: () => false, isVisible: () => visible === true }, () => { st.hide++; }, { isDestroyed: () => false }, () => { st.asked++; return st.works; },
      () => { st.focus++; }, () => {}, () => { st.caret++; return Promise.resolve(null); }, () => new Promise(() => {}), () => {}, () => {}, { error() {} }];
    const f = new Function(...names, "let pickOpening = false, pickPress = 0, pickTarget = null;\n" + text + "\npickToggle();\nreturn pickOpening;");
    st.opening = f(...vals);
    return st;
  };
  const off = run(false), on = run(true), shut = run(false, true);
  return off.focus === 1 && off.caret === 0 && off.opening === false && off.asked === 1 && on.focus === 0 && on.caret === 1 && on.opening === true
    && shut.hide === 1 && shut.asked === 0 && shut.focus === 0;
};
/* NO PROVIDER, NO WORK: a build holding no provider's registration works with no certificate, a genuine one held included, arms no stop
   and asks no renewal, and tells the page \`registered\` false; machine policy pinning the providers away leaves \`registered\` as the
   build is. Nothing held is dropped. */
CASES.noProvider = (s, swap) => {
  const held = heldOf({ seated: true });
  const v = s.signinViewOf(held, viewFacts({ offered: [], shown: [], registered: false })), preview = s.signinViewOf(held, viewFacts({ offered: [], preview: true, shown: ["microsoft", "google"] }));
  const timers = [], nst = stopStand({ held, offered: [], clock: { now: () => NOW }, mono: { now: () => 1 }, setTimeout: (fn, ms) => { timers.push(ms); return { unref() {} }; }, clearTimeout: () => {} });
  const nw = stopWire(s, nst);
  nw.signinStopArm();
  let text = decl(MAIN, "function signinState(");
  if (swap && text.split(swap[0]).length === 2) text = text.replace(swap[0], swap[1]);
  /* signinState over a build's table `base`, machine policy pinning it to `pinned`; signinOffered the section's own over the table given. */
  const registered = (base, pinned) => new Function("fs", "path", "app", "SIGNIN_FILE", "SIGNIN_FILE_MAX", "signinFileRead", "SIGNIN_DESK_PACKED", "branchIdentity", "signinFileHeld",
    "managedPolicy", "signinPinTable", "signinOffered", "BASE", "let signinStore, SIGNIN_PROVIDERS = BASE, signinTableBase, signinPinStamp = \"\";\n" + text + "\nreturn signinState();")(
      { statSync: () => { throw new Error("ENOENT"); } }, path, { getPath: () => "/ud" }, "signin.json", s.SIGNIN_FILE_MAX, s.signinFileRead, true,
      () => ({ key: DESK_KEY }), s.signinFileHeld, () => ({ any: true, managed: true }), () => pinned, t => s.signinOffered(t, {}), base).registered;
  return v.works === false && v.registered === false && v.until === held.cert.until && preview.works === false && s.signinWorksOf(held, [], DESK_KEY, NOW + 1) === false
    && s.signinWorksOf(held, [MS], DESK_KEY, NOW + 1) === true && !timers.some(ms => ms > 0) && nst.renews === 0 && nst.held === held && !!held.cert
    && registered(configured(s), {}) === true && registered(s.SIGNIN_PROVIDERS, s.SIGNIN_PROVIDERS) === false;
};
/* The page keeps \`ended\`, \`holding\`, \`trials\` and \`registered\`, typed and bounded, the first three for a signed-in desk alone.
   deskDoorState is what reads them. No other page module names holding or registered, and the rest of signin.js reads none of the four from a view. */
CASES.pageWords = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const r = o => pg.signinRead(Object.assign({ offered: ["microsoft"], signedIn: "microsoft" }, o));
  const ch = n => String.fromCharCode(n);
  const full = r({ ended: NOW, holding: { on: "team", ends: NOW + 1, lead: B2B_LEAD }, trials: { desk: NOW, studio: NOW + 1, x: 1 }, registered: true });
  const odd = r({ ended: "1", holding: { on: "gift", ends: 1 }, trials: { desk: -1 }, registered: "yes" });
  const lead = v => (r({ holding: { on: "team", ends: 1, lead: v } }).holding || {}).lead;
  const out = pg.signinRead({ offered: ["microsoft"], ended: NOW, holding: { on: "own", ends: 1 }, trials: { desk: NOW }, registered: true });
  const seamAt = PAGE.indexOf("function deskDoorState(v){"), seamEnd = seamAt < 0 ? -1 : PAGE.indexOf("\n}\n", seamAt);
  const seam = seamAt < 0 || seamEnd < 0 ? "" : PAGE.slice(seamAt, seamEnd);
  const outside = seamAt < 0 ? PAGE : PAGE.slice(0, seamAt) + PAGE.slice(seamEnd);
  const seamReads = /\bv\.ended\b/.test(seam) && /\bv\.holding\b/.test(seam) && /\bv\.trials\b/.test(seam) && /\bv\.registered\b/.test(seam);
  const quiet = seamReads && fs.readdirSync(path.join(ROOT, "src", "modules")).filter(n => n.endsWith(".js") && n !== "signin.js")
    .every(n => !/\.(?:holding|registered)\b/.test(fs.readFileSync(path.join(ROOT, "src", "modules", n), "utf8")))
    && !/\b(?:v|s|sv|view|signinV)\.(?:ended|holding|trials|registered)\b/.test(outside);
  return full.ended === NOW && JSON.stringify(full.holding) === JSON.stringify({ on: "team", ends: NOW + 1, lead: B2B_LEAD })
    && JSON.stringify(full.trials) === JSON.stringify({ desk: NOW, studio: NOW + 1 }) && full.registered === true
    && odd.ended === 0 && odd.holding === null && odd.trials === null && odd.registered === false
    && lead("<b>x</b>") === undefined && lead("x" + ch(1)) === undefined && lead("L".repeat(121)) === undefined && lead(B2B_LEAD) === B2B_LEAD
    && out.ended === 0 && out.holding === null && out.trials === null && out.registered === true && pg.signinRead(null).registered === false && quiet;
};
/* ---- B-3a1: review 46 findings 1 and 2, deskWorks() and the door rule ---------------------------------------------------------- */
/* Finding 1 (class A): signinSettleSeat refuses a certificate whose issued is before the held one's, across renewal, Check now and sign in;
   an older certificate with a later until revives nothing and moves neither the held certificate, works nor the desk clock; equal issued is taken. */
CASES.settleIssued = async (s, swap) => {
  const heldCert = cert({ issued: NOW + 20 * DAY_MS, until: NOW + 25 * DAY_MS });
  const olderCert = cert({ issued: NOW + 10 * DAY_MS, until: NOW + 40 * DAY_MS });
  const sameCert = cert({ issued: NOW + 20 * DAY_MS, until: NOW + 45 * DAY_MS });
  const newerCert = cert({ issued: NOW + 26 * DAY_MS, until: NOW + 56 * DAY_MS });
  const deskNow = NOW + 26 * DAY_MS;
  const held = heldOf({ cert: heldCert, seated: true, ended: NOW + 21 * DAY_MS, at: NOW + 20 * DAY_MS,
    holding: { on: "team", ends: NOW + 25 * DAY_MS, lead: B2B_LEAD }, trials: { desk: NOW + 14 * DAY_MS }, doors: [] });
  const olderBody = strayAnswer({ ok: true, code: CODE, certificate: olderCert, doors: [],
    seat: { on: "own", ends: NOW + 40 * DAY_MS }, trials: { studio: NOW + 40 * DAY_MS } });
  const olderAns = s.signinAnswer(olderBody, DESK_KEY, true);
  const sameAns = s.signinAnswer(answer({ ok: true, code: CODE, certificate: sameCert, doors: [] }), DESK_KEY, true);
  const newerAns = s.signinAnswer(answer({ ok: true, code: CODE, certificate: newerCert, doors: [] }), DESK_KEY, true);
  const clock0 = s.signinClockObserve(s.signinClockObserve(null, NOW + 20 * DAY_MS, 1000, held, DESK_KEY), deskNow, 1000 + 6 * DAY_MS, held, DESK_KEY);
  const rOld = s.signinSettle(held, olderAns, NOW + 27 * DAY_MS, deskNow);
  const clockAfterDirect = s.signinClockObserve(clock0, deskNow, 1000 + 6 * DAY_MS, rOld, DESK_KEY);
  const directOk = rOld.cert === heldCert && rOld.ended === held.ended && rOld.at === held.at && rOld.checked === NOW + 27 * DAY_MS && rOld.reached === false
    && JSON.stringify(rOld.holding) === JSON.stringify(held.holding) && JSON.stringify(rOld.trials) === JSON.stringify(held.trials)
    && s.signinWorks(rOld, DESK_KEY, clockAfterDirect.desk) === false
    && s.signinWorks({ cert: olderCert }, DESK_KEY, deskNow) === true
    && clockAfterDirect.desk === deskNow && clockAfterDirect.issued === heldCert.issued;
  const rSame = s.signinSettle(held, sameAns, NOW + 27 * DAY_MS, deskNow);
  const rNew = s.signinSettle(held, newerAns, NOW + 27 * DAY_MS, deskNow);
  const equalNewOk = rSame.cert === sameAns.cert && JSON.stringify(rSame.cert) === JSON.stringify(sameCert)
    && rSame.ended === undefined && s.signinWorks(rSame, DESK_KEY, deskNow) === true
    && rNew.cert === newerAns.cert && JSON.stringify(rNew.cert) === JSON.stringify(newerCert)
    && s.signinWorks(rNew, DESK_KEY, deskNow) === true;

  /* Path 1: daily renewal (signinRenewHeld). */
  const ioRenew = Object.assign(renewIo(answer({ id_token: jwt(msClaims(undefined)), refresh_token: "rt-2" }), olderBody), { deskNow: () => deskNow });
  const renewed = await s.signinRenewHeld(ioRenew, MS, DESK_KEY, held, () => NOW);
  const clockAfterRenew = s.signinClockObserve(clock0, deskNow, 1000 + 6 * DAY_MS, renewed.held, DESK_KEY);
  const renewOk = renewed.held.cert === heldCert && renewed.held.ended === held.ended
    && s.signinWorks(renewed.held, DESK_KEY, clockAfterRenew.desk) === false
    && clockAfterRenew.desk === deskNow && clockAfterRenew.issued === heldCert.issued;

  /* Path 2: Check now (etiuda:signin-check -> signinRenewNow). */
  const tNow = Date.now();
  const cHeldNow = cert({ issued: tNow - 10 * DAY_MS, until: tNow - DAY_MS });
  const cOldNow = cert({ issued: tNow - 20 * DAY_MS, until: tNow + 10 * DAY_MS });
  const hNow = heldOf({ cert: cHeldNow, seated: true, ended: tNow - 5 * DAY_MS, at: tNow - 10 * DAY_MS, doors: [] });
  const clockNow0 = s.signinClockObserve(s.signinClockObserve(null, tNow - 10 * DAY_MS, 500, hNow, DESK_KEY), tNow, 500 + 10 * DAY_MS, hNow, DESK_KEY);
  const wst = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, tNow)), refresh_token: "rt-2" }),
    () => strayAnswer({ ok: true, code: CODE, certificate: cOldNow, doors: [] }));
  wst.store.held = hNow;
  const wWire = loadWire(wst);
  const chkSlice = (() => { const a = WIRING.indexOf('ipcMain.handle("etiuda:signin-check",'); return WIRING.slice(a, WIRING.indexOf("\n});", a) + 4); })();
  let chkFn = null;
  new Function("ipcMain", "fromEngine", "signinRenewNow", "signinPressNow", "signinView", "SIGNIN_CHECK_GAP_MS", "Date", "let signinCheckAt = 0;\n" + chkSlice)(
    { handle: (ch, fn) => { chkFn = fn; } }, () => true, () => wWire.signinRenewNow(), async renew => { if (renew) await wWire.signinRenewNow(); return true; }, () => s.signinViewOf(wst.store.held, viewFacts({ deskNow: clockNow0.desk })), 10000, Date);
  const chkView = await chkFn({});
  const clockAfterCheck = s.signinClockObserve(clockNow0, tNow, 500 + 10 * DAY_MS, wst.store.held, DESK_KEY);
  const checkOk = wst.store.held.cert === cHeldNow && wst.store.held.ended === hNow.ended && chkView.works === false
    && s.signinWorks(wst.store.held, DESK_KEY, clockAfterCheck.desk) === false
    && clockAfterCheck.desk === tNow && clockAfterCheck.issued === cHeldNow.issued;

  /* Path 3: sign in as the same account (etiuda:signin -> signinTake -> signinSettle). */
  const sst = switchStand(s, { held: Object.assign({}, held, { sub: "sealed:s-1" }) });
  sst.sub = "s-1";
  sst.answer = olderAns;
  await loadSwitch(sst).press();
  await tick(5);
  const clockAfterSignin = s.signinClockObserve(clock0, deskNow, 1000 + 6 * DAY_MS, sst.store.held, DESK_KEY);
  const signinOk = !!sst.store.held && sst.store.held.cert === heldCert && sst.store.held.ended === held.ended
    && s.signinWorks(sst.store.held, DESK_KEY, clockAfterSignin.desk) === false
    && clockAfterSignin.desk === deskNow && clockAfterSignin.issued === heldCert.issued;

  return directOk && equalNewOk && renewOk && checkOk && signinOk;
};

/* Finding 2 (class B): a first ask of the view before the desk's key exists must not cache a state stripped of the held certificate.
   Drives the real signinState + signinClockNow + signinTick + signinSave + signinView without clockWire's stub. */
CASES.stateKeyLate = (s, swap) => {
  const decls = ["function signinState(", "function signinView("].concat(CLOCK_DECLS);
  let text = decls.map(d => decl(MAIN, d)).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in finding-2 wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const held = heldOf({ seated: true, doors: [] });
  const marked = s.signinFileMarkText(s.signinFileText({ held }), signWith(signKey));
  const initialDisk = s.signinClockText(marked, { desk: NOW + 3 * DAY_MS, wall: NOW + 3 * DAY_MS, last: cert().until, issued: NOW }, signWith(signKey));
  const st = { file: initialDisk, writes: 0, tells: 0, key: null, wall: NOW + 3 * DAY_MS, mono: 1000 };
  const names = ["managedPolicy", "signinPinTable", "signinOffered", "fs", "path", "app", "SIGNIN_FILE", "SIGNIN_FILE_MAX",
    "signinFileRead", "SIGNIN_DESK_PACKED", "branchIdentity", "signinFileHeld", "signinPreviewing", "signinDoorsShown", "signinRelaySeat",
    "sealsForReal", "safeStorage", "process", "deskKeyStranded", "signinAccountKept", "signinViewOf", "Date", "performance",
    "signinClockRead", "signinClockObserve", "signinClockStart", "signinClockText", "setInterval", "net", "tellSignin",
    "writeReplacing", "signinFileMarkText", "signinFileText", "signinSign", "console", "setTimeout", "signinStopArm"];
  const vals = [() => ({ any: false }), table => table, () => [MS],
    { statSync: () => ({ size: st.file.length }), readFileSync: () => st.file }, path, { getPath: () => "/ud" }, "signin.json", s.SIGNIN_FILE_MAX,
    s.signinFileRead, true, () => (st.key ? { id: DESK_ID, key: st.key } : null), s.signinFileHeld, () => false, () => [], () => "",
    () => true, {}, { platform: "win32" }, () => false, () => false, s.signinViewOf, { now: () => st.wall }, { now: () => st.mono },
    s.signinClockRead, s.signinClockObserve, s.signinClockStart, s.signinClockText, () => ({ unref() {} }), { isOnline: () => true }, () => { st.tells++; },
    (f, t) => { st.file = t; st.writes++; }, s.signinFileMarkText, s.signinFileText, signWith(signKey), { error() {}, log() {} },
    () => ({ unref() {} }), () => {}];
  const w = new Function(...names,
    "let signinStore, SIGNIN_PROVIDERS = { microsoft: {} }, signinTableBase, signinPinStamp = \"\", signinBusy = null, signinRenewing = null, signinOutFlight = null, signinSaid = \"\";\n"
    + "let signinClock = null, signinClockKept = 0, signinOnline = null, signinTicker = null, signinClockKey = \"\", signinStopFor = \"\";\n"
    + text + "\nreturn { signinState, signinView, signinClockNow, signinTick, signinSave };")(...vals);
  const before = w.signinView();
  w.signinTick();
  const safeBefore = before.works === false && st.writes === 0;
  st.key = DESK_KEY;
  const after = w.signinView();
  const kept = w.signinState().held;
  w.signinSave();
  const onDisk = s.signinFileHeld(s.signinFileRead(st.file), st.file, DESK_KEY).held;
  return safeBefore && !!kept && !!kept.cert && after.works === true && after.until === cert().until && after.code === CODE
    && after.now === NOW + 3 * DAY_MS && after.stoppedAt === 0 && st.writes === 1 && !!onDisk && !!onDisk.cert;
};

/* Argon 51 M1: the settle and the kept-file path also compare against the clock's own issued mark, so a null held certificate
   in memory or an older one from signin.json cannot revive the desk; side-step: sign-in after Sign out and kept-file via tick. */
CASES.settleClockIssued = async (s, swap) => {
  const c1 = cert({ issued: NOW, until: NOW + 30 * DAY_MS });
  const c2 = cert({ issued: NOW + 5 * DAY_MS, until: NOW + 7 * DAY_MS });
  const deskNow = NOW + 8 * DAY_MS;
  const h2 = heldOf({ cert: c2, seated: true });
  let clk = s.signinClockObserve(null, NOW + 5 * DAY_MS, 1000, h2, DESK_KEY);
  clk = s.signinClockObserve(clk, deskNow, 1000 + 3 * DAY_MS, h2, DESK_KEY);
  const olderBody = strayAnswer({ ok: true, code: CODE, certificate: c1, doors: [] });
  const olderAns = s.signinAnswer(olderBody, DESK_KEY, true);

  /* C1.2: null held cert in memory, older replayed cert refused against clk.issued; equal issued taken. */
  const hNoCert = Object.assign({}, h2, { cert: null, code: "" });
  const rOldNull = s.signinSettle(hNoCert, olderAns, deskNow, clk.desk, clk.issued);
  const cSameIssued = cert({ issued: c2.issued, until: NOW + 20 * DAY_MS });
  const rEqNull = s.signinSettle(hNoCert, s.signinAnswer(answer({ ok: true, code: CODE, certificate: cSameIssued, doors: [] }), DESK_KEY, true), deskNow, clk.desk, clk.issued);
  const directOk = rOldNull.cert === null && rOldNull.reached === false
    && s.signinWorks(rOldNull, DESK_KEY, clk.desk) === false
    && JSON.stringify(rEqNull.cert) === JSON.stringify(cSameIssued) && s.signinWorks(rEqNull, DESK_KEY, clk.desk) === true;

  /* Wired signinIo + signinRenewHeld: io.deskIssued() hands clock.issued so renewal with null held cert refuses older cert. */
  let ioSrc = decl(MAIN, "function signinIo(");
  if (swap && ioSrc.split(swap[0]).length === 2) ioSrc = ioSrc.replace(swap[0], swap[1]);
  const ioFn = new Function("signinListen", "http", "SIGNIN_WAIT_MS", "signinPageOk", "tellSignin", "handOut", "signinRequest", "deskFetch",
    "signinServiceAsk", "signinSign", "signinKeep", "safeStorage", "process", "signinKept", "signinPageHtml", "SIGNIN_TRACE_ASKED",
    "console", "SIGNIN_DESK_PACKED", "signinState", "storeOn", "storeOffered", "storeTokenTake", "signinClockNow",
    ioSrc + "\nreturn signinIo;")(
    async () => ({}), {}, 1000, () => true, () => {}, () => {}, async () => ({}), () => {}, async () => ({}), () => "", () => "", {},
    { platform: "win32" }, () => "", () => "", false, console, true, () => ({ managed: null }), () => false, () => false, () => {},
    () => ({ key: DESK_KEY, desk: clk.desk, last: c2.until, issued: clk.issued, online: true }));
  const wiredIo = ioFn({ loop: null });
  const rw = await s.signinRenewHeld(Object.assign({}, renewIo(answer({ id_token: jwt(msClaims(undefined, deskNow)), refresh_token: "rt-2" }), olderBody),
    { deskNow: () => wiredIo.deskNow(), deskIssued: () => (typeof wiredIo.deskIssued === "function" ? wiredIo.deskIssued() : 0) }),
    MS, DESK_KEY, Object.assign({}, hNoCert, { refresh: "sealed:rt-1", sub: "sealed:s-1" }), () => deskNow);
  const renewOk = rw.said === "renewed" && rw.held.cert === null && rw.held.reached === false && s.signinWorks(rw.held, DESK_KEY, clk.desk) === false;

  /* Wired signinTake (and side-step: sign-in after Sign out with held: null while clock.issued stays in memory/disk). */
  let takeSrc = decl(MAIN, "function signinTake(");
  if (swap && takeSrc.split(swap[0]).length === 2) takeSrc = takeSrc.replace(swap[0], swap[1]);
  const runTake = initialHeld => {
    const store = { held: initialHeld, revoked: null };
    const fn = new Function("signinState", "signinSave", "signinHeldIs", "signinKeep", "safeStorage", "process", "signinClaims", "signinSettle", "signinClockNow", "signinRelaySeatClear",
      takeSrc + "\nreturn signinTake;")(
      () => store, () => {}, () => true, (ss, pl, t) => (t ? "sealed:" + t : ""), {}, { platform: "win32" }, () => null, s.signinSettle,
      () => ({ desk: clk.desk, issued: clk.issued }), () => {});
    fn("microsoft", { sub: "s-1", seed: "1".repeat(64), idToken: "", refreshToken: "rt-2" }, olderAns, deskNow, false);
    return store.held;
  };
  const takeNullHeld = runTake(hNoCert), takeAfterOut = runTake(null);
  const takeOk = takeNullHeld.cert === null && takeNullHeld.reached === false && s.signinWorks(takeNullHeld, DESK_KEY, clk.desk) === false
    && takeAfterOut.cert === null && takeAfterOut.reached === false && s.signinWorks(takeAfterOut, DESK_KEY, clk.desk) === false;

  /* C4.1: kept-file path with older marked cert (c1) and newer marked clock (c2.issued), via signinView and side-step signinTick. */
  const markedOld = s.signinFileMarkText(s.signinFileText({ held: heldOf({ cert: c1, seated: true, doors: [] }) }), signWith(signKey));
  const splicedFile = s.signinClockText(markedOld, { desk: deskNow, wall: deskNow, last: c2.until, issued: c2.issued }, signWith(signKey));
  const directFile = s.signinFileHeld(s.signinFileRead(splicedFile), splicedFile, DESK_KEY).held;
  const equalFileText = s.signinClockText(markedOld, { desk: deskNow, wall: deskNow, last: c1.until, issued: c1.issued }, signWith(signKey));
  const equalFile = s.signinFileHeld(s.signinFileRead(equalFileText), equalFileText, DESK_KEY).held;
  let wireText = ["function signinState(", "function signinView("].concat(CLOCK_DECLS).map(d => decl(MAIN, d)).join("\n");
  if (swap && wireText.split(swap[0]).length === 2) wireText = wireText.replace(swap[0], swap[1]);
  const runSpliced = fileText => {
    const st = { file: fileText, writes: 0, tells: 0 };
    const names = ["managedPolicy", "signinPinTable", "signinOffered", "fs", "path", "app", "SIGNIN_FILE", "SIGNIN_FILE_MAX",
      "signinFileRead", "SIGNIN_DESK_PACKED", "branchIdentity", "signinFileHeld", "signinPreviewing", "signinDoorsShown", "signinRelaySeat",
      "sealsForReal", "safeStorage", "process", "deskKeyStranded", "signinAccountKept", "signinViewOf", "Date", "performance",
      "signinClockRead", "signinClockObserve", "signinClockStart", "signinClockText", "setInterval", "net", "tellSignin",
      "writeReplacing", "signinFileMarkText", "signinFileText", "signinSign", "console", "setTimeout", "signinStopArm"];
    const vals = [() => ({ any: false }), table => table, () => [MS],
      { statSync: () => ({ size: st.file.length }), readFileSync: () => st.file }, path, { getPath: () => "/ud" }, "signin.json", s.SIGNIN_FILE_MAX,
      s.signinFileRead, true, () => ({ id: DESK_ID, key: DESK_KEY }), s.signinFileHeld, () => false, () => [], () => "",
      () => true, {}, { platform: "win32" }, () => false, () => false, s.signinViewOf, { now: () => deskNow }, { now: () => 2000 },
      s.signinClockRead, s.signinClockObserve, s.signinClockStart, s.signinClockText, () => ({ unref() {} }), { isOnline: () => true }, () => { st.tells++; },
      (f, t) => { st.file = t; st.writes++; }, s.signinFileMarkText, s.signinFileText, signWith(signKey), { error() {}, log() {} },
      () => ({ unref() {} }), () => {}];
    return new Function(...names,
      "let signinStore, SIGNIN_PROVIDERS = { microsoft: {} }, signinTableBase, signinPinStamp = \"\", signinBusy = null, signinRenewing = null, signinOutFlight = null, signinSaid = \"\";\n"
      + "let signinClock = null, signinClockKept = 0, signinOnline = null, signinTicker = null, signinClockKey = \"\", signinStopFor = \"\";\n"
      + wireText + "\nreturn { signinState, signinView, signinTick, signinClockNow };")(...vals);
  };
  const hView = runSpliced(splicedFile), vSplice = hView.signinView();
  const hTick = runSpliced(splicedFile);
  hTick.signinTick();
  const worksViaTick = s.signinWorksOf(hTick.signinState().held, [MS], DESK_KEY, hTick.signinClockNow().desk);
  const fileOk = !!directFile && directFile.cert === null && !!equalFile && !!equalFile.cert
    && vSplice.works === false && vSplice.until === 0 && vSplice.now === deskNow && vSplice.stoppedAt === c2.until
    && worksViaTick === false;

  return directOk && renewOk && takeOk && fileOk;
};

/* Argon 51 M2 (both halves): unopenable key -> other key -> old key restored keeps works:true and does not let the first tick
   wipe held.cert on disk (C2.2); and when the key arrives after a pre-key ask, the page is told (C2.1).
   Side-steps: tick immediately after restore without calling signinView first; and signinClockNow directly on key arrival. */
CASES.stateKeyRestoreAndTell = (s, swap) => {
  const decls = ["function signinState(", "function signinView("].concat(CLOCK_DECLS);
  let text = decls.map(d => decl(MAIN, d)).join("\n");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in M2 wiring once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const held = heldOf({ seated: true, doors: [] });
  const marked = s.signinFileMarkText(s.signinFileText({ held }), signWith(signKey));
  const initialDisk = s.signinClockText(marked, { desk: NOW + 3 * DAY_MS, wall: NOW + 3 * DAY_MS, last: cert().until, issued: NOW }, signWith(signKey));
  const makeWire = key0 => {
    const st = { file: initialDisk, writes: 0, tells: 0, key: key0, wall: NOW + 3 * DAY_MS, mono: 1000 };
    const names = ["managedPolicy", "signinPinTable", "signinOffered", "fs", "path", "app", "SIGNIN_FILE", "SIGNIN_FILE_MAX",
      "signinFileRead", "SIGNIN_DESK_PACKED", "branchIdentity", "signinFileHeld", "signinPreviewing", "signinDoorsShown", "signinRelaySeat",
      "sealsForReal", "safeStorage", "process", "deskKeyStranded", "signinAccountKept", "signinViewOf", "Date", "performance",
      "signinClockRead", "signinClockObserve", "signinClockStart", "signinClockText", "setInterval", "net", "tellSignin",
      "writeReplacing", "signinFileMarkText", "signinFileText", "signinSign", "console", "setTimeout", "signinStopArm"];
    const vals = [() => ({ any: false }), table => table, () => [MS],
      { statSync: () => ({ size: st.file.length }), readFileSync: () => st.file }, path, { getPath: () => "/ud" }, "signin.json", s.SIGNIN_FILE_MAX,
      s.signinFileRead, true, () => (st.key ? { id: DESK_ID, key: st.key } : null), s.signinFileHeld, () => false, () => [], () => "",
      () => true, {}, { platform: "win32" }, () => false, () => false, s.signinViewOf, { now: () => st.wall }, { now: () => st.mono },
      s.signinClockRead, s.signinClockObserve, s.signinClockStart, s.signinClockText, () => ({ unref() {} }), { isOnline: () => true }, () => { st.tells++; },
      (f, t) => { st.file = t; st.writes++; }, s.signinFileMarkText, s.signinFileText, signWith(signKey), { error() {}, log() {} },
      () => ({ unref() {} }), () => {}];
    const w = new Function(...names,
      "let signinStore, SIGNIN_PROVIDERS = { microsoft: {} }, signinTableBase, signinPinStamp = \"\", signinBusy = null, signinRenewing = null, signinOutFlight = null, signinSaid = \"\";\n"
      + "let signinClock = null, signinClockKept = 0, signinOnline = null, signinTicker = null, signinClockKey = \"\", signinStopFor = \"\";\n"
      + text + "\nreturn { signinState, signinView, signinClockNow, signinTick, signinSave };")(...vals);
    return { st, w };
  };

  /* C2.2: OTHER_DESK_KEY -> signinView -> restore DESK_KEY -> signinView -> signinTick. */
  const c22 = makeWire(OTHER_DESK_KEY);
  const vWrong = c22.w.signinView();
  c22.st.key = DESK_KEY;
  const vRestored = c22.w.signinView();
  c22.w.signinTick();
  const diskC22 = s.signinFileHeld(s.signinFileRead(c22.st.file), c22.st.file, DESK_KEY).held;
  const c22Ok = vWrong.works === false && vRestored.works === true && vRestored.stoppedAt === 0 && vRestored.until === cert().until
    && c22.st.writes === 1 && !!diskC22 && !!diskC22.cert && diskC22.code === CODE;

  /* Side-step for C2.2: restore DESK_KEY then run signinTick directly without calling signinView first. */
  const c22Tick = makeWire(OTHER_DESK_KEY);
  c22Tick.w.signinView();
  c22Tick.st.key = DESK_KEY;
  c22Tick.w.signinTick();
  const diskC22Tick = s.signinFileHeld(s.signinFileRead(c22Tick.st.file), c22Tick.st.file, DESK_KEY).held;
  const c22SideOk = !!diskC22Tick && !!diskC22Tick.cert && diskC22Tick.code === CODE && c22Tick.w.signinView().works === true && c22Tick.st.tells >= 1;

  /* C2.1: no key -> signinView -> key arrives -> signinTick tells the page. */
  const c21 = makeWire(null);
  const vBefore = c21.w.signinView();
  const tellsBefore = c21.st.tells;
  c21.st.key = DESK_KEY;
  c21.w.signinTick();
  const diskC21 = s.signinFileHeld(s.signinFileRead(c21.st.file), c21.st.file, DESK_KEY).held;
  const c21Ok = vBefore.works === false && tellsBefore === 0 && c21.st.tells >= 1 && c21.w.signinView().works === true
    && !!diskC21 && !!diskC21.cert;

  /* Side-step for C2.1: key arrives then signinClockNow runs directly (e.g. from resume/stop arm). */
  const c21Clock = makeWire(null);
  c21Clock.w.signinView();
  c21Clock.st.key = DESK_KEY;
  const clkArrived = c21Clock.w.signinClockNow();
  const c21SideOk = c21Clock.st.tells >= 1 && clkArrived.desk === NOW + 3 * DAY_MS && c21Clock.w.signinView().works === true;

  return c22Ok && c22SideOk && c21Ok && c21SideOk;
};

/* Fresh copy of signin.js in memory with no swap (or a plant swap), so module state starts clean. */
let freshSeq = 0;
async function freshSignin(swap) {
  const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
  let text = PAGE;
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in signin.js once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  return import("data:text/javascript;base64," + Buffer.from(text.replace(/from "\.\//g, 'from "' + dir) + "\n/* fresh:" + (++freshSeq) + " */").toString("base64"));
}

/* B-3a1: deskWorks() is the one gate predicate on the page; no host answers false; gate functions call no write to desk.json or storage. */
CASES.deskWorksGate = async (s, page) => {
  const pg = page || await freshSignin();
  if (typeof pg.deskWorks !== "function") return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  let deskSaves = 0;
  try {
    delete globalThis.window;
    const noWin = pg.deskWorks() === false;
    globalThis.window = {};
    const noHost = pg.deskWorks() === false;
    let cur = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: true, now: NOW, until: NOW + DAY_MS, registered: true, holding: { on: "trial", ends: NOW + DAY_MS } };
    globalThis.window = { E_HOST: { signinState: () => cur, deskSave: () => { deskSaves++; return true; } } };
    pg.signinNow();
    const withWork = pg.deskWorks() === true;
    /* Removing the host after a working view must still answer false (plain browser build). */
    delete globalThis.window.E_HOST;
    const droppedHost = pg.deskWorks() === false;
    globalThis.window.E_HOST = { signinState: () => cur, deskSave: () => { deskSaves++; return true; } };
    pg.signinChanged(Object.assign({}, cur, { works: false }), false);
    const stopped = pg.deskWorks() === false;
    pg.signinChanged(cur, false);
    const back = pg.deskWorks() === true;
    const explicit = pg.deskWorks({ works: true }) === true && pg.deskWorks({ works: false }) === false
      && pg.deskWorks({ works: "yes" }) === false && pg.deskWorks(null) === false;
    /* Gate functions must call no write. */
    pg.deskDoorState(pg.signinRead(cur));
    pg.firstSigninDue(cur);
    const noWrites = deskSaves === 0 && storage.lsGet("eFirstSigninSeen") === null
      && !/\blsSet\b|\bFIRST_SIGNIN_KEY\b|\beFirstSigninSeen\b|\bmarkFirstSigninSeen\b|\bfirstSigninSeen\b/.test(PAGE);
    return noWin && noHost && withWork && droppedHost && stopped && back && explicit && noWrites;
  } finally {
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
  }
};

/* B-3a1: the door rule: firstSigninDue ignores seen and policy pin, fires whenever view is read and deskWorks() is false;
   Not now, Continue, Escape, seen memory and skipFirstSignin are gone; the door lowers only when deskWorks() turns true. */
CASES.doorRule = async (s, page, kdSwap) => {
  const pg = page || await freshSignin();
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const KD_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "keydown.js"), "utf8");
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  try {
    /* No host (the browser build): the door holds, as B-3a2b has it (dsg10); a null view is never due. */
    delete globalThis.window;
    const beforeRead = pg.firstSigninDue() === true && pg.firstSigninDue(null) === false;

    /* Exports retired: FIRST_SIGNIN_KEY, firstSigninSeen, markFirstSigninSeen, skipFirstSignin are gone. */
    const exportsClean = !("FIRST_SIGNIN_KEY" in pg) && !("firstSigninSeen" in pg) && !("markFirstSigninSeen" in pg) && !("skipFirstSignin" in pg);

    /* Direct view calls: ignores seen, policy pin, stranded, and signedIn-without-works; false only when works is true. */
    storage.lsSet("eFirstSigninSeen", "1");
    const directDue = pg.firstSigninDue({ offered: ["microsoft"], signedIn: "", works: false }) === true
      && pg.firstSigninDue({ offered: ["microsoft"], signedIn: "", works: false }, { seen: true, policy: true }) === true
      && pg.firstSigninDue({ offered: ["microsoft"], signedIn: "microsoft", works: false }) === true
      && pg.firstSigninDue({ offered: [], signedIn: "", works: false, registered: false }) === true
      && pg.firstSigninDue({ offered: ["microsoft"], signedIn: "", managed: { on: true, stranded: true }, works: false }) === true
      && pg.firstSigninDue({ offered: ["microsoft"], signedIn: "microsoft", works: true }) === false;

    /* Host view read: policy desk + eFirstSigninSeen still due when works is false; not due when works is true. */
    const unseated = { offered: ["microsoft", "google"], signedIn: "", works: false, online: true, registered: true };
    const signedNoSeat = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, online: true, registered: true,
      holding: { on: "trial", ends: NOW }, trials: { desk: NOW } };
    const seated = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: true, online: true, registered: true,
      now: NOW, until: NOW + DAY_MS, holding: { on: "trial", ends: NOW + DAY_MS } };
    let cur = unseated, closedCount = 0;
    const classes = new Set();
    const fsEl = { hidden: true, innerHTML: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, contains: () => false, querySelector: () => null };
    globalThis.document = { body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
      activeElement: null, querySelector: sel => (sel === "#firstSignin" ? fsEl : null) };
    globalThis.window = { E_HOST: { catalogFolderPolicy: "C:\\Policy\\Team", signinState: () => cur } };
    /* A host, before any view is read: not due. */
    const hostNoView = pg.firstSigninDue() === false;
    pg.signinNow();
    const dueWithHost = pg.firstSigninDue() === true;
    pg.bootFirstSignin();
    pg.onFirstSigninClosed(() => { closedCount++; });
    const opened = pg.firstSigninOpenNow() === true && classes.has("e-first-signin") && !fsEl.hidden;

    /* Refused, managed-refused and stranded on the door draw NO Not now, NO skip line, NO Continue, NO firstSigninSkip. */
    let noSkipOnPaint = true;
    for (const v of [
      Object.assign({}, unseated, { said: "unreached" }),
      Object.assign({}, unseated, { said: "signin-notassigned", managed: { on: true, tenant: true, contact: "IT" } }),
      Object.assign({}, unseated, { managed: { on: true, stranded: true } })
    ]) {
      pg.signinChanged(v, false);
      if (fsEl.innerHTML.includes("firstSigninSkip") || fsEl.innerHTML.includes("Not now") || fsEl.innerHTML.includes("Continue")
          || fsEl.innerHTML.includes("fs-skip")) noSkipOnPaint = false;
    }

    /* Signing in with works: false must NOT lower the door; only works: true lowers it. */
    pg.signinChanged(signedNoSeat, false);
    const stayedOpen = pg.firstSigninOpenNow() === true && classes.has("e-first-signin") && closedCount === 0;
    pg.signinChanged(seated, false);
    const loweredOnWorks = pg.firstSigninOpenNow() === false && !classes.has("e-first-signin") && closedCount === 1 && pg.firstSigninDue() === false;

    /* keydown.js: does not import or call skipFirstSignin; Escape while door stands neither lowers door nor invokes escape shortcut. */
    let kdText = KD_SRC;
    if (kdSwap) {
      if (kdText.split(kdSwap[0]).length !== 2) throw new Error("plant anchor not in keydown.js once: " + kdSwap[0]);
      kdText = kdText.replace(kdSwap[0], kdSwap[1]);
    }
    let kdListener = null, escRan = 0;
    const kdSlice = decl(kdText, "function wireGlobalKeydown(");
    const off = () => false;
    const kdOwn = { document: { activeElement: null, body: { classList: { contains: off } } },
      addEventListener: (k, fn) => { if (k === "keydown") kdListener = fn; }, $: () => null, scCaptureId: "", SC_DEFS: [{ id: "escape", fixed: false, inField: true }], intentEl: null,
      tourActive: off, tourHasFocus: off, openCover: () => null, modalFront: off, factsPanelOpen: off,
      eventMatchesAction: (e, id) => id === "escape" && e.key === "Escape", eHost: off, hooks: { runShortcut: () => { escRan++; } },
      noteUndoTyping: off, takeStandingUndo: off, typingInField: off, firstSigninOpenNow: () => true, tabTargetIn: () => null };
    new Function("scope", "with(scope){\n" + kdSlice + "\nwireGlobalKeydown();\n}")(new Proxy(kdOwn, { has: () => true,
      get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : globalThis[k] }));
    let prevented = false;
    if (kdListener) kdListener({ key: "Escape", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false,
      preventDefault() { prevented = true; }, stopPropagation() {} });
    const kdClean = !/\bskipFirstSignin\b/.test(KD_SRC) && !!kdListener && escRan === 0 && prevented === true;

    return beforeRead && hostNoView && exportsClean && directDue && dueWithHost && opened && noSkipOnPaint && stayedOpen && loweredOnWorks && kdClean;
  } finally {
    storage.lsDel("eFirstSigninSeen");
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
  }
};

/* Fresh copy of any page module in memory, with an optional plant swap; imports point back at src/modules so it shares signin.js state. */
async function freshPageMod(file, swap) {
  const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
  let text = fs.readFileSync(path.join(ROOT, "src", "modules", file), "utf8");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in " + file + " once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  return import("data:text/javascript;base64," + Buffer.from(text.replace(/from "\.\//g, 'from "' + dir)).toString("base64"));
}

/* B-3a2a step 1: while the door stands, every catalog intake channel waits (boot offer with asked:true, listing, host watch file,
   browser watched file, window drop, importCatalogText) or is ignored (importCatalogHere); when deskWorks() turns true, what waited plays. */
CASES.offersWait = async (s, swapSpec) => {
  const SGN = await import(pathToFileURL(path.join(ROOT, "src", "modules", "signin.js")).href);
  const CO = swapSpec && swapSpec.file === "catalog-offer.js"
    ? await freshPageMod("catalog-offer.js", swapSpec.swap)
    : await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-offer.js")).href);
  const CF = swapSpec && swapSpec.file === "catalog-file.js"
    ? await freshPageMod("catalog-file.js", swapSpec.swap)
    : await import(pathToFileURL(path.join(ROOT, "src", "modules", "catalog-file.js")).href);
  const HK = await import(pathToFileURL(path.join(ROOT, "src", "modules", "hooks.js")).href);
  const ST = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const TJ = await import(pathToFileURL(path.join(ROOT, "src", "modules", "team-join.js")).href);
  if (swapSpec && swapSpec.file === "signin.js") {
    const pg = await freshPageMod("signin.js", swapSpec.swap);
    if (typeof pg.doorHolds !== "function") return false;
    const hadWin = "window" in globalThis, prevWin = globalThis.window;
    try {
      globalThis.window = { E_HOST: { signinState: () => ({ offered: ["microsoft"], signedIn: "", works: false, registered: true, online: true }) } };
      pg.signinNow();
      return pg.doorHolds() === true;
    } finally {
      if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
    }
  }
  if (typeof SGN.doorHolds !== "function" || typeof SGN.whenDoorLowers !== "function") return false;
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  const hadAdd = "addEventListener" in globalThis, prevAdd = globalThis.addEventListener;
  const hadRem = "removeEventListener" in globalThis, prevRem = globalThis.removeEventListener;
  const hadInner = "innerWidth" in globalThis, prevInner = globalThis.innerWidth;
  const hadInnerH = "innerHeight" in globalThis, prevInnerH = globalThis.innerHeight;
  const hadIdb = "indexedDB" in globalThis, prevIdb = globalThis.indexedDB;
  const hadOfferHook = "offerPickedCatalog" in HK.hooks, prevOfferHook = HK.hooks.offerPickedCatalog;
  const hadRenderHook = "render" in HK.hooks, prevRenderHook = HK.hooks.render;
  const mkNode = tag => {
    const kids = [], attrs = {}, cls = new Set();
    const fakeBtn = { onclick: null, focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
    const n = {
      tagName: String(tag || "DIV").toUpperCase(), id: "", className: "", hidden: false, innerHTML: "", textContent: "",
      style: {}, isConnected: true, children: kids,
      classList: { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, v) => (v === undefined ? (cls.has(c) ? cls.delete(c) : cls.add(c)) : (v ? cls.add(c) : cls.delete(c))), contains: c => cls.has(c) },
      setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; }, removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { kids.push(c); c.parentNode = n; return c; }, insertBefore(c) { kids.unshift(c); c.parentNode = n; return c; },
      remove() { n.isConnected = false; }, contains: () => false, focus() {},
      addEventListener() {}, removeEventListener() {},
      querySelector: sel => (sel === "#ecYes" || sel === "#ecNo" || sel === ".tour-actions" ? fakeBtn : null),
      querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 }),
      offsetHeight: 120,
    };
    return n;
  };
  const v2Doc = (id, rev, title) => ({
    format: 2, kind: "etiuda-catalog", id: id, rev: rev, name: title, date: "2026-11-18",
    langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-1", shelf: "t-op", bodyShape: "plain", title: { en: title }, body: { en: "Reply body." } }],
  });
  try {
    const unseated = { offered: ["microsoft"], signedIn: "", works: false, online: true, registered: true };
    const seated = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: true, online: true, registered: true,
      now: NOW, until: NOW + DAY_MS, holding: { on: "trial", ends: NOW + DAY_MS } };
    let cur = unseated, onFileCb = null, onListCb = null, pickerOpens = 0, droppedCalls = 0, watchGets = 0, notifies = [], pickedOffers = [];
    const listeners = {};
    const added = [];
    const fsEl = mkNode("section"); fsEl.id = "firstSignin";
    const body = mkNode("body");
    body.appendChild = c => { added.push(c); c.parentNode = body; return c; };
    const byId = id => {
      if (id === "firstSignin") return fsEl;
      return added.slice().reverse().find(x => x.id === id && x.isConnected) || null;
    };
    const clearOffers = () => { added.forEach(x => { if (x.id === "eCatalogOffer") x.isConnected = false; }); };
    globalThis.document = {
      body, activeElement: null,
      getElementById: byId, querySelector: sel => (sel === "#firstSignin" ? fsEl : sel === "#eCatalogOffer" ? byId("eCatalogOffer") : null),
      querySelectorAll: () => [], createElement: mkNode,
    };
    globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
    globalThis.indexedDB = { open: () => { watchGets++; const r = {}; setTimeout(() => { if (r.onerror) r.onerror(); }, 0); return r; } };
    globalThis.addEventListener = (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); };
    globalThis.removeEventListener = (k, fn) => { if (listeners[k]) listeners[k] = listeners[k].filter(x => x !== fn); };
    const bootDoc = v2Doc("k-boot", 1, "Boot Given");
    const hostFileText = JSON.stringify(v2Doc("k-watch", 2, "Watch File"));
    const dropFileText = JSON.stringify(v2Doc("k-drop", 1, "Drop File"));
    const importTextA = JSON.stringify(v2Doc("k-imp-a", 1, "Import A"));
    const importTextB = JSON.stringify(v2Doc("k-imp-b", 1, "Import B"));
    globalThis.window = {
      E_CATALOG: bootDoc,
      showOpenFilePicker: () => { pickerOpens++; return Promise.reject(Object.assign(new Error("abort"), { name: "AbortError" })); },
      E_HOST: {
        signinState: () => cur,
        catalogFile: "boot-given.ec", catalogFolder: "C:\\Lab\\Cats", catalogIn: "C:\\Lab\\Cats", openedWith: true,
        catalogMtime: 1000, catalogFiles: () => Promise.resolve([]), catalogLeads: () => Promise.resolve([]),
        onCatalogFile: fn => { onFileCb = fn; },
        onCatalogListing: fn => { onListCb = fn; },
        notify: o => { notifies.push(o); return true; },
        pickCatalogFile: () => { pickerOpens++; return Promise.resolve(null); },
        offerDropped: () => { droppedCalls++; return true; },
        deskSave: () => true,
      },
    };
    ST.nsDel("Catalog"); ST.nsDel("CatalogOk"); ST.nsDel("CatalogNo"); ST.nsDel("CatalogNoAt"); ST.nsDel("WatchName"); ST.nsDel("WatchSeen"); ST.lsDel("eNotifyCatalogOff");
    ST.lsSet("eTourDone_v3", "1"); ST.lsSet("eTourInvite_v3", "1");
    HK.hooks.offerPickedCatalog = (c, name) => { pickedOffers.push({ id: c.id, name }); };
    HK.hooks.render = () => {};
    /* Seed one team lead so onCatalogListing tries to emit a new-catalog notification. */
    TJ.joinTook({ leads: [{ team: "t-1", lead: "Anna", print: "1234", admitted: true, seen: true }] });

    SGN.signinNow();
    SGN.bootFirstSignin();
    const standing = SGN.firstSigninOpenNow() === true && SGN.doorHolds() === true;

    /* 1. offerAtBoot with openedWith:true (asked:true) waits behind doorHolds(). */
    CO.eOfferCatalogAtBoot();
    const bootHeld = !byId("eCatalogOffer");

    /* 2. onCatalogListing waits behind doorHolds(): no notify while standing, latest plays on lower. */
    CO.wireHostCatalogWatch();
    CO.onCatalogListing([{ name: "first.ec", id: "k-list-1", sha: "sha1", rev: 1, mtime: 1, leadSigned: true }]);
    CO.onCatalogListing([{ name: "second.ec", id: "k-list-2", sha: "sha2", rev: 1, mtime: 2, leadSigned: true }]);
    const listHeld = notifies.length === 0;

    /* 3. wireHostCatalogWatch onCatalogFile waits behind doorHolds(). */
    if (onFileCb) onFileCb(hostFileText, "watch-cat.ec", "C:\\Lab\\Cats", true, "", false, "", "");
    const hostFileHeld = !byId("eCatalogOffer");

    /* 5. wireCatalogDrop holds dropped file without calling offerDropped or reading text while standing. */
    CF.wireCatalogDrop();
    let dropPrevented = false, dropTextReads = 0;
    const fakeFile = { name: "dropped.ec", text: () => { dropTextReads++; return Promise.resolve(dropFileText); } };
    (listeners.drop || []).forEach(fn => fn({
      dataTransfer: { types: ["Files"], files: [fakeFile] },
      preventDefault() { dropPrevented = true; },
    }));
    const dropHeld = dropPrevented && droppedCalls === 0 && dropTextReads === 0 && pickedOffers.length === 0;

    /* 6. importCatalogText holds latest without offering while standing. */
    const imp1 = CF.importCatalogText(importTextA, "imp-a.ec");
    const imp2 = CF.importCatalogText(importTextB, "imp-b.ec");
    const impTextHeld = imp1 === false && imp2 === false && pickedOffers.length === 0;

    /* 7. importCatalogHere is ignored while standing (does not open picker). */
    CF.importCatalogHere();
    const pickerHeld = pickerOpens === 0;

    /* Lower the door: deskWorks() turns true -> everything that waited plays! */
    cur = seated;
    SGN.signinChanged(seated, false);
    await tick(30);
    const bootPlayed = !!byId("eCatalogOffer");
    const listPlayed = notifies.length === 1 && notifies[0].body.indexOf("second") >= 0;
    const dropPlayed = droppedCalls === 1;
    const impPlayed = pickedOffers.length === 1 && pickedOffers[0].id === "k-imp-b" && pickedOffers[0].name === "imp-b.ec";

    /* 4. eCheckWatchedFile tested with no #eCatalogOffer on screen: waits while door holds, runs eWatchGet once seated. */
    clearOffers();
    cur = unseated;
    SGN.signinChanged(unseated, false);
    ST.nsSet("WatchName", "watched.ec");
    CO.eCheckWatchedFile(false);
    const watchHeld = watchGets === 0;
    cur = seated;
    SGN.signinChanged(seated, false);
    await tick(20);
    const watchPlayed = watchGets >= 1;

    /* Working desk control: importCatalogHere opens picker immediately, and a fresh host file offers immediately. */
    clearOffers();
    CF.importCatalogHere();
    const worksPicker = pickerOpens === 1;
    if (onFileCb) onFileCb(hostFileText, "watch-cat.ec", "C:\\Lab\\Cats", true, "", false, "", "");
    const worksHostFile = !!byId("eCatalogOffer");

    return standing && bootHeld && listHeld && hostFileHeld && watchHeld && dropHeld && impTextHeld && pickerHeld
      && bootPlayed && listPlayed && dropPlayed && impPlayed && watchPlayed && worksPicker && worksHostFile;
  } finally {
    ST.nsDel("WatchName"); ST.nsDel("WatchSeen"); ST.lsDel("eTourDone_v3"); ST.lsDel("eTourInvite_v3");
    if (!hadIdb) delete globalThis.indexedDB; else globalThis.indexedDB = prevIdb;
    if (!hadOfferHook) delete HK.hooks.offerPickedCatalog; else HK.hooks.offerPickedCatalog = prevOfferHook;
    if (!hadRenderHook) delete HK.hooks.render; else HK.hooks.render = prevRenderHook;
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
    if (!hadAdd) delete globalThis.addEventListener; else globalThis.addEventListener = prevAdd;
    if (!hadRem) delete globalThis.removeEventListener; else globalThis.removeEventListener = prevRem;
    if (!hadInner) delete globalThis.innerWidth; else globalThis.innerWidth = prevInner;
    if (!hadInnerH) delete globalThis.innerHeight; else globalThis.innerHeight = prevInnerH;
  }
};

/* B-3a2a step 3 + floor matter: over the standing door, keyboard answers only the door (Tab/Shift+Tab reach every door control
   including data-door-save, Enter/Space activate a focused door control natively without firing shortcuts, Escape/Ctrl+Z undo/
   Ctrl+W/Ctrl+Shift+T/SC_DEFS/typing/capture chords are all blocked; save IPC handlers remain untouched and unguarded). */
CASES.doorKeyboard = async (s, kdSwap) => {
  const KD_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "keydown.js"), "utf8");
  let kdText = KD_SRC;
  if (kdSwap) {
    if (kdText.split(kdSwap[0]).length !== 2) throw new Error("plant anchor not in keydown.js once: " + kdSwap[0]);
    kdText = kdText.replace(kdSwap[0], kdSwap[1]);
  }
  const capSlice = decl(kdText, "function wireCaptureKeydown(");
  const globSlice = decl(kdText, "function wireGlobalKeydown(");
  const runWith = (doorOpen) => {
    const capListeners = [], globListeners = [];
    let undoCalls = 0, shortcuts = [], focused = null, pageScrolls = 0;
    const btnSign = { tagName: "BUTTON", id: "signBtn", offsetWidth: 80, offsetHeight: 30, focus() { focused = btnSign; } };
    const btnSave = { tagName: "BUTTON", id: "saveBtn", dataset: { doorSave: "" }, offsetWidth: 80, offsetHeight: 30, focus() { focused = btnSave; } };
    const outsideEl = { tagName: "INPUT", id: "intent", value: "", selectionStart: 0, selectionEnd: 0, focus() {}, setSelectionRange() {}, dispatchEvent() {} };
    const fsEl = {
      id: "firstSignin",
      contains: el => el === btnSign || el === btnSave,
      querySelectorAll: () => [btnSign, btnSave],
    };
    const doc = {
      activeElement: btnSign,
      body: { classList: { contains: () => false } },
    };
    const tabTarget = (card, back) => {
      if (!card) return null;
      const els = [btnSign, btnSave];
      const at = doc.activeElement;
      if (!card.contains(at)) return back ? els[els.length - 1] : els[0];
      if (back && at === els[0]) return els[els.length - 1];
      if (!back && at === els[els.length - 1]) return els[0];
      return null;
    };
    const off = () => false;
    const own = {
      window: {}, document: doc,
      addEventListener: (k, fn, cap) => { if (k === "keydown") (cap ? capListeners : globListeners).push(fn); },
      $: sel => (sel === "#firstSignin" ? fsEl : null),
      scCaptureId: "", SC_DEFS: [{ id: "escape", fixed: false, inField: true }, { id: "tabNext", fixed: false, inField: true }, { id: "find", fixed: false, inField: true }],
      intentEl: outsideEl,
      tourActive: off, tourHasFocus: off, openCover: () => null, modalFront: off, edKeys: off, factsPanelOpen: off,
      eventMatchesAction: (e, id) => (id === "escape" && e.key === "Escape") || (id === "undo" && e.ctrlKey && e.key === "z")
        || (id === "tabNext" && e.ctrlKey && e.key === "Tab") || (id === "find" && e.ctrlKey && e.key === "k"),
      eHost: () => ({}),
      hooks: { runShortcut: id => { shortcuts.push(id); return true; } },
      noteUndoTyping: off,
      takeStandingUndo: () => { undoCalls++; return true; },
      typingInField: off,
      firstSigninOpenNow: () => doorOpen,
      tabTargetIn: tabTarget,
      pageKeyScroll: () => { pageScrolls++; return true; },
      lanesPageScroller: () => null,
      closeLooseOverlays: off,
      focusRingOn: () => true,
    };
    new Function("scope", "with(scope){\n" + capSlice + "\n" + globSlice + "\nwireCaptureKeydown();\nwireGlobalKeydown();\n}")(new Proxy(own, {
      has: () => true,
      get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : globalThis[k]),
    }));
    const send = (ev) => {
      const e = Object.assign({
        key: "", code: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, target: own.window,
        defaultPrevented: false, stopped: false, immediateStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.immediateStopped = true; this.stopped = true; },
      }, ev);
      for (const fn of capListeners) { fn(e); if (e.immediateStopped) break; }
      if (!e.stopped) { for (const fn of globListeners) fn(e); }
      return e;
    };
    return { doc, btnSign, btnSave, outsideEl, send, state: () => ({ undoCalls, shortcuts: shortcuts.slice(), focused, intentVal: outsideEl.value, pageScrolls }) };
  };

  /* Door open: Tab / Shift+Tab reach data-door-save, Enter / Space press it without preventDefault, everything else is blocked. */
  const d = runWith(true);
  d.doc.activeElement = d.outsideEl;
  const tabIn = d.send({ key: "Tab" });
  const landedSign = d.state().focused === d.btnSign && tabIn.defaultPrevented;
  d.doc.activeElement = d.btnSign;
  const shiftWrap = d.send({ key: "Tab", shiftKey: true });
  const reachedSave = d.state().focused === d.btnSave && shiftWrap.defaultPrevented;
  d.doc.activeElement = d.btnSave;
  const enterSave = d.send({ key: "Enter", target: d.btnSave });
  const spaceSave = d.send({ key: " ", target: d.btnSave });
  const savePressable = !enterSave.defaultPrevented && !spaceSave.defaultPrevented && !enterSave.stopped && !spaceSave.stopped;
  const undoEv = d.send({ key: "z", ctrlKey: true });
  const ctrlW = d.send({ key: "w", code: "KeyW", ctrlKey: true });
  const ctrlShiftT = d.send({ key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
  const ctrlTab = d.send({ key: "Tab", code: "Tab", ctrlKey: true });
  const ctrlK = d.send({ key: "k", code: "KeyK", ctrlKey: true });
  const escEv = d.send({ key: "Escape" });
  const typeEv = d.send({ key: "a" });
  const ctrlMod = d.send({ key: "Control", ctrlKey: true });
  const outsideTarget = d.send({ key: "Enter", target: d.outsideEl });
  d.doc.activeElement = d.outsideEl;
  const enterOutside = d.send({ key: "Enter" });
  const st = d.state();
  const allBlocked = st.undoCalls === 0 && st.shortcuts.length === 0 && st.intentVal === "" && st.pageScrolls === 0
    && undoEv.defaultPrevented && ctrlW.defaultPrevented && ctrlShiftT.defaultPrevented && ctrlTab.defaultPrevented
    && ctrlK.defaultPrevented && escEv.defaultPrevented && typeEv.defaultPrevented
    && ctrlMod.immediateStopped && outsideTarget.immediateStopped && enterOutside.defaultPrevented;

  /* Control: door closed -> Ctrl+Z calls undo, Ctrl+W runs tabClose, printable key types into intent. */
  const c = runWith(false);
  c.doc.activeElement = null;
  c.send({ key: "z", ctrlKey: true });
  c.send({ key: "w", code: "KeyW", ctrlKey: true });
  c.send({ key: "a" });
  const cst = c.state();
  const controlOk = cst.undoCalls === 1 && cst.shortcuts.includes("tabClose") && cst.intentVal === "a";

  /* Floor matter: save IPC handlers stay unguarded and untouched. */
  const chooseAt = MAIN.indexOf('ipcMain.handle("etiuda:choose-catalog-save",');
  const writeAt = MAIN.indexOf('ipcMain.handle("etiuda:write-catalog-save",');
  const chooseBody = chooseAt > 0 ? MAIN.slice(chooseAt, MAIN.indexOf("\n});", chooseAt)) : "";
  const writeBody = writeAt > 0 ? MAIN.slice(writeAt, MAIN.indexOf("\n});", writeAt)) : "";
  const saveOpen = chooseBody.length > 0 && writeBody.length > 0
    && !/signinWorks|deskWorks|pickerWorks/.test(chooseBody + writeBody);

  return landedSign && reachedSave && savePressable && allBlocked && controlOk && saveOpen;
};

/* B-3a2a step 4 (page side): answerPick refuses every op when deskWorks() is false without reading catalog or layer,
   returning a refusal shape the picker reads as nothing to show, and answers as before when deskWorks() is true. */
CASES.pickAskDoor = async (s, pickSwap) => {
  const SGN = await import(pathToFileURL(path.join(ROOT, "src", "modules", "signin.js")).href);
  const PKM = pickSwap
    ? await freshPageMod("pick.js", pickSwap)
    : await import(pathToFileURL(path.join(ROOT, "src", "modules", "pick.js")).href);
  const AS = await import(pathToFileURL(path.join(ROOT, "src", "modules", "app-state.js")).href);
  const PK = await import(pathToFileURL(path.join(ROOT, "src", "modules", "pack.js")).href);
  const ST = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const DOM = await import(pathToFileURL(path.join(ROOT, "src", "modules", "dom.js")).href);
  const HK = await import(pathToFileURL(path.join(ROOT, "src", "modules", "hooks.js")).href);
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  const hadRailHook = "railDecorate" in HK.hooks, prevRailHook = HK.hooks.railDecorate;
  const prevCards = AS.cards.slice();
  const prevUses = Object.assign({}, PK.pack.useCounts || {});
  try {
    globalThis.document = {
      querySelector: sel => (sel === "#pax" || sel === "#roleSel" ? { value: "" } : null),
      getElementById: id => (id === "pax" || id === "roleSel" ? { value: "" } : null),
      createElement: () => ({ getContext: () => ({}) }),
      createRange: () => ({}),
    };
    DOM.grabDom();
    HK.hooks.railDecorate = () => {};
    AS.putLang("en");
    AS.setCards([{ id: "c-door", c: "orders", t: "Door card", en: "Secret reply body." }]);
    ST.lsSet("eNameAsked", "1"); ST.lsSet("eAgent", "Kate");
    const unseated = { offered: ["microsoft"], signedIn: "", works: false, online: true, registered: true };
    const seated = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: true, online: true, registered: true,
      now: NOW, until: NOW + DAY_MS, holding: { on: "trial", ends: NOW + DAY_MS } };
    let cur = unseated;
    globalThis.window = { E_HOST: { signinState: () => cur } };
    SGN.signinNow();
    const usesBefore = (PK.pack.useCounts && PK.pack.useCounts["c-door"]) || 0;
    const emptyOps = ["find", "who", "tab", "lang", "suggest-take", "suggest-rows"];
    const nullOps = ["open", "copy", "ask", "suggest-profiles", "suggest-open", "search-shortlist", "search-reorder", "tour"];
    const emptyOk = emptyOps.every(op => {
      const r = PKM.answerPick(op, JSON.stringify({ q: "door", id: "c-door", name: "Ana" }));
      return !!r && Array.isArray(r.rows) && r.rows.length === 0 && r.count === "";
    });
    const nullOk = nullOps.every(op => PKM.answerPick(op, JSON.stringify({ id: "c-door", vi: 0, q: "door" })) === null);
    const noStats = ((PK.pack.useCounts && PK.pack.useCounts["c-door"]) || 0) === usesBefore;

    /* Control: seated view -> answerPick answers with the real card as before. */
    cur = seated;
    SGN.signinChanged(seated, false);
    const found = PKM.answerPick("find", JSON.stringify({ q: "door" }));
    const copied = PKM.answerPick("copy", JSON.stringify({ id: "c-door", vi: 0 }));
    const worksOk = !!found && Array.isArray(found.rows) && found.rows.length === 1 && found.rows[0].id === "c-door"
      && !!copied && typeof copied.text === "string" && copied.text.indexOf("Secret reply body.") >= 0;
    return emptyOk && nullOk && noStats && worksOk;
  } finally {
    AS.setCards(prevCards);
    PK.pack.useCounts = prevUses;
    ST.lsDel("eNameAsked"); ST.lsDel("eAgent");
    if (!hadRailHook) delete HK.hooks.railDecorate; else HK.hooks.railDecorate = prevRailHook;
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
  }
};

/* B-3a2b checks 1 to 5: at the stop's instant on a live working page, pending writes flush once before the door rises,
   a failed or throwing flush still raises the door with pending retry state intact, half-written reply fields and unsaved edits
   stay untouched, the way-out button is reachable and pressable by keyboard at the instant, a returning seat lowers the door and
   plays waiting callbacks once, a working view raises/flushes nothing and a second stopped view repaints without flushing again. */
CASES.stopInstant = async (s, swap) => {
  const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
  const ST_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "storage.js"), "utf8");
  const KD_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "keydown.js"), "utf8");
  const HK = await import(dir + "hooks.js");
  let sgnText = PAGE;
  if (swap) {
    if (sgnText.split(swap[0]).length !== 2) throw new Error("plant anchor not in signin.js once: " + swap[0]);
    sgnText = sgnText.replace(swap[0], swap[1]);
  }
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  const hadAdd = "addEventListener" in globalThis, prevAdd = globalThis.addEventListener;
  const hadRem = "removeEventListener" in globalThis, prevRem = globalThis.removeEventListener;
  const hadSyncNotice = "syncSaveNotice" in HK.hooks, prevSyncNotice = HK.hooks.syncSaveNotice;
  const hadThrowCalls = "__b3a2bFlushThrows" in globalThis, prevThrowCalls = globalThis.__b3a2bFlushThrows;
  try {
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    HK.hooks.syncSaveNotice = () => {};
    const events = [], patches = [], classes = new Set();
    let onSigninCb = null, closePickerCalls = 0, failPatch = false;
    const seatedView = {
      offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "held",
      works: true, registered: true, online: true, now: NOW, until: NOW + DAY_MS, ended: 0, stoppedAt: 0,
      holding: { on: "own", ends: NOW + 30 * DAY_MS },
    };
    const stillWorkingView = Object.assign({}, seatedView, { ended: NOW + 100 });
    const stoppedView = {
      offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, seat: "lapsed",
      works: false, registered: true, online: true, now: NOW + DAY_MS + 1000, until: NOW + DAY_MS, ended: 0, stoppedAt: NOW + DAY_MS,
      holding: { on: "own", ends: NOW + DAY_MS },
    };
    const stoppedAgainView = Object.assign({}, stoppedView, { said: "unreached" });
    let cur = seatedView;
    const replyField = { tagName: "TEXTAREA", id: "replyDraft", value: "Half-written reply to customer", selectionStart: 0, selectionEnd: 0, focus() {}, setSelectionRange() {}, dispatchEvent() {} };
    let fsHidden = true;
    const fsEl = {
      id: "firstSignin",
      innerHTML: "",
      attrs: {},
      get hidden() { return fsHidden; },
      set hidden(v) {
        const next = !!v;
        if (fsHidden && !next) events.push("door");
        fsHidden = next;
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener() {},
      removeEventListener() {},
      contains: () => false,
      querySelector: () => null,
    };
    globalThis.document = {
      visibilityState: "visible",
      activeElement: replyField,
      body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
      addEventListener() {},
      removeEventListener() {},
      querySelector: sel => (sel === "#firstSignin" ? fsEl : sel === "#replyDraft" ? replyField : null),
    };
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      E_HOST: {
        deskRead: () => "{}",
        deskSave: () => true,
        deskPatch: (json, all) => {
          events.push("flush");
          if (failPatch) throw new Error("disk full");
          patches.push({ data: JSON.parse(json), all: !!all });
          return true;
        },
        signinState: () => cur,
        onSignin: fn => { onSigninCb = fn; },
        closePicker: () => { closePickerCalls++; },
      },
    };
    const storageUrl = "data:text/javascript;base64," + Buffer.from(ST_SRC.replace(/from "\.\//g, 'from "' + dir)).toString("base64");
    const ST = await import(storageUrl);
    const signinUrl = "data:text/javascript;base64," + Buffer.from(
      sgnText.replace(/from "\.\/storage\.js"/g, 'from "' + storageUrl + '"').replace(/from "\.\//g, 'from "' + dir)
    ).toString("base64");
    const pg = await import(signinUrl);

    pg.wireSignin();
    pg.bootFirstSignin();
    const startsWorking = pg.deskWorks() === true && pg.firstSigninStands() === false && fsEl.hidden === true && typeof onSigninCb === "function";

    /* Check 4a: view staying works:true raises nothing and flushes nothing. */
    ST.lsSet("ePendingEdit", "unsaved-value-1");
    cur = stillWorkingView;
    onSigninCb(stillWorkingView);
    const workingQuiet = events.length === 0 && patches.length === 0 && pg.firstSigninStands() === false && fsEl.hidden === true;

    /* Check 1: stop instant flushes pending edit once BEFORE raising door; reply field and edit stay intact. */
    cur = stoppedView;
    onSigninCb(stoppedView);
    const flushBeforeDoor = events.length === 2 && events[0] === "flush" && events[1] === "door"
      && patches.length === 1 && patches[0].data.ePendingEdit === "unsaved-value-1" && patches[0].all === true;
    const doorStood = pg.firstSigninStands() === true && pg.firstSigninOpenNow() === true && fsEl.hidden === false
      && classes.has("e-first-signin") && closePickerCalls === 1;
    const workUntouched = replyField.value === "Half-written reply to customer" && ST.lsGet("ePendingEdit") === "unsaved-value-1";

    /* Check 4b: second stopped view while door stands repaints and does not flush again. */
    cur = stoppedAgainView;
    onSigninCb(stoppedAgainView);
    const noDoubleFlush = patches.length === 1 && events.length === 2 && pg.firstSigninOpenNow() === true;

    /* Check 5: way-out button is in the stopped door and reachable + pressable by keyboard (Tab, Enter/Space). */
    const hasWayOut = fsEl.innerHTML.includes("data-door-save");
    let wayOutKbdOk = false;
    {
      const capSlice = decl(KD_SRC, "function wireCaptureKeydown(");
      const globSlice = decl(KD_SRC, "function wireGlobalKeydown(");
      const capLs = [], globLs = [];
      let focused = null;
      const btnBuy = { tagName: "BUTTON", id: "buyBtn", focus() { focused = btnBuy; } };
      const btnSave = { tagName: "BUTTON", id: "saveBtn", dataset: { doorSave: "" }, focus() { focused = btnSave; } };
      const doorEl = { id: "firstSignin", contains: el => el === btnBuy || el === btnSave };
      const kDoc = { activeElement: replyField, body: { classList: { contains: () => false } } };
      const tabT = (card, back) => {
        const els = [btnBuy, btnSave];
        const at = kDoc.activeElement;
        if (!card || !card.contains(at)) return back ? els[1] : els[0];
        return back ? (at === els[0] ? els[1] : els[0]) : (at === els[1] ? els[0] : els[1]);
      };
      const off = () => false;
      const own = {
        window: {}, document: kDoc,
        addEventListener: (k, fn, cap) => { if (k === "keydown") (cap ? capLs : globLs).push(fn); },
        $: sel => (sel === "#firstSignin" ? doorEl : null),
        scCaptureId: "", SC_DEFS: [{ id: "escape", fixed: false, inField: true }], intentEl: replyField,
        tourActive: off, tourHasFocus: off, openCover: () => null, modalFront: off, factsPanelOpen: off,
        eventMatchesAction: (e, id) => id === "escape" && e.key === "Escape", eHost: () => ({}),
        hooks: { runShortcut: () => true }, noteUndoTyping: off, takeStandingUndo: off, typingInField: off,
        firstSigninOpenNow: () => pg.firstSigninOpenNow(), tabTargetIn: tabT,
        pageKeyScroll: off, lanesPageScroller: () => null, closeLooseOverlays: off, focusRingOn: () => true,
      };
      new Function("scope", "with(scope){\n" + capSlice + "\n" + globSlice + "\nwireCaptureKeydown();\nwireGlobalKeydown();\n}")(
        new Proxy(own, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : globalThis[k]) })
      );
      const fire = ev => {
        const e = Object.assign({
          key: "", code: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, target: own.window,
          defaultPrevented: false, stopped: false, immediateStopped: false,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() { this.stopped = true; },
          stopImmediatePropagation() { this.immediateStopped = true; this.stopped = true; },
        }, ev);
        for (const fn of capLs) { fn(e); if (e.immediateStopped) break; }
        if (!e.stopped) for (const fn of globLs) fn(e);
        return e;
      };
      fire({ key: "Tab" });
      kDoc.activeElement = focused;
      fire({ key: "Tab" });
      kDoc.activeElement = focused;
      const enterEv = fire({ key: "Enter", target: btnSave });
      const spaceEv = fire({ key: " ", target: btnSave });
      const escEv = fire({ key: "Escape", target: btnSave });
      wayOutKbdOk = focused === btnSave && !enterEv.defaultPrevented && !spaceEv.defaultPrevented
        && !enterEv.stopped && !spaceEv.stopped && escEv.defaultPrevented;
    }

    /* Check 3: returning seat (works:true) lowers the door, keeps ended & fields unchanged, and plays waiting callbacks once. */
    let waited = 0;
    pg.whenDoorLowers(() => { waited++; });
    const heldWhileStopped = waited === 0;
    cur = seatedView;
    onSigninCb(seatedView);
    onSigninCb(seatedView);
    const returnedOk = heldWhileStopped && waited === 1 && pg.firstSigninStands() === false && pg.firstSigninOpenNow() === false
      && fsEl.hidden === true && !classes.has("e-first-signin")
      && pg.deskDoorState(pg.signinNow()).ended === 0
      && replyField.value === "Half-written reply to customer" && ST.lsGet("ePendingEdit") === "unsaved-value-1";

    /* Check 3b: seated, then Sign out (works false, signedIn "", door state "first"): the door raises as at a stop; the next seated view lowers it. */
    const signedOutView = { offered: ["microsoft", "google"], signedIn: "", works: false, registered: true, online: true, now: NOW + DAY_MS + 2000, ended: 0, stoppedAt: 0 };
    cur = signedOutView;
    onSigninCb(signedOutView);
    const signedOutRaises = pg.firstSigninStands() === true && pg.firstSigninOpenNow() === true && fsEl.hidden === false && classes.has("e-first-signin")
      && pg.deskDoorState(pg.signinNow()).state === "first" && replyField.value === "Half-written reply to customer";
    cur = seatedView;
    onSigninCb(seatedView);
    const signedOutLowers = pg.firstSigninStands() === false && fsEl.hidden === true && !classes.has("e-first-signin");

    /* Check 2a: failed flush (deskPatch throws) still raises door and keeps pending edit in storage's own retry. */
    events.length = 0;
    failPatch = true;
    ST.lsSet("ePendingEdit2", "unsaved-retry");
    cur = stoppedView;
    onSigninCb(stoppedView);
    const failedStorageFlushOk = events.length === 2 && events[0] === "flush" && events[1] === "door"
      && pg.firstSigninStands() === true && fsEl.hidden === false
      && ST.eSaveTrouble() !== null && ST.lsGet("ePendingEdit2") === "unsaved-retry"
      && replyField.value === "Half-written reply to customer";

    /* Check 2b: eDeskFlush itself throwing does not stop the door from rising. */
    globalThis.__b3a2bFlushThrows = 0;
    const throwStorageUrl = "data:text/javascript;base64," + Buffer.from(
      'export function eDeskFlush(){ globalThis.__b3a2bFlushThrows++; throw new Error("flush exploded"); }\n'
    ).toString("base64");
    const throwSigninUrl = "data:text/javascript;base64," + Buffer.from(
      sgnText.replace(/from "\.\/storage\.js"/g, 'from "' + throwStorageUrl + '"').replace(/from "\.\//g, 'from "' + dir)
    ).toString("base64");
    const pgThrow = await import(throwSigninUrl);
    fsHidden = true; classes.clear();
    let cb2 = null, cur2 = seatedView;
    globalThis.window.E_HOST = { signinState: () => cur2, onSignin: fn => { cb2 = fn; } };
    pgThrow.wireSignin();
    cur2 = stoppedView;
    cb2(stoppedView);
    const throwFlushOk = globalThis.__b3a2bFlushThrows === 1 && pgThrow.firstSigninStands() === true
      && fsEl.hidden === false && replyField.value === "Half-written reply to customer";

    return startsWorking && workingQuiet && flushBeforeDoor && doorStood && workUntouched
      && noDoubleFlush && hasWayOut && wayOutKbdOk && returnedOk && signedOutRaises && signedOutLowers && failedStorageFlushOk && throwFlushOk;
  } finally {
    if (!hadSyncNotice) delete HK.hooks.syncSaveNotice; else HK.hooks.syncSaveNotice = prevSyncNotice;
    if (!hadThrowCalls) delete globalThis.__b3a2bFlushThrows; else globalThis.__b3a2bFlushThrows = prevThrowCalls;
    if (!hadAdd) delete globalThis.addEventListener; else globalThis.addEventListener = prevAdd;
    if (!hadRem) delete globalThis.removeEventListener; else globalThis.removeEventListener = prevRem;
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
  }
};

/* B-3a2b check 6 (shell side): tellSignin hides a visible picker with hidePicker(false) (focus not forced) when
   signinWorksNow() is false, leaves a hidden picker untouched, and does not touch a visible picker when working. */
CASES.stopHidePickerShell = (s, swap) => {
  let text = decl(MAIN, "function tellSignin(") + "\n" + decl(MAIN, "function hidePicker(");
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in tellSignin once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const run = (works, visible) => {
    const sent = [], pickCalls = [];
    let isVis = visible;
    const pickWin = {
      isDestroyed: () => false,
      isVisible: () => isVis,
      blur: () => { pickCalls.push("blur"); },
      hide: () => { pickCalls.push("hide"); isVis = false; },
    };
    const theWindow = {
      isDestroyed: () => false,
      webContents: { send: (ch, v) => { sent.push([ch, v]); } },
    };
    const fn = new Function("theWindow", "signinView", "signinWorksNow", "pickWin", "pickTour", "pickTourGo", "askDesk",
      text + "\ntellSignin();");
    fn(theWindow, () => ({ works }), () => works, pickWin, false, "", () => {});
    return { sent, pickCalls, visible: isVis };
  };
  const stoppedVis = run(false, true);
  const stoppedHid = run(false, false);
  const workingVis = run(true, true);
  return stoppedVis.visible === false && stoppedVis.pickCalls.join() === "hide" && stoppedVis.sent.length === 1 && stoppedVis.sent[0][1].works === false
    && stoppedHid.visible === false && stoppedHid.pickCalls.length === 0 && stoppedHid.sent.length === 1
    && workingVis.visible === true && workingVis.pickCalls.length === 0 && workingVis.sent.length === 1 && workingVis.sent[0][1].works === true;
};

/* B-3a2b check 7: the browser build's door. With no host, deskWorks() is false, firstSigninDue() and doorHolds() are true,
   bootFirstSignin raises the door in EN and PL with no provider buttons, no Not now, no Escape bypass and data-door-save kept
   inert; offers and keyboard hold; document/field contents stay untouched; with a seated host stand-in the page works as on 1f141580. */
CASES.browserDoor = async (s, swap) => {
  const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
  const ST = await import(dir + "storage.js");
  const KD_SRC = fs.readFileSync(path.join(ROOT, "src", "modules", "keydown.js"), "utf8");
  const pg = await freshSignin(swap);
  const hadWin = "window" in globalThis, prevWin = globalThis.window;
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  const prevLang = ST.lsGet("eUiLang");
  try {
    const classes = new Set();
    const field = { tagName: "TEXTAREA", value: "kept text" };
    const fsEl = { hidden: true, innerHTML: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, contains: () => false, querySelector: () => null };
    globalThis.document = {
      activeElement: null,
      body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
      querySelector: sel => (sel === "#firstSignin" ? fsEl : null),
    };

    /* No window / no E_HOST / host without signinState: deskWorks false, firstSigninDue true, doorHolds true before boot. */
    delete globalThis.window;
    const noWinOk = pg.deskWorks() === false && pg.firstSigninDue() === true && pg.doorHolds() === true;
    globalThis.window = {};
    const noHostOk = pg.deskWorks() === false && pg.firstSigninDue() === true && pg.doorHolds() === true;
    globalThis.window = { E_HOST: {} };
    const bareHostOk = pg.deskWorks() === false && pg.firstSigninDue() === true && pg.doorHolds() === true;

    /* Offers wait behind doorHolds(); boot raises the browser door. */
    delete globalThis.window;
    let waitedCalls = 0;
    pg.whenDoorLowers(() => { waitedCalls++; });
    pg.wireSignin();
    pg.bootFirstSignin();
    const opened = pg.firstSigninOpenNow() === true && pg.firstSigninStands() === true && fsEl.hidden === false
      && classes.has("e-first-signin") && waitedCalls === 0;

    /* Words in both EN and PL through t(), no providers, no Not now, data-door-save kept inert. */
    ST.lsSet("eUiLang", "en");
    pg.paintFirstSignin();
    const enHtml = fsEl.innerHTML;
    const enOk = enHtml.includes("Etiuda works in its desktop app.") && enHtml.includes("In a browser, no catalog opens.")
      && enHtml.includes("Save your own work as files") && enHtml.includes("data-door-save") && /\bdisabled\b/.test(enHtml)
      && !enHtml.includes("sgn-provs") && !enHtml.includes("data-e-provider")
      && !enHtml.includes("firstSigninSkip") && !enHtml.includes("Not now") && !enHtml.includes("fs-skip");

    ST.lsSet("eUiLang", "pl");
    pg.paintFirstSignin();
    const plHtml = fsEl.innerHTML;
    const plOk = plHtml.includes("Etiuda dzia\u0142a w aplikacji na komputer.") && plHtml.includes("W przegl\u0105darce \u017caden katalog si\u0119 nie otwiera.")
      && plHtml.includes("Zapisz w\u0142asn\u0105 prac\u0119 jako pliki") && plHtml.includes("data-door-save") && /\bdisabled\b/.test(plHtml)
      && !plHtml.includes("sgn-provs") && !plHtml.includes("data-e-provider")
      && !plHtml.includes("firstSigninSkip") && !plHtml.includes("Nie teraz") && !plHtml.includes("fs-skip");

    /* Pushing a working view with no host still keeps the door standing; field content untouched. */
    pg.signinChanged({ offered: ["microsoft"], signedIn: "microsoft", works: true }, false);
    const holdsWithoutHost = pg.deskWorks() === false && pg.firstSigninOpenNow() === true && waitedCalls === 0 && field.value === "kept text";

    /* Keyboard blocks Escape while browser door stands. */
    let escBlocked = false;
    {
      const globSlice = decl(KD_SRC, "function wireGlobalKeydown(");
      let kdListener = null, escRan = 0;
      const off = () => false;
      const own = {
        document: { activeElement: null, body: { classList: { contains: off } } },
        addEventListener: (k, fn) => { if (k === "keydown") kdListener = fn; },
        $: sel => (sel === "#firstSignin" ? fsEl : null), scCaptureId: "", SC_DEFS: [{ id: "escape", fixed: false, inField: true }],
        intentEl: null, tourActive: off, tourHasFocus: off, openCover: () => null, modalFront: off, factsPanelOpen: off,
        eventMatchesAction: (e, id) => id === "escape" && e.key === "Escape", eHost: off, hooks: { runShortcut: () => { escRan++; } },
        noteUndoTyping: off, takeStandingUndo: off, typingInField: off, firstSigninOpenNow: () => pg.firstSigninOpenNow(), tabTargetIn: () => null,
      };
      new Function("scope", "with(scope){\n" + globSlice + "\nwireGlobalKeydown();\n}")(
        new Proxy(own, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : globalThis[k]) })
      );
      let prevented = false;
      if (kdListener) kdListener({ key: "Escape", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false,
        preventDefault() { prevented = true; }, stopPropagation() {} });
      escBlocked = prevented === true && escRan === 0;
    }

    /* Seated host stand-in control: fresh module behaves as on 1f141580 (no door raised, offers play). */
    const pgSeated = await freshSignin(swap);
    const seated = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: true, registered: true, online: true,
      now: NOW, until: NOW + DAY_MS, holding: { on: "trial", ends: NOW + DAY_MS } };
    fsEl.hidden = true; fsEl.innerHTML = ""; classes.clear();
    globalThis.window = { E_HOST: { signinState: () => seated } };
    pgSeated.signinNow();
    pgSeated.bootFirstSignin();
    let ranAtOnce = 0;
    pgSeated.whenDoorLowers(() => { ranAtOnce++; });
    const seatedOk = pgSeated.deskWorks() === true && pgSeated.firstSigninDue() === false && pgSeated.doorHolds() === false
      && pgSeated.firstSigninStands() === false && fsEl.hidden === true && ranAtOnce === 1;

    return noWinOk && noHostOk && bareHostOk && opened && enOk && plOk && holdsWithoutHost && escBlocked && seatedOk;
  } finally {
    if (prevLang === null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", prevLang);
    if (!hadWin) delete globalThis.window; else globalThis.window = prevWin;
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
  }
};
/* A LEAD'S ACT ENDS THE SEAT (class A, the desk's half; Claude alpha's ruling of 22 November 2026): a certificate's remaining life is a
   grace for a seat that still stands, never against a lead who freed it or withdrew its person. The service's answer to that renewal is
   its own "signin" (tests/signin-answers.json: "a renewal of a seat its lead freed"); every other answer keeps the certificate as before. */
const FREED_EN = ["This account's seat on the team has been taken back.",
  "A lead can bring it back with a new invitation to this account's email address: after signing in again, it appears here with one Join. Nothing on this computer is lost meanwhile."];
const FREED_PL = ["Miejsce tego konta w zespole zostało odebrane.",
  "Lider zespołu może je przywrócić nowym zaproszeniem na adres e-mail tego konta: po ponownym zalogowaniu pojawi się tutaj z jednym przyciskiem Dołącz. Do tego czasu nic na tym komputerze nie przepada."];
const FREED_TEAM = { on: "team", ends: NOW + 99 * DAY_MS, lead: "Ada" };
/* The freed answer, read as the service gives it, sets the certificate and its doors aside and stamps `freed` with the desk's time, at a
   settle and at a quiet renewal alike: the desk works no more, the view says so, the file keeps the mark and no certificate, and the
   next certificate clears it. */
CASES.freedEnds = async s => {
  const c = ANSWER_CASES.find(x => x.case === "signin");
  if (!c) return false;
  const ans = s.signinAnswer({ status: c.status, bytes: Buffer.from(JSON.stringify(c.body)) }, DESK_KEY);
  const before = heldOf({ seated: true, doors: [], holding: FREED_TEAM });
  const h = s.signinSettle(before, ans, NOW, NOW + 7);
  const io = Object.assign(renewIo(answer({ id_token: jwt(msClaims(undefined)) }), answer({ ok: false, reason: "signin" }, 403)), { deskNow: () => NOW + 9 });
  const renewed = await s.signinRenewHeld(io, MS, DESK_KEY, heldOf({ seated: true }), () => NOW);
  const v = s.signinViewOf(h, viewFacts({ last: before.cert.until }));
  const back = s.signinFileRead(s.signinFileText({ held: h })).held;
  const again = s.signinSettle(h, { ok: true, code: CODE, cert: cert({ issued: NOW + 10 }), doors: [] }, NOW + 10);
  return ans.ok === false && ans.reason === "signin" && h.cert === null && Array.isArray(h.doors) && h.doors.length === 0 && h.doorsSig === "" && h.freed === NOW + 7
    && h.refresh === "" && h.ask === true && s.signinWorks(h, DESK_KEY, NOW + 8) === false
    && v.works === false && v.freed === NOW + 7 && v.seat === "none" && v.stoppedAt > 0
    && renewed.said === "signin" && renewed.held.cert === null && renewed.held.freed === NOW + 9
    && !!back && back.cert === null && back.freed === NOW + 7 && !!again.cert && !("freed" in again);
};
/* What the person has stays: the freed renewal, through the shell's own wiring, keeps the account, its code, its seat's and trials' words
   and the store's offer, removes and writes no file, and neither leaves nor forgets the store, so personal catalogs, the store and any
   editor's text stay on disk and come back with a seat. */
CASES.freedKeeps = async (s, swap) => {
  const ops = [];
  const watched = new Proxy(fs, { get: (t, k) => /^(unlink|rm|rmdir|writeFile|appendFile|rename|truncate|copyFile|cp)/.test(String(k)) ? (...a) => { ops.push(String(k)); } : t[k] });
  const st = wireStand(s, () => answer({ id_token: jwt(msClaims(undefined, Date.now())) }), () => answer({ ok: false, reason: "signin" }, 403));
  st.fs = watched;
  st.storeForget = () => { st.forgets = (st.forgets || 0) + 1; };
  const before = heldOf({ seated: true, holding: FREED_TEAM, trials: { desk: NOW - DAY_MS }, storeOffer: true });
  st.store.held = before;
  const said = await loadWire(st, swap).signinRenewNow();
  const h = st.store.held, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return said === "signin" && !!h && h.cert === null && h.freed > 0 && h.provider === "microsoft" && h.sub === before.sub && h.seed === before.seed && h.code === CODE
    && h.seated === true && same(h.holding, before.holding) && same(h.trials, before.trials) && h.storeOffer === true
    && ops.length === 0 && st.unlinked.length === 0 && !st.storeLeaves && !st.storeTurns && !st.forgets && st.saves >= 1 && st.tells >= 1;
};
/* The door says it plainly, in English and Polish, on the full screen and in the panel, with a press to sign in again; a desk stopped for
   any other reason is told as before. */
CASES.freedDoor = async (s, page) => {
  const pg = page || P;
  if (!pg) return false;
  const storage = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);
  const words = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const h = s.signinSettle(heldOf({ seated: true, holding: FREED_TEAM }), { ok: false, reason: "signin" }, NOW, NOW + 7);
  const v = pg.signinRead(s.signinViewOf(h, viewFacts({ last: NOW + 30 * DAY_MS })));
  const ds = pg.deskDoorState(v), pair = pg.deskDoorLines(ds), html = pg.firstSigninHtml(v), screen = words(html), panel = pg.signinDoor(v);
  const stopped = pg.deskDoorState(pg.signinRead(s.signinViewOf(heldOf({ seated: true, cert: null, holding: FREED_TEAM }), viewFacts({ last: NOW }))));
  storage.lsSet("eUiLang", "pl");
  let plPair = null, plScreen = "";
  try { plPair = pg.deskDoorLines(pg.deskDoorState(v)); plScreen = words(pg.firstSigninHtml(v)); } finally { storage.lsSet("eUiLang", "en"); }
  return ds.state === "freed" && pair[0] === FREED_EN[0] && pair[1] === FREED_EN[1] && screen.indexOf(FREED_EN[0]) >= 0 && screen.indexOf(FREED_EN[1]) >= 0
    && /data-signin-act="another"[^>]*>Sign in again</.test(html) && screen.indexOf("has stopped") < 0
    /* No Check now and no note promising it: with no refresh token it would ask nothing. */
    && html.indexOf('data-signin-act="check"') < 0 && screen.indexOf("Check now") < 0
    && !!panel && panel.moment === "freed" && panel.heading === FREED_EN[0] && panel.line === FREED_EN[1] && Array.isArray(panel.providers) && panel.providers.join() === "microsoft"
    && !!plPair && plPair[0] === FREED_PL[0] && plPair[1] === FREED_PL[1] && plScreen.indexOf(FREED_PL[0]) >= 0 && plScreen.indexOf("Zaloguj się ponownie") >= 0
    && stopped.state === "stopped";
};
/* Every other refusal, the wait, the service's none (a lapsed payment, `ended` as before) and a provider's refusal keep the certificate,
   the desk working on it, and stamp nothing. */
CASES.freedOthers = async s => {
  const h = heldOf({ seated: true });
  const keeps = r => !!r && r.cert === h.cert && !("freed" in r) && s.signinWorks(r, DESK_KEY, NOW + 8) === true;
  const refused = ["unreached", "full", "token", "desks", "no-role"].map(reason => s.signinSettle(h, { ok: false, reason }, NOW, NOW + 7));
  const wait = s.signinSettle(h, { ok: true, code: CODE, cert: null, waiting: true }, NOW, NOW + 7);
  const lapsed = s.signinSettle(h, { ok: true, code: CODE, cert: null }, NOW, NOW + 7);
  const provider = await s.signinRenewHeld(renewIo(answer({ error: "invalid_grant" }, 400), answer({})), MS, DESK_KEY, h, () => NOW);
  return refused.every(keeps) && keeps(wait) && keeps(lapsed) && lapsed.ended === NOW + 7 && keeps(provider.held) && provider.said !== "signin";
};
const LEGS = [
  ["ds1a", "offered", "as shipped no client id is configured and nothing is offered; a configured table offers what it configures, in order"],
  ["ds1b", "noHintStart", "an invitation naming providers carries no sign-in hint: the team's start is retired"],
  ["ds2a", "pkce", "the authorize URL carries PKCE (S256 over the verifier), the state, the nonce and a 127.0.0.1 loopback, at the provider's own page"],
  ["ds2b", "nonceBound", "the nonce is the service's SHA-256 of its line, this desk's key and the seed, and is not another desk key's"],
  ["ds2c", "tokenNonce", "a token is taken only for this client and issuer, unexpired, carrying this desk's nonce; another key's nonce or none is unbound"],
  ["ds2d", "state", "a wrong or missing state is refused before anything else of the answer is read"],
  ["ds2e", "flow", "the whole path at the provider with stand-ins: the token's nonce is made again from this desk's key and the seed, no client secret sent"],
  ["ds2f", "notAllowed", "the organisation's refusal at the provider is its own reason, apart from the person's Cancel and any other refusal"],
  ["dso", "storeOffer", "the store offered only by storeOffer true beside a seating answer, absent, null and every other value none; said afresh by each seating answer, kept where one does not reach"],
  ["dsb", "buyWords", "what the person pays and what is held, beside a seating answer: pays by deskOnly alone, the portal only where Stripe's own link, the first readable held entry; said afresh, kept where an answer does not reach, kept in signin.json and read typed; the page's view carries the portal as a yes or no"],
  ["ds3a", "deskBody", "signin/desk's body has the interface's names alone, signed by this desk's key over the service's bytes; the seed on a first sign-in only"],
  ["ds3b", "serviceDoor", "the service's door posts JSON to signin/desk alone, no redirect, nothing cached, no cookie, nothing over 8 KiB"],
  ["ds3c", "answers", "the service's answers read as the interface names them; a certificate for another desk or code is not taken"],
  ["ds3g", "managedRead", "a managed tenant: the service's word that it is managed, and why, read from a seat and a no-role refusal and kept; an ordinary answer clears it"],
  ["ds3d", "seatFile", "seat.json is {format: 2, desk, certificate}, the certificate whole and no token"],
  ["ds3e", "settle", "a refusal keeps the last certificate, a freed seat forgets the refresh token and sets its certificate aside, a service away is only marked, none keeps a held certificate with ended stamped and takes none where none was held"],
  ["ds3f", "lapse", "the calm lapse: lapsed once the kept certificate's until has passed, never with no certificate"],
  ["ds4b", "door", "the provider's door asks only its own token address, by POST, no redirect followed, nothing cached, no cookie"],
  ["ds4c", "keep", "the refresh token is sealed by a real keyring and never kept on Linux's basic_text"],
  ["ds4d", "loopOnce", "the loopback answers 404 to anything but GET /, answers the GET / it takes once (303 to its landing), and closes once the landing is served"],
  ["ds6a", "loopStray", "a GET / with no state or another state is answered 400 and ignored, and the reply with the state ends it"],
  ["ds6b", "loopFlow", "through signinRun on a real loopback, two strays leave the sign-in waiting and the browser's reply completes it"],
  ["ds6c", "scopes", "the first sign-in asks Microsoft for openid profile email offline_access and Google for openid email profile; a refresh asks Microsoft what it asked before and Google nothing"],
  ["ds7a", "renewWrite", "a refreshed token with the seat's sub goes to signin/desk with no seed, signed by this desk's key, and the new certificate is kept"],
  ["ds7b", "renewRefuse", "another sub or another desk's nonce posts nothing, forgets the refresh token and asks the person"],
  ["ds7c", "renewFail", "the provider or the service away, or the service refusing, keeps the certificate and the code; a freed seat asks the person, its certificate set aside"],
  ["ds7d", "renewHarness", "signinRenewNow returns at once on a harness start, reading and asking nothing"],
  ["ds7e", "renewDaily", "the renewal runs once at each start, soon after the window, then daily by a named constant, and never from a harness start"],
  ["ds7f", "renewWire", "the wiring keeps and writes a renewed certificate and tells the page; a provider no longer offered is never asked"],
  ["ds8a", "pageNone", "the page draws no door where nothing is offered and nobody is signed in"],
  ["ds8b", "pageMoments", "the door's content follows the view: before, waiting, refused, no licence, no team, no seat, sign in again"],
  ["ds8c", "pageTwoRefusals", "the organisation's refusal at its provider and no licence at our service are two moments, each in its own words"],
  ["ds8d", "pageNothingFromProvider", "the identity is the person's own name and the provider's name, no code (board 1017), nothing from the provider"],
  ["ds9a", "signoutBody", "signout/desk's body has the interface's three names alone, signed by this desk's key over the service's bytes"],
  ["ds9b", "signoutPost", "Sign out posts exactly one signout/desk, the three names, a fresh t and a signature that verifies, before the sign-in is cleared, and nothing stays owed once it is taken"],
  ["ds9c", "signoutAway", "with the service unreached, throwing or answering 503 or a refusal, Sign out still clears the sign-in, says no refusal, and keeps the place owed, the page told once more"],
  ["ds9m", "signoutManaged", "Sign out forgets that the account's organisation holds its licence, signed in or not, so Buy is offered again"],
  ["ds9d", "signoutNone", "no signout/desk is sent where no client id is configured or the desk was never signed in; a sign-in in the browser is left alone"],
  ["ds9e", "signoutDoor", "the service's door carries signout/desk at its own address alone, no redirect, nothing cached, no cookie"],
  ["ds10a", "flushJoin", "a desk signed in first writes its seat beside its request to join a folder team, and again where the file went or the folder changed"],
  ["ds10d", "flushOwnKey", "a certificate given to another desk key is never written as this desk's seat; this key's is"],
  ["ds10b", "flushCallers", "the seat is written when a request to join is written, and after a join taken or finished or a folder changed"],
  ["ds10c", "flushJoinReach", "a folder invitation taken and an admission heeded both reach the folder change, and so the seat's write"],
  ["ds11a", "doorRequest", "a request at the relay's door carries the seat as seat.json has it and the relay's id, and names no invitation"],
  ["ds11b", "doorInvite", "the channel knocks at the door with this desk's standing certificate and the lead's box, and with nothing else"],
  ["ds11e", "doorAsksSeat", "signed in with no certificate it may knock with (none yet, another desk key's, one run out, one its own revocation list covers), the door hands the channel a seatless request, marked a door (door false) with the lead's box, the request's id where the relay named one, and no certificate, and asks no renewal itself; signed out, or for another relay team, it hands nothing; a standing certificate knocks"],
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
  ["ds14e", "waitingAgain", "review 9: during the folder step (waiting with no link, where Open the browser again returns false), Open the browser again is not offered in the panel or Account"],
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
  ["ds14g", "copiedLabel", "the link's Copy (the code's gone, board 1017) reads Copied for SIGNIN_COPIED_MS after a copy the clipboard took, then Copy, holding the wider width; a refused copy leaves it; Polish too"],
  ["ds15a", "identNoName", "with no name written the identity's bold line is \"Signed in with\" its provider and there is no second line, in the panel's every signed-in moment and in Account; a name written stands over it; Polish too"],
  ["ds15b", "panelOrder", "the panel tells no licence as it tells no team: the fact, its line, no code's box (board 1017), under the identity and above the acts"],
  ["ds16a", "labPackaged", "THE LAB IS INERT PACKAGED: installed, packaged or both, ETIUDA_SIGNIN_LAB naming a lab or a staging file and Google's secret in the environment, nothing is read and the providers, what is offered, the secret and both doors are byte for byte the shipped ones; unpackaged, the lab is taken, a staging file fills the shipped two's client ids alone, the secret goes to Google alone, and a file naming another host is refused whole"],
  ["ds16b", "labRead", "the lab file is taken whole or not at all: the service http on 127.0.0.1 or https on etiuda.dev; client ids for the shipped two alone; the provider \"lab\" optional, its authorize and token http on 127.0.0.1 alone, its issuer and key set also https on a .localhost name, openid; a root optional, of 64 hex"],
  ["ds16c", "labPath", "pointed at a lab over real HTTP, the real path runs unchanged: the browser's redirect to the loopback, the code exchange with PKCE, the token checks, signin/desk's certificate, a refresh, a sign out; the shipped door and other ports refused"],
  ["ds16d", "labHarness", "a harness start renews and signs out only while the lab is taken, and reads nothing for it while no lab is taken"],
  ["ds16e", "labPage", "the page draws the lab's provider as it draws the shipped two and keeps its 127.0.0.1 link while it waits, no other provider's http link"],
  ["ds16f", "labOnly", "nothing else points the sign-in: the variable read in the lab's read alone, the table and both doors assigned in signinLabUse alone, called by the lab's read and the test service build's; no IPC, preload or page module names the file"],
  ["ds16g", "stagingCmd", "tools/signin-staging.cmd is outside the packaged files and starts this tree's own Electron with a profile of its own, never the installed desk, with ETIUDA_SIGNIN_LAB for that start alone"],
  ["ds18a", "waitRead", "no free seat is a wait: the service's 200 with no certificate and the reason \"waiting\" is kept as the said reason with the refresh token, asking nobody; none without it stays no licence; the certificate after it ends the wait; a 409 \"full\" reads as before"],
  ["ds18b", "waitRenew", "the quiet renewal while waiting waits again with its token renewed and nobody asked, and seats the desk once a seat frees; an older service's \"full\" keeps its token as before"],
  ["ds21a", "doorPolicy", "machine policy binds a door as an invitation: only the named lead's where it names a lead, a folder it names binding nothing; a press at a door not offered changes nothing"],
  ["ds21b", "doorPins", "no door while a pinned team stands; a team the roster or the relay took off leaves the doors; a door of a team pinned under another lead is not offered, under the same lead it is"],
  ["ds21c", "doorUnbar", "a team left, or whose key did not match, is offered at its door, and the press lifts the leave and the doubt after Cancel's snapshot has taken them"],
  ["ds21d", "doorCancel", "Cancel at a door the relay named withdraws the request there and keeps the join until the relay takes it; a door request never named or turned away goes at once; an accepted invitation as before"],
  ["ds21e", "doorWithdrawnEnds", "a door request's withdrawal taken, or nothing left to take, ends the join and puts back what it changed; an invitation's waits withdrawn as before"],
  ["ds21f", "doorWithdrawInvite", "a door request being withdrawn gives the channel its id and the lead's box and never the certificate, signed in or out, so it resumes and never knocks again; unnamed or turned away, nothing"],
  ["ds21g", "signoutUnlinkOwn", "Sign out on a folder team takes seat.json out through the desk's own removal, owed to the share, never a bare unlink"],
  ["ds21h", "signoutAfterRenew", "Sign out during a renewal sends signout/desk only once the renewal has its answer, so the service takes the sign out last, and the renewal's answer is not kept"],
  ["ds21i", "signoutOwed", "a sign out the service did not take is owed in the file with the desk key, asked again at the renewal's next turn while signed out, and cleared once taken"],
  ["ds21j", "signoutDoorJoin", "Sign out lets go of a request made at a team's door through Cancel; an invitation's request, or none, is left alone"],
  ["ds21m", "cancelUnsent", "Cancel at a door or by a token, and Sign out at a door, take the request back through the relay only where one went up or its reply was lost; where none did the join goes at once and what it changed is put back"],
  ["ds21k", "outOwedView", "the page is told a sign out is owed only while nobody is signed in and none is out"],
  ["ds21l", "outOwedPage", "the page keeps an owed sign out only while signed out, and Account says so under Not signed in in the copywriter's words, Polish too, and nothing otherwise"],
  ["ds18c", "waitPage", "the door and Account tell the wait in the copywriter's words, the licence form and the team form, English and Polish, Check now first; an older service's \"full\" the same; no licence its own moment; today's words gone"],
  ["ds19a", "toldRenewal", "a renewal or Check now the service refuses is said in the door and Account in the copywriter's words: \"desks\" with Check now, \"token\" or any other kept reason settled by signing in again, the providers under it; Polish too"],
  ["ds19b", "toldPressed", "a sign-in pressed while signed in that fails says the desk stays signed in, then the reason's own heading where it has one, with Try again or Use another account; a cancel or a sign-in done says nothing; the door and Account, Polish too"],
  ["ds19c", "checkGap", "Check now asks once per SIGNIN_CHECK_GAP_MS, and a clock set back since the last press does not hold it up"],
  ["ds19d", "saidCleared", "a renewal that reached its end clears a failed press's said, so no stale refusal stands over the desk"],
  ["ds20a", "renewAsk", "Google authorizes with access_type=offline and select_account alone; a renewal with no refresh token or an unopenable sub asks for sign-in again without reaching the provider, in the copywriter's English and Polish words"],
  ["ds24a", "landSeat", "the sign-in's own reply is answered 303 to a path of the loopback's own with no code, no state and no query; landed, that path's one GET is the seat's page in the copywriter's words under a policy that fetches, frames and runs nothing, and the loopback closes"],
  ["ds24b", "landHeld", "the clean path asked before the desk knows is held unanswered, and land() answers it with that outcome"],
  ["ds24c", "landCap", "nothing landed within the cap: the held GET is answered the neutral page and the loopback closes"],
  ["ds24k", "landCancel", "Cancel after the reply and before the landing answers the held GET the cancelled page and closes the loopback at once"],
  ["ds24d", "landStray", "a stray state is answered 400 with the earlier tab's page and the wait goes on; after the reply, another GET of / and any other path or query are 404 and the landing still serves"],
  ["ds24e", "landOnce", "a second GET of the clean path is refused at once, and the first still gets its page"],
  ["ds24f", "landKinds", "each end tells its landing: cancelled (access_denied, AADSTS65004), the organisation (consent_required, AADSTS65001, 90094), could not be finished for any other end the desk knows (the provider's refusal, a code it no longer takes, the service refusing or away); a seat, no seat yet (no certificate, waiting, full)"],
  ["ds25a", "revokedTaken", "the revoked keys' list is taken, signed, from the service's answer at a first sign-in and at the renewal, from a refusal too, and kept in signin.json"],
  ["ds25b", "revokedForged", "a list not the vendor's or not later than the one kept is not taken: another root, a made-up signature, keys out of order, an older or the same serial, a later one dropping a kept key, a field more; from an answer or the file alike"],
  ["ds25c", "revokedOffline", "offline, or answered with no list, the last list taken judges: the seat under its key stays lapsed"],
  ["dlt1", "fileMark", "review 15b.1: signin.json as the desk writes it carries this desk's mark over the certificate, the code and the list; the list deleted or replaced by an older genuine one, the mark gone or read under another desk key, leaves no seat and no code while the provider and the refresh token stay; the wiring reads with this desk's key and saves with its mark"],
  ["dlt4", "fileOtherPerson", "review 15b.4: a genuine certificate for this desk key under another person and licence, put into a file this desk wrote, holds no seat; the same certificate as the service gave it, written by the desk, stands"],
  ["dlt7", "fileMax", "review 15b.7: a signin.json past SIGNIN_FILE_MAX (256 KiB) is not read and is no sign-in; one of the size the desk writes is read once and seats it"],
  ["dlt6", "viewCertCode", "review 15b.6: the code the page shows and Buy sends is the held certificate's own; with no certificate, the code held"],
  ["dlt5", "fileDeskKey", "review 15b.5: the file's certificate is judged against this desk's key: another desk's genuine one, or one naming no key, holds no seat even under this desk's own mark, where the file's own read alone keeps it"],
  ["dlt3", "certEndedFlush", "review 15b.3: an ended certificate, up to the instant of its until, reads as the calm lapse and is never written as seat.json; one still running is"],
  ["dlt2", "certEarly", "review 15b.2: a certificate issued past now and the five minutes reads as the calm lapse and stands nowhere: no door asked, offered or knocked, no seat.json; one issued inside the five minutes stands"],
  ["ds25d", "revokedLapse", "a seat under a listed key reads as the calm lapse in the view and on the page, and no door is offered, no knock sent, no request or seat.json written; under another key all stand"],
  ["ds25e", "revokedMend", "the next sign-in mends it: a certificate under a key the list does not name ends the lapse, the list kept"],
  ["ds25f", "revokedSurvives", "the list is kept beside held in signin.json and outlives a sign-out: a sign-in afterwards, as this account or another, starts from it, so an older list in the answer is refused; with none kept, the answer's list is taken"],
  ["ds24j", "landMark", "every landing is one response that fetches nothing: the mark defined once in one symbol, its mask once with an id no other element has, drawn twice by use; the icon data:, no script, style attribute, address or outside reference"],
  ["ds24g", "landWords", "every landing in English and Polish carries the copywriter's headline, line, tab title and foot, no script, no address and nothing a keyboard cannot type; an unknown kind is the could-not-finish page"],
  ["ds24h", "landWired", "the press lands the loopback once with how it ended, after the service's answer: a seat, no seat yet, the service away, the person's Cancel at the provider"],
  ["ds24i", "landAddress", "over real HTTP, following the provider's 302 and the loopback's 303 as a browser does, the page's address is the loopback's own path with no code, no state and no query, and the page is the seat's"],
  ["ds20b", "noKeyring", "pressing a provider with no keyring open makes no identity and tells the person plainly in the copywriter's English and Polish words; Account's unkept line is retired"],
  ["ds22a", "certSigned", "a seat certificate is taken only where a delegation from the shipped root, one that may sign licences on the day it was issued, names the key that signed it, for this desk, thirty days at most; each forgery of signature, signer, root, licence right, window, field or key id is not"],
  ["ds22b", "certAsDoor", "the desk takes a certificate exactly where the relay's door takes it (relay/core.cjs certWhy), sample by sample, the genuine one by both, with one named exception: a genuine desk-only certificate, which the door refuses as \"shape\" and the desk takes (no desk-only licence hands a door)"],
  ["ds22c", "certForgedAnswer", "a forged answer, a made-up signature or a stranger's root with a door on the trusted relay, is no seat and offers no door; signin.json edited to a forged certificate holds no seat, while a genuine one, lapsed too, stays"],
  ["ds22d", "certRoot", "the root the desk checks a certificate against is the vendor's, the relay's ROOT_PUB, and the check names it"],
  ["ds22i", "deskOnlyCert", "a desk-only licence's certificate carries deskOnly: true under the signature, as the line \"desk-only\" after the key id; the field taken off, put on, false or of another value is no certificate; signin.json keeps it; an older certificate without it reads as not desk-only, in the view as well"],
  ["ds22j", "deskOnlyPage", "a desk-only seat with no team is told \"Working without a team\" and that nothing else is needed, in the panel and Account, Polish too, no code shown (board 1017); any other seat with no team keeps the waiting-for-a-lead line"],
  ["ds22k", "testServiceAsar", "THE TEST SERVICE BUILD READS ITS FIELDS FROM INSIDE THE ASAR: a test-service.json, root included, planted beside the asar of an ordinary package changes nothing (no test service, the shipped service and root alone, a certificate under the planted root refused, staging's relay refused); in a test service package the asar's fields win over it; no file beside the asar is read"],
  ["ds22h", "labRoot", "unpackaged, a lab file's root is honoured beside the shipped one; installed, packaged or both a certificate under it is refused, the file never read; no lab, or one naming no root, honours the shipped root alone; a stranger's root never"],
  ["ds22e", "doorsSigned", "a door is taken only under the service's signature by the certificate's key, over those doors in that order under that certificate; an older service's answer without one holds the seat, offers no door and says nothing; a stranger's door added, a door changed, another key's or another certificate's signature is no door"],
  ["dsjk1", "knockFile", "signin.json keeps the team a waiting Join owes its knock at, so the knock outlasts a restart; a value that is not a team id is not kept"],
  ["ds22f", "doorsFile", "signin.json keeps doors only with their signature under the certificate it holds: doors edited, the signature gone (an older build's file) or no certificate is no door, and the certificate stays"],
  ["ds26a", "pageAskLead", "a desk its organisation's licence does not seat, the switch seating only people added, is told a lead invites it by its email address (board 1017; once: give its lead the code), with Check now and Account, and under a hairline its own trial and its end, nothing there once the trial is had; Polish too (decision 47, held for Max's ruling)"],
  ["ds26b", "askLeadFile", "review 6: signin.json keeps askLead across a restart, with a trial certificate or none, and reads false otherwise"],
  ["ds49a", "relaySeatAnswer", "the service's no-role is read as itself at a renewal: the certificate kept to its own end, no sign-in asked"],
  ["ds49b", "relaySeatWire", "the team whose relay refused this desk's seat is kept and told once, said removed where the service found no role and renew otherwise, cleared by its own open or the channel let go"],
  ["ds49c", "seatRenewGap", "a relay session carries the desk's own standing certificate or none, and a run-out one is renewed first at most once an hour, a renewal already out waited on"],
  ["ds49d", "relaySeatPage", "Account says the relay's refusal as what it is to the person, in the copywriter's English and Polish: no longer given access, or the sign-in to renew with the providers under it; nothing signed out; no-role at a first sign-in and a renewal"],
  ["ds49e", "relaySeatCleared", "review 7 as reviews 49 and 50 amend it: Sign out clears the relay seat's \"needs renewing\" mark and wakes the relay, and the relay taking the seat (open) clears it too; a sign-in, a press, keeps it, stamps the hour's throttle with its own renewal and wakes the relay once; a quiet renewal keeps it and the throttle and wakes the relay; the relay's own renewal and a press's own keep both and wake nothing themselves"],
  ["ds50a", "pooledCert", "a pooled desk's certificate (pooled: true, signed as the line \"pooled\") is a seat on the desk, kept by signin.json, and the relay's certWhy takes it alike; the mark outside the signature, or of another value, is no certificate, nor is one running past a day"],
  ["ds22g", "doorsShownSigned", "doors held without the signature are offered nowhere and a press on one joins nothing; signed ones are offered"],
  ["ds51a", "switchLeaves", "review 11: a sign-in as another account does for the account left all Sign out does, by the same count (its signout/desk, before the new signin/desk; its seat.json; its door's join; the store forgotten; its organisation's licence forgotten), whatever the new account's answer: a certificate, none, full, a refusal, the service unreached; a sign-in as the same account leaves nothing"],
  ["ds51c", "outThenSignin", "review 8: Sign out during a renewal and a sign-in at once: the sign out is answered before the new signin/desk is sent, nothing stays owed, the desk signed in"],
  ["ds51d", "outStillOwed", "review 8: a sign out queued behind a renewal is sent only while still owed; one whose place a sign-in took meanwhile is not sent"],
  ["ds51e", "accessNotHeld", "review 1: on an unmanaged desk held by an account on the service's access path, a new sign-in asks the provider today's scopes and hands the new account no access flag; a managed computer asks the service's scope"],
  ["ds51f", "seatedKept", "review 2: that an account has held a seat here is kept from its first certificate, through an answer of none, signin.json and a restart; an account never given one is not, and on a managed, unshared computer it is replaced by another account's sign-in and signed out of, where one that held a seat is kept from both"],
  ["ds51g", "orgKept", "review 09 finding 1: the account's organisation as its provider named it is kept with the sign-in and in signin.json, so a policy set later is held to it"],
  ["ds51h", "switchUnanswered", "review 11, Claude alpha's decision: the held account is left only once the service answers a call of the switch: its signout not taken, the desk stays the account it had, seat.json, door and store whole, nothing owed, no signin/desk sent, and the page says it stays signed in; taken and then unreached, signed out and said so; where no signout is sent, the new account's unreached signin/desk leaves the desk as it was"],
  ["ds51i", "switchOutWindow", "nothing written to signin.json while a switch's signout is still out says a signout is owed for an account the desk still holds, and a start from such a file signs nobody out, while Sign out still owes one"],
  ["ds51b", "switchShared", "review 11: Sign out and the switch share one leaving, signinLeave: Sign out is its guards, that call and its words, and the press calls it for another account only, at most once on a path, its signout decided on the same condition, before the new account is taken"],
  ["dsw1", "worksTable", "the desk works only holding a certificate signinCertOk takes for this desk's key, its signer not revoked, the desk's own clock inside it from its issue to its end; no certificate, another desk's, a revoked signer, ended or not yet reached on the desk's clock all read not working, whatever the system clock"],
  ["dsw2", "viewFields", "the view carries works, the desk's clock as now, the held certificate's until, stoppedAt (the held or last certificate's end where the desk was seated and works no longer, never after the desk's now) and online, in each state, whatever provider is offered"],
  ["dsw3", "viewClockWire", "the wiring hands the view the desk's clock, key and network as signinClockNow reads them, never the system clock"],
  ["dsw4", "viewSame", "the view is today's byte for byte, read beside signinView as it stood at engine main 158d1826 in fifteen states, with exactly the nine new fields more (B-2a's five, B-2b's four)"],
  ["dsw5", "clockRules", "the desk's clock moves by the larger of the wall's and the monotonic difference and never below zero, by the wall's alone floored across a restart, keeps no time until a certificate anchors it, and is set to the issue of a certificate issued later than any taken, forward or back, never by an older one or another desk's"],
  ["dsw6", "clockApart", "the clock is kept beside signin.json's own mark, so today's reader takes a file this desk wrote exactly as the file without it, the seat and the mark whole; no anchor or no signature writes nothing"],
  ["dsw7", "clockMark", "a clock missing, edited, of another shape or marked by another key restarts at the later of the held certificate's issue and the system clock, and the seat read from the file stays the same; another desk key reads no clock"],
  ["dsw8", "clockSlow", "the system clock five minutes slow, or ten, at a fresh sign-in: the desk works from the certificate's issue and runs on, where today's calm lapse reads it lapsed"],
  ["dsw9", "clockFast", "a year fast at the sign-in: the desk works and runs on, the next run carrying on from the kept clock, where today's calm lapse reads it ended"],
  ["dsw10", "clockBackClosed", "set back a year between two runs: the desk's time stands only while it was closed and it stops at the certificate's end after thirty days of running, where today's calm lapse reads it lapsed, issued in the future"],
  ["dsw11", "clockBackRunning", "set back a year while running: the monotonic clock carries the desk on; the next run counts nothing while the system clock stays behind where the desk's reckoning left it, and the time closed once it is put right"],
  ["dsw12", "clockReplay", "an old answer replayed rewinds the desk's clock neither in the run nor in the next, and its certificate stands ended on it"],
  ["dsw13", "clockTick", "the tick is armed once by the first ask and unref'd, keeps the clock at its first turn and then hourly, writes nothing before an anchor, and tells the page once each time the network comes or goes"],
  ["dsk1","answerWords","B-2b: the answer's seat is read as {on, ends, lead?}, on one of the five words or no seat, a team's lead plain text of at most 120 characters with no markup, control or bidirectional character, each trial an end; an answer without them reads as before; the service's record reads as it says"],
  ["dsk2","wordsKept","B-2b: the seat is kept with the certificate it came with, through an answer of none, and goes with the next certificate's; the trials until an answer names others; signin.json keeps them, typed; the view carries them for a signed-in desk; the same account signed in again keeps them, another account does not"],
  ["dsk3","olderReaders","B-2b: today's desk and B-2a's (signinFileRead at engine main 158d1826, which B-2a left as it was) read a file of this desk with its seat, trials and ended exactly as the same file without them, the seat whole"],
  ["dsk4","keepNone","B-2b: an answer of none (none, waiting, an ask with no trial of one's own) keeps the held certificate to its own end, ended the desk's time at the first, kept through a second, a refusal and the file, cleared by a seating answer; a renewal stamps the desk's clock; the view works to the end on the desk's clock and then stops on that end, never a later day, B-2a's dropped certificate included"],
  ["dsk5","saidMeaning","B-2b: every judgement that read no certificate as the service's none keeps its meaning: the view before works is the view of the seat with the certificate dropped, and no knock or request at a team's door goes on a certificate the service has said none to"],
  ["dsk6","stopTimer","B-2b: a certificate taken in this run ending three seconds on leaves the pushed view not working after four, told once, at its end, on a start that names no harness rule; past its end the desk asks one renewal per certificate and none while it works"],
  ["dsk7","stopWired","B-2b: the tick arms the stop, a certificate newly held arms it once after the turn, a resume arms it, heard once the app is ready; the timer is never further than a day, and no timer or renewal where the desk does not work"],
  ["dsk8","clockLater","B-2b: a forward jump while running, then corrected, leaves the desk's time ahead until the next certificate, issued later than any taken, sets it back to its issue; a replay still moves nothing"],
  ["dsk9","clockLost","B-2b: with the record deleted before every start a run restarts at the later of the issue and the system clock: an honest clock ends the certificate at its end over thirty-two starts, a slow clock works at once, a year fast reads ended, and a clock set back gets one span per run and never more within one"],
  ["dsk10","clockB2a","B-2b: a file written by B-2a's clock is no clock here, the run restarting at the later of the issue and the system clock with the seat whole; the issue is under the mark"],
  ["dsc1","clockKeptBack","psi's B1, the backward half: a kept clock that starts on a system clock read at 2010 and is put right, in the run or after the next start, lands at the true time, the closed days counted once and never the years between"],
  ["dsc2","clockStepBack","psi's B1, the backward half: a running clock stepped back two hours and forward two hours moves the desk's time by the real time passed and no more, in the run and the next; a sleep after the step still counts"],
  ["dsc3","clockStopRenewed","a desk carried past its certificate's end stops and asks one renewal at once, and the renewal's certificate sets the desk's time back to its issue and the desk works again"],
  ["dsk11","clockKeyLate","B-2b, the test architect's candidate: a start whose first ask comes before the desk's key still reads the kept clock once the key answers"],
  ["dsk12","pickRefused","B-2b: the quick replies' key and tray open nothing on a desk that does not work and bring its window forward; on one that works they open as before, and a second press still closes one that stands"],
  ["dsk13","noProvider","B-2b: a build offering no provider works with no certificate, a genuine one held, arms no stop, asks no renewal and tells the page registered false; machine policy pinning the providers away leaves registered as the build is; nothing held is dropped"],
  ["dsk14","pageWords","the page keeps ended, holding, trials and registered, typed and bounded, the first three for a signed-in desk alone, and deskDoorState is what reads them"],
  ["dsw14", "readFields", "the page keeps works, now, until, stoppedAt and online, typed and bounded; deskWorks is the one read of works and deskDoorState reads the other four"],
  ["dsg1", "settleIssued", "B-3a1, finding 1: signinSettleSeat refuses a certificate issued before the held one across renewal, Check now and sign in, keeping held cert, works and desk clock unchanged; equal issued is taken"],
  ["dsg2", "stateKeyLate", "B-3a1, finding 2: a first ask before the desk key exists does not cache a stripped state; once the key arrives the view carries the certificate and works, without clockWire's stub"],
  ["dsg3", "deskWorksGate", "B-3a1: deskWorks() is the one gate predicate, answers false with no host, follows works on host views, and gate functions call no write"],
  ["dsg4", "doorRule", "B-3a1: firstSigninDue ignores seen and policy pin and fires when view is read and deskWorks() is false (with no host it holds, the browser door, and with a host before a view is read it does not); Not now, Escape, Continue and seen memory are gone; door lowers only when deskWorks() turns true"],
  ["dsg5", "offersWait", "B-3a2a: while the door stands, every catalog intake channel (boot offer with asked:true, listing, host watch, browser watch, window drop, importCatalogText) waits and plays when deskWorks() turns true, and importCatalogHere is ignored"],
  ["dsg6", "doorKeyboard", "B-3a2a: over the standing door, keyboard answers only the door (Tab/Shift+Tab reach data-door-save, Enter/Space press it natively; Escape, Ctrl+Z standing undo, shortcuts, chords and typing are held back; save handlers stay unguarded)"],
  ["dsg7", "pickAskDoor", "B-3a2a: answerPick refuses every op when deskWorks() is false without reading catalog or layer, returning a nothing-to-show refusal shape, and answers as before when deskWorks() is true"],
  ["dsg8", "stopInstant", "B-3a2b: at the stop's instant pending writes flush once before the door rises (failed/throwing flush still raises door with retry intact), fields stay untouched, way-out is reachable by keyboard, return lowers door and plays waits once, a Sign out from a working seat (works false, signed out, door state first) raises it the same way and the next seated view lowers it, working push and second stop do not flush again"],
  ["dsg9", "stopHidePickerShell", "B-3a2b: shell tellSignin hides a visible picker with hidePicker(false) (focus not forced) when signinWorksNow() is false, leaving hidden picker and working desk unchanged"],
  ["dsg10", "browserDoor", "B-3a2b: plain browser build with no host has deskWorks false, firstSigninDue and doorHolds true, raises browser door in EN and PL with inert data-door-save and no provider/Not now/Escape, and seated host stand-in works as before"],
  ["dsg11", "settleClockIssued", "Argon 51 M1: settle and kept-file path compare against clock.issued so null held cert or older cert in signin.json cannot revive the desk"],
  ["dsg12", "stateKeyRestoreAndTell", "Argon 51 M2: unopenable key then old key restored keeps works:true and preserves disk cert on tick; key arrival tells the page"],
  ["dsfe1", "freedEnds", "class A, the desk's half: the service's freed answer at a renewal sets the certificate and its doors aside, freed stamped with the desk's time, so the desk stops at once; the view, the file and the next certificate agree"],
  ["dsfe2", "freedKeeps", "a freed renewal keeps the account, its code, its words and the store's offer, writes and removes no file, and neither leaves nor forgets the store"],
  ["dsfe3", "freedDoor", "a freed desk's door says this account's seat on the team has been taken back and how a lead brings it back, EN and PL, screen and panel, with Sign in again; another stop is told as before"],
  ["dsfe4", "freedOthers", "every other refusal, the wait, the service's none (ended as before) and a provider's refusal keep the certificate working and stamp nothing"],
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
/* Sign out's own work is signinLeave (ds51b). */
const leaveFn = tryDecl("function signinLeave(") || outNow;
const outHandler = (() => { const a = at(WIRING, 'ipcMain.handle("etiuda:signin-out",'); return a < 0 ? "" : WIRING.slice(a, WIRING.indexOf("\n});", a)); })();
check(!!outHandler && /^ipcMain\.handle\("etiuda:signin-out", \(e\) => \{\n  if \(!fromEngine\(e\)\) return null;\n  return signinOutNow\(\);/.test(outHandler)
  && at(leaveFn, "signinOutSend(") > 0 && at(leaveFn, "signinOutSend(") < at(leaveFn, "s.held = null;"),
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
   of which gates anything; and to hand a team's relay its seat on a licence that follows Entra, which the relay judges and nothing
   on the desk waits on (tests/relay-seats.mjs d1a to d3a), and for Buy to go to the portal of an account that already pays (tests/desk-buy.mjs b11). */
const expectOutside = ["signinListen", "armSigninRenew", "signinFlush", "signinFlush", "signinDoorInvite", "signinDoorKept", "signinView", "signinWorksNow", "signinWorksNow",
  "signinRelaySeatIo", "signinRelaySeatIo", "signinPressNow", "signinPaysNow"];
check(outside.slice().sort().join() === expectOutside.slice().sort().join(),
  "ds5a nothing local is gated: outside its section the shell names the sign-in only to require its loopback, to arm the renewal, to write the seat after a join and to press on Ask again: " + outside.join(" "));
const modules = fs.readdirSync(path.join(ROOT, "src", "modules")).filter(n => n.endsWith(".js"));
const readers = modules.filter(n => /\bsignin(State|Stop|Out|Check|Again)\b|\bsignIn\(|onSignin/.test(fs.readFileSync(path.join(ROOT, "src", "modules", n), "utf8")));
check(readers.join() === "signin.js" && /function signinShown\(v\)\{ return !!\(v && \(v\.offered\.length \|\| v\.signedIn \|\| signinWaiting\(v\) \|\| signinStranded\(v\)\)\); \}/.test(PAGE)
  && /if\(signinShown\(v\) \|\| signinManaged\(v\)\) groups\.push/.test(SETTINGS),
  "ds5b on the page only signin.js asks the shell, and with nothing offered and no wait for machine policy (tests/desk-managed.mjs mm-p8)"
  + " neither the door nor Account's card is drawn: " + readers.join(","));
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
/* A held certificate issued before every recorded answer in tests/signin-answers.json, standing in for what the desk kept before. */
const HELD_BEFORE = () => ({ provider: "microsoft", refresh: "sealed:rt", sub: "sealed:s", seed: "6".repeat(64), code: CODE, cert: cert({ issued: VIA_FROM, until: VIA_FROM + 30 * 86400000 }), at: 1, checked: 1, reached: true, said: "", ask: false });
const unreached = r => r.ok === false && r.reason === "unreached";
/* `asked`, an open join request beside an answer, is kept as the lead names it, answer by answer (it was read as the same answer without
   the list until the door named whom a request waits on). The service's lead object is never kept whole: only the plain name, and only where
   it is plain text. */
function askedHeldOk(r, c, s) {
  if (!c || !c.body || !Array.isArray(c.body.asked) || c.body.asked.length === 0 || !P) return false;
  const names = c.body.asked.map(x => x.lead.name);
  const bareBody = JSON.parse(JSON.stringify(c.body));
  delete bareBody.asked;
  const desk = c.body.certificate ? c.body.certificate.desk : DESK_KEY;
  const bare = s.signinAnswer({ status: c.status, bytes: Buffer.from(JSON.stringify(bareBody)) }, desk, true);
  const h = s.signinSettle(HELD_BEFORE(), r, NOW), hBare = s.signinSettle(HELD_BEFORE(), bare, NOW);
  const viewOf = held => s.signinViewOf(Object.assign({ provider: "microsoft" }, held), viewFacts());
  const v = viewOf(h), vBare = viewOf(hBare);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const without = o => { const x = Object.assign({}, o); delete x.asked; return x; };
  const panelOf = viewIn => { const d = P.signinDoor(P.signinRead(viewIn)); return d ? P.signinPanelHtml(d) : ""; };
  const html = panelOf(v), htmlBare = panelOf(vBare), stamp = String(c.body.asked[0].at);
  const door = P.signinDoor(P.signinRead(v));
  /* The file: what is written reads back the same names, and a later answer without the list forgets them. */
  const back = s.signinFileRead(s.signinFileText({ held: Object.assign({ provider: "microsoft", seed: "0".repeat(64) }, h) }), true).held;
  const gone = s.signinSettle(h, bare, NOW + 1);
  /* Only plain names, none twice, at most eight; a long, markup or empty name and a lead that is not an object are no request. */
  const withAsked = list => s.signinAnswer({ status: c.status, bytes: Buffer.from(JSON.stringify(Object.assign({}, c.body, { asked: list }))) }, desk, true);
  const first = c.body.asked[0];
  const odd = withAsked([first, { lead: { name: "<b>x</b>" } }, { lead: { name: "x".repeat(121) } }, first, { lead: { name: "  " } }, { lead: null }, "junk"]);
  const many = withAsked(Array.from({ length: 10 }, (_, i) => ({ lead: { name: "Lead " + i } })));
  const plainOk = same(odd.asked, names) && !!many.asked && many.asked.length === 8 && many.asked[0] === "Lead 0" && !("asked" in withAsked([{ lead: null }]));
  return plainOk && r.ok === true && bare.ok === true && r.cert === null && r.askLead === true && r.code === c.body.code
    && same(r.asked, names) && !("asked" in bare) && same(h.asked, names) && same(v.asked, names) && !("asked" in hBare) && !("asked" in vBare)
    && same(without(r), bare) && same(without(h), hBare) && same(without(v), vBare)
    && !!back && same(back.asked, names) && !("asked" in gone)
    && h.said === "" && h.askLead === true && !!h.cert && JSON.stringify(h.cert) === JSON.stringify(HELD_BEFORE().cert) && h.ended > 0 && h.refresh === "sealed:rt"
    && !!door && door.moment === "asklead" && html.length > 0 && html === htmlBare && html.indexOf(stamp) < 0
    && P.signinRead(v).asked.join() === names.join() && P.signinRead(vBare).asked.length === 0;
}
CASES.askedHeld = s => {
  const c = ANSWER_CASES.find(x => x.case === "asked");
  if (!c) return false;
  const desk = c.body && c.body.certificate ? c.body.certificate.desk : DESK_KEY;
  return askedHeldOk(s.signinAnswer({ status: c.status, bytes: Buffer.from(JSON.stringify(c.body)) }, desk, true), c, s);
};
/* Board 1020: the service's word of what the person pays and what it holds, read as the desk keeps it (`buy`), settled whole and kept. */
const BUY_READ = (r, c, s, wait) => {
  const h = s.signinSettle(HELD_BEFORE(), r, NOW), d = c.body.pays && c.body.pays.deskOnly, e = c.body.held && c.body.held[0];
  const want = Object.assign({}, d ? { pays: Object.assign({ provider: d.provider }, d.portal ? { portal: d.portal } : {}) } : {}, e ? { held: { kind: e.kind, provider: e.provider, at: e.at } } : {});
  return r.ok === true && JSON.stringify(r.buy) === JSON.stringify(want) && JSON.stringify(h.buy) === JSON.stringify(want) && (!wait || r.waiting === true);
};
const DESK_READS = {
  "pays": (r, c, s) => !!r.cert && !!c.body.pays.deskOnly.portal && BUY_READ(r, c, s),
  "held": (r, c, s) => r.cert === null && BUY_READ(r, c, s),
  "held-waiting": (r, c, s) => r.cert === null && BUY_READ(r, c, s, true),
  "seated": (r, c, s) => r.ok === true && !!r.cert && r.cert.desk === c.body.certificate.desk && r.code === c.body.code && r.doors.length === 0
    && s.signinSettle(HELD_BEFORE(), r, NOW).cert === r.cert,
  "seated-doors": (r, c) => r.ok === true && !!r.cert && r.doors.length === c.body.doors.length && r.doors.length > 0,
  "none": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.code === c.body.code && !!h.cert && h.ended === NOW && h.said === ""
    && JSON.stringify(h.trials) === JSON.stringify(c.body.trials); },
  "waiting": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.code === c.body.code && h.said === "waiting" && h.ask === false && h.refresh === "sealed:rt"; },
  "signin": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === false && r.reason === "signin" && h.refresh === "" && h.ask === true && h.cert === null && h.freed === NOW; },
  "desks": r => r.ok === false && r.reason === "desks",
  "token": r => r.ok === false && r.reason === "token",
  "access-token": r => r.ok === false && r.reason === "access-token" && r.managed === true,
  "no-role": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === false && r.reason === "no-role" && r.managed === true && h.said === "no-role" && h.refresh === "sealed:rt" && h.managed === true; },
  "managed-seated": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.managed === true && r.cause === "" && h.managed === true && h.cert === r.cert; },
  "managed-waiting": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.waiting === true && r.managed === true && h.said === "waiting" && h.managed === true; },
  "managed-none": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.managed === true && !!h.cert && h.ended === NOW && h.managed === true; },
  "managed-own-waiting": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.waiting === true && r.managed === true && r.cause === "own-licence" && h.said === "waiting" && h.cause === "own-licence"; },
  "managed-own": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.managed === true && r.cause === "own-licence" && h.cause === "own-licence"; },
  "managed-assigned": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.managed === true && r.cause === "assigned" && h.cause === "assigned"; },
  "malformed": unreached, "stale": unreached, "signature": unreached, "replayed": unreached, "slow-down": unreached, "unavailable": unreached,
  "signed-out": (r, c) => r === true,
  /* A team is its lead's own (decision 47): the ask beside the person's own trial's certificate, and beside none once it is had. */
  "ask-lead-trial": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.cert.deskOnly === true && r.askLead === true
    && r.code === c.body.code && h.askLead === true && h.said === ""; },
  "ask-lead": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.askLead === true && h.askLead === true && h.said === ""; },
  "asked": (r, c, s) => askedHeldOk(r, c, s),
  /* The seat and trials beside an answer (B-1), read since B-2b as `holding` and `trials` and kept with the certificate they came with;
     an answer of none keeps the certificate held before it, `ended` stamped, and the seat it last named. */
  "trial": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.cert.deskOnly === true && r.code === c.body.code
    && h.cert === r.cert && h.said === "" && !h.ended && JSON.stringify(h.holding) === JSON.stringify(c.body.seat) && JSON.stringify(h.trials) === JSON.stringify(c.body.trials); },
  "studio-trial": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.cert.deskOnly !== true && h.cert === r.cert
    && h.holding.on === "studio-trial" && h.holding.ends === c.body.seat.ends && h.trials.desk === c.body.trials.desk && h.trials.studio === c.body.trials.studio; },
  "trials-ended": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && r.cert === null && r.code === c.body.code && !!h.cert && h.ended === NOW
    && h.said === "" && !h.holding && JSON.stringify(h.trials) === JSON.stringify(c.body.trials); },
  "own": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.cert.deskOnly === true && h.cert === r.cert && h.holding.on === "own" && h.holding.ends === c.body.seat.ends; },
  "team": (r, c, s) => { const h = s.signinSettle(HELD_BEFORE(), r, NOW); return r.ok === true && !!r.cert && r.cert.deskOnly !== true && h.cert === r.cert
    && JSON.stringify(h.holding) === JSON.stringify(c.body.seat) && h.holding.lead === c.body.seat.lead; },
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
    /* Every seating answer that offers the store is read as an offer. */
    else if (c.route === "signin/desk" && c.body.ok === true && c.body.storeOffer === true && got.storeOffer !== true) misread.push(c.case + " read with no offer");
    else if (c.route === "signin/desk" && c.body.ok === true && !c.body.pays && !c.body.held && got.buy !== undefined) misread.push(c.case + " read a payment the service did not name");
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
  await plant("dspo1", ["const storeOffer = j.storeOffer === true; /* plant:offer-read */", "const storeOffer = !!j.storeOffer;"], "storeOffer");
  await plant("dspo2", ["    storeOffer: ans.storeOffer === true }); /* plant:wait-settle */", "    storeOffer: held.storeOffer === true || ans.storeOffer === true }); /* plant:wait-settle */"], "storeOffer");
  await plant("dspb1", ["? j.pays.deskOnly : null; /* plant:pays-read */", "? (j.pays.deskOnly || j.pays.team) : null;"], "buyWords");
  await plant("dspb2", ["/^https:\\/\\/billing\\.stripe\\.com\\/p\\/login\\/(?:test_)?[A-Za-z0-9]{8,64}$/; /* plant:portal-shape */", "/^https:\\/\\/\\S+$/;"], "buyWords");
  await plant("dspb3", ["SIGNIN_HELD_KINDS.indexOf(e.kind) < 0 || SIGNIN_PAY_PROVIDERS.indexOf(e.provider) < 0) return null; /* plant:held-kind */", "SIGNIN_PAY_PROVIDERS.indexOf(e.provider) < 0) return null;"], "buyWords");
  await plant("dspb4", ["    Object.assign(words, signinBuyOf(j)); /* plant:buy-read */", ""], "buyWords");
  await plant("dspb5", ["    if (ans.buy) out.buy = ans.buy; /* plant:buy-settle */", ""], "buyWords");
  await plant("dspb6", ["if (b) out.held.buy = b; } /* plant:buy-file */", "} "], "buyWords");
  await plant("dspb7", ["if (signedIn && held && held.buy) view.buy = ", "if (false) view.buy = "], "buyWords");
  await plant("dsp9", ["const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t, seed: seed || \"\" })) || \"\"); /* plant:desk-signed */",
    "const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t + 1, seed: seed || \"\" })) || \"\");"], "deskBody");
  /* Review 2's finding 12, its residual: the seed signed as the bytes' last line. Planted out, the first sign-in's signature is over a
     renewal's bytes, which ds3a refuses. */
  await plant("dsp9s", ["const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t, seed: seed || \"\" })) || \"\"); /* plant:desk-signed */",
    "const sig = String(sign(signinDeskBytes({ provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t })) || \"\");"], "deskBody");
  /* The seed line itself left out of the desk's byte form (plant:desk-seed-line), the same red from the bytes' side. */
  await plant("dsp9t", ["  return Buffer.from(SIGNIN_DESK_LINE + \"\\n\" + [o.provider, o.tokenHash, o.desk, o.t].concat(o.seed ? [\"seed:\" + o.seed] : []).map(String).join(\"\\n\"), \"utf8\"); /* plant:desk-seed-line */",
    "  return Buffer.from(SIGNIN_DESK_LINE + \"\\n\" + [o.provider, o.tokenHash, o.desk, o.t].map(String).join(\"\\n\"), \"utf8\");"], "deskBody");
  await plant("dsp10", ["if (seed) body.seed = String(seed); /* plant:seed-first */", "body.seed = String(seed);"], "deskBody");
  await plant("dsp11", ["if ([SIGNIN_SERVICE, SIGNOUT_SERVICE, storeServiceAt(\"store/grant\"), storeServiceAt(\"store/end\"), storeServiceAt(\"ask\")].indexOf(String(url)) < 0) throw new Error(\"the licence service's door takes signin/desk, signout/desk, store/grant, store/end and ask only\"); /* plant:service-host */", ""], "serviceDoor");
  await plant("dsp27", ["if ([SIGNIN_SERVICE, SIGNOUT_SERVICE, storeServiceAt(\"store/grant\"), storeServiceAt(\"store/end\"), storeServiceAt(\"ask\")].indexOf(String(url)) < 0) throw new Error(\"the licence service's door takes signin/desk, signout/desk, store/grant, store/end and ask only\"); /* plant:service-host */", ""], "signoutDoor");
  await plant("dsp28", ["const SIGNOUT_DESK_LINE = \"etiuda-licence-signout-desk\"; /* plant:signout-line */", "const SIGNOUT_DESK_LINE = \"etiuda-licence-signin-desk\";"], "signoutBody");
  await plant("dsp12", ["&& String(c.desk) === String(deskKey) && /^[0-9a-f]{64}$/.test(String(c.person)) && SIGNIN_CODE.test(String(c.code)) /* plant:cert-desk */",
    "&& /^[0-9a-f]{64}$/.test(String(c.person)) && SIGNIN_CODE.test(String(c.code))"], "answers");
  await plant("dsp13", ["    refresh: freed ? \"\" : held.refresh }, aside, ans.managed === true ? { managed: true, cause: ans.cause || \"\" } : {}); /* plant:settle-freed */",
    "    refresh: held.refresh }, aside, ans.managed === true ? { managed: true, cause: ans.cause || \"\" } : {});"], "settle");
  await plant("dsp15", ["return !!held && !!held.cert && now >= held.cert.until; /* plant:lapse-until */", "return !!held && !!held.cert && now >= held.cert.until + 86400000;"], "lapse");
  await plant("dsp16", ["if (!Object.keys(SIGNIN_PROVIDERS).some(id => SIGNIN_PROVIDERS[id].token === u)) throw new Error(\"a token is asked only at a provider's own token address\"); /* plant:door-host */", ""], "door");
  await plant("dsp17", ["body: form, redirect: \"error\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined }); /* plant:door-redirect */",
    "body: form, redirect: \"follow\", cache: \"no-store\", credentials: \"omit\", signal: ctl ? ctl.signal : undefined });"], "serviceDoor");
  await plant("dsp18", ["if (!token || !sealsForReal(storage, platform)) return \"\"; /* plant:keep-real */", "if (!token) return \"\";"], "keep");
  await plant("dsp19", ["if (landed) { serve(res, 200, landed); shut(); } else held = res;", "if (landed) serve(res, 200, landed); else held = res;"], "loopOnce");
  await plant("dsp20", ["if (!ours) { serve(res, 400, \"earlier\"); return; } /* plant:loop-state */", ""], "loopStray");
  await plant("dsp21", ["scope: \"openid profile email offline_access\", refreshScope: \"openid profile email offline_access\", /* plant:scope-ms-email */", "scope: \"openid profile offline_access\", refreshScope: \"openid profile email offline_access\","], "scopes");
  await plant("dsp301", ["scope: \"openid profile email offline_access\", refreshScope: \"openid profile email offline_access\", /* plant:scope-ms-email */", "scope: \"openid profile email offline_access\", refreshScope: \"openid profile offline_access\","], "scopes");
  await plant("dsp300", ["scope: \"openid email profile\", refreshScope: \"\" /* plant:scope-google-email */", "scope: \"openid\", refreshScope: \"\""], "scopes");
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
  await plantWire("dsp29", ["const send = () => (signinState().out === key ? signoutAsk(signinIo({ loop: null }), key, Date.now) : Promise.resolve(false)); /* plant:signout-post */", "const send = () => Promise.resolve(false);"], "signoutPost");
  await plantWire("dsp202", ["const send = () => (signinState().out === key ? signoutAsk(", "const send = () => (true ? signoutAsk("], "outStillOwed");
  await plantWire("dsp203", ["    if (got.ok && signinOutFlight) await signinOutFlight; /* plant:out-before-signin */", "    /* plant:out-before-signin */"], "outThenSignin");
  await plantWire("dsp156", ["  delete s.licenceManaged; /* plant:signout-managed */\n", ""], "signoutManaged");
  await plantWire("dsp30", ["    && signinOffered().length > 0; /* plant:signout-offered */", "    ; /* plant:signout-offered */"], "signoutNone");
  await plantWire("dsp31", ["return !!teamJoin && !(teamJoin.invite && teamJoin.invite.relay); /* plant:flush-asking */", "return false;"], "flushJoin");
  await plantWire("dsp32", ["if (signinWrote === mark && fs.existsSync(file)) return false; /* plant:flush-mark */", "if (signinWrote === cert.sig.value) return false;"], "flushJoin");
  await plantWire("dsp33", ["  catalogFolderChanged(); /* plant:invite-folder-changed */\n", ""], "flushJoinReach");
  await plantWire("dsp34", ["  catalogFolderChanged(); /* plant:finish-join-watched */\n", ""], "flushJoinReach");
  await plant("dsp35", ["if (!signinCertOk(cert, deskKey) || !(cert.until > now)) return null; /* plant:door-cert */", "if (!signinCertOk(cert, deskKey)) return null;"], "doorRequest");
  await plant("dsp36", ["return Object.assign({}, doc, { seat: JSON.parse(seatFileText(deskId, cert)), door: String(door) }); /* plant:door-fields */",
    "return Object.assign({}, doc, { seat: JSON.parse(seatFileText(deskId, cert)) });"], "doorRequest");
  await plantWire("dsp37", ["  if (!signinCertOk(cert, me.key) || !(cert.until > Date.now())) return none; /* plant:door-invite-cert */\n", ""], "doorInvite");
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
  await plant("dsp47", ["link: busy && signinPageOk(busy.url) ? busy.url : \"\",", "link: \"\","], "linkWait");
  await plantWire("dsp48", ["run.url = url; tellSignin(); return Promise", "run.url = url; return Promise"], "linkWait");
  await plant("dsp49", ["link: busy && signinPageOk(busy.url) ? busy.url : \"\", keeps: o.keeps, /* plant:view-link */", "link: busy && signinPageOk(busy.url) ? busy.url : \"\", keeps: true,"], "keyringLine");
  await plantWire("dsp49b", ["keeps: sealsForReal(safeStorage, process.platform),", "keeps: true,"], "keyringLine");
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
  await plant("dsp60", ["return Object.assign({ ok: true, code: String(j.code), cert: j.certificate, doors: signed ? doors : [], doorsSig: signed ? String(j.doorsSig) : \"\", askLead, storeOffer }, signinManagedOf(j), words); /* plant:door-read */",
    "return Object.assign({ ok: true, code: String(j.code), cert: j.certificate, doors: [], doorsSig: \"\", askLead, storeOffer }, signinManagedOf(j), words);"], "doorsRead");
  await plant("dsp61", ["doors: ans.cert ? (ans.doors || []) : [],", "doors: ans.doors || [],"], "doorsKept");
  await plantWire("dsp62", ["|| !(held.cert.until > now) || pinnedLead() || teamJoin) return []; /* plant:door-shown */", ") return [];"], "doorJoin");
  await plantWire("dsp63", ["if (!d || !me) return Object.assign({}, joinView(), { refused: \"door\" }); /* plant:door-join-offered */", "if (!me) return joinView();"], "doorJoin");
  await plantWire("dsp64", ["relay: { rt: d.rt, url: d.url, door: true, box: d.box } } }; /* plant:door-join-box */", "relay: { rt: d.rt, url: d.url, door: true, box: d.lead } } };"], "doorJoin");
  await plantWire("dsp214", ["  none = held ? { seatless: true, box: inv.box } : null; /* plant:door-seatless */\n", ""], "doorAsksSeat");
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
  await plantWire("dsp75", ["const SIGNIN_DESK_PACKED = (INSTALLED || !!app.isPackaged) && !testServiceOn; /* plant:door-packed */", "const SIGNIN_DESK_PACKED = !!app.isPackaged && !testServiceOn; /* plant:door-packed */"], "doorAddress");
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
  await plant("dsp79", ["if (j.certificate === null) return Object.assign({ ok: true, code: String(j.code), cert: null, doors: [], waiting: j.reason === \"waiting\", askLead, storeOffer }, signinManagedOf(j), words); /* plant:wait-read */",
    "if (j.certificate === null) return Object.assign({ ok: true, code: String(j.code), cert: null, doors: [], askLead, storeOffer }, signinManagedOf(j), words);"], "waitRead");
  await plant("dsp80", ["said: ans.waiting === true ? \"waiting\" : \"\", ask: false, askLead: ans.askLead === true, managed: ans.managed === true, cause: ans.managed === true ? ans.cause || \"\" : \"\",",
    "said: \"\", ask: false, askLead: ans.askLead === true, managed: ans.managed === true, cause: ans.managed === true ? ans.cause || \"\" : \"\","], "waitRead");
  await plant("dsp80b", ["askLead: h.askLead === true, /* plant:file-ask-lead */", "askLead: false,"], "askLeadFile");
  await plant("dsa2", ["signinAskedWords(signinAskedOf(j.asked)), signinInvitedWords(", "signinInvitedWords("], "askedHeld");
  await plant("dsa3", ["signinAskedWords(signinAskedOf((ans.asked || []).map(n => ({ lead: { name: n } })))), /* plant:words-settle */", "/* plant:words-settle */"], "askedHeld");
  await plant("dsa4", ["if (out.held) Object.assign(out.held, signinAskedWords(signinAskedOf(Array.isArray(h.asked) ? h.asked.map(n => ({ lead: { name: n } })) : null))); /* plant:asked-file */", ""], "askedHeld");
  await plant("dsa5", ["if (signedIn && held && Array.isArray(held.asked) && held.asked.length) view.asked = held.asked.slice(); /* plant:view-asked */", ""], "askedHeld");
  await plant("dsa6", [".test(n) || out.indexOf(n) >= 0) continue; /* plant:asked-name */", ".test(n)) continue;"], "askedHeld");
  await plant("dsa7", ["!n || n.length > SIGNIN_LEAD_MAX || ", "!n || "], "askedHeld");
  await plant("dsa8", ["\\u007f-\\u009f<>\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/.test(n)", "\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/.test(n)"], "askedHeld");
  await plant("dsa9", ["if (out.length >= SIGNIN_ASKED_MAX) break;", ""], "askedHeld");
  await plant("dsa1", ["if (j.certificate === null) return Object.assign({ ok: true, code: String(j.code), cert: null, doors: [], waiting: j.reason === \"waiting\", askLead, storeOffer }, signinManagedOf(j), words); /* plant:wait-read */",
    "if (j.certificate === null) return Object.assign({ ok: true, code: String(j.code), cert: null, doors: [], waiting: j.reason === \"waiting\", askLead, storeOffer, asked: j.asked }, signinManagedOf(j), words);"], "askedHeld");
  await plantWire("dsp93", ["  if (Object.keys(teamPins).some(teamPinStands)) return []; /* plant:door-pin-stands */\n", ""], "doorPins");
  await plantWire("dsp94", ["    if (inviteDoor({ lead: { public: d.lead } })) return null; /* plant:door-policy */\n", ""], "doorPolicy");
  await plantWire("dsp95", ["    if (pin && (pin.keyId !== d.keyId || pin.public !== d.lead)) return null; /* plant:door-pinned */\n", ""], "doorPins");
  await plantWire("dsp96", ["  delete teamLeft[d.team]; teamBarred.delete(d.team); /* plant:door-join-unbar */\n", ""], "doorUnbar");
  await plantWire("dsp97", ["return withdrawJoin(j); /* plant:door-cancel-withdraw */", "return null;"], "doorCancel");
  await plantWire("dsp97a", ["&& requestSent(j)) return withdrawJoin(j); /* plant:door-cancel-withdraw */", ") return withdrawJoin(j); /* plant:door-cancel-withdraw */"], "cancelUnsent");
  await plantWire("dsp97b", ["inviteAccepted(j) && requestSent(j)) return withdrawJoin(j); /* plant:h35-keep */", "inviteAccepted(j)) return withdrawJoin(j); /* plant:h35-keep */"], "cancelUnsent");
  await plantWire("dsp98", ["  if (j.refused !== true && j.invite.relay.door !== true) return false; /* plant:door-withdrawn-ends */", "  if (j.refused !== true) return false;"], "doorWithdrawnEnds");
  await plantWire("dsp99", ["  if (inv.withdrawing === true) return inv.rt === rt &&", "  if (false) return inv.rt === rt &&"], "doorWithdrawInvite");
  await plantWire("dsp99a", ["try { unlinkOwn(path.join(catalogFolder(), \"desks\", me.id, SEAT_NAME)); }", "try { fs.unlinkSync(path.join(catalogFolder(), \"desks\", me.id, SEAT_NAME)); }"], "signoutUnlinkOwn");
  await plantWire("dsp99b", ["  signinRenewing = pending; /* plant:renew-marked */\n", ""], "signoutAfterRenew");
  await plantWire("dsp99c", ["const flight = (signinRenewing ? signinRenewing.then(send, send) : send()).then(ok => { /* plant:signout-after-renew */", "const flight = send().then(ok => {"], "signoutAfterRenew");
  await plant("dsp99d", ["  if (/^[0-9a-f]{64}$/.test(String(d.out))) out.out = String(d.out); /* plant:out-kept */\n", ""], "signoutOwed");
  await plantWire("dsp99e", ["  if (!held && s.out) { await signinOutAgain(); return \"\"; } /* plant:renew-out */\n", ""], "signoutOwed");
  await plantWire("dsp99f", ["  return signinOutSend(s.out); /* plant:out-again */", "  return Promise.resolve(false);"], "signoutOwed");
  await plantWire("dsp200", ["    if (out === true) { signinLeave(st, me, true); signinSave(); tellSignin(); } /* plant:switch-leaves */\n", ""], "switchLeaves");
  await plantWire("dsp201", ["  const ok = await flight; /* plant:switch-out-await */", "  const ok = true;"], "switchUnanswered");
  await plantWire("dsp204", ["    const access = signinAccessFor(p, managed, null); /* plant:access-not-held */", "    const access = managed || (st.held && st.held.provider === p.id) ? signinAccessFor(p, managed, st.held) : \"\";"], "accessNotHeld");
  await plant("dsp205", ["  if (settled.cert) settled.seated = true; /* plant:seated-settle */", "  /* plant:seated-settle */"], "seatedKept");
  await plant("dsp206", ["  if (out.held && (h.seated === true || out.held.cert)) out.held.seated = true; /* plant:seated-file */", "  if (out.held && out.held.cert) out.held.seated = true; /* plant:seated-file */"], "seatedKept");
  await plantWire("dsp207", ["  if (claims) base.org = {", "  if (false) base.org = {"], "orgKept");
  await plantWire("dsp208", ["    if (out === false) got = { ok: false, reason: \"signin-switch-unmade\" }; /* plant:switch-unanswered */\n", ""], "switchUnanswered");
  await plantWire("dsp209", ["  signinOutFlight = flight; /* plant:switch-out-in-flight */", "  s.out = me.key; signinOutFlight = flight;"], "switchUnanswered");
  await plantWire("dsp211", ["  const ok = await flight; /* plant:switch-out-await */", "  s.out = me.key;\n  const ok = await flight;\n  if (!ok && s.out === me.key) delete s.out;"], "switchOutWindow");
  await plantWire("dsp210", ["      if (other && out === null && (ans.ok || ans.reason !== \"unreached\")) { signinLeave(st, me, true); signinSave(); } /* plant:switch-leaves-after */", "      if (other && out === null) { signinLeave(st, me, true); signinSave(); } /* plant:switch-leaves-after */"], "switchUnanswered");
  await plantWire("dsp99g", ["{ cancelJoin(); sendJoin(theWindow); } /* plant:signout-door */", "{ }"], "signoutDoorJoin");
  await plant("dsp99h", ["    outOwed: !signedIn && o.outOwed === true, /* plant:out-owed-view */", "    outOwed: false,"], "outOwedView");
  /* The seat's signature (ds22): each check of the chain, and the file's reading of it. */
  await plant("dsp100", ["if (!signinVerified(NOTE_ROOT, viaBytes, d.sig.value) /* plant:cert-root */", "if (false /* plant:cert-root */"], "certSigned");
  await plant("dsp101", ["return signinVerified(d.key.pub, bytes, c.sig.value); /* plant:cert-sig */", "return true;"], "certSigned");
  await plant("dsp102", ["if (c.sig.keyId !== d.key.id) return false; /* plant:cert-via-key */", ""], "certSigned");
  await plant("dsp103", ["if (d.may.indexOf(\"licence\") < 0) return false; /* plant:cert-may */", ""], "certSigned");
  await plant("dsp104", ["if (!at || !first || !last || !(first <= at && at <= last)) return false; /* plant:cert-window */", ""], "certSigned");
  await plant("dsp105", ["cert: h.cert && typeof h.cert === \"object\" && signinCertOk(h.cert, h.cert.desk) ? h.cert : null, /* plant:file-cert */", "cert: h.cert && typeof h.cert === \"object\" && Number.isSafeInteger(h.cert.until) ? h.cert : null,"], "certForgedAnswer");
  await plant("dsp106", ["&& c.until - c.issued <= SIGNIN_CERT_SPAN_MS /* plant:cert-span */", ""], "certSigned");
  /* The desk-only field (ds22i, ds22j): signed, of one shape, and told on the page. */
  await plant("dsp117", ["    .concat(c.deskOnly === true ? [\"desk-only\"] : []).map(String).join(\"\\n\"), \"utf8\"); /* plant:cert-desk-only-bytes */", "    .map(String).join(\"\\n\"), \"utf8\");"], "deskOnlyCert");
  await plant("dsp118", ["      .concat(c.deskOnly === true ? [\"deskOnly\"] : [])) /* plant:cert-desk-only-field */", "      .concat(c.deskOnly !== undefined ? [\"deskOnly\"] : []))"], "deskOnlyCert");
  /* The lab's root (ds22h): honoured where the lab is taken, and the lab never taken installed or packaged. */
  await plantWire("dsp130", ["  try { fields = JSON.parse(fs.readFileSync(path.join(__dirname, \"..\", \"package.json\"), \"utf8\")).etiudaTestService; } catch { fields = undefined; } /* plant:ts-asar */", "  try { fields = JSON.parse(fs.readFileSync(path.join(String(process.resourcesPath || \"\"), \"test-service.json\"), \"utf8\")); } catch { fields = undefined; }"], "testServiceAsar");
  await plantWire("dsp112", ["    && !(signinLabRoot !== \"\" && signinVerified(signinLabRoot, viaBytes, d.sig.value))) return false; /* plant:cert-lab-root */", "    ) return false;"], "labRoot");
  await plantWire("dsp113", ["  signinLabRoot = lab.root || \"\"; /* plant:lab-root-use */", ""], "labRoot");
  await plantWire("dsp114", ["root: d.root === undefined ? \"\" : String(d.root) });", "root: \"\" });"], "labRoot");
  await plantWire("dsp115", ["if (!INSTALLED && !app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {", "if (!INSTALLED && process.env.ETIUDA_SIGNIN_LAB) {"], "labRoot");
  await plantWire("dsp116", ["if (!INSTALLED && !app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {", "if (!app.isPackaged && process.env.ETIUDA_SIGNIN_LAB) {"], "labRoot");
  /* The doors' signature (ds22e to ds22g): its check, and each place a door is taken or offered. */
  await plant("dsp107", ["return signinVerified(cert.via.key.pub, Buffer.from(\"etiuda-seat-doors\\n\" + fields.map(String).join(\"\\n\"), \"utf8\"), sig); /* plant:doors-sig */", "return true;"], "doorsSigned");
  await plant("dsp108", ["const doors = signinDoorsOk(j.doors, packed), signed = signinDoorsSigned(doors, j.doorsSig, j.certificate); /* plant:door-signed-read */",
    "const doors = signinDoorsOk(j.doors, packed), signed = doors.length > 0;"], "doorsSigned");
  await plant("dsp109", ["if (signinDoorsSigned(doors, sig, out.held.cert)) Object.assign(out.held, { doors: doors, doorsSig: sig }); /* plant:file-doors-signed */",
    "Object.assign(out.held, { doors: doors, doorsSig: sig });"], "doorsFile");
  await plant("dsjkp1", ["if (out.held && /^t-[0-9a-f]{16}$/.test(String(h.joinKnock))) out.held.joinKnock = String(h.joinKnock); /* plant:knock-file */", ""], "knockFile");
  await plantWire("dsp110", ["  if (!signinDoorsSigned(held.doors, held.doorsSig, held.cert)) return []; /* plant:door-shown-signed */\n", ""], "doorsShownSigned");
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
  await plantPage("dsp119", ["    line:v.deskOnly ? t(\"This computer has its seat, and Etiuda works with its own catalog. Nothing else is needed.\") /* plant:panel-desk-only */",
    "    line:false ? \"\""], "deskOnlyPage");
  /* The page the browser lands on (ds24). */
  await plant("dsp129", ["mark(\"m\") + \"<div class=\\\"hd\\\">\"", "mark(\"m\").replace(\"<use href=\\\"#m\\\"/>\", SIGNIN_LANDING_MARK) + \"<div class=\\\"hd\\\">\""], "landMark");
  await plant("dsp120", ["res.writeHead(303, Object.assign({ location: clean, \"content-length\": 0 }, SIGNIN_LOOP_HEADERS)); /* plant:land-redirect */",
    "res.writeHead(303, Object.assign({ location: clean + \"?\" + query, \"content-length\": 0 }, SIGNIN_LOOP_HEADERS));"], "landSeat");
  await plant("dsp121", ["if (clean && !served && req.method === \"GET\" && u === clean) { /* plant:land-once */", "if (clean && req.method === \"GET\" && u === clean) {"], "landOnce");
  await plant("dsp167", ["cancel: () => { /* plant:loop-cancel */", "cancel: () => { return; /* plant:loop-cancel */"], "landCancel");
  await plant("dsp122", ["timer = setTimeout(() => { if (!landed) landed = \"back\"; if (held)", "timer = setTimeout(() => { if (held)"], "landCap");
  await plant("dsp123", ["return why === \"signin-notallowed\" ? \"org\" : \"appfail\"; /* plant:land-org */", "return \"appfail\";"], "landKinds");
  await plant("dsp124", ["if (ans.ok === true) return ans.cert ? \"seat\" : \"noseat\"; /* plant:land-seat */", "if (ans.ok === true) return \"seat\";"], "landKinds");
  await plant("dsp125", ["hashes.push(\"'sha256-\" + crypto.createHash(\"sha256\").update(m[1], \"utf8\").digest(\"base64\") + \"'\");", "hashes.push(\"'unsafe-inline'\");"], "landSeat");
  await plant("dsp126", ["        if (landed) { serve(res, 200, landed); shut(); } else held = res;", "        if (landed) { serve(res, 200, landed); shut(); } else { serve(res, 200, \"back\"); shut(); }"], "landHeld");
  await plant("dsp127", ["    noseat: [\"Signed in, no seat yet\",", "    noseat: [\"Signed in\","], "landWords");
  await plantWire("dsp128", ["    if (run.loop && typeof run.loop.land === \"function\") run.loop.land(landing); /* plant:land-wired */\n", ""], "landWired");
  /* A gate on a local act, put into the desk file's write in memory, is seen. */
  await plantPage("dsp83", ["if(!r || r===\"signin\" || signinNoSeat(v)) return null; /* plant:told-renewal */", "return null;"], "toldRenewal");
  await plantPage("dsp83b", ["  if(r===\"signin-notassigned\") return {kind:\"renewal\", say:signinSay(\"signin-notassigned\", v), acts:[]}; /* plant:told-notassigned */\n", ""], "toldRenewal");
  await plantPage("dsp84", ["  if(FAIL_FIRST.indexOf(v.said)>=0) return {kind:\"pressed\",", "  if(false) return {kind:\"pressed\","], "toldPressed");
  await plantPage("dsp212", ["return [t(\"The sign-in service could not be reached.\"), t(\"This computer is now signed out of the account it had. Signing in, with either account, works once the sign-in service answers, and nothing on this desk is lost meanwhile.\")]; /* plant:switch-out-words */",
    "return [t(\"The sign-in service could not be reached.\"), \"\"];"], "switchUnanswered");
  await plantPage("dsp213", ["FAIL_FIRST.push(\"signin-switch-out\",\"signin-switch-unmade\"); /* plant:switch-unmade-first */",
    "FAIL_FIRST.push(\"signin-switch-out\");"], "switchUnanswered");
  await plantPage("dsp84b", ["    acts:(v.link ? [{act:\"again\", label:t(\"Open the browser again\")}] : []).concat([{act:\"stop\", label:t(\"Cancel\")}]), link:v.link}; /* plant:waiting-again */",
    "    acts:[{act:\"again\", label:t(\"Open the browser again\")}, {act:\"stop\", label:t(\"Cancel\")}], link:v.link};"], "waitingAgain");
  {
    const dir = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
    const from = "      +(v.link ? '<button type=\"button\" class=\"btn\" data-signin-act=\"again\">'+esc(t(\"Open the browser again\"))+'</button>' : '') /* plant:card-waiting-again */";
    const to = "      +'<button type=\"button\" class=\"btn\" data-signin-act=\"again\">'+esc(t(\"Open the browser again\"))+'</button>'";
    const r = await plantRed(async () => {
      if (SETTINGS.split(from).length !== 2) throw new Error("plant anchor not in settings.js once: " + from);
      const mod = await import("data:text/javascript;base64," + Buffer.from(SETTINGS.replace(from, to).replace(/from "\.\//g, 'from "' + dir)).toString("base64"));
      return CASES.waitingAgain(S, undefined, mod);
    });
    check(r.red, "dsp84c plant " + from.replace(/\s+/g, " ").trim().slice(0, 50) + " turns waitingAgain red" + said(r));
  }
  await plantWire("dsp85", ["if (since >= 0 && since < SIGNIN_CHECK_GAP_MS)", "if (since < SIGNIN_CHECK_GAP_MS)"], "checkGap");
  await plantWire("dsp86", ["  signinSaid = \"\"; /* plant:renew-said */\n", ""], "saidCleared");
  /* The revoked keys' list (ds25): its signature, the later-list rules, where it is read, kept and settled, and each place it judges. */
  await plant("dsp140", ["return signinVerified(NOTE_ROOT, bytes, r.sig.value) || (signinLabRoot !== \"\" && signinVerified(signinLabRoot, bytes, r.sig.value)); /* plant:revoked-sig */", "return true;"], "revokedForged");
  await plant("dsp141", ["if (offered.serial <= kept.serial) return kept; /* plant:revoked-later */", ""], "revokedForged");
  await plant("dsp142", ["return kept.keys.every(k => offered.keys.indexOf(k) >= 0) ? offered : kept; /* plant:revoked-keeps */", "return offered;"], "revokedForged");
  await plant("dsp143", ["return Object.assign(ans, { revoked: j && typeof j === \"object\" && signinRevokedOk(j.revoked) ? j.revoked : null }); /* plant:revoked-read */", "return Object.assign(ans, { revoked: null });"], "revokedTaken");
  await plant("dsp144", ["return Object.assign(settled, { revoked: signinRevokedNext(held && held.revoked, ans.revoked) }); /* plant:revoked-settle */", "return Object.assign(settled, { revoked: ans.revoked || null });"], "revokedOffline");
  await plant("dsp145", ["  out.revoked = signinRevokedOk(d.revoked) ? d.revoked : null; /* plant:revoked-file */", "  out.revoked = null;"], "revokedTaken");
  await plant("dsp146", ["if (!!held && !!held.cert && signinRevokedHas(held.revoked, held.cert)) return true; /* plant:lapse-revoked */", ""], "revokedLapse");
  await plantWire("dsp147", ["  if (signinRevokedHas(held.revoked, held.cert)) return []; /* plant:revoked-offer */\n", ""], "revokedLapse");
  await plantWire("dsp148", ["  if (signinRevokedHas(held.revoked, cert)) return false; /* plant:revoked-flush */\n", ""], "revokedLapse");
  await plantWire("dsp166", ["  if (!signinCertOk(cert, me.key)) return false; /* plant:flush-own-key */", "  /* plant:flush-own-key */"], "flushOwnKey");
  await plantWire("dsp149", ["  if (signinRevokedHas(held.revoked, cert)) return none; /* plant:revoked-knock */\n", ""], "revokedLapse");
  await plantWire("dsp150", ["  if (held && signinRevokedHas(held.revoked, held.cert)) return false; /* plant:revoked-request */\n", ""], "revokedLapse");
  await plantWire("dsp152", ["  base.revoked = s.revoked || null; /* plant:revoked-survives */\n", ""], "revokedSurvives");
  await plant("dsp155", ["  return { managed: true, cause: j.cause === \"own-licence\" || j.cause === \"assigned\" ? j.cause : \"\" }; /* plant:managed-read */", "  return {};"], "managedRead");
  await plant("dsp153", ["const said = { 403: [\"token\", \"signin\", \"no-role\"], 409: [\"full\", \"desks\", \"access-token\"] }[res.status];",
    "const said = { 403: [\"token\", \"signin\"], 409: [\"full\", \"desks\", \"access-token\"] }[res.status];"], "answers");
  await plant("dsp154", ["const said = { 403: [\"token\", \"signin\", \"no-role\"], 409: [\"full\", \"desks\", \"access-token\"] }[res.status];",
    "const said = { 403: [\"token\", \"signin\", \"no-role\"], 409: [\"full\", \"desks\"] }[res.status];"], "answers");
  await plant("dsp151", ["return !!list && Array.isArray(list.keys) && !!cert && !!cert.via && !!cert.via.key && list.keys.indexOf(String(cert.via.key.pub)) >= 0; /* plant:revoked-has */", "return false;"], "revokedLapse");
  await plant("dsp159", ["    .concat(c.pooled === true ? [\"pooled\"] : []) /* plant:cert-pooled-line */\n", ""], "pooledCert");
  await plant("dsp160", ["      .concat(c.pooled === true ? [\"pooled\"] : []) /* plant:cert-pooled-field */\n", ""], "pooledCert");
  await plant("dsp166", ["    && (c.pooled !== true || c.until - c.issued <= SIGNIN_POOLED_SPAN_MS) /* plant:cert-pooled-span */\n", ""], "pooledCert");
  await plant("dsp161", ["const said = { 403: [\"token\", \"signin\", \"no-role\"], 409: [\"full\", \"desks\", \"access-token\"] }[res.status]; /* plant:no-role-read */",
    "const said = { 403: [\"token\", \"signin\"], 409: [\"full\", \"desks\", \"access-token\"] }[res.status];"], "relaySeatAnswer");
  await plantWire("dsp162", ["  if (was !== signinRelaySeatTeam) tellSignin(); /* plant:relay-seat-told */\n", ""], "relaySeatWire");
  await plantWire("dsp163", ["return held.said === \"no-role\" ? \"removed\" : \"renew\"; /* plant:relay-seat-removed */", "return \"renew\";"], "relaySeatWire");
  await plantWire("dsp164", ["if (signinSeatRenewAt && now >= signinSeatRenewAt && now - signinSeatRenewAt < SIGNIN_SEAT_RENEW_MS) return Promise.resolve(); /* plant:seat-renew-gap */", ""], "seatRenewGap");
  await plantWire("dsp164a", ["  if (ans.ok && typeof signinPressNow === \"function\") signinPressNow(false).catch(() => false); /* plant:relay-seat-signin */\n", ""], "relaySeatCleared");
  await plantWire("dsp164b", ["  if (r.said === \"renewed\" && s.held && s.held.cert && !(s.held.ended > 0) && typeof signinRelaySeatClear === \"function\") signinRelaySeatClear(o && o.relay ? \"relay\" : o && o.person ? \"person\" : \"\"); /* plant:relay-seat-renew */\n", ""], "relaySeatCleared");
  await plantWire("dsp164c", ["  if (typeof signinRelaySeatClear === \"function\") signinRelaySeatClear(\"out\"); /* plant:relay-seat-leave */\n", ""], "relaySeatCleared");
  await plantWire("dsp215", ["  ends = how === \"out\"; /* plant:relay-seat-notice-kept */\n", ""], "relaySeatCleared");
  await plantWire("dsp216", ["  resets = how === \"out\"; /* plant:relay-seat-throttle-kept */\n", ""], "relaySeatCleared");
  await plantWire("dsp217", ["  wakes = how === \"out\" || (!!was && how !== \"relay\" && how !== \"person\"); /* plant:relay-seat-clear */\n", ""], "relaySeatCleared");
  await plantPage("dsp157", ["  if(v.relaySeat) return {moment:\"relayseat\",", "  if(false) return {moment:\"relayseat\","], "relaySeatPage");
  await plantPage("dsp158", ["  if(r===\"no-role\") return {kind:\"renewal\", say:signinSay(\"no-role\", v), acts:[]}; /* plant:told-no-role */", ""], "relaySeatPage");
  /* Review 15b, finding 2: the early certificate's helper and each judge that asks it. */
  await plant("dlp2a", ["return !!cert && Number.isSafeInteger(cert.issued) && cert.issued > now + SIGNIN_SKEW_MS; /* plant:cert-early */", "return false;"], "certEarly");
  await plant("dlp2b", ["if (!!held && !!held.cert && signinCertEarly(held.cert, now)) return true; /* plant:lapse-early */", ""], "certEarly");
  await plant("dlp2c", ["if (signinCertEarly(cert, now)) return null; /* plant:door-early */", ""], "certEarly");
  await plantWire("dlp2d", ["  if (signinCertEarly(cert, Date.now())) return none; /* plant:door-invite-early */\n", ""], "certEarly");
  await plantWire("dlp2e", ["  if (signinCertEarly(held.cert, now)) return []; /* plant:door-shown-early */\n", ""], "certEarly");
  await plantWire("dlp2f", ["  if (signinCertEarly(cert, Date.now())) return false; /* plant:flush-early */\n", ""], "certEarly");
  await plant("dlp1a", ["marked = !!d && /^[0-9a-f]{64}$/.test(String(deskKey || \"\")) && signinVerified(String(deskKey), signinMarkBytes(h, store.revoked), d.mark); /* plant:file-mark */", "marked = true;"], "fileMark");
  await plantWire("dlp1b", ["  signinStore = signinFileHeld(signinStore, text, me ? me.key : \"\"); /* plant:file-held */\n", ""], "fileMark");
  await plantWire("dlp1c", ["signinFileMarkText(signinFileText(signinState()), signinSign)", "signinFileText(signinState())"], "fileMark");
  await plant("dlp4", ["marked = !!d && /^[0-9a-f]{64}$/.test(String(deskKey || \"\")) && signinVerified(String(deskKey), signinMarkBytes(h, store.revoked), d.mark); /* plant:file-mark */", "marked = true;"], "fileOtherPerson");
  await plant("dlp6", ["  if (signedIn && held.cert && typeof held.cert.code === \"string\") code = held.cert.code; /* plant:view-cert-code */\n", ""], "viewCertCodeWire");
  await plantWire("dlp7", ["within = fs.statSync(at).size <= SIGNIN_FILE_MAX; /* plant:file-max */", "within = true;"], "fileMax");
  await plant("dlp5", ["mine = !h.cert || signinCertOk(h.cert, String(deskKey || \"\")); /* plant:file-desk-key */", "mine = true;"], "fileDeskKey");
  await plantWire("dlp3", ["  if (Date.now() >= cert.until) return false; /* plant:flush-ended */\n", ""], "certEndedFlush");
  /* B-2a: the desk works, on a clock of its own. */
  await plant("dswp1", ["  if (!c || !signinCertOk(c, deskKey)) return false; /* plant:works-cert */", "  if (!c) return false;"], "worksTable");
  await plant("dswp2", ["  if (signinRevokedHas(held.revoked, c)) return false; /* plant:works-revoked */\n", ""], "worksTable");
  await plant("dswp3", ["  if (!Number.isSafeInteger(deskNow) || deskNow < c.issued) return false; /* plant:works-issued */\n", ""], "worksTable");
  await plant("dswp4", ["  return deskNow < c.until; /* plant:works-until */", "  return true;"], "worksTable");
  await plant("dswp5", ["    works: works, /* plant:view-works */", "    works: true,"], "viewFields");
  await plant("dswp6", ["    now: Number.isSafeInteger(o.deskNow) && o.deskNow > 0 ? o.deskNow : 0, /* plant:view-now */", "    now: 0,"], "viewFields");
  await plant("dswp7", ["    until: cert && Number.isSafeInteger(cert.until) ? cert.until : 0, /* plant:view-until */", "    until: 0,"], "viewFields");
  await plant("dswp8", ["stoppedAt: !works && !!held && held.seated === true ?", "stoppedAt: !works && !!held ?"], "viewFields");
  await plant("dswp9", ["    online: o.online !== false, /* plant:view-online */", "    online: true,"], "viewFields");
  await plantWire("dswp10", ["deskKey: at.key, deskNow: at.desk, last: at.last, online: at.online, registered: st.registered === true }); /* plant:view-clock */","deskKey: at.key, deskNow: Date.now(), last: 0, online: true, registered: st.registered === true });"], "viewClockWire");
  await plantWire("dswp11", ["shown: preview ? Object.keys(SIGNIN_PROVIDERS) : real,", "shown: real,"], "viewSame");
  await plantWire("dswp12", ["outOwed: !!st.out && !signinOutFlight,", "outOwed: !!st.out,"], "viewSame");
  await plant("dswp13", ["licenceManaged: signedIn ? held.managed === true : o.licenceManaged === true,", "licenceManaged: signedIn ? held.managed === true : false,"], "viewSame");
  await plant("dswp14", ["  let desk = c.desk > 0 ? c.desk + Math.round(Math.max(0, byWall, byMono)) : 0; /* plant:clock-forward */", "  let desk = c.desk > 0 ? c.desk + Math.round(byWall) : 0;"], "clockRules");
  await plant("dswp15", ["  let desk = c.desk > 0 ? c.desk + Math.round(Math.max(0, byWall, byMono)) : 0; /* plant:clock-forward */", "  let desk = c.desk > 0 ? c.desk + Math.round(Math.max(byWall, byMono)) : 0;"], "clockRules");
  /* psi's B1, the backward half: the system clock held where the monotonic clock carries it while it stands behind. */
  await plant("dscp1", ["  const at = Number.isFinite(c.wall) ? Math.max(wall, c.wall + byMono) : wall; /* plant:clock-wall-behind */", "  const at = wall;"], "clockKeptBack");
  await plant("dscp2", ["  const at = Number.isFinite(c.wall) ? Math.max(wall, c.wall + byMono) : wall; /* plant:clock-wall-behind */", "  const at = wall;"], "clockStepBack");
  await plant("dscp3", ["    if (cert.issued > issued) { desk = cert.issued; issued = cert.issued; } /* plant:clock-anchor */\n", ""], "clockStopRenewed");
  await plantWire("dscp4", ["    signinEndAsked = String(cert.sig.value); /* plant:end-asked-once */", "    signinEndAsked = \"\";"], "clockStopRenewed");
  await plant("dswp16", ["    if (cert.issued > issued) { desk = cert.issued; issued = cert.issued; } /* plant:clock-anchor */\n",""], "clockSlow");
  await plant("dswp17", ["    if (cert.issued > issued) { desk = cert.issued; issued = cert.issued; } /* plant:clock-anchor */","    { desk = cert.issued; issued = cert.issued; }"], "clockReplay");
  await plant("dswp18", ["  if (!/^[0-9a-f]{64}$/.test(String(deskKey || \"\")) || !signinVerified(String(deskKey), signinClockBytes(c), d.clockMark)) return null; /* plant:clock-mark */\n", ""], "clockMark");
  await plant("dswp19", ["Object.assign(d, { clock: c, clockMark: mark })", "Object.assign(d, { clock: c, mark: mark })"], "clockApart");
  await plantWire("dswp20", ["    signinClock = signinClockStart(signinClockRead(text, key), held, key, wall); /* plant:clock-kept-read */","    signinClock = signinClockStart(null, held, key, wall);"], "clockMark");
  await plantWire("dswp21", ["signinClockText(signinFileMarkText(signinFileText(signinState()), signinSign), signinClock, signinSign)", "signinFileMarkText(signinFileText(signinState()), signinSign)"], "clockFast");
  await plantWire("dswp22", ["if (c.desk > 0 && (!signinClockKept || c.desk - signinClockKept >= SIGNIN_CLOCK_KEEP_MS)) signinSave(); /* plant:clock-keep */", "if (c.desk > 0 && !signinClockKept) signinSave();"], "clockTick");
  await plantWire("dswp23", ["  if (online !== signinOnline) { signinOnline = online; tellSignin(); } /* plant:online-told */", "  if (online !== signinOnline) { signinOnline = online; }"], "clockTick");
  await plantPage("dswp24", ["    works: o.works===true, /* plant:read-works */", "    works: !!o.works,"], "readFields");
  await plantPage("dswp25", ["function signinTimeRead(v){ return Number.isSafeInteger(v) && v>0 && v<=8.64e15 ? v : 0; } /* plant:read-time */", "function signinTimeRead(v){ return Number(v)||0; }"], "readFields");
  await plantPage("dswp26", ["    stoppedAt: signinTimeRead(o.stoppedAt), /* plant:read-stopped */", "    stoppedAt: 0,"], "readFields");
  await plantPage("dswp27", ["    online: o.online!==false, /* plant:read-online */", "    online: true,"], "readFields");
  await plantPage("dspBand", ["if(!btn || typeof btn.querySelector!==\"function\") return; /* plant:door-band-dot */", "if(!btn) return;"], "accountPress");
  /* B-2b: the desk keeps its certificate to its end, knows what its seat is, and stops at the end. */
  await plant("dskp1", ["  if (!v || typeof v !== \"object\" || Array.isArray(v) || SIGNIN_HOLDING_ON.indexOf(v.on) < 0) return null; /* plant:holding-on */","  if (!v || typeof v !== \"object\" || Array.isArray(v)) return null;"], "answerWords");
  await plant("dskp2", ["  if (lead && lead.length <= SIGNIN_LEAD_MAX && !/[\\u0000-\\u001f\\u007f-\\u009f<>\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/.test(lead)) out.lead = lead; /* plant:holding-lead */","  if (typeof v.lead === \"string\") out.lead = v.lead;"], "answerWords");
  await plant("dskp3", ["  for (const k of [\"desk\", \"studio\"]) if (Number.isSafeInteger(v[k]) && v[k] > 0) out[k] = v[k]; /* plant:trials-read */","  for (const k of [\"desk\", \"studio\"]) if (v[k] !== undefined) out[k] = v[k]; /* plant:trials-read */"], "answerWords");
  await plant("dskp4", ["    const words = Object.assign(signinWordsOf(signinHoldingOf(j.seat), signinTrialsOf(j.trials)), signinAskedWords(signinAskedOf(j.asked)), signinInvitedWords(signinInvitedOf(j.invited))); /* plant:words-read */","    const words = {};"], "answerWords");
  await plant("dskp5", ["    const keep = !ans.cert && !!held && !!held.cert; /* plant:keep-none */","    const keep = false;"], "keepNone");
  await plant("dskp6", ["    const ended = ans.cert ? 0 : !keep ? 0 : held.ended > 0 ? held.ended : Number.isSafeInteger(deskNow) && deskNow > 0 ? deskNow : now; /* plant:ended-first */","    const ended = ans.cert ? 0 : !keep ? 0 : Number.isSafeInteger(deskNow) && deskNow > 0 ? deskNow : now; /* plant:ended-first */"], "keepNone");
  await plant("dskp7", ["    return Object.assign(out, ended ? { ended: ended } : {}, signinWordsOf(ans.cert ? ans.holding : keep ? held.holding : null, ans.trials || (held && held.trials)), signinAskedWords(signinAskedOf((ans.asked || []).map(n => ({ lead: { name: n } })))), /* plant:words-settle */","    return Object.assign(out, ended ? { ended: ended } : {}, signinWordsOf(ans.holding, ans.trials), /* plant:words-settle */"], "wordsKept");
  await plant("dskp8", ["  return Object.assign({ held: signinSettle(fresh, said, now(), io && typeof io.deskNow === \"function\" ? io.deskNow() : 0, io && typeof io.deskIssued === \"function\" ? io.deskIssued() : 0), said: said.ok ? \"renewed\" : said.reason }, said.ok ? { idToken: m ? m.got.idToken : got.idToken } : {}); /* plant:renew-desk-now */","  return Object.assign({ held: signinSettle(fresh, said, now()), said: said.ok ? \"renewed\" : said.reason }, said.ok ? { idToken: m ? m.got.idToken : got.idToken } : {}); /* plant:renew-desk-now */"], "keepNone");
  await plantWire("dskp9", ["    if (was.cert) Object.assign(base, { code: was.code, cert: was.cert }, was.ended > 0 ? { ended: was.ended } : {}, was.holding ? { holding: was.holding } : {}); /* plant:take-keeps-cert */\n",""], "wordsKept");
  await plant("dskp10", ["  return Array.isArray(offered) && offered.length > 0 && signinWorks(held, deskKey, deskNow); /* plant:works-offered */","  return signinWorks(held, deskKey, deskNow);"], "noProvider");
  await plant("dskp11", ["  const held = signinSaidOf(kept); /* plant:view-said */","  const held = kept;"], "saidMeaning");
  await plant("dskp12", ["  return held && held.cert && held.ended > 0 ? Object.assign({}, held, { cert: null, doors: [], doorsSig: \"\" }) : held; /* plant:said-of */","  return held;"], "saidMeaning");
  await plant("dskp13", ["    ended: !!signedIn && !!cert && kept.ended > 0 ? kept.ended : 0, /* plant:view-ended */","    ended: 0,"], "keepNone");
  await plant("dskp14", ["    holding: !!signedIn && !!kept.holding ? Object.assign({}, kept.holding) : null, /* plant:view-holding */","    holding: null,"], "wordsKept");
  await plant("dskp15", ["    registered: o.registered === true }; /* plant:view-registered */","    registered: true };"], "noProvider");
  await plant("dskp16", ["      Number.isSafeInteger(o.deskNow) && o.deskNow > 0 ? o.deskNow : Infinity) : 0, /* plant:view-stopped */","      Infinity) : 0,"], "keepNone");
  await plantWire("dskp17", ["  if (held.ended > 0) return null; /* plant:ended-knock */\n",""], "saidMeaning");
  await plantWire("dskp18", ["  if (held && held.ended > 0) return false; /* plant:ended-request */\n",""], "saidMeaning");
  await plant("dskp19", ["    if (cert.issued > issued) { desk = cert.issued; issued = cert.issued; } /* plant:clock-anchor */","    if (desk < cert.issued) { desk = cert.issued; issued = cert.issued; } /* plant:clock-anchor */"], "clockLater");
  await plant("dskp20", ["  return { desk: Math.max(cert.issued, Math.round(wall)), wall: Math.round(wall), mono: null, last: cert.until, issued: cert.issued }; /* plant:clock-restart */","  return { desk: cert.issued, wall: Math.round(wall), mono: null, last: cert.until, issued: cert.issued }; /* plant:clock-restart */"], "clockLost");
  await plant("dskp21", ["function signinClockBytes(c) { return Buffer.from(\"etiuda-signin-clock\\n\" + [c.desk, c.wall, c.last, c.issued].map(String).join(\"\\n\"), \"utf8\"); } /* plant:clock-bytes */","function signinClockBytes(c) { return Buffer.from(\"etiuda-signin-clock\\n\" + [c.desk, c.wall, c.last].map(String).join(\"\\n\"), \"utf8\"); } /* plant:clock-bytes */"], "clockB2a");
  await plantWire("dskp22", ["  if (signinClock === null || signinClockKey !== key) { /* plant:clock-key */","  if (signinClock === null) {"], "clockKeyLate");
  await plantWire("dskp23", ["  if (sig !== signinStopFor) { signinStopFor = sig; const soon = setTimeout(signinStopArm, 0); if (soon && soon.unref) soon.unref(); } /* plant:stop-follows */\n",""], "stopWired");
  await plantWire("dskp24", ["  signinStopArm(); /* plant:stop-tick */\n",""], "stopWired");
  await plantWire("dskp25", ["    require(\"electron\").powerMonitor.on(\"resume\", () => signinStopArm()); /* plant:stop-resume */\n",""], "stopWired");
  await plantWire("dskp26", ["    signinStopTimer = setTimeout(signinStopArm, Math.max(1, Math.min(cert.until - c.desk, SIGNIN_STOP_MAX_MS))); /* plant:stop-at-end */","    signinStopTimer = null;"], "stopTimer");
  await plantWire("dskp27", ["    signinEndAsked = String(cert.sig.value); /* plant:end-asked-once */","    signinEndAsked = \"\";"], "stopTimer");
  await plantWire("dskp28", ["  if (turned) tellSignin(); /* plant:stop-told */\n",""], "stopTimer");
  await plantWire("dskp29", ["  if (!signinWorksNow()) { focusDesk(); return; } /* plant:pick-works */\n",""], "pickRefused");
  await plantWire("dskp30", ["  signinStore.registered = signinOffered(signinTableBase).length > 0; /* plant:registered-base */","  signinStore.registered = signinOffered().length > 0; /* plant:registered-base */"], "noProvider");
  await plant("dskp31", ["  if (out.held && out.held.cert && Number.isSafeInteger(h.ended) && h.ended > 0) out.held.ended = h.ended; /* plant:ended-file */\n",""], "olderReaders");
  await plant("dskp32", ["  if (out.held) Object.assign(out.held, signinWordsOf(out.held.cert ? signinHoldingOf(h.holding) : null, signinTrialsOf(h.trials))); /* plant:words-file */\n",""], "wordsKept");
  await plantPage("dskp33", ["    ended: signedIn ? signinTimeRead(o.ended) : 0, /* plant:read-ended */","    ended: signinTimeRead(o.ended),"], "pageWords");
  await plantPage("dskp34", ["  if(!h || typeof h!==\"object\" || SIGNIN_HOLDING_ON.indexOf(h.on)<0) return null; /* plant:read-holding */","  if(!h || typeof h!==\"object\") return null;"], "pageWords");
  await plantPage("dskp35", ["  if(h.on===\"team\" && typeof h.lead===\"string\" && h.lead.length<=120 && h.lead.trim() && !/[<>]/.test(h.lead) && !/[\\x00-\\x1f\\x7f-\\x9f]/.test(h.lead)) out.lead=h.lead; /* plant:read-lead */","  if(typeof h.lead===\"string\") out.lead=h.lead;"], "pageWords");
  await plantPage("dskp36", ["    registered: o.registered===true /* plant:read-registered */","    registered: !!o.registered"], "pageWords");
  /* B-3a1: review 46 findings 1 and 2, deskWorks() and the door rule. */
  await plant("dsgp1", ["    if (ans.cert && held && held.cert && ans.cert.issued < held.cert.issued) return Object.assign({}, held, { checked: now, reached: false }); /* plant:settle-issued */\n", ""], "settleIssued");
  await plantWire("dsgp2", ["  if (!(me && me.key) && rawHeld && (rawHeld.cert || rawHeld.code)) { const stripped = signinStore; signinStore = undefined; return stripped; } /* plant:state-no-key */\n", ""], "stateKeyLate");
  await plantPage("dsgp3", ["    if(!signinHost()) return false; /* plant:desk-works-host */\n", ""], "deskWorksGate");
  await plantPage("dsgp4", ["    if(signinV.works!==true) return false; /* plant:desk-works */\n", ""], "deskWorksGate");
  await plantPage("dsgp5", ["  if(!v || typeof v!==\"object\" || v.works!==true) return false; /* plant:desk-works-arg */\n", ""], "deskWorksGate");
  await plantPage("dsgp6", ["    if(!signinHasView) return false; /* plant:door-due-read */\n", ""], "doorRule");
  await plantPage("dsgp7", ["    if(!deskWorks()) return true; /* plant:door-due-works */\n", ""], "doorRule");
  await plantPage("dsgp8", ["    if(!deskWorks()){ if(firstSigninOpen) paintFirstSignin(); signinTell(); return; } /* plant:door-close-works */\n", ""], "doorRule");
  {
    const from = "      return; /* plant:door-no-escape */\n";
    const r = await plantRed(async () => CASES.doorRule(S, undefined, [from, ""]));
    check(r.red, "dsgp9 plant " + from.trim().slice(0, 50) + " turns doorRule red" + said(r));
  }
  /* B-3a2a plants: offers/intake, keyboard lock and page askDesk refusal. */
  const plantMod = async (id, file, swap, name) => {
    const r = await plantRed(async () => CASES[name](S, { file, swap }));
    check(r.red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 50) + " turns " + name + " red" + said(r));
  };
  await plantMod("dsgp10", "signin.js", ["  if(firstSigninStands() || (signinHasView && !deskWorks())) return true; /* plant:door-holds */\n", ""], "offersWait");
  await plantMod("dsgp11", "catalog-offer.js", ["  if(doorHolds()){ whenDoorLowers(eOfferCatalogAtBoot); return false; } /* plant:offer-boot-door */\n", ""], "offersWait");
  await plantMod("dsgp12", "catalog-offer.js", ["  if(doorHolds()){ pendingListing=all; whenDoorLowers(replayPendingListing); return; } /* plant:offer-listing-door */\n", ""], "offersWait");
  await plantMod("dsgp13", "catalog-offer.js", ["  if(doorHolds()){ pendingHostFile=args; whenDoorLowers(replayPendingHostFile); return; } /* plant:offer-host-file-door */\n", ""], "offersWait");
  await plantMod("dsgp14", "catalog-offer.js", ["  if(doorHolds()){ pendingWatch=pendingWatch===null?!!interactive:(pendingWatch||!!interactive); whenDoorLowers(replayPendingWatch); return; } /* plant:offer-watch-door */\n", ""], "offersWait");
  await plantMod("dsgp15", "catalog-file.js", ["    if(doorHolds()){ pendingDrop=f; whenDoorLowers(replayPendingDrop); return; } /* plant:drop-catalog-door */\n", ""], "offersWait");
  await plantMod("dsgp16", "catalog-file.js", ["  if(doorHolds()){ pendingImport={text:String(text||\"\"), fileName:fileName, offTeam:!!offTeam}; whenDoorLowers(replayPendingImport); return false; } /* plant:import-text-door */\n", ""], "offersWait");
  await plantMod("dsgp17", "catalog-file.js", ["  if(doorHolds()) return; /* plant:import-picker-door */\n", ""], "offersWait");
  {
    const from = "    if(firstSigninOpenNow() && !openCover()) doorLock=true; /* plant:door-key-lock */\n";
    const r = await plantRed(async () => CASES.doorKeyboard(S, [from, ""]));
    check(r.red, "dsgp18 plant " + from.trim().slice(0, 50) + " turns doorKeyboard red" + said(r));
  }
  {
    const from = "      if(firstSigninOpenNow() && !openCover()) capLock=true; /* plant:door-capture-lock */\n";
    const r = await plantRed(async () => CASES.doorKeyboard(S, [from, ""]));
    check(r.red, "dsgp19 plant " + from.trim().slice(0, 50) + " turns doorKeyboard red" + said(r));
  }
  {
    const from = "  if(!deskWorks()) return PICK_EMPTY_OPS.has(op) ? {rows:[], count:\"\"} : null; /* plant:pick-ask-works */\n";
    const r = await plantRed(async () => CASES.pickAskDoor(S, [from, ""]));
    check(r.red, "dsgp20 plant " + from.trim().slice(0, 50) + " turns pickAskDoor red" + said(r));
  }
  /* B-3a2b plants: stop's instant flush and door raise, shell picker hide, and browser build's door. */
  await plantWire("dsgp21", ["    try{ eDeskFlush(); }catch(e){} /* plant:stop-flush */\n", ""], "stopInstant");
  await plantWire("dsgp22", ["    openFirstSignin(); /* plant:stop-raise-door */\n", ""], "stopInstant");
  await plantWire("dsgp23", ["  if (!signinWorksNow()) hidePicker(false); /* plant:stop-hide-picker */\n", ""], "stopHidePickerShell");
  await plantWire("dsgp24", ["    if(!signinHost()) return true; /* plant:door-due-browser */\n", ""], "browserDoor");
  await plantWire("dsgp25", ["  if(!signinHost()) return true; /* plant:door-holds-browser */\n", ""], "browserDoor");
  await plantWire("dsgp26", ["  if(!signinHost()){ el.innerHTML=doorBrowserHtml(); hugDottedGround(el); return; } /* plant:door-paint-browser */\n", ""], "browserDoor");
  /* Argon 51 M1 and M2 plants: each turns its check red alone. */
  await plant("dsgp27", ["    const clockFloor = Number.isSafeInteger(clockIssued) && clockIssued > 0 ? clockIssued : 0; /* plant:settle-clock-issued */", "    const clockFloor = 0;"], "settleClockIssued");
  await plantWire("dsgp28", ["    deskIssued: () => signinClockNow().issued, /* plant:io-desk-issued */\n", ""], "settleClockIssued");
  await plantWire("dsgp29", ["  const clkIssued = clk && Number.isSafeInteger(clk.issued) ? clk.issued : 0; /* plant:take-clock-issued */", "  const clkIssued = 0;"], "settleClockIssued");
  await plant("dsgp30", ["  current = !h.cert || !clock || !(clock.issued > 0) || h.cert.issued >= clock.issued; /* plant:file-clock-issued */", "  current = true;"], "settleClockIssued");
  await plantWire("dsgp31", ["  const keyOk = !signinState._key || key === signinState._key; /* plant:state-key */", "  const keyOk = true;"], "stateKeyRestoreAndTell");
  await plantWire("dsgp32", ["  if (wasClock && wasKey !== key && key && held && held.cert) tellSignin(); /* plant:clock-key-told */\n", ""], "stateKeyRestoreAndTell");
  /* A lead's act ends the seat (dsfe): each deciding line planted alone. */
  await plant("dsfep1", ["  const aside = ends ? { cert: null, doors: [], doorsSig: \"\", freed: Number.isSafeInteger(deskNow) && deskNow > 0 ? deskNow : now } : {}; /* plant:freed-aside */", "  const aside = {};"], "freedEnds");
  await plant("dsfep2", ["  const ends = freed && !!held.cert; /* plant:freed-ends */", "  const ends = !!held.cert;"], "freedOthers");
  await plant("dsfep3", ["    delete out.freed; /* plant:freed-clear */", ""], "freedEnds");
  await plant("dsfep4", ["  if (out.held && !out.held.cert && Number.isSafeInteger(h.freed) && h.freed > 0) out.held.freed = h.freed; /* plant:freed-file */", ""], "freedEnds");
  await plant("dsfep5", ["  if (signedIn && held && held.freed > 0) view.freed = held.freed; /* plant:view-freed */", ""], "freedDoor");
  await plant("dsfep6", ["  return Object.assign({}, held, { checked: now, reached: true, said: ans.reason, ask: freed || held.ask === true,", "  return Object.assign({ provider: held.provider, sub: held.sub, seed: held.seed }, { checked: now, reached: true, said: ans.reason, ask: freed || held.ask === true,"], "freedKeeps");
  await plantPage("dsfep7", ["    freed: signedIn ? signinTimeRead(o.freed) : 0, /* plant:read-freed */", "    freed: 0,"], "freedDoor");
  await plantPage("dsfep8", ["  else if(!works && v.signedIn && v.freed>0) state=\"freed\"; /* plant:door-state-freed */", ""], "freedDoor");
  await plantPage("dsfep9", ["  if(ds.state===\"freed\") return [t(\"This account's seat on the team has been taken back.\"), /* plant:door-lines-freed */", "  if(false) return [t(\"This account's seat on the team has been taken back.\"),"], "freedDoor");
  await plantPage("dsfep10", ["|| ds.state===\"freed\") return doorLaterHtml(v, ds); /* plant:door-later-freed */", ") return doorLaterHtml(v, ds);"], "freedDoor");
  await plantPage("dsfep13", ["  if(!checkFilled && !freed) quiet.push(doorTextPress(t(\"Check now\"), \"check\")); /* plant:door-freed-nocheck */", "  if(!checkFilled) quiet.push(doorTextPress(t(\"Check now\"), \"check\"));"], "freedDoor");
  await plantPage("dsfep11", ["  quiet.push(doorTextPress(freed ? t(\"Sign in again\") : t(\"Use another account\"), \"another\")); /* plant:door-freed-again */", "  quiet.push(doorTextPress(t(\"Use another account\"), \"another\"));"], "freedDoor");
  await plantPage("dsfep12", ["  if(v.freed>0 && deskDoorState(v).state===\"freed\"){", "  if(false){"], "freedDoor");
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
