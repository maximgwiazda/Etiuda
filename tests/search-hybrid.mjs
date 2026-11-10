/* The main search's meaning order, offline: the shell's arithmetic and the page's guards.
 *
 *   node tests/search-hybrid.mjs
 *
 * With the search switch off, a query is not sent and the word list is the same array. With it on and the
 * passages ready, word matches stay first and a paraphrase's card is in the first five. Under three letters
 * or digits nothing is sent. An answer for an older ask is not painted. A catalog that is not ready yet
 * does not rank. The cache key changes with the passages and with the pin. Each guard is lifted once, in
 * memory, and its leg must then fail.
 */
import { createRequire } from "node:module";
import { fork } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMBED = path.join(ROOT, "shell", "embed");
const nodeRequire = createRequire(import.meta.url);
const core = nodeRequire(path.join(EMBED, "core.cjs"));
const { createEmbedSuggest } = nodeRequire(path.join(EMBED, "suggest.cjs"));

let checks = 0, failed = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failed++;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));

function loadFrom(name, edit) {
  const file = path.join(EMBED, name);
  let src = fs.readFileSync(file, "utf8");
  if (edit) {
    const out = edit(src);
    if (out === src) throw new Error("plant did not apply to " + name);
    src = out;
  }
  const mod = { exports: {} };
  const req = p => (p === "./core.cjs" ? core : nodeRequire(p));
  new Function("require", "module", "exports", "__dirname", "__filename", src)(req, mod, mod.exports, EMBED, file);
  return mod.exports;
}
function fnSource(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at < 0) throw new Error("no " + name);
  let i = src.indexOf("{", at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error("unclosed " + name);
}
function evalFn(src, name) {
  const body = fnSource(src, name);
  return new Function(body + "\nreturn " + name + ";")();
}

function fakeFork(answer) {
  const made = [];
  const f = () => {
    const kid = { posts: [], killed: false, msg: null, exit: null };
    kid.post = m => {
      kid.posts.push(m);
      const a = answer && answer(m, kid);
      if (a) setTimeout(() => kid.msg && kid.msg(a), 1);
    };
    kid.onMessage = fn => { kid.msg = fn; };
    kid.onExit = fn => { kid.exit = fn; };
    kid.kill = () => { kid.killed = true; };
    made.push(kid);
    return kid;
  };
  f.made = made;
  return f;
}
function heldFork() {
  const made = [];
  const f = () => {
    const kid = { posts: [], killed: false, msg: null };
    kid.post = m => { kid.posts.push(m); };
    kid.onMessage = fn => { kid.msg = fn; };
    kid.onExit = () => {};
    kid.kill = () => { kid.killed = true; };
    kid.reply = m => { if (kid.msg) kid.msg(m); };
    made.push(kid);
    return kid;
  };
  f.made = made;
  return f;
}

const ROWS = [
  { surface: "card", id: "lamp", text: "title: lamp | text: mend the glass" },
  { surface: "card", id: "kettle", text: "title: kettle | text: boil the water" },
  { surface: "intent", id: "t:lamp", text: "title: mending a lantern | text: the lantern needs mending" },
  { surface: "intent", id: "t:tea", text: "title: brewing tea | text: the kettle brews" }
];
/* Vectors of the model's width, one-hot, so the cache is one the shell trusts (core.searchCacheFits). */
const ONE = i => { const v = new Float32Array(core.SEARCH_DIM); v[i] = 1; return v; };
const TABLES = {
  cards: [["lamp", ONE(0)], ["kettle", ONE(1)]],
  intents: [["t:lamp", ONE(0)], ["t:tea", ONE(1)]]
};
const PACKED = core.packSearchCache(TABLES);
function cacheFor(buf) {
  return {
    cacheRead: key => (key && buf) || null,
    cacheWrite: () => {},
    cachePrune: () => {}
  };
}
const queryAnswer = m => {
  if (m.kind === "boot" || m.kind === "load") return m.kind === "boot" ? { kind: "booted" } : { kind: "ready", epoch: m.epoch };
  if (m.kind === "passages") return { kind: "ready", epoch: m.epoch };
  if (m.kind === "search-query" || m.kind === "search-doc") return { kind: "search-vector", n: m.n, vec: Array.from(ONE(0)) };
  if (m.kind === "rank") return { kind: "ranked", n: m.n, epoch: m.epoch, rows: [{ id: "t:lamp", score: 1 }] };
  return null;
};

