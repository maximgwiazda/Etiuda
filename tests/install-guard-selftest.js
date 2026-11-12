/* The install guard and the test identity, held at node level on stand-ins: nothing here reads or writes the registry.
 *
 *   node tests/install-guard-selftest.js
 *   node tests/install-guard-selftest.js --lab-key     the comparison's red, against a lab key it makes and removes under
 *                                                      HKCU\Software\EtiudaGuardLab; a machine leg, not in any chain
 *
 * Exit code is the number of failed checks, capped at 63. The same file is in both trees. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const G = require("./install-guard.cjs");
const I = require("../tools/test-identity.cjs");

const ROOT = path.join(__dirname, "..");
let checks = 0, fails = 0;
const ok = (cond, what) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + what); if (!cond) fails++; };
const done = () => { console.log("\n#counts checks=" + checks + " failed=" + fails); process.exit(fails ? Math.min(fails, 63) : 0); };

/* ---- the lab key: the one leg that writes, and only its own key ---------------------------------------------------- */

if (process.argv.includes("--lab-key")) {
  const KEY = "HKCU\\Software\\EtiudaGuardLab";
  const reg = args => spawnSync("reg", args, { encoding: "utf8", windowsHide: true });
  if (process.platform !== "win32") { console.log("NOT RUN: no registry on " + process.platform); process.exit(0); }
  if (G.regQuery(KEY).present) { console.log("REFUSED: " + KEY + " already stands; it is somebody's, and this leg makes its own"); process.exit(78); }
  const lab = [{ label: "the lab key", kind: "reg", at: KEY, app: "desk", role: "lab", extra: true }];
  try {
    ok(reg(["add", KEY, "/v", "probe", "/t", "REG_SZ", "/d", "one", "/f"]).status === 0, "L0 the leg made its own key " + KEY);
    const start = G.guardStart({ extra: lab });
    const same = G.guardEnd(start);
    ok(same.diffs.length === 0, "L1 control: nothing changed between two readings, and the comparison says so: "
      + (same.diffs.map(G.diffLine).join(" | ") || "equal"));
    reg(["add", KEY, "/v", "probe", "/t", "REG_SZ", "/d", "two", "/f"]);
    const moved = G.guardEnd(start);
    ok(moved.diffs.length === 1 && moved.diffs[0].label === "the lab key",
      "L2 the lab key's value changed between before and after, and the comparison is red naming it alone: "
      + moved.diffs.map(G.diffLine).join(" | "));
  } finally {
    const gone = reg(["delete", KEY, "/f"]).status === 0 && !G.regQuery(KEY).present;
    ok(gone, "L3 the leg removed its own key, and the guard wrote nothing of its own");
  }
  done();
}

/* ---- 1. the GUID ---------------------------------------------------------------------------------------------------- */

let builder = null;
try { builder = require(require.resolve("builder-util-runtime", { paths: [ROOT] })).UUID; } catch (e) { builder = null; }
const ids = [I.SHIPPED.desk.appId, I.SHIPPED.studio.appId, I.TEST.desk.appId, I.TEST.studio.appId];
if (builder) ok(ids.every(id => G.guidOf(id) === builder.v5(id, builder.parse(G.BUILDER_NS))),
  "g1 the GUID the guard reads by is electron-builder's for all four ids: " + ids.map(id => id + " " + G.guidOf(id)).join(", "));
else console.log("  NOT RUN g1: builder-util-runtime is not installed");
ok(new Set(ids.map(G.guidOf)).size === 4, "g2 the four GUIDs are four, so no test install shares a key with a shipped one");

/* ---- 2. the test identity -------------------------------------------------------------------------------------------- */

