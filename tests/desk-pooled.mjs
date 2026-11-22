/* The non-persistent desktop, the desk's half (decision 49, section 12). Bare node, no window, no network, no registry: the shell's
 * functions are sliced from shell/main.js and driven with stand-ins for Windows' data protection and the desk's file.
 *
 *     node tests/desk-pooled.mjs        exit code is the number of failed checks, capped at 63
 *
 *   dp1 (N1) a profile kept whole, its desk file in the profile's own folder and the person's data protection keys with it (an FSLogix
 *       Profile Container, a roaming profile), is the same desk on a new host: the same id, nothing made, nothing written, with or
 *       without the policy. The base is the test architect's runner measurement 6d (run 43496397329): the whole user-data folder
 *       discarded gave a new id, Local State alone discarded kept it.
 *   dp2 (N2) under NonPersistent, a key that will not open makes no new pair, sets nothing aside and writes nothing, and the desk says
 *       so; with NonPersistentNewDesk too, today's new pair with the old kept aside
 *   dp3 (N4) with neither policy, a key that will not open makes today's new pair; the reader reads both policies, and nothing set is
 *       nothing set
 *   dp4 a desk under NonPersistent signs in pooled: `pooled: true`, signed over the pooled line (and the managed pooled line with an
 *       access token), the service's own lines rebuilt here; without it, today's body and bytes
 *   dp5 the page says what happened and whom to ask, English and Polish, in the panel and in Account, offers no sign-in that would make
 *       a new desk, and says nothing of it where the key opens
 *
 * EVERY GUARD IS SHOWN RED (dpp): the line carrying its plant tag is put in another form in memory and the same case is read again;
 * nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
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
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const CHECKS = 8, PLANTS = 19;
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
  TEXT = [lineOf("const POLICY_KEY ="), lineOf("const POLICY_HEAD ="), lineOf("const POLICY_EXPORT_LINE ="), fnOf("function policyValues("),
    lineOf("const MANAGED_TENANT_ID ="), lineOf("const MANAGED_TENANT_DOMAIN ="), lineOf("const MANAGED_CONTACT_MAX ="),
    MAIN.slice(once(MAIN, "\nconst MANAGED_NAMES =") + 1, MAIN.indexOf("]);", once(MAIN, "\nconst MANAGED_NAMES =")) + 3),
    fnOf("function managedPolicyFrom("), lineOf("function managedStrands("), lineOf("function rawPublic("), fnOf("function branchIdOf("),
    fnOf("function branchIdentity("), tableOf(), lineOf("function signinKnown("),
    lineOf("const SIGNIN_ACCESS_MAX ="), lineOf("const SIGNIN_DESK_LINE ="), lineOf("function signinTokenHash("), fnOf("function signinDeskBytes("),
    lineOf("const SIGNIN_DESK_MANAGED_LINE ="), fnOf("function signinDeskManagedBytes("), fnOf("function signinDeskManagedBody("),
    lineOf("const SIGNIN_DESK_POOLED_LINE ="), lineOf("const SIGNIN_DESK_MANAGED_POOLED_LINE ="), fnOf("function signinDeskPooledBytes("),
    fnOf("function signinDeskPooledBody("), fnOf("function signinDeskBody("),
  ].join("\n");
} catch (e) { sliced = e.message; }
/* The slice with the desk's state as the shell keeps it, and stand-ins for what branchIdentity reaches: the desk file (`saved`
   counts writes), the envelope (`opens` the sealed values Windows would open on this profile), and machine policy. */
