/* THE UBUNTU DESK, launched: an installed or AppImage program on a Linux display, read off the screen
 * and the process table.
 *
 *   xvfb-run -a -s "-screen 0 1280x900x24" node tests/linux-desk.js <program> [--shot <file.png>]
 *
 * with the window wall's variable (E.WINDOWS_VAR) set to today's date for that one command.
 * <program> is /opt/Etiuda/etiuda after the .deb is installed, or the .AppImage itself. It is started
 * twice, each time on a lab of its own (a fresh user-data folder, and Documents moved into the lab by
 * ETIUDA_TEST_DOCUMENTS, so a first run puts the sample catalog the program ships in Documents/Etiuda
 * and nothing else is in reach), and never as root, which Chromium refuses without --no-sandbox.
 * What each leg holds:
 *   1  it paints: the window, captured by xwd, holds many colours and no one colour fills it
 *   2  the first run puts the sample in Documents/Etiuda, byte for byte the tree's own
 *   3  the sandbox: no process of the launch carries --no-sandbox, and every renderer lives in a user
 *      or PID namespace the browser process does not, which is what Chromium's sandbox is
 *   3C THE CONTROL: the same program with --no-sandbox leaves its renderers in the browser's
 *      namespaces, so leg 3 can fail
 *   4  the global hotkey is registered with the display, and pressing it shows the picker
 *   5  the window's class is the one the installed .desktop entry names, where there is one
 *   6  each launch's processes are killed and its lab is gone
 *   7  the desk asks nothing of the web: its net log names no http or https address (7a), and, with spelling
 *      in use, no dictionary address of any scheme (7b). Until 2026-10-06 7a held a desk whose dictionary
 *      address pointed at nothing and which so checked no spelling; it now holds one checking English and
 *      Polish from the files its package carries
 *   8  spelling from the package: the shell copies the package's two dictionaries into the profile (8a), and
 *      a misspelt English and a misspelt Polish word, typed into a field the page is given over the debugging
 *      port and right-clicked, open the shell's menu with suggestions (8b, 8c), read from its stdout under
 *      ETIUDA_TEST_CONTEXT_MENU as shell-smoke 1h reads it; the same words spelt right open it without (8D)
 * AppArmor is not measured where the kernel does not run it, and the run says so.
 *
 * Exit code is the number of failed checks, capped at 63, or 78 where the run produced no verdict.
 */
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const E = require("./engine.js");

const WHO = "tests/linux-desk.js";
const EXPECTED = 16;
const argv = process.argv.slice(2);
const PROGRAM = argv[0] ? path.resolve(argv[0]) : "";
const SHOT = argv.indexOf("--shot") > -1 ? path.resolve(argv[argv.indexOf("--shot") + 1] || "") : "";
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.platform !== "linux") E.refuse(WHO + " is the Linux desk's, and this is " + process.platform);
if (!PROGRAM || !fs.existsSync(PROGRAM)) E.refuse(WHO + " needs the program to launch: " + (PROGRAM || "none named"));
if (!process.env.DISPLAY) E.refuse(WHO + " needs a display; run it under xvfb-run");
if (typeof process.getuid === "function" && process.getuid() === 0) E.refuse(WHO + " runs as root, where Chromium refuses its sandbox; run it as an ordinary user");
for (const tool of ["xwd", "xprop", "xdotool"])
  if (spawnSync("sh", ["-c", "command -v " + tool]).status !== 0) E.refuse(WHO + " needs " + tool + " (x11-apps, x11-utils, xdotool)");
E.windowWall(WHO);

let asserted = 0, failed = 0, notRun = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
const X = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });

