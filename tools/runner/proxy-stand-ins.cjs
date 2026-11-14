"use strict";
/* THE STAND-INS tools/runner/proxy-legs.cjs measures Electron's network against, node builtins only, on 127.0.0.1:
 *   startProxy   an HTTP proxy: "basic" asks Basic of one answer, "ntlm" runs NTLM's three messages without checking any account,
 *                "open" asks nothing. A GET in absolute form for a host under proxy-lab.invalid is answered by the proxy as that
 *                origin; a CONNECT goes to the local port `tunnels` maps its target to. Every request is logged, never a credential.
 *   startPac     a setup script naming one proxy.
 *   startRelay   a TLS WebSocket server: it sends "from-relay" on open and answers each text with "echo:" and the text.
 *   makeLabCerts a lab root and a leaf for relay.proxy-lab.invalid, made by openssl in a folder given.
 *
 *   node tools/runner/proxy-stand-ins.cjs --selftest <scratch dir>
 * starts each stand-in and drives it with node's own net, http and tls, so a red here is the instrument, not the product. It
 * touches no proxy setting and starts no Electron. Exit: the number of failed checks; 78 where openssl is missing. */
const net = require("node:net");
const http = require("node:http");
const tls = require("node:tls");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const LAB_DOMAIN = "proxy-lab.invalid";
const ORIGIN = "http://origin." + LAB_DOMAIN;
const RELAY_HOST = "relay." + LAB_DOMAIN;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/* ---- NTLM's messages, as far as a proxy that checks no account needs them ---------------------------------------- */

const NTLM_SIG = Buffer.from("NTLMSSP\0", "latin1");
const F = { UNICODE: 0x1, OEM: 0x2, REQUEST_TARGET: 0x4, SIGN: 0x10, SEAL: 0x20, NTLM: 0x200, ALWAYS_SIGN: 0x8000, TARGET_DOMAIN: 0x10000,
  ESS: 0x80000, TARGET_INFO: 0x800000, VERSION: 0x2000000, N128: 0x20000000, KEY_EXCH: 0x40000000, N56: 0x80000000 };

/** A Proxy-Authorization or Proxy-Authenticate value's NTLM message: { type, flags, buf } or null. */
function ntlmMessage(header) {
  const m = /^NTLM\s+([A-Za-z0-9+/=]+)\s*$/i.exec(String(header || ""));
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 12 || !buf.subarray(0, 8).equals(NTLM_SIG)) return null;
  const type = buf.readUInt32LE(8);
  const flags = type === 1 && buf.length >= 16 ? buf.readUInt32LE(12) : type === 2 && buf.length >= 24 ? buf.readUInt32LE(20)
    : type === 3 && buf.length >= 64 ? buf.readUInt32LE(60) : 0;
  return { type, flags, buf };
}

/** A security buffer's length at `at` in a Type 3 message (LM 12, NT 20, domain 28, user 36, workstation 44). */
const fieldLen = (buf, at) => (buf.length >= at + 8 ? buf.readUInt16LE(at) : 0);

/* The challenge carries target information, since a client answering NTLMv2 builds its response over it. */
function ntlmChallenge(clientFlags) {
  let flags = F.NTLM | F.ALWAYS_SIGN | F.TARGET_DOMAIN | F.TARGET_INFO | F.REQUEST_TARGET;
  flags |= clientFlags & (F.ESS | F.N128 | F.KEY_EXCH | F.N56 | F.VERSION | F.SIGN | F.SEAL);
  flags |= clientFlags & F.UNICODE ? F.UNICODE : F.OEM;
  const text = s => (flags & F.UNICODE ? Buffer.from(s, "utf16le") : Buffer.from(s, "latin1"));
  const av = (id, value) => { const h = Buffer.alloc(4); h.writeUInt16LE(id, 0); h.writeUInt16LE(value.length, 2); return Buffer.concat([h, value]); };
  const stamp = Buffer.alloc(8);
  stamp.writeBigUInt64LE((BigInt(Date.now()) + 11644473600000n) * 10000n);
  const u16 = s => Buffer.from(s, "utf16le");
  const info = Buffer.concat([av(2, u16("LAB")), av(1, u16("PROXY")), av(4, u16(LAB_DOMAIN)), av(3, u16("proxy." + LAB_DOMAIN)), av(7, stamp), av(0, Buffer.alloc(0))]);
  const target = text("LAB");
  const head = Buffer.alloc(56);
  NTLM_SIG.copy(head, 0);
  head.writeUInt32LE(2, 8);
  head.writeUInt16LE(target.length, 12); head.writeUInt16LE(target.length, 14); head.writeUInt32LE(56, 16);
  head.writeUInt32LE(flags >>> 0, 20);
  crypto.randomBytes(8).copy(head, 24);
  head.writeUInt16LE(info.length, 40); head.writeUInt16LE(info.length, 42); head.writeUInt32LE(56 + target.length, 44);
  Buffer.from([10, 0, 0x61, 0x4a, 0, 0, 0, 15]).copy(head, 48);
  return Buffer.concat([head, target, info]).toString("base64");
}

