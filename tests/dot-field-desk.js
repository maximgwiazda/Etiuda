/* The dot field in the desk's own window: where it stands, and that it stands still, driven in the shell.
 *
 *   node tests/dot-field-desk.js
 *
 * WHY THE SHELL AND NOT A BROWSER. A background-attachment: fixed field held still in headless Chrome and
 * rode the cards in the desk (Maxim, 2026-10-03: "I see that the dotted background is no longer static. It
 * scrolls along with cards."), and the browser legs of tests/smoke.js cannot see what a window does. This
 * starts the real shell unpackaged on a throwaway app, with the tree's own sample catalog loaded through
 * the offer, so the list is the one a person scrolls. Its user-data and catalog folders are its own.
 *
 * THE WINDOW IS SHOWN WITHOUT FOCUS AND STANDS ON NO DISPLAY (ETIUDA_TEST_OFFSCREEN=2). The first value of
 * the flag never shows it, and a window nobody showed cannot be photographed. Check 9df1 reads the machine, not
 * the variable, for it being on no display.
 *
 * WHAT IS MEASURED IS WHAT THE EYE SEES, in pixels. Stillness: the screencast's frames, the compositor's own
 * output, are taken through a real wheel scroll, and in each the rows of a strip in the gap between two card
 * columns are summed; a field that stands still gives the same rows in every frame, one that rides the cards
 * gives different rows in the frames between. Extent: strips of the window outside the cards' column are
 * photographed with the field on and again with it off, and a strip that holds dots differs from its twin.
 *
 * EVERY LEG HAS A CONTROL IN THE SAME LAUNCH. The stillness read is run again with the field cleared and the
 * same gradient painted on main, which scrolls with the cards, and that must give different rows. The extent
 * read has a patch inside the column, which must hold dots, or a leg that sees none passes every strip.
 *
 * ONE THING THIS CANNOT SHOW, measured 2026-10-03 and said here so a green is not over-read: with the old
 * field (background-attachment: fixed on main) this window stands still too, in 145 frames of a wheel
 * scroll and in a PrintWindow capture, so the desk's failure needs something this off-display window does
 * not have. The stillness legs prove the layer stands still here; they did not go red on the old field.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict.
 * The app is killed in a finally, by pid with its tree, and the lab's removal is a check. */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.platform !== "win32") E.refuse("tests/dot-field-desk.js reads the window's own pixels and where it stands, so it runs on Windows only");
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");
const PORT = E.portBlock("dot-field-desk");
/* After the port block, so a refused shift is refused whatever else is live (engine-selftest 27h). */
E.refuseWhileElectronLive("tests/dot-field-desk.js");
const LEASED = E.takeLeases(["ports:" + PORT], 10, "tests/dot-field-desk.js");
console.log("       debugging port " + PORT + "; leases: " + LEASED.said);

const EXPECTED = 7;
let child; let fails = 0; let checks = 0; let reachedEnd = false;
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const APP = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-dot-field-"));

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* The shell as committed, the artefact and its pin, and the tree's own sample catalog in the user-data
   folder, which the shell offers at boot. The tour and the name prompt are past, as on a desk in use. */
function buildApp() {
  for (const d of ["shell", "engine", "userdata", "documents"]) fs.mkdirSync(path.join(APP, d), { recursive: true });
  for (const f of ["main.js", "preload.js"]) fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(APP, "shell", f));
  fs.writeFileSync(path.join(APP, "package.json"),
    JSON.stringify({ name: "etiuda-dot-field-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  for (const f of ["etiuda.html", "etiuda.csp.json"])
    fs.copyFileSync(path.join(E.ROOT, "engine", f), path.join(APP, "engine", f));
  const UD = path.join(APP, "userdata");
  fs.writeFileSync(path.join(UD, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, app: "harness",
    saved: new Date().toISOString(), keys: { eTourDone_v3: "1", eTourInvite_v3: "1", eNameAsked: "1", eAgent: "Probe" } }), "utf8");
  E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
  fs.copyFileSync(E.fixtures("sampleEc").sampleEc, path.join(UD, "etiuda-catalog.ec"));
  return UD;
}

/* The rows of a strip in one frame: the sum of its pixels, row by row. Asked for a few frames at a time, because
   a page asked to decode a hundred full-window PNGs at once dies. */
const ROWS_OF = async (d, strip) => {
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + d; });
  const k = img.width / innerWidth;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const xa = Math.round(strip.x0 * k), xb = Math.round(strip.x1 * k), ya = Math.round(strip.y0 * k), yb = Math.round(strip.y1 * k);
  const px = g.getImageData(xa, ya, xb - xa, yb - ya).data;
  const rows = [];
  for (let y = 0; y < yb - ya; y++) { let s = 0; for (let x = 0; x < xb - xa; x++) { const o = (y * (xb - xa) + x) * 4; s += px[o] + px[o + 1] + px[o + 2]; } rows.push(s); }
  return rows;
};

