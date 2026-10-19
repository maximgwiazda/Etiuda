"use strict";

/* A model of the relay and the channel layer.
   Each line marked plant:<id> is the one check that attack lifts.
   Trust is the pinned lead key and the signed roster, never a key a message names. */

const crypto = require("node:crypto");
const wire = require("../wire.cjs");

/* M1's bytes (the contract's An epoch move): an X25519 agreement, a desk's copy, and a wrap opened. */
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
const TEAM_NAME = "etiuda-team.json";
function agreement(privateHex, peerHex) {
  try {
    return crypto.diffieHellman({
      privateKey: crypto.createPrivateKey({ key: Buffer.from(String(privateHex), "hex"), format: "der", type: "pkcs8" }),
      publicKey: crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(String(peerHex), "hex")]), format: "der", type: "spki" }),
    });
  } catch (e) {
    return null;
  }
}
function deskCopy(dh, f) {
  if (!dh || dh.every(function (b) { return b === 0; })) return null;
  const info = Buffer.from(["etiuda-relay-desk-copy", f.relayTeamId, f.teamId, f.leadKeyId, f.leadBox, f.deskId, f.deskBox].join("\n") + "\n", "utf8");
  const okm = Buffer.from(crypto.hkdfSync("sha256", dh, Buffer.alloc(0), info, 48));
  return { id: okm.subarray(32).toString("hex"), key: okm.subarray(0, 32) };
}
function unwrapKey(privateHex, wrap, teamId, epoch, deskId) {
  try {
    if (!wrap || wrap.epoch !== epoch) return null;
    const info = Buffer.from("etiuda-relay-wrap\n" + teamId + "\n" + epoch + "\n" + deskId + "\n", "utf8");
    const k = Buffer.from(crypto.hkdfSync("sha256", agreement(privateHex, wrap.enc), Buffer.alloc(0), info, 32));
    const raw = Buffer.from(String(wrap.ct), "hex");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
  } catch (e) {
    return null;
  }
}
/* A roster entry's desk id and box, in either form a team file may give it. */
function boxOf(r) {
  if (r && r.desk && typeof r.desk.box === "string") return { deskId: r.desk.id, box: r.desk.box };
  if (r && typeof r.box === "string") return { deskId: r.deskId, box: r.box };
  return null;
}

const SAID = {
  "no-hello": "The relay serves a team only after a signed hello.",
  "not-enrolled": "That key is not enrolled for this team.",
  "hello-replay": "That hello has already been used.",
  "nonce-stale": "That challenge has expired.",
  "bad-signature": "That signature does not hold, so the file was left out.",
  "token-spent": "This invitation has already been used.",
  "token-tries": "This invitation has been tried too many times.",
  "removed": "That desk is no longer on the team.",
  "replay-counter": "An older copy of that file was left out.",
  "replay-rev": "An older team file was left out.",
  "not-roster": "That key is not on the signed team file, so the file was left out.",
  "outside-place": "That file sits outside its writer's place, so it was left out.",
  "bad-path": "That path stays outside the team folder.",
  "blob-size": "That file is larger than the relay accepts.",
  "team-size": "The team has reached the space the relay keeps.",
  "rate": "That many uploads in a minute is more than the relay accepts.",
  "forged-delete": "A deletion needs its writer's signature, so nothing was removed.",
  "superseded": "An older blob of that chain is no longer served.",
  "expired": "That deletion record has passed its keep.",
  "missing": "The relay has no such blob.",
  "tmp": "A temporary file stays on this desk.",
  "echo": "A file just received stays as it is.",
  "wrong-team": "That team file is not this desk's pinned team.",
  "epoch": "That file names an epoch this team file does not carry.",
  "invite-ended": "This invitation has expired. Ask your lead for a new one.",
};

function refuse(reason) {
  return { ok: false, reason: reason, said: SAID[reason] || "That was left out.", served: false };
}

