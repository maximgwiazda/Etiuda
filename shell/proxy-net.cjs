"use strict";
/* A COMPANY PROXY, FOR THE SHELL'S OWN CALLS AND THE RELAY'S SOCKET. CommonJS, so the desk and Studio's shell both
   require it; Node builtins only, and nothing here reads a credential from any store or writes one anywhere.

   The calls go through Chromium's network stack (Electron's net), which resolves the system's proxy, a setup script and
   automatic detection, and answers a proxy's Windows sign-in (NTLM, Negotiate) itself with the signed-in account. What it
   cannot answer it hands to a `login` listener on the request; Electron's net.fetch attaches none and so cancels every such
   challenge. fetchThrough is net.fetch with that listener, and the listener is one proxy asker's: it asks the person once
   per proxy, holds the answer in memory for this run, and never asks for a server that is not a proxy.

   The relay's socket is Node's, which knows no proxy. proxiedConnect asks Chromium which proxy the relay's address goes
   through; DIRECT keeps the runtime's own socket, and an HTTP proxy is reached with CONNECT, a Basic answer the asker
   holds riding along, and TLS and the WebSocket opened inside the tunnel. A proxy that asks the socket for Windows sign-in,
   or refuses it, closes the socket unopened, and the channel's minute-by-minute asking stands in for it. */
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

const HEAD_MAX = 16 * 1024;
const FRAME_MAX = 1024 * 1024;
const TUNNEL_WAIT_MS = 15 * 1000;
const RESOLVE_WAIT_MS = 20 * 1000;
/* How long one request waits on the person before it is let go unanswered; the question itself stays open. */
const ASK_WAIT_MS = 2 * 60 * 1000;
/* How long "Not now" holds for one proxy before a call through it may ask again. */
const DECLINE_MS = 30 * 60 * 1000;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Chromium's answer to resolveProxy ("PROXY a:8080; DIRECT") as entries in order: { type, host, port } or { type: "DIRECT" }. */
function parseProxyList(text) {
  const out = [];
  for (const part of String(text || "").split(";")) {
    const m = /^\s*([A-Za-z0-9]+)(?:\s+(\[[0-9a-fA-F:.]+\]|[^\s:\]]+):(\d{1,5}))?\s*$/.exec(part);
    if (!m) continue;
    const type = m[1].toUpperCase();
    if (type === "DIRECT") { out.push({ type }); continue; }
    if (!m[2]) continue;
    const port = Number(m[3]);
    if (!(port >= 1 && port <= 65535)) continue;
    out.push({ type, host: m[2].replace(/^\[|\]$/g, ""), port });
  }
  return out;
}

const proxyKey = (host, port) => String(host || "").toLowerCase() + ":" + (Number(port) || 0);
const answerOf = a => (a && typeof a === "object" && typeof a.username === "string" && a.username !== "" && typeof a.password === "string")
  ? { username: a.username, password: a.password } : null;

/** One asker per app. `o.ask({ host, port, scheme, realm, again })` resolves to { username, password } or null, and is
 *  called at most once at a time per proxy; `o.say(line)` is told what happened, once per line, never a credential. */
