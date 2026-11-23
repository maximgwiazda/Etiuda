/* Desk editing and the private layer: a person's own edits survive a new edition, Delete says what it does, and what is
 * private stays on this computer (review omicron 6, 1 and 5, review rho 1, as the test architect verified them on 2026-11-22).
 *
 *     node tests/desk-editing-mends.mjs
 *
 * Headless Chrome on the built engine page under a stand-in desk host, as tests/desk-synced.mjs keeps it, one browser per scene
 * (a file:// origin shares its store between pages); node for the counts.
 *   ed-retype-by-field       an open intent editor holding typing in every box, when an edition changes that intent and makes the
 *                            comment row appear, keeps each typed value in the box it was typed in, and Save stores it there
 *   intent-save-diff         Save after changing one clause stores that clause alone, and the next edition's name, other clause and
 *                            comment reach the screen with the saved clause kept
 *   ed-radio-undo, ed-radio-back  a form of address chosen in the card editor, a radio group sharing one name, is put back by
 *                            the Undo of moving on without saving, and in a window brought back after a close
 *   delete-restores          no Delete control says Reset brings the entry back: nothing on the desk un-removes it but its Undo
 *   private-layer-not-sent   copies made while the catalog in use is private are in no answer for a span, though they sit in the
 *                            layer a team edition of the same id reads (dem4a); the page's own view of the mark decides (dem4b)
 * Plants: each deciding line lifted in a copy of the built page, or of src/modules/desk-stats.js, turns its check red.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const { seatPage } = require("./seat-page.js");
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
const EXPECTED = 14;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const clone = o => JSON.parse(JSON.stringify(o));

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-editing-"));
const PAGE = fs.readFileSync(E.ENGINE_PATH, "utf8");
const SAMPLE = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
const STATS_SRC = fs.readFileSync(path.join(E.ROOT, "src", "modules", "desk-stats.js"), "utf8");

/* A lab folder: the page (or a planted copy) beside a catalog the page offers at boot. */
function labWith(name, catalog) {
  const dir = path.join(lab, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), PAGE);
  fs.writeFileSync(path.join(dir, "etiuda-catalog.js"), "window.E_CATALOG = " + JSON.stringify(catalog) + ";\n");
  return dir;
}
const urlOf = (dir, file) => "file:///" + path.join(dir, file).replace(/\\/g, "/");

/* A fresh browser and page, the catalog taken, the tour and the name asked already. */
async function scene(dir, file, run) {
  const browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      const K = "__deskStand";
      let desk = null;
      try { desk = JSON.parse(localStorage.getItem(K) || "null"); } catch (e) {}
      if (!desk) desk = { eTourDone_v3: "1", eTourInvite_v3: "1", eFirstSigninSeen: "1", eAgent: "Bench Agent", eNameAsked: "1", eTheme: "light",
        eUiLang: "en", eStill: "1", eRail: "1" };
      const put = () => { try { localStorage.setItem(K, JSON.stringify(desk)); } catch (e) {} };
      window.E_HOST = {
        deskRead: () => JSON.stringify(desk),
        deskSave: t => { desk = JSON.parse(t); put(); return true; },
        deskWrite: t => { desk = JSON.parse(t); put(); return Promise.resolve(true); },
        deskPatch: (t, now) => { const p = JSON.parse(t); Object.keys(p).forEach(k => { if (p[k] === null) delete desk[k]; else desk[k] = p[k]; }); put(); return now ? true : Promise.resolve(true); },
        onDeskSynced: () => {},
      };
    });
    await seatPage(page);
    await page.goto(urlOf(dir, file), { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
    if (await page.$("#ecYes")) {
      await page.click("#ecYes");
      await page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => null);
    }
    await page.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
      && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
    await page.evaluate(() => document.documentElement.classList.add("e-still"));
    if (!(await page.evaluate(() => catalogLoaded()))) throw new Error("the lab's catalog was not taken");
    return await run(page);
  } finally { await browser.close(); }
}
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80)))));
const take = (page, doc) => page.evaluate(c => activateCatalog(parseCatalogFile(JSON.stringify(c)), {}), doc);
const storedIntent = (page, id) => page.evaluate(id => { let o = {}; try { o = JSON.parse(lsGet(eLayer() + "Pack") || "{}"); } catch (e) {} return (o.intentOverrides || {})[id] || null; }, id);
const shownIntent = (page, id) => page.evaluate(id => { const at = intentIdxOfId(id), o = {}; intentStoreKeys().forEach(k => { o[k] = SW_STORE[k][at]; }); return o; }, id);
const REQ = SAMPLE.tags.find(t => t.kind === "request");
const REQ_ID = "t:" + REQ.id;

