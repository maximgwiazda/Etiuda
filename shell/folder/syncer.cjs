/* shell/folder/syncer.cjs - Background folder syncer for shared-folder teams.
 * Manages the background worker thread that watches and synchronizes a shared team folder
 * into the local mirror (<userData>/folder-mirror/<teamId>/).
 * Board 945 stage 3 (b), slice 1.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");

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

function writeReplacing(file, textOrBuf, io) {
  const dir = path.dirname(file);
  try { io.mkdir(dir); } catch {}
  const rand = crypto.randomBytes(6).toString("hex");
  const tmp = file + "." + process.pid + "." + Date.now() + "." + rand + ".tmp";
  try {
    io.writeFile(tmp, textOrBuf);
    io.rename(tmp, file);
  } catch (e) {
    try { io.unlink(tmp); } catch {}
    throw e;
  }
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
  const pin = opts.pin;
  const io = opts.io || defaultIO;
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};

  let mirrorEpoch = 0;
  let mirrorRev = -1;
  let pending = []; // [{ relPath, epoch, text }]
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

  function syncOnce() {
    const applied = [];
    let foundFiles = null;
    try {
      foundFiles = walkFolder(folder);
      // If folder cannot even be read or readdir threw:
      if (!foundFiles) throw new Error("listing failed");
      onStatus({ folder, answers: true });
    } catch (e) {
      onStatus({ folder, answers: false });
      return { answers: false, applied: [] };
    }

    // Step 1: Team file check
    if (foundFiles.has("etiuda-team.json")) {
      const fullPath = path.join(folder, "etiuda-team.json");
      let text = null;
      try { text = io.readFile(fullPath, "utf8"); } catch {}
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
              let needsWrite = true;
              if (io.exists(mirrorTeamPath)) {
                try { needsWrite = io.readFile(mirrorTeamPath, "utf8") !== text; } catch {}
              }
              if (needsWrite) {
                writeReplacing(mirrorTeamPath, text, io); /* plant:syncer-team-atomic */
                applied.push("etiuda-team.json");
              }
              mirrorEpoch = doc.epoch;
              mirrorRev = rev;
            }
          }
        }
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
            const parsed = JSON.parse(item.text);
            if (parsed.kind === "etiuda-sealed") {
              const decrypted = openSealed(key, parsed);
              if (decrypted) {
                const cat = JSON.parse(decrypted);
                if (cat && cat.kind === "etiuda-catalog" && catalogSigValid(cat, pin && pin.public)) {
                  genuine = true;
                }
              }
            }
          } catch {}
        }
        if (genuine) {
          writeReplacing(path.join(mirror, item.relPath), item.text, io);
          applied.push(item.relPath);
        }
      } else {
        stillPending.push(item);
      }
    }
    pending = stillPending;

    // Step 3: Process remaining files from foundFiles
    for (const [relPath, st] of foundFiles.entries()) {
      if (relPath === "etiuda-team.json") continue;
      const fullPath = path.join(folder, relPath);
      let text = null;
      try { text = io.readFile(fullPath, "utf8"); } catch { continue; }

      if (relPath.endsWith(".ec")) {
        let doc = null;
        try { doc = JSON.parse(text); } catch {}
        if (doc && doc.kind === "etiuda-sealed") {
          let waitPending = false;
          if (doc.epoch > mirrorEpoch || !knownKeys.has(doc.epoch)) waitPending = true; /* plant:syncer-epoch-pending */
          if (waitPending) {
            if (!pending.some(p => p.relPath === relPath)) {
              pending.push({ relPath, epoch: doc.epoch, text });
            }
          } else {
            const key = knownKeys.get(doc.epoch);
            const decrypted = openSealed(key, doc);
            if (!decrypted) {
              continue;
            }
            let cat = null;
            try { cat = JSON.parse(decrypted); } catch {}
            if (!cat || cat.kind !== "etiuda-catalog" || !catalogSigValid(cat, pin && pin.public)) {
              continue; /* plant:syncer-edition-sig */
            }
            const target = path.join(mirror, relPath);
            let needsWrite = true;
            if (io.exists(target)) {
              try { needsWrite = io.readFile(target, "utf8") !== text; } catch {}
            }
            if (needsWrite) {
              writeReplacing(target, text, io);
              applied.push(relPath);
            }
          }
        } else if (doc && doc.kind === "etiuda-catalog") {
          if (!catalogSigValid(doc, pin && pin.public)) {
            continue;
          }
          const target = path.join(mirror, relPath);
          let needsWrite = true;
          if (io.exists(target)) {
            try { needsWrite = io.readFile(target, "utf8") !== text; } catch {}
          }
          if (needsWrite) {
            writeReplacing(target, text, io);
            applied.push(relPath);
          }
        }
      } else {
        // Files with no crypto check (notes, unchecked kinds)
        const prev = seenUnchecked.get(relPath);
        let verifiedTwoListings = true;
        if (!prev || prev.size !== st.size || prev.mtimeMs !== st.mtimeMs) verifiedTwoListings = false; /* plant:syncer-two-listings */
        if (!verifiedTwoListings) {
          seenUnchecked.set(relPath, { size: st.size, mtimeMs: st.mtimeMs });
        } else {
          const target = path.join(mirror, relPath);
          let needsWrite = true;
          if (io.exists(target)) {
            try { needsWrite = io.readFile(target, "utf8") !== text; } catch {}
          }
          if (needsWrite) {
            writeReplacing(target, text, io);
            applied.push(relPath);
          }
        }
      }
    }

    // Step 4: Removals (only after 2 answered listings absent)
    const currentMirrorFiles = walkMirror();
    for (const relPath of currentMirrorFiles) {
      if (foundFiles.has(relPath)) {
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

  function updateKeys(keys) {
    importKeys(keys);
  }

  return {
    syncOnce,
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
    this.worker = null;
    this.program = null;
    this.stopped = false;
  }

  start() {
    if (this.stopped) return;
    if (this.useWorker) {
      const workerScript = path.join(__dirname, "syncer-worker.cjs");
      this.worker = new Worker(workerScript);
      this.worker.on("message", (msg) => {
        if (!msg) return;
        if (msg.type === "status" && typeof this.onStatus === "function") {
          this.onStatus(msg);
        } else if (msg.type === "change" && typeof this.onChange === "function") {
          this.onChange(msg);
        }
      });
      this.worker.postMessage({
        type: "init",
        data: {
          team: this.team,
          folder: this.folder,
          mirror: this.mirror,
          pin: this.pin,
          keys: this.keys
        }
      });
    } else {
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
  createFolderProgram,
  FolderSyncerController,
  startFolderSyncer,
  stopAllFolderSyncers,
  folderMirrorOf
};
