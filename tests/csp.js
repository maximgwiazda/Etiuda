/* The shell's content security policy, driven in the shell.
 *
 *   node tests/csp.js
 *
 * WHY ELECTRON AND NOT A BROWSER. The policy is put into the copy the shell serves, so nothing
 * in engine/etiuda.html carries it and no browser run can see it. This builds a throwaway app in
 * the temp folder - the two shell files verbatim, a package.json, a copy of the engine and a
 * sibling catalog script beside it - and starts Electron on that. Its user-data folder is inside
 * the throwaway too, so the run cannot read a catalog off this desk.
 *
 * THE ARTEFACT IN THE THROWAWAY IS TAMPERED WITH ON PURPOSE: one inline script is appended to
 * the copy before Electron ever sees it. Until the hashes were pinned at build time this test
 * could not tell a tamper from the real thing, because the shell hashed whatever file it was
 * about to serve and so hashed the plant along with the rest. The pin, engine/etiuda.csp.json,
 * is what makes the planted script a script the policy does not name, and the refusal Chromium
 * logs quotes the hash of the plant itself, which is how check 4 tells the two refusals apart.
 *
 * THE DOCUMENT CARRIES TWO PINNED SCRIPTS AND THEY FAIL DIFFERENTLY. Hash 0 is the boot guard,
 * the inline script at the head of the template: the #reset escape hatch, the header shape
 * restored before first paint, the retry counter and the plain-HTML banner that speaks when the
 * store is unusable. Hash 1 is the app. If hash 1 goes stale the window is blank, because the
 * whole engine is that one script. If hash 0 goes stale THE APP BOOTS NORMALLY and the entire
 * rescue layer is silently gone, which is the worse of the two and the one nothing was watching:
 * until 2026-09-14 check 2's marker for "the boot guard ran" was window.eCarryOldKeys, which
 * belongs to the app bundle's storage module and is therefore hash 1 all over again. The marker
 * is now window.E_BOOT_OK, the one global the boot guard defines and the app never redefines,
 * so check 2 measures both hashes rather than one hash twice.
 *
 * WHAT IT PROVES, in this order:
 *   1  the policy reaches the document, with the directives it is meant to carry
 *   2  the boot guard ran AND the engine booted, so Chromium recomputed both pinned hashes and
 *      accepted both. A stale hash is a refusal here, not a green run
 *   3  neither the script planted in the artefact nor one put into the page at runtime runs
 *   4  Chromium refused exactly those two and named the plant's own hash, so 3 is the policy's
 *      doing and not a typo in either plant
 *   5  a sibling script, present and readable, is refused, which is what "a catalog is data"
 *      means once it is enforced rather than merely true. The tag is THIS FILE'S OWN PLANT, not
 *      the engine's: the shell no longer serves the engine's two sibling tags (5b), so a proof
 *      that leaned on them would have had nothing left to refuse
 *   5b the engine's own two sibling tags are not in the copy the shell serves, although both
 *      files sit beside the engine in the lab, so no boot under the shell asks for them
 *   6  nothing else in the running app violates the policy
 *   7  the shell found no catalog, so nothing of this desk was read
 *
 * THEN A CLEAN BOOT (8), a launch of its own on a lab with no plant in it: the artefact and the
 * pin exactly as built, and the two sibling files still beside it. It must boot (both markers)
 * and log NOTHING to the console, which is what a desk's own boot must do too, or a real error
 * is lost among refusals the policy makes by design (bug hunt 3, item 21, host half). The
 * markers are asserted with the silence because a window that never booted logs nothing either.
 *
 * THEN THE CONTROL, a second launch of its own on the same lab with hash 0 staled by one
 * character, because a check that has never gone red has not been tested. It requires the app to
 * boot with the boot guard refused - that is the fault stated as a measurement rather than as a
 * warning - and requires check 2's marker to be what notices. The stale pin is built by hashing
 * the artefact's own first inline script here, a second implementation of the build's sum, and
 * refusing to run if that hash is not the one in the pin.
 *
 * An eval() driven through CDP proves nothing - the debugger is exempt from CSP, measured
 * 2026-09-14 - so eval is left to the "no other violation" check rather than driven.
 *
 * Exit code is the number of failed checks, capped at 63 (E.exitOf), 78 where the run produced no verdict at all. Every
 * Electron is killed by pid with /T, never by image name: /IM would reach another seat's run or
 * a copy somebody is using. */
