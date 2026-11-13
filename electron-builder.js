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

// A Linux desktop takes PNGs by size, and every entry of the .ico already is one, so each is copied
// out byte for byte rather than redrawn or rescaled. Written before packing, only for --linux.
const LINUX_ICONS = path.resolve(output, ".linux-icons");
// THE SPELLING DICTIONARIES, fetched by hash into the output folder by tools/package-linux.mjs before
// packing (tools/dictionaries.mjs says why they are not in this tree), and copied whole into
// resources/dictionaries, outside the asar, where the shell finds them by process.resourcesPath.
const LINUX_DICTIONARIES = path.resolve(output, ".dictionaries");
// The built-in model and its runtime, outside the archive. tools/model.mjs fills this folder, or
// leaves it without a model when the files are not on the machine. Both desks copy it to resources/embed.
const EMBED = path.resolve(output, ".embed");
function linuxIcons() {
  const ico = fs.readFileSync(path.join(__dirname, "shell", "etiuda.ico"));
  fs.mkdirSync(LINUX_ICONS, { recursive: true });
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const at = 6 + 16 * i, size = ico[at] || 256, len = ico.readUInt32LE(at + 8), off = ico.readUInt32LE(at + 12);
    const png = ico.subarray(off, off + len);
    if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("etiuda.ico entry " + size + " is not a PNG");
    fs.writeFileSync(path.join(LINUX_ICONS, size + "x" + size + ".png"), png);
  }
}

// THE CARET HELPER (shell/caret.cs) is compiled for every Windows pack by the C# compiler Windows
// carries, into the output folder like the Linux icons, and goes beside the asar where the shell finds
// it. Without the compiler nothing is written and the pack carries no helper, which tools/package.mjs
// refuses for an installer. -noconfig keeps csc's default libraries out, Windows Forms among them.
const CARET = path.resolve(output, ".caret", "caret.exe");
function caretHelper() {
  const csc = path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (process.platform !== "win32" || !fs.existsSync(csc)) {
    console.log("caret helper: no C# compiler at " + csc + ", so none is built and the picker only copies");
    return;
  }
  fs.mkdirSync(path.dirname(CARET), { recursive: true });
  require("node:child_process").execFileSync(csc, ["-noconfig", "-nologo", "-optimize", "-target:winexe", "-platform:anycpu",
    "-r:System.dll", "-out:" + CARET, path.resolve(__dirname, "shell", "caret.cs")], { stdio: "inherit" });
}

// GOOGLE'S CLIENT SECRET (tools/signin-secret.cjs): copied into resources only when ETIUDA_GOOGLE_CLIENT_SECRET is set for the
// packaging command, written by beforePack below; unset, both desks' resources are as before. Its value is never in this tree.
const signinSecret = require("./tools/signin-secret.cjs");
const SIGNIN_SECRET = signinSecret.signinSecretResources(process.env, output);
// THE TEST SERVICE BUILD (tools/test-service.cjs): only where ETIUDA_PACK_TEST_SERVICE names a lab file for the packaging command.
const testService = require("./tools/test-service.cjs");
// THE SELLER'S ADDRESS (tools/seller-address.cjs): only where ETIUDA_PACK_SELLER_ADDRESS names its private file for the packaging command.
const sellerAddress = require("./tools/seller-address.cjs");

// THE SIGNING HOOK: one route or none, chosen by which variables are set. With none the block is
// absent and electron-builder packages unsigned, which SmartScreen warns about (spec 11.5). No route
// holds a secret here: a .pfx's password is WIN_CSC_KEY_PASSWORD, read by electron-builder itself so
// it stays out of a process listing; a token keeps its key and asks for its own PIN; Artifact
// Signing signs in through Azure's own credentials. Two routes at once, or half of one, refuses.
// ETIUDA_SIGN=esigner reads its account from the Windows keyring as it signs (tools/esigner.cjs).
const SIGN_TIMESTAMP = { signingHashAlgorithms: ["sha256"], rfc3161TimeStampServer: "http://timestamp.digicert.com" };
const ARTIFACT = { endpoint: "ETIUDA_SIGNING_ENDPOINT", codeSigningAccountName: "ETIUDA_SIGNING_ACCOUNT",
  certificateProfileName: "ETIUDA_SIGNING_PROFILE", publisherName: "ETIUDA_SIGNING_PUBLISHER" };
