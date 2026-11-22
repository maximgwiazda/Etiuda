/* "THIS LOOKS WRONG" ON THE DESK: the card's own button, its blue bubbles and the mark beside the card's name.
 *
 *   node tests/desk-flag.mjs [--engine <file>]
 *
 * Headless Chrome on the built engine page and the shipped sample catalog, one card's title made long. The shell's half of
 * the flag is stood in by a host answering branchReach, so an offered desk and a desk where no flag can be made are both
 * shown. In English light, English dark, Polish light and Polish dark, as the eye finds it:
 *   f1  offered: the button on every card on screen, second after edit; not offered: no card has it, and the row of buttons
 *       closes over the place it would take
 *   f2  one click: the flag stands before the bubble is put on the page; the bubble's words are the copywriter's, it hangs
 *       from the button, and its words do not select
 *   f3  Enter with a note keeps the note and closes; Esc, Done and a press elsewhere close and leave the flag; Take it back
 *       removes it; a note refused keeps the bubble and the typed text; the card's own button pressed while its bubble
 *       stands (pointer, Enter) closes the bubble and keeps the flag
 *   f4  sent: the button lit, the mark "With the lead" 22 high, radius 7, 10 after the name, unselectable, whole beside a long
 *       name that gives way; a card kept across an intent pick files its badge after the mark (the pool's own check); a
 *       click on the lit button takes the flag back
 *   f5  answered, each outcome: kept and changed say so in the mark and the bubble, and once opened the mark and the lit
 *       button are gone; Esc closes the answer's bubble; the lit button pressed while the answer's bubble stands closes it
 *       and sends nothing; a card the edition took away shows nothing
 *   f6  an answer arriving with an edition while the page is open changes the mark with no reload and PAX left as typed
 *   f7  nothing of this in the top bar
 *   f8  the keyboard: Tab from edit reaches the button, Enter sends and opens, Esc closes and gives the focus back
 *   f9  the 101st press: nothing sent, and a bubble from the button in the copywriter's words; the line under a refused note
 *       for each case; and the facts both rest on, held here so the words cannot outlive them: a line break and a tab are
 *       refused as control, and a flag taken back or answered leaves the count of a hundred
 * Inline plant proofs in scratch copies of the page: the bubble shown before the flag is sent turns f2 red, a greyed button
 * drawn where no flag can be made turns f1 red, an answer whose mark stays after it was opened turns f5 red, and the button pressed
 * while its bubble stands acting on the flag turns f3 red; each is
 * skipped with a NOT RUN line when ETIUDA_PLANTS=off. With DESK_FLAG_STILLS naming a folder, stills of each state are written
 * there, and nowhere otherwise.
 *
 * Exit code is the number of failed checks; 78 when the run could not complete.
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
const STILLS = process.env.DESK_FLAG_STILLS ? path.resolve(process.env.DESK_FLAG_STILLS) : "";
const EXPECTED = 139;
let fails = 0, checks = 0, notRun = 0;
const check = (ok, what, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what + (!ok && detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  if (!ok) fails++;
};
const skip = (what) => { notRun++; console.log("  NOT RUN " + what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const at = argv.indexOf("--engine");
const ENGINE = at >= 0 ? path.resolve(argv[at + 1]) : E.ENGINE_PATH;

const WORDS = {
  en: { button: "This looks wrong", title: "Sent to the lead",
    line: "The lead will see it in Studio, and the answer comes with the team's next edition. If you know what is wrong, add it here; it is fine not to know.",
    hint: "What looks wrong (optional), then Enter", back: "Take it back", done: "Done", sent: "With the lead", answered: "Answered",
    answerTitle: "The lead has answered", kept: "Left as it is.", changed: "The card has been mended.",
    tooLong: "The note can be up to 500 characters long.", control: "The note holds a character it cannot keep, such as a line break or a tab.",
    full: "This desk has already sent as many flags on this catalog as it can, so this one was not sent. Room comes back as the lead answers." },
  pl: { button: "Coś się nie zgadza", title: "Przekazano liderowi zespołu",
    line: "Lider zespołu zobaczy to w Studio, a odpowiedź przyjdzie z następnym wydaniem zespołu. Jeśli wiadomo, co się nie zgadza, można to tu dopisać; nie trzeba tego wiedzieć.",
    hint: "Co się nie zgadza (nieobowiązkowo), potem Enter", back: "Wycofaj", done: "Gotowe", sent: "U lidera", answered: "Jest odpowiedź",
    answerTitle: "Jest odpowiedź lidera zespołu", kept: "Bez zmian.", changed: "Kartę poprawiono.",
    tooLong: "Notatka może mieć najwyżej 500 znaków.", control: "Notatka zawiera znak, którego nie może zachować, na przykład podział wiersza lub tabulator.",
    full: "To stanowisko wysłało już tyle zgłoszeń do tego katalogu, ile może, więc tego nie wysłano. Miejsce zwalnia się, gdy lider zespołu odpowiada." },
};
const CARD = "c-opening-the-order-in-hand";
const LONG = "c-opening-a-familiar-name";

/* The sample, with one title long enough that the name must give way to the mark. Invented words. */
const SAMPLE = JSON.parse(fs.readFileSync(path.join(E.ROOT, "shell", "sample-catalog.ec"), "utf8"));
const longCard = SAMPLE.cards.find((c) => c.id === LONG);
longCard.title = { en: "Opening, a familiar name returning after a long while with the order still open and the parcel on its way home",
  pl: "Powitanie, ponowna rozmowa po długiej przerwie, gdy zamówienie jest wciąż otwarte, a paczka dopiero jedzie do domu" };
const CATALOG = JSON.stringify(SAMPLE);

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-desk-flag-"));
const copyFiles = (dir, htmlText) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "etiuda.html"), htmlText);
  return "file:///" + path.join(dir, "etiuda.html").replace(/\\/g, "/");
};
const RAW = fs.readFileSync(ENGINE, "utf8");
const url = copyFiles(path.join(lab, "page"), RAW);
let browser = null;

