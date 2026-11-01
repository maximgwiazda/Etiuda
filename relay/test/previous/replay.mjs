/* A release's requests to the relay, kept frozen in this folder and sent again to the relay as it stands, which must answer
   each as it did (the version policy's point 2: the relay answers the previous protocol's routes and metadata as before).
   record.mjs writes a fixture once per release; tests/relay-unit.mjs replays every one. What the relay chooses itself, a
   challenge, a session, a socket's id or a copy's stamp, is kept as a placeholder, and a hello's signature, which covers its
   challenge, is made again over the frozen text with the new challenge in it. */
import crypto from "node:crypto";

const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const sha256 = b => crypto.createHash("sha256").update(b).digest("hex");
export const keyOfSeed = seed => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" });
export const signText = (seed, text) => crypto.sign(null, Buffer.from(text, "utf8"), keyOfSeed(seed)).toString("hex");

/* The values the relay chose in an answer, by kind, in the order a step meets them. */
const CHOSEN = [
  ["challenge", r => (r.json && typeof r.json.challenge === "string" ? r.json.challenge : null)],
  ["session", r => (r.json && typeof r.json.session === "string" ? r.json.session : null)],
  ["socket", r => r.socket || null],
  ["made", r => (r.json && typeof r.json.made === "string" ? r.json.made : null)],
];

/* Each value the relay chose and the name it stands under: `out` writes a value as its name, `into` a name as its value. */
export function placeholders() {
  const toName = new Map(), toValue = new Map(), count = {};
  const walk = (v, map) => {
    if (typeof v === "string") return map(v);
    if (Array.isArray(v)) return v.map(x => walk(x, map));
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k], map); return o; }
    return v;
  };
  /* A challenge, a session or a copy's stamp is long and random, so it is found inside a text (a bearer header, a signed
     text); a socket's id is short, so only a text that is the id is it. */
  const exact = new Set();
  const swap = pairs => s => {
    let t = s;
    for (const [from, to] of pairs) {
      if (exact.has(from) || exact.has(to)) { if (t === from) return to; continue; }
      if (t.indexOf(from) >= 0) t = t.split(from).join(to);
    }
    return t;
  };
  return {
    bindFrom(res) {
      for (const [kind, pick] of CHOSEN) {
        const value = pick(res);
        if (!value || toName.has(value)) continue;
        count[kind] = (count[kind] || 0) + 1;
        const name = "$" + kind + count[kind] + "$";
        toName.set(value, name);
        toValue.set(name, value);
        if (kind === "socket") { exact.add(value); exact.add(name); }
      }
    },
    out: v => walk(v, swap([...toName.entries()])),
    into: v => walk(v, swap([...toValue.entries()])),
    value: name => toValue.get(name),
  };
}

/* One request as the fixture holds it, sent to `worker` over the relay env `R`, and the answer as the fixture holds it. The
   blob header is kept as its JSON and a body as hex, so the file holds no base64, whose letters can spell anything. */
export async function send(worker, R, req) {
  const init = { method: req.method, headers: Object.assign({}, req.headers || {}) };
  if (req.blob) init.headers["etiuda-blob"] = Buffer.from(JSON.stringify(req.blob), "utf8").toString("base64url");
  if (req.body && req.method !== "GET") {
    init.body = req.body.hex !== undefined ? Buffer.from(req.body.hex, "hex") : JSON.stringify(req.body.json);
    init.duplex = "half";
  }
  const res = await worker.fetch(new Request("https://relay.test" + req.path, init), R.env);
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
  const head = n => {
    const v = res.headers.get(n);
    if (!v) return null;
    try { return JSON.parse(Buffer.from(v, "base64url").toString("utf8")); } catch { return "unreadable " + v; }
  };
  return { status: res.status, json, sha256: json === null && bytes.length ? sha256(bytes) : null,
    meta: head("etiuda-blob"), lapse: head("etiuda-lapse"), socket: res.headers.get("x-stand-in-socket") };
}

/* What every open socket the relay handed out has been sent since the last look, by its id. */
export function socketsSaid(R, seen) {
  const out = {};
  for (const hub of R.hubs.values()) {
    for (const ws of hub.open.concat([])) {
      const from = seen.get(ws.id) || 0;
      if (ws.sent.length > from) out[ws.id] = ws.sent.slice(from).map(m => { try { return JSON.parse(m); } catch { return m; } });
      seen.set(ws.id, ws.sent.length);
    }
  }
  return out;
}

/* The fixture sent again, step by step, each at its own clock. Answers the steps sent and every one answered otherwise. */
export async function replay(fixture, worker, relayEnv) {
  const R = relayEnv();
  const ph = placeholders(), seen = new Map(), differ = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (let i = 0; i < fixture.steps.length; i++) {
    const step = fixture.steps[i];
    R.clock.now = step.at;
    const req = ph.into(step.req);
    if (step.sign) req.body.json[step.sign.field] = signText(fixture.keys[step.sign.key].seed, ph.into(step.sign.text));
    let res;
    try { res = await send(worker, R, req); } catch (e) { differ.push({ step: i, what: step.what, got: "threw " + e.message }); continue; }
    ph.bindFrom(res);
    const got = ph.out(res);
    const said = {};
    for (const [id, msgs] of Object.entries(socketsSaid(R, seen))) said[ph.out(id)] = ph.out(msgs);
    if (!same(got, step.res)) differ.push({ step: i, what: step.what, want: step.res, got });
    else if (!same(said, step.sent || {})) differ.push({ step: i, what: step.what, want: step.sent || {}, got: said });
  }
  return { steps: fixture.steps.length, differ };
}
