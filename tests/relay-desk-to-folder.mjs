/* BOARD 945 STAGE 3 (a): A RELAY DESK FOLLOWS ITS TEAM TO A SHARED FOLDER
 *
 *   node tests/relay-desk-to-folder.mjs
 *
 * Driven through the app's own whenReady path with stubbed electron and mocked relay channel,
 * as tests/relay-desk-follow.mjs is.
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
const REAL_CORE = nodeRequire(path.join(ROOT, "relay", "core.cjs"));

const BUILTIN_RELAY = "https://etiuda.dev/relay/v1";
const EXPECTED = 16;

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

const noop = () => {};

/* Memory KV store stand-in for relay core */
function memoryStore() {
  const map = new Map();
  return {
    get: k => map.get(k),
    put: (k, v) => map.set(k, v),
    del: k => map.delete(k),
    list: (prefix, opts) => {
      const keys = Array.from(map.keys()).filter(k => k.startsWith(prefix)).sort();
      const res = [];
      for (const k of keys) {
        if (opts && opts.after && k <= opts.after) continue;
        res.push([k, map.get(k)]);
        if (opts && opts.limit && res.length >= opts.limit) break;
      }
      return res;
    },
    atomic: fn => fn(),
  };
}

/* ================================================================================================
   ONE LAUNCH: shell/main.js loaded with stubbed electron, watched fs and mock relay channel.
   ================================================================================================ */
