"use strict";
/* The team's Durable Object over HTTP: the routes under /relay/v1, the blobs in R2 and the sockets' announcements,
   around relay/core.cjs. Storage, R2, the clock and the sockets are passed in, so node legs run it over
   relay/test/stand-ins.cjs; RelayTeam passes the runtime's own. */
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const B = require("../shell/relay/blob.cjs");
const core = require("./core.cjs");

const JSON_MAX = 256 * 1024;
const STATUS = {
  "no-hello": 401, "hello-replay": 401, "nonce-stale": 401, "not-enrolled": 403, "bad-signature": 403, "removed": 403,
  "outside-place": 403, "token-spent": 403, "invite-ended": 403, "token-tries": 403, "team-size": 403, "epoch": 409, "replay-counter": 409,
  "replay-rev": 409, "bad-grant": 403, "missing": 404, "superseded": 410, "expired": 410, "blob-size": 413, "rate": 429,
};
const CLOSE = { "no-hello": 4401, "removed": 4403 };
const ROUTE = /^\/relay\/v1\/(?:teams|t\/([0-9a-f]{32})\/(devices|invites|hello|session|socket|wrap|states|since\/(\d{1,16})|b\/([0-9a-f]{32})))$/;
const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

const reply = (status, value) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const refused = r => reply(STATUS[r.reason] || 400, { error: r.reason, said: r.said });
const refusedFor = reason => refused(B.refusal(reason));
const missing = () => refusedFor("missing");
const fault = () => reply(500, { error: "fault", said: "The relay could not answer that." });

/* The body, or null once it would pass `max`: a declared length is believed only to refuse, and a stream is read no
   further than the cap. */
async function readCapped(request, max) {
  const declared = request.headers.get("content-length");
  if (declared !== null && !(/^\d{1,16}$/.test(declared) && Number(declared) <= max)) return null; /* plant:read-declared */
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; } /* plant:read-cap */
    parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(parts, total);
}

function bearer(request) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") || "");
  return m ? m[1] : null;
}

function attachmentOf(ws) {
  try { return ws.deserializeAttachment() || {}; } catch { return {}; }
}

function shut(ws, reason) {
  try { ws.close(CLOSE[reason] || 4400, B.REASONS[reason] || ""); } catch { /* already closed */ }
}

