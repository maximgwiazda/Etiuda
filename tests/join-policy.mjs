/* The policy door, driven on invented fixtures. A desk's shell reads two values an administrator set for the
 * machine, through reg.exe's export of one key; no leg here starts reg.exe or reads this machine's registry.
 *
 *     node tests/join-policy.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE DECLARATIONS ARE SLICED, AS THE MEMBER CORE'S ARE (19a to 19e). The validator and the reader are cut out
 * of shell/main.js and evaluated with execFileSync, process, fs, os and path as their only extra names, and the
 * heed under a policy pin is cut out beside the member declarations, with crypto and Buffer alone.
 * A free name fails here as it would in the shell.
 *
 * THE TEMPLATE IS READ AS A FILE AND AS A SHIPMENT (19f, 19i): the ADMX and its two ADMLs parse and agree, offer the
 * desk's three values and Studio's five and nothing else, each in the control its kind takes, and electron-builder.js copies that folder beside the Windows installer's files.
 *
 * THE GLUE IS DRIVEN WHOLE (19g, 19h). The real shell/main.js runs under stubbed electron, as tests/team-desk.mjs
 * runs it, beside a stand-in for reg.exe that answers its export and its console print from one invented key,
 * the print in the console's code page as reg gives it, so a shell reading either is judged on what it takes.
 *
 * A READ THAT FAILED IS NEVER NO POLICY (19o to 19s, review 09's finding 4): the whole shell again, the stand-in answering the
 * look without waiting only when a leg flushes it, so the order of reads and answers is the leg's to set.
 *
 * WHERE MACHINE POLICY NAMES A LEAD, THAT KEY ALONE DECIDES EVERY READ (19t, 19u, review 09's finding 2): the reading paths
 * driven on the whole shell, and the source read for any function that names teamPins without asking the one place.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 35;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* A planted fault is proof, not a gate: each lift is skipped where ETIUDA_PLANTS is off, and a skipped leg counts toward the floor. */
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
function skip(line) {
  skipped++;
  console.log("  SKIP  " + line);
}
/* `src` with the one line holding plant:<name> replaced by `line`, or null where the mark is not on exactly one line. */
function liftPlant(src, name, line) {
  const lines = src.split("\n"), at = lines.map((l, i) => (l.indexOf("plant:" + name + " ") >= 0 ? i : -1)).filter(i => i >= 0);
  if (at.length !== 1) return null;
  lines[at[0]] = line;
  return lines.join("\n");
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
/* A slice's reg calls meet the shell's own guard (shell/win-proxy.cjs, regOpts), so the functions handed in for execFileSync and
   execFile are marked as stand-ins; markStand refuses node's own. */
const REG_OPTS = nodeRequire("../shell/win-proxy.cjs").regOpts;
function load(src, markers, names, params, args) {
  const body = markers.map(m => sliceDecl(src, m)).join("\n");
  const given = params.map((p, i) => args[i]);
  params.forEach((p, i) => { if (p === "execFileSync" || p === "execFile") nodeRequire("./reg-stand.cjs").markStand(given[i]); });
  return new Function(...params, "regOpts", body + "\nreturn { " + names.join(", ") + " };")(...given, REG_OPTS);
}

const POLICY_DECLS = ["const REG_TOOL =", "const POLICY_KEY =", "const POLICY_REREAD_MS =", "const POLICY_LOOK_MS =", "const POLICY_LOOK_GRACE_MS =", "const POLICY_LEAD_RE =", "const POLICY_WORDS =",
  "const POLICY_HEAD =", "const POLICY_EXPORT_LINE =", "function policyValues(",
  "function policyRegSz(", "function policyLeadOk(", "function policyNoUpdate(", "function joinPolicyFacts(",
  "function policyWords(", "function joinPolicyFrom(", "const POLICY_AGAIN_FIRST_MS =",
  "let joinPolicyRead =", "function policyScratch(", "function policyScratchGone(", "function policyExported(", "function policyTake(",
  "function policyStamp(", "function policyAgainArm(", "function policyLookLater(", "function readJoinPolicy(", "function policyWaits(",
  /* The kept copy's reader, gone since review 09's finding 4, named so this leg also runs on a tree from before; each load drops a name it lacks. */
  "const POLICY_GOOD_FILE =", "function policyGoodLoad(", "function policyGoodSave("];
const POLICY_NAMES = ["execFileSync", "process", "fs", "os", "path", "app", "writeReplacing", "execFile"];
const MEMBER_DECLS = ["const HPKE_KEM =", "const HPKE_SUITE =", "const SPKI_X25519 =", "function hpkeLabeledExtract(",
  "function hpkeLabeledExpand(", "function hpkeX25519Public(", "function hpkeShared(", "function hpkeSchedule(",
  "function hpkeOpen(", "const SEALED_TEAM_RE =", "const TEAM_WRAP_LABEL =", "function teamWrapInfo(",
  "function unwrapTeamKey(", "const JOIN_KIND =", "const HANDOVER_PREFIX =", "const HANDOVER_KIND =",
  "function handoverSignedBytes(", "function handoverGenuine(", "function handedTo(", "const SPKI_ED25519 =",
  "function canonJson(", "function signedBytesOf(", "function teamWhole(",
  "function memberStateCopy(", "function memberRequestDoc(", "function memberHeed(", "function hpkeSeal(",
  "function wrapTeamKey(", "function branchIdOf(", "function memberHeedUnderPolicy("];

const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const HEX = "ab".repeat(32);
const OTHER = "cd".repeat(32);
/* Was the pair's four sentences, folder, lead, beside and unread. Now a team works over the relay only and TeamFolder is not read,
   so its sentence and the pair's go. */
const EN = {
  lead: "The team lead's key set in Group Policy is not written as 64 lowercase hexadecimal characters, so this desk does not trust it.",
  unread: "The organisation's settings could not be read just now. Etiuda will try again.",
};
const PL = {
  lead: "Klucz lidera zespołu ustawiony w zasadach grupy nie ma postaci 64 małych znaków szesnastkowych, więc stanowisko go nie przyjmuje.",
  unread: "Nie udało się teraz odczytać ustawień organizacji. Etiuda spróbuje ponownie.",
};
const FILE = "quay/etiuda-team.json";
const LONG = "D:\\" + "a".repeat(1021);
/* Invented, and Polish so that reg's console print would carry it in a code page: ł and ę are in 852, not in 437. */
const POLISH = "D:\\Dział\\Księgi";
const NUL = String.fromCharCode(0), BEL = String.fromCharCode(7);
const BOM = Buffer.from([0xff, 0xfe]);

/* ---- the key as reg writes it: its export (UTF-16 behind a byte-order mark) and its console print --------- */
const REG_EXE = "C:\\Windows\\System32\\reg.exe";
const ASKED = "HKLM\\SOFTWARE\\Policies\\Etiuda";
const REG_HEAD = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda";
const esc = s => s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
/* A value in bytes as the export writes one: hex pairs, a backslash ending each line it breaks, the next indented two spaces. */
function hexValue(head, bytes) {
  const pairs = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
  const lines = [];
  let line = head;
  pairs.forEach((p, i) => {
    const piece = p + (i < pairs.length - 1 ? "," : "");
    if (line.length + piece.length > 77) { lines.push(line + "\\"); line = "  "; }
    line += piece;
  });
  lines.push(line);
  return lines.join("\r\n");
}
/* A row is [name, type, value]; "@" names the key's default value, and a multiple string's items are split at "|". */
function exportLine([name, type, value]) {
  const n = name === "@" ? "@=" : "\"" + esc(name) + "\"=";
  if (type === "REG_SZ") return n + "\"" + esc(value) + "\"";
  if (type === "REG_DWORD") return n + "dword:" + (Number(value) >>> 0).toString(16).padStart(8, "0");
  if (type === "REG_EXPAND_SZ") return hexValue(n + "hex(2):", Buffer.from(value + NUL, "utf16le"));
  if (type === "REG_MULTI_SZ") return hexValue(n + "hex(7):", Buffer.from(value.split("|").join(NUL) + NUL + NUL, "utf16le"));
  throw new Error("no such type here: " + type);
}
function exportText(rows, subkeys, head) {
  const top = head || REG_HEAD;
  const out = ["Windows Registry Editor Version 5.00", "", "[" + top + "]"].concat(rows.map(exportLine), [""]);
  for (const [name, sub] of Object.entries(subkeys || {})) out.push("[" + top + "\\" + name + "]", ...sub.map(exportLine), "");
  return out.join("\r\n") + "\r\n";
}
const exportBytes = (rows, subkeys) => Buffer.concat([BOM, Buffer.from(exportText(rows, subkeys), "utf16le")]);
function queryText(rows, subkeys) {
  const shown = ([n, t, v]) => "    " + n + "    " + t + "    "
    + (t === "REG_DWORD" ? "0x" + (Number(v) >>> 0).toString(16) : t === "REG_MULTI_SZ" ? v.split("|").join("\\0") : v);
  return ["", REG_HEAD, ...rows.map(shown), "", ...Object.keys(subkeys || {}).map(k => REG_HEAD + "\\" + k), ""].join("\r\n");
}
function saidOf(got) { return got.said.join("|"); }

let P = null, M = null, loadError = "", memberError = "";
try {
  P = load(SRC, POLICY_DECLS.filter(m => SRC.indexOf(m) >= 0), ["joinPolicyFrom", "readJoinPolicy", "REG_TOOL", "POLICY_KEY", "POLICY_WORDS"],
    POLICY_NAMES, [() => "", { platform: "linux", env: process.env }, fs, os, path]);
} catch (e) { loadError = (e && e.message) || String(e); }
try {
  M = load(SRC, MEMBER_DECLS,
    ["memberHeed", "memberHeedUnderPolicy", "wrapTeamKey", "branchIdOf", "handoverSignedBytes", "teamWhole"],
    ["crypto", "Buffer"], [crypto, Buffer]);
} catch (e) { memberError = (e && e.message) || String(e); }

const goodRows = [
  ["D:\\Quay\\team", "a drive path"],
  ["D:\\Quay team\\share", "a path with a space in a segment"],
  ["D:/Quay/team", "a drive path with forward slashes"],
  ["D:\\", "a drive root"],
  ["\\\\quay\\share\\team", "a share path"],
  [POLISH, "a path in Polish, letter for letter"],
  [LONG, "a path of 1024 characters"],
];
{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    if (JSON.stringify(P.POLICY_WORDS.en) !== JSON.stringify(EN) || JSON.stringify(P.POLICY_WORDS.pl) !== JSON.stringify(PL))
      problems.push("the words in the shell are not the words this leg names");
    /* Was: a full path and the lead kept as the pair. Now: the lead alone is kept, and a TeamFolder beside it, a good path or a bad
       one, is neither read nor said. */
    for (const [folder, why] of goodRows.concat([["quay\\team", "a relative path"], ["   ", "spaces alone"]])) {
      for (const lang of ["en", "pl"]) {
        const got = P.joinPolicyFrom(exportText([["TeamFolder", "REG_SZ", folder], ["LeadKey", "REG_SZ", HEX]]), lang);
        if (got.folder || got.lead !== HEX || got.said.length !== 0)
          problems.push(why + " " + lang + " " + JSON.stringify(got));
      }
    }
  }
  check(problems.length === 0,
    "19a a 64 lower-case hex lead is kept as the export holds it, in both languages, and a TeamFolder beside it is neither read nor said: "
    + (problems.join("; ") || (goodRows.length + 2) + " folders beside it"));
}

