/* The stand-in's stub, and a static read of the Worker. fetch is answered for any class. Any other
 * stub method throws unless the bound class extends DurableObject. The static leg requires the same
 * of RelayTeam wherever the Worker calls one. Pass --worker and --team to judge those two files in
 * place of the product pair.
 *
 *     node tests/relay-stub.mjs
 *     node tests/relay-stub.mjs --worker <worker.mjs> --team <team.cjs>
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const S = require("../relay/test/stand-ins.cjs");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "relay-stub-"));
const EXPECTED = 6;
const PLAIN_RPC = "The receiving Durable Object does not support RPC, because its class was not declared with `extends DurableObject`. In order to enable RPC, make sure your class extends the special class `DurableObject`, which can be imported from the module \"cloudflare:workers\".";
const FETCH_LINE = "const res = await stub.fetch(internalRevokedRequest(text)); /* plant:revoked-fetch */";
const CALL_LINE = "const res = await stub.acceptRevocations(text); /* plant:revoked-fetch */";
const CLASS_LINE = "class RelayTeam {";

const argv = process.argv.slice(2);
let workerArg = null, teamArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--worker") workerArg = argv[++i];
  else if (argv[i] === "--team") teamArg = argv[++i];
  else { console.log("SUITE DID NOT COMPLETE: unknown argument " + argv[i]); process.exit(78); }
}
if ((workerArg == null) !== (teamArg == null)) {
  console.log("SUITE DID NOT COMPLETE: --worker and --team are a pair");
  process.exit(78);
}

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

function shaOf(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
const productWorker = path.join(ROOT, "relay", "worker.mjs");
const productTeam = path.join(ROOT, "relay", "team.cjs");
const before = { worker: shaOf(productWorker), team: shaOf(productTeam) };
function productSame() {
  return shaOf(productWorker) === before.worker && shaOf(productTeam) === before.team;
}

/* Comments and strings become spaces, so a call that is only written in one is not a call. */
function mask(text) {
  const out = text.split("");
  let i = 0, mode = null;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (mode === "line") {
      if (c === "\n") mode = null;
      else out[i] = " ";
      i++;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") { out[i] = out[i + 1] = " "; mode = null; i += 2; continue; }
      if (c !== "\n") out[i] = " ";
      i++;
      continue;
    }
    if (mode) {
      if (c === "\\") { out[i] = " "; if (n !== undefined) out[i + 1] = " "; i += 2; continue; }
      out[i] = " ";
      if (c === mode) mode = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/") { out[i] = out[i + 1] = " "; mode = "line"; i += 2; continue; }
    if (c === "/" && n === "*") { out[i] = out[i + 1] = " "; mode = "block"; i += 2; continue; }
    if (c === "'" || c === "\"" || c === "`") { out[i] = " "; mode = c; i++; continue; }
    i++;
  }
  return out.join("");
}

function skipCall(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function assignedName(code, dot) {
  let i = dot - 1;
  const skip = j => { while (j >= 0 && /\s/.test(code[j])) j--; return j; };
  i = skip(i);
  if (!/[A-Za-z0-9_$]/.test(code[i] || "")) return null;
  while (i >= 0 && /[A-Za-z0-9_$.]/.test(code[i])) i--;
  i = skip(i);
  if (code[i] !== "=" || code[i - 1] === "=") return null;
  i = skip(i - 1);
  const end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_$]/.test(code[i])) i--;
  const name = code.slice(i + 1, end);
  return /^[A-Za-z_$]/.test(name) ? name : null;
}

/* Stub calls other than fetch. A namespace is what the Worker assigns from env or from jurisdiction.
   A stub is what that namespace's get returns, or the call chained on that get. */