function proxyAsker(o) {
  const opts = o || {};
  const waitMs = opts.waitMs || ASK_WAIT_MS, declineMs = opts.declineMs || DECLINE_MS;
  const now = typeof opts.now === "function" ? opts.now : Date.now;
  const held = new Map(), declined = new Map(), asking = new Map(), told = new Set();
  const tell = line => { if (told.has(line)) return; told.add(line); try { if (typeof opts.say === "function") opts.say(line); } catch { /* the log is gone */ } };
  function askFor(key, info) {
    if (asking.has(key)) return asking.get(key);
    const p = Promise.resolve().then(() => opts.ask(info)).then(answerOf, () => null).then(a => {
      asking.delete(key);
      if (a) { held.set(key, a); declined.delete(key); tell("the proxy at " + key + " was given a sign-in"); }
      else { declined.set(key, now()); tell("the proxy at " + key + " was not given a sign-in, so calls through it are refused for now"); }
      return a;
    });
    asking.set(key, p);
    return p;
  }
  /** A `login` listener for one request: a second challenge on the same request means the last answer was refused. */
  function forRequest() {
    let tries = 0;
    return (authInfo, callback) => {
      let done = false, timer = null;
      const finish = a => { if (done) return; done = true; clearTimeout(timer); try { if (a) callback(a.username, a.password); else callback(); } catch { /* the request has gone */ } };
      if (!authInfo || authInfo.isProxy !== true) return finish(null); /* plant:proxy-server-only */
      const key = proxyKey(authInfo.host, authInfo.port);
      tries += 1;
      const at = declined.get(key);
      if (at !== undefined && now() - at < declineMs) return finish(null); /* plant:proxy-declined */
      const had = held.get(key);
      if (had && tries === 1) return finish(had);
      if (had) held.delete(key);
      if (tries > 3) return finish(null);
      tell("the proxy at " + key + " asked for a sign-in (" + String(authInfo.scheme || "unknown").toLowerCase() + ")");
      timer = setTimeout(() => finish(null), waitMs);
      if (timer.unref) timer.unref();
      askFor(key, { host: String(authInfo.host || ""), port: Number(authInfo.port) || 0, scheme: String(authInfo.scheme || ""),
        realm: String(authInfo.realm || ""), again: !!had || tries > 1 }).then(finish);
    };
  }
  return {
    forRequest,
    /** The answer held for this proxy, for the socket's tunnel; null where none was given. */
    heldFor: (host, port) => held.get(proxyKey(host, port)) || null,
    /** The socket's tunnel was refused with this answer: it is forgotten, and the next call asks again. */
    refused: (host, port) => { held.delete(proxyKey(host, port)); },
    tell,
  };
}

/** Electron's net.fetch, with one listener added: a proxy's sign-in challenge goes to `login(authInfo, callback)`. */
function fetchThrough(electronNet, input, init, login) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = new Request(input, init); } catch (e) { reject(e); return; }
    const reason = () => req.signal.reason || new DOMException("The operation was aborted.", "AbortError");
    if (req.signal.aborted) { reject(reason()); return; }
    let r = null, aborted = false;
    req.signal.addEventListener("abort", () => { aborted = true; reject(reason()); try { r && r.abort(); } catch { /* gone */ } }, { once: true });
    const origin = req.headers.get("origin") || undefined;
    r = electronNet.request({ method: req.method, url: req.url, origin,
      credentials: req.credentials === "same-origin" && !origin ? "include" : req.credentials,
      cache: req.cache, referrerPolicy: req.referrerPolicy, redirect: req.redirect });
    for (const [k, v] of req.headers) r.setHeader(k, v);
    r.on("login", (authInfo, callback) => { if (typeof login === "function") login(authInfo, callback); else callback(); }); /* plant:proxy-login-listener */
    r.on("response", resp => {
      if (aborted) return;
      try {
        const headers = new Headers();
        for (const [k, v] of Object.entries(resp.headers || {})) {
          if (Array.isArray(v)) for (const item of v) headers.append(k, String(item));
          else if (typeof v === "string") headers.set(k, v);
        }
        const empty = [101, 204, 205, 304].includes(resp.statusCode) || req.method === "HEAD";
        const { Readable } = require("node:stream");
        resolve(new Response(empty ? null : Readable.toWeb(resp), { headers, status: resp.statusCode, statusText: resp.statusMessage }));
      } catch (e) { try { r.abort(); } catch { /* gone */ } reject(e); }
    });
    r.on("error", e => reject(e));
    if (req.body) {
      req.arrayBuffer().then(b => { r.write(Buffer.from(b)); r.end(); }, e => { try { r.abort(); } catch { /* gone */ } reject(e); });
    } else r.end();
  });
}

/** An HTTP CONNECT tunnel to target through proxy, with a Basic answer where one is given. Resolves to the open socket;
 *  rejects with code "proxy-auth" (and `schemes`, the challenge's schemes in lower case), "proxy-refused" or "proxy-timeout". */
