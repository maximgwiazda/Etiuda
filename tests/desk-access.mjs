/* The licence service as its own resource, the desk's half (decision 49, section 11.11). Bare node, no window, no network, no
 * provider and no service: the shell's sign-in functions are sliced from shell/main.js and driven with stand-ins.
 *
 *     node tests/desk-access.mjs        exit code is the number of failed checks, capped at 63
 *
 *   da1 (P1) an ordinary licence asks nothing new: the path is none, the authorize asks today's scopes, the refresh today's scope, the
 *       token answer keeps no access token, and the body and its signed bytes are today's (rebuilt here from the interface)
 *   da2 (P2) a personal account, Microsoft's unmanaged or any Google account, is never asked the service's scope
 *   da3 (P3) where the policy is unset and the service answers "access-token", the refresh token held is redeemed for the service's
 *       scope silently, no browser opened, and the seat is asked once more with both tokens over the managed bytes
 *   da4 on a managed path the authorize and the refresh ask the service's scope, and the body carries the access token signed with
 *       both tokens' hashes (the service's line, rebuilt here)
 *   da5 the access token is kept only where its scope was asked and only within 4096 characters, and never into the sign-in's state
 *   da6 AADSTS50105 at the redemption is the organisation's not-assigned refusal; the path is remembered only where the service took it
 *   da8 a renewal: a remembered path is tried ordinary first and forgotten where the service answers ordinarily; met with
 *       "access-token", it redeems once, remembers the path and keeps the refresh token the redemption rotated in
 *
 * EVERY GUARD IS SHOWN RED (dap): the line carrying its plant tag is put in another form in memory and the same case is read again;
 * nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const CHECKS = 8, PLANTS = 10;
const EXPECTED = CHECKS + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the slice ---------------------------------------------------------------------------------------------------------- */
function once(src, a) {
  const at = src.indexOf(a);
  if (at < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return at;
}
const lineOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n", at)); };
const fnOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n}", at) + 2); };
const tableOf = () => { const at = once(MAIN, "\nlet SIGNIN_PROVIDERS = Object.freeze({") + 1; return MAIN.slice(at, MAIN.indexOf("\n});", at) + 4); };
let TEXT = "", sliced = "";
try {
  TEXT = [lineOf("const GOOGLE_HD_NEEDS_EMAIL ="), tableOf(), lineOf("const SIGNIN_TENANT ="), lineOf("const SIGNIN_SKEW_MS ="),
    lineOf("function signinKnown("), lineOf("const SIGNIN_ACCESS_ID ="), lineOf("const SIGNIN_ACCESS_MAX ="), fnOf("function signinServiceScope("),
    fnOf("function signinAccessFor("), lineOf("const SIGNIN_PERSONAL_TENANT ="), fnOf("function signinPinOk("), lineOf("const SIGNIN_NONCE_LINE ="),
    fnOf("function signinNonce("), lineOf("function signinB64url("), fnOf("function signinSame("), fnOf("function signinAuthorize("),
    lineOf("function signinSecretPart("), fnOf("function signinRefreshForm("), fnOf("function signinClaims("), fnOf("function signinIssuerOk("),
    fnOf("function signinTokens("), fnOf("function signinTraceSaid("), fnOf("function signinTrace("), fnOf("async function signinRenew("),
    lineOf("const SIGNIN_DESK_LINE ="), lineOf("function signinTokenHash("), fnOf("function signinDeskBytes("),
    lineOf("const SIGNIN_DESK_MANAGED_LINE ="), fnOf("function signinDeskManagedBytes("), fnOf("function signinDeskManagedBody("),
    fnOf("function signinDeskBody("), lineOf("let SIGNIN_SERVICE ="), fnOf("async function signinSeat("), fnOf("async function signinSeatAccess("),
    lineOf("const SIGNIN_LOST ="), fnOf("async function signinRenewHeld("), fnOf("async function signinRenewHeldAccess("),
  ].join("\n");
} catch (e) { sliced = e.message; }
const NAMES = ["signinServiceScope", "signinAccessFor", "signinAuthorize", "signinRefreshForm", "signinTokens", "signinRenew", "signinDeskBody",
  "signinSeat", "signinSeatAccess", "signinKnown", "signinRenewHeld"];
