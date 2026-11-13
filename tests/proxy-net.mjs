/* A COMPANY PROXY: the shell's calls answer a proxy's sign-in, and the relay's socket goes through the proxy Chromium names
 * (shell/proxy-net.cjs, and its wiring in shell/main.js). Node only, no window, nothing outside a lab folder in the temp
 * directory: the proxies, the relay's socket server and Electron's net are stand-ins made here, every credential is
 * invented, and no system proxy setting, registry key or credential store is read or written.
 *
 *   p1  Chromium's proxy list is read into entries (DIRECT, PROXY, the rest kept by type).
 *   p2  the asker: a server's challenge is cancelled unasked; a proxy's is asked once per proxy however many calls wait,
 *       the answer is held for later calls, a refused answer is asked again, "Not now" holds, and a call waits a bounded time.
 *   p3  fetchThrough is net.fetch with a login listener: a stand-in of Electron's request, which cancels a challenge when
 *       nothing listens, is answered from the asker, and the answer's body and status arrive as a Response.
 *   p4  the CONNECT tunnel through a stand-in proxy asking Basic: no answer and a wrong one are refused with the schemes,
 *       the right one opens; a proxy asking only Windows sign-in names its schemes; a 403 is a refusal.
 *   p5  the WebSocket client inside: the handshake's accept is checked, fragments join, a ping is answered, a masked
 *       frame from the server ends it, and its own frames are masked.
 *   p6  proxiedConnect end to end: through the proxy with the held answer the relay's socket opens and carries text; DIRECT
 *       takes the runtime's own socket; a proxy asking Windows sign-in or a SOCKS proxy closes it unopened, said once.
 *   p7  shell/main.js: every call goes through deskFetch, deskFetch hands the asker's listener, and relayConnect asks the
 *       session's resolveProxy and takes proxiedConnect.
 *   p8  each plant lifted turns its own case red.
 *
 *     node tests/proxy-net.mjs        exit code is the number of failed checks, capped at 63
 */
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const nodeRequire = createRequire(import.meta.url);
const NET_FILE = process.env.PROXY_NET_FILE || path.join(ROOT, "shell", "proxy-net.cjs");
const MAIN_FILE = process.env.PROXY_MAIN_FILE || path.join(ROOT, "shell", "main.js");
const ONLY = process.env.PROXY_NET_ONLY || "";
const EXPECTED = 54;
const USER = "proxy-person", PASS = "invented-" + crypto.randomBytes(4).toString("hex");
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

let ran = 0, failed = 0;
const quiet = !!ONLY;
function check(ok, what) {
  ran++;
  if (!ok) failed++;
  if (!quiet || !ok) console.log((ok ? "  ok   " : "  FAIL ") + what);
}
const want = id => !ONLY || ONLY.split(",").includes(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setImmediate(r));

let P;
try { P = nodeRequire(NET_FILE); } catch (e) { P = null; console.log("  FAIL shell/proxy-net.cjs could not be loaded: " + String(e && e.message || e).split("\n")[0]); }

/* ---- stand-ins ---------------------------------------------------------------------------------------------------- */

/* A CONNECT proxy on 127.0.0.1. `mode` "basic" asks Basic of USER:PASS, "windows" asks NTLM and Negotiate only, "deny"
   answers 403, "open" asks nothing. It records each CONNECT's target and whether it carried the right answer. */