async function boot(pageUrl, { lang = "en", theme = "light", offered = true } = {}) {
  /* A context of its own, so no page inherits the storage an earlier one left. */
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.__ctx = ctx;
  p.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  p.on("pageerror", (e) => console.log("       page error: " + String(e && e.message || e).split("\n")[0]));
  await p.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.evaluateOnNewDocument((lang, theme, offered) => {
    try {
      for (const [k, v] of [["eTourDone_v3", "1"], ["eTourInvite_v3", "1"], ["eAgent", "Bench Agent"], ["eNameAsked", "1"], ["eFirstSigninSeen", "1"],
        ["eTheme", theme], ["eUiLang", lang], ["eStill", "1"], ["eMotionOff", "1"]]) localStorage.setItem(k, v);
    } catch (e) {}
    /* The shell's half, stood in: a desk with a key, a file it may write, and whether a flag made now would reach a lead. */
    window.__flagWrites = [];
    window.E_HOST = {
      onPickAsk() {},
      branchIdentity: () => Promise.resolve({ id: "0123456789abcdef", key: "k".repeat(43), box: "b".repeat(43) }),
      writeBranch: (stem, text) => { window.__flagWrites.push(String(stem)); return Promise.resolve({ ok: true }); },
      branchReach: () => offered,
    };
    window.__booted = 1;
  }, lang, theme, offered);
  await seatPage(p);
  await E.seedCatalog(p, CATALOG);
  await p.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("ecYes") || document.querySelectorAll("#list .card").length > 0, { timeout: 30000 });
  if (await p.$("#ecYes")) await p.click("#ecYes");
  await p.waitForFunction(() => document.querySelectorAll("#list .card").length > 0 && !document.getElementById("ecYes")
    && !document.querySelector(".e-launch-veil"), { timeout: 30000 });
  await p.evaluate(() => {
    document.documentElement.classList.add("e-still");
    document.querySelectorAll("body > .bub").forEach((b) => b.remove());
    const t = document.getElementById("toast"); if (t) t.style.display = "none";
  });
  await p.evaluate(MEASURE);
  await sleep(200);
  return p;
}
const closePage = (p) => Promise.race([p.close().then(() => p.__ctx.close()).catch(() => {}), sleep(5000)]);

