/* THE DESK'S DOOR AS THE PAGE LAYS IT OUT (piece B-3b, the designer's seven points that are pixels).
 * Chrome, headless, no window, no fixtures beyond the shipped sample catalog.
 *
 *   node tests/desk-door-css.mjs        exit code is the number of failed checks, capped at 63
 *
 * tests/desk-door-words.mjs holds the door's words and markup from node alone, and the template's CSS as text. Text is not what
 * the eye sees: the band once measured 18px under a 30px rule because a flex child shrank to its words, and a rule that is in
 * the file can still lose the cascade. This leg draws the door's real markup, the string signin.js returns for each state, into
 * the built engine page and reads computed style and boxes in the page's own layout.
 *
 *   dc1 the band is 30px high, in English and in Polish, its words on one line
 *   dc2 the way on is filled accent with white words at rest and under the pointer, on the full-screen door and in the
 *       panel's state 4
 *   dc3 the way on, focused from the keyboard, is still filled, and the page's own 2px outline is drawn round it
 *   dc4 the way out stands 22px under the quiet presses, over a 1px rule with 18px of padding
 *   dc5 the offline box is a row: an 18px crossed-signal glyph at 70% opacity beside its words
 *   dc6 state 4's panel is two rows: Check now and Buy side by side 8px apart, inside the panel, Account settings
 *       under them; in English and in Polish
 *
 * EVERY CHECK IS SHOWN RED (dcp1 to dcp7): the rule it holds is put in another form in a scratch copy of the built page, the
 * check is read again there, and nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

process.removeAllListeners("warning");
process.on("warning", () => {});

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD_DIR = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const CHECKS = 7, PLANTS = 7;
const EXPECTED = CHECKS + (PLANTS_OFF ? 0 : PLANTS);

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let asserted = 0, failed = 0;
function check(ok, what, detail) {
  asserted++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) failed++;
}
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- The door's markup, from signin.js itself, for invented people and dates. ---- */
const storage = await import(MOD_DIR + "storage.js");
const P = await import(MOD_DIR + "signin.js");
const TJ = await import(MOD_DIR + "team-join.js");
const { hooks } = await import(MOD_DIR + "hooks.js");

const CODE = "M2HXC7RK9BTE5VQD";
const LEAD = "Jan Kowalski";
const T_NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const T_ENDED = Date.UTC(2026, 10, 17, 12, 0, 0);
const T_DESK_END = Date.UTC(2026, 11, 1, 12, 0, 0);
const T_UNTIL = Date.UTC(2026, 11, 17, 12, 0, 0);
const T_ENDS = Date.UTC(2027, 10, 17, 12, 0, 0);
const BOTH = ["microsoft", "google"];
const VIEWS = {
  firstOffline: { offered: BOTH, signedIn: "", online: false, registered: true },
  trialOver: { offered: BOTH, signedIn: "microsoft", code: CODE, works: false, now: T_NOW, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  waiting: { offered: BOTH, signedIn: "microsoft", code: CODE, works: false, askLead: true, now: T_NOW, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  ended: { offered: BOTH, signedIn: "microsoft", code: CODE, works: true, now: T_NOW, ended: T_ENDED, until: T_UNTIL, holding: { on: "team", ends: T_ENDS, lead: LEAD } },
};

function withHost(view, lang, fn) {
  storage.lsSet("eUiLang", lang);
  storage.lsSet("eAgent", "Ada Lis");
  globalThis.window = { E_HOST: { signinState: () => view, buyState: () => ({ offer: true }), storeState: () => ({ shown: false }) } };
  if (typeof hooks.render !== "function") hooks.render = () => {};
  TJ.joinTook({ leads: [{ team: "Mirabelka", lead: LEAD, removed: false }] });
  try { return fn(P.signinRead(view)); }
  finally {
    try { TJ.joinTook({ leads: [] }); } catch (e) { /* the team is already clear */ }
    delete globalThis.window;
    storage.lsDel("eAgent");
    storage.lsSet("eUiLang", "en");
  }
}
const doorOf = (view, lang) => withHost(view, lang, v => P.firstSigninHtml(v));
const panelOf = (view, lang) => withHost(view, lang, v => { const d = P.signinDoor(v); return { moment: d.moment, html: P.signinPanelHtml(d) }; });
const bandOf = (view, lang) => withHost(view, lang, v => P.doorBandState(v).text);

const FIX = {
  offline: doorOf(VIEWS.firstOffline, "en"),
  trialOver: doorOf(VIEWS.trialOver, "en"),
  waiting: doorOf(VIEWS.waiting, "en"),
  panel: { en: panelOf(VIEWS.ended, "en"), pl: panelOf(VIEWS.ended, "pl") },
  band: { en: bandOf(VIEWS.ended, "en"), pl: bandOf(VIEWS.ended, "pl") },
};

/* ---- The page, booted as tests/desk-982-css.mjs boots it. ---- */
function lab(enginePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-door-css-"));
  fs.copyFileSync(enginePath, path.join(dir, "etiuda.html"));
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"),
    "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
  return dir;
}
let browser = null;
async function boot(dir) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eFirstSigninSeen", "1"], ["eAgent", "Bench Agent"],
        ["eNameAsked", "1"], ["eTheme", "light"], ["eRail", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
  });
  await seatPage(page);
  await page.goto("file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/"), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  return page;
}