function shellOf(swap) {
  let text = TEXT;
  if (swap) {
    if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the slice once: " + swap[0]);
    text = text.replace(swap[0], swap[1]);
  }
  const body = "let deskKeys = {}, deskBranch = null, deskBranchOld = [], deskNewer = null, deskWritten = false, deskStranded = false;\n" + text
    + "\nreturn { managedPolicyFrom, policyValues, managedStrands, branchIdentity, branchIdOf, signinDeskBody,"
    + " set: (b, old) => { deskBranch = b; deskBranchOld = old || []; deskStranded = false; }, get: () => ({ branch: deskBranch, old: deskBranchOld, stranded: deskStranded }) };";
  const st = { saved: 0, opens: new Set(), policy: null, said: [] };
  let n = 0;
  const api = new Function("crypto", "Buffer", "readDesk", "branchSealable", "openPrivate", "sealPrivate", "saveDeskFile", "managedPolicy", "console", body)(
    crypto, Buffer, () => ({}), () => true, sealed => (st.opens.has(sealed) ? {} : null), () => { const v = "sealed-" + (++n); st.opens.add(v); return v; },
    () => { st.saved++; }, () => st.policy, { log: l => st.said.push(l), error: l => st.said.push(l) });
  return Object.assign(api, { st });
}
function viewShellOf(swap) {
  let src = MAIN;
  if (swap) {
    if (src.split(swap[0]).length !== 2) throw new Error("plant anchor not in shell/main.js once: " + swap[0]);
    src = src.replace(swap[0], swap[1]);
  }
  const fnIn = start => { const at = once(src, "\n" + start) + 1; return src.slice(at, src.indexOf("\n}", at) + 2); };
  const body = "let deskKeys = {}, deskBranch = null, deskBranchOld = [], deskNewer = null, deskWritten = false, deskStranded = false, deskStrandedFor = \"\";\n"
    + "let signinBusy = null, signinSaid = \"\";\n"
    + [src.slice(once(src, "\nconst MANAGED_NAMES =") + 1, src.indexOf("]);", once(src, "\nconst MANAGED_NAMES =")) + 3),
      src.slice(once(src, "\nconst POLICY_KEY =") + 1, src.indexOf("\n", once(src, "\nconst POLICY_KEY =") + 1)),
      src.slice(once(src, "\nconst POLICY_HEAD =") + 1, src.indexOf("\n", once(src, "\nconst POLICY_HEAD =") + 1)),
      src.slice(once(src, "\nconst POLICY_EXPORT_LINE =") + 1, src.indexOf("\n", once(src, "\nconst POLICY_EXPORT_LINE =") + 1)),
      fnIn("function policyValues("),
      src.slice(once(src, "\nconst MANAGED_TENANT_ID =") + 1, src.indexOf("\n", once(src, "\nconst MANAGED_TENANT_ID =") + 1)),
      src.slice(once(src, "\nconst MANAGED_TENANT_DOMAIN =") + 1, src.indexOf("\n", once(src, "\nconst MANAGED_TENANT_DOMAIN =") + 1)),
      src.slice(once(src, "\nconst MANAGED_CONTACT_MAX =") + 1, src.indexOf("\n", once(src, "\nconst MANAGED_CONTACT_MAX =") + 1)),
      fnIn("function managedPolicyFrom("),
      src.slice(once(src, "\nfunction managedStrands(") + 1, src.indexOf("\n", once(src, "\nfunction managedStrands(") + 1)),
      src.slice(once(src, "\nfunction rawPublic(") + 1, src.indexOf("\n", once(src, "\nfunction rawPublic(") + 1)),
      fnIn("function branchIdOf("), fnIn("function branchIdentity("),
      fnIn("function deskKeyStranded("), fnIn("function signinView("), fnIn("function signinViewOf("), fnIn("function signinWorks("),
      fnIn("function signinWorksOf("), fnIn("function signinSaidOf(")].join("\n")
    + "\nreturn { branchIdentity, signinView, set: (b) => { deskBranch = b; deskBranchOld = []; deskStranded = false; deskStrandedFor = \"\"; }, get: () => ({ branch: deskBranch, stranded: deskStranded }) };";
  const st = { saved: 0, opens: new Set(), openCalls: 0, tells: 0, managed: null, held: null, said: [] };
  const api = new Function("crypto", "Buffer", "readDesk", "branchSealable", "openPrivate", "sealPrivate", "saveDeskFile", "managedPolicy",
    "signinState", "signinOffered", "signinPreviewing", "SIGNIN_PROVIDERS", "signinLapsed", "signinDoorsShown", "signinPageOk",
    "sealsForReal", "safeStorage", "process", "signinRelaySeat", "signinAccountKept", "tellSignin", "console",
    "signinClockNow", "signinCertOk", "signinRevokedHas", body)(
    crypto, Buffer, () => ({}), () => true,
    sealed => { st.openCalls++; return st.opens.has(sealed) ? {} : null; },
    () => "sealed-new", () => { st.saved++; }, () => st.managed,
    () => ({ held: st.held, managed: st.managed }), () => [{ id: "microsoft" }], () => false, { microsoft: {} },
    () => false, () => [], () => false, () => true, {}, { platform: "win32" }, () => "", () => false,
    () => { st.tells++; }, { log: l => st.said.push(l), error: l => st.said.push(l) },
    /* The desk's clock (signinView reads it beside the view since B-2a), stood in; no certificate is held here. */
    () => ({ key: PUB, desk: 1, last: 0, online: true }), () => false, () => false);
  return Object.assign(api, { st, setup: (b, m, held) => { api.set(b); st.managed = m; st.held = held || null; } });
}