{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    const alone = (rows, lang, subkeys) => P.joinPolicyFrom(exportText(rows, subkeys), lang || "en");
    const none = (name, got) => { if (got.folder || got.lead !== "" || got.said.length !== 0) problems.push(name + " " + JSON.stringify(got)); };
    /* A read in doubt is no policy, and is said as unread (the review 8 follow-up). */
    const doubt = (name, got) => { if (got.folder || got.lead !== "" || JSON.stringify(got.said) !== JSON.stringify([EN.unread])) problems.push(name + " " + JSON.stringify(got)); };
    /* Was: each bad TeamFolder said, and dropping a good lead beside it. Now: TeamFolder is not read, so none is said. */
    none("a TeamFolder alone", alone([["TeamFolder", "REG_SZ", "quay\\team"]]));
    none("a TeamFolder as a number", alone([["TeamFolder", "REG_DWORD", 1]]));
    const badLead = [
      ["AB".repeat(32), "upper case"],
      [HEX + "a", "65 characters"],
      [" " + HEX, "a leading space"],
      ["   ", "spaces alone"],
      ["studio-" + "ab".repeat(8), "a studio key id"],
      [HEX.slice(0, 63), "63 characters"],
      ["ab".repeat(16), "32 characters"],
    ];
    for (const [lead, why] of badLead) {
      const got = alone([["LeadKey", "REG_SZ", lead]]);
      if (got.folder || got.lead !== "" || saidOf(got) !== EN.lead) problems.push(why + " " + JSON.stringify(got));
    }
    const expandLead = alone([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_EXPAND_SZ", "%NO_SUCH_LEAD%"]]);
    if (expandLead.folder || expandLead.lead !== "" || saidOf(expandLead) !== EN.lead)
      problems.push("an expandable lead " + JSON.stringify(expandLead));
    const multiLead = alone([["LeadKey", "REG_MULTI_SZ", HEX]]);
    if (multiLead.lead !== "" || saidOf(multiLead) !== EN.lead) problems.push("a multiple-string lead " + JSON.stringify(multiLead));
    const badFolderGoodLead = alone([["TeamFolder", "REG_SZ", "quay\\team"], ["LeadKey", "REG_SZ", HEX]]);
    if (badFolderGoodLead.folder || badFolderGoodLead.lead !== HEX || badFolderGoodLead.said.length !== 0)
      problems.push("a bad folder beside a good lead " + JSON.stringify(badFolderGoodLead));
    const onlyLead = alone([["LeadKey", "REG_SZ", HEX]]);
    if (onlyLead.lead !== HEX || onlyLead.folder || onlyLead.said.length !== 0)
      problems.push("lead alone " + JSON.stringify(onlyLead));
    const blank = alone([["TeamFolder", "REG_SZ", ""], ["LeadKey", "REG_SZ", "   "]]);
    if (blank.folder || blank.lead !== "" || saidOf(blank) !== EN.lead) problems.push("blank " + JSON.stringify(blank));
    const cased = alone([["teamfolder", "REG_SZ", "D:\\Quay\\team"], ["LEADKEY", "REG_SZ", HEX]]);
    if (cased.folder || cased.lead !== HEX) problems.push("names in another case " + JSON.stringify(cased));
    none("other values beside", alone([["@", "REG_SZ", "D:\\Elsewhere"], ["Other", "REG_DWORD", 1], ["TeamFolder", "REG_SZ", "D:\\Quay\\team"]]));
    none("a subkey's own values", alone([], "en", { Old: [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]] }));
    none("the default value", alone([["@", "REG_SZ", "D:\\Quay\\team"]]));
    none("empty", P.joinPolicyFrom("", "en"));
    none("studio values", alone([["TeamAboveFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKeyAbove", "REG_SZ", HEX]]));
    /* A READ IN DOUBT IS NOT USED AT ALL: a good folder and lead sit in each of these, around a line reg does not write. */
    const good = [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]];
    const text = exportText(good, { Old: [["Note", "REG_SZ", "kept"]] });
    const own = "[" + REG_HEAD + "]\r\n";
    doubt("an unrecognised line", P.joinPolicyFrom(text.replace(own, own + "TeamFolder=D:\\Quay\\team\r\n"), "en"));
    doubt("an unrecognised line in a subkey's part", P.joinPolicyFrom(text.replace("\"Note\"=\"kept\"\r\n", "\"Note\"=\"kept\"\r\nkept\r\n"), "en"));
    doubt("an escape reg does not write", P.joinPolicyFrom(text.replace("\"D:\\\\Quay\\\\team\"", "\"D:\\\\Quay\\nteam\""), "en"));
    doubt("a header for another key", P.joinPolicyFrom(exportText(good, {}, "HKEY_CURRENT_USER\\Software\\Quay"), "en"));
    doubt("no version line", P.joinPolicyFrom(text.slice(text.indexOf("\r\n") + 2), "en"));
    doubt("a file cut short", P.joinPolicyFrom(text.slice(0, text.indexOf("\"D:\\\\Quay") + 6), "en"));
    doubt("one name twice", P.joinPolicyFrom(text.replace(own, own + "\"teamfolder\"=\"D:\\\\Other\"\r\n"), "en"));
    const polish = alone([["LeadKey", "REG_SZ", "NO"]], "pl");
    if (saidOf(polish) !== PL.lead || polish.said[0] === EN.lead || !/[ąćęłńóśźż]/i.test(polish.said[0]))
      problems.push("polish " + JSON.stringify(polish.said));
    const otherLang = alone([["LeadKey", "REG_SZ", "NO"]], "xx");
    if (saidOf(otherLang) !== EN.lead) problems.push("other language " + JSON.stringify(otherLang.said));
  }
  check(problems.length === 0,
    "19b a value is taken whole or not at all: a bad lead is said and ignored, a TeamFolder is neither read nor said, and a read"
    + " holding anything reg does not write is not used: " + (problems.join("; ") || "none half used"));
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
  if (!M) problems.push(memberError);
  else {
    let heed = "";
    try { heed = sliceDecl(SRC, "function heedTeam("); }
    catch (e) { problems.push("heedTeam " + e.message); }
    if (heed && ((heed.split("memberHeedUnderPolicy(").length - 1) !== 2 || heed.includes("memberHeed(")))
      problems.push("heedTeam does not call the policy heed twice (the file, then with the box opened) and nothing else");
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
    if (!(bareMiss.stop === true && bareMiss.pinned === false && underMiss.stop === false
        && underMiss.pinned === true && underMiss.state.pins[TEAM].public === lead.public && underMiss.key === null))
      problems.push("no wrap, no pin: bare stop " + bareMiss.stop + " under pinned " + underMiss.pinned);

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

    /* A policy that differs from the file's lead in its last character only: the whole key is compared. */
    const near = lead.public.slice(0, 63) + (lead.public[63] === "0" ? "1" : "0");
    const nearState = empty();
    const underNear = untouched("near key", nearState, () => M.memberHeedUnderPolicy(withWrap, nearState, opened, near));
    if (!(underNear.stop === true && underNear.pinned === false && underNear.key === null
        && underNear.said.length === 1 && underNear.said[0] === sentence))
      problems.push("a policy sharing all but the last character of the lead's key " + JSON.stringify(underNear.said) + " stop " + underNear.stop);

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
    "19c the policy pin is ahead of the first wrap, a ring beside the file, a handover and the pin already held, and is the whole key: "
    + (problems.join("; ") || "that order"));
}

