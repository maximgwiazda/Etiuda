/* The tour's ring on the card editor, board 982 finding 2.
 *
 * On the step titled "A new card", opening another section glides the editor. Once that
 * glide has ended and the ring has stopped moving, each edge of the ring sits 4px outside
 * the editor (that step's air), the four gaps within 2px of 4 and of each other, and the
 * bubble covers neither Save nor Cancel.
 *
 * Headless Chrome, one window, the fixtures' catalog beside the engine. The day word is
 * set by the command that launches this file. A direct run only.
 */
"use strict";
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const AIR = 4;
const SLOP = 2;

function round1(n) { return Math.round(n * 10) / 10; }

function main() {
  E.windowWall("tests/tour-ring.js");
  const puppeteer = require("puppeteer-core");
  let browser = null, run = null, exitCode = 1;
  (async () => {
    run = E.runFolder("catalogV2", "sampleV2");
    browser = await puppeteer.launch({
      executablePath: E.browserPath("chrome"),
      headless: true,
      args: ["--hide-scrollbars"],
      protocolTimeout: 120000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1120, height: 760, deviceScaleFactor: 1 });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e && e.message || e)));
    await page.goto(run.url, { waitUntil: "load", timeout: 90000 });
    await require("./launch-wait.js").waitLaunchGone(page, { who: "tests/tour-ring.js" });
    await reachNewCard(page);
    const found = await page.evaluate(() => {
      const card = document.getElementById("modalCard");
      const folds = card ? [...card.querySelectorAll("details.mf-fold")] : [];
      const fold = folds.find(d => !d.open && ((d.querySelector(".mf-lab") || {}).textContent || "").trim() === "Keywords")
        || folds.find(d => !d.open);
      if (!fold) return { error: "no closed section" };
      const sum = fold.querySelector("summary");
      sum.scrollIntoView({ block: "center", inline: "nearest" });
      const r = sum.getBoundingClientRect();
      let hit = null;
      for (const fx of [0.12, 0.28, 0.5, 0.72, 0.88]) {
        const x = r.left + r.width * fx, y = r.top + r.height / 2;
        const el = document.elementFromPoint(x, y);
        if (el && (el === sum || sum.contains(el))) { hit = { x: x, y: y }; break; }
      }
      return {
        lab: ((fold.querySelector(".mf-lab") || {}).textContent || "").trim().slice(0, 24),
        before: card.offsetHeight,
        hit: hit,
        x: r.left + 10,
        y: r.top + r.height / 2
      };
    });
    if (found.error) throw new Error(found.error);
    await page.evaluate(() => {
      const card = document.getElementById("modalCard");
      window.__ringSamples = [];
      const t0 = performance.now();
      window.__ringTimer = setInterval(() => {
        const rect = card.getBoundingClientRect();
        window.__ringSamples.push({
          t: Math.round(performance.now() - t0),
          scale: String(getComputedStyle(card).scale),
          visual: Math.round(rect.height),
          layout: card.offsetHeight
        });
      }, 40);
    });
    let how = "pointer";
    if (found.hit) await page.mouse.click(found.hit.x, found.hit.y);
    else {
      how = "dispatched press";
      await page.evaluate(() => {
        const card = document.getElementById("modalCard");
        const folds = [...card.querySelectorAll("details.mf-fold")];
        const fold = folds.find(d => !d.open && ((d.querySelector(".mf-lab") || {}).textContent || "").trim() === "Keywords")
          || folds.find(d => !d.open);
        const sum = fold.querySelector("summary");
        const r = sum.getBoundingClientRect();
        sum.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: r.left + 10, clientY: r.top + r.height / 2
        }));
        sum.click();
      });
    }
    await sleep(520);
    const sampled = await page.evaluate(() => {
      clearInterval(window.__ringTimer);
      const samples = window.__ringSamples || [];
      const card = document.getElementById("modalCard");
      const open = [...card.querySelectorAll("details.mf-fold")].filter(d => d.open)
        .map(d => ((d.querySelector(".mf-lab") || {}).textContent || "").trim().slice(0, 24));
      delete window.__ringSamples;
      delete window.__ringTimer;
      return { samples: samples, open: open };
    });
    const glide = (sampled.samples || []).find(s => {
      const scale = s.scale;
      const ident = scale === "none" || scale === "1" || scale === "1 1" || scale === "1 1 1";
      return !ident || Math.abs(s.visual - s.layout) > 2;
    });
    if (!glide) throw new Error("the section did not glide (" + how + ", open now: " + (sampled.open || []).join(", ") + ")");
    const still = await waitHole(page);
    if (!still) throw new Error("the ring did not settle after the glide");
    const box = await page.evaluate(() => {
      const editor = document.getElementById("modalCard").getBoundingClientRect();
      const hole = document.getElementById("tourHole").getBoundingClientRect();
      const bub = document.getElementById("tourCard");
      const top = parseFloat(bub.style.top), left = parseFloat(bub.style.left);
      const bw = bub.offsetWidth, bh = bub.offsetHeight;
      const word = name => {
        const b = [...document.querySelectorAll("#modalCard button")].find(x => (x.textContent || "").trim() === name);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        editor: { left: editor.left, top: editor.top, right: editor.right, bottom: editor.bottom, width: editor.width, height: editor.height },
        hole: { left: hole.left, top: hole.top, right: hole.right, bottom: hole.bottom, width: hole.width, height: hole.height },
        bubble: { left: left, top: top, right: left + bw, bottom: top + bh, width: bw, height: bh, side: bub.getAttribute("data-side") },
        save: word("Save"),
        cancel: word("Cancel"),
        after: document.getElementById("modalCard").offsetHeight,
        title: (document.getElementById("tourTitle") || {}).textContent || ""
      };
    });
    const line = judge(box, found, how, glide, errs);
    console.log(line.text);
    exitCode = line.ok ? 0 : 1;
  })().catch(e => {
    console.log("tour-ring RED: " + (e && e.message ? e.message : e));
    exitCode = 1;
  }).finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (run) { try { run.drop(); } catch (e) { /* the run folder is this leg's */ } }
    process.exitCode = exitCode;
  });
}

