/* Inline copies of the mark's path are held to tests/mark-path.json.
 * node tests/mark-path.mjs
 *
 * The header tile, the tab icon and the About tile must equal its path. Any other
 * copy is found by content, not by the way it is written. Eight windows of 24
 * characters, spread from the path's first character to its last, are matched in
 * every tracked or untracked file outside v1/, the built page (section 2b holds
 * that) and this fixture. A file that contains a zero byte is skipped. Each file
 * is read four ways: the text; the text with \" and \' put back as quotes; every
 * run of %XX percent-decoded; and each svg data URI opened (base64, or percent
 * encoded). A reading that hits any window more often than it holds the whole
 * path is a drifted copy, and the file is named.
 *
 * The file names the commit the path was taken from. ETIUDA_MARK_SET, when set,
 * is read at that commit. When it is unset, that comparison is not run.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 5;
const LONG = 500;
const WINDOW = 24;
const WINDOWS = 8;
const CUT = 480;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const fix = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "mark-path.json"), "utf8"));

/** How many times needle occurs in hay, overlapping counts included. An empty needle is never counted. */
function countOf(hay, needle) {
  if (!needle) return 0;
  let c = 0, i = -1;
  while ((i = hay.indexOf(needle, i + 1)) >= 0) c++;
  return c;
}

/** Eight windows of WINDOW characters, the first starting at the first character and the last
 *  ending at the last. Math.floor of an even spread is what puts both ends on the path. */
function windowsOf(d) {
  if (typeof d !== "string" || d.length < WINDOW) return [];
  const out = [];
  for (let i = 0; i < WINDOWS; i++) {
    const start = Math.floor(i * (d.length - WINDOW) / (WINDOWS - 1));
    out.push(d.slice(start, start + WINDOW));
  }
  return out;
}

/** The readings of one text. A data URI is opened on its own as well as by the percent reading,
 *  because a base64 payload is not percent encoding. */
function viewsOf(text) {
  const percent = text.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => {
    try { return decodeURIComponent(run); } catch { return run; }
  });
  const views = [text, text.replace(/\\(["'])/g, "$1"), percent];
  const re = /data:image\/svg\+xml(;[^,"'\s]*)?,([^"'\s)]+)/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      views.push(/;base64/.test(m[1] || "")
        ? Buffer.from(m[2], "base64").toString("utf8")
        : decodeURIComponent(m[2]));
    } catch { /* a payload that does not decode is not a copy */ }
  }
  return views;
}

/** True when any reading hits a window more often than it holds the whole path. */
function carriesDrift(text, d, windows) {
  for (const view of viewsOf(text)) {
    let hits = 0;
    for (const w of windows) {
      const n = countOf(view, w);
      if (n > hits) hits = n;
    }
    if (hits && countOf(view, d) < hits) return true;
  }
  return false;
}

/** The ten forms a drifted copy was missed in when the finder looked for d="..." only.
 *  Each is built from the path, so this file does not itself carry a window of it. */
function formsOf(pathData) {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'><path d='" + pathData + "'/></svg>";
  return [
    ["attribute", "<svg viewBox=\"0 0 256 256\"><path d=\"" + pathData + "\"/></svg>"],
    ["setAttribute", "el.setAttribute(\"d\", \"" + pathData + "\")"],
    ["css path", "clip-path: path(\"" + pathData + "\")"],
    ["percent-encoded data uri", "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)],
    ["escaped quotes", "\"<path d=\\\"" + pathData + "\\\"/>\""],
    ["base64 data uri", "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64")],
    ["tools attribute", "d=\"" + pathData + "\""],
    ["json", "{\"d\":" + JSON.stringify(pathData) + "}"],
    ["cut copy", pathData.slice(0, CUT)],
    ["typescript", "export const mark: string = \"" + pathData + "\";"],
  ];
}

function heldAside(rel) {
  return rel.startsWith("v1/") || rel === "engine/etiuda.html" || rel === "tests/mark-path.json";
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

const windows = windowsOf(fix.d);
let listed = [];
let listError = "";
try {
  listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"],
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString("utf8").split("\0").filter(Boolean);
} catch (e) {
  listError = String(e && e.message || e).split(/\r?\n/)[0];
}
const drifted = [];
const unreadable = [];
let read = 0, binary = 0, copies = 0;
for (const rel of listed) {
  if (heldAside(rel)) continue;
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, rel)); }
  catch { unreadable.push(rel); continue; }
  if (buf.includes(0)) { binary++; continue; }
  read++;
  const text = buf.toString("utf8");
  copies += countOf(text, fix.d);
  if (carriesDrift(text, fix.d, windows)) drifted.push(rel);
}
check(!listError && unreadable.length === 0 && drifted.length === 0,
  "1b " + copies + " whole copy(ies) of the fixture path, " + drifted.length + " drifted, "
  + read + " file(s) read, " + binary + " binary skipped"
  + (listError ? ": " + listError : "")
  + (unreadable.length ? ": unreadable " + unreadable.join(", ") : "")
  + (drifted.length ? ": " + drifted.join(", ") : ""));

