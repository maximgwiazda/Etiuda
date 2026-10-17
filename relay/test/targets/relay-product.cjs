"use strict";
/* The relay as built behind the harness's relay half, and the harness's own model as the program half. The relay is
   relay/worker.mjs over the stand-ins, in a worker thread, because createTarget and every method here are synchronous:
   each call posts one request and waits for its answer. Every relay call is the protocol's HTTP, the lead's three
   signed with the lead's key; an upload or a deletion fetch opens its writer's session first, as a program would.
   Nothing here contacts a host. */
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker, MessageChannel, receiveMessageOnPort } = require("node:worker_threads");
const model = require("./model.cjs");
const core = require("../../core.cjs");

const WAIT_MS = 120000;
let host = null;

function call(op, args) {
  if (!host) {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    const thread = new Worker(path.join(__dirname, "relay-product-host.mjs"), { workerData: { shared, port: port2 }, transferList: [port2] });
    thread.unref();
    host = { shared, port: port1 };
  }
  Atomics.store(host.shared, 0, 0);
  host.port.postMessage({ op, args });
  let waited = 0;
  for (;;) {
    const got = receiveMessageOnPort(host.port);
    if (got) {
      if (got.message.error) throw new Error("relay host: " + got.message.error);
      return got.message.result;
    }
    if (waited >= WAIT_MS) throw new Error("the relay host did not answer");
    if (Atomics.wait(host.shared, 0, 0, 1000) === "timed-out") waited += 1000;
  }
}

function sign(privateHex, bytes) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateHex, "hex"), format: "der", type: "pkcs8" });
  return crypto.sign(null, bytes, key).toString("hex");
}

const sha256 = s => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

