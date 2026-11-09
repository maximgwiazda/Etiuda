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
  && pin.cosineProxy === 0.98 && pin.passGate === "taskFloor" && !("cosineMinimum" in pin) && Array.isArray(pin.files) && pin.files.length === 0
  && pin.parity && pin.parity.status === "not-run" && Array.isArray(pin.parity.messages) && pin.parity.messages.length >= 3
  && pin.source && pin.source.commit === "f9972ac22e696a105c482202646979e33e4b5a1e";
check(pinRun.status === 0 && pinOk,
  "m3 the pin file records quant q4, the task floor as its pass gate, the cosine 0.98 as a proxy only, and a parity that has not run: exit " + pinRun.status
  + " " + JSON.stringify(pin && { status: pin.status, quant: pin.quant, parity: pin.parity && pin.parity.status }));

/* THE COMMITTED PIN PASSES BY THE TASK FLOOR (Claude alpha, 05:42): its top five within one message of the published q4,
   on en and on pl; the cosines beside it are a proxy and gate nothing. */
let shipped0 = null;
try { shipped0 = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "model-export", "pin.json"), "utf8")); } catch { shipped0 = null; }
const par = shipped0 && shipped0.parity, within = l => par && par.candidate && par.published
  && Math.abs(par.candidate[l].hits - par.published[l].hits) <= 1 && par.candidate[l].of === par.published[l].of;
check(!!shipped0 && shipped0.status === "passed" && shipped0.passGate === "taskFloor" && par.status === "pass" && within("en") && within("pl")
  && !("cosineMinimum" in shipped0) && !("cosineMinimum" in par),
  "m3b the committed pin passes by the task floor: top five within one of the published q4 on en and on pl, the cosine a proxy only: "
  + JSON.stringify(par && { candidate: par.candidate, published: par.published && { en: par.published.en, pl: par.published.pl } }));

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
function runtimeFor(platform) {
  if (!runtimeList || !Array.isArray(runtimeList.common) || !runtimeList.native) return [];
  const native = runtimeList.native[platform];
  return Array.isArray(native) ? runtimeList.common.concat(native) : [];
}
function runtimeFault(items) {
  for (const item of items) {
    const at = path.join(ROOT, "node_modules", ...item.name.split("/"));
    if (!fs.existsSync(at)) return item.name + " absent";
    const got = sha256(fs.readFileSync(at));
    if (got !== item.sha256) return item.name + " " + got.slice(0, 12);
  }
  return "";
}
const winListed = runtimeFor("win32");
const linListed = runtimeFor("linux");
const winFault = runtimeFault(winListed);
const linFault = runtimeFault(linListed);
const winNative = winListed.filter(item => item.name.includes("/win32/x64/"));
const linNative = linListed.filter(item => item.name.includes("/linux/x64/"));
const dropped = winListed.concat(linListed).some(item => /DirectML\.dll$|dxcompiler\.dll$/.test(item.name));
const winDirect = ["onnxruntime.dll", "onnxruntime_binding.node", "tokenizers.cjs"].every(part => winListed.some(item => item.name.endsWith(part)));
const linDirect = ["libonnxruntime.so.1", "onnxruntime_binding.node", "tokenizers.cjs"].every(part => linListed.some(item => item.name.endsWith(part)));
const crossed = winListed.some(item => item.name.includes("/linux/")) || linListed.some(item => item.name.includes("/win32/"));
check(winListed.length >= 4 && linListed.length >= 4 && !winFault && !linFault && winDirect && linDirect
    && winNative.length === 2 && linNative.length === 2 && !dropped && !crossed,
  "m7 the pinned Windows and linux-x64 runtimes match node_modules, each with its own native pair and the shared tokenizer, without DirectML: "
  + "win32 " + winListed.length + " linux " + linListed.length
  + (winFault ? " win " + winFault : "") + (linFault ? " linux " + linFault : ""));

const destMissingLinux = path.join(LAB, "dest-missing-linux");
const missingLinux = fs.existsSync(PACK) ? pack(["--dest", destMissingLinux, "--model", path.join(LAB, "no-such-linux"), "--platform", "linux"]) : { status: 127, stdout: "", stderr: "no packer" };
const shippedLinux = fs.existsSync(path.join(destMissingLinux, "model", "model_q4.onnx"));
check(missingLinux.status === 0 && (missingLinux.stdout || "").includes(WITHOUT) && !shippedLinux,
  "m4b a missing model on a Linux pack exits 0, says the desk ships without it, and packs no model file: exit " + missingLinux.status
  + " shipped=" + shippedLinux + " " + JSON.stringify((missingLinux.stdout || "").trim().slice(0, 160)));