/* The service's answer read as the shell's signinAnswer reads it, for what these cases need: a seat, or a refusal by its reason. */
const answerOf = res => { const j = JSON.parse(String(res.body)); return j.ok ? { ok: true, code: "ABCD2345EFGH6789", cert: null } : { ok: false, reason: j.reason }; };
function shellOf(swap) {
  let text = TEXT;
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = text + "\nconst BASE = SIGNIN_PROVIDERS;\nreturn { " + NAMES.join(", ") + ", base: () => BASE, setTable: t => { SIGNIN_PROVIDERS = t; } };";
  /* signinSettle stood in: the held state with the answer said, as the real one keeps what these cases read. */
  const settle = (held, ans) => Object.assign({}, held, { said: ans.ok ? "" : ans.reason });
  return new Function("crypto", "Buffer", "URLSearchParams", "signinAnswer", "signinTraceLine", "signinTraceClaims", "signinSettle", body)(crypto, Buffer, URLSearchParams,
    answerOf, () => "", () => "", settle);
}

/* ---- stand-ins: illustrations only; no provider issues these ids ---------------------------------------------------------- */
const MS_ID = "11111111-2222-3333-4444-555555555555", SERVICE_ID = "99999999-8888-7777-6666-555555555555", G_ID = "stand-in.apps.example";
const TID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", NOW = 1_800_000_000_000;
const SCOPE = "api://" + SERVICE_ID + "/Licence.Use";
const KEY = crypto.generateKeyPairSync("ed25519"), DESK = KEY.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const sign = bytes => crypto.sign(null, bytes, KEY.privateKey).toString("hex");
const verifies = (bytes, sig) => crypto.verify(null, bytes, KEY.publicKey, Buffer.from(String(sig), "hex"));
const sha = s => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = c => b64({ alg: "none" }) + "." + b64(c) + ".x";
const SEED = "5".repeat(64), SUB = "s-ms";
const idClaims = over => Object.assign({ iss: "https://login.microsoftonline.com/" + TID + "/v2.0", tid: TID, aud: MS_ID, sub: SUB, exp: NOW / 1000 + 3600 }, over);
const ACCESS = "eyJ.access-token-of-the-service.stand-in";
/* The table with ids filled in, the service's id given or not, set as the shell's. */
function tableOn(s, service) {
  const t = s.base(), out = {};
  for (const id of Object.keys(t)) out[id] = Object.freeze(Object.assign({}, t[id], { clientId: id === "microsoft" ? MS_ID : G_ID }, id === "microsoft" ? { service } : {}));
  s.setTable(Object.freeze(out));
}
const MS = { id: "microsoft", clientId: MS_ID, clientSecret: "" }, G = { id: "google", clientId: G_ID, clientSecret: "" };
const today = { desk: (provider, idToken, desk, t, seed) => Buffer.from("etiuda-licence-signin-desk\n" + [provider, sha(idToken), desk, t].concat(seed ? ["seed:" + seed] : []).join("\n"), "utf8"),
  managed: (provider, idToken, access, desk, t) => Buffer.from("etiuda-licence-signin-desk-managed\n" + [provider, sha(idToken), sha(access), desk, t].join("\n"), "utf8") };
const scopeOf = url => new URL(url).searchParams.get("scope");
const formOf = buf => new URLSearchParams(Buffer.from(buf).toString("utf8"));

