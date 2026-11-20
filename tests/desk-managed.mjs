/* A managed installation on the desk (decision 49): the six machine values, read and honoured. Bare node, no window, no browser,
 * no network and no registry: the policy is the text reg export would write, read by the shell's own policyValues.
 *
 *     node tests/desk-managed.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIM. Unset, nothing changes: the reader answers nothing set, the provider table is the same object, and the view carries no
 * policy. SigninProvider, SigninTenant and AllowPersonalAccounts pin the providers, the address asked and the token taken, on sign-in
 * and on renewal, and a pin that cannot be read closes the sign-in. Managed takes Buy, another account, sign-out (unless the computer
 * is shared) and the sign-in code away, and says who decides; an account Microsoft refuses as not assigned (AADSTS50105) is its own
 * reason, told as the organisation's refusal and whom to ask (SupportContact, or its IT department).
 *
 * THE SHELL'S HALF IS SLICED from shell/main.js and evaluated with stand-ins; THE PAGE'S HALF is src/modules/signin.js and
 * settings.js over a stand-in host, English and Polish. Section 11.8's legs: M1 (mm1), M2 (mm2), M3 (mm3).
 *
 * EVERY GUARD IS SHOWN RED (mmp): the line carrying its plant tag is put in another form in memory and the same case is read
 * again; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const SIGNIN = fs.readFileSync(path.join(ROOT, "src", "modules", "signin.js"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const CHECKS = 38, PLANTS = 55;
const EXPECTED = CHECKS + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the slices ------------------------------------------------------------------------------------------------------- */
function once(src, a) {
  const at = src.indexOf(a);
  if (at < 0 || src.indexOf(a, at + 1) >= 0) throw new Error("not in shell/main.js once: " + a.slice(0, 60));
  return at;
}
const lineOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n", at)); };
const fnOf = start => { const at = once(MAIN, "\n" + start) + 1; return MAIN.slice(at, MAIN.indexOf("\n}", at) + 2); };
const tableOf = () => { const at = once(MAIN, "\nlet SIGNIN_PROVIDERS = Object.freeze({") + 1; return MAIN.slice(at, MAIN.indexOf("\n});", at) + 4); };
let SHELL = "", sliced = "";
try {
  SHELL = [lineOf("const POLICY_KEY ="), lineOf("const POLICY_HEAD ="), lineOf("const POLICY_EXPORT_LINE ="), fnOf("function policyValues("),
    lineOf("const MANAGED_TENANT_ID ="), lineOf("const MANAGED_TENANT_DOMAIN ="), lineOf("const MANAGED_CONTACT_MAX ="),
    MAIN.slice(once(MAIN, "\nconst MANAGED_NAMES =") + 1, MAIN.indexOf("]);", once(MAIN, "\nconst MANAGED_NAMES =")) + 3),
    fnOf("function managedPolicyFrom("), lineOf("const GOOGLE_HD_NEEDS_EMAIL ="), tableOf(), lineOf("const SIGNIN_TENANT ="), lineOf("const SIGNIN_CLIENT ="),
    lineOf("const SIGNIN_SKEW_MS ="), lineOf("function signinKnown("), lineOf("const SIGNIN_PERSONAL_TENANT ="), fnOf("function signinPinTable("),
    fnOf("function signinPinOk("), lineOf("let signinPacked ="), fnOf("function signinOffered("), lineOf("const SIGNIN_NONCE_LINE ="),
    fnOf("function signinNonce("), lineOf("function signinB64url("), fnOf("function signinSame("), fnOf("function signinAuthorize("),
    fnOf("function signinPageOk("), fnOf("function signinRefusedWhy("), fnOf("function signinClaims("), fnOf("function signinIssuerOk("),
    fnOf("function signinTokens("), fnOf("function signinLanding("), lineOf("const SIGNIN_LOST ="), fnOf("function signinPolicyRefuses("), fnOf("function signinAccountKept("), fnOf("function signinOtherHeld("),
    MAIN.slice(once(MAIN, "\nconst MANAGED_WAITING =") + 1, MAIN.indexOf("});", once(MAIN, "\nconst MANAGED_WAITING =")) + 3),
    lineOf("function buyManaged(")].join("\n");
} catch (e) { sliced = e.message; }
const NAMES = ["managedPolicyFrom", "policyValues", "signinPinTable", "signinPinOk", "signinOffered", "signinAuthorize", "signinPageOk",
  "signinRefusedWhy", "signinTokens", "signinLanding", "signinOtherHeld", "signinAccountKept", "MANAGED_WAITING", "SIGNIN_LOST", "buyManaged"];
/* The slice evaluated, `swap` [from, to] put in place of the one line holding `from`; `kept` stands for signinKept. */
function shellOf(swap) {
  let text = SHELL;
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  /* The shipped table, kept before any case pins it, so each case starts from it. */
  const body = text + "\nconst BASE_TABLE = SIGNIN_PROVIDERS;\nreturn { " + NAMES.join(", ") + ", table: () => BASE_TABLE, setTable: t => { SIGNIN_PROVIDERS = t; } };";
  return new Function("crypto", "Buffer", "URLSearchParams", "safeStorage", "signinKept", body)(crypto, Buffer, URLSearchParams, {},
    (st, sealed) => (/^sealed:/.test(String(sealed)) ? String(sealed).slice(7) : ""));
}