/* ---- the proxy ---------------------------------------------------------------------------------------------------- */

/** An HTTP proxy on 127.0.0.1. `o.mode` "basic" | "ntlm" | "open"; `o.answer` { username, password } for basic; `o.tunnels`
 *  { "host:port": localPort }. Resolves to { port, log, close }. Each log entry: { kind, path, auth, status, conn }, and for NTLM
 *  messages { ntlm: 1|3, userBytes, ntBytes }; `auth` is "none", "right", "wrong", "ntlm" or "conn" (a connection NTLM opened). */
function startProxy(o) {
  const opts = o || {};
  const log = [];
  let conns = 0;
  const basicRight = opts.answer ? "Basic " + Buffer.from(opts.answer.username + ":" + opts.answer.password, "utf8").toString("base64") : null;
  /** What the proxy says to one request's Proxy-Authorization: { ok } or { status, headers }, and the log entry's fields. */
  function judge(header, sock, entry) {
    if (opts.mode === "open") { entry.auth = header ? "unasked" : "none"; return { ok: true }; }
    if (opts.mode === "basic") {
      entry.auth = !header ? "none" : header === basicRight ? "right" : "wrong";
      return entry.auth === "right" ? { ok: true } : { status: 407, headers: { "Proxy-Authenticate": "Basic realm=\"lab\"" } };
    }
    if (sock.labNtlmDone && !header) { entry.auth = "conn"; return { ok: true }; }
    const msg = ntlmMessage(header);
    entry.auth = !header ? "none" : msg ? "ntlm" : "wrong";
    if (msg && msg.type === 1) { entry.ntlm = 1; return { status: 407, headers: { "Proxy-Authenticate": "NTLM " + ntlmChallenge(msg.flags) } }; }
    if (msg && msg.type === 3) {
      entry.ntlm = 3; entry.userBytes = fieldLen(msg.buf, 36); entry.ntBytes = fieldLen(msg.buf, 20);
      sock.labNtlmDone = true;
      return { ok: true };
    }
    return { status: 407, headers: { "Proxy-Authenticate": "NTLM" } };
  }
  const server = http.createServer((req, res) => {
    const sock = req.socket;
    if (!sock.labId) sock.labId = ++conns;
    const entry = { kind: "get", path: "", auth: "", status: 0, conn: sock.labId };
    log.push(entry);
    let u = null;
    try { u = new URL(req.url); } catch { u = null; }
    entry.path = u ? u.pathname : String(req.url).slice(0, 80);
    const d = judge(req.headers["proxy-authorization"], sock, entry);
    req.resume();
    if (!d.ok) {
      entry.status = d.status;
      res.writeHead(d.status, Object.assign({ "Content-Length": "0", "Proxy-Connection": "keep-alive", Connection: "keep-alive" }, d.headers));
      res.end();
      return;
    }
    if (!u || u.protocol !== "http:" || !(u.hostname === LAB_DOMAIN || u.hostname.endsWith("." + LAB_DOMAIN))) {
      entry.status = 502;
      res.writeHead(502, { "Content-Length": "0" });
      res.end();
      return;
    }
    const body = "origin " + u.pathname;
    entry.status = 200;
    res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": String(Buffer.byteLength(body)) });
    res.end(body);
  });
  /* A CONNECT's socket leaves node's parser, so an NTLM challenge here is answered once and the socket closed: the relay's
     tunnel cannot speak NTLM, and a client that can opens a new connection for each message it sends. */
  server.on("connect", (req, sock, head) => {
    if (!sock.labId) sock.labId = ++conns;
    const entry = { kind: "connect", path: String(req.url).slice(0, 120), auth: "", status: 0, conn: sock.labId };
    log.push(entry);
    sock.on("error", () => {});
    const d = judge(req.headers["proxy-authorization"], sock, entry);
    if (!d.ok) {
      entry.status = d.status;
      sock.end("HTTP/1.1 " + d.status + " Proxy Authentication Required\r\n"
        + Object.entries(d.headers).map(([k, v]) => k + ": " + v + "\r\n").join("") + "Content-Length: 0\r\n\r\n");
      return;
    }
    const to = (opts.tunnels || {})[String(req.url).toLowerCase()];
    if (!to) { entry.status = 502; sock.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"); return; }
    const up = net.connect({ host: "127.0.0.1", port: to }, () => {
      entry.status = 200;
      sock.write("HTTP/1.1 200 Connection established\r\n\r\n");
      if (head && head.length) up.write(head);
      sock.pipe(up); up.pipe(sock);
    });
    up.on("error", () => sock.destroy());
    sock.on("close", () => up.destroy());
  });
  server.on("clientError", (e, sock) => { try { sock.destroy(); } catch { /* gone */ } });
  return listen(server).then(port => ({ port, log, close: () => closeServer(server) }));
}

/** A setup script at /lab.pac naming PROXY 127.0.0.1:<proxyPort> for every address. Resolves to { port, url, hits, close }. */
function startPac(proxyPort) {
  const hits = [];
  const script = "function FindProxyForURL(url, host) { return \"PROXY 127.0.0.1:" + proxyPort + "\"; }\n";
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    req.resume();
    if (req.url !== "/lab.pac") { res.writeHead(404, { "Content-Length": "0" }); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/x-ns-proxy-autoconfig", "Content-Length": String(Buffer.byteLength(script)) });
    res.end(script);
  });
  return listen(server).then(port => ({ port, url: "http://127.0.0.1:" + port + "/lab.pac", hits, close: () => closeServer(server) }));
}

