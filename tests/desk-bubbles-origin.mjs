/* Every blue bubble hangs from the control it comes from (board 1001).
 *
 *   node tests/desk-bubbles-origin.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog. The measure is the eye's: the
 * pointer's point, read from the laid-out box of the bubble's .bub-tip, lies within the control's span along
 * the edge it faces and no further than the bubble's gap (10 px) and a pixel from that edge, with the whole bubble
 * inside the window. A bubble with no pointer, off screen, or pointing elsewhere is red; so is a control not on
 * screen. Each check names the bubble.
 *   b1  the questions: Close Etiuda?, loading a catalog over one's own cards (from the Load pressed, and from the
 *       catalog's name when nothing was pressed), Clear local changes?, Reset Etiuda?, the reset left unfinished,
 *       the proxy's sign-in, the agent's name with no reply to hang from
 *   b2  every Undo, from the control whose act it undoes, or the control now in its place
 *   b3  the notices, from the control of the thing they concern, and a second from one control from the first
 *   b4  the rescue the boot guard draws at a start whose storage refuses, from Etiuda's name
 *   b5  the questions and three Undos in Polish light, English dark and Polish dark
 *   b6  the confirmations' buttons in the family's order, light and dark: the acting choice first, on the fill's dark,
 *       and the way out filled (white) and last: Close Etiuda?, loading over one's own cards, Clear local changes?, the
 *       reset left unfinished
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 11;

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-bubbles-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");
let browser = null;

async function boot({ lang = "en", theme = "light", viewport = { width: 1280, height: 860 } } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((lang, theme) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eRail", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
  }, lang, theme);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await page.$("#ecYes")) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.evaluate(() => { document.documentElement.classList.add("e-still"); });
  return page;
}

/* The measure, in the page: where the pointer's point is against the control's box. */
const MEASURE = String.raw`window.__typeIn = function(){
  const f=[...document.querySelectorAll("#modalCard input[type=text], #modalCard textarea")].find(x=>x.getClientRects().length && !x.disabled);
  f.value=f.value+" more"; f.dispatchEvent(new Event("input", {bubbles:true}));
};
window.__bubAt = function(bub, ctl){
  if(!bub) return {why:"no bubble"};
  const side=bub.getAttribute("data-side");
  const tip=bub.querySelector(":scope > .bub-tip");
  if(!tip || !tip.getClientRects().length) return {why:"no pointer", side:side};
  if(!ctl || !ctl.getClientRects().length) return {why:"no control on screen", side:side};
  const t=tip.getBoundingClientRect(), c=ctl.getBoundingClientRect();
  let perp, along, lo, hi;
  if(side==="below"){ perp=t.top-c.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="above"){ perp=c.top-t.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="right"){ perp=t.left-c.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else if(side==="left"){ perp=c.left-t.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else return {why:"side "+side};
  const b=bub.getBoundingClientRect(), shown=b.top>=-1 && b.left>=-1 && b.bottom<=innerHeight+1 && b.right<=innerWidth+1;
  const ok=shown && perp>=-2 && perp<=11 && along>=lo-0.5 && along<=hi+0.5;
  return {ok:ok, shown:shown, side:side, perp:Math.round(perp*10)/10, along:Math.round(along), span:[Math.round(lo),Math.round(hi)]};
};`;

/* One case: `act` runs in the page and answers {bub, ctl} as selectors or a note; the measure runs a few frames later. */
async function measure(page, act, arg) {
  await page.evaluate(MEASURE);
  let sel;
  try { sel = await page.evaluate(act, arg); } catch (e) { return { why: "act threw: " + String(e && e.message || e).split(String.fromCharCode(10))[0] }; }
  await sleep(450);
  return page.evaluate(sel => {
    if (!sel || sel.why) return sel || { why: "act answered nothing" };
    const bub = document.querySelector(sel.bub);
    const all = [...document.querySelectorAll(sel.ctl)].filter(e => e.getClientRects().length && !e.closest(".e-gone,[hidden]"));
    const ctl = all[Math.min(sel.ctlAt || 0, all.length - 1)];
    return Object.assign({ name: sel.name }, window.__bubAt(bub, ctl));
  }, sel);
}
const tidy = page => page.evaluate(() => {
  ["eCloseAsk", "eLoose", "eClearAsk", "eResetAsk", "eProxyAsk", "eUndo"].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  document.querySelectorAll(".bub-ask").forEach(e => { if (e.closest("body") && !e.id) e.remove(); });
  try { closeModal(); } catch (e) {}
});

