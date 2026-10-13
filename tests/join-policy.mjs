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
 * THE GLUE IS DRIVEN WHOLE (19g, 19h). The real shell/main.js runs under stubbed electron, as tests/team-desk.mjs
 * runs it, beside a stand-in for reg.exe that answers its export and its console print from one invented key,
 * the print in the console's code page as reg gives it, so a shell reading either is judged on what it takes.
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
const EXPECTED = 8;

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
  "const POLICY_HEAD =", "const POLICY_EXPORT_LINE =", "function policyValues(", "function policyRegSz(",
  "function policyFolderOk(", "function policyLeadOk(", "function joinPolicyFacts(", "function policyWords(",
  "function joinPolicyFrom(", "let joinPolicyRead =", "function readJoinPolicy("];
const POLICY_NAMES = ["execFileSync", "process", "fs", "os", "path"];
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
  folder: "The team folder set in Group Policy is not a full path, so this desk keeps the folder it already uses.",
  lead: "The team lead's key set in Group Policy is not written as 64 lowercase hexadecimal characters, so this desk does not trust it.",
  beside: "The other value set beside it is not used either: the two are taken together or not at all.",
};
const PL = {
  folder: "Folder zespołu ustawiony w zasadach grupy nie jest pełną ścieżką, więc stanowisko zostaje przy folderze, którego już używa.",
  lead: "Klucz lidera zespołu ustawiony w zasadach grupy nie ma postaci 64 małych znaków szesnastkowych, więc stanowisko go nie przyjmuje.",
  beside: "Druga wartość ustawiona obok też nie zostanie użyta: obie są przyjmowane razem albo wcale.",
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
  P = load(SRC, POLICY_DECLS, ["joinPolicyFrom", "readJoinPolicy", "REG_TOOL", "POLICY_KEY", "POLICY_WORDS"],
    POLICY_NAMES, [() => "", { platform: "linux" }, fs, os, path]);
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
    for (const [folder, why] of goodRows) {
      for (const lang of ["en", "pl"]) {
        const got = P.joinPolicyFrom(exportText([["TeamFolder", "REG_SZ", folder], ["LeadKey", "REG_SZ", HEX]]), lang);
        if (got.folder !== folder || got.lead !== HEX || got.said.length !== 0)
          problems.push(why + " " + lang + " " + JSON.stringify(got));
      }
    }
  }
  check(problems.length === 0,
    "19a a full path and a 64 lower-case hex lead are kept as the export holds them, in both languages, and nothing is said: "
    + (problems.join("; ") || goodRows.length + " paths"));
}