/** The relay's socket: TLS with `certs`, one WebSocket per connection. `got` records { opened, texts }. */
function startRelay(certs) {
  const got = { opened: 0, texts: [], badMask: 0 };
  const frame = text => { const p = Buffer.from(text, "utf8"); return Buffer.concat([Buffer.from([0x81, p.length]), p]); };
  const server = tls.createServer({ key: certs.leafKey, cert: certs.leafCert, ALPNProtocols: ["http/1.1"] }, sock => {
    let buf = Buffer.alloc(0), open = false;
    sock.on("error", () => {});
    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.subarray(0, end).toString("latin1").split("\r\n");
        buf = buf.subarray(end + 4);
        const key = (head.find(l => /^sec-websocket-key:/i.test(l)) || "").replace(/^[^:]*:\s*/, "");
        if (!/^GET \S+ HTTP\/1\.1$/.test(head[0]) || !key) { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
        sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
          + crypto.createHash("sha1").update(key + WS_GUID).digest("base64") + "\r\n\r\n");
        open = true;
        got.opened++;
        sock.write(frame("from-relay"));
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0, len = buf[1] & 0x7f;
        if (len > 125) { sock.destroy(); return; }
        const at = 2 + (masked ? 4 : 0);
        if (buf.length < at + len) return;
        if (!masked) got.badMask++;
        const k = masked ? buf.subarray(2, 6) : Buffer.alloc(4);
        const p = Buffer.from(buf.subarray(at, at + len).map((b, i) => b ^ k[i & 3]));
        buf = buf.subarray(at + len);
        if (op === 0x1) { const t = p.toString("utf8"); got.texts.push(t); sock.write(frame("echo:" + t)); }
        else if (op === 0x8) { sock.end(); return; }
      }
    });
  });
  return listen(server).then(port => ({ port, got, close: () => closeServer(server) }));
}