/* THE QUESTIONS. Each act answers which bubble and which control. */
const QUESTIONS = [
  ["Close Etiuda?", () => {
    document.body.classList.add("e-host");
    document.getElementById("pax").value = "A traveller"; document.getElementById("pax").dispatchEvent(new Event("input", { bubbles: true }));
    askClose(() => {});
    return { name: "close", bub: "#eCloseAsk", ctl: "#winClose" };
  }],
  ["Loading a catalog over one's own cards, from the Load pressed", () => {
    openManage();
    const b = document.getElementById("mgImportCatalog");
    b.focus();
    askLoose(() => {});
    return { name: "loose-pressed", bub: "#eLoose", ctl: "#mgImportCatalog" };
  }],
  ["Loading a catalog over one's own cards, from the catalog's name when nothing was pressed", () => {
    try { closeScreenTab && closeScreenTab("library"); } catch (e) {}
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    askLoose(() => {});
    return { name: "loose-drop", bub: "#eLoose", ctl: "#catNow" };
  }],
  ["Clear local changes?", () => {
    openManage();
    document.getElementById("mgWipe").click();
    return { name: "clear", bub: "#eClearAsk", ctl: "#mgWipe" };
  }],
  ["Reset Etiuda?", () => {
    openMaintenance();
    const s = document.querySelector('.sx-sec[data-mt="storage"]'); if (s) s.click();
    document.getElementById("mtReset").click();
    return { name: "reset", bub: "#eResetAsk", ctl: "#mtReset" };
  }],
  ["the reset left unfinished", () => {
    openUnfinishedReset({ paths: ["a folder"] });
    return { name: "reset-unfinished", bub: "#eResetAsk", ctl: "#mtReset" };
  }],
  ["the proxy's sign-in", () => {
    proxyAskTake({ id: 7, host: "proxy.example", port: 8080 });
    const s = document.getElementById("signinBtn");
    return { name: "proxy", bub: "#eProxyAsk", ctl: s && s.getClientRects().length ? "#signinBtn" : "#settingsBtn" };
  }],
  ["the agent's name, with no reply to hang from", () => {
    askAgentName("{AGENT}", () => {}, null);
    const all = document.querySelectorAll(".bub.bub-ask");
    all[all.length - 1].id = "eAgentAskProbe";
    return { name: "agent", bub: "#eAgentAskProbe", ctl: "#settingsBtn" };
  }],
];

/* EVERY UNDO. Where the act takes its control away, the control expected is the one of its kind now at the same place,
   counted among those on screen before the act (ctlAt), else the last of them. */
