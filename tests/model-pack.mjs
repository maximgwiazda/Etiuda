/* The built-in model's pack and its export tool, without the weights.
 *
 *   node tests/model-pack.mjs
 *
 * The export tool refuses a file whose sha256 is wrong and writes no ONNX under the model's name (m2).
 * A missing model packs the desk without the AI row (m4). A wrong model file fails the pack (m5).
 * Both installer licence files carry the model attribution, the modification statement and the
 * Apache Licence 2.0, and still close on the trademark (m6). Nothing here downloads a weight or opens a window.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEmbed } from "../tools/model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = path.join(ROOT, "tools", "model-export", "export.py");
const PACK = path.join(ROOT, "tools", "model.mjs");
const WITHOUT = "the desk ships without the built-in model, so suggestions stay on words and the AI row is absent";
const ATTR = "EmbeddingGemma 2, Google DeepMind, Apache 2.0";
const POLICY = "https://ai.google.dev/gemma/prohibited_use_policy";
function noticeFaults(text, lang) {
  const faults = [];
  if (!text.includes(ATTR)) faults.push("attribution");
  const modified = lang === "pl" ? text.includes("kwantyzacja") : text.includes("quantisation");
  if (!modified || !text.includes("ONNX")) faults.push("modification");
  if (!text.includes("Apache License") || !text.includes("Version 2.0, January 2004")
      || !text.includes("END OF TERMS AND CONDITIONS")) faults.push("apache");
  if (text.includes(POLICY) || text.includes("Gemma Terms of Use") || text.includes("gemma_4_license")) faults.push("use-policy");
  return faults;
}

let checks = 0, failed = 0;
function check(ok, what) {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failed++;
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-model-pack-"));
function py(args) {
  return spawnSync("python", [EXPORT].concat(args), {
    encoding: "utf8", timeout: 30000, cwd: ROOT, windowsHide: true,
  });
}
function pack(args) {
  return spawnSync(process.execPath, [PACK].concat(args), {
    encoding: "utf8", timeout: 30000, cwd: ROOT, windowsHide: true,
  });
}
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

const GOOD = Buffer.from("good");
const GOOD_HASH = sha256(GOOD);
function fixtureSource(body) {
  const dir = fs.mkdtempSync(path.join(LAB, "src-"));
  fs.writeFileSync(path.join(dir, "sample.bin"), body);
  const sources = path.join(dir, "sources.json");
  fs.writeFileSync(sources, JSON.stringify({
    files: [{ name: "sample.bin", size: body.length, sha256: GOOD_HASH }],
  }));
  return { dir, sources };
}

check(fs.existsSync(EXPORT), "m0 the export tool is there: tools/model-export/export.py");
const bare = fs.existsSync(EXPORT) ? py([]) : { status: 127, stderr: "no tool", stdout: "" };
check(bare.status === 2 && /usage/i.test(bare.stderr || ""),
  "m1 no arguments exit 2 and name the usage: exit " + bare.status + " " + JSON.stringify((bare.stderr || "").trim().slice(0, 160)));

const self = fs.existsSync(EXPORT) ? py(["--self-test"]) : { status: 127, stdout: "", stderr: "no tool" };
check(self.status === 0 && /self-test: ok/.test(self.stdout || ""),
  "m1b the tool's own fixture passes: exit " + self.status + " " + JSON.stringify((self.stdout || "").trim().slice(-200)));

const bad = fixtureSource(Buffer.from("baad"));
const outBad = path.join(LAB, "out-bad");
fs.mkdirSync(outBad);
const refused = fs.existsSync(EXPORT) ? py(["--export", bad.dir, "--out", outBad, "--sources", bad.sources]) : { status: 127, stderr: "no tool" };
const wroteOnnx = fs.existsSync(path.join(outBad, "model_q4.onnx"));
check(refused.status === 1 && /sha256/.test(refused.stderr || "") && !wroteOnnx,
  "m2 a file whose sha256 is wrong is refused and model_q4.onnx is not written: exit " + refused.status
  + " wrote=" + wroteOnnx + " " + JSON.stringify((refused.stderr || "").trim().slice(0, 220)));

const pinOut = path.join(LAB, "pin.json");
const pinRun = fs.existsSync(EXPORT) ? py(["--write-pin", pinOut]) : { status: 127, stderr: "no tool" };
let pin = null;
try { pin = JSON.parse(fs.readFileSync(pinOut, "utf8")); } catch { pin = null; }
const pinOk = pin && pin.status === "not-exported" && pin.quant === "q4" && pin.textOnly === true
  && pin.cosineMinimum === 0.98 && Array.isArray(pin.files) && pin.files.length === 0
  && pin.parity && pin.parity.status === "not-run" && Array.isArray(pin.parity.messages) && pin.parity.messages.length >= 3
  && pin.source && pin.source.commit === "f9972ac22e696a105c482202646979e33e4b5a1e";
check(pinRun.status === 0 && pinOk,
  "m3 the pin file records quant q4, cosine 0.98 and a parity that has not run: exit " + pinRun.status
  + " " + JSON.stringify(pin && { status: pin.status, quant: pin.quant, parity: pin.parity && pin.parity.status }));

const destMissing = path.join(LAB, "dest-missing");
const missing = fs.existsSync(PACK) ? pack(["--dest", destMissing, "--model", path.join(LAB, "no-such-model")]) : { status: 127, stdout: "", stderr: "no packer" };
const shipped = fs.existsSync(path.join(destMissing, "model", "model_q4.onnx"));
check(missing.status === 0 && (missing.stdout || "").includes(WITHOUT) && !shipped,
  "m4 a missing model exits 0, says the desk ships without it, and packs no model file: exit " + missing.status
  + " shipped=" + shipped + " " + JSON.stringify((missing.stdout || "").trim().slice(0, 180)));

const modelDir = path.join(LAB, "wrong-model");
fs.mkdirSync(modelDir);
const bytes = Buffer.from("not-the-model");
fs.writeFileSync(path.join(modelDir, "model_q4.onnx"), bytes);
const pinFile = path.join(LAB, "shell-pin.json");
fs.writeFileSync(pinFile, JSON.stringify({ files: [
  { name: "model_q4.onnx", size: bytes.length, sha256: "a".repeat(64) },
]}));
const destWrong = path.join(LAB, "dest-wrong");
const wrong = fs.existsSync(PACK) ? pack(["--dest", destWrong, "--model", modelDir, "--pin", pinFile]) : { status: 127, stderr: "no packer" };
const accepted = fs.existsSync(path.join(destWrong, "model", "model_q4.onnx"));
check(wrong.status === 1 && /sha256|checksum/.test((wrong.stderr || "") + (wrong.stdout || "")) && !accepted,
  "m5 a model file with the wrong sha256 fails the pack and is not copied: exit " + wrong.status
  + " copied=" + accepted + " " + JSON.stringify(((wrong.stderr || "") + (wrong.stdout || "")).trim().slice(0, 220)));

const runtimeDir = path.join(LAB, "runtime");
const runtimeRel = path.join("onnxruntime-node", "package.json");
const runtimeBody = Buffer.from('{"name":"onnxruntime-node","version":"0.0.0"}\n');
fs.mkdirSync(path.join(runtimeDir, "onnxruntime-node"), { recursive: true });
fs.writeFileSync(path.join(runtimeDir, runtimeRel), runtimeBody);
const readyPin = path.join(LAB, "ready-pin.json");
fs.writeFileSync(readyPin, JSON.stringify({ files: [
  { name: "model_q4.onnx", size: GOOD.length, sha256: GOOD_HASH },
]}));
const readyModel = path.join(LAB, "ready-model");
fs.mkdirSync(readyModel);
fs.writeFileSync(path.join(readyModel, "model_q4.onnx"), GOOD);
const runtimePin = path.join(LAB, "runtime-pin.json");
fs.writeFileSync(runtimePin, JSON.stringify({ files: [
  { name: "onnxruntime-node/package.json", sha256: sha256(runtimeBody) },
]}));
const destReady = path.join(LAB, "dest-ready");
const ready = fs.existsSync(PACK) ? pack(["--dest", destReady, "--model", readyModel, "--pin", readyPin,
  "--runtime", runtimeDir, "--runtime-pin", runtimePin]) : { status: 127, stderr: "no packer" };
let copiedHash = "";
const copiedAt = path.join(destReady, "model", "model_q4.onnx");
if (fs.existsSync(copiedAt)) copiedHash = sha256(fs.readFileSync(copiedAt));
const runtimeCopied = fs.existsSync(path.join(destReady, "runtime", "node_modules", runtimeRel));
const noticeTree = path.join(ROOT, "shell", "embed", "third-party.txt");
const noticeAt = path.join(destReady, "model", "third-party.txt");
const noticeCopied = fs.existsSync(noticeTree) && fs.existsSync(noticeAt)
  && fs.readFileSync(noticeAt).equals(fs.readFileSync(noticeTree));
check(ready.status === 0 && copiedHash === GOOD_HASH && runtimeCopied && noticeCopied,
  "m5b a model that matches its pin is copied and checked again, with the runtime and the notice: exit " + ready.status
  + " hash=" + copiedHash.slice(0, 12) + " runtime=" + runtimeCopied + " notice=" + noticeCopied);

const disagreeModel = path.join(LAB, "disagree-model");
fs.mkdirSync(disagreeModel);
fs.writeFileSync(path.join(disagreeModel, "model_q4.onnx"), GOOD);
const shellPin = path.join(LAB, "disagree-shell.json");
const exportPin = path.join(LAB, "disagree-export.json");
fs.writeFileSync(shellPin, JSON.stringify({ files: [
  { name: "model_q4.onnx", size: GOOD.length, sha256: "b".repeat(64) },
]}));
fs.writeFileSync(exportPin, JSON.stringify({ status: "exported", files: [
  { name: "model_q4.onnx", size: GOOD.length, sha256: GOOD_HASH },
]}));
const destDisagree = path.join(LAB, "dest-disagree");
const disagree = fs.existsSync(PACK) ? pack(["--dest", destDisagree, "--model", disagreeModel, "--pin", shellPin,
  "--export-pin", exportPin]) : { status: 127, stderr: "no packer" };
check(disagree.status === 1 && /disagree/.test((disagree.stderr || "")),
  "m5c bytes that match the export pin and not the shell pin are refused: exit " + disagree.status
  + " " + JSON.stringify((disagree.stderr || "").trim().slice(0, 200)));

let missingNotice = "";
try {
  await prepareEmbed({
    dest: path.join(LAB, "dest-no-notice"),
    modelDir: readyModel,
    pin: JSON.parse(fs.readFileSync(readyPin, "utf8")),
    runtimeDir,
    runtimeFiles: JSON.parse(fs.readFileSync(runtimePin, "utf8")).files,
    noticeFile: path.join(LAB, "no-such-notice.txt"),
    log: () => {},
  });
} catch (error) { missingNotice = String((error && error.message) || error); }
const packedAnyway = fs.existsSync(path.join(LAB, "dest-no-notice", "model", "model_q4.onnx"));
check(/third-party notice is absent/.test(missingNotice) && !packedAnyway,
  "m5d a model with no third-party notice is refused and not copied: " + JSON.stringify(missingNotice.slice(0, 120))
  + " copied=" + packedAnyway);

function licenceClosing(name) {
  const text = fs.readFileSync(path.join(ROOT, "shell", name), "utf8").replace(/^\uFEFF/, "");
  const paras = text.trim().split(/\n\s*\n/);
  return { text, last: paras[paras.length - 1], cr: text.includes("\r"), bom: fs.readFileSync(path.join(ROOT, "shell", name))[0] === 0xef };
}
const en = licenceClosing("license_en.txt");
const pl = licenceClosing("license_pl.txt");
const enFaults = noticeFaults(en.text, "en");
const plFaults = noticeFaults(pl.text, "pl");
check(enFaults.length === 0 && plFaults.length === 0
    && en.last === "Etiuda is a trademark of Maxim Gwiazda." && !en.cr && en.bom
    && pl.last === "Etiuda jest znakiem towarowym Maxima Gwiazdy." && !pl.cr && pl.bom,
  "m6 both licence files carry the attribution, the modification and the Apache text, and still close on the trademark: "
  + JSON.stringify({ en: enFaults, pl: plFaults }));
const withoutAttribution = en.text.replace(ATTR, "a built-in model");
const restored = en.text + "\n\n" + POLICY;
check(noticeFaults(withoutAttribution, "en").includes("attribution") && noticeFaults(restored, "en").includes("use-policy"),
  "m6p without the attribution, or with the use policy put back, the notice is refused");

const runtimeJson = path.join(ROOT, "tools", "model-runtime.json");
let runtimeList = null;
try { runtimeList = JSON.parse(fs.readFileSync(runtimeJson, "utf8")); } catch { runtimeList = null; }
const listed = runtimeList && Array.isArray(runtimeList.files) ? runtimeList.files : [];
let runtimeMismatch = "";
for (const item of listed) {
  const at = path.join(ROOT, "node_modules", ...item.name.split("/"));
  if (!fs.existsSync(at)) { runtimeMismatch = item.name + " absent"; break; }
  const got = sha256(fs.readFileSync(at));
  if (got !== item.sha256) { runtimeMismatch = item.name + " " + got.slice(0, 12); break; }
}
const direct = ["onnxruntime.dll", "onnxruntime_binding.node", "tokenizers.cjs"].every(part => listed.some(item => item.name.endsWith(part)));
const dropped = listed.some(item => /DirectML\.dll$|dxcompiler\.dll$/.test(item.name));
check(listed.length >= 4 && !runtimeMismatch && direct && !dropped,
  "m7 the pinned Windows runtime matches node_modules, without the two unused DirectML files: "
  + listed.length + " file(s)" + (runtimeMismatch ? " " + runtimeMismatch : ""));

try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the lab is under tmp */ }
console.log("#counts checks=" + checks + " failed=" + failed);
process.exit(Math.min(failed, 63));
