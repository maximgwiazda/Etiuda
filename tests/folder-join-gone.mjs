/* THE JOIN BY FOLDER IS GONE, WITH ITS CODES AND THE PASTE BOX (folder removal P2; board 1017: "no sign-in code is shown, typed or sent
 * anywhere"; Max, 2026-11-22 15:37, of the shared folder: "remove it, burn it with fire"; 02:12, of the paste: "Yes, remove it please.").
 *
 *     node tests/folder-join-gone.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CLAIM. No screen of the desk offers a folder join, a folder invitation, a join code, a check code or the paste box, and nothing in
 * the shell still makes or asks for either code. A relay invitation is read as it was. The legs read the page the desk draws (the engine's
 * own team-join.js, over a stand-in host), the shell's own text and the shell itself, evaluated under a stubbed electron over a folder of
 * its own, as tests/team-join.mjs evaluates it. Nothing here opens a window.
 *
 * ids: fjg1 the shell makes and asks for no code; fjg2 the page draws none of it; fjg3 the words; fjg4 an invitation that names a
 * folder is unread and a relay one is read as before (plant:invite-relay-only); fjg5 a desk makes no request of its own to join and a
 * lead's opening shows no code; fjg6 the built page holds none of it.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
process.env.ETIUDA_TEST_OFFSCREEN = "1";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
const EXPECTED = 11;
let asserted = 0, failed = 0;
function check(ok, line) { asserted++; if (ok) console.log("  ok   " + line); else { failed++; console.log("  FAIL " + line); } }

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const SRC = read("shell", "main.js"), PAGE = read("src", "modules", "team-join.js"), TEMPLATE = read("src", "template.html");
const TABLE = read("src", "modules", "ui-lang.js"), BUILT = read("engine", "etiuda.html");
const has = (text, re) => (typeof re === "string" ? text.indexOf(re) >= 0 : re.test(text));

/* ---- fjg1: the shell ------------------------------------------------------------------------------------------------------------ */
{
  const gone = ["joinCode", "inviteCode", "inviteFolder", "chooseInviteFolder", "askInviteFolder", "inviteFolderTeam", "inviteFolderBelongs",
    "invitePlacePlan", "checkInviteRefusal", "pageRemotePath"];
  const still = gone.filter(n => has(SRC, new RegExp("function " + n + "\\(")));
  const sig = /async function takeInvite\(text, name\)/.test(SRC) && !/takeInvite\(file, name, check\)/.test(SRC);
  check(still.length === 0 && sig,
    "fjg1 the shell declares no join code, no check code and no folder invitation's machinery, and a yes to an invitation takes its text and a name and no code: still declared "
    + JSON.stringify(still) + (sig ? "" : ", takeInvite still takes a code"));
}