const UNDOS = [
  ["Tab closed, by its X", () => {
    addTab(); addTab();
    const tabsNow = document.querySelectorAll("#tabsBar .tab[data-tid]");
    tabsNow[1].querySelector(".tab-x").click();
    return { name: "tab-closed", bub: "#eUndo", ctl: "#tabsBar .tab[data-tid]", ctlAt: 1 };
  }],
  ["Tab closed, the last in the strip", () => {
    const tabsNow = document.querySelectorAll("#tabsBar .tab[data-tid]");
    const n = tabsNow.length;
    tabsNow[n - 1].querySelector(".tab-x").click();
    return { name: "tab-closed-last", bub: "#eUndo", ctl: "#tabsBar .tab[data-tid]", ctlAt: n - 1 };
  }],
  ["Other tabs closed", () => {
    addTab(); addTab();
    const keep = document.querySelectorAll("#tabsBar .tab[data-tid]")[1].dataset.tid;
    closeOtherTabs(keep);
    return { name: "tabs-other", bub: "#eUndo", ctl: '#tabsBar .tab[data-tid="' + keep + '"]' };
  }],
  ["All tabs closed", () => {
    addTab();
    const p = document.getElementById("pax"); p.value = "A traveller"; p.dispatchEvent(new Event("input", { bubbles: true }));
    closeAllTabs();
    return { name: "tabs-all", bub: "#eUndo", ctl: "#tabsBar .tab[data-tid]", ctlAt: 0 };
  }],
  ["Tab cleared, the one tab", () => {
    const p = document.getElementById("pax"); p.value = "A traveller"; p.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#tabsBar .tab[data-tid] .tab-x").click();
    return { name: "tab-cleared", bub: "#eUndo", ctl: "#tabsBar .tab[data-tid]", ctlAt: 0 };
  }],
  ["Card deleted in its editor, on the desk", () => {
    const cardsNow = [...document.querySelectorAll("#list .card[data-id]")].filter(e => e.getClientRects().length);
    const at = 1, id = cardsNow[at].dataset.id;
    openCardEditor(id);
    document.getElementById("meDelete").click();
    return { name: "card-deleted-desk", bub: "#eUndo", ctl: "#list .card[data-id]", ctlAt: at };
  }],
  ["Card deleted, from its row in the Library", async () => {
    openManage();
    const seen = () => [...document.querySelectorAll("[data-remove-card]")].filter(e => e.getClientRects().length);
    const sec = document.querySelector('.sx-sec[data-lm="catmac"], button[data-lm="catmac"]'); if (sec) sec.click();
    await new Promise(r => setTimeout(r, 200));
    const h = [...document.querySelectorAll("[data-toggle]")].find(b => b.getClientRects().length && b.getAttribute("aria-expanded") === "false");
    if (h) h.click();
    await new Promise(r => setTimeout(r, 500));
    const rows = seen();
    if (rows.length < 3) return { why: "the Library shows " + rows.length + " card rows" };
    const at = 1;
    rows[at].scrollIntoView({ block: "center" });
    rows[at].click();
    return { name: "card-deleted-library", bub: "#eUndo", ctl: "[data-remove-card]", ctlAt: at };
  }],
  ["Intent deleted, from its row in the Library", async () => {
    openManage();
    const sec = document.querySelector('button[data-lm="intents"]'); if (sec) sec.click();
    await new Promise(r => setTimeout(r, 300));
    const rows = [...document.querySelectorAll("[data-remove-intent]")].filter(e => e.getClientRects().length);
    if (rows.length < 3) return { why: "the Library shows " + rows.length + " intent rows" };
    const at = 1;
    rows[at].scrollIntoView({ block: "center" });
    rows[at].click();
    return { name: "intent-deleted-library", bub: "#eUndo", ctl: "[data-remove-intent]", ctlAt: at };
  }],
  ["A name taken off the wheel, in the Library", async () => {
    openManage();
    const sec = document.querySelector('button[data-lm="who"]'); if (sec) sec.click();
    await new Promise(r => setTimeout(r, 300));
    const rows = [...document.querySelectorAll(".lw-del")].filter(e => e.getClientRects().length);
    if (rows.length < 3) return { why: "the wheel shows " + rows.length + " names" };
    const at = 1;
    rows[at].scrollIntoView({ block: "center" });
    rows[at].click();
    return { name: "wheel-name", bub: "#eUndo", ctl: ".lw-del", ctlAt: at };
  }],
  ["Intent deleted, from the panel's row", () => {
    const rows = [...document.querySelectorAll("#intentRail [data-si]")].filter(e => e.getClientRects().length);
    if (rows.length < 3) return { why: "the panel shows " + rows.length + " rows" };
    const at = 1;
    removeIntent(intentIdAt(+rows[at].dataset.si));
    return { name: "intent-deleted", bub: "#eUndo", ctl: "#intentRail [data-si]", ctlAt: at };
  }],
  ["Category reset, in its editor", () => {
    const k = document.querySelector("#pills [data-k]:not([data-k=''])").dataset.k;
    openCategoryEditor(k, true);
    const col=[...document.querySelectorAll("#ceCols .col-opt")].find(b=>b.getAttribute("aria-pressed")!=="true");
    col.click(); document.getElementById("ceSave").click();
    openCategoryEditor(k, true);
    document.getElementById("ceReset").click();
    return { name: "category-reset", bub: "#eUndo", ctl: "#ceReset" };
  }],
  ["Moved on without saving, by the editor's arrow", () => {
    const id = document.querySelector("#list .card[data-id]").dataset.id;
    openCardEditor(id);
    window.__typeIn();
    const n = document.getElementById("edNext");
    if (!n || n.disabled) return { why: "no next arrow" };
    n.click();
    return { name: "moved-arrow", bub: "#eUndo", ctl: "#edNext" };
  }],
  ["Moved on without saving, the editor closed by Escape", () => {
    const opener = document.querySelector("#settingsBtn");
    opener.focus();
    openCardEditor(document.querySelector("#list .card[data-id]").dataset.id);
    window.__typeIn();
    dismissModal();
    return { name: "moved-closed", bub: "#eUndo", ctl: "#settingsBtn" };
  }],
  ["Moved on without saving, another card opened over the typing", () => {
    const ids = [...document.querySelectorAll("#list .card[data-id]")].map(e => e.dataset.id);
    openCardEditor(ids[0]);
    window.__typeIn();
    openCardEditor(ids[1]);
    return { name: "moved-over", bub: "#eUndo", ctl: "#modalTitle .modal-t" };
  }],
  ["Moved on without saving, every editor closed at once", () => {
    openCardEditor(document.querySelector("#list .card[data-id]").dataset.id);
    window.__typeIn();
    closeAllDialogs();
    return { name: "moved-all", bub: "#eUndo", ctl: "#catNow" };
  }],
  ["Settings reset", () => {
    openSettings("data");
    const b = document.getElementById("setReset"); b.scrollIntoView({ block: "center" });
    b.click();
    return { name: "settings-reset", bub: "#eUndo", ctl: "#setReset" };
  }],
  ["Settings reset, from All settings with the page scrolled to it", () => {
    openSettings();
    const b = document.getElementById("setReset"); b.scrollIntoView({ block: "center" });
    b.click();
    return { name: "settings-reset-all", bub: "#eUndo", ctl: "#setReset" };
  }],
  ["Shortcuts reset", () => {
    openSettings("keys");
    const b = document.getElementById("setResetKeys"); b.scrollIntoView({ block: "center" });
    b.click();
    return { name: "shortcuts-reset", bub: "#eUndo", ctl: "#setResetKeys" };
  }],
  ["Local changes cleared", async () => {
    openManage();
    const sec = document.querySelector('button[data-lm="data"]'); if (sec) sec.click();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById("mgWipe").click();
    document.getElementById("eClearGo").click();
    return { name: "cleared", bub: "#eUndo", ctl: "#mgBring" };
  }],
  ["Catalog ejected", () => {
    openMaintenance();
    document.getElementById("mtEject").click();
    return { name: "ejected", bub: "#eUndo", ctl: "#mtEject" };
  }],
];
async function runUndos(page, label, only) {
  const bad = [];
  let n = 0;
  for (const [what, act] of UNDOS) {
    if (only && only.indexOf(what) < 0) continue;
    if (process.env.BUB_ONLY && what.indexOf(process.env.BUB_ONLY) < 0) continue;
    n++;
    const r = await measure(page, act);
    if (!r.ok) bad.push({ what, ...r });
    if (process.env.BUB_LOG) console.log("       " + what + " " + JSON.stringify(r));
    await tidy(page);
    await sleep(60);
  }
  check(!bad.length && n > 0, label.replace("{N}", n), bad);
}

