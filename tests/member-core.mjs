/* The member core, sliced out of shell/main.js and driven on invented fixtures. A desk's shell calls
 * these through its own glue; this file never loads that shell. What it holds is the request a
 * member writes and what heeding a team file decides.
 *
 *     node tests/member-core.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE DECLARATIONS ARE SLICED, AS A SECOND PROGRAM WILL SLICE THEM. They are cut out of shell/main.js
 * by the marker list and evaluated with crypto and Buffer as their only names, so a free name fails
 * here as it would there. The join list Studio already slices is cut again beside them, and a request
 * this core writes is genuine under that list once it is signed.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 18;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* The same cut Studio's rulesFrom uses: a function by its braces, a const by the semicolon outside them. */
function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("no " + JSON.stringify(marker) + " in shell/main.js");
  if (src.indexOf(marker, at + 1) >= 0) throw new Error(JSON.stringify(marker) + " is in shell/main.js twice");
  const isFn = marker.startsWith("function");
  let par = 0, brk = 0, brc = 0, sawBrace = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; sawBrace = true; }
    else if (ch === "}") {
      brc--;
      if (isFn && sawBrace && !par && !brk && !brc) return src.slice(at, i + 1);
    } else if (ch === ";" && !par && !brk && !brc && !isFn) return src.slice(at, i + 1);
  }
  throw new Error("an unterminated declaration: " + marker);
}
function load(src, markers, names) {
  const body = markers.map(m => sliceDecl(src, m)).join("\n");
  return new Function("crypto", "Buffer", body + "\nreturn { " + names.join(", ") + " };")(crypto, Buffer);
}

/* What a slice of the member core needs, in the order a reader finds them in shell/main.js.
   hpkeSeal, wrapTeamKey and branchIdOf are not on this list: the heed opens a wrap, it does not make one. */
const MEMBER_DECLS = ["const HPKE_KEM =", "const HPKE_SUITE =", "const SPKI_X25519 =", "function hpkeLabeledExtract(",
  "function hpkeLabeledExpand(", "function hpkeX25519Public(", "function hpkeShared(", "function hpkeSchedule(",
  "function hpkeOpen(", "const SEALED_TEAM_RE =", "const TEAM_WRAP_LABEL =", "function teamWrapInfo(",
  "function unwrapTeamKey(", "const JOIN_KIND =", "const HANDOVER_PREFIX =", "const HANDOVER_KIND =",
  "function handoverSignedBytes(", "function handoverGenuine(", "function handedTo(", "const SPKI_ED25519 =",
  "function canonJson(", "function signedBytesOf(", "function teamWhole(", "function memberRingVouches(",
  "function memberStateCopy(", "function memberProof(", "function inviteCode(", "function inviteIdOf(", "const INVITE_HIDDEN_RE =", "function inviteFolder(",
  "function inviteRead(", "function folderHost(",
  "function memberRequestDoc(", "function memberHeed("];
const BUILD_DECLS = ["function hpkeSeal(", "function wrapTeamKey(", "function branchIdOf("];
const JOIN_DECLS = ["const SPKI_ED25519 =", "function branchIdOf(", "function canonJson(", "function signedBytesOf(",
  "const SEALED_TEAM_RE =", "const JOIN_PREFIX =", "const JOIN_KIND =", "const JOIN_HEX_RE =", "function joinHash(",
  "function joinCommit(", "function joinCode(", "function joinSignedBytes(", "function joinGenuine(", "function joinOpening("];

const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
let M = null, J = null;
try {
  M = load(SRC, MEMBER_DECLS.concat(BUILD_DECLS),
    ["memberRequestDoc", "memberHeed", "memberProof", "inviteCode", "inviteIdOf", "inviteRead", "folderHost", "wrapTeamKey", "branchIdOf", "signedBytesOf", "teamWhole"]);
  J = load(SRC, JOIN_DECLS, ["joinCommit", "joinCode", "joinSignedBytes", "joinGenuine"]);
  check(true,
    "16a the " + MEMBER_DECLS.length + " member declarations slice out of shell/main.js and evaluate with crypto and Buffer alone,"
    + " and the " + JOIN_DECLS.length + " join declarations still do");
} catch (e) {
  check(false, "16a the member declarations do not slice - " + (e && e.message));
}