function teamObject(deps) {
  const c = core.createCore({ store: deps.store, clock: deps.clock, limits: deps.limits, roots: deps.roots });
  const r2 = deps.r2, sockets = deps.sockets;
  const answer = (r, shape) => (r.ok ? reply(200, shape(r)) : refused(r));

  async function fetch(request) {
    try { return await route(request); } catch { return fault(); }
  }

  async function route(request) {
    const url = new URL(request.url);
    const m = ROUTE.exec(url.pathname);
    if (!m || url.protocol !== "https:" || url.search !== "") return missing();
    const rt = m[1], what = m[2] || "teams", method = request.method;
    if (what === "socket") return method === "GET" ? openSocket(request, bearer(request)) : missing();
    if (m[3] !== undefined) return method === "GET" ? listSince(bearer(request), Number(m[3])) : missing();
    if (m[4] !== undefined) {
      if (method === "GET") return getBlob(bearer(request), m[4]);
      return method === "PUT" ? putBlob(request, rt, bearer(request), m[4]) : missing();
    }
    if (what === "wrap") return method === "GET" ? answer(c.wrapFor(bearer(request)), r => ({ ok: true, wrap: r.wrap })) : missing();
    if (what === "states") return method === "GET" ? answer(c.statesFor(rt, bearer(request)), r => ({ ok: true, states: r.states })) : missing();
    if (method !== "POST") return missing();
    if (what === "hello") return answer(c.challenge(rt), r => ({ challenge: r.challenge, until: r.until }));
    const bytes = await readCapped(request, JSON_MAX);
    if (!bytes) return refusedFor("blob-size");
    let body = null;
    try { body = JSON.parse(bytes.toString("utf8")); } catch { body = null; }
    if (what === "teams") return answer(c.create(body && typeof body.rt === "string" ? body.rt : "", body), r => ({ rt: r.rt }));
    if (what === "session") return answer(c.session(rt, body), r => (r.invite ? { session: r.session, until: r.until, invite: true } : { session: r.session, until: r.until }));
    if (what === "devices") {
      const r = c.devices(rt, body);
      if (r.ok) closeWhere(a => r.withdrawn.indexOf(a.key) > -1, "removed"); /* plant:withdraw-sockets */
      if (r.ok) closeWhere(a => !!a.inv && !c.sessionByHash(a.ses).ok, "no-hello");
      return answer(r, x => ({ rev: x.rev }));
    }
    const r = c.invites(rt, body);
    if (r.ok) closeWhere(a => !!a.inv && r.dropped.indexOf(a.inv) > -1, "no-hello"); /* plant:drop-sockets */
    return answer(r, x => ({ ok: true, dropped: x.dropped, used: x.used }));
  }

  async function listSince(token, after) {
    const s = c.sessionOf(token);
    if (!s.ok) return refused(s);
    await dropObjects(c.prune());
    return answer(c.since(token, after), r => r.items);
  }

  async function getBlob(token, id) {
    const r = c.blobFor(token, id);
    if (!r.ok) return refused(r);
    const obj = await r2.get(r.obj);
    if (!obj) return missing();
    return new Response(obj.body, { status: 200, headers: { "content-type": "application/octet-stream", "cache-control": "no-store",
      "etiuda-blob": Buffer.from(JSON.stringify(r.meta), "utf8").toString("base64url") } });
  }

  /* Judged before the bucket's write and judged again at the commit, since other requests run while R2 answers. Each
     upload gets an object of its own, so a refused one is deleted without touching another's. */
  async function putBlob(request, rt, token, id) {
    const m = c.parseMeta(request.headers.get("etiuda-blob"));
    const a = c.admit(rt, token, m, id);
    if (!a.ok) return refused(a);
    const ct = await readCapped(request, B.BLOB_MAX);
    if (!ct) return refusedFor("blob-size");
    const j = c.judge(rt, token, m, id, ct);
    if (!j.ok) return refused(j);
    const obj = rt + "/" + id + "/" + crypto.randomBytes(8).toString("hex");
    await r2.put(obj, ct);
    const done = c.commit(rt, token, m, id, ct, obj);
    if (!done.ok) { await dropObjects([obj]); return refused(done); }
    if (done.uploadedInv) closeWhere(a => a.inv === done.uploadedInv, "not-enrolled");
    announce(done);
    await dropObjects(done.drop.concat(c.prune()));
    return reply(200, { seq: done.seq, id: done.id });
  }

  async function dropObjects(objs) {
    for (const obj of objs) {
      try { await r2.delete(obj); } catch { c.orphan(obj); }
    }
  }

  function openSocket(request, token) {
    const s = c.sessionOf(token);
    if (!s.ok) return refused(s);
    if (s.quiet) return refusedFor("removed");
    const blocked = c.readGate(token);
    if (blocked) return refused(blocked);
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return missing();
    return sockets.accept({ ses: s.hash, key: s.key, inv: s.inv });
  }

  function announce(done) {
    const note = JSON.stringify({ type: "new", seq: done.seq, id: done.id, size: done.size });
    for (const ws of sockets.all()) {
      const a = attachmentOf(ws);
      const s = c.sessionByHash(a.ses);
      if (!s.ok) { shut(ws, s.reason); continue; } /* plant:socket-live */
      if (a.ses === done.session || a.key === done.writer) continue; /* plant:socket-others */
      ws.send(note);
    }
  }

  function closeWhere(test, reason) {
    for (const ws of sockets.all()) if (test(attachmentOf(ws))) shut(ws, reason);
  }

  function webSocketMessage(ws, message) {
    const s = c.sessionByHash(attachmentOf(ws).ses);
    if (!s.ok) return shut(ws, s.reason);
    let msg = null;
    try { msg = JSON.parse(String(message)); } catch { msg = null; }
    if (msg && msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  }

  function webSocketClose(ws) {
    try { ws.close(1000, ""); } catch { /* already closed */ }
  }

  return { fetch, webSocketMessage, webSocketClose };
}

/* The object's storage as the core's store, over its SQLite: one table of keys and JSON values. */
function sqlStore(storage) {
  const sql = storage.sql;
  sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  return {
    get(k) {
      const row = sql.exec("SELECT v FROM kv WHERE k = ?", k).toArray()[0];
      return row ? JSON.parse(row.v) : undefined;
    },
    put(k, v) { sql.exec("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v)); },
    del(k) { sql.exec("DELETE FROM kv WHERE k = ?", k); },
    list(prefix, opts) {
      const after = opts && opts.after ? opts.after : prefix, limit = opts && opts.limit ? opts.limit : -1;
      return sql.exec("SELECT k, v FROM kv WHERE k > ? AND k < ? ORDER BY k LIMIT ?", after, prefix + "￿", limit)
        .toArray().map(row => [row.k, JSON.parse(row.v)]);
    },
    atomic(fn) { return storage.transactionSync(fn); },
  };
}

/* Hibernating sockets: the object may sleep with them open, and each keeps its session's hash as its attachment. */
function hibernating(ctx) {
  return {
    accept(attachment) {
      const pair = new WebSocketPair();
      ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(attachment);
      return new Response(null, { status: 101, webSocket: pair[0] });
    },
    all() { return ctx.getWebSockets(); },
  };
}

class RelayTeam {
  constructor(ctx, env) {
    this.object = teamObject({ store: sqlStore(ctx.storage), r2: env.BLOBS, clock: () => Date.now(), sockets: hibernating(ctx) });
  }
  fetch(request) { return this.object.fetch(request); }
  webSocketMessage(ws, message) { return this.object.webSocketMessage(ws, message); }
  webSocketClose(ws) { return this.object.webSocketClose(ws); }
}

module.exports = { JSON_MAX, teamObject, RelayTeam, readCapped, refusedFor, missing, fault };
