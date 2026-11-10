/* The docked intent rail stands on the page's ground, with no panel of its own behind the rows.
 *
 *   node tests/rail-ground.mjs
 *
 * Headless Chrome on the built page and the fixtures' sample catalog, docked at 1600 x 1000, two
 * intents chosen. What the eye sees is read as area, in pixels, in light and in dark:
 *   1a  the rail's area outside its rows and its head, from the window's edge to where the dot
 *       field begins, is painted the header's own ground: at least 97 per cent of it.
 *   2a  each chosen row keeps the mint fill, the green name, its check and its green mark: the
 *       computed colours are the ones the panel's chosen row had, and the mint covers at least
 *       75 per cent of each row's box. Both chosen rows show, one above the other, inside the rail.
 *   3a  a theme press starts no transition anywhere in the rail, and 3b in the press's own task the
 *       rail's ground is the header's new ground, so the two change in the same frame.
 *   4a  a click on the lock's glyph raises no page error and plays the lock's turn.
 *   5a  with the cards scrolled, the column's 12px strip under the header is still its ground (at
 *       least 97 per cent), so no shadow or seam crosses it, and 5b over the cards the header's
 *       scrolled shadow still falls: the 3px strip under the header differs by at least 2 levels on
 *       average from the same photograph with the header's shadows taken out.
 * Each read has its control in the same launch: a panel painted back behind the rows (1A), the
 * chosen row greyed (2A), and the flip hold taken out (3A), each of which the read must catch.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

if (!process.env.ETIUDA_FIXTURES) process.env.ETIUDA_FIXTURES = "C:/Users/maxim/Workspace/etiuda-fixtures";
const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The chosen row as the panel drew it before the rail left its window: the mint, the green, the check. */
const CHOSEN = {
  light: { bg: "rgb(209, 250, 229)", ink: "rgb(4, 120, 87)" },
  dark: { bg: "rgb(19, 36, 25)", ink: "rgb(78, 201, 138)" },
};
const GROUND_SHARE = 0.97, MINT_SHARE = 0.75;

const RUN = E.runFolder("catalogV2", "sampleV2");
let browser = null;

async function boot(theme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(t => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eTheme", t]]) localStorage.setItem(k, v);
    } catch (e) {}
  }, theme);
  await page.goto(RUN.url, { waitUntil: "load", timeout: 60000 });
  await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/rail-ground.mjs" });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => { const h = document.getElementById("eFlipHold"); return !!(h && h.sheet && h.sheet.disabled); }, { timeout: 30000 });
  await page.waitForFunction(() => document.body.classList.contains("rail-on") && document.body.classList.contains("rail-ready")
    && getComputedStyle(document.getElementById("intentRail")).opacity === "1"
    && document.querySelectorAll("#intentRailList .rail-item[data-si]").length > 4, { timeout: 30000 });
  await page.mouse.move(1590, 990);
  return page;
}

/* Two intents chosen the way a hand chooses them: a click, then a Ctrl+click. */
async function chooseTwo(page) {
  await page.evaluate(() => document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")[1].click());
  await sleep(500);
  await page.evaluate(() => document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)")[2]
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
  await page.waitForFunction(() => document.querySelectorAll("#intentRailList .rail-item.on").length === 2, { timeout: 10000 });
  await page.mouse.move(1590, 990);
  await sleep(700);
}

/* One photograph of the window, decoded in the page; every read below is taken from it. */
async function read(page) {
  const png = await page.screenshot({ captureBeyondViewport: false, encoding: "base64" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const near = (d, i, want) => Math.abs(d[i] - want[0]) <= 2 && Math.abs(d[i + 1] - want[1]) <= 2 && Math.abs(d[i + 2] - want[2]) <= 2;
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };

    const header = document.querySelector("header"), rail = document.getElementById("intentRail");
    const groundCss = getComputedStyle(header).backgroundColor, ground = rgb(groundCss);
    /* The region: from the window's edge to two pixels short of where the dot field begins (the card column's left
       edge less the field's 12px inset), from under the header to the window's foot. */
    const x1 = Math.floor(document.querySelector("main").getBoundingClientRect().left) - 14;
    const y0 = Math.ceil(header.getBoundingClientRect().bottom), y1 = innerHeight;
    const holes = [...rail.querySelectorAll(".rail-item, .rail-head")].map(box);
    const D = g.getImageData(0, y0, x1, y1 - y0).data;
    let n = 0, hit = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < x1; x++) {
      if (holes.some(h => x >= h.l - 1 && x < h.r + 1 && y >= h.t - 1 && y < h.b + 1)) continue;
      n++;
      if (near(D, ((y - y0) * x1 + x) * 4, ground)) hit++;
    }

    const body = rail.querySelector(".rail-body").getBoundingClientRect();
    const rows = [...rail.querySelectorAll(".rail-item.on")].map(el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el), t = el.querySelector(".rail-t");
      const mint = rgb(cs.backgroundColor);
      const l = Math.ceil(r.left), tp = Math.ceil(r.top), w = Math.floor(r.right) - l, h = Math.floor(r.bottom) - tp;
      let m = 0;
      if (w > 0 && h > 0) {
        const P = g.getImageData(l, tp, w, h).data;
        for (let i = 0; i < P.length; i += 4) if (near(P, i, mint)) m++;
      }
      return {
        bg: cs.backgroundColor, ink: t ? getComputedStyle(t).color : null,
        check: t ? getComputedStyle(t, "::before").content : null, checkInk: t ? getComputedStyle(t, "::before").color : null,
        mark: getComputedStyle(el.querySelector(".cat-slot")).color, markOpacity: getComputedStyle(el.querySelector(".cat-slot")).opacity,
        mintShare: w > 0 && h > 0 ? Math.round(m / (w * h) * 1000) / 1000 : 0,
        top: r.top, bottom: r.bottom, inside: r.top >= body.top - 0.5 && r.bottom <= body.bottom + 0.5 && r.height > 20,
      };
    });
    return { groundCss, region: [x1, y1 - y0], groundShare: n ? Math.round(hit / n * 1000) / 1000 : 0, counted: n, rows };
  }, png);
}