/* ---- stand-ins ----------------------------------------------------------------------------------------------------------- */
const head = "Windows Registry Editor Version 5.00\r\n\r\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\r\n";
const regText = vals => head + Object.entries(vals).map(([k, v]) => "\"" + k + "\"=" + (typeof v === "number" ? "dword:" + v.toString(16).padStart(8, "0") : "\"" + v + "\"") + "\r\n").join("") + "\r\n";
const pol = (s, vals) => s.managedPolicyFrom(s.policyValues(regText(vals)));
const PUB = "a".repeat(64), BOX = "b".repeat(64);
const pair = (priv) => ({ sign: { pub: PUB, priv: priv }, box: { pub: BOX, priv: priv + "-box" } });

const CASES = {};
/* N1: the profile kept; and the desk's file is the profile's own, by the shell's text. */
CASES.kept = (s, pg, main) => {
  const run = vals => { s.set(pair("kept")); s.st.opens.add("kept"); s.st.saved = 0; s.st.policy = vals ? pol(s, vals) : null; return s.branchIdentity(true); };
  const plain = run(null), pooled = run({ NonPersistent: 1 }), churn = run({ NonPersistent: 1, NonPersistentNewDesk: 1 });
  const same = x => !!x && x.id === s.branchIdOf(PUB) && x.key === PUB;
  const inProfile = (main || MAIN).indexOf("\nfunction deskFile() { return path.join(app.getPath(\"userData\"), \"desk.json\"); }") >= 0;
  return same(plain) && same(pooled) && same(churn) && s.st.saved === 0 && inProfile;
};
/* N2: NonPersistent keeps the desk; NonPersistentNewDesk lets it churn. */
CASES.guard = s => {
  const lost = pair("lost");
  s.set(lost); s.st.saved = 0; s.st.said = []; s.st.policy = pol(s, { NonPersistent: 1 });
  const kept = s.branchIdentity(true), g = s.get(), again = s.branchIdentity(true);
  const keptOk = kept === null && again === null && g.branch === lost && g.old.length === 0 && g.stranded === true && s.st.saved === 0
    && s.st.said.filter(l => /machine policy keeps this desk/.test(l)).length === 1;
  s.set(lost); s.st.saved = 0; s.st.policy = pol(s, { NonPersistent: 1, NonPersistentNewDesk: 1 });
  const made = s.branchIdentity(true), h = s.get();
  return keptOk && !!made && made.key !== PUB && h.old.length === 1 && h.old[0] === lost && h.stranded === false && s.st.saved === 1;
};
/* N4: neither policy, today's; the reader. */
CASES.today = s => {
  const lost = pair("lost");
  const run = p => { s.set(lost); s.st.saved = 0; s.st.policy = p; const r = s.branchIdentity(true); return { r, g: s.get() }; };
  const none = run(null), nine = run(pol(s, { TeamFolder: "D:\\Team", DeskNoUpdateCheck: 1 })), off = run(pol(s, { NonPersistent: 0, NonPersistentNewDesk: 1 }));
  const today = x => !!x.r && x.r.key !== PUB && x.g.old.length === 1 && x.g.stranded === false;
  const read = pol(s, { NonPersistent: 1 }), both = pol(s, { NonPersistent: 1, NonPersistentNewDesk: 1 }), unset = s.managedPolicyFrom(null);
  return today(none) && today(nine) && today(off) && read.nonPersistent === true && read.nonPersistentNewDesk === false && read.any === true
    && both.nonPersistentNewDesk === true && unset.nonPersistent === false && unset.any === false && s.managedStrands(read) && !s.managedStrands(both) && !s.managedStrands(unset);
};
/* The pooled request, signed over the service's lines rebuilt here. */
const KEY = crypto.generateKeyPairSync("ed25519"), DESK = KEY.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const sign = b => crypto.sign(null, b, KEY.privateKey).toString("hex"), verifies = (b, sig) => crypto.verify(null, b, KEY.publicKey, Buffer.from(String(sig), "hex"));
const sha = x => crypto.createHash("sha256").update(String(x), "utf8").digest("hex");
const lines = (d, xs) => Buffer.from(d + "\n" + xs.join("\n"), "utf8");
const T = 1_800_000_000_000, SEED = "5".repeat(64), ID = "id.tok.en", ACC = "access.tok.en";
CASES.pooled = s => {
  const p = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign, undefined, true);
  const pRenew = s.signinDeskBody("microsoft", ID, DESK, "", T, sign, undefined, true);
  const pmFirst = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign, ACC, true);
  const pm = s.signinDeskBody("microsoft", ID, DESK, "", T, sign, ACC, true);
  const plain = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign), notPooled = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign, undefined, false);
  return !!p && Object.keys(p).join() === "provider,idToken,desk,pooled,seed,t,sig" && p.pooled === true
    && verifies(lines("etiuda-licence-signin-desk-pooled", ["microsoft", sha(ID), DESK, T, "seed:" + SEED]), p.sig)
    && !verifies(lines("etiuda-licence-signin-desk-pooled", ["microsoft", sha(ID), DESK, T]), p.sig)
    && !verifies(lines("etiuda-licence-signin-desk", ["microsoft", sha(ID), DESK, T, "seed:" + SEED]), p.sig)
    && !!pRenew && Object.keys(pRenew).join() === "provider,idToken,desk,pooled,t,sig" && pRenew.pooled === true
    && verifies(lines("etiuda-licence-signin-desk-pooled", ["microsoft", sha(ID), DESK, T]), pRenew.sig)
    && !!pmFirst && Object.keys(pmFirst).join() === "provider,idToken,accessToken,desk,pooled,seed,t,sig" && pmFirst.pooled === true
    && verifies(lines("etiuda-licence-signin-desk-managed-pooled", ["microsoft", sha(ID), sha(ACC), DESK, T, "seed:" + SEED]), pmFirst.sig)
    && !verifies(lines("etiuda-licence-signin-desk-managed-pooled", ["microsoft", sha(ID), sha(ACC), DESK, T]), pmFirst.sig)
    && !!pm && Object.keys(pm).join() === "provider,idToken,accessToken,desk,pooled,t,sig"
    && verifies(lines("etiuda-licence-signin-desk-managed-pooled", ["microsoft", sha(ID), sha(ACC), DESK, T]), pm.sig)
    && !!plain && !("pooled" in plain) && verifies(lines("etiuda-licence-signin-desk", ["microsoft", sha(ID), DESK, T, "seed:" + SEED]), plain.sig)
    && JSON.stringify(Object.keys(notPooled)) === JSON.stringify(Object.keys(plain))
    && MAIN.indexOf("signinDeskBody(provider, idToken, deskKey, seed, now(), io.sign, accessToken || undefined, io.pooled === true);") >= 0
    && MAIN.indexOf("get pooled() { const m = signinState().managed; return !!(m && m.nonPersistent); },") >= 0;
};