/* THE NOTICES, each from the control of what it concerns: the catalog's name, the Menu where Settings hold its equal,
   else Etiuda's name at the band's left; a second from one control hangs from the first. */
const NOTICES = [
  ["eTeamLapse", "#catNow"], ["eTeamFork", "#catNow"], ["eTeamStranded", "#catNow"], ["eTeamRemoved", "#catNow"],
  ["eMigrateWarn", "#catNow"], ["eHotkeyNote", "#settingsBtn"], ["eSaveWarn", ".row .brand"], ["eDeskWarn", ".row .brand"], ["eDeskNewer", ".row .brand"],
];
async function runNotices(page, label) {
  const bad = [];
  for (const [id, ctl] of NOTICES) {
    const r = await measure(page, (a) => { eNotice(a.id, "A notice.", "Its body."); return { name: a.id, bub: "#" + a.id, ctl: a.ctl }; }, { id, ctl });
    if (!r.ok) bad.push({ id, ...r });
    if (process.env.BUB_LOG) console.log("       " + id + " " + JSON.stringify(r));
    await page.evaluate(id => dropNotice(document.getElementById(id)), id);
  }
  const two = await measure(page, () => { eNotice("eTeamLapse", "A notice.", "Its body."); eNotice("eTeamFork", "A second.", "Its body.");
    return { name: "two", bub: "#eTeamFork", ctl: "#eTeamLapse" }; });
  if (!two.ok) bad.push({ id: "the second from one control", ...two });
  await page.evaluate(() => ["eTeamLapse", "eTeamFork"].forEach(id => dropNotice(document.getElementById(id))));
  check(!bad.length, label, bad);
}
/* The rescue at a start whose storage refuses: drawn by the boot guard before any module, from Etiuda's name. */
async function runRescue(label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("refused", "SecurityError"); } });
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  let r;
  try {
    await page.waitForFunction(() => !!document.getElementById("eRescue"), { timeout: 15000 });
    await sleep(200);
    await page.evaluate(MEASURE);
    r = await page.evaluate(() => window.__bubAt(document.getElementById("eRescue"), document.querySelector(".row .brand")));
  } catch (e) { r = { why: "no rescue: " + String(e && e.message || e).slice(0, 80) }; }
  await page.close();
  check(!!r.ok, label, r);
}