/* ---- stand-ins -------------------------------------------------------------------------------------------------------- */
/* Illustrations only: no provider issues these ids, tenants or domains. */
const MS_ID = "11111111-2222-3333-4444-555555555555", G_ID = "stand-in.apps.example";
const TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", OTHER = "ffffffff-0000-1111-2222-333333333333", PERSONAL = "9188040d-6c67-4c5b-b112-36a304b66dad";
const DOMAIN = "example.com";
const NOW = 1_800_000_000_000;
const head = "Windows Registry Editor Version 5.00\r\n\r\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\r\n";
const dword = n => "dword:" + n.toString(16).padStart(8, "0");
/* reg export's text for `vals` {Name: number | string}. */
function regText(vals) {
  return head + Object.entries(vals).map(([k, v]) => "\"" + k + "\"=" + (typeof v === "number" ? dword(v) : "\"" + String(v).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") + "\r\n").join("") + "\r\n";
}
const OTHER_NINE = { TeamFolder: "D:\\Team\\share", LeadKey: "a".repeat(64), DeskNoUpdateCheck: 1, StudioNoUpdateCheck: 1, AiProvider: "openai",
  AiEndpoint: "https://ai.example.com/v1/", AiModel: "m", AiKey: "k", DeskOrganisationModel: 0 };
function filled(s) {
  const t = s.table(), out = {};
  for (const id of Object.keys(t)) out[id] = Object.freeze(Object.assign({}, t[id], { clientId: id === "microsoft" ? MS_ID : G_ID }));
  return Object.freeze(out);
}
const pol = (s, vals) => s.managedPolicyFrom(s.policyValues(regText(vals)));
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = c => b64({ alg: "none" }) + "." + b64(c) + ".x";
const NONCE = "n".repeat(64);
const msClaims = (tid, over) => Object.assign({ iss: "https://login.microsoftonline.com/" + tid + "/v2.0", tid, aud: MS_ID, sub: "s-ms", exp: NOW / 1000 + 3600, nonce: NONCE }, over);
const gClaims = over => Object.assign({ iss: "https://accounts.google.com", aud: G_ID, sub: "s-g", exp: NOW / 1000 + 3600, nonce: NONCE }, over);
const answer = c => ({ status: 200, bytes: Buffer.from(JSON.stringify({ id_token: jwt(c), refresh_token: "r" })) });
/* The shell's table under `vals`, as signinState takes it, and a token of `claims` read by it. */
function pinned(s, vals) { const t = s.signinPinTable(filled(s), pol(s, vals)); s.setTable(t); return t; }
function token(s, id, claims, sub) { return s.signinTokens(answer(claims), { id, clientId: id === "microsoft" ? MS_ID : G_ID }, NONCE, NOW, sub); }

const CASES = {};
/* mm-r1: nothing set, or only the other nine, is nothing: `any` false and every field as an unmanaged desk has it. */
CASES.unset = s => {
  const none = s.managedPolicyFrom(null), nine = pol(s, OTHER_NINE), blank = pol(s, { Managed: "", SigninProvider: "" });
  const off = o => !o.managed && !o.shared && o.personal === true && !o.provider && !o.tenant && !o.closed && !o.contact;
  return off(none) && !none.any && off(nine) && !nine.any && off(blank) && blank.any === true;
};
/* mm-r2: the switches: anything but empty or 0 is on; AllowPersonalAccounts unset follows Managed, set it decides. */
CASES.switches = s => {
  const on = pol(s, { Managed: 1 }), zero = pol(s, { Managed: 0 }), yes = pol(s, { Managed: "yes" }), szero = pol(s, { Managed: "0" });
  const shared = pol(s, { Managed: 1, SharedComputer: 1 }), allow = pol(s, { Managed: 1, AllowPersonalAccounts: 1 }), deny = pol(s, { AllowPersonalAccounts: 0 });
  return on.managed && on.personal === false && !zero.managed && zero.personal === true && yes.managed && !szero.managed
    && shared.shared && allow.personal === true && deny.personal === false && !deny.managed && deny.any;
};
/* mm-r3: provider and tenant: a known provider in any case, a tenant id or a domain fixing its provider, anything else closed. */
CASES.pins = s => {
  const ms = pol(s, { SigninProvider: " Microsoft " }), bad = pol(s, { SigninProvider: "okta" }), dw = pol(s, { SigninProvider: 1 });
  const tid = pol(s, { SigninTenant: TENANT.toUpperCase() }), dom = pol(s, { SigninTenant: "Example.COM" }), junk = pol(s, { SigninTenant: "not a tenant" });
  const clash = pol(s, { SigninProvider: "google", SigninTenant: TENANT }), agree = pol(s, { SigninProvider: "microsoft", SigninTenant: TENANT });
  return ms.provider === "microsoft" && !ms.closed && bad.closed && !bad.provider && dw.closed
    && tid.provider === "microsoft" && tid.tenant === TENANT && dom.provider === "google" && dom.tenant === DOMAIN && junk.closed
    && clash.closed && !clash.tenant && agree.provider === "microsoft" && agree.tenant === TENANT && !agree.closed;
};
/* mm-r4: SupportContact as written up to 200 characters, trimmed; longer, or with a control character, not at all. */
CASES.contact = s => {
  const ok = pol(s, { SupportContact: "  Service desk, ext. 4400  " }), long = pol(s, { SupportContact: "x".repeat(201) }), max = pol(s, { SupportContact: "y".repeat(200) });
  return ok.contact === "Service desk, ext. 4400" && long.contact === "" && long.any && max.contact.length === 200;
};
/* mm-s1: the table: unset it is the same object; closed it is empty; a provider leaves that one. */
CASES.table = s => {
  const base = filled(s);
  const same = s.signinPinTable(base, pol(s, OTHER_NINE)) === base;
  const closed = s.signinPinTable(base, pol(s, { SigninProvider: "okta" }));
  s.setTable(closed);
  const offeredClosed = s.signinOffered(closed, {}).length === 0;
  const g = s.signinPinTable(base, pol(s, { SigninProvider: "google" }));
  return same && Object.keys(closed).length === 0 && offeredClosed && JSON.stringify(Object.keys(g)) === "[\"google\"]";
};
/* mm-s2: a tenant id: Microsoft asked at that tenant, at sign-in and for the token, the page check following; a token of another tenant
   or of personal accounts refused "signin-tenant", the tenant's own taken, on renewal too. */
CASES.tenant = s => {
  const t = pinned(s, { SigninTenant: TENANT });
  const p = { id: "microsoft", clientId: MS_ID }, a = s.signinAuthorize(p, 50000, "d".repeat(64), n => Buffer.alloc(n, 7));
  const at = a.url.indexOf("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/authorize?") === 0 && t.microsoft.token.indexOf("/" + TENANT + "/") > 0;
  const page = s.signinPageOk(a.url) && !s.signinPageOk(a.url.replace(TENANT, "common"));
  const nonce = a.nonce;
  const tok = (tid, sub) => s.signinTokens(answer(Object.assign(msClaims(tid), { nonce })), p, nonce, NOW, sub);
  const renew = s.signinTokens(answer(Object.assign(msClaims(OTHER), { nonce: undefined, sub: "s-ms" })), p, nonce, NOW, "s-ms");
  return at && page && !t.google && tok(TENANT).ok === true && tok(OTHER).reason === "signin-tenant" && tok(PERSONAL).reason === "signin-tenant"
    && renew.reason === "signin-tenant" && s.SIGNIN_LOST.indexOf("signin-tenant") >= 0;
};
/* mm-s3: personal accounts off (Managed alone): Microsoft at "organizations" and no personal tenant; Google only with a hosted domain. */
CASES.work = s => {
  const t = pinned(s, { Managed: 1 });
  const ms = t.microsoft.authorize.indexOf("/organizations/oauth2/") > 0;
  return ms && token(s, "microsoft", msClaims(PERSONAL)).reason === "signin-tenant" && token(s, "microsoft", msClaims(OTHER)).ok === true
    && token(s, "google", gClaims()).reason === "signin-tenant" && token(s, "google", gClaims({ hd: "any.example" })).ok === true;
};
/* mm-s4: a Workspace domain: Google alone, the domain hinted, a token of another domain or none refused, the domain's own taken. */
CASES.domain = s => {
  const t = pinned(s, { SigninTenant: DOMAIN });
  const p = { id: "google", clientId: G_ID }, a = s.signinAuthorize(p, 50000, "d".repeat(64), n => Buffer.alloc(n, 7));
  return !t.microsoft && new URL(a.url).searchParams.get("hd") === DOMAIN && token(s, "google", gClaims({ hd: "Example.com" })).ok === true
    && token(s, "google", gClaims({ hd: "other.example" })).reason === "signin-tenant" && token(s, "google", gClaims()).reason === "signin-tenant";
};
/* mm-s5: unpinned, a personal account and a token with no hosted domain are taken as before. */
CASES.unpinned = s => {
  pinned(s, OTHER_NINE);
  return token(s, "microsoft", msClaims(PERSONAL)).ok === true && token(s, "google", gClaims()).ok === true;
};
/* mm-s6: AADSTS50105 is its own reason whatever `error` says; the organisation's codes and a Cancel as before. The landing offers
   another account ("org") only where the computer is not managed. */
CASES.reasons = s => {
  const w = s.signinRefusedWhy;
  const d = "AADSTS50105: The signed in user is not assigned to a role for the application.";
  const why = w("access_denied", d) === "signin-notassigned" && w("invalid_request", d) === "signin-notassigned"
    && w("consent_required", "") === "signin-notallowed" && w("access_denied", "AADSTS65004: declined") === "signin-cancelled" && w("access_denied", "") === "signin-cancelled";
  const L = (reason, m) => s.signinLanding({ ok: false, reason }, undefined, m);
  const land = L("signin-notassigned") === "org" && L("signin-notallowed") === "org" && L("signin-notassigned", true) === "appfail"
    && L("signin-notallowed", true) === "appfail" && L("signin-tenant") === "appfail" && L("signin-cancelled", true) === "cancelled";
  return why && land;
};
/* mm-s7: a managed computer that is not shared keeps its account, one that has held a seat here: another sub refused, the same taken, a
   sub that cannot be opened lets it through; shared or unmanaged, nothing is held. */
CASES.keeps = s => {
  const st = m => ({ managed: m, held: { sub: "sealed:s-1", seated: true } });
  const M = pol(s, { Managed: 1 }), SH = pol(s, { Managed: 1, SharedComputer: 1 });
  return s.signinOtherHeld(st(M), "s-2") === true && s.signinOtherHeld(st(M), "s-1") === false && s.signinOtherHeld({ managed: M, held: { sub: "", seated: true } }, "s-2") === false && s.signinOtherHeld({ managed: M, held: { sub: "unopened", seated: true } }, "s-2") === false
    && s.signinOtherHeld(st(SH), "s-2") === false && s.signinOtherHeld({ held: { sub: "sealed:s-1", seated: true } }, "s-2") === false;
};
/* mm-s9 (review 2026-11-16, finding 2): the computer keeps an account only once it has held a seat here. One signed in first and given
   none, before Managed was set or after, may be replaced and signed out of; one that held a seat and lost it (none now, or lapsed) is
   still kept; shared or unmanaged, none is. */
CASES.keptSeated = s => {
  const M = pol(s, { Managed: 1 }), SH = pol(s, { Managed: 1, SharedComputer: 1 });
  const never = { managed: M, held: { sub: "sealed:s-1", cert: null } }, lost = { managed: M, held: { sub: "sealed:s-1", cert: null, seated: true } };
  return s.signinAccountKept(never) === false && s.signinOtherHeld(never, "s-2") === false && s.signinAccountKept(lost) === true
    && s.signinOtherHeld(lost, "s-2") === true && s.signinAccountKept({ managed: SH, held: lost.held }) === false
    && s.signinAccountKept({ managed: null, held: lost.held }) === false && s.signinAccountKept({ managed: M, held: null }) === false;
};
/* mm-s10 (review 2026-11-16 09, finding 1; Claude alpha's decision): a kept account that machine policy as it stands refuses is kept
   no more: a tenant pinned, or changed, after it signed in, and Managed set over a personal account; the same tenant pinned, personal
   accounts allowed, or an account whose organisation was not kept (signed in before it was), is kept as before. */
/* mm-s11 (the account switch meeting the managed floor; the test architect's criterion): while machine policy has not answered,
   nothing judges the account held against it. A managed, unshared computer with a seated account (its organisation kept, and the
   table closed as the shell pins it while the read fails): the account waits, kept from Sign out and from another account, as an
   account never seated does; the read answering keeps it where the answer allows it and releases it where the answer refuses it. */
CASES.waits = s => {
  const held = { provider: "microsoft", sub: "sealed:s-1", seated: true, org: { tid: TENANT, hd: "" } };
  const judged = (managed, h) => { s.setTable(s.signinPinTable(filled(s), managed)); const st = { managed, held: h };
    const r = [s.signinAccountKept(st), s.signinOtherHeld(st, "s-2")].join(); s.setTable(s.table()); return r; };
  const W = Object.assign({}, s.MANAGED_WAITING);
  return W.waiting === true && judged(W, held) === "true,true" && judged(W, Object.assign({}, held, { seated: false })) === "true,true"
    && judged(W, null) === "false,false" && judged(pol(s, { Managed: 1, SigninTenant: TENANT }), held) === "true,true"
    && judged(pol(s, { Managed: 1, SigninTenant: OTHER }), held) === "false,false";
};
CASES.policyRefuses = s => {
  const at = (vals, org) => { pinned(s, vals); const st = { managed: pol(s, vals), held: Object.assign({ provider: "microsoft", sub: "sealed:s-1", seated: true }, org ? { org } : {}) };
    const r = [s.signinAccountKept(st), s.signinOtherHeld(st, "s-2")]; s.setTable(s.table()); return r.join(); };
  return at({ Managed: 1, SigninTenant: OTHER }, { tid: TENANT, hd: "" }) === "false,false" && at({ Managed: 1 }, { tid: PERSONAL, hd: "" }) === "false,false"
    && at({ Managed: 1, SigninTenant: TENANT }, { tid: TENANT, hd: "" }) === "true,true" && at({ Managed: 1, AllowPersonalAccounts: 1 }, { tid: PERSONAL, hd: "" }) === "true,true"
    && at({ Managed: 1, SigninTenant: OTHER }, null) === "true,true" && at({ Managed: 1, SigninProvider: "google" }, { tid: TENANT, hd: "" }) === "false,false";
};
/* mm-s8: Buy: a view under Managed names none, unmanaged and a pin alone do. */
CASES.buy = s => s.buyManaged({ managed: { on: true } }) === true && s.buyManaged({ managed: { on: false, provider: "microsoft" } }) === false
  && s.buyManaged({ code: "X" }) === false;

/* ---- the wiring, read as text: where the state, the view, sign-out, Buy and the press take the policy ---------------------- */
function wiringHolds(src) {
  const at = s => src.indexOf(s) >= 0;
  return at("  const managed = managedPolicy(), stamp = JSON.stringify(managed);\n")
    && at("  const pinned = signinPinTable(signinTableBase, managed);\n")
    && at("  SIGNIN_PROVIDERS = pinned; /* plant:pin-taken */\n  signinPinStamp = stamp;\n  signinStore.managed = managed;\n")
    && at("if (m && m.any) view.managed = {")
    && at("  if (signinAccountKept(s)) return signinView(); /* plant:out-managed */")
    && at("  if (view.managed) view.managed.keeps = o.accountKept; /* plant:view-keeps */")
    && at("accountKept: m && m.any ? signinAccountKept(st) : false,")
    && at("    if (got.ok && managed && signinOtherHeld(st, got.sub)) got = { ok: false, reason: \"signin-other\" }; /* plant:managed-same */")
    && at("  if (buyManaged(v) || (v && v.licenceManaged)) return \"\"; /* plant:buy-managed */")
    && at("{ offer: !!buyAddress() }");
}

/* ---- the page --------------------------------------------------------------------------------------------------------- */
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const DIR = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
function hostOn(v, host) {
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: Object.assign({ signinState: () => v }, host || {}) };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
}
function hostOff() { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
/* A module's text with one line swapped, imported fresh; its own imports reach the real modules. */
function planted(text, swap, what) {
  if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in " + what + " once: " + swap[0]);
  return import("data:text/javascript;base64," + Buffer.from(text.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
}
let storage = null, PG = null, SET = null;
try {
  storage = await import(MOD("storage.js"));
  PG = await import(MOD("signin.js"));
  SET = await import(MOD("settings.js"));
} catch (e) { sliced = sliced || "the page did not load: " + e.message; }
const CODE = "ABCD2345EFGH6789";
const BASE = { offered: ["microsoft", "google"] };
const PROFILES = {
  out: BASE,
  signed: Object.assign({ signedIn: "microsoft", code: CODE, seat: "held", at: NOW, reached: true }, BASE),
  noseat: Object.assign({ signedIn: "microsoft", code: CODE, seat: "none", at: NOW, reached: true }, BASE),
  lapsed: Object.assign({ signedIn: "microsoft", code: CODE, seat: "lapsed", at: NOW, reached: true }, BASE),
  refused: Object.assign({ said: "signin-notassigned" }, BASE),
  notallowed: Object.assign({ said: "signin-notallowed" }, BASE),
};
const M_ON = { on: true, shared: false, personal: false, provider: "microsoft", tenant: true, closed: false, contact: "" };
const OFF = { on: false, shared: false, personal: true, provider: "", tenant: false, closed: false, contact: "" };
const withM = (v, m) => Object.assign({}, v, m ? { managed: m } : {}, m && m.provider ? { offered: [m.provider] } : {});
/* Account and the header's panel for view `v`, in `lang`, with a host that offers Buy; `set` and `pg` a planted module where given. */
async function drawn(v, lang, set, pg) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, { buyState: () => ({ offer: true }) });
  try {
    const P = pg || PG, S = set || SET;
    const door = P.signinDoor(P.signinRead(v));
    return { acct: S.settingsPageHtml("account", ""), door: door ? P.signinPanelHtml(door) : "", moment: door ? door.moment : "", acts: door ? door.acts || [] : [] };
  } finally { hostOff(); storage.lsSet("eUiLang", "en"); }
}
const actsOf = d => {
  const all = (d.acct + d.door).match(/data-(?:e-open|signin-act|e-provider)="[^"]*"/g) || [];
  return new Set(all.map(a => a.replace(/"$/, "").replace(/^data-/, "").replace(/="/, ":")));
};
const words = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const EN = { b: "Your organisation has not given this account access to Etiuda.", it: "Its IT department can: asking them to assign the account is enough." };
const PL = { b: "Organizacja nie przyznała temu kontu dostępu do Etiudy.", it: "Może to zrobić jej dział IT: wystarczy poprosić o przypisanie konta." };

/* mm-p1: unset, nothing changes: each profile's Account and panel the same whether the view carries no policy or all six off. */
CASES.pageUnset = async (s, set, pg) => {
  for (const lang of ["en", "pl"]) for (const v of Object.values(PROFILES)) {
    const a = await drawn(v, lang, set, pg), b = await drawn(withM(v, OFF), lang, set, pg);
    if (a.acct !== b.acct || a.door !== b.door) return false;
  }
  return true;
};
/* mm1 (M1): managed, not assigned: Account and the panel say the refusal and whom to ask (the IT department, or SupportContact as
   written) and nothing else: no provider but the pinned one, no code, no Buy, no trial, no other account; English and Polish. */
CASES.m1 = async (s, set, pg) => {
  let ok = true;
  for (const [lang, W] of [["en", EN], ["pl", PL]]) {
    for (const contact of ["", "Service desk <4400>"]) {
      const d = await drawn(withM(PROFILES.refused, Object.assign({}, M_ON, { contact })), lang, set, pg), all = d.acct + d.door, w = words(all);
      const says = h => { const x = words(h); return x.indexOf(W.b) >= 0 && (contact ? x.indexOf("Service desk <4400>") >= 0 && x.indexOf(W.it) < 0 : x.indexOf(W.it) >= 0); };
      const told = says(d.acct) && says(d.door) && all.indexOf("<4400>") < 0;
      const acts = [...actsOf(d)].sort().join(",");
      ok = ok && told && d.moment === "managed-refused" && acts === "e-open:signin,e-provider:microsoft,signin-act:choose"
        && !/trial|próbn/i.test(w) && all.indexOf(CODE) < 0 && all.indexOf("data-e-open=\"buy\"") < 0 && !/another account|innego konta/i.test(w);
    }
  }
  return ok;
};
/* The acts an account surface owns: Buy, another account, sign out, the code's Copy, and the panel's way to Account. */
const ACCOUNT_ACTS = new Set(["e-open:buy", "signin-act:another", "signin-act:out", "signin-act:copy", "signin-act:account", "e-provider:google"]);
/* mm2 (M2): managed against unmanaged, profile by profile: the acts reachable differ only by account acts, and managed adds none. */
CASES.m2 = async (s, set, pg) => {
  for (const v of Object.values(PROFILES)) {
    const a = actsOf(await drawn(v, "en", set, pg)), b = actsOf(await drawn(withM(v, M_ON), "en", set, pg));
    for (const x of b) if (!a.has(x)) return false;
    for (const x of a) if (!b.has(x) && !ACCOUNT_ACTS.has(x)) return false;
  }
  return true;
};
/* mm3 (M3): no reachable act leads to a personal account or a trial with AllowPersonalAccounts unset: the line naming personal accounts
   is gone and only the pinned provider is offered; with it set, a personal sign-in is offered again, and still no trial. */
CASES.m3 = async (s, set, pg) => {
  const unset = await drawn(withM(PROFILES.out, M_ON), "en", set, pg);
  const allowed = await drawn(withM(PROFILES.out, Object.assign({}, M_ON, { personal: true, provider: "", tenant: false })), "en", set, pg);
  const personal = h => /personal account/i.test(words(h));
  return !personal(unset.acct + unset.door) && !/trial/i.test(words(unset.acct + unset.door))
    && actsOf(allowed).has("e-provider:google") && !/trial/i.test(words(allowed.acct + allowed.door));
};
/* mm-p2: a managed seat: the panel says who decides and the seat with when it was checked, no button; Account keeps the account (no
   other account, no sign out, no code) and shows the sign-in held to the provider with the lock; shared, both buttons return. */
CASES.managedSeat = async (s, set, pg) => {
  const today = Object.assign({}, PROFILES.signed, { at: Date.now() });
  const d = await drawn(withM(today, M_ON), "en", set, pg), w = words(d.door), a = words(d.acct);
  const panel = d.moment === "managed" && d.acts.length === 0 && w.indexOf("Managed by your organisation.") >= 0
    && w.indexOf("Your organisation gave this account its seat on this desk.") >= 0 && /Seat held · checked today, \d\d:\d\d/.test(w);
  const acct = d.acct.indexOf("data-signin-act=\"another\"") < 0 && d.acct.indexOf("data-signin-act=\"out\"") < 0 && d.acct.indexOf("data-row=\"code\"") < 0
    && a.indexOf("Microsoft · work accounts of the organisation") >= 0 && a.indexOf("Set by your organisation") >= 0 && d.acct.indexOf("data-row=\"signin\"") >= 0;
  const sh = await drawn(withM(PROFILES.signed, Object.assign({}, M_ON, { shared: true })), "en", set, pg);
  const shared = sh.acct.indexOf("data-signin-act=\"another\"") >= 0 && sh.acct.indexOf("data-signin-act=\"out\"") >= 0
    && words(sh.acct).indexOf("A shared computer: another person may sign in here, with an account of your organisation.") >= 0;
  const pl = await drawn(withM(PROFILES.signed, M_ON), "pl", set, pg);
  const polish = words(pl.door).indexOf("Zarządzane przez organizację.") >= 0 && words(pl.acct).indexOf("Ustawione przez organizację") >= 0;
  return panel && acct && shared && polish;
};
/* mm-p8 (finding 2): the shell saying the computer keeps no account (keeps: false), Account offers another account and Sign out on a
   managed, unshared computer; saying nothing or keeps: true, neither, as before. */
CASES.keepsNone = async (s, set, pg) => {
  const has = d => d.acct.indexOf("data-signin-act=\"another\"") >= 0 && d.acct.indexOf("data-signin-act=\"out\"") >= 0;
  const none = await drawn(withM(PROFILES.noseat, Object.assign({}, M_ON, { keeps: false })), "en", set, pg);
  const kept = await drawn(withM(PROFILES.noseat, Object.assign({}, M_ON, { keeps: true })), "en", set, pg), silent = await drawn(withM(PROFILES.noseat, M_ON), "en", set, pg);
  return has(none) && !has(kept) && !has(silent);
};
/* mm-p3: no seat on a managed computer: the no-role words, no trial, purchase or other account, and no code. */
CASES.noRole = async (s, set, pg) => {
  const d = await drawn(withM(PROFILES.noseat, M_ON), "en", set, pg), w = words(d.acct + d.door);
  return w.indexOf("This account has no Etiuda role in its organisation, so it holds no seat.") >= 0 && !/trial|purchase|another account/i.test(w)
    && d.acct.indexOf("data-row=\"code\"") < 0 && d.door.indexOf("sgn-code") < 0;
};
/* mm-p4: unmanaged, an account not assigned is told as decision 20 (b) tells the organisation's refusal, another account offered. */
CASES.unmanagedRefused = async (s, set, pg) => {
  const a = await drawn(PROFILES.refused, "en", set, pg), b = await drawn(PROFILES.notallowed, "en", set, pg);
  return a.moment === "refused" && a.door === b.door && words(a.door).indexOf("another account can be used meanwhile") >= 0;
};

/* mm-p5: that the desk works on is said only where it holds a catalog: with one, the refusal's line ends on it; with none (a first start
   that never signed in), the line stops at whom to ask. signin.js is read with catalog-boot.js stood in, true and false. */
async function signinFrom(text, held) {
  const stub = "data:text/javascript;base64," + Buffer.from("export function catalogLoaded(){ return " + held + "; }").toString("base64");
  if (text.split('from "./catalog-boot.js"').length !== 2) throw new Error("signin.js imports catalog-boot.js other than once");
  const src = text.replace('from "./catalog-boot.js"', 'from "' + stub + '"').replace(/from "\.\//g, 'from "' + DIR);
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}
const CATALOG_EN = "Etiuda keeps working with the catalog it has.", CATALOG_PL = "Etiuda działa dalej na katalogu, który już ma.";
CASES.catalogBothWays = async (s, set, pg, text) => {
  const said = async (held, lang, contact) => {
    const P = await signinFrom(text || SIGNIN, held);
    storage.lsSet("eUiLang", lang);
    try { return P.signinSay("signin-notassigned", P.signinRead(withM(PROFILES.refused, Object.assign({}, M_ON, { contact }))))[1]; }
    finally { storage.lsSet("eUiLang", "en"); }
  };
  const withEn = await said(true, "en", ""), noneEn = await said(false, "en", ""), withPl = await said(true, "pl", ""), nonePl = await said(false, "pl", "");
  const contact = await said(false, "en", "Service desk"), contactHeld = await said(true, "en", "Service desk");
  return withEn === EN.it + " " + CATALOG_EN && noneEn === EN.it && withPl === PL.it + " " + CATALOG_PL && nonePl === PL.it
    && contact === "To ask for access: Service desk." && contactHeld === "To ask for access: Service desk. " + CATALOG_EN;
};
/* mm-p7: no role: the copywriter's line (2026-11-14), English and Polish, giving way to SupportContact where it is set. */
const NO_ROLE_WORDS = { en: ["This account has no Etiuda role in its organisation, so it holds no seat.", "Its IT department can assign one."],
  pl: ["To konto nie ma w swojej organizacji żadnej roli w Etiudzie, więc nie zajmuje miejsca w licencji.", "Może ją przydzielić dział IT organizacji."] };
CASES.noRoleWords = async (s, set, pg, text) => {
  const said = async (lang, contact) => {
    const P = await signinFrom(text || SIGNIN, false);
    storage.lsSet("eUiLang", lang);
    try { return P.signinSay("no-role", P.signinRead(withM(PROFILES.noseat, Object.assign({}, M_ON, { contact })))); }
    finally { storage.lsSet("eUiLang", "en"); }
  };
  const en = await said("en", ""), pl = await said("pl", ""), withContact = await said("en", "Service desk");
  return JSON.stringify(en) === JSON.stringify(NO_ROLE_WORDS.en) && JSON.stringify(pl) === JSON.stringify(NO_ROLE_WORDS.pl)
    && JSON.stringify(withContact) === JSON.stringify([NO_ROLE_WORDS.en[0], "To ask for access: Service desk."]);
};
/* mm-p6: the Sign-in row says whose accounts in the one of three states that holds: the tenant's, any work account, or those the
   organisation allows. */
CASES.heldTo = async (s, set, pg) => {
  const row = async m => words((await drawn(withM(Object.assign({}, PROFILES.signed, { at: Date.now() }), Object.assign({}, M_ON, m)), "en", set, pg)).acct);
  const tenant = await row({}), work = await row({ tenant: false }), allowed = await row({ tenant: false, personal: true });
  const pl = words((await drawn(withM(PROFILES.signed, Object.assign({}, M_ON, { tenant: false, personal: true })), "pl", set, pg)).acct);
  return tenant.indexOf("Microsoft · work accounts of the organisation") >= 0 && work.indexOf("Microsoft · work accounts Set by") >= 0
    && allowed.indexOf("Microsoft · accounts the organisation allows") >= 0 && pl.indexOf("Microsoft · konta dopuszczone przez organizację") >= 0;
};

/* mm-p8: machine policy not read yet (the shell's policyWaits, review 09 finding 4): the panel and Account say the desk waits for the
   organisation's settings, in their own words (the copywriter's placeholders), offer no provider, Buy or code, and never say the
   computer is managed; English and Polish. With no policy and nothing offered there is no door, as before. */
const WAIT_ON = { on: true, shared: false, personal: false, provider: "", tenant: false, closed: true, contact: "", waiting: true };
const WAIT_WORDS = { en: ["Waiting for the organisation's settings",
  "Etiuda could not yet read what the organisation's IT set for this computer, so signing in waits. It tries again by itself, every few seconds at first and then once a minute, and everything already on this computer works as before."],
  pl: ["Oczekiwanie na ustawienia organizacji",
  "Etiuda nie mogła jeszcze odczytać tego, co dział IT organizacji ustawił dla tego komputera, więc logowanie czeka. Sama ponawia próbę, najpierw co kilka sekund, potem raz na minutę, a wszystko, co już jest na tym komputerze, działa jak dotąd."] };
CASES.waiting = async (s, set, pg) => {
  for (const lang of ["en", "pl"]) {
    const W = WAIT_WORDS[lang], d = await drawn({ offered: [], managed: WAIT_ON }, lang, set, pg), all = words(d.acct + d.door);
    if (d.moment !== "policy-waiting" || words(d.door).indexOf(W[0]) < 0 || words(d.door).indexOf(W[1]) < 0
        || words(d.acct).indexOf(W[0]) < 0 || words(d.acct).indexOf(W[1]) < 0) return false;
    if (/Managed by your organisation|Zarządzane przez organizację/.test(all) || /data-e-provider/.test(d.acct + d.door)
        || d.acct.indexOf("data-e-open=\"buy\"") >= 0 || all.indexOf(CODE) >= 0) return false;
  }
  const none = await drawn({ offered: [] }, "en", set, pg);
  return none.door === "" && none.acct.indexOf("data-signin-waiting") < 0;
};
/* mm-p10 (finding 7, case A): on a managed computer, the Team row's "No team yet" hint never refers to "the code below",
   English and Polish; unmanaged still does. */
const B3 = {
  en: "No team has admitted this account yet. Once a lead admits it, the catalog arrives by itself.",
  pl: "Żaden zespół nie przyjął jeszcze tego konta. Gdy lider zespołu je przyjmie, katalog przyjdzie sam.",
};
CASES.noTeamManaged = async (s, set, pg) => {
  for (const lang of ["en", "pl"]) {
    const m = await drawn(withM(PROFILES.signed, M_ON), lang, set, pg), w = words(m.acct);
    if (w.indexOf(B3[lang]) < 0 || /code below|kodzie poniżej/i.test(w) || m.acct.indexOf("data-row=\"code\"") >= 0) return false;
    const u = await drawn(PROFILES.signed, lang, set, pg), uw = words(u.acct);
    if (!/code below|kodzie poniżej/i.test(uw) || u.acct.indexOf("data-row=\"code\"") < 0) return false;
  }
  return true;
};
/* mm-p11 (finding 7, case B): on a managed computer, askLead shows neither the sign-in code nor the trial line and refers
   to no hidden code; unmanaged still shows both. */
CASES.askLeadManaged = async (s, set, pg) => {
  const until = NOW + 10 * 86400e3;
  for (const seat of ["held", "none"]) {
    const v = Object.assign({}, PROFILES.signed, { seat, askLead: true, trialUntil: until });
    for (const lang of ["en", "pl"]) {
      const m = await drawn(withM(v, M_ON), lang, set, pg), w = words(m.door);
      if (m.moment !== "asklead" || m.door.indexOf(CODE) >= 0 || m.door.indexOf("sgn-code") >= 0
          || m.door.indexOf("sgn-own") >= 0 || /trial|próbn/i.test(w) || /this code|ten kod/i.test(w)) return false;
    }
  }
  const u = await drawn(Object.assign({}, PROFILES.signed, { seat: "held", askLead: true, trialUntil: until }), "en", set, pg);
  return u.moment === "asklead" && u.door.indexOf("sgn-code") >= 0 && u.door.indexOf("sgn-own") >= 0;
};
/* mm-p17 (section B8 row 5): on a managed computer, askLead uses the copywriter's line, English and Polish. */
CASES.askLeadManagedWords = async (s, set, pg) => {
  const want = {
    en: "This account is signed in, and no team has admitted it yet. Once a lead admits it, the catalog arrives by itself.",
    pl: "To konto jest zalogowane, ale żaden zespół jeszcze go nie przyjął. Gdy lider zespołu je przyjmie, katalog przyjdzie sam.",
  };
  for (const seat of ["held", "none"]) {
    const v = Object.assign({}, PROFILES.signed, { seat, askLead: true });
    for (const lang of ["en", "pl"]) {
      const m = await drawn(withM(v, M_ON), lang, set, pg), w = words(m.door);
      if (m.moment !== "asklead" || w.indexOf(want[lang]) < 0) return false;
    }
  }
  return true;
};
/* mm-p12 (finding 8, case A): seat-removed uses SupportContact as text when set, English and Polish; keeps IT words otherwise. */
CASES.seatRemovedContact = async (s, set, pg) => {
  const c = "Service desk <4400>", v = Object.assign({}, PROFILES.signed, { relaySeat: "removed" });
  const want = {
    en: { withC: "This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. To ask for access: Service desk <4400>.",
      noC: "The organisation's IT department can give access again." },
    pl: { withC: "To stanowisko zachowuje swój katalog i działa z nim jak dotąd, ale nowe wydania od zespołu już do niego nie trafiają. W sprawie dostępu: Service desk <4400>.",
      noC: "Dostęp może przywrócić dział IT organizacji." },
  };
  for (const lang of ["en", "pl"]) {
    const a = await drawn(withM(v, Object.assign({}, M_ON, { contact: c })), lang, set, pg);
    const b = await drawn(withM(v, M_ON), lang, set, pg);
    if (words(a.door).indexOf(want[lang].withC) < 0 || a.door.indexOf("<4400>") >= 0 || /<a\b/i.test(a.door)) return false;
    if (words(b.door).indexOf(want[lang].noC) < 0) return false;
  }
  return true;
};
/* mm-p13 (finding 8, case B): unmanaged signin-notassigned and signin-notallowed use SupportContact when set, English and Polish. */
CASES.unmanagedContact = async (s, set, pg) => {
  const c = "Service desk <4400>";
  const want = {
    en: { withC: "To ask for access: Service desk <4400>. Another account can be used meanwhile.",
      noC: "Its IT department can allow it; another account can be used meanwhile." },
    pl: { withC: "W sprawie dostępu: Service desk <4400>. Do tego czasu można użyć innego konta.",
      noC: "Może to zmienić jej dział IT; do tego czasu można użyć innego konta." },
  };
  for (const prof of [PROFILES.refused, PROFILES.notallowed]) {
    for (const lang of ["en", "pl"]) {
      const a = await drawn(withM(prof, Object.assign({}, OFF, { contact: c })), lang, set, pg);
      const b = await drawn(prof, lang, set, pg);
      if (words(a.door).indexOf(want[lang].withC) < 0 || a.door.indexOf("<4400>") >= 0 || /<a\b/i.test(a.door)) return false;
      if (words(b.door).indexOf(want[lang].noC) < 0) return false;
    }
  }
  return true;
};
/* mm-p14 (finding 8, case C): under Managed with policy closed (no sign-in offered), Account says the computer is managed
   and why, using SupportContact when set, English and Polish, without provider or sign-in copy. */
CASES.managedClosedAccount = async (s, set, pg) => {
  const M_CLOSED = Object.assign({}, M_ON, { provider: "", tenant: false, closed: true });
  const want = {
    en: { mgr: "Managed by your organisation.", noC: "No sign-in is offered on this computer just now; the organisation's IT department decides it.",
      withC: "No sign-in is offered on this computer just now. To ask about it: Service desk <4400>." },
    pl: { mgr: "Zarządzane przez organizację.", noC: "Na tym komputerze nie jest teraz dostępne logowanie; decyduje o tym dział IT organizacji.",
      withC: "Na tym komputerze nie jest teraz dostępne logowanie. W tej sprawie: Service desk <4400>." },
  };
  for (const lang of ["en", "pl"]) {
    const a = await drawn({ offered: [], managed: M_CLOSED }, lang, set, pg), aw = words(a.acct);
    const b = await drawn({ offered: [], managed: Object.assign({}, M_CLOSED, { contact: "Service desk <4400>" }) }, lang, set, pg), bw = words(b.acct);
    if (a.door !== "" || b.door !== "") return false;
    if (aw.indexOf(want[lang].mgr) < 0 || aw.indexOf(want[lang].noC) < 0) return false;
    if (bw.indexOf(want[lang].mgr) < 0 || bw.indexOf(want[lang].withC) < 0 || b.acct.indexOf("<4400>") >= 0 || /<a\b[^>]*>[^<]*4400/i.test(b.acct)) return false;
    if (/Signing in brings|This desk signs in|data-e-provider/.test(a.acct + aw + b.acct + bw)) return false;
  }
  const u = await drawn({ offered: [] }, "en", set, pg);
  return u.acct.indexOf("sgn-top") < 0 && u.acct.indexOf("data-signin-managed") < 0;
};
/* mm-p15 (section B1): signin-other uses the copywriter's heading and line (with or without SupportContact), English and Polish,
   both in signinSay and when signed in with said: "signin-other", contact escaped as text. */
CASES.signinOtherWords = async (s, set, pg) => {
  const c = "Service desk <4400>", vBase = Object.assign({}, PROFILES.signed, { said: "signin-other" });
  const want = {
    en: { h: "This computer stays with the account it has.",
      withC: "Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. To ask about it: Service desk <4400>.",
      noC: "Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. The organisation's IT department decides which account is used here." },
    pl: { h: "Ten komputer zostaje przy koncie, które już ma.",
      withC: "Organizacja zarządza kontami na tym komputerze, więc nie można się tu zalogować innym kontem; nic się nie zmieniło. W tej sprawie: Service desk <4400>.",
      noC: "Organizacja zarządza kontami na tym komputerze, więc nie można się tu zalogować innym kontem; nic się nie zmieniło. O tym, jakie konto jest tu używane, decyduje dział IT organizacji." },
  };
  for (const lang of ["en", "pl"]) {
    const a = await drawn(withM(vBase, Object.assign({}, M_ON, { contact: c })), lang, set, pg);
    const b = await drawn(withM(vBase, M_ON), lang, set, pg);
    if (words(a.door).indexOf(want[lang].h) < 0 || words(a.door).indexOf(want[lang].withC) < 0 || a.door.indexOf("<4400>") >= 0) return false;
    if (words(b.door).indexOf(want[lang].h) < 0 || words(b.door).indexOf(want[lang].noC) < 0) return false;
    if (words(a.acct).indexOf(want[lang].h) < 0 || words(a.acct).indexOf(want[lang].withC) < 0) return false;
  }
  return true;
};
/* mm-p16 (section B6 rows 2..4 and key note): joinWhy "waiting", orgTestLine "waiting", teamRowHtml otherLead (with and without
   SupportContact), English and Polish, and no placeholder mark on the connection test's "key" sentence. */
CASES.managedFloorWords = async (s, set, pg, opts) => {
  const Sset = set || SET, langMod = await import(MOD("ui-lang.js")), tjMod = await import(MOD("team-join.js")), hooksMod = await import(MOD("hooks.js"));
  const tjText = (opts && opts.teamJoin) || fs.readFileSync(path.join(ROOT, "src", "modules", "team-join.js"), "utf8");
  const stText = (opts && opts.settings) || SETTINGS;
  const sliceFn = (text, start) => { const a = text.indexOf("\n" + start); return a < 0 ? "" : text.slice(a + 1, text.indexOf("\n}", a) + 2); };
  const testLineFn = new Function("t", "uiLang", sliceFn(stText, "function orgTestLine(") + "\nreturn orgTestLine;")(langMod.t, langMod.uiLang);
  const joinLine = (why, lang) => {
    const a = tjText.indexOf("joinWhy===\"waiting\"");
    if (a < 0) return "";
    const m = /joinWhy==="waiting"\?t\(([^)]+)\)/.exec(tjText.slice(a, a + 220));
    if (!m) return "";
    storage.lsSet("eUiLang", lang);
    try { return langMod.t(JSON.parse(m[1])); } finally { storage.lsSet("eUiLang", "en"); }
  };
  const B6 = {
    en: { join: "This invitation waits until Etiuda can read what the organisation's IT set for this computer. Nothing is lost: it can be used again then.",
      test: "Not sent: Etiuda could not yet read what the organisation's IT set for this computer.",
      otherC: "The organisation's IT names another lead for this computer, so nothing this team's lead signs is used here. To ask about it: Service desk <4400>.",
      otherN: "The organisation's IT names another lead for this computer, so nothing this team's lead signs is used here. The organisation's IT department can say which team this computer belongs to." },
    pl: { join: "To zaproszenie czeka, aż Etiuda odczyta, co dział IT organizacji ustawił dla tego komputera. Nic nie ginie: można go wtedy użyć ponownie.",
      test: "Nie wysłano: Etiuda nie mogła jeszcze odczytać tego, co dział IT organizacji ustawił dla tego komputera.",
      otherC: "Dział IT organizacji wskazał dla tego komputera innego lidera, więc nic, co podpisuje lider tego zespołu, nie jest tu używane. W tej sprawie: Service desk <4400>.",
      otherN: "Dział IT organizacji wskazał dla tego komputera innego lidera, więc nic, co podpisuje lider tego zespołu, nie jest tu używane. Dział IT organizacji może wyjaśnić, do którego zespołu należy ten komputer." },
  };
  for (const lang of ["en", "pl"]) {
    if (joinLine("waiting", lang) !== B6[lang].join) return false;
    storage.lsSet("eUiLang", lang);
    let tl = "", rowC = "", rowN = "";
    try {
      tl = testLineFn({ ok: false, why: "waiting" });
      const drawTeams = contact => {
        let sendJoin = null;
        const wasRender = hooksMod.hooks.render;
        hooksMod.hooks.render = () => {};
        hostOn(withM(PROFILES.signed, Object.assign({}, M_ON, { contact })), {
          teamJoin: () => Promise.resolve(null),
          onTeamJoin: fn => { sendJoin = fn; },
        });
        tjMod.wireTeamJoin();
        sendJoin({ leads: [{ team: "t1", lead: "Alice", print: "0123456789abcdef", otherLead: true }] });
        try { return Sset.settingsPageHtml("teams", ""); } finally { sendJoin({ leads: [] }); hooksMod.hooks.render = wasRender; hostOff(); }
      };
      rowC = drawTeams("Service desk <4400>"); rowN = drawTeams("");
    } finally { storage.lsSet("eUiLang", "en"); }
    if (tl !== B6[lang].test) return false;
    if (words(rowC).indexOf(B6[lang].otherC) < 0 || rowC.indexOf("<4400>") >= 0) return false;
    if (words(rowN).indexOf(B6[lang].otherN) < 0) return false;
  }
  return !/No key is kept for this address, so nothing was sent\."\)\s*\/\/\s*placeholder/.test(stText);
};

/* ---- the run ---------------------------------------------------------------------------------------------------------- */
let S = null;
try { if (!sliced) S = shellOf(null); } catch (e) { sliced = e.message; }
console.log("desk-managed: the managed installation's six values, shell and page" + (sliced ? " (" + sliced + ")" : ""));
const LIST = [
  ["mm-r1", "unset", "nothing set, or only the template's other nine values, reads as nothing set; an empty value is no value"],
  ["mm-r2", "switches", "Managed, SharedComputer and AllowPersonalAccounts read on for anything but empty or 0; personal accounts follow Managed while unset"],
  ["mm-r3", "pins", "SigninProvider and SigninTenant: a known provider, a tenant id or a Workspace domain; anything else, or a pair that disagrees, closes the sign-in"],
  ["mm-r4", "contact", "SupportContact taken trimmed up to 200 characters, and not at all beyond"],
  ["mm-s1", "table", "the provider table is the same object unset, empty closed, and the one provider pinned"],
  ["mm-s2", "tenant", "a tenant id: Microsoft asked at that tenant, the page check following; another tenant's or a personal token refused, at sign-in and renewal"],
  ["mm-s3", "work", "personal accounts off: Microsoft at organizations, the personal tenant refused; Google only with a hosted domain"],
  ["mm-s4", "domain", "a Workspace domain: Google alone, the domain hinted and its token's hd required"],
  ["mm-s5", "unpinned", "unpinned, a personal account and a token with no hosted domain are taken as before"],
  ["mm-s6", "reasons", "AADSTS50105 is signin-notassigned whatever the error; the landing offers another account only off a managed computer"],
  ["mm-s7", "keeps", "a managed, unshared computer refuses another account's sign-in and lets the same through"],
  ["mm-s9", "keptSeated", "review 2026-11-16 finding 2: a managed, unshared computer keeps an account only once it has held a seat here, a lost seat included; one given none may be replaced and signed out of"],
  ["mm-s10", "policyRefuses", "review 09 finding 1: a kept account machine policy now refuses (a tenant pinned or changed after it signed in, Managed over a personal account, another provider pinned) is kept no more; one the policy allows, or whose organisation was not kept, is"],
  ["mm-s11", "waits", "the switch meeting the managed floor: while machine policy has not answered, the account held is neither refused nor released, Sign out and another account wait; the read answering keeps it, or releases it where the answer refuses it"],
  ["mm-s8", "buy", "Buy names no address under Managed, and does with a pin alone"],
  ["mm-p1", "pageUnset", "unset, Account and the panel are byte for byte the same with no policy and with all six off, English and Polish"],
  ["mm1", "m1", "M1: managed and not assigned, Account and the panel say the refusal and whom to ask, and nothing to buy, try or switch"],
  ["mm2", "m2", "M2: managed against unmanaged, the reachable acts differ only by account acts"],
  ["mm3", "m3", "M3: with AllowPersonalAccounts unset no act leads to a personal account or a trial; set, a personal sign-in is offered and no trial"],
  ["mm-p2", "managedSeat", "a managed seat: who decides and when it was checked, the sign-in locked to its provider, no other account or sign out unless shared"],
  ["mm-p9", "keepsNone", "finding 2: where the shell says the computer keeps no account, Account offers another account and Sign out; otherwise neither, as before"],
  ["mm-p3", "noRole", "no seat on a managed computer: the no-role words, nothing to try, buy or switch, no code"],
  ["mm-p4", "unmanagedRefused", "unmanaged, an account not assigned is told as the organisation's refusal, another account offered"],
  ["mm-p5", "catalogBothWays", "that the desk works on with its catalog is said only where it holds one, English and Polish, with or without SupportContact"],
  ["mm-p7", "noRoleWords", "no role: the copywriter's line, English and Polish, giving way to SupportContact where it is set"],
  ["mm-p6", "heldTo", "the Sign-in row in the one of three states that holds: the tenant's work accounts, any work account, or those the organisation allows"],
  ["mm-p8", "waiting", "policy not read yet: the panel and Account say the desk waits for the organisation's settings, offer nothing to sign in with, buy or copy, and never say managed"],
  ["mm-p10", "noTeamManaged", "finding 7: on a managed computer, the Team row never refers to the hidden code below, English and Polish; unmanaged still does"],
  ["mm-p11", "askLeadManaged", "finding 7: on a managed computer, askLead shows neither sign-in code nor trial line and names no hidden code; unmanaged still shows both"],
  ["mm-p12", "seatRemovedContact", "finding 8: seat-removed uses SupportContact when set, English and Polish, as text; keeps IT words otherwise"],
  ["mm-p13", "unmanagedContact", "finding 8: unmanaged signin-notassigned and signin-notallowed use SupportContact when set, English and Polish"],
  ["mm-p14", "managedClosedAccount", "finding 8: under Managed with no sign-in offered, Account says it is managed and why, with SupportContact when set"],
  ["mm-p15", "signinOtherWords", "section B1: signin-other uses the copywriter's heading and line (with or without SupportContact), English and Polish"],
  ["mm-p16", "managedFloorWords", "section B6 rows 2..4: join waiting, connection test waiting, and otherLead with/without SupportContact, English and Polish, and key placeholder mark removed"],
  ["mm-p17", "askLeadManagedWords", "section B8 row 5: managed askLead uses the copywriter's line, English and Polish"],
];
const run = async (name, s, set, pg) => { try { return !!(await CASES[name](s, set, pg)); } catch (e) { return false; } };
for (const [id, name, what] of LIST) check(!!S && await run(name, S), id + " " + what);
check(wiringHolds(MAIN), "mm-w1 the state pins the table and carries the policy, the view names it only where set, sign-out, Buy and the press honour it");
check(fs.readFileSync(path.join(ROOT, "shell", "policy", "etiuda.admx"), "utf8").toLowerCase().split("\n").filter(l => /<policy name="(managed|sharedcomputer|allowpersonalaccounts|signinprovider|signintenant|supportcontact)" class="machine"/.test(l)).length === 6,
  "mm-w2 the template offers the six as machine policy");
/* Intune is promised nowhere: the template and the page say no word of it. */
check(!["etiuda.admx", "en-US/etiuda.adml", "pl-PL/etiuda.adml"].some(f => /intune/i.test(fs.readFileSync(path.join(ROOT, "shell", "policy", f), "utf8")))
  && !/intune/i.test(SIGNIN + SETTINGS), "mm-w3 no word of Intune in the template or the page");

/* ---- plants ----------------------------------------------------------------------------------------------------------- */
async function plantShell(id, swap, name) {
  let red = false, why = "";
  try { red = !(await run(name, shellOf(swap))); } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 60) + " turns " + name + " red" + (why ? " (" + why + ")" : ""));
}
async function plantPage(id, swap, name, which) {
  let red = false, why = "";
  try {
    const mod = await planted(which === "settings" ? SETTINGS : SIGNIN, swap, which === "settings" ? "settings.js" : "signin.js");
    red = !(await run(name, S, which === "settings" ? mod : undefined, which === "settings" ? undefined : mod));
  } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 60) + " turns " + name + " red" + (why ? " (" + why + ")" : ""));
}
function plantText(id, swap, test) {
  const red = MAIN.split(swap[0]).length === 2 && !test(MAIN.replace(swap[0], swap[1]));
  check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 60) + " turns the wiring red");
}
if (!PLANTS_OFF && S) {
  await plantShell("mmp1", ["out.any = MANAGED_NAMES.some(n => own(n) !== null); /* plant:mp-any */", "out.any = true;"], "unset");
  await plantShell("mmp2", ["return !((v.type === \"dword\" || text(v)) && s === \"0\"); /* plant:mp-switch */", "return true;"], "switches");
  await plantShell("mmp3", ["out.personal = personal === null ? !out.managed : personal; /* plant:mp-personal */", "out.personal = personal === null ? true : personal;"], "switches");
  await plantShell("mmp4", ["if (s === \"microsoft\" || s === \"google\") out.provider = s; else bad = true; /* plant:mp-provider */", "if (s === \"microsoft\" || s === \"google\") out.provider = s;"], "pins");
  await plantShell("mmp5", ["else bad = true; /* plant:mp-tenant */", "else {}"], "pins");
  await plantShell("mmp6", ["out.closed = bad || (!!out.provider && !!kind && out.provider !== kind); /* plant:mp-closed */", "out.closed = bad;"], "pins");
  await plantShell("mmp7", ["if (s.length <= MANAGED_CONTACT_MAX && !/[\\u0000-\\u001f\\u007f]/.test(s)) out.contact = s; /* plant:mp-contact */", "out.contact = s;"], "contact");
  await plantShell("mmp8", ["if (!p.closed && !p.provider && !p.tenant && p.personal !== false) return table; /* plant:pin-none */", "if (!p.closed && !p.provider && !p.tenant && p.personal !== false) return Object.freeze(Object.assign({}, table));"], "table");
  await plantShell("mmp9", ["if (p.closed) return Object.freeze(out); /* plant:pin-closed */", ""], "table");
  await plantShell("mmp10", ["if (p.provider && id !== p.provider) continue; /* plant:pin-provider */", ""], "table");
  await plantShell("mmp11", ["out[id] = !at ? e : Object.freeze(Object.assign({}, e, { authorize: e.authorize.replace(\"/common/\", \"/\" + at + \"/\"), /* plant:pin-ms-at */",
    "out[id] = !at ? e : Object.freeze(Object.assign({}, e, { authorize: e.authorize,"], "tenant");
  await plantShell("mmp12", ["if (pin.tid) return tid === pin.tid; /* plant:pin-tid */", "if (pin.tid) return true;"], "tenant");
  await plantShell("mmp13", ["if (pin.hd) return hd === pin.hd; /* plant:pin-hd */", "if (pin.hd) return hd !== \"\";"], "domain");
  await plantShell("mmp14", ["if (pin.work === \"microsoft\") return SIGNIN_TENANT.test(tid) && tid !== SIGNIN_PERSONAL_TENANT; /* plant:pin-work-ms */", "if (pin.work === \"microsoft\") return true;"], "work");
  await plantShell("mmp15", ["return pin.work === \"google\" && hd !== \"\"; /* plant:pin-work-g */", "return true;"], "work");
  await plantShell("mmp16", ["if (!signinPinOk(signinKnown(p.id).pin, c)) return { ok: false, reason: \"signin-tenant\" }; /* plant:token-pin */", ""], "tenant");
  await plantShell("mmp17", ["if (/\\bAADSTS50105\\b/.test(String(said || \"\"))) return \"signin-notassigned\"; /* plant:not-assigned */", ""], "reasons");
  await plantShell("mmp18", ["if (managed === true) return \"appfail\"; /* plant:land-managed */", ""], "reasons");
  await plantShell("mmp19", ["if (!signinAccountKept(st) || !st.held.sub) return false; /* plant:other-held */", "if (!st.held || !st.held.sub) return false;"], "keeps");
  await plantShell("mmp38", ["return !!m && !!m.managed && !m.shared && !!st.held && st.held.seated === true", "return !!m && !!m.managed && !m.shared && !!st.held"], "keptSeated");
  await plantPage("mmp39", ["    const keeps=signinKeepsAccount(v);", "    const keeps=signinManaged(v) && !v.managed.shared;"], "keepsNone", "settings");
  await plantShell("mmp40", ["    && !signinPolicyRefuses(st.held); /* plant:kept-policy */", "    ;"], "policyRefuses");
  await plantShell("mmp41", ["return !known || !signinPinOk(known.pin, held.org); /* plant:policy-refuses */", "return !known;"], "policyRefuses");

  await plantShell("mmp42", ["  if (m && m.waiting === true) return !!st.held; /* plant:kept-waits */", "  /* plant:kept-waits */"], "waits");
  await plantShell("mmp20", ["return !!was && !signinSame(was, String(sub)); /* plant:other-same */", "return !signinSame(was, String(sub));"], "keeps");
  plantText("mmp21", ["  if (signinAccountKept(s)) return signinView(); /* plant:out-managed */", ""], wiringHolds);
  await plantPage("mmp22", ["  const rows=[name], buy=!stranded && buyOffered() && !v.busy && !signinManaged(v) /* plant:buy-page-managed */", "  const rows=[name], buy=!stranded && buyOffered() && !v.busy"], "m1", "settings");
  await plantPage("mmp23", ["    rows.push(row(\"checked\",\"clock\",", "    if(!signinManaged(v)) rows.push(row(\"checked\",\"clock\","], "m2", "settings");
  await plantPage("mmp24", ["function signinCapHolds(v){ return !(v && v.managed && (v.managed.on || v.managed.provider || !v.managed.personal)); } /* plant:cap-holds */",
    "function signinCapHolds(v){ return true; }"], "m3", "signin");
  await plantPage("mmp25", ["(c ? named(t(\"To ask for access: {CONTACT}.\"),\"{CONTACT}\",c) : t(\"Its IT department can: asking them to assign the account is enough.\")) /* plant:refused-contact */",
    "(c ? named(t(\"To ask for access: {CONTACT}.\"),\"{CONTACT}\",c) : \"\")"], "m1", "signin");
  await plantPage("mmp26", ["  return reason===\"signin-tenant\" || (signinManaged(v) && (reason===\"signin-notassigned\" || reason===\"signin-notallowed\")); /* plant:refused-here */",
    "  return reason===\"signin-tenant\";"], "m1", "signin");
  await plantPage("mmp27", ["      +(keeps ? '' : '<span class=\"sgn-acts\"><button type=\"button\" class=\"btn\" data-signin-act=\"another\">'+esc(t(\"Use another account\"))+'</button>' /* plant:card-keeps */",
    "      +(false ? '' : '<span class=\"sgn-acts\"><button type=\"button\" class=\"btn\" data-signin-act=\"another\">'+esc(t(\"Use another account\"))+'</button>'"], "managedSeat", "settings");
  await plantPage("mmp28", ["    if(v.code && !signinManaged(v)) rows.push(row(\"code\",\"code\",t(\"Your sign-in code\"), /* plant:code-row-managed */",
    "    if(v.code) rows.push(row(\"code\",\"code\",t(\"Your sign-in code\"),"], "managedSeat", "settings");
  await plantPage("mmp29", ["  if(reason===\"nolicence\" && signinManaged(v)) /* plant:no-role-managed */", "  if(false)"], "noRole", "signin");
  {
    const swap = ["      + (catalogLoaded() ? \" \"+t(\"Etiuda keeps working with the catalog it has.\") : \"\")]; /* plant:refused-catalog */",
      "      + (true ? \" \"+t(\"Etiuda keeps working with the catalog it has.\") : \"\")];"];
    let red = false;
    try { red = SIGNIN.split(swap[0]).length === 2 && !(await CASES.catalogBothWays(S, undefined, undefined, SIGNIN.replace(swap[0], swap[1]))); } catch (e) { red = false; }
    check(red, "mmp31 plant the catalog's sentence said without one turns catalogBothWays red");
  }
  await plantPage("mmp32", ["  const line=m.tenant ? t(\"{PROVIDER} · work accounts of the organisation\") : !m.personal ? t(\"{PROVIDER} · work accounts\") /* plant:held-to */",
    "  const line=m.tenant ? t(\"{PROVIDER} · work accounts of the organisation\") : true ? t(\"{PROVIDER} · work accounts\")"], "heldTo", "settings");
  await plantPage("mmp30", ["    case \"signin-notassigned\":\n", ""], "unmanagedRefused", "signin");
  await plantPage("mmp34", ["function signinWaiting(v){ return !!(v && v.managed && v.managed.waiting); } /* plant:waiting-page */", "function signinWaiting(v){ return false; }"], "waiting", "signin");
  await plantPage("mmp35", ["function signinShown(v){ return !!(v && (v.offered.length || v.signedIn || signinWaiting(v) || signinStranded(v))); } /* plant:shown-waiting */",
    "function signinShown(v){ return !!(v && (v.offered.length || v.signedIn || signinStranded(v))); }"], "waiting", "signin");
  await plantPage("mmp36", ["  if(signinWaiting(v)) return {moment:\"policy-waiting\", say:signinWaitingWords()}; /* plant:door-waiting */", ""], "waiting", "signin");
  await plantPage("mmp37", ["  if(signinWaiting(v)){ const s=signinWaitingWords(); return '<div class=\"sgn-top col\"><p class=\"sgn-say\" data-signin-waiting><b>'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></p></div>'; } /* plant:card-waiting */", ""], "waiting", "settings");
  {
    const swap = ["    c ? named(t(\"To ask for access: {CONTACT}.\"),\"{CONTACT}\",c) : t(\"Its IT department can assign one.\")]; /* plant:no-role-contact */",
      "    t(\"Its IT department can assign one.\")];"];
    let red = false;
    try { red = SIGNIN.split(swap[0]).length === 2 && !(await CASES.noRoleWords(S, undefined, undefined, SIGNIN.replace(swap[0], swap[1]))); } catch (e) { red = false; }
    check(red, "mmp33 plant SupportContact dropped from the no-role line turns noRoleWords red");
  }
  await plantPage("mmp43", [": row(\"team\",\"people\",t(\"No team yet\"),doorSaid||(signinManaged(v)?t(\"No team has admitted this account yet. Once a lead admits it, the catalog arrives by itself.\"):t(\"No team has admitted this account yet. Once a lead admits it by the code below, the catalog arrives by itself.\")),\"\")); /* plant:no-team-managed */",
    ": row(\"team\",\"people\",t(\"No team yet\"),doorSaid||t(\"No team has admitted this account yet. Once a lead admits it by the code below, the catalog arrives by itself.\"),\"\"));"], "noTeamManaged", "settings");
  await plantPage("mmp44", ["if(v.askLead) return {moment:\"asklead\", ident, say:signinSay(\"asklead\", v), code:signinManaged(v)?\"\":v.code, /* plant:asklead-code-managed */",
    "if(v.askLead) return {moment:\"asklead\", ident, say:signinSay(\"asklead\", v), code:v.code,"], "askLeadManaged", "signin");
  await plantPage("mmp45", ["own:signinManaged(v)?null:v.seat===\"held\" && v.trialUntil ? signinOwnTrialWords(v, ds) : null}; /* plant:asklead-trial-managed */",
    "own:v.seat===\"held\" && v.trialUntil ? signinOwnTrialWords(v, ds) : null};"], "askLeadManaged", "signin");
  await plantPage("mmp46", ["    case \"seat-removed\": /* plant:seat-removed-contact */\n      { const c=v && v.managed ? v.managed.contact : \"\";",
    "    case \"seat-removed\":\n      { const c=\"\";"], "seatRemovedContact", "signin");
  await plantPage("mmp47", ["    case \"signin-notallowed\": /* plant:unmanaged-contact */\n      { const c=v && v.managed ? v.managed.contact : \"\";",
    "    case \"signin-notallowed\":\n      { const c=\"\";"], "unmanagedContact", "signin");
  await plantPage("mmp48", ["  if(signinShown(v) || signinManaged(v)) groups.push({rows:[], after:accountCardHtml(v)}); /* plant:account-managed-closed */",
    "  if(signinShown(v)) groups.push({rows:[], after:accountCardHtml(v)});"], "managedClosedAccount", "settings");
  await plantPage("mmp49", ["  const closed=!v.signedIn && !v.offered.length; /* plant:managed-closed-line */",
    "  const closed=false;"], "managedClosedAccount", "settings");
  await plantPage("mmp50", ["  if(v.said===\"signin-other\") return {kind:\"pressed\", say:signinSay(\"signin-other\", v), acts:[{act:\"choose\", label:t(\"Try again\"), solid:true}]}; /* plant:told-other */",
    ""], "signinOtherWords", "signin");
  await plantPage("mmp51", ["    case \"signin-other\": /* plant:signin-other-words */\n      { const c=v && v.managed ? v.managed.contact : \"\";",
    "    case \"signin-other\":\n      { const c=\"\";"], "signinOtherWords", "signin");
  await plantPage("mmp52", ["function signinWaitingWords(){ /* plant:waiting-words */",
    "function signinWaitingWords(){ return [\"Waiting\", \"Wait\"]; }\nfunction signinWaitingWordsUnused(){"], "waiting", "signin");
  {
    const tj = fs.readFileSync(path.join(ROOT, "src", "modules", "team-join.js"), "utf8");
    const swap = [":joinWhy===\"waiting\"?t(\"This invitation waits until Etiuda can read what the organisation's IT set for this computer. Nothing is lost: it can be used again then.\")",
      ":joinWhy===\"waiting\"?t(\"Waiting\")"];
    let red = false;
    try { red = tj.split(swap[0]).length === 2 && !(await CASES.managedFloorWords(S, undefined, undefined, { teamJoin: tj.replace(swap[0], swap[1]) })); } catch { red = false; }
    check(red, "mmp53 plant joinWhy waiting words dropped turns managedFloorWords red");
  }
  await plantPage("mmp54", ["    l.otherLead?teamOtherLeadNote() /* plant:other-lead-words */",
    "    l.otherLead?\"other\""], "managedFloorWords", "settings");
  await plantPage("mmp55", ["        signinManaged(v) ? t(\"This account is signed in, and no team has admitted it yet. Once a lead admits it, the catalog arrives by itself.\") /* plant:asklead-line-managed */",
    "        false ? \"\""], "askLeadManagedWords", "signin");
}

const done = asserted === EXPECTED;
console.log("desk-managed: " + (failed ? failed + " of " + asserted + " FAILED" : "ran " + asserted + ", red 0")
  + (done ? "" : " (expected " + EXPECTED + ": the run did not complete)"));
process.exit(!done ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
