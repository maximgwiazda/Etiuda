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
 *   b7  the tour's step for the Quick replies window, carried by that window's own page (the shell's pickerDoc, its
 *       host stood in for and answered by the desk page's own "open"): above the search box, the pointer on the box,
 *       the rows below it uncovered, the room it reports what it takes; the desk's bubble stands aside meanwhile, and
 *       the window's Next moves the desk's tour on; and at 600 px the foot's three key hints stand whole, the opening's
 *       count giving way; English light and Polish dark
 *   b8  the tour's steps that hang from a tab: the Library's tab, its section rail and the first row of its list,
 *       Settings' tab and its rail, each walked by the tour's own Next from the Menu's Library step, and the step back
 *       to a conversation from the conversation's tab with Settings in front; the pointer within the control's span and
 *       no further than the tour's gap (12 px) and a pixel from its ring, the ring round the control, the Library's tab
 *       still open when Settings' steps stand; English light and Polish dark
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
const EXPECTED = 15;

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

/* THE QUICK REPLIES WINDOW'S OWN PAGE, as the shell builds it: pickPage's source inlined into pickerDoc, the policy left out. */
const MAIN_SRC = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
function pickerDocFile() {
  const a = MAIN_SRC.indexOf("function pickPage() {"), z = MAIN_SRC.indexOf("\nconst PICK_SCRIPT", a);
  const d0 = MAIN_SRC.indexOf("function pickerDoc() {"), d1 = MAIN_SRC.indexOf("\n}\n", d0) + 3;
  if (a < 0 || z < 0 || d0 < 0) throw new Error("pickPage or pickerDoc not found in shell/main.js");
  const doc = new Function("policyFor", "PICK_HASH", "PICK_SCRIPT", MAIN_SRC.slice(d0, d1) + "\nreturn pickerDoc();")(() => "", "", "(" + MAIN_SRC.slice(a, z) + ")();");
  const at = path.join(lab, "quick-replies.html");
  fs.writeFileSync(at, doc);
  return "file:///" + at.replace(/\\/g, "/");
}
async function runQuickReplies(lang, theme) {
  const label = "b7 " + lang + " " + theme + ": the Quick replies window carries the tour's step, from its search box, over no row, and its Next moves the tour on; its foot's key hints stand whole";
  /* The desk under a host reads its catalog from the host, which this stand-in has none of: a plain boot first leaves the
     sample catalog in this browser's storage, so the desk below opens holding it whatever ran before. */
  await (await boot({ lang, theme })).close();
  const desk = await browser.newPage();
  await desk.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await desk.evaluateOnNewDocument((lang, theme) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eRail", "1"]]) localStorage.setItem(k, v);
      sessionStorage.setItem("eTourAt", "picker");
    } catch (e) {}
    const st = { offered: [], signedIn: "", seat: "none", reached: true };
    window.E_HOST = { hotkeyState: () => ({ accel: "Control+Shift+Space", held: true, taken: false }), onPickAsk: fn => { window.__pick = fn; },
      openPicker() {}, signinState: () => st, signIn: async () => st, signinCheck: async () => st };
  }, lang, theme);
  let r = null;
  try {
    await desk.goto(url, { waitUntil: "load", timeout: 60000 });
    await desk.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
    if (await desk.$("#ecYes")) await desk.click("#ecYes");
    await desk.waitForFunction(() => sessionStorage.getItem("eTourAt") === "picker" && !document.getElementById("tourRoot").hidden
      && typeof window.__pick === "function", { timeout: 30000 });
    const open = await desk.evaluate(() => window.__pick("open", "{}"));
    await desk.waitForFunction(() => sessionStorage.getItem("eTourAt") === "pickerIn", { timeout: 5000 }).catch(() => {});
    const deskAside = await desk.evaluate(() => sessionStorage.getItem("eTourAt") === "pickerIn"
      && getComputedStyle(document.getElementById("tourRoot")).visibility === "hidden");
    const o = JSON.parse(open);
    if (o.look) o.look.glass = false;
    const win = await browser.newPage();
    await win.setViewport({ width: 600, height: 424, deviceScaleFactor: 1 });
    await win.evaluateOnNewDocument(() => {
      window.__went = [];
      window.E_PICK = { find: async () => "null", who: async () => "null", tab: async () => "null", lang: async () => "null", copy: async () => {},
        takeSuggest: async () => "null", close() { window.__went.push("close"); }, ready(add) { window.__room = add; },
        tour(go) { window.__went.push(go); }, onOpen(fn) { window.__open = fn; } };
    });
    await win.goto(pickerDocFile(), { waitUntil: "load" });
    await win.evaluate(text => window.__open(text), JSON.stringify(o));
    const room = await win.evaluate(() => window.__room | 0);
    await win.setViewport({ width: 600, height: 424 + room, deviceScaleFactor: 1 });
    await sleep(200);
    await win.evaluate(MEASURE);
    const m = await win.evaluate(() => {
      const bub = document.getElementById("tour"), q = document.getElementById("q");
      const at = window.__bubAt(bub, q);
      const b = bub ? bub.getBoundingClientRect() : null, first = document.querySelector("#rows li");
      const rowsTop = first ? first.getBoundingClientRect().top : document.getElementById("rows").getBoundingClientRect().top;
      const words = bub ? [...bub.querySelectorAll("button[data-go]")].map(x => x.getAttribute("data-go")).join(",") : "";
      window.__keysWhole = () => {
        const f = document.querySelector("footer"), foot = f.getBoundingClientRect(), padR = parseFloat(getComputedStyle(f).paddingRight) || 0;
        const hints = [...document.querySelectorAll("#keys > span")], cnt = document.getElementById("count").getBoundingClientRect();
        return hints.length === 3 && hints.every(h => { const r = h.getBoundingClientRect(); return r.width > 0 && r.right <= foot.right - padR + 0.5; })
          && cnt.right <= hints[0].getBoundingClientRect().left + 0.5 && document.getElementById("count").textContent.length > 0;
      };
      const keysWhole = window.__keysWhole();
      return Object.assign(at, { clearOfRows: !!b && b.bottom <= q.getBoundingClientRect().top && b.bottom <= rowsTop,
        roomTrue: !!b && Math.abs(window.__room - (q.getBoundingClientRect().top - 8)) <= 1 && b.top >= 11, buttons: words,
        kbd: bub ? bub.querySelectorAll("p kbd").length : 0, keysWhole });
    });
    await win.click('#tour button[data-go="next"]');
    const went = await win.evaluate(() => window.__went.join(","));
    /* The count is what gives way: opened again with a count twice as long, standing for a bigger catalog's, the hints stand. */
    const longCount = Object.assign({}, o, { tour: null, count: String(o.count || "") + " " + String(o.count || "") });
    m.keysWhole2 = await win.evaluate(text => { window.__open(text); return window.__keysWhole(); }, JSON.stringify(longCount));
    if (process.env.BUB_SHOTS) await win.screenshot({ path: path.join(process.env.BUB_SHOTS, "quick-replies-" + lang + "-" + theme + ".png") });
    await win.close();
    await desk.evaluate(() => window.__pick("tour", JSON.stringify({ go: "next" })));
    await desk.waitForFunction(() => sessionStorage.getItem("eTourAt") === "library", { timeout: 5000 }).catch(() => {});
    const deskOn = await desk.evaluate(() => sessionStorage.getItem("eTourAt"));
    r = Object.assign(m, { tourOpen: !!o.tour, deskAside, went, deskOn });
    r.ok = !!(m.ok && m.keysWhole && m.keysWhole2 && m.side === "above" && m.clearOfRows && m.roomTrue && m.buttons === "skip,back,next" && m.kbd >= 2 && r.tourOpen
      && deskAside && went === "next" && deskOn === "library");
  } catch (e) { r = { why: "crashed: " + String(e && e.message || e).split(String.fromCharCode(10))[0] }; }
  await desk.close();
  if (process.env.BUB_LOG) console.log("       " + JSON.stringify(r));
  check(!!(r && r.ok), label, r);
}