/* ---- the page ------------------------------------------------------------------------------------------------------------ */
const DIR = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
let storage = null, PG = null, SET = null;
try { storage = await import(MOD("storage.js")); PG = await import(MOD("signin.js")); SET = await import(MOD("settings.js")); }
catch (e) { sliced = sliced || "the page did not load: " + e.message; }
const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
function drawn(v, lang, pg, set, extraHost) {
  const P = pg || PG, ST = set || SET;
  storage.lsSet("eUiLang", lang);
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {},
    E_HOST: Object.assign({ signinState: () => v, buyState: () => ({ offer: true }) }, extraHost || {}) };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  try { const d = P.signinDoor(P.signinRead(v)); return { acct: ST.settingsPageHtml("account", ""), door: d ? P.signinPanelHtml(d) : "", moment: d ? d.moment : "", d }; }
  finally { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; storage.lsSet("eUiLang", "en"); }
}
const words = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const M = (o) => Object.assign({ on: false, shared: false, personal: true, provider: "", tenant: false, closed: false, contact: "", stranded: false }, o);
CASES.page = async (s, pg) => {
  const base = { offered: ["microsoft", "google"] };
  const en = drawn(Object.assign({ managed: M({ stranded: true }) }, base), "en", pg), pl = drawn(Object.assign({ managed: M({ stranded: true }) }, base), "pl", pg);
  const contact = drawn(Object.assign({ managed: M({ stranded: true, contact: "Service desk, ext. 4400" }) }, base), "en", pg);
  const opens = drawn(Object.assign({ managed: M({}) }, base), "en", pg);
  const H = "This computer's profile did not keep this desk's key.", IT = "The organisation's IT department can have the profile keep it.", ON = "Everything else on this desk works as before; only signing in waits.";
  const both = x => words(x.door) + " | " + words(x.acct);
  return en.moment === "stranded" && both(en).split(H).length === 3 && both(en).indexOf(IT + " " + ON) >= 0 && (en.d.acts || []).length === 0
    && en.door.indexOf("data-e-open=\"signin\"") < 0 && en.acct.indexOf("data-e-open=\"signin\"") < 0
    && words(pl.door).indexOf("Profil na tym komputerze nie zachował klucza tego stanowiska.") >= 0
    && words(contact.door).indexOf("To ask for access: Service desk, ext. 4400. " + ON) >= 0
    && opens.moment !== "stranded" && both(opens).indexOf(H) < 0 && opens.acct.indexOf("data-e-open=\"signin\"") >= 0;
};
/* dp7 (finding 6, shell): signinView() reports stranded at start on a NonPersistent desk without replacing the key or writing
   desk.json; ordinary desks and waiting policy ask nothing of openPrivate at start; branchIdentity(true) calls tellSignin(). */
