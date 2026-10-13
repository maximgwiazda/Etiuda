/* THE UBUNTU DESK'S KEYRING, launched: whether the installed desk keeps its private keys sealed by a keyring, on the
 * desktops and buses an Ubuntu machine can have, and refuses rather than keeping them in plain text where none answers.
 *
 *   xvfb-run -a node tests/linux-keyring.js <program>
 *
 * with the window wall's variable (E.WINDOWS_VAR) set to today's date for that one command, as an ordinary user.
 * <program> is /opt/Etiuda/etiuda after the .deb is installed. Each scenario runs in a session bus of its own
 * (dbus-run-session), with a fresh XDG_DATA_HOME, so a keyring one scenario makes is never another's. In each the desk
 * is launched twice on one lab profile and asked for its branch key through the page's own door (E_HOST.branchIdentity),
 * and what it kept is read from the lab's desk.json: "djEx" (v11) is sealed with the keyring's key, "djEw" (v10) with
 * the password built into Chromium, which is plain text in all but name.
 * What each leg holds (the scenarios are Claude gamma's of 8 and 10 October 2026, lead-engineer-2026-10-08-linux-keyring.md
 * and lead-engineer-2026-10-11-keyring-measure.md on claude/gamma):
 *   lk1a GNOME with an unlocked keyring: no switch is added, both private keys are sealed djEx, the same key comes back
 *        at the second launch
 *   lk1b no desktop named, with a keyring: the shell adds the switch, says so, and seals djEx
 *   lk1c LXQt, with a keyring: as lk1b
 *   lk2a no secret service on the bus: the desk says none answers, keeps no key and writes no desk file key
 *   lk2b gnome-keyring installed but not running: refused as lk2a, and no keyring daemon or prompter is started
 *   lk2c a locked keyring: refused as lk2a, and no prompter
 *   lk3C THE CONTROL: a copy of the program whose shell does not add the switch refuses on lk1b's bus, so lk1b's seal
 *        is the switch's and lk1b can fail
 *   lk4  across every scenario no file of any lab holds djEw
 * Each scenario carries its own control on the bus (a secret-tool round trip, NameHasOwner, the activatable names,
 * the collection's Locked property), and a scenario whose control fails reads NOT RUN, not FAIL.
 *
 * Exit code is the number of failed checks, capped at 63, or 78 where the run produced no verdict.
 */
"use strict";
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");

const WHO = "tests/linux-keyring.js";
const EXPECTED = 8;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INSIDE = process.argv[2] === "--inside";
const SCENARIO = INSIDE ? process.argv[3] : "";
const PROGRAM = path.resolve(process.argv[INSIDE ? 4 : 2] || "");
const BUS = "/usr/bin/dbus-send";

if (process.platform !== "linux") E.refuse(WHO + " is the Linux desk's, and this is " + process.platform);
if (!process.argv[INSIDE ? 4 : 2] || !fs.existsSync(PROGRAM)) E.refuse(WHO + " needs the program to launch: " + (process.argv[INSIDE ? 4 : 2] || "none named"));
if (!process.env.DISPLAY) E.refuse(WHO + " needs a display; run it under xvfb-run");
if (typeof process.getuid === "function" && process.getuid() === 0) E.refuse(WHO + " runs as root, where Chromium refuses its sandbox; run it as an ordinary user");
for (const tool of ["dbus-run-session", "gnome-keyring-daemon", "secret-tool", "dbus-send"])
  if (spawnSync("sh", ["-c", "command -v " + tool]).status !== 0) E.refuse(WHO + " needs " + tool + " (dbus, gnome-keyring, libsecret-tools)");
E.windowWall(WHO);

