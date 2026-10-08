/* THE BADGE'S ROOM: no line of a macro's text runs under the badge in its top right corner.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/badge-room.js
 *
 * tests/smoke.js runs the same sweep inside its own run; this file alone is the quick way to watch
 * it go red and green.
 *
 * WHAT IS MEASURED. For every copyable block that carries a tag (STEP 2/3, EN 1/2, KROK, PL), the
 * tag's box against the client rects of every text node in the block outside the tag: a line
 * runs under the badge when a rect shares both an x range and a y range with it. A line's trailing
 * space is not text a person sees, so a rect that meets the badge is read again character by
 * character and only a visible character counts. The sweep covers every interface language and
 * every card language, because the tag's words differ (STEP, KROK, EN, PL), and a spread of
 * window widths from the narrowest the suite drives to a wide desk, where the reading measure
 * rather than the window sets the block's padding.
 *
 * NOT VACUOUS. A sweep over blocks whose badge never reached the text proves nothing, so the
 * run also counts the blocks whose badge reaches into the column the text is set in, and refuses
 * a sweep that found fewer than FLOOR of them. A block whose tag is too short to reach the text
 * carries no room element at all: its layout is the one it always had.
 */
"use strict";
const WIDTHS = [390, 520, 760, 1000, 1500, 1920];
const FLOOR = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Runs in the page. */
function read() {
  const out = { blocks: 0, reaching: 0, shortWithRoom: 0, longWithout: 0, hits: [], minGap: Infinity };
  const hidden = n => !n.getClientRects().length;
  document.querySelectorAll("#list .card[data-id] .txt[data-v]").forEach(el => {
    const tag = el.querySelector(":scope > .tag");
    if (!tag || hidden(el)) return;
    out.blocks++;
    const t = tag.getBoundingClientRect(), box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const colRight = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const reaches = t.left < colRight;
    if (reaches) out.reaching++;
    const room = el.querySelector(":scope > .troom");
    if (room && tag.textContent.length < 5) out.shortWithRoom++;
    if (!room && tag.textContent.length >= 5) out.longWithout++;
    const meets = r => r.right > t.left && r.left < t.right && r.bottom > t.top && r.top < t.bottom;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement && n.parentElement.closest(".tag")) continue;
      const g = document.createRange();
      g.selectNodeContents(n);
      const rects = [...g.getClientRects()].filter(r => r.width && r.height);
      if (!rects.some(meets)) {
        rects.forEach(r => { if (r.bottom > t.top && r.top < t.bottom && r.right <= t.left) out.minGap = Math.min(out.minGap, t.left - r.right); });
        continue;
      }
      let seen = false;
      for (let i = 0; i < n.data.length && !seen; i++) {
        if (/\s/.test(n.data[i])) continue;
        g.setStart(n, i); g.setEnd(n, i + 1);
        if ([...g.getClientRects()].some(meets)) seen = true;
      }
      if (seen) { out.hits.push((el.closest(".card").dataset.id || "?").slice(0, 24) + "#" + el.dataset.v + " " + tag.textContent); break; }
    }
  });
  if (out.minGap === Infinity) out.minGap = null;
  return out;
}

/* Every interface language, every card language, every width. `resize(w)` settles the page at a
   width; the language switches are the ones a person has. Returns one row per combination. */
async function sweep(p, resize) {
  const rows = [];
  for (const ui of ["en", "pl"]) {
    for (const card of ["en", "pl"]) {
      await p.evaluate(l => setUiLang(l), ui);
      await p.evaluate(l => { const b = document.querySelector('#seg button[data-l="' + l + '"]'); if (b) b.click(); }, card);
      for (const w of WIDTHS) {
        await resize(w);
        const r = await p.evaluate(read);
        rows.push(Object.assign({ ui, card, w }, r));
      }
    }
  }
  await p.evaluate(() => setUiLang("en"));
  await p.evaluate(() => { const b = document.querySelector('#seg button[data-l="en"]'); if (b) b.click(); });
  return rows;
}

