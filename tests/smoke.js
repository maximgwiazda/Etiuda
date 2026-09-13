/* Smoke run - the acceptance test. test.js guards invariants; this drives the interface, because
 * every bug the 2026-09 audit found was one nothing drove: dots under a fade, pinned rows
 * displaced by a drag, an eraser that left the panel stale. It boots engine/etiuda.html in a run
 * folder outside this tree with the fixtures beside it, collects every page and console error
 * from the first byte, and walks: every menu action, the tour, both interface languages, both
 * themes and glass off, the breakpoints for horizontal overflow and the cut-text rule, the intent
 * panel (pick, pin, wheel, drag, clear), the fields' fades, Quick facts, the search box's exits,
 * the three dialogs' folds and the editor's Save, the tab strip, and the public first run: a
 * folder holding nothing but the engine and the sample, in a fresh context.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/smoke.js            Chrome
 *   ETIUDA_FIXTURES=<folder> node tests/smoke.js firefox    Firefox
 *
 * Exit code is the number of failed checks, so a caller can gate on it - and 78 where the run
 * produced no verdict at all, which is a different fact and reads as one. See tests/README.md.
 * Everything happens in the browser's own temporary profile: nothing here touches the desk's
 * storage. The browser is closed in a finally - an orphaned headless browser wedges the Claude
 * app (see the rulebook). */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WHICH = (process.argv[2] || "chrome").toLowerCase();

/* Resolved before the browser starts, so a missing fixture costs nothing and is refused where
   the reason is still obvious. The run folder is the engine's only workable shape: it loads its
   catalog as a sibling, and no catalog may sit beside engine/etiuda.html in a public tree. */
const RUN = E.runFolder("catalog", "sample");
const ENGINE = RUN.url;
const EXE = { chrome: () => E.browserPath("chrome"), firefox: () => E.browserPath("firefox") };

let b; let fails = 0; let checks = 0; let reachedEnd = false;
const errs = [];
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const t0 = Date.now();

