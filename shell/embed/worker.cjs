/* THE SUGGESTION WORKER, a process of its own beside the desk (shell/embed/suggest.cjs starts it): the model files are
 * checked against their pin, the runtime and the tokenizer are loaded from the folder the shell names, every intent's
 * passages are embedded, and then each copied message is answered with the five nearest intents.
 * A message is held only inside its own handler: it is never logged, written or sent anywhere but back as ids. */
"use strict";

const path = require("node:path");
const core = require("./core.cjs");

const port = process.parentPort || null;
function send(m) {
  try { if (port) port.postMessage(m); else if (process.send) process.send(m); } catch (e) { /* the shell has gone */ }
}

/* The pin is the one in core.cjs. Only a worker started by bare node, the harness's, may be held to another, named by a
   file in its own environment; under Electron the variable is not read. */
function pinInForce() {
  const at = process.versions.electron ? "" : String(process.env.ETIUDA_EMBED_TEST_PIN || "");
  return at ? JSON.parse(require("node:fs").readFileSync(at, "utf8")) : core.MODEL_PIN;
}

let ort = null, tok = null, session = null, table = null, epoch = null, busy = Promise.resolve();

async function embed(text) {
  const ids = tok.encode(core.EMBED_PROMPT + String(text)).ids.slice(0, core.EMBED_MAX_TOKENS);
  const n = ids.length;
  const feeds = {};
  for (const name of session.inputNames) {
    const low = name.toLowerCase();
    if (low.includes("mask")) feeds[name] = new ort.Tensor("int64", BigInt64Array.from(ids, () => 1n), [1, n]);
    /* Text only: the image, video and audio inputs take no rows. */
    else if (low.endsWith("_features")) feeds[name] = new ort.Tensor("float32", new Float32Array(0), [0, 512]);
    else feeds[name] = new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, n]);
  }
  const out = await session.run(feeds);
  const v = out.sentence_embedding || out[session.outputNames[0]];
  return core.unit(v.data);
}

async function passagesTable(passages) {
  const rows = core.passageRows(passages), out = [];
  for (const [id, text] of rows) out.push([id, await embed(text)]);
  return out;
}

async function load(m) {
  const got = await core.pinRead(m.dir, pinInForce());
  if (got.problem) { send({ kind: "refused", why: got.problem.why, name: got.problem.name }); return false; }
  const mods = path.join(String(m.runtime || ""), "node_modules");
  ort = require(path.join(mods, "onnxruntime-node"));
  const { Tokenizer } = require(path.join(mods, "@huggingface", "tokenizers", "dist", "tokenizers.cjs"));
  /* Built from the bytes the pin was checked on; the folder is not read again. */
  const b = got.bytes;
  const u8 = x => new Uint8Array(x.buffer, x.byteOffset, x.length);
  tok = new Tokenizer(JSON.parse(b["tokenizer.json"].toString("utf8")), JSON.parse(b["tokenizer_config.json"].toString("utf8")));
  session = await ort.InferenceSession.create(u8(b["model_q4.onnx"]), { intraOpNumThreads: 2, interOpNumThreads: 1,
    externalData: [{ path: "model_q4.onnx_data", data: u8(b["model_q4.onnx_data"]) }] });
  table = await passagesTable(m.passages);
  epoch = m.epoch;
  send({ kind: "ready", epoch });
  return true;
}

async function handle(m) {
  if (!m || typeof m !== "object") return;
  if (m.kind === "load") {
    if (!(await load(m))) process.exit(0);
    return;
  }
  if (!session) return;
  if (m.kind === "passages") {
    table = await passagesTable(m.passages);
    epoch = m.epoch;
    send({ kind: "ready", epoch });
  } else if (m.kind === "rank") {
    const vec = await embed(String(m.text || ""));
    send({ kind: "ranked", n: m.n, epoch, rows: core.nearest(vec, table, core.EMBED_LIMIT) });
  }
}

function take(m) {
  busy = busy.then(() => handle(m)).catch(() => { send({ kind: "failed" }); process.exit(0); });
}
if (port) port.on("message", e => take(e && e.data));
else process.on("message", take);
