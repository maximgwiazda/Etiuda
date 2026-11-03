/* The picker over a real window: what tests/pick.mjs cannot prove in node, driven in Electron.
 *
 *   node tests/pick-desk.js
 *
 * WHAT IT PROVES. That Windows itself holds the combination (a second program asking for it is
 * refused, which a keyboard hook would not cause), that the hotkey pressed over another program's
 * window opens the picker focused, that Enter puts on the clipboard what the desk's own page puts
 * there for the same text, that the focus goes back to that other window and a Ctrl+V there
 * pastes the reply, and that Escape, a second press and a repeat do what they say.
 *
 * WHAT IT COSTS. It TAKES THE FOREGROUND AND SENDS REAL KEYS for about twenty seconds, so it is
 * run by hand with nobody at the keyboard, never in a chain: tests/engine-selftest.js names it
 * among the files that are not gates. The "chat" is a window of a PowerShell form of this file's
 * own, placed at 200,200; the desk's window is off screen; the picker opens by the pointer.
 *
 * GUARDS. node tests/pick-desk.js --guards proves the idle, touch, focus and clipboard guards
 * on lab stand-ins and opens nothing. The window run refuses unless the desk has been still
 * for five minutes, stops if it is touched, and puts the clipboard back.
 *
 * NO CONTENT. The catalog is invented here. The clipboard is read by the form, compared, and never
 * printed beyond its length.
 *
 * Exit code is the number of failed checks, capped at 63, 78 where the run produced no verdict.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.platform !== "win32") E.refuse("tests/pick-desk.js drives Windows' own hotkey and focus, so it runs on Windows only");

const deskInput = require("../tools/desk-input.js");
if (process.argv.includes("--guards") || process.argv.includes("--idle-check") || process.argv.includes("--guards-before")) {
  deskInput.main(process.argv).then(code => {
    process.exit(code);
  }).catch(e => {
    console.log("  FAIL " + String(e && e.message || e).split("\n")[0]);
    process.exit(1);
  });
} else {
  runPickDesk();
}

function runPickDesk() {
E.windowWall("tests/pick-desk.js");
const EXPECTED = 11;
let checks = 0, fails = 0, reachedEnd = false, child = null, form = null, b = null, fgWatch = null;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-pick-desk-"));
const FG_LOG = path.join(LAB, "fg-log.txt");

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* The chat form is the shared helper. The same script is the lab stand-in under --guards. */
let formN = 0;
/* The process in front at the watcher's last second, for a stop's own line (the test architect, 2026-11-03 04:54). */
function inFront() {
  try {
    const last = fs.readFileSync(FG_LOG, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).pop() || "";
    const r = last.trim().split(" ");
    return r.length >= 4 ? "in front: " + r[3] + " (pid " + r[2] + ", " + r[0] + ")" : "in front: not yet logged";
  } catch (x) { return "in front: the log could not be read"; }
}
async function ask(cmd) {
  const n = formN++;
  fs.writeFileSync(path.join(LAB, "cmd-" + n + ".txt"), cmd, "utf8");
  const ans = path.join(LAB, "ans-" + n + ".txt");
  for (let i = 0; i < 600; i++) {
    await sleep(50);
    if (fs.existsSync(ans)) {
      await sleep(20);
      const got = fs.readFileSync(ans, "utf8").replace(/^\uFEFF/, "").trim();
      if (got === "touched") throw new Error(deskInput.STOP_NOTE + ", " + inFront());
      if (got === "notfg") throw new Error(deskInput.NOTFG_NOTE + ", " + inFront());
      if (got === "foreign") throw new Error(deskInput.FOREIGN_NOTE);
      return got;
    }
  }
  throw new Error("the chat form did not answer " + JSON.stringify(cmd));
}
const b64 = s => Buffer.from(String(s || ""), "base64").toString("utf8");
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { if (await fn()) return true; await sleep(100); } return false; };

