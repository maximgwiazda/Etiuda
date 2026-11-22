/* Board 992, the desk's optional customer model, stages 2 and 3: Settings, machine policy, the key, the mark and the sentences.
 *
 *   node tests/desk-own-ai.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE SHELL'S PART IS SLICED, as tests/join-policy.mjs slices it: policyValues and the desk's own declarations are cut out of
 * shell/main.js and run on invented export text, a scratch folder for the desk's files and a stand-in for safeStorage whose
 * sealed text never holds the key. The connection test's door is a stand-in that records what it was handed; no leg sends.
 *   da1 machine policy's four values and the desk's switch are read, a value that cannot be used is left out alone, and the
 *       team's values beside them are still taken
 *   da2 policy first, field by field; the policy's key never goes to an address typed here
 *   da3 a save that touches a field policy set is refused, and nothing is written
 *   da4 the key is never in what Settings is told, the person's or the policy's, while deskAiConfig does hand it on
 *   da5 deskAiConfig is null while the option is off or incomplete, a key stays with the address it was given for: a save
 *       that moves the address forgets a key kept for another real address and says so, and only a key typed before any
 *       address follows the first address named,
 *       and the connection test hands the door the fixed prompt and the config's five fields alone
 *   da6 the services' published addresses are one table, shell/desk-ai.cjs's, which Settings and deskAiConfig read
 * THE PAGE'S PART runs the built engine in headless Chrome, beside a stand-in host that answers as the shell would:
 *   db1 the row's two states, built-in alone and the organisation's with its fields, the address only where the service
 *       has none of its own
 *   db2 set by policy, the row shows the choice, the host and "Set by the organisation", and takes no change
 *   db3 the mark beside the search box is there only while the organisation's model ranks, its words shed under 720 px with
 *       its sentence kept in its title, says when the shell has paused its asks or says the service is usually slower than
 *       4 seconds (`slow`, from shell/desk-ai.cjs), and is absent while both switches are off
 *   db4 every sentence the string table holds that says the model's text stays on this computer or is never sent, found
 *       by search and held to a read list, is drawn only while the built-in model ranks, on every screen that draws one, in
 *       both languages
 *   db5 the AI section is there wherever a model can rank, the built-in model absent and the organisation's on included
 *   db6 the AI section's lede says what is sent by the two switches and follows a switch moved on the open page, as the
 *       picker's note does
 * No leg starts the desk app, reads the registry or reaches the network. The values are invented.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let failed = 0, asserted = 0, notRun = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line + (detail === undefined ? "" : ": " + JSON.stringify(detail))); }
}
function skipPlant(line) { notRun++; console.log("  NOT RUN " + line); }

/* ============================================================================================================================
   The shell's part.
   ============================================================================================================================ */
function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("no " + JSON.stringify(marker) + " in shell/main.js");
  if (src.indexOf(marker, at + 1) >= 0) throw new Error(JSON.stringify(marker) + " is in shell/main.js twice");
  const isFn = marker.startsWith("function");
  let par = 0, brk = 0, brc = 0, sawBrace = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; sawBrace = true; }
    else if (ch === "}") {
      brc--;
      if (isFn && sawBrace && !par && !brk && !brc) return src.slice(at, i + 1);
    } else if (ch === ";" && !par && !brk && !brc && !isFn) return src.slice(at, i + 1);
  }
  throw new Error("an unterminated declaration: " + marker);
}
const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
/* The adapter module, the one table of the services' published addresses, as the shell requires it; or a copy with one edit. */
const DESK_AI_SRC = fs.readFileSync(path.join(ROOT, "shell", "desk-ai.cjs"), "utf8");
function deskAiModule(src) {
  const mod = { exports: {} };
  new Function("require", "module", "exports", src)(require, mod, mod.exports);
  return mod.exports;
}
const DESK_AI_MODULE = deskAiModule(DESK_AI_SRC);
const POLICY = ["const POLICY_KEY =", "const POLICY_LEAD_RE =", "const POLICY_HEAD =", "const POLICY_EXPORT_LINE =",
  "function policyValues(", "function policyExpand(", "function policyRegSz(", "function policyFolderOk(", "function policyLeadOk(",
  "function policyNoUpdate(", "function joinPolicyFacts("];
const DESK_AI = ["const DESK_AI_FILE =", "const DESK_AI_KEY_FILE =", "const DESK_AI_KIND =", "const DESK_AI_KEY_KIND =",
  "const DESK_AI_SERVICES =", "const DESK_AI_MODEL_MAX =", "const DESK_AI_KEY_MAX =", "const DESK_AI_CONTROL_RE =",
  "const DESK_AI_TEST_PROMPT =", "function deskAiService(", "function deskAiEndpointShape(", "function deskAiPolicyFrom(",
  "function deskAiJoin(", "function deskAiReadyOf(", "function deskAiAnswer(", "function deskAiRefusal(", "function deskAiPath(",
  "function deskAiPerson(", "function deskAiKeyInner(", "function deskAiKeyFor(", "function deskAiPolicy(", "let deskAiKept =", "function deskAiForget(", "function deskAiNow(",
  "function deskAiConfig(", "function deskAiSettings(", "function deskAiSave(", "function deskAiTest("];
const NAMES = ["policyValues", "joinPolicyFacts", "deskAiPolicyFrom", "deskAiJoin", "deskAiConfig", "deskAiSettings", "deskAiSave",
  "deskAiTest", "DESK_AI_TEST_PROMPT", "DESK_AI_FILE", "DESK_AI_KEY_FILE"];
/* The kept configuration and its forget, read where shell/main.js has them, so a tree without them fails da5 alone. */
const OPTIONAL = ["let deskAiKept =", "function deskAiForget("];

/* A stand-in for safeStorage: its sealed text is the plain text reversed and shifted, so it is never the key as typed. */
const SEAL = {
  encryptString: s => Buffer.from("sealed:" + Buffer.from(String(s), "utf8").toString("base64").split("").reverse().join(""), "utf8"),
  decryptString: b => {
    const t = Buffer.from(b).toString("utf8");
    if (!t.startsWith("sealed:")) throw new Error("not sealed here");
    return Buffer.from(t.slice(7).split("").reverse().join(""), "base64").toString("utf8");
  },
};
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-own-ai-"));
let dirN = 0;
/* One shell per scenario: a fresh user-data folder, the policy text as reg export would write it, and the door's stand-in. */
function shell(policyText, opts) {
  const o = opts || {};
  const dir = path.join(scratch, "u" + (++dirN));
  fs.mkdirSync(dir);
  const asked = [];
  const body = POLICY.concat(DESK_AI).filter(m => !OPTIONAL.includes(m) || SRC.indexOf(m) > -1).map(m => sliceDecl(SRC, m)).join("\n");
  const policyRead = { values: null };
  const params = ["path", "app", "fs", "safeStorage", "Buffer", "branchSealable", "writeReplacing", "readJoinPolicy", "joinPolicyRead",
    "deskAiProbe", "process", "harnessLaunch", "deskAi", "policyWaits"];
  const S = new Function(...params, body + "\nreturn { " + NAMES.join(", ")
    + ", deskAiForget: typeof deskAiForget === 'function' ? deskAiForget : () => {} };")(
    path, { getPath: () => dir }, fs, SEAL, Buffer, () => o.sealable !== false, (f, text) => fs.writeFileSync(f, text, "utf8"),
    () => ({}), policyRead, (config, prompt) => { asked.push({ config: config, prompt: prompt }); return Promise.resolve({ ok: true }); },
    { env: {} }, () => o.harness === true, o.deskAi || DESK_AI_MODULE, () => false);
  policyRead.values = policyText ? S.policyValues(policyText) : null;
  return Object.assign(S, { dir: dir, asked: asked, file: n => path.join(dir, n) });
}
/* The export's text, rows of [name, type, value], as tests/join-policy.mjs writes it. */
const REG_HEAD = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda";
const regEsc = s => s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
function exportText(rows) {
  const line = ([n, t, v]) => "\"" + regEsc(n) + "\"=" + (t === "REG_DWORD" ? "dword:" + (Number(v) >>> 0).toString(16).padStart(8, "0") : "\"" + regEsc(v) + "\"");
  return ["Windows Registry Editor Version 5.00", "", "[" + REG_HEAD + "]"].concat(rows.map(line), [""]).join("\r\n") + "\r\n";
}
const KEY_POLICY = "pk-planted-policy-4410-qq", KEY_PERSON = "sk-planted-person-7731-zz";
const ORG = [["AiProvider", "REG_SZ", "anthropic"], ["AiEndpoint", "REG_SZ", "https://gateway.example/v1/messages"],
  ["AiModel", "REG_SZ", "model-a"], ["AiKey", "REG_SZ", KEY_POLICY]];
/* No window of eight characters of the key anywhere in `text`. */
const holdsKey = (text, key) => { for (let i = 0; i + 8 <= key.length; i++) if (String(text).includes(key.slice(i, i + 8))) return true; return false; };

