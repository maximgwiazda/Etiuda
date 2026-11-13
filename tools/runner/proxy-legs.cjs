"use strict";
/* A COMPANY PROXY, MEASURED AGAINST ELECTRON'S OWN NETWORK STACK ON A HOSTED WINDOWS RUNNER. An Electron main-process script that
 * opens no window:
 *
 *   npx electron tools/runner/proxy-legs.cjs --out <dir> [basic-fetch] [integrated-ntlm] [system-proxy] [pac] [relay-socket]
 *                                            on a hosted Windows runner only (see THE WALL); no leg named runs all five
 *
 * The stand-ins (tools/runner/proxy-stand-ins.cjs) run in this process on 127.0.0.1, with an answer invented per run and never
 * printed. Each measurement runs in a fresh Electron started from this file, so the switches it takes before ready are its own;
 * the code measured is the tree's shell/proxy-net.cjs and shell/win-proxy.cjs, required as the desk requires them.
 *
 * WHERE THE CALLS GO. Every target is a name under proxy-lab.invalid, which no resolver answers: a call reaches it only through
 * the proxy Chromium names, and the stand-in answers a GET for it as the origin and maps a CONNECT to a local port. No target is
 * loopback, so Chromium's implicit loopback bypass never applies and no bypass list is set.
 *
 *   basic-fetch      a Basic proxy (session.setProxy): plain net.fetch is refused (the control: the gap is real on this Electron),
 *                    fetchThrough with a proxy asker answering it reaches the origin, the proxy logging one 407 and then the right
 *                    answer, and the asker asked once.
 *   integrated-ntlm  a proxy asking NTLM only, checking no account: fetchThrough reaches the origin and the asker is never asked,
 *                    so Chromium answered with the runner account's own sign-in. No control: nothing here can turn Chromium's
 *                    default credentials for a proxy off; plain net.fetch in a partition of its own is logged beside it.
 *   system-proxy     the account's own Windows setting (ProxyEnable 1, ProxyServer the stand-in), read by windowsProxySwitches
 *                    before ready as shell/main.js reads it: resolveProxy names the stand-in and a call goes through it. The
 *                    control is the setting as found; Chromium without the switches is logged beside it. Restored in finally.
 *   pac              the same with AutoConfigURL, a setup script served here naming the stand-in.
 *   relay-socket     proxiedConnect (resolve: the session's real resolveProxy) through the Basic stand-in to a TLS WebSocket
 *                    stand-in, the answer held by an asker a fetchThrough call filled: it opens and text crosses both ways. Then
 *                    through the NTLM-only stand-in: it closes unopened and the log says once that the relay is asked every minute.
 *
 * WHAT EACH LEG PRINTS: "  ok   <leg> ...", "  FAIL <leg> ..." or "  --   <leg> no verdict: ...", then "#leg <name> <ok|fail|no-verdict>
 * <facts>" and any "#note <leg> ...", the same lines into <dir>/legs.txt. Exit: the number of failed legs, capped at 63; 78 where
 * nothing ran or no leg reached a verdict.
 *
 * THE WALL. It refuses (exit 78) where .etiuda-no-installers stands in the home folder; unless GITHUB_ACTIONS is "true",
 * RUNNER_ENVIRONMENT "github-hosted", RUNNER_OS "Windows" and RUNNER_TEMP set; and unless tests/install-guard.cjs finds no shipped
 * app. The variables only stop a run by accident; the sentinel holds a desk. system-proxy and pac write the account's proxy setting.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NO_VERDICT = 78;
const LEG_NAMES = ["basic-fetch", "integrated-ntlm", "system-proxy", "pac", "relay-socket"];
const CHILD_WAIT_MS = 120 * 1000;
const CALL_WAIT_MS = 30 * 1000;
const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const SETTINGS_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const POLICY_KEY = "HKLM\\Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const SETTING_NAMES = ["ProxyEnable", "ProxyServer", "AutoConfigURL"];

/* The child's orders arrive in the environment and leave it at once, so nothing it starts inherits the answer. */
const CHILD = process.env.PROXY_LEGS_CHILD || "";
delete process.env.PROXY_LEGS_CHILD;