(async () => {
  b = await puppeteer.launch(WHICH === "firefox"
    ? { browser: "firefox", executablePath: EXE.firefox(), headless: true, protocolTimeout: 300000 }
    : { executablePath: EXE.chrome(), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 300000 });
  const p = await b.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.on("dialog", d => d.accept());
  p.on("pageerror", e => errs.push("pageerror: " + String(e.message || e)));
  p.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  const since = () => { const n = errs.length; return () => errs.slice(n); };
  const clean = (e, what) => check(e().length === 0, what + " without errors" + (e().length ? " - " + e().join(" | ") : ""));

  /* Boot and adoption. */
  let e = since();
  await p.goto(ENGINE, { waitUntil: "load", timeout: 90000 });
  await sleep(2400);
  const click = re => p.evaluate(s => { const r = new RegExp(s, "i");
    const el = [...document.querySelectorAll("button")].filter(x => x.offsetWidth > 0).find(x => r.test(x.textContent));
    if (el) { el.click(); return true; } return false; }, re.source);
  for (let i = 0; i < 4; i++) { if (!(await click(/^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update/))) break; await sleep(1900); }
  for (let i = 0; i < 3; i++) { if (!(await click(/skip|not now|close|pomi/))) break; await sleep(500); }
  await p.keyboard.press("Escape"); await sleep(800);
  console.log(WHICH.toUpperCase() + "  " + ENGINE);
  console.log("  engine/etiuda.html sha256 " + RUN.engineSha + (RUN.engineSha === RUN.copySha ? "" : "  COPY DIFFERS: " + RUN.copySha));
  const boot = await p.evaluate(() => ({ v: typeof E_VERSION === "string" ? E_VERSION : null, cards: document.querySelectorAll(".card").length,
    rows: document.querySelectorAll("#intentRailList .rail-item").length, pills: document.querySelectorAll("#pills .pill").length }));
  check(!!boot.v, "engine " + boot.v + " booted");
  check(boot.cards > 0 && boot.rows > 0 && boot.pills > 0, "catalog on screen: " + boot.cards + " cards, " + boot.rows + " intents, " + boot.pills + " pills");
  clean(e, "boot and adoption");

  /* Every menu action once; the toggles a second time to put things back; the tour separately. */
  e = since();
  const acts = await p.evaluate(() => [...document.querySelectorAll("#settingsMenu [data-act],#moreMenu [data-act]")].map(x => x.getAttribute("data-act")));
  const toggles = new Set(["theme", "lang", "rail", "pills"]);
  let opened = 0;
  for (const act of acts.filter(a => a !== "tour")) {
    await p.evaluate(a => { const x = document.querySelector('[data-act="' + a + '"]'); if (x) x.click(); }, act); await sleep(600);
    const modal = await p.evaluate(() => { const m = document.getElementById("modalCard"); return !!(m && m.offsetParent); });
    if (modal) opened++;
    await p.keyboard.press("Escape"); await sleep(350);
    if (toggles.has(act)) { await p.evaluate(a => { const x = document.querySelector('[data-act="' + a + '"]'); if (x) x.click(); }, act); await sleep(500); await p.keyboard.press("Escape"); await sleep(200); }
  }
  check(acts.length >= 8 && opened >= 2, acts.length + " menu actions exercised, " + opened + " opened a dialog");
  clean(e, "menu actions");

  /* The maintenance panel, which nothing above opens. It is not a menu item - the loop over
     [data-act] walks straight past it - and until 2026-09-13 no check in this file touched it:
     `grep -iE "mt-|maintenance"` over any smoke log returned nothing. F2 is the only way in
     that a person has, so F2 is the way in here.

     It earns its own checks for one reason. Every reading in the panel is wrapped in mtSafe,
     which turns any throw into the literal string "unavailable" and prints it in the cell.
     A reading that stops working therefore leaves a panel that is still readable, an app that
     still runs, and a suite that is still green - the same shape as the missing accessor of
     board item 258, and the reason that one went unseen twice.

     And this panel is the widest single reader of the module bridge in the app: mtReadings
     reaches five modules and about a dozen names the monolith still declares, in one pass and
     with no branch, so a name that stops crossing surfaces here before it surfaces anywhere a
     person would look.

     COUNTS AND VERDICTS ONLY. The readings name the catalog, its edition and its languages, and
     none of that text is read, printed or compared. The unavailable count is taken by asking
     the engine what its own word for it renders as in the current language and counting cells
     equal to that, so no wording is written down here either. */
  e = since();
  await p.keyboard.press("F2"); await sleep(800);
  const mt = await p.evaluate(() => {
    const m = document.getElementById("modalCard");
    const grid = m && m.offsetParent && m.querySelector(".mt-grid");
    if (!grid) return { open: false, secs: 0, rows: 0, unavailable: -1, blank: -1, controls: 0 };
    const word = (typeof tc === "function") ? tc("maintenance", "unavailable") : "unavailable";
    const vals = [...grid.querySelectorAll(".mt-row .v")].map(x => (x.textContent || "").trim());
    return { open: true,
      secs: grid.querySelectorAll(".mt-sec").length,
      rows: vals.length,
      unavailable: vals.filter(v => v === word).length,
      blank: vals.filter(v => v === "-").length,
      controls: ["mtShortcuts", "mtClear", "mtEject", "mtCopy", "mtClose"]
        .filter(id => !!document.getElementById(id)).length };
  });
  /* Floors rather than the measured 7 and 38: a reading added on purpose must not fail a run,
     and a section or a whole block of readings going missing must. */
  check(mt.open && mt.secs >= 6 && mt.rows >= 30,
    "maintenance panel opens on F2: " + mt.secs + " sections, " + mt.rows + " readings");
  /* The one that is the point. Zero, not a floor: mtSafe has exactly one way to print this. */
  check(mt.open && mt.unavailable === 0,
    "every maintenance reading answered: " + mt.unavailable + " unavailable, " + mt.blank + " blank");
  check(mt.controls === 5, "the panel's rescues and copy are wired: " + mt.controls + " of 5 controls");
  await p.keyboard.press("Escape"); await sleep(500);
  clean(e, "the maintenance panel");

  /* The tour, end to end on Enter, watched through the overlay a person sees rather than
     through the module's own bookkeeping.

     Until 2026-09-13 these lines read TOUR_STEPS and tourRunning off the page, two names
     tour.js exported for this check and for nothing else, and the check was
     `startTour existed && tourRunning went true && tourRunning went false`. That is the tour's
     own opinion that the tour ended. Measured against an engine whose endTour clears the flag
     and skips hiding the root - one `if(els.root)` turned to `if(false)`, everything else
     untouched: the old lines printed `ok tour of 20 steps walked on Enter (20 presses) and
     ended` with the coach-mark overlay still covering the whole viewport, 1500x950,
     display block, aria-hidden="false", and not one page or console error in the run.

     So: the overlay's own geometry, and the step counter it draws. #tourRoot is position:fixed,
     so offsetParent is null whether it is up or down, measured - display and width are what
     say. The counter is read as two numbers, `(\d+)\D+(\d+)`, never as words: its text goes
     through t("Tour {N} / {TOTAL}") and comparing the wording would be a translation contract
     this check has no business holding. The counter alone cannot say the tour ended either -
     it still reads 20 / 20 afterwards - which is why the last assertion is the overlay. */
  e = since();
  const tourShot = () => p.evaluate(() => {
    const r = document.getElementById("tourRoot");
    const lab = document.getElementById("tourStepLabel");
    const m = /(\d+)\D+(\d+)/.exec((lab && lab.textContent) || "");
    const w = r ? Math.round(r.getBoundingClientRect().width) : 0;
    return { up: !!(r && getComputedStyle(r).display !== "none" && w > 0), w,
             n: m ? +m[1] : 0, total: m ? +m[2] : 0 };
  });
  const started = await p.evaluate(() => { if (typeof startTour !== "function") return false; startTour(); return true; });
  await sleep(700);
  const first = await tourShot();
  /* Bounded by the tour's own length and three spare, so a tour that will not close costs
     three presses rather than forty. */
  const cap = first.total > 0 ? first.total + 3 : 40;
  let pressed = 0, advanced = 0, seen = first.n;
  for (let i = 0; i < cap; i++) {
    if (!(await tourShot()).up) break;
    await p.keyboard.press("Enter"); pressed++; await sleep(260);
    const now = await tourShot();
    if (now.up && now.n === seen + 1) advanced++;
    if (now.n > seen) seen = now.n;
  }
  const tourAfter = await tourShot();
  check(started && first.up && first.n === 1 && first.total >= 10,
    "the tour opens its overlay on step " + first.n + " of " + first.total + " (" + first.w + "px wide)");
  check(advanced === first.total - 1 && pressed === first.total,
    "and Enter walks it one step at a time to the end (" + advanced + " advances over " + pressed + " presses)");
  check(!tourAfter.up, "and the overlay leaves the screen when it ends, rather than only being flagged done ("
    + tourAfter.w + "px wide)");
  await p.keyboard.press("Escape"); await sleep(300);
  clean(e, "the tour");

  /* Interface language both ways, with the dialogs opened in Polish.

     The four chrome-side facts here - the flag, a translated chrome string, two dialogs that
     open clean, and English back - are necessary and not sufficient, and what they leave out
     is board item 146. applyUiLang redraws the catalog-derived surfaces through a loop of
     window[fn] lookups, and a top-level function in a module is not a property of window, so
     the module split kills that loop without an error. Measured on 2026-09-12 against a
     scratch engine with the loop dead: all four passed, this suite returned 106/106 and
     reported no page or console error, and not one pill, rail row, tab or card left English.

     So the ink is measured too. Six surfaces, one for each function in that loop, attributed
     by dropping each name from the loop in turn and seeing exactly one surface stop moving:
     CATS is applyCatsToGlobal's, the rail rows drawIntentRail's, the pills drawPills', the tab
     labels drawTabs', the role drum syncRoleDrum's and the card text render's. Each has to
     differ in Polish and come back in English. It holds with the sample catalog as well as
     with a deployment one, so a fresh clone passes it. Lengths and verdicts are printed and
     the text never is: the text is the catalog's. */
  e = since();
  const surfaces = () => p.evaluate(() => {
    const txt = sel => [...document.querySelectorAll(sel)].map(x => (x.textContent || "").trim()).join("\u0001");
    return { CATS: (typeof CATS !== "undefined" && CATS) ? JSON.stringify(CATS) : "",
      rail: txt("#intentRailList .rail-item"), pills: txt("#pills .pill"),
      tabs: txt("#tabsBar .tab-label"), roleDrum: txt("#roleDrum"), cards: txt(".card") };
  });
  const REPAINT = { CATS: "applyCatsToGlobal", rail: "drawIntentRail", pills: "drawPills",
    tabs: "drawTabs", roleDrum: "syncRoleDrum", cards: "render" };
  const en0 = await surfaces();
  const pl = await p.evaluate(async () => { setUiLang("pl"); await new Promise(r => setTimeout(r, 400));
    const l = uiLang(); const en = t("Settings"); return { l, translated: en !== "Settings" }; });
  await sleep(400);
  const plSurf = await surfaces();
  check(pl.l === "pl" && pl.translated, "interface switched to Polish and a chrome string followed");
  for (const k of Object.keys(REPAINT)) {
    check(en0[k].length > 0 && plSurf[k] !== en0[k], "and the " + k + " surface repainted, so "
      + REPAINT[k] + " ran (" + en0[k].length + " chars to " + plSurf[k].length + ")");
  }
  for (const act of ["settings", "manage"]) { await p.evaluate(a => document.querySelector('[data-act="' + a + '"]').click(), act); await sleep(700); await p.keyboard.press("Escape"); await sleep(300); }
  await p.evaluate(async () => { setUiLang("en"); await new Promise(r => setTimeout(r, 400)); });
  await sleep(400);
  const en1 = await surfaces();
  check(await p.evaluate(() => uiLang() === "en"), "and back to English");
  for (const k of Object.keys(REPAINT)) {
    check(en1[k] === en0[k], "and the " + k + " surface came back unchanged (" + en1[k].length + " chars)");
  }
  clean(e, "language switch");

  /* The theme through its own control. The block below sets data-theme by hand, which proves the
     stylesheet and says nothing about the switch: measured 2026-09-13 against an engine whose
     $("#theme").onclick returns at its first line, all three of its checks still passed. The
     menu item forwards to #theme, so pressing it drives the dispatcher and the handler together,
     and what is read back is on screen or on disk - the attribute the stylesheet keys off, the
     key a reload reads, and the ground's own colour. The flip is what bites; the return is a
     second fact and passes on its own against a switch that does nothing, so it is never quoted
     alone. The stored key is put back as it was found, so nothing downstream inherits a pin. */
  e = since();
  const themeSnap = () => p.evaluate(() => ({ attr: document.documentElement.dataset.theme || null,
    key: localStorage.getItem("pbTheme"), bg: getComputedStyle(document.body).backgroundColor }));
  const th0 = await themeSnap();
  await p.evaluate(() => document.querySelector('[data-act="theme"]').click()); await sleep(700);
  const th1 = await themeSnap();
  await p.evaluate(() => document.querySelector('[data-act="theme"]').click()); await sleep(700);
  const th2 = await themeSnap();
  await p.evaluate(k => { if (k === null) localStorage.removeItem("pbTheme"); else localStorage.setItem("pbTheme", k); }, th0.key);
  check(th1.attr !== th0.attr && (th1.attr === "dark" || th1.attr === "light"),
    "the theme control flips the theme (" + th0.attr + " to " + th1.attr + ")");
  check(th1.key === th1.attr, "and pins the choice where a reload reads it (" + th1.key + ")");
  check(th1.bg !== th0.bg, "and the ground repaints (" + th0.bg + " to " + th1.bg + ")");
  check(th2.attr === th0.attr && th2.bg === th0.bg, "and a second press returns both");
  clean(e, "the theme control");

  /* Themes and glass. */
  e = since();
  const themes = await p.evaluate(async () => {
    const bg = () => getComputedStyle(document.body).backgroundColor;
    document.documentElement.dataset.theme = "dark"; await new Promise(r => setTimeout(r, 150)); const d = bg();
    document.documentElement.dataset.theme = "light"; await new Promise(r => setTimeout(r, 150)); const l = bg();
    document.body.classList.add("glass-off"); await new Promise(r => setTimeout(r, 100));
    const off = getComputedStyle(document.body).getPropertyValue("--glass-mid-filter").trim();   // the docked panel is solid, so the token the switch sets on body is what to read
    openSettings(); await new Promise(r => setTimeout(r, 300));
    const scrimOff = getComputedStyle(document.querySelector(".modal-bg")).backdropFilter;
    document.body.classList.remove("glass-off"); await new Promise(r => setTimeout(r, 100));
    const scrimOn = getComputedStyle(document.querySelector(".modal-bg")).backdropFilter;
    dismissModal(); delete document.documentElement.dataset.theme;
    return { d, l, off, scrimOff, scrimOn, mark: getComputedStyle(document.documentElement).getPropertyValue("--mark-filter").trim() };
  });
  check(themes.d !== themes.l, "dark and light paint different grounds");
  check(themes.off === "none", "blur off removes the panel blur (" + themes.off + ")");
  check(themes.scrimOff === "none" && themes.scrimOn !== "none" && themes.mark !== "none", "and the dialog scrim's, which returns with it (" + themes.scrimOn + ")");
  clean(e, "themes");

  /* Breakpoints: no horizontal overflow, and the cut-text rule at every width. */
  for (const w of [1600, 1400, 1200, 1000, 900, 800, 700, 600, 500, 430, 390]) {
    e = since();
    await p.setViewport({ width: w, height: 950 }); await sleep(900);
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const all = [...document.querySelectorAll(CUT_SEL)].filter(el => { if (!el.getClientRects().length) return false;
        const card = el.closest(".card"), b = (card || el).getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; });
      let dots = 0, bare = 0;
      all.forEach(el => { const cs = getComputedStyle(el); if (cs.textOverflow !== "clip") dots++;
        const c = cutSides(el); if ((c.l || c.r) && cs.maskImage === "none" && cs.webkitMaskImage === "none") bare++; });
      const fw = id => Math.round(document.getElementById(id).getBoundingClientRect().width);
      return { over: de.scrollWidth - de.clientWidth, dots, bare, n: all.length, pax: fw("pax"), search: fw("intent"), agent: fw("agent") };
    });
    check(r.over <= 0, w + "px: no horizontal overflow (" + r.over + "px)");
    check(r.dots === 0 && r.bare === 0, w + "px: " + r.n + " lines, none dotted, every cut one fades");
    check(r.search >= r.pax && r.search >= r.agent, w + "px: the search box is never the narrowest field (pax " + r.pax + ", search " + r.search + ", agent " + r.agent + ")");
    clean(e, w + "px");
  }
  await p.setViewport({ width: 1500, height: 950 }); await sleep(900);

  /* The intent panel: pick, add a second, pinned above the list, wheel over it, drag a plain row, clear. */
  e = since();
  await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item")][6].click()); await sleep(600);
  await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item:not(.on)")][2].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }))); await sleep(600);
  const rail = await p.evaluate(() => { const box = document.getElementById("intentRailList"), on = [...box.querySelectorAll(".rail-item.on")];
    const t0 = on[0] && on[0].getBoundingClientRect(), first = box.querySelector(".rail-item:not(.on)"), f = first && first.getBoundingClientRect();
    return { pinned: on.length, docked: document.body.classList.contains("rail-on"), aboveList: !!t0 && t0.bottom <= box.getBoundingClientRect().top + 0.5,
             plainInside: !!f && f.top >= box.getBoundingClientRect().top - 0.01, pos: on[0] && getComputedStyle(on[0]).position,
             x: t0 ? t0.left + t0.width / 2 : 0, y: t0 ? t0.top + t0.height / 2 : 0 }; });
  check(rail.pinned === 2 && rail.pos === "absolute" && rail.aboveList && rail.plainInside, "two picked intents pinned above the list, plain rows inside it");
  await p.mouse.move(rail.x, rail.y); await p.mouse.wheel({ deltaY: 120 }); await sleep(400);
  check((await p.evaluate(() => document.getElementById("intentRailList").scrollTop)) > 0, "wheel over a pinned row scrolls the list");
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 0; });
  const before = await p.evaluate(() => JSON.stringify(intentOrder));
  const rows = await p.evaluate(() => [...document.querySelectorAll("#intentRailList .rail-item:not(.on)")].slice(0, 3).map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  await p.mouse.move(rows[0].x, rows[0].y); await p.mouse.down(); await sleep(120);
  for (let i = 1; i <= 8; i++) { await p.mouse.move(rows[0].x, rows[0].y + (rows[2].y - rows[0].y) * i / 8); await sleep(40); }
  await sleep(250); await p.mouse.up(); await sleep(600);
  check((await p.evaluate(() => JSON.stringify(intentOrder))) !== before, "dragging a plain row reorders the intents");
  /* The clear-intents door beside the add button: there while something is picked, gone after. */
  const fabOn = await p.evaluate(() => { const f = document.getElementById("clearIntentsFab"); const cs = getComputedStyle(f);
    return { on: f.classList.contains("on"), many: f.classList.contains("many"), n: f.querySelector(".fab-n").textContent, op: cs.opacity, vis: cs.visibility, title: f.title }; });
  check(fabOn.on && fabOn.many && fabOn.n === "2" && fabOn.op === "1" && fabOn.vis === "visible", "the clear-intents button shows for two picked intents with their count (" + JSON.stringify(fabOn.title) + ")");
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 400; });
  await p.evaluate(() => document.getElementById("clearIntentsFab").click()); await sleep(700);
  const fabOff = await p.evaluate(() => { const f = document.getElementById("clearIntentsFab"); return { on: f.classList.contains("on"), picked: document.querySelectorAll("#intentRailList .rail-item.on").length, vis: getComputedStyle(f).visibility, top: document.getElementById("intentRailList").scrollTop }; });
  check(!fabOff.on && fabOff.picked === 0 && fabOff.vis === "hidden", "clicking it clears the intents and it fades away");
  check(fabOff.top === 0, "and the clear scrolls the panel to its top (scrollTop " + fabOff.top + ")");
  await p.evaluate(() => { const rows = document.querySelectorAll("#intentRailList .rail-item[data-si]"); rows[0].click(); }); await sleep(700);
  await p.evaluate(() => { const rows = document.querySelectorAll("#intentRailList .rail-item[data-si]:not(.on)"); rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })); }); await sleep(900);
  await p.evaluate(() => document.getElementById("intentRailClear").click()); await sleep(500);
  check((await p.evaluate(() => document.querySelectorAll("#intentRailList .rail-item.on").length)) === 0, "the clear button unpins everything");
  clean(e, "the intent panel");

  /* The fields: a long name fades behind the caret, then on the other side when the caret goes home. */
  e = since();
  await p.evaluate(() => document.querySelector("#pax").focus());
  await p.keyboard.type("Wojciechowska-Nowakowska", { delay: 8 }); await sleep(400);
  const f1 = await p.evaluate(() => { const c = document.querySelector("#pax").classList; return { l: c.contains("cut-l"), r: c.contains("cut-r") }; });
  await p.keyboard.press("Home"); await sleep(400);
  const f2 = await p.evaluate(() => { const c = document.querySelector("#pax").classList; return { l: c.contains("cut-l"), r: c.contains("cut-r") }; });
  check(f1.l && !f1.r && f2.r && !f2.l, "PAX fades left while typing and right after Home");
  await p.evaluate(() => document.getElementById("paxClear").click()); await sleep(400);
  check(await p.evaluate(() => document.querySelector("#pax").value === ""), "the PAX eraser empties the field");
  clean(e, "the fields");

  /* Quick facts open and close. */
  e = since();
  await p.evaluate(() => document.getElementById("factsBtn").click()); await sleep(500);
  const facts = await p.evaluate(() => { const f = document.querySelector(".facts-panel"); return !!f && f.offsetParent !== null; });
  await p.keyboard.press("Escape"); await sleep(400);
  check(facts, "Quick facts opens and Escape closes it");
  clean(e, "Quick facts");

  /* Search: a query narrows the list and greys the panel; the eraser and Escape both leave it whole. */
  e = since();
  const all = await p.evaluate(() => document.querySelectorAll("#list .card").length);
  await p.evaluate(() => { document.getElementById("intentRailList").scrollTop = 240; document.querySelector("#intent").focus(); });
  await p.keyboard.type("refund", { delay: 10 }); await sleep(900);
  const q = await p.evaluate(() => { const box = document.getElementById("intentRailList"); const first = box.querySelector(".rail-item:not(.on)");
    return { cards: document.querySelectorAll("#list .card").length, grey: box.querySelectorAll(".rail-nohit").length, top: box.scrollTop, firstGrey: !!first && first.classList.contains("rail-nohit") }; });
  check(q.top === 0 && !q.firstGrey, "the settle scrolls the panel to the top, a match first (scrollTop " + q.top + ")");
  await p.evaluate(() => document.getElementById("intentClear").click()); await sleep(700);
  const after = await p.evaluate(() => ({ cards: document.querySelectorAll("#list .card").length, grey: document.querySelectorAll("#intentRailList .rail-nohit").length, v: document.querySelector("#intent").value }));
  check(q.cards < all && q.grey > 0, "a query narrows the list (" + all + " to " + q.cards + ") and greys " + q.grey + " rows");
  check(after.v === "" && after.grey === 0 && after.cards === all, "the eraser restores the list and un-greys the panel");
  clean(e, "search");

  /* The dialogs' folds and the editor's Save. */
  e = since();
  await p.evaluate(() => document.querySelector('[data-act="settings"]').click()); await sleep(700);
  const acc = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details.acc")]; if (ds.length < 2) return { n: ds.length };
    const a = ds[0], c = ds[1]; const was = a.open; a.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    const t1 = a.open; c.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    return { n: ds.length, toggled: t1 !== was, cOpen: c.open, setOk: accOpen.has(c.getAttribute("data-acc")) === c.open && accOpen.has(a.getAttribute("data-acc")) === a.open }; });
  check(acc.n >= 2 && acc.toggled && acc.cOpen && acc.setOk, "Settings folds toggle, accordion, open-set true (" + acc.n + " folds)");
  await p.keyboard.press("Escape"); await sleep(400);
  /* Manage's folds. The toggle itself is <details>, which the browser does for nothing, so the
     fact worth asserting is the one the app owns: that the fold a person left open is still open
     when Manage is drawn again. This read mgOpen until 2026-09-13 - the module's own Set, reached
     off the page through the bridge - which is the module asserting its own opinion, board item
     264's fault. What is on screen is details[open] after a redraw, so that is what is read, and
     the section is put back the way it was found. */
  await p.evaluate(() => document.querySelector('[data-act="manage"]').click()); await sleep(900);
  const mgKey = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details[data-mg]")];
    const d = ds.find(x => !x.open); if (!d) return { n: ds.length, key: null };
    d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450));
    return { n: ds.length, key: d.getAttribute("data-mg"), toggled: d.open }; });
  const reopen = k => p.evaluate(async key => { dismissModal(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 700));
    const d = document.querySelector('#modalCard details[data-mg="' + key + '"]');
    return d ? d.open : null; }, k);
  const mgAfter = mgKey.key === null ? null : await reopen(mgKey.key);
  if (mgKey.key !== null) await p.evaluate(async key => { const d = document.querySelector('#modalCard details[data-mg="' + key + '"]');
    if (d && d.open) d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 400)); }, mgKey.key);
  const mgBack = mgKey.key === null ? null : await reopen(mgKey.key);
  check(mgKey.n > 0 && mgKey.key !== null && mgKey.toggled === true,
    "a closed Manage section opens on its summary (" + mgKey.n + " sections)");
  check(mgAfter === true, "and is still open when Manage is drawn again (details[open] " + mgAfter + ")");
  check(mgBack === false, "and closing it survives the same redraw (details[open] " + mgBack + ")");
  await p.keyboard.press("Escape"); await sleep(400);
  const edit = await p.evaluate(() => { const btn = [...document.querySelectorAll(".card .cacts button")].find(x => /edit|edytuj|full editor/i.test((x.title || "") + " " + (x.getAttribute("aria-label") || ""))); if (!btn) return false; btn.click(); return true; });
  await sleep(900);
  const ed = await p.evaluate(async () => { const ds = [...document.querySelectorAll("#modalCard details.mf-fold")]; const d = ds.find(x => !x.open) || ds[0]; if (!d) return { n: 0 };
    const was = d.open; d.querySelector("summary").click(); await new Promise(r => setTimeout(r, 450)); const s = document.getElementById("meSave"); if (s) s.click(); await new Promise(r => setTimeout(r, 800));
    return { n: ds.length, toggled: d.open !== was, saved: !!s }; });
  check(edit && ed.n > 0 && ed.toggled && ed.saved, "the card editor opens, a fold toggles, Save runs (" + ed.n + " folds)");
  await p.keyboard.press("Escape"); await sleep(400);
  clean(e, "the dialogs");

  /* An editor's text input with a value longer than its box fades behind the caret, on a wrap
     that keeps the border and the fill. */
  e = since();
  await p.evaluate(() => document.querySelector('#list .card [data-act="edit"]').click()); await sleep(900);
  const inpSel = await p.evaluate(() => { const i = document.querySelector('#modalCard .mf input:not([type])'); i.id = i.id || "smokeInp"; return "#" + i.id; });
  await p.click(inpSel); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control");
  await p.keyboard.type("A title long enough to run past the end of any box on any screen, and then some more words after that", { delay: 3 }); await sleep(450);
  const fade = await p.evaluate(sel => { const i = document.querySelector(sel), w = i.parentElement, cs = getComputedStyle(i), ws = getComputedStyle(w);
    return { wrapped: w.classList.contains("field-wrap"), cut: i.classList.contains("is-cut") && i.classList.contains("cut-l"), masked: (cs.maskImage || cs.webkitMaskImage) !== "none", naked: cs.borderTopWidth === "0px" && cs.backgroundColor === "rgba(0, 0, 0, 0)", wrapBorder: ws.borderTopWidth === "1px" && ws.backgroundColor !== "rgba(0, 0, 0, 0)" }; }, inpSel);
  check(fade.wrapped && fade.cut && fade.masked && fade.naked && fade.wrapBorder, "an editor input fades its long value on a wrap that keeps the chrome (" + JSON.stringify(fade) + ")");
  await p.keyboard.press("Escape"); await sleep(400);
  await p.evaluate(() => { const b = [...document.querySelectorAll("#modalCard button")].find(x => /discard|odrzu/i.test(x.textContent)); if (b) b.click(); }); await sleep(400);
  await p.keyboard.press("Escape"); await sleep(300);
  clean(e, "the editor's fade");

  /* The internal note: an i on the cards that carry one, a callout beside the card with an
     arrow, closed by Escape. Then a dialog input with a long value fades instead of clipping. */
  e = since();
  /* Drive the scroller, and CONVERGE: the column count follows the window, so one scroll aimed
     at a list still settling lands nowhere near the card. Re-read and correct until it holds. */
  const noteBtn = await p.evaluate(() => !!document.querySelector('#list .card [data-act="note"]'));
  for (let i = 0; i < 6; i++) {
    const done = await p.evaluate(() => {
      const b = document.querySelector('#list .card [data-act="note"]');
      if (!b) return true;
      const card = b.closest(".card"), r = card.getBoundingClientRect();
      if (r.top > 60 && r.top < innerHeight - 120) return true;
      const sc = document.getElementById("pageScroll") || document.scrollingElement;
      sc.scrollTop += r.top - 90;
      return false;
    });
    if (done) break;
    await sleep(350);
  }
  await sleep(300);
  /* Hover first, the default: the pointer rests on a noted card and the note opens by itself; the
     i is not shown; leaving the card closes it. */
  const hoverOn = await p.evaluate(() => document.body.classList.contains("note-hover") && matchMedia("(hover:hover)").matches);
  await sleep(700);   // the scroll above is smooth; a rectangle read before it settles points at the wrong card
  /* LOOK FOR THE CARD, do not assume where it is: the column count follows the window and the
     floor, so a fixed offset from the top can land on the sticky separator above it. */
  const hc = await p.evaluate(() => { const c = document.querySelector('#list .card [data-act="note"]').closest(".card"), r = c.getBoundingClientRect();
    const x = r.left + r.width / 2;
    let y = 0, onCard = false;
    for (const dy of [10, 18, 26, 34, r.height / 2]) {
      const u = document.elementFromPoint(x, r.top + dy);
      if (u && u.closest(".card") === c) { y = r.top + dy; onCard = true; break; }
    }
    return { x, y: y || r.top + 10, onCard, btnShown: c.querySelector('[data-act="note"]').offsetWidth > 0 }; });
  await p.mouse.move(hc.x, hc.y); await sleep(600);
  const hovered = await p.evaluate(() => !!document.getElementById("notePane"));
  await p.mouse.move(5, 5); await sleep(300);
  const left = await p.evaluate(() => !document.getElementById("notePane"));
  check(hoverOn && hc.onCard && !hc.btnShown && hovered && left, "with notes on hover the pointer opens the note, the i is hidden, leaving closes it (" + JSON.stringify({ hoverOn, onCard: hc.onCard, hovered, left }) + ")");
  /* Then the switch off: the i returns and opens the note on a click. */
  await p.evaluate(() => { document.body.classList.remove("note-hover"); }); await sleep(100);
  check(await p.evaluate(() => document.querySelector('#list .card [data-act="note"]').offsetWidth > 0), "with the switch off the i is back");
  await p.evaluate(() => document.querySelector('#list .card [data-act="note"]').click()); await sleep(600);
  const np = await p.evaluate(() => { const pane = document.getElementById("notePane"), a = document.querySelector(".note-arrow"), card = document.querySelector('#list .card [data-act="note"]').closest(".card");
    const pr = pane && pane.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const overlap = pr && !(pr.right < cr.left || pr.left > cr.right || pr.bottom < cr.top || pr.top > cr.bottom);
    return { pane: !!pane, title: pane && pane.querySelector("h3").textContent === card.querySelector(".ctitle").textContent, arrow: !!a && !!a.querySelector(".tour-shaft").getAttribute("d"), overlap, opacity: pane && getComputedStyle(pane).opacity, stroke: a && getComputedStyle(a.querySelector(".tour-shaft")).stroke }; });
  check(!!noteBtn && np.pane && np.title && np.arrow && !np.overlap && np.opacity === "1", "the i opens the note callout beside its card, titled and arrowed, clear of the card (" + JSON.stringify({ overlap: np.overlap, stroke: np.stroke }) + ")");
  await p.keyboard.press("Escape"); await sleep(300);
  check(await p.evaluate(() => !document.getElementById("notePane") && !document.querySelector(".note-arrow")), "Escape closes the callout and takes the arrow with it");
  clean(e, "the internal note");

  /* Tabs: add one, then the keys - Tab round the strip with the box's text travelling with its
     tab and focus staying put, slash for the language with nothing typed, Shift+Tab for a new tab -
     then back to where the strip started. */
  e = since();
  const n0 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  await p.evaluate(() => document.querySelector(".tab-add").click()); await sleep(900);
  const n1 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  const onIdx = () => p.evaluate(() => [...document.querySelectorAll(".tab")].findIndex(t => t.classList.contains("on")));
  await p.click("#intent"); await p.keyboard.type("probe", { delay: 20 }); await sleep(600);
  const i0 = await onIdx();
  await p.keyboard.press("Tab"); await sleep(700);
  const i1 = await onIdx();
  const away = await p.evaluate(() => ({ v: document.querySelector("#intent").value, focus: document.activeElement && document.activeElement.id }));
  await p.keyboard.press("Tab"); await sleep(700);
  const i2 = await onIdx();
  const back = await p.evaluate(() => document.querySelector("#intent").value);
  check(i0 === n1 - 1 && i1 === 0 && i2 === i0 && away.v === "" && away.focus === "intent" && back === "probe",
    "Tab steps round the strip (" + i0 + " > " + i1 + " > " + i2 + "), the query travels with its tab and focus stays in the box");
  const l0 = await p.evaluate(() => lang);
  await p.keyboard.press("Slash"); await sleep(500);
  const l1 = await p.evaluate(() => ({ l: lang, v: document.querySelector("#intent").value }));
  await p.keyboard.press("Slash"); await sleep(500);
  const l2 = await p.evaluate(() => lang);
  check(l1.l !== l0 && l2 === l0 && l1.v === "probe", "slash toggles the language from inside the box (" + l0 + " > " + l1.l + " > " + l2 + ") and types nothing");
  await p.keyboard.press("Backquote"); await sleep(500);
  const l3 = await p.evaluate(() => ({ l: lang, v: document.querySelector("#intent").value }));
  await p.keyboard.press("Backquote"); await sleep(500);
  const l4 = await p.evaluate(() => lang);
  const keyRows = await p.evaluate(() => { openSettings("keys"); return new Promise(r => setTimeout(() => { const altN =document.querySelectorAll("#setBody .sc-row .sc-bind.sc-alt").length, fixedN = document.querySelectorAll("#setBody .sc-row .sc-bind.fixed").length, tilde = [...document.querySelectorAll('#setBody .sc-row[data-sc="langToggle"] .sc-bind')].map(b => b.textContent.trim()); dismissModal(); r({ alt: altN, fixed: fixedN, tilde }); }, 400)); });
  check(l3.l !== l0 && l4 === l0 && l3.v === "probe" && keyRows.alt > 10 && keyRows.tilde.join(" ") === "/ ~", "the tilde is the language toggle's alternative, every rebindable row has an alternative slot (" + keyRows.alt + "), fixed rows none (" + keyRows.fixed + " fixed, " + JSON.stringify(keyRows.tilde) + ")");
  await p.keyboard.down("Shift"); await p.keyboard.press("Tab"); await p.keyboard.up("Shift"); await sleep(900);
  const n2 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  await p.evaluate(() => openSettings("keys")); await sleep(600);
  const grab = await p.evaluate(() => {
    const b = document.querySelector('[data-bind="focusPax"][data-slot="1"]');
    if (!b || b.disabled) return null;
    b.click();
    return { armed: !!scCaptureId, before: JSON.stringify(scMap.focusPax) };
  });
  if (grab) {
    await p.keyboard.press("Enter"); await sleep(400);
    const kept = await p.evaluate(() => ({
      after: JSON.stringify(scMap.focusPax),
      still: !!scCaptureId,
      said: (document.getElementById("toast") || {}).textContent || ""
    }));
    check(grab.armed && kept.after === grab.before && kept.still && /fixed/i.test(kept.said),
      "a capture refuses a fixed key and says which (" + JSON.stringify(kept.said.slice(0, 40)) + ")");
    await p.keyboard.press("Escape"); await sleep(300);
  } else check(false, "the shortcuts list offered no capture to arm");
  await p.evaluate(() => dismissModal()); await sleep(500);

  check(n2 === n1 + 1, "Shift+Tab opens a tab (" + n1 + " > " + n2 + ")");
  for (let k = n2; k > n0; k--) {
    await p.evaluate(() => document.querySelectorAll(".tab")[0].click()); await sleep(300);
    await p.evaluate(() => { const tabs = document.querySelectorAll(".tab"); const x = tabs[tabs.length - 1].querySelector(".tab-x"); if (x) x.click(); }); await sleep(700);
  }
  const n3 = await p.evaluate(() => document.querySelectorAll(".tab").length);
  check(n1 === n0 + 1 && n3 === n0, "tabs added, switched away from and closed (" + n0 + " > " + n1 + " > " + n2 + " > " + n3 + ")");

  /* The tab's accent dot, which exists only because drawPills and drawTabs are reassigned at
     load to wrap themselves around syncTabAccent. Nothing else in the file calls syncTabAccent
     at all, and an imported binding is read-only, so a module split cannot keep that wrap - it
     is the one genuine load-time forward reference in the engine. Measured on 2026-09-12 with
     the two wrapping lines deleted: this suite returned 118/118 with no page or console error,
     and the active tab never took data-ec at all.

     So the attribute is read, and read against the engine's own answer rather than against a
     constant: with a category filtered the tab carries that category's slot number, and with
     the filter off it carries nothing. Which pill is which is never assumed - the first pill
     is the one that selects nothing, and an earlier draft of this check failed on the sound
     engine for assuming otherwise. The gradient needs two categories at once and is not
     asserted, because how many a catalog offers is the catalog's business. */
  const accent = await p.evaluate(async () => {
    const tab = () => document.querySelector(".tab.on") || document.querySelector(".tab");
    const ec = () => { const d = tab().dataset.ec; return d === undefined ? null : d; };
    const nCats = () => (typeof cats !== "undefined" && cats) ? cats.length : -1;
    const wait = () => new Promise(r => setTimeout(r, 600));
    const pills = [...document.querySelectorAll("#pills .pill")].filter(x => x.offsetWidth > 0);
    const out = { pills: pills.length, start: ec(), want: null, filtered: null, catsAfter: null, cleared: null };
    for (const pill of pills) { pill.click(); await wait(); if (nCats() > 0) break; }
    if (nCats() <= 0) return out;
    out.want = (typeof catSlot === "function") ? String(catSlot(cats[0])) : null;
    out.filtered = ec();
    for (const pill of pills) { pill.click(); await wait(); if (nCats() === 0) break; }
    out.catsAfter = nCats();
    out.cleared = ec();
    return out;
  });
  check(accent.want !== null && accent.filtered === accent.want
    && accent.catsAfter === 0 && accent.cleared === null,
    "a filtered category paints the tab's accent with its own slot and clearing it takes the accent off ("
    + JSON.stringify(accent) + ")");
  clean(e, "the tab strip");

  /* A tab drag, which nothing drove until 2026-09-13. The strip reorders on pointer events, not
     on HTML5 drag-and-drop, so the real pointer is what drives it here: down on a tab, past the
     five-pixel threshold, then across to three quarters of the way into a tab two along, which is
     past the quarter tabDragCheck asks for. A 120ms swap lock bounds the rate, so one traverse
     moves the tab one place and the assertion is that it lands PAST where it began rather than on
     any particular index.

     THE CONTROL CAME FIRST, and it is what says which of these four checks is worth anything.
     Against an engine whose moveTab returns at its first line - the drop handler dead, everything
     else alive - three of the four still pass: the root class, the .dragging class and the
     release all behave exactly as they do on a healthy engine, because they are the drag's own
     state and have nothing to do with the drop. Only the landing check falls, 0 to 0 of 3. So the
     landing is the check; the other three say the drag began and ended and are worth exactly
     that. Measured 2026-09-13. */
  e = since();
  const tabOrder = () => p.evaluate(() => [...document.querySelectorAll("#tabsBar .tab[data-tid]")].map(x => x.dataset.tid));
  const tabBox = tid => p.evaluate(t => { const el = document.querySelector('#tabsBar .tab[data-tid="' + t + '"]');
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, w: r.width }; }, tid);
  await p.evaluate(() => { addTab(); }); await sleep(900);
  await p.evaluate(() => { addTab(); }); await sleep(900);
  const o0 = await tabOrder();
  if (o0.length < 3) check(false, "three tabs to drag among (" + o0.length + ")");
  else {
    const ta = await tabBox(o0[0]), tc = await tabBox(o0[2]);
    await p.mouse.move(ta.x, ta.y);
    await p.mouse.down();
    await p.mouse.move(ta.x + 8, ta.y, { steps: 2 }); await sleep(120);
    const dragOn = await p.evaluate(t => ({ root: document.documentElement.classList.contains("tabdrag"),
      dragging: !!document.querySelector('#tabsBar .tab[data-tid="' + t + '"].dragging') }), o0[0]);
    await p.mouse.move(tc.l + tc.w * 0.75, tc.y, { steps: 12 }); await sleep(300);
    await p.mouse.up(); await sleep(700);
    const o1 = await tabOrder();
    const dragOff = await p.evaluate(t => ({ root: document.documentElement.classList.contains("tabdrag"),
      dragging: !!document.querySelector('#tabsBar .tab[data-tid="' + t + '"].dragging') }), o0[0]);
    check(dragOn.root && dragOn.dragging, "a press and a move put the strip into a drag (" + JSON.stringify(dragOn) + ")");
    check(o1.indexOf(o0[0]) > 0, "and the dragged tab lands past where it began (0 to "
      + o1.indexOf(o0[0]) + " of " + o1.length + ")");
    check(o1.length === o0.length && o1.slice().sort().join() === o0.slice().sort().join(),
      "with the same tabs in the strip (" + o1.length + ")");
    check(!dragOff.root && !dragOff.dragging, "and the release clears the drag (" + JSON.stringify(dragOff) + ")");
  }
  clean(e, "the tab drag");

  /* An empty category: its own icon over the message, the key named, the add button ringed, and
     the supporting flag reaching the editor. The category is made and removed here. */
  e = since();
  const emptyCat = await p.evaluate(() => { const k = ensureCustomCat("Smoke shelf"); rebuildCards(); cats = [k]; drawPills(); render(); return k; });
  await sleep(700);
  const es = await p.evaluate(() => { const el = document.querySelector("#list .empty"), fab = document.getElementById("addCardFab");
    return { text: (el && el.textContent || "").replace(/\s+/g, " ").trim(), icon: !!(el && el.querySelector("svg.empty-ic")), before: el && getComputedStyle(el, "::before").content,
             key: el && [...el.querySelectorAll("kbd")].map(k => k.textContent).join("+"), nudge: fab.classList.contains("nudge"), ring: getComputedStyle(fab, "::after").animationName }; });
  check(es.icon && es.before === "none" && /empty/i.test(es.text) && es.key === "Alt+N" && es.nudge && es.ring === "fabNudge",
    "an empty category shows its own icon, names the key and rings the add button (" + JSON.stringify({ key: es.key, icon: es.icon, nudge: es.nudge }) + ")");
  const shut = await p.evaluate(() => !document.getElementById("modalCard").offsetParent);
  await p.keyboard.down("Alt"); await p.keyboard.press("KeyN"); await p.keyboard.up("Alt"); await sleep(700);
  const editorUp = await p.evaluate(() => { const m = document.getElementById("modalCard"); return { on: !!(m && m.offsetParent), title: m ? m.textContent.slice(0, 40) : "" }; });
  await p.keyboard.press("Escape"); await sleep(500);
  check(shut && editorUp.on, "Alt+N opens the card editor (" + JSON.stringify(editorUp.title.trim().slice(0, 20)) + ")");
  await p.evaluate(k => openCategoryEditor(k), emptyCat); await sleep(700);
  const sup = await p.evaluate(k => { const c = document.getElementById("ceAlways"); if (!c) return { present: false };
    const was = isAlwaysCat(k);   // read BEFORE the save, or the check asserts nothing
    c.click(); const lit = c.classList.contains("on"); document.getElementById("ceSave").click();
    return { present: true, was, lit }; }, emptyCat);
  await sleep(700);
  check(sup.present && !sup.was && sup.lit && await p.evaluate(k => isAlwaysCat(k), emptyCat), "the category editor's asterisk lights and saves");
  const round = await p.evaluate(() => {
    const m = cards.find(c => /\{GREET\}/.test(c.en || "") && /\{GREET\}/.test(c.pl || "")) || cards[0];
    const en = fill("{GREET}", m, 0, "en"), pl = fill("{GREET}", m, 0, "pl");
    const c = { format: 1, kind: "playbook-catalog", name: "Round trip", version: "t1",
      categories: { open: { label: "Open" } }, intents: { en: ["one"], pl: ["jeden"] },
      cards: [{ id: "x:1", c: "open", t: "English only", en: "Hello there.", pl: "" }] };
    let imported = null;
    try { imported = (parseCatalogFile("window.PB_CATALOG=" + JSON.stringify(c) + ";").cards || []).length; }
    catch (e) { imported = "threw: " + (e.message || e); }
    return { en, pl, imported };
  });
  check(round.en !== round.pl && !!round.en && !!round.pl, "a token fills in the language it is handed, not the one on screen (" + JSON.stringify([round.en, round.pl]) + ")");
  check(round.imported === 1, "a card with no Polish imports (" + JSON.stringify(round.imported) + ")");

  /* The export, driven from the Manage button a person would use.

     Until 2026-09-13 the quick-facts rule was read off currentCatalog(), a name catalog-file.js
     exported for this check and for nothing else, which asserted the builder's opinion of what
     it would write. The rule is a property of the FILE, so the file is what this reads, and on
     the way it walks the one path nothing else in the suite touches: Manage, the export button,
     the name dialog, the header, the save route.

     The two save routes are stubbed at the PLATFORM boundary and neither of them is the
     engine's. Chrome on file:// does have showSaveFilePicker and saveCatalogFile takes that
     branch; measured without the stub, the picker never settles, no blob is ever made and the
     export simply hangs, which is what a save dialog nobody can click looks like. Firefox has
     no picker and falls to the anchor-and-blob path. Both are captured, so whichever route the
     browser under test takes, the bytes are read; and both are put back afterwards.

     COUNTS AND VERDICTS ONLY. What comes back is the catalog, so what is printed is a byte
     count, a card count, the type and length of one field, and whether it equals the built-in. */
  e = since();
  await p.evaluate(() => {
    window.__pbSaved = [];
    window.__pbRealBlobUrl = URL.createObjectURL.bind(URL);
    window.__pbRealPicker = window.showSaveFilePicker;
    URL.createObjectURL = b => { window.__pbSaved.push(b); return window.__pbRealBlobUrl(b); };
    window.showSaveFilePicker = o => Promise.resolve({ name: (o && o.suggestedName) || "catalog",
      createWritable: () => Promise.resolve({
        write: t => { window.__pbSaved.push(new Blob([t])); return Promise.resolve(); },
        close: () => Promise.resolve() }) });
  });
  const saveCatalog = async () => {
    const before = await p.evaluate(() => window.__pbSaved.length);
    await p.evaluate(() => document.querySelector('[data-act="manage"]').click()); await sleep(800);
    const btn = await p.evaluate(() => { const x = document.getElementById("mgExportCatalog");
      if (!x) return false; x.click(); return true; }); await sleep(700);
    const named = await p.evaluate(() => { const i = document.getElementById("eNameInp"), y = document.getElementById("eNameYes");
      if (!i || !y) return false; i.value = "Smoke"; i.dispatchEvent(new Event("input")); y.click(); return true; });
    await sleep(1600);
    const out = await p.evaluate(async n => {
      /* Named zeroes rather than an absent field: this is the branch a dead export button
         lands on, and a FAIL line reading "undefined bytes" says less than "0 bytes". */
      if (window.__pbSaved.length <= n)
        return { saved: 0, bytes: 0, cards: -1, factsType: "none", factsLen: -1, builtIn: false };
      const text = await window.__pbSaved[window.__pbSaved.length - 1].text();
      const at = text.indexOf("window.PB_CATALOG = ");
      let facts = null, cards = -1;
      try { const o = JSON.parse(text.slice(at + 20, text.lastIndexOf(";")));
            facts = o.facts; cards = (o.cards || []).length; } catch (err) { facts = null; cards = -2; }
      return { saved: window.__pbSaved.length - n, bytes: text.length, cards,
               factsType: typeof facts, factsLen: typeof facts === "string" ? facts.length : -1,
               builtIn: typeof FACTS === "string" && facts === FACTS };
    }, before);
    await p.keyboard.press("Escape"); await sleep(400);
    await p.keyboard.press("Escape"); await sleep(400);
    return Object.assign({ btn, named }, out);
  };
  await p.evaluate(() => { window.__pbFactsKeep = pack.facts; pack.facts = ""; });
  const blankFile = await saveCatalog();
  await p.evaluate(() => { pack.facts = null; });
  const unsetFile = await saveCatalog();
  await p.evaluate(() => { pack.facts = window.__pbFactsKeep;
    URL.createObjectURL = window.__pbRealBlobUrl; window.showSaveFilePicker = window.__pbRealPicker; });
  check(blankFile.btn && blankFile.named && blankFile.saved === 1 && blankFile.cards > 0,
    "Manage > Export catalog names the file and writes it: " + blankFile.bytes + " bytes, "
    + blankFile.cards + " cards");
  check(blankFile.factsType === "string" && blankFile.factsLen === 0,
    "an emptied quick-facts exports empty (" + blankFile.factsType + ", " + blankFile.factsLen + " chars)");
  check(unsetFile.saved === 1 && unsetFile.builtIn && unsetFile.factsLen > 0,
    "and an unwritten one exports the built-in (" + unsetFile.factsLen + " chars, equal to FACTS: "
    + unsetFile.builtIn + ")");
  clean(e, "the catalog export");

  const tip = await p.evaluate(k => {
    openCategoryEditor(k);
    const c = document.getElementById("ceAlways");
    const one = c.title; c.click();
    return { one, two: c.title };
  }, emptyCat); await sleep(500);
  check(!!tip.one && !!tip.two && tip.one !== tip.two, "the asterisk's tooltip follows the flag");
  await p.keyboard.press("Escape"); await sleep(400);

  /* A CATALOG category, not the one made above: only a category the catalog declared has a
     version to go back to, which is what Reset means here. */
  const baseCat = await p.evaluate(() => Object.keys(BASE_CATS)[0] || null);
  if (baseCat) {
    const roll = await p.evaluate(k => {
      const declared = CATALOG_ROLES.always.indexOf(k) > -1;
      openCategoryEditor(k);
      document.getElementById("ceAlways").click();
      document.getElementById("ceSave").click();
      return { declared, flipped: isAlwaysCat(k) };
    }, baseCat); await sleep(700);
    const back = await p.evaluate(k => {
      openCategoryEditor(k);
      const r = document.getElementById("ceReset");
      const offered = !!r && !r.disabled;
      if (offered) r.click();
      return { offered, role: !!((pack.catRoles || {})[k]), now: isAlwaysCat(k) };
    }, baseCat); await sleep(700);
    check(roll.flipped === !roll.declared && back.offered && !back.role && back.now === roll.declared,
      "Reset offers itself for the flag alone and puts the catalog's back (" + JSON.stringify({ declared: roll.declared, offered: back.offered, now: back.now }) + ")");
    await p.keyboard.press("Escape"); await sleep(400);
  } else check(false, "no catalog category to test Reset against");

  await p.evaluate(k => { removeCategory(k); cats = []; rebuildCards(); drawPills(); render(); }, emptyCat); await sleep(600);
  clean(e, "the empty category");

  /* The star, the hide and the removal - the three things a person does to a card that change
     what is on the desk, and until 2026-09-13 nothing in this file pressed any of them. The
     static suite has ordering tests, but tests/test.js supplies its OWN isFavourite over its own
     Set (see the note at its [4/5]), so what it proves is the comparator, not the app's state.

     Read from the screen throughout: aria-pressed and the classes on the star's own button, the
     card's index in #list, and the list's length. Nothing here reads pack, isFavourite or any
     other module name.

     It goes last of the blocks that share this context because the removal is the one thing in
     the file that cannot be undone: a removed catalog card is gone for the rest of the session.
     Everything above has finished with its counts, the created category is gone and cats is
     empty, so the list is whole. Controls, 2026-09-13, each against a rebuilt engine: with
     toggleFavourite returning at its first line the three star checks fail and the other five
     pass; with hideCard and removeCard returning likewise, the four below fail and the three
     above pass. */
  e = since();
  await p.keyboard.press("Escape"); await sleep(300);
  const pick = await p.evaluate(() => { const cs = [...document.querySelectorAll("#list .card")];
    const c = cs[Math.min(40, cs.length - 1)];
    return { id: c ? c.getAttribute("data-id") : null, n: cs.length }; });
  const readStar = id => p.evaluate(i => { const c = document.querySelector('#list .card[data-id="' + CSS.escape(i) + '"]');
    const b = c && c.querySelector('[data-act="fav"]');
    const cs = [...document.querySelectorAll("#list .card")];
    return { present: !!c, pressed: b && b.getAttribute("aria-pressed"), on: !!(b && b.classList.contains("on")),
      fill: !!(b && b.querySelector("svg.ic-fill")), idx: c ? cs.indexOf(c) : -1, n: cs.length }; }, id);
  const press = (id, act) => p.evaluate((i, a) => document.querySelector('#list .card[data-id="' + CSS.escape(i) + '"] [data-act="' + a + '"]').click(), id, act);
  const s0 = await readStar(pick.id);
  await press(pick.id, "fav"); await sleep(1200);
  const s1 = await readStar(pick.id);
  await press(pick.id, "fav"); await sleep(1200);
  const s2 = await readStar(pick.id);
  check(s0.pressed === "false" && s1.pressed === "true" && s2.pressed === "false",
    "a star reports itself pressed and unpressed (" + s0.pressed + " to " + s1.pressed + " to " + s2.pressed + ")");
  check(!s0.on && s1.on && s1.fill && !s2.on && !s2.fill, "and fills and empties its own icon");
  check(s0.idx > 0 && s1.idx === 0 && s2.idx === s0.idx,
    "and carries the card to the head of the list and back (" + s0.idx + " to " + s1.idx + " to " + s2.idx + ")");
  const h0 = await readStar(pick.id);
  await press(pick.id, "hide"); await sleep(1200);
  const h1 = await readStar(pick.id);
  check(h0.present && !h1.present && h1.n === h0.n - 1,
    "a hide takes the card off the desk (" + h0.n + " cards to " + h1.n + ")");
  /* Back through the Library, the only way back. Not the show-all button beside it: that one is
     a bulk unhide and would also raise cards the catalog itself put away. */
  const unhid = await p.evaluate(async i => {
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 900));
    const b = document.querySelector('#modalCard [data-show-card="' + CSS.escape(i) + '"]');
    if (!b) { dismissModal(); return { found: false }; }
    b.click(); await new Promise(r => setTimeout(r, 900));
    dismissModal(); await new Promise(r => setTimeout(r, 500));
    return { found: true }; }, pick.id);
  const h2 = await readStar(pick.id);
  check(unhid.found && h2.present && h2.n === h0.n, "and the Library puts it back (" + h2.n + " cards)");
  const r0 = await readStar(pick.id);
  const rm = await p.evaluate(async i => {
    document.querySelector('[data-act="manage"]').click(); await new Promise(r => setTimeout(r, 900));
    const b = document.querySelector('#modalCard [data-remove-card="' + CSS.escape(i) + '"]');
    if (!b) { dismissModal(); return { found: false }; }
    b.click(); await new Promise(r => setTimeout(r, 1200));
    const still = !!document.querySelector('#modalCard [data-remove-card="' + CSS.escape(i) + '"]');
    dismissModal(); await new Promise(r => setTimeout(r, 500));
    return { found: true, still }; }, pick.id);
  const r1 = await readStar(pick.id);
  check(rm.found && !rm.still, "a removal takes the card out of the Library too");
  check(r0.present && !r1.present && r1.n === r0.n - 1,
    "and off the desk (" + r0.n + " cards to " + r1.n + ")");
  clean(e, "the star, the hide and the removal");

  /* The public first run: a folder holding only the engine and the sample, as the README has a
     stranger start. The boot above never takes that path while the real catalog is beside this
     file, and a fresh context is what keeps the adopted catalog's storage out of it. */
  e = since();
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-public-"));
  let ctx;
  try {
    fs.copyFileSync(RUN.page, path.join(pub, "etiuda.html"));
    fs.copyFileSync(path.join(RUN.dir, E.FIXTURE_FILE.sample), path.join(pub, E.FIXTURE_FILE.sample));
    ctx = b.createBrowserContext ? await b.createBrowserContext() : await b.createIncognitoBrowserContext();
    const q = await ctx.newPage();
    await q.setViewport({ width: 1500, height: 950 });
    q.on("dialog", d => d.accept());
    q.on("pageerror", x => errs.push("pageerror: " + String(x.message || x)));
    q.on("console", m => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
    const missing = [];
    q.on("requestfailed", r => missing.push(r.url().split("/").pop()));
    await q.goto("file:///" + path.join(pub, "etiuda.html").replace(/\\/g, "/"), { waitUntil: "load", timeout: 90000 });
    await sleep(2400);
    const offer = await q.evaluate(() => ({ cards: document.querySelectorAll(".card").length, real: typeof PB_CATALOG !== "undefined",
      btn: ((document.querySelector("#emptySample") || {}).textContent || "").trim() }));
    await q.evaluate(() => { const x = document.querySelector("#emptySample"); if (x) x.click(); });
    await q.waitForFunction(() => document.querySelectorAll(".card").length > 0, { timeout: 20000 }).catch(() => {});
    await sleep(1200);
    for (let i = 0; i < 3; i++) { const hit = await q.evaluate(() => { const el = [...document.querySelectorAll("button")].filter(x => x.offsetWidth > 0).find(x => /skip|not now|close|pomi/i.test(x.textContent));
      if (el) { el.click(); return true; } return false; }); if (!hit) break; await sleep(500); }
    const got = await q.evaluate(() => ({ cards: document.querySelectorAll(".card").length, rows: document.querySelectorAll("#intentRailList .rail-item").length, pills: document.querySelectorAll("#pills .pill").length }));
    check(!offer.real && offer.cards === 0 && /sample/i.test(offer.btn), "with no deployment catalog the empty screen offers the sample (" + JSON.stringify(offer.btn) + ")");
    check(got.cards > 0 && got.rows > 0 && got.pills > 0, "the sample loads: " + got.cards + " cards, " + got.rows + " intents, " + got.pills + " pills");
    check(missing.every(m => /^etiuda-catalog\.js/.test(m)), "nothing looked for and missing but the deployment catalog (" + [...new Set(missing)].join(", ") + ")");
  } catch (x) { check(false, "the public first run could not run: " + (x && x.message || x)); }
  finally { if (ctx) await ctx.close().catch(() => {}); fs.rmSync(pub, { recursive: true, force: true }); }
  clean(e, "the public first run");

  reachedEnd = true;
})()
  /* AN ABORT IS NOT A RESULT, and it used to read as one: a throw left the log holding a run of
     ok lines, no FAIL, no tally and no verdict, so anything counting lines saw a clean partial
     run. Measured 2026-09-12 with the catalog absent - 70 of 119, exit 1, nothing said. The
     summary now prints from the finally whatever happened, and says which of the two it was. */
  .catch(e => { check(false, "the run stopped before the end: " + String(e && e.message || e)); console.error(e); })
  .finally(async () => {
    if (b) await b.close().catch(() => {});
    RUN.drop();
    console.log(errs.length ? "  ALL ERRORS: " + errs.join(" | ") : "  no page or console errors in the whole run");
    console.log("  " + (checks - fails) + "/" + checks + " checks passed in " + Math.round((Date.now() - t0) / 1000) + "s" + (fails ? " - " + fails + " FAILED" : ""));
    if (reachedEnd) process.exitCode = fails;
    else {
      console.log("  SUITE DID NOT COMPLETE: it stopped after " + checks + " checks, and the tally above is not a verdict");
      process.exitCode = E.NO_VERDICT;
    }
  });