/* ---- the process table, from /proc ---- */
function table() {
  const rows = [];
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync("/proc/" + d + "/stat", "utf8");
      const comm = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
      const parent = +stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
      rows.push({ pid: +d, parent, comm });
    } catch { /* gone between the listing and the read */ }
  }
  return rows;
}
function treeOf(root) {
  const rows = table(), out = rows.filter(r => r.pid === root);
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r.parent === out[i].pid && out.indexOf(r) < 0) out.push(r);
  return out;
}
function killAll(root) {
  const set = treeOf(root);
  for (const r of set) { try { process.kill(r.pid, "SIGKILL"); } catch { /* gone */ } }
  return set.length;
}
const KEYRING_PROCS = /^(gnome-keyring-d|gcr-prompter|gnome-keyring-daemon)$/;
const ask = (dest, at, method, ...args) => {
  try {
    return String(execFileSync(BUS, ["--session", "--print-reply=literal", "--reply-timeout=1500", "--dest=" + dest, at, method].concat(args),
      { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return ""; }
};

/* ================================================================================================
   INSIDE ONE SESSION BUS: the scenario's keyring made or not, its control read, the desk launched
   twice on one lab, and one line, `#scenario {...}`, with what was seen.
   ================================================================================================ */
async function launchOnce(lab, prog, env, seen) {
  const ud = path.join(lab, "user-data"), docs = path.join(lab, "documents"), out = [];
  fs.mkdirSync(docs, { recursive: true });
  const before = new Set(table().filter(r => KEYRING_PROCS.test(r.comm)).map(r => r.pid));
  const child = E.shellLaunch(WHO, prog, ["--user-data-dir=" + ud, "--remote-debugging-port=0"],
    { stdio: ["ignore", "pipe", "pipe"], env: Object.assign({}, process.env, { ETIUDA_TEST_DOCUMENTS: docs }, env) });
  child.stdout.on("data", d => out.push(String(d)));
  child.stderr.on("data", d => out.push(String(d)));
  let stop = false;
  const watch = (async () => { while (!stop) {
    for (const r of table()) if (KEYRING_PROCS.test(r.comm) && !before.has(r.pid)) seen.add(r.comm);
    await sleep(200);
  } })();
  let id = null, why = "";
  try {
    let port = "";
    for (let i = 0; i < 80 && !port; i++) {
      try { port = fs.readFileSync(path.join(ud, "DevToolsActivePort"), "utf8").split("\n")[0].trim(); } catch { await sleep(250); }
    }
    if (!port) why = "no DevToolsActivePort in the lab's user-data folder";
    else {
      const puppeteer = require("puppeteer-core");
      const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null });
      try {
        let p = null;
        for (let i = 0; i < 40 && !p; i++) { p = (await b.pages()).find(x => /etiuda\.html/.test(x.url())) || null; if (!p) await sleep(250); }
        if (!p) why = "no page of etiuda.html";
        else id = await p.evaluate(() => window.E_HOST && window.E_HOST.branchIdentity(true));
      } finally { await b.disconnect(); }
    }
  } catch (e) { why = String(e && e.message || e).slice(0, 200); }
  stop = true;
  await watch;
  killAll(child.pid);
  /* The stale port file goes, or the second launch would read the first's (Claude gamma, 8 October). */
  try { fs.unlinkSync(path.join(ud, "DevToolsActivePort")); } catch { /* none */ }
  return { id: id && id.id || null, why, said: out.join("") };
}
function deskKeys(lab) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(lab, "user-data", "desk.json"), "utf8"));
    const b = d && d.branch;
    return b ? { sign: String(b.sign && b.sign.priv || "").slice(0, 4), box: String(b.box && b.box.priv || "").slice(0, 4) } : null;
  } catch { return null; }
}
function filesHolding(dir, needle) {
  const hits = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.isFile() && /\.json$/.test(e.name)) { try { if (fs.readFileSync(f, "utf8").includes(needle)) hits.push(path.relative(dir, f)); } catch { /* unreadable */ } }
  } };
  try { walk(dir); } catch { /* none */ }
  return hits;
}
async function inside() {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-linux-keyring-" + SCENARIO + "-"));
  const data = path.join(lab, "data");
  fs.mkdirSync(data, { recursive: true });
  process.env.XDG_DATA_HOME = data;
  const wantKeyring = /^(gnome|unset|lxqt|locked|red)$/.test(SCENARIO);
  const control = {};
  if (wantKeyring) {
    /* A keyring made fresh in this lab's XDG_DATA_HOME, unlocked with a password of its own, then its secret service. */
    spawnSync("gnome-keyring-daemon", ["--unlock", "--components=secrets"], { input: "kr-probe", encoding: "utf8" });
    spawnSync("gnome-keyring-daemon", ["--start", "--components=secrets"], { encoding: "utf8" });
    spawnSync("secret-tool", ["store", "--label=kr-probe", "kr", "probe"], { input: "kr-probe-secret", encoding: "utf8" });
    control.roundTrip = String(spawnSync("secret-tool", ["lookup", "kr", "probe"], { encoding: "utf8" }).stdout || "").trim();
    if (SCENARIO === "locked")
      ask("org.freedesktop.secrets", "/org/freedesktop/secrets", "org.freedesktop.Secret.Service.Lock", "array:objpath:/org/freedesktop/secrets/collection/login");
  }
  control.owner = ask("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.NameHasOwner", "string:org.freedesktop.secrets").trim();
  control.activatable = (ask("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.ListActivatableNames").match(/org\.freedesktop\.secrets/g) || []).length;
  control.locked = ask("org.freedesktop.secrets", "/org/freedesktop/secrets/collection/login", "org.freedesktop.DBus.Properties.Get",
    "string:org.freedesktop.Secret.Collection", "string:Locked").trim();
  const env = {};
  if (SCENARIO === "gnome") env.XDG_CURRENT_DESKTOP = "GNOME";
  else if (SCENARIO === "lxqt") env.XDG_CURRENT_DESKTOP = "LXQt";
  else delete process.env.XDG_CURRENT_DESKTOP;
  delete process.env.DESKTOP_SESSION; delete process.env.GNOME_DESKTOP_SESSION_ID; delete process.env.KDE_FULL_SESSION;
  const prog = SCENARIO === "red" ? process.env.ETIUDA_KEYRING_RED : PROGRAM;
  const seen = new Set();
  const first = await launchOnce(lab, prog, env, seen);
  const keys = deskKeys(lab);
  const second = await launchOnce(lab, prog, env, seen);
  const result = { scenario: SCENARIO, control, first: { id: first.id, why: first.why }, second: { id: second.id, why: second.why }, keys,
    said: (first.said + second.said).split("\n").filter(l => /^etiuda: /.test(l)).filter((l, i, a) => a.indexOf(l) === i),
    started: [...seen], plain: filesHolding(lab, "djEw") };
  for (const r of table()) if (/^gnome-keyring-d/.test(r.comm)) {
    try { if (fs.readFileSync("/proc/" + r.pid + "/environ", "utf8").includes(data)) process.kill(r.pid, "SIGKILL"); } catch { /* not ours, or gone */ }
  }
  E.removeLab(lab);
  console.log("#scenario " + JSON.stringify(result));
}

