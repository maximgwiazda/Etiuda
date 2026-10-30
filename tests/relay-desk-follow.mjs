/* BOARD 945 STAGE 3 (a): A SHARED-FOLDER DESK FOLLOWS ITS TEAM TO THE RELAY
 *
 *   node tests/relay-desk-follow.mjs
 *
 * Driven through the app's own whenReady path with a stubbed electron and mocked relay channel,
 * as tests/catalog-trust-desk.mjs is.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const REAL_CHANNEL = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));

const BUILTIN_RELAY = "https://etiuda.dev/relay/v1";

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
  decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
};

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function branchIdOfKey(pubHex) {
  return "k-" + sha256Hex(Buffer.from(pubHex, "hex")).slice(0, 16);
}

function keyPair() {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  return { keyId: branchIdOfKey(pub), public: pub, privateKey: p.privateKey };
}

function boxPair() {
  const p = crypto.generateKeyPairSync("x25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  return { public: pub, privateKey: p.privateKey };
}

function signTeamDoc(doc, lead) {
  const o = JSON.parse(JSON.stringify(doc));
  o.sig = { alg: "Ed25519", keyId: lead.keyId };
  o.sig.value = crypto.sign(null, REAL_CHANNEL.signedBytes(o), lead.privateKey).toString("hex");
  return o;
}

function signAskDoc(doc, lead) {
  const o = JSON.parse(JSON.stringify(doc));
  o.sig = { alg: "Ed25519", keyId: lead.keyId };
  const bytes = Buffer.concat([Buffer.from("etiuda-catalog-ask\n", "utf8"), REAL_CHANNEL.signedBytes(o)]);
  o.sig.value = crypto.sign(null, bytes, lead.privateKey).toString("hex");
  return o;
}

const noop = () => {};
function makePolicyExport(folder, leadHex) {
  const normFolder = folder.replace(/\//g, "\\");
  const lines = [
    "Windows Registry Editor Version 5.00",
    "",
    "[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]",
    `"TeamFolder"="${normFolder.replace(/\\/g, "\\\\")}"`,
    `"LeadKey"="${leadHex}"`,
    "",
  ];
  const utf16 = Buffer.from(lines.join("\r\n"), "utf16le");
  return Buffer.concat([Buffer.from([0xff, 0xfe]), utf16]);
}

const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });

/* ================================================================================================
   ONE LAUNCH: shell/main.js loaded with stubbed electron, watched fs and mock relay channel,
   started through app.whenReady().
   ================================================================================================ */
