/* Sync across computers: what the store's sync put on the desk appears on an open page without a reload, and nothing the person is
 * typing is disturbed.
 *
 *   node tests/desk-synced.mjs
 *
 * Headless Chrome on the built engine page and the shipped sample, under a stand-in desk host that keeps the desk as the shell would
 * (deskRead, deskPatch) and tells the page what the sync put in place as the shell's storeSyncApply does (onDeskSynced, the patch
 * in text); node for the shell's half.
 *   ds1 a setting from another computer: the theme turns at once, the page is the same document, and its copy holds the value
 *   ds2 a card edit from another computer: the card on the list shows it, with no reload
 *   ds3 the search box holding typing keeps its focus, its text and its caret through a setting and an edit arriving
 *   ds4 an editor holding typing over the card that changed keeps the typing and says the card changed elsewhere
 *   ds5 a key the page still owes (its send unanswered) keeps the person's value, and the next send carries it
 *   ds6 Settings in front is drawn again with what arrived; while its name field holds typing it is not, until the field lets go
 *   ds7 the shell: storeSyncApply sends etiuda:desk-synced with the keys it patched, to the window, and only once the desk took them
 *   ds8 the shell keeps a removal another computer made, a version of the value null, as a file of its own
 *   ds12 the catalog taken away behind the page: the desk starts again in place without it
 *   ds10 each send names, per key, the last tell its copy holds (the shell's half is desk-store-shell z2)
 *   ds11 the page sends the writes it owes, and waits for them, before it answers whose the desk is
 * Plants: the page's take not shown (ds1 and ds2 red); a key the page owes taken over (ds5 red); the tells heard not recorded (ds10 red); the answer before the writes owed (ds11 red); the screen in front not drawn
 * again (ds6 red); in a copy of shell/main.js, the tell taken out (ds7 red), the product's sha unchanged.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const puppeteer = require("puppeteer-core");

const PRIO = E.belowNormal();
console.log("       this run at " + (PRIO.below ? "below-normal" : "priority " + PRIO.priority) + " priority");

let fails = 0, checks = 0, skipped = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (ok || detail === undefined ? "" : ": " + JSON.stringify(detail)));
  if (!ok) fails++;
};
const skip = what => { skipped++; console.log("  SKIP " + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECTED = 20;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const MAIN = path.join(E.ROOT, "shell", "main.js");
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-synced-"));
const PAGE = fs.readFileSync(E.ENGINE_PATH, "utf8");
fs.writeFileSync(path.join(lab, "etiuda.html"), PAGE);
fs.writeFileSync(path.join(lab, "etiuda-catalog.js"),
  "window.E_CATALOG = " + fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8") + ";\n");
const urlOf = name => "file:///" + path.join(lab, name).replace(/\\/g, "/");
let browser = null;

/* The desk as the shell keeps it, across the page's own reloads (kept under a name outside the engine's key shape), every patch the
   page sends recorded, and `hold` leaving a send unanswered as a busy shell would. */
async function boot(name = "etiuda.html") {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    const K = "__deskStand";
    let desk = null;
    try { desk = JSON.parse(localStorage.getItem(K) || "null"); } catch (e) {}
    if (!desk) desk = { eTourDone_v3: "1", eTourInvite_v3: "1", eFirstSigninSeen: "1", eAgent: "Bench Agent", eNameAsked: "1", eTheme: "light", eUiLang: "en",
      eStill: "1", eRail: "1" };
    const put = () => { try { localStorage.setItem(K, JSON.stringify(desk)); } catch (e) {} };
    const patch = t => { const p = JSON.parse(t); Object.keys(p).forEach(k => { if (p[k] === null) delete desk[k]; else desk[k] = p[k]; }); put(); return p; };
    window.__desk = { sends: [], hold: false, tell: null, get: () => desk };
    window.E_HOST = {
      deskRead: () => JSON.stringify(desk),
      deskSave: t => { desk = JSON.parse(t); put(); return true; },
      deskWrite: t => { desk = JSON.parse(t); put(); return Promise.resolve(true); },
      deskPatch: (t, now, took) => {
        const p = patch(t);
        window.__desk.sends.push(p);
        if (window.__desk.tooks) window.__desk.tooks.push(String(took));
        if (now) return true;
        return window.__desk.hold ? new Promise(() => {}) : Promise.resolve(true);
      },
      onDeskSynced: fn => { window.__desk.tell = fn; },
    };
  });
  await page.goto(urlOf(name), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await page.$("#ecYes")) {
    await page.click("#ecYes");
    await page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => null);
  }
  await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await page.evaluate(() => { document.documentElement.classList.add("e-still"); window.__sameDocument = 1; });
  return page;
}

