/* The seller's address in the licence pages (tools/seller-address.cjs): filled at packaging from a private file, never in the tree.
 * Bare node, no build, no installer and no network.
 *
 *     node tests/seller-address.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIM. With ETIUDA_PACK_SELLER_ADDRESS unset, electron-builder.js's config is the same object, its licence pages are the
 * tree's, and tools/sellable.mjs still finds the address placeholder, as before. With it naming a file, the config reads its pages
 * from a copy of buildResources in the output folder whose pages carry the address and no placeholder, the tree's pages are byte for
 * byte as they were, and the release judges the copy. A malformed file, or a page whose placeholder moved, stops the packaging.
 *
 * Every address here is invented, written into this run's own scratch folder. The config is loaded in a child process, as
 * tests/test-service.mjs loads it, with the output folder pointed at that scratch folder.
 *
 * EVERY GUARD IS SHOWN RED (sa-plants): the line carrying its plant tag is put in another form in memory and the same case is read
 * again; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools", "seller-address.cjs");
const RELEASE = path.join(ROOT, "tools", "release.mjs");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 6;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 8 + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the stand-ins ---------------------------------------------------------------------------------------------------- */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-seller-address-"));
/* Invented, of an address's shape; no real address is read or written anywhere in this file. */
const EN = "12 Invented Street, 00-000 Nowhere", PL = "ul. Wymyślona 12, 00-000 Nigdzie";
const fileOf = (name, body) => { const f = path.join(LAB, name); fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body), "utf8"); return f; };
const GOOD = fileOf("address.json", { format: 1, en: EN, pl: PL });
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), base)
    : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")]).sort();
}
/* electron-builder.js loaded in a child, the variable `file` (or none) and both trees' output variables pointed at `out`. */
function configOf(file, out) {
  const env = Object.assign({}, process.env, { ETIUDA_DIST: out, ETIUDA_STUDIO_DIST: out });
  delete env.ETIUDA_PACK_SELLER_ADDRESS; delete env.ETIUDA_PACK_TEST_SERVICE;
  if (file) env.ETIUDA_PACK_SELLER_ADDRESS = file;
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require(process.argv[1])))", path.join(ROOT, "electron-builder.js")],
    { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let c = null;
  try { c = r.status === 0 ? JSON.parse(r.stdout) : null; } catch { c = null; }
  return { status: r.status, config: c, said: String(r.stderr || "") };
}
/* The tool (or `file`), evaluated from its text with the standing plant's swap in place of the one line holding its anchor. */
let PLANT_SWAP = null;
const IDENTITY = path.join(ROOT, "tools", "test-identity.cjs");
function tool(file = TOOL) {
  let text = fs.readFileSync(file, "utf8");
  if (PLANT_SWAP) {
    if (text.split(PLANT_SWAP[0]).length !== 2) throw new Error("plant anchor not in the tool once: " + PLANT_SWAP[0]);
    text = text.replace(PLANT_SWAP[0], PLANT_SWAP[1]);
  }
  const mod = { exports: {} };
  new Function("require", "module", "exports", text)(createRequire(file), mod, mod.exports);
  return mod.exports;
}
const SELL = await import(pathToFileURL(path.join(ROOT, "tools", "sellable.mjs")).href);
const PLAIN = configOf("", path.join(LAB, "out-unset"));
const RES = PLAIN.config ? PLAIN.config.directories.buildResources : "";
const PAGES = ["license_en.txt", "license_pl.txt"];
const treePage = name => path.join(ROOT, RES, name);
const throws = fn => { try { fn(); return ""; } catch (e) { return String(e && e.message || e) || "thrown"; } };

/* ---- the cases -------------------------------------------------------------------------------------------------------- */
const CASES = {};
/* sa1: unset, the config is the same object and makes no copy; the tree's pages still carry the address placeholder, so sellable
   refuses them for a customer build as before. */
