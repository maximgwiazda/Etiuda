"use strict";

/* Trusts every caller. No check from the contract is applied.
   Storage exists so a read has something to leak. */

const wire = require("../wire.cjs");

function createTarget() {
  let now = 0;
  let seq = 0;
  const records = new Map();
  const subscribers = [];
  const mirror = new Map();

  function naiveAad(blob) {
    return wire.aadBytes(blob, { team: true, epoch: true, id: true, counter: false });
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

  function start() {
    return { ok: true };
  }

  function pin() {
    return { ok: true };
  }

  function createTeam({ teamId, lead }) {
    const relayTeamId = wire.randomId();
    return { relayTeamId: relayTeamId, teamId: teamId, lead: lead.keyId };
  }

  function addEpoch() {
    return { ok: true };
  }

  function enrol() {
    return { ok: true };
  }

  function removeDesk() {
    return { ok: true };
  }

  function invite() {
    const token = wire.randomId() + wire.randomId();
    return { token: token, invitationId: wire.randomId() };
  }

  function challenge() {
    return { nonce: wire.randomId() };
  }

  function hello() {
    return { ok: true, session: wire.randomId() };
  }

  function helloMessage(relayTeamId, nonce, keyId) {
    return wire.helloMessage(relayTeamId, nonce, keyId);
  }

  function list({ relayTeamId }) {
    const ids = listRecords(relayTeamId).map(function (r) { return r.id; });
    return { ok: true, served: true, ids: ids };
  }

  function fetch({ relayTeamId, id }) {
    const rec = findRecord(relayTeamId, id);
    const text = rec && rec.plaintext != null ? String(rec.plaintext) : "leak";
    return { ok: true, served: true, id: id, ciphertext: Buffer.from(text) };
  }

  function subscribe({ relayTeamId }) {
    const sub = { relayTeamId: relayTeamId, events: [] };
    subscribers.push(sub);
    return { ok: true, served: true, events: sub.events };
  }

  function upload({ relayTeamId, blob }) {
    seq += 1;
    const id = blob && blob.path ? wire.pathId(blob.path) : "fixed-id";
    const rec = {
      relayTeamId: relayTeamId,
      id: id,
      path: blob ? blob.path : undefined,
      plaintext: blob ? blob.body : undefined,
      ciphertext: Buffer.from("not-the-ciphertext"),
      size: blob && blob.body ? String(blob.body).length : 1,
      deletion: !!(blob && blob.deletion),
      superseded: false,
    };
    records.set(relayTeamId + ":" + id, rec);
    const msg = { seq: seq, id: id, size: rec.size, path: blob && blob.path ? blob.path : "guide.ec" };
    subscribers.forEach(function (sub) {
      if (sub.relayTeamId === relayTeamId) sub.events.push(msg);
    });
    return { ok: true, seq: seq, id: id };
  }

  function fetchDeletion({ relayTeamId, id }) {
    return { ok: true, served: true, id: id, relayTeamId: relayTeamId };
  }

  function epochMove({ relayTeamId }) {
    listRecords(relayTeamId).forEach(function (rec) {
      rec.ciphertext = Buffer.concat([Buffer.from("reseal"), rec.ciphertext]);
    });
    return { resealed: true };
  }

  function inspect({ relayTeamId, id }) {
    const rec = findRecord(relayTeamId, id);
    return rec ? Object.assign({}, rec) : null;
  }

  function seal(opts) {
    const id = opts.id || wire.randomId();
    const blob = {
      id: id,
      relayTeamId: opts.relayTeamId,
      epoch: opts.epoch,
      supersedes: opts.supersedes || null,
      writerKeyId: opts.writer.keyId,
      counter: opts.counter,
      place: opts.place,
      deletion: opts.kind === "delete",
      path: opts.path,
      body: opts.body || "",
    };
    const aad = naiveAad(blob);
    const raw = Buffer.from(JSON.stringify({
      kind: opts.kind || "file",
      path: opts.path,
      body: blob.body,
    }), "utf8");
    const sealed = wire.encrypt(opts.teamKey, aad, raw);
    blob.nonce = sealed.nonce;
    blob.ciphertext = sealed.ciphertext;
    blob.plainLength = raw.length;
    blob.signature = wire.sign(opts.writer.privateKey, wire.uploadMessage(aad, sealed.ciphertext));
    return blob;
  }

  function acceptBlob({ teamKey, blob }) {
    let path = (blob && blob.path) || "wrong.ec";
    let body = (blob && blob.body) || "leaked";
    let kind = blob && blob.deletion ? "delete" : "file";
    try {
      const inner = wire.open(teamKey, naiveAad(blob), blob.nonce, blob.ciphertext);
      kind = inner.kind || kind;
      body = inner.body;
      if (!(blob && blob.path)) path = inner.path || path;
    } catch (e) { /* a blob that does not open is still taken */ }
    if (kind === "delete") {
      mirror.delete(path);
      return { ok: true, deleted: true, path: path };
    }
    mirror.set(path, body);
    return { ok: true, path: path };
  }

  function loadTeamFile(doc) {
    return { ok: true, rev: Number(doc && doc.rev) || 0 };
  }

  function showFreshness({ head, now: at }) {
    const time = 0;
    const age = (at || 0) - time;
    return {
      shown: true,
      blocked: age > 60 * 60 * 1000,
      time: time,
      epoch: head ? head.epoch : null,
      rev: head ? head.rev : null,
      ageMs: age,
    };
  }

  function syncMirror() {
    mirror.clear();
    return { ok: true };
  }

  function considerOutgoing() {
    return { send: true };
  }

  function readRing({ looseRing }) {
    return { source: looseRing ? "loose" : "none", ring: looseRing || null };
  }

  function verifyDeskSignature() {
    return { ok: true };
  }

  function verifyUploadSignature() {
    return { ok: true };
  }

  function programAllowUpload() {
    if (now > 0) {
      return {
        ok: false,
        reason: "rate",
        said: "That many uploads in a minute is more than the relay accepts.",
        served: false,
      };
    }
    return { ok: true };
  }

  function restart() {
    return { ok: true };
  }

  function readMirror(path) {
    return mirror.has(path) ? mirror.get(path) : null;
  }

  function advance(ms) {
    now += ms || 0;
    return now;
  }

  start();
  return {
    start, pin, createTeam, addEpoch, enrol, removeDesk, invite, challenge, hello, helloMessage,
    list, fetch, subscribe, upload, fetchDeletion, epochMove, inspect, seal, acceptBlob,
    loadTeamFile, showFreshness, syncMirror, considerOutgoing, readRing,
    verifyDeskSignature, verifyUploadSignature, programAllowUpload, restart,
    readMirror, advance,
  };
}

module.exports = { createTarget };