const CASES = {};
CASES.ordinary = s => {
  tableOn(s, SERVICE_ID);
  const path = s.signinAccessFor(MS, false, { provider: "microsoft" });
  const url = s.signinAuthorize(MS, 50000, DESK, n => Buffer.alloc(n, 7), path || undefined).url;
  const form = formOf(s.signinRefreshForm(MS, "r", path || undefined));
  const got = s.signinTokens({ status: 200, bytes: Buffer.from(JSON.stringify({ id_token: jwt(idClaims({ nonce: "n" })), access_token: "graph", refresh_token: "r" })) }, MS, "n", NOW);
  const body = s.signinDeskBody("microsoft", "id.tok.en", DESK, SEED, NOW, sign);
  return path === "" && scopeOf(url) === "openid profile offline_access" && url.indexOf("api%3A") < 0 && form.get("scope") === "openid profile offline_access"
    && got.ok && !("accessToken" in got) && Object.keys(body).join() === "provider,idToken,desk,seed,t,sig" && verifies(today.desk("microsoft", "id.tok.en", DESK, NOW, SEED), body.sig);
};
CASES.personal = s => {
  tableOn(s, SERVICE_ID);
  const ms = s.signinAccessFor(MS, false, null), g = s.signinAccessFor(G, true, { access: true });
  const gUrl = s.signinAuthorize(G, 50000, DESK, n => Buffer.alloc(n, 7), g || undefined).url;
  return ms === "" && g === "" && gUrl.indexOf("api%3A") < 0 && s.signinServiceScope(G) === "";
};
/* A service that answers "access-token" to an ID token alone and seats a request carrying both; a provider that redeems silently. */
function stand(s, opts) {
  const o = opts || {}, st = { asked: [], tokens: [], opened: 0 };
  const io = {
    sign, packed: true, trace: null,
    openPage: () => { st.opened++; return true; },
    tokenAsk: async (url, form) => {
      st.tokens.push({ url, form: formOf(form) });
      if (o.refuse) return { status: 400, bytes: Buffer.from(JSON.stringify({ error: "invalid_grant", error_description: o.refuse })) };
      return { status: 200, bytes: Buffer.from(JSON.stringify({ id_token: jwt(idClaims()), access_token: ACCESS, refresh_token: "r2" })) };
    },
    serviceAsk: async (url, body) => {
      st.asked.push(body);
      return { status: body.accessToken ? 200 : 409, body: JSON.stringify(body.accessToken ? { ok: true } : { ok: false, reason: "access-token" }) };
    },
  };
  return { io, st };
}
CASES.silent = async s => {
  tableOn(s, SERVICE_ID);
  const { io, st } = stand(s);
  const got = { ok: true, idToken: jwt(idClaims({ nonce: "n" })), refreshToken: "r1", sub: SUB, seed: SEED };
  const first = await s.signinSeat(io, "microsoft", DESK, got.idToken, SEED, () => NOW);
  const m = await s.signinSeatAccess(io, MS, DESK, got, SEED, () => NOW);
  const second = st.asked[1] || {};
  return first.ok === false && first.reason === "access-token" && m.ans.ok === true && m.access === true && st.opened === 0
    && st.tokens.length === 1 && st.tokens[0].form.get("grant_type") === "refresh_token" && st.tokens[0].form.get("refresh_token") === "r1"
    && String(st.tokens[0].form.get("scope")).split(" ").indexOf(SCOPE) >= 0 && st.asked.length === 2 && second.accessToken === ACCESS
    && verifies(today.managed("microsoft", second.idToken, ACCESS, DESK, NOW), second.sig) && !verifies(today.desk("microsoft", second.idToken, DESK, NOW), second.sig);
};
CASES.managed = s => {
  tableOn(s, SERVICE_ID);
  const path = s.signinAccessFor(MS, true, null), remembered = s.signinAccessFor(MS, false, { access: true });
  const url = s.signinAuthorize(MS, 50000, DESK, n => Buffer.alloc(n, 7), path).url;
  const form = formOf(s.signinRefreshForm(MS, "r", path));
  const body = s.signinDeskBody("microsoft", "id.tok.en", DESK, SEED, NOW, sign, ACCESS);
  const none = (tableOn(s, ""), s.signinAccessFor(MS, true, null));
  return path === SCOPE && remembered === SCOPE && scopeOf(url) === "openid profile offline_access " + SCOPE && form.get("scope") === "openid profile offline_access " + SCOPE
    && Object.keys(body).join() === "provider,idToken,accessToken,desk,seed,t,sig" && verifies(today.managed("microsoft", "id.tok.en", ACCESS, DESK, NOW), body.sig)
    && none === "";
};
CASES.kept = s => {
  tableOn(s, SERVICE_ID);
  const answer = acc => ({ status: 200, bytes: Buffer.from(JSON.stringify({ id_token: jwt(idClaims({ nonce: "n" })), access_token: acc, refresh_token: "r" })) });
  const asked = s.signinTokens(answer(ACCESS), MS, "n", NOW, undefined, SCOPE), long = s.signinTokens(answer("a".repeat(4097)), MS, "n", NOW, undefined, SCOPE);
  const take = fnOf("function signinTake("), file = fnOf("function signinFileText(");
  return asked.accessToken === ACCESS && long.accessToken === "" && take.indexOf("accessToken") < 0 && file.indexOf("accessToken") < 0
    && s.signinDeskBody("microsoft", "id.tok.en", DESK, SEED, NOW, sign, "a".repeat(4097)) === null;
};
CASES.refused = async s => {
  tableOn(s, SERVICE_ID);
  const { io, st } = stand(s, { refuse: "AADSTS50105: The signed in user is not assigned to a role for the application." });
  const got = { ok: true, idToken: jwt(idClaims({ nonce: "n" })), refreshToken: "r1", sub: SUB, seed: SEED };
  const m = await s.signinSeatAccess(io, MS, DESK, got, SEED, () => NOW);
  const other = await s.signinSeatAccess(stand(s, { refuse: "AADSTS70000: something else" }).io, MS, DESK, got, SEED, () => NOW);
  return m.ans.reason === "signin-notassigned" && m.access === false && other.ans.reason === "signin-refused" && st.opened === 0 && st.asked.length === 0;
};

