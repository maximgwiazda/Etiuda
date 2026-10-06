/* A web address leaves the desk only for a click on it: the shell's hand-off, driven in the shell.
 *
 *   node tests/links.js
 *
 * THE CLAIM. An http(s) address reaches the default browser only when the agent clicked the link
 * that names it. A navigation, a window.open or a synthetic click the page makes by script never
 * does, and neither does a click the page turns towards another address. The mechanism is in
 * shell/preload.js and at linkClicked in shell/main.js.
 *
 * THE BOUNDARY IS OBSERVED, NEVER THE BROWSER. The throwaway app's copy of shell/main.js has its
 * one call of shell.openExternal replaced by a line on stdout, "etiuda-test: handed <url>", so no
 * leg can open this machine's browser. The run refuses unless the two shell files hold exactly one
 * such call between them: a second route out would be a route this file cannot see. A refusal is
 * the shell's own line, "stays closed", so a leg waits for one of the two lines rather than for a
 * clock, and a leg that hears neither says so.
 *
 * THE LEGS, in one launch on a throwaway app whose user-data and catalog folders are its own:
 *   a  window.open by script                         nothing handed
 *   b  a location change by script                   nothing handed
 *   c  a synthetic click by script on a link         nothing handed
 *   d  a real click on a link                        handed, exactly that address
 *   e  the same address by script straight after d  nothing handed: a click is spent once
 *   f  a real click on a target=_blank link          handed, by the window-open route
 *   g  Enter on a focused link                       handed
 *   h  a middle click on a link                      handed
 *   i  a real click the page diverts to another      nothing handed
 *   j  i's own address by script after the window    nothing handed: a click goes stale
 *   k  a real click on About's maker link, English   handed, the company's address
 *   l  the same, in Polish                           handed, the company's address
 * Real input is the protocol's Input domain, which the page receives as trusted events.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no
 * verdict. The app is killed in a finally, by pid with its tree, and the lab's removal is a check.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");
const PORT = E.portBlock("links");
E.windowWall("tests/links.js");
/* After the port block, so a refused shift is refused whatever else is live (engine-selftest 27h). */
E.refuseWhileElectronLive("tests/links.js");
const LEASED = E.takeLeases(["ports:" + PORT], 10, "tests/links.js");
console.log("       debugging port " + PORT + "; leases: " + LEASED.said);

let child; let fails = 0; let checks = 0; let reachedEnd = false;
const t0 = Date.now();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

