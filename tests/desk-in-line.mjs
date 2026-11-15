/* THE DESK BROUGHT IN LINE WITH STUDIO. Chrome, headless, no fixtures, no window.
 *
 *   node tests/desk-in-line.mjs [--engine <file>]
 *
 * The case is Max's testing note 8 (2026-11-15 11:25): "There are many ways in which Studio and Desk should be bring in
 * line visually. In particular: the way section titles behave when hovered over and when selected looks much better in
 * Studio than in Desk, and Desk should use Studio's visual langauge in this regard. Same with menu [...] only one position
 * in Menu should be markable at the time." STUDIO below holds Studio's own computed values for its section rows, read
 * from its built page in both themes; the desk's rows are held to them, not to a redrawing.
 *
 * A row is marked when its computed background is not transparent. The pointer is the browser's own (a real :hover) and
 * the keys are real key presses. The catalog is the shipped sample. Legs:
 *   ilr1..ilr6  the rails of Settings, the Library and Maintenance, light and dark: the selected row is Studio's (the panel's
 *               face, its lift, bold, radius 8 px, the icon in the accent) and a row under the pointer takes Studio's fill
 *   ilo1, ilo2  one row of a rail marked at a time: a row holding the keyboard's focus goes unmarked while the pointer marks
 *               another, and the hovered row goes unmarked once the keys are used
 *   ilm1..ilm4  one row of the Menu marked at a time, under the pointer and the keys (opened by the pointer, none until the
 *               pointer reaches one; leaving the rows, none; opened by the keys, the first; an arrow key moves the one mark)
 *   ilm5, ilm6  the marked menu row is Studio's quiet fill, its step above the ground Studio's, no ring, the icon dim, no fade
 *   ilm7        an object's menu keeps one mark under the pointer and the keys
 *   ils1, ils2  the selected tab wears no colour spine, dark and light (Max: "please get rid of it")
 * Exit code is the number of failed checks; 78 when the run could not complete.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

let fails = 0, checks = 0, EXPECTED = 0;
const check = (ok, what, detail) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : "")); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

/* Studio's section rows, as its page computes them (light, dark). */
const STUDIO = {
  light: { onBg: "rgb(255, 255, 255)", onShadow: "rgba(15, 23, 42, 0.1) 0px 1px 2px 0px", hoverBg: "color(srgb 0.897059 0.906078 0.92098)" },
  dark: { onBg: "rgb(19, 20, 24)", onShadow: "rgba(0, 0, 0, 0.5) 0px 1px 2px 0px", hoverBg: "color(srgb 0.137647 0.145686 0.165098)" },
};

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-in-line-"));
fs.copyFileSync(ENGINE, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");

async function boot(browser, theme) {
  const p = await browser.newPage();
  p.on("dialog", (d) => { console.log("       a dialog the page opened, dismissed: " + d.type()); d.dismiss().catch(() => {}); });
  await p.setViewport({ width: 1400, height: 900 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((theme) => {
    try { for (const k of ["eTourDone_v3", "eTourInvite_v3", "eNameAsked"]) localStorage.setItem(k, "1"); localStorage.setItem("eTheme", theme); } catch (e) {}
  }, theme);
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await sleep(600);
  return p;
}
const closePage = (p) => Promise.race([p.close().catch(() => {}), sleep(5000)]);
const OPEN = { settings: () => window.openScreenTab("settings"), library: () => window.openManage(), maintenance: () => window.openScreenTab("maintenance") };
async function openScreen(p, which) {
  await p.evaluate(OPEN[which]);
  await p.waitForSelector("#screenHost .sx-nav .sx-sec.on", { timeout: 10000 });
  await p.mouse.move(2, 880);
  await sleep(300);
}
/** The rail's rows, which are marked, which is selected, and where each sits. */
const railRows = (p) => p.evaluate(() => {
  const rows = Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec")).filter((r) => r.offsetParent !== null);
  const alpha = (bg) => { if (bg === "transparent") return 0; const m = /\/\s*([\d.]+)\)$/.exec(bg) || /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(bg); return m ? parseFloat(m[1]) : 1; };
  return rows.map((r, i) => { const b = r.getBoundingClientRect(), cs = getComputedStyle(r);
    return { i, on: r.classList.contains("on"), marked: alpha(cs.backgroundColor) > 0, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
});

let browser = null, done = false;
try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  // <<rows
  EXPECTED += 8;
  {
    let n = 0;
    for (const theme of ["light", "dark"]) {
      const p = await boot(browser, theme);
      for (const which of ["settings", "library", "maintenance"]) {
        n++;
        await openScreen(p, which);
        const got = await p.evaluate(() => {
          const rows = Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec")).filter((r) => r.offsetParent !== null);
          const on = rows.find((r) => r.classList.contains("on")), off = rows.find((r) => !r.classList.contains("on"));
          const probe = document.createElement("i"); probe.style.color = "var(--accent)"; on.appendChild(probe);
          const accent = getComputedStyle(probe).color; probe.remove();
          const cs = getComputedStyle(on), ic = on.querySelector(".sx-ic");
          const b = off.getBoundingClientRect();
          return { theme: document.documentElement.dataset.theme, bg: cs.backgroundColor, shadow: cs.boxShadow, weight: cs.fontWeight, radius: cs.borderRadius,
            icon: ic ? getComputedStyle(ic).color : null, accent, off: [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)] };
        });
        await p.mouse.move(got.off[0], got.off[1]);
        await sleep(150);
        got.hover = await p.evaluate(() => { const r = document.querySelector("#screenHost .sx-nav .sx-sec:hover"); return r ? getComputedStyle(r).backgroundColor : null; });
        const s = STUDIO[theme];
        check(got.theme === theme && got.bg === s.onBg && got.shadow === s.onShadow && got.weight === "600" && got.radius === "8px"
          && got.icon === got.accent && got.hover === s.hoverBg,
          "ilr" + n + " " + which + ", " + theme + ": the selected row is Studio's (the panel's face, its lift, bold, 8 px, the icon in the accent) and a row under the pointer takes Studio's fill", got);
      }
      /* One row marked at a time, on Settings' rail. */
      if (theme === "light") {
        await openScreen(p, "settings");
        let rows = await railRows(p);
        const keyed = rows.filter((r) => !r.on)[0], pointed = rows.filter((r) => !r.on)[2];
        await p.keyboard.press("Shift");
        await p.evaluate((i) => { Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec")).filter((r) => r.offsetParent !== null)[i].focus(); }, keyed.i);
        await sleep(100);
        const byKeys = (await railRows(p)).filter((r) => r.marked && !r.on).map((r) => r.i);
        await p.mouse.move(pointed.x, pointed.y);
        await sleep(150);
        const byPointer = (await railRows(p)).filter((r) => r.marked && !r.on).map((r) => r.i);
        await p.keyboard.press("Shift");
        await sleep(100);
        const back = (await railRows(p)).filter((r) => r.marked && !r.on).map((r) => r.i);
        check(byKeys.join() === String(keyed.i) && byPointer.join() === String(pointed.i),
          "ilo1 a row holding the keyboard's focus goes unmarked while the pointer marks another row of the rail", { keyed: keyed.i, pointed: pointed.i, byKeys, byPointer });
        check(back.join() === String(keyed.i),
          "ilo2 the keys used again, the focused row is the one mark and the row under the resting pointer goes unmarked", { keyed: keyed.i, pointed: pointed.i, back });
      }
      await closePage(p);
    }
  }
  // rows>>

  // <<menu
  EXPECTED += 7;
  {
    const marks = (p, sel) => p.evaluate((sel) => {
      const m = document.querySelector(sel);
      const rows = Array.prototype.filter.call(m.querySelectorAll('button[role="menuitem"]'), (b) => !b.hidden && b.offsetParent !== null);
      const alpha = (bg) => { if (bg === "transparent") return 0; const x = /\/\s*([\d.]+)\)$/.exec(bg) || /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(bg); return x ? parseFloat(x[1]) : 1; };
      return { n: rows.length, on: rows.map((r, i) => (alpha(getComputedStyle(r).backgroundColor) > 0 ? i : -1)).filter((i) => i >= 0),
        at: rows.map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; }) };
    }, sel);
    for (const theme of ["light", "dark"]) {
      const p = await boot(browser, theme);
      if (theme === "light") {
        await p.mouse.move(2, 880);
        await p.click("#settingsBtn");
        await sleep(200);
        let m = await marks(p, "#settingsMenu");
        check(m.n >= 4 && m.on.length === 0, "ilm1 the Menu opened by the pointer marks no row", m.on);
        await p.mouse.move(m.at[1][0], m.at[1][1]); await sleep(120);
        const a = await marks(p, "#settingsMenu");
        await p.mouse.move(m.at[3][0], m.at[3][1]); await sleep(120);
        const b = await marks(p, "#settingsMenu");
        check(a.on.join() === "1" && b.on.join() === "3", "ilm2 the pointer on a row marks that row alone, and moving on hands the mark over", { a: a.on, b: b.on });
        await p.mouse.move(2, 880); await sleep(120);
        const left = await marks(p, "#settingsMenu");
        await p.keyboard.press("ArrowDown"); await sleep(120);
        const down = await marks(p, "#settingsMenu");
        check(left.on.length === 0 && down.on.join() === "0", "ilm3 the pointer leaving the rows leaves none marked, and the arrow key then marks the first alone", { left: left.on, down: down.on });
        await p.keyboard.press("Escape"); await sleep(200);
        await p.focus("#settingsBtn");
        await p.keyboard.press("Enter"); await sleep(200);
        m = await marks(p, "#settingsMenu");
        await p.mouse.move(m.at[1][0], m.at[1][1]); await sleep(120);
        const pointed = await marks(p, "#settingsMenu");
        await p.keyboard.press("ArrowDown"); await sleep(120);
        const keyed = await marks(p, "#settingsMenu");
        check(m.on.join() === "0" && pointed.on.join() === "1" && keyed.on.join() === "2",
          "ilm4 opened by the keys the first row is marked, the pointer then hands the one mark to its row, and an arrow key moves it while the pointer rests", { opened: m.on, pointed: pointed.on, keyed: keyed.on });
        await p.keyboard.press("Escape"); await sleep(200);
      }
      /* Studio's menu look: a quiet fill as far above the menu's ground as Studio's is above its own, no ring, the icon dim, no fade. */
      await p.mouse.move(2, 880);
      await p.click("#settingsBtn");
      await sleep(200);
      const m = await marks(p, "#settingsMenu");
      await p.mouse.move(m.at[1][0], m.at[1][1]); await sleep(150);
      const look = await p.evaluate(() => {
        const menu = document.querySelector("#settingsMenu"), row = menu.querySelector('button[role="menuitem"]:focus');
        const px = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = "#000"; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); };
        const ic = row && row.querySelector(".sx-ic,.ic");
        const probe = document.createElement("i"); probe.style.color = "var(--dim)"; menu.appendChild(probe); const dim = getComputedStyle(probe).color; probe.remove();
        return row ? { mark: px(getComputedStyle(row).backgroundColor), ground: px(getComputedStyle(menu).backgroundColor), shadow: getComputedStyle(row).boxShadow,
          icon: ic ? getComputedStyle(ic).color : null, dim, fade: getComputedStyle(row).transitionDuration } : null;
      });
      /* Studio's step: light #e8ecf1 on #ffffff, dark #20242b on #131418. */
      const step = theme === "light" ? [-23, -19, -14] : [13, 16, 19];
      const steps = look ? look.mark.map((c, i) => c - look.ground[i]) : null;
      check(!!look && steps.every((d, i) => Math.abs(d - step[i]) <= 1) && look.shadow === "none" && look.icon === look.dim && /^0s(, 0s)*$/.test(look.fade),
        "ilm" + (theme === "light" ? 5 : 6) + " " + theme + ": the marked row is Studio's quiet fill, its step above the ground Studio's, no ring, the icon dim, no fade", { look, steps, step });
      await p.keyboard.press("Escape"); await sleep(150);
      if (theme === "dark") {
        /* An object's menu, opened by the pointer on a card, keeps one mark under the pointer and the keys. */
        const card = await p.evaluate(() => { const c = document.querySelector("#list .card .txt") || document.querySelector("#list .card"); if (!c) return null; const r = c.getBoundingClientRect(); return [Math.round(r.left + 30), Math.round(r.top + r.height / 2)]; });
        if (card) await p.mouse.click(card[0], card[1], { button: "right" });
        await sleep(250);
        const has = await p.$(".menu.e-ctx");
        if (!card || !has) check(false, "ilm7 an object's menu to point at", { card, menu: !!has });
        else {
          const c0 = await marks(p, ".menu.e-ctx");
          await p.mouse.move(c0.at[c0.n - 1][0], c0.at[c0.n - 1][1]); await sleep(150);
          const c1 = await marks(p, ".menu.e-ctx");
          await p.keyboard.press("ArrowDown"); await sleep(150);
          const c2 = await marks(p, ".menu.e-ctx");
          check(c0.n >= 2 && c0.on.length === 0 && c1.on.join() === String(c0.n - 1) && c2.on.join() === "0",
            "ilm7 an object's menu opened by the pointer marks no row, then the pointed row alone, then the arrow key's row alone", { opened: c0.on, pointed: c1.on, keyed: c2.on, n: c0.n });
          await p.keyboard.press("Escape");
        }
      }
      await closePage(p);
    }
  }
  // menu>>

  // <<spine
  EXPECTED += 2;
  for (const theme of ["dark", "light"]) {
    const p = await boot(browser, theme);
    const after = await p.evaluate(() => { const t = document.querySelector("#tabsBar .tab.on"); return t ? getComputedStyle(t, "::after").content : null; });
    check(after === "none", "ils" + (theme === "dark" ? 1 : 2) + " " + theme + ": the selected tab wears no colour spine over its shoulders", after);
    await closePage(p);
  }
  // spine>>

  done = true;
} catch (e) {
  console.log("  FAIL the run stopped: " + String((e && e.message) || e));
  fails++;
} finally {
  /* A close that does not answer within ten seconds ends the browser's process instead. */
  if (browser) await Promise.race([browser.close(), sleep(10000).then(() => { const c = browser.process(); if (c) c.kill(); })]);
  E.removeLab(lab);
}
if (done && checks !== EXPECTED) { console.log("  FAIL ran " + checks + " checks, expected " + EXPECTED); fails++; }
console.log((fails ? "FAIL " : "PASS ") + "desk-in-line: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done ? E.exitOf(fails) : 78);