let loadError = "";
try { shell(""); } catch (e) { loadError = (e && e.message) || String(e); }

{ /* da1 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const read = rows => shell(exportText(rows)).deskAiPolicyFrom(shell(exportText(rows)).policyValues(exportText(rows)));
    const all = read(ORG.concat([["DeskOrganisationModel", "REG_DWORD", 1]]));
    if (all.on !== true || all.provider !== "anthropic" || all.endpoint !== "https://gateway.example/v1/" || all.model !== "model-a"
        || all.key !== KEY_POLICY || all.ignored.length) problems.push("all five " + JSON.stringify(Object.assign({}, all, { key: all.key === KEY_POLICY })));
    const sw = [[["DeskOrganisationModel", "REG_DWORD", 0], false], [["DeskOrganisationModel", "REG_SZ", "1"], true],
      [["DeskOrganisationModel", "REG_SZ", ""], null], [null, null]];
    for (const [row, want] of sw) {
      const got = read(row ? [row] : []);
      if (got.on !== want || got.ignored.length) problems.push("switch " + JSON.stringify(row) + " read " + got.on);
    }
    const alone = [
      [["AiProvider", "REG_SZ", "nosuch"], "AiProvider", g => g.provider === "" && g.model === "model-a" && g.key === KEY_POLICY],
      [["AiEndpoint", "REG_SZ", "http://gateway.example/v1/"], "AiEndpoint", g => g.endpoint === "" && g.provider === "anthropic"],
      [["AiEndpoint", "REG_SZ", "https://user@gateway.example/v1/"], "AiEndpoint", g => g.endpoint === "" && g.model === "model-a"],
      [["AiModel", "REG_DWORD", 7], "AiModel", g => g.model === "" && g.provider === "anthropic"],
      [["DeskOrganisationModel", "REG_DWORD", 2], "DeskOrganisationModel", g => g.on === null && g.key === KEY_POLICY],
    ];
    for (const [bad, name, rest] of alone) {
      const rows = ORG.filter(r => r[0] !== bad[0]).concat([bad]);
      const got = read(rows);
      if (got.ignored.join() !== name || !rest(got)) problems.push(name + " " + JSON.stringify(got.ignored));
    }
    const S = shell("");
    const team = S.joinPolicyFacts(exportText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", "ab".repeat(32)]].concat(ORG,
      [["DeskOrganisationModel", "REG_DWORD", 1]])));
    if (team.folder !== "D:\\Quay\\team" || team.lead !== "ab".repeat(32) || !team.values) problems.push("team values beside them " + team.folder);
  }
  check(!problems.length, "da1 policy reads AiProvider, AiEndpoint, AiModel, AiKey and DeskOrganisationModel; a value it cannot use is left out alone, "
    + "and the team's values beside them are still taken: " + (problems.join("; ") || "four values, four switch shapes, five bad values"));
}

{ /* da2 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const S = shell("");
    const org = { on: null, provider: "anthropic", endpoint: "", model: "", key: "", ignored: [] };
    const j = S.deskAiJoin({ choice: "organisation", provider: "openai", endpoint: "https://mine.example/v1/", model: "m-person" }, org);
    if (j.provider !== "anthropic" || !j.managed.provider || j.given !== "" || j.endpoint !== "https://api.anthropic.com/v1/"
        || j.model !== "m-person" || j.managed.model || !j.on || j.managed.choice) problems.push("join " + JSON.stringify(j));
    const off = S.deskAiJoin({ choice: "organisation" }, Object.assign({}, org, { on: false }));
    if (off.on !== false || !off.managed.choice) problems.push("switch 0 " + JSON.stringify(off));
    const away = S.deskAiJoin({ choice: "organisation", provider: "anthropic", endpoint: "https://typed.example/v1/" }, Object.assign({}, org, { key: "k" }));
    const home = S.deskAiJoin({ choice: "organisation", provider: "anthropic", endpoint: "" }, Object.assign({}, org, { key: "k" }));
    if (!away.keyAway || home.keyAway) problems.push("key away " + away.keyAway + " home " + home.keyAway);
    const P = shell(exportText([["AiProvider", "REG_SZ", "anthropic"], ["AiKey", "REG_SZ", KEY_POLICY], ["DeskOrganisationModel", "REG_DWORD", 1],
      ["AiModel", "REG_SZ", "model-a"]]));
    fs.writeFileSync(P.file(P.DESK_AI_FILE), JSON.stringify({ format: 1, kind: "etiuda-desk-ai", choice: "organisation", provider: "anthropic",
      endpoint: "https://typed.example/v1/", model: "" }));
    if (P.deskAiConfig() !== null) problems.push("the policy's key went to a typed address");
  }
  check(!problems.length, "da2 policy wins field by field and the person's address is not carried to the policy's service; the policy's key never "
    + "goes to an address typed here: " + (problems.join("; ") || "five joins"));
}

{ /* da3 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const P = shell(exportText(ORG.concat([["DeskOrganisationModel", "REG_DWORD", 1]])));
    for (const f of [{ provider: "openai" }, { choice: "builtin" }, { model: "other" }, { key: "sk-new" }, { endpoint: "https://elsewhere.example/v1/" }]) {
      const r = P.deskAiSave(f);
      if (r.ok !== false || r.why !== "managed") problems.push(JSON.stringify(Object.keys(f)) + " " + JSON.stringify([r.ok, r.why]));
    }
    if (fs.existsSync(P.file(P.DESK_AI_FILE)) || fs.existsSync(P.file(P.DESK_AI_KEY_FILE))) problems.push("a refused save wrote");
    const half = shell(exportText([["AiProvider", "REG_SZ", "openai"]]));
    const ok = half.deskAiSave({ model: "m-own" }), bad = half.deskAiSave({ provider: "anthropic" });
    if (!ok.ok || bad.why !== "managed" || JSON.parse(fs.readFileSync(half.file(half.DESK_AI_FILE), "utf8")).model !== "m-own")
      problems.push("a field policy leaves free " + JSON.stringify([ok.ok, bad.why]));
    const plain = shell("");
    const refusals = [[{ provider: "nosuch" }, "provider"], [{ endpoint: "http://x.example/" }, "endpoint"], [{ choice: "maybe" }, "choice"]];
    for (const [f, want] of refusals) { const r = plain.deskAiSave(f); if (r.why !== want) problems.push(want + " read " + r.why); }
  }
  check(!problems.length, "da3 a save touching a field policy set is refused as managed and writes nothing; a field it leaves free saves: "
    + (problems.join("; ") || "five refused, one saved, three shapes refused"));
}

{ /* da4 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const S = shell("");
    const steps = [S.deskAiSave({ choice: "organisation", provider: "openai" }), S.deskAiSave({ model: "m-own" }), S.deskAiSave({ key: KEY_PERSON })];
    const said = JSON.stringify(steps) + JSON.stringify(S.deskAiSettings());
    if (holdsKey(said, KEY_PERSON)) problems.push("the person's key in the answer");
    if (!S.deskAiSettings().keyKept || !S.deskAiSettings().ready) problems.push("kept " + JSON.stringify(S.deskAiSettings()));
    const files = fs.readFileSync(S.file(S.DESK_AI_FILE), "utf8") + fs.readFileSync(S.file(S.DESK_AI_KEY_FILE), "utf8");
    if (holdsKey(files, KEY_PERSON)) problems.push("the key in plain text on disk");
    const cfg = S.deskAiConfig();
    if (!cfg || cfg.key !== KEY_PERSON) problems.push("deskAiConfig does not hand the person's key on, so the leg could not see a leak");
    const P = shell(exportText(ORG.concat([["DeskOrganisationModel", "REG_DWORD", 1]])));
    const pAnswer = JSON.stringify(P.deskAiSettings()) + JSON.stringify(P.deskAiSave({ key: "x" }));
    if (holdsKey(pAnswer, KEY_POLICY)) problems.push("the policy's key in the answer");
    const pc = P.deskAiConfig();
    if (!pc || pc.key !== KEY_POLICY || pc.endpoint !== "https://gateway.example/v1/") problems.push("the policy's config " + JSON.stringify(pc && pc.endpoint));
  }
  check(!problems.length, "da4 the key is never in what Settings is told nor on disk as typed, the person's or the policy's, while deskAiConfig hands "
    + "it on: " + (problems.join("; ") || "two keys, five answers"));
}

{ /* da5 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const S = shell("");
    S.deskAiSave({ provider: "openai" }); S.deskAiSave({ model: "m-own" }); S.deskAiSave({ key: KEY_PERSON });
    if (S.deskAiConfig() !== null) problems.push("complete but off, yet a config");
    S.deskAiSave({ choice: "organisation" });
    const c = S.deskAiConfig();
    if (!c || Object.keys(c).sort().join() !== "endpoint,key,managed,model,provider" || c.endpoint !== "https://api.openai.com/v1/")
      problems.push("on " + JSON.stringify(c && Object.keys(c)));
    const doc = JSON.parse(fs.readFileSync(S.file(S.DESK_AI_FILE), "utf8"));
    fs.writeFileSync(S.file(S.DESK_AI_FILE), JSON.stringify(Object.assign(doc, { endpoint: "https://moved.example/v1/" })));
    /* The configuration is kept in memory between saves; a file edited behind the desk's back is read after a forget. */
    S.deskAiForget();
    if (S.deskAiConfig() !== null) problems.push("an edited file moved the key with the address");
    /* A key kept for a real address never follows a changed one: Settings' own move forgets it and says to give it again. */
    const mv = S.deskAiSave({ endpoint: "https://gateway.example/v1/chat/completions" });
    const moved = S.deskAiConfig();
    if (moved !== null || !mv || mv.ok !== true || mv.keyDropped !== true || !mv.settings || mv.settings.keyKept !== false
        || fs.existsSync(S.file(S.DESK_AI_KEY_FILE)))
      problems.push("a kept key followed Settings' move " + JSON.stringify([moved && moved.endpoint, mv && mv.keyDropped, mv && mv.settings && mv.settings.keyKept]));
    S.deskAiSave({ key: KEY_PERSON });
    const given = S.deskAiConfig();
    if (!given || given.key !== KEY_PERSON || given.endpoint !== "https://gateway.example/v1/") problems.push("the key given again " + JSON.stringify(given && given.endpoint));
    const same = S.deskAiSave({ provider: "openai" });
    if (!S.deskAiConfig() || same.keyDropped) problems.push("a save that leaves the address as it was dropped the key");
    const early = shell("");
    early.deskAiSave({ choice: "organisation", provider: "azure" }); early.deskAiSave({ key: KEY_PERSON }); early.deskAiSave({ model: "m" });
    if (early.deskAiConfig() !== null) problems.push("azure with no address");
    early.deskAiSave({ endpoint: "https://res.example/openai/v1/" });
    if (!early.deskAiConfig() || early.deskAiConfig().key !== KEY_PERSON) problems.push("a key typed before its address did not follow it");
    const none = shell("");
    none.deskAiSave({ choice: "organisation", provider: "openai", model: "m" });
    if (none.deskAiConfig() !== null) problems.push("no key, yet a config");
    const t = await S.deskAiTest();
    const a = S.asked[0] || {};
    if (S.asked.length !== 1 || a.prompt !== S.DESK_AI_TEST_PROMPT || Object.keys(a.config || {}).sort().join() !== "endpoint,key,managed,model,provider"
        || !t.ok || t.host !== "gateway.example" || !Number.isFinite(t.ms)) problems.push("test " + JSON.stringify([S.asked.length, a.prompt, t]));
    const tn = await none.deskAiTest();
    if (tn.ok || tn.why !== "key" || none.asked.length) problems.push("a test with no key asked " + none.asked.length);
  }
  check(!problems.length, "da5 deskAiConfig is null while off or incomplete; a kept key never follows a changed address, Settings' move forgets "
    + "it and says to give it again, and a key typed before any address follows the first one named; the test hands "
    + "the door the fixed prompt and five fields alone: " + (problems.join("; ") || "nine states, two tests"));
}

