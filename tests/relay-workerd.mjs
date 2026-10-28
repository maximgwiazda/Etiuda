/* The relay Worker and its RelayTeam object, booted in workerd through miniflare, from the staging
 * block of relay/wrangler.toml: the same bindings, prefix, compatibility date and flags, with storage
 * and R2 held in memory. An empty create is refused, a create and a hello under the test root succeed,
 * a revoked service key is refused, and workerd's scheduler sweeps an unpaid trial team while
 * preserving a paid team. Planted runs prove stub faults, DROP TABLE removal, sweep wipe omission,
 * and early paid sweep. --worker and --team run the same requests against those two files.
 *
 *     node tests/relay-workerd.mjs
 *     node tests/relay-workerd.mjs --worker <worker.mjs> --team <team.cjs>
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Miniflare, supportedCompatibilityDate } from "miniflare";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const kit = require("../relay/test/grant-kit.cjs");
const core = require("../relay/core.cjs");
const B = require("../shell/relay/blob.cjs");

const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FAULT_SAID = "The relay could not answer that.";
const WATCHED = ["relay/worker.mjs", "relay/team.cjs", "relay/core.cjs", "relay/wrangler.toml"];
const FETCH_LINE = "const res = await stub.fetch(internalRevokedRequest(text)); /* plant:revoked-fetch */";
const DECISION_LINE = "return decisionOf(res);";
const PLANT_LINE = "if (stub && typeof stub.acceptRevocations === \"function\") return await stub.acceptRevocations(text);";

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
const planted = workerArg == null;
const EXPECTED = planted ? 12 : 7;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

function shaOf(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
const atStart = WATCHED.map(rel => ({ rel, sha: shaOf(path.join(ROOT, rel)) }));
function bytesSame() {
  return atStart.every(w => shaOf(path.join(ROOT, w.rel)) === w.sha);
}

function keyPair() {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { keyId: pub, pub, privateKey: p.privateKey };
}
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

function metaOf(blob) {
  return {
    v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId,
    counter: blob.counter, del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place,
  };
}

/* The revocation document the Worker accepts, signed by the test root over the delegated key. */
function revokedText() {
  const doc = { kind: "etiuda-revocations", format: 1, serial: 1, keys: [kit.DELEGATE.pub].slice().sort(),
    sig: { alg: "ed25519", keyId: kit.ROOT.id, value: "" } };
  doc.sig.value = signHex(kit.ROOT, core.revocationBytes(doc));
  return JSON.stringify(doc);
}

function stripComment(line) {
  let out = "", quote = false, esc = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") quote = false;
      continue;
    }
    if (c === "\"") { quote = true; out += c; continue; }
    if (c === "#") break;
    out += c;
  }
  return out.trim();
}

function skipWs(s, i) {
  while (s[i] === " " || s[i] === "\t") i++;
  return i;
}

function readString(s, i) {
  if (s[i] !== "\"") throw new Error("toml string");
  let out = "";
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === "\\" || n === "\"") out += n;
      else throw new Error("toml escape");
      i += 2;
      continue;
    }
    if (c === "\"") return { value: out, next: i + 1 };
    out += c;
    i++;
  }
  throw new Error("toml string did not end");
}

function readValue(s, i) {
  i = skipWs(s, i);
  const c = s[i];
  if (c === "\"") return readString(s, i);
  if (c === "[") return readArray(s, i);
  if (c === "{") return readInline(s, i);
  if (s.startsWith("true", i) && !/[A-Za-z0-9_]/.test(s[i + 4] || "")) return { value: true, next: i + 4 };
  if (s.startsWith("false", i) && !/[A-Za-z0-9_]/.test(s[i + 5] || "")) return { value: false, next: i + 5 };
  const num = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
  if (num) return { value: Number(num[0]), next: i + num[0].length };
  throw new Error("toml value " + JSON.stringify(s.slice(i, i + 40)));
}

function readArray(s, i) {
  const out = [];
  i = skipWs(s, i + 1);
  if (s[i] === "]") return { value: out, next: i + 1 };
  for (;;) {
    const item = readValue(s, i);
    out.push(item.value);
    i = skipWs(s, item.next);
    if (s[i] === ",") { i = skipWs(s, i + 1); if (s[i] === "]") return { value: out, next: i + 1 }; continue; }
    if (s[i] === "]") return { value: out, next: i + 1 };
    throw new Error("toml array");
  }
}

function readKey(s, i) {
  i = skipWs(s, i);
  const m = /^[A-Za-z0-9_-]+/.exec(s.slice(i));
  if (!m) throw new Error("toml key");
  return { key: m[0], next: i + m[0].length };
}

function readInline(s, i) {
  const out = {};
  i = skipWs(s, i + 1);
  if (s[i] === "}") return { value: out, next: i + 1 };
  for (;;) {
    const k = readKey(s, i);
    i = skipWs(s, k.next);
    if (s[i] !== "=") throw new Error("toml inline");
    const item = readValue(s, i + 1);
    out[k.key] = item.value;
    i = skipWs(s, item.next);
    if (s[i] === ",") { i = skipWs(s, i + 1); if (s[i] === "}") return { value: out, next: i + 1 }; continue; }
    if (s[i] === "}") return { value: out, next: i + 1 };
    throw new Error("toml inline");
  }
}