/** A lab root and a leaf for RELAY_HOST, by openssl in `dir`. Returns { ca, leafKey, leafCert } as PEM text, or null without openssl. */
function makeLabCerts(dir) {
  const OPENSSL = ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe"]
    .find(p => { const r = spawnSync(p, ["version"], { encoding: "utf8", windowsHide: true }); return r.status === 0; });
  if (!OPENSSL) return null;
  const ssl = (...args) => {
    const r = spawnSync(OPENSSL, args, { cwd: dir, encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error("openssl " + args[0] + " failed: " + String(r.stderr || r.error).split("\n")[0]);
  };
  const ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
  fs.writeFileSync(path.join(dir, "leaf.ext"), "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + RELAY_HOST + "\n");
  ssl("req", "-x509", ...ec, "-keyout", "root.key", "-out", "root.pem", "-days", "2", "-subj", "/CN=Proxy lab root",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  ssl("req", ...ec, "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=" + RELAY_HOST);
  ssl("x509", "-req", "-in", "leaf.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-out", "leaf.pem", "-days", "1", "-extfile", "leaf.ext");
  const read = n => fs.readFileSync(path.join(dir, n), "utf8");
  return { ca: read("root.pem"), leafKey: read("leaf.key"), leafCert: read("leaf.pem") };
}

/** The relay leg's one run: proxiedConnect (given, the shipped function) to `url`, "from-desk" sent on open; settles when the echo
 *  arrives, the socket closes, or `waitMs` passes. Resolves to { opened, received, closed, timedOut, ms }. */
function relayThrough(proxiedConnect, url, opts, waitMs) {
  return new Promise(resolve => {
    const t0 = Date.now(), received = [];
    let opened = false, done = false, h = null;
    const finish = (closed, timedOut) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { if (h && !closed) h.close(); } catch { /* gone */ }
      resolve({ opened, received, closed, timedOut, ms: Date.now() - t0 });
    };
    const timer = setTimeout(() => finish(false, true), waitMs || 20000);
    h = proxiedConnect(url, { "X-Proxy-Lab": "1" }, {
      open: () => { opened = true; h.send("from-desk"); },
      message: t => { received.push(t); if (t === "echo:from-desk") finish(false, false); },
      close: () => finish(true, false),
    }, opts);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port)); });
}
function closeServer(server) {
  return new Promise(resolve => {
    try { if (typeof server.closeAllConnections === "function") server.closeAllConnections(); } catch { /* none */ }
    server.close(() => resolve("closed"));
    setTimeout(() => resolve("closed late"), 3000).unref();
  });
}

module.exports = { LAB_DOMAIN, ORIGIN, RELAY_HOST, startProxy, startPac, startRelay, makeLabCerts, relayThrough, ntlmMessage, ntlmChallenge };

/* ---- the self-check ----------------------------------------------------------------------------------------------- */

/* One request through a proxy on a kept connection: resolves to { status, headers, body }. */
function rawRequest(sock, lines) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = buf.subarray(0, end).toString("latin1").split("\r\n");
      const len = Number(((head.find(l => /^content-length:/i.test(l)) || "").replace(/^[^:]*:\s*/, "")) || 0);
      if (buf.length < end + 4 + len) return;
      sock.removeListener("data", onData);
      sock.removeListener("error", reject);
      resolve({ status: Number((/^HTTP\/1\.[01] (\d{3})/.exec(head[0]) || [])[1]), headers: head.slice(1), body: buf.subarray(end + 4, end + 4 + len).toString("utf8") });
    };
    sock.on("data", onData);
    sock.once("error", reject);
    sock.write(lines.join("\r\n") + "\r\n\r\n");
  });
}
const connectTo = port => new Promise((resolve, reject) => { const s = net.connect({ host: "127.0.0.1", port }, () => resolve(s)); s.once("error", reject); });
const headerOf = (headers, name) => (headers.find(l => l.toLowerCase().startsWith(name + ":")) || "").replace(/^[^:]*:\s*/, "");

/* A Type 1 and a Type 3 as a client would send them; the Type 3 carries a user name field and an NTLMv2-sized response. */
function clientType1() {
  const b = Buffer.alloc(32);
  NTLM_SIG.copy(b, 0); b.writeUInt32LE(1, 8); b.writeUInt32LE((F.UNICODE | F.NTLM | F.REQUEST_TARGET | F.ESS | F.N128 | F.N56) >>> 0, 12);
  return "NTLM " + b.toString("base64");
}
function clientType3(user) {
  const u = Buffer.from(user, "utf16le"), nt = crypto.randomBytes(48), lm = Buffer.alloc(24);
  const head = Buffer.alloc(64);
  NTLM_SIG.copy(head, 0); head.writeUInt32LE(3, 8);
  let at = 64;
  const field = (off, b) => { head.writeUInt16LE(b.length, off); head.writeUInt16LE(b.length, off + 2); head.writeUInt32LE(at, off + 4); at += b.length; };
  field(12, lm); field(20, nt); field(28, Buffer.alloc(0)); field(36, u); field(44, Buffer.alloc(0)); field(52, Buffer.alloc(0));
  head.writeUInt32LE((F.UNICODE | F.NTLM) >>> 0, 60);
  return "NTLM " + Buffer.concat([head, lm, nt, u]).toString("base64");
}