CASES.unset = () => {
  const T = tool(), base = { directories: { output: "out", buildResources: RES } };
  const holes = SELL.licenceProblems(path.join(ROOT, RES)).join(" ");
  return PLAIN.status === 0 && !!RES && !path.isAbsolute(RES) && T.sellerConfig(base, {}, ROOT, LAB) === base
    && T.sellerConfig(base, { ETIUDA_PACK_SELLER_ADDRESS: "" }, ROOT, LAB) === base && !fs.existsSync(path.join(LAB, "out-unset", T.STAGE))
    && holes.indexOf("[registered address]") >= 0 && holes.indexOf("[adres siedziby]") >= 0;
};
/* sa2: set, the config reads a copy in the output folder, every file of buildResources in it; its two pages carry the address once,
   their BOM kept and no placeholder left, so sellable passes them; nothing else in the config moved; the tree's pages are untouched. */
CASES.set = () => {
  const before = PAGES.map(n => sha(treePage(n)));
  const out = path.join(LAB, "out-set"), got = configOf(GOOD, out), plain = configOf("", out);
  const T = tool(), dir = got.config ? got.config.directories.buildResources : "", want = path.resolve(ROOT, out, T.STAGE, path.basename(RES));
  if (got.status !== 0 || dir !== want || !fs.existsSync(dir)) return false;
  const en = fs.readFileSync(path.join(dir, PAGES[0]), "utf8"), pl = fs.readFileSync(path.join(dir, PAGES[1]), "utf8");
  const same = walk(path.join(ROOT, RES)).join() === walk(dir).join()
    && walk(dir).filter(f => PAGES.indexOf(f) < 0).every(f => sha(path.join(dir, f)) === sha(path.join(ROOT, RES, f)));
  const rest = c => JSON.stringify(Object.assign({}, c, { directories: Object.assign({}, c.directories, { buildResources: "" }) }));
  return same && en.split(EN).length === 2 && pl.split(PL).length === 2 && en.charCodeAt(0) === 0xfeff && pl.charCodeAt(0) === 0xfeff
    && SELL.placeholders(en).length === 0 && SELL.placeholders(pl).length === 0 && SELL.licenceProblems(dir).length === 0
    && !!plain.config && rest(got.config) === rest(plain.config) && PAGES.every((n, i) => sha(treePage(n)) === before[i])
    && PAGES.every(n => fs.readFileSync(treePage(n), "utf8").indexOf(EN) < 0 && fs.readFileSync(treePage(n), "utf8").indexOf(PL) < 0);
};
/* sa3: a malformed file stops the packaging, its refusal naming no value, and the config does not load; so does a page carrying its
   placeholder twice or not at all, and a variable naming no file. */
const BAD = [
  "not json", "[]", { format: 2, en: EN, pl: PL }, { format: 1, en: EN }, { format: 1, en: EN, pl: PL, name: "Somebody" }, { format: 1, en: EN, pl: 7 },
  { format: 1, en: "[" + EN + "]", pl: PL }, { format: 1, en: EN + "\nSecond line", pl: PL }, { format: 1, en: "12 St", pl: PL.slice(0, 3) },
  { format: 1, en: " " + EN, pl: PL }, { format: 1, en: EN.replace(" ", "–"), pl: PL }, { format: 1, en: EN + "\u0007", pl: PL },
  { format: 1, en: "", pl: PL }, { format: 1, en: EN.replace("12", "“12”"), pl: PL }, { format: 1, en: "x".repeat(201), pl: PL },
];
function resWith(name, enText) {
  const d = path.join(LAB, name, path.basename(RES));
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, PAGES[0]), enText, "utf8");
  fs.copyFileSync(treePage(PAGES[1]), path.join(d, PAGES[1]));
  return d;
}
CASES.malformed = () => {
  const T = tool(), stage = path.join(LAB, "stage-bad");
  const said = BAD.map((b, i) => throws(() => T.sellerStage({ ETIUDA_PACK_SELLER_ADDRESS: fileOf("bad-" + i + ".json", b) }, ROOT, RES, stage)));
  const twice = resWith("twice", "﻿Maxim Gwiazda, [registered address], [registered address], Poland.\n");
  const none = resWith("none", "﻿Maxim Gwiazda, Poland.\n");
  const holes = [twice, none].map(d => throws(() => T.sellerStage({ ETIUDA_PACK_SELLER_ADDRESS: GOOD }, path.dirname(d), path.basename(d), path.join(LAB, "stage-holes"))));
  const missing = throws(() => T.sellerStage({ ETIUDA_PACK_SELLER_ADDRESS: path.join(LAB, "no-such-file.json") }, ROOT, RES, stage));
  const child = configOf(fileOf("bad-child.json", { format: 1, en: "[" + EN + "]", pl: PL }), path.join(LAB, "out-bad"));
  return said.every(s => !!s && s.indexOf(EN) < 0 && s.indexOf(PL) < 0 && s.indexOf("Invented") < 0) && holes.every(s => /carries/.test(s))
    && !!missing && !fs.existsSync(stage) && child.status !== 0 && child.config === null && child.said.indexOf("Invented") < 0;
};
/* sa4: the copy never lands inside buildResources, nor buildResources inside the copy: an output folder there is refused before
   anything is written. Driven on a scratch copy of the two pages, never on the tree, since the guard cut would write into the root. */