{
  const problems = [];
  if (!M) problems.push(memberError);
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
    let reader = "", facts = "", values = "", keyLine = "", look = "";
    try {
      reader = sliceDecl(SRC, "function readJoinPolicy(");
      look = sliceDecl(SRC, "function policyLookLater(");
      facts = sliceDecl(SRC, "function joinPolicyFacts(");
      values = sliceDecl(SRC, "function policyValues(");
      keyLine = sliceDecl(SRC, "const POLICY_KEY =");
    } catch (e) { problems.push(e.message); }
    if (reader) {
      if (reader.split("execFileSync(").length !== 2) problems.push("exec count " + reader.split("execFileSync(").length);
      if (!reader.includes('execFileSync(REG_TOOL, ["export", POLICY_KEY, at.file, "/y"]')) problems.push("not REG_TOOL exporting the key");
      /* The minute's look, which does not wait, runs the same one program on the same one key. */
      if (look.split("execFile(").length !== 2 || !look.includes('execFile(REG_TOOL, ["export", POLICY_KEY, at.file, "/y"]')) problems.push("the look is not REG_TOOL exporting the key once");
      if (/execFileSync|powershell|cmd\.exe|spawn\s*\(|\bfork\s*\(|child_process|console\.|teamSay/i.test(look)) problems.push("the look runs or says something else");
      if (/execFileSync\(\s*["'`]/.test(reader)) problems.push("a program named in place of REG_TOOL");
      if (/powershell|cmd\.exe|spawn\s*\(|\bfork\s*\(|child_process|dbus-send/i.test(reader + facts + values)) problems.push("another program");
      if (/console\.|teamSay|\.said\b/.test(reader + facts + values)) problems.push("the reader says something itself");
      if (/TeamAboveFolder|LeadKeyAbove|EtiudaStudio/.test(reader + facts + keyLine)) problems.push("studio value");
    }
    if (P.REG_TOOL !== REG_EXE || P.POLICY_KEY !== ASKED) problems.push("path " + P.REG_TOOL + " key " + P.POLICY_KEY);
    const quiet = s => s === "ignore" || (Array.isArray(s) && s.length === 3 && s.every(x => x === "ignore"));
    const tmp = path.resolve(os.tmpdir());
    const reader2 = (answer, platform, fsUsed) =>
      load(SRC, POLICY_DECLS.filter(m => SRC.indexOf(m) >= 0), ["readJoinPolicy", "REG_TOOL", "POLICY_KEY"], POLICY_NAMES, [answer, { platform: platform || "win32" }, fsUsed || fs, os, path]);
    /* A stand-in that writes the export where it is asked, a different folder at every call. */
    const calls = [];
    const win = reader2((file, args, opt) => {
      calls.push({ file: file, args: args.slice(), opt: opt });
      fs.writeFileSync(args[2], exportBytes([["LeadKey", "REG_SZ", calls.length === 1 ? HEX : OTHER]]));
      return null;
    });
    const got = ["en", "pl", "en"].map(l => win.readJoinPolicy(l));
    const c = calls[0] || { args: [] }, scratch = String(c.args[2] || "");
    if (calls.length !== 1 || c.file !== REG_EXE || JSON.stringify(c.args) !== JSON.stringify(["export", ASKED, scratch, "/y"])
        || path.resolve(path.dirname(path.dirname(scratch))) !== tmp || !c.opt || c.opt.windowsHide !== true || c.opt.timeout !== 5000
        || !quiet(c.opt.stdio) || got.some(g => g.lead !== HEX))
      problems.push("read once " + JSON.stringify(calls.map(x => [x.file, x.args, x.opt])) + " " + JSON.stringify(got.map(g => g.lead === HEX)));
    if (scratch && (fs.existsSync(scratch) || fs.existsSync(path.dirname(scratch)))) problems.push("the scratch file stayed");
    let asked = 0, badScratch = "";
    const badLead = reader2((file, args) => {
      asked++;
      badScratch = String(args[2]);
      fs.writeFileSync(args[2], exportBytes([["LeadKey", "REG_SZ", "NO"]]));
      return null;
    });
    const en = badLead.readJoinPolicy("en"), pl = badLead.readJoinPolicy("pl");
    if (asked !== 1 || saidOf(en) !== EN.lead || saidOf(pl) !== PL.lead) problems.push("words " + asked + " " + JSON.stringify([en.said, pl.said]));
    /* Two loads, two reads, two folders: a name made afresh at each read, never one fixed name in the temp folder. */
    const folderName = f => (f ? path.basename(path.dirname(f)) : "");
    if (!scratch || !badScratch || folderName(scratch) === folderName(badScratch))
      problems.push("one scratch folder for two reads " + JSON.stringify([folderName(scratch), folderName(badScratch)]));
    let threw = 0, thrownAt = "";
    const broken = reader2((file, args) => { threw++; thrownAt = String(args[2]); throw new Error("missing"); });
    const none = broken.readJoinPolicy("en");
    broken.readJoinPolicy("pl");
    if (threw !== 1 || !!none.folder || none.lead !== "" || saidOf(none) !== EN.unread || !thrownAt || fs.existsSync(path.dirname(thrownAt)))
      problems.push("throw " + threw + " " + JSON.stringify(none));
    const unmarked = reader2((file, args) => {
      fs.writeFileSync(args[2], exportText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]]), "utf8");
      return null;
    }).readJoinPolicy("en");
    if (!!unmarked.folder || unmarked.lead !== "") problems.push("a file that is not UTF-16 was read " + JSON.stringify(unmarked));
    /* The old door's input, another key's console print, is no export of this key: no policy, and nothing said. */
    const dump = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    0x0\r\n    ProxyServer    REG_SZ    http://127.0.0.1:9\r\n";
    const proxy = P.joinPolicyFrom(dump, "pl");
    if (!!proxy.folder || proxy.lead !== "" || JSON.stringify(proxy.said) !== JSON.stringify([PL.unread])) problems.push("proxy dump " + JSON.stringify(proxy));
    let linuxCalls = 0, made = 0;
    const counting = Object.assign(Object.create(fs), { mkdtempSync: (...a) => { made++; return fs.mkdtempSync(...a); } });
    const off = reader2(() => { linuxCalls++; return null; }, "linux", counting).readJoinPolicy("en");
    if (linuxCalls !== 0 || made !== 0 || !!off.folder || off.lead !== "") problems.push("linux calls " + linuxCalls + " folders " + made);
  }
  check(problems.length === 0,
    "19e the reader starts reg.exe at its fixed path, exporting this one key to a scratch file in a folder of the temp folder"
    + " made afresh at each read and gone after, once whatever the language, and no other program; another key's print is"
    + " no policy: " + (problems.join("; ") || "one call"));
}

/* A strict reader for the template's XML: elements, attributes, text, comments and the declaration, which is all
   the template holds. It throws on what an XML parser refuses of those. */
function parseXml(text, where) {
  let at = 0;
  const fail = why => { throw new Error(where + ": " + why + " at offset " + at); };
  const NAME = /[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/y;
  const entitiesOk = s => s.split("&").slice(1).every(r => /^(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/.test(r));
  const name = () => { NAME.lastIndex = at; const m = NAME.exec(text); if (!m) fail("no name"); at = NAME.lastIndex; return m[0]; };
  const space = () => { const from = at; while (at < text.length && /\s/.test(text[at])) at++; return at > from; };
  if (text.startsWith("<?xml")) { const e = text.indexOf("?>"); if (e < 0) fail("an unclosed declaration"); at = e + 2; }
  const top = { name: "", attrs: {}, kids: [], text: "" }, stack = [top];
  while (at < text.length) {
    const lt = text.indexOf("<", at), chunk = text.slice(at, lt < 0 ? text.length : lt);
    if (chunk) {
      if (!entitiesOk(chunk)) fail("a bare ampersand");
      if (stack.length === 1 && chunk.trim()) fail("text outside the root");
      stack[stack.length - 1].text += chunk;
    }
    if (lt < 0) break;
    at = lt;
    if (text.startsWith("<!--", at)) {
      const e = text.indexOf("-->", at + 4);
      if (e < 0 || text.slice(at + 4, e).includes("--")) fail("a bad comment");
      at = e + 3;
    } else if (text.startsWith("</", at)) {
      at += 2;
      const n = name();
      space();
      if (text[at] !== ">") fail("a bad end tag");
      at++;
      const open = stack.length > 1 ? stack.pop() : null;
      if (!open || open.name !== n) fail("</" + n + "> closes <" + (open ? open.name : "nothing") + ">");
    } else {
      at++;
      const el = { name: name(), attrs: {}, kids: [], text: "" };
      let closed = false;
      for (;;) {
        const spaced = space();
        if (text.startsWith("/>", at)) { at += 2; closed = true; break; }
        if (text[at] === ">") { at++; break; }
        if (!spaced) fail("attributes run together");
        const a = name();
        space();
        if (text[at] !== "=") fail("an attribute with no value");
        at++;
        space();
        const q = text[at];
        if (q !== "\"" && q !== "'") fail("an unquoted attribute");
        const e = text.indexOf(q, at + 1);
        if (e < 0) fail("an unclosed attribute");
        const v = text.slice(at + 1, e);
        if (v.includes("<") || !entitiesOk(v)) fail("a bad attribute value");
        if (Object.prototype.hasOwnProperty.call(el.attrs, a)) fail("a repeated attribute");
        el.attrs[a] = v;
        at = e + 1;
      }
      if (stack.length === 1 && top.kids.length) fail("a second root");
      stack[stack.length - 1].kids.push(el);
      if (!closed) stack.push(el);
    }
  }
  if (stack.length !== 1) fail("<" + stack[stack.length - 1].name + "> is never closed");
  if (top.kids.length !== 1) fail("no root");
  return top.kids[0];
}
const under = (el, name) => el.kids.reduce((out, k) => out.concat(k.name === name ? [k] : [], under(k, name)), []);

let templateDocs = null;
{
  const problems = [];
  const files = { admx: path.join(ROOT, "shell", "policy", "etiuda.admx"),
    en: path.join(ROOT, "shell", "policy", "en-US", "etiuda.adml"), pl: path.join(ROOT, "shell", "policy", "pl-PL", "etiuda.adml") };
  const doc = {}, raw = {};
  for (const [k, file] of Object.entries(files)) {
    try {
      const bytes = fs.readFileSync(file);
      if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) problems.push("bom " + k);
      raw[k] = bytes.toString("utf8");
      if (raw[k].includes("\u2013") || raw[k].includes("\u2014")) problems.push("dash " + k);
      doc[k] = parseXml(raw[k], k);
    } catch (e) { problems.push((e && e.message) || String(e)); }
  }
  /* What the template offers, each policy beside what reads it, so none is a setting nothing reads. All are machine policy
     under the one key both programs read; the registry compares keys without case.
     - The desk, shell/main.js: LeadKey (joinPolicyFacts), DeskNoUpdateCheck (policyNoUpdate); checked below against the shell's
       own text. TeamFolder left with the shared folder: a team works over the relay only, and it is not offered again.
     - A managed installation (decision 49), read by both programs: Managed, SharedComputer, AllowPersonalAccounts, SigninProvider,
       SigninTenant and SupportContact (the desk's managedPolicyFrom, Studio's own reader of the same six); NonPersistent and
       NonPersistentNewDesk, the desk's alone (section 12).
     - Etiuda Studio, from its board 992 and update-check work (Claude α's decisions 10 and 11, 2026-11-11):
       StudioNoUpdateCheck (src/update-note.mjs noUpdateFrom) and AiProvider, AiEndpoint, AiModel, AiKey
       (src/customer-ai.mjs aiPolicyFrom). Studio's old pair (TeamAboveFolder, LeadKeyAbove) left on 2026-10-15, sense pass
       finding 17, because nothing read it; it is not offered again.
     A text is one required box writing REG_SZ, never expandable, since both readers take a string as written. A switch
     writes the DWORD 1 when enabled and 0 when disabled, the value named on the policy itself: both readers take 0 as the
     look left on. The service is a list of exactly the five ids Studio's PROVIDERS knows, in that order, since Studio
     ignores any other value and a typed one is a typo waiting. */
  const KEY = "software\\policies\\etiuda";
  const WANT = {
    LeadKey: { text: "64", desk: true },
    DeskNoUpdateCheck: { onOff: true, desk: true }, StudioNoUpdateCheck: { onOff: true },
    DeskOrganisationModel: { onOff: true },
    AiProvider: { list: ["openai", "anthropic", "google", "azure", "compatible"] },
    AiEndpoint: { text: "2048" }, AiModel: { text: "256" }, AiKey: { text: "1024" },
    Managed: { onOff: true, desk: true }, SharedComputer: { onOff: true, desk: true }, AllowPersonalAccounts: { onOff: true, desk: true },
    SigninProvider: { list: ["microsoft", "google"], desk: true }, SigninTenant: { text: "253", desk: true }, SupportContact: { text: "200", desk: true },
    NonPersistent: { onOff: true, desk: true }, NonPersistentNewDesk: { onOff: true, desk: true },
    PersonalStore: { list: ["off", "on", "company"], desk: true },
  };
  let deskText = "";
  try { deskText = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8").toLowerCase(); } catch (e) { problems.push("shell/main.js unread"); }
  const refs = { string: [], presentation: [] }, boxOf = {};
  if (doc.admx) {
    if (doc.admx.name !== "policyDefinitions") problems.push("admx root " + doc.admx.name);
    const walk = el => {
      for (const v of Object.values(el.attrs)) { const m = /^\$\((string|presentation)\.([^)]+)\)$/.exec(v); if (m) refs[m[1]].push(m[2]); }
      el.kids.forEach(walk);
    };
    walk(doc.admx);
    const policies = under(doc.admx, "policy");
    const names = policies.map(p => p.attrs.name);
    if (JSON.stringify(names.slice().sort()) !== JSON.stringify(Object.keys(WANT).sort())) problems.push("policies " + names.join(","));
    for (const p of policies) {
      const name = p.attrs.name, want = WANT[name];
      if (!want) continue;
      const bad = what => problems.push(name + " " + what);
      if (String(p.attrs.key).toLowerCase() !== KEY) bad("key " + p.attrs.key);
      if (p.attrs.class !== "Machine") bad("class " + p.attrs.class);
      if (want.desk && !deskText.includes("\"" + name.toLowerCase() + "\"")) bad("is not read by shell/main.js");
      const elements = under(p, "elements"), parts = elements.length ? elements[0].kids : [];
      const shown = /^\$\(presentation\.([^)]+)\)$/.exec(p.attrs.presentation || "");
      if (want.onOff) {
        const one = (tag, n) => { const v = under(p, tag); const d = v.length === 1 ? v[0].kids : [];
          return d.length === 1 && d[0].name === "decimal" && d[0].attrs.value === n; };
        if (p.attrs.valueName !== name) bad("valueName " + p.attrs.valueName);
        if (!one("enabledValue", "1") || !one("disabledValue", "0")) bad("does not write 1 when enabled and 0 when disabled");
        if (elements.length || p.attrs.presentation !== undefined) bad("carries elements or a presentation");
        continue;
      }
      if (p.attrs.valueName !== undefined) bad("names its value on the policy");
      if (parts.length !== 1) { bad(parts.length + " elements"); continue; }
      const el = parts[0];
      if (el.attrs.valueName !== name || el.attrs.required !== "true") bad("valueName " + el.attrs.valueName + " required " + el.attrs.required);
      if (want.text) {
        if (el.name !== "text" || el.attrs.maxLength !== want.text || el.attrs.expandable === "true")
          bad(el.name + " length " + el.attrs.maxLength + " expandable " + el.attrs.expandable);
        if (shown) boxOf[shown[1]] = ["textBox", el.attrs.id];
      } else {
        const items = el.name === "enum" ? el.kids : [];
        const ids = items.map(i => { const s = under(i, "string"); return i.name === "item" && s.length === 1 ? s[0].text.trim() : "?"; });
        if (JSON.stringify(ids) !== JSON.stringify(want.list)) bad(el.name + " offers " + ids.join(","));
        if (shown) boxOf[shown[1]] = ["dropdownList", el.attrs.id];
      }
    }
    const cats = under(doc.admx, "category").map(c => c.attrs.name).join(",");
    if (cats !== "Etiuda") problems.push("categories " + cats);
  }
  const order = {};
  for (const lang of ["en", "pl"]) {
    const d = doc[lang];
    if (!d) continue;
    if (d.name !== "policyDefinitionResources") problems.push(lang + " root " + d.name);
    const strings = under(d, "string"), shows = under(d, "presentation");
    order[lang] = strings.map(s => s.attrs.id).concat(["|"], shows.map(s => s.attrs.id));
    for (const [have, want, what] of [[strings.map(s => s.attrs.id), refs.string, "strings"], [shows.map(s => s.attrs.id), refs.presentation, "presentations"]]) {
      const h = new Set(have), w = new Set(want);
      if (h.size !== have.length) problems.push(lang + " " + what + " with an id twice");
      const missing = [...w].filter(x => !h.has(x)), spare = [...h].filter(x => !w.has(x));
      if (missing.length || spare.length) problems.push(lang + " " + what + " missing [" + missing.join(",") + "] unreferenced [" + spare.join(",") + "]");
    }
    /* Each presentation is the one control its policy's element takes, bound to that element, with words to show:
       a text box's label, a list's own text. */
    for (const p of shows) {
      const want = boxOf[p.attrs.id], c = p.kids, labels = c.length === 1 ? under(c[0], "label") : [];
      const words = !want ? "" : want[0] === "textBox" ? (labels.length === 1 ? labels[0].text.trim() : "") : (c.length === 1 ? c[0].text.trim() : "");
      if (!want || c.length !== 1 || c[0].name !== want[0] || c[0].attrs.refId !== want[1] || !words) problems.push(lang + " presentation " + p.attrs.id);
    }
    for (const s of strings) if (!s.text.trim()) problems.push(lang + " string " + s.attrs.id + " is empty");
    const text = id => (strings.find(s => s.attrs.id === id) || { text: "" }).text.replace(/\r\n/g, "\n");
    if (text("EtiudaCat") !== "Etiuda") problems.push(lang + " category name");
    const B2 = {
      en: {
        name: "Set sync across computers",
        explain: "This policy setting decides whether Etiuda keeps a person's own catalogs, edits and settings in a folder of their own Microsoft or Google account, so that they follow the person to every computer they sign in on (\"Sync across computers\" in Etiuda's Settings).\n\nIf you enable this policy setting, its value decides, and the person cannot change it: \"off\" turns sync off; \"on\" turns it on, in the person's own account, and the copy stays theirs whatever happens to the licence; \"company\" turns it on in the same folder, but ties the copy to the organisation's licence, so when the person is removed from the licence, sync ends at once and nothing on the computer is lost.\n\nIf you disable or do not configure this policy setting, sync is on from sign-in and the person can turn it off, except where \"Manage the accounts on this computer for the organisation\" is enabled: there sync is off.",
        managedB: "Sync across computers is off unless \"Set sync across computers\" turns it on. Everything else in both programs works as on any computer.",
        managedC: "\n\nAn account once kept on a managed computer stays kept. It stops being kept when \"Treat this computer as shared\" is enabled, when \"Set the sign-in provider\" or \"Set the organisation's sign-in tenant\" changes so that the account falls outside it, or when the file signin.json in that person's %APPDATA%\\etiuda folder is removed.",
      },
      pl: {
        name: "Ustaw synchronizację między komputerami",
        explain: "To ustawienie zasad określa, czy Etiuda przechowuje własne katalogi, zmiany i ustawienia danej osoby w folderze na jej własnym koncie Microsoft lub Google, tak by towarzyszyły jej na każdym komputerze, na którym się zaloguje („Synchronizacja między komputerami” w Ustawieniach Etiudy).\n\nJeśli to ustawienie zasad zostanie włączone, decyduje jego wartość, a osoba korzystająca z Etiudy nie może jej zmienić: „off” wyłącza synchronizację; „on” ją włącza, na własnym koncie tej osoby, a kopia pozostaje jej niezależnie od losów licencji; „company” włącza ją w tym samym folderze, ale wiąże kopię z licencją organizacji, więc gdy osoba zostanie usunięta z licencji, synchronizacja od razu się kończy, a na komputerze nic nie ginie.\n\nJeśli to ustawienie zasad zostanie wyłączone lub nie zostanie skonfigurowane, synchronizacja jest włączona od zalogowania i osoba może ją wyłączyć, z wyjątkiem komputerów, na których włączone jest „Zarządzaj kontami na tym komputerze w imieniu organizacji”: tam synchronizacja jest wyłączona.",
        managedB: "Synchronizacja między komputerami jest wyłączona, chyba że włączy ją ustawienie „Ustaw synchronizację między komputerami”. Wszystko inne w obu aplikacjach działa tak jak na każdym komputerze.",
        managedC: "\n\nKonto raz zachowane na komputerze zarządzanym pozostaje zachowane. Przestaje nim być, gdy zostanie włączone ustawienie „Traktuj ten komputer jako wspólny”, gdy „Ustaw dostawcę logowania” lub „Ustaw dzierżawę logowania organizacji” zmieni się tak, że konto znajdzie się poza nim, albo gdy zostanie usunięty plik signin.json w folderze %APPDATA%\\etiuda tej osoby.",
      },
    }[lang];
    if (text("PersonalStore") !== B2.name) problems.push(lang + " PersonalStore displayName");
    if (text("PersonalStore_Explain") !== B2.explain) problems.push(lang + " PersonalStore_Explain");
    const mg = text("Managed_Explain");
    if (!mg.includes(B2.managedB)) problems.push(lang + " Managed_Explain missing B2(b)");
    if (!mg.includes(B2.managedC)) problems.push(lang + " Managed_Explain missing B2(c)");
    const pres = id => { const p = shows.find(x => x.attrs.id === id); return p && p.kids.length === 1 ? p.kids[0].text.replace(/\r\n/g, "\n") : ""; };
    const B8 = {
      en: {
        label: "Sync:",
        off: "Off (off)",
        on: "On, the person's own (on)",
        company: "On, tied to the organisation's licence (company)",
      },
      pl: {
        label: "Synchronizacja:",
        off: "Wyłączona (off)",
        on: "Włączona, należy do osoby (on)",
        company: "Włączona, powiązana z licencją organizacji (company)",
      },
    }[lang];
    if (pres("PersonalStore") !== B8.label) problems.push(lang + " PersonalStore dropdown label");
    if (text("PersonalStore_off") !== B8.off) problems.push(lang + " PersonalStore_off");
    if (text("PersonalStore_on") !== B8.on) problems.push(lang + " PersonalStore_on");
    if (text("PersonalStore_company") !== B8.company) problems.push(lang + " PersonalStore_company");
  }
  templateDocs = doc;
  if (order.en && order.pl && order.en.join() !== order.pl.join()) problems.push("en and pl ids in another order");
  if (raw.pl && (!raw.pl.includes("stanowisko") || !/[ąćęłńóśźż]/i.test(raw.pl))) problems.push("polish copy");
  if (raw.en && !raw.en.includes("lowercase hexadecimal")) problems.push("english copy");
  check(problems.length === 0,
    "19f the template parses, its strings and presentations match the ADMX one for one in English and in Polish, each"
    + " policy writes its own value under the key both programs read, as a text box, a 1-or-0 switch or the list of"
    + " Studio's five services, and none is a setting nothing reads: "
    + (problems.join("; ") || "shell/policy"));
}

/* 19i: THE TEMPLATE REACHES AN ADMINISTRATOR WITH THE PROGRAM (sense pass finding 17). Read from the build config rather
   than from a built installer: the Windows build copies shell/policy, whole, to resources/policy beside the program, and
   that folder holds the ADMX, its two ADMLs and readme.txt, where an all-users install belongs, and nothing else. The Linux
   packages carry none, since only Windows reads Group Policy. */
{
  const problems = [];
  const POLICY = path.join(ROOT, "shell", "policy");
  const copies = s => !!s && typeof s === "object" && path.resolve(ROOT, String(s.from || "")) === POLICY;
  try {
    const cfg = nodeRequire(path.join(ROOT, "electron-builder.js"));
    const policy = [].concat((cfg.win && cfg.win.extraResources) || []).filter(copies);
    if (policy.length !== 1) problems.push(policy.length + " Windows extraResources entries copy shell/policy");
    else {
      if (policy[0].to !== "policy") problems.push("copied to " + JSON.stringify(policy[0].to));
      if (policy[0].filter !== undefined) problems.push("filtered " + JSON.stringify(policy[0].filter));
    }
    const walk = (dir, rel) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory()
      ? walk(path.join(dir, d.name), rel + d.name + "/") : [rel + d.name]);
    const held = walk(POLICY, "").sort().join(",");
    if (held !== "en-US/etiuda.adml,etiuda.admx,pl-PL/etiuda.adml,readme.txt") problems.push("shell/policy holds " + held);
    if ([].concat((cfg.linux && cfg.linux.extraResources) || [], cfg.extraResources || []).some(copies)) problems.push("a Linux package carries it");
  } catch (e) { problems.push("electron-builder.js: " + ((e && e.message) || e)); }
  check(problems.length === 0,
    "19i the Windows installer carries the template beside the program, shell/policy copied whole to resources/policy, and"
    + " that folder is the ADMX, its English and Polish ADML and the readme: " + (problems.join("; ") || "resources/policy"));
}

/* ---- the whole shell, beside a stand-in reg.exe ------------------------------------------------------------- */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-join-policy-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SHELL = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
/* What the console carries of the two letters POLISH holds: 852 has them, 437 fits each to its plain letter. */
const PAGES = { 852: { "ł": [0x88], "ę": [0xa9] }, 437: { "ł": [0x6c], "ę": [0x65] } };
function consoleBytes(text, page) {
  if (!PAGES[page]) return Buffer.from(text, "utf8");
  return Buffer.from(Array.from(text).flatMap(ch => (ch.charCodeAt(0) < 128 ? [ch.charCodeAt(0)] : PAGES[page][ch] || [0x3f])));
}
/* reg.exe as a shell meets it. `registry` is the key as {rows, subkeys}, null where there is none, or a function of
   how many times the key has been asked for. Any other key is not there. With `later`, the look without waiting (execFile)
   is held until flush() answers it, as reg would: "late" its timeout, no key its exit 1, a key its export. */
function standInReg(registry, page, later) {
  const calls = [], pending = [];
  const asked = () => calls.filter(c => c.args[1] === ASKED);
  const execFileSync = (file, args, opt) => {
    args = (args || []).map(String);
    calls.push({ file: String(file), args: args, opt: opt });
    const key = file === REG_EXE && args[1] === ASKED ? (typeof registry === "function" ? registry(asked().length) : registry) : null;
    const fail = () => { const e = new Error("reg.exe exited 1"); e.status = 1; throw e; };
    /* "late" is reg stopped at the reader's timeout, as execFileSync reports one: no exit status, a signal. */
    if (key === "late") { const e = new Error("spawnSync reg.exe ETIMEDOUT"); e.code = "ETIMEDOUT"; e.status = null; e.signal = "SIGTERM"; throw e; }
    if (!key) fail();
    let out = "";
    if (args[0] === "export" && args.length === 4 && args[3] === "/y") {
      fs.writeFileSync(args[2], exportBytes(key.rows, key.subkeys));
      out = "The operation completed successfully.\r\r\n";
    } else if (args[0] === "query" && args.length === 2) out = queryText(key.rows, key.subkeys);
    else fail();
    const stdio = opt && opt.stdio;
    if (stdio === "ignore" || (Array.isArray(stdio) && stdio[1] === "ignore")) return null;
    const bytes = consoleBytes(out, page);
    return opt && opt.encoding && opt.encoding !== "buffer" ? bytes.toString(opt.encoding) : bytes;
  };
  const execFile = !later ? () => { throw new Error("no program runs here"); } : (file, args, opt, cb) => {
    args = (args || []).map(String);
    calls.push({ file: String(file), args: args, opt: opt, later: true });
    const n = asked().length;
    pending.push(() => {
      const key = file === REG_EXE && args[1] === ASKED ? (typeof registry === "function" ? registry(n) : registry) : null;
      if (key === "late") { const e = new Error("reg.exe ETIMEDOUT"); e.killed = true; e.code = null; e.signal = "SIGTERM"; cb(e); return; }
      if (!key) { const e = new Error("Command failed: reg.exe"); e.code = 1; cb(e); return; }
      fs.writeFileSync(args[2], exportBytes(key.rows, key.subkeys));
      cb(null);
    });
  };
  const flush = () => { let n = 0; while (pending.length) { pending.shift()(); n++; } return n; };
  nodeRequire("./reg-stand.cjs").markStand(execFileSync, execFile);
  return { calls, asked, pending, flush, cp: { execFileSync, execFile } };
}
/* Every leg below asks the Windows arm of the reader, so the shell runs as Windows on any machine. */
function asWindows(fn) {
  const was = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  try { return fn(); } finally { Object.defineProperty(process, "platform", was); }
}
/* One desk: its desk.json, the shell evaluated afresh over it with the stand-in reg, and its own .cjs files evaluated
   with the same require so the proxy reader meets the stand-in too. setLang changes the desk's language as a write would. */
function loadDesk(name, desk, reg, shell) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1 }, desk)), "utf8");
  const said = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false }, getLocale: () => "en-US",
           getPreferredSystemLanguages: () => ["en-US"] },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
  };
  const own = {};
  const req = n => (n === "electron" ? electron : (n === "node:child_process" || n === "child_process") ? reg.cp
    : (path.isAbsolute(n) && /\.cjs$/.test(n)) ? (own[n] || (own[n] = ownModule(n))) : nodeRequire(n));
  const ownModule = n => {
    const m = { exports: {} };
    new Function("require", "module", "exports", "__dirname", "__filename", fs.readFileSync(n, "utf8"))(req, m, m.exports, path.dirname(n), n);
    return m.exports;
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    (shell || SHELL) + "\nreturn { catalogFolder, heedTeam, teamCovering, joinView,"
    + " setLang: l => { if (deskKeys === undefined) deskKeys = readDesk(); deskKeys = Object.assign({}, deskKeys, { eUiLang: l }); },"
    + " peek: function (expr) { return eval(expr); } };")(
    req, path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  return { api, said, ud, envelope: () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8")) };
}
const POLICY_SENTENCES = Object.values(EN).concat(Object.values(PL));
const policySaid = D => D.said.map(s => s.replace(/^ERR etiuda: /, "")).filter(s => POLICY_SENTENCES.indexOf(s) >= 0);
/* Every export the shell asked for wrote into a folder of its own under the temp folder, which is gone after. */
function scratchGone(reg, problems, name) {
  for (const c of reg.asked()) {
    if (c.args[0] !== "export") continue;
    const dir = path.dirname(c.args[2]);
    if (path.resolve(path.dirname(dir)) !== path.resolve(os.tmpdir()) || fs.existsSync(c.args[2]) || fs.existsSync(dir))
      problems.push(name + ": the scratch file " + (fs.existsSync(dir) ? "stayed" : "was not in the temp folder"));
  }
}

{
  const problems = [];
  try {
    const mine = path.join(LAB, "desk-folder");
    fs.mkdirSync(mine, { recursive: true });
    const deskIn = lang => ({ keys: { eCatalogFolder: mine, eUiLang: lang } });
    const desks = [];
    for (const page of [852, 437]) {
      const reg = standInReg({ rows: [["TeamFolder", "REG_SZ", POLISH], ["LeadKey", "REG_SZ", HEX]] }, page);
      const D = asWindows(() => loadDesk("page-" + page, deskIn("en"), reg));
      desks.push(D);
      const got = asWindows(() => D.api.catalogFolder());
      if (got !== mine || reg.asked().length !== 0 || policySaid(D).length)
        problems.push("code page " + page + ": " + JSON.stringify(got) + " in " + reg.asked().length + " call(s)");
      scratchGone(reg, problems, "code page " + page);
    }
    const moving = standInReg(n => ({ rows: [["TeamFolder", "REG_SZ", n === 1 ? "D:\\First" : "D:\\Second"], ["LeadKey", "REG_SZ", HEX]] }), 65001);
    const L = asWindows(() => loadDesk("languages", deskIn("en"), moving));
    desks.push(L);
    const seen = asWindows(() => ["en", "pl", "en"].map(l => { L.api.setLang(l); return L.api.catalogFolder(); }));
    if (seen.some(f => f !== mine) || moving.asked().length !== 0)
      problems.push("a language changed: " + JSON.stringify(seen) + " in " + moving.asked().length + " call(s)");
    for (const [name, rows, want] of [
      ["leading spaces", [["TeamFolder", "REG_SZ", "   D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]], []],
      ["a line break inside", [["TeamFolder", "REG_SZ", "D:\\Quay\r\nteam"], ["LeadKey", "REG_SZ", HEX]], []],
      ["spaces for a lead", [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", "   "]], [PL.lead]],
    ]) {
      const reg = standInReg({ rows: rows }, 65001);
      const D = asWindows(() => loadDesk("bad-" + desks.length, deskIn("pl"), reg));
      desks.push(D);
      const folders = asWindows(() => {
        const out = [D.api.catalogFolder()];
        D.api.joinView();
        D.api.setLang("en");
        D.api.joinView();
        out.push(D.api.catalogFolder(), D.api.catalogFolder());
        return out;
      });
      if (folders.some(f => f !== mine) || reg.asked().length !== 1 || JSON.stringify(policySaid(D)) !== JSON.stringify(want))
        problems.push(name + ": " + JSON.stringify(folders.map(f => (f === mine ? "the desk's" : f))) + " said " + JSON.stringify(policySaid(D)));
    }
    const absent = standInReg(null, 65001);
    const N = asWindows(() => loadDesk("absent", deskIn("en"), absent));
    desks.push(N);
    const plain = asWindows(() => [N.api.catalogFolder(), N.api.catalogFolder()]);
    if (plain.some(f => f !== mine) || absent.asked().length !== 0 || policySaid(N).length) problems.push("no key " + JSON.stringify(plain));
    const leaked = desks.reduce((out, D) => out.concat(D.said), []).map(s => s.split(LAB).join("<lab>"))
      .filter(s => /Quay|Dzia|Ksi|First|Second/.test(s) || s.includes(HEX));
    if (leaked.length) problems.push("the policy's text in what the shell said: " + leaked.length + " line(s)");
  } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  /* Was: the shell's catalog folder is the one the key's TeamFolder holds, the key read once. Now a team works over the relay
     only: the catalog folder is the desk's own whatever TeamFolder holds and asks nothing of the key; the join view reads it once
     whatever the language and says a bad lead once in the desk's language. */
  check(problems.length === 0,
    "19g the shell's catalog folder is the desk's own whatever the key's TeamFolder holds, whatever the console's code page, and asks"
    + " nothing of the key; the join view reads it once whatever the language, a bad lead said once in the desk's language, and nothing of the key said: "
    + (problems.join("; ") || "852 and 437 alike"));
}

{
  const problems = [];
  try {
    const signedBytes = load(SRC, ["function canonJson(", "function signedBytesOf("], ["signedBytesOf"], ["crypto", "Buffer"], [crypto, Buffer]).signedBytesOf;
    const A = crypto.generateKeyPairSync("ed25519"), B = crypto.generateKeyPairSync("ed25519");
    const leadA = { keyId: "quay-old", public: pubHex(A.publicKey) }, leadB = { keyId: "quay-new", public: pubHex(B.publicKey) };
    const RT1 = hex(16), RELAY = "https://etiuda.dev/relay/v1";
    const teamText = (id, who, priv, epoch) => {
      const body = { format: 1, kind: "etiuda-team", id: id, catalogs: ["lamp-shop"], lead: who, sealed: true, exportsSealed: false,
        epoch: epoch || 1, roster: [], channel: { kind: "relay", rt: RT1, url: RELAY } };
      body.sig = { alg: "Ed25519", keyId: who.keyId };
      body.sig.value = crypto.sign(null, signedBytes(body), priv).toString("hex");
      return JSON.stringify(body, null, 1) + "\n";
    };
    const policyB = { rows: [["LeadKey", "REG_SZ", leadB.public]] };
    /* Was: A's file in the desk's folder. Now a team works over the relay only: a relay team T1 pinned by A's invitation, A's file in
       its relay mirror, and policy naming B. The desk does not follow T1 while policy names another lead, so it heeds and says
       nothing of that file, and the file covers nothing. */
    const T1 = "t-" + hex(8);
    const keptDesk = name => {
      const F = path.join(LAB, name, "relay", RT1);
      fs.mkdirSync(F, { recursive: true });
      fs.writeFileSync(path.join(F, "etiuda-team.json"), teamText(T1, leadA, A.privateKey), "utf8");
      return { F: F, desk: { keys: { eCatalogFolder: path.join(LAB, name + "-own"), eUiLang: "en" }, teamPins: { [T1]: leadA },
        teamPinFrom: { [T1]: "invite" }, teamChannel: { [T1]: { kind: "relay", rt: RT1, url: RELAY } } } };
    };
    const kd = keptDesk("kept"), F1 = kd.F, file1 = path.join(F1, "etiuda-team.json");
    const D = asWindows(() => loadDesk("kept", kd.desk, standInReg(policyB, 65001)));
    const sentence = "ERR etiuda: " + file1 + " is signed by a key other than the lead's this desk trusts for team " + T1 + ", so nothing in it is used";
    const covers = asWindows(() => {
      D.api.heedTeam();
      const first = D.api.teamCovering(F1, "lamp-shop");
      fs.writeFileSync(file1, teamText(T1, leadA, A.privateKey, 2), "utf8");
      D.api.heedTeam();
      return [first, D.api.teamCovering(F1, "lamp-shop")];
    });
    const told = D.said.filter(s => s === sentence).length, pins = D.envelope().teamPins || {};
    const followed = asWindows(() => D.api.catalogFolder()) === F1;
    if (covers.some(c => c !== null) || told !== 0 || followed || !pins[T1] || pins[T1].public !== leadA.public)
      problems.push("a kept pin of another key: covered " + covers.map(c => (c ? "by its file" : "by nothing")).join(", ")
        + ", said " + told + " time(s), followed " + followed + ", pin " + (pins[T1] && pins[T1].public === leadA.public ? "kept" : "lost"));
    /* The control: the same desk with no policy follows T1 and is covered by that file, so the null above is the policy's doing. */
    const kc = keptDesk("kept-control");
    const C = asWindows(() => loadDesk("kept-control", kc.desk, standInReg(null, 65001)));
    const plain = asWindows(() => { C.api.heedTeam(); return C.api.catalogFolder() === kc.F ? C.api.teamCovering(kc.F, "lamp-shop") : null; });
    if (!plain || plain.lead.public !== leadA.public) problems.push("the control: no policy, and the kept pin's file covers nothing");
    /* Was: a team this desk barred, B's file in its folder, policy naming B: the first heed under the policy lifts the bar and pins B.
       Now no folder is read as a team: B's file in the desk's folder pins nothing, and the bar stays. */
    const T2 = "t-" + hex(8), F2 = path.join(LAB, "barred-folder");
    fs.mkdirSync(F2, { recursive: true });
    fs.writeFileSync(path.join(F2, "etiuda-team.json"), teamText(T2, leadB, B.privateKey), "utf8");
    const E = asWindows(() => loadDesk("barred", { keys: { eCatalogFolder: F2, eUiLang: "en" }, teamBarred: [T2] }, standInReg(policyB, 65001)));
    const coverB = asWindows(() => { E.api.heedTeam(); return E.api.teamCovering(F2, "lamp-shop"); });
    const env = E.envelope(), pinsB = env.teamPins || {};
    if (pinsB[T2] || coverB)
      problems.push("a barred team's file in a plain folder under its policy lead: pin " + (pinsB[T2] ? "set" : "missing") + ", barred "
        + ((env.teamBarred || []).indexOf(T2) >= 0) + ", covered " + !!coverB);
  } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0,
    "19h a policy lead outranks a pin kept for another key: the relay team under that key is not followed and its file covers"
    + " nothing, the kept pin stays for when the policy goes, and a barred team's file in a plain folder pins nothing: "
    + (problems.join("; ") || "the policy's lead alone"));
}

{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    process.env.TEST_POLICY_SHARE = "D:\\Quay";
    try {
      const got = P.joinPolicyFrom(exportText([
        ["TeamFolder", "REG_EXPAND_SZ", "%TEST_POLICY_SHARE%\\team"],
        ["LeadKey", "REG_SZ", HEX]
      ]), "en");
      if (got.folder || got.lead !== HEX || got.said.length !== 0)
        problems.push("an expandable folder was read: " + JSON.stringify(got));
      const gotLiteral = P.joinPolicyFrom(exportText([
        ["TeamFolder", "REG_EXPAND_SZ", "D:\\Quay\\team"],
        ["LeadKey", "REG_SZ", HEX]
      ]), "en");
      if (gotLiteral.folder || gotLiteral.lead !== HEX || gotLiteral.said.length !== 0)
        problems.push("a literal expandable folder was read: " + JSON.stringify(gotLiteral));
      const gotUnresolved = P.joinPolicyFrom(exportText([
        ["TeamFolder", "REG_EXPAND_SZ", "D:\\%UNRESOLVED_POLICY_X%\\team"],
        ["LeadKey", "REG_SZ", HEX]
      ]), "en");
      if (!!gotUnresolved.folder || gotUnresolved.lead !== HEX || gotUnresolved.said.length !== 0)
        problems.push("an unresolved variable was said or dropped the lead: " + JSON.stringify(gotUnresolved));
      const gotToString = P.joinPolicyFrom(exportText([
        ["TeamFolder", "REG_EXPAND_SZ", "D:\\%toString%\\team"],
        ["LeadKey", "REG_SZ", HEX]
      ]), "en");
      if (!!gotToString.folder || gotToString.lead !== HEX || gotToString.said.length !== 0)
        problems.push("an inherited name was said or dropped the lead: " + JSON.stringify(gotToString));
    } finally {
      delete process.env.TEST_POLICY_SHARE;
    }
  }
  /* Was: an expandable TeamFolder filled from the environment, unresolved variables and inherited names bad. Now TeamFolder is not
     read at all, so none of the four is filled, said or let drop the lead beside it. */
  check(problems.length === 0,
    "19j an expandable TeamFolder is neither filled from the environment nor said, whatever its variables, and the lead beside it is kept (the lead's own expansion is 19l's): "
    + (problems.join("; ") || "four folders unread"));
}

/* 19k: DeskNoUpdateCheck, the administrator's switch for the hourly look for a new version (Claude α's decision 10,
   2026-11-11): set to anything but 0, as a DWORD or a string, it turns the look off; absent, empty or 0 leaves it on; a DWORD
   is read for its number, and the team values beside it are read as before. */
{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    const off = rows => P.joinPolicyFrom(exportText(rows), "en").noUpdate;
    const cases = [
      [[], false, "absent"],
      [[["DeskNoUpdateCheck", "REG_DWORD", 1]], true, "a DWORD of 1"],
      [[["DeskNoUpdateCheck", "REG_DWORD", 7]], true, "a DWORD of 7"],
      [[["DeskNoUpdateCheck", "REG_DWORD", 0]], false, "a DWORD of 0"],
      [[["DeskNoUpdateCheck", "REG_SZ", "1"]], true, "the string 1"],
      [[["DeskNoUpdateCheck", "REG_SZ", "0"]], false, "the string 0"],
      [[["DeskNoUpdateCheck", "REG_SZ", ""]], false, "an empty string"],
      [[["desknoupdatecheck", "REG_DWORD", 1]], true, "the name in lower case"],
      [[["StudioNoUpdateCheck", "REG_DWORD", 1]], false, "Studio's own value"],
    ];
    for (const [rows, want, why] of cases) if (off(rows) !== want) problems.push(why + " reads " + off(rows));
    const both = P.joinPolicyFrom(exportText([["DeskNoUpdateCheck", "REG_DWORD", 1], ["TeamFolder", "REG_SZ", "D:\\Quay\\team"],
      ["LeadKey", "REG_SZ", HEX]]), "en");
    if (!both.noUpdate || both.folder || both.lead !== HEX || both.said.length !== 0)
      problems.push("beside the team values " + JSON.stringify(both));
    const badBeside = P.joinPolicyFrom(exportText([["DeskNoUpdateCheck", "REG_DWORD", 1], ["LeadKey", "REG_SZ", "AB".repeat(32)]]), "en");
    if (!badBeside.noUpdate) problems.push("a bad team value beside it voids the switch " + JSON.stringify(badBeside));
    const dwordFolder = P.joinPolicyFrom(exportText([["TeamFolder", "REG_DWORD", 1]]), "en");
    if (!!dwordFolder.folder || dwordFolder.said.length !== 0) problems.push("a DWORD folder " + JSON.stringify(dwordFolder));
  }
  check(problems.length === 0, "19k DeskNoUpdateCheck turns the version look off for anything but 0, a DWORD read for its number: "
    + (problems.join("; ") || "nine values and two beside the team pair as they should be"));
}

/* 19l: AN EXPANDABLE LEAD IS TAKEN AS WRITTEN (Grok's review 8, finding 1). A variable in the person's environment never
   becomes the lead this desk trusts: one that would expand to a good key is the bad lead said, and 64 lower-case hex written
   into an expandable value is taken. Lifting plant:lead-as-written
   expands the lead again, and the leg goes red. */
function leadFromEnvironment(Pd) {
  const problems = [];
  process.env.TEST_POLICY_LEAD_19L = HEX;
  try {
    const named = Pd.joinPolicyFrom(exportText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_EXPAND_SZ", "%TEST_POLICY_LEAD_19L%"]]), "en");
    if (named.lead !== "" || !!named.folder || saidOf(named) !== EN.lead)
      problems.push("a variable became the lead " + JSON.stringify(named));
    const alone = Pd.joinPolicyFrom(exportText([["LeadKey", "REG_EXPAND_SZ", "%TEST_POLICY_LEAD_19L%"]]), "en");
    if (alone.lead !== "" || saidOf(alone) !== EN.lead) problems.push("a variable alone became the lead " + JSON.stringify(alone));
    const written = Pd.joinPolicyFrom(exportText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_EXPAND_SZ", HEX]]), "en");
    if (written.lead !== HEX || written.folder || written.said.length !== 0)
      problems.push("a key written into an expandable value was not taken " + JSON.stringify(written));
  } finally { delete process.env.TEST_POLICY_LEAD_19L; }
  return problems;
}
{
  const problems = P ? leadFromEnvironment(P) : [loadError];
  check(problems.length === 0, "19l an expandable LeadKey is taken as written, never filled from the person's environment: "
    + (problems.join("; ") || "the variable said as a bad lead, the written key taken"));
  if (PLANTS_OFF) skip("19l lifting plant:lead-as-written fills the lead from the environment again (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SRC, "lead-as-written",
      "    if ((lead.type === \"REG_SZ\" || lead.type === \"REG_EXPAND_SZ\") && policyLeadOk(lead.value.replace(/%([^%]+)%/g, (m, n) => process.env[n] || m))) leadValue = lead.value.replace(/%([^%]+)%/g, (m, n) => process.env[n] || m);");
    let turned = [];
    try { turned = src ? leadFromEnvironment(load(src, POLICY_DECLS.filter(m => src.indexOf(m) >= 0), ["joinPolicyFrom"], POLICY_NAMES, [() => "", { platform: "linux", env: process.env }, fs, os, path])) : []; }
    catch (e) { turned = []; problems.push("the lifted copy: " + e.message); }
    check(!!src && turned.length > 0, "19l lifting plant:lead-as-written fills the lead from the environment again: "
      + (src ? turned.length + " problem(s)" : "the plant is not on exactly one line"));
  }
}

/* 19m: WHAT POLICY SET AND THE DESK CANNOT USE REACHES THE PAGE, AND A READ THAT FAILED IS TOLD FROM A KEY THAT IS NOT THERE
   (Grok's review 8, finding 3). A bad value's sentences, in the desk's language, are the join view's policySaid, for Settings
   to print as they stand; a good key gives none. A read reg did not finish (its timeout) is unread and said once in the log;
   reg's exit 1, the key absent, is not. Lifting plant:policy-said-view leaves the sentences in the log alone, and lifting
   plant:policy-unread reads a stopped reg as no key. */
const UNREAD_LINE = { test: l => String(l).indexOf(EN.unread) >= 0 };
let r8Desks = 0;
function policyToPage(shell) {
  const problems = [];
  const mine = path.join(LAB, "r8-folder");
  fs.mkdirSync(mine, { recursive: true });
  const viewOf = (registry, lang) => {
    const D = asWindows(() => loadDesk("r8-" + (r8Desks++), { keys: { eCatalogFolder: mine, eUiLang: lang } }, standInReg(registry, 65001), shell));
    return { D: D, view: asWindows(() => D.api.joinView()) || {} };
  };
  const bad = viewOf({ rows: [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", "   "]] }, "pl");
  if (JSON.stringify(bad.view.policySaid) !== JSON.stringify([PL.lead])) problems.push("a bad lead's sentences " + JSON.stringify(bad.view.policySaid));
  const good = viewOf({ rows: [["TeamFolder", "REG_SZ", mine], ["LeadKey", "REG_SZ", HEX]] }, "en");
  if (good.view.policySaid !== undefined) problems.push("a good key said " + JSON.stringify(good.view.policySaid));
  const late = viewOf("late", "en"), absent = viewOf(null, "en");
  const told = D => D.said.filter(l => UNREAD_LINE.test(l)).length;
  if (told(late.D) !== 1 || JSON.stringify(late.view.policySaid) !== JSON.stringify([EN.unread])) problems.push("a stopped reg: said " + told(late.D) + " time(s), " + JSON.stringify(late.view.policySaid));
  if (told(absent.D) !== 0 || absent.view.policySaid !== undefined) problems.push("no key: said " + told(absent.D) + " time(s)");
  return problems;
}
{
  let problems = [];
  try { problems = policyToPage(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19m a bad policy value's sentences reach the join view in the desk's language, a good key's none, and a read"
    + " reg did not finish is said once as unread where a key that is not there is not: " + (problems.join("; ") || "one sentence in Polish, one unread line"));
  if (PLANTS_OFF) skip("19m lifting plant:policy-said-view and plant:policy-unread each turns 19m red (ETIUDA_PLANTS=off)");
  else {
    const lifts = [["policy-said-view", "  /* plant lifted */"], ["policy-unread", "      } catch { text = \"\"; }"]].map(([name, line]) => {
      const src = liftPlant(SHELL, name, line);
      if (!src) return name + " not on exactly one line";
      let p = [];
      try { p = policyToPage(src); } catch (e) { p = ["harness: " + e.message]; }
      return p.length ? "" : name + " lifted and 19m still green";
    }).filter(Boolean);
    check(lifts.length === 0, "19m lifting plant:policy-said-view and plant:policy-unread each turns 19m red: " + (lifts.join("; ") || "both red"));
  }
}

/* 19n: A READ THAT FAILED KEEPS THE VERSION LOOK OFF, AND IS TRIED AGAIN (Grok's review 17 of the update offer, finding 4).
   reg stopped at its timeout: the look is off, since a DeskNoUpdateCheck the read missed is not taken as unset, and a second
   ask at once starts no second reg. Two hours on, the key is read again, and its 0 leaves the look on; a read that worked is
   looked at again once its minute has passed (review 28, finding 4), without waiting: one asynchronous call, no second
   synchronous one. Lifting plant:policy-reread keeps the failed read for the run, and plant:look-off-unread lets it arm. */
function lookUnderFailedRead(src) {
  const problems = [];
  let calls = 0, looks = 0;
  const answer = (file, args) => {
    calls++;
    if (calls === 1) { const e = new Error("spawnSync reg.exe ETIMEDOUT"); e.code = "ETIMEDOUT"; e.status = null; throw e; }
    fs.writeFileSync(args[2], exportBytes([["DeskNoUpdateCheck", "REG_DWORD", 0]]));
    return null;
  };
  const R = load(src, POLICY_DECLS.concat(["function updateLookOff("]).filter(m => src.indexOf(m) >= 0), ["readJoinPolicy", "updateLookOff"],
    POLICY_NAMES, [answer, { platform: "win32" }, fs, os, path, undefined, undefined, () => { looks++; }]);
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    const first = R.updateLookOff(), again = R.updateLookOff(), callsSoon = calls;
    shift = 2 * 60 * 60 * 1000;
    const later = R.updateLookOff(), callsLater = calls;
    shift = 5 * 60 * 60 * 1000;
    R.updateLookOff();
    if (first !== true || again !== true || callsSoon !== 1) problems.push("the failed read: off " + first + " then " + again + ", reg " + callsSoon + " time(s)");
    if (later !== false || callsLater !== 2) problems.push("two hours on: off " + later + ", reg " + callsLater + " time(s)");
    if (calls !== 2 || looks !== 1) problems.push("a read that worked, three hours on: " + (calls - 2) + " more read(s) waited on, " + looks + " look(s) without waiting, not 0 and 1");
  } finally { Date.now = realNow; }
  return problems;
}
{
  let problems = [];
  try { problems = lookUnderFailedRead(SRC); } catch (e) { problems.push("harness: " + e.message); }
  check(problems.length === 0, "19n a policy read that failed keeps the version look off and is tried again after its interval, once,"
    + " and a read that worked stands: " + (problems.join("; ") || "off, then read again and on"));
  if (PLANTS_OFF) skip("19n lifting plant:policy-reread and plant:look-off-unread each turns 19n red (ETIUDA_PLANTS=off)");
  else {
    const lifts = [["policy-reread", "  if (joinPolicyRead === null) {"],
      ["look-off-unread", "  try { return readJoinPolicy(\"en\").noUpdate === true; } catch { return false; }"]].map(([name, line]) => {
      const src = liftPlant(SRC, name, line);
      if (!src) return name + " not on exactly one line";
      let p = [];
      try { p = lookUnderFailedRead(src); } catch (e) { p = ["harness: " + e.message]; }
      return p.length ? "" : name + " lifted and 19n still green";
    }).filter(Boolean);
    check(lifts.length === 0, "19n lifting plant:policy-reread and plant:look-off-unread each turns 19n red: " + (lifts.join("; ") || "both red"));
  }
}

/* 19o: A READ THAT FAILED HOLDS THIS RUN'S LAST GOOD READ AND NOTHING FROM DISK (review 09, finding 4; Claude α's decision of
   2026-11-16, reversing the kept copy of 2026-11-15). A policy-last-good.json in userData, which the person can write, is planted
   with pins and AllowPersonalAccounts: a run whose first read fails takes none of it, is unread with no good read, and writes
   nothing beside it. Within one run a good read stands across a look that fails, said as unread, and a later good read replaces
   it. Lifting plant:policy-hold-good drops this run's good read at the failed look. */
function holdsRunGood(src, dir) {
  const problems = [];
  const app = { getPath: () => dir };
  const tmp = path.join(dir, "..", path.basename(dir) + "-tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const queue = [];
  const later = (file, args, opt, cb) => { queue.push({ args: args, cb: cb }); };
  const answer = (q, how) => { if (how === "late") { const e = new Error("reg.exe ETIMEDOUT"); e.killed = true; e.code = null; q.cb(e); } else { fs.writeFileSync(q.args[2], exportBytes(how)); q.cb(null); } };
  const reader = sync => load(src, POLICY_DECLS.concat(["function updateLookOff("]).filter(m => src.indexOf(m) >= 0),
    ["readJoinPolicy", "updateLookOff"], POLICY_NAMES, [sync, { platform: "win32" }, fs, { tmpdir: () => tmp }, path, app, (f, t) => fs.writeFileSync(f, t), later]);
  const late = () => { const e = new Error("spawnSync reg.exe ETIMEDOUT"); e.code = "ETIMEDOUT"; e.status = null; throw e; };
  const rows = lead => [["LeadKey", "REG_SZ", lead], ["DeskNoUpdateCheck", "REG_DWORD", 1]];
  const MOVED = "ef".repeat(32);
  const planted = JSON.stringify({ format: 1, kind: "etiuda-policy-last-good", folder: "E:\\Mine", lead: OTHER, bad: [], noUpdate: false,
    values: { teamfolder: { type: "REG_SZ", value: "E:\\Mine" }, leadkey: { type: "REG_SZ", value: OTHER }, allowpersonalaccounts: { type: "dword", value: "1" } } });
  const plantedFile = path.join(dir, "policy-last-good.json");
  fs.writeFileSync(plantedFile, planted, "utf8");
  const first = reader(late).readJoinPolicy("pl");
  if (!!first.folder || first.lead !== "" || first.unread !== true || first.held === true || first.said.indexOf(PL.unread) < 0)
    problems.push("a first read that failed beside a planted copy " + JSON.stringify({ folder: first.folder, lead: first.lead === OTHER ? "the planted lead" : first.lead, unread: first.unread, held: first.held }));
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    const R = reader((file, args) => { fs.writeFileSync(args[2], exportBytes(rows(HEX))); return null; });
    const good = R.readJoinPolicy("en");
    if (good.lead !== HEX || good.unread) problems.push("the good read " + JSON.stringify(good));
    shift = 61 * 1000;
    R.readJoinPolicy("en");
    if (queue.length !== 1) problems.push(queue.length + " look(s) asked a minute on, not 1");
    else answer(queue.shift(), "late");
    const held = R.readJoinPolicy("pl"), lookOff = R.updateLookOff();
    if (held.lead !== HEX || held.noUpdate !== true || held.unread !== true || held.held !== true
        || held.said.indexOf(PL.unread) < 0 || lookOff !== true)
      problems.push("a look that failed after this run's good read " + JSON.stringify({ lead: held.lead === HEX, noUpdate: held.noUpdate, unread: held.unread, held: held.held, lookOff: lookOff }));
    shift = 2 * 61 * 1000;
    R.readJoinPolicy("en");
    if (queue.length) answer(queue.shift(), rows(MOVED));
    const moved = R.readJoinPolicy("en");
    if (moved.lead !== MOVED || moved.unread !== false || moved.said.length !== 0)
      problems.push("a later good read " + JSON.stringify({ lead: moved.lead === MOVED, unread: moved.unread, said: moved.said }));
  } finally { Date.now = realNow; while (queue.length) answer(queue.shift(), "late"); }
  const left = fs.readdirSync(dir);
  if (left.length !== 1 || fs.readFileSync(plantedFile, "utf8") !== planted) problems.push("the user-data folder holds " + JSON.stringify(left) + " after the runs, not the planted file alone and unchanged");
  return problems;
}
{
  let problems = [];
  const d1 = path.join(LAB, "r19o-desk");
  fs.mkdirSync(d1, { recursive: true });
  try { problems = holdsRunGood(SRC, d1); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19o a read that failed takes nothing from a copy in userData, which the person can write, and keeps none there;"
    + " within a run it holds that run's good read, said as unread, until a later good read: " + (problems.join("; ") || "nothing from disk, the run's own read held"));
  if (PLANTS_OFF) skip("19o lifting plant:policy-hold-good drops this run's good read at a failed look (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SRC, "policy-hold-good", "      void good;");
    const d2 = path.join(LAB, "r19o-lifted");
    fs.mkdirSync(d2, { recursive: true });
    let p = [];
    try { p = src ? holdsRunGood(src, d2) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19o lifting plant:policy-hold-good drops this run's good read at a failed look: " + p.length + " problem(s)");
  }
}

/* ---- 19p to 19s: A POLICY THAT COULD NOT BE READ IS NEVER TAKEN AS NO POLICY (review 09, finding 4) -------------------------
   The test architect's criterion: "a policy that could not be read is never taken as no policy: whatever policy could forbid
   waits, said plainly, until a read answers; and an answer, once it comes, governs the running program (nothing keeps the first
   answer for the run)". The whole shell runs beside the stand-in reg; nothing here starts reg.exe or reads this machine's registry. */
const TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const IT_ROWS = [["Managed", "REG_DWORD", 1], ["SigninProvider", "REG_SZ", "microsoft"], ["SigninTenant", "REG_SZ", TENANT], ["AllowPersonalAccounts", "REG_DWORD", 0]];
/* An account that has held a seat here (`seated`): only such a one is kept by a managed, unshared computer (signinAccountKept), so the
   answer that tightens the desk refuses its Sign out. */
const HELD_FILE = JSON.stringify({ format: 2, held: { provider: "microsoft", seed: "5".repeat(64), refresh: "", sub: "sealed-sub", seated: true } });
let waitDesks = 0;
/* A desk with a sign-in held, the organisation's model chosen with a key kept for its address, and a relay team pinned by invitation
   (was a team pinned beside a team file in the desk's folder; no folder is read as a team now), over `reg`. */
function waitDesk(reg, shell) {
  const name = "wait-" + (waitDesks++), ud = path.join(LAB, name), mine = path.join(LAB, name + "-folder"), rt = hex(16);
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(mine, { recursive: true });
  fs.mkdirSync(path.join(ud, "relay", rt), { recursive: true });
  fs.writeFileSync(path.join(ud, "signin.json"), HELD_FILE, "utf8");
  fs.writeFileSync(path.join(ud, "relay", rt, "etiuda-team.json"), "{}", "utf8");
  const T = "t-" + hex(8);
  const L = asWindows(() => loadDesk(name, { keys: { eCatalogFolder: mine, eUiLang: "en" }, teamPins: { [T]: { keyId: "quay", public: HEX } },
    teamPinFrom: { [T]: "invite" }, teamChannel: { [T]: { kind: "relay", rt: rt, url: "https://etiuda.dev/relay/v1" } } }, reg, shell));
  const D = Object.assign({}, L, L.api);
  const at = D.peek("DESK_AI_SERVICES.openai.endpoint");
  const seal = text => Buffer.from(Buffer.from(String(text), "utf8").map(b => b ^ 0x5a)).toString("base64");
  fs.writeFileSync(path.join(ud, "desk-ai.json"), JSON.stringify({ format: 1, kind: "etiuda-desk-ai", choice: "organisation", provider: "openai", endpoint: "", model: "m" }), "utf8");
  fs.writeFileSync(path.join(ud, "desk-ai-key.json"), JSON.stringify({ format: 1, kind: "etiuda-desk-ai-key", sealed: seal(JSON.stringify({ for: at, key: "k-planted-4410" })) }), "utf8");
  fs.writeFileSync(path.join(mine, "etiuda-team.json"), "{}", "utf8");
  return Object.assign(D, { team: T, folder: mine, rt: rt });
}
/* What the desk does that policy could forbid, read through the shell's own functions. */
function forbiddenNow(D) {
  return asWindows(() => {
    const mp = D.peek("managedPolicy()"), view = D.peek("signinView()");
    const out = {
      waiting: mp.waiting === true, managed: mp.managed === true, closed: mp.closed === true, personal: mp.personal,
      strands: D.peek("managedStrands(managedPolicy())"), providers: D.peek("Object.keys(SIGNIN_PROVIDERS).join()"),
      heldKept: !!D.peek("signinState().held"), viewWaiting: !!(view.managed && view.managed.waiting),
      ai: D.peek("deskAiConfig()") !== null, store: D.peek("storePolicyNow().on") === true, lookOff: D.peek("updateLookOff()"),
      invite: D.peek("inviteDoor({ lead: { public: " + JSON.stringify(HEX) + " } })"),
    };
    /* A relay withdrawal still owed keeps the team's mirror the catalog folder whatever trust policy leaves the pin, so the heed there
       is stopped by the policy's own wait alone (plant:heed-waits); the join is put back after. */
    D.peek("globalThis.__keptJoin = teamJoin; teamJoin = { team: " + JSON.stringify(D.team) + ", invite: { relay: { rt: " + JSON.stringify(D.rt)
      + ", url: 'https://etiuda.dev/relay/v1', withdrawing: true } } }; teamStamp = ''; 0");
    try { D.heedTeam(); } catch { /* the stamp below says whether the file was read */ }
    out.heeded = D.peek("teamStamp") !== "";
    D.peek("teamJoin = globalThis.__keptJoin; delete globalThis.__keptJoin; 0");
    const row = (D.joinView().leads || [])[0] || {};
    out.leaveShown = row.policy !== true && row.waiting !== true;
    D.peek("forgetLead(" + JSON.stringify(D.team) + ", true)");
    out.pinKept = !!(D.envelope().teamPins || {})[D.team] || !!D.peek("teamPins[" + JSON.stringify(D.team) + "]");
    D.peek("signinOutNow()");
    out.signedOutRefused = !!D.peek("signinState().held");
    return out;
  });
}
function waitsUntilRead(shell) {
  const problems = [];
  const W = waitDesk(standInReg("late", 65001), shell), w = forbiddenNow(W);
  const want = { waiting: true, managed: true, closed: true, personal: false, strands: true, providers: "", heldKept: true, viewWaiting: true,
    ai: false, store: false, lookOff: true, invite: "waiting", heeded: false, leaveShown: false, pinKept: true, signedOutRefused: true };
  const off = Object.keys(want).filter(k => w[k] !== want[k]);
  if (off.length) problems.push("a read that failed: " + off.map(k => k + " " + JSON.stringify(w[k])).join(", "));
  /* The control: the same desk where the key is not there does each of them, so each line above is the wait's doing. */
  const C = waitDesk(standInReg(null, 65001), shell), c = forbiddenNow(C);
  const plain = { waiting: false, managed: false, closed: false, personal: true, strands: false, providers: "microsoft,google", heldKept: true, viewWaiting: false,
    ai: true, store: true, lookOff: false, invite: "", heeded: true, leaveShown: true, pinKept: false, signedOutRefused: false };
  const coff = Object.keys(plain).filter(k => c[k] !== plain[k]);
  if (coff.length) problems.push("the control, no key: " + coff.map(k => k + " " + JSON.stringify(c[k])).join(", "));
  return problems;
}
{
  let problems = [];
  try { problems = waitsUntilRead(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19p a read that failed is no policy: every provider, another account, sign out, Buy, personal accounts, a new desk key,"
    + " the organisation's model, sync, the version look, a heed, an invitation and Leave all wait, and the page is told it waits; with the key"
    + " not there each goes ahead: " + (problems.join("; ") || "all wait, all go ahead in the control"));
  if (PLANTS_OFF) skip("19p lifting each wait turns 19p red (ETIUDA_PLANTS=off)");
  else {
    const lifts = [["mp-waits", "  if (false) return null;"], ["signin-file-unpinned", "  SIGNIN_PROVIDERS = pinned;"], ["view-waiting", "  void 0;"],
      ["ai-waits", "  void 0;"], ["store-waits", "  void 0;"], ["heed-waits", "  void 0;"], ["invite-waits", "  void 0;"],
      ["leave-waits", "  if (left === true && policyHoldsTeam(team, readJoinPolicy(\"en\"))) return joinView();"]].map(([name, line]) => {
      const src = liftPlant(SHELL, name, line);
      if (!src) return name + " not on exactly one line";
      let p = [];
      try { p = waitsUntilRead(src); } catch (e) { p = ["harness: " + e.message]; }
      return p.length ? "" : name + " lifted and 19p still green";
    }).filter(Boolean);
    check(lifts.length === 0, "19p lifting each of mp-waits, signin-file-unpinned, view-waiting, ai-waits, store-waits, heed-waits, invite-waits and"
      + " leave-waits turns 19p red: " + (lifts.join("; ") || "each red"));
  }
}

/* 19q: AN ANSWER GOVERNS THE RUNNING PROGRAM. The first read fails; a minute on, the look answers with the organisation's pins and
   the sign-in tightens at once (the provider table pinned at the tenant, sign out refused, the held sign-in judged again); IT then
   removes the policy and the next look loosens it (the shipped table back, the view with no policy); IT sets it again and it
   tightens. Lifting plant:signin-follows keeps the first answer for the run. */
function answerGoverns(shell) {
  const problems = [];
  const state = { key: "late" };
  const reg = standInReg(() => state.key, 65001, true);
  const D = waitDesk(reg, shell);
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  const look = (key, at) => { state.key = key; shift = at; asWindows(() => { D.peek("managedPolicy()"); reg.flush(); }); };
  const now = () => asWindows(() => ({ m: D.peek("signinState().managed"), table: D.peek("Object.keys(SIGNIN_PROVIDERS).join()"),
    ms: D.peek("SIGNIN_PROVIDERS.microsoft ? SIGNIN_PROVIDERS.microsoft.authorize : ''"), view: D.peek("signinView()"),
    held: D.peek("signinState().held ? signinState().held.provider : ''") }));
  try {
    const first = now();
    if (first.m.waiting !== true || first.table !== "") problems.push("the first read failed: " + JSON.stringify({ waiting: first.m.waiting, table: first.table }));
    look({ rows: IT_ROWS }, 61 * 1000);
    const tight = now(), outRefused = asWindows(() => { D.peek("signinOutNow()"); return !!D.peek("signinState().held"); });
    if (tight.m.managed !== true || tight.m.waiting === true || tight.m.provider !== "microsoft" || tight.table !== "microsoft"
        || tight.ms.indexOf("/" + TENANT + "/") < 0 || (tight.view.managed || {}).waiting || tight.held !== "microsoft" || !outRefused)
      problems.push("a late good read: " + JSON.stringify({ managed: tight.m.managed, waiting: tight.m.waiting, table: tight.table, atTenant: tight.ms.indexOf(TENANT) > 0, held: tight.held, outRefused: outRefused }));
    look(null, 2 * 61 * 1000);
    const loose = now(), base = asWindows(() => D.peek("typeof signinTableBase === 'undefined' ? null : signinTableBase === SIGNIN_PROVIDERS"));
    if (loose.m.any !== false || loose.m.managed || loose.table !== "microsoft,google" || loose.ms.indexOf("/common/") < 0 || loose.view.managed !== undefined || base !== true)
      problems.push("IT removed the policy: " + JSON.stringify({ any: loose.m.any, table: loose.table, common: loose.ms.indexOf("/common/") > 0, view: !!loose.view.managed, shipped: base }));
    look({ rows: IT_ROWS }, 3 * 61 * 1000);
    const again = now();
    if (again.m.managed !== true || again.table !== "microsoft") problems.push("IT set it again: " + JSON.stringify({ managed: again.m.managed, table: again.table }));
  } finally {
    Date.now = realNow;
    state.key = "late";
    reg.flush();
    D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain)");
  }
  return problems;
}
{
  let problems = [];
  try { problems = answerGoverns(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19q an answer governs the running desk: a late good read tightens the sign-in at once, a policy IT removes loosens it,"
    + " and setting it again tightens it, with nothing kept from the first answer: " + (problems.join("; ") || "tightened, loosened, tightened"));
  if (PLANTS_OFF) skip("19q lifting plant:signin-follows keeps the first answer for the run (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SHELL, "signin-follows", "  if (signinStore !== undefined) return signinStore;");
    let p = [];
    try { p = src ? answerGoverns(src) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19q lifting plant:signin-follows keeps the first answer for the run: " + p.length + " problem(s)");
  }
}

/* 19r: A COMPUTER WHOSE KEY IS NOT THERE IS AS BEFORE, BYTE FOR BYTE: reg asked once however often the desk asks within the minute,
   no look armed, the managed answer the unmanaged one with no word of waiting, the view and the join view with no policy in them,
   and the shipped provider table. Turning plant:policy-waits to always wait turns it red. */
function unmanagedAsBefore(shell) {
  const problems = [];
  const reg = standInReg(null, 65001);
  const D = waitDesk(reg, shell);
  const got = asWindows(() => {
    for (let i = 0; i < 3; i++) { D.peek("signinState()"); D.peek("managedPolicy()"); D.peek("deskAiConfig()"); D.peek("storePolicyNow()"); D.catalogFolder(); D.heedTeam(); }
    return { mp: D.peek("managedPolicy()"), none: D.peek("managedPolicyFrom(null)"), view: D.peek("signinView()"), join: D.joinView(),
      table: D.peek("Object.keys(SIGNIN_PROVIDERS).join()"), armed: D.peek("typeof joinPolicyAgain === 'undefined' ? null : joinPolicyAgain"),
      ai: D.peek("deskAiConfig()") !== null, store: D.peek("storePolicyNow().on") };
  });
  if (reg.asked().length !== 1) problems.push("reg asked " + reg.asked().length + " times, not once");
  if (got.armed !== null) problems.push("a look was armed");
  if (JSON.stringify(got.mp) !== JSON.stringify(got.none)) problems.push("the managed answer " + JSON.stringify(got.mp));
  if (got.view.managed !== undefined || JSON.stringify(got.view).indexOf("waiting") >= 0) problems.push("the view carries " + JSON.stringify(got.view.managed));
  if (got.join.policySaid !== undefined) problems.push("the join view says " + JSON.stringify(got.join.policySaid));
  if (got.table !== "microsoft,google" || !got.ai || got.store !== true) problems.push(JSON.stringify({ table: got.table, ai: got.ai, store: got.store }));
  return problems;
}
{
  let problems = [];
  try { problems = unmanagedAsBefore(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19r with the key not there the desk is as before: reg asked once, no look armed, no word of waiting, the shipped table: "
    + (problems.join("; ") || "as before"));
  if (PLANTS_OFF) skip("19r turning plant:policy-waits to always wait turns 19r red (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SHELL, "policy-waits", "  return true;");
    let p = [];
    try { p = src ? unmanagedAsBefore(src) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19r turning plant:policy-waits to always wait turns 19r red: " + p.length + " problem(s)");
  }
}

/* 19s: THE ASKING AGAIN IS BOUNDED. After a read that failed, and for as long as none answers, the key is looked at again unasked
   after 5 s, then 10, 20, 40, and once a minute after that, one look at a time; the first answer ends it. Lifting
   plant:policy-again arms no look. */
function asksAgainBounded(shell) {
  const problems = [];
  const state = { key: "late" };
  const reg = standInReg(() => state.key, 65001, true);
  const D = waitDesk(reg, shell);
  try {
    const seq = [];
    asWindows(() => {
      D.peek("managedPolicy()");
      for (let i = 0; i < 6; i++) {
        seq.push(D.peek("typeof joinPolicyAgain === 'undefined' ? -1 : joinPolicyAgain ? joinPolicyAgainMs : 0"));
        D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain); if (typeof joinPolicyAgain !== 'undefined') joinPolicyAgain = null; policyLookLater(); policyLookLater()");
        if (reg.pending.length !== 1) problems.push(reg.pending.length + " looks at once");
        reg.flush();
      }
      state.key = null;
      D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain); if (typeof joinPolicyAgain !== 'undefined') joinPolicyAgain = null; policyLookLater()");
      reg.flush();
    });
    if (seq.join(",") !== "5000,10000,20000,40000,60000,60000") problems.push("the waits " + seq.join(","));
    const after = asWindows(() => D.peek("typeof joinPolicyAgain === 'undefined' ? [null, -1] : [joinPolicyAgain, joinPolicyAgainMs]"));
    if (after[0] !== null || after[1] !== 0) problems.push("a look still armed after the answer");
  } catch (e) { problems.push("harness: " + e.message); }
  finally { state.key = "late"; reg.flush(); D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain)"); }
  return problems;
}
{
  let problems = [];
  try { problems = asksAgainBounded(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19s while no read answers the key is looked at again after 5, 10, 20 and 40 s, then each minute, one look at a time,"
    + " and the first answer ends it: " + (problems.join("; ") || "5, 10, 20, 40, 60, 60, then none"));
  if (PLANTS_OFF) skip("19s lifting plant:policy-again arms no look (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SHELL, "policy-again", "  return;");
    let p = [];
    try { p = src ? asksAgainBounded(src) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19s lifting plant:policy-again arms no look: " + p.length + " problem(s)");
  }
}

/* ---- 19t, 19u: WHERE MACHINE POLICY NAMES A LEAD'S KEY, THAT KEY ALONE DECIDES TRUST ON EVERY PATH THAT READS (review 09, finding 2)
   The test architect's criterion: "where machine policy names a lead's key, that key alone decides trust on every path that reads as on
   every path that writes, whatever pin was kept." 19h is the scene and asserts the writes; these assert the reads. */
let trustDesks = 0;
const signedBy = (signedBytes, body, who, priv) => {
  const doc = Object.assign({}, body, { sig: { alg: "Ed25519", keyId: who.keyId } });
  doc.sig.value = crypto.sign(null, signedBytes(doc), priv).toString("hex");
  return doc;
};
function leadReads(shell) {
  const problems = [];
  const signedBytes = load(SRC, ["function canonJson(", "function signedBytesOf("], ["signedBytesOf"], ["crypto", "Buffer"], [crypto, Buffer]).signedBytesOf;
  const A = crypto.generateKeyPairSync("ed25519"), B = crypto.generateKeyPairSync("ed25519");
  const leadA = { keyId: "quay-old", public: pubHex(A.publicKey) }, leadB = { keyId: "quay-new", public: pubHex(B.publicKey) };
  const T1 = "t-" + hex(8), T2 = "t-" + hex(8), rt = hex(16);
  const catOf = (who, priv) => signedBy(signedBytes, { kind: "etiuda-catalog", format: 2, id: "lamp-shop", rev: 3 }, who, priv);
  const catA = catOf(leadA, A.privateKey), catB = catOf(leadB, B.privateKey);
  const teamFile = signedBy(signedBytes, { format: 1, kind: "etiuda-team", id: T1, catalogs: ["lamp-shop"], lead: leadA, sealed: true, exportsSealed: false, epoch: 1, roster: [] }, leadA, A.privateKey);
  /* Desks that joined under A: K pinned A for T1 with A's file in its folder; S the same with T1 a folder team here; R invited under A to
     the relay team T2. */
  const folderWithFile = name => {
    const F = path.join(LAB, name + "-folder");
    fs.mkdirSync(F, { recursive: true });
    fs.writeFileSync(path.join(F, "etiuda-team.json"), JSON.stringify(teamFile, null, 1) + "\n", "utf8");
    return F;
  };
  /* Was: K pinned A for T1 with A's file in its folder. Now no folder is a team's: A's file is in the relay mirror a withdrawal still
     owed keeps as K's catalog folder (withdrawing, below), whatever trust policy leaves the pin. */
  const rtK = hex(16);
  const K = name => {
    const F = path.join(LAB, name, "relay", rtK);
    fs.mkdirSync(F, { recursive: true });
    fs.writeFileSync(path.join(F, "etiuda-team.json"), JSON.stringify(teamFile, null, 1) + "\n", "utf8");
    return { keys: { eCatalogFolder: path.join(LAB, name + "-own"), eUiLang: "en" }, teamPins: { [T1]: leadA } };
  };
  const withdrawing = D => D.peek("teamJoin = { team: " + JSON.stringify(T1) + ", invite: { relay: { rt: " + JSON.stringify(rtK)
    + ", url: 'https://etiuda.dev/relay/v1', withdrawing: true } } }; 0");
  const S = name => { const F = folderWithFile(name); return { keys: { eCatalogFolder: F, eUiLang: "en" }, teamPins: { [T1]: leadA }, teamShown: { [T1]: { folder: F } } }; };
  const R = name => { const F = folderWithFile(name); return { keys: { eCatalogFolder: F, eUiLang: "en" }, teamPins: { [T2]: leadA }, teamPinFrom: { [T2]: "invite" },
    teamChannel: { [T2]: { kind: "relay", rt: rt, url: "https://etiuda.dev/relay/v1" } } }; };
  /* A desk with no pin at all, a ring in its folder naming A for the catalog; and one with A pinned and no team file in its folder. */
  const ringed = name => {
    const F = path.join(LAB, name + "-folder");
    fs.mkdirSync(F, { recursive: true });
    fs.writeFileSync(path.join(F, "etiuda-ring.json"), JSON.stringify({ keys: [{ alg: "Ed25519", catalog: "lamp-shop", keyId: leadA.keyId, public: leadA.public }] }), "utf8");
    return { keys: { eCatalogFolder: F, eUiLang: "en" } };
  };
  const bare = name => {
    const F = path.join(LAB, name + "-folder");
    fs.mkdirSync(F, { recursive: true });
    return { keys: { eCatalogFolder: F, eUiLang: "en" }, teamPins: { [T1]: leadA } };
  };
  const desk = (make, registry, read) => {
    const name = "trust-" + (trustDesks++);
    const L = asWindows(() => loadDesk(name, make(name), standInReg(registry, 65001), shell)), D = Object.assign({}, L, L.api);
    /* desk.json read first, as the shell reads it at start, so no path below meets a desk with nothing loaded. */
    D.peek("if (deskKeys === undefined) deskKeys = readDesk(); 0");
    try { return asWindows(() => read(D)); } finally { D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain)"); }
  };
  const catOk = (D, cat) => D.peek("catalogLeadOk(" + JSON.stringify(cat) + ")");
  const reads = registry => {
    const out = desk(K, registry, D => {
      withdrawing(D);
      const pl = D.peek("pinnedLead()");
      return { catA: catOk(D, catA), catB: catOk(D, catB), pageA: D.peek("leadsForPage()").some(k => k.public === leadA.public), lead: pl ? pl.public : "",
        pins: Object.keys(D.envelope().teamPins || {}).length + Object.keys(D.peek("teamPins")).length, told: (D.joinView().leads || []).filter(r => r.otherLead === true).length };
    });
    /* Was folderTeamHere's team. Now no folder is a team's: the folder team S held reads its own folder, under any policy. */
    out.folderTeam = desk(S, registry, D => (D.peek("catalogFolder()") === D.peek("rawCatalogFolder()") ? "" : D.peek("catalogFolder()")));
    out.relay = desk(R, registry, D => D.peek("relayFollowed(" + JSON.stringify(T2) + ")"));
    return out;
  };
  const one = (make, registry) => desk(make, registry, D => ({ catA: catOk(D, catA), catB: catOk(D, catB) }));
  const policy = lead => ({ rows: [["LeadKey", "REG_SZ", lead.public]] });
  const same = (got, want, what) => {
    const off = Object.keys(want).filter(k => got[k] !== want[k]);
    if (off.length) problems.push(what + ": " + off.map(k => k + " " + JSON.stringify(got[k] === leadA.public ? "A" : got[k] === leadB.public ? "B" : got[k])).join(", "));
  };
  /* Policy names B over pins of A: nothing of A's is trusted on any reading path, through a restart, and the pins stay. Was: B's
     catalog trusted by none either, A's team file in K's folder naming T1's lead. Now the policy lets K's withdrawal under A go, so
     K reads its own folder, where no team file is a team's, and B's catalog is the policy lead's, as with no pin at all (below). */
  for (const run of ["first", "restart"]) {
    same(reads(policy(leadB)), { catA: "", catB: leadB.public, pageA: false, folderTeam: "", relay: false, lead: "", pins: 2, told: 1 }, "policy names B over pins of A (" + run + ")");
  }
  /* The controls: no policy, and a policy naming A itself, trust A on every path as the desk always did. pinnedLead is not
     compared there. */
  const trusted = { catA: leadA.public, catB: "", pageA: true, folderTeam: "", relay: true, pins: 2, told: 0 };
  same(reads(null), trusted, "the control, no policy");
  same(reads(policy(leadA)), trusted, "the control, policy naming A");
  /* While policy has not answered, no lead is trusted on any reading path. */
  same(reads("late"), { catA: "", catB: "", pageA: false, folderTeam: "", relay: false, lead: "", pins: 2, told: 0 }, "a read that failed over pins of A");
  /* Whatever pin was kept includes none: policy naming B trusts B alone, the ring's word for A not read in its place. */
  same(one(ringed, policy(leadB)), { catA: "", catB: leadB.public }, "no pin, policy names B, a ring names A");
  same(one(ringed, null), { catA: leadA.public, catB: "" }, "the control, no pin and no policy: the ring decides");
  /* A pin of A and no team file in the folder: trusted with no policy, never while policy has not answered. */
  same(one(bare, null), { catA: leadA.public }, "the control, a pin of A and no team file");
  same(one(bare, "late"), { catA: "" }, "a read that failed, a pin of A and no team file");
  return problems;
}
{
  let problems = [];
  try { problems = leadReads(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19t a policy lead other than a kept pin's: catalogLeadOk, leadsForPage, relayFollowed and pinnedLead"
    + " trust nothing of the kept lead's, through a restart, the pins kept and the team rows told; no pin, the policy's lead alone; while"
    + " policy has not answered, no lead; and a folder team held reads its own folder under any of them: " + (problems.join("; ") || "the policy's lead alone"));
  if (PLANTS_OFF) skip("19t lifting each of the one place's guards turns 19t red (ETIUDA_PLANTS=off)");
  else {
    const lifts = [["pin-policy-lead", "  return pin;"], ["pin-waits", "  void 0;"], ["leads-wait", "  void 0;"], ["leads-policy", "    void 0;"],
      ["folder-publics-trusted", "  const pin = teamPins[doc.id];"], ["follow-trusted", "  const pin = teamPins[team];"]].map(([name, line]) => {
      const src = liftPlant(SHELL, name, line);
      if (!src) return name + " not on exactly one line";
      let p = [];
      try { p = leadReads(src); } catch (e) { p = ["harness: " + e.message]; }
      return p.length ? "" : name + " lifted and 19t still green";
    }).filter(Boolean);
    check(lifts.length === 0, "19t lifting each of pin-policy-lead, pin-waits, leads-wait, leads-policy, folder-publics-trusted"
      + " and follow-trusted turns 19t red: " + (lifts.join("; ") || "each red"));
  }
}

/* 19u: ONE PLACE DECIDES, AND A READER ADDED LATER CANNOT SKIP IT. Every function of shell/main.js that names teamPins is either the
   one place (pinTrusted, pinnedLeadKeys), or named below as keeping the pins rather than trusting them, each with why; a function
   that lists the kept pins to choose among them must take each through pinTrusted. A new reader of teamPins fails here until it asks
   the one place or is named, with its reason, by whoever adds it. Reading teamPins in folderLeadPublics again turns it red. */
const PIN_PLACE = ["pinTrusted", "pinnedLeadKeys"];
const PIN_KEEPERS = {
  deskEnvelopeBody: "writes the pins into desk.json", readDesk: "reads them out of it",
  heedTeam: "judges a team file and writes the pin, policy applied by memberHeedUnderPolicy",
  policyLetsInviteGo: "lets a join go at the policy's read", inviteBefore: "keeps what an invitation replaces", undoInvite: "puts it back",
  takeInvite: "pins at an invitation's yes", takeRelayInvite: "pins at a relay invitation's yes", signinDoorJoin: "pins at a door's press",
  forgetLead: "forgets a pin", leadSeen: "marks a pin seen", leadsView: "lists the kept pins as Settings' team rows",
  policyHoldsTeam: "the policy's own hold on a kept pin", inviteSettled: "refuses an invitation against any kept pin",
  signinDoorsShown: "offers no door against any kept pin", teamPinStands: "any kept pin hides the doors",
  checkInviteRefusal: "ends a join on a refusal its lead signed", leadForPause: "reads a pause, which only stops",
  relayRingAt: "any kept pin on the relay believes no ring", forkChain: "says a fork, trusting nothing",
  pickMovedFolder: "a moved team's folder",
  storeSetAside: "keeps the floors under kept pins",
};
/* Each lists the kept pins to choose among them, so it must take each through pinTrusted: deskRoster the rosters whose desks'
   files are handed on (any kept pin narrows that). */
const PIN_LISTERS = ["deskRoster"];
function pinReaders(src) {
  const lines = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " ")).split("\n");
  const out = new Map();
  let name = "";
  for (const l of lines) {
    const m = /^(?:async )?function ([A-Za-z0-9_$]+)\(/.exec(l) || /^ipcMain\.(?:handle|on)\("([^"]+)"/.exec(l);
    if (m) name = m[1];
    if (/\bteamPins\b/.test(l.replace(/\/\/.*$/, ""))) {
      const at = name || (/^let teamPins = \{\};/.test(l) ? "" : "(outside any function)");
      if (at) out.set(at, (out.get(at) || 0) + 1);
    }
    if (/^\}\)?;?\s*$/.test(l)) name = "";
  }
  return out;
}
function onePlace(src) {
  const problems = [], readers = pinReaders(src);
  for (const [fn, n] of readers) if (PIN_PLACE.indexOf(fn) < 0 && PIN_LISTERS.indexOf(fn) < 0 && !Object.prototype.hasOwnProperty.call(PIN_KEEPERS, fn)) problems.push(fn + " reads teamPins (" + n + ")");
  for (const fn of Object.keys(PIN_KEEPERS)) if (!readers.has(fn)) problems.push(fn + " is named as keeping the pins and names none, so this list is stale");
  for (const fn of PIN_PLACE.concat(PIN_LISTERS)) if (!readers.has(fn)) problems.push(fn + " names no teamPins, so this list is stale");
  for (const fn of PIN_LISTERS) {
    const at = src.indexOf("\nfunction " + fn + "("), body = at < 0 ? "" : src.slice(at, src.indexOf("\n}", at));
    if (body.indexOf("pinTrusted(") < 0) problems.push(fn + " lists the pins without pinTrusted");
  }
  return problems;
}
{
  let problems = [];
  try { problems = onePlace(SRC); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19u every function that names teamPins is the one place or keeps the pins without trusting them, and each that lists"
    + " them takes each through pinTrusted: " + (problems.join("; ") || "one place"));
  if (PLANTS_OFF) skip("19u reading teamPins in folderLeadPublics again turns 19u red (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SRC, "folder-publics-trusted", "  const pin = teamPins[doc.id];");
    let p = [];
    try { p = src ? onePlace(src) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19u reading teamPins in folderLeadPublics again turns 19u red: " + (p.join("; ") || "still green"));
  }
}

/* 19v: EVERY MACHINE POLICY VALUE THE SHELL READS IS DECLARED AND EXPLAINED IN THE TEMPLATE (review 09 finding 3).
   Scans shell/main.js for every function that reads policyValues' output (including joinPolicyRead.values and any
   function it passes values to), extracts every value name read from it, and checks that etiuda.admx declares each as
   a machine policy under Software\Policies\Etiuda with non-empty displayName and explainText in both languages. */
function shellPolicyFunctions(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");
  const fns = new Map();
  const re = /^(?:async )?function ([A-Za-z0-9_$]+)\(([^)]*)\)/gm;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const start = m.index, end = clean.indexOf("\n}", start);
    if (end > start) fns.set(m[1], { params: m[2], body: clean.slice(start, end + 2) });
  }
  const readers = new Set(["policyRegSz"]);
  const SEED_SKIP = new Set(["readJoinPolicy", "policyLookLater", "policyAgainArm", "policyTake", "policyStamp", "policyFresh", "sayJoinPolicy", "deskAiNow"]);
  for (const [name, fn] of fns) {
    if (SEED_SKIP.has(name)) continue;
    if (/\bvalues\b/.test(fn.params) || /policyValues\s*\(/.test(fn.body) || /\bjoinPolicyRead\s*(?:&&\s*joinPolicyRead\s*)?\.values\b/.test(fn.body)) {
      readers.add(name);
    }
  }
  let added = true;
  while (added) {
    added = false;
    for (const name of [...readers]) {
      const fn = fns.get(name);
      if (!fn) continue;
      for (const [callee] of fns) {
        if (readers.has(callee)) continue;
        const callRe = new RegExp("\\b" + callee + "\\s*\\([^)]*\\bvalues\\b");
        if (callRe.test(fn.body)) { readers.add(callee); added = true; }
      }
    }
  }
  const names = new Set();
  const managedMatch = clean.match(/\bMANAGED_NAMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  const managedNames = managedMatch ? [...managedMatch[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map(x => x[1].toLowerCase()) : [];
  for (const fnName of readers) {
    const fn = fns.get(fnName);
    if (!fn) continue;
    const b = fn.body;
    if (/\bMANAGED_NAMES\b/.test(b)) for (const n of managedNames) names.add(n);
    for (const x of b.matchAll(/policyRegSz\s*\([^,]+,\s*"([A-Za-z0-9_]+)"\s*\)/g)) names.add(x[1].toLowerCase());
    for (const x of b.matchAll(/\b(?:own|text)\s*\(\s*"([A-Za-z0-9_]+)"\s*\)/g)) names.add(x[1].toLowerCase());
    for (const x of b.matchAll(/\bvalues\s*\[\s*"([A-Za-z0-9_]+)"\s*\]/g)) names.add(x[1].toLowerCase());
    for (const x of b.matchAll(/hasOwnProperty\.call\s*\(\s*values\s*,\s*"([A-Za-z0-9_]+)"\s*\)/g)) names.add(x[1].toLowerCase());
    for (const x of b.matchAll(/\bvalues\s*\.\s*([A-Za-z0-9_$]+)/g)) names.add(x[1].toLowerCase());
  }
  return names;
}
function policyTemplateCoversShell(src, docs) {
  const problems = [];
  if (!docs || !docs.admx || !docs.en || !docs.pl) return ["template not parsed"];
  const admxPolicies = new Map();
  for (const p of under(docs.admx, "policy")) {
    if (String(p.attrs.key || "").toLowerCase() !== "software\\policies\\etiuda" || p.attrs.class !== "Machine") continue;
    let vName = p.attrs.valueName;
    if (!vName) {
      const els = under(p, "elements"), kids = els.length ? els[0].kids : [];
      if (kids.length === 1) vName = kids[0].attrs.valueName;
    }
    if (vName) admxPolicies.set(vName.toLowerCase(), p);
  }
  const strMap = d => {
    const m = new Map();
    for (const s of under(d, "string")) m.set(s.attrs.id, s.text.trim());
    return m;
  };
  const enStr = strMap(docs.en), plStr = strMap(docs.pl);
  const strId = v => { const m = /^\$\(string\.([^)]+)\)$/.exec(v || ""); return m ? m[1] : ""; };
  for (const name of [...shellPolicyFunctions(src)].sort()) {
    const p = admxPolicies.get(name);
    if (!p) { problems.push(name + " is read by shell/main.js but missing from etiuda.admx"); continue; }
    const dn = strId(p.attrs.displayName), ex = strId(p.attrs.explainText);
    if (!dn || !enStr.get(dn) || !plStr.get(dn)) problems.push(name + " missing displayName in en or pl");
    if (!ex || !enStr.get(ex) || !plStr.get(ex)) problems.push(name + " missing explainText in en or pl");
  }
  return problems;
}
{
  let problems = [];
  try { problems = policyTemplateCoversShell(SRC, templateDocs); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19v every machine policy value read by shell/main.js is declared in etiuda.admx and has a displayName and explainText in English and Polish: "
    + (problems.join("; ") || "all covered"));
  if (PLANTS_OFF) skip("19v reading an undeclared policy value in shell/main.js turns 19v red (ETIUDA_PLANTS=off)");
  else {
    const marker = "function personalStoreFrom(values) {";
    const planted = SRC.includes(marker) ? SRC.replace(marker, marker + "\n  const extra = values && values.undeclaredpolicy;") : "";
    const p = planted ? policyTemplateCoversShell(planted, templateDocs) : ["marker missing"];
    check(!!planted && p.some(s => s.includes("undeclaredpolicy")),
      "19v reading an undeclared policy value in shell/main.js turns 19v red: " + (p.join("; ") || "still green"));
  }
}

/* 19w: SETTINGS' TEAM ROWS NEVER READ A PIN THE POLICY LET GO. leadsView lists the pins first and asks the policy after, and the first
   ask that says the policy (leadsView itself, through sayJoinPolicy) lets go a join kept from an invitation under a lead or a folder the policy now
   names, with the pin that invitation set: the map then read `.public` of nothing, and the page's "leads" ask threw. Found by the folder
   P0 builder on 2026-11-22 (a first etiuda:team-join "leads" after a restart under a policy); a relay invitation reaches it alike. The
   first thing each desk below does is that ask, so no other read has said the policy before it. */
function leadsAfterLetGo(shell) {
  const problems = [];
  const A = crypto.generateKeyPairSync("ed25519"), B = crypto.generateKeyPairSync("ed25519");
  const leadA = { keyId: "quay-old", public: pubHex(A.publicKey) }, leadB = { keyId: "quay-new", public: pubHex(B.publicKey) };
  const T1 = "t-" + hex(8), T2 = "t-" + hex(8), rt = hex(16);
  const F = path.join(LAB, "w19-folder");
  fs.mkdirSync(F, { recursive: true });
  const relayInvite = { id: hex(8), proof: hex(32), lead: { keyId: leadA.keyId, public: leadA.public, name: "Lamp lead" }, pinned: true,
    relay: { rt: rt, url: "https://etiuda.dev/relay/v1", inv: hex(16), token: "dG9rZW4=", seal: "c2VhbA==", wrapped: [1] } };
  const folderInvite = { id: hex(8), proof: hex(32), lead: { keyId: leadA.keyId, public: leadA.public, name: "Lamp lead" }, pinned: true, folder: F };
  const made = invite => ({ keys: { eCatalogFolder: F, eUiLang: "en" },
    teamJoin: { team: T1, file: "", nonce: hex(32), commit: hex(32), asked: 1, held: 0, name: "Nia", invite: invite },
    /* T2: a team this desk joined earlier under the same lead, so its pin stands and its row is still listed. */
    teamPins: { [T1]: leadA, [T2]: leadA }, teamPinFrom: { [T1]: "invite" }, teamShown: { [T1]: { lead: "Lamp lead" } } });
  const run = (what, invite, registry, want) => {
    const name = "w19-" + (trustDesks++);
    const L = asWindows(() => loadDesk(name, made(invite), standInReg(registry, 65001), shell)), D = Object.assign({}, L, L.api);
    D.peek("if (deskKeys === undefined) deskKeys = readDesk(); 0");
    try {
      const rows = asWindows(() => D.peek("leadsView()")).map(r => r.team + (r.otherLead ? "+other" : "")).sort();
      const again = asWindows(() => D.peek("leadsView()")).length;
      const env = D.envelope();
      const got = { rows: rows.join(","), pins: Object.keys(env.teamPins || {}).sort().join(","), join: !!env.teamJoin, again: again };
      const off = Object.keys(want).filter(k => String(got[k]) !== String(want[k]));
      if (off.length) problems.push(what + ": " + off.map(k => k + " " + JSON.stringify(got[k])).join(", "));
    } catch (e) { problems.push(what + ": " + (e && e.message)); }
    finally { D.peek("typeof joinPolicyAgain !== 'undefined' && joinPolicyAgain && clearTimeout(joinPolicyAgain)"); }
  };
  const policy = lead => ({ rows: [["LeadKey", "REG_SZ", lead.public]] });
  const gone = { rows: T2 + "+other", pins: T2, join: false, again: 1 };
  /* A relay invitation and a folder invitation kept, policy naming another lead: the request is let go with its pin, the other
     team's row stands and says the policy names another lead, and a second ask reads the same. */
  run("a relay invitation under a policy naming another lead", relayInvite, policy(leadB), gone);
  run("a folder invitation under a policy naming another lead", folderInvite, policy(leadB), gone);
  /* MOVED, fold 129. Was: "a folder invitation under a policy naming a folder", let go with its pin (rows T2 alone, pins T2, no request). P4 removed the TeamFolder
     value from what policy names (a team works over the relay only, so it is not read; 19a, 19b), so a policy naming a folder names no lead and lets nothing go: both teams
     stand and the request is kept, as in the controls below. */
  run("a folder invitation under a policy naming a folder, which is not read", folderInvite, { rows: [["TeamFolder", "REG_SZ", path.join(LAB, "w19-other")]] }, { rows: [T1, T2].sort().join(","), pins: [T1, T2].sort().join(","), join: true, again: 2 });
  /* The controls: no policy, and a policy naming the invitation's own lead, keep both teams as they were. */
  const both = { rows: [T1, T2].sort().join(","), pins: [T1, T2].sort().join(","), join: true, again: 2 };
  run("the control, a relay invitation and no policy", relayInvite, null, both);
  run("the control, a relay invitation under a policy naming its lead", relayInvite, policy(leadA), both);
  return problems;
}
{
  let problems = [];
  try { problems = leadsAfterLetGo(null); } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0, "19w Settings' team rows read no pin the policy let go: the first leads ask after a restart under a policy that lets an invitation go"
    + " lists the pins that stand, the request and its pin gone, a relay or a folder one, and the controls keep both teams: " + (problems.join("; ") || "no row throws"));
  if (PLANTS_OFF) skip("19w lifting plant:leads-pin-gone turns 19w red (ETIUDA_PLANTS=off)");
  else {
    const src = liftPlant(SHELL, "leads-pin-gone", "    void 0;");
    let p = [];
    try { p = src ? leadsAfterLetGo(src) : ["the plant is not on exactly one line"]; } catch (e) { p = ["harness: " + e.message]; }
    check(!!src && p.length > 0, "19w lifting plant:leads-pin-gone turns 19w red: " + (p.join("; ") || "still green"));
  }
}

try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