/* The sync's word to the page, as the shell sends it: the desk changed first, then the keys told. Waits two frames and a task. */
async function arrive(page, keys) {
  await page.evaluate(keys => {
    const d = window.__desk.get();
    Object.keys(keys).forEach(k => { if (keys[k] === null) delete d[k]; else d[k] = keys[k]; });
    if (window.__desk.tell) window.__desk.tell(JSON.stringify(keys));
  }, keys);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
}
/* The layer in view's Pack with one card's title overridden, as text, and that card's id. */
async function packWithTitle(page, title, index = 0) {
  return page.evaluate((title, index) => {
    const el = document.querySelectorAll("#list .card[data-id]")[index];
    const id = el.dataset.id, key = window.eLayer() + "Pack";
    let p = {};
    try { p = JSON.parse(window.lsGet(key) || "{}") || {}; } catch (e) {}
    if (!p.overrides || typeof p.overrides !== "object") p.overrides = {};
    p.overrides[id] = Object.assign({}, p.overrides[id] || {}, { t: title });
    return { id, key, text: JSON.stringify(p) };
  }, title, index);
}
const cardText = (page, id) => page.evaluate(id => {
  const el = document.querySelector('#list .card[data-id="' + CSS.escape(id) + '"]');
  return el ? el.textContent : null;
}, id);

/* ds1 and ds2 on one page; "" where both held, else what went wrong. */
async function settingAndEdit(name) {
  const page = await boot(name);
  try {
    const was = await page.evaluate(() => document.documentElement.dataset.theme);
    await arrive(page, { eTheme: was === "dark" ? "light" : "dark" });
    const one = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, same: window.__sameDocument === 1,
      copy: window.lsGet("eTheme") }));
    const want = was === "dark" ? "light" : "dark";
    const r = { ds1: "", ds2: "" };
    if (one.theme !== want || !one.same || one.copy !== want) r.ds1 = JSON.stringify({ was, one });
    const p = await packWithTitle(page, "Synced from the other computer");
    await arrive(page, { [p.key]: p.text });
    const text = await cardText(page, p.id), same = await page.evaluate(() => window.__sameDocument === 1);
    if (!same || !text || text.indexOf("Synced from the other computer") < 0) r.ds2 = JSON.stringify({ same, text: text && text.slice(0, 80) });
    return r;
  } finally { await page.close(); }
}

/* ds5: the person's own press, its send unanswered, then the other computer's value for the same key. */
async function owedKept(name) {
  const page = await boot(name);
  try {
    await page.evaluate(() => { window.__desk.hold = true; });
    const was = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click("#theme");
    await sleep(60);
    const mine = await page.evaluate(() => document.documentElement.dataset.theme);
    await arrive(page, { eTheme: was });
    const after = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, copy: window.lsGet("eTheme") }));
    await page.evaluate(() => { window.__desk.hold = false; window.__desk.sends.length = 0; });
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); });
    await sleep(60);
    const sent = await page.evaluate(() => window.__desk.sends.filter(s => "eTheme" in s).map(s => s.eTheme));
    if (mine === was || after.theme !== mine || after.copy !== mine || sent.indexOf(mine) < 0) return JSON.stringify({ was, mine, after, sent });
    return "";
  } finally { await page.close(); }
}

/* ds12: the catalog itself taken away behind the page (Start from my account): the desk starts again in place without it, the same
   document, an Undo of an act before it gone as a desk started again leaves it (restart.js), the list drawn again from what remains. */