CASES.inside = () => {
  const T = tool(), root = path.join(LAB, "inside-root"), d = resWith(path.join("inside-root"), fs.readFileSync(treePage(PAGES[0]), "utf8"));
  const name = path.basename(d), mark = path.join(d, "untouched.txt");
  fs.writeFileSync(mark, "x", "utf8");
  const said = [path.join(d, "x"), d].map(out => throws(() => T.sellerStage({ ETIUDA_PACK_SELLER_ADDRESS: GOOD }, root, name, out)));
  const deep = throws(() => T.sellerStage({ ETIUDA_PACK_SELLER_ADDRESS: GOOD }, root, path.join(".seller-pages", name), "."));
  return said.every(s => /would land inside/.test(s)) && fs.readFileSync(mark, "utf8") === "x"
    && fs.readdirSync(d).sort().join() === ["license_en.txt", "license_pl.txt", "untouched.txt"].join() && /would land inside|holds no/.test(deep);
};
/* sa5: the release judges the pages the build will show, the config's buildResources, not a name of its own. */
let RELEASE_TEXT = fs.readFileSync(RELEASE, "utf8");
CASES.release = () => {
  const lines = RELEASE_TEXT.split("\n").filter(l => /plant:release-licence-dir/.test(l));
  return lines.length === 1 && /directories\.buildResources/.test(lines[0]) && /licenceDir/.test(lines[0]);
};
/* sa6: the step's line says whether the pages carry the address, never the address. */
CASES.step = () => {
  const T = tool(), on = T.sellerStep({ ETIUDA_PACK_SELLER_ADDRESS: GOOD }, "x"), off = T.sellerStep({}, RES);
  return /^Seller address: filled into license_en\.txt, license_pl\.txt/.test(on) && /^Seller address: absent/.test(off)
    && [on, off].every(s => s.indexOf("Invented") < 0 && s.indexOf(GOOD) < 0);
};
/* sa7: the builder's config names the tool, and its beforePack says the step's line. */
CASES.wired = () => {
  const text = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8");
  return /module\.exports = sellerAddress\.sellerConfig\(/.test(text) && /\}, process\.env, __dirname\), process\.env, __dirname, output\);\s*$/.test(text)
    && /console\.log\(sellerAddress\.sellerStep\(process\.env, module\.exports\.directories\.buildResources\)\)/.test(text);
};

/* sa8: the test identity build (tools/test-identity.cjs, package.mjs --test-identity) reads its installer script from buildResources
   when that is the copy's absolute folder: its beforePack finds the script and writes the renamed one (the test architect's read). */
CASES.identity = async () => {
  const I = tool(IDENTITY), app = PLAIN.config.appId === I.SHIPPED.desk.appId ? "desk" : "studio", s = I.SHIPPED[app];
  const root = path.join(LAB, "identity-root"), res = path.join(LAB, "identity-res"), out = path.join(LAB, "identity-out");
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ description: "a stand-in" }), "utf8");
  fs.writeFileSync(path.join(res, "installer.nsh"), "; a stand-in script\n", "utf8");
  const base = { appId: s.appId, productName: s.productName, extraMetadata: {}, fileAssociations: [], nsis: { include: "installer.nsh" },
    directories: { buildResources: res, output: out } };
  const cfg = I.testConfig(base, app, root);
  await cfg.beforePack({});
  return path.isAbsolute(res) && fs.readFileSync(cfg.nsis.include, "utf8") === "; a stand-in script\n";
};

