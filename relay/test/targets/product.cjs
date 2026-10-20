"use strict";
/* The product behind the harness: the relay as built (relay/worker.mjs over the stand-ins, in the worker thread
   relay-product-host.mjs runs) for the relay half, and the channel layer as built (shell/relay/channel.cjs's program over
   shell/relay/blob.cjs) for the program half. No model code: the harness's model.cjs and wire.cjs are not loaded. The
   relay half is relay-product.cjs's, every call the protocol's HTTP; the program's mirror is held in memory, so nothing
   here writes to the disk or contacts a host. */
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker, MessageChannel, receiveMessageOnPort } = require("node:worker_threads");
const core = require("../../core.cjs");
const B = require("../../../shell/relay/blob.cjs");
const C = require("../../../shell/relay/channel.cjs");

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

/* A box's agreement with another (X25519), lent to the channel layer as the shell lends it; and the shell's part on a
   team file landing, stood in for: the key taken from this desk's own wrap, in the contract's bytes. */
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
function agreeWith(privateHex) {
  return peer => {
    try {
      return crypto.diffieHellman({ privateKey: crypto.createPrivateKey({ key: Buffer.from(privateHex, "hex"), format: "der", type: "pkcs8" }),
        publicKey: crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(String(peer), "hex")]), format: "der", type: "spki" }) });
    } catch { return null; }
  };
}
function unwrapKey(privateHex, wrap, teamId, epoch, deskId) {
  try {
    if (!wrap || wrap.epoch !== epoch) return null;
    const info = Buffer.from("etiuda-relay-wrap\n" + teamId + "\n" + epoch + "\n" + deskId + "\n", "utf8");
    const k = Buffer.from(crypto.hkdfSync("sha256", agreeWith(privateHex)(wrap.enc), Buffer.alloc(0), info, 32));
    const raw = Buffer.from(String(wrap.ct), "hex");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
  } catch { return null; }
}

/* The program's mirror, in memory, under the same path rule as the disk's. */
function memoryIO() {
  const files = new Map();
  const key = rel => { const p = B.checkPath(rel); return p.ok ? p.path : null; };
  return {
    read(rel) { const k = key(rel); return k !== null && files.has(k) ? Buffer.from(files.get(k), "utf8") : null; },
    write(rel, text) { const k = key(rel); if (k === null) throw new Error("that path stays outside the mirror"); files.set(k, String(text)); },
    remove(rel) { const k = key(rel); if (k !== null) files.delete(k); },
    list() { return [...files.keys()]; },
  };
}