function parseValue(text) {
  const read = readValue(text, 0);
  if (text.slice(read.next).trim() !== "") throw new Error("toml trailing " + JSON.stringify(text.slice(read.next)));
  return read.value;
}

/* Comments, strings, arrays, inline tables, tables and arrays of tables. A line this cannot read throws. */
function parseToml(text) {
  const root = {};
  let current = root;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = stripComment(lines[n]);
    if (line === "") continue;
    const arrayHeader = /^\[\[([A-Za-z0-9_.-]+)\]\]$/.exec(line);
    const tableHeader = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (arrayHeader || tableHeader) {
      const parts = (arrayHeader || tableHeader)[1].split(".");
      let cursor = root;
      for (let p = 0; p < parts.length - 1; p++) {
        const part = parts[p];
        if (cursor[part] === undefined) cursor[part] = {};
        const next = cursor[part];
        if (Array.isArray(next)) cursor = next[next.length - 1];
        else if (next && typeof next === "object") cursor = next;
        else throw new Error("toml table " + line);
      }
      const last = parts[parts.length - 1];
      if (arrayHeader) {
        if (cursor[last] === undefined) cursor[last] = [];
        if (!Array.isArray(cursor[last])) throw new Error("toml array table " + line);
        const made = {};
        cursor[last].push(made);
        current = made;
      } else {
        if (cursor[last] === undefined) cursor[last] = {};
        if (!cursor[last] || typeof cursor[last] !== "object" || Array.isArray(cursor[last])) throw new Error("toml table " + line);
        current = cursor[last];
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) throw new Error("toml line " + (n + 1) + ": " + line);
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("toml key " + key);
    current[key] = parseValue(line.slice(eq + 1).trim());
  }
  return root;
}

/* The staging date and flags, or the top block's where staging sets none. Bindings come from staging alone. */
function stagingOf(doc) {
  const staging = doc.env && doc.env.staging;
  if (!staging || typeof staging !== "object" || Array.isArray(staging)) throw new Error("no [env.staging]");
  const date = staging.compatibility_date !== undefined ? staging.compatibility_date : doc.compatibility_date;
  const flags = staging.compatibility_flags !== undefined ? staging.compatibility_flags : doc.compatibility_flags;
  const vars = staging.vars && typeof staging.vars === "object" && !Array.isArray(staging.vars) ? staging.vars : {};
  const bindings = staging.durable_objects && Array.isArray(staging.durable_objects.bindings) ? staging.durable_objects.bindings : [];
  const migrations = Array.isArray(staging.migrations) ? staging.migrations : [];
  const buckets = Array.isArray(staging.r2_buckets) ? staging.r2_buckets : [];
  return { date, flags, vars, bindings, migrations, buckets };
}

/* Every file the entry reaches is copied into the scratch folder, which is also workerd's modulesRoot, so no import
   climbs out of it wherever the checkout and the temp folder sit (the test architect's E1, 2026-10-27). Each import
   made is kept, and 984f fails on one that climbs. */
const imports = [];
function relImport(fromDir, absTarget) {
  let rel = path.relative(fromDir, absTarget).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  imports.push(rel);
  return rel;
}

/* The leg entry. The test root is lent where production passes none, the same seam as the in-process legs.
   This workerd binary has no jurisdiction, so the leg answers that call as the stand-in does.
   SubRelayTeam re-exports RelayTeam with test routes /__test/age and /__test/state to inspect SQLite state
   and trigger workerd's scheduler alarm without modifying deployed files. */