const base = require(path.join(ROOT, "electron-builder.js"));
const app = Object.keys(I.SHIPPED).find(k => I.SHIPPED[k].appId === base.appId);
ok(!!app, "t1 this tree's electron-builder.js is a shipped app the table knows: " + base.appId + " -> " + app);
const cfg = I.testConfig(base, app, ROOT);
ok(I.shippedLeft(cfg).length === 0 && cfg.appId === I.TEST[app].appId && cfg.productName === I.TEST[app].productName
   && cfg.extraMetadata.name === I.TEST[app].packageName && cfg.nsis.shortcutName === I.TEST[app].productName
   && I.markIn(cfg.extraMetadata.description) === I.TEST[app].appId && cfg.extraMetadata.etiudaTestBuild === I.TEST[app].appId,
  "t2 the test config carries the test identity and no shipped name: " + [cfg.appId, cfg.productName, cfg.extraMetadata.name,
    cfg.nsis.shortcutName, cfg.nsis.artifactName].join(", "));
ok(I.shippedLeft(base).length >= 4, "t3 control: the shipped config read the same way names its shipped names ("
  + I.shippedLeft(base).length + ")");
let stale = "";
try { I.testConfig(Object.assign({}, base, { appId: base.appId + "x" }), app, ROOT); } catch (e) { stale = e.message; }
ok(/stale table/.test(stale), "t4 a base whose appId the table does not know builds nothing: " + stale.slice(0, 90));
ok((cfg.fileAssociations || []).every(a => a.ext === I.TEST.desk.ext && a.name === I.TEST.desk.catalogClass),
  "t5 any association the test build registers is under its own extension and class: " + JSON.stringify(cfg.fileAssociations || []));
const nshAt = path.join(ROOT, base.directories.buildResources, base.nsis.include);
const own = I.ownNamesNsh(fs.readFileSync(nshAt, "utf8"));
const renamed = own.counts.klass + own.counts.link + own.counts.url + own.counts.profile;
ok(own.left.length === 0 && renamed > 0 && cfg.nsis.include !== base.nsis.include && typeof cfg.beforePack === "function",
  "t6 " + base.nsis.include + " renamed for the test build names no shipped class, scheme or profile folder, and the test"
  + " build includes the renamed copy: " + JSON.stringify(own.counts) + (own.left.length ? " LEFT: " + own.left.join(" | ") : ""));
const planted = I.ownNamesNsh("  WriteRegStr HKCU \"Software\\Classes\\.ec\" \"\" \"x\"\n  WriteRegStr HKCU \"Software\\Classes\\ETIUDA\\x\" \"\" \"y\""
  + "\n  RMDir /r \"$APPDATA\\etiuda-studio\\x\"\n  Delete \"$APPDATA\\etiuda-studio-license.js\"");
ok(planted.left.length === 1 && /\.ec/.test(planted.left[0]) && /Classes\\etiuda-qa\\/.test(planted.text)
   && /APPDATA\\etiuda-studio-qa\\x/.test(planted.text) && /etiuda-studio-license\.js/.test(planted.text),
  "t7 control: a line writing the shipped .ec key is left and named; the scheme in capitals and the profile folder are"
  + " renamed, a file merely named like the app is not: " + planted.left.join(" | "));

/* ---- 3. the registry reader, on a stand-in reg ------------------------------------------------------------------------ */

const stand = answers => args => {
  const a = answers[args[1]];
  return a ? a : { status: 1, stdout: "", stderr: "ERROR: not found" };
};
ok(G.regQuery("HKCU\\Software\\X", stand({ "HKCU\\Software\\X": { status: 0, stdout: "\r\nHKEY_CURRENT_USER\\Software\\X\r\n    v    REG_SZ    1  \r\n" } })).text
   === "HKEY_CURRENT_USER\\Software\\X\n    v    REG_SZ    1", "r1 a present key is read whole, line endings and trailing space tidied");
