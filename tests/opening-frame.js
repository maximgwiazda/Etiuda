/* THE DESK'S FIRST FRAME IS THE OPENING'S, IN THE DESK'S OWN THEME. Driven in the shell, unpackaged, offscreen.
 *
 *   node tests/opening-frame.js        with the window wall's variable set to today's date for that one command
 *
 * The case is Max's (2026-11-09 20:26): "At first, the regular empty state Desk shows up, with a dark theme for some
 * reson applied (even though light theme is set up in my Desk; possibly it's because my system theme is dark), and only
 * after 1/3 second (or something like that) the opening animation plays. This is really wrong - the opening animation
 * should play right away, with no empty state desk showing up before it starts playing." The window showed on the first
 * frame Chromium painted, and the parser painted the page's static markup, in the sheet's dark default, before the
 * app's script had run: no theme, no launch.
 *
 * WHAT IS READ IS THE FIRST FRAME ITSELF. The shell's own main.js, copied into a throwaway app, has a frame subscription
 * added beside its ready-to-show line, begun when the page's navigation commits and so before any frame of it: the
 * first frame it is handed is the first the page presented, and its pixels are counted, every one. The opening's first
 * frame is its ground alone, the theme's #f7f8fa or #0f1013 over the whole window, the mark not yet faded in.
 *   of1  the desk set to the theme the system is NOT in: the first frame is that theme's ground over at least 99.5 per
 *        cent of the window, and no pixel of it is the other theme's ground
 *   of2  the desk set to the system's own theme: the same, in that theme, so both themes are read on any machine
 *   of3  in of1's launch, the opening's first drawn frame (launchState().first) comes within 50 ms of the page's first
 *        paint, both on the page's clock: the opening plays at once
 *   of4  THE CONTROL: the same reading on a quiet desk (eMotionOff, which plays no opening) finds the empty desk and not
 *        a bare ground, so of1 and of2 cannot pass on a reading that sees nothing; and that frame is in the desk's
 *        theme too, its ground over most of the window and no more than 2 per cent the other theme's
 * Its user-data and catalog folders are its own, and no catalog is loaded. Exit code is the number of failed checks,
 * capped at 63 (E.exitOf), 78 where the run produced no verdict.
 */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.platform !== "win32") E.refuse("tests/opening-frame.js reads the system theme from the Windows registry, so it runs on Windows only");
E.windowWall("tests/opening-frame.js");
E.refuseWhileElectronLive("tests/opening-frame.js");
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const EXPECTED = 4, GROUND_SHARE = 0.995, OPEN_WITHIN_MS = 50;
const GROUND = { light: [247, 248, 250], dark: [15, 16, 19] };
let fails = 0, checks = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const READY_SHOW = '  win.once("ready-to-show", showWhenReady);';

function systemTheme() {
  const out = execFileSync("C:\\Windows\\System32\\reg.exe",
    ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "/v", "AppsUseLightTheme"],
    { encoding: "utf8", windowsHide: true });
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
  if (!m) throw new Error("the registry gave no AppsUseLightTheme");
  return parseInt(m[1], 16) ? "light" : "dark";
}
function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}
/* The first frame's pixels, counted in the main process: each theme's ground within 8 levels a channel. */
const PROBE = READY_SHOW + "\n"
  + "  win.webContents.once('did-navigate', () => {\n"
  + "    win.webContents.beginFrameSubscription(false, img => {\n"
  + "      try { win.webContents.endFrameSubscription(); } catch (e) {}\n"
  + "      const b = img.toBitmap(), G = " + JSON.stringify(GROUND) + ";\n"
  + "      const near = (i, c) => Math.abs(b[i + 2] - c[0]) <= 8 && Math.abs(b[i + 1] - c[1]) <= 8 && Math.abs(b[i] - c[2]) <= 8;\n"
  + "      let light = 0, dark = 0, n = 0;\n"
  + "      for (let i = 0; i + 3 < b.length; i += 4) { n++; if (near(i, G.light)) light++; else if (near(i, G.dark)) dark++; }\n"
  + "      console.log('etiuda-first-frame ' + JSON.stringify({ n: n, light: light, dark: dark }));\n"
  + "    });\n"
  + "    setTimeout(() => win.webContents.executeJavaScript('JSON.stringify({ launch: typeof launchState === \"function\" ? launchState() : null,'\n"
  + "      + ' paint: (performance.getEntriesByName(\"first-paint\")[0] || {}).startTime || null,'\n"
  + "      + ' theme: document.documentElement.getAttribute(\"data-theme\") })')\n"
  + "      .then(r => console.log('etiuda-page ' + r), e => console.log('etiuda-page ' + JSON.stringify({ error: String(e) }))), 5500);\n"
  + "  });\n";

