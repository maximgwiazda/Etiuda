/* A TEAM'S MOVE FROM THE RELAY TO A SHARED FOLDER IS GONE (folder removal P1; Max, 2026-11-22 15:37, of the shared folder: "remove it,
 * burn it with fire"; 2026-11-23 09:24: "A fault only an older build relative to the first public release can reach IS NOT A FAULT.").
 *
 *   node tests/folder-move-gone.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIM. A team file that names a folder channel, signed by the team's pinned lead at a higher rev, changes nothing at a desk on
 * the team's relay: the relay channel stays, the relay's mirror stays the catalog folder, nothing is made for a folder, and the shell
 * has no move, no moved-team row and no Open a folder. This is the file that was tests/relay-desk-to-folder.mjs (board 945), whose
 * harness it keeps: driven through the app's own whenReady path with stubbed electron and a mocked relay channel, as
 * tests/relay-desk-follow.mjs is.
 *
 * ids: fmg1 a folder-channel file from the pinned lead changes nothing; fmg2 from any other key it changes nothing either; fmg3 a
 * moved-folder pick is no operation; fmg4 the shell, the channel and the page declare no move; fmg5 the relay in read-only has no
 * folder arm; fmg6 the built page holds none of it.
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
/* Every reg call is answered by the stand-in, the policy key as not there, so no read of this machine's registry fails into a wait
   for machine policy (tests/reg-stand.cjs; review 09, finding 4). */
nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const REAL_CHANNEL = nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
const REAL_CORE = nodeRequire(path.join(ROOT, "relay", "core.cjs"));
const REAL_BLOB = nodeRequire(path.join(ROOT, "shell", "relay", "blob.cjs"));

const BUILTIN_RELAY = "https://etiuda.dev/relay/v1";
const EXPECTED = 7;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

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
  const pageListeners = {};
  const dialogAsked = [];

  const pageWin = {
    isDestroyed: () => false,
    isVisible: () => true, /* the shell asks since board 952, which tells the page when the window is on screen */
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
      send: (ch, ...args) => { (pageListeners[ch] || []).forEach(fn => fn({}, ...args)); },
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
      showOpenDialog: async (...args) => {
        const opts = args[args.length - 1] || {};
        dialogAsked.push(String(opts.title || ""));
        const pick = plan.dialogPicks && plan.dialogPicks.shift();
        return pick ? { canceled: false, filePaths: [pick] } : { canceled: true, filePaths: [] };
      },
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
      if (plan.syncerAt && typeof n === "string" && n.endsWith(path.join("folder", "syncer.cjs"))) return nodeRequire(plan.syncerAt);
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
        /* The shell reads a moved folder only after its own picker returned that path. */
        const savedPicks = plan.dialogPicks;
        plan.dialogPicks = [action.folder];
        const picked = invokeHandlers["etiuda:pick-catalog-folder"]
          ? await invokeHandlers["etiuda:pick-catalog-folder"](ev, "Library")
          : "";
        plan.dialogPicks = savedPicks;
        const res = await invokeHandlers["etiuda:team-join"](ev, "pick-moved-folder", plan.teamId, picked);
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
    currentFolderDeskHeld: currentFolderDeskFiles.reduce((o, f) => {
      const at = path.join(currentFolder, "desks", ownId, f);
      try { o[f] = { writable: (fs.statSync(at).mode & 0o200) !== 0, sha: crypto.createHash("sha256").update(fs.readFileSync(at)).digest("hex").slice(0, 12) }; } catch {}
      return o;
    }, {}),
    branchReachable: currentFolderDeskFiles.includes("branch-lamp.ec"),
    inUseReachable: currentFolderDeskFiles.includes("in-use.ec"),
    heldBranchReached: plan.holdBranch ? currentFolderDeskFiles.includes(plan.holdBranch.stem + ".ec") : false,
    said,
    envelope: (() => { try { return JSON.parse(fs.readFileSync(path.join(UD, "desk.json"), "utf8")); } catch { return null; } })(),
    folderMirrorMade: fs.existsSync(path.join(UD, "folder-mirror")),
  };
}

/* ================================================================================================
   SCENARIOS SETUP
   ================================================================================================ */
let RUN_PARENT = null;

