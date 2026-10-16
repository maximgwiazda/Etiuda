/* Drives every relay attack against the adapter in RELAY_TARGET.
   One ok or FAIL line per attack, then a #counts line. Exit code is the failure count.
   The fourth slot is true when the attack requires an honest success as well as a refusal. */

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

function accept(w, blob, attack) {
  const handed = relayBlob(blob);
  if (attack && Object.prototype.hasOwnProperty.call(attack, "path")) handed.path = attack.path;
  return w.target.acceptBlob({
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
      const a = t.challenge({ relayTeamId: w.relayTeamId });
      const first = t.hello({
        relayTeamId: w.relayTeamId, nonce: a.nonce, invitationId: inv.invitationId, token: inv.token,
      });
      const b = t.challenge({ relayTeamId: w.relayTeamId });
      const second = t.hello({
        relayTeamId: w.relayTeamId, nonce: b.nonce, invitationId: inv.invitationId, token: inv.token,
      });
      return first.ok === true && refused(second, "token-spent");
    }, true],
    ["F1-tries", "the right token is refused after 20 failures, and a fresh invitation still works", function (create) {
      const t = create();
      const w = world(t);
      if (!w) return false;
      const inv = t.invite({ relayTeamId: w.relayTeamId });
      if (!inv || !inv.token) return false;
      let twentieth = null;
      for (let i = 1; i <= wire.TOKEN_TRIES; i++) {
        const ch = t.challenge({ relayTeamId: w.relayTeamId });
        twentieth = t.hello({
          relayTeamId: w.relayTeamId, nonce: ch.nonce, invitationId: inv.invitationId, token: "wrong-" + i,
        });
      }
      if (twentieth && twentieth.reason === "token-tries") return false;
      const ch = t.challenge({ relayTeamId: w.relayTeamId });
      const last = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch.nonce, invitationId: inv.invitationId, token: inv.token,
      });
      const inv2 = t.invite({ relayTeamId: w.relayTeamId });
      const ch2 = t.challenge({ relayTeamId: w.relayTeamId });
      const other = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch2.nonce, invitationId: inv2.invitationId, token: inv2.token,
      });
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
      const good = accept(w, seal(w, w.lead, "notes.ec", 2, { body: "kept" }));
      return refused(bad, "bad-path") && good.ok === true && t.readMirror("notes.ec") === "kept";
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
      const good = accept(w, seal(w, w.desk, deskFile(w, "join.json"), 1, { body: "own" }));
      return refused(bad, "bad-signature") && good.ok === true && t.readMirror(deskFile(w, "join.json")) === "own";
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
      const ch1 = t.challenge({ relayTeamId: w.relayTeamId });
      const bad = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch1.nonce, invitationId: inv.invitationId, token: hash,
      });
      const ch2 = t.challenge({ relayTeamId: w.relayTeamId });
      const good = t.hello({
        relayTeamId: w.relayTeamId, nonce: ch2.nonce, invitationId: inv.invitationId, token: inv.token,
      });
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
