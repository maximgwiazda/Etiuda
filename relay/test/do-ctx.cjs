"use strict";
/* A stand-in Durable Object `ctx`, for running RelayTeam (relay/team.cjs) as Cloudflare runs it: ctx.storage.sql over
   real SQLite (node:sqlite, in memory, the SQL unchanged), ctx.storage.transactionSync, and the hibernating sockets
   (ctx.acceptWebSocket, ctx.getWebSockets, and a WebSocketPair whose sockets keep their attachment as the runtime
   does). relay/test/stand-ins.cjs stays the in-memory kind; this file is the kind that runs sqlStore and hibernating. */
const { DatabaseSync } = require("node:sqlite");

const ATTACHMENT_MAX = 2048; /* the runtime's cap on a socket's serialised attachment, in bytes */

/* What sql.exec returns: the rows as plain objects, read once through toArray(), one(), next() or for...of. */
function cursor(rows) {
  const list = rows.map(r => Object.assign({}, r));
  let at = 0;
  return {
    columnNames: list.length ? Object.keys(list[0]) : [],
    toArray() { const rest = list.slice(at); at = list.length; return rest; },
    one() {
      if (list.length - at !== 1) throw new Error("Expected exactly one result from SQL query, but got " + (list.length - at) + " results.");
      return list[at++];
    },
    next() { return at < list.length ? { done: false, value: list[at++] } : { done: true, value: undefined }; },
    [Symbol.iterator]() { return this; },
  };
}

/* ctx.storage over a database: exec binds its arguments in order; transactionSync runs its function between BEGIN and
   COMMIT, rolls back and rethrows on a throw, and nests as a savepoint inside another; and the alarm. */
function storage(db) {
  let depth = 0, alarm = null;
  return {
    /* The object's one alarm, as the runtime keeps it: a time in ms or null, each call answering a promise. */
    async setAlarm(at) { alarm = Number(at); },
    async getAlarm() { return alarm; },
    async deleteAlarm() { alarm = null; },
    sql: {
      exec(query, ...bindings) { return cursor(db.prepare(query).all(...bindings)); },
    },
    transactionSync(fn) {
      const name = "sp" + depth;
      db.exec(depth === 0 ? "BEGIN" : "SAVEPOINT " + name);
      depth++;
      let result;
      try { result = fn(); }
      catch (e) {
        depth--;
        db.exec(depth === 0 ? "ROLLBACK" : "ROLLBACK TO " + name + "; RELEASE " + name);
        throw e;
      }
      depth--;
      db.exec(depth === 0 ? "COMMIT" : "RELEASE " + name);
      return result;
    },
  };
}

/* One end of a WebSocketPair. The server end keeps what it was sent and what it was closed with, and its attachment as
   a copy, since the runtime stores the attachment apart from the socket. */
function socket(role) {
  let attachment = null;
  const ws = {
    role, accepted: false, sent: [], closed: null,
    send(m) { if (ws.closed) throw new Error("Can't call WebSocket send() after close()."); ws.sent.push(String(m)); },
    close(code, reason) { if (ws.closed) return; ws.closed = { code, reason }; },
    serializeAttachment(a) {
      const text = JSON.stringify(a === undefined ? null : a);
      if (Buffer.byteLength(text) > ATTACHMENT_MAX) throw new RangeError("Attachment too large.");
      attachment = JSON.parse(text);
    },
    deserializeAttachment() { return attachment === null ? null : JSON.parse(JSON.stringify(attachment)); },
  };
  return ws;
}

/* `new WebSocketPair()` answers an object whose members 0 and 1 are the client and the server end. */
function WebSocketPair() {
  const pair = {};
  pair[0] = socket("client");
  pair[1] = socket("server");
  return pair;
}

/* The ctx itself: storage, and the sockets the object has accepted. A closed socket is no longer listed. */
function doCtx() {
  const db = new DatabaseSync(":memory:");
  const accepted = [];
  return {
    db,
    storage: storage(db),
    accepted,
    acceptWebSocket(ws) {
      if (ws.accepted) throw new Error("WebSocket is already accepted.");
      ws.accepted = true;
      accepted.push(ws);
    },
    getWebSockets() { return accepted.filter(ws => !ws.closed); },
  };
}

/* Runs `fn` with WebSocketPair on globalThis and with Response able to make the 101 that node refuses, as the Workers
   runtime does, and puts both back as they were, whatever fn does. A 101 is an object holding the client socket as
   its `webSocket`; any other Response is node's own. */
async function withWorkersGlobals(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "WebSocketPair");
  const before = globalThis.WebSocketPair, Real = globalThis.Response;
  function Response(body, init) {
    if (init && init.status === 101) return { status: 101, webSocket: init.webSocket, headers: new Headers() };
    return new Real(body, init);
  }
  Response.prototype = Real.prototype;
  for (const k of ["json", "error", "redirect"]) Response[k] = Real[k];
  globalThis.WebSocketPair = WebSocketPair;
  globalThis.Response = Response;
  try { return await fn(); }
  finally {
    globalThis.Response = Real;
    if (had) globalThis.WebSocketPair = before; else delete globalThis.WebSocketPair;
  }
}

module.exports = { doCtx, withWorkersGlobals, WebSocketPair, ATTACHMENT_MAX };