let OUT = "";
let SECRETS = [];
const scrub = t => SECRETS.reduce((s, x) => (x ? s.split(x).join("<answer>") : s), String(t));
const say = l => { const line = scrub(l); process.stdout.write(line + "\n"); if (OUT) fs.appendFileSync(path.join(OUT, "legs.txt"), line + "\n"); };
const refuse = why => { say("#legs refused: " + why); process.exit(NO_VERDICT); };
const oneLine = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 300);
const fmt = (k, v) => k + "=" + (v === undefined || v === null || v === "" ? "-" : /[\s"=]/.test(String(v)) ? JSON.stringify(String(v)) : String(v));

const DESK_SENTINEL = path.join(os.homedir(), ".etiuda-no-installers");
if (fs.existsSync(DESK_SENTINEL)) refuse("this computer carries " + DESK_SENTINEL + ", a desk where these legs never run");
if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  || process.env.RUNNER_OS !== "Windows" || !process.env.RUNNER_TEMP)
  refuse("not a hosted Windows runner (GITHUB_ACTIONS, RUNNER_ENVIRONMENT, RUNNER_OS, RUNNER_TEMP); these legs never run on a desk");
let electron = null;
try { electron = require("electron"); } catch { electron = null; }
if (!electron || typeof electron !== "object" || !electron.app) refuse("run it in Electron's main process: npx electron tools/runner/proxy-legs.cjs --out <dir>");
for (const f of ["proxy-net.cjs", "win-proxy.cjs"]) if (!fs.existsSync(path.join(ROOT, "shell", f))) refuse("the tree under test has no shell/" + f);
const S = require(path.join(__dirname, "proxy-stand-ins.cjs"));
const PN = require(path.join(ROOT, "shell", "proxy-net.cjs"));
const { app } = electron;

/* ---- one measurement, in an Electron of its own ------------------------------------------------------------------- */

function child(cfg) {
  if (cfg.answer) SECRETS = [cfg.answer.password, cfg.answer.username];
  app.setPath("userData", cfg.userData);
  app.disableHardwareAcceleration();
  const out = { step: cfg.step };
  if (cfg.switches) {
    out.switches = require(path.join(ROOT, "shell", "win-proxy.cjs")).windowsProxySwitches();
    for (const s of out.switches) app.commandLine.appendSwitch(...s);
  }
  app.whenReady().then(() => STEPS[cfg.step](cfg, out)).catch(e => { out.threw = scrub(oneLine(e && e.stack || e)); }).finally(() => {
    try { fs.writeFileSync(cfg.result, scrub(JSON.stringify(out))); } catch { /* the parent reads no result and says so */ }
    app.exit(0);
  });
}

const within = (p, ms, what) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(what + " gave no answer within " + Math.round(ms / 1000) + " s")), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});
async function settle(p) {
  try {
    const r = await within(p, CALL_WAIT_MS, "the call");
    const body = await within(r.text(), CALL_WAIT_MS, "the body");
    return { status: r.status, body: body.slice(0, 200) };
  } catch (e) { return { error: oneLine(e && e.message || e) }; }
}
function counted(answer) {
  const c = { asks: 0, lines: [], info: null };
  c.asker = PN.proxyAsker({
    ask: info => { c.asks++; c.info = { scheme: info.scheme, again: info.again }; return Promise.resolve(answer || null); },
    say: l => c.lines.push(l),
  });
  return c;
}