const given = name => process.env[name] || "";
const cert = given("ETIUDA_CERT"), sha1 = given("ETIUDA_CERT_SHA1"), subject = given("ETIUDA_CERT_SUBJECT");
const artifact = Object.values(ARTIFACT).filter(given);
const esigner = require("./tools/esigner.cjs");
const esignerKind = esigner.mode(process.env);
const routes = [cert && "ETIUDA_CERT", (sha1 || subject) && "ETIUDA_CERT_SHA1 or ETIUDA_CERT_SUBJECT",
  artifact.length && "ETIUDA_SIGNING_*", esignerKind && esigner.SIGN_VAR].filter(Boolean);
if (routes.length > 1) throw new Error("signing: " + routes.join(" and ") + " are set; set one route or none");
if (artifact.length && artifact.length < 4)
  throw new Error("signing: Artifact Signing needs " + Object.values(ARTIFACT).filter(n => !given(n)).join(", ") + " too");
const signing = cert ? { signtoolOptions: { certificateFile: cert, ...SIGN_TIMESTAMP } }
  : sha1 || subject ? { signtoolOptions: { ...(sha1 && { certificateSha1: sha1 }), ...(subject && { certificateSubjectName: subject }), ...SIGN_TIMESTAMP } }
  : artifact.length ? { azureSignOptions: Object.fromEntries(Object.entries(ARTIFACT).map(([key, name]) => [key, given(name)])) }
  : esigner.esignerSigning(process.env, __dirname, output) || {};

