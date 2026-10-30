/* shell/folder/syncer.cjs - Background folder syncer for shared-folder teams.
 * Manages the background worker thread that watches and synchronizes a shared team folder
 * into the local mirror (<userData>/folder-mirror/<teamId>/).
 *
 * Board 945 stage 3 (b), slice 1.
 * D2: The worker only stages files into the mirror's .staging directory.
 * The main thread runs existing check functions on local bytes and renames into place or drops them.
 * No keys or pins are sent to the worker thread.
 * D4: Worker lists the shared folder every FOLDER_SYNC_CADENCE_MS (3000ms by default).
 * A folder watch event asks for a listing early via kick().
 * Both the two-equal-listings rule and two-listing removal scale with this cadence.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");

const FOLDER_SYNC_CADENCE_MS = 3000;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const SEALED_TEAM_RE = /^t-[0-9a-f]{16}$/;

function canonJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
}

function signedBytesOf(doc) {
  const copy = {};
  Object.keys(doc).forEach(k => {
    if (k === "hash") return;
    if (k !== "sig") { copy[k] = doc[k]; return; }
    const s = doc.sig;
    if (s && typeof s === "object") {
      copy.sig = {};
      if (s.alg !== undefined) copy.sig.alg = s.alg;
      if (s.keyId !== undefined) copy.sig.keyId = s.keyId;
    }
  });
  return Buffer.from(canonJson(copy), "utf8");
}

function teamWhole(doc) {
  const lead = doc && doc.lead, sig = doc && doc.sig;
  try {
    return +doc.format === 1 && doc.kind === "etiuda-team" && SEALED_TEAM_RE.test(String(doc.id)) && Number.isInteger(doc.epoch)
      && doc.epoch >= 1 && Array.isArray(doc.roster) && !!lead && typeof lead === "object" && typeof lead.keyId === "string"
      && /^[0-9a-f]{64}$/.test(String(lead.public)) && (lead.box === undefined || /^[0-9a-f]{64}$/.test(lead.box))
      && !!sig && sig.keyId === lead.keyId && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, signedBytesOf(doc), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(lead.public, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

function teamRevOf(doc) {
  if (doc.rev === undefined) return 0;
  return Number.isSafeInteger(doc.rev) && doc.rev >= 0 ? doc.rev : null;
}

function sealedAad(team, epoch) {
  return Buffer.from("etiuda-sealed\n" + team + "\n" + epoch, "utf8");
}

function openSealed(teamKey, doc) {
  try {
    if (!Buffer.isBuffer(teamKey) || teamKey.length !== 32) return null;
    if (!doc || typeof doc !== "object" || +doc.format !== 2 || doc.kind !== "etiuda-sealed") return null;
    if (!SEALED_TEAM_RE.test(String(doc.team)) || !Number.isInteger(doc.epoch) || doc.epoch < 1) return null;
    const nonce = String(doc.nonce), hex = String(doc.ct);
    if (!/^[0-9a-f]{24}$/.test(nonce) || !/^[0-9a-f]*$/.test(hex) || hex.length % 2 || hex.length < 32) return null;
    const ct = Buffer.from(hex, "hex");
    const d = crypto.createDecipheriv("aes-256-gcm", teamKey, Buffer.from(nonce, "hex"), { authTagLength: 16 });
    d.setAAD(sealedAad(doc.team, doc.epoch));
    d.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
  } catch { return null; }
}

function catalogSigValid(data, pinPublic) {
  const sig = data && data.sig;
  if (!data || !sig || sig.alg !== "Ed25519" || !/^[0-9a-f]{128}$/.test(String(sig.value || ""))) return false;
  if (!/^[0-9a-f]{64}$/.test(String(pinPublic || ""))) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pinPublic, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, signedBytesOf(data), key, Buffer.from(String(sig.value), "hex"));
  } catch { return false; }
}

const BRANCH_PREFIX = "etiuda-desk-branch\n";

function branchSignedBytes(doc) {
  return Buffer.concat([Buffer.from(BRANCH_PREFIX, "utf8"), signedBytesOf(doc)]);
}

function branchIdOf(pub) {
  return "k-" + crypto.createHash("sha256").update(Buffer.from(String(pub), "hex")).digest("hex").slice(0, 16);
}

function deskFileGenuine(data, folder) {
  const d = data && data.desk, sig = data && data.sig;
  try {
    return !!folder && !!d && typeof d === "object" && d.id === folder && /^k-[0-9a-f]{16}$/.test(d.id)
      && /^[0-9a-f]{64}$/.test(String(d.key)) && branchIdOf(d.key) === d.id
      && !!sig && sig.alg === "Ed25519" && sig.keyId === d.id && /^[0-9a-f]{128}$/.test(String(sig.value))
      && crypto.verify(null, branchSignedBytes(data), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(d.key, "hex")]),
        format: "der", type: "spki" }), Buffer.from(sig.value, "hex"));
  } catch { return false; }
}

function ensureDir(p, io) {
  const dir = path.dirname(p);
  try { io.mkdir(dir); } catch {}
}

const defaultIO = {
  readdir: (dir) => fs.readdirSync(dir),
  stat: (p) => fs.statSync(p),
  readFile: (p, enc) => fs.readFileSync(p, enc),
  writeFile: (p, data) => fs.writeFileSync(p, data),
  unlink: (p) => fs.unlinkSync(p),
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  exists: (p) => fs.existsSync(p),
  rename: (from, to) => fs.renameSync(from, to)
};

function createFolderProgram(opts) {
  const team = opts.team;
  const folder = opts.folder;
  const mirror = opts.mirror;
  let pin = opts.pin;
  const io = opts.io || defaultIO;
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};

  let mirrorEpoch = 0;
  let mirrorRev = -1;
  let pending = []; // [{ relPath, epoch, tmpPath, text }]
  const missingCount = new Map(); // relPath -> number of consecutive answered listings missing
  const seenUnchecked = new Map(); // relPath -> { size, mtimeMs }
  const knownKeys = new Map(); // epoch -> Buffer

  function importKeys(source) {
    if (!source) return;
    Object.keys(source).forEach(e => {
      const ep = parseInt(e, 10);
      let v = source[e];
      if (typeof v === "string") {
        if (/^[0-9a-f]{64}$/i.test(v)) v = Buffer.from(v, "hex");
        else {
          try { v = Buffer.from(v, "base64"); } catch {}
        }
      }
      if (Buffer.isBuffer(v) && v.length === 32) knownKeys.set(ep, v);
    });
  }
  importKeys(opts.keys);

  // Read initial mirror state if present
  try {
    const mirrorTeamPath = path.join(mirror, "etiuda-team.json");
    if (io.exists(mirrorTeamPath)) {
      const tDoc = JSON.parse(io.readFile(mirrorTeamPath, "utf8"));
      if (tDoc && Number.isInteger(tDoc.epoch)) {
        mirrorEpoch = tDoc.epoch;
        mirrorRev = teamRevOf(tDoc) || 0;
      }
    }
  } catch {}

  function walkFolder(baseDir, sub = "") {
    const out = new Map();
    const current = path.join(baseDir, sub);
    let entries = [];
    if (sub === "") {
      entries = io.readdir(current);
    } else {
      try {
        entries = io.readdir(current);
      } catch {
        return out;
      }
    }
    for (const name of entries) {
      if (name.startsWith(".") || name.endsWith(".tmp")) continue;
      const rel = sub ? path.join(sub, name).replace(/\\/g, "/") : name;
      const full = path.join(baseDir, rel);
      let st = null;
      try {
        st = io.stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory && st.isDirectory()) {
        if (sub === "" && (name === "desks" || name === "invites" || name === "catalog-asks")) {
          const inner = walkFolder(baseDir, name);
          for (const [k, v] of inner.entries()) out.set(k, v);
        } else if (sub === "desks") {
          const inner = walkFolder(baseDir, path.join(sub, name));
          for (const [k, v] of inner.entries()) out.set(k, v);
        }
      } else {
        out.set(rel, { size: st.size, mtimeMs: st.mtimeMs || 0 });
      }
    }
    return out;
  }

  function walkMirror() {
    const out = new Set();
    function scan(sub = "") {
      const current = path.join(mirror, sub);
      let entries = [];
      try { entries = io.readdir(current); } catch { return; }
      for (const name of entries) {
        if (name.startsWith(".") || name.endsWith(".tmp")) continue;
        const rel = sub ? path.join(sub, name).replace(/\\/g, "/") : name;
        const full = path.join(mirror, rel);
        let st = null;
        try { st = io.stat(full); } catch { continue; }
        if (st.isDirectory && st.isDirectory()) {
          scan(rel);
        } else {
          out.add(rel);
        }
      }
    }
    scan();
    return out;
  }

  function applyScan(scanData) {
    if (!scanData || !scanData.answers) {
      onStatus({ folder, answers: false });
      return { answers: false, applied: [] };
    }
    onStatus({ folder, answers: true });

    const applied = [];
    const listing = scanData.listing || [];
    const staged = scanData.staged || [];

    // Step 1: Team file check
    const teamStaged = staged.filter(s => s.relPath === "etiuda-team.json")[0];
    if (teamStaged) {
      let text = null;
      try { text = io.readFile(teamStaged.tmpPath, "utf8"); } catch {}
      if (text) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && teamWhole(doc) && doc.id === team) {
          const leadMatch = pin && doc.lead && doc.lead.public === pin.public && doc.lead.keyId === pin.keyId;
          let pinOk = true;
          if (!leadMatch) pinOk = false; /* plant:syncer-team-pin */
          if (pinOk) {
            const rev = teamRevOf(doc) || 0;
            const olderEpoch = doc.epoch < mirrorEpoch;
            const olderRevAtEpoch = doc.epoch === mirrorEpoch && rev < mirrorRev;
            let revOk = true;
            if (olderEpoch || olderRevAtEpoch) revOk = false; /* plant:syncer-team-rev */
            if (revOk) {
              const mirrorTeamPath = path.join(mirror, "etiuda-team.json");
              ensureDir(mirrorTeamPath, io);
              io.rename(teamStaged.tmpPath, mirrorTeamPath); /* plant:syncer-team-atomic */
              applied.push("etiuda-team.json");
              mirrorEpoch = doc.epoch;
              mirrorRev = rev;
            } else {
              try { io.unlink(teamStaged.tmpPath); } catch {}
            }
          } else {
            try { io.unlink(teamStaged.tmpPath); } catch {}
          }
        } else {
          try { io.unlink(teamStaged.tmpPath); } catch {}
        }
      } else {
        try { io.unlink(teamStaged.tmpPath); } catch {}
      }
    }

    // Step 2: Pending queue re-evaluation
    const stillPending = [];
    for (const item of pending) {
      if (item.epoch <= mirrorEpoch) {
        let genuine = false;
        const key = knownKeys.get(item.epoch);
        if (key) {
          try {
            const text = item.text || (item.tmpPath ? io.readFile(item.tmpPath, "utf8") : null);
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed.kind === "etiuda-sealed") {
                const decrypted = openSealed(key, parsed);
                if (decrypted) {
                  const cat = JSON.parse(decrypted);
                  if (cat && cat.kind === "etiuda-catalog") {
                    const parts = item.relPath.replace(/\\/g, "/").split("/");
                    if (parts[0] === "desks" && parts.length === 3) {
                      if (deskFileGenuine(cat, parts[1])) genuine = true;
                    } else if (catalogSigValid(cat, pin && pin.public)) {
                      genuine = true;
                    }
                  }
                }
              }
            }
          } catch {}
        }
        if (genuine) {
          const target = path.join(mirror, item.relPath);
          ensureDir(target, io);
          if (item.tmpPath && io.exists(item.tmpPath)) {
            io.rename(item.tmpPath, target);
          } else if (item.text) {
            io.writeFile(target, item.text);
          }
          applied.push(item.relPath);
        } else {
          if (item.tmpPath) { try { io.unlink(item.tmpPath); } catch {} }
        }
      } else {
        stillPending.push(item);
      }
    }
    pending = stillPending;

    // Step 3: Process remaining staged files
    for (const item of staged) {
      const relPath = item.relPath;
      if (relPath === "etiuda-team.json") continue;
      const tmpPath = item.tmpPath;
      let text = null;
      try { text = io.readFile(tmpPath, "utf8"); } catch {
        try { io.unlink(tmpPath); } catch {}
        continue;
      }

      if (relPath.endsWith(".ec")) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && doc.kind === "etiuda-sealed") {
          let waitPending = false;
          if (doc.epoch > mirrorEpoch || !knownKeys.has(doc.epoch)) waitPending = true; /* plant:syncer-epoch-pending */
          if (waitPending) {
            if (!pending.some(p => p.relPath === relPath)) {
              pending.push({ relPath, epoch: doc.epoch, tmpPath, text });
            }
          } else {
            const key = knownKeys.get(doc.epoch);
            const decrypted = openSealed(key, doc);
            let genuine = false;
            if (decrypted) {
              let cat = null;
              try { cat = JSON.parse(decrypted); } catch {}
              if (cat && cat.kind === "etiuda-catalog") {
                const parts = relPath.replace(/\\/g, "/").split("/");
                if (parts[0] === "desks" && parts.length === 3) {
                  if (deskFileGenuine(cat, parts[1])) genuine = true;
                } else if (catalogSigValid(cat, pin && pin.public)) {
                  genuine = true;
                }
              }
            }
            let sigOk = true;
            if (!genuine) sigOk = false; /* plant:syncer-edition-sig */
            if (!sigOk) {
              try { io.unlink(tmpPath); } catch {}
              continue;
            }
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else if (doc && doc.kind === "etiuda-catalog") {
          const parts = relPath.replace(/\\/g, "/").split("/");
          if (parts[0] === "desks" && parts.length === 3) {
            const deskFolder = parts[1];
            if (!deskFileGenuine(doc, deskFolder)) {
              try { io.unlink(tmpPath); } catch {}
              continue;
            }
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          } else {
            if (!catalogSigValid(doc, pin && pin.public)) {
              try { io.unlink(tmpPath); } catch {}
              continue;
            }
            const target = path.join(mirror, relPath);
            ensureDir(target, io);
            io.rename(tmpPath, target);
            applied.push(relPath);
          }
        } else {
          // Invalid or corrupt .ec file: drop the copy
          try { io.unlink(tmpPath); } catch {}
          continue;
        }
      } else {
        // Files with no crypto check (notes.txt, etc.): two-equal-listings rule
        const prev = seenUnchecked.get(relPath);
        let verifiedTwoListings = true;
        if (!prev || prev.size !== item.size || prev.mtimeMs !== item.mtimeMs) verifiedTwoListings = false; /* plant:syncer-two-listings */
        if (!verifiedTwoListings) {
          seenUnchecked.set(relPath, { size: item.size, mtimeMs: item.mtimeMs });
          try { io.unlink(tmpPath); } catch {}
        } else {
          const target = path.join(mirror, relPath);
          ensureDir(target, io);
          io.rename(tmpPath, target);
          applied.push(relPath);
        }
      }
    }

    // Step 4: Removals (only after 2 answered listings absent)
    const currentMirrorFiles = walkMirror();
    const listingMap = new Set(listing.map(entry => Array.isArray(entry) ? entry[0] : entry.relPath || entry));
    for (const relPath of currentMirrorFiles) {
      if (listingMap.has(relPath)) {
        missingCount.delete(relPath);
      } else {
        const count = (missingCount.get(relPath) || 0) + 1;
        missingCount.set(relPath, count);
        let eligibleForRemoval = true;
        if (count < 2) eligibleForRemoval = false; /* plant:syncer-two-absent-remove */
        if (eligibleForRemoval) {
          try { io.unlink(path.join(mirror, relPath)); } catch {}
          missingCount.delete(relPath);
          applied.push(relPath);
        }
      }
    }

    if (applied.length > 0) {
      onChange({ team, applied });
    }
    return { answers: true, applied };
  }

  function syncOnce() {
    let foundFiles = null;
    try {
      foundFiles = walkFolder(folder);
      if (!io.exists(folder)) throw new Error("listing failed");
    } catch (e) {
      return applyScan({ answers: false, listing: [], staged: [] });
    }

    const stagingDir = path.join(mirror, ".staging");
    try { io.mkdir(stagingDir); } catch {}

    const staged = [];
    for (const [relPath, st] of foundFiles.entries()) {
      const mirrorFile = path.join(mirror, relPath);
      let alreadyInMirror = false;
      try {
        if (io.exists(mirrorFile)) {
          const srcData = io.readFile(path.join(folder, relPath));
          const dstData = io.readFile(mirrorFile);
          if (Buffer.compare(Buffer.from(srcData), Buffer.from(dstData)) === 0) {
            alreadyInMirror = true;
          }
        }
      } catch {}

      if (!alreadyInMirror) {
        const srcFile = path.join(folder, relPath);
        const rand = crypto.randomBytes(8).toString("hex");
        const tmpFile = path.join(stagingDir, rand + ".tmp");
        try {
          const data = io.readFile(srcFile);
          io.writeFile(tmpFile, data);
          staged.push({ relPath, tmpPath: tmpFile, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          try { io.unlink(tmpFile); } catch {}
        }
      }
    }

    return applyScan({
      answers: true,
      listing: Array.from(foundFiles.entries()),
      staged
    });
  }

  function updateKeys(keys) {
    importKeys(keys);
  }

  return {
    syncOnce,
    applyScan,
    updateKeys,
    state: () => ({ mirrorEpoch, mirrorRev, pendingLength: pending.length, missingCount: new Map(missingCount) })
  };
}

class FolderSyncerController {
  constructor(opts) {
    this.team = opts.team;
    this.folder = opts.folder;
    this.mirror = opts.mirror;
    this.pin = opts.pin;
    this.keys = opts.keys || {};
    this.useWorker = opts.useWorker !== false;
    this.onStatus = opts.onStatus;
    this.onChange = opts.onChange;
    this.pollMs = opts.pollMs || FOLDER_SYNC_CADENCE_MS;
    this.worker = null;
    this.stopped = false;

    // The program runs on the main thread to perform verification and applying
    this.program = createFolderProgram({
      team: this.team,
      folder: this.folder,
      mirror: this.mirror,
      pin: this.pin,
      keys: this.keys,
      onStatus: this.onStatus,
      onChange: this.onChange
    });
  }

  start() {
    if (this.stopped) return;
    if (this.useWorker) {
      const workerScript = path.join(__dirname, "syncer-worker.cjs");
      this.worker = new Worker(workerScript);
      this.worker.on("message", (msg) => {
        if (!msg) return;
        if (msg.type === "status") {
          if (typeof this.onStatus === "function") this.onStatus(msg);
        } else if (msg.type === "scan") {
          this.program.applyScan(msg);
        }
      });
      // D2: only folder and mirror sent to worker; NO keys, NO pin
      this.worker.postMessage({
        type: "init",
        data: {
          folder: this.folder,
          mirror: this.mirror,
          pollMs: this.pollMs
        }
      });
    }
  }

  kick() {
    if (this.stopped) return;
    if (this.worker) {
      this.worker.postMessage({ type: "kick" });
    } else if (this.program) {
      try { this.program.syncOnce(); } catch {}
    }
  }

  stop() {
    this.stopped = true;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "stop" });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }

  updateKeys(keys) {
    if (this.program) this.program.updateKeys(keys);
  }
}

const syncerInstances = new Map();

function startFolderSyncer(opts) {
  const existing = syncerInstances.get(opts.team);
  if (existing) {
    if (existing.folder === opts.folder && !existing.stopped) {
      existing.kick();
      return existing; /* plant:syncer-singleton */
    }
    existing.stop();
  }
  for (const [t, s] of syncerInstances.entries()) {
    if (t !== opts.team) {
      s.stop(); /* plant:syncer-team-change */
      syncerInstances.delete(t);
    }
  }
  const syncer = new FolderSyncerController(opts);
  syncerInstances.set(opts.team, syncer);
  syncer.start();
  return syncer;
}

function stopAllFolderSyncers() {
  for (const s of syncerInstances.values()) {
    s.stop();
  }
  syncerInstances.clear();
}

function folderMirrorOf(userData, teamId) {
  return path.join(userData, "folder-mirror", String(teamId));
}

module.exports = {
  FOLDER_SYNC_CADENCE_MS,
  createFolderProgram,
  FolderSyncerController,
  startFolderSyncer,
  stopAllFolderSyncers,
  folderMirrorOf
};
