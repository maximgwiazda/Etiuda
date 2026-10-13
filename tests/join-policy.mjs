/* The policy door, sliced out of shell/main.js and driven on invented fixtures. A desk's shell
 * reads two values an administrator set for the machine; this file never loads that shell.
 *
 *     node tests/join-policy.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE DECLARATIONS ARE SLICED, AS THE MEMBER CORE'S ARE. The validator and the reader are cut out
 * of shell/main.js and evaluated with execFileSync and process as their only extra names, and the
 * heed under a policy pin is cut out beside the member declarations, with crypto and Buffer alone.
 * A free name fails here as it would in the shell.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 6;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* The same cut the member core uses: a function by its braces, a const by the semicolon outside them. */
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
function load(src, markers, names, params, args) {
  const body = markers.map(m => sliceDecl(src, m)).join("\n");
  return new Function(...params, body + "\nreturn { " + names.join(", ") + " };")(...args);
}

const POLICY_DECLS = ["const REG_TOOL =", "const POLICY_KEY =", "const POLICY_LEAD_RE =", "const POLICY_WORDS =",
  "function policyRegSz(", "function policyFolderOk(", "function policyLeadOk(", "function joinPolicyFrom(",
  "let joinPolicyCache =", "function readJoinPolicy("];
const MEMBER_DECLS = ["const HPKE_KEM =", "const HPKE_SUITE =", "const SPKI_X25519 =", "function hpkeLabeledExtract(",
  "function hpkeLabeledExpand(", "function hpkeX25519Public(", "function hpkeShared(", "function hpkeSchedule(",
  "function hpkeOpen(", "const SEALED_TEAM_RE =", "const TEAM_WRAP_LABEL =", "function teamWrapInfo(",
  "function unwrapTeamKey(", "const JOIN_KIND =", "const HANDOVER_PREFIX =", "const HANDOVER_KIND =",
  "function handoverSignedBytes(", "function handoverGenuine(", "function handedTo(", "const SPKI_ED25519 =",
  "function canonJson(", "function signedBytesOf(", "function teamWhole(", "function memberRingVouches(",
  "function memberStateCopy(", "function memberRequestDoc(", "function memberHeed(", "function hpkeSeal(",
  "function wrapTeamKey(", "function branchIdOf(", "function memberHeedUnderPolicy("];

const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const HEX = "ab".repeat(32);
const OTHER = "cd".repeat(32);
const EN = {
  folder: "The team folder in policy is not a full path this desk can use, so this desk keeps the folder it already uses.",
  lead: "The lead key in policy is not the 64 lower-case hex characters of the public key in the team file, so this desk does not take it as the lead.",
  beside: "The value set beside it stays unused, so this desk takes the policy as a whole.",
};
const PL = {
  folder: "Folder zespołu w zasadach grupy nie jest pełną ścieżką, z której to stanowisko może korzystać, więc zostaje przy folderze, którego już używa.",
  lead: "Klucz lidera w zasadach grupy nie składa się z 64 małych znaków szesnastkowych klucza publicznego w pliku zespołu, więc stanowisko nie przyjmuje go jako klucza lidera.",
  beside: "Wartość podana obok pozostaje nieużyta, więc stanowisko przyjmuje zasady grupy w całości.",
};
const FILE = "quay/etiuda-team.json";
const LONG = "D:\\" + "a".repeat(1021);

function regText(rows) {
  const lines = ["HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda"];
  for (const row of rows) lines.push("    " + row[0] + "    " + row[1] + "    " + row[2]);
  return lines.join("\r\n") + "\r\n";
}
function saidOf(got) { return got.said.join("|"); }

let P = null, M = null, loadError = "";
try {
  P = load(SRC, POLICY_DECLS, ["joinPolicyFrom", "readJoinPolicy", "REG_TOOL", "POLICY_KEY", "POLICY_WORDS"],
    ["execFileSync", "process"], [() => "", { platform: "linux" }]);
  M = load(SRC, MEMBER_DECLS,
    ["memberHeed", "memberHeedUnderPolicy", "wrapTeamKey", "branchIdOf", "handoverSignedBytes", "teamWhole"],
    ["crypto", "Buffer"], [crypto, Buffer]);
} catch (e) { loadError = (e && e.message) || String(e); }