/* ---- fjg2 and fjg3: the page ---------------------------------------------------------------------------------------------------- */
globalThis.window = { addEventListener() {}, removeEventListener() {}, E_HOST: null };
globalThis.document = { addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
let took = null;
window.E_HOST = { onTeamJoin: fn => { took = fn; }, catalogFolder: "", teamJoin: async () => null };
const HK = await import(MOD("hooks.js"));
HK.hooks.render = () => {};
const TJ = await import(MOD("team-join.js"));
const ST = await import(MOD("storage.js"));
TJ.wireTeamJoin();
await new Promise(r => setTimeout(r, 30));
const paint = view => { took(view); return TJ.teamJoinEmptyHtml(); };
const langWas = ST.lsGet ? ST.lsGet("eUiLang") : null;
const views = {
  code: { join: { file: "a.ec", state: "code", code: "483920", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] },
  codeNoInvite: { join: { file: "a.ec", state: "code", code: "120034", asked: 1, name: "Nia" }, leads: [] },
  waitFolderInvite: { join: { file: "a.ec", state: "waiting", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] },
  waitNoInvite: { join: { file: "a.ec", state: "waiting", asked: 1, name: "Nia" }, leads: [] },
  sealed: { sealed: { file: "lamps.ec", team: "t-0123456789abcdef" }, join: null, leads: [] },
  gone: { sealed: { file: "lamps.ec", team: "t-0123456789abcdef" }, join: null, leads: [{ team: "t-0123456789abcdef", print: "", admitted: true, seen: true, lead: "Lamp lead", removed: true }] },
};
ST.lsSet("eUiLang", "en");
const shown = {};
for (const k of Object.keys(views)) shown[k] = paint(views[k]);
const bad = /e-join-code|e-join-wait|data-join-paste|data-join-check|<textarea|<input|digits|check code|Read this code|read it to the lead/;
const offenders = Object.keys(shown).filter(k => bad.test(shown[k]));
check(offenders.length === 0 && typeof TJ.openJoinPaste === "undefined" && !/joinCodeHtml|openJoinPaste|data-join-paste|data-join-check/.test(PAGE),
  "fjg2 no state of the join the desk draws holds a code, code places, a paste box or a check field, and the page has no paste to open: offenders " + JSON.stringify(offenders));
check(!/data-join="ask"/.test(shown.sealed) && !/data-join="ask"/.test(shown.gone) && /data-join="load"/.test(shown.sealed) && /data-join="load"/.test(shown.gone),
  "fjg2b a sealed catalog this desk holds no key for, and a team that dropped this desk, offer no Ask to join: they name the lead's invitation and offer Load another catalog file");
const SAID_EN = "Waiting for the team&#39;s lead to let this desk in. Nothing more is needed here.";
const SEALED_EN = "This catalog belongs to a team. Once the team&#39;s lead has invited this desk and it has joined, the catalog opens here by itself.";
ST.lsSet("eUiLang", "pl");
const plWait = paint(views.waitNoInvite), plSealed = paint(views.sealed);
if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
check(shown.waitNoInvite.indexOf(SAID_EN) >= 0 && shown.waitFolderInvite.indexOf(SAID_EN) >= 0 && shown.sealed.indexOf(SEALED_EN) >= 0
  && plWait.indexOf("Stanowisko czeka, aż lider zespołu je wpuści. Nic więcej nie trzeba tu robić.") >= 0
  && plSealed.indexOf("Ten katalog należy do zespołu.") >= 0,
  "fjg3 the waiting line and the sealed line say what is true, in English and in Polish, with no code in either (placeholder words, for the copywriter): "
  + JSON.stringify([shown.waitNoInvite.indexOf(SAID_EN) >= 0, shown.waitFolderInvite.indexOf(SAID_EN) >= 0, shown.sealed.indexOf(SEALED_EN) >= 0,
    plWait.indexOf("Stanowisko czeka") >= 0, plSealed.indexOf("Ten katalog") >= 0]));
const retired = ["Ask the team's lead for this invitation's check code, and type its five digits here.", "Read this code to the team's lead",
  "The code to read to them appears here as soon as they do.", "Paste the invitation from the team's lead.",
  "Waiting for the team's lead to let this desk in. Usually this happens by itself; if a code appears here, read it to the lead."];
check(retired.every(k => !TABLE.includes(JSON.stringify(k) + ":")),
  "fjg3b the table holds none of the lines of the code, the paste or the folder join it used to say");

/* ---- the shell itself ----------------------------------------------------------------------------------------------------------- */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-fjg-"));
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), { policy: null });
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
function loadDesk(src, name) {
  const ud = path.join(LAB, name), share = path.join(LAB, name + "-share");
  fs.mkdirSync(ud, { recursive: true }); fs.mkdirSync(share, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: share, eUiLang: "en" } }), "utf8");
  const invoke = {};
  const safeStorage = { isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8") };
  const electron = { app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: noop, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert, screen: inert,
    systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const quiet = { log: noop, error: noop, warn: noop, info: noop, debug: noop };
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    src + "\nreturn { inviteRead, sealCatalog, wrapTeamKey, joinGenuine, joinCommit };")(
    n => (n === "electron" ? electron : nodeRequire(n)), path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ev = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });
  const join = (op, file, name) => Promise.resolve(invoke["etiuda:team-join"](ev(), op, file, name));
  const ask = (ch, ...a) => Promise.resolve(invoke[ch](ev(), ...a));
  return { api, join, ask, ud, share };
}
const blob = o => "etiuda-join:" + Buffer.from(JSON.stringify(o)).toString("base64url");
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const leadPub = crypto.randomBytes(32).toString("hex");
/* A relay invitation's keyId must be the id Studio makes of the lead's key ("studio-" and the first 16 hex of its sha256), at the read as at the yes (inviteKeyHolds, the relay's own rule for a lead). */
const lead = { keyId: "studio-" + crypto.createHash("sha256").update(Buffer.from(leadPub, "hex")).digest("hex").slice(0, 16), public: leadPub, name: "Lamp lead" };
const secret = () => crypto.randomBytes(16).toString("hex");
const relay = { rt: crypto.randomBytes(16).toString("hex"), url: "https://relay.test/relay/v1", token: crypto.randomBytes(32).toString("hex"), inv: secret() };
const folderBlob = blob({ team: TEAM, folder: path.join(LAB, "elsewhere") + path.sep, lead, secret: secret() });
const relayBlob = blob({ team: TEAM, lead, secret: secret(), relay });
const mixedBlob = blob({ team: TEAM, folder: path.join(LAB, "elsewhere") + path.sep, lead, secret: secret(), relay });

