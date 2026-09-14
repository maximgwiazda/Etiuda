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
 * WHAT IT PROVES, in this order:
 *   1  the policy reaches the document, with the directives it is meant to carry
 *   2  the engine still boots, so Chromium accepted both hashes. This is the check that matters
 *      most: Chromium recomputes them itself, so a wrong hash in shell/main.js is a blank window
 *      here rather than a green run
 *   3  an inline script put into the page at runtime does not run, and Chromium names script-src
 *   4  a sibling catalog script, present and readable, is refused, which is what "a catalog is
 *      data" means once it is enforced rather than merely true
 *   5  nothing else in the running app violates the policy
 *
 * WHAT IT CANNOT PROVE, said here because the shape of the test hides it: the hashes are taken
 * from the file being served, so a script edited INTO engine/etiuda.html is hashed along with
 * the rest and runs. The policy is against what reaches the page at runtime, not against a
 * tampered artefact; pinning the hashes at build time is what would close that, and it is not
 * built. An eval() driven through CDP proves nothing either - the debugger is exempt from CSP,
 * measured 2026-09-14 - so eval is left to the "no other violation" check rather than driven.
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
  fs.copyFileSync(path.join(E.ROOT, "engine", "etiuda.html"), path.join(dir, "engine", "etiuda.html"));
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
    "the engine boots under it, so Chromium accepted both hashes (e-host " + got.eHost
    + ", band " + got.band + ", controls " + got.controls + ", boot guard " + got.bootGuardRan + ")");

  check(!got.appendedRan,
    "an inline script put into the page at runtime did not run (window.__appended "
    + (got.appendedRan ? "set" : "undefined") + ")");

  const cspSaid = said.filter(t => /Content Security Policy/i.test(t));
  check(cspSaid.filter(t => /inline script/i.test(t) && /script-src/i.test(t)).length === 1,
    "Chromium refused exactly one inline script and named script-src, so check 3 is the policy's doing");

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