function entrySource(coreImport, workerImport, pub, bindingName, jurisdiction) {
  return [
    "import core from " + JSON.stringify(coreImport) + ";",
    "import { routeWith, RelayTeam } from " + JSON.stringify(workerImport) + ";",
    "const roots = [" + JSON.stringify(pub) + "];",
    "const make = core.createCore;",
    "core.createCore = function (deps) {",
    "  if (deps && deps.roots !== undefined) return make(deps);",
    "  return make(Object.assign({}, deps, { roots: roots }));",
    "};",
    "core.ROOT_PUB = roots[0];",
    "const worker = routeWith(roots);",
    "const bindingName = " + JSON.stringify(bindingName) + ";",
    "const jurisdiction = " + JSON.stringify(jurisdiction) + ";",
    "",
    "export class SubRelayTeam extends RelayTeam {",
    "  constructor(ctx, env) {",
    "    super(ctx, env);",
    "    this.storage = ctx.storage;",
    "  }",
    "  async fetch(request) {",
    "    const url = new URL(request.url);",
    "    if (request.method === 'POST' && url.pathname === '/__test/age') {",
    "      const body = await request.json();",
    "      const row = this.storage.sql.exec(\"SELECT v FROM kv WHERE k = 'team'\").toArray()[0];",
    "      if (row) {",
    "        const team = JSON.parse(row.v);",
    "        Object.assign(team, body);",
    "        if (body.paid === false) {",
    "          team.paid = false;",
    "          delete team.paidUntil;",
    "        }",
    "        this.storage.sql.exec(\"UPDATE kv SET v = ? WHERE k = 'team'\", JSON.stringify(team));",
    "      }",
    "      await this.storage.setAlarm(Date.now());",
    "      return new Response(JSON.stringify({ ok: true, armed: await this.storage.getAlarm() }));",
    "    }",
    "    if (request.method === 'GET' && url.pathname === '/__test/state') {",
    "      const tables = this.storage.sql.exec(\"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv'\").toArray();",
    "      const hasTable = tables.length > 0;",
    "      const rows = hasTable ? this.storage.sql.exec('SELECT k FROM kv').toArray().map(r => r.k) : [];",
    "      const swept = rows.length === 1 && rows[0] === 'swept';",
    "      const hasTeam = rows.indexOf('team') > -1;",
    "      return new Response(JSON.stringify({",
    "        /* kv is true where the kv table holds the team's data: the sweep's wipe drops the table, then finish() writes \"swept\", which makes it again holding that one mark, so a swept team reads kv false, master true, swept true */",
    "        kv: hasTable && !swept,",
    "        master: hasTable,",
    "        swept,",
    "        team: hasTeam,",
    "        rows,",
    "        alarm: await this.storage.getAlarm(),",
    "      }));",
    "    }",
    "    return super.fetch(request);",
    "  }",
    "}",
    "",
    "function teamsOf(real) {",
    "  return { jurisdiction(j) { return j === jurisdiction ? real : null; } };",
    "}",
    "export { SubRelayTeam as RelayTeam };",
    "export default {",
    "  async fetch(request, env) {",
    "    const next = new Proxy(env, {",
    "      get(target, prop) {",
    "        if (prop === bindingName) return teamsOf(target[prop]);",
    "        const value = target[prop];",
    "        return typeof value === 'function' ? value.bind(target) : value;",
    "      },",
    "    });",
    "    return worker.fetch(request, next);",
    "  },",
    "};",
    "",
  ].join("\n");
}

function plantText(workerText, teamImport, coreImport) {
  const pair = FETCH_LINE + "\n      " + DECISION_LINE;
  if (workerText.indexOf(pair) < 0) return null;
  if (workerText.indexOf("import team from \"./team.cjs\";") < 0) return null;
  if (workerText.indexOf("import core from \"./core.cjs\";") < 0) return null;
  return workerText
    .replace("import team from \"./team.cjs\";", "import team from " + JSON.stringify(teamImport) + ";")
    .replace("import core from \"./core.cjs\";", "import core from " + JSON.stringify(coreImport) + ";")
    .replace(pair, PLANT_LINE);
}

async function post(mf, urlPath, jsonText) {
  const res = await mf.dispatchFetch("https://relay.invalid" + urlPath, { method: "POST", body: jsonText, duplex: "half" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json };
}

/* One ping on the session's socket. The scratch team closes from its message handler with reason woke, so a pong
   with the socket still open is the runtime's auto response and a close of woke is the handler having run. */
async function pingOnce(mf, urlPath, token) {
  const res = await mf.dispatchFetch("https://relay.invalid" + urlPath, {
    headers: { Upgrade: "websocket", Authorization: "Bearer " + token },
  });
  const ws = res.webSocket;
  if (!ws) return { status: res.status, got: [], closed: null, error: "no-socket" };
  ws.accept();
  const got = [];
  let closed = null;
  const done = new Promise(resolve => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    ws.addEventListener("message", ev => { got.push(String(ev.data)); finish(); });
    ws.addEventListener("close", ev => { closed = { code: ev.code, reason: String(ev.reason || "") }; finish(); });
    setTimeout(finish, 500);
  });
  ws.send('{"type":"ping"}');
  await done;
  try { ws.close(1000, ""); } catch { /* already closed */ }
  return { status: res.status, got, closed };
}

function isRefusal(r, reason) {
  return !!r && r.status === 403 && !!r.json && r.json.error === reason && r.json.said === B.REASONS[reason]
    && Object.keys(r.json).sort().join() === "error,said";
}