ok(G.regQuery("HKCU\\Software\\Y", stand({})).present === false, "r2 exit 1 on a key the guard builds is absent");
let thrown = "";
try { G.regQuery("HKCU\\Software\\Z", () => ({ status: 5, stdout: "", stderr: "denied" })); } catch (e) { thrown = e.message; }
ok(/cannot be read/.test(thrown), "r3 any other answer throws, so a reader that cannot read refuses rather than passes");
thrown = "";
try { G.regQuery("HKCU\\Software\\a\"b", stand({})); } catch (e) { thrown = e.message; }
ok(/not a key it reads/.test(thrown), "r4 a key the guard did not build is never asked, so exit 1 cannot hide a malformed name");
ok(G.regValues("HK\n    Local AppData    REG_SZ    C:\\L\n    (Default)    REG_SZ    Etiuda catalog\n    Empty    REG_SZ")["Local AppData"] === "C:\\L"
   && G.regValues("    (Default)    REG_SZ    Etiuda catalog")["(Default)"] === "Etiuda catalog",
  "r5 a value is read by its name, spaces in the name included");

/* ---- 4. presence, refusal and the flag, on stand-in places --------------------------------------------------------- */

const SF = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders";
const SFM = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders";
const CV = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion";
const LAB = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "etiuda-guard-selftest-"));
const P = n => path.join(LAB, n);
const placesReg = {
  [SF]: { status: 0, stdout: SF + "\n    AppData    REG_SZ    " + P("roaming") + "\n    Local AppData    REG_SZ    " + P("local")
    + "\n    Desktop    REG_SZ    " + P("desktop") + "\n    Programs    REG_SZ    " + P("programs") + "\n" },
  [SFM]: { status: 0, stdout: SFM + "\n    Common Desktop    REG_SZ    " + P("public") + "\n    Common Programs    REG_SZ    " + P("allprograms") + "\n" },
  [CV]: { status: 0, stdout: CV + "\n    ProgramFilesDir    REG_SZ    " + P("pf") + "\n" },
};
const deskKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + G.guidOf(I.SHIPPED.desk.appId);
const studioMachine = "HKLM\\Software\\" + G.guidOf(I.SHIPPED.studio.appId);
const acc = { user: "lab", domain: "BOX", said: "BOX\\lab" };
function start(extraReg, env) {
  const run = stand(Object.assign({}, placesReg, extraReg || {}));
  const places = G.placesOfAccount(run, env || {});
  const snap = G.snapshot(places, run);
  const reasons = G.presence(snap);
  return { run, places, snap, reasons, refused: G.refusals(reasons, env || {}, acc) };
}
try {
  const clean = start();
  ok(clean.reasons.length === 0 && clean.refused.length === 0 && clean.snap.plan.length >= 27,
    "p1 nothing of either shipped app on the stand-in account: no refusal, " + clean.snap.plan.length + " places read");
  const reg = start({ [deskKey]: { status: 0, stdout: deskKey + "\n    DisplayName    REG_SZ    Etiuda\n" } });
  ok(reg.reasons.length === 1 && /desk HKCU uninstall key/.test(reg.reasons[0]) && reg.refused.length === 2,
    "p2 the desk's HKCU uninstall entry alone is a refusal naming it: " + reg.reasons.join(" | "));
  const mach = start({ [studioMachine]: { status: 0, stdout: studioMachine + "\n    InstallLocation    REG_SZ    C:\\x\n" } });
  ok(mach.reasons.length === 1 && /studio HKLM Software/.test(mach.reasons[0]), "p3 Studio's all-users install key alone is a refusal: " + mach.reasons.join(" | "));
  fs.mkdirSync(path.join(P("local"), "Programs", "Etiuda"), { recursive: true });
  const folder = start();
  ok(folder.reasons.length === 1 && /desk per-user install folder/.test(folder.reasons[0]),
    "p4 the shipped folder standing with no uninstall entry, the state the brief names, is a refusal: " + folder.reasons.join(" | "));
  fs.rmdirSync(path.join(P("local"), "Programs", "Etiuda"));
  fs.mkdirSync(path.join(P("lab"), "Programs", "Etiuda Studio"), { recursive: true });
  const labbed = start({}, { [G.LAB_FLAG]: P("lab") });
  const unlabbed = start({});
  ok(labbed.reasons.length === 1 && /stand-in per-user install folder/.test(labbed.reasons[0]) && unlabbed.reasons.length === 0
     && labbed.snap.plan.length === unlabbed.snap.plan.length + 4,
    "p5 a stand-in folder in the lab path the leg is given is a refusal, and the lab adds places beside the account's own ("
    + unlabbed.snap.plan.length + " -> " + labbed.snap.plan.length + "): " + labbed.reasons.join(" | "));
  const named = G.refusals(reg.reasons, { [G.ACCOUNT_FLAG]: "box\\LAB" }, acc);
  const other = G.refusals(reg.reasons, { [G.ACCOUNT_FLAG]: "BOX\\maxim" }, acc);
  const bare = G.refusals(reg.reasons, { [G.ACCOUNT_FLAG]: "lab" }, acc);
  ok(named.length === 0 && bare.length === 0 && other.length === 2 && /names "BOX\\\\maxim", not this account/.test(other[1]),
    "f1 the flag waives presence only on the account it names (DOMAIN\\USER or USER, any case); another account's name refuses and says so: "
    + other[1].slice(0, 80));

  /* ---- 5. the comparison --------------------------------------------------------------------------------------------- */
  const a = clean.snap, b = G.snapshot(clean.places, clean.run);
  ok(G.compare(a, b).length === 0, "c1 two readings of an unchanged account are equal");
  fs.mkdirSync(P("desktop"), { recursive: true });
  fs.writeFileSync(path.join(P("desktop"), "Etiuda.lnk"), "one");
  const c = G.snapshot(clean.places, clean.run);
  const d1 = G.compare(a, c);
  ok(d1.length === 1 && d1[0].label === "desk shortcut on the Desktop" && d1[0].was === "absent", "c2 a shortcut appearing is red naming it: " + d1.map(G.diffLine).join(" | "));
  fs.writeFileSync(path.join(P("desktop"), "Etiuda.lnk"), "two");
  const d2 = G.compare(c, G.snapshot(clean.places, clean.run));
  ok(d2.length === 1 && /^sha256/.test(d2[0].was) && /^sha256/.test(d2[0].now) && d2[0].was !== d2[0].now, "c3 a shortcut's bytes changing is red: " + d2.map(G.diffLine).join(" | "));
  const e = G.snapshot(clean.places, stand(Object.assign({}, placesReg, { "HKCU\\Software\\Classes\\etiuda": { status: 0, stdout: "x\n    (Default)    REG_SZ    URL:etiuda\n" } })));
  const d3 = G.compare(G.snapshot(clean.places, clean.run), e);
  ok(d3.length === 1 && d3[0].label === "HKCU etiuda:", "c4 the etiuda: handler appearing is red naming it: " + d3.map(G.diffLine).join(" | "));
  fs.mkdirSync(P("roaming/etiuda"), { recursive: true });
  const f0 = G.snapshot(clean.places, clean.run);
  fs.writeFileSync(path.join(P("roaming/etiuda"), "desk.json"), "{}");
  const d4 = G.compare(f0, G.snapshot(clean.places, clean.run));
  ok(d4.length === 1 && d4[0].label === "desk profile", "c5 a file in the real profile changing is red: " + d4.map(G.diffLine).join(" | "));
  const ecOther = { "HKCU\\Software\\Classes\\.ec": { status: 0, stdout: "x\n    (Default)    REG_SZ    Other app\n" } };
  const g = G.snapshot(clean.places, stand(Object.assign({}, placesReg, ecOther)));
  ok(g.plan.some(p => /Other app \(the class \.ec names\)/.test(p.label)), "c6 a class .ec names other than the shipped one is read too");
  ok(G.guardEnd(null).diffs.length === 1, "c7 an end with no start is red, never equal");
} finally {
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch (x) { /* named by the lab's own path */ }
}