/* ---- the app: the shell and the built engine in a throwaway, one invented catalog ----------- */
function buildApp() {
  const dir = path.join(LAB, "app");
  for (const d of ["shell", "engine", "userdata", "catalogs", "documents"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ["main.js", "preload.js", "win-proxy.cjs", "page-watch.cjs"]) fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  for (const f of ["etiuda.html", "etiuda.csp.json"]) fs.copyFileSync(path.join(E.ROOT, "engine", f), path.join(dir, "engine", f));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "etiuda-pick-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  fs.writeFileSync(path.join(dir, "catalogs", "lamps.ec"), JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    name: "Lamp Shop", date: "2026-01-09", langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-ord", kind: "shelf", label: { en: "Orders" } }],
    cards: [{ id: "c-lamp", shelf: "t-ord", bodyShape: "plain", title: { en: "Lamp delivery" },
              body: { en: "{GREET},\nYour lamp leaves the workshop on Monday.\nKind regards,\n{AGENT}" } },
            { id: "c-brass", shelf: "t-ord", bodyShape: "plain", title: { en: "Care of brass" }, body: { en: "Brass wants a dry cloth." } }] }), "utf8");
  const UD = path.join(dir, "userdata");
  E.pinCatalogFolder(UD, path.join(dir, "catalogs"));
  const file = path.join(UD, "desk.json");
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(d.keys, { eTourDone_v3: "1", eTourInvite_v3: "1", eAgent: "Kate", eNameAsked: "1" });
  fs.writeFileSync(file, JSON.stringify(d), "utf8");
  return { dir, UD, docs: path.join(dir, "documents") };
}

/* The picker's page is the data: page holding the box; the word after a pick is a data: page of its own. */
const pickerPage = async () => (await b.pages()).find(p => /^data:text\/html/.test(p.url()) && /id%3D%22q%22/.test(p.url())) || null;

