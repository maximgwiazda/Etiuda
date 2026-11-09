/* Extract the 32px PNG frame from shell/etiuda.ico and write shell/etiuda-tray.png.
 *
 *   node tools/tray-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICO_PATH = path.join(ROOT, "shell", "etiuda.ico");
const OUT_PATH = path.join(ROOT, "shell", "etiuda-tray.png");

export function extractTrayPng(icoPath = ICO_PATH, outPath = OUT_PATH) {
  const buf = fs.readFileSync(icoPath);
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error("Invalid ICO file: " + icoPath);
  }
  const count = buf.readUInt16LE(4);
  let best = null, bestDiff = Infinity;
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    const w = buf[at] || 256;
    const h = buf[at + 1] || 256;
    const len = buf.readUInt32LE(at + 8);
    const off = buf.readUInt32LE(at + 12);
    const diff = Math.abs(w - 32) + Math.abs(h - 32);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { w, h, len, off };
    }
  }
  if (!best) throw new Error("No frame found in ICO: " + icoPath);
  const png = buf.subarray(best.off, best.off + best.len);
  if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("Frame " + best.w + "x" + best.h + " is not a PNG");
  }
  fs.writeFileSync(outPath, png);
  return { width: best.w, height: best.h, bytes: png.length, path: outPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const res = extractTrayPng();
  console.log("Written " + path.relative(ROOT, res.path) + " (" + res.bytes + " bytes, " + res.width + "x" + res.height + ")");
}
