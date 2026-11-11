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
 *   da5 deskAiConfig is null while the option is off or incomplete, a key stays with its address unless Settings moves it,
 *       and the connection test hands the door the fixed prompt and the config's five fields alone
 * THE PAGE'S PART runs the built engine in headless Chrome, beside a stand-in host that answers as the shell would:
 *   db1 the row's two states, built-in alone and the organisation's with its fields, the address only where the service
 *       has none of its own
 *   db2 set by policy, the row shows the choice, the host and "Set by the organisation", and takes no change
 *   db3 the mark beside the search box is there only while the organisation's model ranks, its words shed under 720 px with
 *       its sentence kept in its title, says when the shell has paused its asks, and is absent while both switches are off
 *   db4 the sentences that say nothing leaves this computer are drawn only while the built-in model ranks, in both languages
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

let failed = 0, asserted = 0;
function check(ok, line, detail) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line + (detail === undefined ? "" : ": " + JSON.stringify(detail))); }
}

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
const POLICY = ["const POLICY_KEY =", "const POLICY_LEAD_RE =", "const POLICY_HEAD =", "const POLICY_EXPORT_LINE =",
  "function policyValues(", "function policyExpand(", "function policyRegSz(", "function policyFolderOk(", "function policyLeadOk(",
  "function policyNoUpdate(", "function joinPolicyFacts("];
const DESK_AI = ["const DESK_AI_FILE =", "const DESK_AI_KEY_FILE =", "const DESK_AI_KIND =", "const DESK_AI_KEY_KIND =",
  "const DESK_AI_SERVICES =", "const DESK_AI_MODEL_MAX =", "const DESK_AI_KEY_MAX =", "const DESK_AI_CONTROL_RE =",
  "const DESK_AI_TEST_PROMPT =", "function deskAiService(", "function deskAiEndpointShape(", "function deskAiPolicyFrom(",
  "function deskAiJoin(", "function deskAiReadyOf(", "function deskAiAnswer(", "function deskAiRefusal(", "function deskAiPath(",
  "function deskAiPerson(", "function deskAiKeyInner(", "function deskAiKeyFor(", "function deskAiPolicy(", "function deskAiNow(",
  "function deskAiConfig(", "function deskAiSettings(", "function deskAiSave(", "function deskAiTest("];