const STEPS = {
  "fetch-basic": async (cfg, out) => {
    const { net, session } = electron;
    const ses = session.defaultSession;
    await ses.setProxy({ proxyRules: "127.0.0.1:" + cfg.proxyPort });
    out.resolved = await ses.resolveProxy(S.ORIGIN + "/");
    out.control = await settle(net.fetch(S.ORIGIN + "/control", { cache: "no-store" }));
    const c = counted(cfg.answer);
    out.through = await settle(PN.fetchThrough(net, S.ORIGIN + "/through", { cache: "no-store" }, c.asker.forRequest()));
    Object.assign(out, { asks: c.asks, askInfo: c.info, lines: c.lines });
  },
  "fetch-ntlm": async (cfg, out) => {
    const { net, session } = electron;
    const ses = session.defaultSession;
    await ses.setProxy({ proxyRules: "127.0.0.1:" + cfg.proxyPort });
    out.resolved = await ses.resolveProxy(S.ORIGIN + "/");
    const c = counted(null);
    out.through = await settle(PN.fetchThrough(net, S.ORIGIN + "/ntlm", { cache: "no-store" }, c.asker.forRequest()));
    Object.assign(out, { asks: c.asks, askInfo: c.info, lines: c.lines });
    /* A persistent partition of its own, so its connections are not the ones the call above signed in. */
    const other = session.fromPartition("persist:plain");
    await other.setProxy({ proxyRules: "127.0.0.1:" + cfg.proxyPort });
    out.plain = await settle(other.fetch(S.ORIGIN + "/ntlm-plain", { cache: "no-store" }));
  },
  "resolve": async (cfg, out) => {
    const { net, session } = electron;
    out.resolved = await session.defaultSession.resolveProxy(S.ORIGIN + cfg.path);
    out.fetch = await settle(net.fetch(S.ORIGIN + cfg.path, { cache: "no-store" }));
  },
  "relay": async (cfg, out) => {
    const { net, session } = electron;
    const ses = session.defaultSession;
    const ca = fs.readFileSync(cfg.caFile, "utf8");
    /* The shipped default with one option added, the lab root: no system root signs the stand-in. */
    const tlsConnect = s => tls.connect({ socket: s, servername: S.RELAY_HOST, ALPNProtocols: ["http/1.1"], ca });
    const url = "wss://" + S.RELAY_HOST + "/socket";
    let direct = 0;
    const opts = asker => ({ resolve: u => ses.resolveProxy(u), direct: () => { direct++; return null; }, asker, tlsConnect });

    await ses.setProxy({ proxyRules: "127.0.0.1:" + cfg.basicPort });
    const a = counted(cfg.answer);
    out.prime = await settle(PN.fetchThrough(net, S.ORIGIN + "/prime", { cache: "no-store" }, a.asker.forRequest()));
    out.held = !!a.asker.heldFor("127.0.0.1", cfg.basicPort);
    out.resolvedA = await ses.resolveProxy("https://" + S.RELAY_HOST + "/socket");
    out.a = await S.relayThrough(PN.proxiedConnect, url, opts(a.asker), 20000);
    Object.assign(out, { asksA: a.asks, linesA: a.lines });

    await ses.setProxy({ proxyRules: "127.0.0.1:" + cfg.ntlmPort });
    const b = counted(null);
    out.resolvedB = await ses.resolveProxy("https://" + S.RELAY_HOST + "/socket");
    out.b = await S.relayThrough(PN.proxiedConnect, url, opts(b.asker), 20000);
    Object.assign(out, { asksB: b.asks, linesB: b.lines, direct });
  },
};

/* ---- the parent: the stand-ins, the legs, the verdicts ------------------------------------------------------------ */

class NoVerdict extends Error {}
let LAB = "", ANSWER = null, childSeq = 0;

function runChild(cfg) {
  const n = ++childSeq;
  const full = Object.assign({ result: path.join(LAB, "child-" + n + ".json"), userData: path.join(LAB, "ud-" + n) }, cfg);
  const env = Object.assign({}, process.env, { PROXY_LEGS_CHILD: JSON.stringify(full) });
  delete env.ELECTRON_RUN_AS_NODE;
  return new Promise(resolve => {
    let err = "", settled = false;
    const done = v => { if (settled) return; settled = true; resolve(v); };
    const c = spawn(process.execPath, [__filename], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    c.stdout.on("data", () => {});
    c.stderr.on("data", d => { err = (err + d).slice(-4000); });
    /* By pid with its children: Chromium's own processes go with the browser process that started them. */
    const timer = setTimeout(() => { spawnSync("C:\\Windows\\System32\\taskkill.exe", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true }); }, CHILD_WAIT_MS);
    c.on("error", e => { clearTimeout(timer); done({ code: null, got: null, err: oneLine(e.message) }); });
    const finish = code => {
      clearTimeout(timer);
      let got = null;
      try { got = JSON.parse(fs.readFileSync(full.result, "utf8")); } catch { got = null; }
      done({ code, got, err: scrub(oneLine(err.split(/\r?\n/).filter(Boolean).slice(-3).join(" | "))) });
    };
    /* A helper process still holding the pipes would keep "close" from firing, so the exit is enough after a grace. */
    c.on("exit", code => { setTimeout(() => finish(code), 5000).unref(); });
    c.on("close", code => finish(code));
  });
}
function needResult(r) {
  if (!r.got) throw new NoVerdict("the measuring Electron gave no result (exit " + r.code + ")" + (r.err ? ": " + r.err : ""));
  if (r.got.threw) throw new Error("the measuring Electron threw: " + r.got.threw);
  return r.got;
}
const callFact = c => (!c ? "-" : c.error ? "refused:" + c.error : "status:" + c.status);
const seq = entries => entries.map(e => (e.ntlm ? "ntlm" + e.ntlm : e.auth) + ":" + e.status).join(",") || "none";
const at = (log, p) => log.filter(e => e.path === p);