function overlaps(a, b) {
  if (!a || !b) return false;
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0.5 && h > 0.5;
}

function judge(box, found, how, glide, errs) {
  const e = box.editor, h = box.hole;
  const gaps = {
    L: e.left - h.left,
    T: e.top - h.top,
    R: h.right - e.right,
    B: h.bottom - e.bottom
  };
  const vals = [gaps.L, gaps.T, gaps.R, gaps.B];
  const airOk = vals.every(g => Math.abs(g - AIR) <= SLOP);
  const agree = Math.max(...vals) - Math.min(...vals) <= SLOP;
  const grew = Math.abs(box.after - found.before) >= 24;
  const titleOk = box.title === "A new card";
  const saveHit = overlaps(box.bubble, box.save);
  const cancelHit = overlaps(box.bubble, box.cancel);
  const buttons = !box.save || !box.cancel ? "Save or Cancel was not on the editor" : (saveHit || cancelHit)
    ? "bubble covers " + [saveHit ? "Save" : "", cancelHit ? "Cancel" : ""].filter(Boolean).join(" and ")
    : "bubble covers neither Save nor Cancel";
  const gapText = "L " + round1(gaps.L) + " T " + round1(gaps.T) + " R " + round1(gaps.R) + " B " + round1(gaps.B);
  const ok = airOk && agree && grew && titleOk && box.save && box.cancel && !saveHit && !cancelHit && errs.length === 0;
  const why = [];
  if (!titleOk) why.push("title is " + JSON.stringify(box.title));
  if (!grew) why.push("editor height " + found.before + " to " + box.after);
  if (!airOk || !agree) why.push("ring air " + gapText + " (want each within 2 of 4)");
  if (!box.save || !box.cancel || saveHit || cancelHit) why.push(buttons);
  if (errs.length) why.push("page error: " + errs[0]);
  const text = "tour-ring " + (ok ? "GREEN: " : "RED: ")
    + (ok ? "ring air " + gapText + " (within 2 of 4); " + buttons : why.join("; "))
    + "; editor " + Math.round(e.width) + "x" + Math.round(e.height)
    + " ring " + Math.round(h.width) + "x" + Math.round(h.height)
    + "; section " + found.lab + " by " + how
    + "; bubble side " + (box.bubble.side || "none")
    + "; glide scale=" + glide.scale + " visual " + glide.visual + " layout " + glide.layout
    + " at " + glide.t + "ms";
  return { ok: ok, text: text };
}

