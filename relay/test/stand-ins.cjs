"use strict";
/* In-memory stand-ins for what the Workers runtime gives the relay: the Durable Object namespace, a team's storage,
   the R2 bucket, the clock and the hibernating sockets. tests/relay-unit.mjs and the harness's relay-product adapter
   run relay/worker.mjs over them, with no Workers runtime and no network. */
const team = require("../team.cjs");
const core = require("../core.cjs");

/* The runtime's refusal of an RPC call on a class that does not extend DurableObject. The sentence is the runtime's.
   The method and the class are named after it. A method the class does not implement is refused with a second sentence. */
const PLAIN_RPC = "The receiving Durable Object does not support RPC, because its class was not declared with `extends DurableObject`. In order to enable RPC, make sure your class extends the special class `DurableObject`, which can be imported from the module \"cloudflare:workers\".";

/* The base a leg extends so a stub may answer an RPC call. */
class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

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
    clear() { data = new Map(); },
  };
  return store;
}

/* put, get and delete as an R2 binding answers them. `hold()` parks the next put: `parked` settles once it waits,
   and `release()` lets it go on. `losePuts(n)` keeps the next n objects and then throws, as a request that dies after the
   bucket wrote; `failDeletes(n)` refuses the next n deletes. */
function memoryBucket() {
  const objects = new Map();
  let held = null, failing = 0, losing = 0, refusing = 0;
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
    losePuts(n) { losing = n; },
    failDeletes(n) { refusing = n; },
    async put(key, value) {
      if (held) { const h = held; held = null; h.parkedNow(); await h.gate; }
      if (failing > 0) { failing--; throw new Error("stand-in bucket refused the write"); }
      objects.set(key, Buffer.from(value));
      if (losing > 0) { losing--; throw new Error("stand-in request died after the write"); }
      return { key };
    },
    async get(key) {
      if (!objects.has(key)) return null;
      const bytes = objects.get(key);
      return { size: bytes.length, body: new Blob([bytes]).stream() };
    },
    async delete(key) {
      if (refusing > 0) { refusing--; throw new Error("stand-in bucket refused the delete"); }
      objects.delete(key);
    },
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
   `restart()` drops every live object and its sockets; storage, the bucket and the alarms stay. `opts.roots` are the roots its team
   objects accept a grant under, `opts.team` a copy of relay/team.cjs to run in its place, and NOW is the clock a leg gives the
   Worker. `alarms` holds each object's one alarm by name, and `ring(name)` runs that object's alarm where it is set and due, as
   the runtime would, answering whether it rang. */
function relayEnv(opts) {
  const o = opts || {};
  const clock = { now: 0 };
  const stores = new Map(), hubs = new Map(), live = new Map(), alarms = new Map();
  const bucket = memoryBucket();
  const asked = [];
  /* One list for every team. It is not a team's store, so a create that wakes nothing leaves that team's store empty. */
  const revokedStore = memoryStore();
  function acceptRevocations(text) { return core.acceptRevocations(text, o.roots, revokedStore); }
  const alarmFor = name => ({
    async set(at) { alarms.set(name, at); },
    async get() { return alarms.has(name) ? alarms.get(name) : null; },
    async clear() { alarms.delete(name); },
  });
  function objectFor(name) {
    if (live.has(name)) return live.get(name);
    if (!stores.has(name)) stores.set(name, memoryStore());
    const hub = socketHub();
    hubs.set(name, hub);
    const obj = (o.team || team).teamObject({ store: stores.get(name), r2: bucket, clock: () => clock.now, sockets: hub, limits: o.limits, roots: o.roots,
      revoked: () => {
        /* `wakeReadsText`: a woken object reads the REVOKED text alone, as the runtime's does (relay/team.cjs plant:revoked-wake),
           so a leg can see what a route that carries no kept list would let through. */
        if (o.wakeReadsText) return core.revokedKeysOf(env.REVOKED, o.roots);
        const decided = acceptRevocations(env.REVOKED);
        return decided && Array.isArray(decided.keys) ? decided.keys : [];
      }, alarm: alarmFor(name), prefix: env.API_PREFIX, teams: () => scoped });
    live.set(name, obj);
    return obj;
  }
  /* How many times the list object answered its route. A missing answer is not one. */
  const revokedFetches = { n: 0 };
  /* fetch is answered for every class. Any other call is an RPC call, answered only when the bound class extends
     DurableObject, and otherwise refused with the runtime's sentence, naming the method and the class. */
  const bound = o.class || (o.team || team).RelayTeam;
  const rpcOk = typeof bound === "function" && bound.prototype instanceof DurableObject;
  const className = typeof bound === "function" && bound.name ? bound.name : "DurableObject";
  const rpcLive = new Map();
  function stubFor(id) {
    const target = {
      fetch(request) {
        return Promise.resolve().then(async () => {
          if (String(id.name) !== "revoked") return objectFor(id.name).fetch(request);
          if (!team.revokedMarked(request)) return team.missing();
          const decided = acceptRevocations(await team.revokedTextOf(request));
          revokedFetches.n += 1;
          return team.revokedReply(decided);
        });
      },
    };
    return new Proxy(target, {
      get(obj, prop) {
        if (prop === "fetch") return obj.fetch;
        if (prop === "then") return undefined;
        if (typeof prop === "symbol") return obj[prop];
        const method = String(prop);
        return function (...args) {
          if (!rpcOk) throw new TypeError(PLAIN_RPC + " Method \"" + method + "\", class \"" + className + "\".");
          const key = String(id.name);
          if (!rpcLive.has(key)) rpcLive.set(key, new bound({}, env));
          const fn = rpcLive.get(key)[prop];
          if (typeof fn !== "function") throw new TypeError("The RPC receiver does not implement the method \"" + method + "\".");
          return Promise.resolve().then(() => fn.apply(rpcLive.get(key), args));
        };
      },
    });
  }
  const scoped = {
    idFromName(name) { return { name: String(name) }; },
    get(id) { return stubFor(id); },
    acceptRevocations,
  };
  const env = {
    TEAMS: { jurisdiction(j) { asked.push(j); return j === "eu" ? scoped : null; } },
    BLOBS: bucket,
    NOW: () => clock.now,
  };
  return {
    env, clock, bucket, asked, stores, hubs, alarms, revoked: revokedStore, revokedFetches,
    object: objectFor,
    async ring(name) {
      if (!alarms.has(name) || clock.now < alarms.get(name)) return false;
      alarms.delete(name);
      await objectFor(name).alarm();
      return true;
    },
    restart() {
      for (const hub of hubs.values()) for (const ws of hub.all()) ws.close(1012, "restart");
      live.clear();
    },
    socket(name, id) { const hub = hubs.get(name); return hub ? hub.byId(id) : null; },
  };
}

module.exports = { memoryStore, memoryBucket, socketHub, relayEnv, DurableObject };