"use strict";
const puppeteer = require("puppeteer-core");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* THE PORT BLOCK AND THE LEASE, board item 628. A fixed debugging port is not a failed
   connect: two concurrent runs of this file at 9422 were measured on 2026-09-20 reading ONE
   Electron, and the run that was there FIRST went red counting three inline refusals of two and
   four sibling refusals of two. The base comes from the table in tests/engine.js, which is
   checked for overlaps at every call, and the block is leased by its base where the run was
   given a lease command, at load, before anything is built. */
const PORT = E.portBlock("csp");
const PORT2 = PORT + 1;
const LEASED = E.takeLeases(["ports:" + PORT], 20, "tests/csp.js");
console.log("       debugging port(s) count up from " + PORT
  + (process.env.ETIUDA_PORT_SHIFT ? " (ETIUDA_PORT_SHIFT " + process.env.ETIUDA_PORT_SHIFT + ")"
                                   : " (the port table's own number)")
  + "; leases: " + LEASED.said);
let fails = 0; let checks = 0; let reachedEnd = false;
let offscreenAsked = false;
const notRun = [];
const kids = [];
const t0 = Date.now();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

const hashOf = s => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";

/* The tamper, and its hash by this file's own arithmetic rather than the build's, so the
   refusal Chromium logs is read against a second implementation of the same sum. */
const PLANT = "window.__planted = 1;";
const PLANT_HASH = "sha256-" + crypto.createHash("sha256").update(PLANT, "utf8").digest("base64");
const PLANT_SIBLING = "planted-sibling.js";
const PLANT_SIBLING_TAG = '<script src="' + PLANT_SIBLING + '"></script>';
/* The engine's own sibling files, as a refusal or a src attribute names them. */
const ENGINE_SIBLING = /(?:etiuda|sample)-catalog\.js/i;

/* The boot guard is the first inline script of the artefact, hashed here the same way. */
function bootGuardHash(html) {
  const m = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("no inline script in the artefact; the control has nothing to stale");
  return hashOf(m[1]);
}

/* One character of the base64 body changed. Chromium then recomputes the script's real hash,
   finds it named nowhere, and refuses it - which is exactly what a pin left behind by an edit
   to the template would do. */
function stale(h) {
  const i = h.indexOf("sha256-") + 7;
  const c = h[i] === "A" ? "B" : "A";
  return h.slice(0, i) + c + h.slice(i + 1);
}

/* Built rather than pointed at: the shell must be the shell as committed, and the sibling
   script has to EXIST, or a refusal and a missing file read the same in the console. */
function buildApp(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-csp-"));
  fs.mkdirSync(path.join(dir, "shell"));
  fs.mkdirSync(path.join(dir, "engine"));
  for (const f of ["main.js", "preload.js"])
    fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  fs.writeFileSync(path.join(dir, "package.json"),
    JSON.stringify({ name: "etiuda-csp-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  /* The pin travels with the artefact, as it does into the asar: without it the shell serves
     script-src 'none' and nothing here would boot. Then the artefact is tampered with. */
  const pin = JSON.parse(fs.readFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), "utf8"));
  const html = fs.readFileSync(path.join(E.ROOT, "engine", "etiuda.html"), "utf8");
  const bg = bootGuardHash(html);
  if (pin.hashes.indexOf(bg) !== 0)
    throw new Error("the boot guard's hash is not hash 0 of the pin; this file's map of the pin is stale");
  if (opts && opts.staleBootGuard) pin.hashes[0] = stale(bg);
  fs.writeFileSync(path.join(dir, "engine", "etiuda.csp.json"), JSON.stringify(pin), "utf8");
  /* Appended, because the document carries no closing body tag to splice in front of: it ends
     on the app script, and the parser puts what follows in the body all the same. */
  if (!/<\/script>\s*$/.test(html)) throw new Error("the engine does not end on a script tag; the plant needs a new anchor");
  /* Two plants, one inline and one a sibling of this file's own naming: a name the engine never
     writes, so the shell's strip of the engine's own tags cannot reach it and the policy is the
     only thing between that file and a run. The clean lab carries neither. */
  fs.writeFileSync(path.join(dir, "engine", "etiuda.html"),
    (opts && opts.clean) ? html
      : html + "<script>" + PLANT + "</script>\n" + PLANT_SIBLING_TAG + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "engine", PLANT_SIBLING), "window.__plantedSibling = 1;\n", "utf8");
  /* The engine's own two siblings exist in every lab, so that 5b's "not served" and the clean
     boot's silence are not a missing file answering in the tag's place. */
  fs.writeFileSync(path.join(dir, "engine", "etiuda-catalog.js"), "window.__sibling = 1;\n", "utf8");
  fs.writeFileSync(path.join(dir, "engine", "sample-catalog.js"), "window.__sibling2 = 1;\n", "utf8");
  return { dir: dir, bootGuardHash: bg };
}