/* Everything this leg reads, from one page. Each field is one check's measure. */
async function measure(page) {
  const out = {};
  const accent = await page.evaluate(() => {
    const p = document.createElement("i"); p.style.background = "var(--accent)"; document.body.appendChild(p);
    const c = getComputedStyle(p).backgroundColor; p.remove(); return c;
  });
  out.accent = accent;

  /* The band, in each language. */
  out.band = [];
  for (const lang of ["en", "pl"]) {
    out.band.push(await page.evaluate((html) => {
      const b = document.getElementById("doorBand");
      b.hidden = false; b.setAttribute("aria-hidden", "false");
      b.innerHTML = '<span class="door-band-dot" aria-hidden="true"></span><span>' + html + "</span>";
      const r = b.getBoundingClientRect(), s = b.lastChild.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(b.lastChild).lineHeight) || 17;
      return { h: r.height, w: r.width, vw: innerWidth, oneLine: s.height <= lh * 1.5, scrollOk: b.scrollWidth <= b.clientWidth + 1 };
    }, FIX.band[lang].replace(/&/g, "&amp;").replace(/</g, "&lt;")));
  }
  await page.evaluate(() => { const b = document.getElementById("doorBand"); b.hidden = true; b.innerHTML = ""; });

  const putDoor = (html) => page.evaluate((h) => {
    const f = document.getElementById("firstSignin");
    f.hidden = false; f.setAttribute("aria-hidden", "false"); document.body.classList.add("e-first-signin");
    f.innerHTML = h; return true;
  }, html);

  /* Full-screen doors: the way on at rest, hovered and focused from the keyboard; the way out's gap; the offline box. */
  const way = async (sel, label) => {
    const rest = await page.$eval(sel, el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; });
    await page.hover(sel); await sleep(40);
    const hover = await page.$eval(sel, el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color }; });
    await page.mouse.move(2, 2); await sleep(40);
    /* Keyboard focus: a key first, so :focus-visible answers as it does for a hand on the keyboard. */
    await page.keyboard.press("Shift");
    await page.$eval(sel, el => el.focus());
    await sleep(40);
    const focus = await page.$eval(sel, el => { const c = getComputedStyle(el); return { visible: el.matches(":focus-visible"), bg: c.backgroundColor, color: c.color,
      oStyle: c.outlineStyle, oWidth: c.outlineWidth }; });
    await page.$eval(sel, el => el.blur());
    return { label, rest, hover, focus };
  };

  await putDoor(FIX.trialOver);
  out.doors = [await way("#firstSignin .door-acts .btn.primary", "state 3 Buy")];
  out.out = await page.evaluate(() => {
    const o = document.querySelector("#firstSignin .door-out"), q = document.querySelector("#firstSignin .door-quiet");
    if (!o || !q) return null;
    const c = getComputedStyle(o);
    return { marginTop: c.marginTop, paddingTop: c.paddingTop, borderTop: c.borderTopWidth + " " + c.borderTopStyle,
      gap: o.getBoundingClientRect().top - q.getBoundingClientRect().bottom };
  });
  await putDoor(FIX.waiting);
  out.doors.push(await way("#firstSignin .door-acts .btn.primary", "state 2 Check now"));

  await putDoor(FIX.offline);
  out.off = await page.evaluate(() => {
    const box = document.querySelector("#firstSignin .door-off"), g = box && box.querySelector(".door-off-glyph"), s = box && box.querySelector("span");
    if (!g || !s) return null;
    const gr = g.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return { display: getComputedStyle(box).display, w: gr.width, h: gr.height, opacity: getComputedStyle(g).opacity,
      before: gr.right <= sr.left + 0.5, sameRow: gr.top < sr.bottom && gr.bottom > sr.top };
  });
  await page.evaluate(() => { const f = document.getElementById("firstSignin"); f.innerHTML = ""; f.hidden = true; document.body.classList.remove("e-first-signin"); });

  /* The panel, state 4, in each language. */
  out.panel = [];
  for (const lang of ["en", "pl"]) {
    const p = FIX.panel[lang];
    await page.evaluate((m, h) => {
      document.getElementById("signinWrap").hidden = false;
      const el = document.getElementById("signinPanel");
      el.dataset.moment = m; el.innerHTML = h; el.hidden = false;
    }, p.moment, p.html);
    const rows = await page.evaluate(() => {
      const panel = document.getElementById("signinPanel"), on = panel.querySelector(".door-on-row"), rest = panel.querySelector(".sgn-acts");
      if (!on || !rest) return null;
      const bs = Array.from(on.querySelectorAll("button")).map(b => b.getBoundingClientRect());
      const pr = panel.getBoundingClientRect(), or = on.getBoundingClientRect(), rr = rest.getBoundingClientRect();
      return { n: bs.length, sameTop: bs.length === 2 && Math.abs(bs[0].top - bs[1].top) < 0.5, gap: bs.length === 2 ? bs[1].left - bs[0].right : -1,
        inside: bs.every(b => b.left >= pr.left && b.right <= pr.right) && on.scrollWidth <= on.clientWidth + 0.5,
        below: rr.top >= or.bottom - 0.5, restN: rest.querySelectorAll("button").length };
    });
    const w = await way("#signinPanel .door-on-row .btn.primary", "state 4 panel " + lang);
    out.panel.push({ lang, rows, w });
    await page.evaluate(() => { const el = document.getElementById("signinPanel"); el.hidden = true; el.innerHTML = ""; });
  }
  return out;
}

