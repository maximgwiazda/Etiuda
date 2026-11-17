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
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const nodeRequire = createRequire(import.meta.url);
const ASIDE_945S3 = nodeRequire("./off-windows.cjs").offWindows("945s3",
  "the desk reads no Group Policy off Windows, so the policy's folder this leg stubs is never asked for");
const REAL_CHANNEL = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));

const BUILTIN_RELAY = "https://etiuda.dev/relay/v1";
const STAGING_RELAY = "https://etiuda.dev/relay-staging/v1";
/* A test service build's fields, as tools/test-service.cjs packs them into the asar's package.json (tests/test-service.mjs). */
const TEST_SERVICE_FIELDS = { service: "https://etiuda.dev/licence-staging/v1/",
  clientIds: { microsoft: "11111111-2222-3333-4444-555555555555", google: "1234567890-abcdefghij.apps.googleusercontent.com" },
  order: "https://etiuda.dev/buy-staging/" };

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
  const SHELL = plan.shellDir || path.join(LAB, "shell");
  const DOCS = path.join(LAB, "documents");
  const SHARED = plan.sharedFolder;
  const MIRROR = plan.mirrorFolder;
  const ownId = plan.ownDeskId;

  let whenReadyResolve = noop;
  const whenReadyPromise = new Promise(r => { whenReadyResolve = r; });
  const onHandlers = {}, invokeHandlers = {};
  const openedDirs = [];
  const said = [], fetched = [];

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
    loadURL: noop,
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
      commandLine: { appendSwitch: noop, hasSwitch: () => false },
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
    net: plan.recordNet ? new Proxy(inert, { get: (o, k) => (k === "fetch" ? (u => { fetched.push(String(u && u.url || u)); return Promise.reject(new Error("no network in this leg")); }) : inert) }) : inert,
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

  /* reg.exe stood in whole: the policy export this leg plans, and every other reg call answered as a key that is not there, so
     no read reaches this machine's registry (it passed them through until the test architect's measurement of 2026-11-15).
     Marked as a stand-in, so the shell's guard lets these calls through (tests/reg-stand.cjs). Any other program runs. */
  const realCp = nodeRequire("node:child_process");
  const isReg = (file) => /^reg(\.exe)?$/i.test(path.win32.basename(String(file || "")));
  const regAnswer = (args) => {
    if (args && args[0] === "export" && args[1] === "HKLM\\SOFTWARE\\Policies\\Etiuda" && plan.policyFolder) {
      fs.writeFileSync(args[2], makePolicyExport(plan.policyFolder, plan.policyLead || "00".repeat(32)));
      return null;
    }
    const e = new Error("ERROR: The system was unable to find the specified registry key or value.");
    e.status = 1; e.code = 1;
    return e;
  };
  const mockCp = {
    execFile: (file, args, opts, cb) => {
      if (!isReg(file)) return realCp.execFile(file, args, opts, cb);
      const done = [args, opts, cb].find((f) => typeof f === "function");
      const err = regAnswer(args);
      setImmediate(() => done && done(err, "", ""));
      return { pid: 0, on() { return this; }, once() { return this; }, kill() { return true; } };
    },
    execFileSync: (file, args, opts) => {
      if (!isReg(file)) return realCp.execFileSync(file, args, opts);
      const err = regAnswer(args);
      if (err) throw err;
      return Buffer.alloc(0);
    },
  };
  nodeRequire("./reg-stand.cjs").markStand(mockCp.execFileSync, mockCp.execFile);

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

  let preWrite = null;
  if (plan.holdBranch && invokeHandlers["etiuda:branch-write"]) {
    const blockDir = path.join(SHARED, "desks", ownId, plan.holdBranch.stem + ".ec");
    fs.mkdirSync(blockDir, { recursive: true });
    try {
      preWrite = await invokeHandlers["etiuda:branch-write"](ev, plan.holdBranch.stem, plan.holdBranch.text);
    } finally {
      try { fs.rmdirSync(blockDir); } catch {}
    }
  }
  /* The team file reaches the relay's mirror only after the copy is held there, as the channel would bring it. */
  if (plan.mirrorTeamAfterHold) {
    fs.mkdirSync(MIRROR, { recursive: true });
    fs.writeFileSync(path.join(MIRROR, "etiuda-team.json"), plan.mirrorTeamAfterHold);
    /* The mirror's watch settles 300 ms after the last event before the desk reads it again. */
    await new Promise(r => setTimeout(r, 1200));
  }

  if (plan.triggerTeamMove && invokeHandlers["etiuda:team-join"]) {
    await invokeHandlers["etiuda:team-join"](ev, "leads");
    await new Promise(r => setTimeout(r, 300));
  }

  if (invokeHandlers["etiuda:open-catalog-folder"]) {
    await invokeHandlers["etiuda:open-catalog-folder"](ev);
  }
  /* What the page is told about the build: testService only where the asar's fields were taken. */
  let testService = null;
  if (onHandlers["etiuda:host"]) {
    const hostEv = { sender: pageWin.webContents, senderFrame: FRAME, returnValue: undefined };
    try { onHandlers["etiuda:host"](hostEv); testService = !!(hostEv.returnValue && hostEv.returnValue.testService === true); } catch { testService = null; }
  }
  /* Board 962, stage 0b: the lead's switch on a relay team, in the relay's mirror where the desk reads its team file. */
  let contentViews = null;
  if (plan.contentSwitch && invokeHandlers["etiuda:team-join"]) {
    fs.writeFileSync(path.join(MIRROR, "etiuda-team.json"), plan.contentSwitch.text);
    const before = await invokeHandlers["etiuda:team-join"](ev, "content");
    const shown = await invokeHandlers["etiuda:team-join"](ev, "content-said", plan.contentSwitch.team, plan.contentSwitch.at);
    contentViews = { before, shown };
  }

  /* The team's row as the page is handed it (leadsView): whether it carries the fact of a relay this build does not use, and
     whether any address reached it; then, where the plan writes a later team file into the folder, the same once that is read. */
  const rowsNow = async () => {
    const v = invokeHandlers["etiuda:team-join"] ? await invokeHandlers["etiuda:team-join"](ev, "leads") : null;
    const leads = (v && v.leads) || [];
    return { elsewhere: leads.filter(l => l && l.relayElsewhere === true).length, rows: leads.length, text: JSON.stringify(leads) };
  };
  const rowFirst = await rowsNow();
  let rowLater = null;
  if (plan.teamLater) {
    fs.writeFileSync(path.join(SHARED, "etiuda-team.json"), plan.teamLater);
    await new Promise(r => setTimeout(r, 1500));
    rowLater = await rowsNow();
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
    channelUrl: createdChannel && createdChannel.opts ? String(createdChannel.opts.url || "") : "",
    channelSeat: !!(createdChannel && createdChannel.opts && ["seat", "seatRenew", "onSeat"].every(k => typeof createdChannel.opts[k] === "function")),
    fetched,
    rowFirst,
    rowLater,
    mirrorFiles,
    mirrorMarks: mirrorFiles.reduce((o, f) => {
      try { const d = JSON.parse(fs.readFileSync(path.join(mirrorDeskDir, f), "utf8")); o[f] = { rev: d.rev, from: d.from }; } catch {}
      return o;
    }, {}),
    mirrorWritable: mirrorFiles.reduce((o, f) => {
      try { o[f] = (fs.statSync(path.join(mirrorDeskDir, f)).mode & 0o200) !== 0; } catch {}
      return o;
    }, {}),
    branchReachable: mirrorFiles.includes("branch-lamp.ec"),
    inUseReachable: mirrorFiles.includes("in-use.ec"),
    answerSurvived: mirrorFiles.includes("catalog-answer.ec"),
    heldBranchReached: plan.holdBranch ? mirrorFiles.includes(plan.holdBranch.stem + ".ec") : false,
    preHeld: !!preWrite && preWrite.held === true,
    said,
    contentViews,
    testService,
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
  /* A test service desk is installed, so its shell sits inside app.asar with the fields in the package.json beside it. */
  const shell = extra.testService ? path.join(lab, "resources", "app.asar", "shell") : path.join(lab, "shell");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(catalogs, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(shell, { recursive: true });
  if (extra.testService) fs.writeFileSync(path.join(shell, "..", "package.json"), JSON.stringify({ name: "etiuda", etiudaTestService: TEST_SERVICE_FIELDS }));

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
    ...(extra.pinFrom ? { teamPinFrom: { [teamId]: extra.pinFrom } } : {}),
    ...(extra.keptChannel ? { teamChannel: { [teamId]: { kind: "relay", rt, url: extra.keptChannel } } } : {}),
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
  for (const name of extra.readOnly || []) {
    for (const dir of [ownDesksFolder, path.join(mirror, "desks", ownDesk.keyId)]) {
      if (fs.existsSync(path.join(dir, name))) fs.chmodSync(path.join(dir, name), 0o444);
    }
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
  /* A member at the relay's mirror once its team file arrives (board 974, C5): the lead's signed edition of the listed catalog waits
     there, and the team file reaches it after the copy is held (mirrorTeamAfterHold). */
  if (extra.memberMirror) {
    fs.mkdirSync(mirror, { recursive: true });
    const lamp = { format: 2, kind: "etiuda-catalog", id: "lamp", rev: 1, name: "Lamp", date: "2026-10-30",
      langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-1", shelf: "t-op", bodyShape: "plain", title: { en: "Lamp" }, body: { en: "Lamp text" } }],
      sig: { alg: "Ed25519", keyId: lead.keyId } };
    const sha = "sha256:" + sha256Hex(REAL_CHANNEL.signedBytes(lamp));
    const signed = signTeamDoc(lamp, lead);
    fs.writeFileSync(path.join(mirror, "lamp.ec"), JSON.stringify(signed, null, 1) + "\n");
    heldDoc.grew = { id: "lamp", rev: 1, sha };
  }

  return {
    lab,
    sharedFolder: catalogs,
    mirrorFolder: mirror,
    ownDeskId: ownDesk.keyId,
    lead,
    movedTeamDoc,
    triggerTeamMove: true,
    holdBranch: extra.holdBranch !== undefined ? extra.holdBranch : { stem: heldStem, text: JSON.stringify(heldDoc) },
    mirrorTeamAfterHold: extra.memberMirror ? JSON.stringify(signTeamDoc(movedTeamDoc, lead), null, 2) : undefined,
    policyFolder: extra.policyFolder,
    policyLead: lead.public,
    shellDir: shell,
  };
}

/* A customer's start: none of the variables harnessLaunch() reads. */
function customerEnv() {
  const env = Object.assign({}, process.env);
  for (const k of ["ETIUDA_TEST_OFFSCREEN", "ETIUDA_TEST_DOCUMENTS", "ETIUDA_TEST_DEVTOOLS"]) delete env[k];
  return env;
}

function runScenario(plan) {
  const res = spawnSync(process.execPath, [SELF, "--launch"], {
    input: JSON.stringify(plan),
    encoding: "utf8",
    env: plan.customer ? customerEnv() : Object.assign({}, process.env, { ETIUDA_TEST_DEVTOOLS: "1" }),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error("child run failed: " + (res.stderr || res.stdout));
  }
  const line = (res.stdout || "").split(/\r?\n/).find(l => l.startsWith("#result "));
  if (!line) throw new Error("no #result in output: " + res.stdout);
  return JSON.parse(line.slice(8));
}

let asserted = 0, failed = 0, skipped = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}
function skip(line) {
  skipped++;
  process.stdout.write("  SKIP " + line + "\n");
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
    r1.branchReachable && r1.inUseReachable && !r1.heldBranchReached,
    "945s5 the own branch and in-use reach the mirror, and a held working copy of a catalog the team does not list stays held, since the desk is no sealed member at the relay's mirror (board 974, C5): "
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
  let s3 = null;
  if (ASIDE_945S3) skip(ASIDE_945S3);
  else {
    const policyFolder = path.join(os.tmpdir(), "follow-policy-" + crypto.randomBytes(4).toString("hex"));
    s3 = makeScenario("policy-folder", { policyFolder });
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
  }

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

  /* Scenario 7: the lead's switch is shown and applies on a relay team (board 962, stage 0b, round five) */
  const s7 = makeScenario("rostered-follow");
  fs.writeFileSync(path.join(s7.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(s7.movedTeamDoc, s7.lead), null, 2));
  const at7 = "2026-11-01T09:00:00.000Z";
  const switched = Object.assign(JSON.parse(JSON.stringify(s7.movedTeamDoc)), { rev: (s7.movedTeamDoc.rev || 0) + 1,
    content: { format: 1, on: true, by: "Quay lead", at: at7 } });
  const r7 = runScenario(Object.assign({}, s7, { contentSwitch: { text: JSON.stringify(signTeamDoc(switched, s7.lead), null, 2), team: s7.movedTeamDoc.id, at: at7 } }));
  const cv = r7.contentViews || {};
  check(r7.openedDir === s7.mirrorFolder && !!cv.before && cv.before.team === s7.movedTeamDoc.id && cv.before.on === true && cv.before.said === false
      && !!cv.shown && cv.shown.said === true,
    "945s16 on a relay team the lead's switch is read from the relay's mirror, shown and then applies: " + JSON.stringify({ opened: r7.openedDir === s7.mirrorFolder, before: cv.before, shown: cv.shown && cv.shown.said }));

  /* Scenario 8 (board 974, C5): the desk follows at boot, as in scenario 1, and its copy grown from a listed edition is held at the
     relay's mirror until the team file arrives there; then it is written. */
  const s8 = makeScenario("member-follow", { memberMirror: true });
  fs.writeFileSync(path.join(s8.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(s8.movedTeamDoc, s8.lead), null, 2));
  const r8 = runScenario(s8);
  check(r8.openedDir === s8.mirrorFolder && r8.preHeld && r8.heldBranchReached,
    "945s17 a desk that followed its team to the relay holds its working copy of a listed catalog at the relay's mirror until the team file arrives there, and then writes it: "
    + JSON.stringify({ opened: r8.openedDir === s8.mirrorFolder, heldFirst: r8.preHeld, files: r8.mirrorFiles }));
  {
    const p = testPlant("plant:changed-held", (lines, at) => {
      lines[at] = "  /* plant:changed-held */";
    }, (() => {
      const q = makeScenario("member-follow-plant", { memberMirror: true });
      fs.writeFileSync(path.join(q.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(q.movedTeamDoc, q.lead), null, 2));
      return q;
    })());
    const turned = p.found && p.res.preHeld && !p.res.heldBranchReached;
    check(turned && p.shaSame, "945s18 lifting plant:changed-held turns 945s17 red: turned=" + turned + ", shaSame=" + p.shaSame);
  }

  /* Scenario 9 (board 998): the folder's files are marked read-only, and so is the mirror's older copy of one of them. */
  const s9 = makeScenario("read-only", {
    mirrorHolds: { "fresh.ec": { format: 2, kind: "etiuda-catalog", id: "fresh", rev: 2, from: "mirror" } },
    folderHolds: { "fresh.ec": { format: 2, kind: "etiuda-catalog", id: "fresh", rev: 3, from: "folder" } },
    readOnly: ["fresh.ec", "branch-lamp.ec"],
  });
  fs.writeFileSync(path.join(s9.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(s9.movedTeamDoc, s9.lead), null, 2));
  const r9 = runScenario(s9);
  const s9Desk = path.join(s9.sharedFolder, "desks", s9.ownDeskId);
  const shareKept = ["fresh.ec", "branch-lamp.ec"].every(n => { try { return (fs.statSync(path.join(s9Desk, n)).mode & 0o200) === 0; } catch { return false; } });
  check(r9.channelCreated && r9.mirrorMarks["fresh.ec"] && r9.mirrorMarks["fresh.ec"].rev === 3 && r9.mirrorMarks["fresh.ec"].from === "folder"
      && r9.mirrorWritable["fresh.ec"] === true && r9.branchReachable && r9.mirrorWritable["branch-lamp.ec"] === true && shareKept,
    "998g a desk following its team to the relay copies the folder's files marked read-only into the mirror writable, over a copy"
    + " the mirror held marked, and the folder's files keep their marks: " + JSON.stringify({ marks: r9.mirrorMarks, writable: r9.mirrorWritable, shareKept }));
  for (const n of ["fresh.ec", "branch-lamp.ec"]) { try { fs.chmodSync(path.join(s9Desk, n), 0o666); } catch {} }

  /* Scenario 10: a test service desk follows its folder team to staging's relay as an ordinary desk follows one to the live relay;
     an ordinary desk does not, and the test service desk follows no other address (945s19 to 945s24). */
  const movedPlan = (kind, extra) => {
    const p = makeScenario(kind, extra);
    fs.writeFileSync(path.join(p.sharedFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(p.movedTeamDoc, p.lead), null, 2));
    return p;
  };
  const s10 = movedPlan("ts-staging", { testService: true, url: STAGING_RELAY });
  const r10 = runScenario(s10);
  check(r10.testService === true && r10.channelCreated && r10.channelStarted && r10.openedDir === s10.mirrorFolder && r10.mirrorWatched && !r10.sharedWatched,
    "945s19 a test service desk, rostered, that pinned the lead from the folder follows its team to staging's relay: "
    + JSON.stringify({ testService: r10.testService, created: r10.channelCreated, started: r10.channelStarted, opened: r10.openedDir === s10.mirrorFolder }));
  const s11 = movedPlan("plain-staging", { url: STAGING_RELAY });
  const r11 = runScenario(s11);
  check(r11.testService === false && !r11.channelCreated && r11.openedDir === s11.sharedFolder,
    "945s20 the same desk in the ordinary build does not follow its team to staging's relay: "
    + JSON.stringify({ testService: r11.testService, created: r11.channelCreated, opened: r11.openedDir === s11.sharedFolder }));
  const s12 = movedPlan("ts-other", { testService: true, url: "https://other.test/relay-staging/v1" });
  const r12 = runScenario(s12);
  check(r12.testService === true && !r12.channelCreated && r12.openedDir === s12.sharedFolder,
    "945s21 a test service desk follows no address but the two relays: "
    + JSON.stringify({ testService: r12.testService, created: r12.channelCreated, opened: r12.openedDir === s12.sharedFolder }));
  const s13 = movedPlan("ts-live", { testService: true });
  const r13 = runScenario(s13);
  check(r13.testService === true && r13.channelCreated && r13.openedDir === s13.mirrorFolder,
    "945s22 a test service desk still follows its team to the live relay: "
    + JSON.stringify({ testService: r13.testService, created: r13.channelCreated, opened: r13.openedDir === s13.mirrorFolder }));
  {
    const p = testPlant("plant:follow-staging", (lines, at) => {
      lines[at] = "  /* plant:follow-staging */";
    }, movedPlan("ts-staging-plant", { testService: true, url: STAGING_RELAY }));
    const turned = p.found && p.res.testService === true && !p.res.channelCreated && p.res.openedDir === p.plan.sharedFolder;
    check(turned && p.shaSame, "945s23 lifting plant:follow-staging turns 945s19 red: turned=" + turned + ", shaSame=" + p.shaSame);
  }
  {
    const p = testPlant("plant:follow-staging", (lines, at) => {
      lines[at] = lines[at].replace("testServiceOn && ", "");
    }, movedPlan("plain-staging-plant", { url: STAGING_RELAY }));
    const turned = p.found && p.res.testService === false && p.res.channelCreated && p.res.openedDir === p.plan.mirrorFolder;
    check(turned && p.shaSame, "945s24 staging's relay followed without the switch turns 945s20 red: turned=" + turned + ", shaSame=" + p.shaSame);
  }

  /* Scenario 11: a team file's relay address is heeded only where it is a known relay address, the rule an invitation keeps
     (knownRelayAddress): a desk whose lead was pinned by an invitation, machine policy or an answered request follows its signed
     team file to the built-in relay and never to another host on a customer's start; a harness start still follows a leg's
     stand-in (ks1 to ks16). */
  const ELSEWHERE = "https://elsewhere.example/relay/v1", ELSEWHERE_HOST = "elsewhere.example", STAND_IN = "https://stand-in.test/relay/v1";
  const SAID_ELSEWHERE = "names a relay this Etiuda does not use";
  const knownPlan = (kind, extra, customer) => Object.assign(movedPlan(kind, extra), customer ? { customer: true, recordNet: true } : { recordNet: true });
  /* Not followed: no channel, nothing fetched from the host, the host said nowhere, the folder kept, and the reason said once. */
  const heldBack = r => !r.channelCreated && r.openedDir !== "" && !r.channelUrl.includes(ELSEWHERE_HOST)
    && !r.fetched.some(u => u.includes(ELSEWHERE_HOST)) && !r.said.some(l => l.includes(ELSEWHERE_HOST))
    && r.said.filter(l => l.includes(SAID_ELSEWHERE)).length === 1 && r.said.some(l => l.includes("The team file of Team " + SAID_ELSEWHERE));
  const heldBrief = (r, p) => JSON.stringify({ created: r.channelCreated, url: r.channelUrl, folderKept: r.openedDir === p.sharedFolder,
    fetchedThere: r.fetched.filter(u => u.includes(ELSEWHERE_HOST)).length, saidHost: r.said.some(l => l.includes(ELSEWHERE_HOST)),
    saidWhy: r.said.filter(l => l.includes(SAID_ELSEWHERE)).length });
  const followed = (r, url) => r.channelCreated && r.channelStarted && r.channelUrl === url;
  const known = {};
  for (const from of ["invite", "policy", "answer"]) {
    const p = knownPlan("known-" + from, { url: ELSEWHERE, pinFrom: from }, true);
    const r = runScenario(p);
    known[from] = { p, r };
    check(heldBack(r) && r.openedDir === p.sharedFolder,
      (from === "invite" ? "ks1" : from === "policy" ? "ks2" : "ks3") + " a desk whose lead was pinned by "
      + (from === "invite" ? "an invitation" : from === "policy" ? "machine policy" : "an answered request")
      + ", its lead's signed team file naming another https host, on a customer's start: the file's channel is not heeded, no"
      + " request of any kind goes to that host, the folder is kept, and the desk says why once, naming no address: " + heldBrief(r, p));
  }
  const kb = knownPlan("known-builtin", { pinFrom: "invite" }, true);
  const rb = runScenario(kb);
  check(followed(rb, BUILTIN_RELAY) && rb.channelSeat && !rb.said.some(l => l.includes(SAID_ELSEWHERE)),
    "ks4 the control: the same desk and file naming the built-in relay, on a customer's start, follows it, its channel wired to the"
    + " desk's seat certificate (which relay-seats d1a and d5a show each hello carries), and says nothing of another relay: "
    + JSON.stringify({ created: rb.channelCreated, url: rb.channelUrl, seatWired: rb.channelSeat }));
  const kh = knownPlan("known-harness", { url: STAND_IN, pinFrom: "invite" }, false);
  const rh = runScenario(kh);
  check(followed(rh, STAND_IN), "ks5 a harness start still follows the team file to a leg's stand-in host: "
    + JSON.stringify({ created: rh.channelCreated, url: rh.channelUrl }));
  const ks = knownPlan("known-ts-staging", { testService: true, url: STAGING_RELAY, pinFrom: "invite" }, true);
  const rs = runScenario(ks);
  check(rs.testService === true && followed(rs, STAGING_RELAY) && !rs.said.some(l => l.includes(SAID_ELSEWHERE)),
    "ks6 nothing changes for a test service desk whose team file names staging's relay, on a customer's start: it follows it: "
    + JSON.stringify({ testService: rs.testService, created: rs.channelCreated, url: rs.channelUrl }));
  const kk = knownPlan("known-kept", { pinFrom: "invite", keptChannel: BUILTIN_RELAY }, true);
  const rk = runScenario(kk);
  check(followed(rk, BUILTIN_RELAY) && !rk.said.some(l => l.includes(SAID_ELSEWHERE)),
    "ks7 nothing changes for a desk already on a team whose file names the built-in relay, its channel kept, on a customer's start: "
    + JSON.stringify({ created: rk.channelCreated, url: rk.channelUrl }));
  /* Each guard lifted in a scratch copy of shell/main.js turns its check red. */
  const knownLift = (id, tag, mutate, plan, red, what) => {
    const p = testPlant(tag, mutate, plan);
    const turned = p.found && red(p.res, p.plan);
    check(turned && p.shaSame, id + " " + what + ": turned=" + turned + ", shaSame=" + p.shaSame);
  };
  const toComment = tag => (lines, at) => { lines[at] = "  /* " + tag + " */"; };
  for (const [id, from, of] of [["ks8", "invite", "ks1"], ["ks9", "policy", "ks2"], ["ks10", "answer", "ks3"]])
    knownLift(id, "plant:channel-known", toComment("plant:channel-known"), knownPlan("known-lift-" + from, { url: ELSEWHERE, pinFrom: from }, true),
      r => r.channelCreated && r.channelUrl === ELSEWHERE, "lifting plant:channel-known turns " + of + " red: the desk opens a channel to the other host");
  knownLift("ks11", "plant:elsewhere-heed", toComment("plant:elsewhere-heed"), knownPlan("known-lift-said", { url: ELSEWHERE, pinFrom: "invite" }, true),
    r => !heldBack(r), "lifting plant:elsewhere-heed turns ks1 red: the file is heeded as a folder's and the desk never says why");
  knownLift("ks12", "plant:relay-known", toComment("plant:relay-known"), knownPlan("known-lift-harness", { url: ELSEWHERE, pinFrom: "invite" }, true),
    r => r.channelCreated && r.channelUrl === ELSEWHERE, "lifting the harness exception's guard (plant:relay-known) turns ks1 red: a customer's start follows any https host");
  knownLift("ks13", "plant:relay-known", (lines, at) => { lines[at] = "  return false; /* plant:relay-known */"; }, knownPlan("known-lift-stand-in", { url: STAND_IN, pinFrom: "invite" }, false),
    r => !r.channelCreated, "the harness exception taken away turns ks5 red: a harness start no longer follows the stand-in");
  knownLift("ks14", "plant:builtin-relay-known", toComment("plant:builtin-relay-known"), knownPlan("known-lift-builtin", { pinFrom: "invite" }, true),
    r => !r.channelCreated, "lifting plant:builtin-relay-known turns ks4 red: the built-in relay is not followed");
  knownLift("ks15", "plant:builtin-relay-known", toComment("plant:builtin-relay-known"), knownPlan("known-lift-staging", { testService: true, url: STAGING_RELAY, pinFrom: "invite" }, true),
    r => !r.channelCreated, "lifting plant:builtin-relay-known turns ks6 red: staging's relay is not followed by a test service desk");
  knownLift("ks16", "plant:builtin-relay-known", toComment("plant:builtin-relay-known"), knownPlan("known-lift-kept", { pinFrom: "invite", keptChannel: BUILTIN_RELAY }, true),
    r => !r.channelCreated, "lifting plant:builtin-relay-known turns ks7 red: a desk already on the built-in relay loses it");
  /* The fact the page words, on the team's row as the shell hands it: set where the file names another host, never with the
     address, and absent where the file names a relay this build uses; it goes once a later file names the built-in relay. */
  const factSet = r => !!r.rowFirst && r.rowFirst.elsewhere === 1 && !r.rowFirst.text.includes(ELSEWHERE_HOST);
  const factAbsent = r => !!r.rowFirst && r.rowFirst.rows >= 1 && r.rowFirst.elsewhere === 0;
  check(["invite", "policy", "answer"].every(k => factSet(known[k].r)),
    "ks17 the team's row the page is handed carries the fact of a relay this build does not use, and no address, in ks1 to ks3: "
    + JSON.stringify(["invite", "policy", "answer"].map(k => known[k].r.rowFirst && known[k].r.rowFirst.elsewhere)));
  check([rb, rs, rk].every(factAbsent), "ks18 and does not carry it in ks4, ks6 and ks7: "
    + JSON.stringify([rb, rs, rk].map(r => r.rowFirst && [r.rowFirst.rows, r.rowFirst.elsewhere])));
  const laterPlan = (kind, url) => {
    const p = knownPlan(kind, { url: ELSEWHERE, pinFrom: "invite" }, true);
    const back = JSON.parse(JSON.stringify(p.movedTeamDoc));
    back.rev = 3;
    back.channel = { kind: "relay", rt: back.channel.rt, url };
    p.teamLater = JSON.stringify(signTeamDoc(back, p.lead), null, 2);
    return p;
  };
  const kl = laterPlan("known-later", BUILTIN_RELAY);
  const rl = runScenario(kl);
  check(factSet(rl) && !!rl.rowLater && rl.rowLater.rows >= 1 && rl.rowLater.elsewhere === 0,
    "ks19 the fact goes once a later team file names the built-in relay again: "
    + JSON.stringify({ first: rl.rowFirst && rl.rowFirst.elsewhere, later: rl.rowLater && rl.rowLater.elsewhere }));
  knownLift("ks20", "plant:elsewhere-fact", toComment("plant:elsewhere-fact"), knownPlan("known-lift-fact", { url: ELSEWHERE, pinFrom: "invite" }, true),
    r => !factSet(r), "lifting plant:elsewhere-fact turns ks17 red: the row never carries the fact");
  knownLift("ks21", "plant:elsewhere-row-fact", toComment("plant:elsewhere-row-fact"), knownPlan("known-lift-row", { url: ELSEWHERE, pinFrom: "invite" }, true),
    r => !factSet(r), "lifting plant:elsewhere-row-fact turns ks17 red: the fact is kept but never handed to the page");
  for (const [id, of, plan] of [["ks22", "ks4", () => knownPlan("known-lift-on-b", { pinFrom: "invite" }, true)],
    ["ks23", "ks6", () => knownPlan("known-lift-on-s", { testService: true, url: STAGING_RELAY, pinFrom: "invite" }, true)],
    ["ks24", "ks7", () => knownPlan("known-lift-on-k", { pinFrom: "invite", keptChannel: BUILTIN_RELAY }, true)]])
    knownLift(id, "plant:elsewhere-row-fact", (lines, at) => { lines[at] = "    row.relayElsewhere = true; /* plant:elsewhere-row-fact */"; }, plan(),
      r => !factAbsent(r), "the fact handed on every row turns " + of + "'s half of ks18 red");
  knownLift("ks25", "plant:elsewhere-clear", toComment("plant:elsewhere-clear"), laterPlan("known-lift-clear", BUILTIN_RELAY),
    r => !(r.rowLater && r.rowLater.elsewhere === 0), "lifting plant:elsewhere-clear turns ks19 red: the fact outlives a file naming the built-in relay");
  try { fs.rmSync(kl.lab, { recursive: true, force: true }); } catch {}

  /* THE PAGE: the row's fact worded on the team's row in Settings and in a notice once, in English and Polish, with the
     copywriter's sentence exactly, {TEAM} as the row names the team; Dismiss holds for the run, the row still says it, and a row
     without the fact says nothing of it. Over src/modules in this process, its DOM a stand-in that keeps what is appended. */
  const PAGE_EN = "The team file of Ada's team names a relay this Etiuda does not use, so this desk does not follow it: it keeps its team, its catalog and its connection as they were, and sends nothing there. If the team moves back, nothing is needed; otherwise a new invitation from the team's lead is.";
  const PAGE_PL = "Plik zespołu Zespół osoby Ada wskazuje przekaźnik, z którego ta Etiuda nie korzysta, więc to stanowisko za nim nie podąża: zachowuje zespół, katalog i połączenie bez zmian i niczego tam nie wysyła. Jeśli zespół wróci na poprzedni przekaźnik, nic nie trzeba robić; w przeciwnym razie potrzebne jest nowe zaproszenie od lidera zespołu.";
  const MODS = path.join(ROOT, "src", "modules"), MOD_DIR = pathToFileURL(MODS).href + "/";
  const pageWords = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  /* A module's text with one line swapped, imported fresh; its own imports reach the real modules. */
  const plantedMod = (name, tag, swap) => {
    const text = fs.readFileSync(path.join(MODS, name), "utf8"), lines = text.split("\n"), at = lines.findIndex(l => l.includes(tag));
    if (at < 0) return null;
    lines[at] = swap(lines[at]);
    return import("data:text/javascript;base64," + Buffer.from(lines.join("\n").replace(/from "\.\//g, 'from "' + MOD_DIR)).toString("base64"));
  };
  async function pageScene(tj, set) {
    const storage = await import(pathToFileURL(path.join(MODS, "storage.js")).href);
    const hooksMod = await import(pathToFileURL(path.join(MODS, "hooks.js")).href);
    const TJ = tj || await import(pathToFileURL(path.join(MODS, "team-join.js")).href);
    const SET = set || await import(pathToFileURL(path.join(MODS, "settings.js")).href);
    const quietList = { contains: () => false, add() {}, remove() {}, toggle() {} };
    const body = { children: [], classList: quietList };
    const el = tag => ({ tag, children: [], style: {}, classList: quietList, textContent: "", attrs: {},
      appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; },
      remove() { const i = body.children.indexOf(this); if (i >= 0) body.children.splice(i, 1); } });
    body.appendChild = c => { body.children.push(c); return c; };
    let send = null;
    globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {},
      E_HOST: { teamJoin: () => Promise.resolve(null), onTeamJoin: fn => { send = fn; } } };
    globalThis.document = { body, documentElement: { dataset: {}, classList: quietList, style: {} }, createElement: el, createTextNode: s => ({ textContent: String(s) }),
      getElementById: id => body.children.find(c => c.id === id) || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", fontSize: "16px" });
    const wasRender = hooksMod.hooks.render;
    hooksMod.hooks.render = () => {};
    const noticeOf = () => body.children.find(c => c.id === "eTeamElsewhere") || null;
    const noticeText = () => { const n = noticeOf(); return n ? n.children[0].children.map(c => c.textContent).join("") : null; };
    const dismiss = () => { const n = noticeOf(), row = n && n.children[1], x = row && row.children[row.children.length - 1]; if (x && x.onclick) x.onclick(); };
    const out = {};
    try {
      TJ.wireTeamJoin();
      for (const [lang, team, want] of [["en", "t-elsewhere-en", PAGE_EN], ["pl", "t-elsewhere-pl", PAGE_PL]]) {
        storage.lsSet("eUiLang", lang);
        const fact = { team, lead: "Ada", print: "0123456789abcdef", relayElsewhere: true };
        send({ leads: [fact] });
        const row = pageWords(SET.settingsPageHtml("teams", ""));
        const shown = noticeText();
        send({ leads: [Object.assign({}, fact)] });
        const notices = body.children.filter(c => c.id === "eTeamElsewhere").length;
        dismiss();
        send({ leads: [Object.assign({}, fact, { print: "fedcba9876543210" })] });
        const afterDismiss = noticeText(), rowStill = pageWords(SET.settingsPageHtml("teams", "")).includes(want);
        send({ leads: [{ team, lead: "Ada", print: "0123456789abcdef" }] });
        const rowGone = !pageWords(SET.settingsPageHtml("teams", "")).includes(want.slice(0, 40));
        out[lang] = { row: row.includes(want), notice: shown === want, notices, afterDismiss: afterDismiss === null, rowStill, rowGone };
      }
    } finally {
      if (send) send({ leads: [] });
      hooksMod.hooks.render = wasRender;
      storage.lsSet("eUiLang", "en");
      delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle;
    }
    out.ok = ["en", "pl"].every(l => { const o = out[l]; return o.row && o.notice && o.notices === 1 && o.afterDismiss && o.rowStill && o.rowGone; });
    return out;
  }
  let page = null;
  try { page = await pageScene(); } catch (e) { page = { ok: false, error: String(e && e.stack ? e.stack.split("\n")[0] : e) }; }
  check(page.ok, "ks26 the page words the row's fact with the copywriter's sentence exactly, {TEAM} as the row names the team, on the"
    + " team's row in Settings and once in a notice, in English and Polish; Dismiss holds for the run while the row still says it, and"
    + " a row without the fact says nothing of it: " + JSON.stringify(page));
  for (const [id, name, tag, line, what] of [
    ["ks27", "settings.js", "plant:elsewhere-row", "  /* plant:elsewhere-row */", "the team's row never says it"],
    ["ks28", "team-join.js", "plant:elsewhere-notice", "  /* plant:elsewhere-notice */", "no notice is shown"],
    ["ks29", "team-join.js", "plant:elsewhere-kept", "             /* plant:elsewhere-kept */", "the page drops the row's fact"]]) {
    let turned = false, detail = "plant line absent";
    try {
      const mod = await plantedMod(name, tag, () => line);
      if (mod) {
        const r = await pageScene(name === "team-join.js" ? mod : null, name === "settings.js" ? mod : null);
        /* A copy of team-join.js is wired alone, so its notice is what it is judged by; the row reads the real module. */
        turned = name === "settings.js" ? !(r.en && r.en.row && r.pl && r.pl.row) : !(r.en && r.en.notice && r.pl && r.pl.notice);
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = "threw " + (e && e.message); }
    check(page.ok && turned, id + " lifting plant:" + tag.slice(6) + " in a copy of src/modules/" + name + " turns ks26 red (" + what + "): " + detail);
  }
  [known.invite, known.policy, known.answer].forEach(k => { try { fs.rmSync(k.p.lab, { recursive: true, force: true }); } catch {} });
  [kb, kh, ks, kk].forEach(s => { try { fs.rmSync(s.lab, { recursive: true, force: true }); } catch {} });

  // Clean up scenario temp dirs
  [s1, s2, s3, s4, s6, s7, s8, s9, s10, s11, s12, s13].filter(Boolean).forEach(s => {
    try { fs.rmSync(s.lab, { recursive: true, force: true }); } catch {}
  });

  process.stdout.write("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + "\n");
  if (failed > 0) process.exit(Math.min(failed, 63));
}

main().catch(err => {
  process.stderr.write("test error: " + (err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