const labs = [];
async function launch(theme, quiet) {
  const APP = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-opening-frame-"));
  labs.push(APP);
  for (const d of ["engine", "userdata", "documents"]) fs.mkdirSync(path.join(APP, d), { recursive: true });
  fs.cpSync(path.join(E.ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
  fs.writeFileSync(path.join(APP, "package.json"), JSON.stringify({ name: "etiuda-opening-frame", version: "0.0.0", main: "shell/main.js" }), "utf8");
  for (const f of ["etiuda.html", "etiuda.csp.json"]) fs.copyFileSync(path.join(E.ROOT, "engine", f), path.join(APP, "engine", f));
  const main = path.join(APP, "shell", "main.js"), src = fs.readFileSync(main, "utf8");
  const hits = src.split(READY_SHOW).length - 1;
  if (hits !== 1) throw new Error("the ready-to-show line matched " + hits + " times in shell/main.js, expected 1");
  fs.writeFileSync(main, src.split(READY_SHOW).join(PROBE), "utf8");
  const UD = path.join(APP, "userdata");
  const keys = { eTourDone_v3: "1", eTourInvite_v3: "1", eNameAsked: "1", eAgent: "Probe", eTheme: theme };
  if (quiet) keys.eMotionOff = "1";
  fs.writeFileSync(path.join(UD, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "harness",
    saved: new Date().toISOString(), keys: keys }), "utf8");
  E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
  const child = E.shellLaunch("tests/opening-frame.js", electronExe(), [APP, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: path.join(APP, "documents"), [E.OFFSCREEN_KEY]: "2" }) });
  let out = "";
  const said = [];
  child.stdout.on("data", d => { out += d; said.push(String(d).trim()); });
  child.stderr.on("data", d => { said.push(String(d).trim()); });
  let died = null;
  const noteExit = (code, signal) => { died = { code: code, signal: signal }; };
  child.once("exit", noteExit);
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !/etiuda-page /.test(out) && !died) await sleep(250);
  } finally {
    child.removeListener("exit", noteExit);
    const k = E.killTree(child.pid);
    console.log("       the app, pid " + child.pid + ": " + k.how);
  }
  const frame = /etiuda-first-frame (\{.*\})/.exec(out), page = /etiuda-page (\{.*\})/.exec(out);
  if (!frame && died) {
    const how = died.code !== null && died.code !== undefined ? died.code : died.signal;
    E.shellDidNotStart("the shell exited " + how + (said.filter(Boolean).length ? ": " + said.filter(Boolean).join(" | ") : ""));
  }
  if (!frame) throw new Error("no first frame was read in 20 s (" + theme + (quiet ? ", quiet" : "") + ")");
  return { frame: JSON.parse(frame[1]), page: page ? JSON.parse(page[1]) : null };
}

(async () => {
  let done = false;
  try {
    const sys = systemTheme(), other = sys === "light" ? "dark" : "light";
    console.log("       the system's theme, read from the registry: " + sys);
    const share = (f, t) => f[t] / f.n;
    const ground = async (n, theme, why) => {
      const r = await launch(theme, false);
      const own = share(r.frame, theme), foe = r.frame[theme === "light" ? "dark" : "light"];
      check(own >= GROUND_SHARE && foe === 0,
        n + " the desk in " + theme + " (" + why + "): the first frame is the " + theme + " ground over "
        + (own * 100).toFixed(2) + " per cent of " + r.frame.n + " pixels (at least " + GROUND_SHARE * 100 + "), and "
        + foe + " pixels are the other theme's ground (none allowed)");
      return r;
    };
    const a = await ground("of1", other, "the system is " + sys);
    await ground("of2", sys, "the system's own");
    const L = a.page && a.page.launch, paint = a.page && a.page.paint;
    check(!!L && typeof L.first === "number" && L.first > 0 && typeof paint === "number" && L.first <= paint + OPEN_WITHIN_MS,
      "of3 the opening's first drawn frame at " + (L && L.first != null ? Math.round(L.first) : "none") + " ms, the page's first paint at "
      + (paint != null ? Math.round(paint) : "none") + " ms on the page's clock (at most " + OPEN_WITHIN_MS + " ms after it); given way by "
      + (L ? L.reason : "nothing"));
    const q = await launch(other, true);
    const qOwn = share(q.frame, other), qFoe = share(q.frame, other === "light" ? "dark" : "light");
    check(qOwn < GROUND_SHARE && qOwn > 0.5 && qFoe <= 0.02,
      "of4 THE CONTROL: on a quiet desk in " + other + ", which plays no opening, the first frame is the empty desk and not a bare"
      + " ground: its ground over " + (qOwn * 100).toFixed(2) + " per cent (under " + GROUND_SHARE * 100 + ", over 50), the other"
      + " theme's over " + (qFoe * 100).toFixed(2) + " per cent (at most 2)");
    done = true;
  } catch (e) {
    console.log("  FAIL the run stopped: " + String(e && e.message || e).split("\n")[0]);
    fails++;
  } finally {
    for (const l of labs) E.removeLab(l);
  }
  if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
  console.log((fails ? "FAIL " : "PASS ") + "opening-frame: " + (checks - Math.min(fails, checks)) + "/" + checks + " checks"
    + (done ? "" : " - SUITE DID NOT COMPLETE"));
  process.exit(done ? E.exitOf(fails) : 78);
})();
