/* A desk asks to join the team a sealed catalog belongs to, driven in bare node: the real shell/main.js under stubbed
 * electron over a shared catalog folder, the lead played by the same pure declarations Studio slices from that file.
 * Board 834, step 12, slice 5.
 *
 *     node tests/team-join.mjs        exit code is the number of failed checks, capped at 63
 *
 * COMMIT THEN REVEAL. The request commits to the desk's nonce; the lead's opening names a nonce of its own; the desk
 * reveals only against the first opening it reads for its commitment, and the code covers both nonces, both desk keys
 * and the lead's key. So the oracle for a code is the pure joinCode over what each side holds, never the shell's word.
 * A reveal keeps an invitation's id, proof and kind as yes wrote them. A request with no invitation gains only the
 * opening.
 *
 * The shell runs from a copy of shell/ in a temp folder, so the folder above it holds no catalog of the checkout's.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
/* Every reg call answers from a stand-in, never from this machine's registry (tests/reg-stand.cjs): until 2026-10-13
   this leg passed only because no machine policy and no proxy were set on the machine that ran it. Before the shell loads. */
/* The stand-in reads REG.policy at each reg call, and a desk's shell reads the policy once, at its first ask: so a desk
   loaded and asked while REG.policy is set keeps that policy for its run (15ay, 15az). */
const REG = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), REG);
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 153;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-team-join-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "wrapTeamKey", "joinCommit", "joinCode", "joinGenuine", "joinOpening", "joinSignedBytes",
  "branchSignedBytes", "deskFileGenuine", "readCatalog", "catalogLeadOk", "catalogChanged", "isCatalogName", "JOINS_NAME",
  "memberProof", "inviteCode", "inviteIdOf", "inviteRead", "folderHost", "signedSha", "inviteFolderBelongs", "relayRun", "acceptLink", "askSignedBytes", "rawCatalogFolder"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function makeResponse(status, json, headers = {}) {
  const buf = Buffer.from(JSON.stringify(json), "utf8");
  return {
    status,
    headers: {
      get: n => headers[n.toLowerCase()] || (n.toLowerCase() === "content-type" ? "application/json" : null)
    },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
}
const RelayChannel = () => nodeRequire(path.join(ROOT, "shell", "relay", "channel.cjs"));
const syncerMod = nodeRequire(path.join(ROOT, "shell", "folder", "syncer.cjs"));
const knownTeamKeys = new Map();
const deskProgs = new Map();

function syncFolder(dir) {
  if (!dir) return;
  const targetDir = path.resolve(dir);
  let fileTeamDoc = null;
  const teamFilePath = path.join(targetDir, "etiuda-team.json");
  if (fs.existsSync(teamFilePath)) {
    try { fileTeamDoc = JSON.parse(fs.readFileSync(teamFilePath, "utf8")); } catch {}
  }
  for (const D of DESKS) {
    let env = null;
    try { env = D.envelope(); } catch {}
    if (!env) continue;
    const folders = [];
    if (env.keys && env.keys.eCatalogFolder) folders.push(path.resolve(env.keys.eCatalogFolder));
    if (typeof D.api.rawCatalogFolder === "function") {
      try { const rf = D.api.rawCatalogFolder(); if (rf) folders.push(path.resolve(rf)); } catch {}
    }
    if (env.teamShown) {
      for (const s of Object.values(env.teamShown)) {
        if (s && s.folder) folders.push(path.resolve(s.folder));
      }
    }
    if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.folder) {
      folders.push(path.resolve(env.teamJoin.invite.folder));
    }
    const matches = folders.some(f => targetDir === f || targetDir.startsWith(f + path.sep) || f.startsWith(targetDir + path.sep));
    if (!matches) continue;

    let teamId = fileTeamDoc && fileTeamDoc.id;
    let leadPin = null;
    if (env.teamPins && env.teamPins[teamId]) {
      leadPin = env.teamPins[teamId];
    } else if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.lead) {
      leadPin = env.teamJoin.invite.lead;
    }
    if (!teamId && env.teamPins) {
      for (const [t, p] of Object.entries(env.teamPins)) {
        if (t) { teamId = t; leadPin = p; break; }
      }
    }
    if (!teamId && env.teamJoin && env.teamJoin.team) {
      teamId = env.teamJoin.team;
      leadPin = env.teamJoin.invite && env.teamJoin.invite.lead;
    }
    if (!teamId) continue;

    const mirror = syncerMod.folderMirrorOf(D.ud, teamId);
    const cacheKey = D.ud + ":" + teamId;
    let prog = deskProgs.get(cacheKey);
    if (!prog || prog.folder !== targetDir) {
      prog = syncerMod.createFolderProgram({
        team: teamId,
        folder: targetDir,
        mirror: mirror,
        pin: () => {
          try {
            const e = D.envelope();
            if (e.teamPins && e.teamPins[teamId]) return e.teamPins[teamId];
            if (e.teamJoin && e.teamJoin.invite && env.teamJoin.invite.lead) return e.teamJoin.invite.lead;
          } catch {}
          return leadPin || null;
        },
        floor: (t, leadPub) => {
          try {
            const e = D.envelope();
            return (e.teamRevSeen && e.teamRevSeen[t] && e.teamRevSeen[t][leadPub]) || null;
          } catch {
            return null;
          }
        },
        keyFor: (ep) => {
          if (knownTeamKeys.has(teamId + ":" + ep)) return knownTeamKeys.get(teamId + ":" + ep);
          if (knownTeamKeys.has(teamId + ":" + (+ep))) return knownTeamKeys.get(teamId + ":" + (+ep));
          try {
            const e = D.envelope();
            if (e.teamKeys && e.teamKeys[teamId] && e.teamKeys[teamId][ep]) {
              const ct = e.teamKeys[teamId][ep];
              const dec = D.electron.safeStorage.decryptString(Buffer.from(ct, "base64"));
              const k = Buffer.from(dec, "base64");
              if (k.length === 32) return k;
            }
          } catch {}
          return null;
        },
        authorizedKeys: () => {
          try {
            const e = D.envelope();
            return Object.keys((e.teamRevSeen && e.teamRevSeen[teamId]) || {});
          } catch {
            return [];
          }
        },
        logger: (msg) => { D.said.push(msg); },
      });
      prog.folder = targetDir;
      deskProgs.set(cacheKey, prog);
    }
    prog.syncOnce();
    prog.syncOnce();
  }
}

/* One desk over its own user-data folder, the shell evaluated afresh, from `src` where a leg gives one; the safeStorage
   stand-in is reversible. */
