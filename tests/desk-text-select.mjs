/* Desk UI text selectability (Studio's rule on Etiuda Desk).
 *
 *   node tests/desk-text-select.mjs
 *   ETIUDA_PLANTS=off node tests/desk-text-select.mjs
 *
 * Enforces Studio's ui/index.html rule on Etiuda Desk: interface text must compute
 * user-select: none across every screen in English, while only user fields, editors,
 * and technical/mono copyable items in Desk's allowed list compute user-select: text.
 * Skips the inline plant proof with a NOT RUN line when ETIUDA_PLANTS=off.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let checks = 0, fails = 0, notRun = 0, done = false;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails++;
};
const skip = what => {
  notRun++;
  console.log("  NOT RUN " + what);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* DESK'S ALLOWED LIST (kin of Studio's ui/index.html lines 59-66), each with its reason.
 * Checked in page context so every walk and test agrees on one list.
 * Note: a code inside `.swap`, `.card` or `.txt` is not the copyable kind. Swap chips are
 * controls, and a token inside a reply stays with the reply. */
const ALLOWED_LIST = [
  { sel: "input", why: "single-line user entry field (Studio: input)" },
  { sel: "textarea", why: "multi-line user entry field / card editor body (Studio: textarea)" },
  { sel: '[contenteditable="true"], [contenteditable=""]', why: "rich editable surface (Studio: contenteditable)" },
  { sel: ".mono", why: "explicitly marked monospace text for copying (Studio: .mono)" },
  { sel: "code", exclude: ".swap code, .card code, .txt code", why: "file names, folder paths (code.open-folder), sign-in codes and relay/proxy prints (Studio: code). A code inside a card or a reply stays with the card: those chips and tokens are not copied by dragging." },
  { sel: "pre", why: "preformatted technical text such as Quick facts #facts (Studio: pre)" },
  { sel: ".ec-fp", why: "catalog twin/edition fingerprint for verification (Studio kin: .fp)" },
  { sel: ".e-join-key, .e-lead-key, .e-ksig", why: "team signing key print for verification (Studio kin: signing print)" },
  { sel: ".e-notice-err", why: "error detail in a notice bubble for bug/support copying" },
  { sel: ".mt-row .v", why: "diagnostic reading value set in the mono face in Maintenance (Studio kin: readings in mono)" },
  { sel: ".modal-card .modal-note", why: "pinned status note under an editor's title (deliberate existing exception)" },
  { sel: ".rw-text", why: "the words a reword sends and the result it brings, in the Quick replies window: read closely and copied" },
];

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tsel-"));
fs.copyFileSync(E.ENGINE_PATH, path.join(lab, "etiuda.html"));
const SEED_CATALOG = fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8");
const url = "file:///" + path.join(lab, "etiuda.html").replace(/\\/g, "/");

const MAIN_SRC = fs.readFileSync(path.join(E.ROOT, "shell", "main.js"), "utf8");
function pickerDocFile() {
  const a = MAIN_SRC.indexOf("function pickPage() {"), z = MAIN_SRC.indexOf("\nconst PICK_SCRIPT", a);
  const d0 = MAIN_SRC.indexOf("function pickerDoc() {"), d1 = MAIN_SRC.indexOf("\n}\n", d0) + 3;
  if (a < 0 || z < 0 || d0 < 0) throw new Error("pickPage or pickerDoc not found in shell/main.js");
  const doc = new Function("policyFor", "PICK_HASH", "PICK_SCRIPT", MAIN_SRC.slice(d0, d1) + "\nreturn pickerDoc();")(
    () => "", "", "(" + MAIN_SRC.slice(a, z) + ")();");
  const at = path.join(lab, "quick-replies.html");
  fs.writeFileSync(at, doc);
  return "file:///" + at.replace(/\\/g, "/");
}

let browser = null;

async function newDeskPage(pageUrl, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: opts.width || 1280, height: opts.height || 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((opts) => {
    try {
      localStorage.clear();
      for (const [k, v] of [
        ["eTourDone_v3", "1"],
        ["eTourInvite_v3", "1"],
        ["eAgent", opts.agent ?? "Bench Agent"],
        ["eNameAsked", "1"],
        ["eTheme", "light"],
        ["eUiLang", "en"],
        ["eStill", "1"],
        ["eRail", "1"],
      ]) localStorage.setItem(k, v);
      /* A desk past its first opening, unless the walk is of the first-opening sign-in screen itself: the stand-in below
         offers a provider with nobody signed in, which is when that screen stands in front of everything else. */
      if (!opts.firstOpening) localStorage.setItem("eFirstSigninSeen", "1");
    } catch (e) {}
    const st = opts.signinState || {
      offered: ["microsoft", "google"],
      signedIn: "",
      seat: "none",
      reached: true,
    };
    window.E_HOST = {
      hotkeyState: () => ({ accel: "Control+Shift+Space", held: true, taken: false }),
      onPickAsk: fn => { window.__pick = fn; },
      openPicker() {},
      signinState: () => st,
      signIn: async () => st,
      signinCheck: async () => st,
      teamLeads: () => [],
    };
  }, opts);
  if (!opts.firstOpening && !opts.signinState) await seatPage(page);
  await E.seedCatalog(page, SEED_CATALOG);
  await page.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  if (opts.firstOpening) {
    await page.waitForFunction(() => { const f = document.getElementById("firstSignin"); return !!f && !f.hidden && f.textContent.trim().length > 0; }, { timeout: 30000 });
    return page;
  }
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  const yes = await page.$("#ecYes");
  if (yes) await page.click("#ecYes");
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.classList.contains("rail-on")
    && document.body.classList.contains("rail-ready")
    && getComputedStyle(document.getElementById("intentRail")).opacity === "1", { timeout: 30000 });
  return page;
}