async function launch(plan) {
  const LAB = plan.lab;
  const UD = path.join(LAB, "userdata");
  const SHELL = path.join(LAB, "shell");
  const DOCS = path.join(LAB, "documents");
  const SHARED = plan.sharedFolder;
  const MIRROR = plan.mirrorFolder;
  const ownId = plan.ownDeskId;

  let whenReadyResolve = noop;
  const whenReadyPromise = new Promise(r => { whenReadyResolve = r; });
  const onHandlers = {}, invokeHandlers = {};
  const openedDirs = [];
  const said = [];

  const pageWin = {
    isDestroyed: () => false,
    isMaximized: () => false,
    isMinimized: () => false,
    setBounds: noop,
    getBounds: () => ({ x: 0, y: 0, width: 1024, height: 720 }),
    show: noop,
    showInactive: noop,
    maximize: noop,
    focus: noop,
    loadFile: noop,
    close: noop,
    on: noop,
    once: noop,
    webContents: {
      id: 1,
      once: noop,
      on: noop,
      send: noop,
      setWindowOpenHandler: noop,
      getZoomLevel: () => 0,
      setZoomLevel: noop,
      getURL: () => "file:///etiuda.html",
      reload: noop,
    },
  };

  const electron = {
    app: {
      getPath: name => {
        if (name === "userData") return UD;
        if (name === "documents") return DOCS;
        return LAB;
      },
      setPath: noop,
      requestSingleInstanceLock: () => true,
      quit: noop,
      on: noop,
      getVersion: () => "0.0.0",
      whenReady: () => whenReadyPromise,
      isPackaged: false,
      commandLine: { appendSwitch: noop },
    },
    ipcMain: {
      on: (ch, fn) => { onHandlers[ch] = fn; },
      handle: (ch, fn) => { invokeHandlers[ch] = fn; },
    },
    shell: {
      openPath: async dir => {
        openedDirs.push(dir);
        return "";
      },
    },
    BrowserWindow: Object.assign(function () { return pageWin; }, {
      fromWebContents: () => pageWin,
      getAllWindows: () => [pageWin],
    }),
    Menu: inert,
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    net: inert,
    protocol: inert,
    session: inert,
    screen: inert,
    systemPreferences: inert,
    nativeTheme: { themeSource: "system" },
    powerMonitor: { on: noop },
    globalShortcut: inert,
    safeStorage,
  };

  let createdChannel = null;
  const mockRelay = {
    pathKey: REAL_CHANNEL.pathKey,
    createChannel: opts => {
      createdChannel = {
        opts,
        started: false,
        kicked: false,
        start() { this.started = true; },
        stop: async () => {},
        kick() { this.kicked = true; },
        online: () => true,
        program: {
          state: () => ({ sent: {}, refused: {}, pending: [] }),
        },
      };
      return createdChannel;
    },
  };

  const activeWatches = new Set();
  const watchedFs = Object.assign({}, fs, {
    watch: (target, ...args) => {
      const norm = path.resolve(target);
      activeWatches.add(norm);
      const w = fs.watch(target, ...args);
      const origClose = w.close.bind(w);
      w.close = () => {
        activeWatches.delete(norm);
        return origClose();
      };
      return w;
    },
  });

  const quiet = {
    log: s => said.push(String(s)),
    error: s => said.push("ERR " + String(s)),
    warn: noop,
    info: noop,
  };

  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const mainSrc = plan.scratchMainSource || fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");

  const mockCp = {
    execFile: nodeRequire("node:child_process").execFile,
    execFileSync: (file, args, opts) => {
      if (args && args[0] === "export" && args[1] === "HKLM\\SOFTWARE\\Policies\\Etiuda" && plan.policyFolder) {
        fs.writeFileSync(args[2], makePolicyExport(plan.policyFolder, plan.policyLead || "00".repeat(32)));
        return Buffer.alloc(0);
      }
      return nodeRequire("node:child_process").execFileSync(file, args, opts);
    },
  };

  const beside = n => {
    if (typeof n === "string" && path.isAbsolute(n) && (n === SHELL || n.startsWith(SHELL + path.sep))) {
      return path.join(ROOT, "shell", path.relative(SHELL, n));
    }
    return n;
  };

  new Function("require", "__dirname", "__filename", "module", "exports", "console", mainSrc)(
    n => {
      if (n === "electron") return electron;
      if (n === "node:fs" || n === "fs") return watchedFs;
      if (n === "node:child_process" || n === "child_process") return mockCp;
      if (typeof n === "string" && n.endsWith(path.join("relay", "channel.cjs"))) return mockRelay;
      return nodeRequire(beside(n));
    },
    SHELL,
    path.join(SHELL, "main.js"),
    { exports: {} },
    {},
    quiet
  );

  whenReadyResolve();
  await new Promise(r => setTimeout(r, 300));

  const FRAME = { parent: null, url: "file:///C:/engine/etiuda.html" };
  const ev = { sender: pageWin.webContents, senderFrame: FRAME };

  if (plan.holdBranch && invokeHandlers["etiuda:branch-write"]) {
    const blockDir = path.join(SHARED, "desks", ownId, plan.holdBranch.stem + ".ec");
    fs.mkdirSync(blockDir, { recursive: true });
    try {
      await invokeHandlers["etiuda:branch-write"](ev, plan.holdBranch.stem, plan.holdBranch.text);
    } finally {
      try { fs.rmdirSync(blockDir); } catch {}
    }
  }

  if (plan.triggerTeamMove && invokeHandlers["etiuda:team-join"]) {
    await invokeHandlers["etiuda:team-join"](ev, "leads");
    await new Promise(r => setTimeout(r, 300));
  }

  if (invokeHandlers["etiuda:open-catalog-folder"]) {
    await invokeHandlers["etiuda:open-catalog-folder"](ev);
  }

  const normShared = path.resolve(SHARED);
  const normMirror = path.resolve(MIRROR);
  const mirrorDeskDir = path.join(MIRROR, "desks", ownId);

  let mirrorFiles = [];
  try { mirrorFiles = fs.readdirSync(mirrorDeskDir); } catch {}

  const res = {
    openedDir: openedDirs[openedDirs.length - 1] || "",
    activeWatches: Array.from(activeWatches),
    sharedWatched: activeWatches.has(normShared),
    mirrorWatched: activeWatches.has(normMirror),
    channelCreated: !!createdChannel,
    channelStarted: !!(createdChannel && createdChannel.started),
    channelMirror: createdChannel && createdChannel.opts ? createdChannel.opts.mirror : "",
    mirrorFiles,
    mirrorMarks: mirrorFiles.reduce((o, f) => {
      try { const d = JSON.parse(fs.readFileSync(path.join(mirrorDeskDir, f), "utf8")); o[f] = { rev: d.rev, from: d.from }; } catch {}
      return o;
    }, {}),
    branchReachable: mirrorFiles.includes("branch-lamp.ec"),
    inUseReachable: mirrorFiles.includes("in-use.ec"),
    answerSurvived: mirrorFiles.includes("catalog-answer.ec"),
    heldBranchReached: plan.holdBranch ? mirrorFiles.includes(plan.holdBranch.stem + ".ec") : false,
    said,
  };

  return res;
}

