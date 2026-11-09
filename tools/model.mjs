/* Copies the built-in model into the folder the installer packs, or leaves that folder
 * without a model when the files are not on this machine. Nothing is fetched.
 *
 *   node tools/model.mjs --dest <dir> [--model <dir>] [--pin <file>] [--runtime <dir>]
 *       [--runtime-pin <file>] [--export-pin <file>]
 *
 * A missing model is a success: the desk ships with word suggestions and no AI row.
 * A file that is present and does not match the pin fails the build. The pin the desk
 * checks at load wins over the export's pin. A model that matches also copies the
 * third-party notice beside it.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const NOTICE_FILE = join(ROOT, "shell", "embed", "third-party.txt");
export const WITHOUT = "the desk ships without the built-in model, so suggestions stay on words and the AI row is absent";

export function shellPin() {
  return require(join(ROOT, "shell", "embed", "core.cjs")).MODEL_PIN;
}

export function sha256File(file) {
  return new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(file).on("error", fail).on("data", block => hash.update(block)).on("end", () => done(hash.digest("hex")));
  });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/* missing: the directory or every pinned name is absent. wrong: some pinned file is here and does not match.
   ready: every pinned file matches, size first and then sha256. */
export async function classify(modelDir, pin) {
  const files = pin && Array.isArray(pin.files) ? pin.files : [];
  if (!modelDir || !files.length || !existsSync(modelDir)) return { state: "missing", why: "absent", name: "" };
  const present = files.filter(file => existsSync(join(modelDir, file.name)));
  if (present.length === 0) return { state: "missing", why: "absent", name: "" };
  for (const file of files) {
    const at = join(modelDir, file.name);
    if (!existsSync(at)) return { state: "wrong", why: "absent", name: file.name };
    const info = statSync(at);
    if (!info.isFile() || info.size !== file.size) return { state: "wrong", why: "size", name: file.name, detail: info.size, want: file.size };
  }
  for (const file of files) {
    const got = await sha256File(join(modelDir, file.name));
    if (got !== file.sha256) return { state: "wrong", why: "checksum", name: file.name, detail: got, want: file.sha256 };
  }
  return { state: "ready", why: "", name: "" };
}

function faultLine(state) {
  if (state.why === "checksum") return state.name + " checksum is " + state.detail + ", not " + state.want;
  if (state.why === "size") return state.name + " is " + state.detail + " bytes, not " + state.want;
  return state.name + " is absent";
}

function emptyPack(dest) {
  mkdirSync(dest, { recursive: true });
  for (const sub of ["model", "runtime"]) {
    const at = join(dest, sub);
    if (existsSync(at)) rmSync(at, { recursive: true, force: true });
  }
}

async function copyChecked(from, to, sha256) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const got = await sha256File(to);
  if (got !== sha256) throw new Error(to + " checksum is " + got + " after copy, not " + sha256);
}

export async function prepareEmbed(opts) {
  const say = opts.log || (line => console.log("model: " + line));
  const pin = opts.pin || shellPin();
  const modelDir = opts.modelDir === undefined ? defaultModelDir() : opts.modelDir;
  const state = await classify(modelDir, pin);
  if (state.state === "missing") {
    emptyPack(opts.dest);
    say(WITHOUT);
    return { included: false, line: WITHOUT };
  }
  if (state.state === "wrong") {
    const exportPin = opts.exportPin || null;
    if (exportPin && Array.isArray(exportPin.files) && exportPin.files.length) {
      const other = await classify(modelDir, { files: exportPin.files });
      if (other.state === "ready") {
        throw new Error("the export pin and the shell pin disagree on " + state.name + "; the shell pin is what the desk checks at load");
      }
    }
    throw new Error(faultLine(state));
  }
  const runtimeFiles = opts.runtimeFiles || defaultRuntimeFiles();
  if (!runtimeFiles.length) throw new Error("the runtime pin lists no file");
  const runtimeDir = opts.runtimeDir || join(ROOT, "node_modules");
  /* Beside the weights, not one of them: the desk hashes the pin, and this file is the licence text. */
  const noticeFile = opts.noticeFile || NOTICE_FILE;
  if (!existsSync(noticeFile)) throw new Error("the third-party notice is absent");
  const noticeHash = await sha256File(noticeFile);
  emptyPack(opts.dest);
  for (const file of pin.files) {
    await copyChecked(join(modelDir, file.name), join(opts.dest, "model", file.name), file.sha256);
  }
  await copyChecked(noticeFile, join(opts.dest, "model", "third-party.txt"), noticeHash);
  for (const file of runtimeFiles) {
    await copyChecked(join(runtimeDir, file.name), join(opts.dest, "runtime", "node_modules", file.name), file.sha256);
  }
  const line = "the built-in model is packed, " + pin.files.length + " model file(s) and " + runtimeFiles.length + " runtime file(s)";
  say(line);
  return { included: true, line };
}

export function defaultModelDir() {
  if (process.env.ETIUDA_PACK_MODEL) return process.env.ETIUDA_PACK_MODEL;
  const local = join(ROOT, "embed-pack");
  return existsSync(local) ? local : null;
}

function defaultRuntimeFiles() {
  const file = join(ROOT, "tools", "model-runtime.json");
  if (!existsSync(file)) return [];
  const parsed = readJson(file);
  return Array.isArray(parsed.files) ? parsed.files : [];
}

function arg(argv, flag) {
  const at = argv.indexOf(flag);
  return at > -1 ? argv[at + 1] : undefined;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const argv = process.argv.slice(2);
  const dest = arg(argv, "--dest");
  if (!dest) {
    console.error("usage: node tools/model.mjs --dest <dir> [--model <dir>] [--pin <file>] [--runtime <dir>] [--runtime-pin <file>] [--export-pin <file>]");
    process.exit(2);
  }
  const pinFile = arg(argv, "--pin");
  const runtimePin = arg(argv, "--runtime-pin");
  const exportPin = arg(argv, "--export-pin");
  prepareEmbed({
    dest,
    modelDir: arg(argv, "--model"),
    pin: pinFile ? readJson(pinFile) : undefined,
    runtimeDir: arg(argv, "--runtime"),
    runtimeFiles: runtimePin ? readJson(runtimePin).files : undefined,
    exportPin: exportPin ? readJson(exportPin) : undefined,
  }).then(() => process.exit(0)).catch(error => {
    console.error("model: " + ((error && error.message) || error));
    process.exit(1);
  });
}
