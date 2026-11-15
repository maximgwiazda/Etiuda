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
 *   ilb1, ilb2  the band is the cobalt at 62 per cent over the material and, without it, over the page's colour (78 per cent
 *               on a light page), white on it, and a Windows accent still takes its place (the product designer's values)
 *   ilb3        without the material, white on the light band clears 4.5:1, from the painted colour
 *   ild7        every section of the three screens: no word stands on the dots without a ground of its own
 *   ilh1..ilh5  the designer's like-for-like items Max approved: each rail's head is Studio's small capitals label, the row at
 *               its foot a row with its icon and its keys plain, and a new key's tag Studio's small pill beside the keys
 *   ilk1, ilk2  the keyboard shortcuts, in that section and in All settings, light and dark: one card of ruled rows, as
 *               Studio's card of rows (a row's top line, no gap, no radius of its own)
 *   ilw1, ilw2  a plain button inside a white card wears Studio's thin edge and white face, on the light theme only;
 *               the toolbar's button keeps its grey fill, and a primary or danger button keeps its own colour
 *   ild1..ild6  Settings, the Library and Maintenance, light and dark: the page is dotted as Studio's is, measured as the
 *               pixels of an empty 48 px patch that stand off the ground, and its first words stand on the ground (Max's
 *               note 9: "Desk has no dotted background behind Settings/Library/Maintenance, unlike similar tabs in Studio.")
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

  // <<band
  EXPECTED += 3;
  for (const theme of ["light", "dark"]) {
    const p = await boot(browser, theme);
    const got = await p.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
      /* A colour as a 0..255 triple and an alpha, whatever notation the page computes it in. */
      const px = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], Math.round(d[3] / 255 * 100) / 100]; };
      const band = () => px(getComputedStyle(document.querySelector(".row"), "::before").backgroundColor);
      const ink = () => px(getComputedStyle(document.querySelector(".brand")).color);
      const body = document.body, root = document.documentElement;
      const out = {};
      body.classList.remove("e-backdrop", "e-band-pale", "e-band-deep"); await wait(80);
      out.bare = band(); out.bareInk = ink();
      body.classList.add("e-backdrop"); await wait(80);
      out.material = band(); out.materialInk = ink();
      root.style.setProperty("--band-accent", "#c42b1c"); body.classList.add("e-band-deep"); await wait(80);
      out.accent = band();
      root.style.removeProperty("--band-accent"); body.classList.remove("e-band-deep", "e-backdrop");
      return out;
    });
    /* The cobalt #0f4c9d at 62 per cent over the material (alpha .62); without it over the page's own colour, at 78 per
       cent on a light page (#4272b1) and 62 on a dark one (#0f3569). */
    const bare = theme === "light" ? [66, 114, 177] : [15, 53, 105];
    const near = (a, b, tol) => a && b.every((v, i) => Math.abs(a[i] - v) <= (tol || 1));
    check(near(got.bare, bare) && got.bare[3] === 1 && near(got.material, [15, 76, 157]) && got.material[3] === 0.62
      && near(got.bareInk, [255, 255, 255]) && near(got.materialInk, [255, 255, 255]) && near(got.accent, [196, 43, 28]) && got.accent[3] === 0.62,
      "ilb" + (theme === "light" ? 1 : 2) + " " + theme + ": the band is the cobalt at 62 per cent over the material and over the page's colour without it, white on it, and a Windows accent still takes its place", got);
    if (theme === "light") {
      /* WCAG's relative luminance of the painted colour, against white. */
      const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = got.bare ? 1.05 / (lum(got.bare) + 0.05) : 0;
      check(ratio >= 4.5, "ilb3 light, without the material: white on the band clears 4.5:1 (" + ratio.toFixed(2) + ":1)", got.bare);
    }
    await closePage(p);
  }
  // band>>

  // <<dots
  EXPECTED += 7;
  {
    /* What the eye sees: in an empty patch of the page, the pixels that stand off the page's ground. */
    const decoder = await browser.newPage();
    const offGround = async (png, ground) => decoder.evaluate(async (b64, ground) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height }); const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - ground[0]) + Math.abs(d[i + 1] - ground[1]) + Math.abs(d[i + 2] - ground[2]) >= 12) n++;
      return n;
    }, png, ground);
    let n = 0;
    for (const theme of ["light", "dark"]) {
      const p = await boot(browser, theme);
      for (const which of ["settings", "library", "maintenance"]) {
        n++;
        await openScreen(p, which);
        const spot = await p.evaluate(() => {
          const page = document.querySelector("#screenHost .sx-page"); if (!page) return null;
          const r = page.getBoundingClientRect(), S = 48;
          const cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
          cx.fillStyle = getComputedStyle(document.querySelector("#screenHost .sx")).backgroundColor; cx.fillRect(0, 0, 1, 1);
          const ground = Array.from(cx.getImageData(0, 0, 1, 1).data).slice(0, 3);
          const word = page.querySelector(".sx-crumb, h2, .lede, .sx-block>h3"), wordBg = word ? getComputedStyle(word).backgroundColor : null;
          const sx = getComputedStyle(document.querySelector("#screenHost .sx")).backgroundColor;
          for (let y = r.bottom - S - 8; y > r.top + 8; y -= 16) for (let x = r.right - S - 24; x > r.left + 8; x -= 16) {
            let clear = true;
            for (const [dx, dy] of [[0, 0], [S / 2, 0], [S, 0], [0, S / 2], [S / 2, S / 2], [S, S / 2], [0, S], [S / 2, S], [S, S]]) {
              const e = document.elementFromPoint(x + dx, y + dy); if (e !== page) { clear = false; break; }
            }
            if (clear) return { x: Math.round(x), y: Math.round(y), w: S, h: S, ground, wordOnGround: wordBg === sx };
          }
          return { ground, none: true };
        });
        if (!spot || spot.none) { check(false, "ild" + n + " " + which + ", " + theme + ": an empty patch of the page to look at", spot); continue; }
        const png = await p.screenshot({ clip: { x: spot.x, y: spot.y, width: spot.w, height: spot.h }, encoding: "base64", captureBeyondViewport: false });
        const lit = await offGround(png, spot.ground);
        /* A 48 px patch of a 16 px grid holds nine dots; each covers at least a pixel. */
        check(lit >= 9 && lit <= 48 * 48 / 4 && spot.wordOnGround,
          "ild" + n + " " + which + ", " + theme + ": the page is dotted as Studio's is (" + lit + " pixels of a 48 px patch stand off the ground) and its first words stand on a patch of the ground", { lit, spot });
      }
      await closePage(p);
    }
    await closePage(decoder);
    /* No word stands on the dots: every visible word of every section of the three screens has a ground of its own
       (an ancestor inside the page with an opaque background) before the page itself. */
    const p = await boot(browser, "light");
    const loose = [];
    for (const [which, attr] of [["settings", "data-sx"], ["library", "data-lm"], ["maintenance", "data-mt"]]) {
      await openScreen(p, which);
      const keys = await p.evaluate((attr) => Array.from(document.querySelectorAll("#screenHost .sx-nav .sx-sec")).map((x) => x.getAttribute(attr)), attr);
      for (const k of keys) {
        await p.evaluate((attr, k) => { const x = document.querySelector("#screenHost .sx-nav .sx-sec[" + attr + '="' + k + '"]'); if (x) x.click(); }, attr, k);
        await sleep(500);
        const found = await p.evaluate(() => {
          const page = document.querySelector("#screenHost .sx-page"); if (!page) return ["no page"];
          const out = [], w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
          const clear = (bg) => bg === "transparent" || /,\s*0\)$|\/ 0\)$/.test(bg);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const e = n.parentElement;
            if (!n.nodeValue.trim() || !e || e.offsetParent === null) continue;
            let a = e; while (a && a !== page && clear(getComputedStyle(a).backgroundColor)) a = a.parentElement;
            if (!a || a === page) out.push((e.className || e.tagName) + ": " + n.nodeValue.trim().slice(0, 24));
          }
          return out.slice(0, 3);
        });
        if (found.length) loose.push(which + "/" + k + " " + found.join(" | "));
      }
    }
    check(loose.length === 0, "ild7 no word of any section of the three screens stands on the dots without a ground of its own", loose);
    await closePage(p);
  }
  // dots>>

  // <<heads
  EXPECTED += 5;
  for (const theme of ["light", "dark"]) {
    const p = await boot(browser, theme);
    const heads = [], foots = [];
    for (const which of ["settings", "library", "maintenance"]) {
      await openScreen(p, which);
      const got = await p.evaluate(() => {
        const nav = document.querySelector("#screenHost .sx-nav");
        const h = nav.querySelector("h1, .screen-head h2, .sx-nav-title h2"), cs = h ? getComputedStyle(h) : null;
        const probe = document.createElement("i"); probe.style.color = "var(--dim)"; nav.appendChild(probe); const dim = getComputedStyle(probe).color; probe.remove();
        const f = nav.querySelector(".sx-foot .sx-maint"), fc = f ? getComputedStyle(f) : null, k = f && f.querySelector("kbd"), kc = k ? getComputedStyle(k) : null;
        return { head: cs ? [cs.fontSize, cs.fontWeight, cs.textTransform, cs.color === dim] : null,
          foot: fc ? [!!f.querySelector("svg.sx-ic"), fc.display, fc.padding, fc.fontSize, kc ? kc.borderTopWidth + " " + kc.backgroundColor : "no keys"] : null };
      });
      heads.push(which + " " + JSON.stringify(got.head)); foots.push(which + " " + JSON.stringify(got.foot));
    }
    if (theme === "light") {
      check(heads.every((x) => x.endsWith('["11px","600","uppercase",true]')), "ilh1 the head of each rail is Studio's small capitals label in the dim ink", heads);
      check(foots.every((x) => /\[true,"flex","7px 10px","13\.5px","(0px rgba\(0, 0, 0, 0\)|no keys)"\]$/.test(x)),
        "ilh2 the row at each rail's foot is a row like those above it: its icon, Studio's padding and size, its keys plain", foots);
    }
    await openScreen(p, "settings");
    await p.evaluate(() => { const x = document.querySelector('#screenHost .sx-nav .sx-sec[data-sx="keys"]'); if (x) x.click(); });
    await sleep(500);
    const tags = await p.evaluate(() => Array.from(document.querySelectorAll("#screenHost .sc-row .chg")).map((c) => {
      const cs = getComputedStyle(c); return [c.parentElement.classList.contains("sc-row"), !!(c.nextElementSibling && c.nextElementSibling.classList.contains("sc-binds")), cs.borderTopLeftRadius, cs.backgroundColor];
    }));
    const bg = theme === "light" ? "rgb(232, 236, 241)" : "rgb(32, 36, 43)";
    if (theme === "light") check(tags.length >= 1 && tags.every((x) => x[0] && x[1] && x[2] === "999px"), "ilh3 a new key's tag stands beside the keys, a pill of its own, not in the row's name", tags);
    check(tags.length >= 1 && tags.every((x) => x[3] === bg), "ilh" + (theme === "light" ? 4 : 5) + " " + theme + ": the tag wears Studio's quiet ground", tags);
    await closePage(p);
  }
  // heads>>

  // <<shortcuts
  /* Studio's keyboard list is one card: the rows share it, a later row is ruled by a top line in the card's line colour,
     and nothing sits between them. The section and All settings are read apart, because each draws the list into its own card. */
  EXPECTED += 2;
  for (const theme of ["light", "dark"]) {
    const p = await boot(browser, theme);
    const got = await p.evaluate(() => {
      const alpha = (bg) => { if (!bg || bg === "transparent") return 0; const m = /\/\s*([\d.]+)\)$/.exec(bg) || /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(bg); return m ? parseFloat(m[1]) : 1; };
      const read = (root) => {
        const rows = [...root.querySelectorAll(".sc-row")].filter((r) => r.offsetParent !== null);
        if (rows.length < 2) return { n: rows.length };
        const list = rows[0].closest(".sc-list"), card = rows[0].closest(".sx-card");
        const lcs = getComputedStyle(list), cs = getComputedStyle(rows[1]), ccs = card ? getComputedStyle(card) : null;
        const a = rows[0].getBoundingClientRect(), b = rows[1].getBoundingClientRect();
        let beside = 0;
        for (let i = 0; i < Math.min(rows.length, 6); i++) for (let j = i + 1; j < Math.min(rows.length, 6); j++) {
          const A = rows[i].getBoundingClientRect(), B = rows[j].getBoundingClientRect();
          if (Math.abs(A.top - B.top) < 8 && Math.abs(A.left - B.left) > 40) beside++;
        }
        const probe = document.createElement("i");
        probe.style.borderTop = "1px solid var(--line)"; probe.style.background = "var(--panel)";
        document.body.appendChild(probe);
        const pcs = getComputedStyle(probe);
        const line = pcs.borderTopColor, panel = pcs.backgroundColor;
        probe.remove();
        return { n: rows.length, gap: lcs.gap, radius: cs.borderTopLeftRadius, top: cs.borderTopWidth, side: cs.borderRightWidth,
          topColor: cs.borderTopColor, line, firstTop: getComputedStyle(rows[0]).borderTopWidth,
          vGap: Math.round(b.top - a.bottom), beside, oneCard: rows.every((r) => r.closest(".sx-card") === card),
          cardBare: !ccs || alpha(ccs.backgroundColor) === 0, cardIsPanel: ccs && ccs.backgroundColor === panel };
      };
      openSettings("keys");
      const keys = read(document.getElementById("setBody"));
      openSettings("all");
      const all = read(document.querySelector('#setBody [data-sec="keys"]'));
      return { keys, all };
    });
    const ruled = (x) => x && x.n >= 8 && x.gap === "0px" && x.radius === "0px" && x.top === "1px" && x.side === "0px"
      && x.topColor === x.line && x.firstTop === "0px" && x.vGap === 0 && x.beside === 0 && x.oneCard && !x.cardBare && x.cardIsPanel;
    check(ruled(got.keys) && ruled(got.all),
      "ilk" + (theme === "light" ? "1" : "2") + " " + theme + ": the shortcuts stand in one card, a later row ruled by a top line, no gap and no radius of its own, in the section and in All settings",
      got);
    await closePage(p);
  }
  // shortcuts>>

  // <<buttons
  /* Studio's plain button on a white card is a white face with a 1px edge in the strong line. The desk's toolbar
     button is the control: the same grey fill, in both themes. Dark cards are not white, so the edge stays off them. */
  EXPECTED += 2;
  for (const theme of ["light", "dark"]) {
    const p = await boot(browser, theme);
    const got = await p.evaluate(() => {
      const alpha = (c) => { if (!c || c === "transparent") return 0; const m = /\/\s*([\d.]+)\)$/.exec(c) || /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(c); return m ? parseFloat(m[1]) : 1; };
      const swatch = (prop, value) => {
        const el = document.createElement("i"); el.style[prop] = value; document.body.appendChild(el);
        const out = prop === "background" ? getComputedStyle(el).backgroundColor : getComputedStyle(el).color; el.remove(); return out;
      };
      const face = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { w: cs.borderTopWidth, borderAlpha: alpha(cs.borderTopColor), c: cs.borderTopColor, bg: cs.backgroundColor,
          color: cs.color, text: (el.textContent || "").trim().slice(0, 24) };
      };
      openSettings("about");
      const cardBtn = [...document.querySelectorAll("#setBody .sx-card .btn")].find((b) => b.offsetParent !== null
        && !b.classList.contains("primary") && !b.classList.contains("danger"));
      const tool = document.querySelector("#theme");
      const card = cardBtn && cardBtn.closest(".sx-card");
      const cardFace = face(cardBtn), toolFace = face(tool);
      const danger = document.createElement("button"); danger.className = "btn danger"; danger.type = "button";
      const primary = document.createElement("button"); primary.className = "btn primary"; primary.type = "button";
      if (card) { card.appendChild(danger); card.appendChild(primary); }
      const out = { card: cardFace, tool: toolFace, danger: face(danger), primary: face(primary),
        lineStrong: swatch("color", "var(--line-strong)"), panel: swatch("background", "var(--panel)"),
        mix: swatch("background", "color-mix(in srgb, var(--ink) 4%, transparent)") };
      danger.remove(); primary.remove();
      return out;
    });
    const fill = (b) => b && b.w === "1px" && b.borderAlpha === 0 && b.bg === got.mix && b.bg !== got.panel;
    const thin = (b) => b && b.w === "1px" && b.c === got.lineStrong && b.bg === got.panel;
    const own = (b) => b && b.c !== got.lineStrong && b.bg !== got.panel;
    const light = theme === "light";
    check((light ? thin(got.card) : fill(got.card)) && fill(got.tool) && own(got.danger) && fill(got.primary),
      "ilw" + (light ? "1" : "2") + " " + theme + ": a plain button in a card " + (light ? "wears the thin edge and a white face" : "keeps the grey fill")
        + ", the toolbar keeps its fill, and primary and danger keep their own colour",
      got);
    await closePage(p);
  }
  // buttons>>

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