/* ---- the process table, from /proc ---- */
function table() {
  const rows = [];
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync("/proc/" + d + "/stat", "utf8");
      const parent = +stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
      /* A zygote's child rewrites its command line as one string, so it is read as one. */
      const cmd = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0").filter(Boolean).join(" ");
      const ns = k => { try { return fs.readlinkSync("/proc/" + d + "/ns/" + k); } catch { return ""; } };
      rows.push({ pid: +d, parent, cmd, user: ns("user"), pidns: ns("pid") });
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

/* The browser process is the one with no --type, and a renderer says so. */
function roles(procs) {
  const ours = procs.filter(r => /^\S*etiuda( |$)/i.test(r.cmd));
  return { browser: ours.find(r => !/ --type=/.test(r.cmd)), renderers: ours.filter(r => / --type=renderer( |$)/.test(r.cmd)) };
}

/* ---- the screen: xwd's ZPixmap, 24 or 32 bits a pixel ---- */
function capture(wid) {
  const r = spawnSync("xwd", ["-silent", "-id", String(wid)], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const b = r.stdout, u = o => b.readUInt32BE(o);
  const head = u(0), w = u(16), h = u(20), bpp = u(44), line = u(48), ncolors = u(76);
  const red = u(56), green = u(60), blue = u(64);
  if (bpp !== 32 && bpp !== 24) return null;
  const at = head + ncolors * 12, px = Buffer.alloc(w * h * 3);
  const shift = m => { let s = 0; while (m && !(m & 1)) { m >>>= 1; s++; } return s; };
  const msb = u(28) === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = at + y * line + x * (bpp / 8);
    const v = bpp === 32 ? (msb ? b.readUInt32BE(o) : b.readUInt32LE(o)) : (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
    const i = (y * w + x) * 3;
    px[i] = (v & red) >>> shift(red); px[i + 1] = (v & green) >>> shift(green); px[i + 2] = (v & blue) >>> shift(blue);
  }
  return { w, h, px };
}
function colours(img) {
  const seen = new Map();
  for (let i = 0; i < img.px.length; i += 3) {
    const k = (img.px[i] << 16) | (img.px[i + 1] << 8) | img.px[i + 2];
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return { distinct: seen.size, top: Math.max(...seen.values()) / (img.w * img.h) };
}
function png(img, file) {
  const crc = buf => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4);
    len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((img.w * 3 + 1) * img.h);
  for (let y = 0; y < img.h; y++) img.px.copy(raw, y * (img.w * 3 + 1) + 1, y * img.w * 3, (y + 1) * img.w * 3);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

/* ---- one launch on a lab of its own ---- */
async function launch(name, extra, env) {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-linux-desk-" + name + "-"));
  const ud = path.join(lab, "user-data"), docs = path.join(lab, "documents"), cats = path.join(docs, "Etiuda"), net = path.join(lab, "net.json");
  fs.mkdirSync(docs, { recursive: true });
  const out = [];
  const child = E.shellLaunch(WHO, PROGRAM, ["--user-data-dir=" + ud, "--log-net-log=" + net].concat(extra || []),
    { stdio: ["ignore", "pipe", "pipe"], env: Object.assign({}, process.env, { ETIUDA_TEST_DOCUMENTS: docs }, env || {}) });
  child.stdout.on("data", d => out.push(String(d)));
  child.stderr.on("data", d => out.push(String(d)));
  let wid = "";
  for (let i = 0; i < 60 && !wid; i++) {
    await sleep(500);
    const ids = X("xdotool", ["search", "--onlyvisible", "--name", "^Etiuda$"]).stdout.trim().split("\n").filter(Boolean);
    wid = ids.find(id => treeOf(child.pid).some(r => r.pid === +X("xdotool", ["getwindowpid", id]).stdout.trim())) || ids[0] || "";
  }
  await sleep(6000);
  return { lab, ud, cats, net, child, out, wid };
}
/* ---- spelling: a field the page is given, typed into and right-clicked over the debugging port ----
   The menu each right-click opens is read off the shell's stdout, one line per menu, labels only. */
const MENU = /etiuda: context menu /;
async function spellingMenus(run, words) {
  const puppeteer = require("puppeteer-core");
  let port = "";
  for (let i = 0; i < 40 && !port; i++) {
    try { port = fs.readFileSync(path.join(run.ud, "DevToolsActivePort"), "utf8").split("\n")[0].trim(); } catch { await sleep(250); }
  }
  if (!port) return { why: "no DevToolsActivePort in the lab's user-data folder" };
  const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null });
  try {
    const p = (await b.pages()).find(x => /etiuda\.html/.test(x.url()));
    if (!p) return { why: "no page of etiuda.html" };
    const cdp = await p.target().createCDPSession();
    const menus = {};
    for (const w of words) {
      const at = await p.evaluate(() => {
        let t = document.getElementById("eSpellProbe");
        if (!t) {
          t = document.createElement("textarea");
          t.id = "eSpellProbe"; t.spellcheck = true;
          t.setAttribute("style", "position:fixed;left:40px;top:40px;width:420px;height:80px;z-index:2147483647;font:20px sans-serif");
          document.body.appendChild(t);
        }
        t.value = ""; t.focus();
        const r = t.getBoundingClientRect();
        return { x: r.x + 14, y: r.y + 16 };
      });
      await cdp.send("Input.insertText", { text: w + " " });
      await sleep(1500);
      const had = run.out.join("").split("\n").filter(l => MENU.test(l)).length;
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "right", clickCount: 1 });
      await sleep(800);
      const lines = run.out.join("").split("\n").filter(l => MENU.test(l));
      menus[w] = lines.length > had ? JSON.parse(lines[lines.length - 1].replace(/^.*etiuda: context menu /, "")).map(i => i[0]) : null;
    }
    await cdp.detach().catch(() => {});
    return { menus };
  } finally { await b.disconnect(); }
}