{
  const problems = [];
  if (!P) problems.push(loadError);
  else {
    const alone = (rows, lang, subkeys) => P.joinPolicyFrom(exportText(rows, subkeys), lang || "en");
    const none = (name, got) => { if (got.folder !== "" || got.lead !== "" || got.said.length !== 0) problems.push(name + " " + JSON.stringify(got)); };
    const badFolder = [
      ["quay\\team", "a relative path"],
      ["D:\\Quay\\team\\..\\other", "a segment that walks out"],
      ["D:\\Quay\\team ", "a trailing space"],
      ["   D:\\Quay\\team", "leading spaces"],
      ["\tD:\\Quay\\team", "a leading tab"],
      ["   ", "spaces alone"],
      ["D:\\Quay" + BEL + "team", "a control character"],
      ["D:\\Quay\rteam", "a carriage return inside"],
      ["D:\\Quay\r\nteam", "a line break inside, which the export carries across two lines"],
      ["C:", "a drive with no slash"],
      ["/home/team", "a path from another system"],
      ["//quay/share/team", "a share written with forward slashes"],
      ["\\\\quay\\share\\..\\other", "a share segment that walks out"],
      ["D:\\Quay\\team:notes", "a colon in a later segment"],
      ["\\\\quay\\share\\team:notes", "a colon in a share's segment"],
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
      [" " + HEX, "a leading space"],
      ["   ", "spaces alone"],
      ["studio-" + "ab".repeat(8), "a studio key id"],
      [HEX.slice(0, 63), "63 characters"],
      ["ab".repeat(16), "32 characters"],
    ];
    for (const [lead, why] of badLead) {
      const got = alone([["LeadKey", "REG_SZ", lead]]);
      if (got.folder !== "" || got.lead !== "" || saidOf(got) !== EN.lead) problems.push(why + " " + JSON.stringify(got));
    }
    const dword = alone([["TeamFolder", "REG_DWORD", 1]]);
    if (dword.folder !== "" || saidOf(dword) !== EN.folder) problems.push("dword " + JSON.stringify(dword));
    const expand = alone([["TeamFolder", "REG_EXPAND_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]]);
    if (expand.folder !== "" || expand.lead !== "" || saidOf(expand) !== EN.folder + "|" + EN.beside)
      problems.push("expand " + JSON.stringify(expand));
    const expandLead = alone([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_EXPAND_SZ", HEX]]);
    if (expandLead.folder !== "" || expandLead.lead !== "" || saidOf(expandLead) !== EN.lead + "|" + EN.beside)
      problems.push("an expandable lead " + JSON.stringify(expandLead));
    const multiLead = alone([["LeadKey", "REG_MULTI_SZ", HEX]]);
    if (multiLead.lead !== "" || saidOf(multiLead) !== EN.lead) problems.push("a multiple-string lead " + JSON.stringify(multiLead));
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
    if (blank.folder !== "" || blank.lead !== "" || saidOf(blank) !== EN.lead) problems.push("blank " + JSON.stringify(blank));
    const cased = alone([["teamfolder", "REG_SZ", "D:\\Quay\\team"], ["LEADKEY", "REG_SZ", HEX]]);
    if (cased.folder !== "D:\\Quay\\team" || cased.lead !== HEX) problems.push("names in another case " + JSON.stringify(cased));
    const others = alone([["@", "REG_SZ", "D:\\Elsewhere"], ["Other", "REG_DWORD", 1], ["TeamFolder", "REG_SZ", "D:\\Quay\\team"]]);
    if (others.folder !== "D:\\Quay\\team" || others.said.length !== 0) problems.push("other values beside " + JSON.stringify(others));
    none("a subkey's own values", alone([], "en", { Old: [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]] }));
    none("the default value", alone([["@", "REG_SZ", "D:\\Quay\\team"]]));
    none("empty", P.joinPolicyFrom("", "en"));
    none("studio values", alone([["TeamAboveFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKeyAbove", "REG_SZ", HEX]]));
    /* A READ IN DOUBT IS NOT USED AT ALL: a good folder and lead sit in each of these, around a line reg does not write. */
    const good = [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]];
    const text = exportText(good, { Old: [["Note", "REG_SZ", "kept"]] });
    const own = "[" + REG_HEAD + "]\r\n";
    none("an unrecognised line", P.joinPolicyFrom(text.replace(own, own + "TeamFolder=D:\\Quay\\team\r\n"), "en"));
    none("an unrecognised line in a subkey's part", P.joinPolicyFrom(text.replace("\"Note\"=\"kept\"\r\n", "\"Note\"=\"kept\"\r\nkept\r\n"), "en"));
    none("an escape reg does not write", P.joinPolicyFrom(text.replace("\"D:\\\\Quay\\\\team\"", "\"D:\\\\Quay\\nteam\""), "en"));
    none("a header for another key", P.joinPolicyFrom(exportText(good, {}, "HKEY_CURRENT_USER\\Software\\Quay"), "en"));
    none("no version line", P.joinPolicyFrom(text.slice(text.indexOf("\r\n") + 2), "en"));
    none("a file cut short", P.joinPolicyFrom(text.slice(0, text.indexOf("\"D:\\\\Quay") + 6), "en"));
    none("one name twice", P.joinPolicyFrom(text.replace(own, own + "\"teamfolder\"=\"D:\\\\Other\"\r\n"), "en"));
    const polish = alone([["TeamFolder", "REG_SZ", "quay\\team"]], "pl");
    if (saidOf(polish) !== PL.folder || polish.said[0] === EN.folder || !/[ąćęłńóśźż]/i.test(polish.said[0]))
      problems.push("polish " + JSON.stringify(polish.said));
    const otherLang = alone([["LeadKey", "REG_SZ", "NO"]], "xx");
    if (saidOf(otherLang) !== EN.lead) problems.push("other language " + JSON.stringify(otherLang.said));
  }
  check(problems.length === 0,
    "19b a value is taken whole or not at all: a bad one is said and ignored, one bad value of a pair leaves the other"
    + " unused, and a read holding anything reg does not write is not used: " + (problems.join("; ") || "none half used"));
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
    "19c the policy pin is ahead of the ring, the first wrap, a handover and the pin already held, and is the whole key: "
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
    let reader = "", facts = "", values = "", keyLine = "";
    try {
      reader = sliceDecl(SRC, "function readJoinPolicy(");
      facts = sliceDecl(SRC, "function joinPolicyFacts(");
      values = sliceDecl(SRC, "function policyValues(");
      keyLine = sliceDecl(SRC, "const POLICY_KEY =");
    } catch (e) { problems.push(e.message); }
    if (reader) {
      if (reader.split("execFileSync(").length !== 2) problems.push("exec count " + reader.split("execFileSync(").length);
      if (!reader.includes('execFileSync(REG_TOOL, ["export", POLICY_KEY, file, "/y"]')) problems.push("not REG_TOOL exporting the key");
      if (/execFileSync\(\s*["'`]/.test(reader)) problems.push("a program named in place of REG_TOOL");
      if (/powershell|cmd\.exe|spawn\s*\(|\bfork\s*\(|child_process|dbus-send/i.test(reader + facts + values)) problems.push("another program");
      if (/console\.|teamSay|\.said\b/.test(reader + facts + values)) problems.push("the reader says something itself");
      if (/TeamAboveFolder|LeadKeyAbove|EtiudaStudio/.test(reader + facts + keyLine)) problems.push("studio value");
    }
    if (P.REG_TOOL !== REG_EXE || P.POLICY_KEY !== ASKED) problems.push("path " + P.REG_TOOL + " key " + P.POLICY_KEY);
    const quiet = s => s === "ignore" || (Array.isArray(s) && s.length === 3 && s.every(x => x === "ignore"));
    const tmp = path.resolve(os.tmpdir());
    const reader2 = (answer, platform, fsUsed) =>
      load(SRC, POLICY_DECLS, ["readJoinPolicy", "REG_TOOL", "POLICY_KEY"], POLICY_NAMES, [answer, { platform: platform || "win32" }, fsUsed || fs, os, path]);
    /* A stand-in that writes the export where it is asked, a different folder at every call. */
    const calls = [];
    const win = reader2((file, args, opt) => {
      calls.push({ file: file, args: args.slice(), opt: opt });
      fs.writeFileSync(args[2], exportBytes([["TeamFolder", "REG_SZ", calls.length === 1 ? "D:\\First" : "D:\\Second"], ["LeadKey", "REG_SZ", HEX]]));
      return null;
    });
    const got = ["en", "pl", "en"].map(l => win.readJoinPolicy(l));
    const c = calls[0] || { args: [] }, scratch = String(c.args[2] || "");
    if (calls.length !== 1 || c.file !== REG_EXE || JSON.stringify(c.args) !== JSON.stringify(["export", ASKED, scratch, "/y"])
        || path.resolve(path.dirname(path.dirname(scratch))) !== tmp || !c.opt || c.opt.windowsHide !== true || c.opt.timeout !== 5000
        || !quiet(c.opt.stdio) || got.some(g => g.folder !== "D:\\First" || g.lead !== HEX))
      problems.push("read once " + JSON.stringify(calls.map(x => [x.file, x.args, x.opt])) + " " + JSON.stringify(got.map(g => g.folder)));
    if (scratch && (fs.existsSync(scratch) || fs.existsSync(path.dirname(scratch)))) problems.push("the scratch file stayed");
    let asked = 0;
    const badLead = reader2((file, args) => { asked++; fs.writeFileSync(args[2], exportBytes([["LeadKey", "REG_SZ", "NO"]])); return null; });
    const en = badLead.readJoinPolicy("en"), pl = badLead.readJoinPolicy("pl");
    if (asked !== 1 || saidOf(en) !== EN.lead || saidOf(pl) !== PL.lead) problems.push("words " + asked + " " + JSON.stringify([en.said, pl.said]));
    let threw = 0, thrownAt = "";
    const broken = reader2((file, args) => { threw++; thrownAt = String(args[2]); throw new Error("missing"); });
    const none = broken.readJoinPolicy("en");
    broken.readJoinPolicy("pl");
    if (threw !== 1 || none.folder !== "" || none.lead !== "" || none.said.length !== 0 || !thrownAt || fs.existsSync(path.dirname(thrownAt)))
      problems.push("throw " + threw + " " + JSON.stringify(none));
    const unmarked = reader2((file, args) => {
      fs.writeFileSync(args[2], exportText([["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]]), "utf8");
      return null;
    }).readJoinPolicy("en");
    if (unmarked.folder !== "" || unmarked.lead !== "") problems.push("a file that is not UTF-16 was read " + JSON.stringify(unmarked));
    let linuxCalls = 0, made = 0;
    const counting = Object.assign(Object.create(fs), { mkdtempSync: (...a) => { made++; return fs.mkdtempSync(...a); } });
    const off = reader2(() => { linuxCalls++; return null; }, "linux", counting).readJoinPolicy("en");
    if (linuxCalls !== 0 || made !== 0 || off.folder !== "" || off.lead !== "") problems.push("linux calls " + linuxCalls + " folders " + made);
  }
  check(problems.length === 0,
    "19e the reader starts reg.exe at its fixed path, exporting this one key to a scratch file in the temp folder that is"
    + " gone after, once whatever the language, and no other program: " + (problems.join("; ") || "one call"));
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
  /* The keys the desk and Studio read, as the template must write them; the registry compares them without case. */
  const DESK_KEY = "software\\policies\\etiuda", STUDIO_KEY = "software\\policies\\etiudastudio";
  const WANT = { TeamFolder: [DESK_KEY, "1024"], LeadKey: [DESK_KEY, "64"], TeamAboveFolder: [STUDIO_KEY, "1024"], LeadKeyAbove: [STUDIO_KEY, "64"] };
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
      const want = WANT[p.attrs.name], boxes = under(p, "text");
      if (!want) continue;
      if (String(p.attrs.key).toLowerCase() !== want[0] || p.attrs.class !== "Machine" || boxes.length !== 1
          || boxes[0].attrs.valueName !== p.attrs.name || boxes[0].attrs.maxLength !== want[1])
        problems.push(p.attrs.name + " key " + p.attrs.key + " class " + p.attrs.class + " value "
          + (boxes[0] && boxes[0].attrs.valueName) + " length " + (boxes[0] && boxes[0].attrs.maxLength));
      const shown = /^\$\(presentation\.([^)]+)\)$/.exec(p.attrs.presentation || "");
      if (shown && boxes[0]) boxOf[shown[1]] = boxes[0].attrs.id;
    }
    const cats = under(doc.admx, "category").map(c => c.attrs.name).join(",");
    if (cats !== "Etiuda,EtiudaStudio") problems.push("categories " + cats);
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
    for (const p of shows) {
      const boxes = under(p, "textBox");
      if (boxes.length !== 1 || boxes[0].attrs.refId !== boxOf[p.attrs.id]) problems.push(lang + " presentation " + p.attrs.id);
    }
    const text = id => (strings.find(s => s.attrs.id === id) || { text: "" }).text;
    if (text("EtiudaCat") !== "Etiuda" || text("EtiudaStudioCat") !== "Etiuda Studio") problems.push(lang + " category names");
  }
  if (order.en && order.pl && order.en.join() !== order.pl.join()) problems.push("en and pl ids in another order");
  if (raw.pl && (!raw.pl.includes("stanowisko") || !/[ąćęłńóśźż]/i.test(raw.pl))) problems.push("polish copy");
  if (raw.en && !raw.en.includes("full path") && !raw.en.includes("Full path")) problems.push("english copy");
  check(problems.length === 0,
    "19f the template parses, its strings and presentations match the ADMX one for one in English and in Polish, and each"
    + " policy writes its own value under the key the desk or Studio reads: " + (problems.join("; ") || "shell/policy"));
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
   how many times the key has been asked for. Any other key is not there. */
function standInReg(registry, page) {
  const calls = [];
  const asked = () => calls.filter(c => c.args[1] === ASKED);
  const execFileSync = (file, args, opt) => {
    args = (args || []).map(String);
    calls.push({ file: String(file), args: args, opt: opt });
    const key = file === REG_EXE && args[1] === ASKED ? (typeof registry === "function" ? registry(asked().length) : registry) : null;
    const fail = () => { const e = new Error("reg.exe exited 1"); e.status = 1; throw e; };
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
  return { calls, asked, cp: { execFileSync, execFile: () => { throw new Error("no program runs here"); } } };
}
/* Every leg below asks the Windows arm of the reader, so the shell runs as Windows on any machine. */
function asWindows(fn) {
  const was = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  try { return fn(); } finally { Object.defineProperty(process, "platform", was); }
}
/* One desk: its desk.json, the shell evaluated afresh over it with the stand-in reg, and its own .cjs files evaluated
   with the same require so the proxy reader meets the stand-in too. setLang changes the desk's language as a write would. */
function loadDesk(name, desk, reg) {
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
    SHELL + "\nreturn { catalogFolder, heedTeam, teamCovering,"
    + " setLang: l => { if (deskKeys === undefined) deskKeys = readDesk(); deskKeys = Object.assign({}, deskKeys, { eUiLang: l }); } };")(
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
      if (got !== POLISH || reg.asked().length !== 1 || policySaid(D).length)
        problems.push("code page " + page + ": " + JSON.stringify(got) + " in " + reg.asked().length + " call(s)");
      scratchGone(reg, problems, "code page " + page);
    }
    const moving = standInReg(n => ({ rows: [["TeamFolder", "REG_SZ", n === 1 ? "D:\\First" : "D:\\Second"], ["LeadKey", "REG_SZ", HEX]] }), 65001);
    const L = asWindows(() => loadDesk("languages", deskIn("en"), moving));
    desks.push(L);
    const seen = asWindows(() => ["en", "pl", "en"].map(l => { L.api.setLang(l); return L.api.catalogFolder(); }));
    if (seen.join("|") !== "D:\\First|D:\\First|D:\\First" || moving.asked().length !== 1)
      problems.push("a language changed: " + JSON.stringify(seen) + " in " + moving.asked().length + " call(s)");
    for (const [name, rows, want] of [
      ["leading spaces", [["TeamFolder", "REG_SZ", "   D:\\Quay\\team"], ["LeadKey", "REG_SZ", HEX]], [PL.folder, PL.beside]],
      ["a line break inside", [["TeamFolder", "REG_SZ", "D:\\Quay\r\nteam"], ["LeadKey", "REG_SZ", HEX]], [PL.folder, PL.beside]],
      ["spaces for a lead", [["TeamFolder", "REG_SZ", "D:\\Quay\\team"], ["LeadKey", "REG_SZ", "   "]], [PL.lead, PL.beside]],
    ]) {
      const reg = standInReg({ rows: rows }, 65001);
      const D = asWindows(() => loadDesk("bad-" + desks.length, deskIn("pl"), reg));
      desks.push(D);
      const folders = asWindows(() => {
        const out = [D.api.catalogFolder()];
        D.api.setLang("en");
        out.push(D.api.catalogFolder(), D.api.catalogFolder());
        return out;
      });
      if (folders.some(f => f !== mine) || JSON.stringify(policySaid(D)) !== JSON.stringify(want))
        problems.push(name + ": " + JSON.stringify(folders.map(f => (f === mine ? "the desk's" : f))) + " said " + JSON.stringify(policySaid(D)));
    }
    const absent = standInReg(null, 65001);
    const N = asWindows(() => loadDesk("absent", deskIn("en"), absent));
    desks.push(N);
    const plain = asWindows(() => [N.api.catalogFolder(), N.api.catalogFolder()]);
    if (plain.some(f => f !== mine) || absent.asked().length !== 1 || policySaid(N).length) problems.push("no key " + JSON.stringify(plain));
    const leaked = desks.reduce((out, D) => out.concat(D.said), []).map(s => s.split(LAB).join("<lab>"))
      .filter(s => /Quay|Dzia|Ksi|First|Second/.test(s) || s.includes(HEX));
    if (leaked.length) problems.push("the policy's text in what the shell said: " + leaked.length + " line(s)");
  } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0,
    "19g the shell's catalog folder is the one the key holds whatever the console's code page, read once whatever the"
    + " language, a bad value said once in the desk's language and none taken, and nothing of the key said: "
    + (problems.join("; ") || "852 and 437 alike"));
}

{
  const problems = [];
  try {
    const signedBytes = load(SRC, ["function canonJson(", "function signedBytesOf("], ["signedBytesOf"], ["crypto", "Buffer"], [crypto, Buffer]).signedBytesOf;
    const A = crypto.generateKeyPairSync("ed25519"), B = crypto.generateKeyPairSync("ed25519");
    const leadA = { keyId: "quay-old", public: pubHex(A.publicKey) }, leadB = { keyId: "quay-new", public: pubHex(B.publicKey) };
    const teamText = (id, who, priv, epoch) => {
      const body = { format: 1, kind: "etiuda-team", id: id, catalogs: ["lamp-shop"], lead: who, sealed: true, exportsSealed: false,
        epoch: epoch || 1, roster: [] };
      body.sig = { alg: "Ed25519", keyId: who.keyId };
      body.sig.value = crypto.sign(null, signedBytes(body), priv).toString("hex");
      return JSON.stringify(body, null, 1) + "\n";
    };
    const policyB = { rows: [["LeadKey", "REG_SZ", leadB.public]] };
    /* A pin of A kept from before, A's file in the folder, and policy naming B. */
    const T1 = "t-" + hex(8), F1 = path.join(LAB, "kept-folder"), file1 = path.join(F1, "etiuda-team.json");
    fs.mkdirSync(F1, { recursive: true });
    fs.writeFileSync(file1, teamText(T1, leadA, A.privateKey), "utf8");
    const keptDesk = { keys: { eCatalogFolder: F1, eUiLang: "en" }, teamPins: { [T1]: leadA } };
    const D = asWindows(() => loadDesk("kept", keptDesk, standInReg(policyB, 65001)));
    const sentence = "ERR etiuda: " + file1 + " is signed by a key other than the lead's this desk trusts for team " + T1 + ", so nothing in it is used";
    const covers = asWindows(() => {
      D.api.heedTeam();
      const first = D.api.teamCovering(F1, "lamp-shop");
      fs.writeFileSync(file1, teamText(T1, leadA, A.privateKey, 2), "utf8");
      D.api.heedTeam();
      return [first, D.api.teamCovering(F1, "lamp-shop")];
    });
    const told = D.said.filter(s => s === sentence).length, pins = D.envelope().teamPins || {};
    if (covers.some(c => c !== null) || told !== 1 || !pins[T1] || pins[T1].public !== leadA.public)
      problems.push("a kept pin of another key: covered " + covers.map(c => (c ? "by its file" : "by nothing")).join(", ")
        + ", said " + told + " time(s), pin " + (pins[T1] && pins[T1].public === leadA.public ? "kept" : "lost"));
    /* The control: the same desk with no policy is covered by that file, so the null above is the policy's doing. */
    const C = asWindows(() => loadDesk("kept-control", keptDesk, standInReg(null, 65001)));
    const plain = asWindows(() => { C.api.heedTeam(); return C.api.teamCovering(F1, "lamp-shop"); });
    if (!plain || plain.lead.public !== leadA.public) problems.push("the control: no policy, and the kept pin's file covers nothing");
    /* A team this desk barred, B's file, policy naming B: the first heed is under the policy, so the bar lifts and B is pinned. */
    const T2 = "t-" + hex(8), F2 = path.join(LAB, "barred-folder");
    fs.mkdirSync(F2, { recursive: true });
    fs.writeFileSync(path.join(F2, "etiuda-team.json"), teamText(T2, leadB, B.privateKey), "utf8");
    const E = asWindows(() => loadDesk("barred", { keys: { eCatalogFolder: F2, eUiLang: "en" }, teamBarred: [T2] }, standInReg(policyB, 65001)));
    const coverB = asWindows(() => { E.api.heedTeam(); return E.api.teamCovering(F2, "lamp-shop"); });
    const env = E.envelope(), pinsB = env.teamPins || {};
    if (!pinsB[T2] || pinsB[T2].public !== leadB.public || (env.teamBarred || []).indexOf(T2) >= 0 || !coverB || coverB.lead.public !== leadB.public)
      problems.push("a barred team under its policy lead: pin " + (pinsB[T2] ? "set" : "missing") + ", barred "
        + ((env.teamBarred || []).indexOf(T2) >= 0) + ", covered " + !!coverB);
  } catch (e) { problems.push("harness: " + ((e && e.stack) || e)); }
  check(problems.length === 0,
    "19h a policy lead outranks a pin kept for another key: that key's file covers nothing and is said once, the kept pin"
    + " stays for when the policy goes, and a barred team's file under the policy lead is pinned: "
    + (problems.join("; ") || "the policy's lead alone"));
}

try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* the temp folder's own to clear */ }

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