const goodRows = [
  ["D:\\Quay\\team", "a drive path"],
  ["D:\\Quay team\\share", "a path with a space in a segment"],
  ["D:/Quay/team", "a drive path with forward slashes"],
  ["D:\\", "a drive root"],
  ["\\\\quay\\share\\team", "a share path"],
  [LONG, "a path of 1024 characters"],
];
{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    if (JSON.stringify(P.POLICY_WORDS.en) !== JSON.stringify(EN) || JSON.stringify(P.POLICY_WORDS.pl) !== JSON.stringify(PL))
      problems.push("the words in the shell are not the words this leg names");
    for (const [folder, why] of goodRows) {
      for (const lang of ["en", "pl"]) {
        const got = P.joinPolicyFrom(regText([["TeamFolder", "REG_SZ", folder], ["LeadKey", "REG_SZ", HEX]]), lang);
        if (got.folder !== folder || got.lead !== HEX || got.said.length !== 0)
          problems.push(why + " " + lang + " " + JSON.stringify(got));
      }
    }
  }
  check(problems.length === 0,
    "19a a full path and a 64 lower-case hex lead are kept, in both languages, and nothing is said: "
    + (problems.join("; ") || goodRows.length + " paths"));
}

{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    const alone = (rows, lang) => P.joinPolicyFrom(regText(rows), lang || "en");
    const badFolder = [
      ["quay\\team", "a relative path"],
      ["D:\\Quay\\team\\..\\other", "a segment that walks out"],
      ["D:\\Quay\\team ", "a trailing space"],
      ["C:", "a drive with no slash"],
      ["/home/team", "a path from another system"],
      ["//quay/share/team", "a share written with forward slashes"],
      ["D:\\Quay\\team*", "a character a path cannot hold"],
      ["D:\\" + "a".repeat(1022), "a path of 1025 characters"],
    ];
    for (const [folder, why] of badFolder) {
      const got = alone([["TeamFolder", "REG_SZ", folder]]);
      if (got.folder !== "" || got.lead !== "" || saidOf(got) !== EN.folder) problems.push(why + " " + JSON.stringify(got));
    }
    const badLead = [
      ["AB".repeat(32), "upper case"],
      [HEX + "a", "65 characters"],
      ["studio-" + "ab".repeat(8), "a studio key id"],
      [HEX.slice(0, 63), "63 characters"],
      ["ab".repeat(16), "32 characters"],
    ];
    for (const [lead, why] of badLead) {
      const got = alone([["LeadKey", "REG_SZ", lead]]);
      if (got.folder !== "" || got.lead !== "" || saidOf(got) !== EN.lead) problems.push(why + " " + JSON.stringify(got));
    }
    const dword = alone([["TeamFolder", "REG_DWORD", "0x1"]]);
    if (dword.folder !== "" || saidOf(dword) !== EN.folder) problems.push("dword " + JSON.stringify(dword));
    const expand = alone([["TeamFolder", "REG_EXPAND_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]]);
    if (expand.folder !== "" || expand.lead !== "" || saidOf(expand) !== EN.folder + "|" + EN.beside)
      problems.push("expand " + JSON.stringify(expand));
    const halfLead = alone([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", "AB".repeat(32)]]);
    if (halfLead.folder !== "" || halfLead.lead !== "" || saidOf(halfLead) !== EN.lead + "|" + EN.beside)
      problems.push("bad lead drops the folder " + JSON.stringify(halfLead));
    const halfFolder = alone([["TeamFolder", "REG_SZ", "quay\\team"], ["LeadKey", "REG_SZ", HEX]]);
    if (halfFolder.folder !== "" || halfFolder.lead !== "" || saidOf(halfFolder) !== EN.folder + "|" + EN.beside)
      problems.push("bad folder drops the lead " + JSON.stringify(halfFolder));
    const both = alone([["TeamFolder", "REG_SZ", "quay\\team"], ["LeadKey", "REG_SZ", "NO"]]);
    if (both.folder !== "" || both.lead !== "" || saidOf(both) !== EN.folder + "|" + EN.lead || both.said.indexOf(EN.beside) >= 0)
      problems.push("both bad " + JSON.stringify(both));
    const onlyFolder = alone([["TeamFolder", "REG_SZ", "D:\\Quay\\team"]]);
    if (onlyFolder.folder !== "D:\\Quay\\team" || onlyFolder.lead !== "" || onlyFolder.said.length !== 0)
      problems.push("folder alone " + JSON.stringify(onlyFolder));
    const onlyLead = alone([["LeadKey", "REG_SZ", HEX]]);
    if (onlyLead.lead !== HEX || onlyLead.folder !== "" || onlyLead.said.length !== 0)
      problems.push("lead alone " + JSON.stringify(onlyLead));
    const blank = alone([["TeamFolder", "REG_SZ", ""], ["LeadKey", "REG_SZ", "   "]]);
    if (blank.folder !== "" || blank.lead !== "" || blank.said.length !== 0) problems.push("blank " + JSON.stringify(blank));
    const empty = P.joinPolicyFrom("", "en");
    if (empty.folder !== "" || empty.lead !== "" || empty.said.length !== 0) problems.push("empty " + JSON.stringify(empty));
    const studio = alone([["TeamAboveFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKeyAbove", "REG_SZ", HEX]]);
    if (studio.folder !== "" || studio.lead !== "" || studio.said.length !== 0) problems.push("studio values " + JSON.stringify(studio));
    const polish = alone([["TeamFolder", "REG_SZ", "quay\\team"]], "pl");
    if (saidOf(polish) !== PL.folder || polish.said[0] === EN.folder || !/[ąćęłńóśźż]/i.test(polish.said[0]))
      problems.push("polish " + JSON.stringify(polish.said));
    const otherLang = alone([["LeadKey", "REG_SZ", "NO"]], "xx");
    if (saidOf(otherLang) !== EN.lead) problems.push("other language " + JSON.stringify(otherLang.said));
  }
  check(problems.length === 0,
    "19b a bad value is said and ignored, and one bad value of a pair leaves the other unused: "
    + (problems.join("; ") || "none half used"));
}

const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const hex = n => crypto.randomBytes(n).toString("hex");
function shape(r) {
  const key = r.key === null || r.key === false || r.key === undefined ? r.key
    : Buffer.isBuffer(r.key) ? r.key.toString("hex") : "not-a-key";
  return JSON.stringify(Object.assign({}, r, { key: key }));
}
{
  const problems = [];
  if (!M) problems.push(loadError);
  else {
    let heed = "";
    try { heed = sliceDecl(SRC, "function heedTeam("); }
    catch (e) { problems.push("heedTeam " + e.message); }
    if (heed && ((heed.split("memberHeedUnderPolicy(").length - 1) !== 3 || heed.includes("memberHeed(")))
      problems.push("heedTeam does not call the policy heed three times and nothing else");
    const sign = crypto.generateKeyPairSync("ed25519");
    const box = crypto.generateKeyPairSync("x25519");
    const leadKey = crypto.generateKeyPairSync("ed25519");
    const otherKey = crypto.generateKeyPairSync("ed25519");
    const me = { id: M.branchIdOf(pubHex(sign.publicKey)), key: pubHex(sign.publicKey), box: pubHex(box.publicKey) };
    const lead = { keyId: "quay-lead", public: pubHex(leadKey.publicKey) };
    const other = { keyId: "quay-other", public: pubHex(otherKey.publicKey) };
    const TEAM = "t-" + hex(8);
    const K = crypto.randomBytes(32);
    const wrap = M.wrapTeamKey(K, me.box, TEAM, 1, me.id);
    const roster = [{ desk: { id: me.id, key: me.key, box: me.box }, wrap: wrap }];
    const signedBytes = load(SRC, ["function canonJson(", "function signedBytesOf("], ["signedBytesOf"], ["crypto", "Buffer"], [crypto, Buffer]).signedBytesOf;
    const team = (who, privateKey, extra) => {
      const body = Object.assign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["quay-board"], lead: who,
        sealed: true, exportsSealed: false, epoch: 1, roster: [] }, extra || {});
      const out = JSON.parse(JSON.stringify(body));
      out.sig = { alg: "Ed25519", keyId: out.lead.keyId };
      out.sig.value = crypto.sign(null, signedBytes(out), privateKey).toString("hex");
      return out;
    };
    const hand = (fromLead, fromPriv, toLead) => {
      const s = { format: 1, kind: "etiuda-team-handover", team: TEAM, from: fromLead, to: toLead,
        sig: { alg: "Ed25519", keyId: fromLead.keyId } };
      s.sig.value = crypto.sign(null, M.handoverSignedBytes(s), fromPriv).toString("hex");
      return s;
    };
    const ringFor = who => ({ format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: who.keyId, alg: "Ed25519", public: who.public }] });
    const sentence = FILE + " is signed by a key other than the lead's this desk trusts for team " + TEAM + ", so nothing in it is used";
    const untouched = (name, state, fn) => {
      const before = JSON.stringify(state);
      const r = fn();
      if (JSON.stringify(state) !== before) problems.push(name + " changed the caller's state");
      return r;
    };
    const empty = () => ({ pins: {}, keys: {}, barred: [], join: null });
    const opened = { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: ringFor(other) };
    const foreign = team(other, otherKey.privateKey, { roster: roster });
    const foreignState = empty();
    const bareForeign = M.memberHeed(foreign, foreignState, opened);
    const underForeign = untouched("other key", foreignState, () => M.memberHeedUnderPolicy(foreign, foreignState, opened, lead.public));
    if (!(bareForeign.stop === false && bareForeign.pinned === true && bareForeign.key && bareForeign.key.equals(K)
        && underForeign.stop === true && underForeign.pinned === false && underForeign.key === null
        && underForeign.said.length === 1 && underForeign.said[0] === sentence))
      problems.push("other key with a wrap and a ring " + JSON.stringify(underForeign.said) + " bare stop " + bareForeign.stop);

    const own = team(lead, leadKey.privateKey, { roster: [] });
    const noRing = { file: FILE, member: { id: me.id, sk: box.privateKey } };
    const missState = empty();
    const bareMiss = M.memberHeed(own, missState, noRing);
    const underMiss = untouched("ring not read", missState, () => M.memberHeedUnderPolicy(own, missState, noRing, lead.public));
    if (!(bareMiss.needRing === true && bareMiss.pinned === false && underMiss.needRing === false && underMiss.stop === false
        && underMiss.pinned === true && underMiss.state.pins[TEAM].public === lead.public && underMiss.key === null))
      problems.push("ring not read: bare needRing " + bareMiss.needRing + " under pinned " + underMiss.pinned);

    const wrongRing = { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: ringFor(other) };
    const wrongState = empty();
    const bareWrong = M.memberHeed(own, wrongState, wrongRing);
    const underWrong = untouched("other ring", wrongState, () => M.memberHeedUnderPolicy(own, wrongState, wrongRing, lead.public));
    if (!(bareWrong.stop === true && bareWrong.pinned === false && underWrong.stop === false && underWrong.pinned === true
        && underWrong.state.pins[TEAM].public === lead.public))
      problems.push("ring for another key: bare stop " + bareWrong.stop + " under pinned " + underWrong.pinned);

    const held = empty();
    held.pins[TEAM] = { keyId: other.keyId, public: other.public };
    const withWrap = team(lead, leadKey.privateKey, { roster: roster });
    const bareHeld = M.memberHeed(withWrap, held, opened);
    const underHeld = untouched("stored pin", held, () => M.memberHeedUnderPolicy(withWrap, held, opened, lead.public));
    if (!(bareHeld.stop === true && bareHeld.said[0] === sentence && underHeld.stop === false && underHeld.pinned === true
        && underHeld.key && underHeld.key.equals(K) && underHeld.state.pins[TEAM].public === lead.public
        && held.pins[TEAM].public === other.public))
      problems.push("replaces a stored pin " + (underHeld.said && underHeld.said[0]));

    const renamed = empty();
    renamed.pins[TEAM] = { keyId: "other-name", public: lead.public };
    const bareRenamed = M.memberHeed(own, renamed, wrongRing);
    const underRenamed = untouched("renamed", renamed, () => M.memberHeedUnderPolicy(own, renamed, wrongRing, lead.public));
    if (!(bareRenamed.stop === true && underRenamed.stop === false && underRenamed.state.pins[TEAM].keyId === lead.keyId
        && underRenamed.state.pins[TEAM].public === lead.public && renamed.pins[TEAM].keyId === "other-name"))
      problems.push("same public, other name: bare stop " + bareRenamed.stop + " under keyId " + (underRenamed.state.pins[TEAM] && underRenamed.state.pins[TEAM].keyId));

    const moved = team(other, otherKey.privateKey, { roster: roster, handover: [hand(lead, leadKey.privateKey, other)] });
    const pinnedOld = empty();
    pinnedOld.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
    const bareMoved = M.memberHeed(moved, pinnedOld, opened);
    const underMoved = untouched("handover", pinnedOld, () => M.memberHeedUnderPolicy(moved, pinnedOld, opened, lead.public));
    if (!(bareMoved.stop === false && bareMoved.pinned === true && bareMoved.state.pins[TEAM].public === other.public
        && underMoved.stop === true && underMoved.said.length === 1 && underMoved.said[0] === sentence
        && underMoved.pinned === false && pinnedOld.pins[TEAM].public === lead.public))
      problems.push("handover: bare public " + (bareMoved.state.pins[TEAM] && bareMoved.state.pins[TEAM].public) + " under stop " + underMoved.stop);

    const barred = empty();
    barred.barred = [TEAM];
    const bareBar = M.memberHeed(withWrap, barred, opened);
    const underBar = untouched("bar", barred, () => M.memberHeedUnderPolicy(withWrap, barred, opened, lead.public));
    if (!(bareBar.stop === true && bareBar.said.length === 0 && underBar.stop === false && underBar.unbar === true
        && underBar.pinned === true && underBar.key && underBar.key.equals(K)
        && underBar.state.barred.indexOf(TEAM) < 0 && barred.barred[0] === TEAM))
      problems.push("bar: bare stop " + bareBar.stop + " under unbar " + underBar.unbar);

    const waiting = { team: TEAM };
    const joining = empty();
    joining.join = waiting;
    const bareJoin = M.memberHeed(withWrap, joining, opened);
    const underJoin = untouched("waiting join", joining, () => M.memberHeedUnderPolicy(withWrap, joining, opened, lead.public));
    if (!(bareJoin.stop === true && underJoin.stop === false && underJoin.pinned === true && underJoin.state.join === waiting
        && joining.join === waiting))
      problems.push("waiting join: bare stop " + bareJoin.stop + " under pinned " + underJoin.pinned);
  }
  check(problems.length === 0,
    "19c the policy pin is ahead of the ring, the first wrap, a handover and the pin already held: "
    + (problems.join("; ") || "that order"));
}