function standProxy(mode) {
  const seen = [];
  const server = net.createServer(sock => {
    let buf = Buffer.alloc(0);
    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      sock.removeListener("data", onData);
      const head = buf.subarray(0, end).toString("latin1").split("\r\n");
      const m = /^CONNECT (\S+):(\d+) HTTP\/1\.1$/.exec(head[0]);
      const auth = (head.find(l => /^proxy-authorization:/i.test(l)) || "").replace(/^[^:]*:\s*/, "");
      const right = auth === "Basic " + Buffer.from(USER + ":" + PASS).toString("base64");
      seen.push({ target: m ? m[1] + ":" + m[2] : head[0], auth: auth ? (right ? "right" : "wrong") : "none" });
      if (!m) { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
      if (mode === "deny") { sock.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n"); return; }
      if (mode === "windows") { sock.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Negotiate\r\nProxy-Authenticate: NTLM\r\nContent-Length: 0\r\n\r\n"); return; }
      if (mode === "basic" && !right) { sock.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"lab\"\r\nContent-Length: 0\r\n\r\n"); return; }
      const up = net.connect({ host: "127.0.0.1", port: Number(m[2]) }, () => {
        sock.write("HTTP/1.1 200 Connection established\r\n\r\n");
        const rest = buf.subarray(end + 4);
        if (rest.length) up.write(rest);
        sock.pipe(up); up.pipe(sock);
      });
      up.on("error", () => sock.destroy());
      sock.on("error", () => up.destroy());
    };
    sock.on("data", onData);
    sock.on("error", () => {});
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r({ server, seen, port: server.address().port })));
}

/* A WebSocket server, plain TCP (the tunnel's TLS is the platform's, and a lab has no certificate the system trusts).
   `bad` "accept" answers a wrong Sec-WebSocket-Accept; "masked" sends its first frame masked. It sends "hel" + "lo" as two
   fragments, then a ping, and records what the client sends, unmasked, and whether every client frame was masked. */
function standSocket(bad) {
  const got = { texts: [], pongs: 0, allMasked: true, headers: null, closes: 0 };
  const frame = (op, payload, fin, mask) => {
    const p = Buffer.from(payload);
    const head = Buffer.from([(fin ? 0x80 : 0) | op, (mask ? 0x80 : 0) | p.length]);
    if (!mask) return Buffer.concat([head, p]);
    const k = Buffer.from([1, 2, 3, 4]);
    return Buffer.concat([head, k, Buffer.from(p.map((b, i) => b ^ k[i & 3]))]);
  };
  const server = net.createServer(sock => {
    let buf = Buffer.alloc(0), open = false;
    sock.on("error", () => {});
    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.subarray(0, end).toString("latin1").split("\r\n");
        buf = buf.subarray(end + 4);
        const field = n => (head.find(l => l.toLowerCase().startsWith(n + ":")) || "").replace(/^[^:]*:\s*/, "");
        got.headers = { path: head[0], authorization: field("authorization"), upgrade: field("upgrade"), version: field("sec-websocket-version") };
        const accept = crypto.createHash("sha1").update(field("sec-websocket-key") + WS_GUID).digest("base64");
        sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
          + (bad === "accept" ? accept.replace(/^./, c => (c === "A" ? "B" : "A")) : accept) + "\r\n\r\n");
        open = true;
        if (bad === "masked") sock.write(frame(0x1, "masked", true, true));
        else { sock.write(frame(0x1, "hel", false, false)); sock.write(frame(0x0, "lo", true, false)); sock.write(frame(0x9, "pp", true, false)); }
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0, len = buf[1] & 0x7f;
        const at = 2 + (masked ? 4 : 0);
        if (buf.length < at + len) return;
        if (!masked) got.allMasked = false;
        const k = masked ? buf.subarray(2, 6) : Buffer.alloc(4);
        const p = Buffer.from(buf.subarray(at, at + len).map((b, i) => b ^ k[i & 3]));
        buf = buf.subarray(at + len);
        if (op === 0x1) got.texts.push(p.toString("utf8"));
        else if (op === 0xA) got.pongs++;
        else if (op === 0x8) { got.closes++; sock.end(); }
      }
    });
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r({ server, got, port: server.address().port })));
}

/* Electron's net.request as far as fetchThrough uses it: one `login` per challenge in `challenges`, then a 200 with `body`
   where every challenge was answered with USER and PASS; a challenge nothing listens to is cancelled, as Electron's own
   ClientRequest does (net-client-request.ts: an unhandled login calls the callback with nothing). */