check(/^[0-9a-f]{40}$/.test(fix.commit) && fix.file === "etiuda-mark-geometry.json"
    && typeof fix.d === "string" && fix.d.length > LONG,
  "1c the fixture names a commit and the geometry file's path: " + String(fix.commit).slice(0, 12)
  + ", " + (fix.d ? fix.d.length : 0) + " chars");

const repo = process.env.ETIUDA_MARK_SET || "";
const notRun = [];
if (!repo) {
  notRun.push("1d");
  console.log("  NOT RUN: 1d no checkout named, so the fixture was not read back from one");
} else if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
  check(false, "1d the named checkout is not a directory");
} else {
  try {
    const shown = execFileSync("git", ["-C", repo, "show", fix.commit + ":" + fix.file],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const got = JSON.parse(shown).d;
    const repoOk = got === fix.d;
    check(repoOk, "1d the fixture " + (repoOk ? "matches" : "differs from") + " the geometry at "
      + fix.commit.slice(0, 12));
  } catch (e) {
    check(false, "1d the checkout could not be read: " + String(e && e.message || e).split(/\r?\n/)[0]);
  }
}

/** A digit outside every window and inside the cut, so a one-character drift keeps every window
 *  and the cut still holds the first of them. The first 98.11 is not used: a fixture that has
 *  already moved that one would send the control looking past the cut. */
function driftIndex(d, windows) {
  if (typeof d !== "string") return -1;
  const covered = new Array(d.length).fill(false);
  for (const w of windows) {
    let from = 0;
    while (from < d.length) {
      const start = d.indexOf(w, from);
      if (start < 0) break;
      for (let i = start; i < start + w.length && i < d.length; i++) covered[i] = true;
      from = start + 1;
    }
  }
  for (let i = WINDOW; i < CUT && i < d.length; i++) {
    if (!covered[i] && d[i] >= "0" && d[i] <= "9") return i;
  }
  return -1;
}
const driftAt = driftIndex(fix.d, windows);
const driftedPath = driftAt >= 0
  ? fix.d.slice(0, driftAt) + (fix.d[driftAt] === "0" ? "1" : "0") + fix.d.slice(driftAt + 1)
  : "";
const missed = [];
const exactFlagged = [];
let teeth = false;
if (driftedPath) {
  const badForms = formsOf(driftedPath);
  const exactForms = formsOf(fix.d);
  for (const [name, text] of badForms) {
    if (!carriesDrift(text, fix.d, windows)) missed.push(name);
  }
  for (const [name, text] of exactForms) {
    const found = carriesDrift(text, fix.d, windows);
    if (name === "cut copy") { if (!found) missed.push("cut copy of the true path"); }
    else if (found) exactFlagged.push(name);
  }
  const encoded = badForms.find(f => f[0] === "percent-encoded data uri");
  const b64 = badForms.find(f => f[0] === "base64 data uri");
  teeth = !!encoded && !!b64
    && windows.every(w => !encoded[1].includes(w) && !b64[1].includes(w));
}
const sound = windows.length === WINDOWS
  && windows.every(w => w.length === WINDOW && countOf(fix.d, w) === 1);
const driftOk = driftAt >= WINDOW && driftAt < CUT;
check(sound && driftOk && teeth && missed.length === 0 && exactFlagged.length === 0,
  "1e control: a drifted copy is found in all 10 forms, a " + CUT
  + "-character prefix is found, and a full exact copy of the other 9 is not"
  + (sound ? "" : "; the windows are not eight distinct slices")
  + (driftOk ? "" : "; no digit sits outside every window and inside the prefix")
  + (teeth ? "" : "; the encoded forms still contain a window, so the decoding is not what finds them")
  + (missed.length ? "; missed " + missed.join(", ") : "")
  + (exactFlagged.length ? "; exact flagged " + exactFlagged.join(", ") : ""));

console.log("#counts checks=" + asserted + " failed=" + failed + " notRun=" + notRun.length
  + " expected=" + EXPECTED);
if (asserted + notRun.length !== EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " checks and " + notRun.length
    + " not run, of " + EXPECTED);
  process.exit(78);
}
const tail = notRun.length ? " - NOT RUN: " + notRun.join(", ") : "";
const result = failed
  ? "RESULT: FAIL " + failed + " of " + asserted
  : (notRun.length ? "RESULT: OK" : "RESULT: OK " + asserted + " check(s)");
console.log(result + tail);
process.exit(Math.min(failed, 63));