/* Walks every element holding visible text of its own within `rootSelectors` (array of selectors, or null for whole document).
 * Also checks visible allowed controls (input, textarea, contenteditable) even when empty.
 * Elements inside `[hidden]`, `.e-gone`, `.e-warm`, SVGs, or obscured behind `#screenHost` are skipped. */
async function auditScreen(page, screenName, rootSelectors = null, opts = {}) {
  const res = await page.evaluate((allowedList, rootSels, opts) => {
    const cssPath = (el) => {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
        if (cur.id) {
          parts.unshift("#" + cur.id);
          break;
        }
        let seg = cur.tagName.toLowerCase();
        const cls = [...(cur.classList || [])].filter(c => c && !/^e-arr|^e-warm/.test(c)).slice(0, 2);
        if (cls.length) seg += "." + cls.join(".");
        const parent = cur.parentElement;
        if (parent) {
          const sameTag = [...parent.children].filter(k => k.tagName === cur.tagName);
          if (sameTag.length > 1) seg += ":nth-of-type(" + (sameTag.indexOf(cur) + 1) + ")";
        }
        parts.unshift(seg);
        cur = parent;
        if (parts.length >= 4) break;
      }
      return parts.join(" > ");
    };

    const allowedEntry = (el) => {
      if (el.closest(".swap code")) return null;
      if (el.tagName === "INPUT" && /^(checkbox|radio|range|hidden)$/i.test(String(el.type || ""))) return null;
      for (const a of allowedList) {
        if (a.exclude && el.closest(a.exclude)) continue;
        if (el.closest(a.sel)) return a;
      }
      return null;
    };

    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "META", "LINK", "BASE", "BR", "WBR", "HR", "IMG", "SVG"]);
    const roots = rootSels
      ? rootSels.flatMap(s => [...document.querySelectorAll(s)])
      : [document.body];

    const visited = new Set();
    let checked = 0;
    const badUi = [];
    const badAllowed = [];

    const consider = (el) => {
      if (!el || el.nodeType !== 1 || visited.has(el)) return;
      visited.add(el);
      if (SKIP_TAGS.has(el.tagName) || el.namespaceURI === "http://www.w3.org/2000/svg") return;
      if (el.closest("[hidden], .e-gone, .e-warm")) return;
      if (opts.excludeStage && el.closest(".stage, #railHit, #pillsSlot, .pills-slot, .fab-stack, #lanes")) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (!el.getClientRects || el.getClientRects().length === 0) return;

      const ownText = [...el.childNodes]
        .filter(n => n.nodeType === 3)
        .map(n => n.nodeValue)
        .join("")
        .replace(/\s+/g, " ")
        .trim();

      const allow = allowedEntry(el);
      const isFieldControl = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "";
      if (!ownText && !(allow && isFieldControl)) return;

      const us = cs.userSelect || cs.webkitUserSelect || "";
      if (ownText) checked++;

      if (allow) {
        if (us !== "text") {
          badAllowed.push({ sel: cssPath(el), text: ownText.slice(0, 60), got: us, want: "text", why: allow.sel });
        }
      } else if (ownText) {
        if (us !== "none") {
          badUi.push({ sel: cssPath(el), text: ownText.slice(0, 60), got: us });
        }
      }
    };

    for (const root of roots) {
      if (!root) continue;
      consider(root);
      root.querySelectorAll("*").forEach(consider);
    }

    return { checked, badUi, badAllowed };
  }, ALLOWED_LIST, rootSelectors, opts);

  return { screen: screenName, ...res };
}

async function openMenuItem(page, dataAct) {
  await page.click("#settingsBtn");
  await page.waitForFunction(() => { const m = document.getElementById("settingsMenu"); return m && !m.hidden; }, { timeout: 10000 });
  await page.click('#settingsMenu button[data-act="' + dataAct + '"]');
}

async function closeScreenHost(page) {
  const closed = await page.evaluate(() => {
    const btn = document.querySelector("#tabsBar .tab.on .tab-x, #screenHost .screen-actions button, #screenHost #mtClose, #screenHost #mgClose, #screenHost #setClose");
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!closed) await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.body.classList.contains("screen-on"), { timeout: 10000 });
}

async function fieldSelectionState(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const isField = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
    const fieldSel = isField ? String(el.value || "").slice(el.selectionStart || 0, el.selectionEnd || 0) : "";
    const domSel = String((window.getSelection && window.getSelection().toString()) || "");
    const rect = el.getBoundingClientRect();
    return {
      found: true,
      isField,
      fieldSel,
      domSel,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      userSelect: getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect || "",
    };
  }, selector);
}

async function dragSelectElement(page, selector) {
  const st = await fieldSelectionState(page, selector);
  if (!st.found || st.rect.width < 4 || st.rect.height < 4) return { ...st, ok: false };
  await page.evaluate(() => { try { window.getSelection().removeAllRanges(); } catch (_) {} });
  const y = st.rect.top + Math.min(st.rect.height / 2, 16);
  const x1 = st.rect.left + 4;
  const x2 = Math.max(x1 + 12, st.rect.right - 4);
  await page.mouse.move(x1, y);
  await page.mouse.down();
  await page.mouse.move(x2, y, { steps: 6 });
  await page.mouse.up();
  await sleep(30);
  return fieldSelectionState(page, selector);
}