const NAMES = ["policyValues", "joinPolicyFacts", "deskAiPolicyFrom", "deskAiJoin", "deskAiConfig", "deskAiSettings", "deskAiSave",
  "deskAiTest", "DESK_AI_TEST_PROMPT", "DESK_AI_FILE", "DESK_AI_KEY_FILE"];

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
  const body = POLICY.concat(DESK_AI).map(m => sliceDecl(SRC, m)).join("\n");
  const policyRead = { values: null };
  const params = ["path", "app", "fs", "safeStorage", "Buffer", "branchSealable", "writeReplacing", "readJoinPolicy", "joinPolicyRead",
    "deskAiProbe", "process"];
  const S = new Function(...params, body + "\nreturn { " + NAMES.join(", ") + " };")(
    path, { getPath: () => dir }, fs, SEAL, Buffer, () => o.sealable !== false, (f, text) => fs.writeFileSync(f, text, "utf8"),
    () => ({}), policyRead, (config, prompt) => { asked.push({ config: config, prompt: prompt }); return Promise.resolve({ ok: true }); },
    { env: {} });
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
    if (S.deskAiConfig() !== null) problems.push("an edited file moved the key with the address");
    S.deskAiSave({ endpoint: "https://gateway.example/v1/chat/completions" });
    const moved = S.deskAiConfig();
    if (!moved || moved.key !== KEY_PERSON || moved.endpoint !== "https://gateway.example/v1/") problems.push("Settings' own move " + JSON.stringify(moved && moved.endpoint));
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
        || !t.ok || t.host !== "gateway.example") problems.push("test " + JSON.stringify([S.asked.length, a.prompt, t]));
    const tn = await none.deskAiTest();
    if (tn.ok || tn.why !== "key" || none.asked.length) problems.push("a test with no key asked " + none.asked.length);
  }
  check(!problems.length, "da5 deskAiConfig is null while off or incomplete; a key stays with its address unless Settings moves it; the test hands "
    + "the door the fixed prompt and five fields alone: " + (problems.join("; ") || "nine states, two tests"));
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
    try { for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eUiLang", lang]]) localStorage.setItem(k, v); } catch (e) {}
    window.__ai = { settings: first, saves: [], listeners: [] };
    window.E_HOST = {
      platform: "win32", catalogFolder: "", catalogFile: "", catalogIn: "", catalogBuiltIn: false,
      catalogFiles: () => Promise.resolve([]), onCatalogFile: () => {}, onCatalogListing: () => {},
      aiState: () => ({ model: true }), setAi: () => {}, setSearchAi: () => {},
      searchPrepare: () => Promise.resolve({ ready: false, skipped: true }), searchRank: () => Promise.resolve(null),
      deskAiSettings: () => JSON.parse(JSON.stringify(window.__ai.settings)),
      deskAiSave: f => {
        window.__ai.saves.push(f);
        const s = window.__ai.settings;
        if (Object.keys(f).some(k => s.managed[k])) return Promise.resolve({ ok: false, why: "managed", settings: s });
        if (f.choice) Object.assign(s, { choice: f.choice, on: f.choice === "organisation" });
        if (f.provider) s.provider = f.provider;
        return Promise.resolve({ ok: true, why: "", settings: s });
      },
      deskAiTest: () => Promise.resolve({ ok: true, why: "", host: "api.openai.com", model: "m-own" }),
      onAiRanking: fn => window.__ai.listeners.push(fn),
    };
  }, BUILTIN, lang || "en");
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
    check(!problems.length, "db1 the row's two states: built-in alone, the organisation's with service, model, key and the test, the address only where "
      + "the service has none of its own: " + (problems.join("; ") || "three states"));
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
    await page.evaluate(() => { localStorage.setItem("eAiOff", "1"); localStorage.setItem("eSearchAiOff", "1"); });
    await ranked(page);
    if ((await markNow(page)).there) problems.push("there with both switches off, when nothing is sent");
    await page.evaluate(() => { localStorage.removeItem("eAiOff"); localStorage.removeItem("eSearchAiOff"); });
    await ranked(page);
    if (!(await markNow(page)).there) problems.push("not back with the switches on");
    check(!problems.length, "db3 the mark is there only while the organisation's model ranks, an icon alone at 700 px with its sentence kept, and says "
      + "when the asks are paused, and is absent while both switches are off: " + (problems.join("; ") || "nine states"));
  }

  /* db4 */
  {
    const problems = [];
    const NOTHING = { en: "nothing leaves this computer", pl: "nic nie opuszcza tego komputera" };
    for (const lang of ["en", "pl"]) {
      await page.evaluate(l => { localStorage.setItem("eUiLang", l); try { setUiLang(l); } catch (e) {} }, lang);
      await setHost(page, BUILTIN);
      await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
      const builtin = await bodyText(page);
      const nb = builtin.split(NOTHING[lang]).length - 1;
      if (nb !== 2) problems.push(lang + " built-in drew " + nb);
      await setHost(page, ORG_ON);
      await closeTab(); await page.evaluate(() => openSettings("ai")); await sleep(150);
      const org = await bodyText(page);
      const no = org.split(NOTHING[lang]).length - 1;
      if (no !== 0 || org.split("api.openai.com").length - 1 < 2) problems.push(lang + " organisation drew " + no);
    }
    await page.evaluate(() => { localStorage.setItem("eUiLang", "en"); try { setUiLang("en"); } catch (e) {} });
    check(!problems.length, "db4 the two sentences saying nothing leaves this computer are drawn only while the built-in model ranks, each replaced by "
      + "where the text goes while the organisation's does, in English and Polish: " + (problems.join("; ") || "four screens"));
  }
  await page.close();
} catch (e) {
  check(false, "the page's part ran", (e && e.message) || String(e));
} finally {
  if (browser) await browser.close();
}

const EXPECTED = 9;
if (asserted !== EXPECTED) { failed++; asserted++; console.log("  FAIL ran " + asserted + " checks, expected " + EXPECTED); }
console.log((failed ? "desk-own-ai: " + failed + " of " + asserted + " failed" : "desk-own-ai: all " + asserted + " passed"));
process.exit(Math.min(failed, 63));