const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const hex = n => crypto.randomBytes(n).toString("hex");
const FILE = "quay/etiuda-team.json";
const ASKED = 1700000000000, ASKED_ISO = "2023-11-14T22:13:20.000Z";

function empty() { return { pins: {}, keys: {}, barred: [], join: null }; }
function signTeam(doc, privateKey) {
  const out = JSON.parse(JSON.stringify(doc));
  out.sig = { alg: "Ed25519", keyId: out.lead.keyId };
  out.sig.value = crypto.sign(null, M.signedBytesOf(out), privateKey).toString("hex");
  return out;
}
function teamDoc(lead, epoch, roster, privateKey) {
  return signTeam({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["quay-board"], lead: lead,
    sealed: true, exportsSealed: false, epoch: epoch, roster: roster }, privateKey);
}

let TEAM = "", me = null, lead = null, leadKey = null, otherLead = null, otherKey = null, box = null;
if (M && J) {
  const sign = crypto.generateKeyPairSync("ed25519");
  box = crypto.generateKeyPairSync("x25519");
  leadKey = crypto.generateKeyPairSync("ed25519");
  otherKey = crypto.generateKeyPairSync("ed25519");
  const signPub = pubHex(sign.publicKey), boxPub = pubHex(box.publicKey);
  me = { id: M.branchIdOf(signPub), key: signPub, box: boxPub };
  lead = { keyId: "quay-lead", public: pubHex(leadKey.publicKey) };
  otherLead = { keyId: "quay-other", public: pubHex(otherKey.publicKey) };
  TEAM = "t-" + hex(8);
  const nonce = hex(32);
  const commit = J.joinCommit(TEAM, me.key, me.box, nonce);
  const j = { team: TEAM, nonce: nonce, commit: commit, asked: ASKED, name: "Quay desk" };
  const raw = M.memberRequestDoc(j, null, me);
  const want = { format: 1, kind: "etiuda-join", team: TEAM,
    desk: { id: me.id, key: me.key, box: me.box, name: "Quay desk" }, date: ASKED_ISO, commit: commit };
  const signed = JSON.parse(JSON.stringify(raw));
  signed.sig = { alg: "Ed25519", keyId: me.id };
  signed.sig.value = crypto.sign(null, J.joinSignedBytes(signed), sign.privateKey).toString("hex");
  const flipped = JSON.parse(JSON.stringify(signed));
  flipped.sig.value = (flipped.sig.value[0] === "a" ? "b" : "a") + flipped.sig.value.slice(1);
  check(JSON.stringify(raw) === JSON.stringify(want) && J.joinGenuine(signed, me.id) === true && J.joinGenuine(flipped, me.id) === false,
    "16b a request for this member and this join is the document the desk writes, and once signed it is genuine under the join rule: "
    + JSON.stringify(raw));

  const opening = { lead: { keyId: lead.keyId, public: lead.public }, nonce: hex(32) };
  const shown = M.memberRequestDoc(j, opening, me);
  const bare = M.memberRequestDoc(Object.assign({}, j, { name: "" }), null, me);
  const shownSigned = JSON.parse(JSON.stringify(shown));
  shownSigned.sig = { alg: "Ed25519", keyId: me.id };
  shownSigned.sig.value = crypto.sign(null, J.joinSignedBytes(shownSigned), sign.privateKey).toString("hex");
  check(shown.reveal === nonce && shown.opened === opening && J.joinGenuine(shownSigned, me.id) === true
      && !Object.prototype.hasOwnProperty.call(bare.desk, "name") && bare.commit === commit && bare.date === ASKED_ISO,
    "16c a reveal carries the nonce and that opening, an empty name is left off, and the revealed request is genuine: "
    + (shown.reveal === nonce) + ", name left off " + (!Object.prototype.hasOwnProperty.call(bare.desk, "name")));

  const K1 = crypto.randomBytes(32);
  const wrap1 = M.wrapTeamKey(K1, me.box, TEAM, 1, me.id);
  const roster = [{ desk: { id: me.id, key: me.key, box: me.box }, wrap: wrap1 }];
  const genuine = teamDoc(lead, 1, roster, leadKey.privateKey);
  const seen = { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: null };
  const first = M.memberHeed(genuine, { pins: {}, keys: {}, barred: ["t-aaaaaaaaaaaaaaaa"], join: null }, seen);
  const heldBar = M.memberHeed(genuine, { pins: {}, keys: {}, barred: [TEAM], join: null }, seen);
  check(first.stop === false && first.pinned === true && first.unbar === true && first.changed === true && first.keep === true
      && first.epoch === 1 && first.key && first.key.equals(K1) && first.said.length === 0
      && first.state.pins[TEAM].keyId === lead.keyId && first.state.pins[TEAM].public === lead.public
      && first.state.barred.length === 1 && first.state.barred[0] === "t-aaaaaaaaaaaaaaaa"
      && first.state.keys[TEAM] === undefined
      && heldBar.stop === true && heldBar.pinned === false && heldBar.keep === false && heldBar.said.length === 0
      && Object.keys(heldBar.state.pins).length === 0,
    "16d a genuine team file pins its lead and returns this member's wrapped key, saying nothing, and a bar on that team admits nothing: "
    + "pinned " + first.pinned + ", keep " + first.keep + ", barred stopped " + heldBar.stop + ", barred said " + heldBar.said.length);

  const bad = JSON.parse(JSON.stringify(genuine));
  bad.sig.value = (bad.sig.value[0] === "a" ? "b" : "a") + bad.sig.value.slice(1);
  const refused = M.memberHeed(bad, empty(), seen);
  const notWhole = FILE + " is not a team file whole under its lead's key, so nothing in it is used";
  check(refused.stop === true && refused.pinned === false && refused.keep === false && refused.key === null
      && refused.said.length === 1 && refused.said[0] === notWhole && Object.keys(refused.state.pins).length === 0,
    "16e a team file whose signature does not verify is refused in those words and pins nothing: "
    + JSON.stringify(refused.said));

  const foreign = teamDoc(otherLead, 1, roster, otherKey.privateKey);
  const pinned = { pins: {}, keys: {}, barred: [], join: null };
  pinned.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
  const beforePins = JSON.stringify(pinned);
  const wrong = M.memberHeed(foreign, pinned, seen);
  const unpinned = FILE + " is signed by a key other than the lead's this desk trusts for team " + TEAM + ", so nothing in it is used";
  check(wrong.stop === true && wrong.keep === false && wrong.pinned === false && wrong.key === null
      && wrong.said.length === 1 && wrong.said[0] === unpinned && JSON.stringify(pinned) === beforePins
      && wrong.state.pins[TEAM].public === lead.public,
    "16f a team file under a key other than the pinned lead, with no handover, is refused in those words and changes nothing: "
    + JSON.stringify(wrong.said));

  const stranger = crypto.generateKeyPairSync("x25519");
  const strangerPub = pubHex(stranger.publicKey);
  const strangerId = M.branchIdOf(strangerPub);
  const theirWrap = M.wrapTeamKey(crypto.randomBytes(32), strangerPub, TEAM, 1, strangerId);
  const noWrap = teamDoc(lead, 1, [{ desk: { id: strangerId, key: hex(32), box: strangerPub }, wrap: theirWrap }], leadKey.privateKey);
  const step1 = M.memberHeed(noWrap, empty(), { file: FILE, member: { id: me.id, sk: box.privateKey } });
  const ring = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] };
  const step2 = M.memberHeed(noWrap, empty(), { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: ring });
  const elsewhere = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "other-board", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] };
  const step3 = M.memberHeed(noWrap, empty(), { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: elsewhere });
  check(step1.needRing === true && step1.stop === false && step1.keep === false && step1.key === null && step1.pinned === false
      && step2.stop === false && step2.pinned === true && step2.keep === false && step2.key === null && step2.said.length === 0
      && step2.state.pins[TEAM].public === lead.public
      && step3.stop === true && step3.pinned === false && step3.keep === false && Object.keys(step3.state.pins).length === 0,
    "16g a file naming no wrap for this member asks for the ring; a ring that vouches pins the lead and returns no key,"
    + " and a ring for another catalog pins nothing: needRing " + step1.needRing + ", vouched pin " + step2.pinned
    + ", other catalog stopped " + step3.stop);

  const K2 = crypto.randomBytes(32);
  const wrap2 = M.wrapTeamKey(K2, me.box, TEAM, 2, me.id);
  const newer = teamDoc(lead, 2, [{ desk: { id: me.id, key: me.key, box: me.box }, wrap: wrap2 }], leadKey.privateKey);
  const held = { pins: {}, keys: {}, barred: [], join: null };
  held.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
  held.keys[TEAM] = { 1: "sealed-one" };
  const heldBefore = JSON.stringify(held);
  const next = M.memberHeed(newer, held, seen);
  const againState = { pins: {}, keys: {}, barred: [], join: null };
  againState.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
  againState.keys[TEAM] = { 1: "sealed-one", 2: "sealed-two" };
  const again = M.memberHeed(newer, againState, seen);
  check(next.keep === true && next.epoch === 2 && next.key && next.key.equals(K2) && next.pinned === false && next.said.length === 0
      && next.state.keys[TEAM][1] === "sealed-one" && next.state.keys[TEAM][2] === undefined
      && again.keep === false && again.epoch === 2 && again.key && again.key.equals(K2)
      && again.state.keys[TEAM][1] === "sealed-one" && again.state.keys[TEAM][2] === "sealed-two"
      && JSON.stringify(held) === heldBefore,
    "16h a newer epoch is kept beside the key already held, and an epoch already kept is not replaced: "
    + "keep " + next.keep + ", old " + (next.state.keys[TEAM] && next.state.keys[TEAM][1])
    + ", again keep " + again.keep + ", again epoch 2 " + (again.state.keys[TEAM] && again.state.keys[TEAM][2]));

  const code = J.joinCode(TEAM, me.key, me.box, lead.public, nonce, opening.nonce);
  check(/^[0-9a-f]{64}$/.test(J.joinCommit(TEAM, me.key, me.box, nonce))
      && J.joinCommit(TEAM, me.key, me.box, nonce) === commit && /^[0-9]{6}$/.test(code),
    "16i the join declarations still reckon a commitment of 64 hex and a code of six digits");

  const secret = hex(16);
  const proof = M.memberProof(secret, commit);
  const wantProof = crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(commit, "utf8").digest("hex");
  const otherSecret = hex(16);
  const otherBox = hex(32);
  const otherCommit = J.joinCommit(TEAM, me.key, otherBox, nonce);
  const id = M.inviteIdOf(secret);
  const wantId = crypto.createHash("sha256").update(Buffer.from(secret, "hex")).digest("hex").slice(0, 16);
  check(proof === wantProof && proof.length === 64 && otherCommit !== commit
      && M.memberProof(otherSecret, commit) !== proof && M.memberProof(secret, otherCommit) !== proof
      && M.memberProof("zz", commit) === "" && M.memberProof(secret, "abcd") === ""
      && id === wantId && id.length === 16 && M.inviteIdOf("nope") === "",
    "16j a proof holds for its secret and commitment, and fails for another secret or for a commitment made with another box: "
    + (proof === wantProof) + ", other secret differs " + (M.memberProof(otherSecret, commit) !== proof)
    + ", other commitment differs " + (M.memberProof(secret, otherCommit) !== proof));

  const withInvite = M.memberRequestDoc(j, null, me, { id: id, proof: proof, secret: secret });
  const plain = M.memberRequestDoc(j, null, me);
  const invitedText = JSON.stringify(withInvite);
  const invitedSigned = JSON.parse(JSON.stringify(withInvite));
  invitedSigned.sig = { alg: "Ed25519", keyId: me.id };
  invitedSigned.sig.value = crypto.sign(null, J.joinSignedBytes(invitedSigned), sign.privateKey).toString("hex");
  const carried = withInvite && withInvite.invite;
  check(JSON.stringify(plain) === JSON.stringify(want) && withInvite.desk.kind === "desk"
      && !!carried && carried.id === id && carried.proof === proof
      && !!carried && !Object.prototype.hasOwnProperty.call(carried, "secret") && invitedText.indexOf(secret) < 0
      && J.joinGenuine(invitedSigned, me.id) === true,
    "16k a request that carries an invitation names kind desk and the proof, the same request without one is unchanged, and the secret is not in it: "
    + withInvite.desk.kind + ", secret absent " + (invitedText.indexOf(secret) < 0));

  const blobOf = (o) => "etiuda-join:" + Buffer.from(JSON.stringify(o)).toString("base64url");
  const leadBlob = { keyId: lead.keyId, public: lead.public, name: "Quay lead" };
  const goodBlob = M.inviteRead(blobOf({ team: TEAM, folder: "C:/quay/catalogs", lead: leadBlob, secret: secret, v: 1 }));
  const badBlobs = ["", "etiuda-join:", "not-an-invitation",
    blobOf({ team: TEAM, folder: "quay", lead: leadBlob, secret: secret }),
    blobOf({ team: "nope", folder: "C:/quay", lead: leadBlob, secret: secret }),
    blobOf({ team: TEAM, folder: "C:/quay", lead: { keyId: "a", public: "abcd", name: "Quay lead" }, secret: secret }),
    blobOf({ team: TEAM, folder: "C:/quay", lead: leadBlob, secret: "abcd" }),
    "etiuda-join:" + Buffer.from("{").toString("base64url")];
  const wholeBlob = blobOf({ team: TEAM, folder: "C:/quay/catalogs", lead: leadBlob, secret: secret });
  const tampered = wholeBlob.slice(0, 20) + (wholeBlob[20] === "A" ? "B" : "A") + wholeBlob.slice(21);
  const where = M.folderHost("\\\\quay-host\\catalogs", { SystemDrive: "C:" });
  const onDisk = M.folderHost("C:/quay/catalogs", { SystemDrive: "C:" });
  const otherDisk = M.folderHost("D:/quay/catalogs", { SystemDrive: "C:" });
  check(!!goodBlob && goodBlob.team === TEAM && goodBlob.secret === secret && goodBlob.lead.name === "Quay lead"
      && goodBlob.folder === "C:\\quay\\catalogs" && badBlobs.every(b => M.inviteRead(b) === null) && M.inviteRead(tampered) === null
      && where.host === "quay-host" && where.local === false && onDisk.local === true && onDisk.host === ""
      && otherDisk.local === false && otherDisk.host === "" && otherDisk.cloud === "",
    "16l a malformed or tampered invitation is refused, a well shaped one is read, and a path on another computer is named from its text: "
    + "refused " + badBlobs.filter(b => M.inviteRead(b) === null).length + " of " + badBlobs.length
    + ", host " + where.host);

  const inviteJoin = { team: TEAM, invite: { id: id, proof: proof, lead: { keyId: lead.keyId, public: lead.public, name: "Quay lead" } } };
  const bareFile = teamDoc(lead, 1, [], leadKey.privateKey);
  const noRing = { file: FILE, member: { id: me.id, sk: box.privateKey } };
  const byInvite = M.memberHeed(bareFile, { pins: {}, keys: {}, barred: [], join: inviteJoin }, noRing);
  const otherJoin = { team: TEAM, invite: { id: id, proof: proof, lead: { keyId: otherLead.keyId, public: otherLead.public, name: "Other" } } };
  const otherFile = M.memberHeed(genuine, { pins: {}, keys: {}, barred: [], join: otherJoin }, seen);
  const stillAsks = M.memberHeed(noWrap, { pins: {}, keys: {}, barred: [], join: null }, noRing);
  check(byInvite.stop === false && byInvite.pinned === true && byInvite.keep === false && byInvite.state.pins[TEAM].public === lead.public
      && otherFile.stop === true && otherFile.pinned === false && Object.keys(otherFile.state.pins).length === 0
      && otherFile.said.length === 1 && otherFile.said[0].indexOf("asked to join") >= 0
      && stillAsks.needRing === true && stillAsks.pinned === false,
    "16m a team file under the invitation's lead is pinned with no ring, a file under another lead is refused, and a request with no invitation still asks for the ring: "
    + "pinned " + byInvite.pinned + ", other stopped " + otherFile.stop + ", no invitation needRing " + stillAsks.needRing);

  /* ---- what an invitation may name, and what the confirm is then given ----------------------------------------- */
  const BS = "\\";
  const folderOf = (f, posix) => { const r = M.inviteRead(blobOf({ team: TEAM, folder: f, lead: leadBlob, secret: secret }), posix); return r ? r.folder : null; };
  // Each is [as pasted, as the system reaches it]: separators made the system's, one trailing separator dropped.
  const winTaken = [["C:/quay/catalogs", "C:\\quay\\catalogs"], ["C:\\quay\\catalogs\\", "C:\\quay\\catalogs"], ["D:\\", "D:\\"],
    ["\\\\quay-host\\catalogs", "\\\\quay-host\\catalogs"], ["\\\\quay-host\\catalogs\\team\\", "\\\\quay-host\\catalogs\\team"]];
  // A path whose text is not where Windows goes: the host it reaches hidden by mixed or forward separators, a device
  // prefix, a dot segment, an empty segment, a segment Windows renames, a stream, a drive-relative or relative path.
  const winRefused = ["/\\quay-host\\catalogs", "\\/quay-host/catalogs", "//quay-host/catalogs", "\\\\quay-host/catalogs", "\\\\quay-host\\catalogs/team",
    "\\\\?\\UNC\\quay-host\\catalogs", "\\\\.\\UNC\\quay-host\\catalogs", "\\\\?\\C:\\quay", "\\\\quay-host",
    "C:\\OneDrive\\..\\Windows\\Temp\\team", "C:\\quay\\.\\catalogs", "C:\\quay\\\\catalogs", "C:\\quay\\catalogs.",
    "C:\\quay\\catalogs ", " C:\\quay", "C:\\quay\\catalogs:held", "C:quay", "quay\\catalogs", "/srv/quay/catalogs"];
  const posixTaken = [["/srv/quay/catalogs/", "/srv/quay/catalogs"], ["/srv/quay", "/srv/quay"]];
  const posixRefused = ["C:\\quay\\catalogs", "\\\\quay-host\\catalogs", "//quay-host/catalogs", "/srv/../etc/quay",
    "/srv/./quay", "/srv//quay", "/srv/quay" + BS + "catalogs", "srv/quay"];
  const winWrong = winTaken.filter(([f, w]) => folderOf(f) !== w).map(x => x[0])
    .concat(winRefused.filter(f => folderOf(f) !== null));
  const posixWrong = posixTaken.filter(([f, w]) => folderOf(f, true) !== w).map(x => x[0])
    .concat(posixRefused.filter(f => folderOf(f, true) !== null));
  const named = [M.folderHost("\\\\quay-host\\catalogs", {}).host, M.folderHost("//quay-host/catalogs", {}).host];
  check(winWrong.length === 0 && posixWrong.length === 0 && named.every(h => h === "quay-host"),
    "16n an invitation's folder is read as the place the system reaches, or refused where its text is not that place, on Windows ("
    + winTaken.length + " taken, " + winRefused.length + " refused) and elsewhere (" + posixTaken.length + " taken, " + posixRefused.length
    + " refused), and the host is named from either spelling of a share: wrong " + JSON.stringify(winWrong.concat(posixWrong))
    + ", hosts " + JSON.stringify(named));

  // Built from their code points, so this file holds none of them: the bidirectional marks, overrides and isolates,
  // the zero widths, the separators, the joiners and the byte-order mark, each range by both of its ends.
  const hidden = [0x061c, 0x200b, 0x200f, 0x2028, 0x202e, 0x2060, 0x2069, 0xfeff].map(c => String.fromCharCode(c));
  const withChar = (field, ch) => {
    const l = Object.assign({}, leadBlob);
    let f = "C:\\quay\\catalogs";
    if (field === "name") l.name = "Quay" + ch + " lead";
    else if (field === "keyId") l.keyId = lead.keyId + ch;
    else f = "C:\\quay" + ch + "x\\catalogs";
    return blobOf({ team: TEAM, folder: f, lead: l, secret: secret });
  };
  const slipped = [];
  for (const field of ["name", "keyId", "folder"]) for (const ch of hidden) {
    if (M.inviteRead(withChar(field, ch)) !== null) slipped.push(field + " U+" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
  }
  const plainRead = ["name", "keyId", "folder"].every(field => M.inviteRead(withChar(field, "e")) !== null);
  check(slipped.length === 0 && plainRead,
    "16o a character that turns or hides text is refused in the lead's name, its keyId and the folder, every range by both its ends ("
    + (hidden.length * 3) + " cases), while the same invitation with a plain letter there is read: slipped " + JSON.stringify(slipped));

  const bell = String.fromCharCode(7);
  const longName = n => blobOf({ team: TEAM, folder: "C:\\quay", lead: Object.assign({}, leadBlob, { name: "n".repeat(n) }), secret: secret });
  const longKeyId = n => blobOf({ team: TEAM, folder: "C:\\quay", lead: Object.assign({}, leadBlob, { keyId: "k".repeat(n) }), secret: secret });
  check(M.inviteRead(blobOf({ team: TEAM, folder: "C:\\quay" + bell + "\\catalogs", lead: leadBlob, secret: secret })) === null
      && M.inviteRead(longName(120)) !== null && M.inviteRead(longName(121)) === null
      && M.inviteRead(longKeyId(80)) !== null && M.inviteRead(longKeyId(81)) === null,
    "16p a control character in the folder is refused, and the lead's name is read up to 120 characters and its keyId up to 80, one more refused");

  const TEAM2 = "t-" + hex(8);
  const fileB = signTeam({ format: 1, kind: "etiuda-team", id: TEAM2, catalogs: ["quay-board"], lead: otherLead,
    sealed: true, exportsSealed: false, epoch: 1, roster: [] }, otherKey.privateKey);
  const forTeamA = M.memberHeed(fileB, { pins: {}, keys: {}, barred: [], join: inviteJoin }, noRing);
  const forBNamed = M.memberHeed(fileB, { pins: {}, keys: {}, barred: [],
    join: { team: TEAM2, invite: { id: id, proof: proof, lead: { keyId: otherLead.keyId, public: otherLead.public, name: "Other" } } } }, noRing);
  check(forTeamA.needRing === true && forTeamA.pinned === false && Object.keys(forTeamA.state.pins).length === 0
      && forBNamed.pinned === true && forBNamed.state.pins[TEAM2].public === otherLead.public,
    "16q an invitation for one team lifts the ring for that team's lead alone: another team's file still asks for the ring, and the"
    + " same file pins with no ring once the invitation names its team: needRing " + forTeamA.needRing + ", named " + forBNamed.pinned);

  const barredInvite = M.memberHeed(bareFile, { pins: {}, keys: {}, barred: [TEAM], join: inviteJoin }, noRing);
  check(barredInvite.stop === true && barredInvite.pinned === false && barredInvite.unbar === false
      && Object.keys(barredInvite.state.pins).length === 0 && barredInvite.state.barred.indexOf(TEAM) >= 0 && barredInvite.said.length === 0,
    "16r a team whose lead this member forgot takes no first admission from a waiting invitation, even under the lead it names:"
    + " only an answered request lifts the bar: stopped " + barredInvite.stop + ", pinned " + barredInvite.pinned);
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
