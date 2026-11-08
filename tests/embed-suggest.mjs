/* The embedded model behind the picker's strip, offline: shell/embed/core.cjs, suggest.cjs and worker.cjs.
 *
 *   node tests/embed-suggest.mjs
 *
 * The model files are held to their pin (e1); Settings' switch off forks nothing (e2); a desk without the model forks
 * nothing and leaves the words (e3); the real worker, on a stub runtime and a fixture model written here, warms, ranks
 * by the nearer of an intent's passages, and refuses a file off its pin for good (e4); an answer slower than the budget
 * is no answer (e5); the strip's rows are taken only by the agent (e6); nothing in the three files reaches a network or
 * writes a file (e7). Each guard is lifted once in a copy held in memory, and its leg must then fail.
 * e8 runs the real model only where ETIUDA_EMBED_MODEL and ETIUDA_EMBED_RUNTIME name it, and is never a gate.
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

let checks = 0, failed = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failed++;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await sleep(10); }
  return test();
}

/* A copy of one of the three files, from its text, `edit` applied: the plants are made here and never on disk. */
function loadFrom(name, edit) {
  const file = path.join(EMBED, name);
  let src = fs.readFileSync(file, "utf8");
  if (edit) {
    const out = edit(src);
    if (out === src) throw new Error("plant did not apply to " + name);
    src = out;
  }
  const mod = { exports: {} };
  const req = p => (p === "./core.cjs" ? loadFrom("core.cjs") : nodeRequire(p));
  new Function("require", "module", "exports", "__dirname", "__filename", src)(req, mod, mod.exports, EMBED, file);
  return mod.exports;
}
const core = nodeRequire(path.join(EMBED, "core.cjs"));
const { createEmbedSuggest } = nodeRequire(path.join(EMBED, "suggest.cjs"));

/* ---- the fixture: four small model files, their pin, and a stub runtime ------------------------------------------ */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-embed-"));
const MODEL = path.join(LAB, "model");
const RUNTIME = path.join(LAB, "runtime");
fs.mkdirSync(MODEL, { recursive: true });
const FILES = { "model_q4.onnx": "stub graph\n", "model_q4.onnx_data": "stub weights ".repeat(64),
  "tokenizer.json": "{}\n", "tokenizer_config.json": "{}\n" };
