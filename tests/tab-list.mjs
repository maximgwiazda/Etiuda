/* All-open-tabs dropdown on overflowing tab strips.
 *
 *   node tests/tab-list.mjs
 *   ETIUDA_PLANTS=off node tests/tab-list.mjs
 *
 * Drives the built engine/etiuda.html in headless Chrome across 1280 px and 900 px,
 * light and dark themes, English and Polish chrome, verifying overflow visibility,
 * header-furniture stability, whole tab names, screen tabs, row switch, row close,
 * one-row mark rule, keyboard navigation, outside click, and an inline plant proof
 * (skipped with NOT RUN when ETIUDA_PLANTS=off).
 *
 * Exit code is the number of failed checks (78 if no verdict).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const SAVE_SHOTS = process.argv.includes("--shots");
const SHOT_DIR = "C:/Users/maxim/Workspace/etiuda-runs/tab-list-shots-2026-11-15";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0, skipped = 0;
function check(ok, msg, detail) {
  if (ok) {
    pass++;
    console.log("  ok    " + msg);
  } else {
    fail++;
    console.log("  FAIL  " + msg + (detail !== undefined ? "  " + JSON.stringify(detail) : ""));
  }
}
function skip(msg) {
  skipped++;
  console.log("  SKIP  " + msg);
}

async function openDesk(browser, { width = 1280, height = 800, theme = "light", uiLang = "en", tabCount = 1, names = [] } = {}) {
  const lab = E.runFolder("sampleV2");
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const seedTabs = Array.from({ length: tabCount }, (_, i) => ({
    id: "tb" + (i + 1),
    title: "",
    customName: names[i] || "",
    lang: "en",
    pax: names[i] ? "" : ("Customer " + (i + 1) + (i === 3 ? " Wojciech" : "")),
    paxNamed: false,
    intentIdxs: [],
    intentText: "",
    intentBox: "",
    who: "",
    gender: null,
    cats: [],
    entrySel: null,
    scrollY: 0,
    path: [],
    log: []
  }));
  await page.evaluateOnNewDocument((t, l, seeded) => {
    try {
      localStorage.setItem("eTheme", t);
      localStorage.setItem("eUiLang", l);
      localStorage.setItem("eTourDone_v3", "1");
      localStorage.setItem("eTourInvite_v3", "1");
      if (seeded.length) {
        sessionStorage.setItem("eSessionTabs", JSON.stringify({
          tabs: seeded,
          active: seeded[0].id,
          order: seeded.map(x => x.id)
        }));
      }
    } catch (_) {}
  }, theme, uiLang, seedTabs);
  await page.goto(lab.url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll("#tabsBar .tab").length >= 1, { timeout: 15000 });
  await sleep(160);
  return { lab, page };
}

async function closeDesk(ctx) {
  if (!ctx) return;
  if (ctx.page) await Promise.race([ctx.page.close().catch(() => {}), sleep(4000)]);
  if (ctx.lab) ctx.lab.drop();
}

/* Measure whether the currently focused element visibly renders focus (background, outline, border, or shadow). */
async function focusVisuals(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return { id: "", tag: "" };
    const cs = getComputedStyle(a);
    const mark = a.querySelector(".tabs-list-mark");
    const mcs = mark ? getComputedStyle(mark) : null;
    const row = a.closest(".tabs-list-row");
    const rcs = row ? getComputedStyle(row) : null;
    return {
      id: a.id || "",
      cls: a.className || "",
      outlineW: cs.outlineWidth,
      outlineStyle: cs.outlineStyle,
      bg: cs.backgroundColor,
      rowBg: rcs ? rcs.backgroundColor : "",
      markBg: mcs ? mcs.backgroundColor : "",
      markShadow: mcs ? mcs.boxShadow : ""
    };
  });
}