/* da8: the renewal's remembered path, cleared by an ordinary answer, kept with the rotated refresh token by "access-token". */
CASES.renewal = async s => {
  tableOn(s, SERVICE_ID);
  const keep = t => "sealed:" + t, kept = t => String(t).replace(/^sealed:/, "");
  const ioOf = (serviceFor, refreshes) => {
    const st = { forms: [], asked: [] };
    const io = { sign, packed: true, trace: null, managed: false, keep, kept,
      tokenAsk: async (url, form) => { const q = formOf(form); st.forms.push(q); const n = st.forms.length;
        return { status: 200, bytes: Buffer.from(JSON.stringify({ id_token: jwt(idClaims()), refresh_token: refreshes[n - 1], access_token: String(q.get("scope")).indexOf(SCOPE) >= 0 ? ACCESS : "graph" })) }; },
      serviceAsk: async (url, body) => { st.asked.push(body); return serviceFor(body, st.asked.length); },
    };
    return { io, st };
  };
  const held = over => Object.assign({ provider: "microsoft", refresh: keep("r1"), sub: keep(SUB), seed: SEED, code: "", cert: null }, over);
  const seated = { status: 200, body: JSON.stringify({ ok: true }) }, asks = { status: 409, body: JSON.stringify({ ok: false, reason: "access-token" }) };
  const a = ioOf(() => seated, ["r2"]);
  const cleared = await s.signinRenewHeld(a.io, MS, DESK, held({ access: true }), () => NOW);
  const b = ioOf(body => (body.accessToken ? seated : asks), ["r2", "r3"]);
  const met = await s.signinRenewHeld(b.io, MS, DESK, held({}), () => NOW);
  return cleared.said === "renewed" && !("access" in cleared.held) && String(a.st.forms[0].get("scope")).indexOf(SCOPE) < 0 && !("accessToken" in a.st.asked[0])
    && met.said === "renewed" && met.held.access === true && met.held.refresh === keep("r3") && b.st.forms.length === 2
    && String(b.st.forms[1].get("scope")).indexOf(SCOPE) >= 0 && b.st.asked[1].accessToken === ACCESS;
};

/* ---- the run ------------------------------------------------------------------------------------------------------------- */
let S = null;
try { if (!sliced) S = shellOf(null); } catch (e) { sliced = e.message; }
console.log("desk-access: the licence service's own scope, the desk's half" + (sliced ? " (" + sliced + ")" : ""));
const run = async (name, s) => { try { return !!(await CASES[name](s)); } catch (e) { return false; } };
for (const [id, name, what] of [
  ["da1", "ordinary", "P1: an ordinary licence asks nothing new: today's scopes, refresh, token answer, body and signed bytes"],
  ["da2", "personal", "P2: a personal account, Microsoft's unmanaged or any Google account, is never asked the service's scope"],
  ["da3", "silent", "P3: \"access-token\" with the policy unset redeems the refresh token silently, no browser, and asks again with both tokens over the managed bytes"],
  ["da4", "managed", "a managed path asks the service's scope at the authorize and the refresh, and signs both tokens' hashes; with no service id, nothing"],
  ["da5", "kept", "the access token is kept only where asked and within 4096 characters, and never into the sign-in's state"],
  ["da6", "refused", "AADSTS50105 at the redemption is the not-assigned refusal; any other, the sign-in not finished; nothing sent, nothing opened"],
  ["da8", "renewal", "a remembered path renews ordinary first and is forgotten on an ordinary answer; \"access-token\" redeems once and keeps the rotated refresh token"],
]) check(!!S && await run(name, S), id + " " + what);
check(fnOf("async function signinRenewHeld(").indexOf("if (access) return signinRenewHeldAccess(io, p, deskKey, held, now, access);") >= 0
  && MAIN.indexOf("    let got = await signinRun(io, p, me.key, Date.now, access || undefined);") >= 0
  && MAIN.indexOf("if (!access && !ans.ok && ans.reason === \"access-token\") { const m = await signinSeatAccess(io, p, me.key, got, got.seed, Date.now);") >= 0,
  "da7 the press and the renewal take the path: the renewal on it renews with the scope, the press asks it, and \"access-token\" off it redeems");

