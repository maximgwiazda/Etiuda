/* Board 989: the desk's own Node connections (the relay's push socket above all) trust what the system's store trusts.
 * Chromium's calls already do; Node's carry only the roots bundled with it, so behind a gateway that inspects encrypted
 * traffic, whose root the system trusts and Node does not, the socket is refused. shell/main.js, loaded as its start path
 * loads it, adds the system's roots to Node's own; then a Node fetch and a Node WebSocket trust a root found only in the
 * system's list (989h), a root in neither list is still refused (989i), lifting plant:system-roots refuses the first root
 * again (989j), and a store that cannot be read leaves Node's roots as they were and the start path still runs (989k).
 *
 * The system's list is a stand-in: the shell's require of node:tls is answered with Node's own module whose "system"
 * list is a root made here, so nothing is written to the Windows store. Each case runs in a child of Electron's own
 * runtime (ELECTRON_RUN_AS_NODE, no window), which is the runtime the desk ships with, and with NODE_USE_SYSTEM_CA and
 * NODE_EXTRA_CA_CERTS removed from its environment: with either set, Node trusts the store already and a leg would pass
 * where a customer's install fails (989l). The roots and their servers' certificates are made by openssl in a lab folder.
 *
 *     node tests/system-roots.mjs     exit code is the number of failed checks, capped at 63; 78 where it could not run
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { createRequire } from "node:module";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 5;
const MARK = "plant:system-roots";

if (process.env.SYSTEM_ROOTS_CHILD) await child();
else await main();

/* ---- the child: the shell's start path under a stand-in system list, then one fetch and one WebSocket per server ---- */
async function child() {
  const tlsReal = nodeRequire("node:tls");
  const lab = process.env.SYSTEM_ROOTS_CHILD;
  const want = process.env.SYSTEM_ROOTS_SYSTEM;
  const system = want === "throw" ? null : fs.readFileSync(path.join(lab, want), "utf8");
  const tlsStand = Object.assign({}, tlsReal, {
    getCACertificates: kind => {
      if (kind !== "system") return tlsReal.getCACertificates(kind);
      if (system === null) throw new Error("the stand-in store cannot be read");
      return [system];
    }
  });
  const pem = n => fs.readFileSync(path.join(lab, n), "utf8");
  const rootA = pem("root-a.pem").trim();
  const out = { env: { useSystem: process.env.NODE_USE_SYSTEM_CA !== undefined, extra: process.env.NODE_EXTRA_CA_CERTS !== undefined },
    runtime: process.versions.electron ? "electron " + process.versions.electron + ", node " + process.versions.node : "node " + process.versions.node };
  const print = p => { try { return new crypto.X509Certificate(p).fingerprint256; } catch { return ""; } };
  const printA = print(rootA);
  const hasA = () => tlsReal.getCACertificates("default").some(c => print(c) === printA);
  out.before = { count: tlsReal.getCACertificates("default").length, hasA: hasA() };

  const noop = () => {};
  const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
  const electron = {
    app: { getPath: () => path.join(lab, "ud"), setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop,
      getVersion: () => "0.0.0", whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false } },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: { isEncryptionAvailable: () => false }
  };
  const source = fs.readFileSync(path.join(lab, process.env.SYSTEM_ROOTS_SOURCE), "utf8");
  try {
    new Function("require", "__dirname", "__filename", "module", "exports", "console", source)(
      n => (n === "electron" ? electron : n === "node:tls" || n === "tls" ? tlsStand : nodeRequire(n)),
      path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {},
      { log: noop, error: noop, warn: noop, info: noop });
    out.loaded = true;
  } catch (e) {
    out.loaded = false;
    out.loadError = String(e && e.message || e).split("\n")[0];
  }
  out.after = { count: tlsReal.getCACertificates("default").length, hasA: hasA() };

  const serve = (leaf) => new Promise(resolve => {
    const srv = https.createServer({ key: pem(leaf + ".key"), cert: pem(leaf + ".pem") }, (req, res) => { res.writeHead(200); res.end("ok"); });
    srv.on("upgrade", (req, sock) => {
      const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    });
    srv.on("tlsClientError", noop);
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const fetchTo = async port => {
    try { const r = await fetch("https://127.0.0.1:" + port + "/"); return r.status === 200 ? "200" : "status " + r.status; }
    catch (e) { return "refused " + String((e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || e); }
  };
  const socketTo = port => new Promise(resolve => {
    let done = false;
    const end = v => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch { /* gone */ } resolve(v); };
    const t = setTimeout(() => end("no answer in 5 s"), 5000);
    let ws = null;
    try { ws = new WebSocket("wss://127.0.0.1:" + port + "/socket"); } catch (e) { end("threw " + (e && e.message)); return; }
    ws.onopen = () => end("open");
    ws.onerror = () => end("refused");
    ws.onclose = () => end("refused");
  });
  const a = await serve("leaf-a"), b = await serve("leaf-b");
  out.a = { fetch: await fetchTo(a.address().port), socket: await socketTo(a.address().port) };
  out.b = { fetch: await fetchTo(b.address().port), socket: await socketTo(b.address().port) };
  a.close(); b.close();
  process.stdout.write("#child " + JSON.stringify(out) + "\n");
  process.exit(0);
}

/* ---- the parent: roots and certificates by openssl, then one child per case ---- */
async function main() {
  let asserted = 0, failed = 0;
  const check = (ok, line) => { asserted++; if (ok) console.log("  ok   " + line); else { failed++; console.log("  FAIL " + line); } };
  const refuse = why => { console.log("system-roots: did not run - " + why); process.exit(78); };

  let electronBin = "";
  try { electronBin = nodeRequire("electron"); } catch { electronBin = ""; }
  if (typeof electronBin !== "string" || !fs.existsSync(electronBin)) refuse("Electron's runtime is not installed under node_modules");
  const OPENSSL = ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe"]
    .find(p => { const r = spawnSync(p, ["version"], { encoding: "utf8" }); return r.status === 0; });
  if (!OPENSSL) refuse("no openssl to make the stand-in roots");

  const { createLab } = await import("./lab-owner.mjs");
  const lab = createLab("etiuda-system-roots-");
  const ssl = (...args) => {
    const r = spawnSync(OPENSSL, args, { cwd: lab, encoding: "utf8" });
    if (r.status !== 0) refuse("openssl " + args[0] + " failed: " + String(r.stderr || r.error).split("\n")[0]);
  };
  const ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
  fs.writeFileSync(path.join(lab, "leaf.ext"), "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\n");
  for (const n of ["a", "b"]) {
    ssl("req", "-x509", ...ec, "-keyout", "root-" + n + ".key", "-out", "root-" + n + ".pem", "-days", "2", "-subj", "/CN=Stand-in root " + n.toUpperCase(),
      "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
    ssl("req", ...ec, "-keyout", "leaf-" + n + ".key", "-out", "leaf-" + n + ".csr", "-subj", "/CN=127.0.0.1");
    ssl("x509", "-req", "-in", "leaf-" + n + ".csr", "-CA", "root-" + n + ".pem", "-CAkey", "root-" + n + ".key", "-CAcreateserial",
      "-out", "leaf-" + n + ".pem", "-days", "1", "-extfile", "leaf.ext");
  }

  const shellSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  fs.writeFileSync(path.join(lab, "main.js"), shellSrc);
  const marked = shellSrc.split("\n").filter(l => l.indexOf(MARK) >= 0).length;
  fs.writeFileSync(path.join(lab, "main-lifted.js"), shellSrc.split("\n").filter(l => l.indexOf(MARK) < 0).join("\n"));

  const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", SYSTEM_ROOTS_CHILD: lab });
  delete env.NODE_USE_SYSTEM_CA;
  delete env.NODE_EXTRA_CA_CERTS;
  delete env.NODE_OPTIONS;
  const run = (source, system) => new Promise(resolve => {
    const c = spawn(electronBin, [SELF], { cwd: ROOT, env: Object.assign({}, env, { SYSTEM_ROOTS_SOURCE: source, SYSTEM_ROOTS_SYSTEM: system }),
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let text = "", err = "";
    const kill = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, 60000);
    c.stdout.on("data", d => { text += d; });
    c.stderr.on("data", d => { err += d; });
    c.on("close", code => {
      clearTimeout(kill);
      const m = /^#child (.*)$/m.exec(text);
      let got = null;
      try { got = m ? JSON.parse(m[1]) : null; } catch { got = null; }
      resolve(got || { failed: "exit " + code + ": " + (err || text).split("\n").slice(0, 3).join(" | ") });
    });
  });

  const merged = await run("main.js", "root-a.pem");
  const lifted = await run("main-lifted.js", "root-a.pem");
  const unread = await run("main.js", "throw");
  const say = r => r.failed ? r.failed : "fetch " + r.a.fetch + ", socket " + r.a.socket;

  check(!merged.failed && merged.loaded === true && merged.before.hasA === false && merged.after.hasA === true
    && merged.a.fetch === "200" && merged.a.socket === "open",
    "989h after the desk's start path, a Node fetch and a Node WebSocket trust a root found only in the system's list: "
    + (merged.failed || ("before " + merged.before.count + " roots without it, after " + merged.after.count + " with it " + merged.after.hasA
      + ", " + say(merged) + ", " + merged.runtime)));
  check(!merged.failed && /^refused/.test(String(merged.b && merged.b.fetch)) && merged.b.socket === "refused",
    "989i a root in neither list is still refused: " + (merged.failed || ("fetch " + merged.b.fetch + ", socket " + merged.b.socket)));
  check(marked === 1 && !lifted.failed && lifted.loaded === true && lifted.after.hasA === false
    && /^refused/.test(String(lifted.a.fetch)) && lifted.a.socket === "refused",
    "989j lifting " + MARK + " (" + marked + " line marked) refuses that root again: " + (lifted.failed || say(lifted)));
  check(!unread.failed && unread.loaded === true && unread.after.count === unread.before.count && unread.after.hasA === false,
    "989k a system store that cannot be read leaves Node's roots as they were and the start path still runs: "
    + (unread.failed || ("loaded " + unread.loaded + (unread.loadError ? " (" + unread.loadError + ")" : "") + ", roots "
      + unread.before.count + " then " + unread.after.count)));
  const envs = [merged, lifted, unread].map(r => r.env ? (r.env.useSystem || r.env.extra ? "set" : "clear") : "unknown");
  check(envs.every(e => e === "clear"),
    "989l every case ran with NODE_USE_SYSTEM_CA and NODE_EXTRA_CA_CERTS absent, as on a customer's desk: " + envs.join(", "));

  if (asserted !== EXPECTED) check(false, "completed " + asserted + " of " + EXPECTED + " checks");
  console.log("system-roots: " + (asserted - failed) + " passed, " + failed + " failed, " + asserted + " of " + EXPECTED);
  process.exit(Math.min(failed, 63));
}