async function runPlantCheck() {
  if (PLANTS_OFF) {
    skip("tl-plant: NOT RUN (ETIUDA_PLANTS=off)");
    return;
  }
  const srcPath = path.join(ROOT, "src", "modules", "tabs.js");
  const raw = fs.readFileSync(srcPath, "utf8");
  const lines = raw.split("\n");
  const idx = lines.findIndex(l => l.includes("plant:tab-list-overflow"));
  check(idx >= 0, "tl-plant0: src/modules/tabs.js carries plant:tab-list-overflow");
  if (idx < 0) return;

  const runSide = async lift => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tablist-plant-"));
    try {
      fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}\n');
      const modDir = path.join(ROOT, "src", "modules");
      for (const f of fs.readdirSync(modDir)) {
        if (!f.endsWith(".js")) continue;
        let text = fs.readFileSync(path.join(modDir, f), "utf8");
        if (lift && f === "tabs.js") {
          const lns = text.split("\n");
          const hit = lns.findIndex(l => l.includes("plant:tab-list-overflow"));
          lns[hit] = "  /* plant:tab-list-overflow lifted */";
          text = lns.join("\n");
        }
        fs.writeFileSync(path.join(dir, f), text);
      }
      const mkEl = (extra = {}) => Object.assign({
        style: { removeProperty() {}, setProperty() {} },
        dataset: {},
        classList: cls(),
        children: [],
        kids: [],
        title: "",
        innerHTML: "",
        textContent: "",
        hidden: false,
        disabled: false,
        value: "",
        scrollLeft: 0,
        scrollWidth: 0,
        clientWidth: 400,
        setAttribute() {},
        removeAttribute() {},
        focus() {},
        blur() {},
        remove() {},
        contains: () => false,
        closest: () => null,
        getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 32, width: 400, height: 32 }),
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild(ch) { this.children.push(ch); return ch; },
        insertBefore(ch) { this.children.push(ch); return ch; },
        addEventListener() {}
      }, extra);
      const menu = mkEl({ hidden: false });
      const btn = mkEl({ classList: cls(["on"]) });
      const wrap = mkEl({ classList: cls(["tabs-over"]) });
      const bar = mkEl({
        scrollWidth: 200,
        clientWidth: 400,
        querySelectorAll(sel) {
          if (sel === ".tab") return this.children.filter(c => c.className && c.className.includes("tab"));
          return [];
        }
      });
      const elems = { "#tabsBar": bar, "#tabsWrap": wrap, "#tabsListMenu": menu, "#tabsListBtn": btn };
      const was = {
        window: globalThis.window,
        document: globalThis.document,
        getComputedStyle: globalThis.getComputedStyle,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        addEventListener: globalThis.addEventListener
      };
      globalThis.window = Object.assign({}, globalThis.window, { innerWidth: 1280 });
      globalThis.requestAnimationFrame = () => 0;
      globalThis.addEventListener = () => {};
      globalThis.document = {
        activeElement: menu,
        body: mkEl(),
        querySelector: sel => elems[sel] || null,
        querySelectorAll: () => [],
        documentElement: { dataset: {} },
        createElement: () => mkEl()
      };
      globalThis.getComputedStyle = () => ({ display: "flex", marginLeft: "0px", paddingLeft: "0px", paddingRight: "0px" });
      try {
        const hk = await import(pathToFileURL(path.join(dir, "hooks.js")).href);
        Object.assign(hk.hooks, {
          applyLangUI: () => {}, updateIntentPlaceholder: () => {}, drawIntentRail: () => {},
          render: () => {}, scheduleRailGeometry: () => {}, syncRailGeometry: () => {},
          shedSnap: () => null, shedHold: fn => fn(), shedStage: () => null,
          shedWordmarkW: () => 0, shedHolding: () => false, shedAnimate: () => {},
          drawPillsCore: () => {}, syncNextDock: () => {}, intentPickedLine: () => ""
        });
        const mod = await import(pathToFileURL(path.join(dir, "tabs.js")).href);
        mod.initTabs();
        bar.scrollWidth = 200;
        bar.clientWidth = 400;
        wrap.classList.add("tabs-over");
        menu.hidden = false;
        mod.drawTabs();
        return menu.hidden;
      } finally {
        Object.assign(globalThis, was);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const cls = init => {
    const s = new Set(init || []);
    return {
      add: c => s.add(c),
      remove: c => s.delete(c),
      contains: c => s.has(c),
      toggle: (c, on) => { if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); return on; }
    };
  };
  const liveHidden = await runSide(false);
  const liftedHidden = await runSide(true);
  check(liveHidden === true && liftedHidden === false,
    "tl-plant1: real code shuts #tabsListMenu when strip fits, and lifting plant:tab-list-overflow leaves it stuck open",
    { liveHidden, liftedHidden });
}

