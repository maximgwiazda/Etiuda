/* One logo for both programs: every place the desk carries its mark holds the file or figure the logo set made, byte for byte.
 *
 *   node tests/one-logo.mjs
 *
 * The set is the logo repository at 3e58382 (the desk's c-open figure at 90 degrees, in the desk's colours). Its files are
 * pinned here by sha256, so the gate needs nothing outside this tree.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p));

const FILES = {
  "shell/etiuda.ico": "ca8c72041e726a7ac3c0237731ce53ade04257424b6e357a3c0362eda37dda63",
  "shell/etiuda-tray.png": "dba922ab8a73c3fc2192d6cad039eea4486fe68a76429b164acb1d30d1ebf93a",
  "shell/installer/installerSidebar.bmp": "4f70a26227543fa741cacfaebc7df583fdbc6ddca32e41c88b59406269449eaf",
  "shell/installer/installerHeader.bmp": "6193de1ccb1dbd0a06a76deced44645411bde68b7cfab0efcb31a89113b26114",
  "shell/installer/turning/turning.json": "e06cc2c9f955377ee9793384ff390a2f83c85b6e5d31ef1668db5856c990c638",
};
const FRAMES_COUNT = 960;
const FRAMES_DIGEST = "70ff03e8dfc1716ad54e2fd76e9cc10c8deb41e65d5df32fc2335cc89bba0670";
// the set's etiuda-app.svg from its defs to the end of its group, whitespace between tags dropped, fill currentColor
const MARK_SHA = "abae675a710e80f6a85fe3c06d602849dd12addb650488ae9a38baf182f04648";
// the set's etiuda-app-favicon.svg with its leading comment removed
const FAV_SHA = "9d3ead7034549eab9205bc1a4cec073433ba3c34424384ab30e1e9df8fbaa57c";

let checks = 0, failed = 0;
function check(ok, what) {
  checks++;
  if (ok) console.log("  ok   " + what);
  else { failed++; console.log("  FAIL " + what); }
}

function framesDigest(buffers) {
  const names = Object.keys(buffers).sort();
  return { n: names.length, d: sha(names.map((n) => n + ":" + sha(buffers[n])).join("\n")) };
}
function readFrames() {
  const dir = path.join(ROOT, "shell", "installer", "turning");
  const out = {};
  for (const n of fs.readdirSync(dir)) if (/^(header|sidebar)-\d+\.bmp$/.test(n)) out[n] = fs.readFileSync(path.join(dir, n));
  return out;
}
function bad(read) {
  const wrong = Object.keys(FILES).filter((f) => sha(read(f)) !== FILES[f]);
  return wrong;
}

const wrong = bad((f) => rd(...f.split("/")));
check(wrong.length === 0, "ol1 the app icon, the tray picture, the installer's sidebar and header and turning.json are the set's files byte for byte: " + (wrong.length ? "differ: " + wrong.join(", ") : Object.keys(FILES).length + " of " + Object.keys(FILES).length + " equal"));

const reel = framesDigest(readFrames());
check(reel.n === FRAMES_COUNT && reel.d === FRAMES_DIGEST, "ol2 the installer's 480 sidebar and 480 header frames are the set's byte for byte: " + reel.n + " frames, digest " + (reel.d === FRAMES_DIGEST ? "equal" : "differs"));

const tpl = rd("src", "template.html").toString("utf8"), built = rd("engine", "etiuda.html").toString("utf8");
const favOf = (s) => decodeURIComponent((/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)"/.exec(s) || [])[1] || "");
check(sha(favOf(tpl)) === FAV_SHA && sha(favOf(built)) === FAV_SHA, "ol3 the tab icon, in the source and in the built page, is the set's favicon with its leading comment removed");

const about = rd("src", "modules", "about.js").toString("utf8"), main = rd("shell", "main.js").toString("utf8");
const asAbout = (m) => m.split('"depth"').join('"depth-about"').split("#depth)").join("#depth-about)");
const MARK = (() => {
  const m = /<span class="brand-tile"[^>]*><svg viewBox="[^"]+"[^>]*>([\s\S]*?)<\/svg><\/span>/.exec(tpl);
  return m ? m[1] : "";
})();
const marks = {
  header: sha(MARK) === MARK_SHA,
  built: built.includes(MARK),
  about: about.includes(asAbout(MARK)),
  landing: main.includes("const SIGNIN_LANDING_MARK = '" + MARK + "'"),
};
check(Object.values(marks).every(Boolean), "ol4 the header's mark, About's (mask id depth-about) and the sign-in landing's are the set's app figure, and the built page holds the header's: " + JSON.stringify(marks));

const launch = rd("src", "modules", "launch-mark.js").toString("utf8");
check(/const PHI_ICON = 90 \* Math\.PI \/ 180;/.test(launch), "ol5 the launch opening draws the figure at 90 degrees, the set's c-open");

if (PLANTS_OFF) console.log("  NOT RUN ol6, the plant proof (ETIUDA_PLANTS=off)");
else {
  // plant: the old file put back, read through the same comparison; the base commit's bytes stand for it
  let old = null;
  try { old = execFileSync("git", ["show", "c33ba9cc:shell/etiuda.ico"], { cwd: ROOT, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }); } catch { old = null; }
  if (!old) console.log("  NOT RUN ol6, the plant proof (the base commit is not in this clone)");
  else {
    const planted = bad((f) => (f === "shell/etiuda.ico" ? old : rd(...f.split("/"))));
    check(planted.join() === "shell/etiuda.ico", "ol6 control: putting the old etiuda.ico back turns ol1 red, and only on that file: " + (planted.join() || "green"));
  }
}

console.log("\n#counts checks=" + checks + " failures=" + failed);
process.exit(failed ? 1 : 0);