function tunnel(proxy, target, answer, o) {
  const opts = o || {};
  return new Promise((resolve, reject) => {
    const sock = (opts.connect || net.connect)({ host: proxy.host, port: proxy.port });
    let buf = Buffer.alloc(0), done = false;
    const fail = (code, extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch { /* gone */ }
      reject(Object.assign(new Error("the proxy at " + proxyKey(proxy.host, proxy.port) + " did not open a tunnel: " + code), { code }, extra || {}));
    };
    const timer = setTimeout(() => fail("proxy-timeout"), opts.waitMs || TUNNEL_WAIT_MS);
    if (timer.unref) timer.unref();
    sock.once("error", () => fail("proxy-refused"));
    sock.once("close", () => fail("proxy-refused"));
    sock.once("connect", () => {
      const at = target.host + ":" + target.port;
      const a = answerOf(answer);
      sock.write("CONNECT " + at + " HTTP/1.1\r\nHost: " + at + "\r\n"
        + (a ? "Proxy-Authorization: Basic " + Buffer.from(a.username + ":" + a.password, "utf8").toString("base64") + "\r\n" : "") /* plant:proxy-basic */
        + "\r\n");
    });
    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) { if (buf.length > HEAD_MAX) fail("proxy-refused"); return; }
      sock.removeListener("data", onData);
      const head = buf.subarray(0, end).toString("latin1").split("\r\n");
      const status = Number((/^HTTP\/1\.[01] (\d{3})/.exec(head[0]) || [])[1]);
      if (status === 200) {
        done = true;
        clearTimeout(timer);
        sock.removeAllListeners("error");
        sock.removeAllListeners("close");
        const rest = buf.subarray(end + 4);
        if (rest.length) sock.unshift(rest);
        resolve(sock);
        return;
      }
      if (status === 407) {
        const schemes = head.slice(1).filter(l => /^proxy-authenticate\s*:/i.test(l))
          .map(l => l.replace(/^[^:]*:\s*/, "").split(/[\s,]/)[0].toLowerCase()).filter(Boolean);
        fail("proxy-auth", { schemes });
        return;
      }
      fail("proxy-refused", { status });
    };
    sock.on("data", onData);
  });
}

/** A WebSocket client over an open stream (RFC 6455): text in, text out, ping answered. `on.open`, `on.message(text)`
 *  and `on.close()`, the close told once, unopened where the handshake failed. */
function webSocketOver(stream, url, headers, on) {
  const u = new URL(url);
  const key = crypto.randomBytes(16).toString("base64");
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  let open = false, closed = false, buf = Buffer.alloc(0), parts = [], partsLen = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    try { stream.destroy(); } catch { /* gone */ }
    try { on.close(); } catch { /* told */ }
  };
  const frame = (op, payload) => {
    const p = Buffer.from(payload || []);
    const mask = crypto.randomBytes(4);
    const len = p.length < 126 ? Buffer.from([0x80 | op, 0x80 | p.length])
      : p.length < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, p.length >> 8, p.length & 255])
        : Buffer.concat([Buffer.from([0x80 | op, 0x80 | 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(p.length)); return b; })()]);
    const body = Buffer.alloc(p.length);
    for (let i = 0; i < p.length; i++) body[i] = p[i] ^ mask[i & 3];
    return Buffer.concat([len, mask, body]);
  };
  const send = (op, payload) => { if (!open || closed) return; try { stream.write(frame(op, payload)); } catch { close(); } };
  function readHandshake() {
    const end = buf.indexOf("\r\n\r\n");
    if (end < 0) { if (buf.length > HEAD_MAX) close(); return false; }
    const head = buf.subarray(0, end).toString("latin1").split("\r\n");
    buf = buf.subarray(end + 4);
    const field = n => { const l = head.find(x => x.toLowerCase().startsWith(n + ":")); return l ? l.slice(n.length + 1).trim() : ""; };
    if (!/^HTTP\/1\.1 101\b/.test(head[0]) || field("sec-websocket-accept") !== accept) { close(); return false; } /* plant:ws-accept */
    open = true;
    try { if (typeof on.open === "function") on.open(); } catch { /* told */ }
    return true;
  }
  function readFrames() {
    while (!closed && buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, at = 2;
      if (masked) { close(); return; } /* plant:ws-unmasked */
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(FRAME_MAX)) { close(); return; } len = Number(big); at = 10; }
      if (len > FRAME_MAX) { close(); return; }
      if (buf.length < at + len) return;
      const payload = buf.subarray(at, at + len);
      buf = buf.subarray(at + len);
      if (op === 0x8) { send(0x8, payload.subarray(0, 2)); close(); return; }
      if (op === 0x9) { send(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) { parts = []; partsLen = 0; }
        parts.push(Buffer.from(payload));
        partsLen += payload.length;
        if (partsLen > FRAME_MAX) { close(); return; }
        if (fin) { const text = Buffer.concat(parts).toString("utf8"); parts = []; partsLen = 0; try { on.message(text); } catch { /* told */ } }
        continue;
      }
      close();
      return;
    }
  }
  stream.on("data", chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!open && !readHandshake()) return;
    readFrames();
  });
  stream.on("error", close);
  stream.on("close", close);
  stream.on("end", close);
  const extra = Object.entries(headers || {}).filter(([k, v]) => /^[A-Za-z0-9-]+$/.test(k) && !/[\r\n]/.test(String(v)))
    .map(([k, v]) => k + ": " + v + "\r\n").join("");
  stream.write("GET " + u.pathname + u.search + " HTTP/1.1\r\nHost: " + u.host + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
    + "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n" + extra + "\r\n");
  return {
    send: text => send(0x1, Buffer.from(String(text), "utf8")),
    close: () => { if (open && !closed) send(0x8, Buffer.from([0x03, 0xe8])); close(); },
  };
}