async function catalogGone(name) {
  const page = await boot(name);
  try {
    const had = await page.evaluate(() => { const c = document.querySelector("#list .card"); if (c) c.dataset.ds12 = "1"; const u = document.createElement("div"); u.id = "eUndo"; document.body.appendChild(u); return document.querySelectorAll("#list .card").length; });
    await page.evaluate(() => { window.__desk.hold = false; });
    await arrive(page, { eCatalog: null });
    await sleep(150);
    const after = await page.evaluate(() => ({ undo: !!document.getElementById("eUndo"), same: window.__sameDocument === 1, copy: window.lsGet("eCatalog") }));
    if (!had || after.undo || !after.same || after.copy !== null) return JSON.stringify({ had, after });
    return "";
  } finally { await page.close(); }
}

/* ds6: Settings in front. */
async function screenDrawn(name) {
  const page = await boot(name);
  try {
    await page.evaluate(() => window.openSettings());
    await page.waitForFunction(() => !!document.getElementById("setBody"), { timeout: 10000 });
    const mark = () => page.evaluate(() => { document.getElementById("setBody").dataset.synced = "before"; });
    const marked = () => page.evaluate(() => { const b = document.getElementById("setBody"); return !!b && b.dataset.synced === "before"; });
    await mark();
    await arrive(page, { eGlassOff: "1" });
    const drawn = !(await marked());
    const hasName = await page.evaluate(() => !!document.getElementById("setAgentName"));
    if (!hasName) return JSON.stringify({ drawn, why: "no name field" });
    await mark();
    await page.focus("#setAgentName");
    await page.evaluate(() => { const f = document.getElementById("setAgentName"); f.setSelectionRange(f.value.length, f.value.length); });
    await page.keyboard.type(" Typed");
    await arrive(page, { eNoteHover: "0" });
    const typing = await page.evaluate(() => {
      const f = document.getElementById("setAgentName");
      return { kept: document.getElementById("setBody").dataset.synced === "before", focus: document.activeElement === f, value: f.value };
    });
    await page.evaluate(() => document.getElementById("setAgentName").blur());
    await sleep(80);
    const after = !(await marked());
    if (!drawn || !typing.kept || !typing.focus || typing.value !== "Bench Agent Typed" || !after) return JSON.stringify({ drawn, typing, after });
    return "";
  } finally { await page.close(); }
}

/* ds10: each send names the last tell the page heard; a tell arriving while that key is owed is not taken and the send after it names
   the one before. */
async function tookSent(name) {
  const page = await boot(name);
  try {
    await page.evaluate(() => { window.__desk.tell(JSON.stringify({ eNoteHover: "0" }), 5); });
    await page.evaluate(() => { window.__desk.sends.length = 0; window.__desk.tooks = []; window.lsSet("eNoteHover", "1"); });
    await sleep(60);
    const first = await page.evaluate(() => window.__desk.tooks.slice());
    await page.evaluate(() => { window.__desk.hold = true; window.lsSet("eNoteHover", "0"); });
    await sleep(60);
    await page.evaluate(() => { window.__desk.tell(JSON.stringify({ eNoteHover: "1" }), 6); });
    const kept = await page.evaluate(() => window.lsGet("eNoteHover"));
    await page.evaluate(() => { window.__desk.hold = false; window.__desk.tooks = []; document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); });
    await sleep(60);
    const second = await page.evaluate(() => window.__desk.tooks.slice());
    const named = l => l.length > 0 && l.every(t => { try { return JSON.parse(t).eNoteHover === 5; } catch (e) { return false; } });
    if (!named(first) || kept !== "0" || !named(second)) return JSON.stringify({ first, kept, second });
    return "";
  } finally { await page.close(); }
}

/* ds11: the page sends every write it owes, waiting for the disk (storage.js eDeskFlush), before it answers whose the desk is, so an answer
   that sets the desk aside sets those writes aside too: signin.js syncAnswer lifted into a sandbox over stand-ins. */
const SIGNIN = path.join(E.ROOT, "src", "modules", "signin.js");
function flushedFirst(text) {
  const at = text.indexOf("function syncAnswer(");
  if (at < 0) return "no syncAnswer";
  let i = text.indexOf("{", at), depth = 0;
  for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break; }
  const order = [], ctx = { order, Promise, String };
  vm.createContext(ctx);
  vm.runInContext(text.slice(at, i + 1) + "\nfunction eDeskFlush(){ order.push('flushed'); }\nfunction eHost(){ return { storeAnswer: c => { order.push('answer ' + c); return null; } }; }\n"
    + "function syncNow(){ return null; } function syncChoiceNotice(){} function syncRead(){ return null; }\nsyncAnswer('start');", ctx);
  return order.join() === "flushed,answer start" ? "" : JSON.stringify(order);
}