module.exports = sellerAddress.sellerConfig(testService.testServiceConfig({
  appId: "app.etiuda.desktop",
  // The display name: the Start menu entry, Add or remove programs, and the install folder.
  // Lowercase everywhere else in 2.x, capital here because it is the product's name on screen.
  productName: "Etiuda",
  copyright: "Copyright (c) 2026 Maxim Gwiazda",
  extraMetadata: { version },
  directories: { output, buildResources: "shell" },
  // An allowlist, the same discipline as .gitignore's blocklist in reverse: twenty-one files go in
  // and the src tree, the harness and the tools stay out of a customer's machine. The pin
  // travels with the artefact it describes, or the shell serves script-src 'none' and the
  // packaged app opens on a blank window. The last is the sample catalog the shell puts in the
  // catalog folder on a first run; it is content, and the only content this app ever ships. The two
  // under shell/relay/ are the relay's channel layer and its blob rules, which the shell requires only
  // for a team on the relay (board 900). The two under shell/folder/ are the folder mirror's syncer and
  // its worker, which the shell requires only for a team in a shared folder (board 945 stage 3 (b)).
  // The three under shell/embed/ run the embedded model, whose files sit beside the asar, not in it.
  files: ["package.json", "shell/main.js", "shell/preload.js", "shell/win-proxy.cjs", "shell/page-watch.cjs", "shell/clip-suggest.cjs", "shell/desk-ai.cjs", "shell/desk-reset.cjs", "shell/tray.cjs",
          "shell/relay/channel.cjs", "shell/relay/blob.cjs", "shell/folder/syncer.cjs", "shell/folder/syncer-worker.cjs",
          "shell/embed/suggest.cjs", "shell/embed/core.cjs", "shell/embed/worker.cjs",
          "engine/etiuda.html", "engine/etiuda.csp.json", "shell/sample-catalog.ec",
          // The tray's PNG, which Linux reads where it reads an .ico as empty (board 973). In the root list, not a
          // linux-level `files`, so it can never stand in for the root list.
          "shell/etiuda-tray.png",
          // The tray's picture on Windows, read from the asar at run time; the installer's and the exe's icon
          // (`icon:` below) is a build input and never reaches the asar by itself (Max's finding, 2026-11-09).
          "shell/etiuda.ico"],
  asar: true,
  // THE FUSES, flipped in the binary before signing. Off: running the executable as plain Node,
  // NODE_OPTIONS, and --inspect, none of which the shell or the harness uses. On: the app is read
  // from app.asar alone, and cookies on disk are encrypted with the system's key (DPAPI on Windows), one way
  // only, since a store written so does not read with the fuse off. Asar integrity stays off while
  // tests/shell-smoke.js rewrites the asar in place for its variants; the file protocol keeps its extra
  // privileges, since the engine is served from file:// and nothing has been measured without them.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true, /* plant:fuse-cookie */
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
    description: "Etiuda catalog file",
    icon: "shell/etiuda.ico",
    role: "Editor",
  }],
  // THE etiuda: LINK. electron-builder writes the scheme into the macOS and AppX manifests.
  // It does not register a URL protocol in the Windows installer; the desk checks
  // app.setAsDefaultProtocolClient at start (shell/main.js). On Ubuntu the same list is what
  // puts MimeType=x-scheme-handler/etiuda; on the desktop entry, after the catalog's own type.
  protocols: [{ name: "Etiuda", schemes: ["etiuda"] }], /* plant:link-protocols */
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // Generated, not drawn here: the family's app icon, whose build renders every
    // entry from the vector at its own size. The bare mark on transparent rather than the tile,
    // because a tile suits a phone and this is a desktop icon. Copied in, never edited in place.
    icon: "shell/etiuda.ico",
    // THE GROUP POLICY TEMPLATE goes beside the program as it stands, resources/policy holding etiuda.admx and its
    // en-US and pl-PL etiuda.adml, so an administrator who installs a desk has the template that pins its team folder
    // and its lead's key (sense pass finding 17; tests/join-policy.mjs 19i). Windows only: no other system reads it.
    // The caret helper as a folder of one, not as the file: electron-builder signs what it copies out of a folder and
    // copies a lone file unsigned (tests/sign-all.mjs 1c).
    extraResources: [
      { from: path.dirname(CARET), to: ".", filter: [path.basename(CARET)] }, /* plant:sign-caret */
      { from: "shell/policy", to: "policy" }, { from: EMBED, to: "embed" }, ...SIGNIN_SECRET],
    // EVERY LIBRARY SIGNED AS THE PROGRAMS ARE: Electron's DLLs beside the exe and the model's runtime, a DLL and a Node
    // addon, each of which a publisher rule judges on its own (tests/sign-all.mjs); afterExtract below spares one its maker signed.
    signExts: [".dll", ".node"], /* plant:sign-exts */
    ...signing,
  },
  // THE LICENCE PAGE IS FOUND BY NAME rather than named here: electron-builder shows one when
  // buildResources holds license_<lang>.txt, choosing the file by the language the installer is
  // running in and falling back to the English for the rest. Its `license` option takes ONE file,
  // so a localised pair cannot be named, and a rename would drop the page in silence; tests/test.js
  // holds the two names instead. The files carry a BOM already, or the build writes one into them.
  // THE UBUNTU DESK, a .deb and an AppImage (board 633). Nothing here reaches the Windows build:
  // electron-builder reads this block only for --linux. The association is added here rather than
  // above because only a Linux desktop wants a MIME type, and electron-builder concatenates the two
  // lists. tools/package-linux.mjs builds these and refuses a package missing any of them.
  linux: {
    target: [{ target: "deb", arch: ["x64"] }, { target: "AppImage", arch: ["x64"] }],
    executableName: "etiuda",
    icon: LINUX_ICONS,
    category: "Office",
    maintainer: "Maxim Gwiazda",
    synopsis: require("./package.json").description,
    // No updater, as on Windows: without this the build writes app-update.yml and latest-linux.yml.
    publish: null,
    fileAssociations: [{ ext: "ec", name: "Etiuda catalog", description: "Etiuda catalog file",
      mimeType: "application/x-etiuda-catalog" }],
    // The class the window is measured to carry (tests/linux-desk.js 5a), so a dock groups it under this entry.
    // The scheme joins this entry from protocols above: MimeType=x-scheme-handler/etiuda;
    desktop: { entry: { StartupWMClass: "etiuda" } },
    // Dictionaries are Linux only: Windows checks spelling with its own checker and fetches nothing (shell/main.js).
    // The model folder is the one the Windows block copies. The shell reads resources/embed once installed.
    extraResources: [{ from: LINUX_DICTIONARIES, to: "dictionaries" }, { from: EMBED, to: "embed" }, ...SIGNIN_SECRET],
  },
  // A FILE ITS MAKER SIGNED KEEPS THAT SIGNATURE: the packager's one signing door is narrowed before anything is copied or
  // signed (tools/sellable.mjs keepMakersSignatures), whichever route signs.
  afterExtract: async context => {
    if (context.electronPlatformName !== "win32") return;
    (await import(require("node:url").pathToFileURL(path.join(__dirname, "tools", "sellable.mjs")).href)).keepMakersSignatures(context.packager);
  },
  beforePack: async context => {
    const plat = context.electronPlatformName;
    if (plat === "linux") linuxIcons();
    if (plat === "win32") {
      caretHelper();
      const { applyNsisPatches, verifyNsisPatches } = await import("./tools/patch-nsis.mjs");
      applyNsisPatches();
      const status = verifyNsisPatches();
      if (!status.applied) throw new Error("NSIS template patches not applied: " + JSON.stringify(status));
    }
    if (plat === "linux" || plat === "win32") {
      console.log(signinSecret.signinSecretStep(process.env, output));
      console.log(testService.testServiceStep(process.env, __dirname, plat));
      console.log(sellerAddress.sellerStep(process.env, module.exports.directories.buildResources));
      const { prepareEmbed } = await import("./tools/model.mjs");
      await prepareEmbed({ dest: EMBED, platform: plat === "linux" ? "linux" : "win32" });
    }
  },
  // THE NSIS THAT COMPILES THE INSTALLER. Without this key electron-builder 26 uses its legacy NSIS 3.04, whose stub,
  // written into every installer and uninstaller, lets a standard user on the machine become SYSTEM while either runs as
  // SYSTEM (CVE-2023-37378, CVE-2025-43715, CVE-2026-42171). "1.2.1" is app-builder-lib's bundle of NSIS 3.12, the first
  // release with all three fixed, its makensis, plug-ins and stubs in one archive pinned by SHA-256 in app-builder-lib.
  // tests/install-plan-selftest.js 15a reads the pin, tests/nsis-compile.mjs the version the compiler prints.
  toolsets: { nsis: "1.2.1" },
  deb: { artifactName: "etiuda_${version}_amd64.${ext}" },
  appImage: { artifactName: "etiuda-${version}-x86_64.${ext}" },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Two things electron-builder's own script does not do: write InstallLocation on the uninstall
    // key, and take back the copy of the installer it caches for an updater this product does not
    // have. Named rather than left to the buildResources convention, so a move fails the build.
    include: "installer.nsh",
    // Frame 0 of the turning sidebar and header. The uninstaller's sidebar is the same still.
    // No icon key is set in this block.
    installerSidebar: "installer/installerSidebar.bmp",
    uninstallerSidebar: "installer/installerSidebar.bmp",
    installerHeader: "installer/installerHeader.bmp",
    artifactName: "etiuda-${version}-setup.${ext}",
    shortcutName: "Etiuda",
    uninstallDisplayName: "Etiuda",
    // NO elevate.exe IN THE INSTALL. electron-builder copies it to resources\ for electron-updater's per-machine updates,
    // and this product has no electron-updater; the all-users route elevates through the UAC plug-in, and the per-user
    // copy's uninstaller runs through UAC_AsUser_Call (shell/installer.nsh). perMachine true would override this.
    packElevateHelper: false,
  },
}, process.env, __dirname), process.env, __dirname, output);