function loadDesk(ud, src, opts) {
  const said = [], invoke = {}, on = {};
  // Every way the shell can log is kept, so a leg can say what reached the log and what did not.
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: s => said.push("WARN " + String(s)),
    info: s => said.push("INFO " + String(s)), debug: s => said.push("DEBUG " + String(s)) };
  const safeStorage = (opts && opts.safeStorage) || {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const net = opts && opts.net ? opts.net : (opts && opts.fetch ? { fetch: opts.fetch } : inert);
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: (opts && opts.dialog) ? opts.dialog : inert, net, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    (src || SRC) + "\nreturn { " + EXPOSE.join(", ")
      + ", setDown: d => { folderDown = d; }, setFolder: v => { if (deskKeys === undefined) deskKeys = readDesk(); deskKeys[CATALOG_FOLDER_KEY] = v; teamStamp = ''; try { const p = path.join(ud, 'desk.json'); const doc = JSON.parse(fs.readFileSync(p, 'utf8')); doc.keys = doc.keys || {}; doc.keys[CATALOG_FOLDER_KEY] = v; fs.writeFileSync(p, JSON.stringify(doc), 'utf8'); } catch {} } };")(
    n => {
      if (n === "electron") return electron;
      if (opts && opts.relayChannel && n.endsWith(path.join("relay", "channel.cjs"))) return opts.relayChannel;
      return nodeRequire(n);
    },
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const origSeal = api.sealCatalog;
  if (origSeal) {
    api.sealCatalog = function (key, team, epoch, cleartext) {
      if (team && epoch && key) knownTeamKeys.set(team + ":" + epoch, key);
      return origSeal.apply(this, arguments);
    };
  }
  const origWrap = api.wrapTeamKey;
  if (origWrap) {
    api.wrapTeamKey = function (key, boxPub, team, epoch, id) {
      if (team && epoch && key) knownTeamKeys.set(team + ":" + epoch, key);
      return origWrap.apply(this, arguments);
    };
  }
  const ask = async (ch, ...args) => {
    try {
      const env = envelope();
      const folders = [];
      if (env.keys && env.keys.eCatalogFolder) folders.push(env.keys.eCatalogFolder);
      if (env.teamShown) for (const s of Object.values(env.teamShown)) { if (s && s.folder) folders.push(s.folder); }
      if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.folder) folders.push(env.teamJoin.invite.folder);
      for (const f of folders) syncFolder(f);
    } catch {}
    const res = await Promise.resolve(invoke[ch](eventFor(), ...args));
    if (ch === "etiuda:team-join" || ch === "etiuda:branch-write") {
      try {
        const env = envelope();
        const folders = [];
        if (env.keys && env.keys.eCatalogFolder) folders.push(env.keys.eCatalogFolder);
        if (env.teamShown) for (const s of Object.values(env.teamShown)) { if (s && s.folder) folders.push(s.folder); }
        if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.folder) folders.push(env.teamJoin.invite.folder);
        for (const f of folders) syncFolder(f);
      } catch {}
    }
    return res;
  };
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  /* A window that only listens: what the shell sends it, by channel. */
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (ch, ...a) => sent.push([ch].concat(a)), once: noop, on: noop } };
  /* A channel the page sends on and may wait for, as tests/catalog-in-use.mjs asks it: the answer is the event's returnValue. */
  const sync = (ch, ...args) => {
    try {
      const env = envelope();
      const folders = [];
      if (env.keys && env.keys.eCatalogFolder) folders.push(env.keys.eCatalogFolder);
      if (env.teamShown) for (const s of Object.values(env.teamShown)) { if (s && s.folder) folders.push(s.folder); }
      if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.folder) folders.push(env.teamJoin.invite.folder);
      for (const f of folders) syncFolder(f);
    } catch {}
    const ev = eventFor();
    if (on[ch]) on[ch](ev, ...args);
    return ev.returnValue;
  };
  const origReadCatalog = api.readCatalog;
  api.readCatalog = function (...args) {
    try {
      const env = envelope();
      const folders = [];
      if (env.keys && env.keys.eCatalogFolder) folders.push(env.keys.eCatalogFolder);
      if (env.teamShown) for (const s of Object.values(env.teamShown)) { if (s && s.folder) folders.push(s.folder); }
      if (env.teamJoin && env.teamJoin.invite && env.teamJoin.invite.folder) folders.push(env.teamJoin.invite.folder);
      for (const f of folders) syncFolder(f);
    } catch {}
    return origReadCatalog.apply(this, args);
  };
  const desk = { api, ask, said, ud, envelope, win, sent, sync, electron, join: (op, file, name, check) => ask("etiuda:team-join", op, file, name, check) };
  DESKS.push(desk);
  return desk;
}
const DESKS = [], SECRETS = [];
function newDesk(name, folder) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
  const d = loadDesk(ud);
  if (folder) syncFolder(folder);
  return d;
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const SHARE = folder("share");
  const D1 = newDesk("one", SHARE);
  const P = D1.api;

  /* ---- the lead, a catalog invented from nothing, and the team ------------------------------------------------- */
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519"), forger = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "lamp-lead", public: pubHex(lead.publicKey) }, FORGED = { keyId: "lamp-lead", public: pubHex(forger.publicKey) };
  const sign = (doc, key, keyId) => {
    const out = JSON.parse(JSON.stringify(doc));
    delete out.sig;
    out.sig = { alg: "Ed25519", keyId: keyId };
    out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
    return out;
  };
  const A1 = JSON.stringify(sign({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Lamp Shop", date: "2026-02-01",
    langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day." } }] },
    lead.privateKey, LEAD.keyId), null, 1) + "\n";
  const TEAM = "t-" + crypto.randomBytes(8).toString("hex"), K1 = crypto.randomBytes(32);
  knownTeamKeys.set(TEAM + ":1", K1);
  const put = (dir, name, t) => {
    fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
    syncFolder(dir);
  };
  const entry = (who, key, epoch) => {
    if (key) knownTeamKeys.set(TEAM + ":" + (epoch || 1), key);
    return { desk: { id: who.id, key: who.key, box: who.box }, wrap: P.wrapTeamKey(key, who.box, TEAM, epoch, who.id) };
  };
  const teamFile = (roster, o) => sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"],
    lead: (o && o.lead) || LEAD, sealed: true, exportsSealed: false, epoch: 1, roster: roster },
    (o && o.signer) || lead.privateKey, LEAD.keyId);
  const joins = (open, o) => ({ format: 1, kind: "etiuda-team-joins", team: TEAM, lead: (o && o.lead) || LEAD, open: open });
  const nonce = () => crypto.randomBytes(32).toString("hex");
  const reqOf = me => path.join(SHARE, "desks", me.id, "join.json");
  const request = me => { try { return JSON.parse(fs.readFileSync(reqOf(me), "utf8")); } catch { return null; } };
  const kept = D => D.envelope().teamJoin || null;

  /* ---- the pure half: the code, the commitment, the request's signature, the opening ------------------------- */
  const h = () => nonce(), base = [TEAM, h(), h(), h(), h(), h()];
  const c0 = P.joinCode(...base);
  const moved = base.map((_, i) => P.joinCode(...base.map((v, j) => (j !== i ? v : i === 0 ? "t-" + crypto.randomBytes(8).toString("hex") : h()))));
  check(/^[0-9]{6}$/.test(c0) && P.joinCode(...base) === c0 && moved.every(c => /^[0-9]{6}$/.test(c) && c !== c0),
    "15a the code is six digits, the same from the same parts, and another for each of the six parts changed alone"
    + " (team, key, box, lead, the desk's nonce, the lead's): " + moved.filter(c => c !== c0).length + " of 6 differ");
  check(P.joinCode("t-xyz", ...base.slice(1)) === "" && P.joinCode(TEAM, "ab", ...base.slice(2)) === ""
    && P.joinCode(TEAM, ...base.slice(1, 5), "") === "",
    "15b a malformed team, key or nonce gives no code at all");
  const [n1, n2] = [h(), h()];
  check(P.joinCommit(TEAM, base[1], base[2], n1) === P.joinCommit(TEAM, base[1], base[2], n1)
    && P.joinCommit(TEAM, base[1], base[2], n1) !== P.joinCommit(TEAM, base[1], base[2], n2)
    && P.joinCommit(TEAM, base[1], base[2], n1) !== P.joinCommit(TEAM, base[1], h(), n1),
    "15c the commitment binds the nonce and the box: another of either commits to something else");

  /* ---- outside the team ---------------------------------------------------------------------------------------- */
  const me1 = await D1.ask("etiuda:branch-identity", true);
  const D2 = newDesk("two", SHARE), me2 = await D2.ask("etiuda:branch-identity", true);
  put(SHARE, "etiuda-team.json", teamFile([entry(me2, K1, 1)]));
  put(SHARE, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  put(SHARE, "plain.ec", A1);
  const out = await D1.join("state");
  check(out.sealed && out.sealed.file === "lamps.ec" && out.sealed.team === TEAM && out.join === null && !fs.existsSync(path.join(SHARE, "desks"))
    && !kept(D1),
    "15d a desk outside the team says which sealed catalog it cannot open and for which team, and writes nothing to the share"
    + " until the agent asks: sealed " + JSON.stringify(out.sealed));
  const inside = await D2.join("state");
  check(inside.sealed === null, "15e THE CONTROL: a desk on the roster finds nothing sealed against it");
  const notSealed = await D1.join("ask", "plain.ec", "Max G.");
  check(notSealed.join === null && !fs.existsSync(path.join(SHARE, "desks")) && !kept(D1),
    "15f asked to join over a catalog that is not sealed against it, the desk writes nothing");
  fs.unlinkSync(path.join(SHARE, "plain.ec"));

  /* ---- the request ----------------------------------------------------------------------------------------------- */
  const asked = await D1.join("ask", "lamps.ec", "Max G.");
  const r1 = request(me1), j1 = kept(D1), bytes1 = fs.readFileSync(reqOf(me1), "utf8");
  check(asked.join && asked.join.state === "waiting" && asked.join.code === "" && r1 && P.joinGenuine(r1, me1.id)
    && r1.team === TEAM && r1.desk.key === me1.key && r1.desk.box === me1.box && r1.desk.name === "Max G." && r1.reveal === undefined
    && j1 && r1.commit === P.joinCommit(TEAM, me1.key, me1.box, j1.nonce) && bytes1.indexOf(j1.nonce) < 0,
    "15g the agent's press writes desks/<id>/join.json, genuine under the join prefix, committing to a nonce the share does not"
    + " hold; the desk waits with no code");
  const asBranch = JSON.parse(JSON.stringify(r1));
  asBranch.sig.value = crypto.sign(null, P.branchSignedBytes(asBranch), crypto.generateKeyPairSync("ed25519").privateKey).toString("hex");
  check(!P.deskFileGenuine(r1, me1.id) && !P.joinGenuine(asBranch, me1.id) && !P.joinGenuine(r1, me2.id)
    && !P.joinGenuine(Object.assign({}, r1, { team: "t-" + "0".repeat(16) }), me1.id),
    "15h the join prefix keeps its own domain: a request is no desk file, a branch signature is no request, and another folder"
    + " or a changed team is not genuine");

  /* ---- the lead opens: the code appears without a reload, and only that opening is answered -------------------- */
  check(P.isCatalogName(P.JOINS_NAME), "15i the watch hears the lead's file of openings land beside the team file");
  const L1 = nonce();
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }]));
  D1.sent.length = 0;
  P.catalogChanged(D1.win);
  const pushed = D1.sent.filter(s => s[0] === "etiuda:team-join").map(s => s[1]).pop();
  const want = P.joinCode(TEAM, me1.key, me1.box, LEAD.public, j1.nonce, L1);
  const r1b = request(me1);
  check(pushed && pushed.join && pushed.join.state === "code" && pushed.join.code === want && /^[0-9]{6}$/.test(want),
    "15j the opening lands and the watch sends the page the code at once, the lead's own reckoning of it over what each side"
    + " holds: " + (pushed && pushed.join ? pushed.join.state : "nothing sent"));
  check(r1b && P.joinGenuine(r1b, me1.id) && r1b.reveal === j1.nonce && r1b.opened.nonce === L1 && r1b.opened.lead.public === LEAD.public
    && P.joinCode(TEAM, r1b.desk.key, r1b.desk.box, r1b.opened.lead.public, r1b.reveal, r1b.opened.nonce) === want,
    "15k the request now reveals its nonce against that opening, which it names, so the lead reckons the same code from the file");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: nonce() }]));
  const later = await D1.join("state");
  check(later.join.code === want && request(me1).opened.nonce === L1,
    "15l a second opening for the same request is never answered: the code and the revealed opening stand");

  /* ---- a request the lead has not opened waits; a refusal is said ------------------------------------------------ */
  const D3 = newDesk("three", SHARE), me3 = await D3.ask("etiuda:branch-identity", true);
  await D3.join("ask", "lamps.ec", "Ada");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }, { desk: me3.id, commit: "0".repeat(64), nonce: nonce() }]));
  const w3 = await D3.join("state");
  check(w3.join.state === "waiting" && request(me3).reveal === undefined,
    "15m an opening that names another commitment opens nothing: the desk waits and reveals nothing");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }, { desk: me3.id, commit: request(me3).commit, refused: true }]));
  check((await D3.join("state")).join.state === "refused", "15n the lead's refusal reaches the desk as refused");
  const gone = await D3.join("cancel");
  check(gone.join === null && !fs.existsSync(reqOf(me3)) && !kept(D3) && gone.sealed && gone.sealed.file === "lamps.ec",
    "15o cancelling takes the request off the share and out of the envelope, and the sealed catalog is still said");

  /* ---- the envelope keeps the request across a restart ------------------------------------------------------------ */
  const D1r = loadDesk(D1.ud);
  const again = await D1r.join("state");
  check(again.join && again.join.code === want && again.join.state === "code", "15p a restarted desk shows the same code from its envelope");

  /* ---- admission: the lead's team file wraps the key for this desk ------------------------------------------------ */
  put(SHARE, "etiuda-team.json", teamFile([entry(me2, K1, 1), entry(me1, K1, 1)]));
  const inNow = await D1r.join("state");
  check(inNow.joined && inNow.joined.team === TEAM && inNow.joined.file === "lamps.ec" && inNow.join === null && inNow.sealed === null
    && !fs.existsSync(reqOf(me1)) && !kept(D1r) && D1r.api.readCatalog() === A1.trim(),
    "15q admitted, the desk says it joined, takes its request off the share, and opens the catalog");

  /* ---- the lead a desk compared codes with is the one its first admission must carry ---------------------------- */
  const D4 = newDesk("four", SHARE), me4 = await D4.ask("etiuda:branch-identity", true);
  await D4.join("ask", "lamps.ec", "Ola");
  const r4 = request(me4);
  put(SHARE, P.JOINS_NAME, joins([{ desk: me4.id, commit: r4.commit, nonce: nonce() }]));
  await D4.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me4, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const viaForger = await D4.join("state");
  check(viaForger.joined === null && !D4.envelope().teamPins && !D4.envelope().teamKeys && D4.api.readCatalog() === null
    && D4.said.filter(l => /lead this desk asked to join/.test(l)).length === 1,
    "15r a first admission signed by a key other than the lead whose opening the desk revealed against pins nothing and opens"
    + " nothing, and the log says so once");
  put(SHARE, "etiuda-team.json", teamFile([entry(me4, K1, 1)]));
  const viaLead = await D4.join("state");
  check(viaLead.joined && JSON.stringify(D4.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "15s THE CONTROL: the same admission under the lead it compared codes with pins that lead and joins");

  /* ---- before the answer, no first admission at all: the forger's file lands after the request is written -------- */
  const pinnedNothing = D => !D.envelope().teamPins && !D.envelope().teamKeys && D.api.readCatalog() === null;
  const D5 = newDesk("five", SHARE), me5 = await D5.ask("etiuda:branch-identity", true);
  await D5.join("ask", "lamps.ec", "Ewa");
  put(SHARE, "etiuda-team.json", teamFile([entry(me5, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const waitForged = await D5.join("state");
  check(waitForged.joined === null && waitForged.join && waitForged.join.state === "waiting" && pinnedNothing(D5)
    && !D5.said.some(l => /lead this desk asked to join/.test(l)),
    "15t while the request waits on the lead's answer, a team file wrapping the key for this desk under any lead pins nothing,"
    + " opens nothing, is not said as joined, and the log names no lead the desk has not yet been told");
  const D6 = newDesk("six", SHARE), me6 = await D6.ask("etiuda:branch-identity", true);
  await D6.join("ask", "lamps.ec", "Iga");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me6.id, commit: request(me6).commit, refused: true }]));
  const refusedFirst = await D6.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me6, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const refusedForged = await D6.join("state");
  check(refusedFirst.join && refusedFirst.join.state === "refused" && refusedForged.joined === null && refusedForged.join
    && refusedForged.join.state === "refused" && pinnedNothing(D6),
    "15u after the lead refused, a team file wrapping the key for this desk under any lead pins nothing, opens nothing and the"
    + " desk still reads refused");
  put(SHARE, "etiuda-team.json", teamFile([entry(me6, K1, 1)]));
  const refusedLead = await D6.join("state");
  const dropped = await D6.join("cancel");
  check(refusedLead.join && refusedLead.join.state === "refused" && dropped.join === null && dropped.sealed === null
    && JSON.stringify(D6.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }) && D6.api.readCatalog() === A1.trim(),
    "15v the lead's own admission read while the request stands refused waits too, and the cancel alone, the team file"
    + " unchanged since, has it read again and the catalog open");

  /* ---- the pinned lead's key, shown once to compare, and forgotten where it is not the lead's ------------------- */
  // Studio's Settings show its key as "studio-" and these 16 hex (src/sign.mjs keyIdFor): made here from the public half.
  const printOf = pub => crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16);
  /* The key's four facts. The team's name, folder, removal and policy beside them are 15bn to 15bs's. */
  const leadsOf = v => JSON.stringify((v && v.leads) ? v.leads.map(l => ({ team: l.team, print: l.print, admitted: l.admitted, seen: l.seen })) : null);
  const shown = await D1r.join("state");
  const seenNow = await D1r.join("seen", TEAM);
  const seenLater = await loadDesk(D1r.ud).join("state");
  check(leadsOf(shown) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: false }])
    && leadsOf(seenNow) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: true }])
    && leadsOf(seenLater) === leadsOf(seenNow) && leadsOf(gone) === "[]",
    "15w admitted by its request, the desk names the lead it pinned by the key Studio's Settings show, not yet shown, then shown"
    + " once the agent has seen it, in a fresh run too: " + leadsOf(shown) + "; a desk that pinned nothing names none");

  const D7 = newDesk("seven", SHARE), me7 = await D7.ask("etiuda:branch-identity", true);
  put(SHARE, "etiuda-team.json", teamFile([entry(me7, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const tofu = await D7.join("state");
  check(leadsOf(tofu) === JSON.stringify([{ team: TEAM, print: printOf(FORGED.public), admitted: true, seen: false }])
    && FORGED.keyId === LEAD.keyId && printOf(FORGED.public) !== printOf(LEAD.public),
    "15x a first admission with no request, a forger's team file under the lead's own keyId, is named by the forger's key and"
    + " not the label it wrote, and is to be shown: " + leadsOf(tofu));

  const forgot = await D7.join("forget", TEAM);
  const after = D7.envelope(), fresh7 = loadDesk(D7.ud), still = await fresh7.join("state");
  check(leadsOf(forgot) === "[]" && !after.teamPins && !after.teamKeys && JSON.stringify(after.teamBarred) === JSON.stringify([TEAM])
    && leadsOf(still) === "[]" && D7.api.readCatalog() === null && fresh7.api.readCatalog() === null
    && still.sealed && still.sealed.team === TEAM,
    "15y forgotten, the lead's pin and every key kept under it are gone, and the same forger's file still on the share pins"
    + " nothing again, in this run or a fresh one: the catalog is shut and said sealed again, barred " + JSON.stringify(after.teamBarred));

  await fresh7.join("ask", "lamps.ec", "Zoe");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me7.id, commit: (request(me7) || {}).commit, nonce: nonce() }]));
  await fresh7.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me7, K1, 1)]));
  const rejoined = await fresh7.join("state");
  check(rejoined.joined && leadsOf(rejoined) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: false }])
    && !fresh7.envelope().teamBarred && fresh7.api.readCatalog() === A1.trim(),
    "15z THE CONTROL: after forgetting, a request answered by the real lead admits the desk, pins that lead, lifts the bar and"
    + " shows the new key once: " + leadsOf(rejoined));

  /* ---- an invitation: paste, confirm, and a request that proves the secret without carrying it ------------------- */
  const inviteBlob = (o) => "etiuda-join:" + Buffer.from(JSON.stringify(o)).toString("base64url");
  const filesUnder = (dir) => {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      const at = path.join(dir, name);
      if (fs.statSync(at).isDirectory()) out.push(...filesUnder(at));
      else out.push(at);
    }
    return out;
  };
  const quiet = folder("quiet");
  const Du = newDesk("unc", quiet);
  const secretU = crypto.randomBytes(16).toString("hex");
  SECRETS.push(secretU);
  const lampLead = { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" };
  /* The five digits the agent types on the confirm, as the lead reads them from Studio: HMAC-SHA256 under the invitation's
     secret over the lead's 32-byte public key, its first six bytes read big-endian, modulo 100000. Made here from the
     invitation's own text, never by the shell; wrongFor is the next code round, so never the right one. */
  const secretOf = blob => JSON.parse(Buffer.from(blob.slice(12), "base64url").toString("utf8")).secret;
  const codeFor = blob => {
    const o = JSON.parse(Buffer.from(blob.slice(12), "base64url").toString("utf8"));
    const mac = crypto.createHmac("sha256", Buffer.from(o.secret, "hex")).update(Buffer.from(o.lead.public, "hex")).digest();
    return String(mac.readUIntBE(0, 6) % 100000).padStart(5, "0");
  };
  const wrongFor = blob => String((+codeFor(blob) + 1) % 100000).padStart(5, "0");
  const WIN = process.platform === "win32";
  const beforeQuiet = fs.readdirSync(quiet).slice().sort().join("|");
  const badPreview = await Du.join("read", "etiuda-join:not-valid");
  check(badPreview && badPreview.refused === "unread" && !badPreview.offer
      && fs.readdirSync(quiet).slice().sort().join("|") === beforeQuiet
      && !Du.envelope().teamJoin && !Du.envelope().teamPins,
    "15ab a malformed invitation is refused and nothing is written: " + (badPreview && badPreview.refused));
  /* A share's path is a place on Windows alone; elsewhere the same text is no place at all, and is refused. */
  const uncBlob = inviteBlob({ team: TEAM, folder: "\\\\quay-host\\catalogs\\", lead: lampLead, secret: secretU });
  const uncAt = Date.now();
  const uncPreview = await Du.join("read", uncBlob);
  const uncMs = Date.now() - uncAt;
  check((WIN ? uncPreview && uncPreview.offer && uncPreview.offer.host === "quay-host" && uncPreview.offer.lead === "Lamp lead"
        && uncPreview.offer.folder === "\\\\quay-host\\catalogs" && uncPreview.refused === undefined
      : uncPreview && uncPreview.refused === "unread" && !uncPreview.offer)
      && uncMs < 1000 && fs.readdirSync(quiet).slice().sort().join("|") === beforeQuiet,
    "15ac an invitation for a folder on another computer names that computer and the folder as Windows reaches it before anything"
    + " is opened, or is refused where that path is no place, and writes nothing: " + uncMs + "ms, "
    + (WIN ? "host " + (uncPreview && uncPreview.offer && uncPreview.offer.host) : "refused " + (uncPreview && uncPreview.refused)));
  check(r1 && r1.invite === undefined && r1.desk.kind === undefined && bytes1.indexOf('"invite"') < 0 && bytes1.indexOf('"kind": "desk"') < 0,
    "15ad a request made with no invitation is unchanged: no invite and no kind on the member");

  const yard = folder("yard");
  const Dy = newDesk("yard", folder("yard-old"));
  const mey = await Dy.ask("etiuda:branch-identity", true);
  const secretY = crypto.randomBytes(16).toString("hex");
  SECRETS.push(secretY);
  const yardBlob = inviteBlob({ team: TEAM, folder: yard, lead: lampLead, secret: secretY });
  const took = await Dy.join("invite", yardBlob, "Nia", codeFor(yardBlob));
  /* Read only where the yes took, so a yes refused fails here and the legs after it still run. */
  const yardFile = path.join(yard, "desks", mey.id, "join.json");
  const ry = took && took.join && fs.existsSync(yardFile) ? JSON.parse(fs.readFileSync(yardFile, "utf8")) : {};
  const envY = Dy.envelope();
  check(took && took.join && took.join.state === "waiting" && ry.desk.kind === "desk" && ry.desk.name === "Nia"
      && ry.invite.id === P.inviteIdOf(secretY) && ry.invite.proof === P.memberProof(secretY, ry.commit)
      && envY.teamJoin && ry.commit === P.joinCommit(TEAM, mey.key, mey.box, envY.teamJoin.nonce)
      && envY.teamPins && envY.teamPins[TEAM].public === LEAD.public && envY.teamPins[TEAM].keyId === LEAD.keyId
      && envY.keys.eCatalogFolder === yard,
    "15ae yes pins the lead from the invitation and writes a desk request whose proof is that commitment's: "
    + (took && took.join && took.join.state));
  const yardText = filesUnder(yard).map(p => fs.readFileSync(p, "utf8")).join("\n");
  const restarted = loadDesk(Dy.ud);
  const envR = restarted.envelope();
  check(JSON.stringify(envY).indexOf(secretY) < 0 && yardText.indexOf(secretY) < 0 && JSON.stringify(envR).indexOf(secretY) < 0
      && envR.teamJoin && envR.teamJoin.invite && envR.teamJoin.invite.id === ry.invite.id
      && envR.teamJoin.invite.proof === ry.invite.proof && envR.teamJoin.invite.secret === undefined
      && envR.teamPins[TEAM].public === LEAD.public,
    "15af the secret is in nothing written to the share or the desk, and a restart still has the proof and the pin");
  const otherCommit = P.joinCommit(TEAM, mey.key, crypto.randomBytes(32).toString("hex"), envY.teamJoin ? envY.teamJoin.nonce : "");
  const proofY = ry.invite ? ry.invite.proof : undefined;
  check(!!proofY && P.memberProof(crypto.randomBytes(16).toString("hex"), ry.commit) !== proofY
      && P.memberProof(secretY, otherCommit) !== proofY && otherCommit !== ry.commit,
    "15ag a proof made under another secret or another commitment does not match the request");

  /* ---- what an invitation may not move: a lead this desk already trusts, or one it was told does not match ------- */
  const deskWith = async (name, own, extra, src, opts) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: own, eUiLang: "en" } }, extra || {})), "utf8");
    const D = loadDesk(ud, src, opts);
    if (own) syncFolder(own);
    if (extra && extra.teamShown) {
      for (const s of Object.values(extra.teamShown)) if (s && s.folder) syncFolder(s.folder);
    }
    await D.ask("etiuda:branch-identity", true);
    await D.join("state");
    return D;
  };
  const newSecret = () => { const s = crypto.randomBytes(16).toString("hex"); SECRETS.push(s); return s; };
  /* What trust and place a desk keeps: the pins, the kept keys, the keys already shown, the bars, the request, the folder. */
  const trustOf = D => { const e = D.envelope();
    return JSON.stringify([e.teamPins || null, e.teamKeys || null, e.teamSeen || null, e.teamBarred || null, e.teamJoin || null, e.keys.eCatalogFolder]); };
  /* Every call that could reach a path is watched for `dir` while `run` runs: which of them named it. A stat of a share
     is a connection to the computer it names, so "nothing changes" includes nothing asked there. */
  const watching = async (dir, run) => {
    const touched = [], untap = [];
    const tap = (obj, names, as) => names.forEach(n => {
      const real = obj[n];
      if (typeof real !== "function") return;
      obj[n] = function (p, ...rest) { if (String(p).indexOf(dir) >= 0) touched.push(as + n); return real.call(this, p, ...rest); };
      untap.push(() => { obj[n] = real; });
    });
    tap(fs, ["statSync", "lstatSync", "existsSync", "readdirSync", "readFileSync", "accessSync", "openSync", "mkdirSync", "writeFileSync",
      "watch", "stat", "lstat", "access", "readdir", "opendirSync"], "");
    tap(fs.promises, ["stat", "lstat", "access", "readdir", "readFile", "open", "opendir"], "promises.");
    try { await run(); await new Promise(r => setTimeout(r, 50)); }
    finally { untap.forEach(u => u()); }
    return touched;
  };
  const hostile = folder("hostile");
  const forgedLead = { keyId: FORGED.keyId, public: FORGED.public, name: "Lamp lead" };
  const Dp = await deskWith("pinned", folder("pinned-own"),
    { teamPins: { [TEAM]: LEAD }, teamSeen: [TEAM], teamKeys: { [TEAM]: { "1": Buffer.from("kept").toString("base64") } } });
  const secretP = newSecret();
  const forgedBlob = inviteBlob({ team: TEAM, folder: hostile, lead: forgedLead, secret: secretP });
  const relabelled = inviteBlob({ team: TEAM, folder: hostile, lead: { keyId: "lamp-other", public: LEAD.public, name: "Lamp lead" }, secret: secretP });
  const trustP = trustOf(Dp);
  let readP = null, takeP = null, readRelabelled = null, takeRelabelled = null;
  const touchedP = await watching(hostile, async () => {
    readP = await Dp.join("read", forgedBlob);
    takeP = await Dp.join("invite", forgedBlob, "Ola", codeFor(forgedBlob));
    readRelabelled = await Dp.join("read", relabelled);
    takeRelabelled = await Dp.join("invite", relabelled, "Ola", codeFor(relabelled));
  });
  const keptP = trustOf(Dp) === trustP && filesUnder(hostile).length === 0 && touchedP.length === 0;
  const sameLead = await Dp.join("read", inviteBlob({ team: TEAM, folder: hostile, lead: lampLead, secret: secretP }));
  check(readP && readP.refused === "pinned" && !readP.offer && takeP && takeP.refused === "pinned" && readRelabelled
      && readRelabelled.refused === "pinned" && takeRelabelled && takeRelabelled.refused === "pinned" && keptP
      && sameLead && !!sameLead.offer && sameLead.refused === undefined,
    "15ai an invitation for a team this desk already pins under another key, or under the same key with another keyId, is refused at"
    + " read and at yes, and nothing changes: the pin, the kept keys, the key already shown, the folder, and nothing asked or written"
    + " where it points; THE CONTROL, the lead it pins, is offered: " + (readP && readP.refused) + ", " + (takeP && takeP.refused)
    + ", touched " + JSON.stringify(touchedP));

  const Db = await deskWith("barred", folder("barred-own"), { teamBarred: [TEAM] });
  const secretB = newSecret();
  const barredBlob = inviteBlob({ team: TEAM, folder: hostile, lead: lampLead, secret: secretB });
  const trustB = trustOf(Db);
  let readB = null, takeB = null;
  const touchedB = await watching(hostile, async () => {
    readB = await Db.join("read", barredBlob);
    takeB = await Db.join("invite", barredBlob, "Ola", codeFor(barredBlob));
  });
  check(readB && readB.refused === "barred" && !readB.offer && takeB && takeB.refused === "barred"
      && trustOf(Db) === trustB && filesUnder(hostile).length === 0 && touchedB.length === 0,
    "15aj an invitation for a team whose lead this desk was told does not match is refused at read and at yes, under any lead, and"
    + " nothing changes or is asked: the bar lifts only by an answered request: " + (readB && readB.refused) + ", " + (takeB && takeB.refused)
    + ", touched " + JSON.stringify(touchedB));

  const Ds = await deskWith("shown", folder("shown-own"), { teamSeen: [TEAM] });
  const shownBlob = inviteBlob({ team: TEAM, folder: folder("shown-yard"), lead: lampLead, secret: newSecret() });
  const takeS = await Ds.join("invite", shownBlob, "Ola", codeFor(shownBlob));
  const envS = Ds.envelope();
  check(takeS && takeS.join && envS.teamPins && envS.teamPins[TEAM].public === LEAD.public && (envS.teamSeen || []).indexOf(TEAM) < 0
      && leadsOf(takeS) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: false, seen: false }]),
    "15ak a pin an invitation sets is a key not yet shown, so the comparison after admission comes, whatever the desk held: "
    + leadsOf(takeS));

  const Dc = await deskWith("four", folder("four-own"));
  const fourYard = folder("four-yard");
  const fourBlob = inviteBlob({ team: TEAM, folder: fourYard, lead: lampLead, secret: newSecret() });
  const trustC = trustOf(Dc);
  const otherFour = wrongFor(fourBlob);
  let noFour = null, wrongFour = null;
  const touchedC = await watching(fourYard, async () => {
    noFour = await Dc.join("invite", fourBlob, "Ola", "");
    wrongFour = await Dc.join("invite", fourBlob, "Ola", otherFour);
  });
  const keptC = trustOf(Dc) === trustC && filesUnder(fourYard).length === 0 && touchedC.length === 0;
  const rightFour = await Dc.join("invite", fourBlob, "Ola", " " + codeFor(fourBlob).slice(0, 2) + " " + codeFor(fourBlob).slice(2) + " ");
  check(noFour && noFour.refused === "check" && wrongFour && wrongFour.refused === "check" && keptC
      && rightFour && rightFour.join && rightFour.join.state === "waiting" && Dc.envelope().teamPins[TEAM].public === LEAD.public,
    "15al yes is taken only with this invitation's check code as the lead reads it, spaces aside: none, or another code, change"
    + " nothing and ask or write nothing: " + (noFour && noFour.refused) + ", " + (wrongFour && wrongFour.refused)
    + ", then " + (rightFour && rightFour.join && rightFour.join.state));

  const Dr = await deskWith("files", folder("files-own"));
  const underForger = folder("files-forger"), otherTeam = folder("files-other"), broken = folder("files-broken"), genuineFolder = folder("files-real");
  put(underForger, "etiuda-team.json", teamFile([], { lead: FORGED, signer: forger.privateKey }));
  put(otherTeam, "etiuda-team.json", sign({ format: 1, kind: "etiuda-team", id: "t-" + crypto.randomBytes(8).toString("hex"),
    catalogs: ["lamp-shop"], lead: LEAD, sealed: true, exportsSealed: false, epoch: 1, roster: [] }, lead.privateKey, LEAD.keyId));
  const cracked = teamFile([]);
  cracked.sig.value = (cracked.sig.value[0] === "a" ? "b" : "a") + cracked.sig.value.slice(1);
  put(broken, "etiuda-team.json", cracked);
  put(genuineFolder, "etiuda-team.json", teamFile([]));
  /* Whole under the invited lead's own public key, labelled with another keyId, as a pin is compared (15ai). */
  const relabelledTeam = folder("files-relabelled");
  put(relabelledTeam, "etiuda-team.json", sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"],
    lead: { keyId: "lamp-other", public: LEAD.public }, sealed: true, exportsSealed: false, epoch: 1, roster: [] }, lead.privateKey, "lamp-other"));
  const trustR = trustOf(Dr);
  const foreign = [];
  for (const f of [underForger, otherTeam, broken, relabelledTeam]) {
    const b = inviteBlob({ team: TEAM, folder: f, lead: lampLead, secret: newSecret() });
    const r = await Dr.join("invite", b, "Ola", codeFor(b));
    foreign.push((r && r.refused) + (fs.existsSync(path.join(f, "desks")) ? " wrote" : ""));
  }
  const keptR = trustOf(Dr) === trustR;
  const genuineBlob = inviteBlob({ team: TEAM, folder: genuineFolder, lead: lampLead, secret: newSecret() });
  const intoGenuine = await Dr.join("invite", genuineBlob, "Ola", codeFor(genuineBlob));
  check(foreign.every(x => x === "foreign") && keptR && intoGenuine && intoGenuine.join && intoGenuine.join.state === "waiting",
    "15am a folder whose team file is under another lead, for another team, not whole under its lead, or under the lead's key with"
    + " another keyId takes no request, and the"
    + " folder is put back as it was; THE CONTROL, a team file whole under the invited lead, takes it: " + JSON.stringify(foreign));

  /* A team file the desk cannot read is taken neither for no team file nor for another team's: a folder standing where the
     file would, and a file that is not JSON. The page's sentence for it is read with the page's legs, where 15be is. */
  const De = await deskWith("unreadable", folder("unreadable-own"));
  const unreadableTeam = folder("files-unreadable"), notJsonTeam = folder("files-not-json");
  fs.mkdirSync(path.join(unreadableTeam, "etiuda-team.json"));
  put(notJsonTeam, "etiuda-team.json", "{ not a team file");
  const trustE = trustOf(De);
  const tookE = [];
  for (const f of [unreadableTeam, notJsonTeam]) {
    const b = inviteBlob({ team: TEAM, folder: f, lead: lampLead, secret: newSecret() });
    const r = await De.join("invite", b, "Ola", codeFor(b));
    tookE.push((r && (r.refused || (r.join ? r.join.state : "nothing"))) + (fs.existsSync(path.join(f, "desks")) ? " wrote" : ""));
  }
  const keptE = trustOf(De) === trustE;

  /* The folder the invitation names is one nothing has made. */
  const never = path.join(LAB, "never-" + crypto.randomBytes(4).toString("hex"));
  const Dn = await deskWith("untouched", folder("untouched-own"));
  const folderN = Dn.envelope().keys.eCatalogFolder;
  let readN = null;
  const touched = await watching(never, async () => {
    readN = await Dn.join("read", inviteBlob({ team: TEAM, folder: never, lead: lampLead, secret: newSecret() }));
  });
  check(readN && readN.offer && readN.offer.folder === never && touched.length === 0 && Dn.envelope().keys.eCatalogFolder === folderN,
    "15an reading an invitation states, opens and watches nothing at the folder it names, and the desk's own folder stays as it was:"
    + " touched " + JSON.stringify(touched));

  /* A folder that does not answer: here one whose parent is missing too, so the ask finds neither. */
  const silentFolder = path.join(LAB, "gone-" + crypto.randomBytes(4).toString("hex"), "team");
  const Dv = await deskWith("silent", folder("silent-own"));
  const trustV = trustOf(Dv);
  let tookV = null;
  const touchedV = await watching(silentFolder, async () => {
    const silentBlob = inviteBlob({ team: TEAM, folder: silentFolder, lead: lampLead, secret: newSecret() });
    tookV = await Dv.join("invite", silentBlob, "Ola", codeFor(silentBlob));
  });
  check(tookV && tookV.canceled === true && trustOf(Dv) === trustV && !fs.existsSync(silentFolder)
      && touchedV.length > 0 && touchedV.every(n => n.indexOf("promises.") === 0),
    "15av at yes, a folder that does not answer is asked and nothing more: no call that could wait on it with the window behind it, the"
    + " desk's folder put back, nothing pinned or written: " + (tookV && (tookV.canceled ? "canceled" : tookV.refused)) + ", touched " + JSON.stringify(touchedV));

  const ringYard = folder("files-ring");
  put(ringYard, "etiuda-team.json", teamFile([], { lead: FORGED, signer: forger.privateKey }));
  put(ringYard, "etiuda-ring.json", { format: 1, kind: "etiuda-ring",
    keys: [{ catalog: "lamp-shop", keyId: FORGED.keyId, alg: "Ed25519", public: FORGED.public }] });
  const invented = { team: TEAM, lead: lampLead };
  const belongChecks = [
    P.inviteFolderBelongs ? P.inviteFolderBelongs(genuineFolder, invented) : false,
    P.inviteFolderBelongs ? P.inviteFolderBelongs(ringYard, invented) : false,
    P.inviteFolderBelongs ? P.inviteFolderBelongs(silentFolder, invented) : false,
    P.inviteFolderBelongs ? P.inviteFolderBelongs(otherTeam, invented) : false,
    P.inviteFolderBelongs ? P.inviteFolderBelongs(underForger, invented) : false,
    P.inviteFolderBelongs ? P.inviteFolderBelongs(broken, invented) : false,
  ];
  check(belongChecks[0] === true && belongChecks[1] === true
      && belongChecks[2] === false && belongChecks[3] === false
      && belongChecks[4] === false && belongChecks[5] === false,
    "15cl a chosen copy of the shared folder is accepted only where it holds that team's own team file under the invited lead or vouched for by a ring, and refused otherwise: " + JSON.stringify(belongChecks));

  const Dk = await deskWith("kept", folder("kept-own"));
  const secretK = newSecret();
  const keptBlob = inviteBlob({ team: TEAM, folder: folder("kept-yard"), lead: lampLead, secret: secretK });
  await Dk.join("invite", keptBlob, "Ola", codeFor(keptBlob));
  const envK = Dk.envelope();
  const hadK = !!(envK.teamJoin && envK.teamJoin.invite);
  if (hadK) envK.teamJoin.invite.secret = secretK;
  fs.writeFileSync(path.join(Dk.ud, "desk.json"), JSON.stringify(envK), "utf8");
  const viewK = await loadDesk(Dk.ud).join("state");
  check(hadK && viewK && viewK.join === null,
    "15ao a kept request whose invitation holds a secret is not read back: the desk drops the request rather than carry it");

  /* ---- the page: the engine's own team-join.js over this desk's shell ------------------------------------------- */
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.document = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const calls = [];
  let failOp = "", slowRead = false;
  /* The page over one desk's shell, every call it makes kept; a call named by failOp is refused, and a read can be slowed. */
  const hostOver = D => ({ onTeamJoin: noop,
    catalogFolder: (D && typeof D.envelope === "function" && D.envelope().keys && D.envelope().keys.eCatalogFolder) || "",
    teamJoin: (op, file, name, four) => {
    calls.push([op, file, name, four]);
    if (op === failOp) return Promise.reject(new Error("the channel closed"));
    if (op === "read" && slowRead) return new Promise(r => setTimeout(() => r(D.join(op, file, name, four)), 40));
    return D.join(op, file, name, four);
  } });
  window.E_HOST = hostOver(Du);
  const HK = await import(MOD("hooks.js"));
  HK.hooks.render = noop;
  const TJ = await import(MOD("team-join.js"));
  const T = await import(MOD("ui-lang.js"));
  const pageOn = async D => { window.E_HOST = hostOver(D); TJ.wireTeamJoin(); await new Promise(r => setTimeout(r, 30)); };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const elOf = (attrs, value) => ({ value: value || "", hasAttribute: a => Object.prototype.hasOwnProperty.call(attrs, a),
    getAttribute: a => (Object.prototype.hasOwnProperty.call(attrs, a) ? attrs[a] : null) });
  const press = act => { const b = elOf({ "data-join": act }); TJ.wireTeamJoinEmpty({ querySelectorAll: () => [b] }); return Promise.resolve(b.onclick && b.onclick()); };
  const typeFour = value => { const c = elOf({ "data-join-check": "" }, value); TJ.wireTeamJoinEmpty({ querySelectorAll: () => [c] }); if (c.oninput) c.oninput(); };
  const held = () => (typeof TJ.inviteHeld === "function" ? TJ.inviteHeld() : null);
  const yesOf = html => (/<button[^>]*data-join="invite"[^>]*>/.exec(html) || [""])[0];
  const missOf = html => (/<div[^>]*data-join-miss[^>]*>/.exec(html) || [""])[0];
  const pageYard = folder("page-yard");
  const blobA = inviteBlob({ team: TEAM, folder: pageYard + path.sep, lead: lampLead, secret: newSecret() });
  let pasted = elOf({ "data-join-paste": "" }, blobA);
  document.querySelector = (sel) => sel === "[data-join-paste]" ? pasted : null;
  TJ.openJoinPaste();
  const pasteHtml = TJ.teamJoinEmptyHtml();
  await press("read");
  const confirmHtml = TJ.teamJoinEmptyHtml();
  const groups = printOf(LEAD.public).match(/.{4}/g);
  check(/<textarea /.test(pasteHtml) && confirmHtml.indexOf(pageYard) >= 0 && confirmHtml.indexOf(pageYard + path.sep) < 0
      && confirmHtml.indexOf("Lamp lead") >= 0 && /<input[^>]*data-join-check[^>]*maxlength="5"/.test(confirmHtml) && confirmHtml.indexOf("e-join-key") < 0
      && groups.every(g => confirmHtml.indexOf(g) < 0) && / disabled/.test(yesOf(confirmHtml))
      && !new RegExp("(^|[^0-9])" + codeFor(blobA) + "([^0-9]|$)").test(confirmHtml.replace(/<svg[\s\S]*?<\/svg>/g, "")),
    "15ah the confirm names the folder as the desk will use it and the lead, asks for the code the lead reads out, shows neither"
    + " the key nor the code, and its yes waits for it");

  typeFour(wrongFor(blobA));
  const wrongHtml = TJ.teamJoinEmptyHtml();
  const before = calls.length;
  await press("invite");
  const sentWhileShut = calls.length - before;
  typeFour(codeFor(blobA).slice(0, 4));
  const partHtml = TJ.teamJoinEmptyHtml();
  typeFour(codeFor(blobA));
  const rightHtml = TJ.teamJoinEmptyHtml();
  check(/ disabled/.test(yesOf(wrongHtml)) && !!missOf(wrongHtml) && !/ hidden/.test(missOf(wrongHtml)) && sentWhileShut === 0
      && / disabled/.test(yesOf(partHtml)) && / hidden/.test(missOf(partHtml))
      && !!yesOf(rightHtml) && !/ disabled/.test(yesOf(rightHtml)) && / hidden/.test(missOf(rightHtml)),
    "15ap the yes opens only once the code typed is this invitation's check code, all five digits; another code is said not to"
    + " match, four of the five are not yet said wrong, and the shut yes sends nothing: sent " + sentWhileShut);
  await press("back");
  const heldAfterBack = held();

  const Dci = await deskWith("relay-confirm", folder("relay-confirm-own"));
  await pageOn(Dci);
  const relayTeamId = "t-" + crypto.randomBytes(8).toString("hex");
  const relayBlob = inviteBlob({ team: relayTeamId, relay: { rt: crypto.randomBytes(16).toString("hex"),
    url: "https://relay.test/relay/v1", token: crypto.randomBytes(32).toString("hex"), inv: crypto.randomBytes(16).toString("hex") },
    lead: lampLead, secret: crypto.randomBytes(16).toString("hex") });
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, relayBlob);
  await press("read");
  const relayHtml = TJ.teamJoinEmptyHtml();
  const relayYes = yesOf(relayHtml);
  check(relayHtml.indexOf("data-join-check") < 0 && relayHtml.indexOf("Lamp lead") >= 0 && relayHtml.indexOf(relayTeamId) >= 0
      && relayHtml.indexOf("relay.test") >= 0 && relayHtml.indexOf("Folder:") < 0 && !!relayYes && !/ disabled/.test(relayYes),
    "15ci a relay invitation's confirm asks for no check code and shows the lead, the team and the relay's host: "
    + (relayHtml.indexOf("data-join-check") < 0 ? "no code box" : "a code box")
    + ", lead " + (relayHtml.indexOf("Lamp lead") >= 0 ? "shown" : "absent")
    + ", team " + (relayHtml.indexOf(relayTeamId) >= 0 ? "shown" : "absent")
    + ", host " + (relayHtml.indexOf("relay.test") >= 0 ? "shown" : "absent"));
  await press("back");

  const Dq = await deskWith("race", folder("race-own"));
  await pageOn(Dq);
  const raceB = folder("race-b");
  const blobB = inviteBlob({ team: TEAM, folder: raceB, lead: forgedLead, secret: newSecret() });
  TJ.openJoinPaste();
  const boxA = elOf({ "data-join-paste": "" }, blobA), readA = elOf({ "data-join": "read" });
  pasted = boxA;
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => [boxA, readA] });
  slowRead = true;
  const reading = Promise.resolve(readA.onclick && readA.onclick());
  boxA.value = blobB;
  if (boxA.oninput) boxA.oninput();
  await reading;
  slowRead = false;
  const raceHtml = TJ.teamJoinEmptyHtml();
  typeFour(codeFor(blobA));
  await press("invite");
  const heldAfterYes = held();
  const sentYes = calls.filter(c => c[0] === "invite").pop();
  check(raceHtml.indexOf(pageYard) >= 0 && raceHtml.indexOf(raceB) < 0 && !!sentYes && sentYes[1] === blobA
      && fs.existsSync(path.join(pageYard, "desks")) && !fs.existsSync(path.join(raceB, "desks")),
    "15aq a second paste while the first is read changes nothing: the confirm shows the first, and yes sends the very text that was"
    + " read, never the box: " + (sentYes ? (sentYes[1] === blobA ? "the first" : sentYes[1] === blobB ? "the second" : "another") : "nothing"));

  const Dz = await deskWith("refused", folder("refused-own"));
  await pageOn(Dz);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, blobA);
  failOp = "read";
  await press("read");
  const afterReadFail = held(), readFailHtml = TJ.teamJoinEmptyHtml();
  failOp = "";
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, blobA);
  await press("read");
  typeFour(codeFor(blobA));
  failOp = "invite";
  await press("invite");
  const afterYesFail = held(), yesFailHtml = TJ.teamJoinEmptyHtml();
  failOp = "";
  const letGo = h => !!h && h.mode === "" && h.draft === "" && h.read === "" && h.typed === "" && h.offer === null;
  check(letGo(afterReadFail) && letGo(afterYesFail) && !/<textarea /.test(readFailHtml) && !/data-join-check/.test(yesFailHtml),
    "15ar a call to the shell that fails lets the invitation go, the paste box or the confirm with it, after a read and after a yes");

  TJ.openJoinPaste();
  const boxC = elOf({ "data-join-paste": "" }, "");
  pasted = boxC;
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => [boxC] });
  boxC.value = blobA;
  if (boxC.oninput) boxC.oninput();
  await press("back");
  const heldAfterPasteBack = held();
  TJ.openJoinPaste();
  const unreadable = "etiuda-join:" + Buffer.from("{}").toString("base64url") + "x" + secretK;
  pasted = elOf({ "data-join-paste": "" }, unreadable);
  await press("read");
  const heldAfterRefusal = held(), refusedHtml = TJ.teamJoinEmptyHtml();
  await press("back");
  check(letGo(heldAfterYes) && letGo(heldAfterBack) && letGo(heldAfterPasteBack) && !!heldAfterRefusal && heldAfterRefusal.mode === "refused"
      && heldAfterRefusal.draft === "" && heldAfterRefusal.read === "" && heldAfterRefusal.offer === null && refusedHtml.indexOf(secretK) < 0,
    "15as the page lets an invitation go once it is answered: after a yes that took, after Cancel on the confirm and on the paste box,"
    + " and after a refusal, which keeps only its sentence");

  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read"
    ? { sealed: null, join: null, leads: [], offer: { folder: "\\\\quay-host\\catalogs", lead: "Lamp lead", print: printOf(LEAD.public),
      host: "quay-host", cloud: "", local: false } }
    : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, "etiuda-join:as-the-shell-read-it");
  await press("read");
  const hostHtml = TJ.teamJoinEmptyHtml();
  const hostLine = T.t("This folder is on the computer {HOST}.").split("{HOST}").join("quay-host");
  await press("back");
  check(hostHtml.indexOf("<p>" + hostLine + "</p>") >= 0,
    "15at the confirm says which computer the folder is on, in the line under its title: " + hostLine);

  let pickCount = 0;
  const cancelYard = folder("cancel-yard");
  put(cancelYard, "etiuda-team.json", teamFile([], { lead: lampLead, signer: lead.privateKey }));
  const Dcancel = await deskWith("cancel-picker", folder("cancel-picker-own"), null, null, {
    dialog: {
      showOpenDialog: async () => {
        pickCount++;
        if (pickCount === 1) return { canceled: true, filePaths: [] };
        return { canceled: false, filePaths: [cancelYard] };
      }
    }
  });
  const missingYard = path.join(LAB, "gone-cancel-" + crypto.randomBytes(4).toString("hex"), "team");
  const cancelBlob = inviteBlob({ team: TEAM, folder: missingYard, lead: lampLead, secret: newSecret() });
  await pageOn(Dcancel);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, cancelBlob);
  await press("read");
  typeFour(codeFor(cancelBlob));
  await press("invite");
  const heldAfterCancel = held(), cancelHtml = TJ.teamJoinEmptyHtml();
  await press("invite");
  const heldAfterSecondPress = held();
  check(pickCount === 2
      && heldAfterCancel && heldAfterCancel.mode === "confirm" && heldAfterCancel.typed === codeFor(cancelBlob)
      && heldAfterCancel.offer !== null
      && cancelHtml.indexOf("data-join-check") >= 0
      && !/ disabled/.test(yesOf(cancelHtml))
      && cancelHtml.indexOf("could not be reached") < 0
      && cancelHtml.indexOf("Lamp lead") >= 0
      && heldAfterSecondPress && heldAfterSecondPress.mode === ""
      && fs.existsSync(path.join(cancelYard, "desks")),
    "15ei cancelling the folder picker keeps the confirmation card with the invitation and the typed check code in place, and says nothing; pressing Join again with nothing re-typed takes the invitation");

  window.E_HOST = hostOver(fresh7);
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const html = TJ.teamJoinEmptyHtml(), buttons = {};
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => ["seen", "forget"].map(a => (buttons[a] = { getAttribute: () => a })) });
  const grouped = printOf(LEAD.public).replace(/(.{4})(?=.)/g, "$1 ");
  await buttons.seen.onclick();
  const afterPage = await fresh7.join("state");
  /* The key wears Studio's sign before its groups (team-join.js keySignHtml), and the groups are the shell's print. */
  const signed = /<div class="e-join-key"><span class="e-ksig"><span class="e-kdisc" role="img" aria-label="[^"]+"><svg[\s\S]*?<\/svg><\/span><span>([0-9a-f ]+)<\/span><\/span><\/div>/.exec(html);
  check(!!signed && signed[1] === grouped && /data-join="seen"/.test(html) && /data-join="forget"/.test(html)
    && leadsOf(afterPage) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: true }])
    && JSON.stringify(TJ.teamLeads()) === JSON.stringify(afterPage.leads),
    "15aa the page shows the shell's key in four groups of four after Studio's sign, with the two answers, and the agent's \"it matches\" reaches"
    + " the shell as seen: " + grouped);

  /* ---- the check code: a forger who never saw the real invitation cannot make it ------------------------------ */
  /* The forger's key is ground until its print opens with the same four characters as the real lead's, which beat the
     check when it was the print's first group; its own invitation carries its own secret, so its own code is right for it. */
  const realYard = folder("code-real"), forgedYard = folder("code-forged");
  const realBlob = inviteBlob({ team: TEAM, folder: realYard, lead: lampLead, secret: newSecret() });
  let groundPub = "";
  do { groundPub = crypto.randomBytes(32).toString("hex"); } while (printOf(groundPub).slice(0, 4) !== printOf(LEAD.public).slice(0, 4));
  let forgedCodeBlob = "";
  do {
    forgedCodeBlob = inviteBlob({ team: TEAM, folder: forgedYard, lead: { keyId: LEAD.keyId, public: groundPub, name: "Lamp lead" }, secret: newSecret() });
  } while (codeFor(forgedCodeBlob) === codeFor(realBlob));
  const realCode = codeFor(realBlob), forgedOwn = codeFor(forgedCodeBlob);
  const pureOk = typeof P.inviteCode === "function" && P.inviteCode(secretOf(realBlob), LEAD.public) === realCode
    && P.inviteCode(secretOf(forgedCodeBlob), groundPub) === forgedOwn && P.inviteCode("zz", LEAD.public) === "" && P.inviteCode(secretOf(realBlob), "ab") === "";
  const Dw = await deskWith("forged-code", folder("forged-code-own"));
  await pageOn(Dw);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, forgedCodeBlob);
  await press("read");
  typeFour(realCode);
  const forgedPage = TJ.teamJoinEmptyHtml();
  await press("back");
  const trustW = trustOf(Dw);
  const forgedTakeReal = await Dw.join("invite", forgedCodeBlob, "Ola", realCode);
  const forgedTakePrint = await Dw.join("invite", forgedCodeBlob, "Ola", printOf(LEAD.public).slice(0, 4));
  const keptW = trustOf(Dw) === trustW && filesUnder(forgedYard).length === 0;
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, realBlob);
  await press("read");
  typeFour(realCode);
  const realPage = TJ.teamJoinEmptyHtml();
  await press("invite");
  const envW = Dw.envelope();
  check(pureOk && / disabled/.test(yesOf(forgedPage)) && !/ hidden/.test(missOf(forgedPage))
      && forgedTakeReal && forgedTakeReal.refused === "check" && forgedTakePrint && forgedTakePrint.refused === "check" && keptW
      && !/ disabled/.test(yesOf(realPage)) && !!envW.teamJoin && envW.teamPins && envW.teamPins[TEAM].public === LEAD.public,
    "15aw a forged invitation, its own code right for its own secret and key and its print opening like the real lead's, fails against"
    + " the real lead's code at the confirm and at yes, and so does the print's first group; THE CONTROL, the real invitation with"
    + " that code, is taken: " + (forgedTakeReal && forgedTakeReal.refused) + ", " + (forgedTakePrint && forgedTakePrint.refused)
    + ", then " + (envW.teamJoin ? "taken" : "not taken"));

  /* The code is five digits, so it is sought as a whole token, never inside a longer run of letters and digits; an
     invitation whose code the desk's file already holds as a token, or that is this year, is not the one used. */
  const asToken = code => new RegExp("(^|[^0-9A-Za-z])" + code + "([^0-9A-Za-z]|$)");
  const Dx = await deskWith("code-unwritten", folder("code-unwritten-own"));
  const unwrittenYard = folder("code-unwritten-yard");
  const deskBefore = fs.readFileSync(path.join(Dx.ud, "desk.json"), "utf8");
  let unwritten = "";
  do { unwritten = inviteBlob({ team: TEAM, folder: unwrittenYard, lead: lampLead, secret: newSecret() }); }
  while (asToken(codeFor(unwritten)).test(deskBefore) || codeFor(unwritten) === String(new Date().getFullYear()));
  const codeX = codeFor(unwritten);
  await Dx.join("read", unwritten);
  const tookX = await Dx.join("invite", unwritten, "Ola", codeX);
  const Dx2 = loadDesk(Dx.ud);
  await Dx2.join("state");
  /* The yes reply is scanned too; the read reply carries offer.code for the confirm, and is not. */
  const written = filesUnder(unwrittenYard).concat(filesUnder(Dx.ud)).map(f => fs.readFileSync(f, "latin1")).concat(Dx.said, Dx2.said, [JSON.stringify(tookX)]);
  const holding = written.filter(text => asToken(codeX).test(text)).length;
  check(tookX && tookX.join && tookX.join.state === "waiting" && written.length >= 5 && holding === 0,
    "15ax the check code is written nowhere: not in the share, not in the desk's file or its envelope, not in the log, not in the"
    + " yes reply, across a read, a yes and a restart (" + written.length + " texts read): holding " + holding);

  /* ---- machine policy names the team's folder or its lead: the invitation door is closed --------------------- */
  /* The policy key as reg export writes it, each value a string with its two escapes. Off Windows the shell reads no
     machine policy at all, so there the door stands as it does with none. */
  const regText = rows => "Windows Registry Editor Version 5.00\n\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\n"
    + rows.map(([k, v]) => '"' + k + '"="' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"\n').join("") + "\n";
  const underPolicy = async (rows, name, own) => {
    const before = regStand.calls.export;
    REG.policy = regText(rows);
    try { const D = await deskWith(name, own); D.policyRead = regStand.calls.export > before; return D; }
    finally { REG.policy = null; }
  };
  const writtenUnder = dir => filesUnder(dir).filter(f => f.indexOf(path.join(dir, "desks")) === 0).length;
  /* One desk under the policy `rows` makes of its named folder, which holds the team's file, and a valid invitation from
     `from` into a folder of its own, or into the named folder where `intoNamed`: read, then yes with its right code. */
  let policyCases = 0;
  const policyCase = async (label, rows, from, intoNamed) => {
    const n = policyCases++;
    const named = folder("policy-" + n), invited = intoNamed ? named : folder("policy-invited-" + n);
    put(named, "etiuda-team.json", teamFile([]));
    const Dm = await underPolicy(rows(named), "policy-desk-" + n, folder("policy-own-" + n));
    const blob = inviteBlob({ team: TEAM, folder: invited, lead: from, secret: newSecret() });
    const trust = trustOf(Dm);
    let readM = null, takeM = null;
    const asks = async () => { readM = await Dm.join("read", blob); takeM = await Dm.join("invite", blob, "Ola", codeFor(blob)); };
    /* The named folder is this desk's catalog folder, so its own reads of it are not the invitation's doing. */
    const touchedM = intoNamed ? (await asks(), []) : await watching(invited, asks);
    const kept = trustOf(Dm) === trust, inNamed = writtenUnder(named), inInvited = intoNamed ? 0 : writtenUnder(invited);
    const still = kept && inNamed === 0 && inInvited === 0 && touchedM.length === 0;
    const ok = WIN ? Dm.policyRead && readM && readM.refused === "policy" && !readM.offer && takeM && takeM.refused === "policy" && still
      : !Dm.policyRead && readM && !!readM.offer && readM.refused === undefined;
    return label + ": " + (ok ? "ok" : "read " + (readM && (readM.refused || (readM.offer ? "offered" : "nothing")))
      + ", yes " + (takeM && (takeM.refused || (takeM.join ? takeM.join.state : "nothing"))) + (kept ? "" : ", trust or folder moved")
      + ", requests " + inNamed + " in the policy's folder and " + inInvited + " in the invitation's, touched " + touchedM.length);
  };
  const folderLead = f => [["TeamFolder", f], ["LeadKey", LEAD.public]];
  const byFolder = [
    await policyCase("folder and lead", folderLead, lampLead, false),
    await policyCase("folder alone", f => [["TeamFolder", f]], lampLead, false),
    await policyCase("folder and lead, the invitation naming both", folderLead, lampLead, true),
  ];
  const Dnp = await deskWith("policy-control", folder("policy-control-own"));
  const controlBlob = inviteBlob({ team: TEAM, folder: folder("policy-control-yard"), lead: lampLead, secret: newSecret() });
  const readNp = await Dnp.join("read", controlBlob);
  check(byFolder.every(x => / ok$/.test(x)) && readNp && !!readNp.offer && readNp.refused === undefined,
    "15ay while machine policy names the team's folder, with the lead or without, a valid invitation with its right check code is"
    + " refused at read and at yes with the policy's word, one naming the policy's own folder and lead included, and nothing"
    + " changes: no pin, key or request, in the policy's folder or the invitation's, the desk's folder setting as it was, and"
    + " nothing asked where the invitation points; THE CONTROL, a desk with no policy, is offered it; off Windows no machine"
    + " policy is read and the door stands as before: " + byFolder.join("; "));

  const leadAlone = () => [["LeadKey", LEAD.public]];
  const byLead = [
    await policyCase("lead alone, the invitation from that lead", leadAlone, lampLead, false),
    await policyCase("lead alone, the invitation from another", leadAlone, forgedLead, false),
  ];
  check(byLead.every(x => / ok$/.test(x)),
    "15az a policy naming only the lead's key closes the door too: an invitation from that very lead, or from another, is refused"
    + " at read and at yes with the same word and nothing changes; off Windows no machine policy is read and the door stands as"
    + " before: " + byLead.join("; "));

  /* A join kept from an invitation is let go when machine policy arrives in a later run: the pin it set and the folder it
     set go, and what the desk held before stays. The same desk restarted with no policy keeps it all. */
  const restartUnder = async (rows, ud) => {
    const before = regStand.calls.export;
    REG.policy = rows ? regText(rows) : null;
    try { const D = loadDesk(ud); await D.join("state"); D.policyRead = regStand.calls.export > before; return D; }
    finally { REG.policy = null; }
  };
  const T2 = "t-" + crypto.randomBytes(8).toString("hex");
  const keptT2 = { [T2]: { "1": Buffer.from("kept").toString("base64") } };
  const letGoOutcome = [];
  const bothNamed = f => [["TeamFolder", f], ["LeadKey", LEAD.public]];
  const LET_GO_LINE = "the request to join team " + TEAM + " made from an invitation is let go, since machine policy names this desk's team";
  for (const [label, priorPins, rows] of [["folder and lead, no pin before", { [T2]: LEAD }, bothNamed],
    ["folder and lead, the invited lead pinned before", { [T2]: LEAD, [TEAM]: FORGED }, bothNamed],
    ["lead alone, no pin before", { [T2]: LEAD }, null]]) {
    const n = letGoOutcome.length, priorFolder = folder("letgo-own-" + n), invitedYard = folder("letgo-yard-" + n);
    const policyFolder = folder("letgo-policy-" + n);
    const Di = await deskWith("letgo-" + n, priorFolder, { teamPins: priorPins, teamSeen: [T2], teamKeys: keptT2 });
    const meI = await Di.ask("etiuda:branch-identity", true);
    const inviteI = inviteBlob({ team: TEAM, folder: invitedYard, lead: forgedLead, secret: newSecret() });
    const tookI = await Di.join("invite", inviteI, "Ola", codeFor(inviteI));
    const afterYes = Di.envelope();
    const Dn = await restartUnder(null, Di.ud);
    const plain = Dn.envelope();
    const keptPlain = !!plain.teamJoin && !!plain.teamJoin.invite && plain.teamPins[TEAM].public === FORGED.public
      && plain.keys.eCatalogFolder === invitedYard;
    /* The invited lead's file, the desk on its roster, in the folder the desk reads under the policy: its own where the policy
       names only the lead. Under the policy it is not trusted. */
    put(rows ? policyFolder : priorFolder, "etiuda-team.json", teamFile([entry(meI, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
    const Dq = await restartUnder(rows ? rows(policyFolder) : [["LeadKey", LEAD.public]], Di.ud);
    const env = Dq.envelope(), pins = env.teamPins || {};
    const refusedFile = Dq.said.some(l => l.indexOf("is signed by a key other than the lead's this desk trusts for team " + TEAM) >= 0);
    const priorStays = pins[T2] && pins[T2].public === LEAD.public && (env.teamSeen || []).indexOf(T2) >= 0
      && JSON.stringify((env.teamKeys || {})[T2]) === JSON.stringify(keptT2[T2]);
    const invitedPin = priorPins[TEAM] ? !!pins[TEAM] && pins[TEAM].public === FORGED.public : !pins[TEAM];
    /* The let-go is said once, in these words, and neither it, the rest of that run's log nor the desk's file after it holds
       the invitation's secret, the proof its request carried or its check code. */
    const proofI = afterYes.teamJoin && afterYes.teamJoin.invite ? String(afterYes.teamJoin.invite.proof) : "";
    const letGoSaid = Dq.said.filter(l => l === "ERR etiuda: " + LET_GO_LINE).length;
    const holding = [Dq.said.join("\n"), fs.readFileSync(path.join(Di.ud, "desk.json"), "latin1")]
      .filter(text => text.indexOf(secretOf(inviteI)) >= 0 || (!!proofI && text.indexOf(proofI) >= 0) || asToken(codeFor(inviteI)).test(text)).length;
    const quietPlain = !Dn.said.some(l => l.indexOf(LET_GO_LINE) >= 0);
    const ok = WIN
      ? Dq.policyRead && !env.teamJoin && invitedPin && env.keys.eCatalogFolder === priorFolder && priorStays && refusedFile
        && !(env.teamKeys || {})[TEAM] && fs.existsSync(path.join(invitedYard, "desks", meI.id, "join.json"))
        && letGoSaid === 1 && /^[0-9a-f]{64}$/.test(proofI) && holding === 0 && quietPlain
      : !!env.teamJoin && env.keys.eCatalogFolder === invitedYard && priorStays && letGoSaid === 0 && quietPlain;
    letGoOutcome.push(label + ": " + (tookI && tookI.join && afterYes.keys.eCatalogFolder === invitedYard && keptPlain && ok ? "ok"
      : "yes " + (tookI && (tookI.refused || (tookI.join && tookI.join.state))) + ", kept with no policy " + keptPlain
        + ", the let-go said " + letGoSaid + " time(s) under policy and " + (quietPlain ? "not" : "also") + " with none, "
        + holding + " text(s) holding the secret, the proof or the code"
        + ", under policy: join " + (env.teamJoin ? "kept" : "gone") + ", invited pin " + (pins[TEAM] ? pins[TEAM].keyId + (pins[TEAM].public === FORGED.public ? " (the invitation's)" : "") : "none")
        + ", folder " + (env.keys.eCatalogFolder === priorFolder ? "the desk's own" : env.keys.eCatalogFolder === invitedYard ? "the invitation's" : "other")
        + ", earlier trust " + (priorStays ? "kept" : "lost") + ", the invited lead's file " + (refusedFile ? "refused" : "not refused")));
  }
  check(letGoOutcome.every(x => / ok$/.test(x)),
    "15bf a join kept from an invitation is let go once machine policy arrives in a later run: the pin the invitation set and"
    + " the folder it set go, the desk's own folder comes back, its request stays where it was written, and the invited lead's"
    + " file is refused under the policy, and the desk says once that the request is let go, with no secret, proof or check code in"
    + " that sentence, the rest of its log or its file, while a pin, a key and a key shown that the desk held before stay; THE"
    + " CONTROL, the same desk restarted with no policy, keeps the join, the pin and the folder and says no let-go; off Windows no"
    + " machine policy is read and all of it stays: " + letGoOutcome.join("; "));

  /* A join made from the folder's own request, with no invitation, is not policy's to let go: restarted under each policy, the
     request, its code and what the desk held before stay, and no let-go is said. In the same run an invitation is refused with
     the policy's word, so the policy was in force. */
  const plainShare = folder("plain-share");
  put(plainShare, "etiuda-team.json", teamFile([]));
  put(plainShare, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  const Dg = await deskWith("plain-join", plainShare, { teamPins: { [T2]: LEAD }, teamSeen: [T2], teamKeys: keptT2 });
  const meG = await Dg.ask("etiuda:branch-identity", true);
  await Dg.join("ask", "lamps.ec", "Ola");
  const reqG = path.join(plainShare, "desks", meG.id, "join.json");
  const commitG = fs.existsSync(reqG) ? JSON.parse(fs.readFileSync(reqG, "utf8")).commit : "";
  put(plainShare, P.JOINS_NAME, joins([{ desk: meG.id, commit: commitG, nonce: nonce() }]));
  const viewG = v => (v && v.join ? v.join.state + " " + v.join.code : "no join");
  const codeG = viewG(await Dg.join("state"));
  const joinG = JSON.stringify(Dg.envelope().teamJoin || null), bytesG = fs.existsSync(reqG) ? fs.readFileSync(reqG, "utf8") : "";
  const plainBlob = inviteBlob({ team: TEAM, folder: folder("plain-yard"), lead: lampLead, secret: newSecret() });
  const plainKept = [];
  for (const [label, rows] of [["no policy", null], ["folder and lead", bothNamed(plainShare)], ["folder alone", [["TeamFolder", plainShare]]],
    ["lead alone", [["LeadKey", LEAD.public]]]]) {
    const Dgr = await restartUnder(rows, Dg.ud);
    const v = await Dgr.join("state"), door = await Dgr.join("read", plainBlob);
    const env = Dgr.envelope(), pins = env.teamPins || {};
    const stays = JSON.stringify(env.teamJoin || null) === joinG && !(env.teamJoin || {}).invite && viewG(v) === codeG
      && fs.readFileSync(reqG, "utf8") === bytesG && env.keys.eCatalogFolder === plainShare
      && !!pins[T2] && pins[T2].public === LEAD.public && (env.teamSeen || []).indexOf(T2) >= 0
      && JSON.stringify((env.teamKeys || {})[T2]) === JSON.stringify(keptT2[T2]);
    const unsaid = !Dgr.said.some(l => l.indexOf("made from an invitation is let go") >= 0);
    const inForce = rows && WIN ? Dgr.policyRead && door && door.refused === "policy" : door && !!door.offer && door.refused === undefined;
    plainKept.push(label + ": " + (stays && unsaid && inForce ? "ok" : (stays ? "kept" : "join " + viewG(v) + (env.teamJoin ? "" : ", gone from the file"))
      + (unsaid ? "" : ", let-go said") + ", the invitation " + (door && (door.refused || (door.offer ? "offered" : "nothing")))));
  }
  check(/^code [0-9]{6}$/.test(codeG) && plainKept.every(x => / ok$/.test(x)),
    "15bg a join made from the folder's own request, with no invitation, is kept when machine policy arrives in a later run, under a"
    + " policy naming the folder and the lead, the folder alone or the lead alone: the request in the desk's file and on the share,"
    + " its six-digit code, the folder and what the desk held before all stay, and no let-go is said, while in that same run an"
    + " invitation is refused with the policy's word; THE CONTROL, a restart with no policy, keeps it too and the invitation is"
    + " offered; off Windows no machine policy is read and all of it stays: " + codeG.split(" ")[0] + "; " + plainKept.join("; "));

  /* ---- the confirm's host line comes only from a folder the reader returned ----------------------------------- */
  /* The shell evaluated with folderHost wrapped, so every folder it is asked of is kept here. */
  const HOST_SRC = SRC.split("function folderHost(").length === 2
    ? SRC.replace("function folderHost(", "function folderHostAsked(")
      + "\nfunction folderHost(f, e) { globalThis.etiudaHostAsked.push(String(f)); return folderHostAsked(f, e); }"
    : "";
  const hostForms = ["/\\evil.example\\share\\team", "\\/evil.example/share/team", "/\\evil.example\\share\\OneDrive\\team",
    "\\\\?\\UNC\\evil.example\\share\\team", "C:\\OneDrive\\..\\Windows\\Temp\\team", "\\\\quay-host\\catalogs\\",
    "C:/OneDrive/team/", folder("host-yard") + path.sep];
  const hostWrong = [];
  let hostTaken = 0;
  if (!HOST_SRC) hostWrong.push("shell/main.js does not hold exactly one folderHost declaration");
  else {
    const udH = path.join(LAB, "host-asked");
    fs.mkdirSync(udH, { recursive: true });
    fs.writeFileSync(path.join(udH, "desk.json"),
      JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder("host-own"), eUiLang: "en" } }), "utf8");
    const Dh = loadDesk(udH, HOST_SRC);
    await Dh.ask("etiuda:branch-identity", true);
    for (const form of hostForms) {
      const blob = inviteBlob({ team: TEAM, folder: form, lead: lampLead, secret: newSecret() });
      const want = P.inviteRead(blob, !WIN);
      globalThis.etiudaHostAsked = [];
      const got = await Dh.join("read", blob);
      await Dh.join("invite", blob, "Ola", wrongFor(blob));
      const asked = globalThis.etiudaHostAsked;
      if (want) hostTaken++;
      if (JSON.stringify(asked) !== JSON.stringify(want ? [want.folder] : []) || (got && got.offer ? got.offer.folder : null) !== (want ? want.folder : null))
        hostWrong.push(JSON.stringify(form) + " asked of " + JSON.stringify(asked));
    }
    delete globalThis.etiudaHostAsked;
  }
  check(hostWrong.length === 0 && hostTaken >= 1,
    "15bb where a folder sits is asked only of the folder the invitation reader returned, once at read, never at yes, and never of"
    + " a text it refused (" + hostForms.length + " forms, " + hostTaken + " taken): " + JSON.stringify(hostWrong));

  /* The page shows the policy's refusal in its own sentence, in either language. */
  const ST = await import(MOD("storage.js"));
  const langWas = ST.lsGet("eUiLang");
  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read" || op === "invite"
    ? { sealed: null, join: null, leads: [], refused: "policy" } : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const policyPage = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, controlBlob);
    await press("read");
    policyPage[lang] = TJ.teamJoinEmptyHtml();
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const POLICY_LINE = { en: "The organisation's IT sets this desk's team, so invitations are turned off.",
    pl: "Zespół tego stanowiska ustawia dział IT organizacji, więc zaproszenia są wyłączone." };
  const pageSaid = lang => (/<p>([^<]*)<\/p>/.exec(policyPage[lang] || "") || ["", ""])[1];
  const escHtml = s => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
  check(pageSaid("en") === escHtml(POLICY_LINE.en) && pageSaid("pl") === escHtml(POLICY_LINE.pl) && policyPage.en.indexOf(secretOf(controlBlob)) < 0,
    "15ba the policy's refusal reaches the page as its own sentence, in English and in Polish: " + pageSaid("en") + " / " + pageSaid("pl"));

  const UNREADABLE_LINE = { en: "The team file in this folder could not be read, so this desk did not join and nothing was written. Let the team's lead know, so they can check the folder.",
    pl: "Nie udało się odczytać pliku zespołu w tym folderze, więc stanowisko nie dołączyło i nic nie zapisano. Proszę dać znać liderowi zespołu: może sprawdzić ten folder." };
  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read" || op === "invite"
    ? { sealed: null, join: null, leads: [], refused: "unreadable" } : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const unreadableSaid = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, controlBlob);
    await press("read");
    unreadableSaid[lang] = (/<p>([^<]*)<\/p>/.exec(TJ.teamJoinEmptyHtml()) || ["", ""])[1];
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(tookE.every(x => x === "unreadable") && keptE
      && unreadableSaid.en === escHtml(UNREADABLE_LINE.en) && unreadableSaid.pl === escHtml(UNREADABLE_LINE.pl),
    "15be a folder whose team file cannot be read, a folder standing where the file would or a file that is not JSON, takes no"
    + " request and puts the desk's folder back, refused with a word of its own that the page says in its own sentence, in"
    + " English and in Polish: " + JSON.stringify(tookE) + ", " + unreadableSaid.en);

  /* A team file larger than the shell reads (TEAM_MAX in shell/main.js, 1 MiB) is one it cannot read, however whole: refused
     at yes with that word, and the page over this desk's own shell says that sentence. THE CONTROL is the same file at
     exactly 1 MiB, read and taken. */
  const MIB = 1024 * 1024;
  const padTeam = (dir, size) => {
    const text = JSON.stringify(teamFile([])), at = path.join(dir, "etiuda-team.json");
    fs.writeFileSync(at, text + " ".repeat(size - Buffer.byteLength(text)), "utf8");
    return fs.statSync(at).size;
  };
  const overYard = folder("files-oversized"), atYard = folder("files-at-limit");
  const sizes = [padTeam(overYard, MIB + 1), padTeam(atYard, MIB)];
  const Do = await deskWith("oversized", folder("oversized-own"));
  const trustO = trustOf(Do);
  const overBlob = inviteBlob({ team: TEAM, folder: overYard, lead: lampLead, secret: newSecret() });
  const overWord = await Do.join("invite", overBlob, "Ola", codeFor(overBlob));
  await pageOn(Do);
  const overSaid = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, overBlob);
    await press("read");
    typeFour(codeFor(overBlob));
    await press("invite");
    overSaid[lang] = (/<p>([^<]*)<\/p>/.exec(TJ.teamJoinEmptyHtml()) || ["", ""])[1];
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const keptO = trustOf(Do) === trustO && writtenUnder(overYard) === 0;
  const atBlob = inviteBlob({ team: TEAM, folder: atYard, lead: lampLead, secret: newSecret() });
  const atWord = await Do.join("invite", atBlob, "Ola", codeFor(atBlob));
  check(sizes[0] === MIB + 1 && sizes[1] === MIB && overWord && overWord.refused === "unreadable" && keptO
      && overSaid.en === escHtml(UNREADABLE_LINE.en) && overSaid.pl === escHtml(UNREADABLE_LINE.pl)
      && atWord && atWord.join && atWord.join.state === "waiting" && writtenUnder(atYard) === 1,
    "15bh a team file one byte larger than 1 MiB, whole under the invited lead otherwise, is one the desk cannot read: refused at"
    + " yes as unreadable, nothing written or pinned and the desk's folder put back, and the page over this desk's shell says the"
    + " team file could not be read, in English and in Polish; THE CONTROL, the same file at exactly 1 MiB, is read and taken: "
    + sizes.join(" and ") + " bytes, " + (overWord && (overWord.refused || (overWord.join ? overWord.join.state : "nothing"))) + ", then "
    + (atWord && (atWord.refused || (atWord.join ? atWord.join.state : "nothing"))) + "; " + overSaid.en);

  /* A read the page has let go is answered to nobody: one left by Cancel, and one landing while another paste box is open. */
  const Dst = await deskWith("stale", folder("stale-own"));
  const staleAt = folder("stale-a");
  const staleA = inviteBlob({ team: TEAM, folder: staleAt, lead: lampLead, secret: newSecret() });
  const staleB = inviteBlob({ team: TEAM, folder: folder("stale-b"), lead: lampLead, secret: newSecret() });
  let slowText = "";
  window.E_HOST = { onTeamJoin: noop, teamJoin: (op, file, name, four) => (op === "read" && file === slowText
    ? new Promise(r => setTimeout(() => r(Dst.join(op, file, name, four)), 60)) : Dst.join(op, file, name, four)) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  slowText = staleA;
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleA);
  const lateA = press("read");
  await press("back");
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleB);
  await lateA;
  const whileB = held(), whileBHtml = TJ.teamJoinEmptyHtml();
  await press("read");
  const shownB = held();
  await press("back");
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleA);
  const lateA2 = press("read");
  await press("back");
  await lateA2;
  const abandoned = held(), abandonedHtml = TJ.teamJoinEmptyHtml();
  slowText = "";
  check(!!whileB && whileB.mode === "paste" && whileB.offer === null && whileBHtml.indexOf(staleAt) < 0
      && !!shownB && shownB.mode === "confirm" && shownB.read === staleB && letGo(abandoned) && abandonedHtml.indexOf(staleAt) < 0,
    "15bc a read the page let go is answered to nobody: one landing while another invitation's paste box is open leaves that box as"
    + " it was and the next read shows its own, and one left by Cancel shows nothing when it lands: "
    + (whileB && whileB.mode) + ", then " + (shownB && shownB.mode) + ", then " + (abandoned && (abandoned.mode || "nothing")));

  /* Hide on the bubble, where a catalog is open, lets the invitation go as Cancel does. The bubble is drawn on stand-ins. */
  const AS = await import(MOD("app-state.js"));
  const bubbles = [];
  const stubNode = () => ({ className: "", id: "", style: {}, attrs: {}, listeners: {}, isConnected: false, innerHTML: "",
    offsetWidth: 340, offsetHeight: 200, classList: { contains: () => false, add: noop, remove: noop },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, appendChild(c) { return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], remove() { this.removed = true; } });
  const docWas = { createElement: document.createElement, body: document.body };
  const globalsWas = {};
  for (const k of ["innerWidth", "innerHeight", "addEventListener", "removeEventListener"]) globalsWas[k] = globalThis[k];
  let heldShown = null, heldHidden = null, escaped = false;
  try {
    document.createElement = () => stubNode();
    document.body = { appendChild: el => { bubbles.push(el); return el; } };
    Object.assign(globalThis, { innerWidth: 1280, innerHeight: 800, addEventListener: noop, removeEventListener: noop });
    const Dhd = await deskWith("hide", folder("hide-own"));
    window.E_HOST = hostOver(Dhd);
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 30));
    AS.setCards([{ id: "c-hide" }]);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, inviteBlob({ team: TEAM, folder: folder("hide-yard"), lead: lampLead, secret: newSecret() }));
    await press("read");
    heldShown = held();
    const top = bubbles[bubbles.length - 1];
    const onKey = top && (top.listeners.keydown || [])[0];
    if (onKey) { onKey({ key: "Escape", preventDefault: noop, stopPropagation: noop }); escaped = true; }
    heldHidden = held();
  } finally {
    AS.setCards([]);
    document.createElement = docWas.createElement;
    document.body = docWas.body;
    for (const k of Object.keys(globalsWas)) { if (globalsWas[k] === undefined) delete globalThis[k]; else globalThis[k] = globalsWas[k]; }
  }
  check(!!heldShown && heldShown.mode === "confirm" && heldShown.read !== "" && escaped && letGo(heldHidden),
    "15bd Hide on the bubble, pressed while it holds an invitation's confirm, lets the invitation go as Cancel does: "
    + (heldShown && heldShown.mode) + ", then " + (heldHidden && (heldHidden.mode || "nothing held")) + ", " + bubbles.length + " bubble(s) drawn");

  /* A lead may open an invitation's request for the six-digit code. The reveal rewrites the file. The bytes written
     at yes stay, and only the reveal and the opening are added. A request that never carried an invitation gains the
     same two fields and nothing else, which is the file this desk has always written on a reveal. */
  const codeYard = folder("code-yard");
  put(codeYard, "etiuda-team.json", teamFile([entry(me2, K1, 1)]));
  put(codeYard, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  const Dplain = newDesk("code-plain", codeYard);
  const mePlain = await Dplain.ask("etiuda:branch-identity", true);
  const askedPlain = await Dplain.join("ask", "lamps.ec", "Bram");
  const plainPath = path.join(codeYard, "desks", mePlain.id, "join.json");
  const plainWait = fs.existsSync(plainPath) ? fs.readFileSync(plainPath, "utf8") : "";
  const Dinv = newDesk("code-inv", folder("code-old"));
  const meInv = await Dinv.ask("etiuda:branch-identity", true);
  const secretBi = newSecret();
  const biBlob = inviteBlob({ team: TEAM, folder: codeYard, lead: lampLead, secret: secretBi });
  const tookBi = await Dinv.join("invite", biBlob, "Nils", codeFor(biBlob));
  const invPath = path.join(codeYard, "desks", meInv.id, "join.json");
  const invWait = fs.existsSync(invPath) ? fs.readFileSync(invPath, "utf8") : "";
  const readReq = (text) => { try { return JSON.parse(text); } catch { return null; } };
  const plainDoc = readReq(plainWait), invDoc = readReq(invWait);
  const nPlain = nonce(), nInv = nonce();
  const joinPlain = Dplain.envelope().teamJoin || {}, joinInv = Dinv.envelope().teamJoin || {};
  put(codeYard, P.JOINS_NAME, joins([
    { desk: mePlain.id, commit: plainDoc && plainDoc.commit, nonce: nPlain },
    { desk: meInv.id, commit: invDoc && invDoc.commit, nonce: nInv },
  ]));
  const seenPlain = await Dplain.join("state");
  const seenInv = await Dinv.join("state");
  const plainNow = fs.existsSync(plainPath) ? fs.readFileSync(plainPath, "utf8") : "";
  const invNow = fs.existsSync(invPath) ? fs.readFileSync(invPath, "utf8") : "";
  const plainGot = readReq(plainNow), invGot = readReq(invNow);
  const beforeSig = (text) => { const at = text.indexOf("\n \"sig\":"); return at < 0 ? "" : text.slice(0, at); };
  /* The bytes a reveal adds, built by the same stringify the shell uses, so a drifted field or a drifted order fails. */
  const revealTail = (deskNonce, leadNonce) => {
    const text = JSON.stringify({ reveal: deskNonce,
      opened: { lead: { keyId: LEAD.keyId, public: LEAD.public }, nonce: leadNonce }, sig: 0 }, null, 1);
    const at = text.indexOf("\n \"sig\":");
    return at < 0 ? "" : text.slice(1, at);
  };
  const plainHead = beforeSig(plainWait), invHead = beforeSig(invWait);
  const plainGrew = beforeSig(plainNow) === plainHead + revealTail(joinPlain.nonce, nPlain);
  const invGrew = beforeSig(invNow) === invHead + revealTail(joinInv.nonce, nInv);
  const codePlain = P.joinCode(TEAM, mePlain.key, mePlain.box, LEAD.public, joinPlain.nonce, nPlain);
  const codeInv = P.joinCode(TEAM, meInv.key, meInv.box, LEAD.public, joinInv.nonce, nInv);
  const codeShown = (seen) => !!(seen && seen.join && seen.join.state === "code" && seen.join.code);
  const invLead = !!(seenInv && seenInv.join && seenInv.join.invite && seenInv.join.invite.lead === "Lamp lead");
  const plainOk = !!(askedPlain && askedPlain.join && askedPlain.join.state === "waiting" && plainDoc && plainGot
    && plainDoc.invite === undefined && plainDoc.desk && plainDoc.desk.kind === undefined
    && plainGrew && plainGot.invite === undefined && plainGot.desk && plainGot.desk.kind === undefined
    && plainGot.commit === plainDoc.commit && plainGot.reveal === joinPlain.nonce
    && codeShown(seenPlain) && seenPlain.join.code === codePlain && P.joinGenuine(plainGot, mePlain.id));
  const invOk = !!(tookBi && tookBi.join && tookBi.join.state === "waiting" && invDoc && invGot
    && invDoc.desk && invDoc.desk.kind === "desk" && invDoc.invite && invGrew
    && invGot.desk && invGot.desk.kind === invDoc.desk.kind
    && JSON.stringify(invGot.invite) === JSON.stringify(invDoc.invite)
    && invGot.commit === invDoc.commit && invGot.reveal === joinInv.nonce
    && codeShown(seenInv) && seenInv.join.code === codeInv && invLead && P.joinGenuine(invGot, meInv.id));
  check(plainOk && invOk,
    "15bi a desk that took an invitation, opened afterwards, reveals with that invitation and its kind intact, and its view names the lead and shows its code,"
    + " while a request with no invitation reveals with only the opening added and shows its code: invite " + (invOk ? "kept" : "dropped")
    + ", plain " + (plainOk ? "unchanged" : "moved"));

  /* An invitation's wait names the lead and never draws a code. A request still does, empty places and then the digits. */
  let tookFn = null;
  const Dwait = await deskWith("door-wait", folder("invite-own"));
  const waitYard = folder("invite-wait-yard");
  window.E_HOST = { onTeamJoin: fn => { tookFn = fn; }, teamJoin: (op, file, name, four) => Dwait.join(op, file, name, four) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  ST.lsSet("eUiLang", "en");
  const waitBlob = inviteBlob({ team: TEAM, folder: waitYard, lead: lampLead, secret: newSecret() });
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, waitBlob);
  await press("read");
  typeFour(codeFor(waitBlob));
  await press("invite");
  const waitHtml = TJ.teamJoinEmptyHtml();
  const shellWait = await Dwait.join("state");
  const quietInvite = !!(shellWait && shellWait.join && shellWait.join.code === "" && shellWait.join.state === "waiting"
    && shellWait.join.invite && shellWait.join.invite.lead === "Lamp lead");
  const enInvite = waitHtml.indexOf("Joining Lamp lead&#39;s team") >= 0
    && waitHtml.indexOf("Waiting for the team&#39;s lead to let this desk in. Usually this happens by itself; if a code appears here, read it to the lead.") >= 0
    && waitHtml.indexOf("asked at") >= 0
    && waitHtml.indexOf("e-join-code") < 0 && waitHtml.indexOf("e-join-wait") < 0
    && waitHtml.indexOf("Waiting for the lead to open the request") < 0
    && waitHtml.indexOf('data-join="cancel"') >= 0;
  const paint = view => { if (tookFn) tookFn(view); return TJ.teamJoinEmptyHtml(); };
  const armed = paint({ join: { file: "a.ec", state: "code", code: "483920", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] });
  const armedDigits = armed.indexOf(">483<") >= 0 && armed.indexOf(">920<") >= 0 && armed.indexOf("e-join-code") >= 0
    && armed.indexOf("Read this code to the team&#39;s lead") >= 0;
  const blank = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia", invite: { lead: "" } }, leads: [] });
  const namedLead = blank.indexOf("the lead") >= 0 && blank.indexOf("Joining &#39;s") < 0 && blank.indexOf("e-join-code") < 0
    && blank.indexOf("asked at") >= 0 && blank.indexOf("Nia") >= 0;
  const requestWait = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia" }, leads: [] });
  const requestCode = paint({ join: { file: "a.ec", state: "code", code: "120034", asked: 1, name: "Nia" }, leads: [] });
  const requestDoor = requestWait.indexOf("Waiting for the lead to open the request") >= 0 && requestWait.indexOf("e-join-wait") >= 0
    && requestCode.indexOf("e-join-code") >= 0 && requestCode.indexOf(">120<") >= 0 && requestCode.indexOf(">034<") >= 0
    && requestCode.indexOf("Joining ") < 0;
  ST.lsSet("eUiLang", "pl");
  const plHtml = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] });
  const plInvite = plHtml.indexOf("Dołączanie do zespołu osoby Lamp lead") >= 0
    && plHtml.indexOf("Stanowisko czeka, aż lider zespołu je wpuści. Zwykle dzieje się to samo; jeśli pojawi się tu kod, proszę odczytać go liderowi.") >= 0
    && plHtml.indexOf("e-join-code") < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(!!tookFn && quietInvite && enInvite && armedDigits && namedLead && requestDoor && plInvite,
    "15bk an invitation's wait names the lead and says the lead's Studio admits the desk, with no code places and no digits, in English and in Polish;"
    + " once the lead has opened it the same invitation shows its digits;"
    + " a request still waits with empty places and then shows its code: view " + (shellWait && shellWait.join ? shellWait.join.state + "/" + shellWait.join.code : "none")
    + (quietInvite ? " lead named" : " lead missing")
    + " parts " + [!!quietInvite, !!enInvite, !!armedDigits, !!namedLead, !!requestDoor, !!plInvite].join("/"));

  /* Board 945 item 9, Part A: etiuda-team-pause.json tells a waiting desk the lead cannot admit desks for now */
  const LAPSE_EN = "The team's lead cannot let desks in for now, as the lead's licence is paused. Nothing needs doing here: once the licence is active again, this desk is let in by itself.";
  const LAPSE_PL = "Lider zespołu nie może na razie wpuszczać stanowisk, bo jego licencja jest wstrzymana. Tutaj nic nie trzeba robić: gdy licencja znów będzie aktywna, stanowisko zostanie wpuszczone samo.";
  const pausePath = path.join(waitYard, "etiuda-team-pause.json");
  const signPause = (doc, keyPair) => {
    const o = Object.assign({}, doc, { sig: { alg: "Ed25519", keyId: keyPair.keyId } });
    o.sig.value = crypto.sign(null, Dwait.api.askSignedBytes(o), keyPair.privateKey).toString("hex");
    return o;
  };
  const pauseDoc = (paused, t, keyPair, teamId) => signPause({
    format: 1, kind: "etiuda-team-pause", team: teamId || TEAM, paused, t
  }, keyPair || { keyId: LEAD.keyId, privateKey: lead.privateKey });

  // 15ea: a paused:true file signed by the lead turns a waiting desk's line into the lapse sentence, in English and Polish
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(true, 1000)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let pState = await Dwait.join("state");
  if (tookFn) tookFn(pState);
  ST.lsSet("eUiLang", "en");
  let pEn = TJ.teamJoinEmptyHtml();
  ST.lsSet("eUiLang", "pl");
  let pPl = TJ.teamJoinEmptyHtml();
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const pausedOk = !!(pState && pState.join && pState.join.paused === true)
    && (pEn.indexOf(LAPSE_EN) >= 0 || pEn.indexOf("The team&#39;s lead cannot let desks in for now, as the lead&#39;s licence is paused. Nothing needs doing here: once the licence is active again, this desk is let in by itself.") >= 0)
    && pEn.indexOf("Waiting for the team") < 0
    && pPl.indexOf(LAPSE_PL) >= 0 && pPl.indexOf("Stanowisko czeka, aż lider") < 0;
  check(pausedOk,
    "15ea a paused:true file signed by the lead turns a waiting desk's line into the lapse sentence, in English and in Polish: "
    + (pausedOk ? "said" : "not said"));

  // 15eb: forged, other-team, and older pause files do not change anything
  const pauseForgedPair = crypto.generateKeyPairSync("ed25519");
  const pauseForgedLead = { keyId: "forged-lead", privateKey: pauseForgedPair.privateKey };
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(true, 5000, pauseForgedLead)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let forgedState = await Dwait.join("state");
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(true, 6000, null, "t-other-team-1234")) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let otherTeamState = await Dwait.join("state");
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(false, 2000)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let resumedState = await Dwait.join("state");
  if (tookFn) tookFn(resumedState);
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(true, 1500)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let oldPauseState = await Dwait.join("state");
  if (tookFn) tookFn(oldPauseState);
  ST.lsSet("eUiLang", "en");
  let oldPauseHtml = TJ.teamJoinEmptyHtml();
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const ignoreBad = !!(resumedState && resumedState.join && !resumedState.join.paused)
    && !!(oldPauseState && oldPauseState.join && !oldPauseState.join.paused)
    && oldPauseHtml.indexOf("Waiting for the team&#39;s lead to let this desk in") >= 0
    && oldPauseHtml.indexOf("cannot let desks in for now") < 0;
  check(ignoreBad,
    "15eb forged, other-team, and older pause files change nothing: "
    + (ignoreBad ? "ignored" : "changed state"));

  // 15ec: newer paused:true lifts to pause again, and resume at strictly higher t restores waiting line
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(true, 3000)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let pauseAgain = await Dwait.join("state");
  fs.writeFileSync(pausePath, JSON.stringify(pauseDoc(false, 4000)) + "\n");
  Dwait.api.catalogChanged(Dwait.win);
  let resumeAgain = await Dwait.join("state");
  if (tookFn) tookFn(resumeAgain);
  ST.lsSet("eUiLang", "en");
  let resumedHtml = TJ.teamJoinEmptyHtml();
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const cycleOk = !!(pauseAgain && pauseAgain.join && pauseAgain.join.paused === true)
    && !!(resumeAgain && resumeAgain.join && !resumeAgain.join.paused)
    && resumedHtml.indexOf("Waiting for the team&#39;s lead to let this desk in") >= 0;
  check(cycleOk,
    "15ec a paused:false file with rising t clears the pause and restores the waiting line: "
    + (cycleOk ? "cycle ok" : "cycle failed"));

  // 15ed: lifting plant:f9-team-pause leaves the waiting line bare while paused
  {
    if (PLANTS_OFF) {
      skip("15ed lifting plant:f9-team-pause leaves the waiting line bare while paused");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:f9-team-pause") >= 0);
      let turned = false;
      if (at >= 0) {
        lines[at] = "      if (false) { /* plant:f9-team-pause */";
        fs.writeFileSync(mainPath, lines.join("\n"));
        const Dplanted = await deskWith("door-wait-plant", folder("invite-own-plant"), null, lines.join("\n"));
        const plantYard = folder("invite-wait-yard-plant");
        const plantBlob = inviteBlob({ team: TEAM, folder: plantYard, lead: lampLead, secret: newSecret() });
        await Dplanted.join("read", plantBlob);
        typeFour(codeFor(plantBlob));
        await Dplanted.join("invite", plantBlob, "Nia", codeFor(plantBlob));
        fs.writeFileSync(path.join(plantYard, "etiuda-team-pause.json"), JSON.stringify(pauseDoc(true, 1000)) + "\n");
        Dplanted.api.catalogChanged(Dplanted.win);
        const st = await Dplanted.join("state");
        turned = !st.join || !st.join.paused;
      }
      fs.writeFileSync(mainPath, before);
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15ed lifting plant:f9-team-pause leaves the waiting line bare while paused (FAIL 15ea pause file ignored): "
        + (turned ? "turned" : "did not turn") + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* Board 922, F1. A relay join that waits says so in the copywriter's words, and a relay invitation the relay refused as used or
     expired is said on the same card, in English and in Polish, with acts that clear it; a shared-folder join keeps its own line. */
  const escPage = (await import(MOD("esc.js"))).esc;
  const COPY = { waitEn: "Waiting for the team's lead to let this desk in. Nothing more is needed here, and the team's catalogs are already open to work with.", waitPl: "Stanowisko czeka, aż lider zespołu je wpuści. Tutaj nic więcej nie trzeba robić, a katalogi zespołu są już dostępne do pracy.", usedEn: "This invitation has already been used. Ask your lead for a new one.", usedPl: "To zaproszenie zostało już użyte. Nowe wystawi lider zespołu.",
    endedEn: "This invitation has expired. Ask your lead for a new one.", endedPl: "To zaproszenie wygasło. Nowe wystawi lider zespołu." };
  const SHARED_EN = "Waiting for the team's lead to let this desk in. Usually this happens by itself; if a code appears here, read it to the lead.";
  const SHARED_PL = "Stanowisko czeka, aż lider zespołu je wpuści. Zwykle dzieje się to samo; jeśli pojawi się tu kod, proszę odczytać go liderowi.";
  const RELAY_TEAM = "t-5c1a77e0b3d94f20";
  const relayJoin = state => ({ join: { file: "", state: state, code: "", asked: 1, name: "Nia", team: RELAY_TEAM,
    invite: { lead: "Lamp lead", relay: "relay.test" } }, leads: [] });
  const folderJoin = { join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] };
  const cardIn = (lang, view) => { ST.lsSet("eUiLang", lang); return paint(view); };
  const waitEn = cardIn("en", relayJoin("waiting")), waitPl = cardIn("pl", relayJoin("waiting"));
  const folderEn = cardIn("en", folderJoin), folderPl = cardIn("pl", folderJoin);
  const relayWaits = waitEn.indexOf(escPage(COPY.waitEn)) >= 0 && waitEn.indexOf("Usually this happens by itself") < 0
    && waitPl.indexOf(COPY.waitPl) >= 0 && waitPl.indexOf("Zwykle dzieje się to samo") < 0
    && waitEn.indexOf('data-join="cancel"') >= 0 && waitEn.indexOf("e-join-code") < 0;
  const folderKept = folderEn.indexOf(escPage(SHARED_EN)) >= 0 && folderEn.indexOf("Nothing more is needed here") < 0
    && folderPl.indexOf(SHARED_PL) >= 0 && folderPl.indexOf("Tutaj nic więcej nie trzeba robić") < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(!!tookFn && relayWaits && folderKept,
    "15cj a relay join that waits shows the copywriter's waiting line on its card in English and in Polish, and a shared-folder join keeps its own line:"
    + " relay " + (relayWaits ? "worded" : "not worded") + ", folder " + (folderKept ? "unchanged" : "changed"));
  const cards = {
    usedEn: cardIn("en", relayJoin("used")), usedPl: cardIn("pl", relayJoin("used")),
    endedEn: cardIn("en", relayJoin("ended")), endedPl: cardIn("pl", relayJoin("ended")) };
  const sayingUsed = cards.usedEn.indexOf(escPage(COPY.usedEn)) >= 0 && cards.usedPl.indexOf(COPY.usedPl) >= 0
    && cards.usedEn.indexOf(escPage(COPY.endedEn)) < 0 && cards.usedPl.indexOf(COPY.endedPl) < 0;
  const sayingEnded = cards.endedEn.indexOf(escPage(COPY.endedEn)) >= 0 && cards.endedPl.indexOf(COPY.endedPl) >= 0
    && cards.endedEn.indexOf(escPage(COPY.usedEn)) < 0 && cards.endedPl.indexOf(COPY.usedPl) < 0;
  const offered = Object.values(cards).every(h => h.indexOf('data-join="cancel"') >= 0 && h.indexOf('data-join="load"') >= 0
    && h.indexOf("e-join-code") < 0 && h.indexOf(RELAY_TEAM) >= 0 && h.indexOf("relay.test") >= 0 && h.indexOf("Waiting for the team") < 0);
  await press("cancel");
  const cleared = !TJ.teamJoinShown();
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(!!tookFn && sayingUsed && sayingEnded && offered && cleared,
    "15ck a relay invitation answered already used, or expired, is said on the join's card in English and in Polish, naming the team and the relay,"
    + " with Cancel the request and Load another catalog, and Cancel the request clears it: used " + (sayingUsed ? "said" : "not said")
    + ", expired " + (sayingEnded ? "said" : "not said") + ", acts " + (offered ? "offered" : "missing") + ", card " + (cleared ? "cleared" : "still there"));

  /* The shell's own state, painted by the page. A constructed view is not this card. */
  const REMOVED_EN = "This invitation was made before the team's lead removed this desk, so it no longer works. The lead can make a new one.";
  const REMOVED_PL = "To zaproszenie powstało, zanim lider zespołu wyłączył to stanowisko z zespołu, więc już nie działa. Nowe może wystawić lider zespołu.";
  const STAYS_EN = "The request is withdrawn: the team's lead no longer sees it. This desk keeps what the invitation gave it, so Ask again sends the request anew without a new link.";
  const STAYS_PL = "Prośba została wycofana: lider zespołu już jej nie widzi. Stanowisko zachowuje to, co dało mu zaproszenie, więc przycisk Poproś ponownie wyśle ją jeszcze raz bez nowego odnośnika.";
  const LEFT_EN = "This desk has left the team and keeps nothing the invitation gave it. Its request is withdrawn, and the team's lead no longer sees it. To join, a new invitation from the team's lead is needed.";
  const LEFT_PL = "To stanowisko opuściło zespół i nie ma już niczego, co dało mu zaproszenie. Prośba została wycofana i lider zespołu już jej nie widzi. Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.";
  const HUSH_EN = "The relay says this desk is no longer on the team, so nothing new reaches it. The catalogs on it stay as they are. Once the team's lead lets this desk in again, the catalog opens here by itself.";
  const HUSH_PL = "Według przekaźnika to stanowisko nie należy już do zespołu, więc nic nowego do niego nie dociera. Katalogi na nim zostają bez zmian. Gdy lider zespołu ponownie wpuści to stanowisko, katalog otworzy się tutaj sam.";
  const ROSTER_EN = "Once the team's lead lets this desk in again, the catalog opens here by itself.";
  const sealText = s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)).toString("base64");
  const seal32 = crypto.randomBytes(32).toString("base64");
  const relayTeam = "t-5c1a77e0b3d94f20";
  const relayHex = { id: "0123456789abcdef", h32: "ab".repeat(16), h64: "cd".repeat(32) };
  const bothLang = async D => {
    ST.lsSet("eUiLang", "en");
    await pageOn(D);
    const en = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const pl = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    return { en, pl };
  };
  const relayDesk = (name, relayExtra, more, src, opts) => {
    const own = folder(name + "-own");
    const join = { team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: { id: relayHex.id, proof: relayHex.h64, lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: Object.assign({ rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32,
          token: sealText("token"), seal: sealText(seal32) }, relayExtra || {}) } };
    return deskWith(name, own, Object.assign({ teamJoin: join,
      teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
      teamPinFrom: { [relayTeam]: "invite" },
      teamShown: { [relayTeam]: { lead: "Lamp lead", folder: own } } }, more || {}), src, opts);
  };
  const cardSaid = (html, en, pl) => html.en.indexOf(escPage(en)) >= 0 && html.pl.indexOf(pl) >= 0;
  const removedDesk = await relayDesk("h35-removed-card", { end: "removed" });
  const removedHtml = await bothLang(removedDesk);
  const removedSaid = cardSaid(removedHtml, REMOVED_EN, REMOVED_PL)
    && removedHtml.en.indexOf("Waiting for the lead to open the request") < 0
    && removedHtml.en.indexOf(escPage(COPY.waitEn)) < 0 && removedHtml.pl.indexOf(COPY.waitPl) < 0
    && removedHtml.en.indexOf("this desk left") < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(removedSaid,
    "15co a relay invitation the relay refused because the team's lead removed this desk says a new invitation is needed, in English and in Polish, from the shell's own state: "
    + (removedSaid ? "said" : "not said"));
  const keptKey = sealText(crypto.randomBytes(32).toString("base64"));
  const cancelDesk = await relayDesk("h35-cancel-card", { wrapped: [1] },
    { teamKeys: { [relayTeam]: { 1: keptKey } }, teamSeen: [relayTeam] });
  const cancelSeed = JSON.stringify(cancelDesk.envelope());
  ST.lsSet("eUiLang", "en");
  await pageOn(cancelDesk);
  await press("cancel");
  /* No relay answers this desk, so the withdrawal has not been taken: the card says the request still waits, with nothing to press. */
  const pendingHtml = await bothLang(cancelDesk);
  let cancelEnv = {};
  try { cancelEnv = cancelDesk.envelope(); } catch { cancelEnv = {}; }
  const pendingKept = !!(cancelEnv.teamJoin && cancelEnv.teamJoin.invite && cancelEnv.teamJoin.invite.relay
    && cancelEnv.teamJoin.invite.relay.withdrawing === true && cancelEnv.teamJoin.invite.relay.withdrawn === undefined
    && cancelEnv.teamKeys && cancelEnv.teamKeys[relayTeam]);
  const PENDING_EN = "The request is being withdrawn. The relay takes the withdrawal shortly, and until then the team's lead may still see the request.";
  const PENDING_PL = "Prośba jest wycofywana. Przekaźnik wkrótce to odnotuje, a do tego czasu lider zespołu może ją jeszcze widzieć.";
  const pendingSaid = cardSaid(pendingHtml, PENDING_EN, PENDING_PL) && pendingKept && pendingHtml.en.indexOf(escPage(STAYS_EN)) < 0
    && pendingHtml.en.indexOf(escPage(COPY.waitEn)) < 0 && pendingHtml.pl.indexOf(COPY.waitPl) < 0
    && pendingHtml.en.indexOf('data-join="cancel"') < 0 && pendingHtml.en.indexOf('data-join="ask"') < 0;
  /* The shell's own state once the relay has taken the withdrawal. */
  const takenDesk = await relayDesk("g2-taken-card", { wrapped: [1], withdrawn: true },
    { teamKeys: { [relayTeam]: { 1: keptKey } }, teamSeen: [relayTeam] });
  const staysHtml = await bothLang(takenDesk);
  const staysSaid = cardSaid(staysHtml, STAYS_EN, STAYS_PL)
    && staysHtml.en.indexOf('data-join="cancel"') < 0 && staysHtml.en.indexOf('data-join="ask"') >= 0
    && staysHtml.en.indexOf(escPage(COPY.waitEn)) < 0 && staysHtml.pl.indexOf(COPY.waitPl) < 0 && staysHtml.en.indexOf(escPage(LEFT_EN)) < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(pendingSaid && staysSaid,
    "15cp cancelling a join the relay has already accepted, through the shell, says the request is being withdrawn, with nothing to press, until the relay takes the"
    + " withdrawal, and then says it is withdrawn and this desk keeps what the invitation gave it, in English and in Polish, offering Ask again with no second Cancel: pending "
    + (pendingSaid ? "said" : "not said") + ", withdrawing and key " + (pendingKept ? "kept" : "not kept") + ", taken " + (staysSaid ? "said" : "not said"));
  const leftDesk = await relayDesk("h35-left-card", { withdrawn: true }, { teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" }, teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const leftHtml = await bothLang(leftDesk);
  const leftSaid = cardSaid(leftHtml, LEFT_EN, LEFT_PL) && leftHtml.en.indexOf(escPage(STAYS_EN)) < 0 && leftHtml.pl.indexOf(STAYS_PL) < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(leftSaid,
    "15cq after Leave, the card says this desk no longer keeps what the invitation gave it, in English and in Polish, from the shell's own state: "
    + (leftSaid ? "said" : "not said"));
  {
    if (PLANTS_OFF) {
      skip("15cr lifting plant:h35-keeps leaves the card saying the desk still keeps what the invitation gave, or not the leave sentence");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:h35-keeps") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const ud = path.join(LAB, "h35-left-plant");
        fs.mkdirSync(ud, { recursive: true });
        const own = folder("h35-left-plant-own");
        const doc = JSON.parse(fs.readFileSync(path.join(leftDesk.ud, "desk.json"), "utf8"));
        doc.keys.eCatalogFolder = own;
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(doc), "utf8");
        const planted = loadDesk(ud, lines.join("\n"));
        await planted.ask("etiuda:branch-identity", true);
        const html = await bothLang(planted);
        turned = html.en.indexOf(escPage(LEFT_EN)) < 0;
        detail = turned ? "the leave sentence was absent" : "the leave sentence was still said";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15cr lifting plant:h35-keeps leaves the card saying the desk still keeps what the invitation gave, or not the leave sentence (FAIL 15cq after Leave, the card says this desk no longer keeps what the invitation gave it: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  const hushYard = folder("h35-hush-yard");
  put(hushYard, "lamps.ec", P.sealCatalog(crypto.randomBytes(32), relayTeam, 1, A1));
  const hushDesk = await deskWith("h35-hush-card", hushYard, {
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "answer" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: hushYard } },
    teamRelayGone: { [relayTeam]: true } });
  const hushHtml = await bothLang(hushDesk);
  const hushSaid = cardSaid(hushHtml, HUSH_EN, HUSH_PL) && hushHtml.en.indexOf("The relay says this desk is no longer on the team") >= 0;
  const rosterOnly = hushHtml.en.indexOf(escPage(HUSH_EN)) >= 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(hushSaid && rosterOnly,
    "15cs after the relay has removed this desk, the card says the relay no longer counts it on the team and that the catalog opens here by itself only once the lead lets it in again, in English and in Polish, from the shell's own state: "
    + (hushSaid ? "said" : "not said"));
  {
    if (PLANTS_OFF) {
      skip("15ct lifting plant:h35-hush-card keeps the self-opening sentence after the relay has removed this desk");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:h35-hush-card") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(hushDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf("The relay says this desk is no longer on the team") < 0 && html.indexOf(escPage(ROSTER_EN)) >= 0;
        detail = turned ? "the roster sentence, not the hush sentence" : JSON.stringify(html.replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 180));
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15ct lifting plant:h35-hush-card keeps the self-opening sentence after the relay has removed this desk (FAIL 15cs after the relay has removed this desk, the card says it has stopped asking: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  {
    if (PLANTS_OFF) {
      skip("15cu lifting plant:h35-relay-state leaves the removed sentence unsaid");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:h35-relay-state") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const ud = path.join(LAB, "h35-removed-plant");
        fs.mkdirSync(ud, { recursive: true });
        fs.copyFileSync(path.join(removedDesk.ud, "desk.json"), path.join(ud, "desk.json"));
        const planted = loadDesk(ud, lines.join("\n"));
        await planted.ask("etiuda:branch-identity", true);
        const html = await bothLang(planted);
        turned = html.en.indexOf(escPage(REMOVED_EN)) < 0;
        detail = turned ? "the removed sentence was absent" : "the removed sentence was still said";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15cu lifting plant:h35-relay-state leaves the removed sentence unsaid (FAIL 15co a relay invitation the relay refused because the team's lead removed this desk says a new invitation is needed: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  {
    if (PLANTS_OFF) {
      skip("15cv lifting plant:h35-keep undoes a cancel the relay has already accepted, so the withdrawn sentence is absent");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:h35-keep") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const ud = path.join(LAB, "h35-cancel-plant");
        fs.mkdirSync(ud, { recursive: true });
        fs.writeFileSync(path.join(ud, "desk.json"), cancelSeed, "utf8");
        const planted = loadDesk(ud, lines.join("\n"));
        await planted.ask("etiuda:branch-identity", true);
        ST.lsSet("eUiLang", "en");
        await pageOn(planted);
        await press("cancel");
        const html = TJ.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(STAYS_EN)) < 0;
        detail = turned ? "the withdrawn sentence was absent" : "the withdrawn sentence was still said";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15cv lifting plant:h35-keep undoes a cancel the relay has already accepted, so the withdrawn sentence is absent (FAIL 15cp cancelling a join the relay has already accepted, through the shell, says the request is withdrawn: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  {
    if (PLANTS_OFF) {
      skip("15cw lifting plant:e4-card, the card after a withdrawal says no withdrawn sentence and offers no Ask again");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:e4-card") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 3);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(takenDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(STAYS_EN)) < 0 && html.indexOf('data-join="ask"') < 0;
        detail = turned ? "neither the withdrawn sentence nor Ask again" : JSON.stringify(html.replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 180));
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15cw lifting plant:e4-card, the card after a withdrawal says no withdrawn sentence and offers no Ask again (FAIL 15cp cancelling a join the relay has already accepted, through the shell, says the request is withdrawn: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }  {
    if (PLANTS_OFF) {
      skip("15cx lifting plant:g2-card, a withdrawal the relay has not taken shows the plain waiting card with Cancel");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:g2-card") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at - 2, 3);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(cancelDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf('data-join="cancel"') >= 0;
        detail = turned ? "the waiting card offers Cancel again" : JSON.stringify(html.replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 180));
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15cx lifting plant:g2-card, a withdrawal the relay has not taken shows the plain waiting card with Cancel (FAIL 15cp: pending not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  const UNKEPT_EN = "The relay no longer holds this request, so it could not be withdrawn there. The team's lead may still see it until it expires. To join after all, a new invitation from the team's lead is needed.";
  const UNKEPT_PL = "Przekaźnik nie przechowuje już tej prośby, więc nie dało się jej tam wycofać. Lider zespołu może ją jeszcze widzieć, dopóki nie wygaśnie. Aby jednak dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.";
  const HELD_EN = "The request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request. If the relay clears the team's copy first, the request goes with it.";
  const HELD_PL = "Prośba jest wycofywana. Przekaźnik zespołu do czasu odnowienia działa tylko do odczytu, więc odnotuje wycofanie dopiero wtedy, a do tego czasu lider zespołu może ją jeszcze widzieć. Jeśli przekaźnik wcześniej usunie kopię zespołu, prośba zniknie razem z nią.";
  const unkeptDesk = await relayDesk("c5-unkept-card", { unkept: true });
  const unkeptHtml = await bothLang(unkeptDesk);
  const unkeptSaid = cardSaid(unkeptHtml, UNKEPT_EN, UNKEPT_PL)
    && unkeptHtml.en.indexOf('data-join="ask"') < 0 && unkeptHtml.en.indexOf('data-join="cancel"') < 0
    && unkeptHtml.en.indexOf('data-join="load"') >= 0 && unkeptHtml.en.indexOf('data-join="join"') >= 0
    && unkeptHtml.en.indexOf(escPage(PENDING_EN)) < 0 && unkeptHtml.pl.indexOf(PENDING_PL) < 0
    && unkeptHtml.en.indexOf(escPage(STAYS_EN)) < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(unkeptSaid,
    "15cy a withdrawal the relay refuses for good ends the waiting and the card says the invitation is past its keep, in English and in Polish, with Join a team and Load another catalog and no Ask again: "
    + (unkeptSaid ? "said" : "not said"));
  const heldDesk = await relayDesk("c5-held-card", { withdrawing: true, readonly: true });
  const heldHtml = await bothLang(heldDesk);
  const heldSaid = cardSaid(heldHtml, HELD_EN, HELD_PL)
    && heldHtml.en.indexOf('data-join="ask"') < 0 && heldHtml.en.indexOf('data-join="cancel"') < 0
    && heldHtml.en.indexOf(escPage(PENDING_EN)) < 0 && heldHtml.en.indexOf(escPage(UNKEPT_EN)) < 0
    && heldHtml.pl.indexOf(UNKEPT_PL) < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(heldSaid,
    "15cz a withdrawal while the team's relay is read-only says it takes the withdrawal when the relay is renewed, in English and in Polish, with nothing to press: "
    + (heldSaid ? "said" : "not said"));
  check(pendingSaid && staysSaid,
    "15da the plain path still says the pending sentence and then the withdrawn one, in English and in Polish: pending "
    + (pendingSaid ? "said" : "not said") + ", withdrawn " + (staysSaid ? "said" : "not said"));
  {
    if (PLANTS_OFF) {
      skip("15db lifting plant:c5-card-unkept leaves the past-keep sentence unsaid");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:c5-card-unkept") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at - 2, 3);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(unkeptDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(UNKEPT_EN)) < 0;
        detail = turned ? "the past-keep sentence was absent" : "the past-keep sentence was still said";
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15db lifting plant:c5-card-unkept leaves the past-keep sentence unsaid (FAIL 15cy a withdrawal the relay refuses for good ends the waiting: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  {
    if (PLANTS_OFF) {
      skip("15dc lifting plant:c5-card-held leaves the read-only sentence unsaid");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:c5-card-held") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at - 2, 3);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(heldDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(HELD_EN)) < 0;
        detail = turned ? "the read-only sentence was absent" : "the read-only sentence was still said";
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15dc lifting plant:c5-card-held leaves the read-only sentence unsaid (FAIL 15cz a withdrawal while the team's relay is read-only: not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* Hold 1: desk leaving while relay request waits is not locked out, request withdrawn */
  const leaveWaitYard = folder("h35-leave-wait-own");
  const leaveWaitDesk = await deskWith("h35-leave-waiting", leaveWaitYard, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText("seal"), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: leaveWaitYard } },
    teamKeys: { [relayTeam]: { 1: keptKey } },
    teamSeen: [relayTeam]
  });
  await leaveWaitDesk.join("leave", relayTeam);
  await pageOn(leaveWaitDesk);
  const leaveCanJoin = TJ.teamCanJoin();
  const leaveEnv = leaveWaitDesk.envelope();
  const leaveWithdrawn = !!(leaveEnv.teamJoin && leaveEnv.teamJoin.invite && leaveEnv.teamJoin.invite.relay
    && (leaveEnv.teamJoin.invite.relay.withdrawing === true || leaveEnv.teamJoin.invite.relay.withdrawn === true));
  check(leaveCanJoin && leaveWithdrawn,
    "15dd a desk with a relay request waiting presses Leave this team, staged from the state the real forgetLead leaves, and can join a team afterwards, its request withdrawn: can join "
    + leaveCanJoin + ", withdrawn " + leaveWithdrawn);

  const matchWaitYard = folder("h35-match-wait-own");
  const matchWaitDesk = await deskWith("h35-match-waiting", matchWaitYard, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText("seal"), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: matchWaitYard } },
    teamKeys: { [relayTeam]: { 1: keptKey } },
    teamSeen: [relayTeam]
  });
  await matchWaitDesk.join("forget", relayTeam);
  await pageOn(matchWaitDesk);
  const matchCanJoin = TJ.teamCanJoin();
  const matchEnv = matchWaitDesk.envelope();
  const matchWithdrawn = !!(matchEnv.teamJoin && matchEnv.teamJoin.invite && matchEnv.teamJoin.invite.relay
    && (matchEnv.teamJoin.invite.relay.withdrawing === true || matchEnv.teamJoin.invite.relay.withdrawn === true));
  check(matchCanJoin && matchWithdrawn,
    "15de a desk with a relay request waiting presses It does not match, staged from the state the real forgetLead leaves, and can join a team afterwards, its request withdrawn: can join "
    + matchCanJoin + ", withdrawn " + matchWithdrawn);

  /* Hold 2: relay link's confirm card shows disclosure and left heading for a desk that left */
  const leftDesk15df = await deskWith("h35-left-15df", folder("left-15df-own"), {
    teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" },
    teamBarred: [relayTeam],
    teamPins: {},
    teamShown: {}
  });
  const relayBlob15df = inviteBlob({
    team: relayTeam,
    relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", token: relayHex.h64, inv: relayHex.h32 },
    lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
    secret: newSecret()
  });
  const linkArg15df = "etiuda:join#" + relayBlob15df.slice("etiuda-join:".length);

  // Shell's reading of pasted relay invitation
  await pageOn(leftDesk15df);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, relayBlob15df);
  await press("read");
  ST.lsSet("eUiLang", "en");
  const pasteConfirmHtml = TJ.teamJoinEmptyHtml();
  ST.lsSet("eUiLang", "pl");
  const pasteConfirmPl = TJ.teamJoinEmptyHtml();
  await press("back");

  // Shell's reading of link relay invitation
  const linkGot = leftDesk15df.api.acceptLink(linkArg15df);
  if (tookFn && linkGot && linkGot.offer) tookFn({ offer: linkGot.offer });
  ST.lsSet("eUiLang", "en");
  const relayConfirmHtml = TJ.teamJoinEmptyHtml();
  ST.lsSet("eUiLang", "pl");
  const relayConfirmPl = TJ.teamJoinEmptyHtml();
  await press("back");
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);

  const discEn = "Once this desk joins, the team's lead can see which catalog it uses";
  const discPl = "Po dołączeniu lider zespołu widzi, którego katalogu używa to stanowisko";
  const leftHeadEn = "This desk left this team on 1 September 2026. Join it again?";
  const leftHeadPl = "To stanowisko opuściło ten zespół 1 września 2026. Dołączyć do niego ponownie?";

  const pasteHasDisc = pasteConfirmHtml.indexOf(escPage(discEn)) >= 0 && pasteConfirmPl.indexOf(escPage(discPl)) >= 0;
  const pasteHasLeft = pasteConfirmHtml.indexOf(leftHeadEn) >= 0 && pasteConfirmPl.indexOf(leftHeadPl) >= 0;
  const linkHasDisc = relayConfirmHtml.indexOf(escPage(discEn)) >= 0 && relayConfirmPl.indexOf(escPage(discPl)) >= 0;
  const linkHasLeft = relayConfirmHtml.indexOf(leftHeadEn) >= 0 && relayConfirmPl.indexOf(leftHeadPl) >= 0;

  check(pasteHasDisc && pasteHasLeft && linkHasDisc && linkHasLeft,
    "15df the relay link's confirm card shows the disclosure, and the left heading for a desk that left, in English and in Polish: disclosure "
    + (pasteHasDisc && linkHasDisc) + ", left heading en " + (pasteConfirmHtml.indexOf(leftHeadEn) >= 0 && relayConfirmHtml.indexOf(leftHeadEn) >= 0)
    + ", pl " + (pasteConfirmPl.indexOf(leftHeadPl) >= 0 && relayConfirmPl.indexOf(leftHeadPl) >= 0));
  {
    if (PLANTS_OFF) {
      skip("15dg lifting plant:forget-withdraw leaves the request not withdrawn after Leave this team");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:forget-withdraw") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const ud = path.join(LAB, "forget-withdraw-plant");
        fs.mkdirSync(ud, { recursive: true });
        const own = folder("forget-withdraw-plant-own");
        const doc = JSON.parse(fs.readFileSync(path.join(leaveWaitDesk.ud, "desk.json"), "utf8"));
        doc.keys.eCatalogFolder = own;
        doc.teamPins = { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } };
        doc.teamJoin = {
          team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
          invite: {
            id: relayHex.id, proof: relayHex.h64,
            lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
            relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText("seal"), wrapped: [1] }
          }
        };
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(doc), "utf8");
        const planted = loadDesk(ud, lines.join("\n"));
        await planted.ask("etiuda:branch-identity", true);
        await planted.join("leave", relayTeam);
        const penv = planted.envelope();
        turned = !(penv.teamJoin && penv.teamJoin.invite && penv.teamJoin.invite.relay && penv.teamJoin.invite.relay.withdrawing === true);
        detail = turned ? "request was not withdrawn" : "request was still withdrawn";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15dg lifting plant:forget-withdraw leaves the request not withdrawn after Leave this team (FAIL 15dd a desk with a relay request waiting presses Leave this team: request not withdrawn): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }
  {
    if (PLANTS_OFF) {
      skip("15dh lifting plant:relay-confirm-disclosure leaves the disclosure unshown on the relay link confirm card");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:relay-confirm-disclosure") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        let pTook = null;
        window.E_HOST = { onTeamJoin: fn => { pTook = fn; }, teamJoin: () => Promise.resolve({ sealed: null, join: null, leads: [] }) };
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        pTook({ offer: { link: true, lead: "Lamp lead", team: relayTeam, relay: "relay.test", left: "2026-09-01T08:30:00.000Z" } });
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(discEn)) < 0;
        detail = turned ? "the disclosure was absent" : "the disclosure was still said";
      }
      const same = fs.readFileSync(joinPath).equals(before);
      check(turned && same, "15dh lifting plant:relay-confirm-disclosure leaves the disclosure unshown on the relay link confirm card (FAIL 15df the relay link's confirm card shows the disclosure: disclosure absent): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15di: after Leave this team, the deletion reaches the relay stand-in and marks the request withdrawn
  const leaveStandCalls = [];
  const standFetchLeave = async (url, init) => {
    leaveStandCalls.push({ method: init.method, url });
    if (init.method === "POST" && url.endsWith("/hello")) {
      return makeResponse(200, { challenge: crypto.randomBytes(16).toString("hex"), until: Date.now() + 60000 });
    }
    if (init.method === "POST" && url.endsWith("/session")) {
      return makeResponse(200, { session: crypto.randomBytes(32).toString("hex"), invite: true });
    }
    if (init.method === "PUT" && url.includes("/b/")) {
      let meta = null;
      try { meta = JSON.parse(Buffer.from(init.headers["etiuda-blob"], "base64url").toString("utf8")); } catch {}
      leaveStandCalls.push({ del: meta && meta.del });
      return makeResponse(200, { ok: true });
    }
    return makeResponse(404, { error: "not-found" });
  };
  const leaveStandYard = folder("h35-leave-stand-own");
  const leaveStandDesk = await deskWith("h35-leave-stand", leaveStandYard, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText(seal32), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "invite" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: leaveStandYard } },
    teamKeys: { [relayTeam]: { 1: keptKey } },
    teamSeen: [relayTeam]
  }, null, { fetch: standFetchLeave });
  const meLeaveStand = await leaveStandDesk.ask("etiuda:branch-identity", true);
  const relayDirLeave = path.join(leaveStandDesk.ud, "relay");
  fs.mkdirSync(relayDirLeave, { recursive: true });
  fs.writeFileSync(path.join(relayDirLeave, relayHex.h32 + ".json"), JSON.stringify({
    kind: "etiuda-relay-channel", v: 1, seq: 1, own: 1, bytes: 100, leadEpoch: 1,
    invitedIds: { [relayHex.h32]: true },
    sent: {
      ["desks/" + meLeaveStand.id + "/join.json"]: {
        id: crypto.randomBytes(16).toString("hex"), epoch: 1, counter: 1, size: 100, del: false, sha: crypto.randomBytes(32).toString("hex")
      }
    }
  }), "utf8");
  await leaveStandDesk.join("leave", relayTeam);
  for (let i = 0; i < 50; i++) {
    const e = leaveStandDesk.envelope();
    if (e.teamJoin && e.teamJoin.invite && e.teamJoin.invite.relay && e.teamJoin.invite.relay.withdrawn === true) break;
    await new Promise(r => setTimeout(r, 20));
  }
  const leaveStandEnv = leaveStandDesk.envelope();
  const leaveStandWithdrawn = !!(leaveStandEnv.teamJoin && leaveStandEnv.teamJoin.invite && leaveStandEnv.teamJoin.invite.relay && leaveStandEnv.teamJoin.invite.relay.withdrawn === true);
  const leaveDelReached = leaveStandCalls.some(c => c.del === true);
  check(leaveDelReached && leaveStandWithdrawn,
    "15di after Leave this team, the deletion reaches the relay stand-in and marks the request withdrawn: reached "
    + leaveDelReached + ", withdrawn " + leaveStandWithdrawn);

  // 15dj: after It does not match, the deletion actually reaches the relay stand-in
  const matchStandCalls = [];
  const standFetchMatch = async (url, init) => {
    matchStandCalls.push({ method: init.method, url });
    if (init.method === "POST" && url.endsWith("/hello")) {
      return makeResponse(200, { challenge: crypto.randomBytes(16).toString("hex"), until: Date.now() + 60000 });
    }
    if (init.method === "POST" && url.endsWith("/session")) {
      return makeResponse(200, { session: crypto.randomBytes(32).toString("hex"), invite: true });
    }
    if (init.method === "PUT" && url.includes("/b/")) {
      let meta = null;
      try { meta = JSON.parse(Buffer.from(init.headers["etiuda-blob"], "base64url").toString("utf8")); } catch {}
      matchStandCalls.push({ del: meta && meta.del });
      return makeResponse(200, { ok: true });
    }
    return makeResponse(404, { error: "not-found" });
  };
  const matchStandYard = folder("h35-match-stand-own");
  const matchStandDesk = await deskWith("h35-match-stand", matchStandYard, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText(seal32), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "invite" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: matchStandYard } },
    teamKeys: { [relayTeam]: { 1: keptKey } },
    teamSeen: [relayTeam]
  }, null, { fetch: standFetchMatch });
  const meMatchStand = await matchStandDesk.ask("etiuda:branch-identity", true);
  const relayDirMatch = path.join(matchStandDesk.ud, "relay");
  fs.mkdirSync(relayDirMatch, { recursive: true });
  fs.writeFileSync(path.join(relayDirMatch, relayHex.h32 + ".json"), JSON.stringify({
    kind: "etiuda-relay-channel", v: 1, seq: 1, own: 1, bytes: 100, leadEpoch: 1,
    invitedIds: { [relayHex.h32]: true },
    sent: {
      ["desks/" + meMatchStand.id + "/join.json"]: {
        id: crypto.randomBytes(16).toString("hex"), epoch: 1, counter: 1, size: 100, del: false, sha: crypto.randomBytes(32).toString("hex")
      }
    }
  }), "utf8");
  await matchStandDesk.join("forget", relayTeam);
  for (let i = 0; i < 50; i++) {
    const e = matchStandDesk.envelope();
    if (e.teamJoin && e.teamJoin.invite && e.teamJoin.invite.relay && e.teamJoin.invite.relay.withdrawn === true) break;
    await new Promise(r => setTimeout(r, 20));
  }
  const matchStandEnv = matchStandDesk.envelope();
  const matchStandWithdrawn = !!(matchStandEnv.teamJoin && matchStandEnv.teamJoin.invite && matchStandEnv.teamJoin.invite.relay && matchStandEnv.teamJoin.invite.relay.withdrawn === true);
  const matchDelReached = matchStandCalls.some(c => c.del === true);
  check(matchDelReached && matchStandWithdrawn,
    "15dj after It does not match, the deletion reaches the relay stand-in and marks the request withdrawn: reached "
    + matchDelReached + ", withdrawn " + matchStandWithdrawn);

  // 15dk: after Leave this team, cards say what is true across withdrawing, read-only and landed, buttons work
  const leaveCauseEn = "This desk has left the team and keeps nothing the invitation gave it.";
  const leaveCausePl = "To stanowisko opuściło zespół i nie ma już niczego, co dało mu zaproszenie.";
  const forwardEn = "To join, a new invitation from the team's lead is needed.";
  const forwardPl = "Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.";

  const statusWithdrawingEn = "Its request is being withdrawn; the relay takes the withdrawal shortly, and until then the team's lead may still see it.";
  const statusWithdrawingPl = "Prośba jest wycofywana; przekaźnik wkrótce to odnotuje, a do tego czasu lider zespołu może ją jeszcze widzieć.";
  const statusReadonlyEn = "Its request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request; if the relay clears the team's copy first, the request goes with it.";
  const statusReadonlyPl = "Prośba jest wycofywana. Przekaźnik zespołu do czasu odnowienia działa tylko do odczytu, więc odnotuje wycofanie dopiero wtedy, a do tego czasu lider zespołu może ją jeszcze widzieć; jeśli przekaźnik wcześniej usunie kopię zespołu, prośba zniknie razem z nią.";
  const statusLandedEn = "Its request is withdrawn, and the team's lead no longer sees it.";
  const statusLandedPl = "Prośba została wycofana i lider zespołu już jej nie widzi.";

  const s1En = [leaveCauseEn, statusWithdrawingEn, forwardEn].join(" ");
  const s1Pl = [leaveCausePl, statusWithdrawingPl, forwardPl].join(" ");
  const s2En = [leaveCauseEn, statusReadonlyEn, forwardEn].join(" ");
  const s2Pl = [leaveCausePl, statusReadonlyPl, forwardPl].join(" ");
  const s3En = [leaveCauseEn, statusLandedEn, forwardEn].join(" ");
  const s3Pl = [leaveCausePl, statusLandedPl, forwardPl].join(" ");

  const deskS1 = await relayDesk("e2-leave-s1", { withdrawing: true }, { teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" }, teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS1 = await bothLang(deskS1);
  await pageOn(deskS1);
  const canJoinS1 = TJ.teamCanJoin();

  const deskS2 = await relayDesk("e2-leave-s2", { withdrawing: true, readonly: true }, { teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" }, teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS2 = await bothLang(deskS2);
  await pageOn(deskS2);
  const canJoinS2 = TJ.teamCanJoin();

  const deskS3 = await relayDesk("e2-leave-s3", { withdrawn: true }, { teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" }, teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS3 = await bothLang(deskS3);
  await pageOn(deskS3);
  const canJoinS3 = TJ.teamCanJoin();

  const buttonsWork = html => html.indexOf('data-join="join"') >= 0 && html.indexOf('data-join="load"') >= 0 && html.indexOf('data-join="ask"') < 0;
  const leaveCardsOk = cardSaid(htmlS1, s1En, s1Pl) && buttonsWork(htmlS1.en) && canJoinS1
    && cardSaid(htmlS2, s2En, s2Pl) && buttonsWork(htmlS2.en) && canJoinS2
    && cardSaid(htmlS3, s3En, s3Pl) && buttonsWork(htmlS3.en) && canJoinS3;
  check(leaveCardsOk,
    "15dk after Leave this team, the card says what is true across withdrawing, read-only and landed states, with buttons Join a team and Load another catalog: "
    + (leaveCardsOk ? "all 3 states said" : "mismatched"));

  // 15dl: after It does not match, cards say what is true across withdrawing, read-only and landed, buttons work
  const matchCauseEn = "The key shown did not match the team's lead's, so this desk does not trust it and keeps nothing the invitation gave it.";
  const matchCausePl = "Pokazany klucz nie zgadzał się z kluczem lidera zespołu, więc to stanowisko mu nie ufa i nie ma już niczego, co dało mu zaproszenie.";

  const s4En = [matchCauseEn, statusWithdrawingEn, forwardEn].join(" ");
  const s4Pl = [matchCausePl, statusWithdrawingPl, forwardPl].join(" ");
  const s5En = [matchCauseEn, statusReadonlyEn, forwardEn].join(" ");
  const s5Pl = [matchCausePl, statusReadonlyPl, forwardPl].join(" ");
  const s6En = [matchCauseEn, statusLandedEn, forwardEn].join(" ");
  const s6Pl = [matchCausePl, statusLandedPl, forwardPl].join(" ");

  const deskS4 = await relayDesk("e2-match-s4", { withdrawing: true }, { teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS4 = await bothLang(deskS4);
  await pageOn(deskS4);
  const canJoinS4 = TJ.teamCanJoin();

  const deskS5 = await relayDesk("e2-match-s5", { withdrawing: true, readonly: true }, { teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS5 = await bothLang(deskS5);
  await pageOn(deskS5);
  const canJoinS5 = TJ.teamCanJoin();

  const deskS6 = await relayDesk("e2-match-s6", { withdrawn: true }, { teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlS6 = await bothLang(deskS6);
  await pageOn(deskS6);
  const canJoinS6 = TJ.teamCanJoin();

  const matchCardsOk = cardSaid(htmlS4, s4En, s4Pl) && buttonsWork(htmlS4.en) && canJoinS4
    && cardSaid(htmlS5, s5En, s5Pl) && buttonsWork(htmlS5.en) && canJoinS5
    && cardSaid(htmlS6, s6En, s6Pl) && buttonsWork(htmlS6.en) && canJoinS6;
  check(matchCardsOk,
    "15dl after It does not match, the card says what is true across withdrawing, read-only and landed states, with buttons Join a team and Load another catalog: "
    + (matchCardsOk ? "all 3 states said" : "mismatched"));

  // 15do: after Leave or It does not match, a withdrawal the relay refused because it no longer holds the request (a sweep, or
  // past its keep) is said as that, never as withdrawn (the test architect's E5 on leave-while-waiting; Claudette's words, 21:11)
  const statusUnkeptEn = "The relay no longer holds its request, so it could not be withdrawn there; the team's lead may still see it until it expires.";
  const statusUnkeptPl = "Przekaźnik nie przechowuje już tej prośby, więc nie dało się jej tam wycofać; lider zespołu może ją jeszcze widzieć, dopóki nie wygaśnie.";
  const deskU1 = await relayDesk("e5-leave-unkept", { unkept: true }, { teamLeft: { [relayTeam]: "2026-09-01T08:30:00.000Z" }, teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlU1 = await bothLang(deskU1);
  await pageOn(deskU1);
  const canJoinU1 = TJ.teamCanJoin();
  const deskU2 = await relayDesk("e5-match-unkept", { unkept: true }, { teamBarred: [relayTeam], teamPins: {}, teamShown: {} });
  const htmlU2 = await bothLang(deskU2);
  await pageOn(deskU2);
  const canJoinU2 = TJ.teamCanJoin();
  const u1 = cardSaid(htmlU1, [leaveCauseEn, statusUnkeptEn, forwardEn].join(" "), [leaveCausePl, statusUnkeptPl, forwardPl].join(" "));
  const u2 = cardSaid(htmlU2, [matchCauseEn, statusUnkeptEn, forwardEn].join(" "), [matchCausePl, statusUnkeptPl, forwardPl].join(" "));
  const notLanded = htmlU1.en.indexOf(escPage(statusLandedEn)) < 0 && htmlU2.en.indexOf(escPage(statusLandedEn)) < 0;
  const unkeptOk = u1 && u2 && notLanded && buttonsWork(htmlU1.en) && buttonsWork(htmlU2.en) && canJoinU1 && canJoinU2;
  check(unkeptOk,
    "15do after Leave or It does not match, a withdrawal the relay could not take, because it no longer holds the request, is said so and not as withdrawn: "
    + "leave " + u1 + ", match " + u2 + ", not landed " + notLanded + ", can join " + (canJoinU1 && canJoinU2));

  // 15dm: while withdrawing after a forget or a leave, nothing that arrives is kept
  let arrivalChannelOpts = null;
  const arrivalRelayStand = {
    ...RelayChannel(),
    createChannel: opts => { arrivalChannelOpts = opts; return { start: noop, stop: async () => {}, kick: noop, online: () => true }; }
  };
  const arrivalDesk = await deskWith("h35-arrivals", folder("arrivals-own"), {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText(seal32), wrap: sealText("wrap"), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "invite" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: folder("arrivals-own") } },
    teamKeys: { [relayTeam]: { 1: keptKey } },
    teamSeen: [relayTeam]
  }, null, { relayChannel: arrivalRelayStand });
  await arrivalDesk.join("forget", relayTeam);
  arrivalDesk.api.relayRun();
  const arrivalEnvBefore = arrivalDesk.envelope();
  const wrapDeleted = !(arrivalEnvBefore.teamJoin && arrivalEnvBefore.teamJoin.invite && arrivalEnvBefore.teamJoin.invite.relay && arrivalEnvBefore.teamJoin.invite.relay.wrap);
  if (arrivalChannelOpts) {
    if (typeof arrivalChannelOpts.onTeamKey === "function") arrivalChannelOpts.onTeamKey(2, crypto.randomBytes(32));
    if (typeof arrivalChannelOpts.onAnswer === "function") arrivalChannelOpts.onAnswer("joined");
    if (typeof arrivalChannelOpts.onTeam === "function") arrivalChannelOpts.onTeam();
  }
  const arrivalEnvAfter = arrivalDesk.envelope();
  const noKeyKept = !(arrivalEnvAfter.teamKeys && arrivalEnvAfter.teamKeys[relayTeam] && arrivalEnvAfter.teamKeys[relayTeam][2]);
  check(wrapDeleted && noKeyKept,
    "15dm while withdrawing after a forget or a leave, nothing that arrives is kept: wrap deleted "
    + wrapDeleted + ", arrival key kept " + !noKeyKept);

  // 15dn: lifting plant:withdraw-arrivals keeps arrivals while withdrawing
  {
    if (PLANTS_OFF) {
      skip("15dn lifting plant:withdraw-arrivals keeps arrivals while withdrawing");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:withdraw-arrivals") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        let plantedOpts = null;
        const relayStand = {
          ...RelayChannel(),
          createChannel: opts => { plantedOpts = opts; return { start: noop, stop: async () => {}, kick: noop, online: () => true }; }
        };
        const ud = path.join(LAB, "h35-arrivals-plant");
        fs.mkdirSync(ud, { recursive: true });
        const own = folder("h35-arrivals-plant-own");
        const doc = JSON.parse(fs.readFileSync(path.join(arrivalDesk.ud, "desk.json"), "utf8"));
        doc.keys.eCatalogFolder = own;
        fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(doc), "utf8");
        const planted = loadDesk(ud, lines.join("\n"), { relayChannel: relayStand });
        await planted.ask("etiuda:branch-identity", true);
        planted.api.relayRun();
        if (plantedOpts && typeof plantedOpts.onTeamKey === "function") {
          plantedOpts.onTeamKey(2, crypto.randomBytes(32));
        }
        const env = planted.envelope();
        turned = !!(env.teamKeys && env.teamKeys[relayTeam] && env.teamKeys[relayTeam][2]);
        detail = turned ? "team key was kept while withdrawing" : "team key was not kept";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15dn lifting plant:withdraw-arrivals keeps arrivals while withdrawing (FAIL 15dm while withdrawing after a forget or a leave, nothing that arrives is kept: arrivals ignored): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15dq: (leave-while-waiting C1) inviteAccepted reads token spent from mirror state even with no channel running
  const mirrorSpentYard = folder("mirror-spent-own");
  const mirrorSpentRt = relayHex.h32, mirrorSpentInv = relayHex.h32;
  const mirrorSpentDesk = await deskWith("h35-mirror-spent", mirrorSpentYard, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: mirrorSpentRt, url: "https://relay.test/relay/v1", inv: mirrorSpentInv, token: sealText("token"), seal: sealText("seal") }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamShown: { [relayTeam]: { lead: "Lamp lead", relay: "relay.test" } },
    teamSeen: [relayTeam]
  });
  const mirrorDir = path.join(mirrorSpentDesk.ud, "relay");
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(path.join(mirrorDir, mirrorSpentRt + ".json"), JSON.stringify({
    kind: "etiuda-relay-channel", v: 1, seq: 1, tokenUsedIds: { [mirrorSpentInv]: true }
  }), "utf8");
  await mirrorSpentDesk.join("forget", relayTeam);
  const mirrorSpentEnv = mirrorSpentDesk.envelope();
  const mirrorSpentWithdrawn = !!(mirrorSpentEnv.teamJoin && mirrorSpentEnv.teamJoin.invite
    && mirrorSpentEnv.teamJoin.invite.relay && mirrorSpentEnv.teamJoin.invite.relay.withdrawing === true);
  check(mirrorSpentWithdrawn,
    "15dq with no channel running, a spent token kept in the mirror is read as spent, so the request is withdrawn: "
    + mirrorSpentWithdrawn);

  // 15dr: lifting plant:invite-spent-kept ignores mirror state and drops the request without withdrawal
  {
    const mainPath = path.join(ROOT, "shell", "main.js");
    const before = fs.readFileSync(mainPath);
    const lines = before.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf("plant:invite-spent-kept") >= 0);
    let turned = false, detail = "plant line absent";
    if (at >= 0) {
      lines[at] = "  if (false) { /* plant:invite-spent-kept */";
      const ud = path.join(LAB, "invite-spent-plant");
      fs.mkdirSync(ud, { recursive: true });
      const mDir = path.join(ud, "relay");
      fs.mkdirSync(mDir, { recursive: true });
      fs.writeFileSync(path.join(mDir, mirrorSpentRt + ".json"), JSON.stringify({
        kind: "etiuda-relay-channel", v: 1, seq: 1, tokenUsedIds: { [mirrorSpentInv]: true }
      }), "utf8");
      const doc = JSON.parse(fs.readFileSync(path.join(mirrorSpentDesk.ud, "desk.json"), "utf8"));
      doc.keys.eCatalogFolder = folder("invite-spent-plant-own");
      doc.teamPins = { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } };
      doc.teamJoin = {
        team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
        invite: {
          id: relayHex.id, proof: relayHex.h64,
          lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
          relay: { rt: mirrorSpentRt, url: "https://relay.test/relay/v1", inv: mirrorSpentInv, token: sealText("token"), seal: sealText("seal") }
        }
      };
      fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(doc), "utf8");
      const planted = loadDesk(ud, lines.join("\n"));
      await planted.ask("etiuda:branch-identity", true);
      await planted.join("forget", relayTeam);
      const penv = planted.envelope();
      turned = !penv.teamJoin;
      detail = turned ? "teamJoin was absent (not withdrawn)" : "teamJoin was still withdrawn";
    }
    const same = fs.readFileSync(mainPath).equals(before);
    check(turned && same, "15dr lifting plant:invite-spent-kept leaves the request not withdrawn when no channel is live (FAIL 15dq spent token in mirror withdraws request): "
      + detail + ", sha " + (same ? "restored" : "differs"));
  }

  // 15ds: the refused desk's card offers Cancel the request and says no Ask again on a relay join
  const REFUSED_RELAY_EN = "To join, a new invitation from the team's lead is needed.";
  const REFUSED_RELAY_PL = "Aby dołączyć, potrzebne jest nowe zaproszenie od lidera zespołu.";
  const REFUSED_FOLDER_EN = "Asking again sends a new request.";
  const REFUSED_FOLDER_PL = "Ponowna prośba trafi do lidera jako nowa.";
  const REFUSED_TITLE_EN = "The lead turned the request down";
  const REFUSED_TITLE_PL = "Lider zespołu odrzucił prośbę";
  const refusedRelayDesk = await relayDesk("h35-refused-card", {}, {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      refused: true,
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32, token: sealText("token"), seal: sealText(seal32) }
      }
    }
  });
  const refusedRelayHtml = await bothLang(refusedRelayDesk);
  const relayRefusedSaid = cardSaid(refusedRelayHtml, REFUSED_RELAY_EN, REFUSED_RELAY_PL)
    && refusedRelayHtml.en.indexOf(REFUSED_TITLE_EN) >= 0 && refusedRelayHtml.pl.indexOf(REFUSED_TITLE_PL) >= 0
    && refusedRelayHtml.en.indexOf('data-join="cancel"') >= 0 && refusedRelayHtml.en.indexOf('data-join="load"') >= 0
    && refusedRelayHtml.en.indexOf('data-join="ask"') < 0 && refusedRelayHtml.en.indexOf(escPage(REFUSED_FOLDER_EN)) < 0;

  const folderRefusedDesk = await deskWith("h35-folder-refused", folder("folder-refused-own"), {
    teamJoin: { team: TEAM, file: "lamps.ec", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia", refused: true }
  });
  const folderRefusedHtml = await bothLang(folderRefusedDesk);
  const folderRefusedSaid = cardSaid(folderRefusedHtml, REFUSED_FOLDER_EN, REFUSED_FOLDER_PL)
    && folderRefusedHtml.en.indexOf(REFUSED_TITLE_EN) >= 0 && folderRefusedHtml.pl.indexOf(REFUSED_TITLE_PL) >= 0
    && folderRefusedHtml.en.indexOf('data-join="ask"') >= 0 && folderRefusedHtml.en.indexOf('data-join="load"') >= 0
    && folderRefusedHtml.en.indexOf('data-join="cancel"') < 0 && folderRefusedHtml.en.indexOf(escPage(REFUSED_RELAY_EN)) < 0;

  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(relayRefusedSaid && folderRefusedSaid,
    "15ds the refused desk's card offers Cancel the request and says no Ask again on a relay join, while a folder join stays unchanged: relay "
    + (relayRefusedSaid ? "said" : "not said") + ", folder " + (folderRefusedSaid ? "held" : "changed"));

  // 15dt: lifting plant:relay-refused-card offers Ask again and says no Cancel on a relay join
  {
    if (PLANTS_OFF) {
      skip("15dt lifting plant:relay-refused-card offers Ask again and says no Cancel on a relay join");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:relay-refused-card") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = fs.mkdtempSync(path.join(LAB, "relay-refused-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        window.E_HOST = hostOver(refusedRelayDesk);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        ST.lsSet("eUiLang", "en");
        const html = planted.teamJoinEmptyHtml();
        turned = html.indexOf(escPage(REFUSED_RELAY_EN)) < 0 && html.indexOf('data-join="cancel"') < 0 && html.indexOf('data-join="ask"') >= 0;
        detail = turned ? "relay refused fell through to Ask again" : "relay refused card still active";
      }
      const same = fs.readFileSync(joinPath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15dt lifting plant:relay-refused-card offers Ask again and says no Cancel on a relay join (FAIL 15ds: relay refused card not said): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* Cancel on a refused relay request whose invitation the relay had taken withdraws it, and the request ends once the
     relay takes that withdrawal or refuses it for good. What the invitation changed is put back, and a new invitation
     for that team is taken. A waiting request, the same cancel, still keeps the pin and says withdrawn. */
  const relayStand = () => {
    const box = { opts: null };
    box.channel = Object.assign({}, RelayChannel(), {
      createChannel: o => { box.opts = o; return { start: noop, stop: async () => {}, kick: noop, online: () => true }; }
    });
    return box;
  };
  const refusedAcceptedDesk = (name, stand) => deskWith(name, folder(name + "-own"), {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      refused: true,
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        before: { barred: false, epoch: 0 },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32,
          token: sealText("token"), seal: sealText(seal32), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "invite" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: folder(name + "-mirror"), relay: "relay.test" } },
    teamChannel: { [relayTeam]: { kind: "relay", rt: relayHex.h32, url: "https://relay.test/relay/v1" } },
    teamKeys: { [relayTeam]: { 1: keptKey } }
  }, null, { relayChannel: stand.channel });
  const invitationBack = env => {
    const pins = env.teamPins || {}, keys = env.teamKeys || {}, from = env.teamPinFrom || {};
    const shown = env.teamShown || {}, channel = env.teamChannel || {};
    return !env.teamJoin && !pins[relayTeam] && !keys[relayTeam] && !from[relayTeam] && !shown[relayTeam] && !channel[relayTeam];
  };
  const answerWithdrawal = async (D, stand, which) => {
    await D.join("cancel");
    D.api.relayRun();
    await new Promise(r => setTimeout(r, 30));
    const fn = stand.opts && stand.opts[which];
    if (typeof fn === "function") fn();
    return D.envelope();
  };
  const freshRelayBlob = () => inviteBlob({
    team: relayTeam,
    relay: { rt: crypto.randomBytes(16).toString("hex"), url: "https://relay.test/relay/v1",
      token: crypto.randomBytes(32).toString("hex"), inv: crypto.randomBytes(16).toString("hex") },
    lead: lampLead, secret: newSecret()
  });
  const takenStand = relayStand(), unkeptStand = relayStand(), waitingStand = relayStand();
  const takenDeskE = await refusedAcceptedDesk("h35-refused-end-taken", takenStand);
  const takenSeed = fs.readFileSync(path.join(takenDeskE.ud, "desk.json"));
  const unkeptDeskE = await refusedAcceptedDesk("h35-refused-end-unkept", unkeptStand);
  const waitingDeskE = await deskWith("h35-refused-end-waiting", folder("h35-refused-end-waiting-own"), {
    teamJoin: {
      team: relayTeam, file: "", nonce: relayHex.h64, commit: relayHex.h64, asked: 1, held: 0, name: "Nia",
      invite: {
        id: relayHex.id, proof: relayHex.h64,
        lead: { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" },
        before: { barred: false, epoch: 0 },
        relay: { rt: relayHex.h32, url: "https://relay.test/relay/v1", inv: relayHex.h32,
          token: sealText("token"), seal: sealText(seal32), wrapped: [1] }
      }
    },
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamPinFrom: { [relayTeam]: "invite" },
    teamShown: { [relayTeam]: { lead: "Lamp lead", folder: folder("h35-refused-end-waiting-mirror"), relay: "relay.test" } },
    teamChannel: { [relayTeam]: { kind: "relay", rt: relayHex.h32, url: "https://relay.test/relay/v1" } },
    teamKeys: { [relayTeam]: { 1: keptKey } }
  }, null, { relayChannel: waitingStand.channel });
  const takenEnv = await answerWithdrawal(takenDeskE, takenStand, "onWithdrawn");
  const takenAgain = takenEnv && !takenEnv.teamJoin ? await takenDeskE.join("invite", freshRelayBlob(), "Nia") : null;
  const unkeptEnv = await answerWithdrawal(unkeptDeskE, unkeptStand, "onWithdrawUnkept");
  const unkeptAgain = unkeptEnv && !unkeptEnv.teamJoin ? await unkeptDeskE.join("invite", freshRelayBlob(), "Nia") : null;
  const waitingEnv = await answerWithdrawal(waitingDeskE, waitingStand, "onWithdrawn");
  const takenEnded = invitationBack(takenEnv) && !!(takenAgain && takenAgain.join && takenAgain.join.state === "waiting" && takenAgain.join.state !== "refused");
  const unkeptEnded = invitationBack(unkeptEnv) && !!(unkeptAgain && unkeptAgain.join && unkeptAgain.join.state === "waiting" && unkeptAgain.join.state !== "refused");
  const waitingKept = !!(waitingEnv.teamJoin && waitingEnv.teamJoin.invite && waitingEnv.teamJoin.invite.relay
    && waitingEnv.teamJoin.invite.relay.withdrawn === true && waitingEnv.teamPins && waitingEnv.teamPins[relayTeam]);
  check(takenEnded && unkeptEnded && waitingKept,
    "15dw after Cancel on a refused relay request the relay had taken, the request ends whether the relay takes the withdrawal or refuses it for good, what the invitation changed is put back, and a new invitation for that team is taken; a waiting request stays withdrawn with its pin: taken "
    + (takenEnded ? "ended" : "still there") + ", unkept " + (unkeptEnded ? "ended" : "still there") + ", waiting " + (waitingKept ? "kept" : "lost"));

  // 15dx: lifting plant:refused-cancel-ends leaves the refused request in place after the relay takes the withdrawal
  {
    if (PLANTS_OFF) {
      skip("15dx lifting plant:refused-cancel-ends leaves a refused relay request in place after Cancel, the relay having taken the withdrawal");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:refused-cancel-ends") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const stand = relayStand();
        const ud = path.join(LAB, "h35-refused-end-plant");
        fs.mkdirSync(ud, { recursive: true });
        fs.writeFileSync(path.join(ud, "desk.json"), takenSeed);
        const planted = loadDesk(ud, lines.join("\n"), { relayChannel: stand.channel });
        await planted.ask("etiuda:branch-identity", true);
        const env = await answerWithdrawal(planted, stand, "onWithdrawn");
        turned = !!(env.teamJoin && env.teamPins && env.teamPins[relayTeam]);
        detail = turned ? "the request and the pin stayed" : "the request ended with the plant line lifted";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15dx lifting plant:refused-cancel-ends leaves a refused relay request in place after Cancel, the relay having taken the withdrawal (FAIL 15dw: taken still there): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* Joining loads a catalog only on an empty desk. A desk that already has one keeps it. */
  const loads = [];
  const wasLoad = HK.hooks.loadCatalogFromFolder;
  HK.hooks.loadCatalogFromFolder = name => { loads.push(String(name)); };
  AS.setCards([{ id: "c-loaded" }]);
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const keptCatalog = loads.length === 0 && AS.cards.length === 1 && AS.cards[0].id === "c-loaded";
  AS.setCards([]);
  loads.length = 0;
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const loadedEmpty = loads.length === 1 && loads[0] === "lamps.ec";
  HK.hooks.loadCatalogFromFolder = wasLoad;
  AS.setCards([]);
  check(!!tookFn && keptCatalog && loadedEmpty,
    "15bl joining leaves a catalog the desk already has loaded, and an empty desk still loads the one the invitation named: kept "
    + keptCatalog + ", empty loaded " + JSON.stringify(loads));
  loads.length = 0;
  HK.hooks.loadCatalogFromFolder = name => { loads.push(String(name)); };
  AS.setCards([{ id: "c-sample" }]);
  ST.nsSet("Sample", "1");
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const loadedSample = loads.length === 1 && loads[0] === "lamps.ec";
  ST.nsDel("Sample");
  loads.length = 0;
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const keptReal = loads.length === 0;
  HK.hooks.loadCatalogFromFolder = wasLoad;
  AS.setCards([]);
  check(!!tookFn && loadedSample && keptReal,
    "15cm a team catalog arriving opens automatically on a desk showing the sample catalog, and never over a real catalog the agent chose: sample "
    + loadedSample + ", real kept " + keptReal);

  /* Join a team in Settings, the Library and the Menu, on a desk that already has a catalog and has seen its lead. */
  const doorWas = { createElement: document.createElement, body: document.body, getElementById: document.getElementById,
    querySelector: document.querySelector, gcs: globalThis.getComputedStyle, add: globalThis.addEventListener,
    remove: globalThis.removeEventListener, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
  const menuJoin = { hidden: true };
  let doorNote = "not run";
  try {
    document.documentElement = document.documentElement || {};
    document.body = { classList: { contains: () => false, toggle: noop, add: noop, remove: noop }, appendChild: el => el };
    document.createElement = () => stubNode();
    document.getElementById = id => id === "menuJoin" ? menuJoin : null;
    globalThis.getComputedStyle = () => ({ fontSize: "16px" });
    globalThis.addEventListener = noop;
    globalThis.removeEventListener = noop;
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 800;
    AS.setCards([{ id: "c-door" }]);
    ST.lsSet("eUiLang", "en");
    const seenLead = { team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true };
    window.E_HOST = { onTeamJoin: fn => { tookFn = fn; }, teamJoin: () => Promise.resolve({ sealed: null, join: null, leads: [seenLead] }) };
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 30));
    const SET = await import(MOD("settings.js"));
    const MG = await import(MOD("manage.js"));
    const settingsOn = SET.settingsBodyHtml();
    const libraryOn = MG.libraryActionsHtml();
    const shown = settingsOn.indexOf('id="setJoinTeam"') >= 0 && settingsOn.indexOf('<div class="set-label">Team</div>') >= 0
      && settingsOn.indexOf("Join a team") >= 0
      && settingsOn.indexOf("data-leave-team") >= 0 && settingsOn.indexOf("data-leave-team") < settingsOn.indexOf('id="setJoinTeam"')
      && libraryOn.indexOf('id="mgImportCatalog"') >= 0 && libraryOn.indexOf('id="mgImportCatalog"') < libraryOn.indexOf('id="mgJoinTeam"')
      && menuJoin.hidden === false;
    const settingsBtn = { classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, hidden: false };
    const settingsMenu = { hidden: true, classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, contains: () => false, onclick: null };
    const moreBtn = { classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, hidden: true };
    const moreMenu = { hidden: true, classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, contains: () => false };
    document.querySelector = sel => (sel === "#settingsBtn" ? settingsBtn : sel === "#settingsMenu" ? settingsMenu
      : sel === "#moreBtn" ? moreBtn : sel === "#moreMenu" ? moreMenu : sel === "[data-join-paste]" ? pasted : null);
    const HM = await import(MOD("header-menus.js"));
    HM.wireHeaderMenus();
    const doorLoads = [];
    HK.hooks.loadCatalogFromFolder = name => { doorLoads.push(String(name)); };
    settingsMenu.onclick({ target: { closest: () => ({ dataset: { act: "join" } }) } });
    const opened = TJ.inviteHeld().mode === "paste" && doorLoads.length === 0 && AS.cards.length === 1;
    tookFn({ sealed: null, join: null, leads: [{ team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: false }] });
    const unseenSettings = SET.settingsBodyHtml(), unseenLibrary = MG.libraryActionsHtml();
    const unseen = unseenSettings.indexOf('id="setJoinTeam"') < 0 && unseenLibrary.indexOf('id="mgJoinTeam"') < 0 && menuJoin.hidden === true;
    tookFn({ sealed: null, join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia" },
      leads: [{ team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true }] });
    const flightSettings = SET.settingsBodyHtml(), flightLibrary = MG.libraryActionsHtml();
    const flight = flightSettings.indexOf('id="setJoinTeam"') < 0 && flightLibrary.indexOf('id="mgJoinTeam"') < 0 && menuJoin.hidden === true;
    window.E_HOST = {};
    tookFn({ sealed: null, join: null, leads: [seenLead] });
    const noHost = SET.settingsBodyHtml().indexOf('id="setJoinTeam"') < 0 && MG.libraryActionsHtml().indexOf('id="mgJoinTeam"') < 0
      && menuJoin.hidden === true;
    doorNote = [shown, opened, unseen, flight, noHost].join("/");
    check(shown && opened && unseen && flight && noHost,
      "15bj Join a team is in Settings after the lead's key, in the Library after Load, and in the Menu, on a desk that already has a catalog and has seen its lead;"
      + " the Menu opens the paste and loads nothing; the door hides while a key is unseen, while a request is in flight, and with no shell: " + doorNote);
  } catch (e) {
    check(false, "15bj Join a team is in Settings after the lead's key, in the Library after Load, and in the Menu: threw "
      + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
  } finally {
    HK.hooks.loadCatalogFromFolder = wasLoad;
    AS.setCards([]);
    document.createElement = doorWas.createElement;
    document.body = doorWas.body;
    document.getElementById = doorWas.getElementById;
    document.querySelector = doorWas.querySelector;
    if (doorWas.gcs === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = doorWas.gcs;
    if (doorWas.add === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = doorWas.add;
    if (doorWas.remove === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = doorWas.remove;
    if (doorWas.innerWidth === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = doorWas.innerWidth;
    if (doorWas.innerHeight === undefined) delete globalThis.innerHeight; else globalThis.innerHeight = doorWas.innerHeight;
    if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  }

  /* The Menu item is the one in the template, and the Settings and Library clicks are the buttons those screens wire. */
  const doorDoc = globalThis.document, doorHost = window.E_HOST, motionWas = ST.lsGet("eMotionOff");
  let doorErr = "";
  const menuTag = (fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8").match(/<button\b[^>]*\bid="menuJoin"[^>]*>/) || [""])[0];
  const menuItem = /\bdata-act="join"/.test(menuTag) && /\brole="menuitem"/.test(menuTag);
  let settingsOpened = false, libraryOpened = false, leftPaste = false;
  try {
    class DoorEl {
      constructor(tag, attrs) {
        this.tagName = String(tag || "div").toUpperCase(); this.nodeType = 1;
        this.attrs = Object.assign({}, attrs || {});
        this.kids = []; this.parent = null; this.style = { cssText: "" }; this.listeners = {};
        this._text = ""; this._html = ""; this.hidden = false; this.connected = false; this.value = "";
        const self = this;
        this.classList = {
          contains: c => (" " + (self.attrs.class || "") + " ").indexOf(" " + c + " ") > -1,
          add: c => { if (!self.classList.contains(c)) self.attrs.class = ((self.attrs.class || "") + " " + c).trim(); },
          remove: c => { self.attrs.class = (" " + (self.attrs.class || "") + " ").replace(" " + c + " ", " ").trim(); },
          toggle: (c, on) => { const want = on === undefined ? !self.classList.contains(c) : !!on; want ? self.classList.add(c) : self.classList.remove(c); return want; },
        };
      }
      get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
      get className() { return this.attrs.class || ""; } set className(v) { this.attrs.class = String(v); }
      setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
      removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
      get children() { return this.kids; }
      get firstElementChild() { return this.kids[0] || null; }
      get firstChild() { return this.kids[0] || null; }
      get textContent() { return this._text; }
      set textContent(v) { this._text = String(v); this.kids = []; }
      get innerHTML() { return this._html; }
      set innerHTML(h) {
        this._html = String(h); this.kids = [];
        const re = /<(input|p|button|span|label|h2|h3|div|i|details|summary|small|select|option|textarea|code|output|pre|b)\b([^>]*)>([^<]*)/g;
        let m;
        while ((m = re.exec(this._html))) {
          const attrs = {}; let a; const ar = /([\w:-]+)(?:="([^"]*)")?/g;
          while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2] == null ? "" : a[2];
          const k = new DoorEl(m[1], attrs); k._text = m[3]; k.parent = this; k.connected = this.connected; this.kids.push(k);
        }
      }
      all() { return this.kids.reduce((o, k) => o.concat([k], k.all()), []); }
      matches(sel) {
        if (sel === "*") return true;
        if (sel.startsWith("#")) return this.attrs.id === sel.slice(1);
        if (sel.startsWith(".")) return sel.slice(1).split(".").every(c => this.classList.contains(c));
        const at = /^\[([\w:-]+)\]$/.exec(sel); if (at) return at[1] in this.attrs;
        return this.tagName === String(sel).toUpperCase();
      }
      querySelectorAll(sel) {
        if (String(sel).startsWith(":scope > ")) return this.kids.filter(k => k.matches(sel.slice(9)));
        const parts = String(sel).split(",").map(s => s.trim());
        return this.all().filter(e => parts.some(s => { try { return e.matches(s); } catch { return false; } }));
      }
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
      closest(sel) { let e = this; while (e && e.matches) { if (e.matches(sel)) return e; e = e.parent; } return null; }
      contains(n) { let e = n; while (e) { if (e === this) return true; e = e.parent; } return false; }
      appendChild(c) { c.parent = this; this.kids.push(c); c.connected = this.connected || c === this; c.all().forEach(x => { x.connected = c.connected; }); return c; }
      insertBefore(c, before) { c.parent = this; const i = this.kids.indexOf(before); if (i < 0) this.kids.push(c); else this.kids.splice(i, 0, c); c.connected = this.connected; return c; }
      remove() { if (this.parent) this.parent.kids = this.parent.kids.filter(k => k !== this); this.connected = false; }
      get isConnected() { return this.connected; }
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
      removeEventListener() {}
      focus() {}
      get offsetWidth() { return 340; } get offsetHeight() { return 220; }
      getBoundingClientRect() { return { top: 10, left: 10, right: 350, bottom: 50, width: 340, height: 40 }; }
      getContext() { return { font: "" }; }
    }
    const doc = {
      activeElement: null, visibilityState: "visible",
      getElementById: id => doc.body.all().find(e => e.attrs.id === id) || null,
      querySelector: s => doc.body.querySelector(s), querySelectorAll: s => doc.body.querySelectorAll(s),
      createElement: tag => new DoorEl(tag),
      createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 0, right: 0, width: 0, height: 0 }) }),
      addEventListener() {}, removeEventListener() {},
      contains(n) { return doc.body.contains(n); },
    };
    doc.body = new DoorEl("body"); doc.body.connected = true;
    doc.documentElement = new DoorEl("html");
    const modal = new DoorEl("div"); modal.id = "modal"; modal.hidden = true;
    const card = new DoorEl("div"); card.id = "modalCard";
    modal.appendChild(card); doc.body.appendChild(modal);
    globalThis.document = doc;
    globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
    globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
    globalThis.getComputedStyle = () => ({ fontSize: "16px", borderLeftWidth: "0", borderRightWidth: "0", paddingLeft: "0", paddingRight: "0" });
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const DM = await import(MOD("dom.js"));
    DM.grabDom();
    ST.lsSet("eMotionOff", "1");
    ST.lsSet("eUiLang", "en");
    AS.setCards([{ id: "c-door" }]);
    const seenLead = { team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true };
    window.E_HOST = { teamJoin: () => Promise.resolve({ sealed: null, join: null, leads: [seenLead] }) };
    if (tookFn) tookFn({ sealed: null, join: null, leads: [seenLead] });
    const SET = await import(MOD("settings.js"));
    const MG = await import(MOD("manage.js"));
    const click = btn => { try { if (btn && btn.onclick) btn.onclick(); } catch (e) { doorErr = String(e && e.message || e); } };
    /* A paste left open by an earlier leg must not count as this click opening it. */
    try { await press("back"); } catch (e) { doorErr = doorErr || String(e && e.message || e); }
    const settingsClosed = TJ.inviteHeld().mode !== "paste";
    SET.openSettings();
    click(doc.getElementById("setJoinTeam"));
    settingsOpened = settingsClosed && TJ.inviteHeld().mode === "paste";
    try { await press("back"); leftPaste = TJ.inviteHeld().mode !== "paste"; }
    catch (e) { doorErr = doorErr || String(e && e.message || e); }
    MG.openManage();
    click(doc.getElementById("mgJoinTeam"));
    libraryOpened = leftPaste && TJ.inviteHeld().mode === "paste";
    const offerEl = new DoorEl("div", { id: "eCatalogOffer", class: "bub bub-ask e-offer" });
    doc.body.appendChild(offerEl);
    TJ.openJoinPaste();
    var joinShownOverOffer = !!doc.getElementById("eTeamJoin") && !doc.getElementById("eCatalogOffer");
  } catch (e) {
    doorErr = e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : String(e);
  } finally {
    globalThis.document = doorDoc;
    window.E_HOST = doorHost;
    AS.setCards([]);
    if (motionWas == null) ST.lsDel("eMotionOff"); else ST.lsSet("eMotionOff", motionWas);
    if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
    if (typeof globalThis.document.createElement !== "function") globalThis.document.createElement = () => ({ getContext() { return {}; } });
    if (typeof globalThis.document.createRange !== "function") globalThis.document.createRange = () => ({});
    try { const DM = await import(MOD("dom.js")); DM.grabDom(); } catch { /* the page document has no modal; the handles go back to empty */ }
  }
  check(menuItem && settingsOpened && libraryOpened,
    "15bm the Menu item Join a team is in the template, and the Settings and Library buttons' clicks open the paste: "
    + [menuItem, settingsOpened, libraryOpened].join("/") + (doorErr ? " " + doorErr : ""));
  check(joinShownOverOffer, "15cn with a catalog loaded, the team-join bubble is reachable while the catalog offer shows: " + joinShownOverOffer);

  /* ---- leaving, and being left off the roster ---------------------------------------------------------------------- */
  /* A desk let in by an invitation, then left off the team's roster at a newer epoch with the newest edition sealed again
     under the new key, as Studio's removal does. The shell names each team it trusts by the lead's name the invitation
     gave and the folder its file was read in, and says where the roster of the epoch accepted no longer lists a desk that
     once held a key; the page says so in place of the sealed catalog's ask. Settings shows the team by that name and folder
     with Leave this team. The click offers Undo and keeps the pin, the keys and the bar until that offer lapses; once
     it lapses the leave forgets the team and its keys here, keeps the catalog in use and writes nothing to the
     folder. A leg whose code is missing is a red leg, not a stopped file. */
  const legTry = async (id, fn) => {
    try { await fn(); }
    catch (e) { check(false, id + " threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
  };
  const teamAt = (epoch, roster) => sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"], lead: LEAD,
    sealed: true, exportsSealed: false, epoch: epoch, roster: roster }, lead.privateKey, LEAD.keyId);
  const leadIn = v => ((v && v.leads) || []).filter(l => l.team === TEAM)[0] || null;
  /* Every call that writes, renames or removes under `dir` while `run` runs, by name.
     The path is what counts, after resolve, and only where path.relative stays inside:
     not an absolute result, not "..", and not a result that begins with ".." plus
     path.sep. The bytes written are not a path. A desk file names the team's folder
     in its JSON; on Linux those slashes are the folder's own, so a substring match
     counted desk.json.tmp, written beside the folder, as a write inside it. */
  const pathInside = (dir, file) => {
    if (typeof file !== "string" || file === "") return false;
    let rel;
    try { rel = path.relative(dir, path.resolve(file)); }
    catch { return false; }
    if (rel === "") return true;
    if (path.isAbsolute(rel)) return false;
    if (rel === "..") return false;
    return !rel.startsWith(".." + path.sep);
  };
  const writesUnder = async (dir, run) => {
    const hits = [], untap = [];
    for (const n of ["writeFileSync", "appendFileSync", "renameSync", "unlinkSync", "rmSync", "rmdirSync", "mkdirSync", "copyFileSync", "openSync"]) {
      const real = fs[n];
      fs[n] = function (p, ...rest) {
        const flag = n === "openSync" ? String(rest[0] || "r") : "w";
        if (/[wa+]/.test(flag)) {
          const paths = n === "renameSync" || n === "copyFileSync" ? [p, rest[0]] : [p];
          const hit = paths.find(x => pathInside(dir, x));
          if (hit != null) hits.push(n + " " + path.relative(dir, path.resolve(String(hit))));
        }
        return real.call(this, p, ...rest);
      };
      untap.push(() => { fs[n] = real; });
    }
    try { await run(); await new Promise(r => setTimeout(r, 50)); }
    finally { untap.forEach(u => u()); }
    return hits;
  };
  const snapshot = dir => filesUnder(dir).map(f => path.relative(dir, f) + "="
    + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")).sort().join("|");
  const settingsAt = async (D, lang) => {
    await pageOn(D);
    ST.lsSet("eUiLang", lang || "en");
    try { return (await import(MOD("settings.js"))).settingsBodyHtml(); }
    finally { ST.lsSet("eUiLang", "en"); }
  };
  const libraryAt = async (D, lang) => {
    await pageOn(D);
    ST.lsSet("eUiLang", lang || "en");
    try {
      const MG = await import(MOD("manage.js"));
      return typeof MG.libraryBodyHtml === "function" ? MG.libraryBodyHtml() : "";
    }
    finally { ST.lsSet("eUiLang", "en"); }
  };
  const bodyWas = document.body, langBefore = ST.lsGet("eUiLang");
  ST.lsSet("eUiLang", "en");
  document.body = { classList: { contains: () => false, toggle: noop, add: noop, remove: noop }, appendChild: el => el };
  try { await press("back"); } catch { /* nothing held */ }

  const leaveYard = folder("leave-yard");
  const Dl = await deskWith("leave", folder("leave-own"));
  const meL = await Dl.ask("etiuda:branch-identity", true);
  const leaveBlob = inviteBlob({ team: TEAM, folder: leaveYard, lead: lampLead, secret: newSecret() });
  const tookL = await Dl.join("invite", leaveBlob, "Nia", codeFor(leaveBlob));
  const KL1 = crypto.randomBytes(32), KL2 = crypto.randomBytes(32), KL3 = crypto.randomBytes(32);
  put(leaveYard, "etiuda-team.json", teamAt(1, [entry(me2, KL1, 1), entry(meL, KL1, 1)]));
  put(leaveYard, "lamps.ec", P.sealCatalog(KL1, TEAM, 1, A1));
  const inL = await Dl.join("state");
  const onPage = async D => { await pageOn(D); return TJ.teamJoinEmptyHtml(); };
  const NO_LONGER = "Lamp lead&#39;s team no longer includes this desk";

  await legTry("15bn", async () => {
    const l = leadIn(inL), again = leadIn(await loadDesk(Dl.ud).join("state"));
    const want = JSON.stringify({ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: false, lead: "Lamp lead",
      folder: leaveYard, removed: false, policy: false });
    check(!!tookL && !!tookL.join && !!inL.joined && JSON.stringify(l) === want && JSON.stringify(again) === want,
      "15bn a desk let in by an invitation names its team by the lead's name the invitation gave and the folder the team's file"
      + " is read in, on the roster and not removed, in a fresh run too: " + JSON.stringify(l));
  });

  /* Epoch 2 leaves this desk off, and the newest edition is sealed again under the new key. */
  const htmlOnTeam = await onPage(Dl);
  put(leaveYard, "etiuda-team.json", teamAt(2, [entry(me2, KL2, 2)]));
  put(leaveYard, "lamps.ec", P.sealCatalog(KL2, TEAM, 2, A1));
  const outL = await Dl.join("state");
  await legTry("15bo", async () => {
    const shell = leadIn(outL), restarted = leadIn(await loadDesk(Dl.ud).join("state"));
    const en = await onPage(Dl);
    ST.lsSet("eUiLang", "pl");
    const pl = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const Dn = await deskWith("leave-never", leaveYard);
    const never = await onPage(Dn);
    const f = { shell: !!shell && shell.removed === true && shell.admitted === true && !!outL.sealed && outL.sealed.file === "lamps.ec",
      restarted: !!restarted && restarted.removed === true,
      told: en.indexOf(NO_LONGER) >= 0 && en.indexOf("is sealed for its team") < 0 && /data-join="ask"/.test(en)
        && en.indexOf("Once the team&#39;s lead lets this desk in again, the catalog opens here by itself.") >= 0,
      polish: pl.indexOf("To stanowisko nie należy już do zespołu osoby Lamp lead") >= 0 && pl.indexOf("no longer includes") < 0,
      onTeam: htmlOnTeam.indexOf("no longer includes") < 0,
      never: never.indexOf("lamps.ec is sealed for its team") >= 0 && never.indexOf("no longer includes") < 0 };
    check(Object.keys(f).every(k => f[k]),
      "15bo left off the roster at a newer epoch, the desk is told \"Lamp lead's team no longer includes this desk\" in place of the"
      + " sealed catalog's ask, in English and in Polish and after a restart; while it is on the roster nothing says so, and a desk"
      + " never on the team over the same folder still sees the ask: " + JSON.stringify(f)
      + (f.never ? "" : " (that desk's page: " + JSON.stringify(never.replace(/<svg[\s\S]*?<\/svg>/g, "").slice(0, 160)) + ")"));
  });

  /* Let in again at epoch 3: the roster lists it, and nothing says otherwise. */
  put(leaveYard, "etiuda-team.json", teamAt(3, [entry(me2, KL3, 3), entry(meL, KL3, 3)]));
  put(leaveYard, "lamps.ec", P.sealCatalog(KL3, TEAM, 3, A1));
  const backL = await Dl.join("state");
  await legTry("15bp", async () => {
    const l = leadIn(backL), html = await onPage(Dl);
    check(!!l && l.removed === false && backL.sealed === null && html.indexOf("no longer includes") < 0,
      "15bp THE CONTROL: let in again at a newer epoch, the desk is on the roster and no longer told it is off it: "
      + JSON.stringify(l));
  });

  await legTry("15bq", async () => {
    const en = await settingsAt(Dl, "en"), pl = await settingsAt(Dl, "pl");
    const groups = printOf(LEAD.public).replace(/(.{4})(?=.)/g, "$1 ");
    const f = { name: en.indexOf("Lamp lead&#39;s team") >= 0, folder: en.indexOf("Folder: " + escHtml(leaveYard)) >= 0,
      key: en.indexOf(groups) >= 0, leave: new RegExp('data-leave-team="' + TEAM + '"[^>]*>Leave this team<').test(en),
      noForget: en.indexOf("Forget this lead") < 0 && en.indexOf("data-forget-lead") < 0 && en.indexOf("Team lead&#39;s key") < 0,
      polish: pl.indexOf("Zespół osoby Lamp lead") >= 0 && />Opuść ten zespół</.test(pl) && pl.indexOf("Leave this team") < 0 };
    check(Object.keys(f).every(k => f[k]),
      "15bq Settings shows the team by the lead's name and the folder, the key beside them, with Leave this team and no Forget"
      + " this lead, in English and in Polish: " + JSON.stringify(f));
  });

  const relaySettingsDesk = await deskWith("h35-relay-settings", folder("relay-settings-own"), {
    teamPins: { [relayTeam]: { keyId: LEAD.keyId, public: LEAD.public } },
    teamChannel: { [relayTeam]: { kind: "relay", rt: relayHex.h32, url: "https://relay.test/relay/v1" } },
    teamShown: { [relayTeam]: { lead: "Lamp lead", relay: "relay.test" } }
  });
  await relaySettingsDesk.join("state");

  await legTry("15dp", async () => {
    const relaySetEn = await settingsAt(relaySettingsDesk, "en");
    const relaySetPl = await settingsAt(relaySettingsDesk, "pl");
    const relayHasHost = relaySetEn.indexOf("Relay: relay.test") >= 0 && relaySetPl.indexOf("Przekaźnik: relay.test") >= 0;
    const relayNoMirror = relaySetEn.indexOf("Folder:") < 0 && relaySetEn.indexOf(relayHex.h32) < 0;
    check(relayHasHost && relayNoMirror,
      "15dp Settings shows a relay team's row with Relay: {HOST}, in English and in Polish, never the mirror's folder: host "
      + relayHasHost + ", no mirror " + relayNoMirror);
  });

  await legTry("15du", async () => {
    const relayLibEn = await libraryAt(relaySettingsDesk, "en");
    const relayLibPl = await libraryAt(relaySettingsDesk, "pl");
    const relayHasHost = relayLibEn.indexOf("Relay: relay.test") >= 0 && relayLibPl.indexOf("Przekaźnik: relay.test") >= 0;
    const relayNoChange = relayLibEn.indexOf('id="mgCatFolder"') < 0 && relayLibEn.indexOf("Change folder") < 0;
    const relayNoMirror = relayLibEn.indexOf(relayHex.h32) < 0 && relayLibEn.indexOf("open-folder") < 0;
    const folderLibEn = await libraryAt(Dl, "en");
    const folderLibUnchanged = folderLibEn.indexOf('id="mgCatFolder"') >= 0 && folderLibEn.indexOf("open-folder") >= 0 && folderLibEn.indexOf("Relay:") < 0;
    const folderOpen = folder("lib-folder-open"), relayPlace = folder("lib-relay-place");
    const noneOpen = folder("lib-none-open"), relayOther = folder("lib-relay-other");
    const pinBoth = { keyId: LEAD.keyId, public: LEAD.public };
    const relayCh = { [relayTeam]: { kind: "relay", rt: relayHex.h32, url: "https://relay.test/relay/v1" } };
    const folderTeamDesk = await deskWith("h35-lib-folder", folderOpen, {
      teamPins: { [TEAM]: pinBoth, [relayTeam]: pinBoth },
      teamPinFrom: { [TEAM]: "answer", [relayTeam]: "invite" },
      teamShown: {
        [TEAM]: { lead: "Lamp lead", folder: folderOpen },
        [relayTeam]: { lead: "Lamp lead", folder: relayPlace, relay: "relay.test" }
      },
      teamChannel: relayCh
    });
    const noneDesk = await deskWith("h35-lib-none", noneOpen, {
      teamPins: { [relayTeam]: pinBoth },
      teamPinFrom: { [relayTeam]: "invite" },
      teamShown: { [relayTeam]: { lead: "Lamp lead", folder: relayOther, relay: "relay.test" } },
      teamChannel: relayCh
    });
    const seesFolder = (html, open) => html.indexOf('id="mgCatFolder"') >= 0 && html.indexOf(open) >= 0
      && html.indexOf("Change folder") >= 0 && html.indexOf("Relay:") < 0;
    const folderTeamHtml = await libraryAt(folderTeamDesk, "en");
    const noneHtml = await libraryAt(noneDesk, "en");
    const folderTeamSees = seesFolder(folderTeamHtml, folderOpen);
    const noneSees = seesFolder(noneHtml, noneOpen);
    const relayTeam2 = "t-" + crypto.randomBytes(8).toString("hex"), relayPlace2 = folder("lib-relay-two");
    const twoRelayDesk = await deskWith("h35-lib-two-relay", relayPlace2, {
      teamPins: { [relayTeam]: pinBoth, [relayTeam2]: pinBoth },
      teamPinFrom: { [relayTeam]: "invite", [relayTeam2]: "invite" },
      teamShown: {
        [relayTeam]: { lead: "Lamp lead", folder: relayPlace, relay: "relay.test" },
        [relayTeam2]: { lead: "Lamp lead", folder: relayPlace2, relay: "relay-two.test" }
      },
      teamChannel: {
        [relayTeam]: { kind: "relay", rt: relayHex.h32, url: "https://relay.test/relay/v1" },
        [relayTeam2]: { kind: "relay", rt: crypto.randomBytes(16).toString("hex"), url: "https://relay-two.test/relay/v1" }
      }
    });
    const twoRelayLibEn = await libraryAt(twoRelayDesk, "en");
    const twoRelayLibPl = await libraryAt(twoRelayDesk, "pl");
    const twoRelayHasHost = twoRelayLibEn.indexOf("Relay: relay-two.test") >= 0 && twoRelayLibPl.indexOf("Przekaźnik: relay-two.test") >= 0;
    const twoRelayNoChange = twoRelayLibEn.indexOf('id="mgCatFolder"') < 0 && twoRelayLibEn.indexOf("Change folder") < 0;
    const twoRelayNoMirror = twoRelayLibEn.indexOf("open-folder") < 0;
    const twoRelaySees = twoRelayHasHost && twoRelayNoChange && twoRelayNoMirror;
    check(relayHasHost && relayNoChange && relayNoMirror && folderLibUnchanged && folderTeamSees && noneSees && twoRelaySees,
      "15du the Library shows the relay host and offers no Change folder on a relay team, in English and in Polish, while a folder team stays unchanged, and a relay desk that opens a folder team's catalog or a catalog of no team sees that folder and Change folder, and a two-relay-team desk opening the second sees that relay host: host "
      + relayHasHost + ", no change " + relayNoChange + ", no mirror " + relayNoMirror + ", folder " + folderLibUnchanged
      + ", folder team " + folderTeamSees + ", none " + noneSees + ", second relay " + twoRelaySees);
  });

  // 15dv: lifting plant:library-relay-host shows mirror folder and Change folder on a relay team's Library
  {
    if (PLANTS_OFF) {
      skip("15dv lifting plant:library-relay-host shows mirror folder and Change folder on a relay team's Library");
    } else {
      const managePath = path.join(ROOT, "src", "modules", "manage.js");
      const before = fs.readFileSync(managePath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:library-relay-host") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = fs.mkdtempSync(path.join(LAB, "manage-plant-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "manage.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "manage.js")).href);
        await pageOn(relaySettingsDesk);
        ST.lsSet("eUiLang", "en");
        const html = typeof planted.libraryBodyHtml === "function" ? planted.libraryBodyHtml() : "";
        turned = html.indexOf("Relay: relay.test") < 0 && html.indexOf('id="mgCatFolder"') >= 0;
        detail = turned ? "mirror folder and Change folder offered" : "relay host still shown";
      }
      const same = fs.readFileSync(managePath).equals(before);
      if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
      check(turned && same, "15dv lifting plant:library-relay-host shows mirror folder and Change folder on a relay team's Library (FAIL 15du: Library relay not shown): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* The offer's wait, read from the page rather than copied here, so a change of that wait is the same change here. */
  const UNDO_WAIT = +((/const UNDO_MS=(\d+)/.exec(fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8")) || [])[1] || 0);
  const LEAVE_EN = "This desk will leave this team.";
  const LEAVE_PL = "To stanowisko opuści ten zespół.";
  /* Pin, sealed keys, bar, the leave's day and the name the row shows. One JSON, one sha256, so "exactly" is a hash
     and not a glance. `armed` is a pin and keys present and the team not yet barred: a hash of two empty desks matches
     and proves nothing. */
  const snapOf = (env, team) => {
    const body = {
      pin: (env.teamPins || {})[team] || null,
      keys: (env.teamKeys || {})[team] || null,
      bar: env.teamBarred || null,
      left: (env.teamLeft || {})[team] || null,
      shown: (env.teamShown || {})[team] || null
    };
    const text = JSON.stringify(body);
    return { text: text, sha: crypto.createHash("sha256").update(text, "utf8").digest("hex"),
      armed: !!(body.pin && body.keys && (env.teamBarred || []).indexOf(team) < 0 && !body.left) };
  };
  const leftShape = env => !(env.teamPins && env.teamPins[TEAM]) && !(env.teamKeys && env.teamKeys[TEAM])
    && !(env.teamShown && env.teamShown[TEAM]) && (env.teamBarred || []).indexOf(TEAM) >= 0 && !!(env.teamLeft && env.teamLeft[TEAM]);
  /* The Undo bubble, drawn on the same stand-in the rest of this file uses, with a button the offer can wire. */
  const installUndoDoc = () => {
    const prev = { createElement: document.createElement, body: document.body,
      querySelector: document.querySelector, getElementById: document.getElementById };
    const bubbles = [];
    document.createElement = () => {
      const btn = {};
      const node = stubNode();
      node.querySelector = sel => (sel === "#eUndoBtn" ? btn : null);
      return node;
    };
    document.body = { classList: { contains: () => false, toggle: noop, add: noop, remove: noop },
      appendChild: el => { bubbles.push(el); return el; } };
    const find = () => bubbles.filter(n => n.id === "eUndo" && !n.removed).pop() || null;
    document.querySelector = sel => (sel === "#eUndo" ? find() : null);
    document.getElementById = id => (id === "eUndo" ? find() : null);
    return { restore() {
      document.createElement = prev.createElement; document.body = prev.body;
      document.querySelector = prev.querySelector; document.getElementById = prev.getElementById;
    } };
  };
  /* Records the real timers and can run the offer's own wait at once. Every other timer still fires on its own. */
  const armUndoClock = () => {
    const realSTO = globalThis.setTimeout, realCTO = globalThis.clearTimeout, bag = [];
    globalThis.setTimeout = (fn, ms, ...rest) => { const id = realSTO(fn, ms, ...rest); bag.push({ id: id, fn: fn, ms: ms, dead: false }); return id; };
    globalThis.clearTimeout = id => { bag.forEach(t => { if (t.id === id) t.dead = true; }); return realCTO(id); };
    return {
      lapse() {
        const row = bag.filter(t => !t.dead && t.ms === UNDO_WAIT).pop();
        if (!row) return false;
        row.dead = true; realCTO(row.id); row.fn(); return true;
      },
      restore() {
        bag.forEach(t => { if (!t.dead && t.ms === UNDO_WAIT) { t.dead = true; realCTO(t.id); } });
        globalThis.setTimeout = realSTO; globalThis.clearTimeout = realCTO;
      }
    };
  };
  const pressLeave = (SET, drawn) => {
    const btn = { getAttribute: a => (a === "data-leave-team" && drawn ? drawn[1] : null) };
    SET.wireTeamRows({ querySelectorAll: sel => (sel === "[data-leave-team]" && drawn ? [btn] : []) });
    return btn;
  };

  /* A desk of its own, so taking the leave back here leaves Dl's leave for 15br. */
  await legTry("15ch", async () => {
    const undoYard = folder("undo-yard");
    const Du2 = await deskWith("undo-leave", folder("undo-own"));
    const meU = await Du2.ask("etiuda:branch-identity", true);
    const undoBlob = inviteBlob({ team: TEAM, folder: undoYard, lead: lampLead, secret: newSecret() });
    await Du2.join("invite", undoBlob, "Nia", codeFor(undoBlob));
    const KU = crypto.randomBytes(32);
    put(undoYard, "etiuda-team.json", teamAt(1, [entry(me2, KU, 1), entry(meU, KU, 1)]));
    put(undoYard, "lamps.ec", P.sealCatalog(KU, TEAM, 1, A1));
    await Du2.join("state");
    await pageOn(Du2);
    ST.lsSet("eUiLang", "en");
    const SET = await import(MOD("settings.js"));
    const html = SET.settingsBodyHtml();
    const drawn = /<button[^>]*data-leave-team="([^"]+)"[^>]*>Leave this team</.exec(html);
    const before = snapOf(Du2.envelope(), TEAM);
    const undoDoc = installUndoDoc();
    const clock = armUndoClock();
    const f = { danger: new RegExp('<button type="button" class="btn danger" data-leave-team="' + TEAM + '">').test(html),
      had: before.armed, offered: false, held: false, restored: false, polish: false, restoredPl: false,
      heldAgain: false, lapsed: false, left: false };
    try {
      const btn = pressLeave(SET, drawn);
      if (btn.onclick) btn.onclick();
      const bub = document.querySelector("#eUndo");
      const undoBtn = bub && bub.querySelector("#eUndoBtn");
      f.offered = !!(bub && bub.innerHTML.indexOf(LEAVE_EN) >= 0 && undoBtn && undoBtn.onclick);
      f.held = before.armed && snapOf(Du2.envelope(), TEAM).sha === before.sha;
      if (undoBtn && undoBtn.onclick) undoBtn.onclick();
      await new Promise(r => setTimeout(r, 30));
      const back = snapOf(Du2.envelope(), TEAM);
      f.restored = before.armed && back.sha === before.sha && back.text === before.text;
      ST.lsSet("eUiLang", "pl");
      if (btn.onclick) btn.onclick();
      const plBub = document.querySelector("#eUndo");
      f.polish = !!(plBub && plBub.innerHTML.indexOf(LEAVE_PL) >= 0 && plBub.innerHTML.indexOf(LEAVE_EN) < 0);
      const plUndo = plBub && plBub.querySelector("#eUndoBtn");
      if (plUndo && plUndo.onclick) plUndo.onclick();
      ST.lsSet("eUiLang", "en");
      await new Promise(r => setTimeout(r, 30));
      f.restoredPl = snapOf(Du2.envelope(), TEAM).sha === before.sha;
      if (btn.onclick) btn.onclick();
      f.heldAgain = before.armed && snapOf(Du2.envelope(), TEAM).sha === before.sha;
      f.lapsed = clock.lapse();
      await new Promise(r => setTimeout(r, 40));
      f.left = f.lapsed && leftShape(Du2.envelope()) && snapOf(Du2.envelope(), TEAM).sha !== before.sha;
    } finally {
      ST.lsSet("eUiLang", "en");
      clock.restore();
      undoDoc.restore();
    }
    check(Object.keys(f).every(k => f[k]),
      "15ch Leave this team wears danger, and one click offers Undo while the pin, the keys and the bar stay (sha256 "
      + before.sha.slice(0, 16) + "); Undo puts that snapshot back; the offer is Polish when the desk is; once Undo"
      + " lapses the leave bars the team and the pin and keys are gone: " + JSON.stringify(f));
  });

  const barBefore = { en: "", pl: "" }, leftWindow = { from: 0, to: 0 };
  await legTry("15br", async () => {
    await pageOn(Dl);
    /* The desk names its catalog to the team, as a desk that has taken it does, so Leave has a note of its own to take back. */
    const booted = Dl.sync("etiuda:catalog") || "";
    let bootPin = "";
    try { bootPin = Dl.api.signedSha(JSON.parse(booted)); } catch { bootPin = ""; }
    Dl.sync("etiuda:catalog-taken", bootPin);
    const note = path.join("desks", meL.id, "in-use.ec"), noteKept = fs.existsSync(path.join(leaveYard, note));
    const folderBefore = snapshot(leaveYard), keysBefore = JSON.stringify(Dl.envelope().keys);
    const withoutNote = folderBefore.split("|").filter(x => x.indexOf(note + "=") !== 0).join("|");
    barBefore.en = await settingsAt(Dl, "en");
    barBefore.pl = await settingsAt(Dl, "pl");
    const CAT = await import(MOD("catalog.js")), SET = await import(MOD("settings.js"));
    const stored = JSON.stringify({ cards: [{ id: "c-leave" }] });
    ST.lsSet(CAT.E_CATALOG_STORE, stored);
    AS.setCards([{ id: "c-leave" }]);
    const undoDoc = installUndoDoc();
    const clock = armUndoClock();
    /* The button Settings draws, pressed as its screen wires it. */
    const drawn = /<button[^>]*data-leave-team="([^"]+)"[^>]*>Leave this team</.exec(SET.settingsBodyHtml());
    const beforeLeave = snapOf(Dl.envelope(), TEAM);
    let wired = false, held = false, lapsed = false, hits = [];
    try {
      hits = await writesUnder(leaveYard, async () => {
        const btn = pressLeave(SET, drawn);
        wired = typeof btn.onclick === "function";
        leftWindow.from = Date.now();
        if (wired) btn.onclick();
        held = beforeLeave.armed && snapOf(Dl.envelope(), TEAM).sha === beforeLeave.sha;
        lapsed = clock.lapse();
        await new Promise(r => setTimeout(r, 30));
        leftWindow.to = Date.now();
      });
    } finally {
      clock.restore();
      undoDoc.restore();
    }
    const env = Dl.envelope(), after = await Dl.join("state"), settingsAfter = SET.settingsBodyHtml();
    const f = { wired: wired && drawn[1] === TEAM, held: held, lapsed: lapsed,
      forgot: !(env.teamPins && env.teamPins[TEAM]) && !(env.teamKeys && env.teamKeys[TEAM])
        && !(env.teamShown && env.teamShown[TEAM]) && (env.teamBarred || []).indexOf(TEAM) >= 0 && leadIn(after) === null,
      page: !TJ.teamLeads().some(l => l.team === TEAM) && settingsAfter.indexOf("data-leave-team") < 0,
      catalog: AS.cards.length === 1 && AS.cards[0].id === "c-leave" && ST.lsGet(CAT.E_CATALOG_STORE) === stored
        && JSON.stringify(Dl.envelope().keys) === keysBefore,
      folder: noteKept && snapshot(leaveYard) === withoutNote && JSON.stringify(hits) === JSON.stringify(["unlinkSync " + note]) };
    AS.setCards([]);
    ST.lsDel(CAT.E_CATALOG_STORE);
    check(Object.keys(f).every(k => f[k]),
      "15br Leave this team, pressed in Settings, keeps the pin, the keys and the bar until Undo lapses, and once it"
      + " lapses forgets the team here, its lead's pin, its keys, its name and folder, and bars a first admission as"
      + " Forget did; Settings lists it no more; the catalog in use stays loaded and stored; and under the team's"
      + " folder it removes only this desk's own in-use note and writes nothing else: " + JSON.stringify(f) + " " + hits.join(","));
  });

  await legTry("15bw", async () => {
    const BACK_EN = "After leaving a team, this desk can join it again with a new invitation from its lead.";
    const BACK_PL = "Po opuszczeniu zespołu to stanowisko może do niego wrócić z nowym zaproszeniem od lidera.";
    /* A desk that trusts two leads draws two Leave rows, and the way back is said once, of any team. */
    const hostWas = window.E_HOST, two = [{ team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true },
      { team: "t-" + "1".repeat(16), print: "1234123412341234", admitted: true, seen: true, lead: "Quay lead" }];
    window.E_HOST = { onTeamJoin: noop, teamJoin: () => Promise.resolve({ sealed: null, join: null, leads: two }) };
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 30));
    const twoRows = (await import(MOD("settings.js"))).settingsBodyHtml();
    window.E_HOST = hostWas;
    const times = (s, w) => s.split(w).length - 1;
    const f = { before: barBefore.en.indexOf(BACK_EN) >= 0 && barBefore.en.indexOf(BACK_EN) < barBefore.en.indexOf("data-leave-team"),
      polish: barBefore.pl.indexOf(BACK_PL) >= 0,
      once: times(twoRows, "data-leave-team=") === 2 && times(twoRows, BACK_EN) === 1,
      noBar: barBefore.en.indexOf("takes no invitation") < 0 && barBefore.en.indexOf("sealed catalog") < 0 };
    check(Object.keys(f).every(k => f[k]),
      "15bw before the press Settings says, once and of any team, that a desk which leaves a team joins it again with a new"
      + " invitation from its lead, in English and in Polish, and promises no bar: " + JSON.stringify(f));
  });

  /* An invitation to a team this desk left asks, and joins on yes; on no, nothing changes. A lead forgotten as not matching
     still refuses. */
  await legTry("15bx", async () => {
    const left = (Dl.envelope().teamLeft || {})[TEAM] || "";
    const leftOk = !!left && Date.parse(left) >= leftWindow.from && Date.parse(left) <= leftWindow.to;
    const day = lang => (left ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(left)) : "no day kept");
    const again = inviteBlob({ team: TEAM, folder: leaveYard, lead: lampLead, secret: newSecret() });
    const trustBefore = trustOf(Dl) + JSON.stringify(Dl.envelope().teamLeft || null), folderBefore = snapshot(leaveYard);
    const readL = await Dl.join("read", again);
    await pageOn(Dl);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, again);
    await press("read");
    const page = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const pagePl = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    await press("back");
    const no = trustOf(Dl) + JSON.stringify(Dl.envelope().teamLeft || null) === trustBefore && snapshot(leaveYard) === folderBefore;
    const takeL = await Dl.join("invite", again, "Nia", codeFor(again));
    /* The lead never took this desk off the roster, so yes finds its key already wrapped there and joins at once. */
    const env = Dl.envelope();
    const K4 = crypto.randomBytes(32);
    put(leaveYard, "etiuda-team.json", teamAt(4, [entry(me2, K4, 4), entry(meL, K4, 4)]));
    put(leaveYard, "lamps.ec", P.sealCatalog(K4, TEAM, 4, A1));
    const inAgain = await Dl.join("state");
    const readB2 = await Db.join("read", inviteBlob({ team: TEAM, folder: folder("bar-forgot-yard"), lead: lampLead, secret: newSecret() }));
    const f = { left: leftOk, asks: !!readL && !!readL.offer && readL.offer.left === left && readL.refused === undefined,
      page: page.indexOf("This desk left this team on " + day("en") + ". Join it again?") >= 0 && /data-join-check/.test(page),
      polish: pagePl.indexOf("To stanowisko opuściło ten zespół " + day("pl") + ". Dołączyć do niego ponownie?") >= 0,
      no: no,
      yes: !!takeL && !takeL.refused && !!takeL.joined && takeL.joined.team === TEAM && (env.teamBarred || []).indexOf(TEAM) < 0
        && !(env.teamLeft && env.teamLeft[TEAM]) && !!env.teamPins && !!env.teamPins[TEAM] && env.teamPins[TEAM].public === LEAD.public,
      joined: inAgain.sealed === null && !!leadIn(inAgain) && leadIn(inAgain).admitted === true && leadIn(inAgain).removed === false,
      forgot: !!readB2 && readB2.refused === "barred" && !readB2.offer };
    check(Object.keys(f).every(k => f[k]),
      "15bx after Leave the same lead's invitation is not refused: the confirm asks \"This desk left this team on <the day it"
      + " left>. Join it again?\", in English and in Polish; no changes nothing and writes nothing; yes takes it, lifts the leave"
      + " and joins, and the next epoch keeps the desk in; a lead forgotten as not matching is still refused as before: " + JSON.stringify(f)
      + (f.yes ? "" : " (yes answered " + JSON.stringify(takeL && (takeL.refused || (takeL.joined && "joined") || (takeL.join && takeL.join.state) || null))
        + ", bar " + JSON.stringify(env.teamBarred || null) + ", left " + JSON.stringify(env.teamLeft || null) + ")"));
  });

  await legTry("15bs", async () => {
    const PF = folder("leave-policy");
    const Dpol = await underPolicy(folderLead(PF), "leave-policy-desk", PF);
    const mePol = await Dpol.ask("etiuda:branch-identity", true), KP = crypto.randomBytes(32);
    put(PF, "etiuda-team.json", teamAt(1, [entry(mePol, KP, 1)]));
    put(PF, "lamps.ec", P.sealCatalog(KP, TEAM, 1, A1));
    const l = leadIn(await Dpol.join("state"));
    const html = await settingsAt(Dpol, "en");
    const said = html.indexOf("The organisation&#39;s IT sets this desk&#39;s team.") >= 0;
    const ok = WIN ? !!l && l.policy === true && html.indexOf("data-leave-team") < 0 && said
      : !!l && l.policy === false && html.indexOf("data-leave-team") >= 0 && !said;
    check(ok,
      "15bs a team machine policy names offers no Leave this team, since the policy would pin it again, and says the"
      + " organisation's IT sets it; off Windows no policy is read and Leave stands: " + JSON.stringify(l));
  });
  /* The test architect's kx3: a desk an invitation pinned and nobody let in is not "removed" by a roster that never listed it. */
  await legTry("15bt", async () => {
    const yard = folder("never-in-yard"), K = crypto.randomBytes(32);
    put(yard, "etiuda-team.json", teamAt(1, [entry(me2, K, 1)]));
    put(yard, "lamps.ec", P.sealCatalog(K, TEAM, 1, A1));
    const Dn3 = await deskWith("never-in", folder("never-in-own"));
    const blob = inviteBlob({ team: TEAM, folder: yard, lead: lampLead, secret: newSecret() });
    const took = await Dn3.join("invite", blob, "Ola", codeFor(blob));
    const l = leadIn(await Dn3.join("state")), html = await onPage(Dn3);
    check(!!took && !!took.join && !!l && l.admitted === false && l.removed === false && html.indexOf("no longer includes") < 0,
      "15bt (the test architect's kx3) a desk an invitation pinned and nobody let in, under a roster that does not list it, is not"
      + " told it is off the team: " + JSON.stringify(l));
  });

  /* The test architect's kx2: a newer roster that does not hold is no removal. */
  await legTry("15bu", async () => {
    const yard = folder("forged-out-yard"), K1x = crypto.randomBytes(32);
    const Dk = await deskWith("forged-out", folder("forged-out-own"));
    const meK = await Dk.ask("etiuda:branch-identity", true);
    const blob = inviteBlob({ team: TEAM, folder: yard, lead: lampLead, secret: newSecret() });
    await Dk.join("invite", blob, "Ola", codeFor(blob));
    put(yard, "etiuda-team.json", teamAt(1, [entry(me2, K1x, 1), entry(meK, K1x, 1)]));
    put(yard, "lamps.ec", P.sealCatalog(K1x, TEAM, 1, A1));
    const inK = leadIn(await Dk.join("state"));
    const roster2 = [entry(me2, crypto.randomBytes(32), 2)];
    const forgedLead = sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"], lead: FORGED, sealed: true,
      exportsSealed: false, epoch: 2, roster: roster2 }, forger.privateKey, FORGED.keyId);
    put(yard, "etiuda-team.json", forgedLead);
    const a = leadIn(await Dk.join("state")), htmlA = await onPage(Dk);
    const forgedSig = sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"], lead: LEAD, sealed: true,
      exportsSealed: false, epoch: 3, roster: [entry(me2, crypto.randomBytes(32), 3)] }, forger.privateKey, LEAD.keyId);
    put(yard, "etiuda-team.json", forgedSig);
    const b = leadIn(await Dk.join("state"));
    check(!!inK && inK.removed === false && inK.admitted === true && !!a && a.removed === false && !!b && b.removed === false
        && htmlA.indexOf("no longer includes") < 0,
      "15bu (the test architect's kx2) a newer roster leaving the desk off, under a lead key other than the pinned one or signed by"
      + " a key that is not the lead's it names, does not tell the desk it is off the team: " + JSON.stringify([a && a.removed, b && b.removed]));
  });

  /* A handover moves the pin to another lead, whose name no invitation gave: Settings says "Team", not the former lead's name. */
  await legTry("15bv", async () => {
    const yard = folder("handed-yard"), KH = crypto.randomBytes(32), KH2 = crypto.randomBytes(32);
    const Dh = await deskWith("handed", folder("handed-own"));
    const meH = await Dh.ask("etiuda:branch-identity", true);
    const blob = inviteBlob({ team: TEAM, folder: yard, lead: lampLead, secret: newSecret() });
    await Dh.join("invite", blob, "Ola", codeFor(blob));
    put(yard, "etiuda-team.json", teamAt(1, [entry(meH, KH, 1)]));
    put(yard, "lamps.ec", P.sealCatalog(KH, TEAM, 1, A1));
    const before = leadIn(await Dh.join("state"));
    const next = crypto.generateKeyPairSync("ed25519"), NEXT = { keyId: "lamp-next", public: pubHex(next.publicKey) };
    const step = { format: 1, kind: "etiuda-team-handover", team: TEAM, from: { keyId: LEAD.keyId, public: LEAD.public }, to: NEXT,
      sig: { alg: "Ed25519", keyId: LEAD.keyId } };
    step.sig.value = crypto.sign(null, Buffer.concat([Buffer.from("etiuda-team-handover\n", "utf8"), Buffer.from(V2.v2SignedBytes(step))]),
      lead.privateKey).toString("hex");
    put(yard, "etiuda-team.json", sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"], lead: NEXT, sealed: true,
      exportsSealed: false, epoch: 2, roster: [entry(meH, KH2, 2)], handover: [step] }, next.privateKey, NEXT.keyId));
    const after = leadIn(await Dh.join("state")), html = await settingsAt(Dh, "en");
    check(!!before && before.lead === "Lamp lead" && !!after && after.print === printOf(NEXT.public) && after.lead === ""
        && after.folder === yard && html.indexOf("Lamp lead&#39;s team") < 0 && html.indexOf('<div class="set-label">Team<small>') >= 0,
      "15bv a handover moves the pin to another lead, and the name the invitation gave the former lead goes with it, so Settings"
      + " says Team: " + JSON.stringify([before && before.lead, after && after.lead, after && after.print]));
  });

  /* A later offer, and Escape, each end the leave the way the wait does. 15ch presses Undo or
     lets the wait lapse, and 15br lets the wait lapse, so neither of these two endings is what they see. */
  const offeredLeave = async (tag) => {
    const yardR = folder("end-yard-" + tag);
    const D = await deskWith("end-" + tag, folder("end-own-" + tag));
    const meR = await D.ask("etiuda:branch-identity", true);
    const blob = inviteBlob({ team: TEAM, folder: yardR, lead: lampLead, secret: newSecret() });
    await D.join("invite", blob, "Nia", codeFor(blob));
    const KR = crypto.randomBytes(32);
    put(yardR, "etiuda-team.json", teamAt(1, [entry(me2, KR, 1), entry(meR, KR, 1)]));
    put(yardR, "lamps.ec", P.sealCatalog(KR, TEAM, 1, A1));
    await D.join("state");
    await pageOn(D);
    ST.lsSet("eUiLang", "en");
    const SET = await import(MOD("settings.js"));
    const drawn = /<button[^>]*data-leave-team="([^"]+)"[^>]*>Leave this team</.exec(SET.settingsBodyHtml());
    return { D: D, SET: SET, drawn: drawn };
  };
  await legTry("15r3", async () => {
    const R = await offeredLeave("later");
    const UL = await import(MOD("ui-lang.js"));
    const undoDoc = installUndoDoc(), clock = armUndoClock();
    let held = false, left = false;
    try {
      const btn = pressLeave(R.SET, R.drawn);
      if (btn.onclick) btn.onclick();
      held = !!(R.D.envelope().teamPins || {})[TEAM];
      UL.offerUndo("Settings reset", () => {});
      await new Promise(r => setTimeout(r, 60));
      left = leftShape(R.D.envelope());
      const bub = document.querySelector("#eUndo");
      const u = bub && bub.querySelector("#eUndoBtn");
      if (u && u.onclick) u.onclick();
    } finally { clock.restore(); undoDoc.restore(); }
    check(held && left, "15r3 a later offer taking the bubble completes the leave, the pin and keys gone, the team barred and a leave date kept: "
      + JSON.stringify({ held: held, left: left }));
  });
  await legTry("15r4", async () => {
    const R = await offeredLeave("escape");
    const undoDoc = installUndoDoc(), clock = armUndoClock();
    let held = false, left = false, keyed = false;
    try {
      const btn = pressLeave(R.SET, R.drawn);
      if (btn.onclick) btn.onclick();
      held = !!(R.D.envelope().teamPins || {})[TEAM];
      const bub = document.querySelector("#eUndo");
      const fns = (bub && bub.listeners && bub.listeners.keydown) || [];
      keyed = fns.length > 0;
      fns.forEach(fn => fn({ key: "Escape", preventDefault() {}, stopPropagation() {} }));
      await new Promise(r => setTimeout(r, 60));
      left = leftShape(R.D.envelope());
    } finally { clock.restore(); undoDoc.restore(); }
    check(held && keyed && left, "15r4 Escape on the offer completes the leave, the pin and keys gone, the team barred and a leave date kept: "
      + JSON.stringify({ held: held, keyed: keyed, left: left }));
  });
  document.body = bodyWas;
  if (langBefore == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langBefore);

  /* A pin kept for one team does not make that lead's catalog lead-signed in another team's folder. */
  {
    const mainSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    const pol = mainSrc.slice(mainSrc.indexOf("function policyLetsInviteGo"), mainSrc.indexOf("function memberHeedUnderPolicy"));
    const policyWrites = pol.indexOf('teamPins["policy"]') >= 0 || pol.indexOf("teamPins.policy") >= 0;
    check(!policyWrites, "15by policyLetsInviteGo does not write a policy pin");
    const trustSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "catalog-trust.js"), "utf8");
    const deskFn = trustSrc.slice(trustSrc.indexOf("function deskSigState"), trustSrc.indexOf("function catalogTrust"));
    const synthetic = deskFn.indexOf("{[id]:{[kid]:l.public}}") >= 0 || deskFn.indexOf("{[id]: {[kid]: l.public}}") >= 0;
    check(synthetic, "15bz deskSigState builds a ring from the document id and its own keyId for every lead public");

    const pairA = crypto.generateKeyPairSync("ed25519"), pairB = crypto.generateKeyPairSync("ed25519");
    const pairC = crypto.generateKeyPairSync("ed25519");
    const LA = { keyId: "lead-a", public: pubHex(pairA.publicKey) };
    const LB = { keyId: "lead-b", public: pubHex(pairB.publicKey) };
    const LC = { keyId: "lead-c", public: pubHex(pairC.publicKey) };
    const quay = rev => ({
      format: 2, kind: "etiuda-catalog", id: "quay-board", rev, date: "2026-10-01", name: "Quay board",
      langs: [{ code: "en", label: "EN" }],
      tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
      cards: [{ id: "c-warm", shelf: "t-op", title: { en: "Warm opening" }, body: { en: "marker-quay-board" }, bodyShape: "plain" }],
    });
    const teamDoc = (id, lead, key, roster) => sign({
      format: 1, kind: "etiuda-team", id, epoch: 1, rev: 1, catalogs: ["quay-board"],
      lead, sealed: true, exportsSealed: true, roster: roster,
    }, key, lead.keyId);
    const revOf = text => { try { return JSON.parse(text).rev; } catch { return null; } };
    const shareQa = folder("quay-a"), shareQb = folder("quay-b");
    const Dq = newDesk("quay", shareQa);
    const meQ = await Dq.ask("etiuda:branch-identity", true);
    const teamQa = "t-" + crypto.randomBytes(8).toString("hex");
    const teamQb = "t-" + crypto.randomBytes(8).toString("hex");
    const keyQa = crypto.randomBytes(32);
    const onA = [{ desk: { id: meQ.id, key: meQ.key, box: meQ.box }, wrap: Dq.api.wrapTeamKey(keyQa, meQ.box, teamQa, 1, meQ.id) }];
    put(shareQa, "etiuda-team.json", JSON.stringify(teamDoc(teamQa, LA, pairA.privateKey, onA)));
    const byOwn = sign(quay(1), pairA.privateKey, LA.keyId);
    put(shareQa, "own.ec", JSON.stringify(byOwn));
    const ownRead = Dq.api.readCatalog();
    const pinsJoined = Object.keys(Dq.envelope().teamPins || {}).length;
    check(pinsJoined === 1 && revOf(ownRead) === 1 && !!Dq.api.catalogLeadOk(byOwn),
      "15ca in team A's own folder, the catalog A's lead signed is chosen, and it counts as lead-signed: rev "
      + revOf(ownRead) + ", pins " + pinsJoined);

    Dq.api.setFolder(shareQb);
    put(shareQb, "etiuda-team.json", JSON.stringify(teamDoc(teamQb, LB, pairB.privateKey, [])));
    Dq.api.readCatalog();
    const pinsAfter = Object.keys(Dq.envelope().teamPins || {}).length;
    check(pinsJoined === 1 && pinsAfter === 1,
      "15cb joining team A keeps one pin, and team B's file does not clear it: " + pinsAfter);

    const onlyC = sign(quay(1), pairC.privateKey, LC.keyId);
    put(shareQb, "stranger.ec", JSON.stringify(onlyC));
    const refused = Dq.api.readCatalog();
    check(refused == null && !Dq.api.catalogLeadOk(onlyC),
      "15cc a catalog signed only by an unpinned key is not chosen");

    const byA = sign(quay(2), pairA.privateKey, LA.keyId);
    put(shareQb, "crossed.ec", JSON.stringify(byA));
    const chosen = Dq.api.readCatalog();
    const leadOk = !!Dq.api.catalogLeadOk(byA);
    check(!(chosen && chosen.indexOf("quay-board") >= 0 && leadOk),
      "15cd a catalog signed by team A's lead is not chosen in team B's folder: rev " + revOf(chosen) + ", lead-ok " + leadOk);

    const edited = JSON.parse(JSON.stringify(byA));
    edited.sig.keyId = LB.keyId;
    check(!Dq.api.catalogLeadOk(edited),
      "15ce changing keyId after the signature was made breaks it");

    const resigned = sign(quay(3), pairA.privateKey, LB.keyId);
    check(!Dq.api.catalogLeadOk(resigned),
      "15cf a signature made with another lead's keyId is not accepted");

    const keyQb = crypto.randomBytes(32);
    const onB = [{ desk: { id: meQ.id, key: meQ.key, box: meQ.box }, wrap: Dq.api.wrapTeamKey(keyQb, meQ.box, teamQb, 1, meQ.id) }];
    put(shareQb, "etiuda-team.json", JSON.stringify(teamDoc(teamQb, LB, pairB.privateKey, onB)));
    const byB = sign(quay(1), pairB.privateKey, LB.keyId);
    const byHigh = sign(quay(9), pairA.privateKey, LA.keyId);
    put(shareQb, "folder-lead.ec", JSON.stringify(byB));
    put(shareQb, "other-high.ec", JSON.stringify(byHigh));
    const both = Dq.api.readCatalog();
    const pinsBoth = Object.keys(Dq.envelope().teamPins || {}).length;
    check(pinsBoth === 2 && !!Dq.api.catalogLeadOk(byB) && !Dq.api.catalogLeadOk(byHigh) && revOf(both) === 1,
      "15cg with both leads pinned, team B's folder chooses the catalog B's lead signed and not A's higher rev: pins "
      + pinsBoth + ", rev " + revOf(both) + ", B " + !!Dq.api.catalogLeadOk(byB) + ", A " + !!Dq.api.catalogLeadOk(byHigh));
  }

  /* ---- Board 945 item 5: folder invitation wrap and signed refusal ----------------------------- */
  const B_blob = nodeRequire(path.join(ROOT, "shell", "relay", "blob.cjs"));
  const safeSealWrap = opts => {
    try { return B_blob.sealInviteWrap(opts); } catch { return { epoch: opts.epoch, ct: "00".repeat(44) }; }
  };
  const safeRefusedBytes = doc => {
    if (typeof B_blob.inviteRefusedSignedBytes === "function") return B_blob.inviteRefusedSignedBytes(doc);
    return Buffer.from("etiuda-invite-refused\n" + JSON.stringify(doc), "utf8");
  };

  const wrapYard = folder("folder-wrap-yard");
  const KW1 = crypto.randomBytes(32);
  const meW2 = { id: "k-" + crypto.randomBytes(8).toString("hex"), key: crypto.randomBytes(32).toString("hex"), box: crypto.randomBytes(32).toString("hex") };
  put(wrapYard, "etiuda-team.json", teamAt(1, [entry(meW2, KW1, 1)]));
  put(wrapYard, "lamps.ec", P.sealCatalog(KW1, TEAM, 1, A1));
  const secretW = crypto.randomBytes(16).toString("hex");
  SECRETS.push(secretW);
  const invIdW = P.inviteIdOf(secretW);
  const wrapW = safeSealWrap({ secret: secretW, folder: true, teamId: TEAM, invitationId: invIdW, epoch: 1, key: KW1 });
  fs.mkdirSync(path.join(wrapYard, "invites"), { recursive: true });
  put(wrapYard, path.join("invites", invIdW + ".wrap.json"), JSON.stringify(wrapW));

  const Dwrap = newDesk("desk-wrap", wrapYard);
  const blobW = inviteBlob({ team: TEAM, folder: wrapYard, lead: lampLead, secret: secretW });
  const tookW = await Dwrap.join("invite", blobW, "Nia", codeFor(blobW));
  const wrapCatalog = Dwrap.api.readCatalog("lamps.ec");
  const wrapState = await Dwrap.join("state");
  const wrapEnv = Dwrap.envelope();
  const heldKey = wrapEnv.teamKeys && wrapEnv.teamKeys[TEAM] && wrapEnv.teamKeys[TEAM][1];
  const waitingNotAdmitted = wrapState.join && wrapState.join.state === "waiting" && wrapState.joined === null;
  check(tookW && !tookW.refused && waitingNotAdmitted && heldKey && wrapCatalog === A1.trim(),
    "15dy a folder invitation's wrap opens at yes, and the desk opens the sealed edition before admission while the request waits: catalog "
    + (wrapCatalog === A1.trim() ? "opened" : "shut") + ", state " + (wrapState.join && wrapState.join.state));

  const badYard = folder("folder-wrap-bad");
  put(badYard, "etiuda-team.json", teamAt(1, [entry(meW2, KW1, 1)]));
  put(badYard, "lamps.ec", P.sealCatalog(KW1, TEAM, 1, A1));
  fs.mkdirSync(path.join(badYard, "invites"), { recursive: true });

  // 1. Wrap for another epoch (epoch 2 on an epoch 1 team file)
  const secEpoch = crypto.randomBytes(16).toString("hex"); SECRETS.push(secEpoch);
  const idEpoch = P.inviteIdOf(secEpoch);
  put(badYard, path.join("invites", idEpoch + ".wrap.json"), JSON.stringify(safeSealWrap({ secret: secEpoch, folder: true, teamId: TEAM, invitationId: idEpoch, epoch: 2, key: crypto.randomBytes(32) })));
  const D_epoch = newDesk("desk-epoch", badYard);
  await D_epoch.join("invite", inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secEpoch }), "Ola", codeFor(inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secEpoch })));
  const epochRead = D_epoch.api.readCatalog("lamps.ec");

  // 2. Wrap for another team
  const secTeam = crypto.randomBytes(16).toString("hex"); SECRETS.push(secTeam);
  const idTeam = P.inviteIdOf(secTeam);
  put(badYard, path.join("invites", idTeam + ".wrap.json"), JSON.stringify(safeSealWrap({ secret: secTeam, folder: true, teamId: "t-otherteam123456", invitationId: idTeam, epoch: 1, key: KW1 })));
  const D_team = newDesk("desk-team", badYard);
  await D_team.join("invite", inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secTeam }), "Ola", codeFor(inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secTeam })));
  const teamRead = D_team.api.readCatalog("lamps.ec");

  // 3. Tampered wrap
  const secTamp = crypto.randomBytes(16).toString("hex"); SECRETS.push(secTamp);
  const idTamp = P.inviteIdOf(secTamp);
  const tampWrap = safeSealWrap({ secret: secTamp, folder: true, teamId: TEAM, invitationId: idTamp, epoch: 1, key: KW1 });
  tampWrap.ct = tampWrap.ct.slice(0, -4) + (tampWrap.ct.slice(-4) === "0000" ? "ffff" : "0000");
  put(badYard, path.join("invites", idTamp + ".wrap.json"), JSON.stringify(tampWrap));
  const D_tamp = newDesk("desk-tamp", badYard);
  await D_tamp.join("invite", inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secTamp }), "Ola", codeFor(inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secTamp })));
  const tampRead = D_tamp.api.readCatalog("lamps.ec");

  // 4. Relay wrap moved into the folder
  const secRelay = crypto.randomBytes(16).toString("hex"); SECRETS.push(secRelay);
  const idRelay = P.inviteIdOf(secRelay);
  const relayWrap = safeSealWrap({ secret: secRelay, relayTeamId: crypto.randomBytes(16).toString("hex"), teamId: TEAM, invitationId: idRelay.padEnd(32, "0"), epoch: 1, key: KW1 });
  put(badYard, path.join("invites", idRelay + ".wrap.json"), JSON.stringify(relayWrap));
  const D_relay = newDesk("desk-relay-wrap", badYard);
  await D_relay.join("invite", inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secRelay }), "Ola", codeFor(inviteBlob({ team: TEAM, folder: badYard, lead: lampLead, secret: secRelay })));
  const relayRead = D_relay.api.readCatalog("lamps.ec");

  check(epochRead !== A1.trim() && teamRead !== A1.trim() && tampRead !== A1.trim() && relayRead !== A1.trim(),
    "15dz a wrap for another epoch or team, a tampered one, or a relay wrap moved into the folder, opens nothing: epoch "
    + (epochRead === A1.trim() ? "opened" : "shut") + ", team " + (teamRead === A1.trim() ? "opened" : "shut")
    + ", tampered " + (tampRead === A1.trim() ? "opened" : "shut") + ", relay " + (relayRead === A1.trim() ? "opened" : "shut"));

  // Open invitation receives new wrap at epoch 2
  const KW2 = crypto.randomBytes(32);
  const wrapW2 = safeSealWrap({ secret: secretW, folder: true, teamId: TEAM, invitationId: invIdW, epoch: 2, key: KW2 });
  put(wrapYard, path.join("invites", invIdW + ".wrap.json"), JSON.stringify(wrapW2));
  put(wrapYard, "etiuda-team.json", teamAt(2, [entry(meW2, KW2, 2)]));
  put(wrapYard, "lamps.ec", P.sealCatalog(KW2, TEAM, 2, A1));
  Dwrap.api.catalogChanged();
  const wrapCatalog2 = Dwrap.api.readCatalog("lamps.ec");
  const wrapEnv2 = Dwrap.envelope();
  const heldKey2 = wrapEnv2.teamKeys && wrapEnv2.teamKeys[TEAM] && wrapEnv2.teamKeys[TEAM][2];
  check(heldKey2 && wrapCatalog2 === A1.trim(),
    "15ee after a key change the open invitation's wrap is at the new epoch and opens the new edition: key kept "
    + !!heldKey2 + ", catalog " + (wrapCatalog2 === A1.trim() ? "opened" : "shut"));

  const refuseYard = folder("folder-wrap-refuse");
  const KR1 = crypto.randomBytes(32);
  put(refuseYard, "etiuda-team.json", teamAt(1, [entry(meW2, KR1, 1)]));
  put(refuseYard, "lamps.ec", P.sealCatalog(KR1, TEAM, 1, A1));
  const secRef = crypto.randomBytes(16).toString("hex"); SECRETS.push(secRef);
  const idRef = P.inviteIdOf(secRef);
  fs.mkdirSync(path.join(refuseYard, "invites"), { recursive: true });
  put(refuseYard, path.join("invites", idRef + ".wrap.json"), JSON.stringify(safeSealWrap({ secret: secRef, folder: true, teamId: TEAM, invitationId: idRef, epoch: 1, key: KR1 })));

  const Drf = newDesk("desk-refuse", refuseYard);
  await Drf.join("invite", inviteBlob({ team: TEAM, folder: refuseYard, lead: lampLead, secret: secRef }), "Ola", codeFor(inviteBlob({ team: TEAM, folder: refuseYard, lead: lampLead, secret: secRef })));
  const initialOpen = Drf.api.readCatalog("lamps.ec") === A1.trim();

  // 1. Forged refusal
  const otherKey = crypto.generateKeyPairSync("ed25519");
  const forgedRef = { format: 1, kind: "etiuda-invite-refused", team: TEAM, invitation: idRef, t: Date.now(), sig: { alg: "Ed25519", keyId: LEAD.keyId } };
  forgedRef.sig.value = crypto.sign(null, safeRefusedBytes(forgedRef), otherKey.privateKey).toString("hex");
  put(refuseYard, path.join("invites", idRef + ".refused.json"), JSON.stringify(forgedRef));
  await Drf.join("state");
  const forgedIgnored = Drf.envelope().teamKeys && Drf.envelope().teamKeys[TEAM] && Drf.envelope().teamKeys[TEAM][1];

  // 2. Refusal for another team
  const otherTeamRef = { format: 1, kind: "etiuda-invite-refused", team: "t-differentteam99", invitation: idRef, t: Date.now(), sig: { alg: "Ed25519", keyId: LEAD.keyId } };
  otherTeamRef.sig.value = crypto.sign(null, safeRefusedBytes(otherTeamRef), lead.privateKey).toString("hex");
  put(refuseYard, path.join("invites", idRef + ".refused.json"), JSON.stringify(otherTeamRef));
  await Drf.join("state");
  const otherTeamIgnored = Drf.envelope().teamKeys && Drf.envelope().teamKeys[TEAM] && Drf.envelope().teamKeys[TEAM][1];

  // 3. Refusal for another invitation
  const otherInvRef = { format: 1, kind: "etiuda-invite-refused", team: TEAM, invitation: "0123456789abcdef", t: Date.now(), sig: { alg: "Ed25519", keyId: LEAD.keyId } };
  otherInvRef.sig.value = crypto.sign(null, safeRefusedBytes(otherInvRef), lead.privateKey).toString("hex");
  put(refuseYard, path.join("invites", idRef + ".refused.json"), JSON.stringify(otherInvRef));
  await Drf.join("state");
  const otherInvIgnored = Drf.envelope().teamKeys && Drf.envelope().teamKeys[TEAM] && Drf.envelope().teamKeys[TEAM][1];

  const beforeRefusalSeed = fs.readFileSync(path.join(Drf.ud, "desk.json"), "utf8");

  // 4. Genuine refusal signed by the pinned lead
  const genuineRef = { format: 1, kind: "etiuda-invite-refused", team: TEAM, invitation: idRef, t: Date.now(), sig: { alg: "Ed25519", keyId: LEAD.keyId } };
  genuineRef.sig.value = crypto.sign(null, safeRefusedBytes(genuineRef), lead.privateKey).toString("hex");
  put(refuseYard, path.join("invites", idRef + ".refused.json"), JSON.stringify(genuineRef));
  try { fs.unlinkSync(path.join(refuseYard, "invites", idRef + ".wrap.json")); } catch {}

  const stateAfterRefuse = await Drf.join("state");
  const envAfterRefuse = Drf.envelope();
  const keyForgotten = !(envAfterRefuse.teamKeys && envAfterRefuse.teamKeys[TEAM] && envAfterRefuse.teamKeys[TEAM][1]);
  const catalogShut = Drf.api.readCatalog("lamps.ec") !== A1.trim();
  const saysRefused = stateAfterRefuse.join && stateAfterRefuse.join.state === "refused";

  await pageOn(Drf);
  ST.lsSet("eUiLang", "en");
  const cardHtml = TJ.teamJoinEmptyHtml();
  const saysWords = cardHtml.indexOf("The lead turned the request down") >= 0
    && cardHtml.indexOf("To join, a new invitation from the team&#39;s lead is needed.") >= 0
    && cardHtml.indexOf('data-join="cancel"') >= 0 && cardHtml.indexOf('data-join="ask"') < 0;

  check(initialOpen && forgedIgnored && otherTeamIgnored && otherInvIgnored && keyForgotten && catalogShut && saysRefused && saysWords,
    "15ef a genuine refusal makes a waiting desk forget the key and say so; forged, other-team and other-invitation refusals change nothing: forged ignored "
    + !!forgedIgnored + ", key forgotten " + keyForgotten + ", state " + (stateAfterRefuse.join && stateAfterRefuse.join.state) + ", words " + saysWords);

  // 15eg: lifting plant:folder-wrap-aad turns 15dy red
  {
    if (PLANTS_OFF) {
      skip("15eg lifting plant:folder-wrap-aad turns 15dy red");
    } else {
      const blobPath = path.join(ROOT, "shell", "relay", "blob.cjs");
      const before = fs.readFileSync(blobPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:folder-wrap-aad") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "    return null; /* plant:folder-wrap-aad */";
        const dir = fs.mkdtempSync(path.join(LAB, "wrap-aad-plant-"));
        fs.writeFileSync(path.join(dir, "blob.cjs"), lines.join("\n"), "utf8");
        const plantedBlob = nodeRequire(path.join(dir, "blob.cjs"));
        let plantedOpened = false;
        try {
          const res = plantedBlob.openInviteWrap(B_blob.inviteWrapKey(secretW), { wrap: wrapW, teamDoc: teamAt(1, [entry(meW2, KW1, 1)]), teamId: TEAM, relayTeamId: "folder", invitationId: invIdW });
          plantedOpened = res && res.ok;
        } catch { plantedOpened = false; }
        turned = !plantedOpened;
        detail = turned ? "folder wrap rejected with planted AAD" : "folder wrap still opened";
      }
      const same = fs.readFileSync(blobPath).equals(before);
      check(turned && same, "15eg lifting plant:folder-wrap-aad turns folder wrap opening red (FAIL 15dy: wrap opens with bad AAD): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15eh: lifting plant:refuse-forget turns 15ef red
  {
    if (PLANTS_OFF) {
      skip("15eh lifting plant:refuse-forget turns 15ef red");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:refuse-forget") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "  /* plant:refuse-forget */";
        const ud = path.join(LAB, "refuse-plant");
        fs.mkdirSync(ud, { recursive: true });
        fs.writeFileSync(path.join(ud, "desk.json"), beforeRefusalSeed, "utf8");
        const planted = loadDesk(ud, lines.join("\n"));
        await planted.join("state");
        const env = planted.envelope();
        const stillHoldsKey = !!(env.teamKeys && env.teamKeys[TEAM] && env.teamKeys[TEAM][1]);
        turned = stillHoldsKey;
        detail = turned ? "planted desk retained key after refusal" : "desk still forgot key";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15eh lifting plant:refuse-forget retains key after refusal (FAIL 15ef: key forgotten without forgetWrapped): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15ej: lifting plant:picker-cancel drops the invitation on picker cancel
  {
    if (PLANTS_OFF) {
      skip("15ej lifting plant:picker-cancel drops the invitation on picker cancel");
    } else {
      const joinPath = path.join(ROOT, "src", "modules", "team-join.js");
      const before = fs.readFileSync(joinPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:picker-cancel") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = fs.mkdtempSync(path.join(LAB, "join-plant-cancel-"));
        const modulesUrl = pathToFileURL(path.join(ROOT, "src", "modules")).href;
        fs.writeFileSync(path.join(dir, "team-join.js"), lines.join("\n").replace(/from "\.\//g, 'from "' + modulesUrl + "/"), "utf8");
        const planted = await import(pathToFileURL(path.join(dir, "team-join.js")).href);
        const DplantCancel = await deskWith("cancel-plant-desk", folder("cancel-plant-own"), null, null, {
          dialog: {
            showOpenDialog: async () => ({ canceled: true, filePaths: [] })
          }
        });
        window.E_HOST = hostOver(DplantCancel);
        planted.wireTeamJoin();
        await new Promise(r => setTimeout(r, 30));
        planted.openJoinPaste();
        const plantBlob = inviteBlob({ team: TEAM, folder: path.join(LAB, "gone-plant-" + crypto.randomBytes(4).toString("hex")), lead: lampLead, secret: newSecret() });
        pasted = elOf({ "data-join-paste": "" }, plantBlob);
        const pressPlanted = act => { const b = elOf({ "data-join": act }); planted.wireTeamJoinEmpty({ querySelectorAll: () => [b] }); return Promise.resolve(b.onclick && b.onclick()); };
        const typePlanted = val => { const c = elOf({ "data-join-check": "" }, val); planted.wireTeamJoinEmpty({ querySelectorAll: () => [c] }); if (c.oninput) c.oninput(); };
        await pressPlanted("read");
        typePlanted(codeFor(plantBlob));
        await pressPlanted("invite");
        const heldPlanted = typeof planted.inviteHeld === "function" ? planted.inviteHeld() : null;
        turned = !!heldPlanted && heldPlanted.mode !== "confirm";
        detail = turned ? "invitation dropped without guard (mode: " + JSON.stringify(heldPlanted && heldPlanted.mode) + ")" : "invitation still kept";
      }
      const same = fs.readFileSync(joinPath).equals(before);
      check(turned && same, "15ej lifting plant:picker-cancel drops the invitation on picker cancel (FAIL 15ei: invitation not kept on picker cancel): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15ek: Ask to join with no identity on win32 returns reason no-identity and card explains with Windows hint
  const safeNoEnc = { isEncryptionAvailable: () => false, encryptString: () => Buffer.from([]), decryptString: () => "" };
  {
    const udNoId = path.join(LAB, "noid");
    fs.mkdirSync(udNoId, { recursive: true });
    fs.writeFileSync(path.join(udNoId, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
    const deskNoId = loadDesk(udNoId, null, { safeStorage: safeNoEnc });
    await pageOn(deskNoId);
    window.E_HOST.platform = "win32";
    const askRes = await press("ask");
    const cardEnWin = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const cardPlWin = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const EN_WIN = "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on Windows, signing in with a person's own account, not a service account or a temporary profile, usually does it. Then press Ask to join again.";
    const PL_WIN = "Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie Windows zwykle pomaga zalogowanie się na własne konto, a nie na konto usługi ani profil tymczasowy. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.";
    check(askRes && askRes.askRefused === "no-identity" && cardEnWin.indexOf(escHtml(EN_WIN)) >= 0 && cardPlWin.indexOf(PL_WIN) >= 0,
      "15ek ask to join with no identity on win32 returns reason no-identity and card explains in English and Polish: "
      + JSON.stringify({ refused: askRes && askRes.askRefused, en: cardEnWin.indexOf(escHtml(EN_WIN)) >= 0, pl: cardPlWin.indexOf(PL_WIN) >= 0 }));

    // 15eq: Ask to join with no identity on darwin shows macOS sentence in English and Polish
    window.E_HOST.platform = "darwin";
    TJ.paintJoin();
    const cardEnMac = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const cardPlMac = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const EN_MAC = "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on macOS, allowing Etiuda to use the Keychain when asked usually does it. Then press Ask to join again.";
    const PL_MAC = "Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie macOS zwykle pomaga zezwolenie Etiudzie na dostęp do pęku kluczy, gdy system o to zapyta. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.";
    check(cardEnMac.indexOf(escHtml(EN_MAC)) >= 0 && cardPlMac.indexOf(PL_MAC) >= 0,
      "15eq ask to join with no identity on darwin shows macOS sentence in English and Polish: "
      + JSON.stringify({ en: cardEnMac.indexOf(escHtml(EN_MAC)) >= 0, pl: cardPlMac.indexOf(PL_MAC) >= 0 }));

    // 15er: Ask to join with no identity on linux shows Linux sentence in English and Polish
    window.E_HOST.platform = "linux";
    TJ.paintJoin();
    const cardEnLinux = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const cardPlLinux = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const EN_LINUX = "Ask to join works once this computer's secure storage can keep this desk's own key, which it cannot just now; on Linux, unlocking the system keyring usually does it. Then press Ask to join again.";
    const PL_LINUX = "Prośba o dołączenie zadziała, gdy bezpieczny magazyn tego komputera będzie mógł przechować własny klucz stanowiska, czego teraz nie może; w systemie Linux zwykle pomaga odblokowanie systemowego magazynu haseł. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.";
    check(cardEnLinux.indexOf(escHtml(EN_LINUX)) >= 0 && cardPlLinux.indexOf(PL_LINUX) >= 0,
      "15er ask to join with no identity on linux shows Linux sentence in English and Polish: "
      + JSON.stringify({ en: cardEnLinux.indexOf(escHtml(EN_LINUX)) >= 0, pl: cardPlLinux.indexOf(PL_LINUX) >= 0 }));
  }

  // 15el: Ask to join when the folder does not answer returns folder-not-answering
  {
    const udNoFolder = path.join(LAB, "nofolder");
    fs.mkdirSync(udNoFolder, { recursive: true });
    fs.writeFileSync(path.join(udNoFolder, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
    const deskNoFolder = loadDesk(udNoFolder);
    await pageOn(deskNoFolder);
    deskNoFolder.api.setDown(SHARE);
    const askRes = await press("ask");
    const cardEn = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const cardPl = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const EN_NOFOLDER = "Ask to join again once the team's folder can be reached; just now it does not answer from this computer, so nothing was written.";
    const PL_NOFOLDER = "Wystarczy ponownie poprosić o dołączenie, gdy folder zespołu będzie osiągalny; teraz ten komputer nie może się z nim połączyć, więc nic nie zapisano.";
    check(askRes && askRes.askRefused === "folder-not-answering" && cardEn.indexOf(escHtml(EN_NOFOLDER)) >= 0 && cardPl.indexOf(PL_NOFOLDER) >= 0,
      "15el ask to join when the folder does not answer returns folder-not-answering and card explains: "
      + JSON.stringify({ refused: askRes && askRes.askRefused, en: cardEn.indexOf(escHtml(EN_NOFOLDER)) >= 0, pl: cardPl.indexOf(PL_NOFOLDER) >= 0 }));
  }

  // 15em: Ask to join when the folder is not writable returns folder-not-writable
  {
    const udNoWrite = path.join(LAB, "nowrite");
    fs.mkdirSync(udNoWrite, { recursive: true });
    fs.writeFileSync(path.join(udNoWrite, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
    const deskNoWrite = loadDesk(udNoWrite);
    const meNW = await deskNoWrite.ask("etiuda:branch-identity", true);
    await pageOn(deskNoWrite);
    const joinDest = path.join(SHARE, "desks", meNW.id, "join.json");
    fs.mkdirSync(path.join(SHARE, "desks", meNW.id), { recursive: true });
    fs.mkdirSync(joinDest);
    let askRes;
    try {
      askRes = await press("ask");
    } finally {
      fs.rmdirSync(joinDest);
    }
    const cardEn = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "pl");
    const cardPl = TJ.teamJoinEmptyHtml();
    ST.lsSet("eUiLang", "en");
    const EN_NOWRITE = "Whoever manages the team's folder can let this computer write in it, which the request needs; until then nothing was written here. After that, press Ask to join again.";
    const PL_NOWRITE = "Osoba zarządzająca folderem zespołu może pozwolić temu komputerowi na zapis, którego wymaga prośba; do tego czasu nic tu nie zapisano. Potem wystarczy ponownie nacisnąć Poproś o dołączenie.";
    check(askRes && askRes.askRefused === "folder-not-writable" && cardEn.indexOf(escHtml(EN_NOWRITE)) >= 0 && cardPl.indexOf(PL_NOWRITE) >= 0,
      "15em ask to join when the folder is not writable returns folder-not-writable and card explains: "
      + JSON.stringify({ refused: askRes && askRes.askRefused, en: cardEn.indexOf(escHtml(EN_NOWRITE)) >= 0, pl: cardPl.indexOf(PL_NOWRITE) >= 0 }));
  }

  // 15en: lifting plant:w2-no-identity turns 15ek red
  {
    if (PLANTS_OFF) {
      skip("15en lifting plant:w2-no-identity turns 15ek red");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w2-no-identity") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "  if (!me) return joinView(); /* plant:w2-no-identity */";
        const udPlant = path.join(LAB, "plant-noid");
        fs.mkdirSync(udPlant, { recursive: true });
        fs.writeFileSync(path.join(udPlant, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
        const planted = loadDesk(udPlant, lines.join("\n"), { safeStorage: safeNoEnc });
        const res = await planted.join("ask", "lamps.ec", "Max G.");
        turned = !res || res.askRefused !== "no-identity";
        detail = turned ? "planted ask omitted no-identity reason" : "still returned no-identity";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15en lifting plant:w2-no-identity turns 15ek red (FAIL 15ek: no-identity reason absent): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15eo: lifting plant:w2-folder-not-answering turns 15el red
  {
    if (PLANTS_OFF) {
      skip("15eo lifting plant:w2-folder-not-answering turns 15el red");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w2-folder-not-answering") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "  if (!folderAnswers(root)) return joinView(); /* plant:w2-folder-not-answering */";
        const udPlant = path.join(LAB, "plant-nofolder");
        fs.mkdirSync(udPlant, { recursive: true });
        fs.writeFileSync(path.join(udPlant, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
        const planted = loadDesk(udPlant, lines.join("\n"));
        planted.api.setDown(SHARE);
        const res = await planted.join("ask", "lamps.ec", "Max G.");
        turned = !res || res.askRefused !== "folder-not-answering";
        detail = turned ? "planted ask omitted folder-not-answering reason" : "still returned folder-not-answering";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15eo lifting plant:w2-folder-not-answering turns 15el red (FAIL 15el: folder-not-answering reason absent): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15ep: lifting plant:w2-folder-not-writable turns 15em red
  {
    if (PLANTS_OFF) {
      skip("15ep lifting plant:w2-folder-not-writable turns 15em red");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w2-folder-not-writable") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "    return joinView(); /* plant:w2-folder-not-writable */";
        const udPlant = path.join(LAB, "plant-nowrite");
        fs.mkdirSync(udPlant, { recursive: true });
        fs.writeFileSync(path.join(udPlant, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: SHARE, eUiLang: "en" } }), "utf8");
        const planted = loadDesk(udPlant, lines.join("\n"));
        const mePl = await planted.ask("etiuda:branch-identity", true);
        const joinDestPl = path.join(SHARE, "desks", mePl.id, "join.json");
        fs.mkdirSync(path.join(SHARE, "desks", mePl.id), { recursive: true });
        fs.mkdirSync(joinDestPl);
        let res;
        try { res = await planted.join("ask", "lamps.ec", "Max G."); } finally { fs.rmdirSync(joinDestPl); }
        turned = !res || res.askRefused !== "folder-not-writable";
        detail = turned ? "planted ask omitted folder-not-writable reason" : "still returned folder-not-writable";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15ep lifting plant:w2-folder-not-writable turns 15em red (FAIL 15em: folder-not-writable reason absent): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  // 15es: Ask to join when write throws ENOENT (e.g. folder vanished before write) returns folder-not-answering
  {
    const udNoAns = path.join(LAB, "noans-write");
    fs.mkdirSync(udNoAns, { recursive: true });
    const shareNoAns = path.join(LAB, "share-noans-write");
    fs.mkdirSync(shareNoAns, { recursive: true });
    fs.copyFileSync(path.join(SHARE, "lamps.ec"), path.join(shareNoAns, "lamps.ec"));
    fs.writeFileSync(path.join(shareNoAns, "desks"), "block");
    fs.writeFileSync(path.join(udNoAns, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: shareNoAns, eUiLang: "en" } }), "utf8");
    const deskNoAns = loadDesk(udNoAns);
    const askRes = await deskNoAns.join("ask", "lamps.ec", "Max G.");
    check(askRes && askRes.askRefused === "folder-not-answering",
      "15es ask to join when write failure is ENOENT returns folder-not-answering: "
      + JSON.stringify({ refused: askRes && askRes.askRefused }));
  }

  // 15et: lifting plant:w2-not-writable-codes turns 15es red
  {
    if (PLANTS_OFF) {
      skip("15et lifting plant:w2-not-writable-codes turns 15es red");
    } else {
      const mainPath = path.join(ROOT, "shell", "main.js");
      const before = fs.readFileSync(mainPath);
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:w2-not-writable-codes") >= 0);
      let turned = false, detail = "plant line absent";
      if (at >= 0) {
        lines[at] = "    const notWritable = true; /* plant:w2-not-writable-codes */";
        const udPlant = path.join(LAB, "plant-notwritable-codes");
        fs.mkdirSync(udPlant, { recursive: true });
        const sharePlant = path.join(LAB, "plant-share-codes");
        fs.mkdirSync(sharePlant, { recursive: true });
        fs.copyFileSync(path.join(SHARE, "lamps.ec"), path.join(sharePlant, "lamps.ec"));
        fs.writeFileSync(path.join(sharePlant, "desks"), "block");
        fs.writeFileSync(path.join(udPlant, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: sharePlant, eUiLang: "en" } }), "utf8");
        const planted = loadDesk(udPlant, lines.join("\n"));
        const res = await planted.join("ask", "lamps.ec", "Max G.");
        turned = !res || res.askRefused !== "folder-not-answering";
        detail = turned ? "planted ask returned " + (res && res.askRefused) : "still returned folder-not-answering";
      }
      const same = fs.readFileSync(mainPath).equals(before);
      check(turned && same, "15et lifting plant:w2-not-writable-codes turns 15es red (FAIL 15es: ENOENT write failure not folder-not-answering): "
        + detail + ", sha " + (same ? "restored" : "differs"));
    }
  }

  /* Last, over every desk above: the log of each holds none of the secrets any invitation carried. */
  const leaked = [];
  DESKS.forEach(D => D.said.forEach(line => SECRETS.forEach(s => { if (line.indexOf(s) >= 0) leaked.push(line.slice(0, 48)); })));
  check(SECRETS.length >= 10 && leaked.length === 0,
    "15au no invitation's secret reaches the shell's log, through every read, yes and refusal above (" + SECRETS.length + " secrets, "
    + DESKS.length + " desks): leaked " + leaked.length);
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "rs1 every reg call was answered by the stand-in, the policy key's at least once and no other key of the machine's hive (Windows), none off it (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)" + (skipped ? ", " + skipped + " skipped" : ""));
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