const filled = (c, accent) => c.bg === accent && /^rgb\(255, 255, 255\)$/.test(c.color);
const ringed = (f) => f.visible && f.oStyle === "solid" && f.oWidth === "2px";

function readChecks(m) {
  const doors = m.doors || [], panels = m.panel || [];
  return {
    dc1: m.band.length === 2 && m.band.every(b => near(b.h, 30, 0.5) && b.oneLine && b.scrollOk),
    dc2: doors.length === 2 && panels.length === 2 && doors.every(d => filled(d.rest, m.accent) && filled(d.hover, m.accent))
      && panels.every(p => filled(p.w.rest, m.accent) && filled(p.w.hover, m.accent)),
    dc3: doors.every(d => d.focus.bg === m.accent && ringed(d.focus)) && panels.every(p => p.w.focus.bg === m.accent && ringed(p.w.focus)),
    dc4: !!m.out && m.out.marginTop === "22px" && m.out.paddingTop === "18px" && m.out.borderTop === "1px solid" && near(m.out.gap, 22, 0.5),
    dc5: !!m.off && m.off.display === "flex" && near(m.off.w, 18, 0.5) && near(m.off.h, 18, 0.5) && near(parseFloat(m.off.opacity), 0.7, 0.01)
      && m.off.before && m.off.sameRow,
    dc6: panels.length === 2 && panels.every(p => p.rows && p.rows.n === 2 && p.rows.sameTop && near(p.rows.gap, 8, 0.5) && p.rows.inside
      && p.rows.below && p.rows.restN === 1),
  };
}