CASES.startStranded = (s, pg, main, swap) => {
  const V = viewShellOf(swap);
  const lost = pair("lost");
  const np = { any: true, managed: false, shared: false, personal: true, provider: "", tenant: false, closed: false, contact: "", nonPersistent: true, nonPersistentNewDesk: false };
  const plain = Object.assign({}, np, { any: false, nonPersistent: false });
  const waits = Object.assign({}, np, { managed: true, personal: false, closed: true, waiting: true });
  V.setup(lost, np);
  const first = V.signinView(), again = V.signinView();
  const npOk = first.managed && first.managed.stranded === true && again.managed && again.managed.stranded === true
    && V.get().branch === lost && V.st.saved === 0 && V.st.openCalls === 1;
  V.setup(lost, plain);
  V.st.openCalls = 0;
  const plainView = V.signinView();
  const plainOk = !plainView.managed && V.st.openCalls === 0;
  V.setup(lost, waits);
  V.st.openCalls = 0;
  const waitView = V.signinView();
  const waitOk = waitView.managed && waitView.managed.waiting === true && waitView.managed.stranded === false && V.st.openCalls === 0;
  V.setup(lost, np);
  V.st.tells = 0;
  const made = V.branchIdentity(true);
  const tellOk = made === null && V.get().stranded === true && V.st.tells === 1 && V.get().branch === lost && V.st.saved === 0;
  return npOk && plainOk && waitOk && tellOk;
};
/* dp8 (finding 6, page): firstSigninDue is true for a stranded view that does not work; seen and policy do not exempt it.
   Signed in yesterday shows no sign-in/seat/buy/sync rows in Account; no provider offered shows the notice in the panel
   and in Account with B5's last sentence, English and Polish. */