function standNet(challenges, body) {
  const made = [];
  const { EventEmitter } = nodeRequire("node:events");
  const { Readable } = nodeRequire("node:stream");
  return {
    made,
    request(opts) {
      const r = new EventEmitter();
      const rec = { opts, headers: {}, written: [], answers: [], aborted: false };
      made.push(rec);
      r.setHeader = (k, v) => { rec.headers[String(k).toLowerCase()] = v; };
      r.write = b => { rec.written.push(Buffer.from(b)); };
      r.abort = () => { rec.aborted = true; };
      r.end = () => {
        (async () => {
          for (const c of challenges) {
            const answer = await new Promise(res => { if (!r.emit("login", c, (u, p) => res({ u, p }))) res({}); });
            rec.answers.push(answer);
            if (answer.u !== USER || answer.p !== PASS) { r.emit("error", new Error("net::ERR_PROXY_AUTH_REQUESTED")); return; }
          }
          if (rec.aborted) return;
          const resp = Readable.from([Buffer.from(body)]);
          resp.statusCode = 200; resp.statusMessage = "OK"; resp.headers = { "content-type": "application/json", "x-two": ["a", "b"] };
          r.emit("response", resp);
        })();
      };
      return r;
    },
  };
}
const proxyInfo = (port, scheme) => ({ isProxy: true, scheme: scheme || "basic", host: "proxy.lab.invalid", port: port || 3128, realm: "lab" });

/* ---- the cases ---------------------------------------------------------------------------------------------------- */

async function p1() {
  const L = P.parseProxyList;
  check(JSON.stringify(L("DIRECT")) === '[{"type":"DIRECT"}]', "p1a DIRECT alone is one DIRECT entry");
  check(JSON.stringify(L("PROXY proxy.example:8080; DIRECT")) === '[{"type":"PROXY","host":"proxy.example","port":8080},{"type":"DIRECT"}]',
    "p1b PROXY host:port then DIRECT, in order");
  check(JSON.stringify(L("HTTPS [::1]:443;SOCKS5 s:1080")) === '[{"type":"HTTPS","host":"::1","port":443},{"type":"SOCKS5","host":"s","port":1080}]',
    "p1c a bracketed address and other types are kept by type");
  check(L("PROXY nohost; PROXY a:99999; ; junk here:1 x").length === 0 && L("").length === 0 && L(null).length === 0, "p1d entries without a port, out of range or malformed are dropped");
}