function createTarget(limits) {
  const teamMax = limits && limits.teamMax != null ? limits.teamMax : undefined;
  const inst = call("new", { teamMax: teamMax != null ? teamMax : null });
  let now = 0;
  const teams = new Map();
  const keys = new Map();
  const sessions = new Map();
  const subs = new Map();

  /* The program: its state kept as the text a restart reads back, its pin kept by the adapter as the host keeps it. */
  const io = memoryIO();
  let saved = null, pinned = null;
  const said = [];
  function newProgram() {
    return C.createProgram({ io, clock: () => now, say: l => said.push(l), teamMax,
      load: () => (saved ? JSON.parse(saved) : null), save: s => { saved = JSON.stringify(s); }, pin: pinned });
  }
  let prog = newProgram();
  /* The lead's own program, for sealTeam: its mirror and record apart from the desk's. */
  let leadSide = null;

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
    let body;
    if (input.token !== undefined) {
      body = { challenge: input.nonce, invite: input.token, inv: input.invitationId };
      const key = input.key !== undefined ? input.key : input.keyId;
      const pub = input.pub !== undefined ? input.pub : input.publicKey;
      const sig = input.sig !== undefined ? input.sig : input.signature;
      if (key !== undefined) body.key = key;
      if (pub !== undefined) body.pub = pub;
      if (sig !== undefined) body.sig = sig;
    } else {
      body = { challenge: input.nonce, key: input.keyId, sig: input.signature };
      if (input.publicKey !== undefined) body.pub = input.publicKey;
    }
    const r = http("POST", teamPath(input.relayTeamId, "session"), { json: body });
    if (r.status !== 200) return refusalOf(r);
    const out = { ok: true, session: r.json.session };
    if (r.json.until !== undefined) out.until = r.json.until;
    if (r.json.invite === true) out.invite = true;
    const boundKey = input.key !== undefined ? input.key : input.keyId;
    if (out.invite && boundKey) {
      sessions.set(input.relayTeamId + ":" + boundKey, {
        token: r.json.session,
        until: r.json.until,
        invite: true,
      });
    }
    return out;
  }

  function postInvites(relayTeamId, add, drop, wraps, opts) {
    const team = teams.get(relayTeamId);
    if (!team) return { ok: false, reason: "not-enrolled", said: B.REASONS["not-enrolled"], served: false };
    const o = opts || {};
    const signer = o.signer || team.lead;
    const covered = o.cover === "bare" ? undefined : wraps;
    let sig = sign(signer.privateKey, core.invitesBytes(relayTeamId, now, add, drop, covered));
    if (o.signed === false) sig = sig.slice(-1) === "a" ? sig.slice(0, -1) + "b" : sig.slice(0, -1) + "a";
    const json = { add: add, drop: drop, t: now, sig: sig };
    if (wraps !== undefined) json.wraps = wraps;
    return http("POST", teamPath(relayTeamId, "invites"), { json: json });
  }

  function openWrap(input) {
    try {
      const wrap = input && input.wrap;
      const teamDoc = (input && input.teamDoc) || {};
      if (!wrap || Number(wrap.epoch) !== Number(teamDoc.epoch)) {
        return { ok: false, reason: "epoch", said: B.REASONS.epoch, served: false };
      }
      const secret = Buffer.isBuffer(input.secret) ? input.secret : Buffer.from(String(input.secret), "hex");
      const wrapKey = Buffer.from(crypto.hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from("etiuda-invite-wrap", "utf8"), 32));
      const ad = Buffer.from(["etiuda-invite-wrap", String(input.relayTeamId), String(input.teamId), String(input.invitationId), String(wrap.epoch), ""].join("\n"), "utf8");
      const raw = Buffer.from(String(wrap.ct), "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", wrapKey, raw.subarray(0, 12));
      decipher.setAAD(ad);
      decipher.setAuthTag(raw.subarray(raw.length - 16));
      const plain = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8"));
      return { ok: true, epoch: plain.epoch, key: Buffer.from(plain.key, "hex") };
    } catch (e) {
      return { ok: false, reason: "bad-signature", said: B.REASONS["bad-signature"], served: false };
    }
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
      sig: sign(privateKey, C.helloBytes(rt, ch.nonce, keyId)) } });
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

  function listed(relayTeamId, session) {
    const out = [];
    for (let after = 0; ;) {
      const r = http("GET", teamPath(relayTeamId, "since/" + after), { token: session });
      if (r.status !== 200) return { refused: refusalOf(r) };
      for (const e of r.json) out.push(e);
      if (r.json.length < 1000) break;
      after = r.json[r.json.length - 1].seq;
    }
    return { items: out };
  }

  const target = {
    start() { return { ok: true }; },
    pin(input) {
      const i = input || {};
      if (!i.leadKeyId) return { ok: false, reason: "not-enrolled", said: B.REASONS["not-enrolled"], served: false };
      pinned = { teamId: i.teamId, rt: i.relayTeamId, lead: { keyId: i.leadKeyId, public: i.leadKeyId } };
      return prog.setPin(pinned);
    },

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
      const posted = postDevices(relayTeamId, team, nextDevices);
      /* Enrolling the bound key ends its invitation sessions at the relay, so the desk's next call says hello as itself. */
      const held = sessions.get(relayTeamId + ":" + keyId);
      if (posted.ok !== false && held && held.invite) sessions.delete(relayTeamId + ":" + keyId);
      return posted;
    },
    removeDesk({ relayTeamId, deskId }) {
      const team = teams.get(relayTeamId);
      if (!team) return { ok: false, reason: "not-enrolled", said: "", served: false };
      const nextDevices = new Map([...team.devices].filter(([, v]) => v.desk !== deskId));
      return postDevices(relayTeamId, team, nextDevices);
    },
    invite(input) {
      const relayTeamId = input.relayTeamId;
      const token = crypto.randomBytes(32).toString("hex");
      const invitationId = input.invitationId || crypto.randomBytes(16).toString("hex");
      const row = { id: invitationId, hash: sha256(token) };
      if (input.wrap !== undefined) row.wrap = input.wrap;
      if (input.until !== undefined) row.until = input.until;
      const r = postInvites(relayTeamId, [row], [], undefined, input);
      if (r.ok === false) return r;
      return r.status === 200 ? { token: token, invitationId: invitationId } : refusalOf(r);
    },
    reseal(input) {
      const r = postInvites(input.relayTeamId, [], input.drop || [], input.wraps || [], input);
      if (r.ok === false) return r;
      if (r.status !== 200) return refusalOf(r);
      const body = r.json || {};
      return { ok: true, dropped: body.dropped || [], used: body.used || [] };
    },
    drop(input) {
      const r = postInvites(input.relayTeamId, [], input.ids || [], undefined, input);
      if (r.ok === false) return r;
      if (r.status !== 200) return refusalOf(r);
      const body = r.json || {};
      return { ok: true, dropped: body.dropped || [], used: body.used || [] };
    },
    fetchWrap({ relayTeamId, session }) {
      const r = http("GET", teamPath(relayTeamId, "wrap"), { token: session });
      if (r.status !== 200) return refusalOf(r);
      if (!r.json || r.json.wrap == null) return { ok: false, reason: "missing", said: B.REASONS.missing, served: false };
      return { ok: true, served: true, wrap: r.json.wrap };
    },
    inviteStates({ relayTeamId, session }) {
      const r = http("GET", teamPath(relayTeamId, "states"), { token: session });
      if (r.status !== 200) return refusalOf(r);
      return { ok: true, served: true, states: r.json && r.json.states };
    },
    openWrap,
    challenge,
    hello,
    helloMessage(relayTeamId, nonce, keyId) { return C.helloBytes(relayTeamId, nonce, keyId); },

    list({ relayTeamId, session }) {
      const got = listed(relayTeamId, session);
      if (got.refused) return got.refused;
      return { ok: true, served: true, ids: got.items.filter(e => !e.meta.del).map(e => e.meta.id) };
    },
    fetch({ relayTeamId, session, id }) {
      const r = http("GET", teamPath(relayTeamId, "b/" + id), { token: session });
      if (r.status !== 200) return refusalOf(r);
      return { ok: true, served: true, id: r.meta.id, ciphertext: r.bytes, nonce: r.meta.nonce, signature: r.meta.sig,
        epoch: r.meta.epoch, supersedes: r.meta.supersedes, writerKeyId: r.meta.writer, counter: r.meta.counter };
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
        : { ok: false, reason: "missing", said: B.REASONS.missing, served: false };
    },
    /* The relay holds no team key and has no way to re-seal: an epoch moves with the lead's next upload. */
    epochMove() { return { resealed: false }; },
    inspect({ relayTeamId, id }) {
      const rec = call("inspect", { inst, rt: relayTeamId, id });
      if (rec && rec.ciphertext) rec.ciphertext = Buffer.from(rec.ciphertext);
      return rec;
    },

    /* ---- the program: channel.cjs and blob.cjs ---- */
    seal(opts) {
      if (opts && opts.writer && opts.writer.keyId && opts.writer.privateKey) keys.set(opts.writer.keyId, opts.writer.privateKey);
      return B.seal(opts);
    },
    acceptBlob(input) { return prog.acceptBlob(input); },
    /* The channel's own receipt. Not model.cjs: a forward there would pass slice 2 without the channel doing it. */
    acceptDeskFile(input) { return prog.acceptBlob(input); },
    loadTeamFile(doc) { return prog.loadTeamFile(doc); },
    showFreshness(input) { return prog.showFreshness(input); },
    /* The program's catch-up through the relay as built: the list under this session, each blob it does not hold fetched,
       and the batch judged and applied by the channel layer's own applyBatch, the team file passed held as its trust. */
    syncMirror({ relayTeamId, session, teamKey, teamDoc, box, deskId }) {
      if (relayTeamId !== (pinned && pinned.rt)) return { ok: true };
      const got = listed(relayTeamId, session);
      if (got.refused) return { ok: true };
      const held = prog.holdTeam(teamDoc);
      if (!held.ok) return { ok: true };
      const keysHeld = new Map([[held.epoch, teamKey]]);
      const ctx = { keyFor: e => keysHeld.get(e) || null };
      /* A desk with a box (M1): its own copy of the team file opened by the channel layer, and the key from its wrap. */
      if (box && typeof deskId === "string") Object.assign(ctx, { agree: agreeWith(box.private), self: { place: "desk:" + deskId, box: box.public },
        onTeam: () => {
          let doc = null;
          try { doc = JSON.parse(prog.readMirror(C.TEAM_NAME)); } catch { doc = null; }
          const mine = doc && Array.isArray(doc.roster) ? doc.roster.find(r => r && r.desk && r.desk.id === deskId) : null;
          const key = mine ? unwrapKey(box.private, mine.wrap, doc.id, doc.epoch, deskId) : null;
          if (key) keysHeld.set(doc.epoch, key);
        } });
      const taken = prog.state().taken;
      const items = [];
      for (const e of got.items) {
        if (Object.prototype.hasOwnProperty.call(taken, e.meta.id)) continue;
        const r = http("GET", teamPath(relayTeamId, "b/" + e.meta.id), { token: session });
        if (r.status !== 200) continue;
        items.push({ seq: e.seq, meta: r.meta, ct: r.bytes });
      }
      prog.applyBatch(items, ctx);
      /* What waited for a key the batch brought, fetched again as the channel's retryPending does. */
      const again = [];
      for (const p of prog.pending().filter(q => ctx.keyFor(q.epoch))) {
        const r = http("GET", teamPath(relayTeamId, "b/" + p.id), { token: session });
        if (r.status === 200) again.push({ seq: p.seq, meta: r.meta, ct: r.bytes, floor: p.floor });
      }
      if (again.length) prog.applyBatch(again, ctx);
      return { ok: true };
    },
    /* The lead's side of a team file (M1): its own channel program, the team file and files at the root under the team
       key, and a copy of the team file for each desk its roster names, by the agreement of the lead's box with that desk's. */
    sealTeam({ relayTeamId, epoch, teamKey, writer, leadBox, teamDoc, files }) {
      if (!pinned || relayTeamId !== pinned.rt) return { ok: false, reason: "wrong-team", said: B.REASONS["wrong-team"], served: false };
      keys.set(writer.keyId, writer.privateKey);
      if (!leadSide) {
        const io2 = memoryIO();
        leadSide = { io: io2, prog: C.createProgram({ io: io2, clock: () => now, pin: pinned, teamMax }) };
      }
      leadSide.io.write(C.TEAM_NAME, JSON.stringify(teamDoc, null, 1) + "\n");
      for (const p of Object.keys(files || {})) leadSide.io.write(p, files[p]);
      const me = { keyId: writer.keyId, privateKey: writer.privateKey, place: "root" };
      const blobs = [];
      for (const op of leadSide.prog.owed(me, { agree: agreeWith(leadBox.private), keyFor: e => (e === epoch ? teamKey : null) })) {
        const blob = leadSide.prog.sealOut(op, me, { epoch, key: op.invite && op.invite.key ? op.invite.key : teamKey });
        leadSide.prog.sentOut(op, blob);
        blobs.push(Object.assign(blob, { relayTeamId }));
      }
      return { ok: true, blobs };
    },
    considerOutgoing(input) { return prog.considerOutgoing(input && input.path); },
    readRing(input) { return prog.readRing(input); },
    verifyDeskSignature(input) { return { ok: C.verifyDeskSignature(input.publicKey, input.body, input.signature) }; },
    verifyUploadSignature(input) { return { ok: C.verifyUploadSignature(input.publicKey, input.payload, input.signature) }; },
    programAllowUpload(input) { return prog.allowUpload(input && input.blob, input && input.deviceId, true); },
    /* Sessions, challenges and subscribers go; the program is made again from what it kept. */
    restart() {
      call("restart", { inst });
      sessions.clear();
      prog = newProgram();
      return { ok: true };
    },
    readMirror(p) { return prog.readMirror(p); },
    advance(ms) {
      now += ms;
      call("advance", { inst, ms });
      return now;
    },
  };
  return target;
}

module.exports = { createTarget };