/* THE TOUR'S STEPS FROM A TAB. Each is reached by the tour's own Next and measured against the control it names. */
const TOUR_AT = String.raw`window.__tourAt = function(ctl){
  const bub=document.getElementById("tourCard"), hole=document.getElementById("tourHole");
  const side=bub.getAttribute("data-side"), tip=bub.querySelector(":scope > .bub-tip");
  if(!ctl || !ctl.getClientRects().length) return {why:"no control on screen", side:side};
  if(!tip || !tip.getClientRects().length) return {why:"no pointer", side:side};
  const t=tip.getBoundingClientRect(), c=ctl.getBoundingClientRect(), h=hole.getBoundingClientRect();
  let perp, along, lo, hi;
  if(side==="below"){ perp=t.top-h.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="above"){ perp=h.top-t.bottom; along=t.left+t.width/2; lo=c.left; hi=c.right; }
  else if(side==="right"){ perp=t.left-h.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else if(side==="left"){ perp=h.left-t.right; along=t.top+t.height/2; lo=c.top; hi=c.bottom; }
  else return {why:"side "+side};
  const b=bub.getBoundingClientRect(), shown=b.top>=-1 && b.left>=-1 && b.bottom<=innerHeight+1 && b.right<=innerWidth+1;
  const ringed=h.left<=c.left+1 && h.top<=Math.max(0,c.top)+1 && h.right>=c.right-1 && h.bottom>=c.bottom-1;
  const ok=shown && ringed && perp>=-2 && perp<=13 && along>=lo-0.5 && along<=hi+0.5;
  return {ok:ok, side:side, perp:Math.round(perp*10)/10, along:Math.round(along), span:[Math.round(lo),Math.round(hi)], ringed:ringed};
};`;
async function runTourTabs(lang, theme) {
  const label = "b8 " + lang + " " + theme + ": the tour's Library and Settings steps hang from the tab, the rail and the list, and the step back to a conversation from its tab";
  const page = await boot({ lang, theme });
  const bad = [], seen = [];
  const stand = id => page.waitForFunction(id => sessionStorage.getItem("eTourAt") === id, { timeout: 8000 }, id).then(() => true, () => false);
  const next = () => page.evaluate(() => document.getElementById("tourNext").click());
  const at = async (id, ctl) => {
    if (!await stand(id)) { bad.push({ id, why: "the tour stands on " + await page.evaluate(() => sessionStorage.getItem("eTourAt")) }); return; }
    await sleep(500);
    await page.evaluate(TOUR_AT);
    const r = await page.evaluate(ctl => window.__tourAt(typeof ctl === "string" ? document.querySelector(ctl)
      : [...document.querySelectorAll(ctl.all)].find(e => e.getClientRects().length && !e.classList.contains("lw-head"))), ctl);
    seen.push(id + ":" + r.side);
    if (!r.ok) bad.push(Object.assign({ id }, r));
  };
  try {
    await page.evaluate(() => { sessionStorage.setItem("eTourAt", "library"); maybeStartTour(); });
    await page.waitForFunction(() => sessionStorage.getItem("eTourAt") === "library" && !document.getElementById("tourRoot").hidden, { timeout: 15000 });
    await sleep(400);
    await next();
    await at("libraryIn", '#tabsBar .tab.screen[data-sid="library"]');
    await next();
    await at("libraryRail", "#libSecs");
    await next();
    await at("libraryList", { all: "#libPage .mg-tree > *" });
    await next();
    await stand("settings");
    await sleep(400);
    await next();
    await at("settingsIn", '#tabsBar .tab.screen[data-sid="settings"]');
    const libStays = await page.evaluate(() => !!document.querySelector('#tabsBar .tab.screen[data-sid="library"]'));
    if (!libStays) bad.push({ id: "settingsIn", why: "the Library's tab was closed by the tour" });
    await next();
    await at("settingsRail", "#sxSecs");
    await page.evaluate(() => { endTour(true); startTour(0); });
    await stand("name");
    await sleep(400);
    await next();
    await at("chatTab", "#tabsBar .tab[data-tid]");
  } catch (e) { bad.push({ why: "crashed: " + String(e && e.message || e).split(String.fromCharCode(10))[0] }); }
  if (process.env.BUB_LOG) console.log("       " + seen.join(" ") + " " + JSON.stringify(bad));
  await page.close();
  check(!bad.length && seen.length === 6, label + " (" + seen.join(", ") + ")", bad);
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
  await runQuickReplies("en", "light");
  await runQuickReplies("pl", "dark");
  await runTourTabs("en", "light");
  await runTourTabs("pl", "dark");
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
