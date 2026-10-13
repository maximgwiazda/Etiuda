/* Inline copies of the mark's path are held to tests/mark-path.json.
 * node tests/mark-path.mjs
 * The header tile, the tab icon and TILE_MARK must equal its path, and so must
 * any other path in src/ or shell/ of 500 characters or more. The file names the
 * commit the path was taken from. ETIUDA_MARK_SET, when set, is read at that commit.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 4;
const LONG = 500;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const fix = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "mark-path.json"), "utf8"));

function pathsIn(fileText) {
  const found = [];
  const take = text => {
    const re = /d=(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(text))) {
      const value = m[1] !== undefined ? m[1] : m[2];
      if (typeof value === "string") found.push(value);
    }
  };
  take(fileText);
  const reU = /data:image\/svg\+xml,([^"'\s)]+)/g;
  let m;
  while ((m = reU.exec(fileText))) {
    let dec;
    try { dec = decodeURIComponent(m[1]); } catch { continue; }
    if (dec !== m[1]) take(dec);
  }
  return found;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(f, out); continue; }
    if (!/\.(html|js|mjs|css|svg|cjs)$/.test(e.name)) continue;
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    for (const p of pathsIn(fs.readFileSync(f, "utf8"))) out.push({ rel, d: p });
  }
}

const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
const about = fs.readFileSync(path.join(ROOT, "src", "modules", "about.js"), "utf8");
const brand = (/<span class="brand-tile"[^>]*><svg[^>]*><g[^>]*><path fill="currentColor" d="([^"]+)"/.exec(tpl) || [])[1] || "";
const fav = (/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)"/.exec(tpl) || [])[1] || "";
const favD = (/ d='([^']+)'/.exec(decodeURIComponent(fav)) || [])[1] || "";
const aboutD = (/TILE_MARK='[^']*? d="([^"]+)"/.exec(about) || [])[1] || "";
const sites = [
  ["header", brand],
  ["tab icon", favD],
  ["About tile", aboutD],
];
const bad = sites.filter(s => s[1] !== fix.d).map(s => s[0] + (s[1] ? " differs" : " is missing"));
check(bad.length === 0 && sites.every(s => s[1].length > LONG),
  "1a the header, the tab icon and the About tile carry the fixture path"
  + (bad.length ? ": " + bad.join(", ") : " (" + fix.d.length + " chars)"));

const found = [];
walk(path.join(ROOT, "src"), found);
walk(path.join(ROOT, "shell"), found);
const long = found.filter(p => p.d.length >= LONG);
const drift = long.filter(p => p.d !== fix.d);
check(long.length >= 3 && drift.length === 0,
  "1b " + long.length + " path(s) of " + LONG + " characters or more in src/ and shell/, "
  + drift.length + " differing" + (drift.length ? " (" + drift.map(p => p.rel).join(", ") + ")" : ""));

check(/^[0-9a-f]{40}$/.test(fix.commit) && fix.file === "etiuda-mark-geometry.json"
    && typeof fix.d === "string" && fix.d.length > LONG,
  "1c the fixture names a commit and the geometry file's path: " + String(fix.commit).slice(0, 12)
  + ", " + (fix.d ? fix.d.length : 0) + " chars");

const repo = process.env.ETIUDA_MARK_SET || "";
let repoOk = false, repoLine = "";
if (!repo) {
  repoOk = true;
  repoLine = "no checkout named, so the fixture was not read back from one";
} else if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
  repoLine = "the named checkout is not a directory";
} else {
  try {
    const shown = execFileSync("git", ["-C", repo, "show", fix.commit + ":" + fix.file],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const got = JSON.parse(shown).d;
    repoOk = got === fix.d;
    repoLine = "the fixture " + (repoOk ? "matches" : "differs from") + " the geometry at "
      + fix.commit.slice(0, 12);
  } catch (e) {
    repoLine = "the checkout could not be read: " + String(e && e.message || e).split(/\r?\n/)[0];
  }
}
check(repoOk, "1d " + repoLine);

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted !== EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "RESULT: FAIL " + failed + " of " + asserted : "RESULT: OK " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