async function p2() {
  let asked = [], resolveAsk = null, clock = 1000;
  const lines = [];
  const A = P.proxyAsker({ ask: info => { asked.push(info); return new Promise(r => { resolveAsk = r; }); }, say: l => lines.push(l), now: () => clock, waitMs: 200, declineMs: 5000 });
  const call = (info, h) => new Promise(res => (h || A.forRequest())(info, (u, p) => res({ u, p })));

  const server = await call({ isProxy: false, scheme: "basic", host: "etiuda.dev", port: 443, realm: "x" });
  check(server.u === undefined && asked.length === 0, "p2a a server's challenge is cancelled and the person is not asked");

  const one = call(proxyInfo()), two = call(proxyInfo());
  await tick(); await tick();
  check(asked.length === 1 && asked[0].host === "proxy.lab.invalid" && asked[0].port === 3128 && asked[0].again === false,
    "p2b two calls waiting on one proxy ask the person once: " + asked.length);
  resolveAsk({ username: USER, password: PASS });
  const [a1, a2] = await Promise.all([one, two]);
  check(a1.u === USER && a1.p === PASS && a2.u === USER && a2.p === PASS, "p2c the one answer goes to both calls");
  check(JSON.stringify(A.heldFor("PROXY.lab.invalid", 3128)) === JSON.stringify({ username: USER, password: PASS }), "p2d the answer is held for this proxy, the host's case aside");

  const later = await call(proxyInfo());
  check(later.u === USER && asked.length === 1, "p2e a later call is answered from what is held, unasked");

  const h = A.forRequest();
  const first = await call(proxyInfo(), h);
  const again = call(proxyInfo(), h);
  await tick(); await tick();
  check(first.u === USER && asked.length === 2 && asked[1].again === true && A.heldFor("proxy.lab.invalid", 3128) === null,
    "p2f a second challenge on the same call means the answer was refused: it is forgotten and asked again, marked again");
  resolveAsk(null);
  const declined = await again;
  check(declined.u === undefined, "p2g Not now cancels the waiting call");
  const after = await call(proxyInfo());
  check(after.u === undefined && asked.length === 2, "p2h while Not now holds, a call through that proxy is refused unasked");
  clock += 6000;
  const reask = call(proxyInfo());
  await tick(); await tick();
  check(asked.length === 3, "p2i once Not now has run its time, the next call asks again");
  const waited = await reask;
  check(waited.u === undefined, "p2j a call waits a bounded time on the person, then goes unanswered");
  resolveAsk({ username: USER, password: PASS });
  await tick(); await tick();
  check(A.heldFor("proxy.lab.invalid", 3128) !== null, "p2k the question stays open past that wait, and its answer is held for the next call");
  const text = lines.join("\n");
  check(lines.length > 0 && text.indexOf(PASS) < 0 && text.indexOf(USER) < 0, "p2l what the asker says names the proxy, never the name or password: " + lines.length + " line(s)");
  const other = P.proxyAsker({ ask: () => Promise.resolve({ username: "", password: "x" }) });
  const blank = await new Promise(res => other.forRequest()(proxyInfo(9), (u, p) => res({ u, p })));
  check(blank.u === undefined, "p2m an empty name is no answer");
}

async function p3() {
  const A = P.proxyAsker({ ask: async () => ({ username: USER, password: PASS }) });
  const N = standNet([proxyInfo()], '{"ok":true}');
  const res = await P.fetchThrough(N, "https://etiuda.dev/relay/v1/x", { method: "POST", headers: { "content-type": "application/json", "x-k": "v" }, body: Buffer.from("{}"), redirect: "error", cache: "no-store" }, A.forRequest());
  const text = await res.text();
  const rec = N.made[0];
  check(res.status === 200 && text === '{"ok":true}' && res.headers.get("x-two") === "a, b", "p3a a proxy's challenge answered, the call's status, body and headers arrive: " + res.status);
  check(rec.opts.method === "POST" && rec.opts.url === "https://etiuda.dev/relay/v1/x" && rec.opts.redirect === "error" && rec.opts.cache === "no-store"
    && rec.opts.credentials === "include" && rec.headers["x-k"] === "v" && Buffer.concat(rec.written).toString() === "{}",
    "p3b the request carries net.fetch's own options, the headers and the body");
  const N2 = standNet([{ isProxy: false, scheme: "basic", host: "etiuda.dev", port: 443 }], "x");
  const refused = await P.fetchThrough(N2, "https://etiuda.dev/", {}, A.forRequest()).then(() => "answered", e => String(e.message));
  check(/PROXY_AUTH/.test(refused) && N2.made[0].answers[0].u === undefined, "p3c a server's challenge is cancelled: " + refused);
  const N3 = standNet([proxyInfo()], "x");
  const none = await P.fetchThrough(N3, "https://etiuda.dev/", {}, undefined).then(() => "answered", e => String(e.message));
  check(/PROXY_AUTH/.test(none), "p3d with no asker the challenge is cancelled, as net.fetch does");
  const stop = new AbortController();
  const slow = P.proxyAsker({ ask: () => new Promise(() => {}), waitMs: 60000 });
  const N4 = standNet([proxyInfo()], "x");
  const pending = P.fetchThrough(N4, "https://etiuda.dev/", { signal: stop.signal }, slow.forRequest());
  stop.abort();
  const why = await pending.then(() => "answered", e => e.name);
  check(why === "AbortError" && N4.made[0].aborted === true, "p3e an abort rejects the call and aborts the request: " + why);
}

