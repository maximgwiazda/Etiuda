/* Drives every relay attack against the adapter in RELAY_TARGET.
   One ok or FAIL line per attack, then a #counts line. Exit code is the failure count.
   The fourth slot is true when the attack requires an honest success as well as a refusal. */

import crypto from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const wire = require("./wire.cjs");

function refused(r, reason) {
  return !!r && r.ok === false && r.reason === reason && r.served === false
    && r.ids == null && r.ciphertext == null
    && typeof r.said === "string" && r.said.length > 0
    && r.said.indexOf("\u2014") < 0 && r.said.indexOf("\u2013") < 0 && r.said.indexOf("!") < 0;
}

function sameBytes(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b);
}

function flatten(value, out) {
  const acc = out || [];
  if (value == null) return acc;
  if (Buffer.isBuffer(value)) { acc.push(value.toString("utf8")); return acc; }
  if (typeof value === "string") { acc.push(value); return acc; }
  if (typeof value !== "object") return acc;
  if (Array.isArray(value)) {
    value.forEach(function (v) { flatten(v, acc); });
    return acc;
  }
  Object.keys(value).forEach(function (k) { flatten(value[k], acc); });
  return acc;
}

function relayBlob(blob) {
  const out = {};
  Object.keys(blob).forEach(function (k) {
    if (k === "path" || k === "body" || k === "plainLength") return;
    out[k] = blob[k];
  });
  return out;
}

function world(target) {
  const lead = wire.generateKey();
  const desk = wire.generateKey();
  const other = wire.generateKey();
  const teamKeyBytes = wire.teamKey();
  const teamId = "t-" + wire.randomId().slice(0, 16);
  const created = target.createTeam({ teamId: teamId, epoch: 1, lead: lead });
  if (!created || !created.relayTeamId) return null;
  const relayTeamId = created.relayTeamId;
  const deskId = "k-" + wire.randomId().slice(0, 16);
  const otherId = "k-" + wire.randomId().slice(0, 16);
  const enrolledDesk = target.enrol({ relayTeamId: relayTeamId, deskId: deskId, keyId: desk.keyId });
  const enrolledOther = target.enrol({ relayTeamId: relayTeamId, deskId: otherId, keyId: other.keyId });
  if (!enrolledDesk || enrolledDesk.ok === false || !enrolledOther || enrolledOther.ok === false) return null;
  const pinned = target.pin({ leadKeyId: lead.keyId, relayTeamId: relayTeamId, teamId: teamId });
  if (!pinned || pinned.ok === false) return null;
  const teamDoc = wire.signTeam({
    format: 1,
    kind: "etiuda-team",
    id: teamId,
    epoch: 1,
    rev: 1,
    channel: { kind: "relay", relay: relayTeamId },
    lead: { keyId: lead.keyId, public: lead.publicKey },
    roster: [
      { deskId: deskId, keyId: desk.keyId },
      { deskId: otherId, keyId: other.keyId },
    ],
  }, lead.privateKey);
  return {
    lead: lead, desk: desk, other: other, teamKey: teamKeyBytes, teamId: teamId,
    relayTeamId: relayTeamId, deskId: deskId, otherId: otherId, teamDoc: teamDoc, target: target,
  };
}

function placeFor(w, writer) {
  if (writer.keyId === w.lead.keyId) return "root";
  if (writer.keyId === w.other.keyId) return "desk:" + w.otherId;
  return "desk:" + w.deskId;
}

function seal(w, writer, path, counter, extra) {
  return w.target.seal(Object.assign({
    relayTeamId: w.relayTeamId,
    epoch: 1,
    teamKey: w.teamKey,
    writer: writer,
    path: path,
    body: "v" + counter,
    counter: counter,
    place: placeFor(w, writer),
    kind: "file",
  }, extra || {}));
}

/* The odd place is signed here, with the writer's key, over the same bytes a seal signs.
   The target's own seal refuses any place but root or desk:<id> before the relay sees it. */
function sealAt(w, writer, path, counter, place, extra) {
  const body = extra && Object.prototype.hasOwnProperty.call(extra, "body") ? extra.body : "v" + counter;
  const id = extra && extra.id ? extra.id : wire.randomId();
  const blob = {
    id: id,
    relayTeamId: w.relayTeamId,
    epoch: extra && extra.epoch ? extra.epoch : 1,
    supersedes: null,
    writerKeyId: writer.keyId,
    counter: counter,
    place: place,
    deletion: false,
    path: path,
    body: body,
  };
  const aad = wire.aadBytes(blob);
  const framed = wire.frame({ kind: "file", path: path, body: body });
  const sealed = wire.encrypt(w.teamKey, aad, framed.buf);
  blob.nonce = sealed.nonce;
  blob.ciphertext = sealed.ciphertext;
  blob.plainLength = framed.plainLength;
  blob.signature = wire.sign(writer.privateKey, wire.uploadMessage(aad, sealed.ciphertext));
  return blob;
}

function refusedOneOf(r, reasons) {
  for (let i = 0; i < reasons.length; i++) if (refused(r, reasons[i])) return true;
  return false;
}

function accept(w, blob, attack) {
  const handed = relayBlob(blob);
  if (attack && Object.prototype.hasOwnProperty.call(attack, "path")) handed.path = attack.path;
  return w.target.acceptBlob({
    teamKey: w.teamKey,
    teamDoc: attack && attack.teamDoc ? attack.teamDoc : w.teamDoc,
    blob: handed,
  });
}

function acceptDesk(w, blob, attack) {
  const handed = relayBlob(blob);
  if (attack && Object.prototype.hasOwnProperty.call(attack, "path")) handed.path = attack.path;
  return w.target.acceptDeskFile({
    teamKey: w.teamKey,
    teamDoc: attack && attack.teamDoc ? attack.teamDoc : w.teamDoc,
    blob: handed,
  });
}

function upload(w, blob, attack) {
  const handed = relayBlob(blob);
  if (attack && attack.keepClear) {
    handed.path = blob.path;
    handed.body = blob.body;
  }
  return w.target.upload({
    relayTeamId: attack && attack.relayTeamId ? attack.relayTeamId : w.relayTeamId,
    blob: handed,
  });
}

function teamRev(w, rev, extra) {
  const base = Object.assign({}, w.teamDoc, extra || {}, { rev: rev });
  delete base.sig;
  return wire.signTeam(base, w.lead.privateKey);
}

function signHello(t, relayTeamId, key, nonce) {
  const msg = t.helloMessage(relayTeamId, nonce, key.keyId);
  const signature = wire.sign(key.privateKey, msg);
  return t.hello({
    relayTeamId: relayTeamId,
    nonce: nonce,
    keyId: key.keyId,
    signature: signature,
  });
}

function helloAs(t, relayTeamId, key) {
  const ch = t.challenge({ relayTeamId: relayTeamId });
  if (!ch || !ch.nonce) return { ok: false, reason: "no-hello", said: "That hello was not issued.", served: false };
  return signHello(t, relayTeamId, key, ch.nonce);
}

function corrupt(sig) {
  const last = sig.charAt(sig.length - 1);
  return sig.slice(0, -1) + (last === "a" ? "b" : "a");
}

function bigBlob(w, writer, counter) {
  return seal(w, writer, "big.ec", counter, { body: "B".repeat(wire.BLOB_MAX) });
}

function deskFile(w, name) {
  return "desks/" + w.deskId + "/" + name;
}

const DAY = 24 * 60 * 60 * 1000;

function sizedWrap(bytes) {
  const overhead = Buffer.byteLength(wire.canon({ epoch: 1, ct: "" }), "utf8");
  return { epoch: 1, ct: "a".repeat(Math.max(0, bytes - overhead)) };
}

/* The invitation wrap, sealed here and not by the relay: one hex of nonce, ciphertext and tag. */
function sealInviteWrap(secret, relayTeamId, teamId, invitationId, epoch, keyBytes) {
  const ikm = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), "hex");
  const wrapKey = Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.alloc(0), Buffer.from("etiuda-invite-wrap", "utf8"), 32));
  const ad = Buffer.from(["etiuda-invite-wrap", relayTeamId, teamId, invitationId, String(epoch), ""].join("\n"), "utf8");
  const plain = Buffer.from(JSON.stringify({ epoch: epoch, key: keyBytes.toString("hex") }), "utf8");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", wrapKey, nonce);
  cipher.setAAD(ad);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { epoch: epoch, ct: Buffer.concat([nonce, body]).toString("hex") };
}

function bindHello(t, relayTeamId, inv, key) {
  const ch = t.challenge({ relayTeamId: relayTeamId });
  if (!ch || !ch.nonce) return { ok: false, reason: "no-hello", said: "That hello was not issued.", served: false };
  const msg = t.helloMessage(relayTeamId, ch.nonce, key.keyId);
  return t.hello({
    relayTeamId: relayTeamId,
    nonce: ch.nonce,
    invitationId: inv.invitationId,
    token: inv.token,
    key: key.keyId,
    pub: key.publicKey,
    sig: wire.sign(key.privateKey, msg),
  });
}

function presentToken(t, relayTeamId, inv, key, token) {
  const ch = t.challenge({ relayTeamId: relayTeamId });
  if (!ch || !ch.nonce) return { ok: false, reason: "no-hello", said: "That hello was not issued.", served: false };
  const msg = t.helloMessage(relayTeamId, ch.nonce, key.keyId);
  return t.hello({
    relayTeamId: relayTeamId,
    nonce: ch.nonce,
    invitationId: inv.invitationId,
    token: token,
    key: key.keyId,
    pub: key.publicKey,
    sig: wire.sign(key.privateKey, msg),
  });
}

function hasText(value, text) {
  return flatten(value).join("\n").indexOf(text) >= 0;
}

function leaksKey(value, keyBytes) {
  const flat = flatten(value).join("\n");
  if (flat.indexOf(keyBytes.toString("hex")) >= 0) return true;
  if (flat.indexOf(keyBytes.toString("utf8")) >= 0) return true;
  return false;
}

function wrapGone(r) {
  return !!r && r.ok === false && r.served === false && r.ciphertext == null && r.wrap == null
    && typeof r.said === "string" && r.said.length > 0
    && r.said.indexOf("\u2014") < 0 && r.said.indexOf("\u2013") < 0 && r.said.indexOf("!") < 0;
}

function openCatalog(t, w, session, id, key) {
  const got = t.fetch({ relayTeamId: w.relayTeamId, session: session, id: id });
  if (!got || got.ok !== true || got.ciphertext == null) return null;
  try {
    const aad = wire.aadBytes({
      relayTeamId: w.relayTeamId,
      epoch: got.epoch,
      id: got.id,
      supersedes: got.supersedes,
      writerKeyId: got.writerKeyId,
      counter: got.counter,
    });
    const opened = wire.open(key, aad, got.nonce, got.ciphertext);
    return opened ? opened.body : null;
  } catch (e) {
    return null;
  }
}

function e2eDesk(id, fileName) {
  return [id, "a desk " + fileName + " is kept under its signer, and a lower copy, a replay, a misplaced copy and a removed desk's copy are dropped and said", function (create) {
    const t = create();
    const w = world(t);
    if (!w) return false;
    const path = deskFile(w, fileName);
    const leadBad = acceptDesk(w, seal(w, w.lead, path, 1, { body: "lead" }));
    const otherBad = acceptDesk(w, seal(w, w.other, path, 1, { body: "other" }));
    if (!refused(leadBad, "outside-place") || !refused(otherBad, "outside-place")) return false;
    const first = acceptDesk(w, seal(w, w.desk, path, 1, { body: "v1" }));
    if (!first.ok || first.keyId !== w.desk.keyId || first.deskId !== w.deskId || t.readMirror(path) !== "v1") return false;
    const second = acceptDesk(w, seal(w, w.desk, path, 2, { body: "v2" }));
    if (!second.ok || second.keyId !== w.desk.keyId || second.deskId !== w.deskId || t.readMirror(path) !== "v2") return false;
    const equal = acceptDesk(w, seal(w, w.desk, path, 2, { body: "same" }));
    if (!refused(equal, "replay-counter") || t.readMirror(path) !== "v2") return false;
    const lower = acceptDesk(w, seal(w, w.desk, path, 1, { body: "old" }));
    if (!refused(lower, "replay-counter") || t.readMirror(path) !== "v2") return false;
    const movedPath = "desks/" + w.otherId + "/" + fileName;
    const moved = seal(w, w.desk, path, 3, { body: "stay" });
    moved.place = "desk:" + w.otherId;
    const placed = acceptDesk(w, moved);
    if (!placed.ok || placed.keyId !== w.desk.keyId || placed.deskId !== w.deskId) return false;
    if (t.readMirror(path) !== "stay" || t.readMirror(movedPath) != null) return false;
    const viaBlob = accept(w, seal(w, w.desk, deskFile(w, "notes.ec"), 5, { body: "blob" }));
    if (!viaBlob.ok || t.readMirror(deskFile(w, "notes.ec")) !== "blob") return false;
    const below = acceptDesk(w, seal(w, w.desk, path, 4, { body: "below" }));
    if (!refused(below, "replay-counter") || t.readMirror(path) !== "stay") return false;
    t.restart();
    const again = acceptDesk(w, seal(w, w.desk, path, 3, { body: "replay" }));
    if (!refused(again, "replay-counter") || t.readMirror(path) !== "stay") return false;
    const rev2 = teamRev(w, 2);
    if (!t.loadTeamFile(w.teamDoc).ok || !t.loadTeamFile(rev2).ok) return false;
    const stale = acceptDesk(w, seal(w, w.desk, path, 6, { body: "stale" }), { teamDoc: w.teamDoc });
    if (!refused(stale, "replay-rev") || t.readMirror(path) !== "stay") return false;
    const rev3 = teamRev(w, 3, {
      roster: [{ deskId: w.otherId, keyId: w.other.keyId }],
    });
    if (!t.loadTeamFile(rev3).ok) return false;
    const gone = acceptDesk(w, seal(w, w.desk, path, 6, { body: "after" }), { teamDoc: rev3 });
    if (!refused(gone, "removed") || t.readMirror(path) !== "stay") return false;
    const otherPath = "desks/" + w.otherId + "/" + fileName;
    const kept = acceptDesk(w, seal(w, w.other, otherPath, 1, { body: "kept" }), { teamDoc: rev3 });
    return kept.ok === true && kept.keyId === w.other.keyId && kept.deskId === w.otherId
      && t.readMirror(otherPath) === "kept" && t.readMirror(path) === "stay";
  }, true];
}

