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

// THE SIGNING HOOK. Absent a certificate the whole block is absent, and electron-builder then
// packages unsigned rather than failing. Point ETIUDA_CERT at a .pfx and give the password in
// WIN_CSC_KEY_PASSWORD, which electron-builder reads itself; naming it here would put the
// password in a process listing. Until then Windows SmartScreen warns on first run, which is
// the defect spec 11.5 names and the reason this hook is left ready.
const cert = process.env.ETIUDA_CERT || "";
const signing = cert ? {
  signtoolOptions: {
    certificateFile: cert,
    signingHashAlgorithms: ["sha256"],
    rfc3161TimeStampServer: "http://timestamp.digicert.com",
  },
} : {};

module.exports = {
  appId: "app.etiuda.desktop",
  // The display name: the Start menu entry, Add or remove programs, and the install folder.
  // Lowercase everywhere else in 2.x, capital here because it is the product's name on screen.
  productName: "Etiuda",
  copyright: "Copyright (c) 2026 Maxim Gwiazda",
  extraMetadata: { version },
  directories: { output, buildResources: "shell" },
  // An allowlist, the same discipline as .gitignore's blocklist in reverse: five files go in
  // and the src tree, the harness and the tools stay out of a customer's machine. The pin
  // travels with the artefact it describes, or the shell serves script-src 'none' and the
  // packaged app opens on a blank window.
  files: ["package.json", "shell/main.js", "shell/preload.js", "engine/etiuda.html", "engine/etiuda.csp.json"],
  asar: true,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "shell/etiuda.ico",
    ...signing,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "etiuda-${version}-setup.${ext}",
    shortcutName: "Etiuda",
    uninstallDisplayName: "Etiuda",
  },
};
