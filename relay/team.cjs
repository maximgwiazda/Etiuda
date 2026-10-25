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
  "replay-rev": 409, "bad-grant": 403, "team-lapsed": 403, "missing": 404, "superseded": 410, "expired": 410, "blob-size": 413, "rate": 429,
};
const CLOSE = { "no-hello": 4401, "removed": 4403 };
const ROUTE = /^\/relay\/v1\/(?:teams|t\/([0-9a-f]{32})\/(devices|invites|hello|session|grant|socket|wrap|states|since\/(\d{1,16})|b\/([0-9a-f]{32})))$/;
const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
/* The methods each route answers, in one table the Worker and the object both ask, so that a path or a method no route answers
   is missing before any object is woken to say so. `since` and `b` are the two routes whose names carry an argument. */
const METHODS = { teams: ["POST"], devices: ["POST"], invites: ["POST"], hello: ["POST"], session: ["POST"], grant: ["POST"], socket: ["GET"],
  wrap: ["GET"], states: ["GET"], since: ["GET"], b: ["GET", "PUT"] };
/* The route a method and a path name, as { rt, what }, or null where none answers them. */
function routeOf(method, pathname) {
  const m = ROUTE.exec(pathname);
  if (!m) return null;
  const what = m[3] !== undefined ? "since" : m[4] !== undefined ? "b" : (m[2] || "teams");
  return METHODS[what].indexOf(method) > -1 ? { rt: m[1] || null, what } : null;
}

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

/* A sweep whose delete of some object failed rings again after this long, for those objects alone. */
const SWEEP_RETRY_MS = 60 * 60 * 1000;