CASES.strandedSurface = (s, pg, main, set) => {
  const P = pg || PG, ST = set || SET;
  const syncHost = { storeState: () => ({ shown: true, line: "on", on: true }) };
  const outStranded = { offered: ["microsoft", "google"], managed: M({ stranded: true }) };
  if (P.firstSigninDue(outStranded, { seen: true, policy: true }) !== true) return false;
  const outDrawn = drawn(outStranded, "en", P, ST, syncHost);
  if (outDrawn.moment !== "stranded" || outDrawn.acct.indexOf("data-signin-stranded") < 0) return false;
  const signedYesterday = { offered: ["microsoft"], signedIn: "microsoft", code: "ABCD2345EFGH6789", seat: "held", at: Date.now(), reached: true,
    managed: M({ on: true, provider: "microsoft", stranded: true }) };
  const yDrawn = drawn(signedYesterday, "en", P, ST, syncHost);
  if (yDrawn.moment !== "stranded" || yDrawn.acct.indexOf("data-signin-stranded") < 0 || yDrawn.acct.indexOf("data-row=\"name\"") < 0) return false;
  if (/data-row="(?:team|signin|code|seat|buy|checked|sync)"|data-signin-act="/.test(yDrawn.acct)) return false;
  const noProv = { offered: [], managed: M({ stranded: true }) };
  if (P.signinShown(P.signinRead(noProv)) !== true) return false;
  const B5 = { en: "Everything else on this desk works as before.", pl: "Wszystko inne na tym stanowisku działa jak dotąd." };
  for (const lang of ["en", "pl"]) {
    const d = drawn(noProv, lang, P, ST);
    if (d.moment !== "stranded" || d.acct.indexOf("data-signin-stranded") < 0) return false;
    if (words(d.door).indexOf(B5[lang]) < 0 || words(d.acct).indexOf(B5[lang]) < 0) return false;
    if (/only signing in waits|czeka tylko logowanie/.test(words(d.door) + words(d.acct))) return false;
  }
  const withProvPl = drawn(outStranded, "pl", P, ST);
  return words(withProvPl.door).indexOf("Wszystko inne na tym stanowisku działa jak dotąd; czeka tylko logowanie.") >= 0;
};

/* ---- the run ------------------------------------------------------------------------------------------------------------- */
let S = null;
try { if (!sliced) S = shellOf(null); } catch (e) { sliced = e.message; }
console.log("desk-pooled: the non-persistent desktop, the desk's half" + (sliced ? " (" + sliced + ")" : ""));
const run = async (name, s, pg, main, set) => { try { return !!(await CASES[name](s, pg, main, set)); } catch (e) { return false; } };
for (const [id, name, what] of [
  ["dp1", "kept", "N1: a profile kept whole is the same desk on a new host, with or without the policy, nothing made or written, its file the profile's own"],
  ["dp2", "guard", "N2: under NonPersistent a key that will not open makes no new pair, sets nothing aside, writes nothing and says so once; with NonPersistentNewDesk, today's new pair"],
  ["dp3", "today", "N4: with neither policy, today's new pair; the reader reads both, and nothing set is nothing set"],
  ["dp4", "pooled", "a NonPersistent desk signs in pooled, over the service's pooled lines, managed too; without it, today's body and bytes"],
]) check(!!S && await run(name, S), id + " " + what);
check(!!S && await run("page", S), "dp5 the page says what happened and whom to ask, English and Polish, panel and Account, with no sign-in offered; nothing where the key opens");
check(MAIN.indexOf("    if (deskBranch && managedStrands(managedPolicy())) { /* plant:np-guard */") >= 0
  && MAIN.indexOf("stranded: m && m.any ? deskKeyStranded(m) : false,") >= 0 && MAIN.indexOf("    stranded: o.stranded };") >= 0, "dp6 the shell asks the policy only where a key will not open, and tells the page the desk is kept");
check(!!S && await run("startStranded", S), "dp7 finding 6: signinView detects stranded at start under NonPersistent without replacing the key; ordinary desks and waiting policy call openPrivate 0 times; branchIdentity calls tellSignin");
check(!!S && await run("strandedSurface", S), "dp8 finding 6: firstSigninDue is true for a stranded view that does not work, seen and policy do not exempt it, Account hides sign-in/seat/buy/sync rows under the notice, and no-provider uses B5's last sentence");

async function plant(id, swap, name) {
  let red = false, why = "";
  try { red = !(await run(name, shellOf(swap))); } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].replace(/\s+/g, " ").trim().slice(0, 60) + " turns " + name + " red" + (why ? " (" + why + ")" : ""));
}
if (!PLANTS_OFF && S) {
  await plant("dpp1", ["    if (deskBranch && managedStrands(managedPolicy())) { /* plant:np-guard */", "    if (false) {"], "guard");
  await plant("dpp2", ["function managedStrands(pol) { return !!pol && pol.nonPersistent === true && pol.nonPersistentNewDesk !== true; } /* plant:np-strands */",
    "function managedStrands(pol) { return true; }"], "today");
  await plant("dpp3", ["function managedStrands(pol) { return !!pol && pol.nonPersistent === true && pol.nonPersistentNewDesk !== true; } /* plant:np-strands */",
    "function managedStrands(pol) { return !!pol && pol.nonPersistent === true; }"], "guard");
  await plant("dpp4", ["  out.nonPersistent = sw(own(\"nonpersistent\")) === true; /* plant:np-read */", "  out.nonPersistent = false;"], "today");
  await plant("dpp5", ["  const line = o.accessHash === undefined ? SIGNIN_DESK_POOLED_LINE : SIGNIN_DESK_MANAGED_POOLED_LINE; /* plant:pooled-line */",
    "  const line = o.accessHash === undefined ? SIGNIN_DESK_LINE : SIGNIN_DESK_MANAGED_POOLED_LINE;"], "pooled");
  await plant("dpp6", ["  if (pooled === true) return signinDeskPooledBody(provider, idToken, desk, seed, t, sign, accessToken); /* plant:pooled-body */", ""], "pooled");
  await plant("dpp17", ["  return Buffer.from(line + \"\\n\" + fields.concat(o.seed ? [\"seed:\" + o.seed] : []).map(String).join(\"\\n\"), \"utf8\"); /* plant:pooled-seed-line */",
    "  return Buffer.from(line + \"\\n\" + fields.concat(o.accessHash !== undefined && o.seed ? [\"seed:\" + o.seed] : []).map(String).join(\"\\n\"), \"utf8\");"], "pooled");
  await plant("dpp18", ["  return Buffer.from(line + \"\\n\" + fields.concat(o.seed ? [\"seed:\" + o.seed] : []).map(String).join(\"\\n\"), \"utf8\"); /* plant:pooled-seed-line */",
    "  return Buffer.from(line + \"\\n\" + fields.concat(o.accessHash === undefined && o.seed ? [\"seed:\" + o.seed] : []).map(String).join(\"\\n\"), \"utf8\");"], "pooled");
  await plant("dpp19", ["  const o = { provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t, seed: seed || \"\" }; /* plant:pooled-seed */",
    "  const o = { provider: provider, tokenHash: signinTokenHash(idToken), desk: desk, t: t };"], "pooled");
  /* N1's plant: the identity read from a host-local path. */
  {
    const swapped = MAIN.replace("\nfunction deskFile() { return path.join(app.getPath(\"userData\"), \"desk.json\"); }", "\nfunction deskFile() { return path.join(os.tmpdir(), \"desk.json\"); }");
    check(swapped !== MAIN && !(await run("kept", S, undefined, swapped)), "dpp7 plant the desk's file on a host-local path turns kept red");
  }
  /* The page: the stranded words dropped. */
  for (const [id, swap] of [["dpp8", ["function signinStranded(v){ return !!(v && v.managed && v.managed.stranded); } /* plant:np-page */", "function signinStranded(v){ return false; }"]],
    ["dpp9", ["      + \" \" + (offered ? t(\"Everything else on this desk works as before; only signing in waits.\")\n        : t(\"Everything else on this desk works as before.\"))];", "      ];"]]]) {
    let red = false;
    try {
      if (SIGNIN.split(swap[0]).length !== 2) throw new Error("anchor");
      const pg = await import("data:text/javascript;base64," + Buffer.from(SIGNIN.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
      red = !(await run("page", S, pg));
    } catch (e) { red = false; }
    check(red, id + " plant " + swap[0].slice(0, 60) + " turns page red");
  }
  /* Finding 6 plants: shell and page. */
  for (const [id, swap] of [
    ["dpp10", ["stranded: m && m.any ? deskKeyStranded(m) : false,", "stranded: m && m.any ? deskStranded : false,"]],
    ["dpp11", ["      if (typeof tellSignin === \"function\") tellSignin(); /* plant:np-tell */", ""]],
  ]) {
    let red = false;
    try { red = !(await run("startStranded", S, undefined, undefined, swap)); } catch (e) { red = false; }
    check(red, id + " plant " + swap[0].trim().slice(0, 60) + " turns startStranded red");
  }
  const SETTINGS = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
  for (const [id, which, swap] of [
    ["dpp12", "signin", ["function signinShown(v){ return !!(v && (v.offered.length || v.signedIn || signinWaiting(v) || signinStranded(v))); } /* plant:shown-waiting */",
      "function signinShown(v){ return !!(v && (v.offered.length || v.signedIn || signinWaiting(v))); }"]],
    ["dpp13", "signin", ["  return !deskWorks(signinRead(v));", "  if(signinStranded(signinRead(v))) return false;\n  return !deskWorks(signinRead(v));"]],
    ["dpp14", "signin", ["  const offered=!!(v && (v.offered.length || v.signedIn)); /* plant:stranded-offered */", "  const offered=true;"]],
    ["dpp15", "settings", ["  if(!stranded && v.signedIn && !signinChoosingNow()){ /* plant:account-stranded-rows */", "  if(v.signedIn && !signinChoosingNow()){"]],
    ["dpp16", "settings", ["  const s=!stranded && v.signedIn && !signinChoosingNow() ? syncNow() : null; /* plant:account-stranded-sync */", "  const s=v.signedIn && !signinChoosingNow() ? syncNow() : null;"]],
  ]) {
    let red = false;
    try {
      const src = which === "signin" ? SIGNIN : SETTINGS;
      if (src.split(swap[0]).length !== 2) throw new Error("anchor");
      const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
      red = !(await run("strandedSurface", S, which === "signin" ? mod : undefined, undefined, which === "settings" ? mod : undefined));
    } catch (e) { red = false; }
    check(red, id + " plant " + swap[0].trim().slice(0, 60) + " turns strandedSurface red");
  }
}

const done = asserted === EXPECTED;
console.log("desk-pooled: " + (failed ? failed + " of " + asserted + " FAILED" : "ran " + asserted + ", red 0") + (done ? "" : " (expected " + EXPECTED + ")"));
process.exit(!done ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