function record(name) {
  const rec = { name, facts: [], notes: [], cleanups: [], verdict: "", why: "" };
  rec.f = (k, v) => { rec.facts.push(fmt(k, v)); return v; };
  rec.note = t => rec.notes.push(t);
  rec.after = (what, run) => rec.cleanups.push({ what, run });
  rec.end = (ok, why) => { rec.verdict = ok ? "ok" : "fail"; rec.why = why; };
  return rec;
}

async function basicFetch(rec) {
  const proxy = await S.startProxy({ mode: "basic", answer: ANSWER });
  rec.after("proxy", () => proxy.close());
  const g = needResult(await runChild({ step: "fetch-basic", proxyPort: proxy.port, answer: ANSWER }));
  const want = "PROXY 127.0.0.1:" + proxy.port;
  const ctl = at(proxy.log, "/control"), thr = at(proxy.log, "/through");
  rec.f("resolved", g.resolved); rec.f("control", callFact(g.control)); rec.f("control-log", seq(ctl));
  rec.f("through", callFact(g.through)); rec.f("through-log", seq(thr)); rec.f("asks", g.asks); rec.f("ask-scheme", g.askInfo && g.askInfo.scheme);
  if (g.resolved !== want) throw new NoVerdict("Chromium named " + g.resolved + " for the origin, not the stand-in, so nothing here met the proxy");
  if (g.control.status === 200 || seq(ctl) !== "none:407")
    throw new NoVerdict("the control did not hold: plain net.fetch " + (g.control.status === 200 ? "reached the origin, so this Electron answers the proxy itself" : "was not challenged once (" + seq(ctl) + ")"));
  const ok = g.through.status === 200 && g.through.body === "origin /through" && seq(thr) === "none:407,right:200" && g.asks === 1;
  rec.end(ok, ok ? "plain net.fetch is refused by the Basic proxy; fetchThrough asks once and reaches the origin with the right answer"
    : "fetchThrough " + callFact(g.through) + ", the proxy saw " + seq(thr) + ", the asker was asked " + g.asks + " time(s)");
}

async function integratedNtlm(rec) {
  const proxy = await S.startProxy({ mode: "ntlm" });
  rec.after("proxy", () => proxy.close());
  const g = needResult(await runChild({ step: "fetch-ntlm", proxyPort: proxy.port }));
  const thr = at(proxy.log, "/ntlm");
  const t1 = thr.find(e => e.ntlm === 1), t3 = thr.find(e => e.ntlm === 3);
  rec.f("resolved", g.resolved); rec.f("through", callFact(g.through)); rec.f("through-log", seq(thr)); rec.f("asks", g.asks);
  rec.f("type1", t1 ? "yes" : "no"); rec.f("type3", t3 ? "yes" : "no"); rec.f("user-field-bytes", t3 ? t3.userBytes : "-");
  rec.f("nt-response-bytes", t3 ? t3.ntBytes : "-"); rec.f("one-connection", t1 && t3 ? (t1.conn === t3.conn ? "yes" : "no") : "-");
  rec.f("plain-fetch", callFact(g.plain)); rec.f("plain-log", seq(at(proxy.log, "/ntlm-plain")));
  rec.note("a stand-in that checks no account shows that Chromium on this Electron answers a proxy's NTLM challenge itself, with this "
    + "account's own sign-in (Type 1, then a Type 3 naming a user), before any login listener is asked. It cannot show that a real proxy "
    + "or domain would accept that answer: the runner joins no domain, its account is local, and Negotiate (Kerberos) has no KDC here.");
  if (g.resolved !== "PROXY 127.0.0.1:" + proxy.port) throw new NoVerdict("Chromium named " + g.resolved + " for the origin, not the stand-in");
  const ok = g.through.status === 200 && g.through.body === "origin /ntlm" && g.asks === 0 && !!t1 && !!t3 && t3.userBytes > 0;
  rec.end(ok, ok ? "Chromium answered the NTLM proxy with the Windows account and the person was never asked"
    : g.asks > 0 ? "Chromium handed the NTLM challenge to the listener, so the person would be asked (" + seq(thr) + ")"
      : !t1 ? "no Type 1 reached the proxy: Chromium did not try the Windows account (" + seq(thr) + ", " + callFact(g.through) + ")"
        : t3 && t3.userBytes === 0 ? "the Type 3 named no user: an anonymous answer"
          : "fetchThrough " + callFact(g.through) + " after " + seq(thr));
}