(async () => {
  const block = deskInput.idleBlock(await deskInput.readIdleMinutes());
  if (block) { block.lines.forEach(l => console.log(l)); return; }
  const PORT = E.portBlock("pick-desk");
  const LEASED = E.takeLeases(["ports:" + PORT, "desk:foreground"], 10, "tests/pick-desk.js");
  console.log("       debugging port " + PORT + "; leases: " + LEASED.said);
  const app = buildApp();
  /* The foreground's owner, once a second, read only, from here to the end, so a stop names what held the front. */
  fs.writeFileSync(path.join(LAB, "fg-watch.ps1"), deskInput.fgWatchScript(), "utf8");
  fgWatch = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(LAB, "fg-watch.ps1"),
    "-Out", FG_LOG, "-Stop", path.join(LAB, "fg-stop")], { stdio: "ignore", windowsHide: true });
  child = E.shellLaunch("tests/pick-desk.js", electronExe(), [app.dir, "--remote-debugging-port=" + PORT, "--user-data-dir=" + app.UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: app.docs }) });
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) { /* not up yet */ }
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  let desk = (await b.pages())[0];
  await require("./launch-wait.js").waitLaunchGone(desk, { who: "tests/pick-desk.js", ready: "typeof window.E_VERSION === \"string\"" });
  await sleep(2500);
  await desk.evaluate(() => { const y = document.querySelector("#ecYes"); if (y) y.click(); });
  await sleep(3000);
  desk = (await b.pages()).find(p => /etiuda\.html/.test(p.url()));
  const first = await desk.evaluate(() => {
    const o = JSON.parse(JSON.stringify(answerPick("open", "{}")));
    const r = o.rows[0], m = findCard(r.id), l = cardLang(m);
    return { id: r.id, n: o.rows.length, text: fill(parts(m, l)[r.vi], m, 0, l) };
  });
  check(first.n === 2 && /Kate$/.test(first.text), "a the desk's page answers the picker with the catalog's two rows, the first signed ("
    + first.n + " rows, " + first.text.length + " characters)");

  fs.writeFileSync(path.join(LAB, "form.ps1"), deskInput.helperScript(), "utf8");
  form = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", path.join(LAB, "form.ps1"), "-Dir", LAB],
    { stdio: "ignore", windowsHide: false });
  check(await until(async () => (await ask("fg")) === "True", 30000), "b the chat window stands in front with its text box focused");

  /* MOD_CONTROL 2 | MOD_SHIFT 4 = 6, VK_SPACE 0x20; the control is F24 with every modifier, which nobody holds. */
  const second = await ask("hold 1 6 32"), control = await ask("hold 2 7 135");
  await ask("free 2");
  check(second === "False" && control === "True",
    "c Windows refuses Ctrl+Shift+Space to a second program while Etiuda holds it, and grants that program a free one: "
    + second + ", " + control);

  await ask("keys ctrl+shift+space");
  let pp = null, pageUp = false, focused = false, boxId = "";
  const up = await until(async () => {
    pp = await pickerPage();
    pageUp = !!pp;
    if (!pp) return false;
    const st = await pp.evaluate(() => ({ focus: document.hasFocus(), id: document.activeElement ? document.activeElement.id : "" }));
    focused = !!st.focus;
    boxId = st.id || "";
    return focused && boxId === "q";
  });
  const chatBehind = (await ask("fg")) === "False";
  check(up && chatBehind, "d the hotkey over the chat opens the picker with its search box focused"
    + " (page " + pageUp + ", focus " + focused + ", box " + JSON.stringify(boxId) + ", chat behind " + chatBehind + ")");

  await ask("keys enter");
  const back = await until(async () => (await ask("fg")) === "True");
  const clip1 = b64(await ask("clip"));
  check(back, "e Enter hands the focus back to the chat window");
  await ask("clear");
  await ask("keys ctrl+v");
  await sleep(300);
  const pasted = b64(await ask("text"));
  check(pasted.replace(/\r\n/g, "\n") === first.text && clip1 === pasted,
    "f and Ctrl+V there pastes the reply the desk's own route makes (" + pasted.length + " characters pasted)");

  /* g: THE DESK'S OWN PAGE WRITES THE SAME TEXT, and the bytes must be the picker's (board 818). Until 2026-09-29 the
     write was asked of the picker's page, a data: document with no secure context and so no navigator.clipboard: g
     could never run, and a NOT RUN was counted towards the declared total. The desk's page is a file: document and
     secure; it is off screen and unfocused, and Chromium writes only from a focused document, so focus is emulated
     over CDP for the one write and put back. A sentinel goes on first, so a write that did nothing cannot read as
     clip1 left over from e. The line ends are counted: a write that kept bare line feeds would differ from the
     picker's CRLF even where the text reads the same. */
  const SENT_G = "pick-desk g sentinel " + process.pid;
  await ask("setclip " + Buffer.from(SENT_G, "utf8").toString("base64"));
  const gArmed = b64(await ask("clip")) === SENT_G;
  let deskClip = "not asked";
  const cdp = await desk.createCDPSession();
  try {
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    deskClip = await desk.evaluate(t => (navigator.clipboard && window.isSecureContext)
      ? navigator.clipboard.writeText(t).then(() => "ok", e => "refused " + e.name) : "none", first.text);
  } finally {
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
  const viaDesk = b64(await ask("clip"));
  const ends = s => ({ n: s.length, crlf: (s.match(/\r\n/g) || []).length, lf: (s.match(/(^|[^\r])\n/g) || []).length });
  const eD = ends(viaDesk), eP = ends(clip1), feeds = (first.text.match(/\n/g) || []).length;
  check(gArmed && deskClip === "ok" && viaDesk !== SENT_G && viaDesk === clip1 && feeds > 0 && eD.crlf === feeds && eD.lf === 0,
    "g the desk's own page writing the same text leaves the same bytes as the picker's, Windows' pair at every line end ("
    + (gArmed ? "sentinel read back" : "SENTINEL NOT PLACED") + ", the desk's write " + deskClip
    + (viaDesk === SENT_G ? ", the sentinel still there" : "") + "; desk " + eD.n + " chars, CRLF " + eD.crlf + ", bare LF " + eD.lf
    + "; picker " + eP.n + " chars, CRLF " + eP.crlf + ", bare LF " + eP.lf + "; " + feeds + " line feed(s) in the source; identical " + (viaDesk === clip1) + ")");

  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  await ask("keys escape");
  check(await until(async () => (await ask("fg")) === "True"), "h Escape closes the picker and the chat has the focus again");

  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  await ask("keys ctrl+shift+space");
  check(await until(async () => (await ask("fg")) === "True"), "i a second press closes it the same way");

  /* The clipboard still holds clip1 from e, so "Enter copies it again" would pass on an Enter that
     copied nothing. A sentinel goes on first, written by the chat's own program, and is read back. */
  const SENTINEL = "pick-desk sentinel " + process.pid;
  await ask("setclip " + Buffer.from(SENTINEL, "utf8").toString("base64"));
  const armed = b64(await ask("clip")) === SENTINEL;
  await ask("keys ctrl+shift+space");
  await until(async () => { pp = await pickerPage(); return !!pp && await pp.evaluate(() => document.hasFocus()); });
  const marked = await pp.evaluate(() => { const on = document.querySelector("#rows li.on"); return on ? on.querySelector(".t").textContent : ""; });
  await ask("keys enter");
  await until(async () => (await ask("fg")) === "True");
  const again = b64(await ask("clip"));
  check(armed && marked === "Lamp delivery" && again === clip1, "j the reply copied last opens marked, and Enter copies it again over a sentinel ("
    + (armed ? "sentinel read back" : "SENTINEL NOT PLACED") + ", " + (again === SENTINEL ? "the sentinel still there" : again.length + " characters after") + ")");

  const heldByForm = await ask("hold 3 6 120");
  const refused = await desk.evaluate(() => window.E_HOST.setHotkey("Control+Shift+F9"));
  await ask("free 3");
  check(heldByForm === "True" && refused && refused.ok === false && refused.why === "taken",
    "k Settings is told when Windows refuses a combination another program holds: " + JSON.stringify(refused));

  reachedEnd = true;
})().catch(e => {
  fails++;
  console.log("  FAIL " + String(e && e.message || e).split("\n")[0]);
}).finally(async () => {
  try { if (form && !form.killed) await ask("close").catch(() => {}); } catch (x) { /* gone */ }
  try { if (b) b.disconnect(); } catch (x) { /* gone */ }
  if (child) E.killTree(child.pid);
  if (form) E.killTree(form.pid);
  /* The foreground's owners, by process and seconds held, before the lab goes (read only, no window text). */
  try { fs.writeFileSync(path.join(LAB, "fg-stop"), ""); } catch (x) { /* the lab is gone */ }
  if (fgWatch) E.killTree(fgWatch.pid);
  try {
    const rows = fs.readFileSync(FG_LOG, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map(l => l.trim().split(" "));
    const held = {};
    for (const r of rows) { const k = r[3] || "?"; held[k] = held[k] || { n: 0, first: r[0], last: r[0] }; held[k].n++; held[k].last = r[0]; }
    console.log("       in front, by second: " + (Object.keys(held).map(k => k + " " + held[k].n + " s (" + held[k].first + " to "
      + held[k].last + ")").join("; ") || "nothing logged"));
  } catch (x) { console.log("       in front, by second: the log could not be read (" + String(x && x.message || x).slice(0, 80) + ")"); }
  await sleep(500);
  console.log("#counts checks=" + checks + " failed=" + fails + " expected=" + EXPECTED);
  const v = E.suiteVerdict({ checks, fails, expected: EXPECTED, reachedEnd });
  const end = deskInput.closingLines(v.lines, LAB);
  for (let i = 0; i < end.length; i++) console.log(i < v.lines.length ? "  " + end[i] : end[i]);
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* named below */ }
  process.exit(v.exit);
});
}