function createTarget(limits) {
  const teamMax = limits && limits.teamMax != null ? limits.teamMax : wire.TEAM_MAX;
  let now = 0;
  let seq = 0;
  let programBytes = 0;
  let pinned = null;
  const nonceAt = new Map();
  const sessions = new Map();
  const enrolled = new Map();
  const wasEnrolled = new Set();
  const invites = new Map();
  const teamBytes = new Map();
  const rates = new Map();
  const programRates = new Map();
  const relayCounters = new Map();
  const relayDeskCounters = new Map();
  const programCounters = new Map();
  const deskFloors = new Map();
  const revFloor = new Map();
  const seenRoster = new Map();
  const deskReceiptCounters = new Map();
  const records = new Map();
  const sealed = new Map();
  const deletions = new Map();
  const subscribers = [];
  const mirror = new Map();
  const downloaded = new Set();
  const receivedAt = new Map();
  const ingested = [];
  // Post-restart replays use their own comparison, so lifting the pre-restart plant leaves that attack green.
  let restarted = false;
  const leadCounters = new Map();
  const copiesMade = new Map();

  function enrolKey(relayTeamId, keyId) {
    return relayTeamId + ":" + keyId;
  }

  function aadBytes(blob) {
    const keep = { team: false, epoch: false, id: false, counter: false, supersedes: false };
    keep.team = true; /* plant:E5-team */
    keep.epoch = true; /* plant:E5-epoch */
    keep.id = true; /* plant:E5-id */
    keep.counter = true; /* plant:P5 */
    keep.supersedes = true; /* plant:N7 */
    return wire.aadBytes(blob, keep);
  }

  function helloMessage(relayTeamId, nonce, keyId) {
    const parts = [wire.HELLO_LABEL];
    parts.push(String(relayTeamId)); /* plant:P22 */
    parts.push(String(nonce)); /* plant:P2 */
    parts.push(String(keyId));
    return Buffer.from(parts.join("\n") + "\n", "utf8");
  }

  function withdrawn(relayTeamId, keyId) {
    const k = enrolKey(relayTeamId, keyId);
    let gone = false;
    gone = wasEnrolled.has(k) && !enrolled.has(k); /* plant:F1-removed */
    if (gone) return refuse("removed");
    return null;
  }

  function keyGone(relayTeamId, keyId) {
    const k = enrolKey(relayTeamId, keyId);
    return wasEnrolled.has(k) && !enrolled.has(k);
  }

  function sessionLive(session, relayTeamId) {
    const s = sessions.get(session);
    if (!s) return false;
    return s.relayTeamId === relayTeamId;
  }

  function enrolledPublic(relayTeamId, keyId) {
    if (!keyId) return null;
    if (!enrolled.has(enrolKey(relayTeamId, keyId))) return null;
    return keyId;
  }

  function tooFast(map, id) {
    const prev = map.get(id) || [];
    let stamps = prev.slice();
    stamps = prev.filter(function (t) { return now - t < wire.RATE_WINDOW_MS; }); /* plant:P15 */
    return stamps;
  }

  function listRecords(relayTeamId) {
    const out = [];
    records.forEach(function (rec) {
      if (rec.relayTeamId === relayTeamId) out.push(rec);
    });
    return out;
  }

  function findRecord(relayTeamId, id) {
    return records.get(relayTeamId + ":" + id) || null;
  }

  function teamSignedByPin(doc) {
    if (!doc || !doc.sig || !doc.lead || !pinned) return false;
    let key = doc.lead.keyId;
    key = pinned.leadKeyId; /* plant:P9 */
    try {
      return wire.verify(key, wire.signedBytes(doc), doc.sig.value);
    } catch (e) {
      return false;
    }
  }

  function teamRevKey(doc) {
    return doc.id + ":" + pinned.leadKeyId + ":" + doc.epoch;
  }

  function sameTeam(doc) {
    return !!(doc && pinned && doc.id === pinned.teamId
      && doc.channel && doc.channel.relay === pinned.relayTeamId);
  }

  function placePath(path) {
    const parts = String(path).split(/[/\\]/);
    const kept = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "." || parts[i] === "") continue;
      kept.push(parts[i].toLowerCase());
    }
    return kept.join("/");
  }

  function roleOf(teamDoc, keyId) {
    const doc = teamDoc;
    if (!doc || !doc.lead) return null;
    if (doc.lead.keyId === keyId) return { role: "lead" };
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    const row = roster.find(function (r) { return r && r.keyId === keyId; });
    if (!row) return null;
    return { role: "desk", deskId: row.deskId };
  }

  function fileBase(path) {
    return placePath(path).split("/").pop();
  }

  function underDesks(path) {
    return placePath(path).indexOf("desks/") === 0;
  }

  /* A desk edit is any *.ec in that desk's place other than the two named kinds and notes.ec. */
  function s2Edit(path) {
    if (!underDesks(path)) return false;
    const base = fileBase(path);
    if (!base || base.slice(-3) !== ".ec") return false;
    if (base === "in-use.ec" || base === "catalog-answer.ec" || base === "notes.ec") return false;
    return true;
  }

  function s2PlaceFile(path) {
    if (!underDesks(path)) return false;
    const base = fileBase(path);
    if (base === "catalog-answer.ec" || base === "stats.estat") return true;
    return s2Edit(path);
  }

  function s2PersistKind(path) {
    return s2PlaceFile(path);
  }

  function deskPathOk(path, role) {
    if (!role) return false;
    const folded = placePath(path);
    if (role.role === "lead") return folded.indexOf("desks/") !== 0;
    const prefix = "desks/" + placePath(role.deskId) + "/";
    return folded.indexOf(prefix) === 0;
  }

  function rawPath(path) {
    return String(path).split("\\").join("/");
  }

  function canonicalPath(path) {
    return rawPath(path) === placePath(path);
  }

  /* Case and a leading ./ are this check only. A canonical path is left to the ownership check. */
  function s2FoldOk(path, role) {
    if (!s2PlaceFile(path) || canonicalPath(path)) return true;
    return deskPathOk(path, role);
  }

  /* The closing slash after the desk id. A canonical path that does not start with this desk's stem is left to ownership. */
  function s2SlashOk(path, role) {
    if (!s2PlaceFile(path) || !role || role.role !== "desk") return true;
    const folded = placePath(path);
    const prefix = "desks/" + placePath(role.deskId);
    if (folded.indexOf(prefix) !== 0) return true;
    return folded.indexOf(prefix + "/") === 0;
  }

  /* Ownership of a canonical path, without the closing slash, so a prefix hole is not this plant. */
  function s2OwnedOk(path, role) {
    if (!s2PlaceFile(path) || !canonicalPath(path)) return true;
    if (!role) return false;
    const raw = rawPath(path);
    if (role.role === "lead") return raw.indexOf("desks/") !== 0;
    return raw.indexOf("desks/" + role.deskId) === 0;
  }

  function s2JudgePlace(path, role) {
    let foldOk = true;
    foldOk = s2FoldOk(path, role); /* plant:S2-fold */
    if (!foldOk) return false;
    let slashOk = true;
    slashOk = s2SlashOk(path, role); /* plant:S2-prefix */
    if (!slashOk) return false;
    let owned = true;
    owned = s2OwnedOk(path, role); /* plant:S2-place-program */
    return owned;
  }

  function deskPlace(blob) {
    return !!(blob && typeof blob.place === "string" && blob.place.indexOf("desk:") === 0);
  }

  function relayRootClaim(relayTeamId, blob) {
    const en = enrolled.get(enrolKey(relayTeamId, blob.writerKeyId));
    if (!en) return true;
    if (blob.place === "root") return en.role === "lead";
    return true;
  }

  function relayDeskOwned(relayTeamId, blob) {
    if (!deskPlace(blob)) return true;
    const en = enrolled.get(enrolKey(relayTeamId, blob.writerKeyId));
    if (!en || en.role !== "desk") return false;
    return blob.place === "desk:" + en.deskId;
  }

  /* root, a desk place, the lead's invite:, or the lead's one answer to an invitation. */
  function relayOtherPlace(relayTeamId, blob) {
    const place = String(blob && blob.place || "");
    if (place === "root" || place.indexOf("desk:") === 0) return true;
    if (/^invite:[0-9a-f]{32}$/.test(place)) {
      const en = enrolled.get(enrolKey(relayTeamId, blob.writerKeyId));
      return !!(en && en.role === "lead");
    }
    if (/^answer:[0-9a-f]{32}$/.test(place)) {
      const en = enrolled.get(enrolKey(relayTeamId, blob.writerKeyId));
      return !!(en && en.role === "lead" && blob.id === place.slice(7));
    }
    return false;
  }

  /* A non-lead may not name another writer's blob in supersedes. An unknown id is not a chain yet. */
  function relayChainOk(relayTeamId, blob) {
    if (!blob || !blob.supersedes) return true;
    const prev = findRecord(relayTeamId, blob.supersedes);
    if (!prev || prev.writerKeyId === blob.writerKeyId) return true;
    const en = enrolled.get(enrolKey(relayTeamId, blob.writerKeyId));
    return !!(en && en.role === "lead");
  }

  /* A key missing from the newest loaded epoch's roster is removed under every older epoch. */
  function absentFromNewest(map, keyId, doc) {
    if (!doc || !map) return false;
    const epoch = Number(doc.epoch);
    let newest = null;
    map.forEach(function (v, ep) {
      const n = Number(ep);
      if (newest === null || n > newest) newest = n;
    });
    if (newest === null || !(epoch < newest)) return false;
    const top = map.get(newest);
    if (!top || top.keys.has(keyId)) return false;
    let listed = false;
    map.forEach(function (v) {
      if (v.keys.has(keyId) || (v.prior && v.prior.has(keyId))) listed = true;
    });
    return listed;
  }

  function noteRosterMap(map, doc) {
    if (!doc) return;
    const epoch = Number(doc.epoch);
    const rev = Number(doc.rev);
    const keys = new Set();
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    roster.forEach(function (row) {
      if (row && row.keyId) keys.add(row.keyId);
    });
    const prev = map.get(epoch);
    if (!prev || rev > prev.rev) {
      const prior = new Set(prev ? prev.prior : []);
      if (prev) prev.keys.forEach(function (k) { prior.add(k); });
      map.set(epoch, { rev: rev, keys: keys, prior: prior });
    }
  }

  function removedOnMap(map, keyId, doc) {
    const epoch = Number(doc.epoch);
    const row = map.get(epoch);
    if (row && row.prior.has(keyId) && !row.keys.has(keyId)) return true;
    let earlier = false;
    map.forEach(function (v, ep) {
      if (Number(ep) < epoch && (v.keys.has(keyId) || v.prior.has(keyId))) earlier = true;
    });
    return earlier && !!row && !row.keys.has(keyId);
  }

  function inPlace(path, role) {
    if (!role) return false;
    const p = placePath(path);
    if (role.role === "lead") return p.indexOf("desks/") !== 0;
    const prefix = "desks/" + placePath(role.deskId);
    return p.indexOf(prefix) === 0;
  }

  function prefixCollision(path, role) {
    let hit = false;
    if (role && role.role === "desk") {
      const p = placePath(path);
      const prefix = "desks/" + placePath(role.deskId);
      hit = p.indexOf(prefix) === 0 && p.indexOf(prefix + "/") !== 0;
    }
    let block = false;
    block = hit; /* plant:P26 */
    return block;
  }

  /* acceptDeskFile's own copy. classify's plants stay on acceptBlob, so lifting one does not open the other. */
  function deskHostile(path) {
    const s = String(path);
    if (s.split("/").indexOf("..") !== -1) return true;
    if (/^[A-Za-z]:/.test(s)) return true;
    if (s.indexOf(":") !== -1 && !/^[A-Za-z]:/.test(s)) return true;
    if (s.charAt(0) === "/" || s.charAt(0) === "\\") return true;
    if (s.indexOf("\\") !== -1) return true;
    return false;
  }

  function classify(path) {
    const s = String(path);
    let kind = "";
    if (s.split("/").indexOf("..") !== -1) kind = "dotdot"; /* plant:E6-dotdot */
    if (!kind && /^[A-Za-z]:/.test(s)) kind = "drive"; /* plant:E6-drive */
    if (!kind && s.indexOf(":") !== -1 && !/^[A-Za-z]:/.test(s)) kind = "stream"; /* plant:E6-stream */
    if (!kind && (s.charAt(0) === "/" || s.charAt(0) === "\\")) kind = "absolute"; /* plant:E6-absolute */
    if (!kind && s.indexOf("\\") !== -1) kind = "absolute"; /* plant:P13 */
    return kind;
  }

  function announce(relayTeamId, blob, rec) {
    const msg = { seq: rec.seq, id: rec.id, size: rec.size, path: blob.path || "" };
    delete msg.path; /* plant:E11-announce */
    subscribers.forEach(function (sub) {
      if (sub.relayTeamId === relayTeamId && sub.keyId !== blob.writerKeyId) {
        sub.events.push(Object.assign({}, msg));
      }
    });
  }

  function storeBlob(relayTeamId, blob, ct) {
    seq += 1;
    if (blob.supersedes) {
      const prev = findRecord(relayTeamId, blob.supersedes);
      let drop = false;
      if (prev) drop = true; /* plant:E-chain */
      if (drop && prev) prev.superseded = true;
    }
    let id = blob.path ? wire.pathId(String(blob.path)) : blob.id;
    id = blob.id; /* plant:E11-id */
    let size = ct.length - 16;
    size = wire.PAD_FLOOR + 16; /* plant:E11-pad */
    if (ct.length > wire.PAD_FLOOR + 16) size = ct.length;
    const rec = {
      relayTeamId: relayTeamId,
      id: id,
      supersedes: blob.supersedes || null,
      size: size,
      seq: seq,
      writerKeyId: blob.writerKeyId,
      ciphertext: ct,
      nonce: blob.nonce,
      deletion: !!blob.deletion,
      epoch: blob.epoch,
      superseded: false,
      place: typeof blob.place === "string" ? blob.place : "",
    };
    rec.carryPath = blob.path;
    rec.carryBody = blob.body;
    delete rec.carryPath; delete rec.carryBody; /* plant:P20 */
    records.set(relayTeamId + ":" + id, rec);
    sealed.set(relayTeamId + ":" + id, {
      id: id,
      relayTeamId: relayTeamId,
      epoch: blob.epoch,
      supersedes: blob.supersedes || null,
      writerKeyId: blob.writerKeyId,
      counter: blob.counter,
      nonce: blob.nonce,
      ciphertext: ct,
      signature: blob.signature,
      deletion: !!blob.deletion,
    });
    if (blob.deletion) {
      deletions.set(relayTeamId + ":" + id, { id: id, keepUntil: now + wire.DELETE_KEEP_MS });
    }
    announce(relayTeamId, blob, rec);
    return rec;
  }

  function issueSession(relayTeamId, keyId, nonceKey, extra) {
    nonceAt.delete(nonceKey);
    const session = wire.randomId();
    const row = { relayTeamId: relayTeamId, keyId: keyId };
    if (extra && extra.inviteId) {
      row.inviteId = extra.inviteId;
      row.boundKey = extra.boundKey || null;
    }
    sessions.set(session, row);
    const out = { ok: true, session: session };
    if (row.inviteId) {
      out.invite = true;
      out.until = now + 30 * 60 * 1000;
    }
    return out;
  }

  function leadOf(relayTeamId) {
    let id = null;
    enrolled.forEach(function (v, key) {
      if (key.indexOf(relayTeamId + ":") === 0 && v.role === "lead") id = key.slice(relayTeamId.length + 1);
    });
    return id;
  }

  function takeWrap(wrap) {
    if (!wrap || typeof wrap !== "object" || Array.isArray(wrap)) return { error: "bad-signature" };
    if (!Number.isSafeInteger(wrap.epoch) || wrap.epoch < 1 || typeof wrap.ct !== "string" || wrap.ct.length < 1) return { error: "bad-signature" };
    const size = Buffer.byteLength(wire.canon(wrap), "utf8");
    let over = size > 1025;
    over = size > 1024; /* plant:S3-wrap-cap */
    if (over) return { error: "blob-size" };
    let kept = wrap;
    kept = { epoch: wrap.epoch, ct: wrap.ct }; /* plant:S3-wrap-blind */
    return { wrap: kept };
  }

  function signatureHolds(input, relayTeamId) {
    const lead = leadOf(relayTeamId);
    let ok = true;
    ok = input.signed !== false && input.cover !== "bare" && (!input.signer || input.signer.keyId === lead); /* plant:S3-wrap-signed */
    return ok;
  }

  function boundRecord(relayTeamId, keyId, skipUploaded) {
    let found = null;
    invites.forEach(function (inv, id) {
      if (found || inv.relayTeamId !== relayTeamId || inv.key !== keyId || !inv.spent) return;
      if (skipUploaded && inv.uploaded) return;
      if (inv.spentAt != null && now - inv.spentAt > wire.DELETE_KEEP_MS) return;
      found = { id: id, inv: inv };
    });
    return found;
  }

  function deskHeld(relayTeamId, deskId) {
    let held = false;
    enrolled.forEach(function (v, key) {
      if (key.indexOf(relayTeamId + ":") === 0 && v.deskId === deskId) held = true;
    });
    return held;
  }

  function helloToken(input, nonceKey) {
    const inv = invites.get(input.invitationId);
    if (!inv || inv.relayTeamId !== input.relayTeamId) return refuse("not-enrolled");
    let locked = false;
    locked = (inv.fails || 0) >= wire.TOKEN_TRIES; /* plant:F1-tries */
    if (locked) return refuse("token-tries");
    let spent = false;
    spent = !!inv.spent; /* plant:F1-spent */
    if (spent) return refuse("token-spent");
    let match = wire.tokenHash(input.token) === inv.hash || input.token === inv.hash;
    match = wire.tokenHash(input.token) === inv.hash; /* plant:P12 */
    if (!match) {
      inv.fails = (inv.fails || 0) + 1;
      return refuse("not-enrolled");
    }
    let ended = false;
    ended = inv.until != null && now > inv.until; /* plant:S3-lapse */
    if (ended) {
      delete inv.wrap;
      return refuse("invite-ended");
    }
    const key = input.key !== undefined ? input.key : input.keyId;
    const pub = input.pub !== undefined ? input.pub : input.publicKey;
    const sig = input.sig !== undefined ? input.sig : input.signature;
    const msg = helloMessage(input.relayTeamId, input.nonce, key);
    let bound = false;
    try {
      const pubHash = pub ? crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex") : "";
      bound = !!(key && pub && sig && (key === pub || key === "k-" + pubHash.slice(0, 16)) && wire.verify(pub, msg, sig));
    } catch (e) {
      bound = false;
    }
    let allowUnbound = true;
    allowUnbound = false; /* plant:S3-unbound */
    if (!bound && !allowUnbound) return refuse("bad-signature");
    inv.spent = true;
    inv.spentAt = now;
    if (bound) {
      inv.key = key;
      inv.pub = pub;
    }
    return issueSession(
      input.relayTeamId,
      bound ? key : ("invite:" + input.invitationId),
      nonceKey,
      bound ? { inviteId: input.invitationId, boundKey: key } : { inviteId: input.invitationId }
    );
  }

  /* The plant keeps the resume after the upload, which is how the bound key reaches the answer. */
  function resumeBound(input, nonceKey) {
    let skipUploaded = true;
    skipUploaded = false; /* plant:S3-read-on */
    const held = boundRecord(input.relayTeamId, input.keyId, skipUploaded);
    if (!held) return null;
    const msg = helloMessage(input.relayTeamId, input.nonce, input.keyId);
    if (!wire.verify(held.inv.pub, msg, input.signature)) return refuse("not-enrolled");
    return issueSession(input.relayTeamId, input.keyId, nonceKey, { inviteId: held.id, boundKey: input.keyId });
  }

  function verified(publicKey, message, signature) {
    let ok = false;
    ok = wire.verify(publicKey, message, signature); /* plant:P18 */
    return ok;
  }

  function start() {
    return { ok: true };
  }

  function pin(input) {
    if (!input || !input.leadKeyId) return refuse("not-enrolled");
    pinned = {
      leadKeyId: input.leadKeyId,
      relayTeamId: input.relayTeamId,
      teamId: input.teamId,
    };
    return { ok: true };
  }

  function createTeam({ teamId, epoch, lead }) {
    const relayTeamId = wire.randomId();
    const k = enrolKey(relayTeamId, lead.keyId);
    enrolled.set(k, { role: "lead", deskId: null, teamId: teamId, epoch: epoch });
    wasEnrolled.add(k);
    return { relayTeamId: relayTeamId, teamId: teamId };
  }

  function addEpoch({ relayTeamId, epoch }) {
    return { ok: true, relayTeamId: relayTeamId, epoch: epoch };
  }

  function enrol({ relayTeamId, deskId, keyId }) {
    const k = enrolKey(relayTeamId, keyId);
    enrolled.set(k, { role: "desk", deskId: deskId });
    wasEnrolled.add(k);
    return { ok: true };
  }

  function removeDesk({ relayTeamId, deskId }) {
    const drop = [];
    enrolled.forEach(function (v, k) {
      if (k.indexOf(relayTeamId + ":") === 0 && v.deskId === deskId) drop.push(k);
    });
    drop.forEach(function (k) {
      wasEnrolled.add(k);
      enrolled.delete(k);
    });
    return { ok: true };
  }

  function invite(input) {
    const relayTeamId = input.relayTeamId;
    if (!signatureHolds(input, relayTeamId)) return refuse("bad-signature");
    let kept = null;
    if (input.wrap !== undefined) {
      const taken = takeWrap(input.wrap);
      if (taken.error) return refuse(taken.error);
      kept = taken.wrap;
    }
    if (input.until !== undefined && !Number.isSafeInteger(input.until)) return refuse("bad-signature");
    const invitationId = input.invitationId || wire.randomId();
    if (!/^[0-9a-f]{32}$/.test(invitationId)) return refuse("bad-signature");
    const token = wire.randomId() + wire.randomId();
    const row = {
      hash: wire.tokenHash(token),
      relayTeamId: relayTeamId,
      fails: 0,
      spent: false,
      uploaded: false,
    };
    if (input.until !== undefined) row.until = input.until;
    if (kept) row.wrap = kept;
    invites.set(invitationId, row);
    return { token: token, invitationId: invitationId };
  }

  function reseal(input) {
    const relayTeamId = input.relayTeamId;
    if (!signatureHolds(input, relayTeamId)) return refuse("bad-signature");
    const dropIds = Array.isArray(input.drop) ? input.drop : [];
    const wraps = Array.isArray(input.wraps) ? input.wraps : [];
    for (let i = 0; i < wraps.length; i++) {
      const taken = takeWrap(wraps[i] && wraps[i].wrap);
      if (taken.error) return refuse(taken.error);
    }
    const used = [];
    const dropped = [];
    dropIds.forEach(function (id) {
      const inv = invites.get(id);
      dropped.push(id);
      if (!inv || inv.relayTeamId !== relayTeamId) return;
      let nameUsed = false;
      nameUsed = !!inv.spent; /* plant:S3-cancel */
      if (nameUsed) used.push(id);
      sessions.forEach(function (s, token) {
        if (s.inviteId === id) sessions.delete(token);
      });
      if (inv.spent) {
        invites.set(id, {
          relayTeamId: relayTeamId,
          hash: inv.hash,
          spent: true,
          spentAt: inv.spentAt,
          uploaded: !!inv.uploaded,
          fails: inv.fails || 0,
        });
      } else {
        invites.delete(id);
      }
    });
    let replace = false;
    replace = true; /* plant:S3-reseal */
    wraps.forEach(function (entry) {
      if (dropIds.indexOf(entry.id) >= 0) return;
      const inv = invites.get(entry.id);
      if (!inv || inv.relayTeamId !== relayTeamId || !inv.hash) return;
      const taken = takeWrap(entry.wrap);
      if (!taken.wrap) return;
      if (replace) inv.wrap = taken.wrap;
      else {
        inv.oldWrap = inv.wrap;
        inv.wrap = taken.wrap;
      }
    });
    return { ok: true, dropped: dropped, used: used };
  }

  function drop(input) {
    return reseal({
      relayTeamId: input.relayTeamId,
      drop: input.ids,
      wraps: [],
      signed: input.signed,
      signer: input.signer,
      cover: input.cover,
    });
  }

  function fetchWrap({ relayTeamId, session }) {
    if (!sessionLive(session, relayTeamId)) return refuse("no-hello");
    const s = sessions.get(session);
    let onlyBound = false;
    onlyBound = true; /* plant:S3-wrap-session */
    let inv = s && s.inviteId ? invites.get(s.inviteId) : null;
    if (!onlyBound) {
      invites.forEach(function (row) {
        if (row.relayTeamId === relayTeamId && row.wrap) inv = row;
      });
    }
    if (onlyBound && (!s || !s.boundKey || !inv || inv.key !== s.boundKey)) return refuse("not-enrolled");
    if (!inv || !inv.wrap) return refuse("missing");
    return { ok: true, served: true, wrap: inv.wrap };
  }

  function inviteStates({ relayTeamId, session }) {
    if (!sessionLive(session, relayTeamId)) return refuse("no-hello");
    const s = sessions.get(session);
    if (!s || s.inviteId || s.keyId !== leadOf(relayTeamId)) return refuse("not-enrolled");
    const states = [];
    invites.forEach(function (inv, id) {
      if (inv.relayTeamId !== relayTeamId || !inv.hash) return;
      if (!inv.spent) {
        states.push({ id: id, state: "unused", usedAt: null });
        return;
      }
      let keepTime = false;
      keepTime = true; /* plant:S3-states */
      states.push({
        id: id,
        state: inv.uploaded ? "asked" : "used",
        usedAt: keepTime ? inv.spentAt : null,
      });
    });
    return { ok: true, served: true, states: states };
  }

  function openWrap(input) {
    const wrap = input && input.wrap;
    const teamDoc = input && input.teamDoc;
    if (!wrap || typeof wrap.ct !== "string") return refuse("bad-signature");
    let epochOk = true;
    epochOk = Number(wrap.epoch) === Number(teamDoc && teamDoc.epoch); /* plant:S3-epoch */
    if (!epochOk) return refuse("epoch");
    try {
      const secret = Buffer.isBuffer(input.secret) ? input.secret : Buffer.from(String(input.secret), "hex");
      const wrapKey = Buffer.from(crypto.hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from("etiuda-invite-wrap", "utf8"), 32));
      let idLine = "-";
      idLine = String(input.invitationId); /* plant:S3-wrap-moved */
      const ad = Buffer.from(["etiuda-invite-wrap", String(input.relayTeamId), String(input.teamId), idLine, String(wrap.epoch), ""].join("\n"), "utf8");
      const raw = Buffer.from(wrap.ct, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", wrapKey, raw.subarray(0, 12));
      decipher.setAAD(ad);
      decipher.setAuthTag(raw.subarray(raw.length - 16));
      const plain = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8"));
      return { ok: true, epoch: plain.epoch, key: Buffer.from(plain.key, "hex") };
    } catch (e) {
      return refuse("bad-signature");
    }
  }

  function challenge({ relayTeamId }) {
    const n = wire.randomId();
    nonceAt.set(relayTeamId + ":" + n, now);
    return { nonce: n };
  }

  function hello(input) {
    const nonceKey = input.relayTeamId + ":" + input.nonce;
    let live = true;
    live = nonceAt.has(nonceKey); /* plant:F1-replay */
    if (!live) return refuse("hello-replay");
    const issued = nonceAt.has(nonceKey) ? nonceAt.get(nonceKey) : 0;
    let fresh = true;
    fresh = (now - issued) <= wire.NONCE_LIFE_MS; /* plant:P16 */
    if (!fresh) return refuse("nonce-stale");
    if (input.token) return helloToken(input, nonceKey);
    let keyHex = enrolledPublic(input.relayTeamId, input.keyId);
    let caller = false;
    if (input.publicKey) { keyHex = input.publicKey; caller = true; }
    if (caller) keyHex = enrolledPublic(input.relayTeamId, input.keyId); /* plant:P1 */
    const msg = helloMessage(input.relayTeamId, input.nonce, input.keyId);
    if (keyGone(input.relayTeamId, input.keyId)) {
      let signed = true;
      signed = wire.verify(input.keyId, msg, input.signature); /* plant:N6 */
      if (!signed) return refuse("bad-signature");
      return refuse("removed");
    }
    if (!keyHex) {
      const resumed = resumeBound(input, nonceKey);
      if (resumed) return resumed;
      return refuse("not-enrolled"); /* plant:F1-unenrolled */
    }
    if (!wire.verify(keyHex, msg, input.signature)) return refuse("bad-signature");
    return issueSession(input.relayTeamId, input.keyId, nonceKey);
  }

  /* After the one upload, and until that key is enrolled, its session is served only its answer. */
  function answerOnly(session, relayTeamId) {
    const s = sessions.get(session);
    if (!s || s.relayTeamId !== relayTeamId || !s.inviteId || !s.boundKey) return null;
    const inv = invites.get(s.inviteId);
    if (!inv || !inv.uploaded || inv.key !== s.boundKey) return null;
    if (enrolled.has(enrolKey(relayTeamId, s.boundKey))) return null;
    return { id: s.inviteId };
  }

  function answerPlace(place) {
    return typeof place === "string" && /^answer:[0-9a-f]{32}$/.test(place);
  }

  function list({ relayTeamId, session }) {
    let allowed = true;
    if (session == null) allowed = false; /* plant:F1-list */
    if (typeof session === "string" && !sessionLive(session, relayTeamId)) allowed = false; /* plant:P4 */
    if (!allowed) return refuse("no-hello");
    const s = sessions.get(session);
    const gone = s ? withdrawn(relayTeamId, s.keyId) : null;
    if (gone) return gone;
    const only = answerOnly(session, relayTeamId);
    const ids = listRecords(relayTeamId).filter(function (r) {
      if (r.superseded || r.deletion) return false;
      if (only) return r.place === "answer:" + only.id;
      return !answerPlace(r.place);
    }).map(function (r) { return r.id; });
    return { ok: true, served: true, ids: ids };
  }

  function fetch({ relayTeamId, session, id }) {
    let allowed = true;
    if (session == null) allowed = false; /* plant:F1-fetch */
    if (typeof session === "string" && !sessionLive(session, relayTeamId)) allowed = false; /* plant:P3 */
    if (!allowed) return refuse("no-hello");
    const s = sessions.get(session);
    const gone = s ? withdrawn(relayTeamId, s.keyId) : null;
    if (gone) return gone;
    const only = answerOnly(session, relayTeamId);
    const rec = findRecord(relayTeamId, id);
    if (only) {
      const own = rec && rec.id === only.id && rec.place === "answer:" + only.id;
      if (!own) return rec ? refuse("not-enrolled") : refuse("missing");
    } else if (rec && answerPlace(rec.place)) {
      return refuse("missing");
    }
    if (!rec) return refuse("missing");
    if (rec.superseded) return refuse("superseded");
    const material = sealed.get(relayTeamId + ":" + id);
    if (!material) return refuse("missing");
    const out = {
      ok: true,
      served: true,
      id: rec.id,
      ciphertext: rec.ciphertext,
      nonce: material.nonce,
      signature: material.signature,
      epoch: material.epoch,
      supersedes: material.supersedes,
      writerKeyId: material.writerKeyId,
      counter: material.counter,
      plain: "leak",
    };
    delete out.plain; /* plant:P17 */
    return out;
  }

  function subscribe({ relayTeamId, session }) {
    let allowed = true;
    if (session == null || typeof session !== "string" || !sessionLive(session, relayTeamId)) allowed = false; /* plant:F1-socket */
    if (!allowed) return refuse("no-hello");
    const s = sessions.get(session);
    const gone = s ? withdrawn(relayTeamId, s.keyId) : null;
    if (gone) return gone;
    if (answerOnly(session, relayTeamId)) return { ok: true, served: true, events: [] };
    const sub = { relayTeamId: relayTeamId, keyId: s ? s.keyId : "", events: [] };
    subscribers.push(sub);
    return { ok: true, served: true, events: sub.events };
  }

  function admitModelInvite(relayTeamId, blob) {
    if (!blob) return null;
    const held = boundRecord(relayTeamId, blob.writerKeyId, false);
    if (!held) return null;
    let claim = true;
    claim = !enrolled.has(enrolKey(relayTeamId, blob.writerKeyId)); /* plant:S3-enrolled-up */
    if (!claim) return null;
    if (held.inv.uploaded) return refuse("token-spent");
    const place = String(blob.place || "");
    let atDesk = true;
    atDesk = place.indexOf("desk:") === 0; /* plant:S3-invite-place */
    const deskId = place.slice(5);
    if (place === "root" || !atDesk || deskHeld(relayTeamId, deskId)) return refuse("outside-place");
    const ct = blob.ciphertext || Buffer.alloc(0);
    if (!wire.verify(blob.writerKeyId, wire.uploadMessage(aadBytes(blob), ct), blob.signature)) return refuse("bad-signature");
    let clear = false;
    clear = true; /* plant:S3-burn */
    held.inv.uploaded = true;
    if (clear) delete held.inv.wrap;
    const rec = storeBlob(relayTeamId, blob, ct);
    return { ok: true, seq: rec.seq, id: rec.id };
  }

  function upload({ relayTeamId, blob }) {
    const ct = blob && blob.ciphertext ? blob.ciphertext : Buffer.alloc(0);
    let tooBig = false;
    tooBig = ct.length > wire.BLOB_MAX; /* plant:E6-blob-relay */
    if (tooBig) return refuse("blob-size");
    const used = teamBytes.get(relayTeamId) || 0;
    let overTeam = false;
    overTeam = used + ct.length > teamMax; /* plant:E6-team-relay */
    if (overTeam) return refuse("team-size");
    const stamps = tooFast(rates, blob.writerKeyId);
    let hot = false;
    hot = stamps.length >= wire.RATE_MAX; /* plant:E6-rate-relay */
    if (hot) return refuse("rate");
    const invited = admitModelInvite(relayTeamId, blob);
    if (invited) {
      if (invited.ok) {
        stamps.push(now);
        rates.set(blob.writerKeyId, stamps);
        teamBytes.set(relayTeamId, used + ct.length);
      }
      return invited;
    }
    const ek = enrolKey(relayTeamId, blob.writerKeyId);
    let known = true;
    known = enrolled.has(ek) || wasEnrolled.has(ek); /* plant:E1-stranger */
    if (!known) return refuse("not-enrolled");
    const gone = withdrawn(relayTeamId, blob.writerKeyId);
    if (gone) return gone;
    let placeOk = true;
    placeOk = relayRootClaim(relayTeamId, blob); /* plant:E1-place-relay */
    if (!placeOk) return refuse("outside-place");
    let deskOwned = true;
    deskOwned = relayDeskOwned(relayTeamId, blob); /* plant:S2-place-relay */
    if (!deskOwned) return refuse("outside-place");
    let knownPlace = true;
    knownPlace = relayOtherPlace(relayTeamId, blob); /* plant:S2-place-other */
    if (!knownPlace) return refuse("outside-place");
    let chainOk = true;
    chainOk = relayChainOk(relayTeamId, blob); /* plant:S2-chain */
    if (!chainOk) return refuse("outside-place");
    const aad = aadBytes(blob);
    const ck = blob.writerKeyId + ":" + blob.epoch;
    const floor = relayCounters.get(ck) || 0;
    if (!restarted && blob.counter <= floor) return refuse("replay-counter"); /* plant:F2-relay */
    if (restarted && deskPlace(blob) && blob.counter <= (relayDeskCounters.get(ck) || 0)) return refuse("replay-counter");
    if (restarted && !deskPlace(blob) && blob.counter <= floor) return refuse("replay-counter");
    relayCounters.set(ck, blob.counter);
    const sigOk = wire.verify(blob.writerKeyId, wire.uploadMessage(aad, ct), blob.signature);
    if (!sigOk) {
      relayCounters.set(ck, floor); /* plant:P25 */
      return refuse("bad-signature");
    }
    if (deskPlace(blob)) relayDeskCounters.set(ck, blob.counter);
    stamps.push(now);
    rates.set(blob.writerKeyId, stamps);
    teamBytes.set(relayTeamId, used + ct.length);
    const rec = storeBlob(relayTeamId, blob, ct);
    return { ok: true, seq: rec.seq, id: rec.id };
  }

  function fetchDeletion({ relayTeamId, id }) {
    const rec = deletions.get(relayTeamId + ":" + id);
    if (!rec) return refuse("missing");
    let live = true;
    live = now <= rec.keepUntil; /* plant:E3-retain */
    if (!live) return refuse("expired");
    return { ok: true, served: true, id: rec.id };
  }

  function epochMove({ relayTeamId }) {
    const list = listRecords(relayTeamId);
    let reseal = true;
    reseal = false; /* plant:E8 */
    if (reseal) {
      list.forEach(function (rec) {
        rec.ciphertext = Buffer.concat([Buffer.from("reseal"), rec.ciphertext]);
      });
    }
    return { resealed: reseal };
  }

  function inspect({ relayTeamId, id }) {
    const rec = findRecord(relayTeamId, id);
    if (!rec) return null;
    const raw = [];
    invites.forEach(function (inv, invId) {
      raw.push({
        id: invId,
        relayTeamId: inv.relayTeamId,
        wrap: inv.wrap || null,
        oldWrap: inv.oldWrap || null,
        spent: !!inv.spent,
        uploaded: !!inv.uploaded,
      });
    });
    return Object.assign({}, rec, { raw: raw });
  }

  function seal(opts) {
    const id = opts.id || wire.randomId();
    const kind = opts.kind || "file";
    const blob = {
      id: id,
      relayTeamId: opts.relayTeamId,
      epoch: opts.epoch,
      supersedes: opts.supersedes || null,
      writerKeyId: opts.writer.keyId,
      counter: opts.counter,
      place: opts.place,
      deletion: kind === "delete",
      path: opts.path,
      body: opts.body || "",
    };
    const aad = aadBytes(blob);
    const obj = { kind: kind, path: opts.path, body: blob.body };
    const json = Buffer.from(JSON.stringify(obj), "utf8");
    let step = 4 + json.length;
    step = wire.padStep(4 + json.length); /* plant:P21 */
    const framed = Buffer.alloc(step);
    framed.writeUInt32BE(json.length, 0);
    json.copy(framed, 4);
    const sealed = wire.encrypt(opts.teamKey, aad, framed);
    blob.nonce = sealed.nonce;
    blob.ciphertext = sealed.ciphertext;
    blob.plainLength = json.length;
    blob.signature = wire.sign(opts.writer.privateKey, wire.uploadMessage(aad, sealed.ciphertext));
    return blob;
  }

  /* The lead's side of a team file: the team file and the files at the root under the team key, and a copy of the team
     file for each desk the roster names, under that desk's copy key, in its own place. */
  function sealTeam({ relayTeamId, teamId, epoch, teamKey, writer, leadBox, teamDoc, files }) {
    const text = JSON.stringify(teamDoc);
    let counter = leadCounters.get(epoch) || 0;
    const next = function (key, path, body, place) {
      counter += 1;
      return seal({ relayTeamId: relayTeamId, epoch: epoch, teamKey: key, writer: writer, path: path, body: body,
        counter: counter, place: place, kind: "file" });
    };
    const blobs = [next(teamKey, TEAM_NAME, text, "root")];
    Object.keys(files || {}).forEach(function (p) { blobs.push(next(teamKey, p, files[p], "root")); });
    const roster = (Array.isArray(teamDoc.roster) ? teamDoc.roster : []).map(boxOf).filter(Boolean);
    roster.forEach(function (d) { copiesMade.set(d.deskId, d); });
    let desks = Array.from(copiesMade.values());
    desks = roster; /* plant:M1 */
    desks.forEach(function (d) {
      const c = deskCopy(agreement(leadBox.private, d.box), { relayTeamId: relayTeamId, teamId: teamId, leadKeyId: writer.keyId,
        leadBox: leadBox.public, deskId: d.deskId, deskBox: d.box });
      if (c) blobs.push(next(c.key, TEAM_NAME, text, "invite:" + c.id));
    });
    leadCounters.set(epoch, counter);
    return { ok: true, blobs: blobs };
  }

  /* A desk's own copy among `blobs`: opened under the key of its own agreement with the lead's box, signed by the pinned
     lead; its team file taken where it is newer than `teamDoc`, and the key from this desk's wrap. Null otherwise. */
  function takeCopy({ relayTeamId, blobs, teamDoc, box, deskId }) {
    if (!pinned || !teamDoc || !teamDoc.lead || !box) return null;
    const own = deskCopy(agreement(box.private, teamDoc.lead.box), { relayTeamId: relayTeamId, teamId: pinned.teamId,
      leadKeyId: pinned.leadKeyId, leadBox: teamDoc.lead.box, deskId: deskId, deskBox: box.public });
    if (!own) return null;
    let best = null;
    (blobs || []).forEach(function (b) {
      if (!b || b.writerKeyId !== pinned.leadKeyId) return;
      const aad = aadBytes(b);
      if (!wire.verify(pinned.leadKeyId, wire.uploadMessage(aad, b.ciphertext), b.signature)) return;
      let inner = null;
      try { inner = wire.open(own.key, aad, b.nonce, b.ciphertext); } catch (e) { return; }
      if (!inner || inner.kind !== "file" || inner.path !== TEAM_NAME) return;
      let doc = null;
      try { doc = JSON.parse(inner.body); } catch (e) { return; }
      if (!teamSignedByPin(doc) || !sameTeam(doc) || Number(doc.epoch) !== Number(b.epoch)) return;
      if (!best || doc.epoch > best.epoch || (doc.epoch === best.epoch && doc.rev > best.rev)) best = doc;
    });
    if (!best || Number(best.epoch) <= Number(teamDoc.epoch)) return null;
    if (!loadTeamFile(best).ok) return null;
    const entry = (Array.isArray(best.roster) ? best.roster : []).filter(function (r) { const d = boxOf(r); return d && d.deskId === deskId; })[0];
    const key = entry ? unwrapKey(box.private, entry.wrap, best.id, best.epoch, deskId) : null;
    if (!key) return null;
    mirror.set(TEAM_NAME, JSON.stringify(best));
    return { ok: true, teamKey: key, teamDoc: best };
  }

  function acceptBlob({ teamKey, teamDoc, blob }) {
    const ct = blob && blob.ciphertext ? blob.ciphertext : Buffer.alloc(0);
    let tooBig = false;
    tooBig = ct.length > wire.BLOB_MAX; /* plant:P14 */
    if (tooBig) return refuse("blob-size");
    const aad = aadBytes(blob);
    let signedOk = true;
    signedOk = wire.verify(blob.writerKeyId, wire.uploadMessage(aad, ct), blob.signature); /* plant:E1 */
    if (!signedOk) return refuse("bad-signature");
    let inner;
    try {
      inner = wire.open(teamKey, aad, blob.nonce, ct);
    } catch (e) {
      return refuse("bad-signature");
    }
    const hostile = classify(inner.path);
    if (hostile) return refuse("bad-path");
    let signedTeam = true;
    signedTeam = teamSignedByPin(teamDoc); /* plant:P8 */
    if (!signedTeam) return refuse("bad-signature");
    let ownTeam = true;
    ownTeam = sameTeam(teamDoc); /* plant:N4 */
    if (!ownTeam) return refuse("wrong-team");
    const revSeen = revFloor.get(teamRevKey(teamDoc)) || 0;
    let staleRev = false;
    staleRev = Number(teamDoc.rev) < revSeen; /* plant:N1 */
    if (staleRev) return refuse("replay-rev");
    noteRosterMap(seenRoster, teamDoc);
    let epochCarried = true;
    epochCarried = Number(blob.epoch) === Number(teamDoc.epoch); /* plant:N8 */
    if (!epochCarried) return refuse("epoch");
    const role = roleOf(teamDoc, blob.writerKeyId);
    let rosterOk = true;
    rosterOk = !!role; /* plant:E2 */
    // Its own line: lifting the roster plant still refuses a key an earlier roster named.
    let dropped = false;
    dropped = removedOnMap(seenRoster, blob.writerKeyId, teamDoc); /* plant:S2-remove */
    if (dropped) return refuse("removed");
    let epochRoute = false;
    epochRoute = absentFromNewest(seenRoster, blob.writerKeyId, teamDoc); /* plant:S2-epoch-gone */
    if (epochRoute) return refuse("removed");
    if (!rosterOk) return refuse("not-roster");
    const ck = blob.writerKeyId + ":" + blob.epoch;
    const floor = programCounters.get(ck) || 0;
    let replay = false;
    replay = blob.counter <= floor; /* plant:F2 */
    if (!restarted && inner.kind !== "delete" && replay) return refuse("replay-counter");
    if (restarted && inner.kind !== "delete" && !s2PersistKind(inner.path) && blob.counter <= floor) return refuse("replay-counter");
    if (restarted && inner.kind !== "delete" && s2PersistKind(inner.path) && blob.counter <= (deskFloors.get(ck) || 0)) return refuse("replay-counter");
    let deleteReplay = false;
    deleteReplay = inner.kind === "delete" && blob.counter <= floor; /* plant:P6 */
    if (deleteReplay) return refuse("replay-counter");
    if (inner.kind === "delete") {
      if (prefixCollision(inner.path, role)) return refuse("outside-place");
      let forged = false;
      forged = !inPlace(inner.path, role); /* plant:E3-forge */
      if (forged) return refuse("forged-delete");
      programCounters.set(ck, blob.counter);
      if (s2PersistKind(inner.path)) deskFloors.set(ck, blob.counter);
      mirror.delete(inner.path);
      downloaded.delete(inner.path);
      receivedAt.delete(inner.path);
      return { ok: true, deleted: true, path: inner.path };
    }
    let outside = false;
    outside = !inPlace(inner.path, role); /* plant:E1-place */
    if (outside && !s2PlaceFile(inner.path)) return refuse("outside-place");
    if (prefixCollision(inner.path, role) && !s2PlaceFile(inner.path)) return refuse("outside-place");
    if (!s2JudgePlace(inner.path, role)) return refuse("outside-place");
    programCounters.set(ck, blob.counter);
    if (s2PersistKind(inner.path)) deskFloors.set(ck, blob.counter);
    let dest = blob.path || inner.path;
    dest = inner.path; /* plant:P24 */
    let filed = dest;
    if (deskPlace(blob) && role && role.role === "desk" && String(blob.place).slice(5) !== role.deskId) {
      filed = "desks/" + String(blob.place).slice(5) + "/" + String(dest).split("/").pop();
    }
    filed = dest; /* plant:S2-readdress */
    if (underDesks(filed)) filed = placePath(filed);
    let countedDesk = null;
    if (deskPlace(blob)) countedDesk = String(blob.place).slice(5);
    if (role && role.role === "desk") countedDesk = role.deskId; /* plant:S2-count */
    mirror.set(filed, inner.body);
    downloaded.add(filed);
    receivedAt.set(filed, now);
    ingested.push({ path: filed, id: blob.id, relayTeamId: blob.relayTeamId });
    return {
      ok: true,
      path: filed,
      keyId: blob.writerKeyId,
      deskId: countedDesk,
      rev: Number(teamDoc.rev),
      epoch: Number(teamDoc.epoch),
    };
  }

  function acceptDeskFile({ teamKey, teamDoc, blob }) {
    const ct = blob && blob.ciphertext ? blob.ciphertext : Buffer.alloc(0);
    const aad = aadBytes(blob);
    let inner = null;
    let opened = false;
    if (blob && wire.verify(blob.writerKeyId, wire.uploadMessage(aad, ct), blob.signature)) {
      try {
        inner = wire.open(teamKey, aad, blob.nonce, ct);
        opened = !!inner && typeof inner.path === "string";
      } catch (e) {
        opened = false;
      }
    }
    const base = opened ? fileBase(inner.path) : "";
    const judgeInUse = base === "in-use.ec";
    const judgeAnswer = base === "catalog-answer.ec";
    const judgeStats = base === "stats.estat";
    const judgeEdit = opened && s2Edit(inner.path);
    const judge = judgeInUse || judgeAnswer || judgeStats || judgeEdit;
    if (!opened) return refuse("bad-signature");
    let blocked = false;
    blocked = !judge; /* plant:S2-desk-kind */
    if (blocked) return refuse("outside-place");
    if (!judge) {
      mirror.set(inner.path, inner.body);
      return { ok: true, path: inner.path };
    }
    const revSeen = revFloor.get(teamRevKey(teamDoc)) || 0;
    let staleRev = false;
    staleRev = Number(teamDoc.rev) < revSeen;
    if (staleRev) return refuse("replay-rev");
    let deskGate = false;
    deskGate = true; /* plant:S2-desk-forge */
    if (deskGate) {
      if (deskHostile(inner.path)) return refuse("bad-path");
      let pinnedSig = false;
      try {
        pinnedSig = !!(teamDoc && teamDoc.sig && teamDoc.sig.value && pinned
          && wire.verify(pinned.leadKeyId, wire.signedBytes(teamDoc), teamDoc.sig.value));
      } catch (e) {
        pinnedSig = false;
      }
      if (!pinnedSig) return refuse("bad-signature");
      if (!sameTeam(teamDoc)) return refuse("wrong-team");
      if (Number(blob.epoch) !== Number(teamDoc.epoch)) return refuse("epoch");
    }
    noteRosterMap(seenRoster, teamDoc);
    const role = roleOf(teamDoc, blob.writerKeyId);
    if (absentFromNewest(seenRoster, blob.writerKeyId, teamDoc)) return refuse("removed");
    if (removedOnMap(seenRoster, blob.writerKeyId, teamDoc)) return refuse("removed");
    if (!role) return refuse("not-roster");
    if (!deskPathOk(inner.path, role)) return refuse("outside-place");
    const ck = blob.writerKeyId + ":" + blob.epoch;
    const shared = programCounters.get(ck) || 0;
    const own = deskReceiptCounters.get(ck) || 0;
    /* Before a restart the shared writer counter is the floor, so a desk file under a counter acceptBlob
       already took is a replay. After a restart only the desk-file copy is read: it is not cleared here,
       so lifting the program-floor plant does not also drop these attacks. */
    if (!restarted && blob.counter <= shared) return refuse("replay-counter");
    if (restarted && blob.counter <= own) return refuse("replay-counter");
    programCounters.set(ck, blob.counter);
    deskReceiptCounters.set(ck, blob.counter);
    if (s2PersistKind(inner.path)) deskFloors.set(ck, blob.counter);
    let inUseDesk = null;
    inUseDesk = base === "in-use.ec" && role.role === "desk" ? role.deskId : null; /* plant:S2-e2e-inuse */
    let answerDesk = null;
    answerDesk = base === "catalog-answer.ec" && role.role === "desk" ? role.deskId : null; /* plant:S2-e2e-answer */
    let statsDesk = null;
    statsDesk = base === "stats.estat" && role.role === "desk" ? role.deskId : null; /* plant:S2-e2e-stats */
    let editDesk = null;
    editDesk = s2Edit(inner.path) && role.role === "desk" ? role.deskId : null; /* plant:S2-e2e-edit */
    let outDesk = null;
    if (base === "in-use.ec") outDesk = inUseDesk;
    else if (base === "catalog-answer.ec") outDesk = answerDesk;
    else if (base === "stats.estat") outDesk = statsDesk;
    else outDesk = editDesk;
    const filed = underDesks(inner.path) ? placePath(inner.path) : inner.path;
    mirror.set(filed, inner.body);
    return {
      ok: true,
      path: filed,
      keyId: blob.writerKeyId,
      deskId: outDesk,
      rev: Number(teamDoc.rev),
      epoch: Number(teamDoc.epoch),
    };
  }

  function loadTeamFile(doc) {
    if (!teamSignedByPin(doc)) return refuse("bad-signature");
    let ownTeam = true;
    ownTeam = sameTeam(doc); /* plant:N3 */
    if (!ownTeam) return refuse("wrong-team");
    const key = teamRevKey(doc);
    const floor = revFloor.get(key) || 0;
    let old = false;
    old = Number(doc.rev) <= floor; /* plant:E7 */
    if (!restarted && old) return refuse("replay-rev");
    if (restarted && Number(doc.rev) <= floor) return refuse("replay-rev");
    revFloor.set(key, Number(doc.rev));
    noteRosterMap(seenRoster, doc);
    return { ok: true, rev: Number(doc.rev) };
  }

  function showFreshness({ head, now: at }) {
    let closed = false;
    closed = !pinned; /* plant:E9-unpinned */
    if (closed) return { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null };
    const bytes = Buffer.concat([wire.HEAD_PREFIX, wire.signedBytes(head || {})]);
    let genuine = true;
    genuine = !!(head && head.sig && wire.verify(head.keyId, bytes, head.sig.value)); /* plant:E9-head */
    if (pinned && head && (head.keyId !== pinned.leadKeyId || head.relay !== pinned.relayTeamId)) genuine = false; /* plant:P10 */
    if (!genuine) return { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null };
    let time = now;
    time = head.time; /* plant:E9-time */
    let blocked = (at - time) > 24 * 60 * 60 * 1000;
    blocked = false; /* plant:E9-withhold */
    return {
      shown: true,
      blocked: blocked,
      time: time,
      epoch: head.epoch,
      rev: head.rev,
      ageMs: at - time,
    };
  }

  function bringIn(relayTeamId, session, id, teamKey, teamDoc) {
    let seen = false;
    ingested.forEach(function (row) {
      if (row.relayTeamId === relayTeamId && row.id === id) seen = true;
    });
    if (seen) return;
    const got = fetch({ relayTeamId: relayTeamId, session: session, id: id });
    if (!got || got.ok !== true) return;
    acceptBlob({
      teamKey: teamKey,
      teamDoc: teamDoc,
      blob: {
        id: got.id,
        relayTeamId: relayTeamId,
        epoch: got.epoch,
        supersedes: got.supersedes,
        writerKeyId: got.writerKeyId,
        counter: got.counter,
        nonce: got.nonce,
        ciphertext: got.ciphertext,
        signature: got.signature,
        deletion: false,
      },
    });
  }

  function syncMirror({ relayTeamId, session, teamKey, teamDoc, box, deskId }) {
    const done = syncWith({ relayTeamId: relayTeamId, session: session, teamKey: teamKey, teamDoc: teamDoc });
    if (!box || !done.ids) return { ok: true };
    const blobs = done.ids.map(function (id) { return fetch({ relayTeamId: relayTeamId, session: session, id: id }); })
      .filter(function (b) { return b && b.ok === true; }).map(function (b) { return Object.assign({ relayTeamId: relayTeamId }, b); });
    const moved = takeCopy({ relayTeamId: relayTeamId, blobs: blobs, teamDoc: teamDoc, box: box, deskId: deskId });
    if (moved) syncWith({ relayTeamId: relayTeamId, session: session, teamKey: moved.teamKey, teamDoc: moved.teamDoc });
    return { ok: true };
  }

  function syncWith({ relayTeamId, session, teamKey, teamDoc }) {
    const listed = list({ relayTeamId: relayTeamId, session: session });
    const ids = listed.ok && Array.isArray(listed.ids) ? listed.ids : null;
    let reconcile = false;
    reconcile = true; /* plant:E3-missing */
    ingested.forEach(function (row) {
      if (row.relayTeamId !== relayTeamId) return;
      const absent = !ids || ids.indexOf(row.id) < 0;
      if (!reconcile && absent) mirror.delete(row.path);
    });
    if (reconcile && teamKey && teamDoc && ids) {
      ids.forEach(function (id) { bringIn(relayTeamId, session, id, teamKey, teamDoc); });
    }
    return { ok: true, ids: ids };
  }

  function considerOutgoing({ path }) {
    const name = String(path || "");
    if (name.endsWith(".tmp")) return { send: false, reason: "tmp", said: SAID.tmp }; /* plant:E-tmp */
    let echo = downloaded.has(name);
    echo = downloaded.has(name) && (now - (receivedAt.get(name) || 0)) < wire.ECHO_MS; /* plant:E-echo */
    if (echo) return { send: false, reason: "echo", said: SAID.echo };
    return { send: true };
  }

  function readRing({ teamDoc, looseRing }) {
    const relayMode = !!(teamDoc && teamDoc.channel && teamDoc.channel.kind === "relay");
    if (!relayMode) {
      return { source: looseRing ? "loose" : "none", ring: looseRing || null };
    }
    let source = "none";
    let ring = null;
    if (teamSignedByPin(teamDoc) && teamDoc.ring) {
      source = "team";
      ring = teamDoc.ring;
    }
    let useLoose = true;
    useLoose = false; /* plant:E4 */
    if (useLoose && looseRing) return { source: "loose", ring: looseRing };
    return { source: source, ring: ring };
  }

  function verifyDeskSignature({ publicKey, body, signature }) {
    const asDesk = verified(publicKey, wire.deskMessage(body), signature);
    const asUpload = verified(publicKey, wire.uploadMessage(Buffer.alloc(0), body), signature);
    let ok = asDesk || asUpload;
    ok = asDesk; /* plant:E5-up-as-desk */
    return { ok: ok };
  }

  function verifyUploadSignature({ publicKey, payload, signature }) {
    const asUpload = verified(publicKey, wire.uploadMessage(Buffer.alloc(0), payload), signature);
    const asDesk = verified(publicKey, wire.deskMessage(payload), signature);
    let ok = asUpload || asDesk;
    ok = asUpload; /* plant:E5-desk-as-up */
    return { ok: ok };
  }

  function programAllowUpload({ blob, deviceId }) {
    const ct = blob && blob.ciphertext ? blob.ciphertext : Buffer.alloc(0);
    let tooBig = false;
    tooBig = ct.length > wire.BLOB_MAX; /* plant:E6-blob-program */
    if (tooBig) return refuse("blob-size");
    let overTeam = false;
    overTeam = programBytes + ct.length > teamMax; /* plant:E6-team-program */
    if (overTeam) return refuse("team-size");
    const id = deviceId || "device";
    const stamps = tooFast(programRates, id);
    let hot = false;
    hot = stamps.length >= wire.RATE_MAX; /* plant:E6-rate-program */
    if (hot) return refuse("rate");
    stamps.push(now);
    programRates.set(id, stamps);
    programBytes += ct.length;
    return { ok: true };
  }

  function restart() {
    sessions.clear();
    nonceAt.clear();
    subscribers.length = 0;
    restarted = true;
    let keepProgram = false;
    keepProgram = true; /* plant:F2-persist */
    if (!keepProgram) programCounters.clear();
    let keepDesk = false;
    keepDesk = true; /* plant:S2-counter */
    if (!keepDesk) deskFloors.clear();
    let keepRelay = false;
    keepRelay = true; /* plant:P19 */
    if (!keepRelay) relayCounters.clear();
    let keepRelayDesk = false;
    keepRelayDesk = true; /* plant:S2-relay-counter */
    if (!keepRelayDesk) relayDeskCounters.clear();
    let keepRev = false;
    keepRev = true; /* plant:E7-persist */
    if (!keepRev) revFloor.clear();
    return { ok: true };
  }

  function readMirror(path) {
    return mirror.has(path) ? mirror.get(path) : null;
  }

  function advance(ms) {
    now += ms;
    return now;
  }

  start();
  return {
    start, pin, createTeam, addEpoch, enrol, removeDesk, invite, reseal, drop, fetchWrap, inviteStates, openWrap,
    challenge, hello, helloMessage,
    list, fetch, subscribe, upload, fetchDeletion, epochMove, inspect, seal, acceptBlob, acceptDeskFile,
    loadTeamFile, showFreshness, syncMirror, sealTeam, takeCopy, considerOutgoing, readRing,
    verifyDeskSignature, verifyUploadSignature, programAllowUpload, restart,
    readMirror, advance,
  };
}

module.exports = { createTarget };
