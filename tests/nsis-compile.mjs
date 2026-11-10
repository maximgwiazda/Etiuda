/* Compiles this tree's real NSIS installer and the uninstaller pass with the makensis
   electron-builder uses, warnings as errors, and that target's defines. It does not pack
   the app or run the executable. An optional .nsh path stands in for nsis.include. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const nodeRequire = createRequire(path.join(ROOT, "package.json"));

function sayFail(title, detail) {
  console.log("  FAIL " + title);
  const lines = String(detail || "").replace(/\r\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  const hits = lines.filter(l => /warning\s+\d+|treated as error|^Error:|^Error in|aborting|no files found|Invalid command/i.test(l));
  for (const line of (hits.length ? hits : lines.slice(-12))) console.log("     " + line);
}

function noVerdict() {
  console.log("no verdict: makensis is not on this machine");
  process.exit(78);
}

function standInScript() {
  const fromArg = process.argv[2];
  const given = fromArg && fromArg.toLowerCase().endsWith(".nsh") ? fromArg : process.env.ETIUDA_NSIS_SCRIPT;
  if (!given) return null;
  const abs = path.resolve(given);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    const err = new Error(abs);
    err.standIn = true;
    throw err;
  }
  return abs;
}

/* The real build runs the first executable so WriteUninstaller can emit the file the
   installer then includes. This leg never runs that executable, so a stand-in file
   satisfies File and the warnings still come from the compile. */
function writeStandIn(file, byte) {
  fs.writeFileSync(file, Buffer.alloc(64, byte));
}