const PAGE = fs.readFileSync(path.join(ROOT, "src", "modules", "search-meaning.js"), "utf8");
const RENDER = fs.readFileSync(path.join(ROOT, "src", "modules", "render.js"), "utf8");
const hybridIds = evalFn(PAGE, "hybridIds");
const acceptSearchAnswer = evalFn(PAGE, "acceptSearchAnswer");
const pageAlnum = evalFn(PAGE, "searchAlnumLen");

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-search-"));
const model = path.join(lab, "model");
const runtime = path.join(lab, "runtime");
fs.mkdirSync(model, { recursive: true });
const stubFiles = { "model_q4.onnx": "stub graph\n", "model_q4.onnx_data": "stub weights ".repeat(8),
  "tokenizer.json": "{}\n", "tokenizer_config.json": "{}\n" };
for (const [n, body] of Object.entries(stubFiles)) fs.writeFileSync(path.join(model, n), body);
const pin = { name: "fixture", files: Object.keys(stubFiles).map(n => {
  const b = fs.readFileSync(path.join(model, n));
  return { name: n, size: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex") };
}) };
const pinFile = path.join(lab, "pin.json");
fs.writeFileSync(pinFile, JSON.stringify(pin));
const ort = path.join(runtime, "node_modules", "onnxruntime-node");
const tok = path.join(runtime, "node_modules", "@huggingface", "tokenizers", "dist");
fs.mkdirSync(ort, { recursive: true });
fs.mkdirSync(tok, { recursive: true });
fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ name: "onnxruntime-node", main: "index.js" }));
fs.writeFileSync(path.join(ort, "index.js"), [
  "class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }",
  "const session = { inputNames: ['input_ids', 'attention_mask'], outputNames: ['sentence_embedding'],",
  "  async run(feeds) { const v = new Float32Array(97); for (const id of feeds.input_ids.data) v[Number(id)] += 1; return { sentence_embedding: { data: v } }; } };",
  "async function create() { return session; }",
  "module.exports = { Tensor, InferenceSession: { create } };"].join("\n"));
fs.writeFileSync(path.join(tok, "tokenizers.cjs"), [
  "class Tokenizer { encode(text) { const ids = String(text).toLowerCase().split(/[^a-z]+/).filter(Boolean)",
  "  .map(w => { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 89; return h + 8; }); return { ids }; } }",
  "module.exports = { Tokenizer };"].join("\n"));
function suggest(fork, extra) {
  return createEmbedSuggest(Object.assign({ fork, dir: model, runtime, pin }, extra || {}));
}