const HANDED = "etiuda-test: handed ";
const OUT = /\bopenExternal\b/g;
const APP = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-links-"));
let outCalls = -1;
function buildApp() {
  for (const d of ["shell", "engine", "userdata", "documents"]) fs.mkdirSync(path.join(APP, d), { recursive: true });
  const main = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
  const pre = fs.readFileSync(path.join(E.ROOT, "shell", "preload.js"), "utf8");
  const lab = main.split("shell.openExternal(")
    .join("((u) => console.log(" + JSON.stringify(HANDED) + " + JSON.stringify(String(u))))(");
  /* The lab is counted too: a call spelt any other way survives the stub, and must stop the run
     before a click reaches the real browser. */
  outCalls = (main.match(OUT) || []).length + (pre.match(OUT) || []).length + (lab.match(OUT) || []).length;
  fs.writeFileSync(path.join(APP, "shell", "main.js"), lab, "utf8");
  fs.writeFileSync(path.join(APP, "shell", "preload.js"), pre, "utf8");
  fs.writeFileSync(path.join(APP, "package.json"),
    JSON.stringify({ name: "etiuda-links-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  for (const f of ["etiuda.html", "etiuda.csp.json"])
    fs.copyFileSync(path.join(E.ROOT, "engine", f), path.join(APP, "engine", f));
  /* The first run's tour and bubbles would sit over the links; a desk that has seen them does not. */
  const UD = path.join(APP, "userdata");
  fs.writeFileSync(path.join(UD, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "harness",
    saved: new Date().toISOString(), keys: { eTourDone_v3: "1", eTourInvite_v3: "1", eNameAsked: "1", eAgent: "Probe" } }), "utf8");
  E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
  return UD;
}

(async () => {
  const UD = buildApp();
  check(outCalls === 1, "the shell holds exactly one call of openExternal, so the stub in the lab is the only way out: " + outCalls);
  if (outCalls !== 1) return;
  const LINK_MS = +((/const LINK_CLICK_MS = (\d+);/.exec(fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8")) || [])[1] || 2000);

  child = E.shellLaunch("tests/links.js", electronExe(),
    [APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: path.join(APP, "documents") }) });
  const said = [];
  const hear = d => String(d).split(/\r?\n/).forEach(l => { if (l.trim()) said.push(l.trim()); });
  child.stdout.on("data", hear);
  child.stderr.on("data", hear);
  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  const p = (await b.pages())[0];
  const t = E.lowerTree(child.pid);
  console.log("       the window: " + (t.asked ? t.below + " of " + t.n + " Electron process(es) at below-normal priority" : "priority not lowered"));
  await p.waitForFunction(() => typeof window.E_VERSION === "string" && !!document.body, { timeout: 20000 });
  await sleep(1500);

  const U = k => "https://links.invalid/" + k;
  /* The links the legs press, fixed over everything at the page's top left, one per leg. */
  await p.evaluate((addrs) => {
    const box = document.createElement("div");
    box.id = "linksProbe";
    box.style.cssText = "position:fixed;left:24px;top:96px;z-index:2147483647;display:flex;flex-direction:column;gap:6px";
    for (const [id, href, blank] of addrs) {
      const a = document.createElement("a");
      a.id = id; a.href = href; a.textContent = id;
      if (blank) a.target = "_blank";
      a.style.cssText = "display:block;width:180px;height:28px;background:#fff;color:#000";
      box.appendChild(a);
    }
    document.body.appendChild(box);
    /* The page's own script turning a click towards another address, and holding one back. */
    document.getElementById("lkI").addEventListener("click", e => { e.preventDefault(); window.open("https://links.invalid/i-elsewhere"); });
  }, [["lkC", U("c-synthetic")], ["lkD", U("d-click")], ["lkF", U("f-blank"), true], ["lkG", U("g-enter")],
      ["lkH", U("h-middle")], ["lkI", U("i-diverted")]]);

  /* One act, then the first of the shell's two lines, then a moment for any second line. */
  const act = async (fn) => {
    const from = said.length;
    const at = Date.now();
    await fn();
    for (let i = 0; i < 60; i++) {
      if (said.slice(from).some(l => l.indexOf(HANDED) === 0 || /stays closed/.test(l))) break;
      await sleep(50);
    }
    await sleep(300);
    const lines = said.slice(from);
    return { handed: lines.filter(l => l.indexOf(HANDED) === 0).map(l => JSON.parse(l.slice(HANDED.length))),
             refused: lines.filter(l => /stays closed/.test(l)).length, ms: Date.now() - at };
  };
  const centre = async (id) => p.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: hit ? (hit.id || hit.localName) : null };
  }, id);
  const click = (id, button) => async () => {
    const c = await centre(id);
    if (c.hit !== id) throw new Error(id + " is not what a click at its centre lands on: " + c.hit);
    await p.mouse.click(c.x, c.y, button ? { button } : {});
  };
  const say = r => "handed " + JSON.stringify(r.handed) + ", refused " + r.refused + ", " + r.ms + " ms";
  const none = r => r.handed.length === 0;

  let r = await act(() => p.evaluate(u => { window.open(u); }, U("a-open")));
  check(none(r) && r.refused === 1, "a  window.open by script hands nothing to the browser: " + say(r));
  r = await act(() => p.evaluate(u => { location.href = u; }, U("b-location")));
  check(none(r) && r.refused === 1, "b  a location change by script hands nothing: " + say(r));
  r = await act(() => p.evaluate(() => { document.getElementById("lkC").click(); }));
  check(none(r) && r.refused === 1, "c  a synthetic click by script on a link hands nothing: " + say(r));
  r = await act(click("lkD"));
  check(r.handed.length === 1 && r.handed[0] === U("d-click"), "d  a real click on a link hands exactly its address: " + say(r));
  r = await act(() => p.evaluate(u => { window.open(u); }, U("d-click")));
  check(none(r) && r.refused === 1, "e  the same address opened by script straight after hands nothing, a click is spent once: " + say(r));
  r = await act(click("lkF"));
  check(r.handed.length === 1 && r.handed[0] === U("f-blank"), "f  a real click on a target=_blank link hands its address: " + say(r));
  r = await act(async () => { await p.evaluate(() => document.getElementById("lkG").focus()); await p.keyboard.press("Enter"); });
  check(r.handed.length === 1 && r.handed[0] === U("g-enter"), "g  Enter on a focused link hands its address: " + say(r));
  r = await act(click("lkH", "middle"));
  check(r.handed.length === 1 && r.handed[0] === U("h-middle"), "h  a middle click on a link hands its address: " + say(r));
  const clickedI = Date.now();
  r = await act(click("lkI"));
  check(none(r) && r.refused === 1, "i  a real click the page diverts to another address hands nothing: " + say(r));
  await sleep(Math.max(0, LINK_MS + 500 - (Date.now() - clickedI)));
  r = await act(() => p.evaluate(u => { window.open(u); }, U("i-diverted")));
  check(none(r) && r.refused === 1, "j  the clicked address opened by script " + (LINK_MS + 500) + " ms after the click hands nothing: " + say(r));

  /* The product's own link, not a probe's: About's maker line, pressed in each language. The probes
     are hidden so that nothing sits over the dialog; the address is as the page normalises it. */
  await p.evaluate(() => { document.getElementById("linksProbe").style.display = "none"; });
  for (const [leg, lang] of [["k", "en"], ["l", "pl"]]) {
    await p.evaluate(async (l) => {
      setUiLang(l); await new Promise(r => setTimeout(r, 400));
      openAbout(); await new Promise(r => setTimeout(r, 400));
      const a = document.querySelector(".about-modal .about-credit a");
      if (a) a.id = "lkAbout";
    }, lang);
    const made = await p.evaluate(() => { const a = document.getElementById("lkAbout");
      return a ? { href: a.href, target: a.target, rel: a.rel } : null; });
    if (!made) { check(false, leg + "  About's maker line in " + lang + " holds no link to press"); await p.evaluate(() => dismissModal()); continue; }
    r = await act(click("lkAbout"));
    check(made.target === "_blank" && r.handed.length === 1 && r.handed[0] === "https://stardustengineering.dev/",
      leg + "  a real click on About's Stardust link in " + lang + " hands the company's address: " + JSON.stringify(made) + ", " + say(r));
    await p.evaluate(() => { const a = document.getElementById("lkAbout"); if (a) a.removeAttribute("id"); dismissModal(); });
    await sleep(300);
  }
  await p.evaluate(() => { setUiLang("en"); });

  const still = await p.evaluate(() => /\/engine\/etiuda\.html/.test(location.href) && !!document.getElementById("linksProbe"));
  check(still, "and the window still holds the engine: no leg navigated it away");
  reachedEnd = true;
  try { b.disconnect(); } catch (x) {}
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  E.killTree(child && child.pid);
  try { if (child) child.kill(); } catch (x) {}
  check(E.removeLab(APP), "the throwaway app is gone from the temp folder: " + APP);
  console.log("#counts checks=" + checks + " failed=" + fails);
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails + " failed, "
    + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(fails ? E.exitOf(fails) : (reachedEnd ? 0 : E.NO_VERDICT));
});
