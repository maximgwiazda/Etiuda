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
const CHECKS = 6, PLANTS = 9;
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
    fnOf("function branchIdentity("), lineOf("const GOOGLE_HD_NEEDS_EMAIL ="), tableOf(), lineOf("function signinKnown("),
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
  const pm = s.signinDeskBody("microsoft", ID, DESK, "", T, sign, ACC, true);
  const plain = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign), notPooled = s.signinDeskBody("microsoft", ID, DESK, SEED, T, sign, undefined, false);
  return !!p && Object.keys(p).join() === "provider,idToken,desk,pooled,seed,t,sig" && p.pooled === true
    && verifies(lines("etiuda-licence-signin-desk-pooled", ["microsoft", sha(ID), DESK, T]), p.sig) && !verifies(lines("etiuda-licence-signin-desk", ["microsoft", sha(ID), DESK, T]), p.sig)
    && !!pm && Object.keys(pm).join() === "provider,idToken,accessToken,desk,pooled,t,sig"
    && verifies(lines("etiuda-licence-signin-desk-managed-pooled", ["microsoft", sha(ID), sha(ACC), DESK, T]), pm.sig)
    && !!plain && !("pooled" in plain) && verifies(lines("etiuda-licence-signin-desk", ["microsoft", sha(ID), DESK, T]), plain.sig)
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
function drawn(v, lang, pg) {
  const P = pg || PG;
  storage.lsSet("eUiLang", lang);
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: { signinState: () => v, buyState: () => ({ offer: true }) } };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  try { const d = P.signinDoor(P.signinRead(v)); return { acct: SET.settingsPageHtml("account", ""), door: d ? P.signinPanelHtml(d) : "", moment: d ? d.moment : "", d }; }
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

/* ---- the run ------------------------------------------------------------------------------------------------------------- */
let S = null;
try { if (!sliced) S = shellOf(null); } catch (e) { sliced = e.message; }
console.log("desk-pooled: the non-persistent desktop, the desk's half" + (sliced ? " (" + sliced + ")" : ""));
const run = async (name, s, pg, main) => { try { return !!(await CASES[name](s, pg, main)); } catch (e) { return false; } };
for (const [id, name, what] of [
  ["dp1", "kept", "N1: a profile kept whole is the same desk on a new host, with or without the policy, nothing made or written, its file the profile's own"],
  ["dp2", "guard", "N2: under NonPersistent a key that will not open makes no new pair, sets nothing aside, writes nothing and says so once; with NonPersistentNewDesk, today's new pair"],
  ["dp3", "today", "N4: with neither policy, today's new pair; the reader reads both, and nothing set is nothing set"],
  ["dp4", "pooled", "a NonPersistent desk signs in pooled, over the service's pooled lines, managed too; without it, today's body and bytes"],
]) check(!!S && await run(name, S), id + " " + what);
check(!!S && await run("page", S), "dp5 the page says what happened and whom to ask, English and Polish, panel and Account, with no sign-in offered; nothing where the key opens");
check(MAIN.indexOf("    if (deskBranch && managedStrands(managedPolicy())) { /* plant:np-guard */") >= 0
  && MAIN.indexOf("    stranded: deskStranded };") >= 0, "dp6 the shell asks the policy only where a key will not open, and tells the page the desk is kept");

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
  await plant("dpp5", ["  return Buffer.from(o.accessHash === undefined ? SIGNIN_DESK_POOLED_LINE + \"\\n\" + [o.provider, o.tokenHash, o.desk, o.t].map(String).join(\"\\n\") /* plant:pooled-line */",
    "  return Buffer.from(o.accessHash === undefined ? SIGNIN_DESK_LINE + \"\\n\" + [o.provider, o.tokenHash, o.desk, o.t].map(String).join(\"\\n\")"], "pooled");
  await plant("dpp6", ["  if (pooled === true) return signinDeskPooledBody(provider, idToken, desk, seed, t, sign, accessToken); /* plant:pooled-body */", ""], "pooled");
  /* N1's plant: the identity read from a host-local path. */
  {
    const swapped = MAIN.replace("\nfunction deskFile() { return path.join(app.getPath(\"userData\"), \"desk.json\"); }", "\nfunction deskFile() { return path.join(os.tmpdir(), \"desk.json\"); }");
    check(swapped !== MAIN && !(await run("kept", S, undefined, swapped)), "dpp7 plant the desk's file on a host-local path turns kept red");
  }
  /* The page: the stranded words dropped. */
  for (const [id, swap] of [["dpp8", ["function signinStranded(v){ return !!(v && v.managed && v.managed.stranded); } /* plant:np-page */", "function signinStranded(v){ return false; }"]],
    ["dpp9", ["      + \" \" + t(\"Everything else on this desk works as before; only signing in waits.\")];", "      ];"]]]) {
    let red = false;
    try {
      if (SIGNIN.split(swap[0]).length !== 2) throw new Error("anchor");
      const pg = await import("data:text/javascript;base64," + Buffer.from(SIGNIN.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
      red = !(await run("page", S, pg));
    } catch (e) { red = false; }
    check(red, id + " plant " + swap[0].slice(0, 60) + " turns page red");
  }
}

const done = asserted === EXPECTED;
console.log("desk-pooled: " + (failed ? failed + " of " + asserted + " FAILED" : "ran " + asserted + ", red 0") + (done ? "" : " (expected " + EXPECTED + ")"));
process.exit(!done ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