try {
  /* ---- the arithmetic ------------------------------------------------------------------------------------------ */
  const samples = ["", "a", "ab", "abc", "12", "123", "a b", "ąbc", "12a"];
  const alnumOk = samples.every(s => core.searchAlnumLen(s) === pageAlnum(s));
  check(alnumOk && core.searchAlnumLen("ab") === 2 && core.searchAlnumLen("12") === 2 && core.searchAlnumLen("ąbc") === 3
      && core.SEARCH_MIN_ALNUM === 3 && core.SEARCH_QUERY_PROMPT === "task: search result | query: ",
    "h1 three letters or digits, counted the same on the page and in the shell, and the search prompt is its own");

  const hashA = core.catalogHashOf(ROWS);
  const hashB = core.catalogHashOf(ROWS.slice(0, 3));
  const pinA = { name: "pin-a", files: [{ name: "model_q4.onnx", sha256: "aa", size: 1 }] };
  const pinB = { name: "pin-b", files: [{ name: "model_q4.onnx", sha256: "bb", size: 2 }] };
  const keyA = core.searchCacheKey(hashA, pinA, core.SEARCH_STYLE);
  const keyHash = core.searchCacheKey(hashB, pinA, core.SEARCH_STYLE);
  const keyPin = core.searchCacheKey(hashA, pinB, core.SEARCH_STYLE);
  const keyStyle = core.searchCacheKey(hashA, pinA, core.SEARCH_STYLE + "x");
  check(hashA !== hashB && keyA !== keyHash && keyA !== keyPin && keyA !== keyStyle
      && /^[0-9a-f]{64}$/.test(keyA),
    "h2 the cache key changes with the passages, the pin and the prompt style");

  const back = core.unpackSearchCache(PACKED);
  const round = !!back && back.cards.length === 2 && back.intents.length === 2 && back.cards[0][0] === "lamp"
    && back.cards[0][1][0] === 1 && back.intents[1][0] === "t:tea";
  check(round && core.unpackSearchCache(Buffer.from("nope")) === null,
    "h3 a cache buffer round-trips, and a buffer that is not one does not");

  /* h3b. A cache of the right shape and count that is not this catalog's rows, or not the model's width, or not finite,
     is not trusted: the shell re-embeds rather than mis-ordering the search (the test architect's read of fed73e15). */
  const swapped = core.unpackSearchCache(core.packSearchCache({ cards: [TABLES.cards[1], TABLES.cards[0]], intents: TABLES.intents }));
  const short = core.unpackSearchCache(core.packSearchCache({ cards: [["lamp", Float32Array.from([1, 0, 0])], TABLES.cards[1]], intents: TABLES.intents }));
  const nanV = ONE(0); nanV[5] = NaN;
  const notFinite = core.unpackSearchCache(core.packSearchCache({ cards: [["lamp", nanV], TABLES.cards[1]], intents: TABLES.intents }));
  const fits = core.searchCacheFits(core.unpackSearchCache(PACKED), ROWS);
  check(fits && !core.searchCacheFits(swapped, ROWS) && !core.searchCacheFits(short, ROWS) && !core.searchCacheFits(notFinite, ROWS),
    "h3b the cache is trusted only as this catalog's rows in order, each of the model's width and finite: right "
    + fits + ", swapped " + core.searchCacheFits(swapped, ROWS) + ", short " + core.searchCacheFits(short, ROWS)
    + ", NaN " + core.searchCacheFits(notFinite, ROWS));

  const tied = core.orderSurfaces(Float32Array.from([0, 0]), [
    ["b", Float32Array.from([0, 0])],
    ["a", Float32Array.from([0, 0])]
  ]);
  const best = core.orderSurfaces(Float32Array.from([1, 0]), [
    ["lamp", Float32Array.from([0.2, 0])],
    ["lamp", Float32Array.from([1, 0])],
    ["kettle", Float32Array.from([0, 1])]
  ]);
  check(tied.join() === "a,b" && best.join() === "lamp,kettle",
    "h4 equal scores sort by id, and a card keeps its best passage, with no cut: " + tied.join() + " / " + best.join());

  const names = [
    { name: "a.bin", mtime: 10 }, { name: "b.bin", mtime: 40 }, { name: "c.bin", mtime: 30 },
    { name: "d.bin", mtime: 20 }, { name: "e.bin", mtime: 50 }
  ];
  const dropped = core.cacheKeep(names, 3).sort();
  check(core.SEARCH_CACHE_KEEP === 3 && dropped.join() === "a.bin,d.bin",
    "h5 three cache files stay, and the two oldest are the ones to drop: " + dropped.join());

  /* ---- the switch off, and the word list ----------------------------------------------------------------------- */
  const wordCards = ["kettle", "other"];
  const wordIntents = ["t:tea", "t:post"];
  const sameCards = hybridIds(wordCards, null) === wordCards;
  const sameIntents = hybridIds(wordIntents, null) === wordIntents;
  const mixed = hybridIds(wordCards, ["lamp", "kettle", "spare"]);
  const renderKeeps = /const ranked=rankedCards\(terms,keep\)/.test(RENDER)
    && /setShown\(mixed\|\|ranked\.hits\)/.test(RENDER);
  check(sameCards && sameIntents && mixed.join() === "kettle,other,lamp,spare" && renderKeeps
      && mixed.indexOf("lamp") < 5,
    "h6 with no meaning order the word lists are the same arrays, and a paraphrase is appended after them");

  const offFork = fakeFork(queryAnswer);
  const off = suggest(offFork, cacheFor(PACKED));
  off.setSearchOn(false);
  const offRank = await off.searchRank("mend the light");
  const offPosts = offFork.made.reduce((n, k) => n + k.posts.filter(p => p.kind === "search-query" || p.kind === "search-doc" || p.kind === "boot").length, 0);
  check(offRank === null && offPosts === 0 && offFork.made.length === 0,
    "h7 the search switch off sends nothing and answers nothing");

  /* ---- not ready yet ------------------------------------------------------------------------------------------- */
  const earlyFork = heldFork();
  const early = suggest(earlyFork, { cacheRead: () => null, cacheWrite: () => {}, cachePrune: () => {} });
  early.setSearchOn(true);
  const earlyPrep = early.prepareSearch(ROWS);
  const earlyRank = await early.searchRank("mend the light");
  const earlyQueries = earlyFork.made.length ? earlyFork.made[0].posts.filter(p => p.kind === "search-query") : [];
  const earlyDocs = earlyFork.made.length ? earlyFork.made[0].posts.filter(p => p.kind === "search-doc") : [];
  check(earlyPrep.ready === false && earlyRank === null && earlyQueries.length === 0 && earlyDocs.length === 1,
    "h8 before the passages are ready the rank is null and one passage is embedded, not the query: docs " + earlyDocs.length);

  /* ---- ready: short queries do not ask, a paraphrase ranks, word hits stay first ------------------------------- */
  const readyFork = fakeFork(queryAnswer);
  const ready = suggest(readyFork, cacheFor(PACKED));
  ready.setSearchOn(true);
  const readyPrep = ready.prepareSearch(ROWS);
  const shortPostsBefore = readyFork.made.length ? readyFork.made[0].posts.filter(p => p.kind === "search-query").length : 0;
  const ab = await ready.searchRank("ab");
  const digits = await ready.searchRank("12");
  const spaced = await ready.searchRank("a b");
  const afterShort = readyFork.made.length ? readyFork.made[0].posts.filter(p => p.kind === "search-query").length : shortPostsBefore;
  const ranked = await ready.searchRank("mend the light");
  const long = await ready.searchRank("abc");
  const wordFirst = hybridIds(["kettle"], ranked && ranked.cards);
  check(readyPrep.ready === true && ab === null && digits === null && spaced === null && afterShort === shortPostsBefore
      && ranked && ranked.cards[0] === "lamp" && ranked.intents[0] === "t:lamp"
      && wordFirst[0] === "kettle" && wordFirst.indexOf("lamp") >= 0 && wordFirst.indexOf("lamp") < 5
      && long && long.cards[0] === "lamp",
    "h9 under three letters nothing is sent (" + afterShort + "), and 'mend the light' ranks the lamp after the word hit: "
      + (wordFirst && wordFirst.join()));

  const liftedLib = loadFrom("suggest.cjs", s => s.replace(
    "if (core.searchAlnumLen(text) < 3) return Promise.resolve(null); /* plant:search-short */",
    "/* lifted */"));
  const liftedFork = fakeFork(queryAnswer);
  const lifted = liftedLib.createEmbedSuggest(Object.assign({ fork: liftedFork, dir: model, runtime, pin }, cacheFor(PACKED)));
  lifted.setSearchOn(true);
  lifted.prepareSearch(ROWS);
  const liftedAb = await lifted.searchRank("ab");
  const liftedPosts = liftedFork.made.length ? liftedFork.made[0].posts.filter(p => p.kind === "search-query").length : 0;
  check(liftedPosts === 1 && liftedAb && liftedAb.cards && liftedAb.cards[0] === "lamp",
    "h9p with the three-letter line lifted, a two-letter query is sent: posts " + liftedPosts);

  /* ---- a stale answer ------------------------------------------------------------------------------------------ */
  const live = { gen: 2, query: "mend the light" };
  const held = acceptSearchAnswer({ gen: 2, query: "mend the light" }, live);
  const older = acceptSearchAnswer({ gen: 1, query: "mend the light" }, live);
  const other = acceptSearchAnswer({ gen: 2, query: "kettle" }, live);
  const liftedPage = PAGE.replace(
    "if (ticket.gen !== live.gen || ticket.query !== live.query) return false; /* plant:search-stale */",
    "/* lifted */");
  if (liftedPage === PAGE) throw new Error("stale plant did not apply");
  const acceptLifted = evalFn(liftedPage, "acceptSearchAnswer");
  const olderLifted = acceptLifted({ gen: 1, query: "mend the light" }, live);
  check(held === true && older === false && other === false && olderLifted === true,
    "h10 an older ask is not painted, even when the words match, and lifting that line paints it (" + olderLifted + ")");

  /* ---- one worker, and the search prompt ----------------------------------------------------------------------- */
  const bothFork = fakeFork(queryAnswer);
  const both = suggest(bothFork, cacheFor(null));
  both.setOn(true);
  both.warm([{ id: "t:lamp", texts: ["a lantern"] }], "E1");
  await sleep(20);
  both.setSearchOn(true);
  both.prepareSearch(ROWS.slice(0, 1));
  const firstKind = bothFork.made.length ? bothFork.made[0].posts[0].kind : "";
  both.setOn(false);
  const pickerOffKeeps = bothFork.made.length === 1 && !bothFork.made[0].killed && both.state().live;
  both.setSearchOn(false);
  check(firstKind === "load" && pickerOffKeeps && bothFork.made[0].killed && !both.state().live,
    "h11 the picker opens the one worker, and it stays while the search is still on, then stops when both are off: first " + firstKind);

  const searchFirst = fakeFork(queryAnswer);
  const searchLed = suggest(searchFirst, cacheFor(PACKED));
  searchLed.setSearchOn(true);
  searchLed.prepareSearch(ROWS);
  const bootFirst = searchFirst.made.length ? searchFirst.made[0].posts.map(p => p.kind) : [];
  searchLed.setOn(true);
  searchLed.warm([{ id: "t:lamp", texts: ["a lantern"] }], "E9");
  await sleep(20);
  check(bootFirst[0] === "boot" && bootFirst.indexOf("load") < 0 && searchFirst.made.length === 1
      && searchFirst.made[0].posts.some(p => p.kind === "passages"),
    "h12 the search boots the session, and the picker then sends passages rather than a second load: " + bootFirst.join());

  /* The real worker, on the same stub the picker leg uses, so the search prompt is what is embedded. */
  const child = fork(path.join(EMBED, "worker.cjs"), [], { env: Object.assign({}, process.env, { ETIUDA_EMBED_TEST_PIN: pinFile }), stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const got = [];
  child.on("message", m => got.push(m));
  const waitKind = async kind => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const hit = got.find(m => m && m.kind === kind);
      if (hit) return hit;
      await sleep(20);
    }
    return null;
  };
  child.send({ kind: "search-query", n: 1, text: "lantern" });
  child.send({ kind: "boot", dir: model, runtime });
  const booted = await waitKind("booted");
  const qVec = await (async () => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const hit = got.find(m => m && m.kind === "search-vector" && m.n === 1);
      if (hit) return hit.vec;
      await sleep(20);
    }
    return null;
  })();
  child.send({ kind: "search-doc", n: 2, text: core.SEARCH_QUERY_PROMPT + "lantern" });
  child.send({ kind: "search-doc", n: 3, text: core.EMBED_PROMPT + "lantern" });
  const docVec = await (async () => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const hit = got.find(m => m && m.kind === "search-vector" && m.n === 2);
      if (hit) return hit.vec;
      await sleep(20);
    }
    return null;
  })();
  const classVec = await (async () => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const hit = got.find(m => m && m.kind === "search-vector" && m.n === 3);
      if (hit) return hit.vec;
      await sleep(20);
    }
    return null;
  })();
  child.kill();
  const same = JSON.stringify(qVec) === JSON.stringify(docVec);
  const different = JSON.stringify(qVec) !== JSON.stringify(classVec);
  check(!!booted && Array.isArray(qVec) && same && different,
    "h13 a query posted before the session still answers, with the search prompt and not the classification one");

  /* A meaning tail is marked. The function is pure: the label and the no-match block arrive already
     built, so this leg does not need the page's t() or esc(). Missing the function fails only this check. */
  let boundary = null;
  try { boundary = evalFn(RENDER, "meaningBoundaryHtml"); }
  catch (e) { boundary = null; }
  const noMatch = '<div class="empty">A different word may do better.</div>';
  const label = "Close in meaning";
  const none = boundary ? boundary(0, 2, noMatch, label) : "";
  const some = boundary ? boundary(3, 2, noMatch, label) : "";
  const noTail = boundary ? boundary(3, 0, noMatch, label) : "";
  const called = /meaningBoundaryHtml\(wordN,tailN,wordN\?"":searchMissHtml\(\)/.test(RENDER);
  check(!!boundary && none.indexOf(noMatch) >= 0 && none.indexOf("list-sep e-meaning") >= 0 && none.indexOf(label) >= 0
      && some.indexOf(noMatch) < 0 && some.indexOf(label) >= 0 && some.indexOf("list-sep e-meaning") >= 0
      && noTail === "" && called,
    "h14 a search with no word hit keeps the no-match line and a labelled separator before the meaning cards"
      + (boundary ? "" : " (meaningBoundaryHtml is missing)"));
} catch (e) {
  check(false, "the leg threw: " + (e && e.stack || e));
}
console.log(failed ? "FAIL " + failed + " of " + checks : "ok " + checks);
process.exit(failed ? 1 : 0);