async function selftest(scratch) {
  let failed = 0, ran = 0;
  const check = (ok, what) => { ran++; if (!ok) failed++; process.stdout.write((ok ? "  ok   " : "  FAIL ") + what + "\n"); };
  const answer = { username: "lab-person", password: crypto.randomBytes(8).toString("hex") };
  const basicOf = a => "Basic " + Buffer.from(a.username + ":" + a.password).toString("base64");
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "stand-ins-"));
  const certs = makeLabCerts(dir);
  if (!certs) { process.stdout.write("#selftest refused: no openssl to make the lab root\n"); return 78; }
  const relay = await startRelay(certs);
  const tunnels = { [RELAY_HOST + ":443"]: relay.port };
  const basic = await startProxy({ mode: "basic", answer, tunnels });
  const ntlm = await startProxy({ mode: "ntlm", tunnels });
  const open = await startProxy({ mode: "open", tunnels });
  const pac = await startPac(open.port);
  const closers = [relay, basic, ntlm, open, pac];
  try {
    const get = (p, extra) => ["GET " + ORIGIN + p + " HTTP/1.1", "Host: origin." + LAB_DOMAIN].concat(extra || []);

    let s = await connectTo(basic.port);
    const b1 = await rawRequest(s, get("/a"));
    const b2 = await rawRequest(s, get("/a", ["Proxy-Authorization: " + basicOf({ username: "lab-person", password: "not-it" })]));
    const b3 = await rawRequest(s, get("/a", ["Proxy-Authorization: " + basicOf(answer)]));
    s.destroy();
    check(b1.status === 407 && /^Basic /.test(headerOf(b1.headers, "proxy-authenticate")) && b2.status === 407 && b3.status === 200 && b3.body === "origin /a",
      "s1 basic: none and a wrong answer get 407 Basic, the right one the origin's body: " + [b1.status, b2.status, b3.status].join(" "));
    check(basic.log.map(e => e.auth).join(",") === "none,wrong,right", "s1b basic logs the three answers as none, wrong, right: " + basic.log.map(e => e.auth).join(","));

    s = await connectTo(ntlm.port);
    const n1 = await rawRequest(s, get("/n"));
    const n2 = await rawRequest(s, get("/n", ["Proxy-Authorization: " + clientType1()]));
    const t2 = ntlmMessage(headerOf(n2.headers, "proxy-authenticate"));
    const n3 = await rawRequest(s, get("/n", ["Proxy-Authorization: " + clientType3("someone")]));
    const n4 = await rawRequest(s, get("/n2"));
    s.destroy();
    const infoLen = t2 ? t2.buf.readUInt16LE(40) : 0;
    check(n1.status === 407 && headerOf(n1.headers, "proxy-authenticate") === "NTLM" && n2.status === 407 && t2 && t2.type === 2
      && (t2.flags & F.TARGET_INFO) !== 0 && infoLen > 0 && t2.buf.length === 56 + 6 + infoLen,
      "s2 ntlm: a bare 407 NTLM, then a Type 2 with target information (" + infoLen + " bytes) to the Type 1");
    const t3 = ntlm.log.find(e => e.ntlm === 3);
    check(n3.status === 200 && n3.body === "origin /n" && t3 && t3.userBytes === 14 && t3.ntBytes === 48,
      "s2b ntlm: the Type 3 opens the origin and is logged with its user field's length: " + (t3 ? t3.userBytes + " bytes" : "none"));
    check(n4.status === 200 && ntlm.log[ntlm.log.length - 1].auth === "conn", "s2c ntlm: the connection the Type 3 opened stays open for the next request");

    s = await connectTo(open.port);
    const o1 = await rawRequest(s, get("/o"));
    s.destroy();
    check(o1.status === 200 && o1.body === "origin /o" && open.log[0].auth === "none", "s3 open: no question, the origin's body");

    const pacBody = await new Promise((resolve, reject) => http.get(pac.url, r => { let t = ""; r.on("data", d => { t += d; }); r.on("end", () => resolve(t)); }).on("error", reject));
    check(pacBody.indexOf("PROXY 127.0.0.1:" + open.port) > 0 && pac.hits.length === 1, "s4 pac: the script names the open proxy");

    const c1 = await rawRequest(await connectTo(ntlm.port), ["CONNECT " + RELAY_HOST + ":443 HTTP/1.1", "Host: " + RELAY_HOST + ":443"]);
    const c2 = await rawRequest(await connectTo(basic.port), ["CONNECT " + RELAY_HOST + ":443 HTTP/1.1", "Host: " + RELAY_HOST + ":443"]);
    check(c1.status === 407 && headerOf(c1.headers, "proxy-authenticate") === "NTLM" && c2.status === 407 && /^Basic /.test(headerOf(c2.headers, "proxy-authenticate")),
      "s5 a CONNECT without an answer: 407 NTLM from the ntlm proxy, 407 Basic from the basic one");

    const ws = await new Promise((resolve, reject) => {
      const raw = net.connect({ host: "127.0.0.1", port: basic.port }, () => {
        raw.write("CONNECT " + RELAY_HOST + ":443 HTTP/1.1\r\nHost: " + RELAY_HOST + ":443\r\nProxy-Authorization: " + basicOf(answer) + "\r\n\r\n");
      });
      raw.once("error", reject);
      let head = Buffer.alloc(0);
      const onHead = chunk => {
        head = Buffer.concat([head, chunk]);
        if (head.indexOf("\r\n\r\n") < 0) return;
        raw.removeListener("data", onHead);
        if (!/^HTTP\/1\.1 200/.test(head.toString("latin1"))) { resolve({ tunnel: false }); raw.destroy(); return; }
        const t = tls.connect({ socket: raw, servername: RELAY_HOST, ca: certs.ca, ALPNProtocols: ["http/1.1"] });
        t.once("error", e => resolve({ tunnel: true, tls: String(e.message) }));
        t.once("secureConnect", () => {
          t.write("GET /socket HTTP/1.1\r\nHost: " + RELAY_HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: "
            + crypto.randomBytes(16).toString("base64") + "\r\nSec-WebSocket-Version: 13\r\n\r\n");
        });
        let buf = Buffer.alloc(0), upgraded = false;
        const texts = [];
        t.on("data", d => {
          buf = Buffer.concat([buf, d]);
          if (!upgraded) {
            const end = buf.indexOf("\r\n\r\n");
            if (end < 0) return;
            upgraded = /^HTTP\/1\.1 101/.test(buf.toString("latin1"));
            buf = buf.subarray(end + 4);
            const p = Buffer.from("from-desk"), k = crypto.randomBytes(4);
            t.write(Buffer.concat([Buffer.from([0x81, 0x80 | p.length]), k, Buffer.from(p.map((x, i) => x ^ k[i & 3]))]));
          }
          while (buf.length >= 2 && buf.length >= 2 + (buf[1] & 0x7f)) {
            const len = buf[1] & 0x7f;
            texts.push(buf.subarray(2, 2 + len).toString("utf8"));
            buf = buf.subarray(2 + len);
          }
          if (texts.includes("echo:from-desk")) { t.destroy(); resolve({ tunnel: true, upgraded, texts }); }
        });
      };
      raw.on("data", onHead);
      setTimeout(() => resolve({ tunnel: "timeout" }), 10000).unref();
    });
    check(ws.tunnel === true && ws.upgraded && ws.texts.join(",") === "from-relay,echo:from-desk" && relay.got.texts.join(",") === "from-desk" && relay.got.badMask === 0,
      "s6 the right Basic answer tunnels to the relay stand-in, TLS against the lab root, and text crosses both ways: " + JSON.stringify(ws.texts || ws));

    const all = JSON.stringify([basic.log, ntlm.log, open.log]);
    check(all.indexOf(answer.password) < 0 && all.indexOf(Buffer.from(answer.username + ":" + answer.password).toString("base64")) < 0,
      "s7 no log entry carries the answer");
  } finally {
    for (const c of closers) await c.close();
  }
  process.stdout.write("#selftest " + (failed ? "fail" : "ok") + " ran=" + ran + " failed=" + failed + "\n");
  return failed ? Math.min(failed, 63) : 0;
}

if (require.main === module) {
  const at = process.argv.indexOf("--selftest");
  if (at < 0 || !process.argv[at + 1]) { process.stdout.write("usage: node tools/runner/proxy-stand-ins.cjs --selftest <scratch dir>\n"); process.exit(78); }
  selftest(path.resolve(process.argv[at + 1])).then(code => process.exit(code), e => { process.stdout.write("#selftest threw: " + String(e && e.stack || e) + "\n"); process.exit(63); });
}
