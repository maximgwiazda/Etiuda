/* The catalog file, watched: spec 11.5, driven in the shell and read back off the screen.
 *
 *   ETIUDA_FIXTURES=<folder> node tests/catalog-watch.js
 *
 * WHAT IT PROVES. The prototype read the catalog once, so an edited file needed the app closed
 * and started again (board item 86). The shell now watches the folders a catalog may sit in and
 * hands the text to the page, which OFFERS it through the dialog the sibling and the picker
 * already end in. So the claim has two halves and each has its own check: the offer appears
 * after an edit, and the document was never reloaded while it did - a sentinel planted on the
 * page before the edit is still there when the offer is up, and it could not survive a restart.
 *
 * THE LAB is desk.js's: the real shell and the real artefact copied into a temp folder, with the
 * user-data folder inside it, so no catalog and no desk of this machine is in reach. One app
 * run throughout, because "without a restart" is the whole claim.
 *
 * THREE CONTROLS, since an offer that appears whatever happens proves nothing:
 *   the same bytes   the first fixture written over itself, byte for byte: no offer.
 *   a broken file    text that is not a catalog: no offer, and what is loaded stays loaded.
 *   the count        the cards on screen are counted before and after, against the two
 *                    fixtures' own cards.length read by this process.
 *
 * No card text is read, printed or compared: every catalog fact here is a count.
 *
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all.
 */
"use strict";
const puppeteer = require("puppeteer-core");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9427;
let child; let fails = 0; let checks = 0; let reachedEnd = false;
let offscreenAsked = false;
const t0 = Date.now();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };
const note = what => console.log("       " + what);

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

const FIX = E.fixtures("catalogEc", "sampleEc");
const cardsIn = file => {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(doc.cards) ? doc.cards.length : -1;
};
const FIRST_CARDS = cardsIn(FIX.catalogEc);
const SECOND_CARDS = cardsIn(FIX.sampleEc);

function buildApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-watch-"));
  fs.mkdirSync(path.join(dir, "shell"));
  fs.mkdirSync(path.join(dir, "engine"));
  fs.mkdirSync(path.join(dir, "userdata"), { recursive: true });
  for (const f of ["main.js", "preload.js"])
    fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  fs.writeFileSync(path.join(dir, "package.json"),
    JSON.stringify({ name: "etiuda-watch-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.html"), path.join(dir, "engine", "etiuda.html"));
  /* The pin travels with the artefact or the shell serves script-src 'none' and nothing boots. */
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), path.join(dir, "engine", "etiuda.csp.json"));
  return dir;
}

const APP = buildApp();
const UD = path.join(APP, "userdata");
/* Pinned away from Documents/Etiuda, which is a real folder on a real desk: see the note at
   E.pinCatalogFolder. The watched file then sits in the folder the setting names, which is the
   first place the shell looks and the one this proves. */
const CATFOLDER = E.pinCatalogFolder(UD, path.join(APP, "catalogs"));
const CATALOG = path.join(CATFOLDER, "etiuda-catalog.ec");

async function startShell() {
  /* OFF SCREEN, board item 385: nothing in this file measures the window, so no launch of it has
     any business taking the screen. E.offscreenEnv() is the one place the flag is set. */
  child = spawn(electronExe(), [APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv() });
  const said = [];
  child.stdout.on("data", d => said.push(String(d).trim()));
  child.stderr.on("data", d => said.push(String(d).trim()));
  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT, defaultViewport: null }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s: " + said.join(" | "));
  await sleep(3000);
  /* Asked once, of this file's own first launch, and asked of the machine rather than of the
     variable: what the environment carried is not evidence that a window stayed off the screen.
     A helper that cannot look answers measured:false and this reddens. */
  if (!offscreenAsked) {
    offscreenAsked = true;
    const v = E.offscreenVerdict(child.pid, "tests/catalog-watch.js");
    check(v.ok, v.what);
  }
  return { b, said };
}

function stopShell(b) {
  try { if (b) b.disconnect(); } catch (x) {}
  try { if (child && child.pid) execSync("taskkill /F /PID " + child.pid + " /T", { stdio: "ignore" }); } catch (x) {}
  try { if (child) child.kill(); } catch (x) {}
  child = null;
}

