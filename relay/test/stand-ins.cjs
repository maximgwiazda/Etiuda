"use strict";
/* In-memory stand-ins for what the Workers runtime gives the relay: the Durable Object namespace, a team's storage,
   the R2 bucket, the clock and the hibernating sockets. tests/relay-unit.mjs and the harness's relay-product adapter
   run relay/worker.mjs over them, with no Workers runtime and no network. */
const team = require("../team.cjs");

/* get, put, del, list and atomic as relay/core.cjs uses them; values are kept as JSON text, as SQLite keeps them. */
function memoryStore() {
  let data = new Map();
  const store = {
    get(k) { return data.has(k) ? JSON.parse(data.get(k)) : undefined; },
    put(k, v) { data.set(k, JSON.stringify(v)); },
    del(k) { data.delete(k); },
    list(prefix, opts) {
      const after = opts && opts.after ? opts.after : prefix;
      const keys = [...data.keys()].filter(k => k.startsWith(prefix) && k > after).sort();
      const cut = opts && opts.limit ? keys.slice(0, opts.limit) : keys;
      return cut.map(k => [k, JSON.parse(data.get(k))]);
    },
    atomic(fn) {
      const before = new Map(data);
      try { return fn(); } catch (e) { data = before; throw e; }
    },
    dump() { return [...data.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)); },
  };
  return store;
}

/* put, get and delete as an R2 binding answers them. `hold()` parks the next put: `parked` settles once it waits,
   and `release()` lets it go on. */
function memoryBucket() {
  const objects = new Map();
  let held = null, failing = 0;
  return {
    objects,
    hold() {
      let release, parkedNow;
      const gate = new Promise(r => { release = r; });
      const parked = new Promise(r => { parkedNow = r; });
      held = { gate, parkedNow };
      return { release, parked };
    },
    failPuts(n) { failing = n; },
    async put(key, value) {
      if (held) { const h = held; held = null; h.parkedNow(); await h.gate; }
      if (failing > 0) { failing--; throw new Error("stand-in bucket refused the write"); }
      objects.set(key, Buffer.from(value));
      return { key };
    },
    async get(key) {
      if (!objects.has(key)) return null;
      const bytes = objects.get(key);
      return { size: bytes.length, body: new Blob([bytes]).stream() };
    },
    async delete(key) { objects.delete(key); },
  };
}

/* One hub per team object: accept() answers the upgrade with a 200 naming the socket, since node cannot make a 101.
   Socket ids are unique in the process, so a socket outlives the hub that opened it in a caller's map. */
let socketCount = 0;
function socketHub() {
  const open = [];
  return {
    open,
    accept(attachment) {
      const ws = {
        id: "s" + (++socketCount), sent: [], closed: null, attachment: JSON.parse(JSON.stringify(attachment)),
        send(m) { if (!ws.closed) ws.sent.push(String(m)); },
        close(code, reason) {
          if (ws.closed) return;
          ws.closed = { code, reason };
          const i = open.indexOf(ws);
          if (i > -1) open.splice(i, 1);
        },
        deserializeAttachment() { return ws.attachment; },
        serializeAttachment(a) { ws.attachment = JSON.parse(JSON.stringify(a)); },
      };
      open.push(ws);
      return new Response(null, { status: 200, headers: { "x-stand-in-socket": ws.id } });
    },
    all() { return open.slice(); },
    byId(id) { return open.find(s => s.id === id) || null; },
  };
}

/* The Worker's env: TEAMS a namespace whose objects run relay/team.cjs over the stores here, BLOBS the bucket.
   `restart()` drops every live object and its sockets; storage and the bucket stay. */
function relayEnv(opts) {
  const o = opts || {};
  const clock = { now: 0 };
  const stores = new Map(), hubs = new Map(), live = new Map();
  const bucket = memoryBucket();
  const asked = [];
  function objectFor(name) {
    if (live.has(name)) return live.get(name);
    if (!stores.has(name)) stores.set(name, memoryStore());
    const hub = socketHub();
    hubs.set(name, hub);
    const obj = team.teamObject({ store: stores.get(name), r2: bucket, clock: () => clock.now, sockets: hub, limits: o.limits });
    live.set(name, obj);
    return obj;
  }
  const scoped = {
    idFromName(name) { return { name: String(name) }; },
    get(id) { return { fetch: request => objectFor(id.name).fetch(request) }; },
  };
  const env = {
    TEAMS: { jurisdiction(j) { asked.push(j); return j === "eu" ? scoped : null; } },
    BLOBS: bucket,
  };
  return {
    env, clock, bucket, asked, stores, hubs,
    object: objectFor,
    restart() {
      for (const hub of hubs.values()) for (const ws of hub.all()) ws.close(1012, "restart");
      live.clear();
    },
    socket(name, id) { const hub = hubs.get(name); return hub ? hub.byId(id) : null; },
  };
}

module.exports = { memoryStore, memoryBucket, socketHub, relayEnv };
