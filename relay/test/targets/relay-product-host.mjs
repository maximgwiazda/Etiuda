/* The relay half of relay-product.cjs: a worker thread running relay/worker.mjs over relay/test/stand-ins.cjs. Each
   request is answered with its response and the socket messages sent since, and then the waiting adapter is woken. */
import { workerData } from "node:worker_threads";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shared, port } = workerData;
let worker = null, standIns = null, loadError = null;
try {
  standIns = require("../stand-ins.cjs");
  worker = (await import("../../worker.mjs")).default;
} catch (e) { loadError = String(e && e.stack ? e.stack : e); }

const instances = new Map();
let next = 0;

function drain(inst) {
  const out = [];
  for (const [id, ws] of inst.sockets) {
    const seen = inst.seen.get(id) || 0;
    if (ws.sent.length > seen) out.push({ socket: id, messages: ws.sent.slice(seen) });
    inst.seen.set(id, ws.sent.length);
  }
  return out;
}

async function request(inst, a) {
  const init = { method: a.method, headers: a.headers };
  if (a.body) init.body = a.body;
  const res = await worker.fetch(new Request("https://relay.test" + a.path, init), inst.R.env);
  const body = new Uint8Array(await res.arrayBuffer());
  const socket = res.headers.get("x-stand-in-socket");
  if (socket) {
    for (const hub of inst.R.hubs.values()) {
      const ws = hub.byId(socket);
      if (ws) inst.sockets.set(socket, ws);
    }
  }
  return { status: res.status, body, blob: res.headers.get("etiuda-blob"), socket, events: drain(inst) };
}

/* What the relay keeps for one id, read from the stand-ins rather than asked of the relay, with every entry of the
   team's storage beside it, so a path or a body kept anywhere is in what the harness reads. */
function inspect(inst, rt, id) {
  const store = inst.R.stores.get(rt);
  if (!store) return null;
  const rec = store.get("blob:" + id), tomb = store.get("tomb:" + id);
  if (!rec && !tomb) return null;
  const raw = store.dump();
  if (!rec) return { relayTeamId: rt, id, superseded: tomb.why === "superseded", ciphertext: null, raw };
  const ct = inst.R.bucket.objects.get(rec.obj);
  return { relayTeamId: rt, id: rec.id, supersedes: rec.supersedes, size: rec.size, seq: rec.seq, writerKeyId: rec.writer,
    ciphertext: ct ? new Uint8Array(ct) : null, nonce: rec.nonce, deletion: rec.del, epoch: rec.epoch, superseded: false, raw };
}

async function handle(op, a) {
  if (loadError) throw new Error(loadError);
  if (op === "new") {
    next += 1;
    const limits = a.teamMax != null ? { teamMax: a.teamMax } : undefined;
    instances.set(next, { R: standIns.relayEnv({ limits }), sockets: new Map(), seen: new Map() });
    return next;
  }
  const inst = instances.get(a.inst);
  if (!inst) throw new Error("no relay instance " + a.inst);
  if (op === "fetch") return request(inst, a);
  if (op === "advance") { inst.R.clock.now += a.ms; return inst.R.clock.now; }
  if (op === "restart") { inst.R.restart(); return true; }
  if (op === "inspect") return inspect(inst, a.rt, a.id);
  throw new Error("no operation " + op);
}

port.on("message", async msg => {
  let answer;
  try { answer = { result: await handle(msg.op, msg.args || {}) }; }
  catch (e) { answer = { error: String(e && e.stack ? e.stack : e) }; }
  port.postMessage(answer);
  Atomics.store(shared, 0, 1);
  Atomics.notify(shared, 0);
});