const destWrongLinux = path.join(LAB, "dest-wrong-linux");
const wrongLinux = fs.existsSync(PACK) ? pack(["--dest", destWrongLinux, "--model", modelDir, "--pin", pinFile, "--platform", "linux"]) : { status: 127, stderr: "no packer" };
const acceptedLinux = fs.existsSync(path.join(destWrongLinux, "model", "model_q4.onnx"));
check(wrongLinux.status === 1 && /sha256|checksum/.test((wrongLinux.stderr || "") + (wrongLinux.stdout || "")) && !acceptedLinux,
  "m5e a Linux pack refuses a model file whose sha256 is wrong and does not copy it, as the Windows pack does: exit " + wrongLinux.status
  + " copied=" + acceptedLinux + " " + JSON.stringify(((wrongLinux.stderr || "") + (wrongLinux.stdout || "")).trim().slice(0, 180)));

const destLinux = path.join(LAB, "dest-linux");
let linuxLine = "";
try {
  const packed = await prepareEmbed({
    dest: destLinux,
    modelDir: readyModel,
    pin: JSON.parse(fs.readFileSync(readyPin, "utf8")),
    platform: "linux",
    log: () => {},
  });
  linuxLine = packed.included ? "included" : "absent";
} catch (error) { linuxLine = String((error && error.message) || error); }
const soAt = path.join(destLinux, "runtime", "node_modules", "onnxruntime-node", "bin", "napi-v6", "linux", "x64", "libonnxruntime.so.1");
const bindAt = path.join(destLinux, "runtime", "node_modules", "onnxruntime-node", "bin", "napi-v6", "linux", "x64", "onnxruntime_binding.node");
const dllAt = path.join(destLinux, "runtime", "node_modules", "onnxruntime-node", "bin", "napi-v6", "win32", "x64", "onnxruntime.dll");
const tokAt = path.join(destLinux, "runtime", "node_modules", "@huggingface", "tokenizers", "dist", "tokenizers.cjs");
const modelAt = path.join(destLinux, "model", "model_q4.onnx");
let soHash = "";
if (fs.existsSync(soAt)) soHash = sha256(fs.readFileSync(soAt));
const soPinned = linNative.find(item => item.name.endsWith("libonnxruntime.so.1"));
check(linuxLine === "included" && fs.existsSync(modelAt) && fs.existsSync(bindAt) && fs.existsSync(tokAt) && !fs.existsSync(dllAt)
    && !!soPinned && soHash === soPinned.sha256,
  "m8 a Linux pack copies the model, the tokenizer runtime and the linux-x64 pair, and not the Windows binaries: " + linuxLine
  + " so=" + soHash.slice(0, 12));

const shellMain = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const aiState = shellMain.indexOf('ipcMain.on("etiuda:ai-state"');
const aiBody = aiState < 0 ? "" : shellMain.slice(aiState, aiState + 280);
const readsEmbed = /const base = INSTALLED \? path\.join\(String\(process\.resourcesPath \|\| ""\), "embed"\) : "";/.test(shellMain);
check(readsEmbed && /model: !!\(embedSuggest && embedSuggest\.installed\(\)\)/.test(aiBody) && !/win32/.test(aiBody),
  "m10 an installed desk reads resources/embed on every platform, and the Settings switch follows whether that model is there");

const judgeDir = path.join(LAB, "pin-mismatch");
fs.mkdirSync(judgeDir);
fs.writeFileSync(path.join(judgeDir, "model_q4.onnx"), Buffer.from("nope"));
fs.writeFileSync(path.join(judgeDir, "model_q4.onnx_data"), Buffer.from("nope"));
const judged = fs.existsSync(EXPORT) ? py(["--pin-match", "--out", judgeDir]) : { status: 127, stderr: "no tool" };
check(judged.status === 1 && /model_q4\.onnx/.test(judged.stderr || "") && /sha256|bytes|absent/.test(judged.stderr || ""),
  "m2b export.py --pin-match refuses written bytes that are not the shell pin: exit " + judged.status
  + " " + JSON.stringify((judged.stderr || "").trim().slice(0, 200)));

const MAKE = path.join(ROOT, "tools", "model-export", "make.py");
const makeSelf = fs.existsSync(MAKE) ? spawnSync("python", [MAKE, "--self-test"], {
  encoding: "utf8", timeout: 30000, cwd: ROOT, windowsHide: true,
}) : { status: 127, stdout: "", stderr: "no make" };
const makeOut = (makeSelf.stdout || "") + (makeSelf.stderr || "");
check(fs.existsSync(MAKE) && makeSelf.status === 0 && /sha256 refused/.test(makeOut) && /pin refused/.test(makeOut) && /resume ok/.test(makeOut),
  "m9 make.py refuses a source file whose sha256 is wrong and a written model that misses the pin, and resumes a partial fetch: exit "
  + makeSelf.status + " " + JSON.stringify(makeOut.trim().slice(-240)));

try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the lab is under tmp */ }
console.log("#counts checks=" + checks + " failed=" + failed);
process.exit(Math.min(failed, 63));
