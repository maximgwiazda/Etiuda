/* THE TEST SERVICE BUILD (tools/test-service.cjs): with ETIUDA_PACK_TEST_SERVICE naming a sign-in lab file, the package signs in
 * against that service, draws its band on every screen and carries "Test Service" in its names, version and app id unchanged; without
 * it, the ordinary build. Bare node: nothing packaged, no window, no secret read (a secret-shaped value is built here from pieces).
 * Every guard line carries a plant tag, shown red put in another form in memory or in a temp copy.
 *     node tests/test-service.mjs        exit code is the number of failed checks, capped at 63 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const TS = require(path.join(ROOT, "tools", "test-service.cjs"));
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
const HOST = fs.readFileSync(path.join(ROOT, "src", "modules", "host.js"), "utf8");
const UILANG = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
const PACKAGE = fs.readFileSync(path.join(ROOT, "tools", "package.mjs"), "utf8");
const EXPECTED = 20;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* A plant's proof, `proof` a function so nothing is planted under ETIUDA_PLANTS=off, where it is counted as skipped. */
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
function plantCheck(proof, line) {
  if (PLANTS_OFF) { skipped++; console.log("  skip " + line.split(" ")[0] + " (ETIUDA_PLANTS=off)"); return; }
  let ok = false;
  try { ok = !!proof(); } catch (e) { line += " (" + e.message + ")"; }
  check(ok, line);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-test-service-"));
const SECRET = ["GOCSPX", "standin", "0123456789abcdef"].join("-");
const LAB_SECRET = ["lab", "secret", "1"].join("-");
const STAGING = "https://etiuda.dev/licence-staging/v1/";
const LAB = { service: STAGING, clientIds: { microsoft: "11111111-2222-3333-4444-555555555555", google: "1234567890-abcdefghij.apps.googleusercontent.com" },
  order: "https://etiuda.dev/buy-staging/" };
const write = (name, text) => { const f = path.join(TMP, name); fs.writeFileSync(f, text); return f; };

try {
  /* ---- ts1, the pack's reader is the shell's own, and only its fields are packed -------------------------------------- */
  const read = TS.shellReader(MAIN);
  const labText = JSON.stringify(Object.assign({ note: "kept out", extra: { any: 1 } }, LAB));
  const fields = TS.testServiceFields(labText, read, SECRET);
  check(Object.keys(fields).sort().join() === "clientIds,order,service" && JSON.stringify(read(JSON.stringify(fields))) === JSON.stringify(read(labText))
    && JSON.stringify(read(labText)) !== "null",
    "ts1a the fields packed are the lab file's the desk reads and nothing else, and the desk reads them as it reads the file: " + Object.keys(fields).join(","));
  const refused = [
    "{", "[]", JSON.stringify({ clientIds: LAB.clientIds }), JSON.stringify(Object.assign({}, LAB, { service: "https://example.com/licence/v1/" })),
    JSON.stringify(Object.assign({}, LAB, { clientIds: { apple: "1234567890-x" } })),
  ].map(t => { try { TS.testServiceFields(t, read, SECRET); return "taken"; } catch (e) { return /refuses/.test(e.message) ? "refused" : e.message; } });
  check(refused.every(r => r === "refused"), "ts1b a lab file the desk's reader refuses stops the pack, five shapes: " + refused.join(","));
  const withSecret = JSON.stringify(Object.assign({}, LAB, { provider: { id: "lab", clientId: "lab-client-1", clientSecret: LAB_SECRET,
    issuer: "http://127.0.0.1:4567", authorize: "http://127.0.0.1:4567/authorize", token: "http://127.0.0.1:4567/token", scope: "openid" } }));
  const holdsGoogle = JSON.stringify(Object.assign({}, LAB, { order: "https://etiuda.dev/" + SECRET.replace(/[^A-Za-z0-9._~-]/g, "") + "/" }));
  const said = f => { try { TS.testServiceFields(f, read, SECRET.replace(/[^A-Za-z0-9._~-]/g, "")); return "taken"; } catch (e) { return e.message; } };
  const s1 = said(withSecret), s2 = said(holdsGoogle);
  check(/client secret/.test(s1) && /Google's client secret/.test(s2) && [s1, s2].every(m => m.indexOf(LAB_SECRET) < 0 && m.indexOf(SECRET) < 0),
    "ts1c a provider's client secret, or Google's secret anywhere in what would be packed, stops the pack, naming no value");
  /* The plant on the Google check: the copy of tools/test-service.cjs with that line put in another form takes the file. */
  const tsSrc = fs.readFileSync(path.join(ROOT, "tools", "test-service.cjs"), "utf8");
  plantCheck(() => {
    const tsPlanted = tsSrc.split("\n").map(l => /plant:ts-secret/.test(l) ? "  void 0; /* plant:ts-secret */" : l).join("\n");
    const P = require(write("test-service-planted.cjs", tsPlanted));
    let plantedTook = false;
    try { P.testServiceFields(holdsGoogle, read, SECRET.replace(/[^A-Za-z0-9._~-]/g, "")); plantedTook = true; } catch { plantedTook = false; }
    return tsPlanted !== tsSrc && plantedTook;
  }, "ts1d with plant:ts-secret put in another form, a file holding Google's secret is packed, so ts1c has teeth");

  /* ---- ts2, the config: unset, the same object; set, the names and the fields in extraMetadata, the version and app id unchanged */
  const cfgOf = env => {
    const r = spawnSync(process.execPath, ["-e", "const c=require(process.argv[1]);process.stdout.write(JSON.stringify({c}))", path.join(ROOT, "electron-builder.js")],
      { cwd: ROOT, env: Object.assign({}, process.env, { ETIUDA_PACK_TEST_SERVICE: "", ETIUDA_GOOGLE_CLIENT_SECRET: "", ETIUDA_DIST: TMP }, env), encoding: "utf8" });
    try { return JSON.parse(r.stdout).c; } catch { return { error: String(r.stderr).slice(0, 300) }; }
  };
  const plain = cfgOf({}), tested = cfgOf({ ETIUDA_PACK_TEST_SERVICE: write("lab.json", labText) });
  const base = { productName: "Etiuda" };
  const loose = c => [].concat(c.win.extraResources || [], c.linux.extraResources || []).some(r => /test-service/.test(String(r.to)));
  check(plain.productName === "Etiuda" && plain.executableName === undefined && plain.nsis.artifactName === "etiuda-${version}-setup.${ext}"
    && plain.nsis.shortcutName === "Etiuda" && plain.nsis.uninstallDisplayName === "Etiuda" && plain.extraMetadata[TS.TEST_SERVICE_KEY] === undefined
    && !loose(plain) && TS.testServiceConfig(base, {}, ROOT) === base && TS.testServiceConfig(base, { ETIUDA_PACK_TEST_SERVICE: "" }, ROOT) === base,
    "ts2a without the variable the config is the ordinary one: Etiuda, etiuda-${version}-setup, no test service fields, the very object");
  const { [TS.TEST_SERVICE_KEY]: packed, ...restMeta } = tested.extraMetadata || {};
  check(tested.productName === "Etiuda Test Service" && tested.executableName === "Etiuda" && tested.nsis.artifactName === "Etiuda-Test-Service-${version}-Setup.${ext}"
    && tested.nsis.shortcutName === "Etiuda Test Service" && tested.nsis.uninstallDisplayName === "Etiuda Test Service"
    && tested.appId === plain.appId && JSON.stringify(restMeta) === JSON.stringify(plain.extraMetadata) && JSON.stringify(packed) === JSON.stringify(fields)
    && !loose(tested) && JSON.stringify(tested.files) === JSON.stringify(plain.files),
    "ts2b with it: \"Etiuda Test Service\" and Etiuda-Test-Service-<version>-Setup.exe, the program still Etiuda.exe, the same app id " + tested.appId
    + " and version, the fields in extraMetadata (packed into the asar's package.json) and nothing beside the asar");
  plantCheck(() => {
    const defPlanted = tsSrc.split("\n").map(l => /plant:ts-default/.test(l) ? "  void 0; /* plant:ts-default */" : l).join("\n");
    const D = require(write("test-service-default.cjs", defPlanted));
    let named = false;
    try { named = D.testServiceConfig({ productName: "Etiuda", win: {}, nsis: {} }, {}, ROOT).productName === "Etiuda Test Service"; } catch { named = true; }
    return defPlanted !== tsSrc && named;
  }, "ts2c with plant:ts-default put in another form, the build without the variable is no longer the ordinary one, so ts2a has teeth");

  /* ---- ts3, the step before packing and the summary read back from the asar ------------------------------------------- */
  const absent = TS.testServiceStep({}, ROOT, "win32");
  const present = TS.testServiceStep({ ETIUDA_PACK_TEST_SERVICE: write("lab2.json", labText), ETIUDA_GOOGLE_CLIENT_SECRET: SECRET }, ROOT, "win32");
  check(absent === "Test service: absent" && present === "Test service: present, " + STAGING && present.indexOf(SECRET) < 0,
    "ts3a unset, the step says absent; set, present with the service, never the secret");
  const stops = [
    () => TS.testServiceStep({ ETIUDA_PACK_TEST_SERVICE: write("bad.json", "{\"service\":\"https://example.com/\"}") }, ROOT, "win32"),
    () => TS.testServiceStep({ ETIUDA_PACK_TEST_SERVICE: write("lab3.json", labText) }, ROOT, "linux"),
    () => TS.testServiceStep({ ETIUDA_PACK_TEST_SERVICE: path.join(TMP, "nowhere.json") }, ROOT, "win32"),
  ].map(f => { try { f(); return "went on"; } catch (e) { return e.message; } });
  check(/refuses/.test(stops[0]) && /Windows only/.test(stops[1]) && /no file/.test(stops[2]),
    "ts3b a refused file, a Linux pack and a missing file each stop the pack: " + stops.map(s => s.slice(0, 40)).join(" | "));
  /* The asar reader against @electron/asar's own packing: a package.json with the fields, one without, and a loose file beside. */
  const asar = require("@electron/asar");
  const pack = async (name, pkg) => {
    const src = path.join(TMP, name + "-src"), res = path.join(TMP, name, "resources");
    fs.mkdirSync(path.join(src, "shell"), { recursive: true }); fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(src, "shell", "main.js"), "// a stand-in\n".repeat(50));
    fs.writeFileSync(path.join(src, "package.json"), JSON.stringify(pkg));
    await asar.createPackage(src, path.join(res, "app.asar"));
    fs.writeFileSync(path.join(res, "test-service.json"), JSON.stringify(LAB));
    return res;
  };
  const withFields = await pack("with", { name: "etiuda", version: "0.0.0", [TS.TEST_SERVICE_KEY]: fields }), without = await pack("without", { name: "etiuda", version: "0.0.0" });
  check(TS.testServiceSummary(withFields) === "Test service: present, " + STAGING && TS.testServiceSummary(without) === "Test service: absent"
    && JSON.stringify(TS.asarPackage(path.join(withFields, "app.asar"))[TS.TEST_SERVICE_KEY]) === JSON.stringify(fields)
    && /testServiceSummary\(join\(DIST, 'win-unpacked', 'resources'\)\)/.test(PACKAGE) && /!!testServiceGiven\(process\.env\) !== \/present\/\.test\(service\)/.test(PACKAGE),
    "ts3c the package step reads the fields back from the asar @electron/asar packed, a loose file beside it counting for nothing, and refuses a package that disagrees with the variable");

  /* ---- ts4, the shell: the asar's fields, installed alone, whole or not at all; a file beside the asar never read ----------- */
  const from = MAIN.indexOf("/* THE TEST SERVICE BUILD (tools/test-service.cjs)"), to = MAIN.indexOf("/* plant:door-packed */", from);
  const block = from < 0 || to < 0 ? "" : MAIN.slice(from, MAIN.indexOf("\n", to));
  const layout = (name, pkgFields) => {
    const res = path.join(TMP, "lay-" + name, "resources"), shell = path.join(res, "app.asar", "shell");
    fs.mkdirSync(shell, { recursive: true });
    fs.writeFileSync(path.join(res, "app.asar", "package.json"), JSON.stringify(Object.assign({ name: "etiuda" }, pkgFields === undefined ? {} : { [TS.TEST_SERVICE_KEY]: pkgFields })));
    fs.writeFileSync(path.join(res, "test-service.json"), JSON.stringify(Object.assign({}, LAB, { service: "https://etiuda.dev/licence-planted/v1/", root: "ab".repeat(32) })));
    return { res, shell };
  };
  const start = (facts, swap) => {
    let text = block;
    if (swap) { if (text.split(swap[0]).length !== 2) throw new Error("plant anchor not in the block once: " + swap[0]); text = text.replace(swap[0], swap[1]); }
    const reads = [], said = [], used = [];
    const r = new Function("INSTALLED", "app", "process", "fs", "path", "console", "__dirname", "signinLabUse", "signinLabRead",
      text + "\nreturn { on: testServiceOn, packed: SIGNIN_DESK_PACKED };")(
      facts.installed, { isPackaged: facts.installed }, { resourcesPath: facts.lay.res, env: {} },
      { readFileSync: (p, enc) => { reads.push(String(p)); return fs.readFileSync(p, enc); } }, path, { error: l => said.push(String(l)) },
      facts.lay.shell, lab => { used.push(lab); return !!lab; }, read);
    return Object.assign(r, { reads, said, used });
  };
  const nearLoose = r => r.reads.some(f => /test-service\.json$/.test(f));
  const good = layout("good", fields), bad = layout("bad", { service: "https://example.com/licence/v1/" }), none = layout("none");
  const g = start({ installed: true, lay: good }), b = start({ installed: true, lay: bad }), n = start({ installed: true, lay: none }), dev = start({ installed: false, lay: good });
  check(g.on === true && g.packed === false && g.used.length === 1 && !!g.used[0] && g.used[0].signin === STAGING + "signin/desk" && g.said.length === 0 && !nearLoose(g),
    "ts4a installed with the fields in the asar's package.json: the lab taken once from them, not from the planted file beside the asar; staging's relay allowed");
  check(b.on === false && b.packed === true && b.used.length === 1 && b.used[0] === null && b.said.length === 1 && /refused/.test(b.said[0])
    && n.on === false && n.packed === true && n.used.length === 0 && n.said.length === 0 && !nearLoose(b) && !nearLoose(n),
    "ts4b malformed fields leave the ordinary build whole, said once; an ordinary package with a well-formed file planted beside its asar stays ordinary, said nowhere");
  check(dev.on === false && dev.reads.length === 0 && dev.used.length === 0 && dev.packed === false,
    "ts4c a development desk reads no test service fields and its flag is as before");
  let plants = [];
  plantCheck(() => (plants = [
    ["ts-installed", ["if (INSTALLED) { /* plant:ts-installed */", "if (true) { /* plant:ts-installed */"], r => start({ installed: false, lay: good }, r).on === true],
    ["ts-asar", ["path.join(__dirname, \"..\", \"package.json\"), \"utf8\")).etiudaTestService;", "path.join(String(process.resourcesPath), \"test-service.json\"), \"utf8\"));"],
      r => start({ installed: true, lay: none }, r).on === true],
    ["ts-take", ["if (fields !== undefined && !(testServiceOn = signinLabUse(signinLabRead(JSON.stringify(fields)))))", "if (fields !== undefined && !(testServiceOn = signinLabUse(signinLabRead(JSON.stringify(fields))) || true))"],
      r => start({ installed: true, lay: bad }, r).on === true],
    ["door-packed", ["(INSTALLED || !!app.isPackaged) && !testServiceOn", "(INSTALLED || !!app.isPackaged)"], r => start({ installed: true, lay: good }, r).packed === true],
  ].map(([tag, swap, red]) => { try { return red(swap) ? tag + " red" : tag + " stayed green"; } catch (e) { return tag + " " + e.message; } }))
    .every(p => / red$/.test(p)), "ts4d each guard line put in another form turns its case red: ts-installed, ts-asar (reading the loose file), ts-take, door-packed");

  /* ---- ts5, the page is told, and the band is drawn only then ---------------------------------------------------------- */
  const hostAt = MAIN.indexOf('ipcMain.on("etiuda:host"'), hostEnd = MAIN.indexOf("\n});", hostAt);
  check(/\n    \.\.\.\(testServiceOn \? \{ testService: true \} : \{\}\), \/\* plant:ts-host \*\//.test(MAIN.slice(hostAt, hostEnd))
    && /\n  testService: host\.testService === true,/.test(PRELOAD) && /\n  if\(h\.testService===true\) testServiceBand\(document\); \/\* plant:ts-band \*\//.test(HOST)
    && (MAIN.match(/testService: true/g) || []).length === 1,
    "ts5a the shell tells the engine's own page testService only in a test service build, the preload passes a boolean, and wireHost draws the band only on true");
  const host = await import(pathToFileURL(path.join(ROOT, "src", "modules", "host.js")).href);
  const lang = await import(pathToFileURL(path.join(ROOT, "src", "modules", "ui-lang.js")).href);
  const doc = fakeDoc(), drawn = host.testServiceBand(doc), again = host.testServiceBand(doc);
  check(!!drawn && again === null && doc.body.children[0] === drawn && drawn.id === "eTestBand" && drawn.textContent === lang.t(host.TEST_BAND_EN)
    && drawn.attrs["data-i18n-text"] === host.TEST_BAND_EN && doc.body.classes.has("e-test-service")
    && host.TEST_BAND_EN === "Test build: sign-in goes to Etiuda's test service, not the real one.",
    "ts5b the band is the body's first child, once, in the copywriter's words in this process's language, its English kept as its source; the body is marked");
  const pl = /"Test build: sign-in goes to Etiuda's test service, not the real one\.":"([^"]+)"/.exec(UILANG);
  check(!!pl && pl[1] === "Wersja testowa: logowanie trafia do testowej usługi Etiudy, nie do prawdziwej." && /"#eTestBand"\]\.forEach/.test(UILANG),
    "ts5c the Polish is the copywriter's, and the chrome sweep turns the band with the language");
  /* The band's room: in flow before the header, above every layer, and every layer fixed to the window's top starts under it. */
  const room = cssIn => {
    const css = cssIn.replace(/\/\*[\s\S]*?\*\//g, "");
    const fixedTop = [];
    for (const m of css.matchAll(/(^|\n)([^{}\n][^{}]*)\{([^{}]*)\}/g)) {
      const sel = m[2].trim(), body = m[3];
      if (/position:\s*fixed/.test(body) && /(?:^|;|\s)(?:inset:\s*0|top:\s*0)(?:px)?\s*(?:;|$)/.test(body)) fixedTop.push(sel);
    }
    /* Layers that may lie under the band: they show nothing at the top edge a person needs (a 1px live region, a veil, a centred
       mark, a tour that points with holes at what lies below, a menu or a drag ghost placed at the pointer). */
    const UNDER = ["#eSay", ".e-launch-veil", "#sampleMark", "#tourRoot", ".menu.e-ctx", ".lk-ghost"];
    const moved = (/body\.e-test-service \.modal,body\.e-test-service #railHit\{top:var\(--e-tb-h\)\}/.exec(css) ? ["#railHit", ".modal"] : []);
    const unplaced = fixedTop.filter(s => !moved.includes(s) && !UNDER.some(u => s.indexOf(u) >= 0));
    const ok = unplaced.length === 0 && /#eTestBand\{position:relative;z-index:2147483645;flex:0 0 auto;height:var\(--e-tb-h\)/.test(css)
      && /body\.e-test-service\{--e-tb-h:24px\}/.test(css);
    return { ok, fixedTop, unplaced };
  };
  const css = TEMPLATE.slice(0, TEMPLATE.indexOf("</style>")), r5 = room(css);
  check(r5.ok, "ts5d the band is in flow above every layer, and of the " + r5.fixedTop.length + " layers fixed to the top edge (" + r5.fixedTop.join(", ")
    + ") each starts under it or is named as one that may lie beneath" + (r5.unplaced.length ? ": unplaced " + r5.unplaced.join(", ") : ""));
  plantCheck(() => {
    const r5p = room(css.replace("body.e-test-service .modal,body.e-test-service #railHit{top:var(--e-tb-h)}", ""));
    return !r5p.ok && r5p.unplaced.length === 2 && r5p.unplaced.includes(".modal") && r5p.unplaced.includes("#railHit");
  }, "ts5e with the rule moving the dialog layer and the rail's edge under the band taken out, ts5d's reading goes red on .modal and #railHit");
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* said below */ }
  check(!fs.existsSync(TMP), "ts6 the temp folder is gone");
}

/* A document just large enough for testServiceBand: getElementById, createElement, body.insertBefore and classList. */
function fakeDoc() {
  const all = [];
  const el = tag => ({ tagName: tag, id: "", attrs: {}, textContent: "", setAttribute(k, v) { this.attrs[k] = String(v); } });
  const body = { children: [{ tagName: "HEADER" }], classes: new Set(),
    get firstChild() { return this.children[0]; },
    insertBefore(n, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); all.push(n); return n; } };
  body.classList = { add: c => body.classes.add(c) };
  return { body, createElement: el, getElementById: id => all.find(n => n.id === id) || null };
}

console.log("#counts checks=" + asserted + " failed=" + failed + " skipped=" + skipped + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) { console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran"); process.exit(78); }
console.log(failed ? "test-service: " + failed + " failed" : "test-service: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