async function p4() {
  const basic = await standProxy("basic"), echo = net.createServer(s => s.pipe(s));
  await new Promise(r => echo.listen(0, "127.0.0.1", r));
  const ep = echo.address().port;
  const at = { host: "127.0.0.1", port: basic.port };
  const err = async a => P.tunnel(at, { host: "127.0.0.1", port: ep }, a).then(s => { s.destroy(); return { code: "open" }; }, e => e);
  const none = await err(null), wrong = await err({ username: USER, password: "not-it" });
  check(none.code === "proxy-auth" && JSON.stringify(none.schemes) === '["basic"]', "p4a no answer: refused for a sign-in, the scheme named: " + none.code + " " + JSON.stringify(none.schemes));
  check(wrong.code === "proxy-auth" && basic.seen[1].auth === "wrong", "p4b a wrong answer: refused the same way");
  const sock = await P.tunnel(at, { host: "127.0.0.1", port: ep }, { username: USER, password: PASS });
  const back = await new Promise(r => { sock.once("data", d => r(d.toString())); sock.write("through"); });
  sock.destroy();
  check(back === "through" && basic.seen[2].auth === "right" && basic.seen[2].target === "127.0.0.1:" + ep, "p4c the right answer opens the tunnel to the target");
  const win = await standProxy("windows"), deny = await standProxy("deny");
  const w = await P.tunnel({ host: "127.0.0.1", port: win.port }, { host: "127.0.0.1", port: ep }, null).catch(e => e);
  check(w.code === "proxy-auth" && JSON.stringify(w.schemes) === '["negotiate","ntlm"]', "p4d a proxy asking Windows sign-in names its schemes: " + JSON.stringify(w.schemes));
  const d = await P.tunnel({ host: "127.0.0.1", port: deny.port }, { host: "127.0.0.1", port: ep }, null).catch(e => e);
  check(d.code === "proxy-refused" && d.status === 403, "p4e a 403 is a refusal: " + d.code);
  const gone = await P.tunnel({ host: "127.0.0.1", port: 1 }, { host: "127.0.0.1", port: ep }, null).catch(e => e);
  check(gone.code === "proxy-refused", "p4f a proxy that is not there is a refusal: " + gone.code);
  for (const s of [basic, win, deny]) s.server.close();
  echo.close();
}

async function p5() {
  const S = await standSocket("");
  const sock = net.connect({ host: "127.0.0.1", port: S.port });
  const ev = { open: 0, msgs: [], close: 0 };
  const h = P.webSocketOver(sock, "wss://etiuda.dev/relay/v1/socket", { authorization: "Bearer lab-session" },
    { open: () => ev.open++, message: t => ev.msgs.push(t), close: () => ev.close++ });
  for (let i = 0; i < 50 && !ev.msgs.length; i++) await sleep(10);
  h.send("ping-text");
  await sleep(50);
  check(ev.open === 1 && JSON.stringify(ev.msgs) === '["hello"]', "p5a the handshake opens and two fragments arrive as one text: " + JSON.stringify(ev.msgs));
  check(S.got.headers && S.got.headers.path === "GET /relay/v1/socket HTTP/1.1" && S.got.headers.authorization === "Bearer lab-session"
    && /^websocket$/i.test(S.got.headers.upgrade) && S.got.headers.version === "13", "p5b the upgrade asks the relay's path with the session in its header");
  check(S.got.pongs === 1 && JSON.stringify(S.got.texts) === '["ping-text"]' && S.got.allMasked, "p5c a ping is answered, a text is sent, and every frame the client sends is masked");
  h.close();
  await sleep(50);
  check(ev.close === 1 && S.got.closes === 1, "p5d close sends a close frame and is told once");
  S.server.close();

  const B = await standSocket("accept");
  const ev2 = { open: 0, close: 0 };
  P.webSocketOver(net.connect({ host: "127.0.0.1", port: B.port }), "wss://etiuda.dev/relay/v1/socket", {}, { open: () => ev2.open++, message: () => {}, close: () => ev2.close++ });
  await sleep(100);
  check(ev2.open === 0 && ev2.close === 1, "p5e a wrong Sec-WebSocket-Accept closes it unopened");
  B.server.close();

  const M = await standSocket("masked");
  const ev3 = { open: 0, msgs: [], close: 0 };
  P.webSocketOver(net.connect({ host: "127.0.0.1", port: M.port }), "wss://etiuda.dev/relay/v1/socket", {}, { open: () => ev3.open++, message: t => ev3.msgs.push(t), close: () => ev3.close++ });
  await sleep(100);
  check(ev3.open === 1 && ev3.msgs.length === 0 && ev3.close === 1, "p5f a masked frame from the server ends the socket, unread");
  M.server.close();
}