/* ed-retype-by-field. The comment row hidden (no card uses the comment tokens and no request carries an action), then an edition
   that renames the intent and adds a card using {ACTION}: the row appears between the clause and the next language. */
const HIDDEN = clone(SAMPLE);
HIDDEN.rev = 1;
HIDDEN.cards.forEach(c => { Object.keys(c.body || {}).forEach(l => { if (typeof c.body[l] === "string") c.body[l] = c.body[l].replace(/\{ACTION\}|\{TOPIC\}/g, "x"); }); });
HIDDEN.tags.forEach(t => { if (t.kind === "request") delete t.action; });
const SHOWN = clone(HIDDEN);
SHOWN.rev = 2;
SHOWN.tags.find(t => t.id === REQ.id).topic = { en: "edition name en", pl: "edition name pl" };
SHOWN.cards[0].body.en += " {ACTION}";
const retypeLab = labWith("retype", HIDDEN);
async function retyped(file) {
  return scene(retypeLab, file, async page => {
    await page.evaluate(id => openIntentEditor(intentIdxOfId(id)), REQ_ID);
    await page.waitForFunction(() => !!document.getElementById("ieSave"), { timeout: 10000 });
    await sleep(100);
    const typed = await page.evaluate(() => {
      const ids = [];
      document.querySelectorAll("#modalCard input[id^='ie_']").forEach(e => {
        e.value = "TYPED[" + e.id + "]";
        e.dispatchEvent(new Event("input", { bubbles: true }));
        ids.push(e.id);
      });
      return ids;
    });
    await take(page, SHOWN);
    await settle(page);
    await sleep(300);
    const after = await page.evaluate(() => {
      const o = {};
      document.querySelectorAll("#modalCard input[id^='ie_']").forEach(e => { o[e.id] = e.value; });
      return o;
    });
    await page.evaluate(() => document.getElementById("ieSave").click());
    await sleep(200);
    return { typed, after, stored: await storedIntent(page, REQ_ID) };
  });
}
const retypeHeld = r => !!r && r.typed.length === 4 && "ie_cmt_en" in r.after
  && r.typed.every(id => r.after[id] === "TYPED[" + id + "]")
  && !!r.stored && r.stored.topicPl === "TYPED[ie_topic_pl]" && r.stored.pl === "TYPED[ie_clause_pl]";

/* intent-save-diff. One clause changed and saved, then an edition that changes the name, the other clause and the comment. */
const DIFF_A = clone(SAMPLE);
DIFF_A.rev = 1;
const DIFF_B = clone(DIFF_A);
DIFF_B.rev = 2;
Object.assign(DIFF_B.tags.find(t => t.id === REQ.id), { topic: { en: "edition name en", pl: "edition name pl" },
  action: { en: "edition comment", pl: "edition comment pl" } });
DIFF_B.tags.find(t => t.id === REQ.id).clause.pl = "edition clause pl";
const diffLab = labWith("diff", DIFF_A);
async function savedDiff(file) {
  return scene(diffLab, file, async page => {
    await page.evaluate(id => openIntentEditor(intentIdxOfId(id)), REQ_ID);
    await page.waitForFunction(() => !!document.getElementById("ieSave"), { timeout: 10000 });
    await page.evaluate(() => {
      const e = document.getElementById("ie_clause_en");
      e.value = "my own clause";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("ieSave").click();
    });
    await sleep(200);
    const stored = await storedIntent(page, REQ_ID);
    await page.evaluate(() => { try { closeAllDialogs(); } catch (e) {} });
    await take(page, DIFF_B);
    await sleep(800);
    await settle(page);
    return { stored, shown: await shownIntent(page, REQ_ID) };
  });
}
const diffHeld = r => !!r && !!r.stored && JSON.stringify(Object.keys(r.stored).sort()) === '["en"]' && r.stored.en === "my own clause"
  && r.shown.en === "my own clause" && r.shown.topic === "edition name en" && r.shown.topicPl === "edition name pl"
  && r.shown.pl === "edition clause pl" && r.shown.cmt === "edition comment";