(async () => {
  const UD = buildApp();
  child = E.shellLaunch("tests/dot-field-desk.js", electronExe(),
    [APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"],
      env: E.offscreenEnv({ ETIUDA_TEST_DOCUMENTS: path.join(APP, "documents"), [E.OFFSCREEN_KEY]: "2" }) });
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
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
  await p.waitForSelector("#ecYes", { timeout: 15000 });
  await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0, { timeout: 15000 });
  await sleep(2000);

  const facts = E.windowFacts(child.pid);
  check(facts.measured === true && facts.windows >= 1 && facts.windowsOnDisplay === 0,
    "9df1 the window of this run stands on no display: " + facts.windows + " visible top-level window(s) for pid " + child.pid
    + ", " + facts.windowsOnDisplay + " of them on a display" + (facts.measured ? "" : " - NOT MEASURED: " + facts.why));

  const seen = await p.evaluate(() => {
    const sc = document.getElementById("pageScroll"), css = el => getComputedStyle(el).backgroundImage;
    const carriers = [document.querySelector("#dotField > div"), sc, document.querySelector("main")]
      .filter(el => el && css(el).indexOf("radial-gradient") > -1);
    if (carriers.length) carriers[0].setAttribute("data-field-carrier", "1");
    return { cards: document.querySelectorAll("#list .card").length, host: document.body.classList.contains("e-host"),
      backdrop: document.body.classList.contains("e-backdrop"), docked: document.body.classList.contains("rail-on"),
      carriers: carriers.length, scrolls: carriers.some(el => sc.contains(el)),
      w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  });
  check(seen.cards > 0 && seen.host && seen.backdrop && seen.docked && seen.carriers === 1 && !seen.scrolls,
    "9df2 the desk is read as a person has it: " + seen.cards + " cards, the host's own window (e-host " + seen.host
    + ", e-backdrop " + seen.backdrop + "), the intent panel docked " + seen.docked + ", " + seen.w + "x" + seen.h
    + " at ratio " + seen.dpr + "; the field is carried by " + seen.carriers + " element(s) of the dot layer, the scroller"
    + " and main, and " + (seen.scrolls ? "one of them is part of what scrolls" : "none of them is part of what scrolls"));

  /* ---- stillness, through a real wheel scroll ---- */
  const gap = await p.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#list .card")).map(c => c.getBoundingClientRect());
    const a = cards[0], n = cards.find(r => r.left > a.right + 4), sc = document.getElementById("pageScroll").getBoundingClientRect();
    return n ? { x0: a.right + 6, x1: n.left - 6, y0: sc.top + 40, y1: sc.bottom - 20, mx: (a.left + a.right) / 2 } : null;
  });
  /* The decoder runs in the page, so it is handed over as source. */
  await p.evaluate(src => { window.__rowsOf = (0, eval)(src); }, ROWS_OF.toString());
  const read = async () => {
    const cdp = await p.createCDPSession();
    const frames = [];
    cdp.on("Page.screencastFrame", async f => { frames.push(f.data); try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch (x) {} });
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await sleep(700);
    const ref = Math.max(frames.length - 1, 0);
    await p.mouse.move(gap.mx, (gap.y0 + gap.y1) / 2);
    for (let i = 0; i < 12; i++) { await p.mouse.wheel({ deltaY: 80 }); await sleep(40); }
    await sleep(900);
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
    const scrolled = await p.evaluate(() => document.getElementById("pageScroll").scrollTop);
    const rows = [];
    for (let i = ref; i < frames.length; i += 10)
      rows.push(...await p.evaluate((part, box) => Promise.all(part.map(d => window.__rowsOf(d, box))), frames.slice(i, i + 10), gap));
    const first = rows[0] || [];
    let differing = 0;
    for (const r of rows.slice(1)) if (r.length !== first.length || r.some((v, y) => v !== first[y])) differing++;
    return { frames: rows.length - 1, differing: differing, scrolled: Math.round(scrolled), strip: first.length };
  };
  const top = () => p.evaluate(() => { document.getElementById("pageScroll").scrollTop = 0; });
  const still = gap ? await read() : null;
  check(!!gap && still.scrolled >= 500 && still.frames >= 10 && still.strip >= 12 && still.differing === 0,
    "9df3 the field stands still while the cards scroll under a real wheel: " + (gap
      ? still.frames + " frame(s) of the compositor's output through a scroll of " + still.scrolled + " px, "
        + still.differing + " of them differing from the first in the " + still.strip + " rows of the gap between two card columns"
      : "NO GAP BETWEEN TWO CARD COLUMNS to read"));

  await top(); await sleep(500);
  await p.evaluate(() => {
    const c = document.querySelector("[data-field-carrier]"), was = c ? getComputedStyle(c).backgroundImage : "none";
    const s = document.createElement("style"); s.id = "__ride";
    s.textContent = "[data-field-carrier]{background-image:none!important}#list{background-image:" + was + "!important;background-size:12px 12px!important;background-attachment:scroll!important}";
    document.head.appendChild(s);
  });
  await sleep(400);
  const rides = gap ? await read() : null;
  await p.evaluate(() => { const s = document.getElementById("__ride"); if (s) s.remove(); });
  await top(); await sleep(500);
  check(!!gap && rides.scrolled >= 500 && rides.differing > 0,
    "9df4 CONTROL: the same field painted on the list, where it scrolls with the cards, is seen riding: "
    + (gap ? rides.differing + " of " + rides.frames + " frame(s) differ from the first, through a scroll of "
      + rides.scrolled + " px" : "no gap to read") + ", so check 3 reads a leg that can see a field move");

  /* ---- extent: strips of the window outside the cards' column ---- */
  await p.evaluate(() => { const s = document.createElement("style"); s.id = "__extentHide";
    s.textContent = "#list > *{visibility:hidden!important}"; document.head.appendChild(s); });
  const railNow = () => p.evaluate(() => document.body.classList.contains("rail-on"));
  const railWas = await railNow();
  const states = [];
  for (const rail of [true, false]) {
    if ((await railNow()) !== rail) { await p.evaluate(() => document.querySelector('[data-act="rail"]').click()); await sleep(900); }
    for (const backdrop of [true, false]) {
      await p.evaluate(on => document.body.classList.toggle("e-backdrop", on), backdrop); await sleep(300);
      const at = await p.evaluate(() => {
        const sc = document.getElementById("pageScroll").getBoundingClientRect(), m = document.querySelector("main").getBoundingClientRect(),
          w = innerWidth, y = Math.round(sc.top + sc.height / 2), clip = (x, yy, wd, ht) => ({ x: x, y: yy, width: wd, height: ht });
        return { inside: clip(Math.round(m.left + 40), y, 48, 48),
          left: clip(0, y, Math.min(Math.floor(m.left), 600), 48),
          right: clip(Math.ceil(m.right), y, Math.floor(w - m.right), 48),
          above: clip(Math.round(m.left + 40), Math.ceil(sc.top), 48, Math.floor(m.top - sc.top)),
          below: clip(Math.round(m.left + 40), Math.floor(sc.bottom) - 14, 48, 14) };
      });
      const names = Object.keys(at);
      const shoot = async () => { const o = {};
        for (const n of names) o[n] = at[n].width >= 12 && at[n].height >= 12
          ? await p.screenshot({ clip: at[n], captureBeyondViewport: false, encoding: "base64" }) : null;
        return o; };
      const on = await shoot();
      await p.evaluate(() => { const s = document.createElement("style"); s.id = "__extentOff";
        s.textContent = "#dotField,#dotField *,#pageScroll,main,.stage{background-image:none!important}"; document.head.appendChild(s); });
      await sleep(200);
      const off = await shoot();
      await p.evaluate(() => { const s = document.getElementById("__extentOff"); if (s) s.remove(); });
      await sleep(200);
      states.push({ rail: rail, backdrop: backdrop, small: names.filter(n => on[n] === null),
        holds: names.filter(n => on[n] !== null && on[n] !== off[n]) });
    }
    await p.evaluate(() => document.body.classList.add("e-backdrop"));
  }
  await p.evaluate(() => { document.body.classList.add("e-backdrop"); const s = document.getElementById("__extentHide"); if (s) s.remove(); });
  if ((await railNow()) !== railWas) await p.evaluate(() => document.querySelector('[data-act="rail"]').click());
  const said = states.map(s => "panel " + (s.rail ? "docked" : "hidden") + (s.backdrop ? "" : ", no backdrop") + ": dots in ["
    + s.holds.join(",") + "]" + (s.small.length ? ", too small to read [" + s.small.join(",") + "]" : "")).join("; ");
  check(states.length === 4 && states.every(s => s.small.length === 0 && s.holds.every(n => n === "inside")),
    "9df5 the field stands behind the cards only, and not in the padding on either side, above the list, beside a docked"
    + " intent panel, in the scrollbar's lane or at the window's bottom edge: " + said);
  check(states.length === 4 && states.every(s => s.holds.indexOf("inside") > -1),
    "9df6 CONTROL: a 48x48 patch inside the cards' column holds dots in all four states, so check 5 read strips with a leg that can see one");
  reachedEnd = true;
  try { b.disconnect(); } catch (x) {}
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  E.killTree(child && child.pid);
  try { if (child) child.kill(); } catch (x) {}
  check(E.removeLab(APP), "9df7 the throwaway app is gone from the temp folder: " + APP);
  console.log("#counts checks=" + checks + " failed=" + fails + " expected=" + EXPECTED);
  const v = E.suiteVerdict({ checks, fails, expected: EXPECTED, reachedEnd });
  v.lines.forEach(l => console.log("  " + l));
  process.exit(v.exit);
});
