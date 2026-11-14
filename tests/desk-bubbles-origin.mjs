/* Every blue bubble hangs from the control it comes from (board 1001).
 *
 *   node tests/desk-bubbles-origin.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample catalog. The measure is the eye's: the
 * pointer's point, read from the laid-out box of the bubble's .bub-tip, lies within the control's span along
 * the edge it faces and no further than the bubble's gap (10 px) and a pixel from that edge. A bubble with no
 * pointer, or a pointer elsewhere, is red; so is a control that is not on screen. Each check names the bubble.
 *   b1  the questions: Close Etiuda?, loading a catalog over one's own cards (from the Load pressed, and from the
 *       catalog's name when nothing was pressed), Clear local changes?, Reset Etiuda?, the reset left unfinished,
 *       the proxy's sign-in, the agent's name with no reply to hang from
 *   b2  every Undo, from the control whose act it undoes, or the control now in its place
 *   b3  the notices, from the control of the thing they concern
 *   b4  the same in Polish and in the dark: the questions and three Undos
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
const EXPECTED = 4;

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
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"]]) localStorage.setItem(k, v);
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
const MEASURE = String.raw`window.__bubAt = function(bub, ctl){
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
  const ok=perp>=-2 && perp<=11 && along>=lo-0.5 && along<=hi+0.5;
  return {ok:ok, side:side, perp:Math.round(perp*10)/10, along:Math.round(along), span:[Math.round(lo),Math.round(hi)]};
};`;

/* One case: `act` runs in the page and answers {bub, ctl} as selectors or a note; the measure runs a few frames later. */
async function measure(page, act, arg) {
  await page.evaluate(MEASURE);
  let sel;
  try { sel = await page.evaluate(act, arg); } catch (e) { return { why: "act threw: " + String(e && e.message || e).split(String.fromCharCode(10))[0] }; }
  await sleep(250);
  return page.evaluate(sel => {
    if (!sel || sel.why) return sel || { why: "act answered nothing" };
    const bub = document.querySelector(sel.bub);
    const ctl = sel.ctlAt ? document.querySelectorAll(sel.ctl)[sel.ctlAt] : document.querySelector(sel.ctl);
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

async function runQuestions(page, label) {
  const bad = [];
  for (const [what, act] of QUESTIONS) {
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
} catch (e) {
  check(false, "run crashed: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

console.log("RESULT checks=" + checks + " failed=" + fails);
console.log("#counts checks=" + checks + " skipped=0 failed=" + fails + " expected=" + EXPECTED);
process.exit(fails || checks !== EXPECTED ? 1 : 0);