async function scene(mf, prefix, r2Name) {
  const bucket = await mf.getR2Bucket(r2Name);
  const listed = await bucket.list();
  const empty = await post(mf, prefix + "teams", "{}");
  const now = Date.now();
  const lead = keyPair();
  const rt = crypto.randomBytes(16).toString("hex");
  const created = await post(mf, prefix + "teams", JSON.stringify(kit.createBody(rt, lead, now, bytes => signHex(lead, bytes))));
  const hello = await post(mf, prefix + "t/" + rt + "/hello", "{}");
  let session = null;
  if (hello.json && typeof hello.json.challenge === "string") {
    const sig = signHex(lead, core.helloBytes(rt, hello.json.challenge, lead.keyId));
    session = await post(mf, prefix + "t/" + rt + "/session", JSON.stringify({
      challenge: hello.json.challenge, key: lead.keyId, pub: lead.pub, sig }));
  }
  let ping = null;
  if (session && session.json && typeof session.json.session === "string") {
    ping = await pingOnce(mf, prefix + "t/" + rt + "/socket", session.json.session);
  }
  const other = keyPair();
  const rt2 = crypto.randomBytes(16).toString("hex");
  const delegated = await post(mf, prefix + "teams", JSON.stringify(kit.createBody(rt2, other, now, bytes => signHex(other, bytes),
    { grant: kit.delegatedGrantFor(other.pub, now) })));
  return { listed, empty, created, hello, session, delegated, rt, ping };
}

async function sweepScene(mf, prefix, r2Name, bindingName) {
  const bucket = await mf.getR2Bucket(r2Name);
  const now = Date.now();

  // 1. Team T: unpaid trial
  const leadT = keyPair();
  const rtT = crypto.randomBytes(16).toString("hex");
  const createBodyT = kit.createBody(rtT, leadT, now, bytes => signHex(leadT, bytes), {
    grantOpts: { fields: { paid: false, until: now + 14 * 24 * 60 * 60 * 1000 } },
  });
  const resCreateT = await post(mf, prefix + "teams", JSON.stringify(createBodyT));

  const helloT = await post(mf, prefix + "t/" + rtT + "/hello", "{}");
  let sessionT = null;
  if (helloT.json && typeof helloT.json.challenge === "string") {
    const sigT = signHex(leadT, core.helloBytes(rtT, helloT.json.challenge, leadT.keyId));
    sessionT = await post(mf, prefix + "t/" + rtT + "/session", JSON.stringify({ challenge: helloT.json.challenge, key: leadT.keyId, sig: sigT }));
  }

  const blobT = B.seal({
    relayTeamId: rtT, epoch: 1, teamKey: crypto.randomBytes(32),
    writer: { keyId: leadT.keyId, privateKey: leadT.privateKey },
    path: "doc-t.txt", body: "trial blob", counter: 1, place: "root", kind: "file",
  });
  const putResT = await mf.dispatchFetch("https://relay.invalid" + prefix + "t/" + rtT + "/b/" + blobT.id, {
    method: "PUT",
    headers: {
      authorization: "Bearer " + (sessionT && sessionT.json ? sessionT.json.session : ""),
      "etiuda-blob": Buffer.from(JSON.stringify(metaOf(blobT))).toString("base64url"),
    },
    body: blobT.ciphertext, duplex: "half",
  });

  // 2. Team P: paid
  const leadP = keyPair();
  const rtP = crypto.randomBytes(16).toString("hex");
  const createBodyP = kit.createBody(rtP, leadP, now, bytes => signHex(leadP, bytes), {
    grantOpts: { fields: { paid: true, until: now + 30 * 24 * 60 * 60 * 1000 } },
  });
  const resCreateP = await post(mf, prefix + "teams", JSON.stringify(createBodyP));

  const helloP = await post(mf, prefix + "t/" + rtP + "/hello", "{}");
  let sessionP = null;
  if (helloP.json && typeof helloP.json.challenge === "string") {
    const sigP = signHex(leadP, core.helloBytes(rtP, helloP.json.challenge, leadP.keyId));
    sessionP = await post(mf, prefix + "t/" + rtP + "/session", JSON.stringify({ challenge: helloP.json.challenge, key: leadP.keyId, sig: sigP }));
  }

  const blobP = B.seal({
    relayTeamId: rtP, epoch: 1, teamKey: crypto.randomBytes(32),
    writer: { keyId: leadP.keyId, privateKey: leadP.privateKey },
    path: "doc-p.txt", body: "paid blob", counter: 1, place: "root", kind: "file",
  });
  const putResP = await mf.dispatchFetch("https://relay.invalid" + prefix + "t/" + rtP + "/b/" + blobP.id, {
    method: "PUT",
    headers: {
      authorization: "Bearer " + (sessionP && sessionP.json ? sessionP.json.session : ""),
      "etiuda-blob": Buffer.from(JSON.stringify(metaOf(blobP))).toString("base64url"),
    },
    body: blobP.ciphertext, duplex: "half",
  });

  const listBefore = await bucket.list();
  const r2TBefore = listBefore.objects.filter(o => o.key.startsWith(rtT + "/"));
  const r2PBefore = listBefore.objects.filter(o => o.key.startsWith(rtP + "/"));

  // Stubs for aging and state inspection
  const ns = await mf.getDurableObjectNamespace(bindingName);
  const stubT = ns.get(ns.idFromName(rtT));
  const stubP = ns.get(ns.idFromName(rtP));

  // Age T beyond until + TRIAL_KEEP_MS (31 days ago)
  await stubT.fetch("https://do/__test/age", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ until: now - 31 * 24 * 60 * 60 * 1000, paid: false }),
  });

  // Age P into first 30 days after end (5 days ago)
  await stubP.fetch("https://do/__test/age", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ until: now - 5 * 24 * 60 * 60 * 1000, paid: true }),
  });

  // Wait for workerd scheduler to fire T's alarm (poll up to 10s)
  let stateT = null;
  const startPoll = Date.now();
  while (Date.now() - startPoll < 10000) {
    await new Promise(r => setTimeout(r, 50));
    const res = await stubT.fetch("https://do/__test/state");
    stateT = await res.json();
    if (stateT.swept || (stateT.alarm === null && (await bucket.list()).objects.filter(o => o.key.startsWith(rtT + "/")).length === 0)) break;
  }

  // Poll P state: wait until P's alarm has rung or swept
  let stateP = null;
  const startPollP = Date.now();
  while (Date.now() - startPollP < 5000) {
    await new Promise(r => setTimeout(r, 50));
    stateP = await (await stubP.fetch("https://do/__test/state")).json();
    if (stateP.swept || (stateP.alarm && stateP.alarm > Date.now() + 1000000)) break;
  }

  const listAfter = await bucket.list();
  const r2TAfter = listAfter.objects.filter(o => o.key.startsWith(rtT + "/"));
  const r2PAfter = listAfter.objects.filter(o => o.key.startsWith(rtP + "/"));

  // Check session on P still opens
  const helloP2 = await post(mf, prefix + "t/" + rtP + "/hello", "{}");
  let sessionP2 = null;
  if (helloP2.json && typeof helloP2.json.challenge === "string") {
    const sigP2 = signHex(leadP, core.helloBytes(rtP, helloP2.json.challenge, leadP.keyId));
    sessionP2 = await post(mf, prefix + "t/" + rtP + "/session", JSON.stringify({ challenge: helloP2.json.challenge, key: leadP.keyId, sig: sigP2 }));
  }

  return {
    putT: putResT.status, r2TBefore: r2TBefore.length,
    putP: putResP.status, r2PBefore: r2PBefore.length,
    stateT, r2TAfter: r2TAfter.length,
    stateP, r2PAfter: r2PAfter.length,
    sessionP2: sessionP2 && sessionP2.status === 200,
  };
}