/* A launch, and everything it said. The viewport is the window's own: puppeteer.connect()
   emulates 800x600 unless it is told not to, and a reading taken at a width nobody uses is a
   reading of another document. */
async function launch(dir, port) {
  /* Away from Documents/Etiuda, which on a desk holds a live catalog: see E.pinCatalogFolder. */
  E.pinCatalogFolder(path.join(dir, "userdata"), path.join(dir, "catalogs"));
  /* OFF SCREEN, board item 385: nothing in this file measures the window, so no launch of it has
     any business taking the screen from whoever is at the desk. E.offscreenEnv() is the one place
     the flag is set; shell-smoke 1g is the pair that proves it is the flag doing the hiding. */
  const child = E.shellLaunch("tests/csp.js", electronExe(),
    [dir, "--remote-debugging-port=" + port, "--user-data-dir=" + path.join(dir, "userdata")],
    { stdio: ["ignore", "pipe", "pipe"], env: E.offscreenEnv() });
  kids.push(child);
  const shellSaid = [];
  child.stdout.on("data", d => shellSaid.push(String(d).trim()));
  child.stderr.on("data", d => shellSaid.push(String(d).trim()));
  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port " + port + " within 20 s");
  const p = (await b.pages())[0];
  const said = [];
  p.on("console", m => { if (m.type() === "error") said.push(m.text()); });
  p.on("pageerror", e => said.push("pageerror " + String(e && e.message || e)));
  /* Attaching happens after the first load, so the refusals Chromium logged while parsing are
     already gone. One reload with the listener in place is what puts them in reach. */
  await p.reload({ waitUntil: "load" });
  await sleep(3500);
  /* Asked once, of this file's own first launch, and asked of the machine rather than of the
     variable: what the environment carried is not evidence that a window stayed off the screen.
     A helper that cannot look answers measured:false and this reddens, because "I could not see
     a window" and "there was no window" are the two readings a green must never merge. */
  if (!offscreenAsked) {
    offscreenAsked = true;
    /* Board items 613 and 628: off Windows the helper was never able to look, so this is a NOT
       RUN line rather than a failed check, and it is COUNTED as one - a run one check shorter
       than the same run on Windows must not read as the same green. */
    E.offscreenCheck(child.pid, "tests/csp.js", check, notRun);
  }
  return { child: child, browser: b, page: p, said: said, shellSaid: shellSaid };
}

/* By pid and with /T, so the helpers go and nothing outside this run is touched. */
function stop(run) {
  try { if (run && run.browser) run.browser.disconnect(); } catch (x) {}
  E.killTree(run && run.child && run.child.pid);
  try { if (run && run.child) run.child.kill(); } catch (x) {}
}

const LAB = buildApp(null);
const APP = LAB.dir;
let LAB2 = null, LAB3 = null;

