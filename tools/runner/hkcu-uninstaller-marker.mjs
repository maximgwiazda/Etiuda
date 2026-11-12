/* FINDING 1 OF THE TEST ARCHITECT'S READ OF 2026-11-12 (office record 49d36ce92), AS A BEHAVIOUR: an all-users install never runs,
 * with administrator rights, a file named by the installing account's HKCU uninstall entry. That entry and the file it names are
 * the user's to write unelevated, so running it elevated hands anything running as that user the machine.
 *
 *   node tools/runner/hkcu-uninstaller-marker.mjs --out <dir>       on a hosted Windows runner only (see THE WALL)
 *
 * WHAT IT DOES. Builds the test build's installer from this tree (tools/electron-builder-test.cjs, the test identity, never the
 * shipped one), compiles a marker program with the .NET Framework's csc that writes one line, whether it ran with the
 * Administrators role active, to a file beside it. It writes the test build's per-user uninstall entry in HKCU naming the marker
 * as UninstallString, with an empty folder as InstallLocation and no per-user copy installed at all. Then it runs the setup silent
 * with /allusers, waits for it, and reads whether the marker ran and how. Afterwards it uninstalls the all-users copy and deletes
 * the two HKCU keys it wrote.
 *
 * THE VERDICT, one line "#marker <ran|not-run> elevated=<true|false|-> exit=<setup's code>": green where the marker did not run
 * with the Administrators role active (not run at all, or run without it). On a runner whose account always holds a full token
 * (UAC off), "run without it" cannot happen, so there green means "not run"; the probe (installer-probe.ps1) says which runner
 * this is. Red on engine main 82758c14 is the expected first result: installSection.nsh 53 to 55 runs it.
 *
 * THE WALL. It refuses (exit 78, nothing written) where the file .etiuda-no-installers stands in the home folder, which a desk
 * that must never run an installer creates once for itself; and unless GITHUB_ACTIONS is "true", RUNNER_ENVIRONMENT is
 * "github-hosted", RUNNER_OS is "Windows" and RUNNER_TEMP is set; and unless tests/install-guard.cjs finds neither shipped app
 * present. Those variables can be set by hand, so they only stop a run by accident; the sentinel is what holds a desk that
 * carries it. A computer with neither the sentinel nor a shipped app, and the variables typed in, would run it.
 */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NO_VERDICT = 78;
const say = (l) => process.stdout.write(l + "\n");
const refuse = (why) => { say("#marker refused: " + why); process.exit(NO_VERDICT); };

const DESK_SENTINEL = path.join(os.homedir(), ".etiuda-no-installers");
if (fs.existsSync(DESK_SENTINEL)) refuse("this computer carries " + DESK_SENTINEL + ", a desk where installers never run");
if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.RUNNER_OS !== "Windows"
  || !process.env.RUNNER_TEMP)
  refuse("not a hosted Windows runner (GITHUB_ACTIONS, RUNNER_ENVIRONMENT, RUNNER_OS, RUNNER_TEMP); installers never run on a desk");
const outAt = process.argv.indexOf("--out");
const OUT = outAt > 0 ? path.resolve(process.argv[outAt + 1]) : refuse("--out <dir> is wanted");
fs.mkdirSync(OUT, { recursive: true });

const G = require(path.join(ROOT, "tests", "install-guard.cjs"));
const P = require(path.join(ROOT, "tests", "install-plan.js"));
const E = require(path.join(ROOT, "tests", "engine.js"));
const T = require(path.join(ROOT, "tools", "test-identity.cjs")).TEST.desk;
const guard = G.guardStart({ env: process.env });
if (guard.refusals.length) refuse("the install guard: " + guard.refusals.join("; "));

const GUID = P.appGuid(T.appId), KU = P.registryKeys("user", GUID), KM = P.registryKeys("machine", GUID);
const reg = (args) => spawnSync("reg", args, { encoding: "utf8", windowsHide: true, timeout: 30000 });
const regKey = (k) => k.replace(/^HKCU:\\/, "HKCU\\").replace(/^HKLM:\\/, "HKLM\\");
for (const k of [KU.uninstall, KU.install, KM.uninstall, KM.install])
  if (reg(["query", regKey(k)]).status === 0) refuse("the test build is already registered here (" + k + ")");