/* ---- the account's own Windows setting ---- */

function regGet(key, name) {
  const r = spawnSync(REG_TOOL, ["query", key, "/v", name], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (r.status !== 0) return null;
  const m = new RegExp("^[ \\t]+" + name + "[ \\t]+(REG_\\w+)[ \\t]*(.*?)[ \\t\\r]*$", "m").exec(r.stdout || "");
  return m ? { type: m[1], data: m[2] } : null;
}
function regPut(name, v) {
  const args = v ? ["add", SETTINGS_KEY, "/v", name, "/t", v.type, "/d", v.type === "REG_DWORD" ? String(parseInt(v.data, 16)) : v.data, "/f"]
    : ["delete", SETTINGS_KEY, "/v", name, "/f"];
  const r = spawnSync(REG_TOOL, args, { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (r.status !== 0 && v) throw new Error("reg " + args[0] + " " + name + " failed: " + oneLine(r.stderr));
}
const settingNow = () => Object.fromEntries(SETTING_NAMES.map(n => [n, regGet(SETTINGS_KEY, n)]));
const settingText = s => SETTING_NAMES.map(n => n + ":" + (s[n] ? s[n].data || "(empty)" : "-")).join(",");

async function systemLeg(rec, kind) {
  const policy = regGet(POLICY_KEY, "ProxySettingsPerUser");
  if (policy && parseInt(policy.data, 16) === 0) throw new NoVerdict("machine policy keeps the proxy setting per machine, so the account's own setting is not the one Windows uses");
  const proxy = await S.startProxy({ mode: "open" });
  rec.after("proxy", () => proxy.close());
  let pac = null;
  if (kind === "pac") { pac = await S.startPac(proxy.port); rec.after("pac", () => pac.close()); }
  const want = "PROXY 127.0.0.1:" + proxy.port;
  const wantSwitch = kind === "pac" ? ["proxy-pac-url", pac.url] : ["proxy-server", "127.0.0.1:" + proxy.port];
  const switchText = sw => (sw || []).map(s => s.join(":")).join(",") || "none";

  const before = settingNow();
  rec.f("setting-before", settingText(before));
  const c = needResult(await runChild({ step: "resolve", switches: true, path: "/" + kind + "-control" }));
  rec.f("control-switches", switchText(c.switches)); rec.f("control-resolved", c.resolved);

  rec.after("setting", () => {
    for (const n of SETTING_NAMES) regPut(n, before[n]);
    const now = settingNow();
    return JSON.stringify(now) === JSON.stringify(before) ? "restored as found" : "DIFFERS " + settingText(now);
  });
  if (kind === "pac") regPut("AutoConfigURL", { type: "REG_SZ", data: pac.url });
  else { regPut("AutoConfigURL", null); regPut("ProxyEnable", { type: "REG_DWORD", data: "0x1" }); regPut("ProxyServer", { type: "REG_SZ", data: "127.0.0.1:" + proxy.port }); }
  rec.f("setting-written", settingText(settingNow()));

  const m = needResult(await runChild({ step: "resolve", switches: true, path: "/" + kind + "-measured" }));
  const alone = needResult(await runChild({ step: "resolve", switches: false, path: "/" + kind + "-chromium-alone" }));
  rec.f("switches", switchText(m.switches)); rec.f("resolved", m.resolved); rec.f("fetch", callFact(m.fetch));
  rec.f("proxy-saw", seq(at(proxy.log, "/" + kind + "-measured"))); rec.f("pac-fetched", pac ? pac.hits.length : "-");
  rec.f("chromium-alone-resolved", alone.resolved); rec.f("chromium-alone-fetch", callFact(alone.fetch));
  if (!c.resolved || c.resolved.indexOf(":" + proxy.port) >= 0) throw new NoVerdict("the control named the stand-in before the setting was written");
  const ok = JSON.stringify(m.switches) === JSON.stringify([wantSwitch]) && m.resolved === want && m.fetch.status === 200
    && m.fetch.body === "origin /" + kind + "-measured" && (!pac || pac.hits.indexOf("/lab.pac") >= 0);
  rec.end(ok, ok ? "windowsProxySwitches turned the account's " + (pac ? "setup script" : "proxy server") + " into " + wantSwitch[0] + ", and Chromium's calls went through the stand-in"
    : "switches " + switchText(m.switches) + ", resolveProxy " + m.resolved + ", the call " + callFact(m.fetch) + "; wanted " + wantSwitch.join(":") + " and " + want);
}

/* ---- the relay's socket ---- */

let CERTS = null, CERTS_WHY = "";
async function relaySocket(rec) {
  if (!CERTS) throw new NoVerdict(CERTS_WHY || "no lab root");
  const relay = await S.startRelay(CERTS);
  rec.after("relay", () => relay.close());
  const tunnels = { [S.RELAY_HOST + ":443"]: relay.port };
  const basic = await S.startProxy({ mode: "basic", answer: ANSWER, tunnels });
  rec.after("basic-proxy", () => basic.close());
  const ntlm = await S.startProxy({ mode: "ntlm", tunnels });
  rec.after("ntlm-proxy", () => ntlm.close());
  const caFile = path.join(LAB, "lab-root.pem");
  fs.writeFileSync(caFile, CERTS.ca);
  const g = needResult(await runChild({ step: "relay", basicPort: basic.port, ntlmPort: ntlm.port, caFile, answer: ANSWER }));
  const connA = seq(basic.log.filter(e => e.kind === "connect")), connB = seq(ntlm.log.filter(e => e.kind === "connect"));
  const minute = (g.linesB || []).filter(l => /asked every minute instead/.test(l));
  rec.f("prime", callFact(g.prime)); rec.f("held", g.held ? "yes" : "no"); rec.f("resolved-a", g.resolvedA); rec.f("connect-a", connA);
  rec.f("opened-a", g.a.opened ? "yes" : "no"); rec.f("received-a", g.a.received.join("|")); rec.f("relay-got", relay.got.texts.join("|"));
  rec.f("resolved-b", g.resolvedB); rec.f("connect-b", connB); rec.f("opened-b", g.b.opened ? "yes" : "no");
  rec.f("closed-b", g.b.closed ? "yes" : g.b.timedOut ? "timeout" : "no"); rec.f("every-minute-lines", minute.length); rec.f("asks-b", g.asksB);
  rec.f("direct", g.direct);
  rec.note("the TLS inside the tunnel is the shipped default with one option the leg adds, the lab root as ca (tlsConnect), since no system root signs the stand-in");
  rec.note("the relay's name is under proxy-lab.invalid, so the socket can open only through the tunnel; the NTLM case is the closing side");
  if (minute.length) rec.note("the log line: " + minute[0]);
  if (g.resolvedA !== "PROXY 127.0.0.1:" + basic.port || g.resolvedB !== "PROXY 127.0.0.1:" + ntlm.port)
    throw new NoVerdict("Chromium did not name the stand-ins for the relay (" + g.resolvedA + "; " + g.resolvedB + ")");
  const okA = g.prime.status === 200 && g.held && g.a.opened && g.a.received.join(",") === "from-relay,echo:from-desk"
    && relay.got.texts.indexOf("from-desk") >= 0 && /right:200/.test(connA) && g.direct === 0;
  const okB = !g.b.opened && g.b.closed && minute.length === 1 && /\(ntlm\)/.test(minute[0]) && connB === "none:407" && g.asksB === 0;
  rec.end(okA && okB, okA && okB ? "the socket opened through the Basic proxy with the held answer and text crossed; through the NTLM proxy it closed unopened, said once"
    : (okA ? "" : "through Basic: opened " + g.a.opened + ", received " + (g.a.received.join("|") || "nothing") + ", CONNECT " + connA + "; ")
      + (okB ? "" : "through NTLM: opened " + g.b.opened + ", closed " + g.b.closed + ", " + minute.length + " every-minute line(s), CONNECT " + connB));
}

const LEGS = { "basic-fetch": basicFetch, "integrated-ntlm": integratedNtlm, "system-proxy": r => systemLeg(r, "system-proxy"), "pac": r => systemLeg(r, "pac"), "relay-socket": relaySocket };

async function parent() {
  const self = process.argv.findIndex(a => { try { return path.resolve(a) === __filename; } catch { return false; } });
  const argv = process.argv.slice(self >= 0 ? self + 1 : 2);
  const outAt = argv.indexOf("--out");
  if (outAt < 0 || !argv[outAt + 1]) refuse("--out <dir> is wanted");
  const named = argv.filter((a, i) => i !== outAt && i !== outAt + 1);
  const unknown = named.filter(n => LEG_NAMES.indexOf(n) < 0);
  if (unknown.length) refuse("no leg named " + unknown.join(", ") + "; the legs are " + LEG_NAMES.join(", "));
  const chosen = named.length ? LEG_NAMES.filter(n => named.indexOf(n) > -1) : LEG_NAMES.slice();

  let guard;
  try { guard = require(path.join(ROOT, "tests", "install-guard.cjs")).guardStart({ env: process.env }); }
  catch (e) { refuse("the install guard could not read what the shipped apps own: " + oneLine(e.message)); }
  if (guard.refusals.length) refuse("the install guard: " + guard.refusals.join("; "));

  OUT = path.resolve(argv[outAt + 1]);
  fs.mkdirSync(OUT, { recursive: true });
  LAB = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, "proxy-legs-"));
  app.setPath("userData", path.join(LAB, "ud-parent"));
  ANSWER = { username: "lab-" + crypto.randomBytes(3).toString("hex"), password: crypto.randomBytes(12).toString("hex") };
  SECRETS = [ANSWER.password, ANSWER.username, Buffer.from(ANSWER.username + ":" + ANSWER.password).toString("base64")];
  if (chosen.indexOf("relay-socket") >= 0) {
    try { CERTS = S.makeLabCerts(fs.mkdtempSync(path.join(LAB, "certs-"))); if (!CERTS) CERTS_WHY = "no openssl on this runner to make the lab root"; }
    catch (e) { CERTS_WHY = "the lab root could not be made: " + oneLine(e.message); }
  }
  let sha = "-";
  try { sha = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).stdout.trim() || "-"; } catch { sha = "-"; }
  say("#legs tree " + sha + " electron " + process.versions.electron + " chrome " + process.versions.chrome + ", legs " + chosen.join(" "));

  let failed = 0, verdicts = 0;
  for (const name of chosen) {
    const rec = record(name);
    try {
      await LEGS[name](rec);
      if (!rec.verdict) throw new Error("the leg ended without a verdict");
    } catch (e) {
      if (e instanceof NoVerdict) { rec.verdict = "no-verdict"; rec.why = e.message; }
      else { rec.verdict = "fail"; rec.why = "the leg threw: " + oneLine(e && e.stack || e); }
    } finally {
      for (const c of rec.cleanups.reverse()) {
        try { rec.f("cleanup-" + c.what, oneLine(await c.run())); } catch (e) { rec.f("cleanup-" + c.what, "threw: " + oneLine(e.message)); }
      }
    }
    const head = rec.verdict === "ok" ? "  ok   " : rec.verdict === "fail" ? "  FAIL " : "  --   ";
    say(head + name + " " + (rec.verdict === "no-verdict" ? "no verdict: " : "") + oneLine(rec.why));
    say("#leg " + name + " " + rec.verdict + " " + rec.facts.join(" "));
    for (const n of rec.notes) say("#note " + name + " " + n);
    if (rec.verdict === "fail") failed++;
    if (rec.verdict !== "no-verdict") verdicts++;
  }
  return failed ? Math.min(failed, 63) : verdicts ? 0 : NO_VERDICT;
}

/* Last, so every declaration above is initialised before either path runs its synchronous part. */
if (CHILD) child(JSON.parse(CHILD));
else parent().then(code => app.exit(code), e => { say("#legs threw: " + oneLine(e && e.stack || e)); app.exit(63); });