async function shellLegs(src, tag, expectRelayOnly) {
  const D = loadDesk(src, tag);
  /* The first ask of the shell lets machine policy answer (policyWaits), as the legs of tests/team-join.mjs do by asking for the state first. */
  await D.join("state");
  await new Promise(r => setTimeout(r, 400));
  await D.join("state");
  const folderRead = D.api.inviteRead(folderBlob), relayRead = D.api.inviteRead(relayBlob), mixedRead = D.api.inviteRead(mixedBlob);
  const looked = await D.join("read", folderBlob);
  const relayLooked = await D.join("read", relayBlob);
  return { folderRead, relayRead, mixedRead, looked, relayLooked, D };
}
const A = await shellLegs(SRC, "a", true);
check(A.folderRead === null && A.mixedRead === null && !!A.relayRead && A.relayRead.team === TEAM && A.relayRead.relay.url === "https://relay.test/relay/v1"
  && !("folder" in A.relayRead) && A.looked && A.looked.refused === "unread" && !A.looked.offer
  && A.relayLooked && A.relayLooked.offer && A.relayLooked.offer.relay === "relay.test" && A.relayLooked.offer.lead === "Lamp lead" && !("code" in A.relayLooked.offer),
  "fjg4 an invitation that names a folder, alone or beside a relay, is not read, and the desk's read of it is refused as unread with no offer; a relay invitation is read as before and its offer holds the lead, the team and the relay's host and no code: "
  + JSON.stringify([A.folderRead === null, A.mixedRead === null, !!A.relayRead, A.looked && A.looked.refused, A.relayLooked && (A.relayLooked.refused || (A.relayLooked.offer && A.relayLooked.offer.relay))]));
{
  /* plant:invite-relay-only lifted: the rule that makes a relay invitation the only one read. The leg must go red without it. */
  const lifted = SRC.replace("if (!relay || doc.folder !== undefined) return null; /* plant:invite-relay-only */", "if (false) return null;");
  let liftedRed = false;
  if (lifted !== SRC) { try { const L = await shellLegs(lifted, "lifted", true); liftedRed = !(L.mixedRead === null && L.folderRead === null); } catch { liftedRed = true; } }
  check(lifted !== SRC && liftedRed, "fjg4b lifting plant:invite-relay-only reads an invitation that names a folder again, reddening fjg4"
    + (lifted === SRC ? ": plant line absent" : ""));
}

/* ---- fjg5: no request of the desk's own, and no code from a lead's opening ----------------------------------------------------- */
{
  const D = A.D;
  const ident = await D.ask("etiuda:branch-identity", true);
  const K = crypto.randomBytes(32);
  const sealed = D.api.sealCatalog(K, TEAM, 1, "{}");
  fs.writeFileSync(path.join(D.share, "lamps.ec"), typeof sealed === "string" ? sealed : JSON.stringify(sealed), "utf8");
  const before = await D.join("state");
  const asked = await D.join("ask", "lamps.ec", "Nia");
  const after = await D.join("state");
  const mine = path.join(D.share, "desks", ident ? ident.id : "none", "join.json");
  const sealedShown = !!(before && before.sealed && before.sealed.file === "lamps.ec");
  check(!!ident && sealedShown && !fs.existsSync(mine) && asked && asked.join === null && after && after.join === null,
    "fjg5 a sealed catalog this desk holds no key for is still told so, and Ask makes no request of the desk's own: no request file is written and no join stands");
  /* A lead's opening of a request, written where the desk once read it, gives no state and no code. */
  const nonce = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(mine), { recursive: true });
  fs.writeFileSync(path.join(D.share, "etiuda-team-joins.json"), JSON.stringify({ format: 1, kind: "etiuda-team-joins", team: TEAM, lead: { keyId: lead.keyId, public: lead.public },
    open: [{ desk: ident ? ident.id : "x", commit: "0".repeat(64), nonce }] }), "utf8");
  const viewed = await D.join("state");
  check(viewed && viewed.join === null && !JSON.stringify(viewed).includes("\"code\""),
    "fjg5b a file of openings beside the desk's catalog changes nothing the desk shows, and no view of the join carries a code field");
}

/* ---- fjg6: the page as built ----------------------------------------------------------------------------------------------------- */
check(!/e-join-code|e-join-paste|e-join-check|joinCodeHtml|data-join-paste|data-join-check/.test(BUILT) && !/\.e-join-code|\.e-join-paste|\.e-join-check/.test(TEMPLATE),
  "fjg6 the built page and its stylesheet hold no code places, no paste box and no check field");
check(regStand.held ? regStand.held() : true, "fjg7 every reg call was answered by the stand-in");

console.log("#counts checks=" + asserted + " skipped=0 failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) { console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran"); process.exit(78); }
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