/** The relay's socket at `url` (wss), through whatever proxy Chromium names for it. `o.resolve(httpsUrl)` is the session's
 *  resolveProxy; `o.direct(url, headers, on)` the runtime's own socket, used where the answer is DIRECT; `o.asker` the app's
 *  proxy asker, whose held Basic answer rides the CONNECT. Returns at once; a socket that never opens is closed unopened. */
function proxiedConnect(url, headers, on, o) {
  const opts = o || {};
  let inner = null, gone = false, told = false;
  const closeOnce = () => { if (told) return; told = true; try { on.close(); } catch { /* told */ } };
  const say = line => { if (opts.asker && typeof opts.asker.tell === "function") opts.asker.tell(line); };
  const handlers = { open: () => { if (!gone && typeof on.open === "function") on.open(); }, message: t => { if (!gone) on.message(t); }, close: closeOnce };
  (async () => {
    const u = new URL(String(url));
    /* Electron's resolveProxy answers with a Promise; anything else, or no answer in time, is DIRECT, the socket it was. */
    const asked = opts.resolve("https://" + u.host + u.pathname);
    let bound = null;
    const late = new Promise(r => { bound = setTimeout(() => r("DIRECT"), opts.resolveWaitMs || RESOLVE_WAIT_MS); if (bound.unref) bound.unref(); });
    const answer = asked instanceof Promise ? await Promise.race([asked.catch(() => "DIRECT"), late]) : "DIRECT"; /* plant:proxy-resolve-bound */
    clearTimeout(bound);
    const list = parseProxyList(typeof answer === "string" ? answer : "DIRECT");
    const first = list[0] || { type: "DIRECT" };
    if (gone) return closeOnce();
    if (first.type === "DIRECT") {
      inner = opts.direct(url, headers, handlers);
      if (!inner) closeOnce();
      return;
    }
    if (first.type !== "PROXY") {
      say("the relay's live connection does not go through a " + first.type + " proxy, so the relay is asked every minute instead");
      return closeOnce();
    }
    const port = Number(u.port) || 443;
    let sock;
    try { sock = await tunnel(first, { host: u.hostname, port }, opts.asker ? opts.asker.heldFor(first.host, first.port) : null, opts); }
    catch (e) {
      if (e && e.code === "proxy-auth") {
        if (opts.asker && opts.asker.heldFor(first.host, first.port)) opts.asker.refused(first.host, first.port);
        const basic = (e.schemes || []).includes("basic");
        say(basic ? "the relay's live connection waits for a sign-in to the proxy at " + proxyKey(first.host, first.port) + ", so the relay is asked every minute until then"
          : "the proxy at " + proxyKey(first.host, first.port) + " asks the relay's live connection for a sign-in it cannot give (" + (e.schemes || []).join(", ") + "), so the relay is asked every minute instead");
      } else say("the proxy at " + proxyKey(first.host, first.port) + " did not let the relay's live connection through, so the relay is asked every minute instead");
      return closeOnce();
    }
    if (gone) { sock.destroy(); return closeOnce(); }
    const secure = (opts.tlsConnect || (s => tls.connect({ socket: s, servername: u.hostname, ALPNProtocols: ["http/1.1"] })))(sock);
    inner = webSocketOver(secure, url, headers, handlers);
  })().catch(() => closeOnce());
  return {
    opens: true,
    send: t => { if (inner) inner.send(t); },
    close: () => { gone = true; if (inner) inner.close(); },
  };
}

module.exports = { parseProxyList, proxyAsker, fetchThrough, tunnel, webSocketOver, proxiedConnect, ASK_WAIT_MS, DECLINE_MS };