for (const [n, body] of Object.entries(FILES)) fs.writeFileSync(path.join(MODEL, n), body);
const pinOf = dir => ({ name: "fixture", files: Object.keys(FILES).map(n => {
  const b = fs.readFileSync(path.join(dir, n));
  return { name: n, size: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex") };
}) });
const PIN = pinOf(MODEL);
const PIN_FILE = path.join(LAB, "pin.json");
fs.writeFileSync(PIN_FILE, JSON.stringify(PIN));

/* The stub tokenizer gives each word an id from its letters; the stub session counts ids into a vector, so a message
   lands nearest the passage that shares its words. It also refuses feature inputs not shaped [0, 512]. */
const ORT = path.join(RUNTIME, "node_modules", "onnxruntime-node");
const TOK = path.join(RUNTIME, "node_modules", "@huggingface", "tokenizers", "dist");
fs.mkdirSync(ORT, { recursive: true });
fs.mkdirSync(TOK, { recursive: true });
fs.writeFileSync(path.join(ORT, "package.json"), JSON.stringify({ name: "onnxruntime-node", main: "index.js" }));
fs.writeFileSync(path.join(ORT, "index.js"), [
  "class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }",
  "const session = { inputNames: ['input_ids', 'attention_mask', 'image_features'], outputNames: ['last_hidden_state', 'sentence_embedding'],",
  "  async run(feeds) {",
  "    if (String(feeds.image_features.dims) !== '0,512') throw new Error('features not [0, 512]');",
  "    const v = new Float32Array(97); for (const id of feeds.input_ids.data) v[Number(id)] += 1;",
  "    if (process.env.STUB_SLOW) await new Promise(d => setTimeout(d, Number(process.env.STUB_SLOW)));",
  "    return { sentence_embedding: { data: v } }; } };",
  "module.exports = { Tensor, InferenceSession: { create: async () => session } };"].join("\n"));
fs.writeFileSync(path.join(TOK, "tokenizers.cjs"), [
  "class Tokenizer { constructor(json, config) {}",
  "  encode(text) { const ids = String(text).toLowerCase().split(/[^a-z]+/).filter(Boolean)",
  "    .map(w => { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 89; return h + 8; }); return { ids }; } }",
  "module.exports = { Tokenizer };"].join("\n"));

const PASSAGES = [
  { id: "t:lamp", texts: ["Mending a lantern - the lantern needs mending", "Naprawa latarni - latarnia do naprawy"] },
  { id: "t:post", texts: ["Sending a parcel - a parcel to send"] },
  { id: "t:tea", texts: ["Brewing tea - how the kettle brews tea"] }
];

/* A worker as the manager sees it: the real file under node, or a fake that answers as told. */
function nodeFork(env) {
  return file => {
    const c = fork(file, [], { env: Object.assign({}, process.env, env || {}), stdio: ["ignore", "ignore", "ignore", "ipc"] });
    return { post: m => c.send(m), onMessage: fn => c.on("message", fn), onExit: fn => c.on("exit", fn), kill: () => c.kill(), pid: c.pid };
  };
}
function fakeFork(answer) {
  const made = [];
  const f = () => {
    const kid = { posts: [], killed: false, msg: null, exit: null };
    kid.post = m => { kid.posts.push(m); const a = answer && answer(m); if (a) setTimeout(() => kid.msg && kid.msg(a), 1); };
    kid.onMessage = fn => { kid.msg = fn; };
    kid.onExit = fn => { kid.exit = fn; };
    kid.kill = () => { kid.killed = true; };
    made.push(kid);
    return kid;
  };
  f.made = made;
  return f;
}
const readyOnLoad = m => (m.kind === "load" || m.kind === "passages") ? { kind: "ready", epoch: m.epoch } : null;

try {
  /* ---- e1 the pin -------------------------------------------------------------------------------------------- */
  const whole = await core.pinProblem(MODEL, PIN);
  const bent = path.join(LAB, "bent");
  fs.cpSync(MODEL, bent, { recursive: true });
  const data = fs.readFileSync(path.join(bent, "model_q4.onnx_data"));
  data[5] ^= 1;
  fs.writeFileSync(path.join(bent, "model_q4.onnx_data"), data);
  const oneByte = await core.pinProblem(bent, PIN);
  const short = path.join(LAB, "short");
  fs.cpSync(MODEL, short, { recursive: true });
  fs.appendFileSync(path.join(short, "tokenizer.json"), " ");
  const longer = await core.pinProblem(short, PIN);
  const gone = path.join(LAB, "gone");
  fs.cpSync(MODEL, gone, { recursive: true });
  fs.renameSync(path.join(gone, "tokenizer_config.json"), path.join(gone, "tokenizer_config.json.away"));
  const missing = await core.pinProblem(gone, PIN);
  const e1 = (c, p) => !!c && c.why === "checksum" && c.name === "model_q4.onnx_data";
  check(whole === null && e1(oneByte) && longer && longer.why === "size" && missing && missing.why === "absent"
    && core.pinPresent(MODEL, PIN) && !core.pinPresent(gone, PIN),
    "e1 the model files are held to their pin: whole " + JSON.stringify(whole) + ", one byte changed " + JSON.stringify(oneByte)
    + ", a size changed " + JSON.stringify(longer) + ", a file missing " + JSON.stringify(missing));
  const liftedPin = loadFrom("core.cjs", s => s.replace(/\s*if \(got !== f\.sha256\) return \{ why: "checksum", name: f\.name \}; \/\* plant:embed-pin \*\//, ""));
  const planted = await liftedPin.pinProblem(bent, PIN);
  check(!e1(planted), "e1p with the checksum lifted, the leg above fails: the changed byte now reads " + JSON.stringify(planted));
  check(core.MODEL_PIN.files.length === 4 && core.MODEL_PIN.files.every(f => /^[0-9a-f]{64}$/.test(f.sha256) && f.size > 0
      && /^https:\/\/huggingface\.co\/(google\/embeddinggemma-2|onnx-community\/embeddinggemma-2-ONNX)\/resolve\/[0-9a-f]{40}\//.test(f.source)),
    "e1b the shipped pin names four files, each by size, sha256 and a source at a fixed commit");

  /* ---- e2 the switch off ------------------------------------------------------------------------------------ */
  const e2run = async lib => {
    const f = fakeFork(readyOnLoad);
    const m = lib.createEmbedSuggest({ fork: f, dir: MODEL, runtime: RUNTIME, pin: PIN });
    m.setOn(false);
    const warmed = m.warm(PASSAGES, "E1");
    const rows = await m.rank("please mend the lantern today", 50);
    const offForks = f.made.length;
    m.setOn(true);
    m.warm(PASSAGES, "E1");
    await until(() => m.readyFor("E1"), 500);
    const live = f.made.length === 1 && m.readyFor("E1");
    m.setOn(false);
    return { warmed, rows, offForks, live, killed: f.made.length === 1 && f.made[0].killed, after: m.state() };
  };
  const off = await e2run({ createEmbedSuggest });
  const e2ok = r => r.warmed === false && r.rows === null && r.offForks === 0 && r.live && r.killed && !r.after.live;
  check(e2ok(off), "e2 off, the model is never loaded: forks while off " + off.offForks + ", rank " + JSON.stringify(off.rows)
    + "; on, one worker warms (" + off.live + "); off again, it is stopped (" + off.killed + ")");
  const liftedOff = await e2run(loadFrom("suggest.cjs", s => s.replace("if (!on || status === \"refused\"", "if (status === \"refused\"")));
  check(!e2ok(liftedOff), "e2p with the off test lifted from warm, the leg above fails: forks while off " + liftedOff.offForks);

  /* ---- e3 the model absent ------------------------------------------------------------------------------------ */
  for (const [label, o] of [["no model folder", { dir: path.join(LAB, "nowhere") }], ["a file missing", { dir: gone }],
                            ["no runtime", { runtime: path.join(LAB, "noruntime") }], ["nothing named", { dir: "", runtime: "" }]]) {
    const f = fakeFork(readyOnLoad);
    const m = createEmbedSuggest(Object.assign({ fork: f, dir: MODEL, runtime: RUNTIME, pin: PIN }, o));
    m.setOn(true);
    const w = m.warm(PASSAGES, "E1");
    const rows = await m.rank("please mend the lantern today", 50);
    check(!m.installed() && w === false && f.made.length === 0 && rows === null,
      "e3 on, with " + label + ": not installed, no fork, rank answers nothing, so the words stand");
  }

  /* ---- e4 the real worker on the stub runtime ------------------------------------------------------------------ */
  const live = createEmbedSuggest({ fork: nodeFork({ ETIUDA_EMBED_TEST_PIN: PIN_FILE }), dir: MODEL, runtime: RUNTIME, pin: PIN });
  live.setOn(true);
  live.warm(PASSAGES, "E1");
  await until(() => live.readyFor("E1"), 8000);
  const lamp = await live.rank("Hello, please mend the lantern today", 3000);
  const latarnia = await live.rank("Dzień dobry, latarnia do naprawy prosze", 3000);
  const kettle = await live.rank("the kettle and the tea", 3000);
  check(live.readyFor("E1") && Array.isArray(lamp) && lamp.length === 3 && lamp[0].id === "t:lamp" && latarnia && latarnia[0].id === "t:lamp"
      && kettle && kettle[0].id === "t:tea" && lamp.every((r, i) => i === 0 || lamp[i - 1].score >= r.score),
    "e4 the worker warms and ranks by the nearer of an intent's passages: " + JSON.stringify(lamp) + "; Polish " + (latarnia && latarnia[0].id)
    + "; kettle " + (kettle && kettle[0].id));
  live.warm([{ id: "t:post", texts: ["the lantern parcel"] }], "E2");
  const stale = live.readyFor("E1");
  await until(() => live.readyFor("E2"), 8000);
  const again = await live.rank("please mend the lantern today", 3000);
  check(!stale && again && again.length === 1 && again[0].id === "t:post",
    "e4b a new catalog's passages replace the old in the same worker, and the old epoch is no longer ready");
  live.stop();

  const refusing = createEmbedSuggest({ fork: nodeFork({ ETIUDA_EMBED_TEST_PIN: PIN_FILE }), dir: bent, runtime: RUNTIME, pin: pinOf(bent) });
  refusing.setOn(true);
  refusing.warm(PASSAGES, "E1");
  await until(() => refusing.state().status === "refused", 8000);
  const st = refusing.state();
  const after = refusing.warm(PASSAGES, "E2");
  const rankAfter = await refusing.rank("please mend the lantern today", 50);
  check(st.status === "refused" && !st.live && after === false && rankAfter === null,
    "e4c a model off its pin is refused inside the worker itself, which ends, and the desk keeps the words for good: " + JSON.stringify(st));

  /* ---- e5 slower than the budget --------------------------------------------------------------------------------- */
  const slowFork = fakeFork(readyOnLoad);
  const slow = createEmbedSuggest({ fork: slowFork, dir: MODEL, runtime: RUNTIME, pin: PIN });
  slow.setOn(true);
  slow.warm(PASSAGES, "E1");
  await until(() => slow.readyFor("E1"), 500);
  const t0 = Date.now();
  const late = await slow.rank("please mend the lantern today", 60);
  const took = Date.now() - t0;
  check(late === null && took >= 55 && took < 400 && slowFork.made[0].posts.some(p => p.kind === "rank"),
    "e5 an answer slower than the budget is none: null after " + took + " ms of a 60 ms budget");
  const crashFork = fakeFork(readyOnLoad);
  const crash = createEmbedSuggest({ fork: crashFork, dir: MODEL, runtime: RUNTIME, pin: PIN });
  crash.setOn(true);
  crash.warm(PASSAGES, "E1");
  await until(() => crash.readyFor("E1"), 500);
  const pending = crash.rank("please mend the lantern today", 5000);
  crashFork.made[0].exit(1);
  const crashed = await pending;
  check(crashed === null && crash.state().status === "failed" && crash.warm(PASSAGES, "E2") === false,
    "e5b a worker that dies answers the opening at once with nothing, and is not started again: " + JSON.stringify(crash.state()));

  /* ---- e6 no auto-pick ----------------------------------------------------------------------------------------- */
  const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const pickRoutes = src => {
    const calls = [...src.matchAll(/(?<!function |[.\w])takeSuggest\(/g)].map(m => m.index);
    const byAgent = calls.every(i => {
      const before = src.slice(Math.max(0, i - 420), i);
      return /addEventListener\("click", ev => \{[^}]*$/.test(before) || /if \(e\.key === "Enter"\) \{\s*e\.preventDefault\(\);\s*if \(sgAt >= 0[^\n]*$/.test(before);
    });
    const takes = [...src.matchAll(/askDesk\("suggest-take"/g)].map(m => m.index);
    const inHandler = takes.length === 1 && /ipcMain\.handle\("etiuda:pick-intent", \(e, id, multi\) => \{\s*if \(!fromPicker\(e\)\) return "null";\s*return $/.test(src.slice(takes[0] - 160, takes[0]));
    return { calls: calls.length, byAgent, inHandler };
  };
  const embedSrc = ["core.cjs", "suggest.cjs", "worker.cjs"].map(n => fs.readFileSync(path.join(EMBED, n), "utf8")).join("\n");
  const routes = pickRoutes(MAIN);
  const e6ok = r => r.calls === 2 && r.byAgent && r.inHandler;
  check(e6ok(routes) && !/suggest-take|pick-intent|takeSuggest|pickIntent/.test(embedSrc),
    "e6 a suggestion is taken only by the agent: " + routes.calls + " calls of takeSuggest in the picker, each under a click or Enter ("
    + routes.byAgent + "), suggest-take asked only by the picker's own handler (" + routes.inHandler + "), and nothing of the model reaches either");
  const anchor = "    suggest = Array.isArray(o.suggest) ? o.suggest.filter(s => s && s.id) : [];\n";
  const autoPick = MAIN.split(anchor).length === 2 ? pickRoutes(MAIN.replace(anchor, anchor + "    if (suggest.length) takeSuggest(suggest[0].id, false);\n")) : null;
  check(!!autoPick && !e6ok(autoPick), "e6p with a pick of the first row planted after the strip arrives, the leg above fails ("
    + (autoPick ? autoPick.calls + " calls" : "anchor not found") + ")");

  /* ---- e7 nothing leaves ---------------------------------------------------------------------------------------- */
  const code = embedSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const reqs = [...code.matchAll(/\brequire\s*\(\s*([^)]*)\)/g)].map(m => m[1].trim());
  /* The capture stops at the first closing bracket, so a path.join is held here without its own. */
  const allowed = ['"node:fs"', '"node:path"', '"node:crypto"', '"./core.cjs"', 'path.join(mods, "onnxruntime-node"',
    'path.join(mods, "@huggingface", "tokenizers", "dist", "tokenizers.cjs"'];
  const odd = reqs.filter(r => allowed.indexOf(r) < 0);
  const reach = code.match(/\b(fetch|XMLHttpRequest|WebSocket|writeFile\w*|appendFile\w*|createWriteStream|console)\b/g) || [];
  check(odd.length === 0 && reach.length === 0 && reqs.length >= 6,
    "e7 the model's three files require only " + allowed.length + " known modules and reach no network, file write or log: odd "
    + JSON.stringify(odd) + ", reach " + JSON.stringify(reach));

  /* ---- e8 the real model, opt-in --------------------------------------------------------------------------------- */
  const realModel = process.env.ETIUDA_EMBED_MODEL || "", realRuntime = process.env.ETIUDA_EMBED_RUNTIME || "";
  if (realModel && realRuntime) {
    const real = createEmbedSuggest({ fork: nodeFork({ ETIUDA_EMBED_TEST_PIN: "" }), dir: realModel, runtime: realRuntime });
    real.setOn(true);
    const w0 = Date.now();
    real.warm([{ id: "name", texts: ["Changing the name - the name on a booking is changed", "Zmiana nazwiska - zmiana nazwiska na rezerwacji"] },
      { id: "bag", texts: ["Extra baggage - adding a bag to a booking", "Dodatkowy bagaż - dodanie bagażu do rezerwacji"] },
      { id: "refund", texts: ["Refunds - money back for a cancelled flight", "Zwrot pieniędzy - zwrot za odwołany lot"] }], "R1");
    await until(() => real.readyFor("R1") || real.state().status !== "warming", 60000);
    const warmMs = Date.now() - w0;
    const times = [], tops = [];
    for (const text of ["Hello, I would like to change the name on my booking please",
                        "Dzień dobry, chciałbym zmienić nazwisko na rezerwacji", "Can I take another suitcase with me?"]) {
      const s = Date.now();
      const r = await real.rank(text, 5000);
      times.push(Date.now() - s);
      tops.push(r && r[0] ? r[0].id : null);
    }
    real.stop();
    check(real.state().status !== "refused" && tops.join(",") === "name,name,bag" && Math.max(...times) < 250,
      "e8 the real model, pin checked and warmed in " + warmMs + " ms, ranks the invented messages " + tops.join(",") + " in " + times.join(", ") + " ms");
  } else console.log("  --   e8 the real model: not run, as ETIUDA_EMBED_MODEL and ETIUDA_EMBED_RUNTIME are unset (opt-in, never a gate)");
} finally {
  fs.rmSync(LAB, { recursive: true, force: true });
}

console.log("#counts checks=" + checks + " failed=" + failed);
console.log(failed ? "RESULT: FAIL" : "RESULT: OK");
process.exit(failed ? 1 : 0);