/* ================================================================================================
   SCENARIOS SETUP
   ================================================================================================ */
function makeScenario(kind, extra = {}) {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "follow-desk-"));
  const ud = path.join(lab, "userdata");
  const catalogs = path.join(lab, "catalogs");
  const docs = path.join(lab, "documents");
  const shell = path.join(lab, "shell");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(catalogs, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(shell, { recursive: true });

  const lead = keyPair();
  const ownDesk = keyPair();
  const ownBox = boxPair();
  const stranger = keyPair();
  const teamId = "t-" + crypto.randomBytes(8).toString("hex");
  const rt = crypto.randomBytes(16).toString("hex");
  const teamKey = crypto.randomBytes(32);

  const ownDesksFolder = path.join(catalogs, "desks", ownDesk.keyId);
  fs.mkdirSync(ownDesksFolder, { recursive: true });

  const branchBytes = Buffer.from(JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "lamp", rev: 1 }));
  fs.writeFileSync(path.join(ownDesksFolder, "branch-lamp.ec"), branchBytes);

  const inUseDoc = { format: 1, kind: "etiuda-in-use", desk: { id: ownDesk.keyId } };
  fs.writeFileSync(path.join(ownDesksFolder, "in-use.ec"), JSON.stringify(inUseDoc));

  const ansDoc = { format: 1, kind: "etiuda-catalog-answer", catalog: { id: "lamp" } };
  fs.writeFileSync(path.join(ownDesksFolder, "catalog-answer.ec"), JSON.stringify(ansDoc));

  const askDoc = signAskDoc({
    desk: ownDesk.keyId,
    expires: new Date(Date.now() + 86400000).toISOString(),
    format: 1,
    id: "ask1",
    kind: "etiuda-catalog-ask",
    sha256: "sha256:" + "a".repeat(64),
  }, lead);
  fs.mkdirSync(path.join(catalogs, "catalog-asks"), { recursive: true });
  fs.writeFileSync(path.join(catalogs, "catalog-asks", ownDesk.keyId + ".json"), JSON.stringify(askDoc));

  const initialTeamDoc = {
    format: 1,
    kind: "etiuda-team",
    id: teamId,
    catalogs: ["lamp"],
    lead: { keyId: lead.keyId, public: lead.public },
    sealed: true,
    exportsSealed: false,
    epoch: 1,
    rev: 1,
    channel: { kind: "folder" },
    ring: { format: 1, kind: "etiuda-ring", keys: [{ catalog: "lamp", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] },
    roster: [{ desk: { id: ownDesk.keyId, key: ownDesk.public, box: ownBox.public } }],
  };

  const movedTeamDoc = JSON.parse(JSON.stringify(initialTeamDoc));
  movedTeamDoc.rev = 2;
  const relayUrl = extra.url !== undefined ? extra.url : BUILTIN_RELAY;
  movedTeamDoc.channel = { kind: "relay", rt, url: relayUrl };

  if (extra.notOnRoster) {
    movedTeamDoc.roster = [{ desk: { id: stranger.keyId, key: stranger.public, box: boxPair().public } }];
  }

  const teamDocToWrite = extra.movedAtStart ? movedTeamDoc : initialTeamDoc;
  fs.writeFileSync(path.join(catalogs, "etiuda-team.json"), JSON.stringify(signTeamDoc(teamDocToWrite, lead), null, 2));

  const env = {
    kind: "etiuda-desk",
    schema: 1,
    keys: {
      eCatalogFolder: catalogs,
      eUiLang: "en",
    },
    branch: {
      sign: {
        pub: ownDesk.public,
        priv: safeStorage.encryptString(ownDesk.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")).toString("base64"),
      },
      box: {
        pub: ownBox.public,
        priv: safeStorage.encryptString(ownBox.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")).toString("base64"),
      },
    },
    teamPins: {
      [teamId]: { keyId: lead.keyId, public: lead.public },
    },
    teamKeys: {
      [teamId]: { 1: safeStorage.encryptString(teamKey.toString("base64")).toString("base64") },
    },
  };

  if (extra.policyFolder) {
    fs.mkdirSync(extra.policyFolder, { recursive: true });
  }

  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env, null, 2));

  const mirror = path.join(ud, "relay", rt);

  /* Files a desk that was on the relay before already holds in the mirror, and the folder's copies beside them. */
  if (extra.mirrorHolds) {
    const held = path.join(mirror, "desks", ownDesk.keyId);
    fs.mkdirSync(held, { recursive: true });
    for (const [name, doc] of Object.entries(extra.mirrorHolds)) fs.writeFileSync(path.join(held, name), JSON.stringify(doc));
  }
  if (extra.folderHolds) {
    for (const [name, doc] of Object.entries(extra.folderHolds)) fs.writeFileSync(path.join(ownDesksFolder, name), JSON.stringify(doc));
  }

  const heldStem = "branch-lamp-12345678";
  const heldDoc = {
    format: 2,
    kind: "etiuda-catalog",
    id: ownDesk.keyId + "-12345678",
    rev: 1,
    date: "2026-10-30",
    tags: [],
    cards: [{ id: "c-1", bodyShape: "plain", title: { en: "Held Card" }, body: { en: "Text" } }],
    desk: { id: ownDesk.keyId, key: ownDesk.public, box: ownBox.public },
  };

  return {
    lab,
    sharedFolder: catalogs,
    mirrorFolder: mirror,
    ownDeskId: ownDesk.keyId,
    lead,
    movedTeamDoc,
    triggerTeamMove: true,
    holdBranch: extra.holdBranch !== undefined ? extra.holdBranch : { stem: heldStem, text: JSON.stringify(heldDoc) },
    policyFolder: extra.policyFolder,
    policyLead: lead.public,
  };
}