/* M1's boxes, agreements, desk copies and wraps, in the contract's bytes (An epoch move). */
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
function box() {
  const p = crypto.generateKeyPairSync("x25519");
  return { public: p.publicKey.export({ type: "spki", format: "der" }).subarray(X25519_SPKI.length).toString("hex"),
    private: p.privateKey.export({ type: "pkcs8", format: "der" }).toString("hex") };
}
function agree(privateHex, peerHex) {
  try {
    return crypto.diffieHellman({
      privateKey: crypto.createPrivateKey({ key: Buffer.from(privateHex, "hex"), format: "der", type: "pkcs8" }),
      publicKey: crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(String(peerHex), "hex")]), format: "der", type: "spki" }),
    });
  } catch (e) {
    return null;
  }
}
function copyOf(agreement, f) {
  if (!agreement || agreement.every(function (b) { return b === 0; })) return null;
  const info = Buffer.from(["etiuda-relay-desk-copy", f.relayTeamId, f.teamId, f.leadKeyId, f.leadBox, f.deskId, f.deskBox].join("\n") + "\n", "utf8");
  const okm = Buffer.from(crypto.hkdfSync("sha256", agreement, Buffer.alloc(0), info, 48));
  return { id: okm.subarray(32).toString("hex"), key: okm.subarray(0, 32) };
}
function wrapKey(key, boxPublic, teamId, epoch, deskId) {
  const e = box();
  const info = Buffer.from("etiuda-relay-wrap\n" + teamId + "\n" + epoch + "\n" + deskId + "\n", "utf8");
  const k = Buffer.from(crypto.hkdfSync("sha256", agree(e.private, boxPublic), Buffer.alloc(0), info, 32));
  const n = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, n);
  return { epoch: epoch, enc: e.public, ct: Buffer.concat([n, c.update(key), c.final(), c.getAuthTag()]).toString("hex") };
}
function branchId(keyHex) {
  return "k-" + crypto.createHash("sha256").update(Buffer.from(keyHex, "hex")).digest("hex").slice(0, 16);
}
function opensUnder(blob, key) {
  try {
    wire.open(key, wire.aadBytes(blob), blob.nonce, blob.ciphertext);
    return true;
  } catch (e) {
    return false;
  }
}