async function boot(scratch, scriptPath, cfg, bindings) {
  const durableObjects = {};
  for (const row of cfg.bindings) {
    const sqlite = cfg.migrations.some(m => Array.isArray(m.new_sqlite_classes) && m.new_sqlite_classes.indexOf(row.class_name) > -1);
    durableObjects[row.name] = { className: row.class_name, useSQLite: sqlite };
  }
  return new Miniflare({
    scriptPath,
    modules: true,
    modulesRoot: scratch,
    compatibilityDate: cfg.date,
    compatibilityFlags: cfg.flags,
    bindings,
    durableObjects,
    durableObjectsPersist: false,
    r2Buckets: cfg.buckets.map(row => row.binding),
    r2Persist: false,
  });
}

function brief(r) {
  if (!r) return "none";
  return r.status + " " + (r.json && (r.json.error || r.json.rt || "ok"));
}

/* The package export is the workerd package's own date, which can be earlier than a date the binary
   still runs. The binary refuses a later date by naming it, so the leg boots the file's date. */
let runtimeRefusal = "";
process.on("unhandledRejection", err => {
  runtimeRefusal = err && err.stack ? err.stack : String(err);
  console.log("# unhandled " + runtimeRefusal.split("\n")[0]);
});

const started = Date.now();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "relay-workerd-mf-"));
console.log("# scratch " + scratch);
console.log("# mode " + (planted ? "product" : "worker"));

let sceneResult = null, sceneError = "", sweepResult = null;
let plantResult = null, plantNote = "", plantPing = null, plantPingNote = "", booted = false;
let sweepPlant1Result = null, sweepPlant1Restored = false, plant1Turned = false;
let sweepPlant2Result = null, sweepPlant2Restored = false, plant2Turned = false;
let sweepPlant3Result = null, sweepPlant3Restored = false, plant3Turned = false;
let dateRan = "", flagsNote = "", prefixNote = "", classNote = "", bindingNote = "", r2Note = "";