async function ctrlAInElement(page, selector) {
  await page.evaluate((sel) => {
    try { window.getSelection().removeAllRanges(); } catch (_) {}
    const el = document.querySelector(sel);
    if (el && el.focus) el.focus();
  }, selector);
  await page.focus(selector).catch(() => {});
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await sleep(20);
  return fieldSelectionState(page, selector);
}

try {
  browser = await puppeteer.launch({
    executablePath: E.browserPath("chrome"),
    headless: true,
    args: ["--hide-scrollbars"],
    protocolTimeout: 120000,
  });

  const page = await newDeskPage(url);
  const screenReports = [];

  const recordWalk = (rep) => {
    screenReports.push(rep);
    check(rep.badUi.length === 0,
      rep.screen + ": all interface text elements have user-select: none (" + rep.checked + " checked)",
      rep.badUi.length ? rep.badUi.length + " selectable interface element(s): "
        + rep.badUi.slice(0, 12).map(x => x.sel + ' ["' + x.text + '" -> ' + x.got + ']').join("; ")
        + (rep.badUi.length > 12 ? "; ... +" + (rep.badUi.length - 12) + " more" : "")
        : undefined);
    check(rep.badAllowed.length === 0,
      rep.screen + ": all allowed elements have user-select: text",
      rep.badAllowed.length ? rep.badAllowed.slice(0, 10).map(x => x.sel + " (" + x.got + ")").join("; ") : undefined);
  };

  // 1. Main page
  recordWalk(await auditScreen(page, "Main page", null, { excludeStage: false }));

  // Check product owner's main page examples explicitly
  const poMain = await page.evaluate(() => {
    const us = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el);
      return { text: el.textContent.trim(), us: c.userSelect || c.webkitUserSelect || "" };
    };
    const segBtns = [...document.querySelectorAll("#seg button")].map(b => ({
      text: b.textContent.trim(),
      us: getComputedStyle(b).userSelect || getComputedStyle(b).webkitUserSelect || "",
    }));
    const firstTxt = document.querySelector("#list .card .txt");
    return {
      signinWord: us("#signinBtn .sgn-w") || us("#signinBtn"),
      railTitle: us("#intentRail .rail-head b"),
      railCount: us("#railCount"),
      segBtns,
      replyTxt: firstTxt ? (getComputedStyle(firstTxt).userSelect || "") : null,
      intentPh: us("#intentPh > span:first-child"),
      intentPhKbd: us("#intentPh kbd"),
    };
  });
  check(poMain.signinWord && poMain.signinWord.us === "none", "PO example: Sign in button words user-select: none", poMain.signinWord);
  check(poMain.railTitle && poMain.railTitle.us === "none", "PO example: Intents title (#intentRail .rail-head b) user-select: none", poMain.railTitle);
  check(poMain.railCount && poMain.railCount.us === "none", "PO example: Intents count (#railCount) user-select: none", poMain.railCount);
  check(poMain.segBtns.length >= 2 && poMain.segBtns.every(b => b.us === "none"), "PO example: EN and PL language switcher buttons user-select: none", poMain.segBtns);
  check(poMain.replyTxt === "none", "Card reply text (.txt) keeps user-select: none", poMain.replyTxt);
  check(poMain.intentPh && poMain.intentPh.us === "none", "Main search inner hint (#intentPh text) user-select: none", poMain.intentPh);
  check(poMain.intentPhKbd && poMain.intentPhKbd.us === "none", "Main search inner hint kbd (#intentPh kbd) user-select: none", poMain.intentPhKbd);

  // Check 2: Ctrl+A on main page with no field focused selects nothing
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.getSelection().removeAllRanges();
  });
  await page.click("#intentRail .rail-head b");
  await page.keyboard.down("Control");
  await page.keyboard.press("a", { commands: ["selectAll"] });
  await page.keyboard.up("Control");
  await page.evaluate(() => {
    try {
      if (!window.getSelection().toString()) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        const b = document.querySelector("#intentRail .rail-head b");
        if (b && b.firstChild) { r.setStart(b.firstChild, 0); r.collapse(true); sel.addRange(r); }
        document.execCommand("selectAll");
      }
    } catch (_) {}
  });
  await sleep(30);
  const ctrlAMain = await page.evaluate(() => window.getSelection().toString());
  check(ctrlAMain === "", "Ctrl+A on main page with no field focused selects nothing", ctrlAMain.slice(0, 80));
  await page.evaluate(() => window.getSelection().removeAllRanges());

  // 2. Menu (#settingsMenu, #factsPanel, #signinPanel, card context menu)
  await page.click("#factsBtn");
  await page.waitForFunction(() => { const f = document.getElementById("factsPanel"); return f && !f.hidden; }, { timeout: 10000 });
  const factsDrag = await dragSelectElement(page, "#facts");
  check(factsDrag.domSel.trim().length > 0 && factsDrag.userSelect === "text",
    "Allowed kind: Quick facts <pre id=\"facts\"> selects on drag", { us: factsDrag.userSelect, len: factsDrag.domSel.length });
  const factsRep = await auditScreen(page, "Menu (facts)", ["#factsPanel"]);
  await page.keyboard.press("Escape");
  await sleep(40);

  await page.click("#signinBtn");
  await page.waitForFunction(() => { const p = document.getElementById("signinPanel"); return p && !p.hidden; }, { timeout: 10000 });
  const signRep = await auditScreen(page, "Menu (signin)", ["#signinPanel"]);
  await page.keyboard.press("Escape");
  await sleep(40);

  await page.click("#settingsBtn");
  await page.waitForFunction(() => { const m = document.getElementById("settingsMenu"); return m && !m.hidden; }, { timeout: 10000 });
  const menuRep = await auditScreen(page, "Menu (settingsMenu)", ["#settingsMenu"]);
  await page.keyboard.press("Escape");
  await sleep(40);

  // Also right-click a card for context menu
  await page.click("#list .card .txt", { button: "right" });
  await sleep(60);
  const ctxRep = await auditScreen(page, "Menu (context)", ["#ctxMenu:not([hidden])", ".menu:not([hidden])"]);
  await page.keyboard.press("Escape");
  await sleep(40);

  recordWalk({
    screen: "Menu",
    checked: factsRep.checked + signRep.checked + menuRep.checked + ctxRep.checked,
    badUi: [...factsRep.badUi, ...signRep.badUi, ...menuRep.badUi, ...ctxRep.badUi],
    badAllowed: [...factsRep.badAllowed, ...signRep.badAllowed, ...menuRep.badAllowed, ...ctxRep.badAllowed],
  });

  // 3. Settings, with the organisation's model in force so the AI section shows the person's own switch for rewording (aireword)
  await page.evaluate(() => {
    const free = { choice: false, provider: false, endpoint: false, model: false, key: false };
    window.__stub = Object.assign({}, window.E_HOST);
    Object.assign(window.E_HOST, {
      aiState: () => ({ model: false, org: true, reword: "ai.example.test", rewordAt: "ai.example.test", rewordOn: true }), setAi() {}, setSearchAi() {}, setReword() {},
      deskAiSettings: () => ({ choice: "organisation", on: true, ready: true, provider: "openai", endpoint: "", at: "", host: "ai.example.test", model: "m-own",
        keyKept: true, keyAway: false, managed: free, ignored: [], sealable: true, services: [{ id: "openai", endpoint: "https://api.openai.com/v1/" }] }),
      deskAiSave: async () => ({ ok: true, why: "" }), deskAiTest: async () => ({ ok: true }), onAiRanking() {},
    });
  });
  await openMenuItem(page, "settings");
  await page.waitForFunction(() => document.body.classList.contains("screen-on") && !!document.querySelector("#screenHost .sx-nav"), { timeout: 10000 });
  const poSettings = await page.evaluate(() => {
    const lab = document.querySelector("#screenHost .set-row .set-label");
    const ctl = document.querySelector("#screenHost .set-row .set-ctl button, #screenHost .set-row .set-ctl .seg button");
    const field = document.querySelector("#setAgentName");
    return {
      label: lab ? { text: lab.textContent.trim().slice(0, 40), us: getComputedStyle(lab).userSelect } : null,
      value: ctl ? { text: ctl.textContent.trim().slice(0, 40), us: getComputedStyle(ctl).userSelect } : null,
      agentNameUs: field ? getComputedStyle(field).userSelect : null,
    };
  });
  check(poSettings.label && poSettings.label.us === "none", "PO example: Settings row label user-select: none", poSettings.label);
  check(poSettings.value && poSettings.value.us === "none", "PO example: Settings row control/value user-select: none", poSettings.value);
  check(poSettings.agentNameUs === "text", "Settings text field (#setAgentName) user-select: text", poSettings.agentNameUs);
  const rwRow = await page.evaluate(() => { const r = document.querySelector('#screenHost [data-row="aireword"]'); return r ? { label: getComputedStyle(r.querySelector(".set-label")).userSelect, ctl: getComputedStyle(r.querySelector(".set-seg button")).userSelect } : null; });
  check(rwRow && rwRow.label === "none" && rwRow.ctl === "none", "Settings: the person's own switch for rewording is on the walked page, its label and its buttons user-select: none", rwRow);
  recordWalk(await auditScreen(page, "Settings", ["#screenHost"]));
  await page.evaluate(() => { for (const k of ["aiState", "setAi", "setSearchAi", "setReword", "deskAiSettings", "deskAiSave", "deskAiTest", "onAiRanking"]) { if (k in window.__stub) window.E_HOST[k] = window.__stub[k]; else delete window.E_HOST[k]; } });

  // 5. Maintenance (opened via #sxMaint from Settings; walk all 6 pages)
  await page.click("#sxMaint");
  await page.waitForFunction(() => !!document.querySelector("#screenHost .sx.lm-mt"), { timeout: 10000 });
  const mtTabs = ["health", "engine", "catalog", "storage", "layout", "state"];
  let mtChecked = 0;
  const mtBadUi = [], mtBadAllowed = [];
  const mtSeenKeys = new Set();
  for (const key of mtTabs) {
    const btn = await page.$('#screenHost button[data-mt="' + key + '"]');
    if (btn) {
      await btn.click();
      await sleep(60);
    }
    const r = await auditScreen(page, "Maintenance (" + key + ")", ["#screenHost"]);
    mtChecked += r.checked;
    for (const x of r.badUi) {
      const k = x.sel + "|" + x.text;
      if (!mtSeenKeys.has(k)) { mtSeenKeys.add(k); mtBadUi.push(x); }
    }
    for (const x of r.badAllowed) {
      const k = "A|" + x.sel + "|" + x.text;
      if (!mtSeenKeys.has(k)) { mtSeenKeys.add(k); mtBadAllowed.push(x); }
    }
    if (key === "engine") {
      const poMt = await page.evaluate(() => {
        const k = document.querySelector("#screenHost .mt-row .k");
        const v = document.querySelector("#screenHost .mt-row .v");
        return {
          k: k ? { text: k.textContent.trim(), us: getComputedStyle(k).userSelect } : null,
          v: v ? { text: v.textContent.trim(), us: getComputedStyle(v).userSelect } : null,
        };
      });
      check(poMt.k && poMt.k.us === "none", "PO example: Maintenance row label (.mt-row .k) user-select: none", poMt.k);
      check(poMt.v && poMt.v.us === "text", "PO example: Maintenance mono reading (.mt-row .v) user-select: text", poMt.v);
      const mtDrag = await dragSelectElement(page, "#screenHost .mt-row .v");
      check(mtDrag.domSel.trim().length > 0, "Allowed kind: Maintenance .mt-row .v selects on drag", mtDrag.domSel);
    }
  }
  recordWalk({ screen: "Maintenance", checked: mtChecked, badUi: mtBadUi, badAllowed: mtBadAllowed });
  await closeScreenHost(page);

  // 4. Library (walk all Library pages in #libSecs)
  await openMenuItem(page, "manage");
  await page.waitForFunction(() => !!document.querySelector("#screenHost .sx.lm-lib"), { timeout: 10000 });
  const libBtns = await page.$$("#libSecs button.sx-sec");
  let libChecked = 0;
  const libBadUi = [], libBadAllowed = [];
  const libSeenKeys = new Set();
  let libPoChecked = false;
  let libFolderChecked = false;
  for (let i = 0; i < libBtns.length; i++) {
    const btnsNow = await page.$$("#libSecs button.sx-sec");
    if (btnsNow[i]) {
      await btnsNow[i].click();
      await sleep(70);
    }
    await page.evaluate(() => {
      document.querySelectorAll("#screenHost details.manage-sec").forEach(d => { d.open = true; });
    });
    await sleep(50);
    if (!libPoChecked) {
      const hasInt = await page.$("#screenHost .manage-row.mg-int .mg-int-t");
      const hasFolder = await page.$("#screenHost code.open-folder");
      if (hasInt || hasFolder) {
        const poLib = await page.evaluate(() => {
          const intTitle = document.querySelector("#screenHost .manage-row.mg-int .mg-int-t");
          const intCount = document.querySelector("#screenHost .manage-row.mg-int .mg-int-n");
          const catLab = document.querySelector("#screenHost .mg-cat-lab2");
          const folder = document.querySelector("#screenHost code.open-folder");
          return {
            label: intTitle ? { text: intTitle.textContent.trim(), us: getComputedStyle(intTitle).userSelect } : null,
            value: intCount ? { text: intCount.textContent.trim(), us: getComputedStyle(intCount).userSelect } : null,
            catLabUs: catLab ? getComputedStyle(catLab).userSelect : null,
            folderUs: folder ? getComputedStyle(folder).userSelect : null,
          };
        });
        if (poLib.label && !libPoChecked) {
          libPoChecked = true;
          check(poLib.label.us === "none", "PO example: Library row label user-select: none", poLib.label);
          check(poLib.value && poLib.value.us === "none", "PO example: Library row count/value user-select: none", poLib.value);
        }
        if (poLib.catLabUs) check(poLib.catLabUs === "text", "Library category rename input/textarea (.mg-cat-lab2) user-select: text", poLib.catLabUs);
        if (poLib.folderUs && !libFolderChecked) {
          libFolderChecked = true;
          check(poLib.folderUs === "text", "Allowed kind: Library code.open-folder user-select: text", poLib.folderUs);
          const foldDrag = await dragSelectElement(page, "#screenHost code.open-folder");
          check(foldDrag.domSel.trim().length > 0, "Allowed kind: code.open-folder selects on drag", foldDrag.domSel);
        }
      }
    }
    if (!libFolderChecked && await page.$("#screenHost code.open-folder")) {
      libFolderChecked = true;
      const foldUs = await page.evaluate(() => {
        const c = document.querySelector("#screenHost code.open-folder");
        return c ? (getComputedStyle(c).userSelect || "") : "";
      });
      check(foldUs === "text", "Allowed kind: Library code.open-folder user-select: text", foldUs);
      const foldDrag = await dragSelectElement(page, "#screenHost code.open-folder");
      check(foldDrag.domSel.trim().length > 0, "Allowed kind: code.open-folder selects on drag", foldDrag.domSel);
    }
    const r = await auditScreen(page, "Library", ["#screenHost"]);
    libChecked += r.checked;
    for (const x of r.badUi) {
      const k = x.sel + "|" + x.text;
      if (!libSeenKeys.has(k)) { libSeenKeys.add(k); libBadUi.push(x); }
    }
    for (const x of r.badAllowed) {
      const k = "A|" + x.sel + "|" + x.text;
      if (!libSeenKeys.has(k)) { libSeenKeys.add(k); libBadAllowed.push(x); }
    }
  }
  recordWalk({ screen: "Library", checked: libChecked, badUi: libBadUi, badAllowed: libBadAllowed });
  await closeScreenHost(page);

  // 6. Editors and dialogs (Card editor + folds)
  await page.evaluate(() => {
    const b = document.querySelector('#list .card .cacts [data-act="edit"]');
    if (b) b.click();
  });
  await page.waitForFunction(() => !document.getElementById("modal").hidden && !!document.getElementById("me_t_en"), { timeout: 10000 });
  await sleep(60);
  const bodySel = await ctrlAInElement(page, "#me_body_en");
  check(bodySel.fieldSel.length > 0 && bodySel.userSelect === "text",
    "Card editor body (#me_body_en) selects typed text", { us: bodySel.userSelect, len: bodySel.fieldSel.length });
  await page.evaluate(() => {
    document.querySelectorAll("#modalCard details.mf-fold").forEach(d => { d.open = true; });
  });
  await sleep(60);
  recordWalk(await auditScreen(page, "Editors and dialogs", ["#modalCard", "#edBars"]));
  await page.click("#modalX");
  await page.waitForFunction(() => document.getElementById("modal").hidden, { timeout: 10000 });

  // 9. About modal
  await openMenuItem(page, "about");
  await page.waitForFunction(() => !document.getElementById("modal").hidden, { timeout: 10000 });
  recordWalk(await auditScreen(page, "About", ["#modalCard"]));
  await page.click("#aboutClose");
  await page.waitForFunction(() => document.getElementById("modal").hidden, { timeout: 10000 });

  // 8. Tour
  await openMenuItem(page, "tour");
  await page.waitForFunction(() => !document.getElementById("tourRoot").hidden && !!document.getElementById("tourCard"), { timeout: 10000 });
  recordWalk(await auditScreen(page, "Tour", ["#tourRoot"]));
  await page.evaluate(() => {
    const skip = document.querySelector("#tourRoot .tour-skip");
    if (skip) skip.click();
  });
  await sleep(60);

  // 7. Blue bubbles (Undo bubble on hiding a card + note-pane + notice with .e-notice-err & join/fingerprint tokens)
  const hideClicked = await page.evaluate(() => {
    /* The card draws no Hide control; the mechanic stays, and the Undo bubble it raises is what this step audits. */
    const c = document.querySelector("#list .card[data-id]");
    if (c) { hideCard(c.dataset.id); return true; }
    return false;
  });
  await sleep(80);
  await page.evaluate(() => {
    const nb = document.querySelector('#list .card .cacts [data-act="note"]');
    if (nb) nb.click();
    const d = document.createElement("div");
    d.id = "tsBubbleProbe";
    d.className = "bub bub-ask e-notice";
    d.setAttribute("data-side", "none");
    d.style.cssText = "position:fixed;right:20px;bottom:80px;z-index:200";
    d.innerHTML = '<p><b>Save warning</b> Sample notice prose</p>'
      + '<p class="e-notice-err" id="tsErrDetail">ENOENT: test error detail</p>'
      + '<div class="mono" id="tsMonoProbe">mono-id-9876</div>'
      + '<span class="ec-fp" id="tsFpProbe">fp-abcd-1234</span>'
      + '<div class="e-join-key" id="tsJoinKey"><span class="e-ksig"><span>ABCD EFGH 1234 5678</span></span></div>'
      + '<code id="tsCodeProbe">sample-file.ec</code>';
    document.body.appendChild(d);
  });
  await sleep(40);
  recordWalk(await auditScreen(page, "Blue bubbles", [".bub:not(#tourRoot .bub)"]));

  for (const [id, label] of [
    ["#tsMonoProbe", ".mono"],
    ["#tsErrDetail", ".e-notice-err"],
    ["#tsFpProbe", ".ec-fp"],
    ["#tsJoinKey .e-ksig", ".e-ksig"],
    ["#tsCodeProbe", "code"],
  ]) {
    const r = await dragSelectElement(page, id);
    check(r.domSel.trim().length > 0 && r.userSelect === "text",
      "Allowed kind " + label + " selects on drag", { us: r.userSelect, selected: r.domSel });
  }
  await page.evaluate(() => {
    const p = document.getElementById("tsBubbleProbe");
    if (p) p.remove();
    window.getSelection().removeAllRanges();
  });

  // Check .modal-card .modal-note deliberate exception selects
  await page.evaluate(() => {
    const mc = document.getElementById("modalCard");
    if (!mc) return;
    document.getElementById("modal").hidden = false;
    const p = document.createElement("p");
    p.className = "modal-note";
    p.id = "tsModalNoteProbe";
    p.innerHTML = '<span class="modal-note-dot"></span><span class="modal-note-t">Edited elsewhere</span>';
    mc.appendChild(p);
  });
  const noteDrag = await dragSelectElement(page, "#tsModalNoteProbe .modal-note-t");
  check(noteDrag.domSel.trim().length > 0 && noteDrag.userSelect === "text",
    "Allowed kind .modal-card .modal-note selects on drag", { us: noteDrag.userSelect, selected: noteDrag.domSel });
  await page.evaluate(() => {
    const p = document.getElementById("tsModalNoteProbe");
    if (p) p.remove();
    document.getElementById("modal").hidden = true;
    window.getSelection().removeAllRanges();
  });

  if (hideClicked) {
    await page.click(".e-undo button").catch(() => {});
    await sleep(60);
  }
  await page.keyboard.press("Escape");
  await sleep(60);

  // Check in-card .swap code chips at narrow viewport (rail hidden) remain user-select: none
  await page.setViewport({ width: 720, height: 860, deviceScaleFactor: 1 });
  await sleep(120);
  const swapCodeUs = await page.evaluate(() => {
    const c = document.querySelector(".swap code");
    return c ? (getComputedStyle(c).userSelect || getComputedStyle(c).webkitUserSelect || "") : null;
  });
  if (swapCodeUs !== null) {
    check(swapCodeUs === "none", "In-card clickable .swap code chips keep user-select: none", swapCodeUs);
  }
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await sleep(80);

  // 10. Quick replies window (pickerDoc from shell/main.js)
  const pickPage = await browser.newPage();
  await pickPage.setViewport({ width: 600, height: 460, deviceScaleFactor: 1 });
  await pickPage.evaluateOnNewDocument(() => {
    window.E_PICK = {
      find: async (q) => JSON.stringify({
        q,
        rows: [
          { t: "Refund", g: "Orders", i: 0, n: 1, x: "We have started your refund", s: true, hits: 1 },
          { t: "Shipping status", g: "Delivery", i: 1, n: 2, x: "Your parcel is on the way", s: false, hits: 0 },
        ],
        count: "2 replies",
      }),
      who: async () => "null",
      tab: async () => "null",
      lang: async () => "null",
      copy: async () => {},
      takeSuggest: async () => "null",
      close() {},
      ready() {},
      tour() {},
      onOpen(fn) { window.__open = fn; },
    };
  });
  await pickPage.goto(pickerDocFile(), { waitUntil: "load", timeout: 30000 });
  await pickPage.evaluate(() => {
    if (window.__open) {
      window.__open(JSON.stringify({
        q: "",
        lang: "en",
        langs: ["en", "pl"],
        who: "Anna",
        look: { theme: "light", still: true, glass: false },
        rows: [
          { t: "Refund", g: "Orders", i: 0, n: 1, x: "We have started your refund", s: true },
          { t: "Shipping status", g: "Delivery", i: 1, n: 2, x: "Your parcel is on the way", s: false },
        ],
        count: "2 replies",
        keys: [["Enter", "copy {KEY}"], ["Esc", "close {KEY}"]],
      }));
    }
  });
  await sleep(100);
  recordWalk(await auditScreen(pickPage, "Quick replies window", null));
  /* The same window with "Your own words?" at its foot, after a press: the words and the result are content, the rest interface. */
  await pickPage.evaluate(() => {
    window.E_PICK.reword = async () => ({ ok: true, text: "Hi, sorry for the late reply. We will check your order tomorrow." });
    window.__open(JSON.stringify({ lang: "en", look: { theme: "light", still: true, glass: false }, selected: "hi sorry for late reply",
      editable: null, reword: { host: "ai.example.test" }, rows: [{ t: "Refund", g: "Orders", i: 0, n: 1, x: "We have started your refund", s: true }],
      count: "1 reply", words: { rwHead: "Your own words?", rwSpelling: "Fix spelling", rwShorter: "Shorter", rwFriendlier: "Friendlier",
        rwFormal: "More formal", rwYou: "You selected", rwBefore: "A press sends only the words above to {ADDRESS}, your organisation's AI service.",
        rwAfter: "Sent to {ADDRESS}: only the words you selected. Read the result before you send it.", rwEnter: "Enter puts it in place of your selection",
        rwBack: "Back to the replies", rwWait: "Waiting for {ADDRESS}" } }));
  });
  await sleep(60);
  await pickPage.click("#rw .rw-acts button");
  await sleep(80);
  recordWalk(await auditScreen(pickPage, "Quick replies window, a reword's result", null));

  // Check 4: Placeholder / inner hints vs typed words across all 7 field kinds
  async function checkFieldEmptyAndTyped(p, sel, kindLabel, cleanup) {
    await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, sel);
    await sleep(40);
    const dragEmpty = await dragSelectElement(p, sel);
    const ctrlAEmpty = await ctrlAInElement(p, sel);
    check(dragEmpty.found && dragEmpty.fieldSel === "" && dragEmpty.domSel === "",
      "Field " + kindLabel + " empty drag selects nothing", { fieldSel: dragEmpty.fieldSel, domSel: dragEmpty.domSel });
    check(ctrlAEmpty.found && ctrlAEmpty.fieldSel === "" && ctrlAEmpty.domSel === "",
      "Field " + kindLabel + " empty Ctrl+A selects nothing", { fieldSel: ctrlAEmpty.fieldSel, domSel: ctrlAEmpty.domSel });

    await p.focus(sel);
    await p.keyboard.type("Refund check");
    await sleep(40);
    const typedCtrlA = await ctrlAInElement(p, sel);
    check(typedCtrlA.fieldSel === "Refund check" && typedCtrlA.userSelect === "text",
      "Field " + kindLabel + " typed text selects on Ctrl+A and has user-select: text",
      { us: typedCtrlA.userSelect, fieldSel: typedCtrlA.fieldSel });
    const typedDrag = await dragSelectElement(p, sel);
    const leakedHint = typedDrag.domSel && !typedDrag.fieldSel.includes(typedDrag.domSel.trim());
    check(typedDrag.fieldSel.length > 0 && !leakedHint,
      "Field " + kindLabel + " typed drag selects field text without leaking into DOM hints",
      { fieldSel: typedDrag.fieldSel, domSel: typedDrag.domSel });

    await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.getSelection().removeAllRanges();
    }, sel);
    if (cleanup) await cleanup();
  }

  await page.bringToFront();

  // 4.1 Main search (#intent + #intentPh)
  await checkFieldEmptyAndTyped(page, "#intent", "Main search (#intent)");
  await page.evaluate(() => {
    const inp = document.getElementById("intent");
    if (inp && inp.blur) inp.blur();
  });
  await sleep(40);

  // 4.2 Settings search (#sxSearch) and 4.3 Settings text field (#setAgentName)
  await openMenuItem(page, "settings");
  await page.waitForFunction(() => !!document.getElementById("sxSearch") && !!document.getElementById("setAgentName"), { timeout: 10000 });
  await checkFieldEmptyAndTyped(page, "#sxSearch", "Settings search (#sxSearch)");
  await checkFieldEmptyAndTyped(page, "#setAgentName", "Settings text field (#setAgentName)", async () => {
    await page.evaluate(() => {
      const el = document.getElementById("setAgentName");
      if (el) { el.value = "Bench Agent"; el.dispatchEvent(new Event("input", { bubbles: true })); }
    });
  });
  await closeScreenHost(page);

  // 4.4 Card editor title (#me_t_en) & 4.5 body (#me_body_en)
  await page.evaluate(() => {
    const b = document.querySelector('#list .card .cacts [data-act="edit"]');
    if (b) b.click();
  });
  await page.waitForFunction(() => !document.getElementById("modal").hidden && !!document.getElementById("me_t_en"), { timeout: 10000 });
  await checkFieldEmptyAndTyped(page, "#me_t_en", "Card editor title (#me_t_en)");
  await checkFieldEmptyAndTyped(page, "#me_body_en", "Card editor body (#me_body_en)");
  await page.click("#modalX");
  await page.waitForFunction(() => document.getElementById("modal").hidden, { timeout: 10000 });

  // 4.6 Dialog field (Category editor #ce_name_en)
  await openMenuItem(page, "manage");
  await page.waitForFunction(() => !!document.querySelector("#screenHost .sx.lm-lib"), { timeout: 10000 });
  await page.evaluate(() => {
    const firstTab = document.querySelector("#libSecs button.sx-sec");
    if (firstTab) firstTab.click();
  });
  await sleep(60);
  const catBtn = await page.$("#screenHost [data-editcat]");
  if (catBtn) {
    await catBtn.click();
    await page.waitForFunction(() => !!document.getElementById("ce_name_en"), { timeout: 5000 }).catch(() => {});
  }
  if (await page.$("#ce_name_en")) {
    recordWalk(await auditScreen(page, "Dialog (category editor)", ["#modalCard"]));
    await checkFieldEmptyAndTyped(page, "#ce_name_en", "Dialog field (Category editor #ce_name_en)");
    await page.click("#modalX").catch(() => {});
    await closeScreenHost(page);
  } else {
    await closeScreenHost(page);
    await page.evaluate(() => {
      const b = document.querySelector('#list .card .cacts [data-act="edit"]');
      if (b) b.click();
    });
    await page.waitForFunction(() => !!document.getElementById("me_k"), { timeout: 10000 });
    await checkFieldEmptyAndTyped(page, "#me_k", "Dialog field (#me_k)");
    await page.click("#modalX");
  }

  // 4.7 Quick replies box (#q)
  await pickPage.bringToFront();
  await checkFieldEmptyAndTyped(pickPage, "#q", "Quick replies box (#q)");
  await pickPage.close();
  await page.bringToFront();

  const totalBadUi = screenReports.reduce((s, r) => s + r.badUi.length, 0);
  const totalChecked = screenReports.reduce((s, r) => s + r.checked, 0);
  console.log("SCREEN_SUMMARY " + JSON.stringify({
    totalChecked,
    totalBadUi,
    screens: screenReports.map(r => ({ screen: r.screen, checked: r.checked, badUi: r.badUi.length, badAllowed: r.badAllowed.length })),
  }));

  // Plant proof: remove the general body{user-select:none;-webkit-user-select:none} rule in a scratch copy and verify the leg turns red
  if (PLANTS_OFF) {
    skip("plant:removing-body-user-select-none turns main page audit red (ETIUDA_PLANTS=off)");
  } else {
    const srcHtml = fs.readFileSync(E.ENGINE_PATH, "utf8");
    const planted = srcHtml.replace(/body\s*\{[^}]*user-select\s*:\s*none[^}]*\}/, (m) =>
      m.replace(/-webkit-user-select\s*:\s*none\s*;?/g, "").replace(/user-select\s*:\s*none\s*;?/g, ""));
    const plantPath = path.join(lab, "etiuda-plant.html");
    fs.writeFileSync(plantPath, planted);
    const plantPage = await newDeskPage("file:///" + plantPath.replace(/\\/g, "/"));
    const plantRep = await auditScreen(plantPage, "Main page (plant)", null, { excludeStage: false });
    await plantPage.click("#intentRail .rail-head b");
    await plantPage.keyboard.down("Control");
    await plantPage.keyboard.press("a", { commands: ["selectAll"] });
    await plantPage.keyboard.up("Control");
    await plantPage.evaluate(() => {
      try {
        if (!window.getSelection().toString()) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          const r = document.createRange();
          const b = document.querySelector("#intentRail .rail-head b");
          if (b && b.firstChild) { r.setStart(b.firstChild, 0); r.collapse(true); sel.addRange(r); }
          document.execCommand("selectAll");
        }
      } catch (_) {}
    });
    await sleep(30);
    const plantCtrlA = await plantPage.evaluate(() => window.getSelection().toString());
    await plantPage.close();
    check(plantRep.badUi.length > 0 && plantCtrlA.length > 0,
      "plant: removing body{user-select:none} turns screen walk red and lets Ctrl+A select text",
      { badUi: plantRep.badUi.length, ctrlALen: plantCtrlA.length });
  }

  // The first-opening sign-in screen, standing: its words are interface text like any other.
  {
    const fsPage = await newDeskPage(url, { firstOpening: true });
    const fsRep = await auditScreen(fsPage, "First-opening sign-in screen", ["#firstSignin"], { excludeStage: false });
    recordWalk(fsRep);
    check(fsRep.checked >= 3, "First-opening sign-in screen was standing when walked (" + fsRep.checked + " elements with words)");
    await fsPage.close();
  }

  await page.close();
  done = true;
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(lab, { recursive: true, force: true });
}

console.log((fails ? "FAIL " : "PASS ") + "desk-text-select: " + (checks - (fails > checks ? checks : fails)) + "/" + checks + " checks" + (notRun ? ", " + notRun + " NOT RUN" : "") + (done ? "" : " - SUITE DID NOT COMPLETE"));
process.exit(done && fails === 0 ? 0 : 1);