{ /* da6 */
  const problems = [];
  if (loadError) problems.push(loadError);
  else {
    const PLANTED = "https://planted.example/v1/";
    const at = 'endpoint: "https://generativelanguage.googleapis.com/v1/"';
    if (DESK_AI_SRC.split(at).length !== 2) problems.push("the module's Google line is not there once");
    else {
      const copy = deskAiModule(DESK_AI_SRC.replace(at, 'endpoint: "' + PLANTED + '"'));
      const S = shell("", { deskAi: copy });
      const listed = S.deskAiSettings().services || [];
      const want = Object.keys(DESK_AI_MODULE.PROVIDERS);
      if (listed.map(s => s.id).join() !== want.join()) problems.push("services " + listed.map(s => s.id).join());
      const g = listed.find(s => s.id === "google");
      if (!g || g.endpoint !== PLANTED) problems.push("Settings' Google address " + JSON.stringify(g && g.endpoint));
      S.deskAiSave({ choice: "organisation", provider: "google", model: "m", key: KEY_PERSON });
      const c = S.deskAiConfig();
      if (!c || c.endpoint !== PLANTED) problems.push("deskAiConfig's Google address " + JSON.stringify(c && c.endpoint));
    }
    for (const host of ["api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"]) {
      if (SRC.indexOf(host) > -1) problems.push("shell/main.js names " + host);
    }
  }
  check(!problems.length, "da6 the services' published addresses are one table, the adapter module's, and Settings and deskAiConfig read "
    + "it: " + (problems.join("; ") || "an address planted in the module followed in both"));
}

/* ============================================================================================================================
   The page's part.
   ============================================================================================================================ */
const puppeteer = require("puppeteer-core");
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");
const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-own-ai-page-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SERVICES = [{ id: "openai", endpoint: "https://api.openai.com/v1/" }, { id: "anthropic", endpoint: "https://api.anthropic.com/v1/" },
  { id: "google", endpoint: "https://generativelanguage.googleapis.com/v1/" }, { id: "azure", endpoint: "" }, { id: "compatible", endpoint: "" }];
const FREE = { choice: false, provider: false, endpoint: false, model: false, key: false };
const BUILTIN = { choice: "builtin", on: false, ready: false, provider: "", endpoint: "", at: "", host: "", model: "", keyKept: false, keyAway: false,
  managed: FREE, ignored: [], sealable: true, services: SERVICES };
const ORG_ON = Object.assign({}, BUILTIN, { choice: "organisation", on: true, ready: true, provider: "openai", at: "https://api.openai.com/v1/",
  host: "api.openai.com", model: "m-own", keyKept: true });
let browser = null;