/* The strips under the header: the column's (12px, from the window's edge to two pixels short of the dot field) as a
   share of the header's ground, and the cards' (3px, 400px wide from 16px past the column) as a mean level. */
async function strips(page) {
  const png = await page.screenshot({ captureBeyondViewport: false, encoding: "base64" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const header = document.querySelector("header");
    const ground = (getComputedStyle(header).backgroundColor.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const x1 = Math.floor(document.querySelector("main").getBoundingClientRect().left) - 14;
    const hb = Math.ceil(header.getBoundingClientRect().bottom);
    const C = g.getImageData(0, hb, x1, 12).data;
    let n = 0, hit = 0;
    for (let i = 0; i < C.length; i += 4) {
      n++;
      if (Math.abs(C[i] - ground[0]) <= 2 && Math.abs(C[i + 1] - ground[1]) <= 2 && Math.abs(C[i + 2] - ground[2]) <= 2) hit++;
    }
    const K = g.getImageData(x1 + 16, hb, 400, 3).data;
    let sum = 0;
    for (let i = 0; i < K.length; i += 4) sum += (K[i] + K[i + 1] + K[i + 2]) / 3;
    return { colShare: Math.round(hit / n * 1000) / 1000, colPx: n, cardMean: Math.round(sum / (K.length / 4) * 10) / 10 };
  }, png);
}
async function scrolledStrips(page) {
  await page.evaluate(() => { const s = document.getElementById("pageScroll"); s.scrollTop = 600; s.dispatchEvent(new Event("scroll")); });
  await page.waitForFunction(() => document.body.classList.contains("e-scrolled"), { timeout: 10000 });
  await sleep(700);
  const on = await strips(page);
  await inject(page, "header,header::after,header::before{box-shadow:none!important}");
  await sleep(100);
  const off = await strips(page);
  await uninject(page);
  await page.evaluate(() => { const s = document.getElementById("pageScroll"); s.scrollTop = 0; s.dispatchEvent(new Event("scroll")); });
  await page.waitForFunction(() => !document.body.classList.contains("e-scrolled"), { timeout: 10000 });
  await sleep(500);
  return { on, off, cardDiff: Math.round(Math.abs(on.cardMean - off.cardMean) * 10) / 10 };
}

const chosenOk = (r, theme) => r.rows.length === 2 && r.rows.every(x => x.bg === CHOSEN[theme].bg && x.ink === CHOSEN[theme].ink
  && x.checkInk === CHOSEN[theme].ink && x.mark === CHOSEN[theme].ink && x.markOpacity === "1" && /✓/.test(x.check || "")
  && x.mintShare >= MINT_SHARE && x.inside) && r.rows[1].top >= r.rows[0].bottom - 0.5;

const inject = (page, css) => page.evaluate(css => { const s = document.createElement("style"); s.id = "railPlant"; s.textContent = css; document.head.appendChild(s); }, css);
const uninject = page => page.evaluate(() => { const s = document.getElementById("railPlant"); if (s) s.remove(); });

/* Press the theme button; read both grounds in the press's own task, and count the rail's running transitions three frames on. */
const flip = (page, takeHoldOut) => page.evaluate(takeHoldOut => new Promise(res => {
  if (takeHoldOut) document.getElementById("eFlipHold").remove();
  const rail = document.getElementById("intentRail"), header = document.querySelector("header");
  const inRail = a => a instanceof CSSTransition && a.effect && a.effect.target && (a.effect.target === rail || rail.contains(a.effect.target));
  document.querySelector("#theme").click();
  const frame0 = { rail: getComputedStyle(rail).backgroundColor, header: getComputedStyle(header).backgroundColor };
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() =>
    res({ frame0, running: document.getAnimations().filter(inRail).length, theme: document.documentElement.dataset.theme }))));
}), takeHoldOut);

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha.slice(0, 12));

  const page = await boot("light");
  await chooseTwo(page);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.click("#theme");
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", { timeout: 10000 });
      await page.mouse.move(1590, 990);
      await sleep(900);
    }
    const r = await read(page);
    check(r.groundShare >= GROUND_SHARE,
      "1a " + theme + ": the rail's area outside its rows is the header's ground, no window behind them ("
      + Math.round(r.groundShare * 100) + " per cent of " + r.counted + " px, at least " + GROUND_SHARE * 100 + ")", r);
    check(chosenOk(r, theme),
      "2a " + theme + ": two chosen rows show, one above the other, each in today's mint, green name, check and green mark (mint over "
      + r.rows.map(x => Math.round(x.mintShare * 100) + "%").join(" and ") + " of the row)", r.rows);
    const sh = await scrolledStrips(page);
    check(sh.on.colShare >= GROUND_SHARE,
      "5a " + theme + ": scrolled, the column's strip under the header is still its ground, no shadow or seam across it ("
      + Math.round(sh.on.colShare * 100) + " per cent of " + sh.on.colPx + " px)", sh);
    check(sh.cardDiff >= 2,
      "5b " + theme + ": scrolled, the header's shadow still falls over the cards (" + sh.cardDiff + " levels against the same photograph without it)", sh);
    if (theme === "light") {
      await inject(page, "#intentRail,body #intentRail{background:#fff!important}");
      const c = await read(page);
      check(c.groundShare < GROUND_SHARE, "1A light control: a panel painted back behind the rows reads " + Math.round(c.groundShare * 100) + " per cent", c.groundShare);
      await uninject(page);
      await inject(page, "#intentRail .rail-item.on{background:transparent!important}#intentRail .rail-item.on .cat-slot{color:var(--dim)!important}");
      const d = await read(page);
      check(!chosenOk(d, theme), "2A light control: the chosen row greyed and without its mint is caught", d.rows);
      await uninject(page);
    }
  }

  const f = await flip(page, false);
  check(f.theme === "light" && f.running === 0, "3a a theme press starts no transition anywhere in the rail", f);
  check(f.frame0.rail === f.frame0.header, "3b in the press's own task the rail's ground is the header's new ground (" + f.frame0.rail + ")", f.frame0);

  /* The lock's glyph is what a hand clicks, and the button redraws it on the toggle. */
  const errs = [];
  page.on("pageerror", e => errs.push(String(e.message || e)));
  await sleep(300);
  await page.evaluate(() => {
    const b = document.getElementById("railPinBtn");
    window.__lockTurn = false;
    new MutationObserver(() => { if (/e-lock-(shut|open)/.test(b.className)) window.__lockTurn = true; }).observe(b, { attributes: true, attributeFilter: ["class"] });
  });
  const glyph = await page.evaluate(() => { const r = document.querySelector("#railPinBtn svg").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(glyph.x, glyph.y);
  await sleep(400);
  const lock = await page.evaluate(() => ({ turn: window.__lockTurn, locked: document.getElementById("railPinBtn").classList.contains("on") }));
  await page.mouse.click(glyph.x, glyph.y);
  await sleep(400);
  check(errs.length === 0 && lock.turn === true && lock.locked === true,
    "4a a click on the lock's glyph locks the rail, plays the lock's turn and raises no page error", { lock, errs });
  await page.close();

  const sight = await boot("light");
  await chooseTwo(sight);
  const s = await flip(sight, true);
  check(s.running > 0, "3A control: the same press with the hold sheet taken out starts " + s.running + " transitions in the rail", s);
  await sight.close();
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e));
} finally {
  if (browser) await browser.close();
  try { RUN.drop(); } catch (e) {}
}
console.log(`#counts checks=${checks} skipped=0 failed=${fails} expected=14`);
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