async function main() {
  /* Load the package entry before the NSIS target. Requiring the target first makes
     LinuxPackager extend a PlatformPackager that has not been assigned yet. */
  nodeRequire("app-builder-lib");
  const { getMakeNsisPath } = nodeRequire("app-builder-lib/out/toolsets/windows");
  const { NsisTarget } = nodeRequire("app-builder-lib/out/targets/nsis/NsisTarget");
  const nsisUtil = nodeRequire("app-builder-lib/out/targets/nsis/nsisUtil");
  const { AppInfo } = nodeRequire("app-builder-lib/out/appInfo");
  const { PlatformPackager } = nodeRequire("app-builder-lib/out/platformPackager");
  const { Platform } = nodeRequire("app-builder-lib/out/core");
  const { Arch } = nodeRequire("builder-util");
  const { Lazy } = nodeRequire("lazy-val");
  const { normalizePackageData } = nodeRequire("app-builder-lib/out/util/normalizePackageData");
  const { applyNsisPatches, verifyNsisPatches } = nodeRequire(path.join(ROOT, "tools", "patch-nsis.cjs"));

  const cfg = nodeRequire(path.join(ROOT, "electron-builder.js"));
  const pkg = nodeRequire(path.join(ROOT, "package.json"));
  const version = (cfg.extraMetadata && cfg.extraMetadata.version) || pkg.version;
  const metadata = {
    name: pkg.name,
    version,
    description: pkg.description || "",
    author: pkg.author,
    homepage: pkg.homepage,
  };
  normalizePackageData(metadata);

  let located;
  try {
    located = await getMakeNsisPath(cfg.toolsets && cfg.toolsets.nsis, cfg.nsis && cfg.nsis.customNsisBinary);
  } catch (err) {
    noVerdict();
  }
  if (!located || !located.path || !fs.existsSync(located.path)) noVerdict();

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nsis-compile-"));
  let code = 0;
  try {
    const templates = path.join(work, "node_modules", "app-builder-lib", "templates", "nsis");
    fs.cpSync(nsisUtil.nsisTemplatesDir, templates, { recursive: true });
    applyNsisPatches(work);
    const patched = verifyNsisPatches(work);
    if (!patched.applied) throw new Error("NSIS template patches did not apply: " + JSON.stringify(patched));
    /* Relative includes resolve against makensis's working directory, which the
       target sets to its template dir. Point that at the patched copy so the shared
       modules stay untouched. */
    nsisUtil.nsisTemplatesDir = templates;

    /* The package writes turning.7z beside the script before makensis runs. Do that in a
       copy of the build resources, so the tree's own files stay as they are and a missing
       archive is not a false red. */
    const resourcesName = (cfg.directories && cfg.directories.buildResources) || "build";
    const sourceResources = path.resolve(ROOT, resourcesName);
    const buildResourcesDir = path.join(work, "resources");
    fs.cpSync(sourceResources, buildResourcesDir, { recursive: true });
    const turningTool = path.join(ROOT, "tools", "turning.mjs");
    if (fs.existsSync(turningTool)) {
      const { prepareTurning } = await import(pathToFileURL(turningTool).href);
      await prepareTurning(work, "resources");
    }
    const captured = { defines: null, commands: null };
    const info = {
      projectDir: ROOT,
      config: cfg,
      buildResourcesDir,
      metadata,
      devMetadata: {},
      cancellationToken: { cancelled: false },
      debugLogger: { isEnabled: false, add() {} },
      options: {
        effectiveOptionComputed: async (pair) => {
          captured.defines = pair[0];
          captured.commands = pair[1];
          return true;
        },
      },
      tempDirManager: {
        async getTempFile(opts) {
          const suffix = (opts && opts.suffix) || "";
          return path.join(work, "temp-" + crypto.randomBytes(4).toString("hex") + suffix);
        },
      },
      async emitArtifactBuildStarted() {},
    };
    const packager = Object.create(PlatformPackager.prototype);
    packager.info = info;
    packager.platform = Platform.WINDOWS;
    packager.platformSpecificBuildOptions = cfg.win || {};
    packager.appInfo = new AppInfo(info, null, packager.platformSpecificBuildOptions);
    packager._resourceList = new Lazy(() => readdir(buildResourcesDir).catch(() => []));
    const icon = cfg.win && cfg.win.icon;
    packager.getIconPath = async () => (icon ? path.resolve(ROOT, icon) : null);

    const payload = path.join(work, "app-payload.7z");
    writeStandIn(payload, 7);
    const packageHelper = {
      refCount: 0,
      async packArch() {
        const sha512 = crypto.createHash("sha512").update(fs.readFileSync(payload)).digest("base64");
        return { fileInfo: { path: payload, size: 64, sha512 }, unpackedSize: 1024 * 1024 };
      },
      async finishBuild() {},
    };

    const outDir = path.join(work, "out");
    fs.mkdirSync(outDir, { recursive: true });
    const target = new NsisTarget(packager, outDir, "nsis", packageHelper);
    /* warningsAsErrors defaults on. Keep it on even if a config turns it off: that is the bug. */
    target.options.warningsAsErrors = true;
    const standIn = standInScript();
    if (standIn) target.options.include = standIn;

    const appOut = path.join(work, "app-out");
    fs.mkdirSync(appOut, { recursive: true });
    await target.buildInstaller(new Map([[Arch.x64, appOut]]));
    if (!captured.defines || !captured.commands) {
      throw new Error("buildInstaller returned before the defines were captured");
    }

    const script = fs.readFileSync(path.join(nsisUtil.nsisTemplatesDir, "installer.nsi"), "utf8");
    const header = await target.computeCommonInstallerScriptHeader();
    const uninstallerFile = path.join(work, "uninstaller-stand-in.exe");
    writeStandIn(uninstallerFile, 1);

    const passes = [
      ["the uninstaller pass", false, Object.assign({}, captured.defines, {
        BUILD_UNINSTALLER: null,
        UNINSTALLER_OUT_FILE: uninstallerFile,
      })],
      ["the installer pass", true, Object.assign({}, captured.defines, {
        UNINSTALLER_OUT_FILE: uninstallerFile,
      })],
    ];
    let failures = 0;
    for (const [title, isInstaller, defines] of passes) {
      delete defines.BUILD_UNINSTALLER;
      if (!isInstaller) defines.BUILD_UNINSTALLER = null;
      const body = header + await target.computeFinalScript(script, isInstaller, new Map([[Arch.x64, appOut]]));
      try {
        await target.executeMakensis(defines, captured.commands, body);
        console.log("  ok   " + title + " compiles, warnings as errors");
      } catch (err) {
        failures += 1;
        sayFail(title, err && err.message ? err.message : err);
      }
    }
    console.log("#counts checks=2 failures=" + failures);
    if (failures) code = 1;
  } catch (err) {
    sayFail(err && err.standIn ? "the stand-in script is not a file" : "the compile", err && err.message ? err.message : err);
    code = 1;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (err) { /* the leg's own directory */ }
  }
  process.exit(code);
}

main();