function close(run) {
  const n = killAll(run.child.pid);
  const gone = E.removeLab(run.lab);
  return { n, gone };
}

(async () => {
  const apparmor = fs.existsSync("/sys/kernel/security/apparmor");
  let restrict = "";
  try { restrict = fs.readFileSync("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8").trim(); } catch { restrict = "absent"; }
  console.log("       program " + PROGRAM + "; AppArmor " + (apparmor ? "running" : "not running")
    + ", apparmor_restrict_unprivileged_userns " + restrict);
  if (!apparmor) console.log("  NOT RUN what the AppArmor profile allows: this kernel runs no AppArmor, so the sandbox below stands on user namespaces alone");

  const run = await launch("main", ["--remote-debugging-port=0"], { ETIUDA_TEST_CONTEXT_MENU: "1" });
  try {
    check(!!run.wid, "1a a window named Etiuda is shown within 30 s: " + (run.wid || "none") + (run.wid ? "" : "; the program said: " + run.out.join("").slice(-600)));
    const img = run.wid ? capture(run.wid) : null;
    const c = img ? colours(img) : { distinct: 0, top: 1 };
    if (img && SHOT) png(img, SHOT);
    check(!!img && c.distinct >= 64 && c.top < 0.9,
      "1b it paints: " + (img ? img.w + "x" + img.h : "no capture") + ", " + c.distinct + " distinct colour(s), the most common on "
      + (100 * c.top).toFixed(1) + "% of the window, counted over every pixel of the xwd capture" + (SHOT ? "; saved " + SHOT : ""));
    const shipped = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"));
    const inFolder = fs.existsSync(run.cats) ? fs.readdirSync(run.cats) : [];
    check(inFolder.length === 1 && fs.readFileSync(path.join(run.cats, inFolder[0])).equals(shipped),
      "2a the first run puts the sample in Documents/Etiuda, byte for byte the tree's shell/sample-catalog.ec: " + JSON.stringify(inFolder));

    const procs = treeOf(run.child.pid), { browser, renderers } = roles(procs);
    check(procs.length > 0 && !procs.some(r => / --no-sandbox( |$)/.test(r.cmd)),
      "3a no process of the launch carries --no-sandbox: " + procs.length + " process(es) read from /proc");
    const apart = r => !!browser && (r.user !== browser.user || r.pidns !== browser.pidns);
    check(!!browser && renderers.length > 0 && renderers.every(apart),
      "3b every renderer lives in a namespace the browser process does not: " + renderers.length + " renderer(s), "
      + renderers.map(r => (r.user !== (browser || {}).user ? "user" : "") + (r.pidns !== (browser || {}).pidns ? "+pid" : "") || "none").join(", "));

    const said = run.out.join("");
    check(/etiuda: the hotkey Control\+Shift\+Space is registered/.test(said),
      "4a the global hotkey is registered with the display: " + ((/etiuda: [^\n]*hotkey[^\n]*/.exec(said) || ["nothing said of it"])[0]));
    const before = X("xdotool", ["search", "--onlyvisible", "--name", "^Etiuda$"]).stdout.trim().split("\n").filter(Boolean);
    X("xdotool", ["mousemove", "300", "300"]);
    X("xdotool", ["key", "ctrl+shift+space"]);
    await sleep(3000);
    const after = X("xdotool", ["search", "--onlyvisible", "--name", "^Etiuda$"]).stdout.trim().split("\n").filter(Boolean);
    check(after.length === before.length + 1, "4b pressing it shows the picker: " + before.length + " window(s) named Etiuda, then " + after.length);

    const cls = run.wid ? X("xprop", ["-id", run.wid, "WM_CLASS"]).stdout.trim() : "";
    const res = (/= "([^"]*)", "([^"]*)"/.exec(cls) || [])[2] || "";
    const entry = "/usr/share/applications/etiuda.desktop";
    if (fs.existsSync(entry) && PROGRAM === "/opt/Etiuda/etiuda") {
      const want = (/^StartupWMClass=(.*)$/m.exec(fs.readFileSync(entry, "utf8")) || [])[1] || "";
      check(!!want && res === want, "5a the window's class is the one " + entry + " names: " + cls + ", the entry " + JSON.stringify(want));
    } else {
      notRun++;
      console.log("  NOT RUN 5a no installed .desktop entry is this program's, so there is no class to hold it to: " + cls);
    }

    const carried = path.join(path.dirname(PROGRAM), "resources", "dictionaries"), into = path.join(run.ud, "Dictionaries");
    const NAMES = ["en-US-10-1.bdic", "pl-PL-3-0.bdic"];
    if (fs.existsSync(carried)) {
      const same = NAMES.filter(n => { try { return fs.readFileSync(path.join(into, n)).equals(fs.readFileSync(path.join(carried, n))); } catch { return false; } });
      check(same.length === 2, "8a the shell copied the package's two dictionaries into the profile byte for byte, under Chromium's casing: "
        + JSON.stringify(same) + " of " + JSON.stringify(fs.existsSync(into) ? fs.readdirSync(into) : []));
    } else {
      notRun++;
      console.log("  NOT RUN 8a no resources/dictionaries beside the program, as in an AppImage, so the copy has nothing to be held to");
    }
    const sp = await spellingMenus(run, ["teh", "dzienkujemy", "the", "dzi\u0119kujemy"]);
    const m = sp.menus || {}, plain = m.the || [];
    const offered = w => { const extra = (m[w] || []).filter(l => plain.indexOf(l) < 0); return extra.slice(0, -1); };
    check(!!m.teh && offered("teh").indexOf("the") > -1,
      "8b a right-click on the misspelt English word teh opens the shell's menu with suggestions, the among them: "
      + JSON.stringify(offered("teh")) + " in " + JSON.stringify(m.teh || sp.why || null));
    check(!!m.dzienkujemy && offered("dzienkujemy").indexOf("dzi\u0119kujemy") > -1,
      "8c a right-click on the misspelt Polish word dzienkujemy opens it with suggestions, dzi\u0119kujemy among them: "
      + JSON.stringify(offered("dzienkujemy")) + " in " + JSON.stringify(m.dzienkujemy || sp.why || null));
    check(plain.length > 0 && JSON.stringify(m["dzi\u0119kujemy"]) === JSON.stringify(plain)
      && (m.teh || []).length > plain.length && (m.dzienkujemy || []).length > plain.length,
      "8D CONTROL: the same words spelt right open the menu with the edit commands alone, so 8b and 8c can fail: "
      + JSON.stringify([plain, m["dzi\u0119kujemy"] || null]));
  } finally {
    const n = killAll(run.child.pid);
    await sleep(500);
    let log = "";
    try { log = fs.readFileSync(run.net, "utf8"); } catch { log = ""; }
    const web = [...new Set((log.match(/"url":"https?:[^"]*"/g) || []))];
    check(log.length > 0 && web.length === 0, "7a the desk asks nothing of the web, with spelling in use: " + log.length + " byte(s) of net log, "
      + web.length + " http or https address(es)" + (web.length ? ": " + web.join(", ") : ""));
    const dict = [...new Set((log.match(/"url":"[^"]*\.bdic"/g) || []))];
    check(log.length > 0 && dict.length === 0, "7b and asks for no dictionary at any address, file:// included, since the package's were"
      + " where Chromium reads them: " + dict.length + (dict.length ? ": " + dict.join(", ") : ""));
    const c = { n, gone: E.removeLab(run.lab) };
    check(c.gone, "6a the launch's " + c.n + " process(es) are killed and its lab is gone");
  }

  const ctl = await launch("control", ["--no-sandbox"]);
  try {
    const { browser, renderers } = roles(treeOf(ctl.child.pid));
    check(!!browser && renderers.length > 0 && renderers.every(r => r.user === browser.user && r.pidns === browser.pidns),
      "3C THE CONTROL: with --no-sandbox the " + renderers.length + " renderer(s) share the browser's namespaces, so 3b can fail");
  } finally { close(ctl); }

  console.log("#counts checks=" + asserted + " failed=" + failed + " notRun=" + notRun + " expected=" + EXPECTED);
  if (asserted + notRun < EXPECTED) { console.log("SUITE DID NOT COMPLETE: " + (asserted + notRun) + " of " + EXPECTED + " checks ran"); process.exit(78); }
  console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)" + (notRun ? ", " + notRun + " NOT RUN" : ""));
  process.exit(Math.min(failed, 63));
})().catch(e => { console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); process.exit(78); });