let browser = null;
try {
  const exe = E.browserPath("chrome");
  if (!exe) {
    console.log("  FAIL chrome not found");
    process.exit(78);
  }
  browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000
  });

  await runPlantCheck();

  // 1. Few tabs (no overflow): button must be hidden at 1280 px
  {
    const ctx = await openDesk(browser, { width: 1280, tabCount: 2, names: ["Alpha Client", "Beta Client"] });
    try {
      const state = await ctx.page.evaluate(() => {
        const wrap = document.querySelector("#tabsWrap");
        const btn = document.querySelector("#tabsListBtn");
        const prev = document.querySelector("#tabsPrev");
        const next = document.querySelector("#tabsNext");
        const bcs = btn ? getComputedStyle(btn) : null;
        return {
          exists: !!btn,
          over: wrap ? wrap.classList.contains("tabs-over") : null,
          btnVisible: btn ? (btn.offsetParent !== null && btn.getBoundingClientRect().width > 0) : false,
          btnDisplay: bcs ? bcs.display : null,
          prevVisible: prev ? (prev.offsetParent !== null && prev.getBoundingClientRect().width > 0) : false,
          nextVisible: next ? (next.offsetParent !== null && next.getBoundingClientRect().width > 0) : false
        };
      });
      check(state.exists && state.over === false && !state.btnVisible && !state.prevVisible && !state.nextVisible,
        "tl1 few tabs (1280 px): strip does not overflow and #tabsListBtn is hidden", state);
    } finally {
      await closeDesk(ctx);
    }
  }

  // 2. Overflow at 1280 px and 900 px; no shift to More button or header furniture
  for (const vpWidth of [1280, 900]) {
    const ctxFew = await openDesk(browser, { width: vpWidth, tabCount: 2, names: ["One", "Two"] });
    const ctxMany = await openDesk(browser, {
      width: vpWidth,
      tabCount: 14,
      names: [
        "Alice Johnson", "Bob Smith", "Carol Davis", "David Miller",
        "Eve Wilson", "Frank Moore", "Grace Taylor", "Henry Anderson",
        "Ivy Thomas", "Jack White", "Kate Harris", "Leo Martin",
        "Maya Thompson", "Noah Garcia"
      ]
    });
    try {
      const fewGeom = await ctxFew.page.evaluate(() => {
        const moreWrap = document.querySelector("#moreWrap");
        const moreBtn = document.querySelector("#moreBtn");
        const cat = document.querySelector("#catNow");
        const fills = document.querySelector(".fills");
        const row = document.querySelector(".row");
        return {
          moreHidden: moreWrap ? moreWrap.hidden : null,
          moreRect: moreBtn ? moreBtn.getBoundingClientRect().toJSON() : null,
          catRect: cat ? cat.getBoundingClientRect().toJSON() : null,
          fillsRect: fills ? fills.getBoundingClientRect().toJSON() : null,
          rowH: row ? Math.round(row.getBoundingClientRect().height) : 0
        };
      });
      const manyGeom = await ctxMany.page.evaluate(() => {
        const wrap = document.querySelector("#tabsWrap");
        const bar = document.querySelector("#tabsBar");
        const prev = document.querySelector("#tabsPrev");
        const next = document.querySelector("#tabsNext");
        const btn = document.querySelector("#tabsListBtn");
        const moreWrap = document.querySelector("#moreWrap");
        const moreBtn = document.querySelector("#moreBtn");
        const cat = document.querySelector("#catNow");
        const fills = document.querySelector(".fills");
        const row = document.querySelector(".row");
        return {
          over: wrap ? wrap.classList.contains("tabs-over") : false,
          btnRect: btn ? btn.getBoundingClientRect().toJSON() : null,
          prevRect: prev ? prev.getBoundingClientRect().toJSON() : null,
          nextRect: next ? next.getBoundingClientRect().toJSON() : null,
          wrapRect: wrap ? wrap.getBoundingClientRect().toJSON() : null,
          barOver: bar ? (bar.scrollWidth - bar.clientWidth > 1) : false,
          moreHidden: moreWrap ? moreWrap.hidden : null,
          moreRect: moreBtn ? moreBtn.getBoundingClientRect().toJSON() : null,
          catRect: cat ? cat.getBoundingClientRect().toJSON() : null,
          fillsRect: fills ? fills.getBoundingClientRect().toJSON() : null,
          rowH: row ? Math.round(row.getBoundingClientRect().height) : 0
        };
      });
      const noRoomTakenFromMore = fewGeom.moreHidden === manyGeom.moreHidden
        && Math.abs(fewGeom.fillsRect.top - manyGeom.fillsRect.top) <= 1
        && Math.abs(fewGeom.rowH - manyGeom.rowH) <= 1
        && (fewGeom.moreHidden || (Math.abs(fewGeom.moreRect.left - manyGeom.moreRect.left) <= 1 && Math.abs(fewGeom.moreRect.width - manyGeom.moreRect.width) <= 1));
      const cleanEdge = manyGeom.over && manyGeom.barOver
        && manyGeom.btnRect && manyGeom.btnRect.width === 20
        && manyGeom.prevRect && manyGeom.prevRect.width === 20
        && manyGeom.nextRect && manyGeom.nextRect.width === 20
        && manyGeom.btnRect.right <= manyGeom.wrapRect.right + 1;
      check(cleanEdge && noRoomTakenFromMore,
        `tl2 overflow (${vpWidth} px): trigger shows beside arrows, fits inside #tabsWrap, and does not move #moreBtn or header rows`,
        { cleanEdge, noRoomTakenFromMore, fewGeom, manyGeom });
    } finally {
      await closeDesk(ctxFew);
      await closeDesk(ctxMany);
    }
  }

  // 3. Light EN & Dark PL: menu style, heading, whole names, active once, one-row mark rule, switch, cross, keys, screenshots
  const cases = [
    { theme: "light", uiLang: "en", wantHead: "Open tabs", wantBtn: "All open tabs", wantScreen: "Settings" },
    { theme: "dark",  uiLang: "pl", wantHead: "Otwarte zakładki", wantBtn: "Wszystkie otwarte zakładki", wantScreen: "Ustawienia" }
  ];
  for (const cfg of cases) {
    const names = [
      "Anna Kowalska",
      "Benjamin Carter",
      "Cecylia Zielinska",
      "Daniel Novak",
      "Elena Rostova",
      "Filip Kamienski",
      "Gabriela Mazur",
      "Henryk Wisniewski",
      "Irena Dabrowska",
      "Jakub Lewandowski",
      "Karolina Wojcik",
      "Extraordinarily Long Passenger Surname For Wrap Boundary Verification"
    ];
    const ctx = await openDesk(browser, { width: 1280, height: 800, theme: cfg.theme, uiLang: cfg.uiLang, tabCount: names.length, names });
    const p = ctx.page;
    try {
      // Open via click first
      await p.click("#tabsListBtn");
      await sleep(100);
      const opened = await p.evaluate(() => {
        const menu = document.querySelector("#tabsListMenu");
        const head = document.querySelector("#tabsListHead");
        const btn = document.querySelector("#tabsListBtn");
        const rows = [...document.querySelectorAll("#tabsListRows .tabs-list-row")];
        const mcs = menu ? getComputedStyle(menu) : null;
        return {
          hidden: menu ? menu.hidden : true,
          headText: head ? head.textContent.trim() : "",
          btnLabel: btn ? btn.getAttribute("aria-label") : "",
          btnRect: btn ? btn.getBoundingClientRect().toJSON() : null,
          menuRect: menu ? menu.getBoundingClientRect().toJSON() : null,
          menuBg: mcs ? mcs.backgroundColor : "",
          menuRadius: mcs ? mcs.borderTopLeftRadius : "",
          rowCount: rows.length,
          activeCount: rows.filter(r => r.classList.contains("on")).length,
          activeName: (rows.find(r => r.classList.contains("on")) || {}).innerText || "",
          names: rows.map(r => {
            const s = r.querySelector(".tabs-list-name");
            return { text: s ? s.textContent : "", scrollW: s ? s.scrollWidth : 0, clientW: s ? s.clientWidth : 0 };
          }),
          hasCrosses: rows.every(r => !!r.querySelector(".tabs-list-x"))
        };
      });
      const normalUncut = opened.names.slice(0, 11).every((n, i) => n.text === names[i] && n.scrollW <= n.clientW + 1);
      const longWhole = opened.names[11] && opened.names[11].text === names[11];
      check(!opened.hidden && opened.headText === cfg.wantHead && opened.btnLabel === cfg.wantBtn
        && opened.rowCount === names.length && opened.activeCount === 1
        && opened.menuRect.top >= opened.btnRect.bottom && Math.abs(opened.menuRect.right - opened.btnRect.right) <= 2
        && opened.menuRadius === "10px" && normalUncut && longWhole && opened.hasCrosses,
        `tl3 (${cfg.theme}/${cfg.uiLang}): dropdown hangs below button, shows translated heading, all ${names.length} tabs in order, whole names, active once, crosses present`,
        { headText: opened.headText, btnLabel: opened.btnLabel, activeCount: opened.activeCount, normalUncut, longWhole, menuRect: opened.menuRect, btnRect: opened.btnRect });

      // Save requested screenshot on demand
      if (SAVE_SHOTS) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        // Focus active row cleanly for crisp visual screenshot
        await p.evaluate(() => {
          const on = document.querySelector("#tabsListRows .tabs-list-row.on .tabs-list-item");
          if (on) on.focus({ preventScroll: true });
        });
        await sleep(60);
        const shotFile = path.join(SHOT_DIR, cfg.theme === "light" ? "tab-list-light-en.png" : "tab-list-dark-pl.png");
        await p.screenshot({ path: shotFile });
        console.log("  shot  " + shotFile);
      }

      // Pointer hover check: hovering row 3 highlights ONLY 1 row with --menu-mark
      const row3Pos = await p.evaluate(() => {
        const it = document.querySelectorAll("#tabsListRows .tabs-list-item")[2];
        const r = it.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await p.mouse.move(row3Pos.x, row3Pos.y, { steps: 3 });
      await sleep(80);
      const hoverState = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("#tabsListRows .tabs-list-row")];
        const markProbe = document.createElement("i");
        const menu = document.querySelector("#tabsListMenu");
        markProbe.style.backgroundColor = "var(--menu-mark)";
        menu.appendChild(markProbe);
        const wantMark = getComputedStyle(markProbe).backgroundColor;
        markProbe.remove();
        const marked = rows.filter(r => getComputedStyle(r).backgroundColor === wantMark);
        return { hand: document.documentElement.dataset.hand, markedCount: marked.length, markedIdx: rows.indexOf(marked[0]), wantMark };
      });
      check(hoverState.hand === "pointer" && hoverState.markedCount === 1 && hoverState.markedIdx === 2,
        `tl4 (${cfg.theme}/${cfg.uiLang}): pointer move marks exactly one row`, hoverState);

      // Click row 4 to switch to Daniel Novak and shut list
      await p.evaluate(() => document.querySelectorAll("#tabsListRows .tabs-list-item")[3].click());
      await sleep(100);
      const switched = await p.evaluate(() => ({
        hidden: document.querySelector("#tabsListMenu").hidden,
        activeName: (document.querySelector("#tabsBar .tab.on .tab-label span") || {}).textContent || ""
      }));
      check(switched.hidden && switched.activeName === names[3],
        `tl5 (${cfg.theme}/${cfg.uiLang}): pressing row switches to tab and closes list`, switched);

      // Open Settings screen tab so screen tabs appear in list too (only need in first loop or both)
      await p.evaluate(() => { document.querySelector('#settingsMenu button[data-act="settings"]').click(); });
      await sleep(120);
      // Re-open list via keyboard (Enter on #tabsListBtn)
      await p.evaluate(() => document.querySelector("#tabsListBtn").focus());
      await p.keyboard.press("Enter");
      await sleep(100);
      const keyOpen = await p.evaluate(() => {
        const a = document.activeElement;
        const rows = [...document.querySelectorAll("#tabsListRows .tabs-list-row")];
        const onIdx = rows.findIndex(r => r.classList.contains("on"));
        const scrRow = rows.find(r => r.querySelector('[data-sid="settings"]'));
        return {
          hidden: document.querySelector("#tabsListMenu").hidden,
          hand: document.documentElement.dataset.hand,
          focusedOnActive: !!(a && a.closest(".tabs-list-row") && a.closest(".tabs-list-row").classList.contains("on")),
          onIdx,
          hasScreenRow: !!scrRow,
          screenName: scrRow ? scrRow.querySelector(".tabs-list-name").textContent : "",
          screenHasNoCross: scrRow ? !scrRow.querySelector(".tabs-list-x") : false
        };
      });
      const fv1 = await focusVisuals(p);
      check(!keyOpen.hidden && keyOpen.hand === "keys" && keyOpen.focusedOnActive && keyOpen.hasScreenRow
        && keyOpen.screenName === cfg.wantScreen && keyOpen.screenHasNoCross && fv1.outlineStyle !== "none",
        `tl6 (${cfg.theme}/${cfg.uiLang}): Enter opens list with focus on active row (${keyOpen.screenName} screen row present)`, { keyOpen, fv1 });

      // ArrowDown then ArrowUp then Enter switches to a conversation tab
      await p.keyboard.press("ArrowUp");
      await sleep(60);
      await p.keyboard.press("ArrowUp");
      await sleep(60);
      const afterArrow = await p.evaluate(() => ({
        focusedText: (document.activeElement && document.activeElement.querySelector(".tabs-list-name") || {}).textContent || "",
        activeId: document.activeElement ? (document.activeElement.id || document.activeElement.className || document.activeElement.tagName) : "",
        markedRows: [...document.querySelectorAll("#tabsListRows .tabs-list-row")].filter(r => r.matches(":focus-within")).length
      }));
      await p.keyboard.press("Enter");
      await sleep(100);
      const afterEnterRow = await p.evaluate(() => ({
        hidden: document.querySelector("#tabsListMenu").hidden,
        activeName: (document.querySelector("#tabsBar .tab.on .tab-label span") || {}).textContent || "",
        screenOn: document.body.classList.contains("screen-on")
      }));
      check(afterArrow.markedRows === 1 && afterEnterRow.hidden && !afterEnterRow.screenOn && afterEnterRow.activeName === afterArrow.focusedText,
        `tl7 (${cfg.theme}/${cfg.uiLang}): Up/Down moves mark cleanly and Enter switches back to conversation`, { afterArrow, afterEnterRow });

      // Test Space open + ArrowRight to cross + Escape return focus to #tabsListBtn
      await p.evaluate(() => document.querySelector("#tabsListBtn").focus());
      await p.keyboard.press("Space");
      await sleep(100);
      const spaceOpen = await p.evaluate(() => ({
        hidden: document.querySelector("#tabsListMenu").hidden,
        onActive: !!(document.activeElement && document.activeElement.closest(".tabs-list-row.on"))
      }));
      await p.keyboard.press("ArrowRight");
      await sleep(60);
      const xFocus = await focusVisuals(p);
      await p.keyboard.press("Escape");
      await sleep(80);
      const escState = await p.evaluate(() => ({
        hidden: document.querySelector("#tabsListMenu").hidden,
        activeId: document.activeElement ? document.activeElement.id : ""
      }));
      check(!spaceOpen.hidden && spaceOpen.onActive && xFocus.cls.includes("tabs-list-x") && xFocus.outlineStyle !== "none"
        && escState.hidden && escState.activeId === "tabsListBtn",
        `tl8 (${cfg.theme}/${cfg.uiLang}): Space opens on active row, cross shows focus, Escape shuts list and returns focus to button`,
        { spaceOpen, xFocus, escState });

      // Click outside shuts the list
      await p.click("#tabsListBtn");
      await sleep(80);
      await p.mouse.click(40, 260);
      await sleep(80);
      const afterOutside = await p.evaluate(() => document.querySelector("#tabsListMenu").hidden);
      check(afterOutside === true, `tl9 (${cfg.theme}/${cfg.uiLang}): clicking outside shuts the list`, { afterOutside });

      // Cross closes one tab & keeps list open; closing down past overflow shuts list
      await p.click("#tabsListBtn");
      await sleep(80);
      const beforeClose = await p.evaluate(() => document.querySelectorAll("#tabsListRows .tabs-list-row").length);
      await p.evaluate(() => document.querySelector("#tabsListRows .tabs-list-x").click());
      await sleep(120);
      const afterOneClose = await p.evaluate(() => ({
        hidden: document.querySelector("#tabsListMenu").hidden,
        count: document.querySelectorAll("#tabsListRows .tabs-list-row").length
      }));
      check(!afterOneClose.hidden && afterOneClose.count === beforeClose - 1,
        `tl10 (${cfg.theme}/${cfg.uiLang}): pressing cross closes tab and keeps list open on the rest`, afterOneClose);

      // Keep closing conversation tabs via cross until strip stops overflowing
      let closedTillEnd = false;
      for (let step = 0; step < beforeClose; step++) {
        const res = await p.evaluate(() => {
          const m = document.querySelector("#tabsListMenu");
          if (m.hidden) return { hidden: true, over: document.querySelector("#tabsWrap").classList.contains("tabs-over") };
          const x = document.querySelector("#tabsListRows .tabs-list-x");
          if (x) x.click();
          return null;
        });
        await sleep(60);
        if (res) { closedTillEnd = res; break; }
      }
      if (!closedTillEnd) {
        closedTillEnd = await p.evaluate(() => ({
          hidden: document.querySelector("#tabsListMenu").hidden,
          over: document.querySelector("#tabsWrap").classList.contains("tabs-over")
        }));
      }
      check(closedTillEnd.hidden && !closedTillEnd.over,
        `tl11 (${cfg.theme}/${cfg.uiLang}): shutting down until strip fits automatically closes the list`, closedTillEnd);
    } finally {
      await closeDesk(ctx);
    }
  }
} finally {
  if (browser) await Promise.race([browser.close(), sleep(8000).then(() => { const c = browser.process(); if (c) c.kill(); })]);
}

console.log((fail ? "FAIL " : "PASS ") + "tab-list: " + pass + "/" + (pass + fail) + " passed" + (skipped ? " (" + skipped + " skipped)" : ""));
process.exit(E.exitOf(fail));