/* ================================================================================================
   OUTSIDE: each scenario in a bus of its own, and the checks.
   ================================================================================================ */
const SWITCH = /asks for one by name: --password-store=gnome-libsecret/;
const NONE = /none answers unlocked on the session bus, so none is asked for|no keyring answers on this desk/;
function scenario(name, opts) {
  const o = opts || {};
  const args = (o.config ? ["--config-file=" + o.config] : []).concat(["--", process.execPath, __filename, "--inside", name, PROGRAM]);
  const r = spawnSync("dbus-run-session", args, { encoding: "utf8", timeout: 240000, env: Object.assign({}, process.env, o.env || {}) });
  const line = String(r.stdout || "").split("\n").find(l => l.startsWith("#scenario "));
  try { return line ? JSON.parse(line.slice(10)) : { scenario: name, error: "no #scenario line: " + String(r.stdout || "").slice(-300) + String(r.stderr || "").slice(-300) }; }
  catch (e) { return { scenario: name, error: "unreadable #scenario line" }; }
}
/* A bus with no service directory, so nothing can be activated on it: the no-service scenario's. */
function emptyBusConfig(dir) {
  const f = path.join(dir, "no-services.conf");
  fs.writeFileSync(f, '<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"\n'
    + ' "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">\n'
    + "<busconfig><type>session</type><listen>unix:tmpdir=" + dir + "</listen><auth>EXTERNAL</auth>\n"
    + '<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy></busconfig>\n');
  return f;
}
/* The red copy: the program's folder copied whole, its app.asar's shell/main.js without the line that adds the switch. */
async function redCopy(dir) {
  const asar = require(path.join(E.ROOT, "node_modules", "@electron", "asar"));
  const from = path.dirname(PROGRAM), to = path.join(dir, "red");
  if (spawnSync("cp", ["-a", from, to]).status !== 0) return { why: "cp -a of " + from + " failed" };
  const pack = path.join(to, "resources", "app.asar"), open = path.join(dir, "red-asar");
  asar.extractAll(pack, open);
  const main = path.join(open, "shell", "main.js"), src = fs.readFileSync(main, "utf8");
  const LINE = "  app.commandLine.appendSwitch(...KEYRING_SWITCH);\n";
  if (src.split(LINE).length !== 2) return { why: "the switch line stands " + (src.split(LINE).length - 1) + " times in the shell, not once" };
  fs.writeFileSync(main, src.split(LINE).join(""));
  await asar.createPackage(open, pack);
  return { program: path.join(to, path.basename(PROGRAM)) };
}