const DESCR = {
  dc1: "the band is 30px high, in English and Polish, its words on one line",
  dc2: "the way on is filled accent with white words at rest and under the pointer, on the door and in state 4's panel",
  dc3: "the way on, focused from the keyboard, is still filled and wears the page's own 2px outline",
  dc4: "the way out stands 22px under the quiet presses, over a 1px rule with 18px of padding",
  dc5: "the offline box is a flex row: an 18px glyph at 70% opacity beside its words",
  dc6: "state 4's panel is two rows: Check now and Buy 8px apart inside the panel, Account settings under them, in both languages",
};
const ORDER = ["dc1", "dc2", "dc3", "dc4", "dc5", "dc6"];

const scratch = [];
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const dir = lab(E.ENGINE_PATH); scratch.push(dir);
  const page = await boot(dir);
  const real = readChecks(await measure(page));
  await page.close();
  for (const id of ORDER) check(!!real[id], id + " " + DESCR[id], real[id]);
  check(typeof FIX.band.en === "string" && FIX.band.en.indexOf("17 November") >= 0 && FIX.panel.en.moment === "ended" && FIX.panel.pl.moment === "ended"
    && FIX.offline.indexOf("door-off-glyph") >= 0 && FIX.trialOver.indexOf("door-out") >= 0 && FIX.waiting.indexOf("door-acts") >= 0,
    "dc7 what is drawn is the door's own markup from signin.js: the band's long month, state 4 in both languages, the glyph, the way out and the acts");

  if (!PLANTS_OFF) {
    const ANCH = [
      ["dcp1", "dc1", "flex:0 0 30px;min-height:30px;height:30px;", "height:30px;"],
      ["dcp2", "dc2", "{background:var(--accent);color:#fff;border-color:var(--accent)} /* plant:door-on-fill */", "{background:var(--btn-rest)} /* plant:door-on-fill */"],
      ["dcp3", "dc3", "{background:var(--accent);color:#fff;border-color:var(--accent)} /* plant:door-on-fill */", "{background:var(--accent);color:#fff;border-color:var(--accent);outline:0} /* plant:door-on-fill */"],
      ["dcp4", "dc4", ".door-out{margin-top:22px;", ".door-out{margin-top:18px;"],
      ["dcp5", "dc5", ".door-off-glyph{flex:none;margin-top:1px;opacity:.7}", ".door-off-glyph{flex:none;margin-top:1px}"],
      ["dcp6", "dc5", ".door-off{display:flex;gap:10px;", ".door-off{display:block;gap:10px;"],
      ["dcp7", "dc6", ".door-on-row{display:flex;gap:8px;flex-wrap:nowrap;margin-top:14px}", ".door-on-row{display:block;margin-top:14px}"],
    ];
    const html = fs.readFileSync(E.ENGINE_PATH, "utf8");
    for (const [id, which, from, to] of ANCH) {
      let red = false, why = "";
      try {
        if (html.split(from).length !== 2) throw new Error("plant anchor not unique");
        const d = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-door-css-p-")); scratch.push(d);
        fs.writeFileSync(path.join(d, "etiuda.html"), html.replace(from, () => to));
        fs.writeFileSync(path.join(d, "etiuda-catalog.js"),
          "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
        const pg = await boot(d);
        red = !readChecks(await measure(pg))[which];
        await pg.close();
      } catch (e) { why = e.message; }
      check(red, id + " plant " + from.trim().slice(0, 48) + " turns " + which + " red" + (why ? " (" + why + ")" : ""));
    }
  }
} catch (e) {
  check(false, "the leg ran to its end", String(e && e.stack || e).slice(0, 400));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const d of scratch) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
}

console.log("#counts checks=" + asserted + " skipped=0 failed=" + failed + " expected=" + EXPECTED);
process.exitCode = Math.min(failed, 63);
