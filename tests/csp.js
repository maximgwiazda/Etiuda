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
 * WHAT IT PROVES, in this order:
 *   1  the policy reaches the document, with the directives it is meant to carry
 *   2  the engine still boots, so Chromium accepted both pinned hashes. This is the check that
 *      matters most: Chromium recomputes them itself, so a stale pin is a blank window here
 *      rather than a green run
 *   3  neither the script planted in the artefact nor one put into the page at runtime runs
 *   4  Chromium refused exactly those two and named the plant's own hash, so 3 is the policy's
 *      doing and not a typo in either plant
 *   5  a sibling catalog script, present and readable, is refused, which is what "a catalog is
 *      data" means once it is enforced rather than merely true
 *   6  nothing else in the running app violates the policy
 *
 * An eval() driven through CDP proves nothing - the debugger is exempt from CSP, measured
 * 2026-09-14 - so eval is left to the "no other violation" check rather than driven.
 *
 * Exit code is the number of failed checks, 78 where the run produced no verdict at all. The app
 * is killed in a finally, and by image name as well, because Electron leaves helpers. */
"use strict";
const puppeteer = require("puppeteer-core");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./engine.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9422;
let child; let fails = 0; let checks = 0; let reachedEnd = false;
const t0 = Date.now();
const check = (ok, what) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails++; };

function electronExe() {
  const dir = path.join(E.ROOT, "node_modules", "electron");
  return path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim());
}

/* The tamper, and its hash by this file's own arithmetic rather than the build's, so the
   refusal Chromium logs is read against a second implementation of the same sum. */
const PLANT = "window.__planted = 1;";
const PLANT_HASH = "sha256-" + require("node:crypto").createHash("sha256").update(PLANT, "utf8").digest("base64");

/* Built rather than pointed at: the shell must be the shell as committed, and the sibling
   script has to EXIST, or a refusal and a missing file read the same in the console. */
function buildApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-csp-"));
  fs.mkdirSync(path.join(dir, "shell"));
  fs.mkdirSync(path.join(dir, "engine"));
  for (const f of ["main.js", "preload.js"])
    fs.copyFileSync(path.join(E.ROOT, "shell", f), path.join(dir, "shell", f));
  fs.writeFileSync(path.join(dir, "package.json"),
    JSON.stringify({ name: "etiuda-csp-probe", version: "0.0.0", main: "shell/main.js" }), "utf8");
  /* The pin travels with the artefact, as it does into the asar: without it the shell serves
     script-src 'none' and nothing here would boot. Then the artefact is tampered with. */
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.csp.json"), path.join(dir, "engine", "etiuda.csp.json"));
  const html = fs.readFileSync(path.join(E.ROOT, "engine", "etiuda.html"), "utf8");
  /* Appended, because the document carries no closing body tag to splice in front of: it ends
     on the app script, and the parser puts what follows in the body all the same. */
  if (!/<\/script>\s*$/.test(html)) throw new Error("the engine does not end on a script tag; the plant needs a new anchor");
  fs.writeFileSync(path.join(dir, "engine", "etiuda.html"),
    html + "<script>" + PLANT + "</script>\n", "utf8");
  fs.writeFileSync(path.join(dir, "engine", "etiuda-catalog.js"), "window.__sibling = 1;\n", "utf8");
  fs.writeFileSync(path.join(dir, "engine", "sample-catalog.js"), "window.__sibling2 = 1;\n", "utf8");
  return dir;
}

const APP = buildApp();

(async () => {
  child = spawn(electronExe(), [APP, "--remote-debugging-port=" + PORT, "--user-data-dir=" + path.join(APP, "userdata")],
    { stdio: ["ignore", "pipe", "pipe"] });
  const shellSaid = [];
  child.stdout.on("data", d => shellSaid.push(String(d).trim()));
  child.stderr.on("data", d => shellSaid.push(String(d).trim()));

  let b;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(500);
    try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + PORT }); } catch (x) {}
  }
  if (!b) throw new Error("Electron did not answer on the debugging port within 20 s");
  const p = (await b.pages())[0];
  const said = [];
  p.on("console", m => { if (m.type() === "error") said.push(m.text()); });
  /* Attaching happens after the first load, so the refusals Chromium logged while parsing are
     already gone. One reload with the listener in place is what puts them in reach. */
  await p.reload({ waitUntil: "load" });
  await sleep(3500);

  const got = await p.evaluate(() => ({
    policy: (() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return m ? m.getAttribute("content") : null; })(),
    eHost: document.body.classList.contains("e-host"),
    band: !!document.querySelector(".row"),
    controls: !!document.querySelector("#winCtl,.win-ctl"),
    bootGuardRan: typeof window.eCarryOldKeys === "function",
    plantedRan: typeof window.__planted !== "undefined",
    sibling: typeof window.__sibling !== "undefined" || typeof window.__sibling2 !== "undefined",
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

  check(got.eHost && got.band && got.controls && got.bootGuardRan,
    "the engine boots under it, so Chromium accepted both pinned hashes (e-host " + got.eHost
    + ", band " + got.band + ", controls " + got.controls + ", boot guard " + got.bootGuardRan + ")");

  check(!got.plantedRan && !got.appendedRan,
    "neither plant ran: the script edited INTO the artefact (window.__planted "
    + (got.plantedRan ? "SET" : "undefined") + ") nor one appended at runtime (window.__appended "
    + (got.appendedRan ? "SET" : "undefined") + ")");

  const cspSaid = said.filter(t => /Content Security Policy/i.test(t));
  const inlineSaid = cspSaid.filter(t => /inline script/i.test(t) && /script-src/i.test(t));
  check(inlineSaid.length === 2 && inlineSaid.some(t => t.indexOf(PLANT_HASH) > -1),
    "Chromium refused exactly two inline scripts, " + inlineSaid.length + ", and quoted the plant's own hash"
    + " back, so the artefact's script was refused for not being in the pin");

  const siblingSaid = cspSaid.filter(t => /catalog\.js/i.test(t));
  check(!got.sibling && siblingSaid.length === 2,
    "both sibling catalog scripts were present and refused, so a catalog cannot execute ("
    + siblingSaid.length + " of 2 refused, a global from one " + (got.sibling ? "ARRIVED" : "did not arrive") + ")");

  const other = cspSaid.filter(t => !/inline script/i.test(t) && !/catalog\.js/i.test(t));
  check(other.length === 0,
    "nothing else in the running app violates the policy"
    + (other.length ? " - " + other.slice(0, 3).map(t => t.slice(0, 90)).join(" | ") : ""));

  check(shellSaid.some(l => /no catalog found/.test(l)),
    "the shell found no catalog in its throwaway user-data folder, so nothing of this desk was read");

  b.disconnect();
  reachedEnd = true;
})().catch(e => {
  console.error("  FAIL " + String(e && e.stack || e));
  fails++;
}).finally(() => {
  try { if (child) child.kill(); } catch (x) {}
  try { execSync("taskkill /F /IM electron.exe /T", { stdio: "ignore" }); } catch (x) {}
  try { fs.rmSync(APP, { recursive: true, force: true }); } catch (x) {}
  console.log((reachedEnd ? "" : "  INCOMPLETE - ") + checks + " check(s), " + fails
    + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(reachedEnd ? fails : (fails || E.NO_VERDICT));
});