/* ---- 6. a setup's identity ------------------------------------------------------------------------------------------- */

/* A String entry of a version resource, built here: wLength, wValueLength in characters, wType 1, the key, padding to
   four, the value. Placed after junk so the reader finds it by its key, as it finds it in a setup. */
function entry(key, value) {
  const k = Buffer.from(key + "\0", "utf16le"), v = Buffer.from(value + "\0", "utf16le");
  const pad = (4 - ((6 + k.length) % 4)) % 4;
  const len = 6 + k.length + pad + v.length;
  const h = Buffer.alloc(6); h.writeUInt16LE(len, 0); h.writeUInt16LE(value.length + 1, 2); h.writeUInt16LE(1, 4);
  return Buffer.concat([h, k, Buffer.alloc(pad), v, Buffer.alloc((4 - (len % 4)) % 4)]);
}
const t = I.TEST.desk;
const pe = Buffer.concat([Buffer.alloc(64, 7), entry("ProductName", t.productName), entry("FileDescription", "Desk " + I.markOf(t.appId))]);
const read = G.versionStrings(pe, ["ProductName", "FileDescription"]);
ok(read.ProductName === t.productName && I.markIn(read.FileDescription) === t.appId, "s1 the reader finds the product and the mark in a version resource: " + JSON.stringify(read));
const twice = Buffer.concat([pe, entry("ProductName", "Etiuda")]);
ok(G.versionStrings(twice, ["ProductName"]).ProductName === "", "s2 a product named two ways reads as none, which refuses");
const idOf = (productName, description) => ({ productName, description, appId: I.markIn(description) });
ok(G.setupRefusal(idOf(t.productName, "x " + I.markOf(t.appId)), "desk") === "", "s3 the desk's test build is accepted for the desk's legs");
ok(/shipped Etiuda \(app id app\.etiuda\.desktop\)/.test(G.setupRefusal(idOf("Etiuda", "An offline macro bank"), "desk")), "s4 the shipped desk is refused as shipped");
ok(/shipped Etiuda Studio/.test(G.setupRefusal(idOf("Etiuda Studio", "x"), "studio")), "s5 the shipped Studio is refused as shipped");
ok(/shipped Etiuda/.test(G.setupRefusal(idOf("Etiuda", "x " + I.markOf(t.appId)), "desk")), "s6 a test mark under a shipped product name is refused");
ok(/names no product/.test(G.setupRefusal(idOf("", ""), "desk")), "s7 a setup with no readable product is refused");
ok(/not the test build/.test(G.setupRefusal(idOf(I.TEST.studio.productName, "x " + I.markOf(I.TEST.studio.appId)), "desk")),
  "s8 Studio's test build is refused for the desk's legs");