let asserted = 0, failed = 0, notRun = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function held(id, control, ok, line) {
  if (!ok) { notRun++; console.log("  NOT RUN " + id + " its bus's control did not hold, so the scenario is not the one named: " + JSON.stringify(control)); return; }
  check(line[0], id + " " + line[1]);
}
const sealed = s => !!s.keys && s.keys.sign === "djEx" && s.keys.box === "djEx" && !!s.first.id && s.first.id === s.second.id;
const refused = s => !s.first.id && !s.second.id && !s.keys && (s.said || []).some(l => NONE.test(l));
const show = s => JSON.stringify({ ids: [s.first && s.first.id, s.second && s.second.id], why: s.first && s.first.why || undefined, keys: s.keys, said: s.said, started: s.started, error: s.error });

(async () => {
  if (INSIDE) { await inside(); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-linux-keyring-"));
  const all = [];
  try {
    const kr = c => c.roundTrip === "kr-probe-secret" && c.owner === "boolean true";
    const g = scenario("gnome"); all.push(g);
    held("lk1a", g.control, !g.error && kr(g.control), [sealed(g) && !(g.said || []).some(l => SWITCH.test(l)),
      "GNOME with an unlocked keyring seals both keys djEx, adds no switch, and the second launch has the same key: " + show(g)]);
    const u = scenario("unset"); all.push(u);
    held("lk1b", u.control, !u.error && kr(u.control), [sealed(u) && (u.said || []).some(l => SWITCH.test(l)),
      "no desktop named, with a keyring: the switch is added and said, and both keys are sealed djEx: " + show(u)]);
    const l = scenario("lxqt"); all.push(l);
    held("lk1c", l.control, !l.error && kr(l.control), [sealed(l) && (l.said || []).some(l2 => SWITCH.test(l2)),
      "LXQt, with a keyring: as lk1b: " + show(l)]);
    const n = scenario("none", { config: emptyBusConfig(dir) }); all.push(n);
    held("lk2a", n.control, !n.error && /boolean false/.test(n.control.owner) && n.control.activatable === 0, [refused(n),
      "no secret service on the bus: the desk says none answers, keeps no key and writes none: " + show(n)]);
    const d = scenario("ondemand"); all.push(d);
    held("lk2b", d.control, !d.error && /boolean false/.test(d.control.owner) && d.control.activatable >= 1, [refused(d) && d.started.length === 0,
      "gnome-keyring installed but not running: refused, and no keyring daemon or prompter was started: " + show(d)]);
    const k = scenario("locked"); all.push(k);
    held("lk2c", k.control, !k.error && /boolean true/.test(k.control.locked), [refused(k) && k.started.indexOf("gcr-prompter") < 0,
      "a locked keyring: refused, and no prompter: " + show(k)]);
    const red = await redCopy(dir);
    if (!red.program) { notRun++; console.log("  NOT RUN lk3C no red copy could be made: " + red.why); }
    else {
      const r = scenario("red", { env: { ETIUDA_KEYRING_RED: red.program } }); all.push(r);
      /* A copy at another path may not start at all where AppArmor confines the installed program's own path
         (Ubuntu 24.04 and later): a red copy that says nothing is no control, so it reads NOT RUN with why. */
      if (!r.error && !(r.said || []).length) { notRun++; console.log("  NOT RUN lk3C the red copy did not start: " + show(r)); }
      else held("lk3C", r.control, !r.error && kr(r.control), [refused(r),
        "THE CONTROL: the same bus as lk1b with a shell that adds no switch refuses, so lk1b's seal is the switch's: " + show(r)]);
    }
    const plain = all.filter(s => (s.plain || []).length);
    check(all.length >= 6 && plain.length === 0, "lk4 no file of any scenario's lab holds a key sealed djEw, the password built into Chromium: "
      + (plain.map(s => s.scenario + " " + s.plain.join(",")).join("; ") || all.length + " scenario(s), none"));
  } finally { E.removeLab(dir); }
  console.log("#counts checks=" + asserted + " failed=" + failed + " notRun=" + notRun + " expected=" + EXPECTED);
  if (asserted + notRun < EXPECTED) { console.log("SUITE DID NOT COMPLETE: " + (asserted + notRun) + " of " + EXPECTED + " checks ran"); process.exit(78); }
  console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)" + (notRun ? ", " + notRun + " NOT RUN" : ""));
  process.exit(Math.min(failed, 63));
})().catch(e => { console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); process.exit(78); });