async function main() {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });

  const se = await settingAndEdit("etiuda.html");
  check(!se.ds1, "ds1 a setting from another computer: the theme turns at once on the same document, and the page's copy holds it", se.ds1 || undefined);
  check(!se.ds2, "ds2 a card edit from another computer shows on the card in the list, with no reload", se.ds2 || undefined);

  /* ds3: the search box holding typing. */
  {
    const page = await boot();
    let r = "";
    try {
      await page.focus("#intent");
      await page.keyboard.type("zq");
      const before = await page.evaluate(() => { const f = document.getElementById("intent"); return { v: f.value, s: f.selectionStart }; });
      const p = await packWithTitle(page, "Another synced title");
      const was = await page.evaluate(() => document.documentElement.dataset.theme);
      await arrive(page, { eTheme: was === "dark" ? "light" : "dark", [p.key]: p.text });
      const after = await page.evaluate(() => { const f = document.getElementById("intent");
        return { v: f.value, s: f.selectionStart, focus: document.activeElement === f, theme: document.documentElement.dataset.theme }; });
      if (after.v !== before.v || after.s !== before.s || !after.focus || after.theme === was) r = JSON.stringify({ before, after });
    } finally { await page.close(); }
    check(!r, "ds3 the search box holding typing keeps its focus, text and caret while a setting and an edit arrive", r || undefined);
  }

  /* ds4: an editor holding typing over the card that changes. */
  {
    const page = await boot();
    let r = "";
    try {
      const id = await page.evaluate(() => document.querySelectorAll("#list .card[data-id]")[1].dataset.id);
      await page.evaluate(id => window.openCardEditor(id), id);
      await page.waitForFunction(() => { const m = document.getElementById("modal"); return m && !m.hidden && m.querySelector("input[type=text], input:not([type]), textarea"); }, { timeout: 10000 });
      const field = await page.evaluate(id => {
        const t = (window.cards || []).find(c => c.id === id);
        const fs = [...document.querySelectorAll("#modal input[type=text], #modal input:not([type]), #modal textarea")];
        const f = fs.find(x => t && x.value === t.t) || fs[0];
        f.setAttribute("data-synced-field", "1");
        return { title: t && t.t, value: f.value };
      }, id);
      await page.focus("[data-synced-field]");
      await page.evaluate(() => { const f = document.querySelector("[data-synced-field]"); f.setSelectionRange(f.value.length, f.value.length); });
      await page.keyboard.type(" and mine");
      const typed = await page.evaluate(() => document.querySelector("[data-synced-field]").value);
      const p = await page.evaluate((id) => {
        const key = window.eLayer() + "Pack";
        let o = {};
        try { o = JSON.parse(window.lsGet(key) || "{}") || {}; } catch (e) {}
        if (!o.overrides || typeof o.overrides !== "object") o.overrides = {};
        o.overrides[id] = Object.assign({}, o.overrides[id] || {}, { t: "Changed on the other computer" });
        return { key, text: JSON.stringify(o) };
      }, id);
      await arrive(page, { [p.key]: p.text });
      await sleep(120);
      const after = await page.evaluate(() => {
        const f = document.querySelector("#modal [data-synced-field]") || [...document.querySelectorAll("#modal input, #modal textarea")].find(x => / and mine$/.test(x.value));
        return { value: f ? f.value : null, line: (document.getElementById("modal").textContent || "").indexOf("This card changed elsewhere while it was open.") >= 0 };
      });
      if (after.value !== typed || !after.line) r = JSON.stringify({ field, typed, after });
    } finally { await page.close(); }
    check(!r, "ds4 an editor holding typing over the card that changed keeps the typing and says the card changed elsewhere", r || undefined);
  }

  const ds5 = await owedKept("etiuda.html");
  check(!ds5, "ds5 a key whose send is unanswered keeps the person's value over the other computer's, and the next send carries it", ds5 || undefined);

  const ds12 = await catalogGone("etiuda.html");
  check(!ds12, "ds12 the catalog taken away behind the page: the desk starts again in place without it, its list drawn again", ds12 || undefined);

  const ds6 = await screenDrawn("etiuda.html");
  check(!ds6, "ds6 Settings in front is drawn again with what arrived, not while its name field holds typing, and once the field lets go", ds6 || undefined);

  const ds10 = await tookSent("etiuda.html");
  check(!ds10, "ds10 each send names the last tell the page heard for that key, and one arriving while the key is owed is not taken nor named", ds10 || undefined);

  const ds11 = flushedFirst(fs.readFileSync(SIGNIN, "utf8"));
  check(!ds11, "ds11 a write the page owes is sent and waited for before the page answers whose the desk is", ds11 || undefined);

  /* ds7: the shell's half, storeSyncApply and the tell, lifted from shell/main.js into a sandbox. */
  const shellTells = (text) => {
    const slice = name => {
      const at = text.indexOf("function " + name + "(");
      if (at < 0) throw new Error("no " + name);
      let i = text.indexOf("{", at), depth = 0;
      for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break; }
      return text.slice(at, i + 1);
    };
    const sent = [], patched = [], written = [], answers = [];
    const ctx = { sent, patched, written, answers, theWindow: { isDestroyed: () => false, webContents: { send: (ch, v) => sent.push([ch, v]) } }, JSON,
      Object, refuse: false };
    vm.createContext(ctx);
    vm.runInContext("function deskBridge() { return { tell: () => 1 }; } function storeSyncTaken() { return {}; }\n" + slice("deskSyncedTell") + "\n" + slice("storeSyncApply") + "\n"
      + "function patchDesk(t){ patched.push(t); return !refuse; }\nfunction storeSyncFile(n){ return n !== 'b.ec'; }\nfunction storeSyncDir(...rest){ return rest.join('/'); }\n"
      + "const fs={ mkdirSync(){} }; function writeReplacing(p, t){ written.push([p, t]); }\n"
      + "const console={ error(l){ written.push(['error', l]); } };\n"
      + "answers.push(storeSyncApply({ 'k:eTheme': 'dark', 'k:eabc~Pack': '{}', 'f:a.ec': 'x' }, []));\n"
      + "refuse = true; answers.push(storeSyncApply({ 'k:eUiLang': 'pl' }, []));\nanswers.push(storeSyncApply({ 'f:b.ec': 'y' }, []));\n"
      + "storeSyncApply({}, [{ item: 'k:eabc~Pack#hidden[]c5', by: 'k-0123456789abcdef', t: 7, h: null, value: null }]);", ctx);
    return { sent, patched, written, answers };
  };
  {
    let r = "";
    try {
      const { sent, patched } = shellTells(fs.readFileSync(MAIN, "utf8"));
      const ok = sent.length === 1 && sent[0][0] === "etiuda:desk-synced" && sent[0][1] === JSON.stringify({ eTheme: "dark", "eabc~Pack": "{}" })
        && patched.length === 2;
      if (!ok) r = JSON.stringify({ sent, patched });
    } catch (e) { r = e.message; }
    check(!r, "ds7 the shell tells the window the keys the sync patched, once the desk took them, and nothing for a catalog file alone", r || undefined);
  }
  {
    let r = "";
    try {
      const { written } = shellTells(fs.readFileSync(MAIN, "utf8"));
      const w = written[0];
      if (written.length !== 1 || w[0] !== "kept/k-0123456789abcdef-7-removed.txt" || JSON.parse(w[1]).value !== null) r = JSON.stringify(written);
    } catch (e) { r = e.message; }
    check(!r, "ds8 the shell keeps a removal another computer made as a version of the value null, in a file of its own", r || undefined);
  }
  /* ds9: what the desk refused (a patch) or could not write (a catalog file) is answered to the sync, which then takes none of it as taken
     (tests/desk-sync.mjs G5a holds the sync's half). */
  const answeredOk = a => JSON.stringify(a) === JSON.stringify([[], ["k:eUiLang"], ["f:b.ec"]]);
  {
    let r = "";
    try { const { answers } = shellTells(fs.readFileSync(MAIN, "utf8")); if (!answeredOk(answers)) r = JSON.stringify(answers); } catch (e) { r = e.message; }
    check(!r, "ds9 the shell answers the sync the items it could not put in place: a patch the desk refused, a catalog file not written", r || undefined);
  }

  /* The plants. */
  const pagePlant = async (tag, from, to, run, red, line) => {
    if (PLANTS_OFF) { skip(line); return; }
    const n = PAGE.split(from).length - 1;
    let detail = "the plant's anchor is there " + n + " times", ok = false;
    if (n === 1) {
      const file = "planted-" + tag + ".html";
      fs.writeFileSync(path.join(lab, file), PAGE.split(from).join(to));
      const r = await run(file);
      ok = red(r);
      detail = ok ? "red" : "still held: " + JSON.stringify(r);
    }
    check(ok, line, ok ? undefined : detail);
  };
  await pagePlant("shown", "hooks.takeSyncedDesk(keys);", "void keys;", settingAndEdit, r => !!r.ds1 && !!r.ds2,
    "p ds1 ds2 the page's take not shown turns ds1 and ds2 red");
  await pagePlant("owed", '|| eDeskOwed.has(k) || eDeskCarried.has(k)) return;', ") return;", owedKept, r => !!r,
    "p ds5 a key the page owes taken over turns ds5 red");
  await pagePlant("behind", "if (told) eDeskSeen = n;", "void n;", tookSent, r => !!r,
    "p ds10 the tells heard not recorded turns ds10 red");
  {
    const line = "p ds11 the flush taken out of a copy of src/modules/signin.js turns ds11 red, and the product file is never written";
    if (PLANTS_OFF) skip(line);
    else {
      const before = sha(SIGNIN), text = fs.readFileSync(SIGNIN, "utf8"), from = "  try{ eDeskFlush(); }catch(e){} /* plant:answer-flush */\n";
      const red = text.split(from).length === 2 && !!flushedFirst(text.split(from).join(""));
      check(red && sha(SIGNIN) === before, line, red ? undefined : "still held, or the anchor is absent");
    }
  }
  await pagePlant("catalog", "    if (keys.indexOf(E_CATALOG_STORE) > -1) {\n      restartDesk();\n      return;\n    }\n", "", catalogGone, r => !!r,
    "p ds12 the desk not started again when its catalog is taken away turns ds12 red");
  await pagePlant("screen", 'if (screenOn === "settings") repaintScreen();', 'if (screenOn === "settings") void 0;', screenDrawn, r => !!r,
    "p ds6 the screen in front not drawn again turns ds6 red");
  {
    const line = "p ds7 the tell taken out of a copy of shell/main.js turns ds7 red, and the product file is never written";
    if (PLANTS_OFF) skip(line);
    else {
      const before = sha(MAIN), text = fs.readFileSync(MAIN, "utf8");
      const from = "if (win && !win.isDestroyed()) try { win.webContents.send(\"etiuda:desk-synced\", JSON.stringify(keys), n); }";
      let red = false, detail = "the plant's anchor is absent";
      if (text.split(from).length === 2) {
        const { sent } = shellTells(text.split(from).join("if (false) try { void keys; }"));
        red = sent.length === 0;
        detail = red ? "red" : "still held";
      }
      check(red && sha(MAIN) === before, line, red ? undefined : detail);
    }
  }
  {
    const line = "p ds9 a refused patch not answered, in a copy of shell/main.js, turns ds9 red, and the product file is never written";
    if (PLANTS_OFF) skip(line);
    else {
      const before = sha(MAIN), text = fs.readFileSync(MAIN, "utf8");
      const from = "else failed.push(...Object.keys(keys).map(k => \"k:\" + k)); } /* plant:apply-desk-failed */";
      let red = false, detail = "the plant's anchor is absent";
      if (text.split(from).length === 2) {
        const { answers } = shellTells(text.split(from).join("} /* plant:apply-desk-failed */"));
        red = !answeredOk(answers);
        detail = red ? "red" : "still held";
      }
      check(red && sha(MAIN) === before, line, red ? undefined : detail);
    }
  }
}

try { await main(); }
catch (e) { check(false, "run crashed: " + (e && e.stack ? e.stack : e)); }
finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}
console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
console.log("RESULT checks=" + checks + " failed=" + fails);
process.exit(fails || checks + skipped !== EXPECTED ? 1 : 0);