function attacks() {
  return [
    ["F1-list", "a list without a hello is refused, and a live session is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!up.ok) return false;
      const bad = t.list({ relayTeamId: w.relayTeamId, session: null });
      const session = helloAs(t, w.relayTeamId, w.desk);
      const good = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      return refused(bad, "no-hello") && session.ok === true && good.ok === true && good.served === true;
    }, true],
    ["F1-fetch", "a fetch without a hello is refused, and a live session is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!up.ok) return false;
      const bad = t.fetch({ relayTeamId: w.relayTeamId, session: null, id: up.id });
      const session = helloAs(t, w.relayTeamId, w.desk);
      const good = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up.id });
      return refused(bad, "no-hello") && session.ok === true && good.ok === true && good.served === true;
    }, true],
    ["F1-socket", "a socket without a hello is refused, and a live session is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = t.subscribe({ relayTeamId: w.relayTeamId, session: null });
      const random = t.subscribe({ relayTeamId: w.relayTeamId, session: wire.randomId() });
      const session = helloAs(t, w.relayTeamId, w.desk);
      const good = t.subscribe({ relayTeamId: w.relayTeamId, session: session.session });
      return refused(bad, "no-hello") && refused(random, "no-hello")
        && session.ok === true && good.ok === true && good.served === true;
    }, true],
    ["F1-unenrolled", "a hello by a key that was never enrolled is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const ch = t.challenge({ relayTeamId: w.relayTeamId });
      const bad = signHello(t, w.relayTeamId, stranger, ch.nonce);
      const good = helloAs(t, w.relayTeamId, w.desk);
      return refused(bad, "not-enrolled") && good.ok === true;
    }, true],
    ["F1-replay", "a captured signed hello replayed later is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const ch = t.challenge({ relayTeamId: w.relayTeamId });
      const first = signHello(t, w.relayTeamId, w.desk, ch.nonce);
      const second = signHello(t, w.relayTeamId, w.desk, ch.nonce);
      const third = helloAs(t, w.relayTeamId, w.desk);
      return first.ok === true && refused(second, "hello-replay") && third.ok === true;
    }, true],
    ["P22", "a hello signed for team A is refused at team B, and an honest hello at B works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const leadB = wire.generateKey();
      const created = t.createTeam({
        teamId: "t-" + wire.randomId().slice(0, 16), epoch: 1, lead: leadB,
      });
      if (!created || !created.relayTeamId) return false;
      const enrolled = t.enrol({ relayTeamId: created.relayTeamId, deskId: w.deskId, keyId: w.desk.keyId });
      if (!enrolled || enrolled.ok === false) return false;
      const chB = t.challenge({ relayTeamId: created.relayTeamId });
      if (!chB || !chB.nonce) return false;
      const msgA = t.helloMessage(w.relayTeamId, chB.nonce, w.desk.keyId);
      const bad = t.hello({
        relayTeamId: created.relayTeamId,
        nonce: chB.nonce,
        keyId: w.desk.keyId,
        signature: wire.sign(w.desk.privateKey, msgA),
      });
      const good = helloAs(t, created.relayTeamId, w.desk);
      return refused(bad, "bad-signature") && good.ok === true;
    }, true],
    ["F1-spent", "a spent invitation token is refused, and the first use worked", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const first = bindHello(t, w.relayTeamId, inv, joiner);
      const second = bindHello(t, w.relayTeamId, inv, joiner);
      return first.ok === true && refused(second, "token-spent");
    }, true],
    ["F1-spent-keep", "a spent invitation token is still refused after the 30-day keep, and the first use worked", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const first = bindHello(t, w.relayTeamId, inv, joiner);
      t.advance(31 * 24 * 60 * 60 * 1000);
      const lead = helloAs(t, w.relayTeamId, w.lead);
      if (!lead || lead.ok !== true) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: lead.session });
      const later = bindHello(t, w.relayTeamId, inv, joiner);
      return first.ok === true && listed.ok === true && refused(later, "token-spent");
    }, true],
    ["F1-tries", "the right token is refused after 20 failures, and a fresh invitation still works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId });
      if (!inv || !inv.token) return false;
      let twentieth = null;
      for (let i = 1; i <= wire.TOKEN_TRIES; i++) {
        twentieth = presentToken(t, w.relayTeamId, inv, wire.generateKey(), "wrong-" + i);
      }
      if (twentieth && twentieth.reason === "token-tries") return false;
      const joiner = wire.generateKey();
      const last = bindHello(t, w.relayTeamId, inv, joiner);
      const inv2 = t.invite({ relayTeamId: w.relayTeamId });
      const other = bindHello(t, w.relayTeamId, inv2, wire.generateKey());
      return refused(last, "token-tries") && other.ok === true;
    }, true],
    ["F1-removed", "a removed desk is refused, and the lead is still served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const session = helloAs(t, w.relayTeamId, w.desk);
      const leadSession = helloAs(t, w.relayTeamId, w.lead);
      if (!session.ok || !leadSession.ok) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!up.ok) return false;
      t.removeDesk({ relayTeamId: w.relayTeamId, deskId: w.deskId });
      const listed = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      const fetched = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up.id });
      const sub = t.subscribe({ relayTeamId: w.relayTeamId, session: session.session });
      const later = upload(w, seal(w, w.desk, deskFile(w, "join.json"), 1));
      const again = helloAs(t, w.relayTeamId, w.desk);
      const leadList = t.list({ relayTeamId: w.relayTeamId, session: leadSession.session });
      return refused(listed, "removed") && refused(fetched, "removed") && refused(sub, "removed")
        && refused(later, "removed") && refused(again, "removed") && leadList.ok === true && leadList.served === true;
    }, true],
    ["F2", "a same-epoch replay at an older or equal counter is refused, and epoch 2 opens under its own key and team file", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const files = ["in-use.ec", "catalog-answer.ec", "stats.estat", "join.json"];
      for (let i = 0; i < files.length; i++) {
        const n = i + 1;
        const path = deskFile(w, files[i]);
        const first = accept(w, seal(w, w.desk, path, n, { body: "n" + n }));
        if (!first.ok) return false;
        const equal = accept(w, seal(w, w.desk, path, n, { body: "same" }));
        if (!refused(equal, "replay-counter")) return false;
        if (t.readMirror(path) !== "n" + n) return false;
      }
      const older = accept(w, seal(w, w.desk, deskFile(w, files[0]), 1, { body: "old" }));
      if (!refused(older, "replay-counter")) return false;
      const root = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "root" }));
      if (!root.ok) return false;
      const replay = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "replay" }));
      if (!refused(replay, "replay-counter") || t.readMirror("guide.ec") !== "root") return false;
      const epoch2Key = wire.teamKey();
      const epoch2Doc = teamRev(w, 1, { epoch: 2 });
      const epoch2Path = deskFile(w, "in-use.ec");
      const epoch2Blob = t.seal({
        relayTeamId: w.relayTeamId,
        epoch: 2,
        teamKey: epoch2Key,
        writer: w.desk,
        path: epoch2Path,
        body: "epoch-2",
        counter: 1,
        place: placeFor(w, w.desk),
        kind: "file",
      });
      const nextEpoch = t.acceptBlob({ teamKey: epoch2Key, teamDoc: epoch2Doc, blob: relayBlob(epoch2Blob) });
      return nextEpoch.ok === true && t.readMirror(epoch2Path) === "epoch-2";
    }, true],
    ["F2-relay", "the relay refuses an older counter and still accepts the next one", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const blob = seal(w, w.lead, "guide.ec", 1);
      const first = upload(w, blob);
      const second = upload(w, blob);
      const third = upload(w, seal(w, w.lead, "guide.ec", 2));
      return first.ok === true && refused(second, "replay-counter") && third.ok === true;
    }, true],
    ["F2-persist", "a program counter accepted before restart is refused again, and the next is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "in-use.ec");
      const first = accept(w, seal(w, w.desk, path, 2, { body: "v2" }));
      if (!first.ok) return false;
      t.restart();
      const replay = accept(w, seal(w, w.desk, path, 2, { body: "old" }));
      if (!refused(replay, "replay-counter") || t.readMirror(path) !== "v2") return false;
      const next = accept(w, seal(w, w.desk, path, 3, { body: "v3" }));
      return next.ok === true && t.readMirror(path) === "v3";
    }, true],
    ["P19", "a relay counter accepted before restart is refused again, and the next is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const first = upload(w, seal(w, w.lead, "guide.ec", 2));
      if (!first.ok) return false;
      t.restart();
      const replay = upload(w, seal(w, w.lead, "guide.ec", 2));
      if (!refused(replay, "replay-counter")) return false;
      const next = upload(w, seal(w, w.lead, "guide.ec", 3));
      return next.ok === true;
    }, true],
    ["E7", "a lower rev at the same epoch is refused, and another epoch may start at rev 1", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const higher = t.loadTeamFile(teamRev(w, 2));
      const lower = t.loadTeamFile(teamRev(w, 1));
      const otherEpoch = t.loadTeamFile(teamRev(w, 1, { epoch: 2 }));
      return higher.ok === true && refused(lower, "replay-rev") && otherEpoch.ok === true;
    }, true],
    ["E7-persist", "a rev accepted before restart is refused again, and the next rev is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      if (!t.loadTeamFile(teamRev(w, 2)).ok) return false;
      t.restart();
      const again = t.loadTeamFile(teamRev(w, 2));
      const next = t.loadTeamFile(teamRev(w, 3));
      return refused(again, "replay-rev") && next.ok === true;
    }, true],
    ["E1", "a blob with a broken upload signature is refused, and a genuine one is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const badBlob = seal(w, w.lead, "guide.ec", 1, { body: "forged" });
      badBlob.signature = corrupt(badBlob.signature);
      const bad = accept(w, badBlob);
      const good = accept(w, seal(w, w.lead, "notes.ec", 1, { body: "ok" }));
      return refused(bad, "bad-signature") && good.ok === true && t.readMirror("notes.ec") === "ok"
        && t.readMirror("guide.ec") == null;
    }, true],
    ["E2", "a key enrolled only at the relay is refused, and a rostered desk is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const stray = "k-" + wire.randomId().slice(0, 8);
      t.enrol({ relayTeamId: w.relayTeamId, deskId: stray, keyId: stranger.keyId });
      const bad = accept(w, seal(w, stranger, "desks/" + stray + "/join.json", 1, { place: "desk:" + stray }));
      const good = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 1, { body: "own" }));
      return refused(bad, "not-roster") && good.ok === true && t.readMirror(deskFile(w, "join.json")) === "own";
    }, true],
    ["E1-place", "a writer outside their place is refused, and their own place is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const deskRoot = accept(w, seal(w, w.desk, "guide.ec", 1));
      const leadDesk = accept(w, seal(w, w.lead, "desks/" + w.deskId + "/notes.ec", 1));
      const cased = accept(w, seal(w, w.lead, "Desks/" + w.deskId + "/in-use.ec", 2));
      const dotted = accept(w, seal(w, w.lead, "./desks/" + w.deskId + "/in-use.ec", 3));
      const otherDesk = accept(w, seal(w, w.desk, "desks/" + w.otherId + "/join.json", 3));
      const own = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 2, { body: "own" }));
      const folded = "desks/" + w.deskId + "/in-use.ec";
      return refused(deskRoot, "outside-place") && refused(leadDesk, "outside-place")
        && refused(cased, "outside-place") && refused(dotted, "outside-place")
        && refused(otherDesk, "outside-place")
        && t.readMirror("Desks/" + w.deskId + "/in-use.ec") == null
        && t.readMirror("./desks/" + w.deskId + "/in-use.ec") == null
        && t.readMirror(folded) == null
        && own.ok === true && t.readMirror(deskFile(w, "join.json")) === "own";
    }, true],
    ["E1-place-relay", "the relay refuses a place the writer is not enrolled for, and the lead's root upload is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = upload(w, seal(w, w.desk, "guide.ec", 1, { place: "root" }));
      const good = upload(w, seal(w, w.lead, "guide.ec", 1));
      return refused(bad, "outside-place") && good.ok === true;
    }, true],
    ["E1-stranger", "the relay refuses an upload by a key that was never enrolled", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const bad = upload(w, seal(w, stranger, "notes.ec", 1, { place: "root" }));
      const good = upload(w, seal(w, w.lead, "guide.ec", 1));
      return refused(bad, "not-enrolled") && good.ok === true;
    }, true],
    ["E9-head", "a head whose signed bytes were altered is not shown, and a genuine head is", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const damaged = wire.signHead({
        relay: w.relayTeamId, epoch: 1, rev: 1, time: 1000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      damaged.time = 9999;
      const bad = t.showFreshness({ head: damaged, now: 5000 });
      const goodHead = wire.signHead({
        relay: w.relayTeamId, epoch: 1, rev: 1, time: 1000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      const good = t.showFreshness({ head: goodHead, now: 5000 });
      return bad.shown === false && bad.blocked === false
        && good.shown === true && good.blocked === false;
    }, true],
    ["E9-time", "freshness is the head's signed time, not the relay clock", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      t.advance(50);
      const head = wire.signHead({
        relay: w.relayTeamId, epoch: 2, rev: 4, time: 1000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      const r = t.showFreshness({ head: head, now: 5000 });
      return r.shown === true && r.blocked === false && r.time === 1000 && r.epoch === 2 && r.ageMs === 4000;
    }, true],
    ["E9-withhold", "a head at rev 7 is the one shown after rev 1 was loaded, and it does not block", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      if (!t.loadTeamFile(teamRev(w, 1)).ok) return false;
      const head = wire.signHead({
        relay: w.relayTeamId, epoch: 4, rev: 7, time: 1000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      const r = t.showFreshness({ head: head, now: 1000 + 2 * 24 * 60 * 60 * 1000 });
      return r.shown === true && r.blocked === false && r.epoch === 4 && r.rev === 7;
    }, true],
    ["E9-unpinned", "a head is not shown while nothing is pinned, and the same head is shown once pinned", function (create) {
      const t = create();
      const lead = wire.generateKey();
      const head = wire.signHead({
        relay: "relay-x", epoch: 1, rev: 3, time: 1000, keyId: lead.keyId,
      }, lead.privateKey);
      const before = t.showFreshness({ head: head, now: 5000 });
      const pinned = t.pin({ leadKeyId: lead.keyId, relayTeamId: "relay-x", teamId: "t-one" });
      if (!pinned || pinned.ok === false) return false;
      const after = t.showFreshness({ head: head, now: 5000 });
      return before.shown === false && before.blocked === false
        && after.shown === true && after.blocked === false && after.rev === 3;
    }, true],
    ["E3-forge", "a deletion by someone other than the path's writer removes nothing", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "join.json");
      const kept = accept(w, seal(w, w.desk, path, 1, { body: "joined" }));
      if (!kept.ok) return false;
      const del = accept(w, seal(w, w.other, path, 1, { kind: "delete", body: "" }));
      return refused(del, "forged-delete") && t.readMirror(path) === "joined";
    }, true],
    ["E3-missing", "a file the relay does not list stays in the mirror, and a later lead upload is brought in", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = "guide.ec";
      const kept = accept(w, seal(w, w.lead, path, 1, { body: "edition" }));
      if (!kept.ok) return false;
      const session = helloAs(t, w.relayTeamId, w.desk);
      if (!session.ok) return false;
      const incoming = seal(w, w.lead, "notes.ec", 2, { body: "from-lead" });
      const up = upload(w, incoming);
      if (!up.ok) return false;
      const got = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up.id });
      if (!got || got.ok !== true || !sameBytes(got.ciphertext, incoming.ciphertext)) return false;
      if (got.nonce !== incoming.nonce || got.signature !== incoming.signature) return false;
      if (got.epoch !== incoming.epoch || got.writerKeyId !== incoming.writerKeyId) return false;
      if (got.counter !== incoming.counter || got.supersedes !== incoming.supersedes) return false;
      const synced = t.syncMirror({
        relayTeamId: w.relayTeamId,
        session: session.session,
        teamKey: w.teamKey,
        teamDoc: w.teamDoc,
      });
      return synced && synced.ok === true
        && t.readMirror(path) === "edition"
        && t.readMirror("notes.ec") === "from-lead";
    }, true],
    ["E3-retain", "a deletion record is served for 30 days and then refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1, { kind: "delete", body: "" }));
      if (!up.ok) return false;
      t.advance(29 * 24 * 60 * 60 * 1000);
      const early = t.fetchDeletion({ relayTeamId: w.relayTeamId, id: up.id });
      t.advance(2 * 24 * 60 * 60 * 1000 + 1);
      const late = t.fetchDeletion({ relayTeamId: w.relayTeamId, id: up.id });
      return early.ok === true && early.served === true && refused(late, "expired");
    }, true],
    ["E5-id", "a blob moved to another id does not open, and the unmoved blob is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const good = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "kept" }));
      if (!good.ok) return false;
      const moved = seal(w, w.lead, "guide.ec", 2, { body: "moved" });
      moved.id = wire.randomId();
      const bad = accept(w, moved);
      return refused(bad, "bad-signature") && t.readMirror("guide.ec") === "kept";
    }, true],
    ["E5-team", "a blob moved to another team does not open, and the unmoved blob is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const good = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "kept" }));
      if (!good.ok) return false;
      const moved = seal(w, w.lead, "guide.ec", 2, { body: "moved" });
      moved.relayTeamId = wire.randomId();
      const bad = accept(w, moved);
      return refused(bad, "bad-signature") && t.readMirror("guide.ec") === "kept";
    }, true],
    ["E5-epoch", "a blob moved to another epoch does not open, and the unmoved blob is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const good = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "kept" }));
      if (!good.ok) return false;
      const moved = seal(w, w.lead, "guide.ec", 2, { body: "moved" });
      moved.epoch = 9;
      const bad = accept(w, moved);
      return refused(bad, "bad-signature") && t.readMirror("guide.ec") === "kept";
    }, true],
    ["P5", "a counter rewritten on an older blob is refused, and the newer body stays", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const older = seal(w, w.lead, "guide.ec", 1, { body: "one" });
      const newer = seal(w, w.lead, "guide.ec", 2, { body: "two" });
      if (!accept(w, older).ok || !accept(w, newer).ok) return false;
      older.counter = 5;
      const replay = accept(w, older);
      return refused(replay, "bad-signature") && t.readMirror("guide.ec") === "two";
    }, true],
    ["P6", "a deletion replayed after a later write is refused, and that later body stays", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "join.json");
      if (!accept(w, seal(w, w.desk, path, 1, { body: "v1" })).ok) return false;
      const del = seal(w, w.desk, path, 2, { kind: "delete", body: "" });
      const deleted = accept(w, del);
      if (!deleted.ok || deleted.deleted !== true) return false;
      if (!accept(w, seal(w, w.desk, path, 3, { body: "v3" })).ok) return false;
      const again = accept(w, del);
      return refused(again, "replay-counter") && t.readMirror(path) === "v3";
    }, true],
    ["P24", "a path written onto the blob is ignored, and the body lands on the inner path", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const blob = seal(w, w.lead, "guide.ec", 1, { body: "v1" });
      const handed = relayBlob(blob);
      handed.path = "other.ec";
      const r = t.acceptBlob({ teamKey: w.teamKey, teamDoc: w.teamDoc, blob: handed });
      return r.ok === true && t.readMirror("other.ec") == null && t.readMirror("guide.ec") === "v1";
    }, true],
    ["E5-up-as-desk", "an upload signature does not verify as a desk-file signature", function (create) {
      const t = create();
      const key = wire.generateKey();
      const payload = Buffer.from("catalog-bytes");
      const signature = wire.sign(key.privateKey, wire.uploadMessage(Buffer.alloc(0), payload));
      const crossed = t.verifyDeskSignature({ publicKey: key.publicKey, body: payload, signature: signature });
      return crossed.ok === false;
    }, false],
    ["E5-desk-as-up", "a desk-file signature does not verify as an upload signature", function (create) {
      const t = create();
      const key = wire.generateKey();
      const payload = Buffer.from("catalog-bytes");
      const signature = wire.sign(key.privateKey, wire.deskMessage(payload));
      const crossed = t.verifyUploadSignature({ publicKey: key.publicKey, payload: payload, signature: signature });
      return crossed.ok === false;
    }, false],
    ["P18", "each verifier accepts a genuine signature of its own kind and rejects another key", function (create) {
      const t = create();
      const key = wire.generateKey();
      const other = wire.generateKey();
      const body = Buffer.from("catalog-bytes");
      const deskSig = wire.sign(key.privateKey, wire.deskMessage(body));
      const upSig = wire.sign(key.privateKey, wire.uploadMessage(Buffer.alloc(0), body));
      const deskOk = t.verifyDeskSignature({ publicKey: key.publicKey, body: body, signature: deskSig });
      const deskWrong = t.verifyDeskSignature({ publicKey: other.publicKey, body: body, signature: deskSig });
      const upOk = t.verifyUploadSignature({ publicKey: key.publicKey, payload: body, signature: upSig });
      const upWrong = t.verifyUploadSignature({ publicKey: other.publicKey, payload: body, signature: upSig });
      return deskOk.ok === true && deskWrong.ok === false && upOk.ok === true && upWrong.ok === false;
    }, true],
    ["E6-dotdot", "a path with .. is refused, and an ordinary path is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = accept(w, seal(w, w.lead, "../outside.ec", 1));
      const answer = accept(w, seal(w, w.desk, "desks/" + w.deskId + "/../catalog-answer.ec", 1));
      const stats = accept(w, seal(w, w.desk, "desks/" + w.deskId + "/../stats.estat", 1));
      const edit = accept(w, seal(w, w.desk, "desks/" + w.deskId + "/../edit.ec", 1));
      const good = accept(w, seal(w, w.lead, "notes.ec", 2, { body: "kept" }));
      return refused(bad, "bad-path") && refused(answer, "bad-path") && refused(stats, "bad-path")
        && refused(edit, "bad-path") && good.ok === true && t.readMirror("notes.ec") === "kept";
    }, true],
    ["E6-drive", "a drive path is refused, and an ordinary path is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = accept(w, seal(w, w.lead, "C:/outside.ec", 1));
      const good = accept(w, seal(w, w.lead, "notes.ec", 2, { body: "kept" }));
      return refused(bad, "bad-path") && good.ok === true && t.readMirror("notes.ec") === "kept";
    }, true],
    ["E6-stream", "a stream path is refused, and an ordinary path is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = accept(w, seal(w, w.lead, "notes.ec:stream", 1));
      const good = accept(w, seal(w, w.lead, "notes.ec", 2, { body: "kept" }));
      return refused(bad, "bad-path") && good.ok === true && t.readMirror("notes.ec") === "kept";
    }, true],
    ["E6-absolute", "an absolute path is refused, and an ordinary path is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const slash = accept(w, seal(w, w.lead, "/outside.ec", 1));
      const back = accept(w, seal(w, w.lead, "\\outside.ec", 2));
      const good = accept(w, seal(w, w.lead, "notes.ec", 3, { body: "kept" }));
      return refused(slash, "bad-path") && refused(back, "bad-path")
        && good.ok === true && t.readMirror("notes.ec") === "kept";
    }, true],
    ["P13", "a backslash path is refused, including one that does not start with a backslash", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const a = accept(w, seal(w, w.lead, "..\\outside.ec", 1));
      const b = accept(w, seal(w, w.lead, "sub\\..\\..\\x", 2));
      const good = accept(w, seal(w, w.lead, "notes.ec", 3, { body: "kept" }));
      return refused(a, "bad-path") && refused(b, "bad-path")
        && good.ok === true && t.readMirror("notes.ec") === "kept";
    }, true],
    ["E6-blob-relay", "the relay refuses a real ciphertext over 50 MB, and a small upload is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const small = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!small.ok) return false;
      const big = bigBlob(w, w.lead, 2);
      if (!big.ciphertext || big.ciphertext.length <= wire.BLOB_MAX) return false;
      const bad = upload(w, big);
      return refused(bad, "blob-size");
    }, true],
    ["E6-blob-program", "the program refuses a real outgoing ciphertext over 50 MB, and a small one is allowed", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const small = t.programAllowUpload({ blob: seal(w, w.lead, "guide.ec", 1), deviceId: w.lead.keyId });
      if (!small.ok) return false;
      const big = bigBlob(w, w.lead, 2);
      if (!big.ciphertext || big.ciphertext.length <= wire.BLOB_MAX) return false;
      const bad = t.programAllowUpload({ blob: relayBlob(big), deviceId: w.lead.keyId });
      return refused(bad, "blob-size");
    }, true],
    ["P14", "the program refuses a genuine incoming blob over 50 MB, and a small one is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const small = accept(w, seal(w, w.lead, "guide.ec", 1, { body: "small" }));
      if (!small.ok || t.readMirror("guide.ec") !== "small") return false;
      const big = bigBlob(w, w.lead, 2);
      if (!big.ciphertext || big.ciphertext.length <= wire.BLOB_MAX) return false;
      const bad = accept(w, big);
      return refused(bad, "blob-size") && t.readMirror("big.ec") == null && t.readMirror("guide.ec") === "small";
    }, true],
    ["E6-team-relay", "the relay refuses once real uploads pass the team cap, and the first is kept", function (create) {
      const sizer = create();
      const sized = world(sizer);
      if (!sized) return false;
      const sample = seal(sized, sized.lead, "a.ec", 1, { body: "a" });
      const t = create({ teamMax: sample.ciphertext.length });
      const w = world(t);
      if (!w) return false;
      const first = upload(w, seal(w, w.lead, "a.ec", 1, { body: "a" }));
      const second = upload(w, seal(w, w.lead, "a.ec", 2, { body: "a" }));
      return first.ok === true && refused(second, "team-size");
    }, true],
    ["E6-team-program", "the program refuses once real blobs pass the team cap, and the first is allowed", function (create) {
      const sizer = create();
      const sized = world(sizer);
      if (!sized) return false;
      const sample = seal(sized, sized.lead, "a.ec", 1, { body: "a" });
      const t = create({ teamMax: sample.ciphertext.length });
      const w = world(t);
      if (!w) return false;
      const first = t.programAllowUpload({
        blob: seal(w, w.lead, "a.ec", 1, { body: "a" }), deviceId: w.lead.keyId,
      });
      const second = t.programAllowUpload({
        blob: seal(w, w.lead, "a.ec", 2, { body: "a" }), deviceId: w.lead.keyId,
      });
      return first.ok === true && refused(second, "team-size");
    }, true],
    ["E6-rate-relay", "the relay refuses the 61st upload in the window, after 60 were kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      for (let i = 1; i <= wire.RATE_MAX; i++) {
        const r = upload(w, seal(w, w.lead, "guide.ec", i));
        if (!r.ok) return false;
      }
      const last = upload(w, seal(w, w.lead, "guide.ec", wire.RATE_MAX + 1));
      return refused(last, "rate");
    }, true],
    ["E6-rate-program", "the program refuses the 61st upload in the window, after 60 were allowed", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      for (let i = 1; i <= wire.RATE_MAX; i++) {
        const r = t.programAllowUpload({ blob: seal(w, w.lead, "guide.ec", i), deviceId: w.lead.keyId });
        if (!r.ok) return false;
      }
      const last = t.programAllowUpload({
        blob: seal(w, w.lead, "guide.ec", wire.RATE_MAX + 1), deviceId: w.lead.keyId,
      });
      return refused(last, "rate");
    }, true],
    ["P15", "after the rate window slides, the next upload is accepted at the relay and the program", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      for (let i = 1; i <= wire.RATE_MAX; i++) {
        if (!upload(w, seal(w, w.lead, "guide.ec", i)).ok) return false;
        const allowed = t.programAllowUpload({
          blob: seal(w, w.lead, "notes.ec", i), deviceId: w.lead.keyId,
        });
        if (!allowed.ok) return false;
      }
      t.advance(wire.RATE_WINDOW_MS + 1);
      const relayNext = upload(w, seal(w, w.lead, "guide.ec", wire.RATE_MAX + 1));
      const programNext = t.programAllowUpload({
        blob: seal(w, w.lead, "notes.ec", wire.RATE_MAX + 1), deviceId: w.lead.keyId,
      });
      return relayNext.ok === true && programNext.ok === true;
    }, true],
    ["E-tmp", "a temporary file is not sent, and an ordinary path is", function (create) {
      const t = create();
      const tmp = t.considerOutgoing({ path: "notes.ec.tmp" });
      const plain = t.considerOutgoing({ path: "guide.ec" });
      return !!tmp && tmp.send === false && tmp.reason === "tmp"
        && typeof tmp.said === "string" && tmp.said.length > 0 && tmp.said.indexOf("!") < 0
        && plain && plain.send === true;
    }, true],
    ["E-echo", "a file just received is not sent back, and a later local change of it is", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = "guide.ec";
      if (!accept(w, seal(w, w.lead, path, 1, { body: "edition" })).ok) return false;
      const back = t.considerOutgoing({ path: path });
      const fresh = t.considerOutgoing({ path: "local-notes.ec" });
      t.advance(wire.ECHO_MS);
      const later = t.considerOutgoing({ path: path });
      return !!back && back.send === false && back.reason === "echo"
        && typeof back.said === "string" && back.said.length > 0
        && fresh && fresh.send === true
        && later && later.send === true;
    }, true],
    ["E4", "in relay mode the ring comes from the signed team file, or it is not read", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const loose = { format: 1, kind: "etiuda-ring", keys: [{ keyId: "loose" }] };
      const bare = t.readRing({ teamDoc: w.teamDoc, looseRing: loose });
      const withRing = teamRev(w, 2, {
        ring: { format: 1, kind: "etiuda-ring", keys: [{ keyId: w.lead.keyId }] },
      });
      const inner = t.readRing({ teamDoc: withRing, looseRing: loose });
      return bare.source === "none" && bare.ring == null
        && inner.source === "team" && inner.ring && inner.ring.keys[0].keyId === w.lead.keyId;
    }, true],
    ["E8", "an epoch move does not re-seal a stored blob", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!up.ok) return false;
      const before = t.inspect({ relayTeamId: w.relayTeamId, id: up.id });
      const moved = t.epochMove({ relayTeamId: w.relayTeamId });
      const after = t.inspect({ relayTeamId: w.relayTeamId, id: up.id });
      if (!before || !after || !before.ciphertext || !after.ciphertext || !moved) return false;
      return moved.resealed === false && sameBytes(before.ciphertext, after.ciphertext);
    }, true],
    ["P20", "the stored relay record does not contain the path or the body", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const markerP = "PathToken/Z9q/" + wire.randomId();
      const markerB = "BodyToken/Z9q/" + wire.randomId();
      const blob = seal(w, w.lead, markerP, 1, { body: markerB });
      const up = upload(w, blob, { keepClear: true });
      if (!up.ok) return false;
      const rec = t.inspect({ relayTeamId: w.relayTeamId, id: up.id });
      if (!rec) return false;
      const flat = flatten(rec).join("\n");
      return flat.indexOf(markerP) < 0 && flat.indexOf(markerB) < 0;
    }, true],
    ["E11-pad", "two small blobs are reported at the same padded size", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const a = upload(w, seal(w, w.lead, "a.ec", 1, { body: "a" }));
      const b = upload(w, seal(w, w.lead, "b.ec", 2, { body: "abcdefghijklmnop" }));
      if (!a.ok || !b.ok) return false;
      const ra = t.inspect({ relayTeamId: w.relayTeamId, id: a.id });
      const rb = t.inspect({ relayTeamId: w.relayTeamId, id: b.id });
      return !!ra && !!rb && ra.size === rb.size && ra.size === wire.PAD_FLOOR + 16;
    }, true],
    ["P21", "two small ciphertexts are the same padded length", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const a = upload(w, seal(w, w.lead, "a.ec", 1, { body: "a" }));
      const b = upload(w, seal(w, w.lead, "b.ec", 2, { body: "abcdefghijklmnop" }));
      if (!a.ok || !b.ok) return false;
      const ra = t.inspect({ relayTeamId: w.relayTeamId, id: a.id });
      const rb = t.inspect({ relayTeamId: w.relayTeamId, id: b.id });
      return !!ra && !!rb && Buffer.isBuffer(ra.ciphertext) && Buffer.isBuffer(rb.ciphertext)
        && ra.ciphertext.length === wire.PAD_FLOOR + 16 && rb.ciphertext.length === wire.PAD_FLOOR + 16;
    }, true],
    ["E11-id", "a blob id is random and is not a hash of the path", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = "guide.ec";
      const a = upload(w, seal(w, w.lead, path, 1), { keepClear: true });
      const b = upload(w, seal(w, w.lead, path, 2), { keepClear: true });
      if (!a.ok || !b.ok) return false;
      const hash = wire.pathId(path);
      return a.id !== b.id && a.id !== hash && b.id !== hash && a.id.length === 32 && b.id.length === 32;
    }, true],
    ["E11-announce", "a socket announcement is seq, id and size only", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const session = helloAs(t, w.relayTeamId, w.desk);
      if (!session.ok) return false;
      const sub = t.subscribe({ relayTeamId: w.relayTeamId, session: session.session });
      if (!sub.ok) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1, { body: "secret-path-body" }));
      if (!up.ok) return false;
      const msg = sub.events[0];
      if (!msg) return false;
      const keys = Object.keys(msg).sort().join(",");
      return keys === "id,seq,size" && msg.path === undefined;
    }, true],
    ["E-chain", "a superseded blob is no longer served, and the replacement is", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const session = helloAs(t, w.relayTeamId, w.desk);
      if (!session.ok) return false;
      const first = seal(w, w.lead, "guide.ec", 1);
      const up = upload(w, first);
      if (!up.ok) return false;
      const up2 = upload(w, seal(w, w.lead, "guide-next.ec", 2, { supersedes: first.id }));
      if (!up2.ok) return false;
      const old = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up.id });
      const live = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up2.id });
      return refused(old, "superseded") && live.ok === true && live.served === true;
    }, true],
    ["P1", "a hello for an enrolled key signed by someone else is refused, and the real key still works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const attacker = wire.generateKey();
      const ch = t.challenge({ relayTeamId: w.relayTeamId });
      if (!ch || !ch.nonce) return false;
      const msg = t.helloMessage(w.relayTeamId, ch.nonce, w.desk.keyId);
      const bad = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: ch.nonce,
        keyId: w.desk.keyId,
        publicKey: attacker.publicKey,
        signature: wire.sign(attacker.privateKey, msg),
      });
      const good = helloAs(t, w.relayTeamId, w.desk);
      return refused(bad, "bad-signature") && good.ok === true;
    }, true],
    ["P2", "a hello signature presented with a fresh nonce is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const ch1 = t.challenge({ relayTeamId: w.relayTeamId });
      const msg1 = t.helloMessage(w.relayTeamId, ch1.nonce, w.desk.keyId);
      const sig1 = wire.sign(w.desk.privateKey, msg1);
      const first = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch1.nonce, keyId: w.desk.keyId, signature: sig1,
      });
      if (!first.ok) return false;
      const ch2 = t.challenge({ relayTeamId: w.relayTeamId });
      const second = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch2.nonce, keyId: w.desk.keyId, signature: sig1,
      });
      const third = helloAs(t, w.relayTeamId, w.desk);
      return refused(second, "bad-signature") && third.ok === true;
    }, true],
    ["P3", "a session from one team fetches nothing of another, and still fetches its own", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const leadB = wire.generateKey();
      const created = t.createTeam({
        teamId: "t-" + wire.randomId().slice(0, 16), epoch: 1, lead: leadB,
      });
      if (!created || !created.relayTeamId) return false;
      const blobB = t.seal({
        relayTeamId: created.relayTeamId, epoch: 1, teamKey: wire.teamKey(), writer: leadB,
        path: "guide.ec", body: "secret-b", counter: 1, place: "root", kind: "file",
      });
      const upB = t.upload({ relayTeamId: created.relayTeamId, blob: relayBlob(blobB) });
      if (!upB.ok) return false;
      const sessionA = helloAs(t, w.relayTeamId, w.desk);
      if (!sessionA.ok) return false;
      const cross = t.fetch({ relayTeamId: created.relayTeamId, session: sessionA.session, id: upB.id });
      const upA = upload(w, seal(w, w.lead, "guide.ec", 1, { body: "secret-a" }));
      if (!upA.ok) return false;
      const same = t.fetch({ relayTeamId: w.relayTeamId, session: sessionA.session, id: upA.id });
      return refused(cross, "no-hello") && same.ok === true && same.served === true;
    }, true],
    ["P4", "a list with a random session is refused, and a real session is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const up = upload(w, seal(w, w.lead, "guide.ec", 1));
      if (!up.ok) return false;
      const bad = t.list({ relayTeamId: w.relayTeamId, session: wire.randomId() });
      const session = helloAs(t, w.relayTeamId, w.desk);
      const good = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      return refused(bad, "no-hello") && session.ok === true && good.ok === true && good.served === true;
    }, true],
    ["P8", "a roster with a stranger and the old signature does not let that stranger write", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const stray = "sx-" + wire.randomId().slice(0, 8);
      const doc = Object.assign({}, w.teamDoc);
      doc.roster = w.teamDoc.roster.concat([{ deskId: stray, keyId: stranger.keyId }]);
      const bad = accept(w, seal(w, stranger, "desks/" + stray + "/join.json", 1, {
        place: "desk:" + stray,
      }), { teamDoc: doc });
      const answer = accept(w, seal(w, stranger, "desks/" + stray + "/catalog-answer.ec", 1, {
        place: "desk:" + stray,
      }), { teamDoc: doc });
      const stats = accept(w, seal(w, stranger, "desks/" + stray + "/stats.estat", 1, {
        place: "desk:" + stray,
      }), { teamDoc: doc });
      const edit = accept(w, seal(w, stranger, "desks/" + stray + "/edit.ec", 1, {
        place: "desk:" + stray,
      }), { teamDoc: doc });
      const good = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 1, { body: "own" }));
      return refused(bad, "bad-signature") && refused(answer, "bad-signature")
        && refused(stats, "bad-signature") && refused(edit, "bad-signature")
        && good.ok === true && t.readMirror(deskFile(w, "join.json")) === "own";
    }, true],
    ["P9", "a team file signed by someone other than the pinned lead is refused, and the lead's file is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const doc = wire.signTeam({
        format: 1,
        kind: "etiuda-team",
        id: w.teamId,
        epoch: 1,
        rev: 99,
        channel: { kind: "relay", relay: w.relayTeamId },
        lead: { keyId: stranger.keyId, public: stranger.publicKey },
        roster: [],
        ring: { format: 1, kind: "etiuda-ring", keys: [{ keyId: "stray" }] },
      }, stranger.privateKey);
      const loaded = t.loadTeamFile(doc);
      const ring = t.readRing({ teamDoc: doc, looseRing: null });
      const honest = t.loadTeamFile(teamRev(w, 2));
      return refused(loaded, "bad-signature") && ring.source === "none" && ring.ring == null && honest.ok === true;
    }, true],
    ["P10", "a head signed by a stranger, or naming another relay, is not shown, and the lead's head is", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const stranger = wire.generateKey();
      const badKey = wire.signHead({
        relay: w.relayTeamId, epoch: 1, rev: 1, time: 5000, keyId: stranger.keyId,
      }, stranger.privateKey);
      const badTeam = wire.signHead({
        relay: "other-relay", epoch: 1, rev: 1, time: 5000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      const goodHead = wire.signHead({
        relay: w.relayTeamId, epoch: 1, rev: 1, time: 1000, keyId: w.lead.keyId,
      }, w.lead.privateKey);
      const a = t.showFreshness({ head: badKey, now: 5000 });
      const b = t.showFreshness({ head: badTeam, now: 5000 });
      const c = t.showFreshness({ head: goodHead, now: 5000 });
      return a.shown === false && a.blocked === false && b.shown === false && b.blocked === false
        && c.shown === true && c.blocked === false;
    }, true],
    ["P12", "a token hello that presents the stored hash is refused, and the real token still works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId });
      if (!inv || !inv.token) return false;
      const hash = wire.tokenHash(inv.token);
      const bad = presentToken(t, w.relayTeamId, inv, wire.generateKey(), hash);
      const good = bindHello(t, w.relayTeamId, inv, wire.generateKey());
      return refused(bad, "not-enrolled") && good.ok === true;
    }, true],
    ["P16", "a hello on a nonce past its life is refused, and a hello inside the life works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const c1 = t.challenge({ relayTeamId: w.relayTeamId });
      t.advance(wire.NONCE_LIFE_MS);
      const inside = signHello(t, w.relayTeamId, w.desk, c1.nonce);
      if (!inside.ok) return false;
      const c2 = t.challenge({ relayTeamId: w.relayTeamId });
      t.advance(10 * 60 * 1000);
      const stale = signHello(t, w.relayTeamId, w.desk, c2.nonce);
      const c3 = t.challenge({ relayTeamId: w.relayTeamId });
      const fresh = signHello(t, w.relayTeamId, w.desk, c3.nonce);
      return refused(stale, "nonce-stale") && fresh.ok === true;
    }, true],
    ["P17", "under a live session the list holds the uploaded id and the fetch returns the ciphertext, not a plaintext", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const session = helloAs(t, w.relayTeamId, w.desk);
      if (!session.ok) return false;
      const blob = seal(w, w.lead, "guide.ec", 1, { body: "served-body" });
      const up = upload(w, blob);
      if (!up.ok) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      const got = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: up.id });
      return listed.ok === true && Array.isArray(listed.ids) && listed.ids.indexOf(up.id) !== -1
        && got.ok === true && got.plain == null
        && got.nonce === blob.nonce && got.signature === blob.signature
        && got.epoch === blob.epoch && got.writerKeyId === blob.writerKeyId
        && got.counter === blob.counter && got.supersedes === blob.supersedes
        && sameBytes(got.ciphertext, blob.ciphertext);
    }, true],
    ["P25", "a forged upload at a high counter is refused, and the lead's counter 1 is then accepted", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const forged = seal(w, w.lead, "guide.ec", 100);
      forged.signature = corrupt(forged.signature);
      const bad = upload(w, forged);
      if (!refused(bad, "bad-signature")) return false;
      const real = upload(w, seal(w, w.lead, "guide.ec", 1));
      return real.ok === true;
    }, true],
    ["P26", "a path that only shares a desk id as a prefix is outside that desk's place", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const prefixPath = "desks/" + w.deskId + "x/join.json";
      const ownPath = deskFile(w, "join.json");
      const a = accept(w, seal(w, w.desk, prefixPath, 1));
      const c = accept(w, seal(w, w.desk, ownPath, 2, { body: "own" }));
      return refused(a, "outside-place") && c.ok === true && t.readMirror(ownPath) === "own";
    }, true],
    ["N1", "an older team file is refused once a higher rev is loaded, and the current rev still accepts", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const rev2 = teamRev(w, 2, {
        roster: [{ deskId: w.otherId, keyId: w.other.keyId }],
      });
      if (!t.loadTeamFile(w.teamDoc).ok || !t.loadTeamFile(rev2).ok) return false;
      const deskPath = deskFile(w, "stats.estat");
      const otherPath = "desks/" + w.otherId + "/stats.estat";
      const old = accept(w, seal(w, w.desk, deskPath, 1, { body: "removed" }), { teamDoc: w.teamDoc });
      const cur = accept(w, seal(w, w.other, otherPath, 1, { body: "kept" }), { teamDoc: rev2 });
      return refused(old, "replay-rev") && cur.ok === true
        && t.readMirror(otherPath) === "kept" && t.readMirror(deskPath) == null;
    }, true],
    ["N3", "a team file of another id or another relay is refused, and the pinned team file is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const otherId = t.loadTeamFile(teamRev(w, 5, { id: "t-other-team" }));
      const otherRelay = t.loadTeamFile(teamRev(w, 4, {
        channel: { kind: "relay", relay: "other-relay" },
      }));
      const both = t.loadTeamFile(teamRev(w, 3, {
        id: "t-other-team",
        channel: { kind: "relay", relay: "other-relay" },
      }));
      const honest = t.loadTeamFile(w.teamDoc);
      return refused(otherId, "wrong-team") && refused(otherRelay, "wrong-team")
        && refused(both, "wrong-team") && honest.ok === true;
    }, true],
    ["N4", "a blob under a team file of another id or another relay is refused, and the pinned file still accepts", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "in-use.ec");
      const byId = accept(w, seal(w, w.desk, path, 1, { body: "other-id" }), {
        teamDoc: teamRev(w, 1, { id: "t-other-team" }),
      });
      const byRelay = accept(w, seal(w, w.desk, path, 1, { body: "other-relay" }), {
        teamDoc: teamRev(w, 1, { channel: { kind: "relay", relay: "other-relay" } }),
      });
      const byBoth = accept(w, seal(w, w.desk, path, 1, { body: "both" }), {
        teamDoc: teamRev(w, 1, {
          id: "t-other-team",
          channel: { kind: "relay", relay: "other-relay" },
        }),
      });
      const kinds = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      for (let i = 0; i < kinds.length; i++) {
        const kindPath = deskFile(w, kinds[i]);
        const kind = accept(w, seal(w, w.desk, kindPath, 1, { body: "kind" }), {
          teamDoc: teamRev(w, 1, { id: "t-other-team" }),
        });
        if (!refused(kind, "wrong-team") || t.readMirror(kindPath) != null) return false;
      }
      const good = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 2, { body: "own" }));
      return refused(byId, "wrong-team") && refused(byRelay, "wrong-team") && refused(byBoth, "wrong-team")
        && good.ok === true && t.readMirror(deskFile(w, "join.json")) === "own"
        && t.readMirror(path) == null;
    }, true],
    ["N7", "a rewritten supersedes does not open, and a genuine supersedes is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const named = wire.randomId();
      const rewritten = seal(w, w.lead, "guide.ec", 1, { supersedes: named, body: "moved" });
      rewritten.supersedes = wire.randomId();
      const bad = accept(w, rewritten);
      const good = accept(w, seal(w, w.lead, "notes.ec", 2, { supersedes: named, body: "kept" }));
      return refused(bad, "bad-signature") && good.ok === true
        && t.readMirror("notes.ec") === "kept" && t.readMirror("guide.ec") == null;
    }, true],
    ["N8", "a blob whose epoch the team file does not carry is refused, and the team file's epoch is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const bad = accept(w, seal(w, w.desk, deskFile(w, "in-use.ec"), 1, { epoch: 9, body: "foreign" }));
      const kinds = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      for (let i = 0; i < kinds.length; i++) {
        const kindPath = deskFile(w, kinds[i]);
        const kind = accept(w, seal(w, w.desk, kindPath, 1, { epoch: 9, body: "foreign" }));
        if (!refused(kind, "epoch") || t.readMirror(kindPath) != null) return false;
      }
      const good = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 1, { body: "kept" }));
      return refused(bad, "epoch") && good.ok === true
        && t.readMirror(deskFile(w, "join.json")) === "kept"
        && t.readMirror(deskFile(w, "in-use.ec")) == null;
    }, true],
    ["N6", "a hello for a removed key with a bad signature is refused like any bad signature, and a genuine one is removed", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      t.removeDesk({ relayTeamId: w.relayTeamId, deskId: w.deskId });
      const ch1 = t.challenge({ relayTeamId: w.relayTeamId });
      const unsigned = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch1.nonce, keyId: w.desk.keyId, signature: "",
      });
      const ch2 = t.challenge({ relayTeamId: w.relayTeamId });
      const msg2 = t.helloMessage(w.relayTeamId, ch2.nonce, w.desk.keyId);
      const forged = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: ch2.nonce,
        keyId: w.desk.keyId,
        signature: wire.sign(w.other.privateKey, msg2),
      });
      const ch3 = t.challenge({ relayTeamId: w.relayTeamId });
      const zeros = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: ch3.nonce,
        keyId: w.desk.keyId,
        signature: "00".repeat(64),
      });
      const ch4 = t.challenge({ relayTeamId: w.relayTeamId });
      const msg4 = t.helloMessage(w.relayTeamId, ch4.nonce, w.desk.keyId);
      const named = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: ch4.nonce,
        keyId: w.desk.keyId,
        publicKey: w.other.publicKey,
        signature: wire.sign(w.other.privateKey, msg4),
      });
      const genuine = helloAs(t, w.relayTeamId, w.desk);
      return refused(unsigned, "bad-signature") && refused(forged, "bad-signature")
        && refused(zeros, "bad-signature") && refused(named, "bad-signature")
        && refused(genuine, "removed");
    }, true],
    ["M1", "an epoch move strands no remaining desk, and the desk taken off opens nothing after it", function (create) {
      const t = create();
      if (typeof t.sealTeam !== "function") return false;
      const lead = wire.generateKey();
      const gone = wire.generateKey();
      const stays = wire.generateKey();
      const teamId = "t-" + wire.randomId().slice(0, 16);
      const created = t.createTeam({ teamId: teamId, epoch: 1, lead: lead });
      if (!created || !created.relayTeamId) return false;
      const rt = created.relayTeamId;
      const w = { target: t, relayTeamId: rt };
      const goneId = branchId(gone.keyId);
      const staysId = branchId(stays.keyId);
      t.enrol({ relayTeamId: rt, deskId: goneId, keyId: gone.keyId });
      t.enrol({ relayTeamId: rt, deskId: staysId, keyId: stays.keyId });
      t.pin({ leadKeyId: lead.keyId, relayTeamId: rt, teamId: teamId });
      const lb = box();
      const gb = box();
      const sb = box();
      const k1 = wire.teamKey();
      const k2 = wire.teamKey();
      const entry = function (k, id, b, key, epoch) {
        return { desk: { id: id, key: k.keyId, box: b.public }, wrap: wrapKey(key, b.public, teamId, epoch, id) };
      };
      const doc = function (epoch, roster) {
        return wire.signTeam({ format: 1, kind: "etiuda-team", id: teamId, epoch: epoch, rev: 1, channel: { kind: "relay", relay: rt },
          lead: { keyId: lead.keyId, public: lead.publicKey, box: lb.public }, roster: roster }, lead.privateKey);
      };
      const send = function (epoch, key, d, files) {
        const s = t.sealTeam({ relayTeamId: rt, teamId: teamId, epoch: epoch, teamKey: key, writer: lead, leadBox: lb, teamDoc: d, files: files });
        if (!s || s.ok !== true || !Array.isArray(s.blobs)) return null;
        return s.blobs.every(function (b) { return upload(w, b).ok === true; }) ? s.blobs : null;
      };
      const sync = function (d) {
        const s = helloAs(t, rt, stays);
        if (!s || s.ok !== true) return false;
        t.syncMirror({ relayTeamId: rt, session: s.session, teamKey: k1, teamDoc: d, box: sb, deskId: staysId });
        return true;
      };
      const doc1 = doc(1, [entry(gone, goneId, gb, k1, 1), entry(stays, staysId, sb, k1, 1)]);
      const first = send(1, k1, doc1, { "lane.ec": "edition one" });
      const before = sync(doc1) && t.readMirror("lane.ec") === "edition one";
      t.removeDesk({ relayTeamId: rt, deskId: goneId });
      t.addEpoch({ relayTeamId: rt, epoch: 2 });
      const after = send(2, k2, doc(2, [entry(stays, staysId, sb, k2, 2)]), { "lane.ec": "edition two", "after.ec": "written after the move" });
      sync(doc1);
      let held = null;
      try { held = JSON.parse(t.readMirror("etiuda-team.json")); } catch (e) { held = null; }
      const reached = !!held && held.epoch === 2 && t.readMirror("lane.ec") === "edition two"
        && t.readMirror("after.ec") === "written after the move";
      const tries = [k1];
      doc1.roster.forEach(function (e) {
        const f = { relayTeamId: rt, teamId: teamId, leadKeyId: lead.keyId, leadBox: lb.public, deskId: e.desk.id, deskBox: e.desk.box };
        [agree(gb.private, lb.public), agree(gb.private, e.desk.box)].forEach(function (a) {
          const c = copyOf(a, f);
          if (c) tries.push(c.key);
        });
      });
      const opened = (after || []).filter(function (b) {
        return tries.some(function (k) { return opensUnder(Object.assign({ relayTeamId: rt }, b), k); });
      }).length;
      return !!first && before && !!after && after.length >= 4 && reached && tries.length === 5 && opened === 0
        && refused(helloAs(t, rt, gone), "removed");
    }, true],
    ["S2-place-relay", "an upload into a desk's place is kept only for that enrolled key, and a refused blob is not listed", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const ownInUse = seal(w, w.desk, deskFile(w, "in-use.ec"), 1, { body: "own" });
      const ownEdit = seal(w, w.desk, deskFile(w, "edit.ec"), 3, { body: "edit" });
      const lead = seal(w, w.lead, deskFile(w, "in-use.ec"), 1, { place: "desk:" + w.deskId, body: "lead" });
      const other = seal(w, w.other, deskFile(w, "catalog-answer.ec"), 1, { place: "desk:" + w.deskId, body: "other" });
      const cross = seal(w, w.desk, "desks/" + w.otherId + "/stats.estat", 2, { place: "desk:" + w.otherId, body: "cross" });
      const upOwn = upload(w, ownInUse);
      const upEdit = upload(w, ownEdit);
      const upLead = upload(w, lead);
      const upOther = upload(w, other);
      const upCross = upload(w, cross);
      if (!(upOwn.ok === true && upEdit.ok === true && refused(upLead, "outside-place")
        && refused(upOther, "outside-place") && refused(upCross, "outside-place"))) return false;
      const session = helloAs(t, w.relayTeamId, w.other);
      if (!session.ok) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      if (!listed.ok || !Array.isArray(listed.ids)) return false;
      return listed.ids.indexOf(ownInUse.id) !== -1 && listed.ids.indexOf(ownEdit.id) !== -1
        && listed.ids.indexOf(lead.id) === -1 && listed.ids.indexOf(other.id) === -1
        && listed.ids.indexOf(cross.id) === -1;
    }, true],
    ["S2-place-program", "a desk file is kept only under that desk's key, and the lead's or another desk's copy is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      for (let i = 0; i < names.length; i++) {
        const path = deskFile(w, names[i]);
        const leadBad = accept(w, seal(w, w.lead, path, i + 1, { place: "desk:" + w.deskId, body: "lead" }));
        const otherBad = accept(w, seal(w, w.other, path, 1, { place: "desk:" + w.deskId, body: "other" }));
        const own = accept(w, seal(w, w.desk, path, i + 1, { body: "own" + (i + 1) }));
        const leadDesk = acceptDesk(w, seal(w, w.lead, path, i + 1, { place: "desk:" + w.deskId, body: "lead-desk" }));
        if (!refused(leadBad, "outside-place") || !refused(otherBad, "outside-place") || !refused(leadDesk, "outside-place")) return false;
        if (!own.ok || t.readMirror(path) !== "own" + (i + 1)) return false;
      }
      return true;
    }, true],
    ["S2-place-other", "the relay refuses a place that is neither root, nor that desk's place, nor the lead's invite, and those three are kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const invite = "invite:" + "ab".repeat(16);
      /* The product records a desk key when its seal runs. The odd place is not that call. */
      seal(w, w.desk, deskFile(w, "edit.ec"), 1, { body: "key" });
      const weirdLead = upload(w, sealAt(w, w.lead, "guide.ec", 1, "sideways"));
      const weirdDesk = upload(w, sealAt(w, w.desk, deskFile(w, "in-use.ec"), 1, "anywhere"));
      const deskInvite = upload(w, sealAt(w, w.desk, deskFile(w, "edit.ec"), 1, invite));
      /* A place the product header cannot carry is bad-signature before the place check.
         A desk's invite reaches that check and is outside-place. */
      if (!refusedOneOf(weirdLead, ["outside-place", "bad-signature"])) return false;
      if (!refusedOneOf(weirdDesk, ["outside-place", "bad-signature"])) return false;
      if (!refused(deskInvite, "outside-place")) return false;
      const root = upload(w, seal(w, w.lead, "guide.ec", 1, { body: "root" }));
      const own = upload(w, seal(w, w.desk, deskFile(w, "in-use.ec"), 1, { body: "own" }));
      const copy = upload(w, sealAt(w, w.lead, "etiuda-team.json", 2, invite, { body: "copy" }));
      return root.ok === true && own.ok === true && copy.ok === true;
    }, true],
    ["S2-chain", "the relay refuses a desk upload that supersedes the lead's blob, and still serves that blob", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const leadBlob = seal(w, w.lead, "guide.ec", 1, { body: "edition" });
      const upLead = upload(w, leadBlob);
      if (!upLead.ok) return false;
      const stolen = seal(w, w.desk, deskFile(w, "edit.ec"), 1, { supersedes: leadBlob.id, body: "steal" });
      const upStolen = upload(w, stolen);
      if (!refused(upStolen, "outside-place")) return false;
      const own = seal(w, w.desk, deskFile(w, "edit.ec"), 1, { body: "own" });
      const upOwn = upload(w, own);
      const next = upload(w, seal(w, w.desk, deskFile(w, "notes.ec"), 2, { supersedes: own.id, body: "next" }));
      if (!upOwn.ok || !next.ok) return false;
      const session = helloAs(t, w.relayTeamId, w.other);
      if (!session.ok) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: session.session });
      const got = t.fetch({ relayTeamId: w.relayTeamId, session: session.session, id: leadBlob.id });
      return !!listed.ok && listed.ids.indexOf(leadBlob.id) !== -1 && listed.ids.indexOf(stolen.id) === -1
        && got.ok === true && got.served === true && sameBytes(got.ciphertext, leadBlob.ciphertext);
    }, true],
    ["S2-counter", "a same-epoch replay of an older or equal catalog answer, statistics file or desk edit is refused after a restart, and the next counter is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      const older = [];
      let n = 1;
      for (let i = 0; i < names.length; i++) {
        const path = deskFile(w, names[i]);
        const first = accept(w, seal(w, w.desk, path, n, { body: "old" + n }));
        if (!first.ok) return false;
        older.push({ path: path, counter: n });
        n += 1;
        const newer = accept(w, seal(w, w.desk, path, n, { body: "new" + n }));
        if (!newer.ok || t.readMirror(path) !== "new" + n) return false;
        n += 1;
      }
      t.restart();
      for (let i = 0; i < older.length; i++) {
        const row = older[i];
        const replay = accept(w, seal(w, w.desk, row.path, row.counter, { body: "replay" }));
        if (!refused(replay, "replay-counter")) return false;
        const equal = accept(w, seal(w, w.desk, row.path, row.counter + 1, { body: "equal" }));
        if (!refused(equal, "replay-counter")) return false;
        if (t.readMirror(row.path) !== "new" + (row.counter + 1)) return false;
      }
      const next = accept(w, seal(w, w.desk, deskFile(w, names[0]), n, { body: "next" }));
      return next.ok === true && t.readMirror(deskFile(w, names[0])) === "next";
    }, true],
    ["S2-relay-counter", "the relay refuses a same-epoch replay of each older desk file after a restart, and the next counter is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["in-use.ec", "catalog-answer.ec", "stats.estat", "edit.ec"];
      const older = [];
      for (let i = 0; i < names.length; i++) {
        const counter = i + 1;
        const path = deskFile(w, names[i]);
        const up = upload(w, seal(w, w.desk, path, counter, { body: "v" + counter }));
        if (!up.ok) return false;
        older.push({ path: path, counter: counter });
      }
      t.restart();
      for (let i = 0; i < older.length; i++) {
        const row = older[i];
        const replay = upload(w, seal(w, w.desk, row.path, row.counter, { body: "replay" }));
        if (!refused(replay, "replay-counter")) return false;
      }
      const next = upload(w, seal(w, w.desk, deskFile(w, "edit.ec"), names.length + 1, { body: "next" }));
      return next.ok === true;
    }, true],
    ["S2-remove", "a desk dropped by a later roster rev or epoch is refused, what it sent before stays, and the relay's withdrawal is not what the program believes", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      t.removeDesk({ relayTeamId: w.relayTeamId, deskId: w.deskId });
      const despite = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 1, { body: "despite" }));
      if (!despite.ok || t.readMirror(deskFile(w, "join.json")) !== "despite") return false;
      const back = t.enrol({ relayTeamId: w.relayTeamId, deskId: w.deskId, keyId: w.desk.keyId });
      if (!back || back.ok === false) return false;
      const stats = deskFile(w, "stats.estat");
      const before = accept(w, seal(w, w.desk, stats, 2, { body: "before" }));
      if (!before.ok || t.readMirror(stats) !== "before") return false;
      const rev2 = teamRev(w, 2, {
        roster: [{ deskId: w.otherId, keyId: w.other.keyId }],
      });
      if (!t.loadTeamFile(w.teamDoc).ok || !t.loadTeamFile(rev2).ok) return false;
      const afterBlob = seal(w, w.desk, stats, 3, { body: "after" });
      const after = accept(w, afterBlob, { teamDoc: rev2 });
      if (!refused(after, "removed") || t.readMirror(stats) !== "before") return false;
      const relayStill = upload(w, afterBlob);
      if (!relayStill.ok) return false;
      const epoch2Key = wire.teamKey();
      const epoch2Doc = teamRev(w, 1, {
        epoch: 2,
        roster: [{ deskId: w.otherId, keyId: w.other.keyId }],
      });
      if (!t.loadTeamFile(epoch2Doc).ok) return false;
      const epoch2Blob = t.seal({
        relayTeamId: w.relayTeamId, epoch: 2, teamKey: epoch2Key, writer: w.desk,
        path: stats, body: "epoch-after", counter: 1, place: "desk:" + w.deskId, kind: "file",
      });
      const epochAfter = t.acceptBlob({ teamKey: epoch2Key, teamDoc: epoch2Doc, blob: relayBlob(epoch2Blob) });
      if (!refused(epochAfter, "removed") || t.readMirror(stats) !== "before") return false;
      const otherPath = "desks/" + w.otherId + "/stats.estat";
      const otherBlob = t.seal({
        relayTeamId: w.relayTeamId, epoch: 2, teamKey: epoch2Key, writer: w.other,
        path: otherPath, body: "epoch-kept", counter: 1, place: "desk:" + w.otherId, kind: "file",
      });
      const kept = t.acceptBlob({ teamKey: epoch2Key, teamDoc: epoch2Doc, blob: relayBlob(otherBlob) });
      return kept.ok === true && t.readMirror(otherPath) === "epoch-kept" && t.readMirror(stats) === "before";
    }, true],
    ["S2-epoch-gone", "after an epoch move drops a desk, its new file at the old epoch under the old team file is removed, and the kept desk's epoch-2 file is accepted", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const epoch2Key = wire.teamKey();
      const epoch2Doc = teamRev(w, 1, {
        epoch: 2,
        roster: [{ deskId: w.otherId, keyId: w.other.keyId }],
      });
      if (!t.loadTeamFile(w.teamDoc).ok || !t.loadTeamFile(epoch2Doc).ok) return false;
      const oldPath = deskFile(w, "notes.ec");
      const old = accept(w, seal(w, w.desk, oldPath, 1, { body: "old-epoch" }), { teamDoc: w.teamDoc });
      const oldDesk = acceptDesk(w, seal(w, w.desk, deskFile(w, "in-use.ec"), 1, { body: "old-desk" }), { teamDoc: w.teamDoc });
      if (!refused(old, "removed") || !refused(oldDesk, "removed")) return false;
      if (t.readMirror(oldPath) != null || t.readMirror(deskFile(w, "in-use.ec")) != null) return false;
      const keptPath = "desks/" + w.otherId + "/catalog-answer.ec";
      const keptBlob = t.seal({
        relayTeamId: w.relayTeamId, epoch: 2, teamKey: epoch2Key, writer: w.other,
        path: keptPath, body: "epoch-2", counter: 1, place: "desk:" + w.otherId, kind: "file",
      });
      const kept = t.acceptBlob({ teamKey: epoch2Key, teamDoc: epoch2Doc, blob: relayBlob(keptBlob) });
      return kept.ok === true && t.readMirror(keptPath) === "epoch-2";
    }, true],
    ["S2-count", "a desk file is counted under the roster key for its folder, not under a place the relay names", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "stats.estat");
      const blob = seal(w, w.desk, path, 1, { body: "counted" });
      blob.place = "desk:" + w.otherId;
      const r = accept(w, blob);
      return r.ok === true && r.keyId === w.desk.keyId && r.deskId === w.deskId
        && r.rev === 1 && r.epoch === 1 && r.deskId !== w.otherId;
    }, true],
    ["S2-readdress", "a file the relay re-addresses into another desk's place stays in the signer's folder", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const path = deskFile(w, "catalog-answer.ec");
      const blob = seal(w, w.desk, path, 1, { body: "stay" });
      blob.place = "desk:" + w.otherId;
      const r = accept(w, blob);
      const moved = "desks/" + w.otherId + "/catalog-answer.ec";
      return r.ok === true && t.readMirror(path) === "stay" && t.readMirror(moved) == null;
    }, true],
    ["S2-fold", "a case-folded or dotted catalog answer, statistics file or desk edit is that desk's place, and the lead's copy is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      let n = 1;
      for (let i = 0; i < names.length; i++) {
        const cased = "Desks/" + w.deskId + "/" + names[i];
        const dotted = "./desks/" + w.deskId + "/" + names[i];
        const canon = deskFile(w, names[i]);
        const leadCase = accept(w, seal(w, w.lead, cased, 1, { body: "lead-case" }));
        const leadDot = accept(w, seal(w, w.lead, dotted, 2, { body: "lead-dot" }));
        const leadDesk = acceptDesk(w, seal(w, w.lead, cased, 3, { body: "lead-desk" }));
        if (!refused(leadCase, "outside-place") || !refused(leadDot, "outside-place") || !refused(leadDesk, "outside-place")) return false;
        if (t.readMirror(canon) != null || t.readMirror(cased) != null) return false;
        const ownCase = accept(w, seal(w, w.desk, cased, n, { body: "case" + n }));
        const ownDot = accept(w, seal(w, w.desk, dotted, n + 1, { body: "dot" + n }));
        const deskCase = acceptDesk(w, seal(w, w.desk, cased, n + 2, { body: "desk" + n }));
        if (!ownCase.ok || !ownDot.ok || !deskCase.ok) return false;
        if (t.readMirror(canon) !== "desk" + n) return false;
        n += 3;
      }
      return true;
    }, true],
    ["S2-prefix", "a folder that only begins with the desk id is outside that desk's place for a catalog answer, statistics file or desk edit", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["catalog-answer.ec", "stats.estat", "edit.ec"];
      for (let i = 0; i < names.length; i++) {
        const badPath = "desks/" + w.deskId + "x/" + names[i];
        const bad = accept(w, seal(w, w.desk, badPath, 1, { body: "bad" }));
        const badDesk = acceptDesk(w, seal(w, w.desk, badPath, 1, { body: "bad-desk" }));
        if (!refused(bad, "outside-place") || !refused(badDesk, "outside-place")) return false;
        if (t.readMirror(badPath) != null) return false;
      }
      const ownPath = deskFile(w, "catalog-answer.ec");
      const own = accept(w, seal(w, w.desk, ownPath, 1, { body: "own" }));
      const ownDesk = acceptDesk(w, seal(w, w.desk, deskFile(w, "stats.estat"), 2, { body: "desk" }));
      return own.ok === true && ownDesk.ok === true && t.readMirror(ownPath) === "own"
        && t.readMirror(deskFile(w, "stats.estat")) === "desk";
    }, true],
    ["S2-desk-forge", "a desk file is refused for a bad path, a team file the pinned lead did not sign, another team or relay, or another epoch", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const names = ["in-use.ec", "catalog-answer.ec", "stats.estat", "edit.ec"];
      const stranger = wire.generateKey();
      const forged = wire.signTeam({
        format: 1, kind: "etiuda-team", id: w.teamId, epoch: 1, rev: 1,
        channel: { kind: "relay", relay: w.relayTeamId },
        lead: { keyId: stranger.keyId, public: stranger.publicKey },
        roster: [{ deskId: w.deskId, keyId: w.desk.keyId }],
      }, stranger.privateKey);
      const otherId = teamRev(w, 1, { id: "t-other-team" });
      const otherRelay = teamRev(w, 1, { channel: { kind: "relay", relay: "other-relay" } });
      for (let i = 0; i < names.length; i++) {
        const path = deskFile(w, names[i]);
        const badPath = acceptDesk(w, seal(w, w.desk, "desks/" + w.deskId + "/../" + names[i], 1, { body: "path" }));
        const badSig = acceptDesk(w, seal(w, w.desk, path, 1, { body: "sig" }), { teamDoc: forged });
        const badId = acceptDesk(w, seal(w, w.desk, path, 1, { body: "id" }), { teamDoc: otherId });
        const badRelay = acceptDesk(w, seal(w, w.desk, path, 1, { body: "relay" }), { teamDoc: otherRelay });
        const badEpoch = acceptDesk(w, seal(w, w.desk, path, 1, { epoch: 9, body: "epoch" }));
        if (!refused(badPath, "bad-path") || !refused(badSig, "bad-signature")) return false;
        if (!refused(badId, "wrong-team") || !refused(badRelay, "wrong-team") || !refused(badEpoch, "epoch")) return false;
        if (t.readMirror(path) != null) return false;
      }
      const good = acceptDesk(w, seal(w, w.desk, deskFile(w, "stats.estat"), 1, { body: "kept" }));
      return good.ok === true && t.readMirror(deskFile(w, "stats.estat")) === "kept";
    }, true],
    ["S2-desk-kind", "a foreign notes file is refused and unwritten, the desk's own notes file is refused or taken under acceptBlob's rules, and acceptBlob still accepts it", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const notes = deskFile(w, "notes.ec");
      const foreign = acceptDesk(w, seal(w, w.other, notes, 1, { body: "foreign" }));
      if (!refused(foreign, "outside-place") || t.readMirror(notes) != null) return false;
      const ownNotes = acceptDesk(w, seal(w, w.desk, notes, 1, { body: "checked" }));
      let notesCounter = 1;
      if (ownNotes.ok) {
        if (t.readMirror(notes) !== "checked") return false;
        const replay = acceptDesk(w, seal(w, w.desk, notes, 1, { body: "replay" }));
        if (!refused(replay, "replay-counter") || t.readMirror(notes) !== "checked") return false;
        notesCounter = 2;
      } else if (!refused(ownNotes, "outside-place") || t.readMirror(notes) != null) {
        return false;
      }
      const kept = accept(w, seal(w, w.desk, notes, notesCounter, { body: "notes" }));
      const live = acceptDesk(w, seal(w, w.desk, deskFile(w, "in-use.ec"), notesCounter + 1, { body: "live" }));
      return kept.ok === true && t.readMirror(notes) === "notes"
        && live.ok === true && t.readMirror(deskFile(w, "in-use.ec")) === "live";
    }, true],
    e2eDesk("S2-e2e-inuse", "in-use.ec"),
    e2eDesk("S2-e2e-answer", "catalog-answer.ec"),
    e2eDesk("S2-e2e-stats", "stats.estat"),
    e2eDesk("S2-e2e-edit", "edit.ec"),
    ["S3-burn", "the bound hello is served the wrap until the upload, a second token hello is spent, and another key's signature on that id is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const first = bindHello(t, w.relayTeamId, inv, joiner);
      if (!first.ok) return false;
      const served = [];
      served.push(t.fetchWrap({ relayTeamId: w.relayTeamId, session: first.session }));
      const again = helloAs(t, w.relayTeamId, joiner);
      if (!again.ok) return false;
      served.push(t.fetchWrap({ relayTeamId: w.relayTeamId, session: again.session }));
      served.push(t.fetchWrap({ relayTeamId: w.relayTeamId, session: again.session }));
      if (served.length !== 3) return false;
      for (let i = 0; i < served.length; i++) {
        if (!served[i] || served[i].ok !== true || !served[i].wrap || served[i].wrap.ct !== wrap.ct) return false;
      }
      const otherKey = wire.generateKey();
      const forgedCh = t.challenge({ relayTeamId: w.relayTeamId });
      const forgedMsg = t.helloMessage(w.relayTeamId, forgedCh.nonce, joiner.keyId);
      const forged = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: forgedCh.nonce,
        keyId: joiner.keyId,
        signature: wire.sign(otherKey.privateKey, forgedMsg),
      });
      if (!refused(forged, "not-enrolled") || forged.session != null) return false;
      const second = bindHello(t, w.relayTeamId, inv, joiner);
      const stranger = bindHello(t, w.relayTeamId, inv, wire.generateKey());
      if (!refused(second, "token-spent") || second.ciphertext != null) return false;
      if (!refused(stranger, "token-spent") || stranger.ciphertext != null) return false;
      const deskId = "k-" + wire.randomId().slice(0, 16);
      const joined = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 1, "desk:" + deskId, { body: "join" }));
      if (!joined.ok) return false;
      const after = t.fetchWrap({ relayTeamId: w.relayTeamId, session: again.session });
      const seen = t.inspect({ relayTeamId: w.relayTeamId, id: joined.id });
      return wrapGone(after) && !!seen && !hasText(seen, wrap.ct);
    }, true],
    ["S3-unbound", "an unbound hello, a bad signature and a key that is not its pub's id are refused unspent, and a later bound hello is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const ch = t.challenge({ relayTeamId: w.relayTeamId });
      const loose = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch.nonce, invitationId: inv.invitationId, token: inv.token,
      });
      if (!refused(loose, "bad-signature") || loose.wrap != null) return false;
      const joiner = wire.generateKey();
      const other = wire.generateKey();
      const chBad = t.challenge({ relayTeamId: w.relayTeamId });
      const msgBad = t.helloMessage(w.relayTeamId, chBad.nonce, joiner.keyId);
      const badSig = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: chBad.nonce,
        invitationId: inv.invitationId,
        token: inv.token,
        key: joiner.keyId,
        pub: joiner.publicKey,
        sig: wire.sign(other.privateKey, msgBad),
      });
      if (!refused(badSig, "bad-signature") || badSig.session != null) return false;
      const chId = t.challenge({ relayTeamId: w.relayTeamId });
      const msgId = t.helloMessage(w.relayTeamId, chId.nonce, joiner.keyId);
      const badId = t.hello({
        relayTeamId: w.relayTeamId,
        nonce: chId.nonce,
        invitationId: inv.invitationId,
        token: inv.token,
        key: joiner.keyId,
        pub: other.publicKey,
        sig: wire.sign(other.privateKey, msgId),
      });
      if (!refused(badId, "bad-signature") || badId.session != null) return false;
      const bound = bindHello(t, w.relayTeamId, inv, joiner);
      if (!bound.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: bound.session });
      return !!served && served.ok === true && served.wrap && served.wrap.ct === wrap.ct;
    }, true],
    ["S3-wrap-session", "only the bound session is served the wrap, and only the lead is told the states", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      const lead = helloAs(t, w.relayTeamId, w.lead);
      const desk = helloAs(t, w.relayTeamId, w.desk);
      if (!hello.ok || !lead.ok || !desk.ok) return false;
      const own = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      const leadWrap = t.fetchWrap({ relayTeamId: w.relayTeamId, session: lead.session });
      const deskWrap = t.fetchWrap({ relayTeamId: w.relayTeamId, session: desk.session });
      if (!own || own.ok !== true || !own.wrap || own.wrap.ct !== wrap.ct) return false;
      if (!refused(leadWrap, "not-enrolled") || leadWrap.wrap != null) return false;
      if (!refused(deskWrap, "not-enrolled") || deskWrap.wrap != null) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!listed.ok || listed.ids.indexOf(invitationId) >= 0) return false;
      const byId = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: invitationId });
      if (!refused(byId, "missing") && !refused(byId, "bad-signature")) return false;
      for (let i = 0; i < listed.ids.length; i++) {
        const row = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: listed.ids[i] });
        if (hasText(row, wrap.ct)) return false;
      }
      const states = t.inviteStates({ relayTeamId: w.relayTeamId, session: lead.session });
      const inviteStates = t.inviteStates({ relayTeamId: w.relayTeamId, session: hello.session });
      const deskStates = t.inviteStates({ relayTeamId: w.relayTeamId, session: desk.session });
      return !!states && states.ok === true && Array.isArray(states.states)
        && refused(inviteStates, "not-enrolled") && refused(deskStates, "not-enrolled");
    }, true],
    ["S3-wrap-cap", "a wrap of 1024 bytes is kept and a wrap of 1025 bytes is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const fit = sizedWrap(1024);
      const over = sizedWrap(1025);
      const kept = t.invite({ relayTeamId: w.relayTeamId, invitationId: wire.randomId(), wrap: fit });
      if (!kept || !kept.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, kept, joiner);
      if (!hello.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!served || served.ok !== true || !served.wrap || served.wrap.ct !== fit.ct) return false;
      if (Buffer.byteLength(wire.canon(served.wrap), "utf8") !== 1024) return false;
      const rejected = t.invite({ relayTeamId: w.relayTeamId, invitationId: wire.randomId(), wrap: over });
      return refused(rejected, "blob-size");
    }, true],
    ["S3-wrap-signed", "an unsigned wrap or re-seal is refused and the stored wrap is unchanged", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const before = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!before || before.ok !== true || !before.wrap || before.wrap.ct !== wrap.ct) return false;
      const other = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, wire.teamKey());
      const unsigned = t.reseal({
        relayTeamId: w.relayTeamId, signed: false, drop: [], wraps: [{ id: invitationId, wrap: other }],
      });
      const stranger = wire.generateKey();
      const wrongKey = t.reseal({
        relayTeamId: w.relayTeamId, signer: stranger, drop: [], wraps: [{ id: invitationId, wrap: other }],
      });
      const bare = t.reseal({
        relayTeamId: w.relayTeamId, cover: "bare", drop: [], wraps: [{ id: invitationId, wrap: other }],
      });
      const fresh = t.invite({
        relayTeamId: w.relayTeamId, invitationId: wire.randomId(), wrap: other, signed: false,
      });
      if (!refused(unsigned, "bad-signature") || !refused(wrongKey, "bad-signature")) return false;
      if (!refused(bare, "bad-signature") || !refused(fresh, "bad-signature")) return false;
      const after = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      return !!after && after.ok === true && after.wrap && after.wrap.ct === wrap.ct;
    }, true],
    ["S3-wrap-moved", "a wrap moved to another id, team, relay team or epoch does not open, and the real one opens a catalog", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const published = upload(w, seal(w, w.lead, "field-guide.ec", 1, { body: "field-guide" }));
      if (!published.ok) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!served || served.ok !== true || !served.wrap || served.wrap.ct !== wrap.ct) return false;
      const opened = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: invitationId,
        wrap: served.wrap, teamDoc: w.teamDoc,
      });
      if (!opened || opened.ok !== true || openCatalog(t, w, hello.session, published.id, opened.key) !== "field-guide") return false;
      const args = { secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: invitationId, wrap: served.wrap, teamDoc: w.teamDoc };
      const movedId = t.openWrap(Object.assign({}, args, { invitationId: wire.randomId() }));
      const movedTeam = t.openWrap(Object.assign({}, args, { teamId: "t-other-team" }));
      const movedRelay = t.openWrap(Object.assign({}, args, { relayTeamId: wire.randomId() }));
      const movedEpoch = t.openWrap(Object.assign({}, args, {
        wrap: Object.assign({}, served.wrap, { epoch: 2 }),
        teamDoc: Object.assign({}, w.teamDoc, { epoch: 2 }),
      }));
      return refused(movedId, "bad-signature") && refused(movedTeam, "bad-signature")
        && refused(movedRelay, "bad-signature") && refused(movedEpoch, "bad-signature");
    }, true],
    ["S3-wrap-blind", "the team key is not in the wrap the relay stores or in what inspect shows", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const published = upload(w, seal(w, w.lead, "field-guide.ec", 1, { body: "field-guide" }));
      if (!published.ok) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      wrap.key = w.teamKey.toString("hex");
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!served || served.ok !== true || !served.wrap || typeof served.wrap.ct !== "string" || served.wrap.ct.length < 32) return false;
      const opened = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: invitationId,
        wrap: served.wrap, teamDoc: w.teamDoc,
      });
      if (!opened || opened.ok !== true || !opened.key || !opened.key.equals(w.teamKey)) return false;
      if (leaksKey(served, w.teamKey) || leaksKey(served.wrap, w.teamKey)) return false;
      const seen = t.inspect({ relayTeamId: w.relayTeamId, id: published.id });
      return !!seen && !leaksKey(seen, w.teamKey) && hasText(seen, served.wrap.ct);
    }, true],
    ["S3-epoch", "a wrap from another epoch is refused, and the honest wrap reads a catalog with no later lead call", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const published = upload(w, seal(w, w.lead, "field-guide.ec", 1, { body: "field-guide" }));
      if (!published.ok) return false;
      const secret = crypto.randomBytes(16);
      const invitationId = wire.randomId();
      const wrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 1, w.teamKey);
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId, wrap: wrap });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!served || served.ok !== true) return false;
      const opened = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: invitationId,
        wrap: served.wrap, teamDoc: w.teamDoc,
      });
      if (!opened || opened.ok !== true || openCatalog(t, w, hello.session, published.id, opened.key) !== "field-guide") return false;
      const bad = sealInviteWrap(secret, w.relayTeamId, w.teamId, invitationId, 2, w.teamKey);
      const wrong = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: invitationId,
        wrap: bad, teamDoc: w.teamDoc,
      });
      return refused(wrong, "epoch");
    }, true],
    ["S3-reseal", "after a move a welcome invitation is served only the new wrap, and a dropped one gets nothing", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const openedId = wire.randomId();
      const quietId = wire.randomId();
      const dropId = wire.randomId();
      const oldOpened = sealInviteWrap(secret, w.relayTeamId, w.teamId, openedId, 1, w.teamKey);
      const oldQuiet = sealInviteWrap(secret, w.relayTeamId, w.teamId, quietId, 1, w.teamKey);
      const oldDrop = sealInviteWrap(secret, w.relayTeamId, w.teamId, dropId, 1, w.teamKey);
      const opened = t.invite({ relayTeamId: w.relayTeamId, invitationId: openedId, wrap: oldOpened });
      const quiet = t.invite({ relayTeamId: w.relayTeamId, invitationId: quietId, wrap: oldQuiet });
      const dropped = t.invite({ relayTeamId: w.relayTeamId, invitationId: dropId, wrap: oldDrop });
      if (!opened || !opened.token || !quiet || !quiet.token || !dropped || !dropped.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, opened, joiner);
      if (!hello.ok) return false;
      const before = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!before || before.ok !== true || before.wrap.ct !== oldOpened.ct) return false;
      const nextKey = wire.teamKey();
      const epochDoc = teamRev(w, 1, { epoch: 2 });
      const published = upload(w, seal(w, w.lead, "field-guide.ec", 1, { body: "field-guide", epoch: 2, teamKey: nextKey }));
      if (!published.ok) return false;
      const newOpened = sealInviteWrap(secret, w.relayTeamId, w.teamId, openedId, 2, nextKey);
      const newQuiet = sealInviteWrap(secret, w.relayTeamId, w.teamId, quietId, 2, nextKey);
      const stray = sealInviteWrap(secret, w.relayTeamId, w.teamId, dropId, 2, nextKey);
      const moved = t.reseal({
        relayTeamId: w.relayTeamId,
        drop: [dropId],
        wraps: [
          { id: openedId, wrap: newOpened },
          { id: quietId, wrap: newQuiet },
          { id: dropId, wrap: stray },
        ],
      });
      if (!moved || moved.ok !== true) return false;
      const after = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!after || after.ok !== true || after.wrap.ct !== newOpened.ct) return false;
      const openedKey = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: openedId,
        wrap: after.wrap, teamDoc: epochDoc,
      });
      if (!openedKey || openedKey.ok !== true || openCatalog(t, w, hello.session, published.id, openedKey.key) !== "field-guide") return false;
      const helloQuiet = bindHello(t, w.relayTeamId, quiet, wire.generateKey());
      if (!helloQuiet.ok) return false;
      const quietServed = t.fetchWrap({ relayTeamId: w.relayTeamId, session: helloQuiet.session });
      if (!quietServed || quietServed.ok !== true || quietServed.wrap.ct !== newQuiet.ct) return false;
      const quietKey = t.openWrap({
        secret: secret, relayTeamId: w.relayTeamId, teamId: w.teamId, invitationId: quietId,
        wrap: quietServed.wrap, teamDoc: epochDoc,
      });
      if (!quietKey || quietKey.ok !== true || openCatalog(t, w, helloQuiet.session, published.id, quietKey.key) !== "field-guide") return false;
      const helloDrop = bindHello(t, w.relayTeamId, dropped, wire.generateKey());
      if (helloDrop.ok === true) return false;
      const seen = t.inspect({ relayTeamId: w.relayTeamId, id: published.id });
      if (!seen || hasText(seen, oldOpened.ct) || hasText(seen, oldQuiet.ct) || hasText(seen, oldDrop.ct) || hasText(seen, stray.ct)) return false;
      return hasText(seen, newOpened.ct) && hasText(seen, newQuiet.ct);
    }, true],
    ["S3-cancel", "a drop after a use names that invitation, and the wrap is gone at once", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const marker = upload(w, seal(w, w.lead, "field-guide.ec", 1, { body: "field-guide" }));
      if (!marker.ok) return false;
      const secret = crypto.randomBytes(16);
      const usedId = wire.randomId();
      const unusedId = wire.randomId();
      const usedWrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, usedId, 1, w.teamKey);
      const unusedWrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, unusedId, 1, w.teamKey);
      const used = t.invite({ relayTeamId: w.relayTeamId, invitationId: usedId, wrap: usedWrap });
      const unused = t.invite({ relayTeamId: w.relayTeamId, invitationId: unusedId, wrap: unusedWrap });
      if (!used || !used.token || !unused || !unused.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, used, joiner);
      if (!hello.ok) return false;
      const before = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!before || before.ok !== true || before.wrap.ct !== usedWrap.ct) return false;
      const answer = t.drop({ relayTeamId: w.relayTeamId, ids: [usedId, unusedId] });
      if (!answer || answer.ok !== true || !Array.isArray(answer.used) || answer.used.length !== 1 || answer.used[0] !== usedId) return false;
      if (answer.used.indexOf(unusedId) >= 0) return false;
      const after = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      const seen = t.inspect({ relayTeamId: w.relayTeamId, id: marker.id });
      return wrapGone(after) && !!seen && !hasText(seen, usedWrap.ct) && !hasText(seen, unusedWrap.ct);
    }, true],
    ["S3-lapse", "a hello on day 6 is served, a first hello on day 8 is refused unspent, and the bound re-fetch is served", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const secret = crypto.randomBytes(16);
      const earlyId = wire.randomId();
      const lateId = wire.randomId();
      const until = 7 * DAY;
      const earlyWrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, earlyId, 1, w.teamKey);
      const lateWrap = sealInviteWrap(secret, w.relayTeamId, w.teamId, lateId, 1, w.teamKey);
      const early = t.invite({ relayTeamId: w.relayTeamId, invitationId: earlyId, wrap: earlyWrap, until: until });
      const late = t.invite({ relayTeamId: w.relayTeamId, invitationId: lateId, wrap: lateWrap, until: until });
      if (!early || !early.token || !late || !late.token) return false;
      t.advance(6 * DAY);
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, early, joiner);
      if (!hello.ok) return false;
      const firstServe = t.fetchWrap({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!firstServe || firstServe.ok !== true || firstServe.wrap.ct !== earlyWrap.ct) return false;
      t.advance(2 * DAY);
      const lapsed = bindHello(t, w.relayTeamId, late, wire.generateKey());
      if (!refused(lapsed, "invite-ended")) return false;
      const again = bindHello(t, w.relayTeamId, late, wire.generateKey());
      if (!refused(again, "invite-ended")) return false;
      const resumed = helloAs(t, w.relayTeamId, joiner);
      if (!resumed.ok) return false;
      const served = t.fetchWrap({ relayTeamId: w.relayTeamId, session: resumed.session });
      return !!served && served.ok === true && served.wrap && served.wrap.ct === earlyWrap.ct;
    }, true],
    ["S3-read-on", "after the upload the bound key reads only its answer, which is missing until the lead writes it, and a second upload is refused", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const invitationId = wire.randomId();
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const deskId = "k-" + wire.randomId().slice(0, 16);
      const joined = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 1, "desk:" + deskId, { body: "join" }));
      if (!joined.ok) return false;
      t.advance(25 * 60 * 1000);
      const first = upload(w, seal(w, w.lead, "guide-a.ec", 1, { body: "edition-25" }));
      if (!first.ok) return false;
      const listed = t.list({ relayTeamId: w.relayTeamId, session: hello.session });
      const fetched = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: first.id });
      const heard = t.subscribe({ relayTeamId: w.relayTeamId, session: hello.session });
      if (!refused(listed, "not-enrolled") || !refused(fetched, "not-enrolled") || !refused(heard, "not-enrolled")) return false;
      if (!refused(t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: invitationId }), "missing")) return false;
      const answer = sealAt(w, w.lead, "join-answer.json", 2, "answer:" + invitationId, { body: "joined", id: invitationId });
      const posted = upload(w, answer);
      if (!posted.ok || posted.id !== invitationId) return false;
      const opened = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: invitationId });
      if (!opened || opened.ok !== true || opened.id !== invitationId) return false;
      if (!refused(t.list({ relayTeamId: w.relayTeamId, session: hello.session }), "not-enrolled")) return false;
      const lead = helloAs(t, w.relayTeamId, w.lead);
      const leadList = t.list({ relayTeamId: w.relayTeamId, session: lead.session });
      const leadFetch = t.fetch({ relayTeamId: w.relayTeamId, session: lead.session, id: invitationId });
      if (!lead.ok || !leadList || leadList.ok !== true || leadList.ids.indexOf(first.id) < 0 || leadList.ids.indexOf(invitationId) >= 0) return false;
      if (!refused(leadFetch, "missing")) return false;
      const desk = helloAs(t, w.relayTeamId, w.desk);
      if (!desk.ok || !refused(t.fetch({ relayTeamId: w.relayTeamId, session: desk.session, id: invitationId }), "missing")) return false;
      t.advance(6 * 60 * 1000);
      const secondCatalog = upload(w, seal(w, w.lead, "guide-b.ec", 3, { body: "edition-31" }));
      if (!secondCatalog.ok) return false;
      const resumed = helloAs(t, w.relayTeamId, joiner);
      if (!resumed.ok || resumed.invite !== true) return false;
      const againAnswer = t.fetch({ relayTeamId: w.relayTeamId, session: resumed.session, id: invitationId });
      const againCatalog = t.fetch({ relayTeamId: w.relayTeamId, session: resumed.session, id: secondCatalog.id });
      if (!againAnswer || againAnswer.ok !== true || !refused(againCatalog, "not-enrolled")) return false;
      if (!refused(t.list({ relayTeamId: w.relayTeamId, session: resumed.session }), "not-enrolled")) return false;
      const again = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 2, "desk:" + deskId, { body: "again" }));
      if (!refused(again, "token-spent")) return false;
      const dropped = t.drop({ relayTeamId: w.relayTeamId, ids: [invitationId] });
      if (!dropped || dropped.ok !== true) return false;
      if (!refused(t.list({ relayTeamId: w.relayTeamId, session: resumed.session }), "no-hello")) return false;
      if (!refused(t.fetch({ relayTeamId: w.relayTeamId, session: resumed.session, id: invitationId }), "no-hello")) return false;
      const enrolled = t.enrol({ relayTeamId: w.relayTeamId, deskId: deskId, keyId: joiner.keyId });
      if (!enrolled || enrolled.ok === false) return false;
      const device = helloAs(t, w.relayTeamId, joiner);
      if (!device.ok || device.invite === true) return false;
      const live = t.list({ relayTeamId: w.relayTeamId, session: device.session });
      const deviceAnswer = t.fetch({ relayTeamId: w.relayTeamId, session: device.session, id: invitationId });
      return !!live && live.ok === true && live.ids.indexOf(first.id) >= 0 && live.ids.indexOf(secondCatalog.id) >= 0
        && live.ids.indexOf(invitationId) < 0 && refused(deviceAnswer, "missing");
    }, true],
    ["S3-states", "an invitation reads unused, then used at the relay's time, then asked, and the time stays", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      t.advance(5000);
      const lead = helloAs(t, w.relayTeamId, w.lead);
      if (!lead.ok) return false;
      const invitationId = wire.randomId();
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId });
      if (!inv || !inv.token) return false;
      const unused = t.inviteStates({ relayTeamId: w.relayTeamId, session: lead.session });
      if (!unused || unused.ok !== true) return false;
      const row0 = unused.states.filter(function (s) { return s.id === invitationId; })[0];
      if (!row0 || row0.state !== "unused" || row0.usedAt !== null) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const used = t.inviteStates({ relayTeamId: w.relayTeamId, session: lead.session });
      const row1 = used && used.states ? used.states.filter(function (s) { return s.id === invitationId; })[0] : null;
      if (!row1 || row1.state !== "used" || row1.usedAt !== 5000) return false;
      const deskId = "k-" + wire.randomId().slice(0, 16);
      const joined = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 1, "desk:" + deskId, { body: "join" }));
      if (!joined.ok) return false;
      const asked = t.inviteStates({ relayTeamId: w.relayTeamId, session: lead.session });
      const row2 = asked && asked.states ? asked.states.filter(function (s) { return s.id === invitationId; })[0] : null;
      if (!row2 || row2.state !== "asked" || row2.usedAt !== 5000) return false;
      const own = t.inviteStates({ relayTeamId: w.relayTeamId, session: hello.session });
      const desk = helloAs(t, w.relayTeamId, w.desk);
      const deskStates = t.inviteStates({ relayTeamId: w.relayTeamId, session: desk.session });
      return refused(own, "not-enrolled") && desk.ok === true && refused(deskStates, "not-enrolled");
    }, true],
    ["S3-invite-place", "an invitation upload at invite:<id> or a held desk's place is outside its place, a bad signature is refused, and desk:<id> is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: wire.randomId() });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const blob = sealAt(w, joiner, "join.json", 1, "invite:" + wire.randomId(), { body: "join" });
      const bad = upload(w, blob);
      if (!refused(bad, "outside-place")) return false;
      blob.place = "desk:" + w.deskId;
      const heldDesk = upload(w, blob);
      if (!refused(heldDesk, "outside-place")) return false;
      const freshPlace = "desk:" + ("k-" + wire.randomId().slice(0, 16));
      const forged = sealAt(w, joiner, "join.json", 1, freshPlace, { body: "join" });
      forged.signature = corrupt(forged.signature);
      const badSig = upload(w, forged);
      if (!refused(badSig, "bad-signature")) return false;
      blob.place = "desk:" + ("k-" + wire.randomId().slice(0, 16));
      const good = upload(w, blob);
      return !!good && good.ok === true && good.id === blob.id;
    }, true],
    ["S3-enrolled-up", "a desk that joined through an invitation uploads at its own place once it is enrolled", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: wire.randomId() });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const deskId = "k-" + wire.randomId().slice(0, 16);
      const joined = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 1, "desk:" + deskId, { body: "join" }));
      if (!joined.ok) return false;
      const enrolled = t.enrol({ relayTeamId: w.relayTeamId, deskId: deskId, keyId: joiner.keyId });
      if (!enrolled || enrolled.ok === false) return false;
      const ownBlob = sealAt(w, joiner, "desks/" + deskId + "/notes.ec", 2, "desk:" + deskId, { body: "kept" });
      const own = upload(w, ownBlob);
      return !!own && own.ok === true && own.id === ownBlob.id;
    }, true],
    ["S3-answer-place", "an enrolled desk's upload at answer:<invitation id> and a lead's answer whose blob id is not the place's are outside its place, the bound session is served neither, and the lead's own answer is kept", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const invitationId = wire.randomId();
      const inv = t.invite({ relayTeamId: w.relayTeamId, invitationId: invitationId });
      if (!inv || !inv.token) return false;
      const joiner = wire.generateKey();
      const hello = bindHello(t, w.relayTeamId, inv, joiner);
      if (!hello.ok) return false;
      const deskId = "k-" + wire.randomId().slice(0, 16);
      const joined = upload(w, sealAt(w, joiner, "desks/" + deskId + "/join.json", 1, "desk:" + deskId, { body: "join" }));
      if (!joined.ok) return false;
      const place = "answer:" + invitationId;
      /* The product records a desk key when its seal runs. The odd place is not that call. */
      seal(w, w.desk, deskFile(w, "edit.ec"), 1, { body: "key" });
      const byDesk = upload(w, sealAt(w, w.desk, "join-answer.json", 1, place, { body: "forged", id: invitationId }));
      const strayId = sealAt(w, w.lead, "join-answer.json", 1, place, { body: "stray" });
      const byLead = upload(w, strayId);
      if (!refused(byDesk, "outside-place") || !refused(byLead, "outside-place")) return false;
      const servedDesk = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: invitationId });
      const servedStray = t.fetch({ relayTeamId: w.relayTeamId, session: hello.session, id: strayId.id });
      if (!refusedOneOf(servedDesk, ["missing", "not-enrolled"]) || !refusedOneOf(servedStray, ["missing", "not-enrolled"])) return false;
      const answer = sealAt(w, w.lead, "join-answer.json", 2, place, { body: "joined", id: invitationId });
      const posted = upload(w, answer);
      return !!posted && posted.ok === true && posted.id === invitationId;
    }, true],
  ];
}

const targetPath = process.env.RELAY_TARGET;
if (!targetPath) {
  console.log("FAIL harness RELAY_TARGET is unset");
  console.log("#counts ok=0 fail=1");
  console.log("#positive 0");
  process.exit(1);
}

const loaded = require(resolve(targetPath));
const createTarget = loaded.createTarget;
const list = attacks();
let ok = 0;
let fail = 0;
let positive = 0;
for (let i = 0; i < list.length; i++) {
  if (list[i][3] === true) positive += 1;
  const id = list[i][0];
  const title = list[i][1];
  const fn = list[i][2];
  let held = false;
  let error = "";
  try {
    held = fn(createTarget) === true;
  } catch (e) {
    held = false;
    error = " threw " + (e && e.message ? e.message : String(e));
  }
  if (held) ok += 1;
  else fail += 1;
  console.log((held ? "ok" : "FAIL") + " " + id + " " + title + error);
}
console.log("#counts ok=" + ok + " fail=" + fail);
console.log("#positive " + positive);
process.exit(fail);