async function p6() {
  const S = await standSocket(""), basic = await standProxy("basic"), win = await standProxy("windows");
  const lines = [];
  const A = P.proxyAsker({ ask: async () => ({ username: USER, password: PASS }), say: l => lines.push(l) });
  await new Promise(r => A.forRequest()(proxyInfo(basic.port), r));
  const held = A.heldFor("127.0.0.1", basic.port) || A.heldFor("proxy.lab.invalid", basic.port);
  const asker = { heldFor: () => held, refused: () => {}, tell: l => lines.push(l) };
  const ev = { open: 0, msgs: [], close: 0 }, resolved = [];
  const h = P.proxiedConnect("wss://etiuda.dev:" + S.port + "/relay/v1/socket", { authorization: "Bearer lab-session" },
    { open: () => ev.open++, message: t => ev.msgs.push(t), close: () => ev.close++ },
    { resolve: async u => { resolved.push(u); return "PROXY 127.0.0.1:" + basic.port + "; DIRECT"; }, direct: () => { throw new Error("not direct"); },
      asker, tlsConnect: s => s, connect: o => net.connect({ host: o.host, port: o.port }) });
  for (let i = 0; i < 50 && !ev.msgs.length; i++) await sleep(10);
  check(h.opens === true && ev.open === 1 && JSON.stringify(ev.msgs) === '["hello"]' && basic.seen.length === 1 && basic.seen[0].auth === "right"
    && basic.seen[0].target === "etiuda.dev:" + S.port, "p6a through the proxy with the held answer, the socket opens and carries text: " + JSON.stringify(basic.seen));
  check(resolved[0] === "https://etiuda.dev:" + S.port + "/relay/v1/socket", "p6b Chromium is asked for the proxy of the relay's https address: " + resolved[0]);
  h.close();

  let directArgs = null;
  const ev2 = { close: 0 };
  P.proxiedConnect("wss://etiuda.dev/relay/v1/socket", { authorization: "x" }, { message: () => {}, close: () => ev2.close++ },
    { resolve: async () => "DIRECT", direct: (u, hd, on) => { directArgs = [u, hd]; return { send() {}, close() {} }; } });
  await sleep(20);
  check(directArgs && directArgs[0] === "wss://etiuda.dev/relay/v1/socket" && directArgs[1].authorization === "x" && ev2.close === 0, "p6c DIRECT takes the runtime's own socket");

  const ev3 = { open: 0, close: 0 };
  const sayW = [];
  const opts = { resolve: async () => "PROXY 127.0.0.1:" + win.port, direct: () => null, asker: { heldFor: () => null, refused: () => {}, tell: l => sayW.push(l) },
    connect: o => net.connect({ host: o.host, port: o.port }) };
  P.proxiedConnect("wss://etiuda.dev/relay/v1/socket", {}, { open: () => ev3.open++, message: () => {}, close: () => ev3.close++ }, opts);
  await sleep(150);
  check(ev3.open === 0 && ev3.close === 1 && sayW.length === 1 && /cannot give \(negotiate, ntlm\)/.test(sayW[0]) && /every minute/.test(sayW[0]),
    "p6d a proxy asking Windows sign-in closes the socket unopened and says why once: " + sayW[0]);
  const ev4 = { close: 0 }, sayS = [];
  P.proxiedConnect("wss://etiuda.dev/relay/v1/socket", {}, { message: () => {}, close: () => ev4.close++ },
    { resolve: async () => "SOCKS5 127.0.0.1:1080", direct: () => null, asker: { heldFor: () => null, refused: () => {}, tell: l => sayS.push(l) } });
  await sleep(20);
  check(ev4.close === 1 && /SOCKS5/.test(sayS[0] || ""), "p6e a SOCKS proxy closes it unopened, said");
  let refusedCalled = 0;
  const ev5 = { close: 0 };
  P.proxiedConnect("wss://etiuda.dev:" + S.port + "/relay/v1/socket", {}, { message: () => {}, close: () => ev5.close++ },
    { resolve: async () => "PROXY 127.0.0.1:" + basic.port, direct: () => null, tlsConnect: s => s,
      asker: { heldFor: () => ({ username: USER, password: "stale" }), refused: () => refusedCalled++, tell: () => {} } });
  await sleep(150);
  check(ev5.close === 1 && refusedCalled === 1, "p6f an answer the proxy refuses is handed back as refused, so it is asked again");
  for (const s of [S, basic, win]) s.server.close();
}

