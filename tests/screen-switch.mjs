/* LEAVING A SCREEN TAB COSTS WHAT A CONVERSATION SWITCH COSTS. Chrome, headless, no fixtures, no window.
 *
 *   node tests/screen-switch.mjs [--engine <file>]
 *
 * The case is Max's (2026-11-09 20:26): "there is strange delay when I switch from the Settings/Library/Maintenance
 * to the regular content tab. There's no such delay when I switch between content tabs, or when I switch from the
 * content tab to the Settings/Library/Maintenance tab." The delay was the page restyling every card inside the press:
 * a screen hid the stage with display:none, which drops every card's style, and the rail's vars, rewritten on the root
 * as the pill bar left and came back, restyled the whole document twice more.
 *
 * WHAT IS MEASURED. Each switch is a real click on a tab in the strip, traced. Two numbers per switch:
 *   restyled   the elements the page restyled from the press until the next frame, summed over the trace's
 *              UpdateLayoutTree events: the work that made the delay, counted rather than timed, so it does not
 *              move with the machine
 *   to paint   the click's own Event Timing duration, from the press to the next painted frame, as the hand feels it;
 *              printed beside the verdict and not part of it, since a loaded machine moves it (the chain-split rule)
 * A switch from a screen to a conversation is held to the switch between two conversations in the same page:
 *   ss1..ss3  Settings, Maintenance and the Library, each to a conversation: restyled at most 1.5 times what the
 *             conversation switch restyles
 *   ss4       THE CONTROL, in the same page: the stage put back to display:none under a screen by a sheet added
 *             here, Settings to a conversation then restyles more than 1.5 times the conversation switch, so the
 *             measure sees the fault it guards
 * The conversation switch and each screen switch are medians of five presses. The catalog is the shipped sample.
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

let fails = 0, checks = 0;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 4, REPS = 5, RESTYLE_RATIO = 1.5;
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-screen-switch-"));
fs.copyFileSync(ENGINE, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };

let browser = null, done = false;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
    args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument(() => {
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked"]) localStorage.setItem(k, "1"); } catch (e) {}
    window.__ev = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ev.push({ n: e.name, d: e.duration }); })
      .observe({ type: "event", durationThreshold: 16, buffered: true });
  });
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(1200);
  /* The first conversation shows every card and the second one category, so the switch between them redraws the list. */
  await p.click(".tab-add"); await sleep(400);
  const convs = () => p.$$("#tabsBar .tab:not(.screen) .tab-label");
  await (await convs())[1].click(); await sleep(400);
  { const pills = await p.$$("#pills .pill[data-k]"); if (pills[0]) { await pills[0].click(); await sleep(500); } }
  await (await convs())[0].click(); await sleep(400);
  await p.evaluate(() => { window.openScreenTab("settings"); window.openScreenTab("maintenance"); window.openManage(); });
  await sleep(800);
  const sids = await p.evaluate(() => Array.from(document.querySelectorAll("#tabsBar .tab.screen")).map(e => e.dataset.sid));
  const cards = await p.evaluate(() => document.querySelectorAll("#list .card").length);
  console.log("       " + cards + " cards; screens in the strip: " + sids.join(", "));

  const traced = async act => {
    await p.evaluate(() => { window.__ev = []; });
    await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] });
    await act();
    await sleep(500);
    const buf = await p.tracing.stop();
    const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents || [];
    let restyled = 0;
    for (const e of ev) if (e.name === "UpdateLayoutTree" && e.args && typeof e.args.elementCount === "number") restyled += e.args.elementCount;
    const d = await p.evaluate(() => window.__ev.filter(e => /pointer|click|mouse/.test(e.n)).reduce((m, e) => Math.max(m, e.d), 0));
    return { restyled, paint: d };
  };
  const series = async (prep, act) => {
    const rows = [];
    for (let r = 0; r < REPS; r++) { await prep(); await sleep(500); rows.push(await traced(act)); }
    return { restyled: median(rows.map(r => r.restyled)), paint: median(rows.map(r => r.paint)),
      all: rows.map(r => r.restyled + "/" + r.paint).join(" ") };
  };
  const clickScreen = async sid => (await p.$('#tabsBar .tab.screen[data-sid="' + sid + '"] .tab-label')).click();
  const conv = await series(async () => (await convs())[1].click(), async () => (await convs())[0].click());
  console.log("       conversation to conversation: " + conv.restyled + " elements restyled, " + conv.paint
    + " ms to paint (restyled/ms per press: " + conv.all + ")");
  if (!(conv.restyled > 0)) throw new Error("the conversation switch restyled nothing the trace could count, so no ratio can be read");
  const NAMES = { settings: "Settings", maintenance: "Maintenance", library: "the Library" };
  let n = 0;
  for (const sid of ["settings", "maintenance", "library"]) {
    n++;
    if (!sids.includes(sid)) { check(false, "ss" + n + " " + NAMES[sid] + " was not in the strip to switch from"); continue; }
    const s = await series(async () => clickScreen(sid), async () => (await convs())[0].click());
    check(s.restyled <= conv.restyled * RESTYLE_RATIO,
      "ss" + n + " " + NAMES[sid] + " to a conversation: " + s.restyled + " elements restyled against " + conv.restyled
      + " (at most " + RESTYLE_RATIO + " times); " + s.paint + " ms to paint against " + conv.paint
      + "; per press " + s.all);
  }
  /* The control: the stage undisplayed under a screen, as it was. */
  await p.addStyleTag({ content: "body.screen-on .stage{display:none!important}" });
  await sleep(300);
  const ctl = await series(async () => clickScreen("settings"), async () => (await convs())[0].click());
  check(ctl.restyled > conv.restyled * RESTYLE_RATIO,
    "ss4 THE CONTROL: with the stage undisplayed under a screen, Settings to a conversation restyles " + ctl.restyled
    + " elements against " + conv.restyled + ", more than " + RESTYLE_RATIO + " times, so ss1 to ss3 see the fault"
    + "; per press " + ctl.all);
  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String(e && e.message || e));
  fails++;
} finally {
  if (browser) await browser.close();
  E.removeLab(lab);
}
if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
console.log((fails ? "FAIL " : "PASS ") + "screen-switch: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