async function plant(id, swap, name) {
  let red = false, why = "";
  try { red = !(await run(name, shellOf(swap))); } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 60) + " turns " + name + " red" + (why ? " (" + why + ")" : ""));
}
if (!PLANTS_OFF && S) {
  await plant("dap1", ["return managed === true || (!!held && held.access === true) ? signinServiceScope(p) : \"\"; /* plant:access-path */", "return signinServiceScope(p);"], "ordinary");
  await plant("dap2", ["return managed === true || (!!held && held.access === true) ? signinServiceScope(p) : \"\"; /* plant:access-path */", "return signinServiceScope(p);"], "personal");
  await plant("dap3", ["  const r = await signinRenew(io, p, deskKey, got.refreshToken, got.seed || seed || \"0\".repeat(64), got.sub, now, scope); /* plant:access-silent */",
    "  io.openPage(\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?prompt=consent\"); const r = await signinRenew(io, p, deskKey, got.refreshToken, got.seed || seed || \"0\".repeat(64), got.sub, now, scope);"], "silent");
  await plant("dap4", ["[o.provider, o.tokenHash, o.accessHash, o.desk, o.t].map(String).join(\"\\n\"), \"utf8\"); /* plant:access-signed */",
    "[o.provider, o.tokenHash, o.desk, o.t].map(String).join(\"\\n\"), \"utf8\");"], "managed");
  await plant("dap5", ["  if (access) out.accessToken = typeof json.access_token === \"string\" && json.access_token.length <= SIGNIN_ACCESS_MAX ? json.access_token : \"\"; /* plant:access-kept */",
    "  if (access) out.accessToken = typeof json.access_token === \"string\" ? json.access_token : \"\";"], "kept");
  await plant("dap6", ["  if (!got.ok && access && /\\bAADSTS50105\\b/.test(signinTraceSaid(res, hide).error_description || \"\")) return { ok: false, reason: \"signin-notassigned\" }; /* plant:access-50105 */",
    ""], "refused");
  await plant("dap7", ["  if (accessToken !== undefined) return signinDeskManagedBody(provider, idToken, desk, seed, t, sign, accessToken); /* plant:access-body */", ""], "managed");
  await plant("dap8", ["  if (access) out.accessToken = typeof json.access_token === \"string\" && json.access_token.length <= SIGNIN_ACCESS_MAX ? json.access_token : \"\"; /* plant:access-kept */",
    "  out.accessToken = typeof json.access_token === \"string\" && json.access_token.length <= SIGNIN_ACCESS_MAX ? json.access_token : \"\";"], "ordinary");
  await plant("dap9", ["  if (m && m.access) { fresh.access = true; fresh.refresh = io.keep(m.got.refreshToken) || fresh.refresh; } /* plant:access-rotated */",
    "  if (m && m.access) { fresh.access = true; }"], "renewal");
  await plant("dap10", ["  else if (!m && ans.reason !== \"unreached\" && fresh.access) delete fresh.access; /* plant:access-clear */", ""], "renewal");
}

const done = asserted === EXPECTED;
console.log("desk-access: " + (failed ? failed + " of " + asserted + " FAILED" : "ran " + asserted + ", red 0") + (done ? "" : " (expected " + EXPECTED + ")"));
process.exit(!done ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