function teamObject(deps) {
  const c = core.createCore({ store: deps.store, clock: deps.clock, limits: deps.limits, roots: deps.roots });
  const r2 = deps.r2, sockets = deps.sockets, alarm = deps.alarm || null;
  const answer = (r, shape) => (r.ok ? reply(200, shape(r)) : refused(r));

  async function fetch(request) {
    try { return await route(request); } catch { return fault(); }
  }

  async function route(request) {
    const url = new URL(request.url);
    const m = ROUTE.exec(url.pathname);
    if (!m || !routeOf(request.method, url.pathname) || url.protocol !== "https:" || url.search !== "") return missing();
    /* A team gone by the clock is swept before anything is answered, should its alarm not have rung yet. */
    await sweepIfDue(); /* plant:sweep-lazy */
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
    /* A body is awaited for a team that exists, or for the create that makes one; for any other id nothing is read. */
    if (what !== "teams" && !c.hasTeam(rt)) return refusedFor("not-enrolled"); /* plant:team-first */
    const bytes = await readCapped(request, JSON_MAX);
    if (!bytes) return refusedFor("blob-size");
    let body = null;
    try { body = JSON.parse(bytes.toString("utf8")); } catch { body = null; }
    if (what === "teams") {
      const made = c.create(body && typeof body.rt === "string" ? body.rt : "", body);
      if (made.ok) await arm(); /* plant:arm-create */
      return answer(made, r => ({ rt: r.rt }));
    }
    if (what === "grant") {
      const renewed = c.renew(rt, body);
      if (renewed.ok) await arm(); /* plant:arm-renew */
      return answer(renewed, r => ({ ok: true, lapse: r.lapse }));
    }
    if (what === "session") {
      const s = c.session(rt, body);
      if (s.ok && alarm && (await alarm.get()) == null) await arm(); /* plant:arm-session */
      return answer(s, r => (r.invite ? { session: r.session, until: r.until, invite: true, lapse: r.lapse } : { session: r.session, until: r.until, lapse: r.lapse }));
    }
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
    const r = c.since(token, after);
    if (!r.ok) return refused(r);
    const lapse = Buffer.from(JSON.stringify(r.lapse), "utf8").toString("base64url");
    return new Response(JSON.stringify(r.items), { status: 200, headers: Object.assign({ "etiuda-lapse": lapse }, HEADERS) }); /* plant:since-lapse */
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
    const ct = await readCapped(request, a.max); /* plant:put-cap */
    if (!ct) return refusedFor("blob-size");
    const j = c.judge(rt, token, m, id, ct);
    if (!j.ok) return refused(j);
    const obj = rt + "/" + id + "/" + crypto.randomBytes(8).toString("hex");
    c.record(obj); /* plant:r2-record */
    await r2.put(obj, ct);
    const done = c.commit(rt, token, m, id, ct, obj);
    if (!done.ok) { await dropObjects([obj]); return refused(done); }
    if (done.uploadedInv) closeWhere(a => a.inv === done.uploadedInv, "not-enrolled");
    announce(done);
    await dropObjects(done.drop.concat(c.prune()));
    return reply(200, { seq: done.seq, id: done.id });
  }

  async function dropObjects(objs) {
    for (const obj of new Set(objs)) {
      try { await r2.delete(obj); } catch { c.orphan(obj); continue; }
      c.forget(obj);
    }
  }

  /* The alarm set to the team's next instant: a trial's until while it works, else its sweep. */
  async function arm() {
    if (!alarm) return;
    const at = c.alarmAt();
    if (at !== null) await alarm.set(at);
  }

  /* Every object the team's rows name deleted, the sockets closed and the storage emptied; an object whose delete fails keeps its
     row and the alarm rings again for it. True where a sweep was due. Requests arriving while R2 answers wait on the same sweep, so
     none of them writes a row that its wipe would then take. */
  let sweeping = null;
  function sweepIfDue() {
    if (sweeping) return sweeping;
    if (!c.sweepDue()) return Promise.resolve(false);
    sweeping = sweep().finally(() => { sweeping = null; });
    return sweeping;
  }
  async function sweep() {
    const left = [];
    for (const obj of c.heldObjects()) {
      try { await r2.delete(obj); } catch { left.push(obj); } /* plant:sweep-delete */
    }
    closeWhere(() => true, "team-lapsed");
    c.wipe(left); /* plant:sweep-wipe */
    if (alarm) await (left.length ? alarm.set(deps.clock() + SWEEP_RETRY_MS) : alarm.clear());
    return true;
  }

  /* The alarm: the sweep where it is due; otherwise a trial's sockets closed at its until, and the alarm set to the next instant. */
  async function onAlarm() {
    if (await sweepIfDue()) return;
    if (c.lapseState() === "lapsed") closeWhere(() => true, "team-lapsed"); /* plant:lapse-close */
    await arm();
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
    const lapsed = c.lapseGate(false);
    if (lapsed) return shut(ws, lapsed.reason); /* plant:lapse-ping */
    let msg = null;
    try { msg = JSON.parse(String(message)); } catch { msg = null; }
    if (msg && msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  }

  function webSocketClose(ws) {
    try { ws.close(1000, ""); } catch { /* already closed */ }
  }

  return { fetch, webSocketMessage, webSocketClose, alarm: onAlarm };
}

/* The object's storage as the core's store, over its SQLite: one table of keys and JSON values. The table is made by the first
   write and by nothing before it: a read of a table that is not there finds no key and no list, and a delete finds nothing to
   delete, so a request for a team never made leaves the object's storage as empty as it found it. */
function sqlStore(storage) {
  const sql = storage.sql;
  const MAKE = "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)";
  let made = false;
  const has = () => made || (made = sql.exec("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = 'kv'").toArray().length > 0);
  const make = () => { if (!made) { sql.exec(MAKE); made = true; } };
  return {
    get(k) {
      if (!has()) return undefined; /* plant:store-get */
      const row = sql.exec("SELECT v FROM kv WHERE k = ?", k).toArray()[0];
      return row ? JSON.parse(row.v) : undefined;
    },
    put(k, v) { make(); sql.exec("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v)); },
    del(k) {
      if (!has()) return; /* plant:store-del */
      sql.exec("DELETE FROM kv WHERE k = ?", k);
    },
    list(prefix, opts) {
      if (!has()) return []; /* plant:store-list */
      const after = opts && opts.after ? opts.after : prefix, limit = opts && opts.limit ? opts.limit : -1;
      return sql.exec("SELECT k, v FROM kv WHERE k > ? AND k < ? ORDER BY k LIMIT ?", after, prefix + "￿", limit)
        .toArray().map(row => [row.k, JSON.parse(row.v)]);
    },
    atomic(fn) { make(); return storage.transactionSync(fn); },
    /* The team swept: the table dropped, so the object's storage is as empty as a team never made leaves it. */
    clear() {
      if (has()) sql.exec("DROP TABLE kv");
      made = false;
    },
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

/* The object's one alarm, as the runtime keeps it. */
function alarmOf(storage) {
  return { set: at => storage.setAlarm(at), get: () => storage.getAlarm(), clear: () => storage.deleteAlarm() };
}

class RelayTeam {
  constructor(ctx, env) {
    this.object = teamObject({ store: sqlStore(ctx.storage), r2: env.BLOBS, alarm: alarmOf(ctx.storage), clock: () => Date.now(), sockets: hibernating(ctx) });
  }
  fetch(request) { return this.object.fetch(request); }
  alarm() { return this.object.alarm(); }
  webSocketMessage(ws, message) { return this.object.webSocketMessage(ws, message); }
  webSocketClose(ws) { return this.object.webSocketClose(ws); }
}

module.exports = { JSON_MAX, teamObject, RelayTeam, routeOf, readCapped, refusedFor, missing, fault };