{
  const problems = [];
  if (!M) problems.push(loadError);
  else {
    const sign = crypto.generateKeyPairSync("ed25519");
    const box = crypto.generateKeyPairSync("x25519");
    const leadKey = crypto.generateKeyPairSync("ed25519");
    const otherKey = crypto.generateKeyPairSync("ed25519");
    const me = { id: M.branchIdOf(pubHex(sign.publicKey)), key: pubHex(sign.publicKey), box: pubHex(box.publicKey) };
    const lead = { keyId: "quay-lead", public: pubHex(leadKey.publicKey) };
    const other = { keyId: "quay-other", public: pubHex(otherKey.publicKey) };
    const TEAM = "t-" + hex(8);
    const signedBytes = load(SRC, ["function canonJson(", "function signedBytesOf("], ["signedBytesOf"], ["crypto", "Buffer"], [crypto, Buffer]).signedBytesOf;
    const team = (who, privateKey, extra) => {
      const body = Object.assign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["quay-board"], lead: who,
        sealed: true, exportsSealed: false, epoch: 1, roster: [] }, extra || {});
      const out = JSON.parse(JSON.stringify(body));
      out.sig = { alg: "Ed25519", keyId: out.lead.keyId };
      out.sig.value = crypto.sign(null, signedBytes(out), privateKey).toString("hex");
      return out;
    };
    const K = crypto.randomBytes(32);
    const wrap = M.wrapTeamKey(K, me.box, TEAM, 1, me.id);
    const roster = [{ desk: { id: me.id, key: me.key, box: me.box }, wrap: wrap }];
    const ring = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "quay-board", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] };
    const elsewhere = { format: 1, kind: "etiuda-ring", keys: [{ catalog: "other-board", keyId: lead.keyId, alg: "Ed25519", public: lead.public }] };
    const seen = { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: ring };
    const same = (name, doc, state, look, policy) => {
      const before = JSON.stringify(state);
      const bare = M.memberHeed(doc, state, look);
      const under = M.memberHeedUnderPolicy(doc, state, look, policy);
      if (shape(bare) !== shape(under) || JSON.stringify(state) !== before) problems.push(name);
    };
    const fresh = () => ({ pins: {}, keys: {}, barred: [], join: null });
    const genuine = team(lead, leadKey.privateKey, { roster: roster });
    same("first wrap", genuine, fresh(), seen, "");
    const foreign = team(other, otherKey.privateKey, { roster: roster });
    const pinned = fresh();
    pinned.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
    same("foreign key", foreign, pinned, seen, "");
    const noWrap = team(lead, leadKey.privateKey, { roster: [] });
    same("ring vouches", noWrap, fresh(), seen, "");
    same("ring misses", noWrap, fresh(), { file: FILE, member: { id: me.id, sk: box.privateKey }, ring: elsewhere }, "");
    const barred = fresh();
    barred.barred = [TEAM];
    same("barred", genuine, barred, seen, "");
    const bad = JSON.parse(JSON.stringify(genuine));
    bad.sig.value = (bad.sig.value[0] === "a" ? "b" : "a") + bad.sig.value.slice(1);
    same("not whole", bad, fresh(), seen, "");
    const already = fresh();
    already.pins[TEAM] = { keyId: lead.keyId, public: lead.public };
    same("policy matches the pin", genuine, already, seen, lead.public);
  }
  check(problems.length === 0,
    "19d with no policy, and where the policy names the pin already held, heeding matches the heed on its own: "
    + (problems.join("; ") || "seven shapes"));
}