(async () => {
  const a = await launch(APP, PORT);

  const got = await a.page.evaluate(() => ({
    policy: (() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return m ? m.getAttribute("content") : null; })(),
    eHost: document.body.classList.contains("e-host"),
    band: !!document.querySelector(".row"),
    controls: !!document.querySelector("#winCtl,.win-ctl"),
    /* The one global the boot guard defines. The app calls it and does not replace it, so it
       survives boot and answers for hash 0 alone. */
    bootGuardRan: typeof window.E_BOOT_OK === "function",
    appRan: typeof window.E_VERSION === "string",
    box: [window.innerWidth, window.innerHeight, window.outerWidth, window.outerHeight, window.devicePixelRatio],
    plantedRan: typeof window.__planted !== "undefined",
    sibling: typeof window.__sibling !== "undefined" || typeof window.__sibling2 !== "undefined",
    plantedSibling: typeof window.__plantedSibling !== "undefined",
    served: Array.from(document.querySelectorAll("script[src]")).map(el => el.getAttribute("src")),
    appendedRan: (() => {
      const s = document.createElement("script");
      s.textContent = "window.__appended = 1;";
      document.body.appendChild(s);
      s.remove();
      return typeof window.__appended !== "undefined";
    })(),
  }));

  const policy = got.policy || "";
  const hashes = (policy.match(/'sha256-[^']+'/g) || []).length;
  check(/default-src 'none'/.test(policy) && /script-src 'sha256-/.test(policy)
        && /style-src 'unsafe-inline'/.test(policy) && /img-src data:/.test(policy)
        && /base-uri 'none'/.test(policy) && /form-action 'none'/.test(policy) && hashes === 2,
    "the policy reaches the document with its six directives and " + hashes + " script hash(es)");

  check(got.bootGuardRan && got.appRan && got.eHost && got.band && got.controls,
    "Chromium recomputed both pinned hashes and accepted both: the boot guard ran (E_BOOT_OK "
    + (got.bootGuardRan ? "a function" : "MISSING") + ") and the app ran (E_VERSION "
    + (got.appRan ? "a string" : "MISSING") + ", e-host " + got.eHost + ", band " + got.band
    + ", controls " + got.controls + ")");

  check(got.box[2] - got.box[0] < 100 && got.box[3] - got.box[1] < 100,
    "the page is read at the window's own size, inner " + got.box[0] + "x" + got.box[1]
    + " in an outer " + got.box[2] + "x" + got.box[3] + " at devicePixelRatio " + got.box[4]
    + ", and not at puppeteer's emulated 800x600");

  check(!got.plantedRan && !got.appendedRan,
    "neither plant ran: the script edited INTO the artefact (window.__planted "
    + (got.plantedRan ? "SET" : "undefined") + ") nor one appended at runtime (window.__appended "
    + (got.appendedRan ? "SET" : "undefined") + ")");

  const cspSaid = a.said.filter(t => /Content Security Policy/i.test(t));
  const inlineSaid = cspSaid.filter(t => /inline script/i.test(t) && /script-src/i.test(t));
  check(inlineSaid.length === 2 && inlineSaid.some(t => t.indexOf(PLANT_HASH) > -1),
    "Chromium refused exactly two inline scripts, " + inlineSaid.length + ", and quoted the plant's own hash"
    + " back, so the artefact's script was refused for not being in the pin");

  const plantSaid = cspSaid.filter(t => t.indexOf(PLANT_SIBLING) > -1);
  check(got.served.indexOf(PLANT_SIBLING) > -1 && !got.plantedSibling && plantSaid.length === 1,
    "a sibling script, served and readable beside the engine, is refused, so a catalog cannot execute ("
    + PLANT_SIBLING + " in the served document " + (got.served.indexOf(PLANT_SIBLING) > -1) + ", "
    + plantSaid.length + " of 1 refused, its global " + (got.plantedSibling ? "ARRIVED" : "did not arrive") + ")");

  const engineSaid = a.said.filter(t => ENGINE_SIBLING.test(t));
  const engineServed = got.served.filter(src => ENGINE_SIBLING.test(src));
  const onDisk = ["etiuda-catalog.js", "sample-catalog.js"].filter(f => fs.existsSync(path.join(APP, "engine", f)));
  check(engineServed.length === 0 && engineSaid.length === 0 && !got.sibling && onDisk.length === 2,
    "the engine's own two sibling tags are not in the copy the shell serves (" + engineServed.length
    + " served, " + engineSaid.length + " console line(s) naming one), with both files on disk beside it ("
    + onDisk.length + " of 2)" + (engineServed.length ? ": " + engineServed.join(", ") : ""));

  const other = cspSaid.filter(t => !/inline script/i.test(t) && t.indexOf(PLANT_SIBLING) < 0);
  check(other.length === 0,
    "nothing else in the running app violates the policy"
    + (other.length ? " - " + other.slice(0, 3).map(t => t.slice(0, 90)).join(" | ") : ""));

  check(a.shellSaid.some(l => /no catalog found/.test(l)),
    "the shell found no catalog in its throwaway user-data folder, so nothing of this desk was read");

  stop(a);
  await sleep(600);

  /* ---- the control: hash 0 staled, and the app boots without its rescue layer ---- */
  LAB2 = buildApp({ staleBootGuard: true });
  const stalePin = JSON.parse(fs.readFileSync(path.join(LAB2.dir, "engine", "etiuda.csp.json"), "utf8"));
  check(stalePin.hashes[0] !== LAB.bootGuardHash && stalePin.hashes[1] === JSON.parse(
          fs.readFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), "utf8")).hashes[1],
    "the control's pin has hash 0 staled by one character and hash 1 untouched");

  const c = await launch(LAB2.dir, PORT2);
  const ctl = await c.page.evaluate(() => ({
    bootGuardRan: typeof window.E_BOOT_OK === "function",
    appRan: typeof window.E_VERSION === "string",
    eHost: document.body.classList.contains("e-host"),
  }));
  const ctlInline = c.said.filter(t => /Content Security Policy/i.test(t) && /inline script/i.test(t));
  const bgHash = LAB.bootGuardHash.replace(/'/g, "");

  check(!ctl.bootGuardRan && ctl.appRan && ctl.eHost,
    "CONTROL: with hash 0 stale the app boots all the same (E_VERSION " + (ctl.appRan ? "a string" : "MISSING")
    + ", e-host " + ctl.eHost + ") and the whole rescue layer is gone (E_BOOT_OK "
    + (ctl.bootGuardRan ? "STILL A FUNCTION" : "undefined") + "), so a stale pin is not a blank window here");

  check(ctlInline.length === 2 && ctlInline.some(t => t.indexOf(bgHash) > -1),
    "CONTROL: Chromium refused the boot guard and quoted its real hash back (" + ctlInline.length
    + " inline refusal(s) against 2 expected, the plant's and the boot guard's), so check 2's marker"
    + " is red for the policy's doing and not for a broken script");

  stop(c);
  await sleep(600);

  /* ---- the clean boot: nothing planted, and nothing said ---- */
  LAB3 = buildApp({ clean: true });
  const k = await launch(LAB3.dir, PORT + 2);
  const clean = await k.page.evaluate(() => ({
    bootGuardRan: typeof window.E_BOOT_OK === "function",
    appRan: typeof window.E_VERSION === "string",
    eHost: document.body.classList.contains("e-host"),
    policy: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
  }));
  check(clean.bootGuardRan && clean.appRan && clean.eHost && clean.policy && k.said.length === 0,
    "a clean boot under the policy logs nothing: " + k.said.length + " console error(s)"
    + (k.said.length ? " - " + k.said.slice(0, 3).map(t => t.slice(0, 110)).join(" | ") : "")
    + ", and it did boot (E_BOOT_OK " + clean.bootGuardRan + ", E_VERSION " + clean.appRan
    + ", e-host " + clean.eHost + ", policy " + clean.policy + "), so the silence is not a blank window's");
  stop(k);
  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  for (const k of kids) { E.killTree(k.pid); try { k.kill(); } catch (x) {} }
  /* The lab holds a Chromium profile, and Windows keeps a handle on one for a moment after the
     process that held it is gone. E.removeLab retries and then says whether the folder is
     actually gone, and that answer is a CHECK: a swallowed catch here is how five of these came
     to be sitting in %TEMP% on 2026-09-14. */
  for (const lab of [APP, LAB2 && LAB2.dir, LAB3 && LAB3.dir].filter(Boolean))
    check(E.removeLab(lab), "the throwaway app is gone from the temp folder: " + lab);
  /* Board item 628: the not-run travels with the counts, so a run that could not look at
     the screen is not read as a run that looked and was happy. */
  if (notRun.length) console.log("       NOT RUN: " + notRun.join(", "));
  console.log("#counts checks=" + checks + " failed=" + fails + " notRun=" + notRun.length);
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? E.exitOf(fails) : (fails ? E.exitOf(fails) : E.NO_VERDICT));
});