/* In the page: the pointer's point against the control's box (as tests/desk-bubbles-origin.mjs measures it), and the
   record of what the flag was at the moment its bubble was put on the page. */
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
  const b=bub.getBoundingClientRect(), shown=b.top>=-1 && b.left>=-1 && b.bottom<=innerHeight+1 && b.right<=innerWidth+1;
  const ok=shown && perp>=-2 && perp<=11 && along>=lo-0.5 && along<=hi+0.5 && c.width>4;
  return {ok:ok, shown:shown, side:side, perp:Math.round(perp*10)/10, along:Math.round(along), span:[Math.round(lo),Math.round(hi)]};
};
window.__shown=[];
if(!window.__appendHooked){
  window.__appendHooked=1;
  const note=n=>{ if(n && n.nodeType===1 && n.classList.contains("e-flag-bub")) window.__shown.push(JSON.stringify(cardFlag(window.__fid||""))); };
  const ap=Node.prototype.appendChild, apn=Element.prototype.append;
  Node.prototype.appendChild=function(n){ note(n); return ap.call(this,n); };
  Element.prototype.append=function(...ns){ ns.forEach(note); return apn.apply(this,ns); };
}`;

const cardSel = (id) => '#list .card[data-id="' + id + '"]';
const btnSel = (id) => cardSel(id) + ' > .chead .cacts [data-act="flag"]';
const markSel = (id) => cardSel(id) + " > .chead .cflag";
const BUB = "body > .e-flag-bub";

async function toCard(p, id) {
  await p.evaluate((sel) => { const c = document.querySelector(sel); if (c) c.scrollIntoView({ block: "center" }); }, cardSel(id));
  await sleep(150);
  await p.hover(cardSel(id) + " > .chead .ctitle");
  await sleep(120);
}
async function rest(p) { await p.mouse.move(2, 600); await sleep(120); }
async function clickFlag(p, id) {
  await toCard(p, id);
  await p.evaluate((id) => { window.__fid = id; window.__shown = []; }, id);
  await p.click(btnSel(id));
  await sleep(250);
}
/* No flag on the card, drawn again. */
async function clear(p, id) {
  await p.evaluate((id) => {
    try { closeFlagBubbles(); } catch (e) {}
    unflagCard(id); try { flagSeen(id); } catch (e) {}
    hooks.render();
  }, id);
  await sleep(120);
}
const bubNow = (p) => p.evaluate((sel) => {
  const b = document.querySelector(sel);
  if (!b || !b.isConnected) return null;
  const q = (s) => { const e = b.querySelector(s); return e ? e.textContent.trim() : null; };
  const inp = b.querySelector("input");
  return { title: q("h3"), line: q("p"), hint: inp ? inp.placeholder : null, value: inp ? inp.value : null,
    back: q('[data-flag="back"]'), done: q('[data-flag="done"]'), sel: getComputedStyle(b.querySelector("p")).userSelect };
}, BUB);
const flagOf = (p, id) => p.evaluate((id) => cardFlag(id), id);
/* A point on the page with nothing to press under it. */
const emptyPoint = (p) => p.evaluate(() => {
  const busy = "button,a,input,textarea,select,[role],[tabindex],.card,.txt,.list-sep,header,.fab,.bub,label,code,.pill";
  for (let y = innerHeight - 30; y > 200; y -= 40) for (let x = innerWidth - 20; x > innerWidth / 2; x -= 40) {
    const el = document.elementFromPoint(x, y);
    if (el && !el.closest(busy)) return { x, y, tag: el.tagName + (el.id ? "#" + el.id : "") };
  }
  return null;
});
/* An edition of the same catalog arriving: built from the catalog in use, `edit` applied, taken as a take takes it. */
const takeEdition = (p, catalog, edit) => p.evaluate((text, editSrc, id) => {
  const doc = JSON.parse(text);
  doc.rev = (+doc.rev || 1) + 1 + Math.floor(Math.random() * 1000);
  const f = (flagFileList().find((x) => x.card === id) || {}).r;
  new Function("doc", "f", "id", editSrc)(doc, f ? flagDigest(f) : "", id);
  return activateCatalog(parseCatalogFile(JSON.stringify(doc)), { from: "edition.ec" });
}, catalog, edit, CARD);
const EDIT_KEPT = 'doc.answered=[{f:f,o:"kept"}];';
const EDIT_CHANGED = 'const c=doc.cards.find(x=>x.id===id); c.body={en:c.body.en+" Of course.", pl:c.body.pl+" Oczywiście."};';
const EDIT_GONE = 'doc.cards=doc.cards.filter(x=>x.id!==id);';

async function still(p, name, sels) {
  if (!STILLS) return;
  const r = await p.evaluate((sels) => {
    let a = null;
    for (const s of sels) {
      const e = document.querySelector(s); if (!e || !e.getClientRects().length) continue;
      const b = e.getBoundingClientRect();
      a = a ? { l: Math.min(a.l, b.left), t: Math.min(a.t, b.top), r: Math.max(a.r, b.right), b: Math.max(a.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    }
    if (!a) return null;
    const m = 24, l = Math.max(0, a.l - m), t = Math.max(0, a.t - m);
    return { x: l, y: t, width: Math.min(innerWidth, a.r + m) - l, height: Math.min(innerHeight, a.b + m) - t };
  }, sels);
  if (!r) return;
  fs.mkdirSync(STILLS, { recursive: true });
  await p.screenshot({ path: path.join(STILLS, name + ".png"), clip: r, captureBeyondViewport: false });
}

/* One offered desk, every state. */
async function runOffered(pageUrl, lang, theme) {
  const W = WORDS[lang], tag = lang + " " + theme + ": ";
  const p = await boot(pageUrl, { lang, theme, offered: true });
  try {
    const topBar = [];
    const noTopBar = async (when) => {
      const n = await p.evaluate(() => document.querySelectorAll('header [data-act="flag"], header .cflag, header .flag-btn, header .e-flag-bub').length);
      if (n) topBar.push(when + ": " + n);
    };
    await noTopBar("at rest");

    /* f1 */
    const f1 = await p.evaluate(() => [...document.querySelectorAll("#list .card[data-id]")].filter((c) => c.getClientRects().length).map((c) => {
      const acts = [...c.querySelectorAll(":scope > .chead .cacts button")].map((b) => b.getAttribute("data-act"));
      return { id: c.dataset.id, ok: acts.indexOf("flag") >= 1 && acts.indexOf("flag") === acts.indexOf("edit") + 1, acts };
    }));
    const label = await p.evaluate((s) => { const b = document.querySelector(s); return b && [b.title, b.getAttribute("aria-label")]; }, btnSel(CARD));
    check(f1.length > 3 && f1.every((x) => x.ok) && !!label && label[0] === W.button && label[1] === W.button,
      tag + "f1 the button, named in the copywriter's words, is on every card drawn (" + f1.length + "), second after edit",
      { label, bad: f1.filter((x) => !x.ok).slice(0, 3) });

    /* f2 */
    await clickFlag(p, CARD);
    const order = await p.evaluate(() => window.__shown.slice());
    const b2 = await bubNow(p);
    check(order.length >= 1 && /"state":"sent"/.test(order[0]) && b2, tag + "f2 the flag stands before its bubble is on the page", { order, bubble: !!b2 });
    check(!!b2 && b2.title === W.title && b2.line === W.line && b2.hint === W.hint && b2.back === W.back && b2.done === W.done,
      tag + "f2 the bubble's words are the copywriter's", b2);
    const hang = await p.evaluate((b, s) => window.__bubAt(document.querySelector(b), document.querySelector(s)), BUB, btnSel(CARD));
    await noTopBar("bubble open");
    await still(p, lang + "-" + theme + "-1-sent-bubble", [BUB, cardSel(CARD) + " > .chead"]);
    check(!!hang.ok, tag + "f2 the bubble hangs from the button", hang);
    const unsel = await p.evaluate((b, m) => ({ bub: getComputedStyle(document.querySelector(b + " h3")).userSelect, line: getComputedStyle(document.querySelector(b + " p")).userSelect }), BUB, markSel(CARD));
    check(unsel.bub === "none" && unsel.line === "none", tag + "f2 the bubble's words do not select", unsel);

    /* f3 */
    await p.keyboard.type("The date is old");
    await p.keyboard.press("Enter");
    await sleep(200);
    const f3a = { bubble: await bubNow(p), flag: await flagOf(p, CARD) };
    check(!f3a.bubble && f3a.flag && f3a.flag.state === "sent" && f3a.flag.note === "The date is old", tag + "f3 Enter keeps the note and closes", f3a);
    const closes = [];
    for (const how of ["Escape", "done", "outside"]) {
      await clear(p, CARD);
      await clickFlag(p, CARD);
      const open = !!(await bubNow(p));
      if (how === "Escape") await p.keyboard.press("Escape");
      else if (how === "done") await p.click(BUB + ' [data-flag="done"]');
      else { const pt = await emptyPoint(p); if (pt) await p.mouse.click(pt.x, pt.y); else closes.push({ how, why: "no empty point" }); }
      await sleep(200);
      const after = { how, open, bubble: !!(await bubNow(p)), flag: await flagOf(p, CARD) };
      closes.push(after);
      check(open && !after.bubble && after.flag && after.flag.state === "sent",
        tag + "f3 " + (how === "Escape" ? "Esc" : how === "done" ? "Done" : "a press elsewhere") + " closes and leaves the flag", after);
    }
    await clear(p, CARD);
    await clickFlag(p, CARD);
    await p.click(BUB + ' [data-flag="back"]');
    await sleep(200);
    const f3b = { bubble: !!(await bubNow(p)), flag: await flagOf(p, CARD) };
    check(!f3b.bubble && f3b.flag === null, tag + "f3 Take it back removes the flag and closes", f3b);
    /* The card's own button while its bubble stands: closes the bubble and nothing else, by the pointer and by Enter. Space
       presses no card button on the desk (the star neither, before the flag), so it is not asked here. */
    const own = [];
    for (const how of ["pointer", "Enter"]) {
      await clear(p, CARD);
      await clickFlag(p, CARD);
      const open = !!(await bubNow(p));
      if (how === "pointer") await p.click(btnSel(CARD));
      else { await p.evaluate((b) => document.querySelector(b).focus(), btnSel(CARD)); await p.keyboard.press(how); }
      await sleep(200);
      const fl = await flagOf(p, CARD);
      own.push({ how, open, bubble: !!(await bubNow(p)), sent: !!(fl && fl.state === "sent"),
        focus: await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-act")) });
    }
    check(own.every((o) => o.open && !o.bubble && o.sent) && own.slice(1).every((o) => o.focus === "flag"),
      tag + "f3 the card's own button, pressed while its bubble stands (pointer, Enter), closes the bubble and keeps the flag", own);
    await clear(p, CARD);
    await clickFlag(p, CARD);
    const typed = "x".repeat(501), ctl = "a" + String.fromCharCode(9) + "b";
    const refused = [];
    for (const v of [typed, ctl]) {
      await p.evaluate((b, v) => { const i = document.querySelector(b + " input"); i.focus(); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }, BUB, v);
      await p.keyboard.press("Enter");
      await sleep(150);
      const now = await bubNow(p), fl = await flagOf(p, CARD);
      const why = await p.evaluate((b) => { const e = document.querySelector(b + " .e-flag-why"); return e && !e.hidden && e.getClientRects().length ? { t: e.textContent.trim(), sel: getComputedStyle(e).userSelect } : null; }, BUB);
      refused.push({ open: !!now, kept: !!now && now.value === v, note: fl && fl.note, why });
      if (v === typed) await still(p, lang + "-" + theme + "-1b-note-too-long", [BUB, cardSel(CARD) + " > .chead"]);
      else await still(p, lang + "-" + theme + "-1c-note-control", [BUB, cardSel(CARD) + " > .chead"]);
    }
    check(refused.every((r) => r.open && r.kept && r.note === ""), tag + "f3 a note refused (too long, a control character) keeps the bubble and the typed text", refused);
    check(!!refused[0].why && refused[0].why.t === W.tooLong && !!refused[1].why && refused[1].why.t === W.control
      && refused.every((r) => r.why && r.why.sel === "none"), tag + "f3 under a refused note, the copywriter's line for its case, unselectable", refused.map((r) => r.why));
    /* The control line names a line break and a tab: true only while the refusal covers both. */
    const ctlFact = await p.evaluate((id) => [10, 9, 13].map((c) => { const r = flagNote(id, "a" + String.fromCharCode(c) + "b"); return [c, r && r.refused]; }), CARD);
    check(ctlFact.every((x) => x[1] === "control"), tag + "f3 a line break, a tab and a carriage return are each refused as control (the line's example holds)", ctlFact);
    await p.keyboard.press("Escape");
    await sleep(150);

    /* f4 */
    await toCard(p, CARD);
    const f4 = await p.evaluate((b, m, card) => {
      const btn = document.querySelector(b), mark = document.querySelector(m), title = document.querySelector(card + " > .chead .ctitle");
      if (!btn || !mark || !title) return { why: "missing", btn: !!btn, mark: !!mark, title: !!title };
      const cs = getComputedStyle(btn), ms = getComputedStyle(mark), br = btn.getBoundingClientRect(), mr = mark.getBoundingClientRect(), tr = title.getBoundingClientRect();
      return { lit: btn.classList.contains("on") && btn.getAttribute("aria-pressed") === "true", edge: cs.boxShadow, shown: br.width > 10 && cs.opacity === "1",
        words: mark.textContent.trim(), h: Math.round(mr.height * 10) / 10, radius: ms.borderTopLeftRadius, gap: Math.round((mr.left - tr.right) * 10) / 10,
        sel: ms.userSelect, font: ms.fontSize + " " + ms.fontWeight };
    }, btnSel(CARD), markSel(CARD), cardSel(CARD));
    await still(p, lang + "-" + theme + "-2-sent-lit-and-mark", [cardSel(CARD) + " > .chead"]);
    check(!!f4.lit && f4.shown && /217, 138, 31/.test(f4.edge || ""), tag + "f4 the button is lit amber", f4);
    check(f4.words === W.sent && Math.abs(f4.h - 22) <= 0.5 && f4.radius === "7px" && Math.abs(f4.gap - 10) <= 0.5 && f4.sel === "none"
      && f4.font === "12px 600", tag + "f4 the mark: its words, 22 high, radius 7, 10 after the name, unselectable", f4);
    /* A kept card patched by an intent pick files its badge after the mark, the bytes a rebuild writes. */
    /* A card the pick keeps (its node the same across the pick) and the pick marks as linked: the patched path. */
    const pair = await p.evaluate(async () => {
      const sl = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let k = 0; k < 60; k++) {
        try { pickIntent(k, false); } catch (e) { break; }
        await sl(120);
        const hits = [...document.querySelectorAll("#list .card[data-id]")].filter((c) => cardHitsSelectedIntent(findCard(c.dataset.id)));
        pickIntent(k, true);
        await sl(120);
        if (!hits.length) continue;
        const was = new Map(hits.map((c) => [c.dataset.id, document.querySelector('#list .card[data-id="' + c.dataset.id + '"]')]));
        pickIntent(k, false);
        await sl(120);
        const kept = [...was].find(([id, el]) => el && el === document.querySelector('#list .card[data-id="' + id + '"]'));
        pickIntent(k, true);
        await sl(120);
        if (kept) return { si: k, id: kept[0] };
      }
      return null;
    });
    await sleep(200);
    if (pair) {
      await p.evaluate((pr) => { flagCard(pr.id); }, pair);
      await sleep(200);
      await p.evaluate((pr) => { window.__keptEl = document.querySelector('#list .card[data-id="' + pr.id + '"]'); window.__verifyPool = true; window.__poolMismatch = null; pickIntent(pr.si, false); }, pair);
      await sleep(400);
    }
    const pool = !pair ? { found: -1 } : await p.evaluate((pr) => {
      const head = document.querySelector('#list .card[data-id="' + pr.id + '"] > .chead');
      const order = head ? [...head.children].map((c) => c.className.split(" ")[0]) : null;
      const patched = !!head && head.parentNode === window.__keptEl;
      const bad = window.__poolMismatch;
      window.__verifyPool = false;
      const mine = bad ? bad.filter((b) => b.id === pr.id) : null;
      if (mine && mine.length) { const w = mine[0].want, g = mine[0].got; let i = 0; while (i < w.length && w[i] === g[i]) i++; window.__poolDiff = { want: w.slice(i - 60, i + 120), got: g.slice(i - 60, i + 120) }; }
      pickIntent(pr.si, true);
      unflagCard(pr.id);
      return { found: pr.si, id: pr.id, patched, bad: mine ? mine.length : null, order, diff: window.__poolDiff || null };
    }, pair);
    await sleep(200);
    const at = pool.order ? pool.order.indexOf("cflag") : -1;
    check(pool.found >= 0 && pool.patched && pool.bad === 0 && at >= 0 && pool.order[at + 1] === "cbadge",
      tag + "f4 a card kept across an intent pick files its badge after the mark, the bytes a rebuild writes for it", pool);
    await p.evaluate((id) => { flagCard(id); }, LONG);
    await sleep(150);
    const longs = [];
    for (const hovered of [false, true]) {
      if (hovered) await toCard(p, LONG); else { await toCard(p, LONG); await rest(p); }
      longs.push(await p.evaluate((card) => {
        const head = document.querySelector(card + " > .chead"), mark = head && head.querySelector(".cflag"), title = head && head.querySelector(".ctitle"), acts = head && head.querySelector(".cacts");
        if (!mark || !title) return { why: "missing" };
        const mr = mark.getBoundingClientRect(), hr = head.getBoundingClientRect(), ar = acts.getBoundingClientRect();
        return { whole: mark.scrollWidth <= mark.clientWidth + 0.5 && mr.right <= hr.right + 0.5 && (ar.width < 1 || mr.right <= ar.left + 0.5),
          shortened: title.scrollWidth > title.clientWidth + 1, words: mark.textContent.trim() };
      }, cardSel(LONG)));
    }
    if (lang === "en" && theme === "light") await still(p, "en-light-2b-long-name", [cardSel(LONG) + " > .chead"]);
    check(longs.every((l) => l.whole && l.shortened && l.words === W.sent), tag + "f4 beside a long name the mark stays whole and the name gives way, at rest and hovered", longs);
    await p.evaluate((id) => { unflagCard(id); }, LONG);
    await toCard(p, CARD);
    await p.click(btnSel(CARD));
    await sleep(200);
    const f4c = { flag: await flagOf(p, CARD), mark: await p.evaluate((m) => !!document.querySelector(m), markSel(CARD)),
      lit: await p.evaluate((b) => { const e = document.querySelector(b); return !!(e && e.classList.contains("on")); }, btnSel(CARD)) };
    check(f4c.flag === null && !f4c.mark && !f4c.lit, tag + "f4 a click on the lit button takes the flag back", f4c);

    /* f6, and f5 kept: the answer arrives with an edition while PAX holds what the agent typed. */
    await clickFlag(p, CARD);
    await p.keyboard.press("Escape");
    await p.evaluate(() => { window.__sameDoc = 1; });
    await p.click("#pax", { clickCount: 3 });
    await p.keyboard.type("Ann Lee");
    const taken = await takeEdition(p, CATALOG, EDIT_KEPT);
    await sleep(300);
    const f6 = await p.evaluate((m) => {
      const mark = document.querySelector(m);
      return { sameDoc: window.__sameDoc === 1, pax: document.getElementById("pax").value, words: mark ? mark.textContent.trim() : null,
        ink: mark ? getComputedStyle(mark).color : null, accent: (() => { const s = document.createElement("span"); s.style.color = "var(--accent)"; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; })() };
    }, markSel(CARD));
    f6.taken = taken;
    await noTopBar("answered");
    check(f6.sameDoc && f6.pax === "Ann Lee" && f6.words === W.answered && f6.ink === f6.accent,
      tag + "f6 an answer arriving with an edition turns the mark to Answered in the accent, with no reload and PAX as typed", f6);
    await toCard(p, CARD);
    await still(p, lang + "-" + theme + "-3-answered-mark", [cardSel(CARD) + " > .chead"]);
    await p.click(markSel(CARD));
    await sleep(250);
    const k = { bubble: await bubNow(p), flag: await flagOf(p, CARD),
      hang: await p.evaluate((b, m) => window.__bubAt(document.querySelector(b), document.querySelector(m)), BUB, markSel(CARD)) };
    await still(p, lang + "-" + theme + "-4-answer-bubble", [BUB, cardSel(CARD) + " > .chead"]);
    check(!!k.bubble && k.bubble.title === W.answerTitle && k.bubble.line === W.kept && k.bubble.done === W.done && k.flag === null && !!k.hang.ok,
      tag + "f5 kept: the answer's bubble says so, hangs from the mark, and opening it is the answer seen", k);
    await p.click(BUB + ' [data-flag="done"]');
    await sleep(200);
    await toCard(p, CARD);
    const goneAfter = (sel) => p.evaluate((m, b) => ({ mark: !!document.querySelector(m), lit: !!document.querySelector(b + ".on") }), markSel(CARD), btnSel(CARD));
    const k2 = await goneAfter();
    check(!k2.mark && !k2.lit, tag + "f5 kept: once opened, the mark and the lit button are gone", k2);

    /* f5 changed, closed by Esc. */
    await p.evaluate((id) => flagCard(id), CARD);
    await takeEdition(p, CATALOG, EDIT_CHANGED);
    await sleep(300);
    await toCard(p, CARD);
    const cw = await p.evaluate((m) => { const e = document.querySelector(m); return e ? e.textContent.trim() : null; }, markSel(CARD));
    await p.click(markSel(CARD));
    await sleep(250);
    const c1 = await bubNow(p);
    await p.keyboard.press("Escape");
    await sleep(200);
    const c2 = { bubble: !!(await bubNow(p)), ...(await goneAfter()) };
    check(cw === W.answered && !!c1 && c1.title === W.answerTitle && c1.line === W.changed && !c2.bubble && !c2.mark && !c2.lit,
      tag + "f5 changed: Answered, the mended line, Esc closes, and the mark and the lit button are gone", { cw, c1, c2 });
    /* The lit button pressed while the answer's bubble stands closes it and sends nothing new. */
    await p.evaluate((id) => flagCard(id), CARD);
    await takeEdition(p, CATALOG, EDIT_KEPT);
    await sleep(300);
    await toCard(p, CARD);
    await p.click(markSel(CARD));
    await sleep(250);
    const a1 = !!(await bubNow(p));
    await p.click(btnSel(CARD));
    await sleep(250);
    const a2 = { bubble: !!(await bubNow(p)), flag: await flagOf(p, CARD), ...(await goneAfter()) };
    check(a1 && !a2.bubble && a2.flag === null && !a2.mark && !a2.lit,
      tag + "f5 the lit button pressed while the answer's bubble stands closes it and sends no new flag", { a1, a2 });

    /* f8 the keyboard. */
    await rest(p);
    await p.evaluate((card) => { document.querySelector(card + ' > .chead .cacts [data-act="edit"]').focus(); }, cardSel(CARD));
    await p.keyboard.press("Tab");
    const kb1 = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-act"));
    await p.evaluate((id) => { window.__fid = id; window.__shown = []; }, CARD);
    await p.keyboard.press("Enter");
    await sleep(250);
    const kb2 = { bubble: !!(await bubNow(p)), flag: await flagOf(p, CARD) };
    await p.keyboard.press("Escape");
    await sleep(200);
    const kb3 = await p.evaluate(() => ({ bubble: !!document.querySelector("body > .e-flag-bub"), focus: document.activeElement && document.activeElement.getAttribute("data-act") }));
    check(kb1 === "flag" && kb2.bubble && kb2.flag && kb2.flag.state === "sent" && !kb3.bubble && kb3.focus === "flag",
      tag + "f8 Tab from edit reaches the button, Enter sends and opens, Esc closes and gives the focus back", { kb1, kb2, kb3 });

    /* f9 the 101st press: a hundred other cards flagged, the card's own press is not sent and the bubble says so. */
    await clear(p, CARD);
    const hundred = await p.evaluate((id) => {
      const ids = [...document.querySelectorAll("#list .card[data-id]")].map((c) => c.dataset.id).filter((x) => x !== id).slice(0, 100);
      ids.forEach((x) => flagCard(x));
      return { ids, n: flagFileList().length };
    }, CARD);
    await toCard(p, CARD);
    await p.click(btnSel(CARD));
    await sleep(250);
    const full = await p.evaluate((b, s, id) => {
      const e = document.querySelector(b), btn = document.querySelector(s);
      const btns = e ? [...e.querySelectorAll("button")] : [];
      const done = e ? e.querySelector('.tour-actions [data-flag="done"]') : null;
      const bg = done ? (getComputedStyle(done).backgroundColor.match(/[\d.]+/g) || []) : [];
      const filled = bg.length >= 3 && +bg[0] > 240 && +bg[1] > 240 && +bg[2] > 240 && (bg[3] === undefined || +bg[3] > 0.9);
      return { words: e ? e.querySelector("p").textContent.trim() : null, sel: e ? getComputedStyle(e.querySelector("p")).userSelect : null,
        hang: e ? window.__bubAt(e, btn) : null, flag: cardFlag(id), lit: !!(btn && btn.classList.contains("on")),
        btnCount: btns.length, done: done ? done.textContent.trim() : null,
        primary: !!(done && done.classList.contains("primary")), filled, focused: !!done && document.activeElement === done };
    }, BUB, btnSel(CARD), CARD);
    await still(p, lang + "-" + theme + "-5-full-bubble", [BUB, cardSel(CARD) + " > .chead"]);
    await p.keyboard.press("Escape");
    await sleep(150);
    const fullGone = !(await bubNow(p));
    check(hundred.n === 100 && full.words === W.full && full.sel === "none" && !!full.hang && full.hang.ok && full.flag === null && !full.lit && fullGone,
      tag + "f9 the 101st press sends nothing, and a bubble from the button says so in the copywriter's words; Esc closes it", { n: hundred.n, full, fullGone });
    check(full.btnCount === 1 && full.done === W.done && full.primary && full.filled && full.focused,
      tag + "f9 the full bubble carries one filled Done button in the desk's language, focused", full);
    const fullDone = [];
    for (const how of ["click", "Enter"]) {
      await toCard(p, CARD);
      await p.click(btnSel(CARD));
      await sleep(200);
      const open = !!(await bubNow(p));
      if (how === "click") {
        const hasDone = !!(await p.$(BUB + ' [data-flag="done"]'));
        if (hasDone) await p.click(BUB + ' [data-flag="done"]');
      } else {
        await p.keyboard.press("Enter");
      }
      await sleep(200);
      const st = await p.evaluate((s, id) => ({
        focusOwn: document.activeElement === document.querySelector(s),
        flag: cardFlag(id), n: flagFileList().length
      }), btnSel(CARD), CARD);
      fullDone.push({ how, open, closed: !(await bubNow(p)), ...st });
    }
    check(fullDone.every((x) => x.open && x.closed && x.focusOwn && x.flag === null && x.n === 100),
      tag + "f9 Done (click, Enter) closes the full bubble, returns focus to the card's flag button, and sends nothing", fullDone);
    const fullClose = [];
    for (const how of ["outside", "pointer", "Enter"]) {
      await toCard(p, CARD);
      await p.click(btnSel(CARD));
      await sleep(200);
      const open = !!(await bubNow(p));
      if (how === "outside") {
        const pt = await emptyPoint(p);
        if (pt) await p.mouse.click(pt.x, pt.y);
      } else if (how === "pointer") {
        await p.click(btnSel(CARD));
      } else {
        await p.evaluate((s) => document.querySelector(s).focus(), btnSel(CARD));
        await p.keyboard.press("Enter");
      }
      await sleep(200);
      const st = await p.evaluate((s, id) => ({
        focusOwn: document.activeElement === document.querySelector(s),
        flag: cardFlag(id), n: flagFileList().length
      }), btnSel(CARD), CARD);
      fullClose.push({ how, open, closed: !(await bubNow(p)), ...st });
    }
    check(fullClose.every((x) => x.open && x.closed && x.flag === null && x.n === 100 && (x.how === "outside" || x.focusOwn)),
      tag + "f9 a press elsewhere or on the card's flag button (pointer, Enter) closes the full bubble and sends nothing", fullClose);
    /* "Room comes back as the lead answers": true only while a flag taken back and a flag answered each leave the count. */
    const back = await p.evaluate((ids, id) => {
      unflagCard(ids[0]);
      const r = flagCard(id); const ok = !!(r && r.card === id);
      unflagCard(id); flagCard(ids[0]);
      return { freed: ok, n: flagFileList().length };
    }, hundred.ids, CARD);
    const answerSrc = 'const r=(flagFileList().find(x=>x.card==="' + hundred.ids[1] + '")||{}).r; doc.answered=[{f:flagDigest(r),o:"kept"}];';
    await takeEdition(p, CATALOG, answerSrc);
    await sleep(300);
    const ans = await p.evaluate((ids, id) => {
      const before = flagFileList().length;
      const r = flagCard(id); const ok = !!(r && r.card === id);
      unflagCard(id);
      ids.forEach((x) => { unflagCard(x); flagSeen(x); });
      return { before, freed: ok, after: flagFileList().length };
    }, hundred.ids, CARD);
    await sleep(200);
    check(back.freed && back.n === 100 && ans.before === 99 && ans.freed && ans.after === 0,
      tag + "f9 a flag taken back and a flag answered each free a place among the hundred (the second sentence holds)", { back, ans });

    /* f5 gone, last: the card leaves the catalog. */
    await takeEdition(p, CATALOG, EDIT_GONE);
    await sleep(400);
    const g = await p.evaluate((id) => ({ card: !!document.querySelector('#list .card[data-id="' + id + '"]'), marks: document.querySelectorAll("#list .cflag").length,
      flag: cardFlag(id), ended: flagEndedIds() }), CARD);
    check(!g.card && g.marks === 0 && g.flag === null && g.ended.indexOf(CARD) < 0, tag + "f5 gone: nothing shows, and the outcome is told as seen", g);

    check(!topBar.length, tag + "f7 nothing of the flag is in the top bar", topBar);
  } finally { await closePage(p); }
}

/* A desk where no flag can be made: no button, and the row closes over its place. */
async function noButton(p) {
  await toCard(p, CARD);
  return p.evaluate((card) => {
    const any = document.querySelectorAll('[data-act="flag"], .flag-btn, .cflag').length;
    const acts = document.querySelector(card + " > .chead .cacts"), ed = acts && acts.querySelector('[data-act="edit"]'), next = ed && ed.nextElementSibling;
    const gap = ed && next ? Math.round((next.getBoundingClientRect().left - ed.getBoundingClientRect().right) * 10) / 10 : null;
    const flexGap = acts ? parseFloat(getComputedStyle(acts).columnGap) || 0 : null;
    return { any, next: next && next.getAttribute("data-act"), gap, flexGap, ok: any === 0 && !!next && next.getAttribute("data-act") === "hide" && Math.abs(gap - flexGap) <= 0.5 };
  }, cardSel(CARD));
}

try {
  browser = await puppeteer.launch({ executablePath: E.browserPath("chrome"), headless: true, args: ["--hide-scrollbars"], protocolTimeout: 120000 });
  for (const [lang, theme] of [["en", "light"], ["en", "dark"], ["pl", "light"], ["pl", "dark"]]) {
    await runOffered(url, lang, theme);
    const p = await boot(url, { lang, theme, offered: false });
    try {
      const r = await noButton(p);
      await still(p, lang + "-" + theme + "-0-not-offered", [cardSel(CARD) + " > .chead"]);
      check(r.ok, lang + " " + theme + ": f1 not offered: no card has the button, and the row closes over its place", r);
    } finally { await closePage(p); }
  }

  /* The plants, each in a scratch copy of the page. */
  const plant = (name, re, to) => {
    const m = RAW.match(re);
    const n = RAW.split(m ? m[0] : "\u0000").length - 1;
    return n === 1 ? copyFiles(path.join(lab, name), RAW.replace(re, to)) : null;
  };
  if (PLANTS_OFF) {
    skip("plant:flag-bubble-first the bubble shown before the flag is sent turns f2 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-greyed a greyed button drawn where no flag can be made turns f1 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-mark-stays an answer's mark that stays after it was opened turns f5 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-own-press the button pressed while its bubble stands acting on the flag turns f3 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-why-silent a refused note with no line under it turns f3 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-full-silent the 101st press with no bubble turns f9 red (ETIUDA_PLANTS=off)");
    skip("plant:flag-full-done a full bubble with no Done button turns f9 red (ETIUDA_PLANTS=off)");
  } else {
    const u1 = plant("plant-first", /const (\w+) = flagCard\((\w+)\);/, "showFlagSent($2);\n    const $1 = flagCard($2);");
    let red1 = null;
    if (u1) {
      const p = await boot(u1, { offered: true });
      try { await clickFlag(p, CARD); red1 = await p.evaluate(() => window.__shown.slice()); } finally { await closePage(p); }
    }
    check(!!u1 && !!red1 && red1.length >= 1 && !/"state":"sent"/.test(red1[0]), "plant:flag-bubble-first the bubble shown before the flag is sent turns f2 red", { located: !!u1, red1 });
    const u2 = plant("plant-greyed", /if \(!flagOfferedNow\(\)\) return "";/,
      "if (!flagOfferedNow()) return '<button type=\"button\" class=\"flag-btn\" data-act=\"flag\" disabled style=\"opacity:.4\"><svg class=\"ic\" viewBox=\"0 0 20 20\"></svg></button>';");
    let red2 = null;
    if (u2) { const p = await boot(u2, { offered: false }); try { red2 = await noButton(p); } finally { await closePage(p); } }
    check(!!u2 && !!red2 && !red2.ok, "plant:flag-greyed a greyed button drawn where no flag can be made turns f1 red", { located: !!u2, red2 });
    const u3 = plant("plant-stays", /const seen = flagSeen\(id\);/, "const seen = false;");
    let red3 = null;
    if (u3) {
      const p = await boot(u3, { offered: true });
      try {
        await clickFlag(p, CARD);
        await p.keyboard.press("Escape");
        await takeEdition(p, CATALOG, EDIT_KEPT);
        await sleep(300);
        await toCard(p, CARD);
        await p.click(markSel(CARD));
        await sleep(200);
        await p.keyboard.press("Escape");
        await sleep(200);
        red3 = await p.evaluate((m) => !!document.querySelector(m), markSel(CARD));
      } finally { await closePage(p); }
    }
    check(!!u3 && red3 === true, "plant:flag-mark-stays an answer's mark that stays after it was opened turns f5 red", { located: !!u3, red3 });
    const u4 = plant("plant-own", /if \(closeOpen && \(sentOpen === id \|\|/, "if (false && (sentOpen === id ||");
    let red4 = null;
    if (u4) {
      const p = await boot(u4, { offered: true });
      try {
        await clickFlag(p, CARD);
        await p.evaluate((b) => document.querySelector(b).focus(), btnSel(CARD));
        await p.keyboard.press("Enter");
        await sleep(250);
        const fl = await flagOf(p, CARD);
        red4 = { bubble: !!(await bubNow(p)), sent: !!(fl && fl.state === "sent") };
      } finally { await closePage(p); }
    }
    const u5 = plant("plant-why", /why\.textContent = line;/, 'why.textContent = "";');
    let red5 = null;
    if (u5) {
      const p = await boot(u5, { offered: true });
      try {
        await clickFlag(p, CARD);
        await p.evaluate((b) => { const i = document.querySelector(b + " input"); i.focus(); i.value = "x".repeat(501); i.dispatchEvent(new Event("input", { bubbles: true })); }, BUB);
        await p.keyboard.press("Enter");
        await sleep(150);
        red5 = await p.evaluate((b) => { const e = document.querySelector(b + " .e-flag-why"); return e ? e.textContent.trim() : null; }, BUB);
      } finally { await closePage(p); }
    }
    check(!!u5 && red5 !== null && red5 !== WORDS.en.tooLong, "plant:flag-why-silent a refused note with no line under it turns f3 red", { located: !!u5, red5 });
    const u6 = plant("plant-full", /if \(got && got\.refused === "full"\) showFlagFull\(id\);/, "");
    let red6 = null;
    if (u6) {
      const p = await boot(u6, { offered: true });
      try {
        await p.evaluate((id) => { [...document.querySelectorAll("#list .card[data-id]")].map((c) => c.dataset.id).filter((x) => x !== id).slice(0, 100).forEach((x) => flagCard(x)); }, CARD);
        await toCard(p, CARD);
        await p.click(btnSel(CARD));
        await sleep(250);
        red6 = { bubble: !!(await bubNow(p)) };
      } finally { await closePage(p); }
    }
    check(!!u6 && !!red6 && !red6.bubble, "plant:flag-full-silent the 101st press with no bubble turns f9 red", { located: !!u6, red6 });
    const u7 = plant("plant-full-done",
      /(Room comes back as the lead answers\."\)\)\s*\+\s*)["']<\/p><div class="tour-actions"><button type="button" class="btn primary" data-flag="done">["']\s*\+\s*esc\(t\("Done"\)\)\s*\+\s*["']<\/button><\/div>["']/,
      '$1"</p>"');
    let red7 = null;
    if (u7) {
      const p = await boot(u7, { offered: true });
      try {
        await p.evaluate((id) => { [...document.querySelectorAll("#list .card[data-id]")].map((c) => c.dataset.id).filter((x) => x !== id).slice(0, 100).forEach((x) => flagCard(x)); }, CARD);
        await toCard(p, CARD);
        await p.click(btnSel(CARD));
        await sleep(250);
        red7 = await p.evaluate((b) => { const e = document.querySelector(b); return { open: !!e, btns: e ? e.querySelectorAll("button").length : -1 }; }, BUB);
      } finally { await closePage(p); }
    }
    check(!!u7 && !!red7 && red7.open && red7.btns === 0, "plant:flag-full-done a full bubble with no Done button turns f9 red", { located: !!u7, red7 });
    check(!!u4 && !!red4 && !(red4.sent && !red4.bubble), "plant:flag-own-press the button pressed while its bubble stands acting on the flag turns f3 red", { located: !!u4, red4 });
  }
} catch (e) {
  check(false, "run crashed: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
} finally {
  if (browser) await browser.close();
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch (e) {}
}

const want = EXPECTED - (PLANTS_OFF ? 7 : 0);
console.log("RESULT checks=" + checks + " failed=" + fails + (notRun ? " notRun=" + notRun : ""));
console.log("#counts checks=" + checks + " skipped=" + notRun + " failed=" + fails + " expected=" + want);
process.exit(fails || checks !== want ? 1 : 0);