function createTarget(limits) {
  const prog = model.createTarget(limits);
  const inst = call("new", { teamMax: limits && limits.teamMax != null ? limits.teamMax : null });
  let now = 0;
  const teams = new Map();
  const keys = new Map();
  const sessions = new Map();
  const subs = new Map();
  const ingested = new Set();

  function http(method, p, o) {
    const opts = o || {};
    const headers = {};
    if (typeof opts.token === "string") headers.authorization = "Bearer " + opts.token;
    if (opts.meta) headers["etiuda-blob"] = Buffer.from(JSON.stringify(opts.meta), "utf8").toString("base64url");
    if (opts.upgrade) headers.upgrade = "websocket";
    let body = null;
    if (opts.json !== undefined) body = Buffer.from(JSON.stringify(opts.json), "utf8");
    if (opts.bytes) { body = opts.bytes; headers["content-length"] = String(opts.bytes.length); }
    const r = call("fetch", { inst, method, path: p, headers, body });
    for (const e of r.events) {
      const into = subs.get(e.socket);
      if (!into) continue;
      for (const text of e.messages) {
        const msg = JSON.parse(text);
        if (msg.type !== "new") continue;
        const event = Object.assign({}, msg);
        delete event.type;
        into.push(event);
      }
    }
    const bytes = Buffer.from(r.body);
    let json = null;
    try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
    const meta = r.blob ? JSON.parse(Buffer.from(r.blob, "base64url").toString("utf8")) : null;
    return { status: r.status, json, bytes, meta, socket: r.socket };
  }

  function refusalOf(r) {
    const j = r.json || {};
    return { ok: false, reason: typeof j.error === "string" ? j.error : "missing", said: typeof j.said === "string" ? j.said : "",
      served: false };
  }

  const teamPath = (rt, rest) => "/relay/v1/t/" + rt + "/" + rest;

  function postDevices(rt, team, nextDevices) {
    const rev = team.rev + 1;
    const list = [...nextDevices].map(([id, v]) => ({ id, pub: v.pub, desk: v.desk }));
    const sig = sign(team.lead.privateKey, core.devicesBytes(rt, rev, now, list));
    const r = http("POST", teamPath(rt, "devices"), { json: { keys: list, rev, t: now, sig } });
    if (r.status !== 200) return refusalOf(r);
    team.rev = rev;
    team.devices = nextDevices;
    return { ok: true };
  }

  function challenge({ relayTeamId }) {
    const r = http("POST", teamPath(relayTeamId, "hello"), { json: {} });
    return r.status === 200 ? { nonce: r.json.challenge } : refusalOf(r);
  }

  function hello(input) {
    const body = input.token !== undefined
      ? { challenge: input.nonce, invite: input.token, inv: input.invitationId }
      : { challenge: input.nonce, key: input.keyId, sig: input.signature };
    if (input.publicKey !== undefined && input.token === undefined) body.pub = input.publicKey;
    const r = http("POST", teamPath(input.relayTeamId, "session"), { json: body });
    return r.status === 200 ? { ok: true, session: r.json.session } : refusalOf(r);
  }

  /* The session a program would hold for its own key, opened with a fresh challenge when it has none or it has ended. */
  function sessionFor(rt, keyId, renew) {
    const held = sessions.get(rt + ":" + keyId);
    if (held && !renew && now < held.until) return { ok: true, token: held.token, held: true };
    const privateKey = keys.get(keyId);
    if (!privateKey) return { ok: true, token: null, held: false };
    const ch = challenge({ relayTeamId: rt });
    if (!ch.nonce) return ch;
    const r = http("POST", teamPath(rt, "session"), { json: { challenge: ch.nonce, key: keyId,
      sig: sign(privateKey, core.helloBytes(rt, ch.nonce, keyId)) } });
    if (r.status !== 200) return refusalOf(r);
    sessions.set(rt + ":" + keyId, { token: r.json.session, until: r.json.until });
    return { ok: true, token: r.json.session, held: false };
  }

  function withSession(rt, keyId, act) {
    let s = sessionFor(rt, keyId, false);
    if (!s.ok) return s;
    let r = act(s.token);
    if (r.status === 401 && s.held) {
      s = sessionFor(rt, keyId, true);
      if (!s.ok) return s;
      r = act(s.token);
    }
    return r;
  }

  /* The protocol's fields over whatever else the blob carries, so the relay is the one that drops a path or a body. */
  function metaOf(blob) {
    const extra = {};
    for (const k of Object.keys(blob)) if (!Buffer.isBuffer(blob[k]) && typeof blob[k] !== "function") extra[k] = blob[k];
    return Object.assign(extra, { v: 1, id: blob.id, supersedes: blob.supersedes == null ? null : blob.supersedes, epoch: blob.epoch,
      writer: blob.writerKeyId, counter: blob.counter, del: !!blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place });
  }

  function envelope(rt, r) {
    return { ok: true, served: true, id: r.meta.id, ciphertext: r.bytes, nonce: r.meta.nonce, signature: r.meta.sig,
      epoch: r.meta.epoch, supersedes: r.meta.supersedes, writerKeyId: r.meta.writer, counter: r.meta.counter, deletion: r.meta.del,
      relayTeamId: rt };
  }

  const target = {
    start() { return { ok: true }; },
    pin(input) { return prog.pin(input); },

    createTeam({ teamId, lead }) {
      const rt = crypto.randomBytes(16).toString("hex");
      const sig = sign(lead.privateKey, core.createBytes(rt, lead.keyId, now));
      const r = http("POST", "/relay/v1/teams", { json: { rt, lead: { keyId: lead.keyId, pub: lead.publicKey }, t: now, sig } });
      if (r.status !== 200) return refusalOf(r);
      keys.set(lead.keyId, lead.privateKey);
      teams.set(rt, { lead, rev: 0, devices: new Map() });
      return { relayTeamId: rt, teamId };
    },
    /* The relay takes the team's epoch from the lead's own uploads; it is given no key, so there is nothing to record. */
    addEpoch({ relayTeamId, epoch }) { return { ok: true, relayTeamId, epoch }; },
    enrol({ relayTeamId, deskId, keyId }) {
      const team = teams.get(relayTeamId);
      if (!team) return { ok: false, reason: "not-enrolled", said: "", served: false };
      const nextDevices = new Map(team.devices);
      nextDevices.set(keyId, { pub: keyId, desk: deskId });
      return postDevices(relayTeamId, team, nextDevices);
    },
    removeDesk({ relayTeamId, deskId }) {
      const team = teams.get(relayTeamId);
      if (!team) return { ok: false, reason: "not-enrolled", said: "", served: false };
      const nextDevices = new Map([...team.devices].filter(([, v]) => v.desk !== deskId));
      return postDevices(relayTeamId, team, nextDevices);
    },
    invite({ relayTeamId }) {
      const team = teams.get(relayTeamId);
      const token = crypto.randomBytes(32).toString("hex"), invitationId = crypto.randomBytes(16).toString("hex");
      const add = [{ id: invitationId, hash: sha256(token) }];
      const sig = sign(team.lead.privateKey, core.invitesBytes(relayTeamId, now, add, []));
      const r = http("POST", teamPath(relayTeamId, "invites"), { json: { add, drop: [], t: now, sig } });
      return r.status === 200 ? { token, invitationId } : refusalOf(r);
    },
    challenge,
    hello,
    helloMessage(relayTeamId, nonce, keyId) { return core.helloBytes(relayTeamId, nonce, keyId); },

    list({ relayTeamId, session }) {
      const ids = [];
      for (let after = 0; ;) {
        const r = http("GET", teamPath(relayTeamId, "since/" + after), { token: session });
        if (r.status !== 200) return refusalOf(r);
        for (const e of r.json) if (!e.meta.del) ids.push(e.meta.id);
        if (r.json.length < 1000) break;
        after = r.json[r.json.length - 1].seq;
      }
      return { ok: true, served: true, ids };
    },
    fetch({ relayTeamId, session, id }) {
      const r = http("GET", teamPath(relayTeamId, "b/" + id), { token: session });
      if (r.status !== 200) return refusalOf(r);
      const e = envelope(relayTeamId, r);
      delete e.deletion;
      delete e.relayTeamId;
      return e;
    },
    subscribe({ relayTeamId, session }) {
      const r = http("GET", teamPath(relayTeamId, "socket"), { token: session, upgrade: true });
      if (r.status !== 200 || !r.socket) return refusalOf(r);
      const events = [];
      subs.set(r.socket, events);
      return { ok: true, served: true, events };
    },
    upload({ relayTeamId, blob }) {
      const r = withSession(relayTeamId, blob.writerKeyId, token =>
        http("PUT", teamPath(relayTeamId, "b/" + blob.id), { token, meta: metaOf(blob), bytes: blob.ciphertext }));
      if (r.ok === false) return r;
      return r.status === 200 ? { ok: true, seq: r.json.seq, id: r.json.id } : refusalOf(r);
    },
    fetchDeletion({ relayTeamId, id }) {
      const team = teams.get(relayTeamId);
      const r = withSession(relayTeamId, team.lead.keyId, token => http("GET", teamPath(relayTeamId, "b/" + id), { token }));
      if (r.ok === false) return r;
      if (r.status !== 200) return refusalOf(r);
      return r.meta && r.meta.del === true ? { ok: true, served: true, id: r.meta.id }
        : { ok: false, reason: "missing", said: "The relay has no such blob.", served: false };
    },
    /* The relay holds no team key and has no way to re-seal: an epoch moves with the lead's next upload. */
    epochMove() { return { resealed: false }; },
    inspect({ relayTeamId, id }) {
      const rec = call("inspect", { inst, rt: relayTeamId, id });
      if (rec && rec.ciphertext) rec.ciphertext = Buffer.from(rec.ciphertext);
      return rec;
    },

    seal(opts) {
      if (opts && opts.writer && opts.writer.keyId && opts.writer.privateKey) keys.set(opts.writer.keyId, opts.writer.privateKey);
      return prog.seal(opts);
    },
    acceptBlob(input) {
      const r = prog.acceptBlob(input);
      if (r && r.ok && input && input.blob && input.blob.id) ingested.add(input.blob.relayTeamId + ":" + input.blob.id);
      return r;
    },
    loadTeamFile(doc) { return prog.loadTeamFile(doc); },
    showFreshness(input) { return prog.showFreshness(input); },
    /* The program's catch-up through the relay as built: the list under this session, then each blob it does not hold. */
    syncMirror({ relayTeamId, session, teamKey, teamDoc }) {
      const listed = target.list({ relayTeamId, session });
      if (!listed.ok) return { ok: true };
      for (const id of listed.ids) {
        if (ingested.has(relayTeamId + ":" + id)) continue;
        const r = http("GET", teamPath(relayTeamId, "b/" + id), { token: session });
        if (r.status !== 200) continue;
        target.acceptBlob({ teamKey, teamDoc, blob: envelope(relayTeamId, r) });
      }
      return { ok: true };
    },
    considerOutgoing(input) { return prog.considerOutgoing(input); },
    readRing(input) { return prog.readRing(input); },
    verifyDeskSignature(input) { return prog.verifyDeskSignature(input); },
    verifyUploadSignature(input) { return prog.verifyUploadSignature(input); },
    programAllowUpload(input) { return prog.programAllowUpload(input); },
    restart() {
      call("restart", { inst });
      sessions.clear();
      return prog.restart();
    },
    readMirror(p) { return prog.readMirror(p); },
    advance(ms) {
      now += ms;
      call("advance", { inst, ms });
      prog.advance(ms);
      return now;
    },
  };
  return target;
}

module.exports = { createTarget };