function stubCalls(source) {
  const code = mask(source);
  const namespaces = new Set();
  const direct = /\b([A-Za-z_$][\w$]*)\s*=\s*env\s*\.\s*[A-Za-z_$][\w$]*\s*(?:;|,|\n)/g;
  const juris = /\b([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*jurisdiction\s*\(/g;
  let m;
  while ((m = direct.exec(code))) namespaces.add(m[1]);
  while ((m = juris.exec(code))) namespaces.add(m[1]);
  const stubs = new Set();
  const methods = [];
  for (const ns of namespaces) {
    const re = new RegExp("\\b" + ns + "\\s*\\.\\s*get\\s*\\(", "g");
    while ((m = re.exec(code))) {
      const open = m.index + m[0].length - 1;
      const end = skipCall(code, open);
      if (end < 0) continue;
      let k = end + 1;
      while (code[k] === " " || code[k] === "\t" || code[k] === "\n" || code[k] === "\r") k++;
      if (code[k] === ".") {
        const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(k + 1));
        if (call && call[1] !== "fetch") methods.push(call[1]);
      } else {
        const name = assignedName(code, code.lastIndexOf(".", open));
        if (name) stubs.add(name);
      }
    }
  }
  for (const stub of stubs) {
    const re = new RegExp("\\b" + stub + "\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(", "g");
    while ((m = re.exec(code))) if (m[1] !== "fetch") methods.push(m[1]);
  }
  return [...new Set(methods)];
}

function extendsDurableObject(source) {
  return /class\s+RelayTeam\s+extends\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?DurableObject\b/.test(mask(source));
}

function judge(workerSource, teamSource) {
  const methods = stubCalls(workerSource);
  const base = extendsDurableObject(teamSource);
  return { ok: methods.length === 0 || base, methods, base };
}

function runtimeTeams(R) {
  const inner = R.env.TEAMS;
  return { jurisdiction(j) {
    const s = inner.jurisdiction(j);
    if (!s) return s;
    return { idFromName: name => s.idFromName(name), get: id => s.get(id) };
  } };
}

let copies = 0;
function copyOf(files) {
  const dir = path.join(WORK, "p" + (++copies));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const forwardTo = file => "module.exports = require(" + JSON.stringify(file) + ");\n";

function materialise(workerText, teamText) {
  const dir = copyOf({
    "relay/worker.mjs": workerText,
    "relay/team.cjs": teamText,
    "relay/core.cjs": forwardTo(path.join(ROOT, "relay", "core.cjs")),
    "shell/relay/blob.cjs": forwardTo(path.join(ROOT, "shell", "relay", "blob.cjs")),
  });
  return { dir, team: require(path.join(dir, "relay", "team.cjs")),
    url: pathToFileURL(path.join(dir, "relay", "worker.mjs")).href };
}

async function readJson(res) {
  const text = Buffer.from(await res.arrayBuffer()).toString("utf8");
  try { return JSON.parse(text); } catch { return null; }
}

async function drive(workerText, teamText, live) {
  const made = live ? null : materialise(workerText, teamText);
  const teamMod = made ? made.team : require(productTeam);
  const R = S.relayEnv({ team: teamMod, class: teamMod.RelayTeam });
  const scoped = R.env.TEAMS.jurisdiction("eu");
  const stub = scoped.get(scoped.idFromName("probe"));
  let rpc = null;
  try { await stub.acceptRevocations("x"); } catch (e) { rpc = e; }
  const mod = live ? await import(pathToFileURL(productWorker).href) : await import(made.url);
  const env = Object.assign({}, R.env, { TEAMS: runtimeTeams(R) });
  const res = await mod.default.fetch(new Request("https://relay.test/relay/v1/teams", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}", duplex: "half",
  }), env);
  return { rpc, status: res.status, json: await readJson(res), className: teamMod.RelayTeam && teamMod.RelayTeam.name };
}

const workerGiven = workerArg ? fs.readFileSync(workerArg, "utf8") : fs.readFileSync(productWorker, "utf8");
const teamGiven = teamArg ? fs.readFileSync(teamArg, "utf8") : fs.readFileSync(productTeam, "utf8");
const productWorkerText = fs.readFileSync(productWorker, "utf8");
const productTeamText = fs.readFileSync(productTeam, "utf8");

const plainR = S.relayEnv();
const plainScope = plainR.env.TEAMS.jurisdiction("eu");
const plainStub = plainScope.get(plainScope.idFromName("revoked"));
const plainNames = Object.getOwnPropertyNames(plainStub);
const plainType = typeof plainStub.acceptRevocations;
let plainErr = null;
try { await plainStub.acceptRevocations("x"); } catch (e) { plainErr = e; }
let plainFetch = null;
try {
  plainFetch = await plainStub.fetch(new Request("https://relay.test/etiuda/revoked", { method: "POST" }));
} catch (e) { plainFetch = e; }
const plainNamed = !!plainErr && plainErr.message.indexOf("Method \"acceptRevocations\", class \"RelayTeam\".") > -1;
check(plainErr instanceof TypeError && plainErr.message.indexOf(PLAIN_RPC) === 0 && plainNamed
  && plainType === "function" && plainNames.length === 1 && plainNames[0] === "fetch"
  && plainFetch && typeof plainFetch.status === "number",
  "985a a plain-class stub throws on acceptRevocations for class RelayTeam, names the method and the class, and answers fetch: "
  + plainType + " " + (plainErr && plainErr.name) + " " + (plainFetch && plainFetch.status) + " " + (plainErr && plainErr.message));

class Talker extends S.DurableObject {
  greet(who) { return "hello " + who; }
}
const talkR = S.relayEnv({ class: Talker });
const talkScope = talkR.env.TEAMS.jurisdiction("eu");
const talkStub = talkScope.get(talkScope.idFromName("one"));
let greeted = null, greetErr = null, missing = null, talkFetch = null;
try { greeted = await talkStub.greet("sam"); } catch (e) { greetErr = e; }
try { await talkStub.noSuchMethod("x"); } catch (e) { missing = e; }
try { talkFetch = await talkStub.fetch(new Request("https://relay.test/relay/v1/nope", { method: "GET" })); }
catch (e) { talkFetch = e; }
check(greeted === "hello sam" && !greetErr && missing instanceof TypeError
  && missing.message === "The RPC receiver does not implement the method \"noSuchMethod\"."
  && talkFetch && typeof talkFetch.status === "number",
  "985b a class extending the stand-in DurableObject answers an RPC call, fetch still answers, and a missing method throws the runtime sentence: "
  + greeted + " " + (greetErr && greetErr.message) + " missing " + (missing && missing.message) + " fetch " + (talkFetch && talkFetch.status));

let driven = null, driveErr = null;
try { driven = await drive(workerGiven, teamGiven, !workerArg); }
catch (e) { driveErr = e && e.stack ? e.stack : String(e); }
const drivenOk = !!driven && driven.status === 403 && !!driven.json && driven.json.error === "bad-signature"
  && driven.rpc instanceof TypeError && driven.rpc.message.indexOf(PLAIN_RPC) === 0
  && driven.rpc.message.indexOf("Method \"acceptRevocations\", class \"" + driven.className + "\".") > -1;
check(drivenOk && !driveErr,
  "985c the Worker over a namespace with no list method is refused bad-signature, and the stub's acceptRevocations throws for class "
  + (driven && driven.className) + ": " + (driven ? driven.status + " " + (driven.json && driven.json.error) + " " + (driven.rpc && driven.rpc.message) : driveErr));

const judged = judge(workerGiven, teamGiven);
const commentSample = "let teams = env.TEAMS;\nconst stub = teams.get(teams.idFromName(\"a\")); /* stub.ping() */\nconst s = \"stub.ping()\";\n";
const callSample = commentSample + "stub.ping();\n";
const chainSample = "let teams = env.TEAMS;\nteams = env.TEAMS.jurisdiction(\"eu\");\nteams.get(teams.idFromName(\"a\")).ping();\n";
const controls = stubCalls(commentSample).length === 0 && stubCalls(callSample).join() === "ping" && stubCalls(chainSample).join() === "ping"
  && !extendsDurableObject("/* class RelayTeam extends DurableObject {} */\nclass RelayTeam {\n")
  && extendsDurableObject("class RelayTeam extends DurableObject {\n")
  && extendsDurableObject("class RelayTeam extends workers.DurableObject {\n");
check(judged.ok && judged.methods.length === 0 && controls,
  "985d every stub method other than fetch requires RelayTeam to extend DurableObject, and the product calls none: "
  + (judged.methods.join(",") || "none") + " extends " + judged.base + " controls " + controls);

const plantedWorker = productWorkerText.indexOf(FETCH_LINE) > -1 ? productWorkerText.replace(FETCH_LINE, CALL_LINE) : null;
let plantDrive = null, plantErr = null;
if (plantedWorker && plantedWorker.indexOf(CALL_LINE) > -1 && plantedWorker.indexOf(FETCH_LINE) < 0) {
  try { plantDrive = await drive(plantedWorker, productTeamText, false); }
  catch (e) { plantErr = e && e.message ? e.message : String(e); }
}
const plantFault = !!plantDrive && plantDrive.status === 500 && !!plantDrive.json && plantDrive.json.error === "fault";
check(!!plantedWorker && plantFault && productSame() && !plantErr,
  "985e a planted acceptRevocations call on the stub faults the request, and the product files are unchanged: "
  + (plantDrive ? plantDrive.status + " " + (plantDrive.json && plantDrive.json.error) : (plantErr || "anchor absent"))
  + " sha " + (productSame() ? "same" : "CHANGED"));

const plantedTeamPlain = productTeamText;
const plantedTeamBase = productTeamText.split(CLASS_LINE).length === 2
  ? productTeamText.replace(CLASS_LINE, "class RelayTeam extends DurableObject {") : null;
const plantedTeamOther = productTeamText.split(CLASS_LINE).length === 2
  ? productTeamText.replace(CLASS_LINE, "class RelayTeam extends Other {") : null;
const plainJudge = plantedWorker ? judge(plantedWorker, plantedTeamPlain) : { ok: true, methods: [], base: false };
const baseJudge = plantedWorker && plantedTeamBase ? judge(plantedWorker, plantedTeamBase) : { ok: false, methods: [], base: false };
const otherJudge = plantedWorker && plantedTeamOther ? judge(plantedWorker, plantedTeamOther) : { ok: true, methods: [], base: false };
check(!!plantedWorker && !!plantedTeamBase && !plainJudge.ok && plainJudge.methods.indexOf("acceptRevocations") > -1 && !plainJudge.base
  && baseJudge.ok && baseJudge.base && !otherJudge.ok && !otherJudge.base && productSame(),
  "985f the same planted call is red while RelayTeam is a plain class or extends another name, and green when it extends DurableObject: "
  + "plain " + plainJudge.methods.join(",") + "/" + plainJudge.base
  + " base " + baseJudge.methods.join(",") + "/" + baseJudge.base
  + " other " + otherJudge.methods.join(",") + "/" + otherJudge.base
  + " sha " + (productSame() ? "same" : "CHANGED"));

try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