async function boot(lang) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((first, lang) => {
    try { for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eFirstSigninSeen", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eUiLang", lang]]) localStorage.setItem(k, v); } catch (e) {}
    window.__ai = { settings: first, saves: [], listeners: [] };
    window.E_HOST = {
      platform: "win32", catalogFolder: "", catalogFile: "", catalogIn: "", catalogBuiltIn: false,
      catalogFiles: () => Promise.resolve([]), onCatalogFile: () => {}, onCatalogListing: () => {},
      aiState: () => ({ model: window.__ai.model !== false }), setAi: () => {}, setSearchAi: () => {},
      hotkeyState: () => ({ accel: "Control+Shift+Space", taken: false, def: "Control+Shift+Space" }), setHotkey: () => Promise.resolve({ ok: true }),
      searchPrepare: () => Promise.resolve({ ready: false, skipped: true }), searchRank: () => Promise.resolve(null),
      deskAiSettings: () => JSON.parse(JSON.stringify(window.__ai.settings)),
      deskAiSave: f => {
        window.__ai.saves.push(f);
        const s = window.__ai.settings;
        if (Object.keys(f).some(k => s.managed[k])) return Promise.resolve({ ok: false, why: "managed", settings: s });
        if (f.choice) Object.assign(s, { choice: f.choice, on: f.choice === "organisation" });
        if (f.provider) s.provider = f.provider;
        /* As the shell does: a move of the address forgets a key kept for another one. */
        if (f.endpoint !== undefined && s.keyKept) { s.keyKept = false; return Promise.resolve({ ok: true, why: "", keyDropped: true, settings: s }); }
        return Promise.resolve({ ok: true, why: "", settings: s });
      },
      deskAiTest: () => Promise.resolve({ ok: true, why: "", host: "api.openai.com", model: "m-own" }),
      onAiRanking: fn => window.__ai.listeners.push(fn),
    };
  }, BUILTIN, lang || "en");
  await seatPage(page);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof openSettings === "function" && !!document.getElementById("orgMark")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  return page;
}
const setHost = (page, st) => page.evaluate(s => { window.__ai.settings = JSON.parse(JSON.stringify(s)); }, st);
const ranked = (page, outcome) => page.evaluate(o => { window.__ai.listeners.forEach(fn => fn(o)); }, outcome || { ranking: "organisation", failures: 0, pausedUntil: 0 });
const markNow = page => page.evaluate(() => {
  const m = document.getElementById("orgMark"), w = m && m.querySelector(".om-words"), d = m && m.querySelector(".om-dot");
  const shown = el => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  return { there: shown(m), words: shown(w), text: w ? w.textContent : "", dot: shown(d), title: m ? m.title : "", label: m ? m.getAttribute("aria-label") || "" : "" };
});
const bodyText = page => page.evaluate(() => {
  const box = document.getElementById("setBody");
  if (!box) return "";
  return box.textContent + " " + [...box.querySelectorAll("[title]")].map(e => e.getAttribute("title")).join(" ");
});

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const page = await boot("en");
  const closeTab = () => page.evaluate(() => { try { if (typeof closeScreenTab === "function") closeScreenTab("settings"); } catch (e) {} });

  /* db1 */
  {
    const problems = [];
    await closeTab(); await page.evaluate(() => openSettings("data")); await sleep(150);
    const off = await page.evaluate(() => {
      const row = document.querySelector('[data-row="orgmodel"]');
      const on = row && row.querySelector(".set-seg button.on");
      return { row: !!row, on: on ? on.getAttribute("data-val") : "", fields: !!document.querySelector(".om-fields") };
    });
    if (!off.row || off.on !== "builtin" || off.fields) problems.push("built-in " + JSON.stringify(off));
    await page.evaluate(() => {
      const b = document.querySelector('[data-row="orgmodel"] .set-seg button[data-val="organisation"]');
      const r = b.getBoundingClientRect();
      window.__click = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const at = await page.evaluate(() => window.__click);
    await page.mouse.click(at.x, at.y);
    await sleep(250);
    const on = await page.evaluate(() => ({
      saves: JSON.stringify(window.__ai.saves),
      on: (document.querySelector('[data-row="orgmodel"] .set-seg button.on') || {}).dataset?.val || "",
      ids: ["omService", "omAddress", "omModel", "omKey", "omTest"].filter(id => !!document.getElementById(id)),
      key: (document.getElementById("omKey") || {}).type || "",
    }));
    if (on.saves !== JSON.stringify([{ choice: "organisation" }]) || on.on !== "organisation" || on.ids.join() !== "omService,omModel,omKey,omTest" || on.key !== "password")
      problems.push("organisation " + JSON.stringify(on));
    await setHost(page, Object.assign({}, ORG_ON, { provider: "azure", at: "", host: "", ready: false }));
    await closeTab(); await page.evaluate(() => openSettings("data")); await sleep(150);
    const azure = await page.evaluate(() => !!document.getElementById("omAddress"));
    if (!azure) problems.push("azure shows no address");
    const dropped = await page.evaluate(async () => {
      const f = document.getElementById("omAddress");
      if (!f) return { toast: "", placeholder: "" };
      f.value = "https://res.example/openai/v1/";
      f.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return { toast: (document.getElementById("toast") || {}).textContent || "", placeholder: (document.getElementById("omKey") || {}).placeholder || "" };
    });
    if (!/forgotten rather than sent to this one/.test(dropped.toast) || /A key is kept/.test(dropped.placeholder)) problems.push("a key dropped by a move, said " + JSON.stringify(dropped));
    check(!problems.length, "db1 the row's two states: built-in alone, the organisation's with service, model, key and the test, the address only where "
      + "the service has none of its own; a move that forgets the key says to give it again: " + (problems.join("; ") || "four states"));
  }

  /* db2 */
  {
    const problems = [];
    const managed = Object.assign({}, ORG_ON, { provider: "anthropic", endpoint: "https://gateway.example/v1/", at: "https://gateway.example/v1/",
      host: "gateway.example", managed: { choice: true, provider: true, endpoint: true, model: true, key: true } });
    await setHost(page, managed);
    await page.evaluate(() => { window.__ai.saves = []; });
    await closeTab(); await page.evaluate(() => openSettings("data")); await sleep(150);
    const got = await page.evaluate(() => {
      const row = document.querySelector('[data-row="orgmodel"]');
      const segs = row ? [...row.querySelectorAll(".set-seg button")] : [];
      const b = row && row.querySelector('.set-seg button[data-val="builtin"]'), r = b && b.getBoundingClientRect();
      return { text: row ? row.textContent : "", disabled: segs.length === 2 && segs.every(x => x.disabled),
        fields: ["omService", "omAddress", "omModel", "omKey"].map(id => { const el = document.getElementById(id); return el ? el.disabled : null; }),
        at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
    });
    if (!got.text.includes("Set by the organisation") || !got.text.includes("gateway.example") || !got.disabled) problems.push("row " + JSON.stringify(got));
    if (got.fields.some(x => x !== true)) problems.push("fields " + JSON.stringify(got.fields));
    if (got.at) { await page.mouse.click(got.at.x, got.at.y); await sleep(200); }
    const saves = await page.evaluate(() => window.__ai.saves.length);
    if (saves) problems.push("a disabled choice saved");
    check(!problems.length, "db2 set by policy, the row shows the choice, the host and Set by the organisation, and its choice and fields take no change: "
      + (problems.join("; ") || "two choices and four fields disabled, a click sends nothing"));
  }

  /* db3 */
  {
    const problems = [];
    await setHost(page, BUILTIN); await ranked(page);
    const off = await markNow(page);
    if (off.there) problems.push("there while built-in");
    await setHost(page, Object.assign({}, ORG_ON, { ready: false })); await ranked(page);
    if ((await markNow(page)).there) problems.push("there while incomplete");
    await setHost(page, ORG_ON); await ranked(page);
    const on = await markNow(page);
    if (!on.there || !on.words || on.text !== "organisation's model" || !on.title.includes("api.openai.com") || on.label !== on.title || on.dot)
      problems.push("on " + JSON.stringify(on));
    await page.setViewport({ width: 700, height: 900, deviceScaleFactor: 1 }); await sleep(150);
    const narrow = await markNow(page);
    if (!narrow.there || narrow.words || !narrow.label.includes("api.openai.com")) problems.push("700 px " + JSON.stringify(narrow));
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 }); await sleep(150);
    await ranked(page, { ranking: "builtin", failures: 3, pausedUntil: Date.now() + 60000 });
    const paused = await markNow(page);
    if (!paused.there || !paused.dot || !/not answering/.test(paused.text) || !/built-in model ranks/.test(paused.title)) problems.push("paused " + JSON.stringify(paused));
    await ranked(page, { ranking: "organisation", failures: 0, pausedUntil: 0 });
    if ((await markNow(page)).dot) problems.push("the dot stayed after an answer");
    await ranked(page, { ranking: "organisation", failures: 0, pausedUntil: 0, slow: true });
    const slow = await markNow(page);
    if (!slow.there || slow.dot || !/too slow to reorder/.test(slow.text) || !/more than 4 seconds/.test(slow.title)) problems.push("slow " + JSON.stringify(slow));
    await ranked(page, { ranking: "organisation", failures: 0, pausedUntil: 0, slow: false });
    if (/too slow/.test((await markNow(page)).text)) problems.push("still too slow once the shell says slow is false");
    await page.evaluate(() => { localStorage.setItem("eAiOff", "1"); localStorage.setItem("eSearchAiOff", "1"); });
    await ranked(page);
    if ((await markNow(page)).there) problems.push("there with both switches off, when nothing is sent");
    await page.evaluate(() => { localStorage.removeItem("eAiOff"); localStorage.removeItem("eSearchAiOff"); });
    await ranked(page);
    if (!(await markNow(page)).there) problems.push("not back with the switches on");
    check(!problems.length, "db3 the mark is there only while the organisation's model ranks, an icon alone at 700 px with its sentence kept, and says "
      + "when the asks are paused or the median wait is too long, and is absent while both switches are off: " + (problems.join("; ") || "eleven states"));
  }

  /* db4: every sentence that says the model's text stays on this computer or is never sent, found by search in the string
     table, is drawn only while the built-in model ranks. The search: a row whose English or Polish names this or the
     agent's computer, staying, keeping, leaving or not being sent, or local, and names the model, the message or the search.
     What it finds is held to the lists below, so a new sentence it finds stops this leg until it is read and listed; the
     first list is the known positive, the claims a screen draws. */
  {
    const problems = [];
    const LOCAL = /this computer|your computer|leaves|never kept|never sent|not sent|nothing is sent|sends nothing|sending nothing|stays|kept here|local/i;
    const LOCAL_PL = /tym komputerze|tego komputera|twoim komputerze|nie opuszcza|nie jest wysyłan|niewysyłan|nie wysyła|nie trafia|zostaje|pozostaje|przechowywan|lokaln/i;
    const SUBJECT = /model|message|search|selected words|words selected/i, SUBJECT_PL = /model|wiadomoś|wyszuk|zaznaczony tekst na tym|tekście zaznaczonym/i;
    const CLAIMS = ["Reads the selected message on this computer", "The model ranks the suggestions; nothing leaves this computer",
      "The model built into Etiuda, which works on this computer alone.", "From the third letter typed, the main search adds the cards and intents closest in meaning after those that match the words, ranked by the model on this computer.",
      "The model ranks the search beside word matches; nothing leaves this computer", "When Quick replies opens with a customer's message selected in another program"];
    /* True whenever they are drawn, and not drawn while the organisation's model ranks with both switches on: the built-in
       choice's hint, the pause's line, the too-slow line ("the built-in model's order stands"), the incomplete setting's line,
       both switches off. */
    const TRUE_WHEN_DRAWN = ["The built-in model sends nothing anywhere.", "{HOST} has not answered three times in a row, so the built-in model ranks on this computer",
      "{HOST} usually takes more than 4 seconds to answer", "Until the service, its address, the model and the key are all filled in",
      "The organisation's model at {HOST} is set, and with both switches and Rewording off"];
    /* True while the organisation's model ranks too, so they may be drawn then: the suggestion switch's off line (off, nothing
       goes to either model for suggestions), and the connection test's hover (the test sends its fixed prompt alone). */
    /* The person's own switch for rewording says only that, turned off, nothing is sent by Reword or Your own words?; it is drawn only
       where the organisation's model is in force (db9). */
    const TRUE_WITH_ORG = ["Suggestions come from matching words, and the model stays unloaded", "Asks the model for a one-word answer.",
      "Reword on cards and Your own words? in Quick replies send the card's words"];
    const found = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8").split("\n")
      .map(l => /^\s*"((?:[^"\\]|\\.)*)":"((?:[^"\\]|\\.)*)",?\s*$/.exec(l)).filter(Boolean)
      .map(m => ({ en: JSON.parse("\"" + m[1] + "\""), pl: JSON.parse("\"" + m[2] + "\"") }))
      .filter(r => (LOCAL.test(r.en) || LOCAL_PL.test(r.pl)) && (SUBJECT.test(r.en) || SUBJECT_PL.test(r.pl)));
    const listed = CLAIMS.concat(TRUE_WHEN_DRAWN, TRUE_WITH_ORG);
    const named = r => listed.find(p => r.en.indexOf(p) === 0);
    for (const r of found) if (!named(r)) problems.push("the search found a sentence to read and list: " + JSON.stringify(r.en.slice(0, 80)));
    for (const p of listed) if (!found.some(r => r.en.indexOf(p) === 0)) problems.push("the search missed a known one: " + JSON.stringify(p.slice(0, 60)));
    /* The open page: the AI section, the Keyboard shortcuts section and the whole page, the mark's title beside them. */
    const screens = async () => {
      let all = "";
      for (const sec of ["ai", "keys", "all"]) { await closeTab(); await page.evaluate(s => openSettings(s), sec); await sleep(150); all += " " + await bodyText(page); }
      return all + " " + (await markNow(page)).title;
    };
    const drawn = (text, lang) => found.filter(r => text.indexOf((lang === "pl" ? r.pl : r.en).split("{HOST}").join("api.openai.com")) > -1);
    for (const lang of ["en", "pl"]) {
      await page.evaluate(l => { localStorage.setItem("eUiLang", l); try { setUiLang(l); } catch (e) {} }, lang);
      await setHost(page, BUILTIN); await ranked(page);
      const builtin = drawn(await screens(), lang).map(r => named(r));
      const claimsDrawn = CLAIMS.filter(p => builtin.indexOf(p) > -1).length;
      if (claimsDrawn !== CLAIMS.length) problems.push(lang + " built-in drew " + claimsDrawn + " of the " + CLAIMS.length + " claims");
      await setHost(page, ORG_ON); await ranked(page);
      const text = await screens();
      const org = drawn(text, lang).filter(r => TRUE_WITH_ORG.indexOf(named(r)) < 0);
      if (org.length) problems.push(lang + " organisation drew " + JSON.stringify(org.map(r => r.en.slice(0, 60))));
      if (text.split("api.openai.com").length - 1 < 4) problems.push(lang + " organisation named its host " + (text.split("api.openai.com").length - 1) + " time(s)");
    }
    await page.evaluate(() => { localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {} });
    check(!problems.length, "db4 every sentence the string table holds that says the model's text stays on this computer or is never sent ("
      + found.length + " found by search, " + CLAIMS.length + " of them claims a screen draws) is drawn only while the built-in model ranks, "
      + "in the AI section, the Keyboard shortcuts note, the whole page and the mark, in English and Polish: " + (problems.join("; ") || "four screens each"));
  }

  /* db5: the AI section is there wherever a model can rank, the organisation's with the built-in model absent included. */
  {
    const problems = [];
    const aiRows = async () => {
      await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
      return page.evaluate(() => ["aisuggest", "aisearch"].filter(k => !!document.querySelector('#setBody [data-row="' + k + '"]')).length);
    };
    await page.evaluate(() => { window.__ai.model = false; });
    await setHost(page, ORG_ON);
    const orgOnly = await aiRows();
    if (orgOnly !== 2) problems.push("the organisation's model on, the built-in absent: " + orgOnly + " row(s)");
    const text = await bodyText(page);
    if (text.indexOf("api.openai.com") < 0) problems.push("its host not named");
    await setHost(page, BUILTIN);
    const none = await aiRows();
    if (none !== 0) problems.push("no model at all: " + none + " row(s)");
    await page.evaluate(() => { window.__ai.model = true; });
    const builtinOnly = await aiRows();
    if (builtinOnly !== 2) problems.push("the built-in model alone: " + builtinOnly + " row(s)");
    check(!problems.length, "db5 the AI section is shown whenever either model can rank, with the built-in model absent and the organisation's on "
      + "included, and not where neither can: " + (problems.join("; ") || "three states"));
  }

  /* db6: while the organisation's model ranks, the AI section's lede says what is sent by the two switches, and follows a
     switch moved on the open page, as does the picker's note on the whole page. */
  {
    const problems = [];
    await setHost(page, ORG_ON);
    const flip = (row, val) => page.evaluate((r, v) => { const b = document.querySelector('#setBody [data-row="' + r + '"] .set-seg button[data-val="' + v + '"]'); if (b) b.click(); return !!b; }, row, val);
    const lede = () => page.evaluate(() => (document.querySelector("#setBody p.lede") || {}).textContent || "");
    const note = () => page.evaluate(() => (document.querySelector("#setBody #setSuggestNote") || {}).textContent || "");
    await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
    const both = await lede();
    if (!/ranks the search and the suggestions/.test(both) || both.indexOf("api.openai.com") < 0) problems.push("both on: " + JSON.stringify(both));
    if (!(await flip("aisuggest", "off"))) problems.push("no suggestion switch");
    await sleep(100);
    const searchOnly = await lede();
    if (!/ranks the search\. The search text is sent there, with up to 12 short pieces of the cards being ranked\./.test(searchOnly)) problems.push("suggestions off: " + JSON.stringify(searchOnly));
    await flip("aisearch", "off"); await sleep(100);
    const neither = await lede();
    if (!/with both switches and Rewording off, nothing is sent to it/.test(neither)) problems.push("both off: " + JSON.stringify(neither));
    await closeTab(); await page.evaluate(() => openSettings("all")); await sleep(150);
    const offNote = await note();
    await flip("aisuggest", "on"); await sleep(100);
    const onNote = await note();
    if (!/never kept or sent/.test(offNote) || !/(is|are) sent to api\.openai\.com/.test(onNote)) problems.push("the note " + JSON.stringify([offNote.slice(-60), onNote.slice(-120)]));
    await page.evaluate(() => { localStorage.removeItem("eAiOff"); localStorage.removeItem("eSearchAiOff"); });
    check(!problems.length, "db6 while the organisation's model ranks, the AI section's lede says what is sent by the two switches and follows a switch "
      + "moved on the open page, and the picker's note follows the suggestion switch: " + (problems.join("; ") || "three ledes, two notes"));
  }

  /* db6r: the statement of what leaves, in the copywriter's words of 2026-11-16 (state/briefs/words-what-leaves-the-computer-2026-11-16.md, section 3),
     by the two switches and by the person's own Rewording switch, each form on and off, in both languages: the lede, the mark's title and the
     model row's line. The Rewording sentence follows only where the shell says the switch is on (rewordOn === true) and names the address a
     reword goes to (rewordAt), the one reading the sending code makes (fail closed): where the shell's state says nothing of it, or says it is
     off, the "off" forms stand, so the sentence shown never says less than what can be sent. */
  {
    const problems = [];
    const T = {
      en: {
        both: "The organisation's model at api.openai.com ranks the search and the suggestions. The search text, the selected message the suggestions are made from, and up to 12 short pieces of the cards being ranked are sent there.",
        search: "The organisation's model at api.openai.com ranks the search. The search text is sent there, with up to 12 short pieces of the cards being ranked.",
        suggest: "The organisation's model at api.openai.com ranks the suggestions. The selected message they are made from is sent there, with up to 12 short pieces of the cards being ranked.",
        R: "At your press, the words or the card you ask it to reword go there too.",
        noneOff: "The organisation's model at api.openai.com is set, and with both switches and Rewording off, nothing is sent to it.",
        noneOn: "The organisation's model at api.openai.com is set. With both switches off, only the words or the card you ask it to reword are sent to it, at your press.",
        rowOff: "The search text, the selected message the suggestions are made from and up to 12 short pieces of the cards being ranked are sent to api.openai.com, and nowhere else.",
        rowOn: "The search text, the selected message the suggestions are made from and up to 12 short pieces of the cards being ranked are sent to api.openai.com, and nowhere else; so, at your press, are the words or the card you ask it to reword.",
      },
      pl: {
        both: "Model organizacji pod adresem api.openai.com ustala kolejność wyszukiwania i propozycji. Trafia tam tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart.",
        search: "Model organizacji pod adresem api.openai.com ustala kolejność wyszukiwania. Trafia tam tekst wyszukiwania, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart.",
        suggest: "Model organizacji pod adresem api.openai.com ustala kolejność propozycji. Trafia tam zaznaczona wiadomość, z której powstają, razem z najwyżej 12 krótkimi fragmentami porządkowanych kart.",
        R: "Po kliknięciu trafia tam też tekst albo karta do przeredagowania.",
        noneOff: "Model organizacji pod adresem api.openai.com jest ustawiony, a przy wyłączonych obu przełącznikach i Przeredagowaniu nic do niego nie trafia.",
        noneOn: "Model organizacji pod adresem api.openai.com jest ustawiony. Przy wyłączonych obu przełącznikach trafia do niego tylko, po kliknięciu, tekst albo karta do przeredagowania.",
        rowOff: "Tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart trafiają do api.openai.com i nigdzie indziej.",
        rowOn: "Tekst wyszukiwania, zaznaczona wiadomość, z której powstają propozycje, i najwyżej 12 krótkich fragmentów porządkowanych kart trafiają do api.openai.com i nigdzie indziej; po kliknięciu trafia tam też tekst albo karta do przeredagowania.",
      },
    };
    /* The shell's state as each case has it: rewordOn true or false with an address, true with no address (no organisation's model to send to),
       a value that is not a boolean, and no word of it at all, which is how a state that cannot be read comes to the page. */
    const STATES = [["on", { rewordAt: "api.openai.com", rewordOn: true }, true], ["off", { rewordAt: "api.openai.com", rewordOn: false }, false],
      ["on, no address", { rewordAt: "", rewordOn: true }, false], ["unsaid", {}, false], ["not a boolean", { rewordAt: "api.openai.com", rewordOn: "true" }, false]];
    await setHost(page, ORG_ON);
    for (const lang of ["en", "pl"]) {
      await page.evaluate(l => { localStorage.setItem("eUiLang", l); try { setUiLang(l); } catch (e) {} }, lang);
      for (const [name, st, rewords] of STATES) {
        await page.evaluate(s => { window.E_HOST.aiState = () => Object.assign({ model: true }, s); }, st);
        for (const [suggest, search] of [[1, 1], [0, 1], [1, 0], [0, 0]]) {
          await page.evaluate((a, b) => { if (a) localStorage.removeItem("eAiOff"); else localStorage.setItem("eAiOff", "1"); if (b) localStorage.removeItem("eSearchAiOff"); else localStorage.setItem("eSearchAiOff", "1"); }, suggest, search);
          const w = T[lang], base = suggest && search ? w.both : search ? w.search : suggest ? w.suggest : "";
          const wantLede = base ? base + (rewords ? " " + w.R : "") : rewords ? w.noneOn : w.noneOff;
          const where = lang + "/rewording " + name + "/suggest " + suggest + " search " + search;
          await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(120);
          const lede = await page.evaluate(() => (document.querySelector("#setBody p.lede") || {}).textContent || "");
          if (lede !== wantLede) problems.push(where + " lede " + JSON.stringify(lede));
          await page.evaluate(() => { try { syncOrgMark(); } catch (e) {} });
          const mark = await markNow(page);
          if (base) { if (!mark.there || mark.title !== wantLede) problems.push(where + " mark " + JSON.stringify([mark.there, mark.title])); }
          else if (mark.there) problems.push(where + " mark drawn with both switches off");
          if (suggest && search) {
            await closeTab(); await page.evaluate(() => openSettings("data")); await sleep(120);
            const row = await page.evaluate(() => (document.querySelector('[data-row="orgmodel"]') || {}).textContent || "");
            if (row.indexOf(rewords ? w.rowOn : w.rowOff) < 0 || (!rewords && row.indexOf(w.rowOn) >= 0)) problems.push(where + " model row " + JSON.stringify(row.slice(0, 260)));
          }
        }
      }
    }
    await page.evaluate(() => {
      localStorage.removeItem("eAiOff"); localStorage.removeItem("eSearchAiOff"); localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {}
      window.E_HOST.aiState = () => ({ model: window.__ai.model !== false });
    });
    check(!problems.length, "db6r the lede, the mark's title and the model row's line carry the shortlist and the Rewording sentence only while the shell says that switch is on "
      + "and names an address, and say the off forms where it says off, nothing or no address, in English and Polish: " + (problems.slice(0, 3).join("; ") || "five states, four switch cases, two languages"));
  }

  /* db7 (review finding 3): a policy key with neither a provider nor an address says so in Settings and on a refused test, in both languages. */
  {
    const problems = [];
    const noSvc = Object.assign({}, BUILTIN, {
      choice: "organisation", on: true, ready: false, provider: "openai", host: "api.openai.com", model: "m-own",
      keyAway: true, keyNoService: true, managed: Object.assign({}, FREE, { choice: true, model: true, key: true }),
    });
    const wantSettings = {
      en: "Your organisation has set a key for an AI service without naming the service, so nothing is sent. Its IT department can name it.",
      pl: "Organizacja ustawiła klucz do usługi AI, ale nie wskazała tej usługi, więc nic nie jest wysyłane. Może ją wskazać dział IT organizacji.",
    };
    const wantTest = {
      en: "Not sent: the organisation set a key without naming its service.",
      pl: "Nie wysłano: organizacja ustawiła klucz bez wskazania usługi.",
    };
    await setHost(page, noSvc);
    await page.evaluate(() => {
      window.__ai.origTest = window.E_HOST.deskAiTest;
      window.E_HOST.deskAiTest = () => Promise.resolve({ ok: false, why: "keyNoService", host: "", model: "m-own" });
    });
    for (const lang of ["en", "pl"]) {
      await page.evaluate(l => { localStorage.setItem("eUiLang", l); try { setUiLang(l); } catch (e) {} }, lang);
      await closeTab(); await page.evaluate(() => openSettings("data")); await sleep(150);
      const got = await page.evaluate(async () => {
        const row = document.querySelector('[data-row="orgmodel"]');
        const btn = document.getElementById("omTest");
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 80));
        return { row: row ? row.textContent : "", test: (document.getElementById("omTestLine") || {}).textContent || "" };
      });
      if (!got.row.includes(wantSettings[lang])) problems.push(lang + " settings: " + JSON.stringify(got.row.slice(0, 140)));
      if (got.test !== wantTest[lang]) problems.push(lang + " test: " + JSON.stringify(got.test));
    }
    await page.evaluate(() => {
      if (window.__ai.origTest) window.E_HOST.deskAiTest = window.__ai.origTest;
      localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {}
    });
    check(!problems.length, "db7 a policy key without a named service shows the copywriter's lines in Settings and on a test in English and Polish: "
      + (problems.join("; ") || "two screens, two languages"));
  }

  /* db8 (review finding 7): while slow, the mark's title states that one query a minute is still sent to {HOST}, in both languages and with or without the built-in model. */
  {
    const wantSlow = {
      en: {
        builtin: "api.openai.com usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the built-in model's order stands, and the desk still sends one query a minute to api.openai.com.",
        words:   "api.openai.com usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the word matches' order stands, and the desk still sends one query a minute to api.openai.com.",
      },
      pl: {
        builtin: "api.openai.com na ogół odpowiada dłużej niż 4 sekundy, za długo, by zmieniać kolejność listy, która jest już czytana, więc zostaje kolejność modelu wbudowanego, a stanowisko nadal wysyła do api.openai.com jedno zapytanie na minutę.",
        words:   "api.openai.com na ogół odpowiada dłużej niż 4 sekundy, za długo, by zmieniać kolejność listy, która jest już czytana, więc zostaje kolejność dopasowań słów, a stanowisko nadal wysyła do api.openai.com jedno zapytanie na minutę.",
      },
    };
    const checkSlowMark = async targetPage => {
      const issues = [];
      await closeTab().catch(() => {});
      await setHost(targetPage, ORG_ON);
      for (const hasModel of [true, false]) {
        await targetPage.evaluate(m => { window.__ai.model = m; }, hasModel);
        for (const lang of ["en", "pl"]) {
          await targetPage.evaluate(l => { localStorage.setItem("eUiLang", l); try { setUiLang(l); } catch (e) {} }, lang);
          await ranked(targetPage, { ranking: "organisation", failures: 0, pausedUntil: 0, slow: true });
          const mark = await markNow(targetPage);
          const expected = wantSlow[lang][hasModel ? "builtin" : "words"];
          if (!mark.there || mark.dot) issues.push(lang + "/" + hasModel + " mark state: " + JSON.stringify(mark));
          else if (mark.title !== expected) issues.push(lang + "/" + hasModel + " title: " + JSON.stringify(mark.title));
        }
      }
      await targetPage.evaluate(() => { window.__ai.model = true; });
      return issues;
    };
    const problems = await checkSlowMark(page);
    await setHost(page, ORG_ON);
    await page.evaluate(() => { localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {} });
    check(!problems.length, "db8 while slow, the mark says one query a minute is still sent to the host, in English and Polish with or without the built-in model: "
      + (problems.join("; ") || "two modes, two languages"));

    if (PLANTS_OFF) skipPlant("db8p lifting the slow-mark reminder clause lets the title silently drop the one-query-a-minute notice (ETIUDA_PLANTS=off)");
    else {
      const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8");
      const needle = ", and the desk still sends one query a minute to {HOST}.";
      if (built.split(needle).length < 2) check(false, "db8p slow-mark reminder anchor found in engine/etiuda.html", "anchor missing");
      else {
        const plantedPath = path.join(lab, "etiuda-plant.html");
        fs.writeFileSync(plantedPath, built.split(needle).join("."), "utf8");
        await page.goto("file:///" + plantedPath.replace(/\\/g, "/"), { waitUntil: "load", timeout: 60000 });
        const lifted = await checkSlowMark(page);
        check(lifted.length > 0, "db8p lifting the slow-mark reminder clause breaks the check above: " + JSON.stringify(lifted.slice(0, 1)));
      }
    }
  }
  /* db9: THE PERSON'S OWN SWITCH FOR REWORDING, a row in the AI section where the organisation's model is set and nowhere else, in the
     copywriter's words (section 4 of her file) in both languages, no quotation marks in them, off hiding Reword on every card and
     telling the shell, and the ordering's two switches left as they were. */
  const RW_LABEL = { en: "Rewording", pl: "Przeredagowanie" };
  const RW_HINT = { en: "Reword on cards and Your own words? in Quick replies send the card's words or the selected words to the organisation's model at {ADDRESS}, only when pressed. Turned off, both are gone and nothing is sent; the choice is yours, on this computer.",
    pl: "Przycisk Przeredaguj na kartach i Własne słowa? w Szybkich odpowiedziach wysyłają treść karty albo zaznaczony tekst do modelu organizacji pod adresem {ADDRESS}, tylko po kliknięciu. Po wyłączeniu oba znikają i nic nie jest wysyłane; to osobisty wybór na tym komputerze." };
  const wireRw = (pg, at) => pg.evaluate(a => {
    window.__rw = { at: a, on: true, calls: [] };
    window.E_HOST.aiState = () => ({ model: true, org: !!window.__rw.at, reword: window.__rw.on ? window.__rw.at : "", rewordAt: window.__rw.at, rewordOn: window.__rw.on });
    window.E_HOST.setReword = on => { window.__rw.calls.push(!!on); window.__rw.on = !!on; };
    window.E_HOST.reword = async () => ({ ok: false, why: "answer" });
  }, at);
  /* SETTINGS_SHOTS=<folder> also writes a still of the row, on and off (light), beside the row above it, for the designer's eye. */
  const rwShot = async (pg, name) => {
    if (!process.env.SETTINGS_SHOTS) return;
    fs.mkdirSync(process.env.SETTINGS_SHOTS, { recursive: true });
    const was = await pg.evaluate(() => { const w = document.documentElement.getAttribute("data-theme"); document.documentElement.setAttribute("data-theme", "light"); return w; });
    await sleep(250);
    const box = await pg.evaluate(() => {
      const a = document.querySelector('#setBody [data-row="aisearch"]'), b = document.querySelector('#setBody [data-row="aireword"]');
      if (!a || !b) return null;
      b.scrollIntoView({ block: "center", behavior: "instant" });
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), left = Math.min(ra.left, rb.left), right = Math.max(ra.right, rb.right);
      return { x: Math.max(0, left - 16), y: Math.max(0, ra.top - 12), width: right - left + 32, height: rb.bottom - ra.top + 24 };
    });
    if (box) await pg.screenshot({ path: path.join(process.env.SETTINGS_SHOTS, name + ".png"), clip: box });
    await pg.evaluate(w => { if (w === null) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", w); }, was);
  };
  const rwRow = (pg) => pg.evaluate(() => {
    const r = document.querySelector('#setBody [data-row="aireword"]');
    if (!r) return null;
    const on = r.querySelector(".set-seg button.on"), rows = [...document.querySelectorAll("#setBody .set-row")].map(x => x.getAttribute("data-row"));
    return { label: ((r.querySelector(".set-label") || {}).firstChild || {}).textContent || "", on: on ? on.getAttribute("data-val") : "", after: rows.indexOf("aireword") === rows.indexOf("aisearch") + 1,
      text: r.textContent, titles: [...r.querySelectorAll("[title]")].map(e => e.getAttribute("title")).join(" ") };
  });
  {
    const problems = [];
    await page.evaluate(() => { localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {} });
    await wireRw(page, "");
    await setHost(page, ORG_ON);
    await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
    if (await rwRow(page)) problems.push("a row where the organisation's model is not set");
    await wireRw(page, "api.openai.com");
    await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
    const en = await rwRow(page);
    /* The button as the card's own drawing asks for it (card-reword.js rewordButtonHtml); this page has no catalog of its own to count cards in. */
    const cards = () => page.evaluate(() => ({ cards: 1, buttons: typeof rewordButtonHtml === "function" && rewordButtonHtml().indexOf('data-act="reword"') > -1 ? 1 : 0 }));
    await sleep(200);
    await rwShot(page, "s-rewording-on-light");
    const before = await cards();
    if (!en) problems.push("no row where the organisation's model is set");
    else {
      if (en.label !== RW_LABEL.en || en.text.indexOf(RW_HINT.en.split("{ADDRESS}").join("api.openai.com")) < 0 || en.on !== "on" || !en.after) problems.push("the English row " + JSON.stringify(en));
      if (/["“”„]/.test(en.label + RW_HINT.en)) problems.push("quotation marks in the words");
    }
    await page.evaluate(() => { const b = document.querySelector('#setBody [data-row="aireword"] .set-seg button[data-val="off"]'); if (b) b.click(); });
    await sleep(250);
    await rwShot(page, "s-rewording-off-light");
    const off = await rwRow(page), asOff = await page.evaluate(() => ({ calls: window.__rw.calls.slice(), ordering: [localStorage.getItem("eAiOff"), localStorage.getItem("eSearchAiOff")], seg: ["aisuggest", "aisearch"].map(k => (document.querySelector('#setBody [data-row="' + k + '"] .set-seg button.on') || {}).dataset?.val || "") }));
    await closeTab(); await sleep(250);
    const hidden = await cards();
    await page.evaluate(() => openSettings("ai")); await sleep(150);
    await page.evaluate(() => { const b = document.querySelector('#setBody [data-row="aireword"] .set-seg button[data-val="on"]'); if (b) b.click(); });
    await sleep(250);
    const asOn = await page.evaluate(() => window.__rw.calls.slice());
    await closeTab(); await sleep(250);
    const shown = await cards();
    if (!off || off.on !== "off" || asOff.calls.join() !== "false" || asOff.ordering.join() !== "," || asOff.seg.join() !== "on,on") problems.push("off: " + JSON.stringify({ off: off && off.on, asOff }));
    if (!(before.cards > 0 && before.buttons > 0 && hidden.buttons === 0 && shown.buttons > 0 && asOn.join() !== "false")) problems.push("the buttons on the cards " + JSON.stringify({ before, hidden, shown, asOn }));
    const pl = await boot("pl");
    await wireRw(pl, "api.openai.com");
    await setHost(pl, ORG_ON);
    await pl.evaluate(() => openSettings("ai")); await sleep(200);
    const plRow = await rwRow(pl);
    if (!plRow || plRow.label !== RW_LABEL.pl || plRow.text.indexOf(RW_HINT.pl.split("{ADDRESS}").join("api.openai.com")) < 0) problems.push("the Polish row " + JSON.stringify(plRow));
    await pl.close();
    check(!problems.length, "db9 the person's own switch is a row in the AI section only where the organisation's model is set, in the copywriter's words in both languages without quotation marks; "
      + "off tells the shell and takes Reword from every card, on brings it back, and the ordering's two switches stay as they were: " + (problems.join("; ") || "absent, on, off, on, Polish"));
  }

  /* db9m (the test architect's note on db6r): the Rewording toggle calls syncOrgMark(), so the header mark's tip follows the switch at once.
     The stand-in's aiState flips between two reads (wireRw's reads the switch afresh), the person turns Rewording off and on in Settings, and
     this check never calls syncOrgMark itself and never reloads: the mark's tip and the AI section's lede carry the Rewording sentence only
     while the switch is on. */
  const REWORD_SAID = "At your press, the words or the card you ask it to reword go there too.";
  const rwMarkFollows = async (pg) => {
    const problems = [], ledeProblems = [];
    await pg.evaluate(() => { localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {} localStorage.removeItem("eAiOff"); localStorage.removeItem("eSearchAiOff"); });
    await wireRw(pg, "api.openai.com");
    await setHost(pg, ORG_ON);
    await ranked(pg);
    await pg.evaluate(() => { try { closeScreenTab("settings"); } catch (e) {} });
    await pg.evaluate(() => openSettings("ai")); await sleep(150);
    const read = async () => ({ mark: await markNow(pg), lede: await pg.evaluate(() => (document.querySelector("#setBody p.lede") || {}).textContent || "") });
    const press = async val => { await pg.evaluate(v => { const b = document.querySelector('#setBody [data-row="aireword"] .set-seg button[data-val="' + v + '"]'); if (b) b.click(); }, val); await sleep(150); };
    const start = await read();
    if (!start.mark.there || start.mark.title.indexOf(REWORD_SAID) < 0) problems.push("on at the start: the mark " + JSON.stringify([start.mark.there, start.mark.title.slice(-80)]));
    await press("off");
    const off = await read(), offState = await pg.evaluate(() => window.__rw.on);
    if (offState !== false) problems.push("the stand-in's state did not turn off " + JSON.stringify(offState));
    if (!off.mark.there || off.mark.title.indexOf(REWORD_SAID) >= 0 || off.mark.label.indexOf(REWORD_SAID) >= 0) problems.push("off: the mark still says it " + JSON.stringify([off.mark.there, off.mark.title.slice(-80)]));
    if (off.lede.indexOf(REWORD_SAID) >= 0) ledeProblems.push("off: the lede still says it " + JSON.stringify(off.lede.slice(-80)));
    await press("on");
    const back = await read(), backState = await pg.evaluate(() => window.__rw.on);
    if (backState !== true) problems.push("the stand-in's state did not turn on " + JSON.stringify(backState));
    if (!back.mark.there || back.mark.title.indexOf(REWORD_SAID) < 0 || back.mark.label.indexOf(REWORD_SAID) < 0) problems.push("on again: the mark does not say it " + JSON.stringify([back.mark.there, back.mark.title.slice(-80)]));
    if (back.lede.indexOf(REWORD_SAID) < 0) ledeProblems.push("on again: the lede does not say it " + JSON.stringify(back.lede.slice(-80)));
    /* The model row's line, on the page that draws every setting, follows the switch the same way. */
    await pg.evaluate(() => { try { closeScreenTab("settings"); } catch (e) {} });
    await pg.evaluate(() => openSettings("all")); await sleep(150);
    const rowSaid = () => pg.evaluate(() => (document.querySelector('[data-row="orgmodel"] .set-label small') || {}).textContent || "");
    const ROW_SAID = "so, at your press, are the words or the card you ask it to reword";
    if ((await rowSaid()).indexOf(ROW_SAID) < 0) ledeProblems.push("model row on at the start");
    await press("off");
    if ((await rowSaid()).indexOf(ROW_SAID) >= 0) ledeProblems.push("off: the model row's line still says it");
    await press("on");
    if ((await rowSaid()).indexOf(ROW_SAID) < 0) ledeProblems.push("on again: the model row's line does not say it");
    return { problems, ledeProblems };
  };
  {
    const { problems, ledeProblems } = await rwMarkFollows(page);
    check(!ledeProblems.length, "db9ml the AI section's lede and the model row's line follow the Rewording switch at once too: " + (ledeProblems.join("; ") || "on, off, on"));
    check(!problems.length, "db9m with the organisation's model on, turning Rewording off takes its sentence from the mark's tip at once, without a reload, and on brings it back: "
      + (problems.join("; ") || "on, off, on"));
  }

  /* db9mp the plant: the Rewording toggle without its syncOrgMark() call */
  if (PLANTS_OFF) skipPlant("db9mp the Rewording toggle without its syncOrgMark() call (ETIUDA_PLANTS=off)");
  else {
    const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8"), re = /rewordSwitchSet\(on\);(\s*)syncOrgMark\(\);/g;
    const found = (built.match(re) || []).length;
    if (found !== 1) check(false, "db9mp the toggle's syncOrgMark() call found once in engine/etiuda.html", { found });
    else {
      const at = path.join(lab, "etiuda-rw-mark-plant.html");
      fs.writeFileSync(at, built.replace(re, "rewordSwitchSet(on);"), "utf8");
      await page.goto("file:///" + at.split(String.fromCharCode(92)).join("/"), { waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => typeof openSettings === "function" && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
      const planted = (await rwMarkFollows(page)).problems;
      check(planted.length > 0, "db9mp with the toggle's syncOrgMark() call removed, the mark's tip stays behind the switch and db9m fails: " + JSON.stringify(planted.slice(0, 1)));
    }
  }

  /* db9lp the plant: the Rewording toggle without its syncAiWords() call */
  if (PLANTS_OFF) skipPlant("db9lp the Rewording toggle without its syncAiWords() call (ETIUDA_PLANTS=off)");
  else {
    const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8"), re = /(rewordSwitchSet\(on\);\s*syncOrgMark\(\);)\s*syncAiWords\(\);/g;
    const found = (built.match(re) || []).length;
    if (found !== 1) check(false, "db9lp the toggle's syncAiWords() call found once in engine/etiuda.html", { found });
    else {
      const at = path.join(lab, "etiuda-rw-lede-plant.html");
      fs.writeFileSync(at, built.replace(re, "$1"), "utf8");
      await page.goto("file:///" + at.split(String.fromCharCode(92)).join("/"), { waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => typeof openSettings === "function" && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
      const planted = (await rwMarkFollows(page)).ledeProblems;
      check(planted.length > 0, "db9lp with the toggle's syncAiWords() call removed, the lede stays behind the switch and db9ml fails: " + JSON.stringify(planted.slice(0, 1)));
    }
  }

  /* db9p the plant: the row drawn whether or not the organisation's model is in force */
  if (PLANTS_OFF) skipPlant("db9p the switch's row drawn without the organisation's model (ETIUDA_PLANTS=off)");
  else {
    const built = fs.readFileSync(path.join(lab, "etiuda.html"), "utf8"), needle = "].concat(rw.at ? [";
    if (built.split(needle).length !== 2) check(false, "db9p the row's anchor found once in engine/etiuda.html", { found: built.split(needle).length - 1 });
    else {
      const at = path.join(lab, "etiuda-rw-plant.html");
      fs.writeFileSync(at, built.replace(needle, "].concat(true ? ["), "utf8");
      await page.goto("file:///" + at.split(String.fromCharCode(92)).join("/"), { waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => typeof openSettings === "function" && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
      await wireRw(page, "");
      await setHost(page, ORG_ON);
      await page.evaluate(() => openSettings("ai")); await sleep(200);
      const planted = await rwRow(page);
      check(!!planted, "db9p with the row drawn whether or not the organisation's model is in force, a row stands where none is set and db9 fails");
    }
  }
  await page.close();
} catch (e) {
  check(false, "the page's part ran", (e && e.message) || String(e));
} finally {
  if (browser) await browser.close();
}

/* B9: the copywriter's words for the AI section's lines, held by bytes in both languages as the table holds them and as the code
   says them (the English in a t() call), so a changed word on either side fails here. */
{
  const ROWS = [
    ["Until the service, its address, the model and the key are all filled in, the built-in model ranks and nothing is sent.", "Dopóki usługa, jej adres, model i klucz nie są uzupełnione, kolejność ustala model wbudowany i nic nie jest wysyłane."],
    ["That model name could not be kept, so the one before stands.", "Tej nazwy modelu nie udało się zachować, więc obowiązuje poprzednia."],
    ["That key could not be kept, so the one before stands.", "Tego klucza nie udało się zachować, więc obowiązuje poprzedni."],
    ["The setting could not be saved just now.", "Tego ustawienia nie udało się teraz zapisać."],
    ["The key kept here was given for the previous service or address, so it was forgotten rather than sent to this one. The key for this one goes in the Key field.", "Zachowany klucz podano dla poprzedniej usługi lub adresu, więc został usunięty, zamiast trafić pod ten adres. Klucz dla tego adresu wpisuje się w polu Klucz."],
    ["{HOST} could not be reached, so the connection is not confirmed.", "Nie udało się połączyć z {HOST}, więc połączenie nie zostało potwierdzone."],
    ["{HOST} answered with an error, so the connection is not confirmed.", "{HOST} odpowiedział błędem, więc połączenie nie zostało potwierdzone."]
  ];
  const table = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
  const code = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
  const bad = [];
  for (const [en, pl] of ROWS) {
    if (table.indexOf("  " + JSON.stringify(en) + ":" + JSON.stringify(pl) + ",") < 0) bad.push("table: " + en.slice(0, 40));
    if (code.indexOf("t(" + JSON.stringify(en) + ")") < 0) bad.push("code: " + en.slice(0, 40));
  }
  check(!bad.length, "db10 the AI section's seven sentences stand in the code and the Polish table as the copywriter wrote them", bad);
}

const EXPECTED = 23;
const done = asserted + notRun === EXPECTED;
if (!done) { failed++; console.log("  FAIL ran " + (asserted + notRun) + " checks (" + asserted + " ran, " + notRun + " not run), expected " + EXPECTED); }
console.log((failed || !done ? "desk-own-ai: " + failed + " of " + asserted + " failed" : "desk-own-ai: all " + asserted + " passed" + (notRun ? ", " + notRun + " NOT RUN" : "")));
process.exit(Math.min(failed, 63));
