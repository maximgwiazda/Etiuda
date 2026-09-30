// Packaging: the shell and one built engine file become a Windows installer.
//
//   npm run package        the installer, into dist/ or $ETIUDA_DIST
//   npm run package:dir    the unpacked app only, no installer, for a quick look
//
// electron-builder finds this file by name. It is CommonJS because package.json declares no
// module type, and a .js config rather than a .yml one because two values have to be read
// rather than written: the version, and where the output goes.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// E_VERSION is the one source of truth for the version, so the installer reads it rather than
// carrying a second copy that can disagree. package.json stays at 0.0.0, which is the app's
// identity in npm terms and is not what anybody sees.
const env = fs.readFileSync(path.join(__dirname, "src", "modules", "env.js"), "utf8");
const found = env.match(/E_VERSION\s*=\s*"([^"]+)"/);
if (!found) throw new Error("E_VERSION not found in src/modules/env.js");
const version = found[1];

// An absolute path is local to one machine and this repository is public, so the default is
// dist/, which .gitignore already holds back, and a build elsewhere sets ETIUDA_DIST.
const output = process.env.ETIUDA_DIST || "dist";

// THE SIGNING HOOK: one route or none, chosen by which variables are set. With none the block is
// absent and electron-builder packages unsigned, which SmartScreen warns about (spec 11.5). No route
// holds a secret here: a .pfx's password is WIN_CSC_KEY_PASSWORD, read by electron-builder itself so
// it stays out of a process listing; a token keeps its key and asks for its own PIN; Artifact
// Signing signs in through Azure's own credentials. Two routes at once, or half of one, refuses.
const SIGN_TIMESTAMP = { signingHashAlgorithms: ["sha256"], rfc3161TimeStampServer: "http://timestamp.digicert.com" };
const ARTIFACT = { endpoint: "ETIUDA_SIGNING_ENDPOINT", codeSigningAccountName: "ETIUDA_SIGNING_ACCOUNT",
  certificateProfileName: "ETIUDA_SIGNING_PROFILE", publisherName: "ETIUDA_SIGNING_PUBLISHER" };
const given = name => process.env[name] || "";
const cert = given("ETIUDA_CERT"), sha1 = given("ETIUDA_CERT_SHA1"), subject = given("ETIUDA_CERT_SUBJECT");
const artifact = Object.values(ARTIFACT).filter(given);
const routes = [cert && "ETIUDA_CERT", (sha1 || subject) && "ETIUDA_CERT_SHA1 or ETIUDA_CERT_SUBJECT",
  artifact.length && "ETIUDA_SIGNING_*"].filter(Boolean);
if (routes.length > 1) throw new Error("signing: " + routes.join(" and ") + " are set; set one route or none");
if (artifact.length && artifact.length < 4)
  throw new Error("signing: Artifact Signing needs " + Object.values(ARTIFACT).filter(n => !given(n)).join(", ") + " too");
const signing = cert ? { signtoolOptions: { certificateFile: cert, ...SIGN_TIMESTAMP } }
  : sha1 || subject ? { signtoolOptions: { ...(sha1 && { certificateSha1: sha1 }), ...(subject && { certificateSubjectName: subject }), ...SIGN_TIMESTAMP } }
  : artifact.length ? { azureSignOptions: Object.fromEntries(Object.entries(ARTIFACT).map(([key, name]) => [key, given(name)])) }
  : {};

module.exports = {
  appId: "app.etiuda.desktop",
  // The display name: the Start menu entry, Add or remove programs, and the install folder.
  // Lowercase everywhere else in 2.x, capital here because it is the product's name on screen.
  productName: "Etiuda",
  copyright: "Copyright (c) 2026 Maxim Gwiazda",
  extraMetadata: { version },
  directories: { output, buildResources: "shell" },
  // An allowlist, the same discipline as .gitignore's blocklist in reverse: six files go in
  // and the src tree, the harness and the tools stay out of a customer's machine. The pin
  // travels with the artefact it describes, or the shell serves script-src 'none' and the
  // packaged app opens on a blank window. The sixth is the sample catalog the shell puts in the
  // catalog folder on a first run; it is content, and the only content this app ever ships.
  files: ["package.json", "shell/main.js", "shell/preload.js", "engine/etiuda.html", "engine/etiuda.csp.json",
          "shell/sample-catalog.ec"],
  asar: true,
  // THE FUSES, flipped in the binary before signing. Off: running the executable as plain Node,
  // NODE_OPTIONS, and --inspect, none of which the shell or the harness uses. On: the app is read
  // from app.asar alone. Asar integrity stays off while tests/shell-smoke.js rewrites the asar in
  // place for its variants; the file protocol keeps its extra privileges, since the engine is
  // served from file:// and nothing has been measured without them.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: false,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: true,
  },
  // THE .ec ASSOCIATION, so a catalog is a document a person can double-click. The app's own icon
  // rather than a second drawing: a catalog is Etiuda's document, and two pictures are two things
  // to keep in step. perMachine is false below, so NSIS writes this under HKCU and the uninstaller
  // takes it away again.
  fileAssociations: [{
    ext: "ec",
    name: "Etiuda catalog",
    description: "Etiuda catalog",
    icon: "shell/etiuda.ico",
    role: "Editor",
  }],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // Generated, not drawn here: the family's app icon, whose build renders every
    // entry from the vector at its own size. The bare mark on transparent rather than the tile,
    // because a tile suits a phone and this is a desktop icon. Copied in, never edited in place.
    icon: "shell/etiuda.ico",
    ...signing,
  },
  // THE LICENCE PAGE IS FOUND BY NAME rather than named here: electron-builder shows one when
  // buildResources holds license_<lang>.txt, choosing the file by the language the installer is
  // running in and falling back to the English for the rest. Its `license` option takes ONE file,
  // so a localised pair cannot be named, and a rename would drop the page in silence; tests/test.js
  // holds the two names instead. The files carry a BOM already, or the build writes one into them.
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Two things electron-builder's own script does not do: write InstallLocation on the uninstall
    // key, and take back the copy of the installer it caches for an updater this product does not
    // have. Named rather than left to the buildResources convention, so a move fails the build.
    include: "installer.nsh",
    artifactName: "etiuda-${version}-setup.${ext}",
    shortcutName: "Etiuda",
    uninstallDisplayName: "Etiuda",
  },
};