/* ---- the run ---------------------------------------------------------------------------------------------------------- */
const LEGS = [
  ["sa1", "unset", "unset: the config is the same object, no copy is made, and sellable still finds the placeholder"],
  ["sa2", "set", "set: the pages come from a filled copy in the output folder, no placeholder, sellable passes; nothing else moved; the tree untouched"],
  ["sa3", "malformed", "a malformed file, a page whose placeholder moved, or no file: refused, naming no value"],
  ["sa4", "inside", "the copy never lands inside the tree's buildResources"],
  ["sa5", "release", "the release judges the config's buildResources"],
  ["sa6", "step", "the step's line never carries the address"],
  ["sa7", "wired", "electron-builder.js wraps its config in the tool and says the step"],
  ["sa8", "identity", "the test identity build finds its installer script in the copy's absolute buildResources"],
];
for (const [id, name, line] of LEGS) {
  let ok = false;
  try { ok = !!RES && (await CASES[name]()) === true; } catch (e) { console.log("    (" + id + " threw: " + e.message + ")"); }
  check(ok, id + " " + line);
}

async function plant(id, swap, name, line, where) {
  let red = false;
  if (where === "identity") {
    PLANT_SWAP = swap;
    const anchored = fs.readFileSync(IDENTITY, "utf8").split(swap[0]).length === 2;
    try { red = anchored && (await CASES[name]()) !== true; } catch { red = anchored; }
    PLANT_SWAP = null;
    check(red, id + " " + line);
    return;
  }
  if (where === "release") {
    const was = RELEASE_TEXT, hit = was.split("\n").find(l => /plant:release-licence-dir/.test(l));
    RELEASE_TEXT = hit ? was.replace(hit, swap[1]) : was;
    try { red = !!hit && CASES[name]() !== true; } catch { red = false; }
    RELEASE_TEXT = was;
  } else {
    PLANT_SWAP = swap;
    let anchored = false;
    try { anchored = fs.readFileSync(TOOL, "utf8").split(swap[0]).length === 2; } catch { anchored = false; }
    try { red = anchored && CASES[name]() !== true; } catch { red = anchored; }
    PLANT_SWAP = null;
  }
  check(red, id + " " + line);
}
if (!PLANTS_OFF && RES) {
  await plant("sap1", ["if (!given(env)) return base; /* plant:seller-default */", "if (false) return base;"], "unset",
    "seller-default cut: an unset variable would still stage, or stop the build");
  await plant("sap2", ["const LINE = /^[\\p{L}\\p{N} .,/'&()#:;-]{5,200}$/u; /* plant:seller-shape */", "const LINE = /^[\\s\\S]*$/u;"], "malformed",
    "seller-shape loosened: a bracket, a second line or a dash would reach the page");
  await plant("sap3", ["if (n !== 1) throw new Error(SELLER_ADDRESS_VAR + \": \" + name + \" carries \" + hole + \" \" + n + \" times, not once\"); /* plant:seller-once */", ""], "malformed",
    "seller-once cut: a page whose placeholder moved would pack half filled");
  await plant("sap4", ["if (within(from, to) || within(to, from)) throw new Error(SELLER_ADDRESS_VAR + \": the copy would land inside \" + resDir); /* plant:seller-inside */", ""], "inside",
    "seller-inside cut: the filled pages could be written into the tree");
  await plant("sap5", [null, "  const licenceDir = join(ROOT, 'shell'); /* plant:release-licence-dir */"], "release",
    "release-licence-dir: a release judging the tree's pages would refuse a filled build, or pass an unfilled one", "release");
  await plant("sap6", ["const from = path.resolve(root, (base.directories && base.directories.buildResources) || \"build\", base.nsis.include); /* plant:identity-resolve */",
    "const from = path.join(root, (base.directories && base.directories.buildResources) || \"build\", base.nsis.include);"], "identity",
    "identity-resolve back to path.join: a --test-identity pack under the variable misses its installer script", "identity");
}

try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the scratch folder is this run's own */ }
console.log((failed ? "FAIL" : "ok") + " seller-address: " + (asserted - failed) + "/" + asserted + " checks"
  + (asserted !== EXPECTED ? " (expected " + EXPECTED + ": the run did not complete)" : ""));
process.exit(asserted !== EXPECTED ? Math.max(1, Math.min(failed, 63)) : Math.min(failed, 63));
