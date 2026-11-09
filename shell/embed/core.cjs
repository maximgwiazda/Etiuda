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
/* The main search's prompt, measured apart from classification. A passage is embedded as the title and text line
   itself, with no prompt in front. Under three letters or digits the search never asks. */
const SEARCH_QUERY_PROMPT = "task: search result | query: ";
const SEARCH_STYLE = SEARCH_QUERY_PROMPT + "\n" + "title: {title} | text: {text}";
const SEARCH_MIN_ALNUM = 3;
const SEARCH_CACHE_KEEP = 3;

/* EmbeddingGemma 2. The tokenizer files are Google's own. The ONNX weights are our own conversion of
   Google's weights, not Hugging Face's. SHIPPED is the width the desk loads. The other list is the
   fp16 row of tools/model-export/pin.json, so the swap is this one constant. */
const SHIPPED = "q4";
const WEIGHTS = "https://huggingface.co/google/embeddinggemma-2/resolve/f9972ac22e696a105c482202646979e33e4b5a1e/model.safetensors";
const WIDTHS = Object.freeze({
  q4: Object.freeze([
    Object.freeze({ name: "model_q4.onnx", size: 1827764,
      sha256: "e13c09a774ef0d6aab552b329e832c5c8654d799d9d1cc8eac9dd6bd76d49c63", source: WEIGHTS }),
    Object.freeze({ name: "model_q4.onnx_data", size: 173850624,
      sha256: "7fc9b472f2dfa0b2087b466c2dfcb52af592cb57dd7c5d7d382f41bac5a9d3a4", source: WEIGHTS }),
  ]),
  fp16: Object.freeze([
    Object.freeze({ name: "model_q4.onnx", size: 1785165,
      sha256: "26334b4c9554b15258cd1673955dfa7ae06e6d8476335fddefe75d82fca43b1f", source: WEIGHTS }),
    Object.freeze({ name: "model_q4.onnx_data", size: 541984768,
      sha256: "14639bd1a88b11f6b25e860a704b3030e6ab2861deb84b3e93b4f68d94ea8c4f", source: WEIGHTS }),
  ]),
});
const TOKENIZER = Object.freeze([
  Object.freeze({ name: "tokenizer.json", size: 32170510,
    sha256: "4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4",
    source: "https://huggingface.co/google/embeddinggemma-2/resolve/f9972ac22e696a105c482202646979e33e4b5a1e/tokenizer.json" }),
  Object.freeze({ name: "tokenizer_config.json", size: 1599,
    sha256: "17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874",
    source: "https://huggingface.co/google/embeddinggemma-2/resolve/f9972ac22e696a105c482202646979e33e4b5a1e/tokenizer_config.json" }),
]);
const MODEL_PIN = Object.freeze({
  name: "embeddinggemma-2-" + SHIPPED,
  files: Object.freeze(WIDTHS[SHIPPED].concat(TOKENIZER)),
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

/* Letters and digits, the same count the measurement used. A space is not one. */
function searchAlnumLen(text) {
  const m = String(text == null ? "" : text).match(/\p{L}|\p{N}/gu);
  return m ? m.length : 0;
}

/* What the search embedded, in the order the page handed it over. Two catalogs with the same passages hash the same. */
function catalogHashOf(rows) {
  const h = crypto.createHash("sha256");
  for (const r of Array.isArray(rows) ? rows : []) {
    h.update(String(r && r.surface || ""));
    h.update("\n");
    h.update(String(r && r.id || ""));
    h.update("\n");
    h.update(String(r && r.text || ""));
    h.update("\n");
  }
  return h.digest("hex");
}

function pinText(pin) {
  const name = pin && pin.name ? String(pin.name) : "";
  const files = pin && Array.isArray(pin.files) ? pin.files : [];
  let s = name;
  for (const f of files) s += "\n" + String(f && f.name || "") + " " + String(f && f.sha256 || "") + " " + String(f && f.size != null ? f.size : "");
  return s;
}

/* The cache file's name: the passages, the pin, and the prompt style. Any one of the three changing misses. */
function searchCacheKey(catalogHash, pin, style) {
  return crypto.createHash("sha256").update(String(catalogHash) + "\n" + pinText(pin) + "\n" + String(style == null ? SEARCH_STYLE : style)).digest("hex");
}

/* Every id by its best passage, highest first, equal scores by id. No rounding and no cut: the page keeps the
   word matches and appends the rest of this order. `table` is [[id, unit vector]]. */
function orderSurfaces(vec, table) {
  const best = new Map();
  for (const row of Array.isArray(table) ? table : []) {
    if (!row) continue;
    const id = String(row[0]);
    const v = row[1];
    if (!v) continue;
    const c = dot(vec, v);
    const prev = best.get(id);
    if (prev === undefined || c > prev) best.set(id, c);
  }
  return [...best.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(e => e[0]);
}

const SEARCH_CACHE_MAGIC = Buffer.from("ETSC");

/* One buffer the shell can store. Passages stay separate, because which passage wins depends on the query. */
function packSearchCache(tables) {
  const cards = tables && Array.isArray(tables.cards) ? tables.cards : [];
  const intents = tables && Array.isArray(tables.intents) ? tables.intents : [];
  const rows = [];
  for (const [id, v] of cards) rows.push([1, id, v]);
  for (const [id, v] of intents) rows.push([2, id, v]);
  const parts = [SEARCH_CACHE_MAGIC, Buffer.alloc(8)];
  parts[1].writeUInt32LE(1, 0);
  parts[1].writeUInt32LE(rows.length, 4);
  for (const [surface, id, v] of rows) {
    const name = Buffer.from(String(id), "utf8");
    const dim = v.length;
    const head = Buffer.alloc(1 + 2 + name.length + 2);
    head.writeUInt8(surface, 0);
    head.writeUInt16LE(name.length, 1);
    name.copy(head, 3);
    head.writeUInt16LE(dim, 3 + name.length);
    const body = Buffer.alloc(dim * 4);
    for (let i = 0; i < dim; i++) body.writeFloatLE(v[i], i * 4);
    parts.push(head, body);
  }
  return Buffer.concat(parts);
}

function unpackSearchCache(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
    if (!buf.subarray(0, 4).equals(SEARCH_CACHE_MAGIC)) return null;
    if (buf.readUInt32LE(4) !== 1) return null;
    const count = buf.readUInt32LE(8);
    const cards = [], intents = [];
    let at = 12;
    for (let n = 0; n < count; n++) {
      if (at + 3 > buf.length) return null;
      const surface = buf.readUInt8(at);
      const idLen = buf.readUInt16LE(at + 1);
      at += 3;
      if (idLen > 400 || at + idLen + 2 > buf.length) return null;
      const id = buf.subarray(at, at + idLen).toString("utf8");
      at += idLen;
      const dim = buf.readUInt16LE(at);
      at += 2;
      if (dim < 1 || dim > 8192 || at + dim * 4 > buf.length) return null;
      const v = new Float32Array(dim);
      for (let i = 0; i < dim; i++) v[i] = buf.readFloatLE(at + i * 4);
      at += dim * 4;
      const row = [id, v];
      if (surface === 1) cards.push(row);
      else if (surface === 2) intents.push(row);
      else return null;
    }
    if (at !== buf.length) return null;
    return { cards, intents };
  } catch (e) { return null; }
}

/* Names to drop so `keep` files remain, newest first. `entries` is [{name, mtime}]. */
function cacheKeep(entries, keep) {
  const n = keep == null ? SEARCH_CACHE_KEEP : (keep | 0);
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.name).slice();
  list.sort((a, b) => (b.mtime - a.mtime) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const drop = [];
  for (let i = n; i < list.length; i++) drop.push(String(list[i].name));
  return drop;
}

module.exports = {
  EMBED_PROMPT, EMBED_MAX_TOKENS, EMBED_LIMIT, MODEL_PIN, pinRead, pinProblem, pinPresent, passageRows, passagesKey, unit, nearest,
  SEARCH_QUERY_PROMPT, SEARCH_STYLE, SEARCH_MIN_ALNUM, SEARCH_CACHE_KEEP, searchAlnumLen, catalogHashOf, searchCacheKey,
  orderSurfaces, packSearchCache, unpackSearchCache, cacheKeep
};