{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    let reader = "", from = "", keyLine = "";
    try {
      reader = sliceDecl(SRC, "function readJoinPolicy(");
      from = sliceDecl(SRC, "function joinPolicyFrom(");
      keyLine = sliceDecl(SRC, "const POLICY_KEY =");
    } catch (e) { problems.push(e.message); }
    if (reader) {
      if (reader.split("execFileSync(").length !== 2) problems.push("exec count " + reader.split("execFileSync(").length);
      if (!reader.includes('execFileSync(REG_TOOL, ["query", POLICY_KEY]')) problems.push("not REG_TOOL");
      if (reader.includes('execFileSync("reg"') || reader.includes("execFileSync('reg'")) problems.push("bare reg");
      if (/powershell|cmd\.exe|spawn\s*\(|\bfork\s*\(|child_process|dbus-send/i.test(reader + from)) problems.push("another program");
      if (/TeamAboveFolder|LeadKeyAbove|EtiudaStudio/.test(reader + from + keyLine)) problems.push("studio value");
    }
    if (P.REG_TOOL !== "C:\\Windows\\System32\\reg.exe" || P.POLICY_KEY !== "HKLM\\SOFTWARE\\Policies\\Etiuda")
      problems.push("path " + P.REG_TOOL + " key " + P.POLICY_KEY);
    const calls = [];
    const win = load(SRC, POLICY_DECLS, ["readJoinPolicy", "REG_TOOL", "POLICY_KEY"], ["execFileSync", "process"], [(file, args, opt) => {
      calls.push({ file: file, args: args, opt: opt });
      return regText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]]);
    }, { platform: "win32" }]);
    const first = win.readJoinPolicy("en");
    const second = win.readJoinPolicy("en");
    if (calls.length !== 1 || calls[0].file !== win.REG_TOOL || JSON.stringify(calls[0].args) !== JSON.stringify(["query", win.POLICY_KEY])
        || !calls[0].opt || calls[0].opt.windowsHide !== true || calls[0].opt.timeout !== 5000 || calls[0].opt.encoding !== "utf8"
        || JSON.stringify(calls[0].opt.stdio) !== JSON.stringify(["ignore", "pipe", "ignore"])
        || first.folder !== "D:\\Quay\\team" || first.lead !== HEX || second.folder !== first.folder)
      problems.push("call " + JSON.stringify(calls) + " " + JSON.stringify(first));
    let threw = 0;
    const broken = load(SRC, POLICY_DECLS, ["readJoinPolicy"], ["execFileSync", "process"], [() => { threw++; throw new Error("missing"); }, { platform: "win32" }]);
    const none = broken.readJoinPolicy("en");
    if (threw !== 1 || none.folder !== "" || none.lead !== "" || none.said.length !== 0) problems.push("throw " + JSON.stringify(none));
    const dump = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    0x0\r\n    ProxyServer    REG_SZ    http://127.0.0.1:9\r\n";
    const proxy = load(SRC, POLICY_DECLS, ["readJoinPolicy"], ["execFileSync", "process"], [() => dump, { platform: "win32" }]);
    const quiet = proxy.readJoinPolicy("pl");
    if (quiet.folder !== "" || quiet.lead !== "" || quiet.said.length !== 0) problems.push("proxy dump " + JSON.stringify(quiet));
    let linuxCalls = 0;
    const linux = load(SRC, POLICY_DECLS, ["readJoinPolicy"], ["execFileSync", "process"], [() => { linuxCalls++; return regText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"]]); }, { platform: "linux" }]);
    const off = linux.readJoinPolicy("en");
    if (linuxCalls !== 0 || off.folder !== "" || off.lead !== "") problems.push("linux calls " + linuxCalls);
  }
  check(problems.length === 0,
    "19e the reader starts reg.exe at its fixed path, for this one key, and no other program: "
    + (problems.join("; ") || "one call"));
}

{
  const problems = [];
  const admxPath = path.join(ROOT, "shell", "policy", "etiuda.admx");
  const enPath = path.join(ROOT, "shell", "policy", "en-US", "etiuda.adml");
  const plPath = path.join(ROOT, "shell", "policy", "pl-PL", "etiuda.adml");
  let admx = "", en = "", pl = "";
  try {
    for (const file of [admxPath, enPath, plPath]) {
      const bytes = fs.readFileSync(file);
      if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) problems.push("bom " + file);
      if (bytes.includes(0xE2)) {
        const text = bytes.toString("utf8");
        if (text.includes("\u2013") || text.includes("\u2014")) problems.push("dash " + file);
      }
    }
    admx = fs.readFileSync(admxPath, "utf8");
    en = fs.readFileSync(enPath, "utf8");
    pl = fs.readFileSync(plPath, "utf8");
  } catch (e) { problems.push((e && e.message) || String(e)); }
  const has = (text, needle, why) => { if (!text.includes(needle)) problems.push(why); };
  if (admx) {
    has(admx, 'name="Etiuda"', "category Etiuda");
    has(admx, 'name="EtiudaStudio"', "category Etiuda Studio");
    has(admx, 'key="Software\\Policies\\Etiuda"', "desk key");
    has(admx, 'key="Software\\Policies\\EtiudaStudio"', "studio key");
    for (const name of ["TeamFolder", "LeadKey", "TeamAboveFolder", "LeadKeyAbove"])
      has(admx, 'valueName="' + name + '"', "value " + name);
    if ((admx.match(/class="Machine"/g) || []).length !== 4) problems.push("machine class");
  }
  for (const [text, lang] of [[en, "en"], [pl, "pl"]]) {
    if (!text) continue;
    has(text, '<string id="EtiudaCat">Etiuda</string>', lang + " category");
    has(text, '<string id="EtiudaStudioCat">Etiuda Studio</string>', lang + " studio category");
    for (const id of ["TeamFolder_Explain", "LeadKey_Explain", "TeamAboveFolder_Explain", "LeadKeyAbove_Explain",
      "TeamFolderBox", "LeadKeyBox", "TeamAboveFolderBox", "LeadKeyAboveBox"])
      has(text, id, lang + " " + id);
  }
  if (pl && (!pl.includes("stanowisko") || !/[ąćęłńóśźż]/i.test(pl))) problems.push("polish copy");
  if (en && !en.includes("full path") && !en.includes("Full path")) problems.push("english copy");
  check(problems.length === 0,
    "19f the template has both categories and the four values, in English and in Polish: "
    + (problems.join("; ") || "shell/policy"));
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
