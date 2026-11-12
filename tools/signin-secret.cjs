/* THE PACKAGE STEP FOR GOOGLE'S CLIENT SECRET (board 980). Google's forum reports its token address refusing a Desktop client's
 * code without client_secret, PKCE or not, so a package may carry the secret; this tree is public, so it never does.
 *
 *   ETIUDA_GOOGLE_CLIENT_SECRET   set for the one packaging command that wants it, never written into a file of this tree
 *
 * Set, the step writes {format: 1, google} to <output>/.signin/signin-secret.json, which electron-builder.js copies into the
 * package's resources beside the asar, and the shell reads it once at start (shell/main.js signinSecretRead). Unset or empty, it
 * writes nothing, takes away a file an earlier packaging left there, and the package is as it was before the secret existed. A
 * value not of a secret's shape stops the pack. Every line this prints says "present" or "absent" and never the value, and the
 * summary is read back from the packaged resources, so two packages are told apart without opening the secret.
 *
 * The output folder is dist/ (git-ignored) or ETIUDA_DIST, outside the tree. tests/desk-signin.mjs ds13f drives every path here.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const SIGNIN_SECRET_VAR = "ETIUDA_GOOGLE_CLIENT_SECRET";
/* The name and the shape the shell reads (shell/main.js SIGNIN_SECRET_FILE and SIGNIN_SECRET_SHAPE); ds13f holds the two together. */
const SIGNIN_SECRET_FILE = "signin-secret.json";
const SHAPE = /^[\x21-\x7e]{8,200}$/;

function signinSecretAt(output) { return path.resolve(output, ".signin", SIGNIN_SECRET_FILE); }
function given(env) { const v = env && env[SIGNIN_SECRET_VAR]; return typeof v === "string" ? v : ""; }
function line(present) { return "Google sign-in secret: " + (present ? "present" : "absent"); }

/* What electron-builder.js adds to each desk's extraResources: the file, only when the variable is set. */
function signinSecretResources(env, output) {
  return given(env) ? [{ from: signinSecretAt(output), to: SIGNIN_SECRET_FILE }] : [];
}

/* Before packing: the file written or taken away, and the one line saying which. Throws, naming no value, on a value of no
   secret's shape. */
function signinSecretStep(env, output) {
  const at = signinSecretAt(output), v = given(env);
  if (!v) {
    if (fs.existsSync(at)) fs.unlinkSync(at);
    return line(false);
  }
  if (!SHAPE.test(v)) throw new Error(SIGNIN_SECRET_VAR + " is set but is not a client secret's shape (8 to 200 printable characters, no space)");
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify({ format: 1, google: v }) + "\n");
  return line(true);
}

/* After packing: the line read back from the package's own resources folder. */
function signinSecretSummary(resourcesDir) {
  let d = null;
  try { d = JSON.parse(fs.readFileSync(path.join(resourcesDir, SIGNIN_SECRET_FILE), "utf8")); } catch { d = null; }
  return line(!!d && d.format === 1 && typeof d.google === "string" && SHAPE.test(d.google));
}

module.exports = { SIGNIN_SECRET_VAR, SIGNIN_SECRET_FILE, SHAPE, signinSecretAt, signinSecretResources, signinSecretStep, signinSecretSummary, given };