/* Accepting the offer reloads the document, so the page handle is taken fresh every time
   rather than held: a stale one answers about a document that is gone. */
const SEEN = () => ({
  offer: !!document.querySelector("#ecYes"),
  cards: document.querySelectorAll("#list .card").length,
  sentinel: window.__watchSentinel || null,
});
async function seen(b) { return (await b.pages())[0].evaluate(SEEN); }
async function page(b) { return (await b.pages())[0]; }

(async () => {
  let s;
  try {
    if (FIRST_CARDS < 1 || SECOND_CARDS < 1 || FIRST_CARDS === SECOND_CARDS)
      E.refuse("the two fixtures must both hold cards and must differ in how many: "
        + FIRST_CARDS + " and " + SECOND_CARDS);

    fs.copyFileSync(FIX.catalogEc, CATALOG);
    s = await startShell();

    const boot = await seen(s.b);
    const accepted = await (await page(s.b)).evaluate(() => {
      const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true;
    });
    await sleep(6000);
    const loaded = await seen(s.b);
    check(boot.offer && accepted && loaded.cards === FIRST_CARDS,
      "1 the first catalog is on screen the ordinary way: the offer was up (" + boot.offer
      + "), was accepted (" + accepted + "), and " + loaded.cards + " cards are in the list against the file's "
      + FIRST_CARDS);

    /* Planted AFTER the accept, which reloads: from here on it is the same document, and the
       sentinel's survival is what makes "without a restart" a measurement rather than a story. */
    await (await page(s.b)).evaluate(() => { window.__watchSentinel = "planted"; });

    /* Control A: the same bytes. An event fires and nothing may come of it. */
    fs.copyFileSync(FIX.catalogEc, CATALOG);
    await sleep(3000);
    const same = await seen(s.b);
    check(!same.offer && same.cards === FIRST_CARDS && same.sentinel === "planted",
      "2 CONTROL the same file written over itself offers nothing: offer " + same.offer
      + ", " + same.cards + " cards, sentinel " + JSON.stringify(same.sentinel));

    /* Control B: a file that is not a catalog. The shell says so and the page is not told. */
    fs.writeFileSync(CATALOG, "this is not a catalog", "utf8");
    await sleep(3000);
    const broken = await seen(s.b);
    check(!broken.offer && broken.cards === FIRST_CARDS && broken.sentinel === "planted",
      "3 CONTROL a file that does not parse offers nothing and leaves the loaded catalog alone: offer "
      + broken.offer + ", " + broken.cards + " cards");
    check(s.said.some(l => l.indexOf("did not parse as a catalog") > -1),
      "4 and the shell said which file it refused, in a line a deployment can read");

    /* The edit itself. */
    fs.copyFileSync(FIX.sampleEc, CATALOG);
    await sleep(4000);
    const offered = await seen(s.b);
    check(offered.offer,
      "5 an edit to the file reaches the running app: the offer is up " + Math.round((Date.now() - t0) / 1000)
      + " s into one app run");
    check(offered.sentinel === "planted",
      "6 and it reached THIS document, so nothing restarted: the sentinel planted before the edit is still "
      + JSON.stringify(offered.sentinel) + " and the list still holds " + offered.cards + " cards");
    check(s.said.some(l => l.indexOf("the catalog file changed") > -1),
      "7 the shell says what it did, once the payload has actually changed");

    const took = await (await page(s.b)).evaluate(() => {
      const y = document.querySelector("#ecYes"); if (!y) return false; y.click(); return true;
    });
    await sleep(6000);
    const swapped = await seen(s.b);
    check(took && swapped.cards === SECOND_CARDS,
      "8 accepting it swaps the content: " + swapped.cards + " cards against the edited file's "
      + SECOND_CARDS + ", where the first held " + FIRST_CARDS);
    check(!swapped.offer,
      "9 and the offer is gone rather than asking again about the file now loaded");

    /* The channel: a request file in the same folder is answered once, with the nouns, and a
       desk id that could address a file outside stats/ writes nothing. */
    fs.mkdirSync(path.join(CATFOLDER, "stats"), { recursive: true });
    const ymd = d => {
      const x = d || new Date(), p = v => String(v).padStart(2, "0");
      return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
    };
    const channelHash = obj => {
      const copy = {};
      Object.keys(obj).forEach(k => { if (k !== "hash" && k !== "sig") copy[k] = obj[k]; });
      const canon = v => {
        if (v === null || typeof v !== "object") return JSON.stringify(v);
        if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
        const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
        return "{" + keys.map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
      };
      let h = 5381; const s = canon(copy);
      for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
      return "djb2:" + h.toString(16);
    };
    const today = ymd();
    const req = { format: 1, kind: "etiuda-request", id: "req-one",
      issued: today, from: "2026-09-01", to: today, expires: "2099-01-01" };
    req.hash = channelHash(req);
    fs.writeFileSync(path.join(CATFOLDER, "etiuda-request.ereq"), JSON.stringify(req), "utf8");
    let estat = "";
    for (let i = 0; i < 24 && !estat; i++) {
      await sleep(250);
      let names = [];
      try { names = fs.readdirSync(path.join(CATFOLDER, "stats")); } catch { names = []; }
      const hit = names.filter(n => /\.estat$/i.test(n));
      if (hit.length) estat = path.join(CATFOLDER, "stats", hit[0]);
    }
    check(!!estat, "10 a request file is answered with a statistics file: " + (estat || "none"));
    let doc = {};
    try { doc = JSON.parse(fs.readFileSync(estat, "utf8")); } catch { doc = {}; }
    const keys = Object.keys(doc).sort();
    const want = ["cards", "catalog", "desk", "engine", "format", "hash", "intents", "kind",
                  "langs", "misses", "period", "sync"].sort();
    check(!!estat && keys.join(",") === want.join(",") && !("agent" in doc)
      && doc.kind === "etiuda-statistics" && typeof doc.desk === "string"
      && doc.catalog && doc.catalog.id,
      "11 the file carries the nouns and nothing else: " + keys.join(","));
    const firstBytes = estat ? fs.readFileSync(estat) : Buffer.alloc(0);
    fs.writeFileSync(path.join(CATFOLDER, "etiuda-request.ereq"), JSON.stringify(req), "utf8");
    await sleep(2000);
    const still = estat && fs.existsSync(estat) ? fs.readFileSync(estat) : Buffer.alloc(1);
    const nEstats = fs.readdirSync(path.join(CATFOLDER, "stats")).filter(n => /\.estat$/i.test(n)).length;
    check(estat && firstBytes.equals(still) && nEstats === 1,
      "12 a second identical request writes nothing (" + nEstats + " .estat file(s))");

    stopShell(s.b);
    await sleep(800);
    const deskDoc = JSON.parse(fs.readFileSync(path.join(UD, "desk.json"), "utf8"));
    deskDoc.desk = "con";
    fs.writeFileSync(path.join(UD, "desk.json"), JSON.stringify(deskDoc), "utf8");
    const statsBefore = new Set(fs.readdirSync(path.join(CATFOLDER, "stats")));
    s = await startShell();
    const req2 = { format: 1, kind: "etiuda-request", id: "req-two",
      issued: today, from: "2026-09-01", to: today, expires: "2099-01-01" };
    req2.hash = channelHash(req2);
    fs.writeFileSync(path.join(CATFOLDER, "etiuda-request.ereq"), JSON.stringify(req2), "utf8");
    await sleep(2500);
    const extraStats = fs.readdirSync(path.join(CATFOLDER, "stats")).filter(n => !statsBefore.has(n));
    check(extraStats.length === 0 && !fs.existsSync(path.join(CATFOLDER, "stats", "con.estat")),
      "13 a hostile desk id writes nothing: extra " + JSON.stringify(extraStats));

    reachedEnd = true;
  } catch (e) {
    console.log("  FAIL the run threw: " + String(e && e.message || e));
  } finally {
    stopShell(s && s.b);
    await sleep(500);
    try { fs.rmSync(APP, { recursive: true, force: true }); } catch (x) {}
    check(!fs.existsSync(APP), "14 the throwaway app is gone from the temp folder");
    note(checks + " checks in " + Math.round((Date.now() - t0) / 1000) + " s");
    if (!reachedEnd) {
      console.log("  SUITE DID NOT COMPLETE");
      process.exit(78);
    }
    console.log(fails ? "RESULT: " + fails + " of " + checks + " failed" : "RESULT: OK, " + checks + " checks");
    process.exit(fails);
  }
})();