function makeScenario(extra = {}) {
  const lab = fs.mkdtempSync(path.join(RUN_PARENT || os.tmpdir(), "to-folder-desk-"));
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


let asserted = 0, failed = 0, skipped = 0;
function skip(line) {
  skipped++;
  process.stdout.write("  SKIP " + line + "\n");
}
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

/* What a desk on the relay shows after a folder-channel file reached its mirror: nothing moved. */
function stayed(r, plan) {
  const row = (r.leads || []).find(l => l.team === plan.teamId) || {};
  const had = r.envelope && r.envelope.teamChannel && r.envelope.teamChannel[plan.teamId];
  return r.channelStarted && !r.channelStopped && path.resolve(r.openedDir) === path.resolve(plan.mirrorFolder)
    && !!had && had.kind === "relay" && !!r.envelope && !("teamNeedsFolder" in r.envelope) && !r.folderMirrorMade
    && row.needsFolder === undefined && row.openFolder === undefined && row.meetsInFolder === undefined
    && !r.said.some(l => /works from a shared folder/.test(l));
}
const stayedText = (r, plan) => JSON.stringify({ started: r.channelStarted, stopped: r.channelStopped, opened: path.resolve(r.openedDir) === path.resolve(plan.mirrorFolder) ? "the relay's mirror" : r.openedDir,
  channel: r.envelope && r.envelope.teamChannel && r.envelope.teamChannel[plan.teamId] && r.envelope.teamChannel[plan.teamId].kind,
  needs: !!(r.envelope && "teamNeedsFolder" in r.envelope), folderMirror: r.folderMirrorMade });

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

  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), "to-folder-desk-run-"));
  RUN_PARENT = runParent;
  let exitCode = 0;
  const scenarios = [];
  try {
    /* fmg1 (was 945f1, "a folder team file from the pinned lead through the relay stops the channel"): it changes nothing. */
    const s1 = makeScenario(); scenarios.push(s1);
    const plan1 = Object.assign({}, s1, { deliverTeamDoc: signTeamDoc(s1.movedTeamDoc, s1.lead) });
    const r1 = runScenario(plan1);
    check(stayed(r1, plan1),
      "fmg1 a team file naming a folder channel, from the pinned lead at a higher rev, reaches a relay desk's mirror and changes nothing: the relay channel stays started,"
      + " the relay's mirror stays the catalog folder, the desk's team channel stays the relay, and no folder, folder mirror or moved-team row is made: " + stayedText(r1, plan1));

    /* fmg1b: the deciding line, in a scratch copy of the shell. */
    if (process.env.ETIUDA_PLANTS === "off") skip("fmg1b lifting plant:folder-channel-unread turns fmg1 red (ETIUDA_PLANTS=off)");
    else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const orig = fs.readFileSync(mainPath, "utf8");
      const lines = orig.split("\n"), at = lines.findIndex(l => l.includes("plant:folder-channel-unread"));
      let turned = false;
      if (at >= 0) {
        lines.splice(at, 1);
        const sc = makeScenario(); scenarios.push(sc);
        const p = Object.assign({}, sc, { deliverTeamDoc: signTeamDoc(sc.movedTeamDoc, sc.lead), scratchMainSource: lines.join("\n") });
        turned = !stayed(runScenario(p), p);
      }
      check(at >= 0 && turned && fs.readFileSync(mainPath, "utf8") === orig,
        "fmg1b lifting plant:folder-channel-unread turns fmg1 red, and shell/main.js is untouched: line " + (at >= 0 ? "found" : "absent") + ", turned " + turned);
    }

    /* fmg2 (was 945f9, "a team file naming the folder from a key other than the pinned lead changes nothing"). */
    const s2 = makeScenario(); scenarios.push(s2);
    const plan2 = Object.assign({}, s2, { deliverTeamDoc: signTeamDoc(s2.movedTeamDoc, s2.stranger) });
    const r2 = runScenario(plan2);
    check(stayed(r2, plan2),
      "fmg2 a team file naming a folder channel, signed by a key other than the pinned lead, changes nothing either: " + stayedText(r2, plan2));

    /* fmg3 (was 945f5 to 945f8, a picked folder taken, or refused for its team, lead or rev): the shell has no such operation, so the page's
       press, if one were sent, is answered as any unknown one is, with the join view and no verdict, and the catalog folder stays. */
    const s3 = makeScenario(); scenarios.push(s3);
    const yard = path.join(s3.lab, "moved-folder");
    fs.mkdirSync(yard, { recursive: true });
    fs.writeFileSync(path.join(yard, "etiuda-team.json"), JSON.stringify(signTeamDoc(s3.movedTeamDoc, s3.lead), null, 2));
    const plan3 = Object.assign({}, s3, { pickActions: [{ folder: yard }] });
    const r3 = runScenario(plan3);
    const res3 = r3.pickResults[0];
    check(!!res3 && res3.ok === undefined && res3.error === undefined && stayed(r3, plan3),
      "fmg3 the shell answers a moved-folder pick, for a folder its own picker returned that holds the team's file at a higher rev, as an unknown operation: no verdict, and the relay's mirror stays the catalog folder: "
      + JSON.stringify({ answered: !res3 ? "nothing" : res3.ok !== undefined ? "ok " + res3.ok : res3.error ? "error " + res3.error : "the join view" }) + " " + stayedText(r3, plan3));

    /* fmg4: no tree declares a move. */
    const mainText = read("shell", "main.js"), chan = read("shell", "relay", "channel.cjs"), pageText = read("src", "modules", "team-join.js") + read("src", "modules", "settings.js");
    const gone = [["shell/main.js", mainText, /\b(?:copyDeskFilesToFolder|checkMatchingFolder|findMatchingFolderInKnownRoots|switchToFolderTeam|setTeamNeedsFolder|pickMovedFolder|teamNeedsFolder|isFolderMove|pick-moved-folder|teamMeetsInFolder|folderRefused(?:WrongTeam|WrongLead|LowerRev)|meetsInFolder)\b/],
      /* The variable, not the word: a refusal sentence may say "moving the key number" (the removals piece). */
      ["shell/relay/channel.cjs", chan, /plant:relay-to-folder|\b(?:let|const|var)\s+moving\b|[(!&|]\s*moving\b/],
      ["the page", pageText, /pickMovedFolder|needsFolder|data-team-pick-folder|pick-moved-folder|Open a folder/]];
    const still = gone.filter(g => g[2].test(g[1])).map(g => g[0] + ": " + (g[1].match(g[2]) || [""])[0]);
    check(still.length === 0,
      "fmg4 the shell, the relay channel and the page declare no move to a folder, no moved-team row and no Open a folder: still present " + JSON.stringify(still));

    /* fmg5 (was 945f10): the relay has no folder arm, so read-only refuses a relay-channel team file and an edition alike. */
    {
      const st = memoryStore();
      let now = 1000000;
      const core = REAL_CORE.createCore({ store: st, clock: () => now, roots: [REAL_CORE.ROOT_PUB] });
      const leadK = keyPair();
      const rt = crypto.randomBytes(16).toString("hex");
      const until = now + 1000;
      st.put("team", { rt, lead: { keyId: leadK.keyId, pub: leadK.public }, epoch: 1, until, paid: true, made: now, secret: "sec" });
      now = until + REAL_CORE.WORK_AFTER_MS + 5 * 24 * 3600 * 1000;
      const token = crypto.randomBytes(32).toString("hex");
      st.put("ses:" + crypto.createHash("sha256").update(token).digest("hex"), { key: leadK.keyId, inv: null, until: now + 60000 });
      const meta = (counter, extra) => Object.assign({ id: crypto.randomBytes(16).toString("hex"), supersedes: null, epoch: 1, writer: leadK.keyId, counter, del: false,
        sig: "00".repeat(64), nonce: "00".repeat(12), place: "root", pub: null }, extra || {});
      const m1 = meta(2, { channel: { kind: "relay", rt, url: BUILTIN_RELAY } }), m2 = meta(3);
      const a1 = core.admit(rt, token, m1, m1.id), a2 = core.admit(rt, token, m2, m2.id);
      const lapsed = a => a.ok === false && (a.reason === "team-lapsed" || a.error === "team-lapsed");
      check(lapsed(a1) && lapsed(a2),
        "fmg5 the relay in read-only refuses the lead's relay-channel team file and an edition team-lapsed, and has no folder arm to name: "
        + JSON.stringify({ relay: a1.reason || a1.error, edition: a2.reason || a2.error }));
    }

    /* fmg6: the built page and the Polish table. */
    const built = read("engine", "etiuda.html");
    const sayings = ["now works from a shared folder", "Open a folder", "Ten zespół pracuje teraz ze wspólnego folderu", "data-team-pick-folder", "pick-moved-folder"];
    const inBuilt = sayings.filter(w => built.indexOf(w) >= 0);
    const table = read("src", "modules", "ui-lang.js");
    const inTable = sayings.slice(0, 3).filter(w => table.indexOf(w) >= 0);
    check(inBuilt.length === 0 && inTable.length === 0,
      "fmg6 neither the built page nor the Polish table holds the moved team's sentence, its button or its press: built " + JSON.stringify(inBuilt) + ", table " + JSON.stringify(inTable));

    process.stdout.write("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + "\n");
    if (asserted + skipped !== EXPECTED) {
      process.stderr.write("checks count differs from EXPECTED " + EXPECTED + ": " + (asserted + skipped) + "\n");
      exitCode = 78;
    } else if (failed > 0) {
      exitCode = Math.min(failed, 63);
    }
  } finally {
    RUN_PARENT = null;
    scenarios.forEach(s => { try { fs.rmSync(s.lab, { recursive: true, force: true }); } catch {} });
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(runParent, { recursive: true, force: true }); } catch {}
      if (!fs.existsSync(runParent)) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
  if (exitCode !== 0) process.exit(exitCode);
}

main().catch(err => {
  process.stderr.write("test error: " + (err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