/* delete-restores, the words: a Delete control's tooltip that says the entry returns on Reset, in either language. */
const PROMISES_RESET = /Delete this (card|intent)[^"'\n]*\bReset\b|Usuń tę (kartę|intencję)[^"'\n]*zreset/;
function resetPromisers() {
  const dir = path.join(E.ROOT, "src", "modules");
  const where = fs.readdirSync(dir).filter(f => f.endsWith(".js")).map(f => ["src/modules/" + f, fs.readFileSync(path.join(dir, f), "utf8")]);
  where.push(["engine/etiuda.html", PAGE]);
  return where.filter(([, text]) => PROMISES_RESET.test(text)).map(([name]) => name);
}

/* private-layer-not-sent, the counts: five copies on a day the catalog in use was private, one the next day under the team's edition. */
async function statsModule(src) {
  const file = path.join(lab, "desk-stats-" + checks + "-" + Math.random().toString(36).slice(2) + ".mjs");
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}
function privateDaySum(Desk) {
  if (typeof Desk.setStatsWithheld !== "function") return { wired: false };
  const pack = {};
  Desk.setStatsWithheld(() => true);
  for (let i = 0; i < 5; i++) { Desk.bumpUse(pack, "card-1", "2026-11-20"); Desk.bumpIntent(pack, "t:t-ask", "2026-11-20"); Desk.bumpLang(pack, "en", "2026-11-20"); }
  Desk.bumpMiss(pack, "2026-11-20");
  Desk.setStatsWithheld(() => false);
  Desk.bumpUse(pack, "card-1", "2026-11-21");
  Desk.bumpLang(pack, "en", "2026-11-21");
  Desk.setStatsWithheld(null);
  const doc = Desk.statsDoc(pack, { period: { from: "2026-11-01", to: "2026-11-30" }, catalog: { id: "c-team", rev: 2 } });
  const card = (doc.cards || []).find(c => c.id === "card-1");
  return { wired: true, card: card ? card.n : 0, intents: (doc.intents || []).length, misses: doc.misses, en: (doc.langs || {}).en | 0,
    local: (pack.useCounts || {})["card-1"] | 0 };
}
const privateHeld = r => r.wired && r.card === 1 && r.intents === 0 && r.misses === 0 && r.en === 1 && r.local === 6;

/* private-layer-not-sent, the page: the shell's content view marks the catalog in use private, and an intent picked then counts
   into a day an answer leaves out; the same pick with no mark does not. */
const statsLab = labWith("stats", SAMPLE);
async function pickedDay(file, marked) {
  return scene(statsLab, file, async page => {
    await page.evaluate(marked => {
      const id = String((storedCatalog() || {}).id || "");
      window.E_HOST.teamJoin = op => op === "content" ? { team: "", told: false, private: marked ? [id] : [], listed: [], teamCatalogPins: [] } : null;
    }, marked);
    await page.evaluate(() => teamContent());
    await page.evaluate(() => pickIntent(0));
    await sleep(100);
    return page.evaluate(() => {
      const days = pack.days || {}, d = Object.keys(days).sort().pop();
      return { day: d || "", withheld: !!(d && days[d] && days[d].x) };
    });
  });
}

/* ed-radio-undo and ed-radio-back. The first card on the list, its English form of address set to one it does not hold, then
   left by Next (how "undo") or by closing every editor (how "back"), and the Undo taken. */
const radioLab = labWith("radio", SAMPLE);
async function radioKept(file, how) {
  return scene(radioLab, file, async page => {
    await page.evaluate(() => openCardEditor(document.querySelector("#list .card[data-id]").dataset.id));
    await page.waitForFunction(() => !!document.getElementById("meSave"), { timeout: 10000 });
    await sleep(100);
    const chosen = await page.evaluate(() => {
      const group = [...document.querySelectorAll('#modalCard input[type="radio"][name="meAddr_en"]')];
      const to = group.find(el => !el.checked);
      if (!to) return { n: group.length, value: null };
      to.click();
      return { n: group.length, value: to.value };
    });
    await settle(page);
    if (how === "undo") await page.evaluate(() => document.getElementById("edNext").click());
    else await page.evaluate(() => closeAllDialogs());
    await settle(page);
    await sleep(200);
    const offered = await page.evaluate(() => !!document.getElementById("eUndoBtn"));
    if (offered) await page.evaluate(() => document.getElementById("eUndoBtn").click());
    await settle(page);
    await sleep(300);
    const after = await page.evaluate(() => {
      const el = document.querySelector('#modalCard input[type="radio"][name="meAddr_en"]:checked');
      return el ? el.value : null;
    });
    return { chosen, offered, after };
  });
}
const radioHeld = r => !!r && r.chosen.n > 1 && r.chosen.value !== null && r.offered && r.after === r.chosen.value;

/* A deciding line lifted in a copy of the built page, beside the lab's catalog: the scene run on it must turn red. */
async function pagePlant(dir, from, to, run, red, line) {
  if (PLANTS_OFF) { skip(line); return; }
  const n = PAGE.split(from).length - 1;
  let ok = false, detail = "the plant's anchor is there " + n + " times";
  if (n === 1) {
    const file = "planted-" + checks + ".html";
    fs.writeFileSync(path.join(dir, file), PAGE.split(from).join(to));
    const r = await run(file);
    ok = red(r);
    detail = "still held: " + JSON.stringify(r);
  }
  check(ok, line, ok ? undefined : detail);
}

async function main() {
  {
    const r = await retyped("etiuda.html");
    check(retypeHeld(r), "ed-retype-by-field an open intent editor's typing stays in the box it was typed in when an edition makes the comment row appear, and Save stores the Polish name and clause as typed", r);
    await pagePlant(retypeLab, "const j = was.keys && k ? once.has(k) && !twice.has(k) ? once.get(k) : -1 : same ? i : -1;",
      "const j = i < was.fields.length ? i : -1;", retyped, r => !retypeHeld(r),
      "p ed-retype-by-field the typing put back by place, not by the field's id (dialog.js edRetype), turns it red");
  }
  {
    const r = await savedDiff("etiuda.html");
    check(diffHeld(r), "intent-save-diff Save after one clause stores that clause alone, and the next edition's name, Polish clause and comment show beside it", r);
    await pagePlant(diffLab, 'if (next[k] !== String((BASE_STORE[k] || [])[at] || "").trim()) own[k] = next[k];', "own[k] = next[k];",
      savedDiff, r => !diffHeld(r), "p intent-save-diff every field stored again on Save (editors.js, the intent's Save) turns it red");
  }
  {
    const u = await radioKept("etiuda.html", "undo"), b = await radioKept("etiuda.html", "back");
    check(radioHeld(u), "ed-radio-undo a form of address chosen in the card editor survives the Undo of moving on without saving", u);
    check(radioHeld(b), "ed-radio-back a form of address chosen in the card editor survives in a window brought back after a close", b);
    await pagePlant(radioLab, 'return el.type === "checkbox" || el.type === "radio" ? String(el.name || "") + "=" + String(el.value) : String(el.name || "");',
      'return String(el.name || "");', async file => ({ u: await radioKept(file, "undo"), b: await radioKept(file, "back") }),
      r => !radioHeld(r.u) && !radioHeld(r.b), "p ed-radio-undo ed-radio-back a box or radio keyed by its name alone (dialog.js edKeyOf) turns both red");
  }
  {
    const found = resetPromisers();
    check(found.length === 0, "delete-restores no Delete control says Reset brings the card or intent back, in English or Polish", found);
    check(PROMISES_RESET.test('title="Delete this card: a built-in one returns on Reset, one you made does not"')
      && PROMISES_RESET.test("Usuń tę intencję: wbudowana wróci po zresetowaniu, własna nie"),
      "delete-restores control: the scan finds the old tooltip in each language");
  }
  {
    const r = privateDaySum(await statsModule(STATS_SRC));
    check(privateHeld(r), "private-layer-not-sent dem4a a span's answer leaves out the day counted while the catalog was private: one copy of card-1, no intent, no miss, one English, though the desk's own tally keeps all six", r);
    for (const [from, to, line] of [
      ["  if(held) b.x=1; /* plant:stats-day-private */", "  /* plant lifted */", "p dem4a the day not marked when counted while private (desk-stats.js statsDay) turns it red"],
      ["&&!(days[d]&&days[d].x)).sort().forEach(d=>{ /* plant:stats-doc-private */", ").sort().forEach(d=>{", "p dem4a a marked day summed into the answer (desk-stats.js statsDoc) turns it red"]]) {
      if (PLANTS_OFF) { skip(line); continue; }
      const n = STATS_SRC.split(from).length - 1;
      const pr = n === 1 ? privateDaySum(await statsModule(STATS_SRC.split(from).join(to))) : null;
      check(!!pr && !privateHeld(pr), line, pr ? (privateHeld(pr) ? "still held: " + JSON.stringify(pr) : undefined) : "the plant's anchor is there " + n + " times");
    }
  }
  {
    const on = await pickedDay("etiuda.html", true), off = await pickedDay("etiuda.html", false);
    check(on.day && on.withheld && off.day && !off.withheld, "private-layer-not-sent dem4b an intent picked while the shell's view marks the catalog in use private counts into a withheld day, and not without the mark", { on, off });
    await pagePlant(statsLab, "setStatsWithheld(inUsePrivateNow);", "void inUsePrivateNow;", file => pickedDay(file, true), r => !r.withheld,
      "p dem4b the page's view of the mark not handed to the counts (team-join.js) turns it red");
  }
}

try { await main(); }
catch (e) { check(false, "run crashed: " + (e && e.stack ? e.stack : e)); }
finally {
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}
console.log("#counts checks=" + checks + " skipped=" + skipped + " failed=" + fails + " expected=" + EXPECTED);
console.log("RESULT checks=" + checks + " failed=" + fails);
process.exit(fails || checks + skipped !== EXPECTED ? 1 : 0);