const LAB = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, "marker-"));

// 1. The test build's installer.
const dist = path.join(LAB, "dist");
const cli = path.join(ROOT, "node_modules", "electron-builder", "out", "cli", "cli.js");
if (!fs.existsSync(cli)) refuse("electron-builder is not installed; npm ci first");
execFileSync(process.execPath, [cli, "--win", "--config", path.join("tools", "electron-builder-test.cjs")],
  { cwd: ROOT, stdio: "inherit", env: E.unsignedEnv({ ETIUDA_DIST: dist }) });
const setups = fs.readdirSync(dist).filter((n) => /-setup\.exe$/i.test(n));
if (setups.length !== 1) refuse(dist + " holds " + setups.length + " installers; expected 1");
const setup = path.join(dist, setups[0]);
const no = G.setupRefusal(G.setupIdentity(setup), "desk");
if (no) refuse("the built setup is not the test build: " + no);

// 2. The marker.
const csc = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!fs.existsSync(csc)) refuse("no csc.exe at " + csc);
const ranFile = path.join(LAB, "marker-ran.txt");
const src = path.join(LAB, "marker.cs"), exe = path.join(LAB, "marker.exe");
fs.writeFileSync(src, [
  "using System; using System.IO; using System.Security.Principal;",
  "class M { static void Main() {",
  "  var p = new WindowsPrincipal(WindowsIdentity.GetCurrent());",
  "  File.WriteAllText(" + JSON.stringify(ranFile) + ", \"elevated=\" + (p.IsInRole(WindowsBuiltInRole.Administrator) ? \"true\" : \"false\"));",
  "} }",
].join("\r\n"));
execFileSync(csc, ["/nologo", "/target:exe", "/out:" + exe, src], { stdio: "inherit" });

// 3. The per-user entry, naming the marker, with no per-user copy installed.
const fakeDir = path.join(LAB, "per-user-copy");
fs.mkdirSync(fakeDir);
const wrote = [];
const put = (key, name, value) => { const r = reg(["add", regKey(key), "/v", name, "/t", "REG_SZ", "/d", value, "/f"]); if (r.status !== 0) refuse("reg add " + key + " " + name + ": " + r.stderr.trim()); if (wrote.indexOf(key) < 0) wrote.push(key); };
put(KU.uninstall, "UninstallString", "\"" + exe + "\" /currentuser");
put(KU.uninstall, "DisplayName", T.productName);
put(KU.install, "InstallLocation", fakeDir);

let exit = null, verdict = "#marker refused";
try {
  // 4. The all-users install, silent.
  const args = P.installArgs({ mode: "machine" });
  const r = spawnSync(setup, args, { windowsHide: true, timeout: 600000 });
  exit = r.status;
  const ran = fs.existsSync(ranFile);
  const elevated = ran ? /elevated=true/.test(fs.readFileSync(ranFile, "utf8")) : null;
  verdict = "#marker " + (ran ? "ran" : "not-run") + " elevated=" + (ran ? String(elevated) : "-") + " exit=" + exit;
  say(verdict);
  say(ran && elevated ? "  FAIL the all-users install ran the HKCU-named uninstaller with the Administrators role active"
    : "  ok   the all-users install did not run the HKCU-named uninstaller with administrator rights");
} finally {
  // 5. Clean up: the all-users copy, then the keys this file wrote.
  const machineDir = (() => { const q = reg(["query", regKey(KM.install), "/v", "InstallLocation"]); const m = /InstallLocation\s+REG_SZ\s+(.+)/.exec(q.stdout || ""); return m ? m[1].trim() : ""; })();
  if (machineDir) {
    const un = path.join(machineDir, "Uninstall " + T.productName + ".exe");
    if (fs.existsSync(un)) spawnSync(un, P.uninstallArgs("machine"), { windowsHide: true, timeout: 300000 });
  }
  for (const k of wrote) reg(["delete", regKey(k), "/f"]);
  fs.writeFileSync(path.join(OUT, "marker.txt"), verdict + "\n");
}
process.exit(verdict.indexOf("elevated=true") >= 0 ? 1 : 0);