async function waitHole(page) {
  let prev = "";
  let stable = 0;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const now = await page.evaluate(() => {
      const card = document.getElementById("modalCard");
      const hole = document.getElementById("tourHole");
      if (!card || !hole) return null;
      const scale = String(getComputedStyle(card).scale || "none");
      const ident = scale === "none" || scale === "1" || scale === "1 1" || scale === "1 1 1";
      const hr = hole.getBoundingClientRect();
      const q = n => Math.round(n * 2) / 2;
      return {
        released: ident && card.style.getPropertyValue("scale") === "" && card.style.getPropertyValue("--mg-s") === "",
        box: [q(hr.top), q(hr.left), q(hr.width), q(hr.height)].join(",")
      };
    });
    if (now && now.released && now.box === prev) stable += 1;
    else stable = 0;
    prev = now ? now.box : "";
    if (now && now.released && stable >= 2) return now;
    await sleep(120);
  }
  return null;
}

async function titleOf(page) {
  return page.evaluate(() => ((document.getElementById("tourTitle") || {}).textContent || "").trim());
}

async function pressLabel(page, rootSel, pattern) {
  return page.evaluate((sel, src) => {
    const root = document.querySelector(sel);
    if (!root) return "";
    const rx = new RegExp(src, "i");
    const el = [...root.querySelectorAll("button")].filter(x => x.offsetWidth > 0).find(x => rx.test(x.textContent || ""));
    if (!el) return "";
    el.click();
    return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }, rootSel, pattern);
}

async function reachNewCard(page) {
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0
    || !!document.querySelector("#eCatalogOffer")
    || [...document.querySelectorAll("#tourRoot button")].some(x => x.offsetWidth > 0), { timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 2; i++) {
    if (!(await pressLabel(page, "#tourRoot", "skip|not now|close|pomi"))) break;
    await sleep(600);
  }
  await page.waitForSelector("#eCatalogOffer", { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 4; i++) {
    if (!(await pressLabel(page, "#eCatalogOffer", "^(load|yes|tak)([^a-z]|$)|load it|load the catalog|sample catalog|update"))) break;
    await sleep(800);
  }
  for (let i = 0; i < 2; i++) {
    if (!(await pressLabel(page, "#tourRoot", "skip|not now|close|pomi"))) break;
    await sleep(400);
  }
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0, { timeout: 30000 });
  await page.evaluate(() => { const m = document.getElementById("eAgentModal"); if (m) m.remove(); });
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  await page.evaluate(() => {
    const b = document.getElementById("settingsBtn");
    if (b) b.click();
    const row = document.querySelector('#settingsMenu [data-act="tour"]');
    if (row) row.click();
  });
  await page.waitForFunction(() => {
    const t = document.getElementById("tourTitle");
    return t && (t.textContent || "").trim().length > 0 && document.getElementById("tourRoot") && !document.getElementById("tourRoot").hidden;
  }, { timeout: 8000 });
  for (let i = 0; i < 16; i++) {
    const now = await titleOf(page);
    if (now === "A new card") {
      const ready = Date.now() + 2000;
      while (Date.now() < ready) {
        const still = await page.evaluate(() => {
          const card = document.getElementById("modalCard");
          if (!card) return false;
          const scale = String(getComputedStyle(card).scale || "none");
          return scale === "none" || scale === "1" || scale === "1 1" || scale === "1 1 1";
        });
        if (still) return;
        await sleep(50);
      }
      return;
    }
    const moved = await page.evaluate(() => {
      const b = document.getElementById("tourNext");
      if (!b || b.disabled || b.hidden) return "";
      b.click();
      return "next";
    });
    if (!moved) throw new Error("Next is held on " + JSON.stringify(now));
    const until = Date.now() + 2000;
    let changed = false;
    while (Date.now() < until) {
      const next = await titleOf(page);
      if (next && next !== now) { changed = true; break; }
      await sleep(50);
    }
    if (!changed) throw new Error("the tour stayed on " + JSON.stringify(now));
    await sleep(200);
  }
  throw new Error("the tour never reached A new card (last title " + JSON.stringify(await titleOf(page)) + ")");
}

if (require.main === module) main();