function runScenario(plan) {
  const res = spawnSync(process.execPath, [SELF, "--launch"], {
    input: JSON.stringify(plan),
    encoding: "utf8",
    env: Object.assign({}, process.env, { ETIUDA_TEST_DEVTOOLS: "1" }),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error("child run failed: " + (res.stderr || res.stdout));
  }
  const line = (res.stdout || "").split(/\r?\n/).find(l => l.startsWith("#result "));
  if (!line) throw new Error("no #result in output: " + res.stdout);
  return JSON.parse(line.slice(8));
}

let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

async function main() {
  if (process.argv[2] === "--launch") {
    try {
      const input = process.argv[3] || fs.readFileSync(0, "utf8");
      const plan = JSON.parse(input);
      const res = await launch(plan);
      process.stdout.write("#result " + JSON.stringify(res) + "\n");
      process.exit(0);
    } catch (e) {
      process.stderr.write("launch error: " + (e && e.stack ? e.stack : e) + "\n");
      process.exit(1);
    }
  }

  /* Scenario 1: Rostered desk follows folder move to relay (945s1, 945s4, 945s5, 945s6) */
  const s1 = makeScenario("rostered-follow");
  // Write the moved team doc into the shared folder before heed
  fs.writeFileSync(
    path.join(s1.sharedFolder, "etiuda-team.json"),
    JSON.stringify(signTeamDoc(s1.movedTeamDoc, s1.lead), null, 2)
  );
  const r1 = runScenario(s1);

  check(
    r1.channelCreated && r1.channelStarted && r1.openedDir === s1.mirrorFolder,
    "945s1 a rostered desk that pinned the lead from the folder follows: "
    + JSON.stringify({ created: r1.channelCreated, started: r1.channelStarted, opened: r1.openedDir })
  );

  check(
    !r1.sharedWatched && r1.mirrorWatched && r1.openedDir === s1.mirrorFolder,
    "945s4 on following the folder is no longer watched and catalogFolder() is the mirror: "
    + JSON.stringify({ sharedWatched: r1.sharedWatched, mirrorWatched: r1.mirrorWatched, opened: r1.openedDir })
  );

  check(
    r1.branchReachable && r1.inUseReachable && r1.heldBranchReached,
    "945s5 the own branch and in-use reach the mirror: "
    + JSON.stringify(r1.mirrorFiles)
  );

  check(
    r1.answerSurvived,
    "945s6 an ask's answer survives the change: answerSurvived=" + r1.answerSurvived
  );

  /* Scenario 2: A desk not on the roster does not follow (945s2) */
  const s2 = makeScenario("not-on-roster", { notOnRoster: true });
  fs.writeFileSync(
    path.join(s2.sharedFolder, "etiuda-team.json"),
    JSON.stringify(signTeamDoc(s2.movedTeamDoc, s2.lead), null, 2)
  );
  const r2 = runScenario(s2);

  check(
    !r2.channelCreated && r2.openedDir === s2.sharedFolder,
    "945s2 a desk not on the roster does not follow: "
    + JSON.stringify({ created: r2.channelCreated, opened: r2.openedDir })
  );

  /* Scenario 3: A policy naming a folder does not follow (945s3) */
  const policyFolder = path.join(os.tmpdir(), "follow-policy-" + crypto.randomBytes(4).toString("hex"));
  const s3 = makeScenario("policy-folder", { policyFolder });
  fs.writeFileSync(
    path.join(s3.sharedFolder, "etiuda-team.json"),
    JSON.stringify(signTeamDoc(s3.movedTeamDoc, s3.lead), null, 2)
  );
  const r3 = runScenario(s3);
  try { fs.rmSync(policyFolder, { recursive: true, force: true }); } catch {}

  check(
    !r3.channelCreated && r3.openedDir === policyFolder,
    "945s3 a policy naming a folder does not follow: "
    + JSON.stringify({ created: r3.channelCreated, opened: r3.openedDir })
  );

  /* Scenario 4: A url other than the built-in relay is not followed (945s7) */
  const s4 = makeScenario("other-url", { url: "https://other.test/relay/v1" });
  fs.writeFileSync(
    path.join(s4.sharedFolder, "etiuda-team.json"),
    JSON.stringify(signTeamDoc(s4.movedTeamDoc, s4.lead), null, 2)
  );
  const r4 = runScenario(s4);

  check(
    !r4.channelCreated && r4.openedDir === s4.sharedFolder,
    "945s7 a url other than the built-in relay is not followed: "
    + JSON.stringify({ created: r4.channelCreated, opened: r4.openedDir })
  );

  /* Scenario 5: Plants verification in scratch copy (945s8 - 945s12) */
  const mainPath = path.join(ROOT, "shell", "main.js");
  const origMain = fs.readFileSync(mainPath, "utf8");

  function testPlant(plantTag, mutator, customScenario) {
    const lines = origMain.split(/\n/);
    const at = lines.findIndex(l => l.includes(plantTag));
    if (at < 0) return { found: false, turned: false, shaSame: true };
    mutator(lines, at);
    const scratchSrc = lines.join("\n");
    const sc = customScenario || (() => {
      const p = makeScenario("rostered-plant");
      fs.writeFileSync(path.join(p.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(p.movedTeamDoc, p.lead), null, 2));
      return p;
    })();
    const plan = Object.assign({}, sc, { scratchMainSource: scratchSrc });
    const res = runScenario(plan);
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
    const shaSame = fs.readFileSync(mainPath, "utf8") === origMain;
    return { found: true, res, shaSame, plan };
  }

  // 945s8: lifting plant:follow-roster turns 945s1 red
  {
    const p = testPlant("plant:follow-roster", (lines, at) => {
      lines[at] = "  /* plant:follow-roster */";
    });
    const turned = p.found && (!p.res.channelCreated || p.res.openedDir !== p.plan.mirrorFolder);
    check(
      turned && p.shaSame,
      "945s8 lifting plant:follow-roster turns 945s1 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  // 945s9: lifting plant:follow-copy turns 945s5 red
  {
    const p = testPlant("plant:follow-copy", (lines, at) => {
      lines[at] = "  /* plant:follow-copy */";
    });
    const turned = p.found && (!p.res.branchReachable || !p.res.inUseReachable);
    check(
      turned && p.shaSame,
      "945s9 lifting plant:follow-copy turns 945s5 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  // 945s10: lifting plant:follow-folder-changed turns 945s4 red
  {
    const p = testPlant("plant:follow-folder-changed", (lines, at) => {
      lines[at] = "  /* plant:follow-folder-changed */";
    });
    const turned = p.found && (p.res.sharedWatched || !p.res.mirrorWatched || p.res.openedDir !== p.plan.mirrorFolder);
    check(
      turned && p.shaSame,
      "945s10 lifting plant:follow-folder-changed turns 945s4 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  // 945s11: lifting plant:follow-ask-keep turns 945s6 red
  {
    const p = testPlant("plant:follow-ask-keep", (lines, at) => {
      lines[at] = "    removeAnswer(); /* plant:follow-ask-keep */";
    });
    const turned = p.found && !p.res.answerSurvived;
    check(
      turned && p.shaSame,
      "945s11 lifting plant:follow-ask-keep turns 945s6 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  // 945s12: lifting plant:follow-builtin-url turns 945s7 red
  {
    const p = testPlant("plant:follow-builtin-url", (lines, at) => {
      lines[at] = "  return true; /* plant:follow-builtin-url */";
    }, (() => {
      const p = makeScenario("other-url-plant", { url: "https://other.test/relay/v1" });
      fs.writeFileSync(path.join(p.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(p.movedTeamDoc, p.lead), null, 2));
      return p;
    })());
    const turned = p.found && (p.res.channelCreated || p.res.openedDir !== p.plan.sharedFolder);
    check(
      turned && p.shaSame,
      "945s12 lifting plant:follow-builtin-url turns 945s7 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  /* Scenario 6: a desk that was on the relay before keeps the higher rev it holds there (945s13 to 945s15) */
  const heldPlan = () => {
    const p = makeScenario("mirror-holds", {
      mirrorHolds: {
        "branch-lamp.ec": { format: 2, kind: "etiuda-catalog", id: "lamp", rev: 5, from: "mirror" },
        "fresh.ec": { format: 2, kind: "etiuda-catalog", id: "fresh", rev: 2, from: "mirror" },
        "norev.ec": { from: "mirror" },
      },
      folderHolds: {
        "fresh.ec": { format: 2, kind: "etiuda-catalog", id: "fresh", rev: 3, from: "folder" },
        "norev.ec": { from: "folder" },
      },
    });
    fs.writeFileSync(path.join(p.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(p.movedTeamDoc, p.lead), null, 2));
    return p;
  };
  const s6 = heldPlan();
  const r6 = runScenario(s6);

  check(
    r6.channelCreated && r6.mirrorMarks["branch-lamp.ec"] && r6.mirrorMarks["branch-lamp.ec"].rev === 5
      && r6.mirrorMarks["branch-lamp.ec"].from === "mirror" && r6.mirrorMarks["norev.ec"] && r6.mirrorMarks["norev.ec"].from === "mirror",
    "945s13 a file the mirror already holds at a higher rev, or at none to compare, is not overwritten by the folder's: "
    + JSON.stringify(r6.mirrorMarks)
  );

  check(
    r6.mirrorMarks["fresh.ec"] && r6.mirrorMarks["fresh.ec"].rev === 3 && r6.mirrorMarks["fresh.ec"].from === "folder"
      && r6.branchReachable && r6.inUseReachable,
    "945s14 a folder file at a higher rev than the mirror's replaces it, and a name the mirror lacks is still copied: "
    + JSON.stringify(r6.mirrorMarks)
  );

  // 945s15: lifting plant:follow-keep-rev turns 945s13 red
  {
    const p = testPlant("plant:follow-keep-rev", (lines, at) => {
      lines[at] = "  /* plant:follow-keep-rev */";
    }, heldPlan());
    const turned = p.found && !(p.res.mirrorMarks["branch-lamp.ec"] && p.res.mirrorMarks["branch-lamp.ec"].rev === 5
      && p.res.mirrorMarks["norev.ec"] && p.res.mirrorMarks["norev.ec"].from === "mirror");
    check(
      turned && p.shaSame,
      "945s15 lifting plant:follow-keep-rev turns 945s13 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
  }

  // Clean up scenario temp dirs
  [s1, s2, s3, s4, s6].forEach(s => {
    try { fs.rmSync(s.lab, { recursive: true, force: true }); } catch {}
  });

  process.stdout.write("#counts checks=" + asserted + " failed=" + failed + "\n");
  if (failed > 0) process.exit(Math.min(failed, 63));
}

main().catch(err => {
  process.stderr.write("test error: " + (err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