/* The press on a block whose badge reaches the text, at the spot the badge's room occupies, must
   copy that block as it always did: rung, and washed green where it stood. */
async function pressAtTag(p) {
  const at = await p.evaluate(() => {
    for (const el of document.querySelectorAll("#list .card[data-id] .txt[data-v]")) {
      const tag = el.querySelector(":scope > .tag");
      if (!tag || tag.textContent.length < 5 || !el.getClientRects().length) continue;
      // A reply tucked behind its deck's front is pressed through the deck, never at rest.
      if (el.classList.contains("deck-back")) continue;
      const c = el.closest(".card[data-id]"), m = findCard(c.dataset.id);
      if (!m || /{(AGENT|INIT)}/.test(parts(m, cardLang(m))[+el.dataset.v] || "")) continue;
      el.scrollIntoView({ block: "center" });
      const t = tag.getBoundingClientRect();
      return { id: c.dataset.id, v: el.dataset.v, x: Math.round(t.left - 3), y: Math.round(t.top + t.height / 2) };
    }
    return null;
  });
  if (!at) return { ok: false, why: "no block with a long tag and no signature to press" };
  await p.mouse.click(at.x, at.y);
  await sleep(120);
  const r = await p.evaluate(a => {
    const sel = [...document.querySelectorAll("#list .txt.sel")];
    return { n: sel.length, same: sel.length === 1 && sel[0].dataset.v === a.v && sel[0].closest(".card").dataset.id === a.id,
             wash: !!document.querySelector(".e-copy-wash") };
  }, at);
  return { ok: r.same && r.wash, why: r.n + " ringed, the right block " + r.same + ", wash " + r.wash };
}

module.exports = { WIDTHS, FLOOR, read, sweep, pressAtTag };

if (require.main === module) {
  const os = require("os");
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) {}
  const E = require("./engine.js");
  const puppeteer = require("puppeteer-core");
  (async () => {
    const RUN = E.runFolder("catalogV2", "sampleV2");
    const b = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true,
      args: ["--hide-scrollbars"], protocolTimeout: 180000 });
    let fails = 0;
    const say = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
    try {
      const p = await b.newPage();
      await p.setViewport({ width: 1500, height: 950 });
      const errs = [];
      p.on("pageerror", e => errs.push(String(e.message || e)));
      const M = require("./motion.js");
      await M.boot(p, RUN.url);
      console.log("engine sha256 " + RUN.engineSha.slice(0, 12));
      const rows = await sweep(p, async w => { await p.setViewport({ width: w, height: 950 }); await sleep(500); });
      rows.forEach(r => console.log("  " + r.ui + "/" + r.card + " " + String(r.w).padStart(4) + "px: " + r.blocks + " tagged, "
        + r.reaching + " reach the text, " + r.hits.length + " run under, min gap " + r.minGap + (r.hits.length ? "  " + r.hits.slice(0, 3).join("; ") : "")));
      await p.setViewport({ width: 1500, height: 950 }); await sleep(500);
      const reach = rows.reduce((a, r) => a + r.reaching, 0);
      say(reach >= FLOOR, "br1 the sweep met " + reach + " blocks whose badge reaches the text column (floor " + FLOOR + ")");
      say(rows.every(r => r.hits.length === 0), "br2 no line runs under a badge in " + rows.length + " combinations of language and width ("
        + rows.reduce((a, r) => a + r.hits.length, 0) + " blocks do)");
      say(rows.every(r => r.shortWithRoom === 0 && r.longWithout === 0), "br3 a short tag carries no room element and a long one carries one");
      const pr = await pressAtTag(p);
      say(pr.ok, "br4 a press beside the badge copies the block as before (" + pr.why + ")");
      say(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
    } finally {
      await b.close().catch(() => {});
      RUN.drop();
    }
    process.exitCode = fails ? 1 : 0;
  })().catch(e => { console.error(e); process.exitCode = 1; });
}
