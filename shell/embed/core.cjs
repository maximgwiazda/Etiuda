/* THE EMBEDDED MODEL'S ARITHMETIC, shared by the suggestion worker and its legs: the pin every model file is held to, the
 * passages an intent is known by, and the five nearest. Node's own modules only; no runtime is loaded here.
 * The bytes are not in this tree. The packer copies a local folder that matches this pin, and ships the desk
 * without the model when that folder is absent. The worker checks the pin again before anything is loaded. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* The prompt the model was measured with, on the message and the passages alike. */
const EMBED_PROMPT = "task: classification | query: ";
const EMBED_MAX_TOKENS = 128;
const EMBED_LIMIT = 5;

/* EmbeddingGemma 2, q4 ONNX, each file at a fixed commit of the repository named beside it. The tokenizer files are
   Google's own; the ONNX weights are Hugging Face's conversion of them. */
const MODEL_PIN = Object.freeze({
  name: "embeddinggemma-2-q4",
  files: Object.freeze([
    Object.freeze({ name: "model_q4.onnx", size: 490742,
      sha256: "f9eeba97acddf139b8ee2ddf04bc30dceafa88de93fadf74d7644e0d61a477a9",
      source: "https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/resolve/daa72c51243991dfcaf9f9137d2c573d8f7790c0/onnx/model_q4.onnx" }),
    Object.freeze({ name: "model_q4.onnx_data", size: 174028800,
      sha256: "c3975f2d1ab7a1878ae31a7d7a9b7804a827aff3800b60dfceafce21cac3df49",
      source: "https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/resolve/daa72c51243991dfcaf9f9137d2c573d8f7790c0/onnx/model_q4.onnx_data" }),
    Object.freeze({ name: "tokenizer.json", size: 32170510,
      sha256: "4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4",
      source: "https://huggingface.co/google/embeddinggemma-2/resolve/f9972ac22e696a105c482202646979e33e4b5a1e/tokenizer.json" }),
    Object.freeze({ name: "tokenizer_config.json", size: 1599,
      sha256: "17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874",
      source: "https://huggingface.co/google/embeddinggemma-2/resolve/f9972ac22e696a105c482202646979e33e4b5a1e/tokenizer_config.json" })
  ])
});

/* Every file of `pin` in `dir`, read once and hashed as read: {problem: null, bytes: {name: Buffer}} when all are whole,
   else {problem: {why, name}}, why being "absent", "size" or "checksum". The size is read before anything else, so a
   wrong file of another length costs no read. Whatever is loaded afterwards is built from these bytes, never from the
   path again, so a file changed after the check is not the file loaded. */
async function pinRead(dir, pin) {
  const files = pin && Array.isArray(pin.files) ? pin.files : [];
  if (!dir || !files.length) return { problem: { why: "absent", name: "" } };
  for (const f of files) {
    const at = path.join(dir, f.name);
    let st = null;
    try { st = fs.statSync(at); } catch (e) { st = null; }
    if (!st || !st.isFile()) return { problem: { why: "absent", name: f.name } };
    if (st.size !== f.size) return { problem: { why: "size", name: f.name } };
  }
  const bytes = {};
  for (const f of files) {
    let b = null;
    try { b = await fs.promises.readFile(path.join(dir, f.name)); } catch (e) { return { problem: { why: "absent", name: f.name } }; }
    const got = crypto.createHash("sha256").update(b).digest("hex");
    if (got !== f.sha256) return { problem: { why: "checksum", name: f.name } }; /* plant:embed-pin */
    bytes[f.name] = b;
  }
  return { problem: null, bytes };
}
async function pinProblem(dir, pin) { return (await pinRead(dir, pin)).problem; }

/* Whether every file of `pin` is in `dir` at its pinned size: the cheap test of whether the desk carries the model. */
function pinPresent(dir, pin) {
  const files = pin && Array.isArray(pin.files) ? pin.files : [];
  if (!dir || !files.length) return false;
  return files.every(f => {
    try { const st = fs.statSync(path.join(dir, f.name)); return st.isFile() && st.size === f.size; } catch (e) { return false; }
  });
}

/* The texts the model embeds for the intents: one row per intent and language, as [id, text]. */
function passageRows(passages) {
  const out = [];
  for (const p of Array.isArray(passages) ? passages : []) {
    if (!p || !p.id) continue;
    for (const text of Array.isArray(p.texts) ? p.texts : []) {
      const s = String(text || "").trim();
      if (s) out.push([String(p.id), s]);
    }
  }
  return out;
}

function unit(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/* What the worker has embedded, as one string: equal for two catalogs whose intents read the same, whatever else changed. */
function passagesKey(passages) {
  return crypto.createHash("sha256").update(JSON.stringify(passageRows(passages))).digest("hex");
}

/* The intents nearest `vec`, each scored by its best passage, highest first and equal scores by id: EMBED_LIMIT at most,
   as [{id, score}]. `table` is [[id, unit vector]], one row per passage. */
function nearest(vec, table, limit) {
  const best = new Map();
  for (const [id, v] of table) {
    const c = dot(vec, v);
    if (!best.has(id) || c > best.get(id)) best.set(id, c);
  }
  return [...best].map(([id, score]) => ({ id, score: Number(score.toFixed(5)) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit || EMBED_LIMIT);
}

module.exports = { EMBED_PROMPT, EMBED_MAX_TOKENS, EMBED_LIMIT, MODEL_PIN, pinRead, pinProblem, pinPresent, passageRows, passagesKey, unit, nearest };