try {
  if (!/^[0-9a-f]{64}$/.test(kit.ROOT.pub)) throw new Error("test root shape");
  const doc = parseToml(fs.readFileSync(path.join(ROOT, "relay", "wrangler.toml"), "utf8"));
  const cfg = stagingOf(doc);
  dateRan = typeof cfg.date === "string" ? cfg.date : "";
  flagsNote = JSON.stringify(cfg.flags);
  const workerPath = workerArg ? path.resolve(workerArg) : path.join(ROOT, "relay", "worker.mjs");
  const teamPath = teamArg ? path.resolve(teamArg) : path.join(ROOT, "relay", "team.cjs");
  const workerText = fs.readFileSync(workerPath, "utf8");
  const teamText = fs.readFileSync(teamPath, "utf8");
  const exportName = (/export const ([A-Za-z0-9_]+) = team\.RelayTeam/.exec(workerText) || [])[1] || "";
  const juris = /env\.([A-Za-z0-9_]+)\.jurisdiction\("([a-z]+)"\)/.exec(workerText) || [];
  const bindingName = juris[1] || "";
  const jurisdiction = juris[2] || "";
  const r2Name = (/r2:\s*env\.([A-Za-z0-9_]+)/.exec(teamText) || [])[1] || "";
  const binding = cfg.bindings.find(row => row && row.name === bindingName);
  classNote = exportName + "/" + (binding && binding.class_name);
  bindingNote = bindingName;
  r2Note = r2Name + "/" + cfg.buckets.map(row => row.binding).join(",");
  const prefix = typeof cfg.vars.API_PREFIX === "string" ? cfg.vars.API_PREFIX : "";
  prefixNote = prefix;
  const flagsOk = Array.isArray(cfg.flags) && cfg.flags.length > 0 && cfg.flags.every(f => typeof f === "string");
  const dateOk = DATE_RE.test(dateRan);
  const namesOk = !!binding && binding.class_name === exportName && cfg.buckets.some(row => row.binding === r2Name) && prefix !== "";
  const stringVars = Object.keys(cfg.vars).every(k => typeof cfg.vars[k] === "string");
  let coreFile = path.join(ROOT, "relay", "core.cjs");
  let workerFile = workerPath;
  {
    fs.mkdirSync(path.join(scratch, "relay"), { recursive: true });
    fs.mkdirSync(path.join(scratch, "shell", "relay"), { recursive: true });
    fs.copyFileSync(workerPath, path.join(scratch, "relay", "worker.mjs"));
    fs.copyFileSync(teamPath, path.join(scratch, "relay", "team.cjs"));
    fs.copyFileSync(path.join(ROOT, "relay", "core.cjs"), path.join(scratch, "relay", "core.cjs"));
    fs.copyFileSync(path.join(ROOT, "shell", "relay", "blob.cjs"), path.join(scratch, "shell", "relay", "blob.cjs"));
    coreFile = path.join(scratch, "relay", "core.cjs");
    workerFile = path.join(scratch, "relay", "worker.mjs");
    const teamScratch = path.join(scratch, "relay", "team.cjs");
    const wokeFrom = "function webSocketMessage(ws, message) {\n    headerSet = false;";
    const wokeTo = "function webSocketMessage(ws, message) {\n    try { ws.close(4400, \"woke\"); } catch (err) { /* the handler ran */ }\n    return;\n    headerSet = false;";
    const teamSrc = fs.readFileSync(teamScratch, "utf8");
    if (teamSrc.indexOf(wokeFrom) < 0) throw new Error("message handler absent");
    fs.writeFileSync(teamScratch, teamSrc.replace(wokeFrom, wokeTo));
  }
  const canBoot = dateOk && flagsOk && namesOk && stringVars && !cfg.vars.REVOKED;
  console.log("# file date " + dateRan + " supported " + supportedCompatibilityDate + " boot " + canBoot);
  if (canBoot) {
    const bindings = Object.assign({}, cfg.vars, { REVOKED: revokedText() });
    const entryPath = path.join(scratch, "entry.mjs");
    fs.writeFileSync(entryPath, entrySource(relImport(scratch, coreFile), relImport(scratch, workerFile), kit.ROOT.pub, bindingName, jurisdiction));
    let mf = null;
    try {
      mf = await boot(scratch, entryPath, cfg, bindings);
      sceneResult = await scene(mf, prefix, r2Name);
      sweepResult = await sweepScene(mf, prefix, r2Name, bindingName);
      booted = true;
    } catch (e) {
      sceneError = e && e.stack ? e.stack : String(e);
    } finally {
      if (mf) await mf.dispose();
    }
    if (planted) {
      const autoLine = "    if (typeof ctx.setWebSocketAutoResponse === \"function\" && typeof WebSocketRequestResponsePair === \"function\") ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{\"type\":\"ping\"}', '{\"type\":\"pong\"}')); /* plant:ping-auto */\n";
      const withAuto = fs.readFileSync(path.join(scratch, "relay", "team.cjs"), "utf8");
      if (withAuto.indexOf(autoLine) < 0) plantPingNote = "auto line absent";
      else {
        fs.writeFileSync(path.join(scratch, "relay", "team.cjs"), withAuto.replace(autoLine, ""));
        let mfPing = null;
        try {
          mfPing = await boot(scratch, entryPath, cfg, bindings);
          const again = await scene(mfPing, prefix, r2Name);
          plantPing = again && again.ping;
        } catch (e) {
          plantPingNote = e && e.message ? e.message : String(e);
        } finally {
          if (mfPing) await mfPing.dispose();
        }
      }
      const plantedPath = path.join(scratch, "plant-worker.mjs");
      const rewritten = plantText(fs.readFileSync(path.join(ROOT, "relay", "worker.mjs"), "utf8"),
        relImport(scratch, path.join(scratch, "relay", "team.cjs")), relImport(scratch, coreFile));
      if (!rewritten) plantNote = "fetch line absent";
      else {
        fs.writeFileSync(plantedPath, rewritten);
        const plantEntry = path.join(scratch, "plant-entry.mjs");
        fs.writeFileSync(plantEntry, entrySource(relImport(scratch, coreFile), relImport(scratch, plantedPath), kit.ROOT.pub, bindingName, jurisdiction));
        let mf2 = null;
        try {
          mf2 = await boot(scratch, plantEntry, cfg, bindings);
          plantResult = await post(mf2, prefix + "teams", "{}");
        } catch (e) {
          plantNote = e && e.message ? e.message : String(e);
        } finally {
          if (mf2) await mf2.dispose();
        }
      }

      // Sweep Plant 1 (Plant 977n): DROP TABLE kv removed
      const scratchTeam = path.join(scratch, "relay", "team.cjs");
      const origTeamText = fs.readFileSync(scratchTeam, "utf8");
      const origTeamSha = shaOf(scratchTeam);
      const dropLine = 'if (has()) sql.exec("DROP TABLE kv");';
      if (origTeamText.indexOf(dropLine) >= 0) {
        fs.writeFileSync(scratchTeam, origTeamText.replace(dropLine, 'if (has()) { /* removed */ }'));
        let mfPlant1 = null;
        try {
          mfPlant1 = await boot(scratch, entryPath, cfg, bindings);
          sweepPlant1Result = await sweepScene(mfPlant1, prefix, r2Name, bindingName);
        } catch (e) {
          sweepPlant1Result = { error: String(e) };
        } finally {
          if (mfPlant1) await mfPlant1.dispose();
        }
        plant1Turned = !!sweepPlant1Result && !!sweepPlant1Result.stateT && sweepPlant1Result.stateT.kv === true && sweepPlant1Result.stateT.swept === false;
        fs.writeFileSync(scratchTeam, origTeamText);
        sweepPlant1Restored = shaOf(scratchTeam) === origTeamSha;
      }

      // Sweep Plant 2: c.wipe(left) lifted
      const wipeLine = 'c.wipe(left); /* plant:sweep-wipe */';
      if (origTeamText.indexOf(wipeLine) >= 0) {
        fs.writeFileSync(scratchTeam, origTeamText.replace(wipeLine, '/* c.wipe lifted */'));
        let mfPlant2 = null;
        try {
          mfPlant2 = await boot(scratch, entryPath, cfg, bindings);
          sweepPlant2Result = await sweepScene(mfPlant2, prefix, r2Name, bindingName);
        } catch (e) {
          sweepPlant2Result = { error: String(e) };
        } finally {
          if (mfPlant2) await mfPlant2.dispose();
        }
        plant2Turned = !!sweepPlant2Result && !!sweepPlant2Result.stateT && sweepPlant2Result.stateT.kv === true && sweepPlant2Result.stateT.swept === false;
        fs.writeFileSync(scratchTeam, origTeamText);
        sweepPlant2Restored = shaOf(scratchTeam) === origTeamSha;
      }

      // Sweep Plant 3: lapseOf sweeps paid team early
      const scratchCore = path.join(scratch, "relay", "core.cjs");
      const origCoreText = fs.readFileSync(scratchCore, "utf8");
      const origCoreSha = shaOf(scratchCore);
      const plantSite = "p = paidEnd(team); /* plant:lapse-trial */";
      if (origCoreText.indexOf(plantSite) >= 0) {
        fs.writeFileSync(scratchCore, origCoreText.replace(plantSite, plantSite + '\n  if (p !== null) return { state: "gone", until: u, readOnly: null, swept: now };'));
        let mfPlant3 = null;
        try {
          mfPlant3 = await boot(scratch, entryPath, cfg, bindings);
          sweepPlant3Result = await sweepScene(mfPlant3, prefix, r2Name, bindingName);
        } catch (e) {
          sweepPlant3Result = { error: String(e) };
        } finally {
          if (mfPlant3) await mfPlant3.dispose();
        }
        plant3Turned = !!sweepPlant3Result && sweepPlant3Result.r2PAfter === 0 && !!sweepPlant3Result.stateP && sweepPlant3Result.stateP.kv === false;
        fs.writeFileSync(scratchCore, origCoreText);
        sweepPlant3Restored = shaOf(scratchCore) === origCoreSha;
      }
    }
  }
  const empty = sceneResult && sceneResult.empty;
  const created = sceneResult && sceneResult.created;
  const hello = sceneResult && sceneResult.hello;
  const session = sceneResult && sceneResult.session;
  const delegated = sceneResult && sceneResult.delegated;
  const listed = sceneResult && sceneResult.listed;
  check(isRefusal(empty, "bad-signature"),
    "984a POST {} answers 403 bad-signature: " + brief(empty) + (sceneError ? " " + sceneError.split("\n")[0] : ""));
  check(!!created && created.status === 200 && !!created.json && created.json.rt === sceneResult.rt && !created.json.error
    && !!listed && Array.isArray(listed.objects),
    "984b a test-root create answers 200 and R2 listed: " + brief(created) + " r2 " + (listed && listed.objects ? listed.objects.length : "none"));
  const helloOk = !!hello && hello.status === 200 && !!hello.json && /^[0-9a-f]{32}$/.test(hello.json.challenge) && Number.isFinite(hello.json.until);
  const sessionOk = !!session && session.status === 200 && !!session.json && /^[0-9a-f]{64}$/.test(session.json.session)
    && Number.isFinite(session.json.until) && !!session.json.lapse && typeof session.json.lapse === "object" && typeof session.json.made === "string";
  check(helloOk && sessionOk,
    "984c a hello and the lead's session answer 200: hello " + brief(hello) + " session " + brief(session));
  check(isRefusal(delegated, "revoked"),
    "984d a grant from a revoked service key is refused: " + brief(delegated));
  const ping = sceneResult && sceneResult.ping;
  const pong = !!ping && Array.isArray(ping.got) && ping.got.length === 1 && ping.got[0] === '{"type":"pong"}' && ping.closed === null;
  check(pong, "984g a ping is answered pong and the message handler does not run: handler 0, " + JSON.stringify(ping));
  if (planted) {
    const woke = !!plantPing && plantPing.closed && plantPing.closed.reason === "woke" && Array.isArray(plantPing.got) && plantPing.got.length === 0;
    check(woke, "984h without the auto response the message handler runs and closes the socket: handler "
      + (woke ? "1" : "0") + ", " + (plantPingNote || JSON.stringify(plantPing)));
  }
  if (planted) {
    const fault = !!plantResult && plantResult.status === 500 && !!plantResult.json && plantResult.json.error === "fault" && plantResult.json.said === FAULT_SAID;
    check(fault, "984e a planted stub call answers 500 fault: " + (plantNote || brief(plantResult)));
  }
  const climbs = imports.filter(rel => !rel.startsWith("./") || rel.split("/").indexOf("..") > -1);
  check(booted && runtimeRefusal === "" && dateRan === cfg.date && dateOk && flagsOk && namesOk && bytesSame() && prefix === cfg.vars.API_PREFIX
    && imports.length > 0 && climbs.length === 0,
    "984f ran on the staging compatibility date " + dateRan + " supported " + supportedCompatibilityDate
    + " flags " + flagsNote + " prefix " + prefixNote + " class " + classNote + " binding " + bindingNote
    + " r2 " + r2Note + " bytes " + (bytesSame() ? "same" : "CHANGED") + " imports " + imports.length + " climbing " + JSON.stringify(climbs));

  const okT = !!sweepResult && !!sweepResult.stateT && !sweepResult.stateT.kv && sweepResult.stateT.swept
    && sweepResult.r2TBefore === 1 && sweepResult.r2TAfter === 0 && sweepResult.putT === 200;
  const okP = !!sweepResult && !!sweepResult.stateP && sweepResult.stateP.kv && sweepResult.stateP.rows.length > 0
    && sweepResult.r2PBefore === 1 && sweepResult.r2PAfter === 1 && sweepResult.putP === 200 && sweepResult.sessionP2;
  check(okT && okP,
    "984g workerd scheduler sweeps trial team T and preserves paid team P: T(kv="
    + (sweepResult && sweepResult.stateT ? sweepResult.stateT.kv : "none") + ", r2="
    + (sweepResult ? sweepResult.r2TAfter : "none") + ") P(kv="
    + (sweepResult && sweepResult.stateP ? sweepResult.stateP.kv : "none") + ", r2="
    + (sweepResult ? sweepResult.r2PAfter : "none") + ", session="
    + (sweepResult ? sweepResult.sessionP2 : "none") + ")");

  if (planted) {
    check(plant1Turned && sweepPlant1Restored,
      "984h plant 977n: removing DROP TABLE kv leaves team in sqlite and fails the sweep check: red="
      + plant1Turned + " restored=" + sweepPlant1Restored);
    check(plant2Turned && sweepPlant2Restored,
      "984i plant sweep-wipe: lifting c.wipe leaves sqlite rows untouched and fails the sweep check: red="
      + plant2Turned + " restored=" + sweepPlant2Restored);
    check(plant3Turned && sweepPlant3Restored,
      "984j plant paid-early: sweeping a paid team early wipes its sqlite table and empties R2: red="
      + plant3Turned + " restored=" + sweepPlant3Restored);
  }
} catch (e) {
  console.log("SUITE DID NOT COMPLETE: " + (e && e.stack ? e.stack : e));
  process.exit(78);
} finally {
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (e) {
    console.log("# scratch cleanup: " + (e && e.message ? e.message : e));
  }
}

console.log("# elapsed ms " + (Date.now() - started));
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
const resultDate = booted ? dateRan : "not run";
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted + ", compatibility date " + resultDate
  : "  RESULT: ok " + asserted + " check(s), compatibility date " + resultDate);
process.exit(Math.min(failed, 63));