async function launch(plan) {
  const LAB = plan.lab;
  const UD = path.join(LAB, "userdata");
  const SHELL = path.join(LAB, "shell");
  const DOCS = path.join(LAB, "documents");
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
      getLocale: () => "en",
      getPreferredSystemLanguages: () => ["en"],
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
    Menu: new Proxy(function () {}, { get: () => electron.Menu, set: () => true, apply: () => undefined }),
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    net: new Proxy(function () {}, { get: () => electron.net, set: () => true, apply: () => undefined }),
    protocol: new Proxy(function () {}, { get: () => electron.protocol, set: () => true, apply: () => undefined }),
    session: new Proxy(function () {}, { get: () => electron.session, set: () => true, apply: () => undefined }),
    screen: new Proxy(function () {}, { get: () => electron.screen, set: () => true, apply: () => undefined }),
    systemPreferences: new Proxy(function () {}, { get: () => electron.systemPreferences, set: () => true, apply: () => undefined }),
    nativeTheme: { themeSource: "system" },
    powerMonitor: { on: noop },
    globalShortcut: new Proxy(function () {}, { get: () => electron.globalShortcut, set: () => true, apply: () => undefined }),
    safeStorage,
  };

  let createdChannel = null;
  let channelStopped = false;
  let onTeamCallback = null;

  const mockRelay = {
    pathKey: REAL_CHANNEL.pathKey,
    createChannel: opts => {
      onTeamCallback = opts.onTeam;
      createdChannel = {
        opts,
        started: false,
        kicked: false,
        start() { this.started = true; channelStopped = false; },
        async stop() { this.started = false; channelStopped = true; },
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

  // Write new team document into mirror if requested
  if (plan.deliverTeamDoc) {
    fs.writeFileSync(path.join(MIRROR, "etiuda-team.json"), JSON.stringify(plan.deliverTeamDoc, null, 2));
    if (onTeamCallback) {
      onTeamCallback();
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Handle picked folder test actions
  let pickResults = [];
  if (plan.pickActions && Array.isArray(plan.pickActions)) {
    for (const action of plan.pickActions) {
      if (invokeHandlers["etiuda:team-join"]) {
        const res = await invokeHandlers["etiuda:team-join"](ev, "pick-moved-folder", plan.teamId, action.folder);
        pickResults.push(res);
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  // Ask for leads view
  let leads = [];
  if (invokeHandlers["etiuda:team-join"]) {
    const lv = await invokeHandlers["etiuda:team-join"](ev, "leads");
    if (lv && Array.isArray(lv.leads)) leads = lv.leads;
  }

  // Ask for current catalog folder
  if (invokeHandlers["etiuda:open-catalog-folder"]) {
    await invokeHandlers["etiuda:open-catalog-folder"](ev);
  }

  const currentFolder = openedDirs[openedDirs.length - 1] || "";
  let currentFolderDeskFiles = [];
  try {
    currentFolderDeskFiles = fs.readdirSync(path.join(currentFolder, "desks", ownId));
  } catch {}

  return {
    channelStarted: createdChannel ? createdChannel.started : false,
    channelStopped,
    openedDir: currentFolder,
    leads,
    pickResults,
    currentFolderDeskFiles,
    branchReachable: currentFolderDeskFiles.includes("branch-lamp.ec"),
    inUseReachable: currentFolderDeskFiles.includes("in-use.ec"),
    heldBranchReached: plan.holdBranch ? currentFolderDeskFiles.includes(plan.holdBranch.stem + ".ec") : false,
    said,
  };
}

/* ================================================================================================
   SCENARIOS SETUP
   ================================================================================================ */
function makeScenario(extra = {}) {
  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "to-folder-desk-"));
  const ud = path.join(lab, "userdata");
  const docs = path.join(lab, "documents");
  const shell = path.join(lab, "shell");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(shell, { recursive: true });

  const lead = keyPair();
  const stranger = keyPair();
  const ownDesk = keyPair();
  const ownBox = boxPair();
  const teamId = "t-" + crypto.randomBytes(8).toString("hex");
  const rt = crypto.randomBytes(16).toString("hex");
  const teamKey = crypto.randomBytes(32);

  const mirror = path.join(ud, "relay", rt);
  const mirrorOwnDesks = path.join(mirror, "desks", ownDesk.keyId);
  fs.mkdirSync(mirrorOwnDesks, { recursive: true });

  const branchBytes = Buffer.from(JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "lamp", rev: 1 }));
  fs.writeFileSync(path.join(mirrorOwnDesks, "branch-lamp.ec"), branchBytes);

  const inUseDoc = { format: 1, kind: "etiuda-in-use", desk: { id: ownDesk.keyId } };
  fs.writeFileSync(path.join(mirrorOwnDesks, "in-use.ec"), JSON.stringify(inUseDoc));

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
    channel: { kind: "relay", rt, url: BUILTIN_RELAY },
    ring: { format: 1, kind: "etiuda-ring", keys: [{ catalog: "lamp", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] },
    roster: [{ desk: { id: ownDesk.keyId, key: ownDesk.public, box: ownBox.public } }],
  };

  fs.writeFileSync(path.join(mirror, "etiuda-team.json"), JSON.stringify(signTeamDoc(initialTeamDoc, lead), null, 2));

  const env = {
    kind: "etiuda-desk",
    schema: 1,
    keys: {
      eCatalogFolder: docs,
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
    teamPinFrom: {
      [teamId]: "invite",
    },
    teamChannel: {
      [teamId]: { kind: "relay", rt, url: BUILTIN_RELAY },
    },
    teamRevSeen: {
      [teamId]: { [lead.public]: { epoch: 1, rev: 1 } },
    },
    teamKeys: {
      [teamId]: { 1: safeStorage.encryptString(teamKey.toString("base64")).toString("base64") },
    },
  };

  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(env, null, 2));

  const movedTeamDoc = JSON.parse(JSON.stringify(initialTeamDoc));
  movedTeamDoc.rev = 2;
  movedTeamDoc.channel = { kind: "folder" };

  return {
    lab,
    mirrorFolder: mirror,
    ownDeskId: ownDesk.keyId,
    teamId,
    lead,
    stranger,
    initialTeamDoc,
    movedTeamDoc,
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

  /* Scenario 1: Folder team file from pinned lead stops channel (945f1) */
  const s1 = makeScenario();
  const plan1 = Object.assign({}, s1, {
    deliverTeamDoc: signTeamDoc(s1.movedTeamDoc, s1.lead),
  });
  const r1 = runScenario(plan1);
  check(
    !r1.channelStarted && r1.channelStopped,
    "945f1 a folder team file from the pinned lead through the relay stops the channel: "
    + JSON.stringify({ started: r1.channelStarted, stopped: r1.channelStopped })
  );

  /* Scenario 2: Matching folder among known roots is taken with no action (945f2, 945f3) */
  const s2 = makeScenario();
  const knownFolder = path.join(s2.lab, "known-folder");
  fs.mkdirSync(knownFolder, { recursive: true });
  fs.writeFileSync(path.join(knownFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(s2.movedTeamDoc, s2.lead), null, 2));
  // Record this folder in teamJoin.invite.folder (a known root)
  const deskJsonPath = path.join(s2.lab, "userdata", "desk.json");
  const deskEnv = JSON.parse(fs.readFileSync(deskJsonPath, "utf8"));
  deskEnv.teamJoin = {
    team: s2.teamId,
    file: "etiuda-join-" + s2.teamId + ".json",
    nonce: crypto.randomBytes(32).toString("hex"),
    commit: crypto.randomBytes(32).toString("hex"),
    asked: Date.now(),
    held: 0,
    name: "Desk",
    invite: {
      id: crypto.randomBytes(8).toString("hex"),
      proof: crypto.randomBytes(32).toString("hex"),
      lead: { keyId: s2.lead.keyId, public: s2.lead.public, name: "Lead" },
      folder: knownFolder,
    },
  };
  fs.writeFileSync(deskJsonPath, JSON.stringify(deskEnv, null, 2));

  const plan2 = Object.assign({}, s2, {
    deliverTeamDoc: signTeamDoc(s2.movedTeamDoc, s2.lead),
  });
  const r2 = runScenario(plan2);

  check(
    path.resolve(r2.openedDir) === path.resolve(knownFolder),
    "945f2 a matching folder among the known roots is taken with no action: "
    + JSON.stringify({ openedDir: r2.openedDir, expected: knownFolder })
  );

  check(
    r2.branchReachable && r2.inUseReachable,
    "945f3 on automatic switch to matching folder, desk branch and in-use reach the folder: "
    + JSON.stringify(r2.currentFolderDeskFiles)
  );

  /* Scenario 3: None found shows sentence and offers Open a folder (945f4) */
  const s3 = makeScenario();
  const plan3 = Object.assign({}, s3, {
    deliverTeamDoc: signTeamDoc(s3.movedTeamDoc, s3.lead),
  });
  const r3 = runScenario(plan3);
  const saidMeets = r3.said.some(s => s.includes("This team now works from a shared folder. The team's lead can say which one; once it is open here with Open a folder, everything carries on as before."));
  const leadRow = r3.leads.find(l => l.team === s3.teamId);
  const offersOpen = leadRow && leadRow.needsFolder === true && leadRow.openFolder === "Open a folder";

  check(
    saidMeets && offersOpen,
    "945f4 none found shows the sentence and Open a folder: "
    + JSON.stringify({ saidMeets, offersOpen, leadRow })
  );

  /* Scenario 4: Picked folder validations and refusal (945f5, 945f6, 945f7) */
  const s4 = makeScenario();
  const wrongTeamFolder = path.join(s4.lab, "wrong-team-folder");
  fs.mkdirSync(wrongTeamFolder, { recursive: true });
  const wrongTeamDoc = JSON.parse(JSON.stringify(s4.movedTeamDoc));
  wrongTeamDoc.id = "t-" + crypto.randomBytes(8).toString("hex");
  fs.writeFileSync(path.join(wrongTeamFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(wrongTeamDoc, s4.lead), null, 2));

  const otherLeadFolder = path.join(s4.lab, "other-lead-folder");
  fs.mkdirSync(otherLeadFolder, { recursive: true });
  const otherLeadDoc = JSON.parse(JSON.stringify(s4.movedTeamDoc));
  otherLeadDoc.lead = { keyId: s4.stranger.keyId, public: s4.stranger.public };
  fs.writeFileSync(path.join(otherLeadFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(otherLeadDoc, s4.stranger), null, 2));

  const lowerRevFolder = path.join(s4.lab, "lower-rev-folder");
  fs.mkdirSync(lowerRevFolder, { recursive: true });
  const lowerRevDoc = JSON.parse(JSON.stringify(s4.movedTeamDoc));
  lowerRevDoc.rev = 1; // received was 2
  fs.writeFileSync(path.join(lowerRevFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(lowerRevDoc, s4.lead), null, 2));

  const plan4 = Object.assign({}, s4, {
    deliverTeamDoc: signTeamDoc(s4.movedTeamDoc, s4.lead),
    pickActions: [
      { folder: wrongTeamFolder },
      { folder: otherLeadFolder },
      { folder: lowerRevFolder },
    ],
  });
  const r4 = runScenario(plan4);

  const refusedWrongTeam = r4.pickResults[0] && r4.pickResults[0].ok === false;
  const saidWrongTeam = r4.said.some(s => s.includes("That folder holds no files of this team, so nothing was changed. The team's lead can say which folder it is."));
  check(
    refusedWrongTeam && saidWrongTeam && path.resolve(r4.openedDir) !== path.resolve(wrongTeamFolder),
    "945f5 a picked folder with the wrong team id is refused and nothing changes: "
    + JSON.stringify({ res: r4.pickResults[0], saidWrongTeam })
  );

  const refusedWrongLead = r4.pickResults[1] && r4.pickResults[1].ok === false;
  const saidWrongLead = r4.said.some(s => s.includes("The team file in that folder is not signed by this team's lead, so nothing was changed. Tell the team's lead about it."));
  check(
    refusedWrongLead && saidWrongLead && path.resolve(r4.openedDir) !== path.resolve(otherLeadFolder),
    "945f6 a picked folder with another lead's signature is refused and nothing changes: "
    + JSON.stringify({ res: r4.pickResults[1], saidWrongLead })
  );

  const refusedLowerRev = r4.pickResults[2] && r4.pickResults[2].ok === false;
  const saidLowerRev = r4.said.some(s => s.includes("The team file in that folder is older than the one this desk holds, so nothing was changed. The team's lead can say which folder is the current one."));
  check(
    refusedLowerRev && saidLowerRev && path.resolve(r4.openedDir) !== path.resolve(lowerRevFolder),
    "945f7 a picked folder with a lower rev is refused and nothing changes: "
    + JSON.stringify({ res: r4.pickResults[2], saidLowerRev })
  );

  /* Scenario 5: Picked matching folder is taken (945f8) */
  const s5 = makeScenario();
  const validFolder = path.join(s5.lab, "valid-folder");
  fs.mkdirSync(validFolder, { recursive: true });
  fs.writeFileSync(path.join(validFolder, "etiuda-team.json"), JSON.stringify(signTeamDoc(s5.movedTeamDoc, s5.lead), null, 2));

  const plan5 = Object.assign({}, s5, {
    deliverTeamDoc: signTeamDoc(s5.movedTeamDoc, s5.lead),
    pickActions: [{ folder: validFolder }],
  });
  const r5 = runScenario(plan5);

  check(
    r5.pickResults[0] && r5.pickResults[0].ok === true && path.resolve(r5.openedDir) === path.resolve(validFolder) && r5.branchReachable,
    "945f8 a picked matching folder is taken: "
    + JSON.stringify({ res: r5.pickResults[0], openedDir: r5.openedDir, branchReachable: r5.branchReachable })
  );

  /* Scenario 6: Team file from stranger changes nothing (945f9) */
  const s6 = makeScenario();
  const plan6 = Object.assign({}, s6, {
    deliverTeamDoc: signTeamDoc(s6.movedTeamDoc, s6.stranger),
  });
  const r6 = runScenario(plan6);

  check(
    r6.channelStarted && !r6.channelStopped,
    "945f9 a team file naming the folder from a key other than the pinned lead changes nothing: "
    + JSON.stringify({ started: r6.channelStarted, stopped: r6.channelStopped })
  );

  /* Scenario 7: Relay in read-only accepts folder team file, refuses relay team file & edition (945f10) */
  {
    const st = memoryStore();
    let now = 1000000;
    const core = REAL_CORE.createCore({
      store: st,
      clock: () => now,
      roots: [REAL_CORE.ROOT_PUB],
    });

    const leadK = keyPair();
    const rt = crypto.randomBytes(16).toString("hex");
    const until = now + 1000; // paid grant until
    // Create team in store
    st.put("team", { rt, lead: { keyId: leadK.keyId, pub: leadK.public }, epoch: 1, until, paid: true, made: now, secret: "sec" });
    // Advance clock past 30-day working span into read-only (e.g. until + 35 days)
    now = until + REAL_CORE.WORK_AFTER_MS + 5 * 24 * 3600 * 1000;

    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    st.put("ses:" + hash, { key: leadK.keyId, inv: null, until: now + 60000 });

    const folderMeta = {
      id: crypto.randomBytes(16).toString("hex"),
      supersedes: null,
      epoch: 1,
      writer: leadK.keyId,
      counter: 1,
      del: false,
      sig: "00".repeat(64),
      nonce: "00".repeat(12),
      place: "root",
      pub: null,
      channel: { kind: "folder" },
    };

    const relayMeta = {
      id: crypto.randomBytes(16).toString("hex"),
      supersedes: null,
      epoch: 1,
      writer: leadK.keyId,
      counter: 2,
      del: false,
      sig: "00".repeat(64),
      nonce: "00".repeat(12),
      place: "root",
      pub: null,
      channel: { kind: "relay", rt, url: BUILTIN_RELAY },
    };

    const editionMeta = {
      id: crypto.randomBytes(16).toString("hex"),
      supersedes: null,
      epoch: 1,
      writer: leadK.keyId,
      counter: 3,
      del: false,
      sig: "00".repeat(64),
      nonce: "00".repeat(12),
      place: "root",
      pub: null,
    };

    const admFolder = core.admit(rt, token, folderMeta, folderMeta.id);
    const admRelay = core.admit(rt, token, relayMeta, relayMeta.id);
    const admEdition = core.admit(rt, token, editionMeta, editionMeta.id);

    const roOk = admFolder.ok === true
      && admRelay.ok === false && (admRelay.reason === "team-lapsed" || admRelay.error === "team-lapsed")
      && admEdition.ok === false && (admEdition.reason === "team-lapsed" || admEdition.error === "team-lapsed");

    check(
      roOk,
      "945f10 the relay in read-only accepts the lead's folder-channel team file and still refuses a relay-channel one and an edition: "
      + JSON.stringify({ folder: admFolder.ok, relay: admRelay.reason || admRelay.error, edition: admEdition.reason || admEdition.error })
    );
  }

  /* Scenario 8: Plants verification in scratch copy (945f11 - 945f16) */
  const mainPath = path.join(ROOT, "shell", "main.js");
  const origMain = fs.readFileSync(mainPath, "utf8");

  function testMainPlant(plantTag, mutator, plan) {
    const lines = origMain.split(/\n/);
    const at = lines.findIndex(l => l.includes(plantTag));
    if (at < 0) return { found: false, turned: false, shaSame: true };
    mutator(lines, at);
    const scratchSrc = lines.join("\n");
    const testPlan = Object.assign({}, plan, { scratchMainSource: scratchSrc });
    const res = runScenario(testPlan);
    const shaSame = fs.readFileSync(mainPath, "utf8") === origMain;
    return { found: true, res, shaSame };
  }

  // 945f11: lifting plant:folder-stop-relay turns 945f1 red
  {
    const sc = makeScenario();
    const p = testMainPlant("plant:folder-stop-relay", (lines, at) => {
      lines[at] = "        /* plant:folder-stop-relay */";
    }, Object.assign({}, sc, { deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead) }));
    const turned = p.found && (p.res.channelStarted || !p.res.channelStopped);
    check(
      turned && p.shaSame,
      "945f11 lifting plant:folder-stop-relay turns 945f1 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
  }

  // 945f12: lifting plant:folder-known-root turns 945f2 red
  {
    const sc = makeScenario();
    const kf = path.join(sc.lab, "known-folder");
    fs.mkdirSync(kf, { recursive: true });
    fs.writeFileSync(path.join(kf, "etiuda-team.json"), JSON.stringify(signTeamDoc(sc.movedTeamDoc, sc.lead), null, 2));
    const deskPath = path.join(sc.lab, "userdata", "desk.json");
    const de = JSON.parse(fs.readFileSync(deskPath, "utf8"));
    de.teamJoin = {
      team: sc.teamId,
      file: "etiuda-join-" + sc.teamId + ".json",
      nonce: crypto.randomBytes(32).toString("hex"),
      commit: crypto.randomBytes(32).toString("hex"),
      asked: Date.now(),
      held: 0,
      name: "Desk",
      invite: {
        id: crypto.randomBytes(8).toString("hex"),
        proof: crypto.randomBytes(32).toString("hex"),
        lead: { keyId: sc.lead.keyId, public: sc.lead.public, name: "Lead" },
        folder: kf,
      },
    };
    fs.writeFileSync(deskPath, JSON.stringify(de, null, 2));

    const p = testMainPlant("plant:folder-known-root", (lines, at) => {
      lines[at] = "    /* plant:folder-known-root */";
    }, Object.assign({}, sc, { deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead) }));
    const turned = p.found && (path.resolve(p.res.openedDir) !== path.resolve(kf));
    check(
      turned && p.shaSame,
      "945f12 lifting plant:folder-known-root turns 945f2 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
  }

  // 945f13: lifting plant:folder-not-found-offer turns 945f4 red
  {
    const sc = makeScenario();
    const p = testMainPlant("plant:folder-not-found-offer", (lines, at) => {
      lines[at] = "        /* plant:folder-not-found-offer */";
    }, Object.assign({}, sc, { deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead) }));
    const turned = p.found && (!p.res.said.some(s => s.includes("This team now works from a shared folder. The team's lead can say which one; once it is open here with Open a folder, everything carries on as before."))
      || !(p.res.leads.find(l => l.team === sc.teamId) || {}).needsFolder);
    check(
      turned && p.shaSame,
      "945f13 lifting plant:folder-not-found-offer turns 945f4 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
  }

  // 945f14: lifting plant:folder-picked-validate turns 945f5 red
  {
    const sc = makeScenario();
    const wt = path.join(sc.lab, "wrong-team");
    fs.mkdirSync(wt, { recursive: true });
    const td = JSON.parse(JSON.stringify(sc.movedTeamDoc));
    td.id = "t-" + crypto.randomBytes(8).toString("hex");
    fs.writeFileSync(path.join(wt, "etiuda-team.json"), JSON.stringify(signTeamDoc(td, sc.lead), null, 2));

    const p = testMainPlant("plant:folder-picked-validate", (lines, at) => {
      lines[at] = "  /* plant:folder-picked-validate */";
    }, Object.assign({}, sc, {
      deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead),
      pickActions: [{ folder: wt }],
    }));
    const turned = p.found && (p.res.pickResults[0] && p.res.pickResults[0].ok === true);
    check(
      turned && p.shaSame,
      "945f14 lifting plant:folder-picked-validate turns 945f5 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
  }

  // 945f15: lifting plant:folder-picked-match turns 945f8 red
  {
    const sc = makeScenario();
    const vf = path.join(sc.lab, "valid-folder");
    fs.mkdirSync(vf, { recursive: true });
    fs.writeFileSync(path.join(vf, "etiuda-team.json"), JSON.stringify(signTeamDoc(sc.movedTeamDoc, sc.lead), null, 2));

    const p = testMainPlant("plant:folder-picked-match", (lines, at) => {
      lines[at] = "  /* plant:folder-picked-match */";
    }, Object.assign({}, sc, {
      deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead),
      pickActions: [{ folder: vf }],
    }));
    const turned = p.found && (!p.res.pickResults[0] || p.res.pickResults[0].ok !== true || path.resolve(p.res.openedDir) !== path.resolve(vf));
    check(
      turned && p.shaSame,
      "945f15 lifting plant:folder-picked-match turns 945f8 red: turned=" + turned + ", shaSame=" + p.shaSame
    );
    try { fs.rmSync(sc.lab, { recursive: true, force: true }); } catch {}
  }

  // 945f16: lifting plant:lapse-folder turns 945f10 red
  {
    const corePath = path.join(ROOT, "relay", "core.cjs");
    const origCore = fs.readFileSync(corePath, "utf8");
    const lines = origCore.split(/\n/);
    const at = lines.findIndex(l => l.includes("plant:lapse-folder"));
    let turned = false;
    if (at >= 0) {
      lines[at] = "    /* plant:lapse-folder */";
      const scratchCoreSrc = lines.join("\n");
      const scratchPath = path.join(path.dirname(corePath), "scratch-core-" + crypto.randomBytes(4).toString("hex") + ".cjs");
      fs.writeFileSync(scratchPath, scratchCoreSrc);
      const scratchCore = nodeRequire(scratchPath);

      const st = memoryStore();
      const now = 2000000;
      const core = scratchCore.createCore({
        store: st,
        clock: () => now,
        roots: [scratchCore.ROOT_PUB],
      });
      const leadK = keyPair();
      const rt = crypto.randomBytes(16).toString("hex");
      const until = now - 35 * 24 * 3600 * 1000;
      st.put("team", { rt, lead: { keyId: leadK.keyId, pub: leadK.public }, epoch: 1, until, paid: true, made: now, secret: "sec" });
      const token = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      st.put("ses:" + hash, { key: leadK.keyId, inv: null, until: now + 60000 });

      const folderMeta = {
        id: crypto.randomBytes(16).toString("hex"),
        supersedes: null,
        epoch: 1,
        writer: leadK.keyId,
        counter: 1,
        del: false,
        sig: "00".repeat(64),
        nonce: "00".repeat(12),
        place: "root",
        pub: null,
        channel: { kind: "folder" },
      };
      const adm = core.admit(rt, token, folderMeta, folderMeta.id);
      turned = adm.ok === false && (adm.reason === "team-lapsed" || adm.error === "team-lapsed");
      try { fs.unlinkSync(scratchPath); } catch {}
    }
    const shaSame = fs.readFileSync(corePath, "utf8") === origCore;
    check(
      turned && shaSame,
      "945f16 lifting plant:lapse-folder turns 945f10 red: turned=" + turned + ", shaSame=" + shaSame
    );
  }

  // Cleanup scenario directories
  [s1, s2, s3, s4, s5, s6].forEach(s => {
    try { fs.rmSync(s.lab, { recursive: true, force: true }); } catch {}
  });

  process.stdout.write("#counts checks=" + asserted + " failed=" + failed + "\n");
  if (asserted !== EXPECTED) {
    process.stderr.write("checks count differs from EXPECTED " + EXPECTED + ": " + asserted + "\n");
    process.exit(78);
  }
  if (failed > 0) process.exit(Math.min(failed, 63));
}

main().catch(err => {
  process.stderr.write("test error: " + (err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