/* The text of one top-level function of shell/main.js, by brace depth from its declaration. */
function slice(src, name) {
  let at = src.indexOf("\nfunction " + name + "(");
  if (at < 0) at = src.indexOf("\nasync function " + name + "(");
  if (at < 0) return "";
  let i = src.indexOf("{", at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(at + 1, i + 1);
}

async function p7() {
  const src = fs.readFileSync(MAIN_FILE, "utf8");
  const fetches = (src.split(slice(src, "deskFetch")).join("").match(/\bnet\.fetch\(/g) || []).length;
  const kept = (src.match(/net\.fetch\(request\.url, \{ bypassCustomProtocolHandlers: true \}\)/g) || []).length;
  check(fetches === 1 && kept === 1, "p7a no call goes out by net.fetch outside deskFetch but the page's own protocol handler: " + fetches + " net.fetch call(s)");
  const uses = ["signinRequest(deskFetch,", "signinServiceAsk(deskFetch,", "lookForNote(deskFetch)", "deskFetch(url, init)", "return deskFetch(u, init);"];
  const missing = uses.filter(u => src.indexOf(u) < 0);
  check(missing.length === 0, "p7b the sign-in, the licence service, the version note, the relay and the organisation's model go through deskFetch: " + (missing.join(", ") || "all"));
  const deskFetchText = slice(src, "deskFetch"), relayConnectText = slice(src, "relayConnect"), relayRequestText = slice(src, "relayRequest");
  let listener = null;
  const netStand = { request: () => ({}) };
  const proxyNet = { fetchThrough: (n, u, i, l) => { listener = l; return Promise.resolve("sent"); }, proxiedConnect: (u, h, on, o) => ({ via: "proxy", o }) };
  const deskProxy = { forRequest: () => "the-listener" };
  let out = null;
  try { out = await new Function("net", "proxyNet", "deskProxy", deskFetchText + "\nreturn deskFetch('https://etiuda.dev/x', {});")(netStand, proxyNet, deskProxy); } catch (e) { out = "threw " + e.message; }
  check(out === "sent" && listener === "the-listener", "p7c deskFetch hands fetchThrough the asker's listener: " + out);
  let r2 = null;
  try {
    const run = new Function("WebSocket", "session", "proxyNet", "deskProxy", "relaySocket", relayConnectText + "\nreturn relayConnect('wss://etiuda.dev/relay/v1/socket', {}, {});");
    r2 = run(function WebSocket() {}, { defaultSession: { resolveProxy: async u => "DIRECT" } }, proxyNet, deskProxy, () => ({ via: "direct" }));
  } catch (e) { r2 = { via: "threw " + e.message }; }
  check(r2 && r2.via === "proxy" && r2.o && r2.o.asker === deskProxy && typeof r2.o.resolve === "function" && typeof r2.o.direct === "function",
    "p7d relayConnect takes proxiedConnect with the session's resolveProxy and the desk's asker: " + (r2 && r2.via));
  let sent = null;
  try {
    const run = new Function("net", "deskFetch", "fetch", relayRequestText +"\nreturn relayRequest('GET', 'https://etiuda.dev/relay/v1/x', {}, null);");
    await run({ request: () => ({}), fetch: async () => { sent = "net.fetch"; return new Response("ok"); } }, async () => { sent = "deskFetch"; return new Response("ok"); }, async () => { sent = "node"; return new Response("ok"); });
  } catch (e) { sent = "threw " + e.message; }
  check(sent === "deskFetch", "p7e the relay's calls go through deskFetch: " + sent);
}

/* ---- the plants: each line lifted from a copy in the lab, its own case run there, and red expected -------------------- */
const PLANTS = [
  ["shell/proxy-net.cjs", "plant:proxy-server-only", "p2"],
  ["shell/proxy-net.cjs", "plant:proxy-declined", "p2"],
  ["shell/proxy-net.cjs", "plant:proxy-login-listener", "p3"],
  ["shell/proxy-net.cjs", "plant:proxy-basic", "p4"],
  ["shell/proxy-net.cjs", "plant:ws-accept", "p5"],
  ["shell/proxy-net.cjs", "plant:ws-unmasked", "p5"],
  ["shell/main.js", "plant:desk-fetch-login", "p7"],
  ["shell/main.js", "plant:relay-socket-proxy", "p7"],
  ["shell/main.js", "plant:relay-fetch-proxy", "p7"],
];
async function p8() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-proxy-net-"));
  try {
    for (const [file, mark, part] of PLANTS) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const lines = text.split("\n"), hit = lines.filter(l => l.indexOf(mark) >= 0).length;
      const copy = path.join(lab, path.basename(file).replace(/(\.\w+)$/, "-" + mark.slice(6) + "$1"));
      fs.writeFileSync(copy, lines.filter(l => l.indexOf(mark) < 0).join("\n"));
      const env = Object.assign({}, process.env, { PROXY_NET_ONLY: part },
        file === "shell/main.js" ? { PROXY_MAIN_FILE: copy } : { PROXY_NET_FILE: copy });
      const r = spawnSync(process.execPath, [SELF], { env, encoding: "utf8", timeout: 60000 });
      const reds = (r.stdout.match(/^ {2}FAIL /mg) || []).length;
      check(hit === 1 && r.status !== 0 && reds > 0, "p8 lifting " + mark + " (" + hit + " line) turns " + part + " red: " + reds + " red");
    }
  } finally { fs.rmSync(lab, { recursive: true, force: true }); }
}

const PARTS = { p1, p2, p3, p4, p5, p6, p7, p8 };
/* The asker's timers are unref'd, as a shell's should be; this keeps the run alive while a case waits on one. */
const alive = setInterval(() => {}, 1000);
for (const [id, fn] of Object.entries(PARTS)) {
  if (!want(id)) continue;
  if (!P && id !== "p7" && id !== "p8") { check(false, id + " needs shell/proxy-net.cjs"); continue; }
  try { await fn(); } catch (e) { check(false, id + " threw: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); }
}
clearInterval(alive);
if (!ONLY) console.log((failed === 0 && ran === EXPECTED ? "proxy-net: ok" : "proxy-net: FAIL") + ", ran " + ran + " of " + EXPECTED + ", red " + failed);
process.exit(Math.min(63, failed + (ONLY || ran === EXPECTED ? 0 : 1)));