/* THE FAMILY'S ORDER. Each act opens one confirmation and names the button that leaves things as they are. */
const SHAPES = [
  ["Close Etiuda?", () => { document.body.classList.add("e-host"); document.getElementById("pax").value = "A traveller";
    document.getElementById("pax").dispatchEvent(new Event("input", { bubbles: true })); askClose(() => {}); return { bub: "#eCloseAsk", out: "eCloseStay" }; }],
  ["loading over one's own cards", () => { askLoose(() => {}); return { bub: "#eLoose", out: "eLooseExport" }; }],
  ["Clear local changes?", () => { openManage(); document.getElementById("mgWipe").click(); return { bub: "#eClearAsk", out: "eClearStay" }; }],
  ["the reset left unfinished", () => { openUnfinishedReset({ paths: ["a folder"] }); return { bub: "#eResetAsk", out: "mtResetStop" }; }],
];
async function runShapes(page, theme, bad) {
  for (const [what, act] of SHAPES) {
    let sel;
    try { sel = await page.evaluate(act); } catch (e) { bad.push({ what, theme, why: "act threw" }); continue; }
    await sleep(300);
    const r = await page.evaluate(sel => {
      const bub = document.querySelector(sel.bub);
      const btns = bub ? [...bub.querySelectorAll(".tour-actions .btn")].filter(b => b.getClientRects().length) : [];
      const white = b => { const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g) || [];
        return +m[0] > 240 && +m[1] > 240 && +m[2] > 240 && (m[3] === undefined || +m[3] > 0.9); };
      return { ids: btns.map(b => b.id), filled: btns.filter(white).map(b => b.id) };
    }, sel);
    const ok = r.ids.length >= 2 && r.ids[r.ids.length - 1] === sel.out && r.filled.length === 1 && r.filled[0] === sel.out;
    if (!ok) bad.push({ what, theme, ...r });
    await tidy(page);
    await sleep(60);
  }
}

async function runQuestions(page, label) {
  const bad = [];
  for (const [what, act] of QUESTIONS) {
    if (process.env.BUB_ONLY && what.indexOf(process.env.BUB_ONLY) < 0) continue;
    const r = await measure(page, act);
    if (!r.ok) bad.push({ what, ...r });
    if (process.env.BUB_LOG) console.log("       " + what + " " + JSON.stringify(r));
    await tidy(page);
    await sleep(60);
  }
  check(!bad.length, label, bad);
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  const page = await boot();
  await runQuestions(page, "b1 the questions hang from their controls (" + QUESTIONS.length + ")");
  await page.close();
  const p2 = await boot();
  await runUndos(p2, "b2 every Undo hangs from the control whose act it undoes, or the one now in its place ({N})");
  await p2.close();
  const p3 = await boot();
  await runNotices(p3, "b3 the notices hang from the control of what they concern (" + NOTICES.length + ", and a second from one control)");
  await p3.close();
  await runRescue("b4 the rescue at a start whose storage refuses hangs from Etiuda's name");
  for (const [lang, theme] of [["pl", "light"], ["en", "dark"], ["pl", "dark"]]) {
    const p = await boot({ lang, theme });
    await runQuestions(p, "b5 " + lang + " " + theme + ": the questions hang from their controls (" + QUESTIONS.length + ")");
    await p.close();
    const q = await boot({ lang, theme });
    await runUndos(q, "b5 " + lang + " " + theme + ": three Undos ({N})", ["Tab closed, by its X", "Card deleted in its editor, on the desk", "Settings reset"]);
    await q.close();
  }
  const shapeBad = [];
  for (const theme of ["light", "dark"]) {
    const p = await boot({ theme });
    await runShapes(p, theme, shapeBad);
    await p.close();
  }
  check(!shapeBad.length, "b6 the confirmations' way out is filled and last, the acting choice first on the fill's dark (" + SHAPES.length + ", light and dark)", shapeBad);
} catch (e) {
  check(false, "run crashed: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("RESULT checks=" + checks + " failed=" + fails);
console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=" + EXPECTED);
process.exit(fails || checks !== EXPECTED ? 1 : 0);