ok(/not the test build/.test(G.setupRefusal(idOf(t.productName, "no mark"), "desk")), "s9 the test product name without the mark is refused");

/* The desk sentinel: a home holding it refuses whatever else stands, the flag naming this account included; a home without it adds
   nothing. Read in lab homes only, never the real one. */
{
  const homes = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "install-guard-sentinel-"));
  const withIt = path.join(homes, "desk"), without = path.join(homes, "runner");
  fs.mkdirSync(withIt); fs.mkdirSync(without);
  fs.writeFileSync(path.join(withIt, G.DESK_SENTINEL), "lab");
  const env = Object.assign({}, process.env, { [G.ACCOUNT_FLAG]: require("node:os").userInfo().username });
  const a = G.guardStart({ home: withIt, env }), b = G.guardStart({ home: without, env });
  ok(a.refusals.some(r => r.indexOf(G.DESK_SENTINEL) > -1), "d1 a home carrying " + G.DESK_SENTINEL + " refuses, the account flag set to this account notwithstanding");
  ok(!b.refusals.some(r => r.indexOf(G.DESK_SENTINEL) > -1), "d2 control: a home without it adds no refusal of its own");
  ok(G.deskSentinelAt({ USERPROFILE: without }) === path.join(without, G.DESK_SENTINEL), "d3 the sentinel is read in the account's home (USERPROFILE)");
  try { fs.rmSync(homes, { recursive: true, force: true }); } catch (e) { /* held */ }
}

done();
