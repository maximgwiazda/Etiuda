/* THE TEST SERVICE BUILD: ETIUDA_PACK_TEST_SERVICE names a sign-in lab file for one packaging command, and the package then signs in
 * against the service that file names, says so on every screen and in its name, and is refused by the release (tools/sellable.mjs).
 * Unset or empty, electron-builder.js's config is returned as it is and the package is the ordinary one, byte for byte. The file is
 * judged by the shell's own reader (shell/main.js signinLabRead, sliced from it here) and only the fields it takes travel, inside the
 * asar, as etiudaTestService in the packed package.json; no file goes beside the asar. tests/test-service.mjs drives every path here. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const TEST_SERVICE_VAR = "ETIUDA_PACK_TEST_SERVICE";
/* The packed package.json's key the shell reads (shell/main.js, the test service build); tests/test-service.mjs holds the two together. */
const TEST_SERVICE_KEY = "etiudaTestService";
/* A file of this name beside the asar is what an earlier shape packed; nothing reads it now, and the release still refuses it. */
const TEST_SERVICE_FILE = "test-service.json";
const SUFFIX = " Test Service";
const FILE_NAME = "Etiuda-Test-Service-${version}-Setup.${ext}";
const FIELDS = ["service", "root", "order", "clientIds", "provider"];

function given(env) { const v = env && env[TEST_SERVICE_VAR]; return typeof v === "string" ? v : ""; }
function line(present, service) { return "Test service: " + (present ? "present, " + service : "absent"); }

/* The shell's reader and the declarations it reaches, each sliced from shell/main.js by its first line, so the pack and the
   desk cannot disagree on what a lab file is. */
const READER = ["const SIGNIN_CLIENT =", "const SIGNIN_SECRET_SHAPE =", "const ORDER_PAGE_SHAPE =", "function signinLabAt(",
  "function signinLabService(", "function signinLabRead("];
function shellReader(mainText) {
  const src = String(mainText);
  const body = READER.map(start => {
    const at = src.indexOf("\n" + start);
    if (at < 0 || src.indexOf("\n" + start, at + 1) >= 0) throw new Error("test service: not in shell/main.js once: " + start);
    return /^const /.test(start) ? src.slice(at + 1, src.indexOf("\n", at + 1)) : src.slice(at + 1, src.indexOf("\n}", at + 1) + 2);
  }).join("\n");
  return new Function(body + "\nreturn signinLabRead;")();
}

/* The fields from a lab file's text: those the reader takes and nothing else. Throws, naming no value, where the reader refuses the
   file, where it carries a client secret, or where Google's secret (`secret`) is anywhere in what would be packed. */
function testServiceFields(labText, read, secret) {
  if (!read(labText)) throw new Error(TEST_SERVICE_VAR + " names a file the desk's sign-in lab reader refuses");
  const d = JSON.parse(String(labText)), out = {};
  for (const k of FIELDS) if (d[k] !== undefined) out[k] = d[k];
  if (out.provider && out.provider.clientSecret) throw new Error(TEST_SERVICE_VAR + " names a file whose provider carries a client secret, which no package holds this way");
  const text = JSON.stringify(out);
  if (typeof secret === "string" && secret && text.indexOf(secret) >= 0) throw new Error(TEST_SERVICE_VAR + " names a file holding Google's client secret"); /* plant:ts-secret */
  if (!read(text)) throw new Error("test service: the fields packed are not a file the reader takes");
  return out;
}
/* The fields the variable names, read from its file and judged by `root`'s shell/main.js. */
function fieldsFrom(env, root) {
  let text = "";
  try { text = fs.readFileSync(given(env), "utf8").replace(/^\uFEFF/, ""); } catch { throw new Error(TEST_SERVICE_VAR + " names no file that can be read"); }
  return testServiceFields(text, shellReader(fs.readFileSync(path.join(root, "shell", "main.js"), "utf8")), env.ETIUDA_GOOGLE_CLIENT_SECRET);
}

/* electron-builder.js's config, as the test service build where the variable is set; the same object where it is not. The fields
   join extraMetadata, so they are packed into the asar's package.json; the program keeps the shipped file name, so it installs over
   the ordinary app in its folder and keeps its data. */
function testServiceConfig(base, env, root) {
  if (!given(env)) return base; /* plant:ts-default */
  const name = base.productName + SUFFIX;
  return Object.assign({}, base, {
    productName: name, executableName: base.productName,
    extraMetadata: Object.assign({}, base.extraMetadata, { [TEST_SERVICE_KEY]: fieldsFrom(env, root) }),
    nsis: Object.assign({}, base.nsis, { artifactName: FILE_NAME, shortcutName: name, uninstallDisplayName: name }),
  });
}

/* Before packing: the one line saying which build this is. A Linux pack under the variable stops. */
function testServiceStep(env, root, plat) {
  if (!given(env)) return line(false);
  if (plat !== "win32") throw new Error(TEST_SERVICE_VAR + " is set, and the test service build is Windows only");
  return line(true, fieldsFrom(env, root).service);
}

/* The package.json packed in an asar, read from the archive's own header (a 16-byte prefix, the header's JSON, then the files), or
   null. tests/test-service.mjs holds it against @electron/asar's own packing. */
function asarPackage(asarFile) {
  let fd = null;
  try {
    fd = fs.openSync(asarFile, "r");
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12));
    fs.readSync(fd, json, 0, json.length, 16);
    const entry = JSON.parse(json.toString("utf8")).files["package.json"];
    if (!entry || entry.unpacked || !Number.isSafeInteger(entry.size)) return null;
    const body = Buffer.alloc(entry.size);
    fs.readSync(fd, body, 0, entry.size, 8 + head.readUInt32LE(4) + Number(entry.offset));
    return JSON.parse(body.toString("utf8"));
  } catch { return null; } finally { if (fd !== null) fs.closeSync(fd); }
}

/* After packing: the line read back from the package's own asar. */
function testServiceSummary(resourcesDir) {
  const pkg = asarPackage(path.join(resourcesDir, "app.asar")), d = pkg && pkg[TEST_SERVICE_KEY];
  return line(!!d, d && d.service);
}

module.exports = { TEST_SERVICE_VAR, TEST_SERVICE_KEY, TEST_SERVICE_FILE, SUFFIX, FILE_NAME, FIELDS, given, shellReader, testServiceFields,
  fieldsFrom, testServiceConfig, testServiceStep, asarPackage, testServiceSummary };
