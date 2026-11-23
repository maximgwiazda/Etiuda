/* A desk that still holds a team it joined through a shared folder, now that a team works over the relay only. Driven in bare
 * node: the real shell/main.js under stubbed electron over a desk.json that names such a team, its share and its local mirror.
 *
 *     node tests/folder-team-held.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE CRITERION. No reader takes a folder as a team: the catalog folder is the person's own setting, read as a plain folder; no
 * write goes to a team's place; the team file in the folder is not heeded; machine policy's TeamFolder is not read. The desk says
 * once, on the team's row in Settings and in a notice, the copywriter's sentence for such a team, and, where the mirror's outbox
 * still owes the folder something, that it stays on this computer unsent. Nothing under the share or the mirror is removed or
 * changed: a listing of both, path, size and digest, is the same before and after.
 *
 * THE LOCAL COPY (the mend of the design read). The desk reads the folder team's local copy, `<userData>/folder-mirror/<team>/`,
 * where it holds anything, and the share itself only where no copy is kept: the copy is what the desk last had, with what the
 * share does not hold (an owed file), and it opens with the share out of reach. The owed line names the folder the unsent files
 * stay in. A sealed catalog of the held team opens from the copy under the key kept, and the desk's own file for it is held,
 * never written in the clear, whether or not the share answers.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODS = path.join(ROOT, "src", "modules"), MOD_DIR = pathToFileURL(MODS).href + "/";
const nodeRequire = createRequire(import.meta.url);
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"));
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 28;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const LAB = createLab("etiuda-folder-team-held-");
/* ETIUDA_SHELL_MAIN names another shell/main.js to judge, as tests/team-desk.mjs takes it: a tree before this one, for its reds. */
const SRC = fs.readFileSync(process.env.ETIUDA_SHELL_MAIN || path.join(ROOT, "shell", "main.js"), "utf8");
const EXPOSE = ["catalogFolder", "teamWriteHere", "heedTeam", "leadsView", "joinPolicyFacts", "armFolder", "teamRoster", "teamEpochSeen",
  "pinnedLead", "unlinkOwn", "readCatalog", "catalogFileNamed", "storeSyncFolder", "sealCatalog", "writeBranch"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, src) {
  const said = [], on = {}, invoke = {}, opened = [];
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: { openPath: async p => { opened.push(p); return ""; } },
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8")
    }
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  const ret = "\nreturn { " + EXPOSE.map(n => n + ": typeof " + n + " === 'undefined' ? null : " + n).join(", ") + " };";
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", (src || SRC) + ret)(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(ROOT, "shell"), path.join(ROOT, "shell", "main.js"), { exports: {} }, {}, quiet);
  const boot = eventFor();
  if (typeof on["etiuda:desk"] === "function") on["etiuda:desk"](boot);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  return { api, ask, said, opened };
}

const V2 = await import(pathToFileURL(path.join(MODS, "catalog-v2.js")).href);
const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const pair = crypto.generateKeyPairSync("ed25519");
const LEAD = { keyId: "lead-01", public: pubHex(pair.publicKey) };
const sign = doc => {
  const out = JSON.parse(JSON.stringify(doc));
  delete out.sig;
  out.sig = { alg: "Ed25519", keyId: LEAD.keyId };
  out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), pair.privateKey).toString("hex");
  return out;
};
const TEAM = "t-" + crypto.randomBytes(8).toString("hex");
const OTHER_DESK = "k-" + "a1".repeat(8);
const teamFile = (rev, roster) => sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["wick-board"],
  lead: { keyId: LEAD.keyId, public: LEAD.public }, sealed: true, epoch: 1, rev: rev, roster: roster });
const edition = () => sign({ format: 2, kind: "etiuda-catalog", id: "wick-board", rev: 1, name: "Wick Board", date: "2026-04-01",
  langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [{ id: "c-wick", shelf: "t-op", bodyShape: "plain", title: { en: "Wick" }, body: { en: "A wick." } }] });

/* Every file under `dir`, as relative path, size and digest, sorted. */
function listing(dir) {
  const out = [];
  const walk = d => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const b = fs.readFileSync(p); out.push(path.relative(dir, p).split(path.sep).join("/") + " " + b.length + " " + crypto.createHash("sha256").update(b).digest("hex").slice(0, 16)); }
    }
  };
  walk(dir);
  return out.sort();
}

/* A catalog the share holds and the local copy does not (newer there), and one the copy holds and the share does not (owed). */
const shareOnly = () => JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "share-news", rev: 4, name: "Share News", date: "2026-05-01",
  langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [{ id: "c-n", shelf: "t-op", bodyShape: "plain", title: { en: "News" }, body: { en: "Newer on the share." } }] });
const copyOnly = () => JSON.stringify({ format: 2, kind: "etiuda-catalog", id: "owed-notes", rev: 2, name: "Owed Notes", date: "2026-05-02",
  langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
  cards: [{ id: "c-o", shelf: "t-op", bodyShape: "plain", title: { en: "Owed" }, body: { en: "Only in the local copy." } }] });
/* The text of every file under `dir`, so a card's words are looked for in all of them. */
function walkText(dir) {
  const out = [];
  const walk = d => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { out.push(fs.readFileSync(p, "utf8")); } catch { /* unreadable */ } } }
  };
  walk(dir);
  return out;
}
/* A desk holding the folder team: the share is its catalog folder setting, the mirror its local copy, the outbox owing one file.
   The share holds a file the copy lacks and the copy one the share lacks, so a read of either is told from the other. `sealedCopy`
   seals the copy's edition under a key kept for the team (K1) and leaves no plain edition of it on the share. */
const K1 = crypto.randomBytes(32);
/* The shell's own sealing (sealCatalog), by the same AEAD, so the fixture needs no desk loaded to make an envelope. */
function SEAL(key, epoch, text) {
  const nonce = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(["etiuda-sealed", TEAM, epoch].join(String.fromCharCode(10)), "utf8"));
  const ct = Buffer.concat([c.update(text, "utf8"), c.final(), c.getAuthTag()]);
  return { format: 2, kind: "etiuda-sealed", team: TEAM, epoch: epoch, nonce: nonce.toString("hex"), ct: ct.toString("hex") };
}
const keptKey = k => Buffer.from(Buffer.from(k.toString("base64"), "utf8").map(b => b ^ 0x5a)).toString("base64");
function makeDesk(name, owed, sealedCopy) {
  const ud = path.join(LAB, name, "ud"), share = path.join(LAB, name, "share"), mirror = path.join(ud, "folder-mirror", TEAM);
  for (const d of [ud, share, mirror, path.join(share, "desks", OTHER_DESK), path.join(mirror, "desks", OTHER_DESK)]) fs.mkdirSync(d, { recursive: true });
  for (const root of [share, mirror]) {
    fs.writeFileSync(path.join(root, "etiuda-team.json"), JSON.stringify(teamFile(1, [])), "utf8");
    fs.writeFileSync(path.join(root, "wick-board.ec"), JSON.stringify(edition()), "utf8");
    fs.writeFileSync(path.join(root, "desks", OTHER_DESK, "note.txt"), "a desk's own file", "utf8");
  }
  fs.writeFileSync(path.join(share, "share-news.ec"), shareOnly(), "utf8");
  fs.writeFileSync(path.join(mirror, "owed-notes.ec"), copyOnly(), "utf8");
  if (sealedCopy) {
    fs.writeFileSync(path.join(mirror, "wick-board.ec"), JSON.stringify(SEAL(K1, 1, JSON.stringify(edition()))), "utf8");
    fs.rmSync(path.join(share, "wick-board.ec"));
  }
  if (owed) fs.writeFileSync(path.join(mirror, ".outbox.json"), JSON.stringify({ kind: "etiuda-folder-outbox", v: 1,
    owe: { ["desks/" + OTHER_DESK + "/note.txt"]: { owe: true, sha: "0".repeat(64) }, "owed-notes.ec": { owe: true, sha: "0".repeat(64) } }, floors: {} }), "utf8");
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
    kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: share, eUiLang: "en" },
    teamPins: { [TEAM]: LEAD },
    teamKeys: { [TEAM]: { "1": sealedCopy ? keptKey(K1) : "kept" } },
    teamEpochSeen: { [TEAM]: 1 },
    teamShown: { [TEAM]: { lead: "Ada", folder: share } }
  }), "utf8");
  return { ud, share, mirror };
}

/* ---- the page: the row's facts worded on the team's row in Settings and once in a notice (as tests/relay-desk-follow.mjs ks26) */
const HELD_EN = "Ada's team worked through a shared folder, which Etiuda no longer follows: its catalog stays on this computer as it is, and a new invitation from the team's lead brings the team back.";
const HELD_PL = "Zespół osoby Ada korzysta ze wspólnego folderu, którego Etiuda już nie obsługuje: katalog tego zespołu zostaje na tym komputerze bez zmian, a nowe zaproszenie od lidera zespołu przywróci zespół.";
/* The owed line, moved: it said "... stays on this computer, unsent." and does not say where; it now names the folder the unsent
   files stay in (the row's folderCopy). Placeholder words for the copywriter. */
const COPY_SHOWN = ["C:", "Users", "ada", "AppData", "Roaming", "Etiuda", "folder-mirror", "t-0123456789abcdef"].join(path.win32.sep);
const OWED_EN = "What this desk had not yet sent to the shared folder stays on this computer, unsent, in the folder " + COPY_SHOWN + ".";
const OWED_PL = "To, czego to stanowisko nie zdążyło wysłać do wspólnego folderu, zostaje na tym komputerze, niewysłane, w folderze " + COPY_SHOWN + ".";
const pageWords = h => String(h).replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const plantedMod = (name, tag) => {
  const text = fs.readFileSync(path.join(MODS, name), "utf8"), lines = text.split("\n"), at = lines.findIndex(l => l.includes("plant:" + tag));
  if (at < 0) return null;
  lines.splice(at, 1);
  return import("data:text/javascript;base64," + Buffer.from(lines.join("\n").replace(/from "\.\//g, 'from "' + MOD_DIR)).toString("base64"));
};
async function pageScene(tj, set) {
  const storage = await import(pathToFileURL(path.join(MODS, "storage.js")).href);
  const hooksMod = await import(pathToFileURL(path.join(MODS, "hooks.js")).href);
  const TJ = tj || await import(pathToFileURL(path.join(MODS, "team-join.js")).href);
  const SET = set || await import(pathToFileURL(path.join(MODS, "settings.js")).href);
  const quietList = { contains: () => false, add() {}, remove() {}, toggle() {} };
  const body = { children: [], classList: quietList };
  const el = tag => ({ tag, children: [], style: {}, classList: quietList, textContent: "", attrs: {},
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; },
    remove() { const i = body.children.indexOf(this); if (i >= 0) body.children.splice(i, 1); } });
  body.appendChild = c => { body.children.push(c); return c; };
  let send = null;
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {},
    E_HOST: { teamJoin: () => Promise.resolve(null), onTeamJoin: fn => { send = fn; } } };
  globalThis.document = { body, documentElement: { dataset: {}, classList: quietList, style: {} }, createElement: el, createTextNode: s => ({ textContent: String(s) }),
    getElementById: id => body.children.find(c => c.id === id) || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", fontSize: "16px" });
  const wasRender = hooksMod.hooks.render;
  hooksMod.hooks.render = () => {};
  const noticeOf = () => body.children.find(c => c.id === "eTeamFolderHeld") || null;
  const noticeText = () => { const n = noticeOf(); return n ? n.children[0].children.map(c => c.textContent).join("").trim() : null; };
  const dismiss = () => { const n = noticeOf(), row = n && n.children[1], x = row && row.children[row.children.length - 1]; if (x && x.onclick) x.onclick(); };
  const out = {};
  try {
    if (typeof TJ.wireTeamJoin === "function") TJ.wireTeamJoin();
    for (const [lang, team, held, owed] of [["en", "t-heldfolder00en", HELD_EN, OWED_EN], ["pl", "t-heldfolder00pl", HELD_PL, OWED_PL]]) {
      storage.lsSet("eUiLang", lang);
      const fact = { team, lead: "Ada", print: "0123456789abcdef", folderHeld: true };
      if (!send) throw new Error("the page took no team listener");
      send({ leads: [fact] });
      const row = pageWords(SET.settingsPageHtml("teams", ""));
      const shown = noticeText();
      send({ leads: [Object.assign({}, fact)] });
      const notices = body.children.filter(c => c.id === "eTeamFolderHeld").length;
      dismiss();
      send({ leads: [Object.assign({}, fact, { folderOwed: true, folderCopy: COPY_SHOWN })] });
      const afterDismiss = noticeText(), rowOwed = pageWords(SET.settingsPageHtml("teams", ""));
      send({ leads: [{ team: team + "x", lead: "Ada", print: "0123456789abcdef", folderHeld: true, folderOwed: true, folderCopy: COPY_SHOWN }] });
      const owedNotice = noticeText();
      send({ leads: [{ team, lead: "Ada", print: "0123456789abcdef" }] });
      const rowGone = !pageWords(SET.settingsPageHtml("teams", "")).includes(held.slice(0, 40));
      out[lang] = { row: row.includes(held) && !row.includes(owed), notice: shown === held, notices, afterDismiss: afterDismiss === null,
        rowOwed: rowOwed.includes(held) && rowOwed.includes(owed), owedNotice: owedNotice === held + " " + owed, rowGone };
    }
  } finally {
    if (send) send({ leads: [] });
    hooksMod.hooks.render = wasRender;
    storage.lsSet("eUiLang", "en");
    delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle;
  }
  out.ok = ["en", "pl"].every(l => { const o = out[l]; return o.row && o.notice && o.notices === 1 && o.afterDismiss && o.rowOwed && o.owedNotice && o.rowGone; });
  return out;
}

const esc = s => s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
const regText = rows => ["Windows Registry Editor Version 5.00", "", "[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]"]
  .concat(rows.map(([n, v]) => "\"" + esc(n) + "\"=\"" + esc(v) + "\""), [""]).join("\r\n") + "\r\n";

try {
  const A = makeDesk("held", true);
  const before = { share: listing(A.share), mirror: listing(A.mirror) };
  const desk = loadDesk(A.ud);
  const api = desk.api;

  /* fth1, moved. It said: a desk holding a folder team reads its catalog folder setting (the share) as a plain folder, not the team's
     mirror. It now says: it reads the local copy kept for the team, as a plain folder, where the share differs from it; the share is
     read only where no copy is kept (fth22). */
  let folder = "";
  try { folder = api.catalogFolder(); } catch (e) { folder = "threw " + e.message; }
  check(path.resolve(folder) === path.resolve(A.mirror),
    "fth1 a desk holding a folder team reads the local copy kept for the team as its catalog folder, a plain folder, where the share differs: " + folder);

  /* fth2: no write goes to a team's place. */
  let writes = null;
  try { writes = api.teamWriteHere(); } catch (e) { writes = "threw " + e.message; }
  check(writes === false, "fth2 no write of this desk is a team's write while it holds only a folder team: teamWriteHere " + writes);

  /* fth3: the team file in the folder is not heeded: a newer file naming another desk changes no roster this desk keeps. */
  for (const root of [A.share, A.mirror]) fs.writeFileSync(path.join(root, "etiuda-team.json"), JSON.stringify(teamFile(2, [{ desk: { id: OTHER_DESK } }])), "utf8");
  const listedTeam = { share: listing(A.share), mirror: listing(A.mirror) };
  let heeded = "";
  try { api.heedTeam(); heeded = JSON.stringify(api.teamRoster[TEAM] || null); } catch (e) { heeded = "threw " + e.message; }
  check(heeded === "null", "fth3 the folder's team file is not heeded as the team's: the roster kept for it is " + heeded);

  /* fth4, fth5: the row says the team is held through a folder, and that the outbox still owes the folder. */
  let rows = null;
  try { rows = (await desk.ask("etiuda:team-join", "leads")).leads; } catch (e) { rows = [{ error: e.message }]; }
  const row = Array.isArray(rows) ? rows.filter(r => r && r.team === TEAM)[0] : null;
  check(!!row && row.folderHeld === true, "fth4 the team's row says it is held through a shared folder: " + JSON.stringify(row && { folderHeld: row.folderHeld, folder: row.folder }));
  check(!!row && row.folderOwed === true, "fth5 the team's row says the mirror's outbox still owes the folder: " + JSON.stringify(row && { folderOwed: row.folderOwed }));
  check(!!row && row.folderCopy === A.mirror, "fth26 the owed row names the folder the unsent files stay in, the local copy: " + JSON.stringify(row && { folderCopy: row.folderCopy }));

  /* fth29 (new, moved from folder-mirror's 42g, retired with that leg, whose proof of plant:open-catalog-shared it was): Open folder opens the folder the owed line names, the
     local copy: it is where the unsent files are found, and the share (the setting) is not what it opens while a copy is kept. */
  let openedAt = null;
  try { await desk.ask("etiuda:open-catalog-folder"); openedAt = desk.opened[0] || null; } catch (e) { openedAt = "threw " + e.message; }
  check(!!openedAt && path.resolve(openedAt) === path.resolve(A.mirror) && !!row && row.folderCopy === A.mirror,
    "fth29 Open folder opens the local copy the owed line names, where the unsent files are, and not the share: " + JSON.stringify({ opened: openedAt, folderCopy: row && row.folderCopy }));

  /* fth6: a desk whose outbox owes nothing is told nothing of it. */
  const B = makeDesk("clear", false);
  const deskB = loadDesk(B.ud);
  let rowB = null;
  try { rowB = (await deskB.ask("etiuda:team-join", "leads")).leads.filter(r => r && r.team === TEAM)[0]; } catch (e) { rowB = { error: e.message }; }
  check(!!rowB && rowB.folderHeld === true && rowB.folderOwed !== true, "fth6 with nothing owed the row says the team is held and nothing of an outbox: "
    + JSON.stringify(rowB && { folderHeld: rowB.folderHeld, folderOwed: rowB.folderOwed }));

  /* fth7: machine policy's TeamFolder is not read; LeadKey alone is. */
  const HEX = "ab".repeat(32);
  let both = null, alone = null;
  try {
    both = api.joinPolicyFacts(regText([["TeamFolder", "D:\\Teams\\Ada"], ["LeadKey", HEX]]));
    alone = api.joinPolicyFacts(regText([["TeamFolder", "D:\\Teams\\Ada"]]));
  } catch (e) { both = { error: e.message }; }
  check(!!both && !both.folder && both.lead === HEX && both.bad.length === 0 && !!alone && !alone.folder && alone.lead === "" && alone.bad.length === 0,
    "fth7 a TeamFolder in machine policy is not read, and LeadKey stands alone: " + JSON.stringify({ both, alone: alone && { folder: alone.folder, lead: alone.lead, bad: alone.bad } }));

  /* fth14: no team file in the held team's folder is read as the team's, though its pin is kept: no lead is read from it. */
  let lead = null;
  try { lead = api.pinnedLead(); } catch (e) { lead = { threw: e.message }; }
  check(lead === null, "fth14 the held team's file in its folder names no lead this desk joined under, its pin kept: " + JSON.stringify(lead));

  /* fth15 and fth17 RETIRED with the shared write (no desk writes into a catalog file on a share; tests/shared-file-gone.mjs): fth15 said a shared
     write into a folder holding a team's file is refused and writes nothing there, a desk that pins no team included, and fth17 lifted
     plant:shared-team-folder to show it. No desk writes a catalog into a share now, so no folder is written for it. */

  /* fth18: this desk's own removal leaves a file in the held team's folder, and in its local copy, where it is (the copy added by the mend). */
  const ownNote = path.join(A.share, "desks", OTHER_DESK, "note.txt");
  try { api.unlinkOwn(ownNote); } catch { /* a refusal that throws is not a removal */ }
  const copyNote = path.join(A.mirror, "desks", OTHER_DESK, "note.txt");
  try { api.unlinkOwn(copyNote); } catch { /* a refusal that throws is not a removal */ }
  check(fs.existsSync(ownNote) && fs.existsSync(copyNote), "fth18 this desk's own removal takes nothing out of the held team's folder or its local copy: "
    + (fs.existsSync(ownNote) ? "share kept" : "share removed") + ", " + (fs.existsSync(copyNote) ? "copy kept" : "copy removed"));

  /* fth8: the boot's look at the folder starts nothing that writes: share and mirror as they were. */
  try { await api.armFolder(null); } catch { /* the look's own refusal is not this check's */ }
  await new Promise(r => setTimeout(r, 300));
  const after = { share: listing(A.share), mirror: listing(A.mirror) };
  check(JSON.stringify(after) === JSON.stringify(listedTeam) && before.mirror.some(l => l.indexOf(".outbox.json ") === 0)
    && after.mirror.some(l => l.indexOf(".outbox.json ") === 0),
    "fth8 nothing under the share or the mirror is removed or changed, the outbox included: share " + after.share.length + " files, mirror "
    + after.mirror.length + (JSON.stringify(after) === JSON.stringify(listedTeam) ? ", the same" : ", changed: " + JSON.stringify({ before: listedTeam, after })));


  /* fth20: the desk opens what the local copy holds and the share does not, and is not shown the share's own: the copy is what it last had. */
  const inCopy = api.catalogFileNamed("owed-notes.ec"), inShare = api.catalogFileNamed("share-news.ec");
  check(!!inCopy && path.resolve(inCopy) === path.resolve(path.join(A.mirror, "owed-notes.ec")) && inShare === null,
    "fth20 a file only the local copy holds opens, and one only the share holds is not read: " + JSON.stringify({ inCopy, inShare }));

  /* fth21: the share out of reach, the desk still opens its catalog from the copy. */
  const G = makeDesk("away", true);
  fs.renameSync(G.share, G.share + "-offline");
  const away = loadDesk(G.ud).api;
  const awayAt = away.catalogFileNamed("wick-board.ec");
  check(!fs.existsSync(G.share) && path.resolve(away.catalogFolder()) === path.resolve(G.mirror) && !!awayAt && path.resolve(awayAt) === path.resolve(path.join(G.mirror, "wick-board.ec")),
    "fth21 with the share out of reach the desk opens its catalog from the local copy: " + JSON.stringify({ folder: away.catalogFolder(), file: awayAt }));

  /* fth22: no copy kept, the share is the catalog folder, as before the mend. */
  const N = makeDesk("nocopy", false);
  fs.rmSync(N.mirror, { recursive: true, force: true });
  const nocopy = loadDesk(N.ud).api;
  check(path.resolve(nocopy.catalogFolder()) === path.resolve(N.share) && path.resolve(nocopy.catalogFileNamed("share-news.ec") || "") === path.resolve(path.join(N.share, "share-news.ec")),
    "fth22 where no local copy is kept, the share is read as the plain catalog folder: " + nocopy.catalogFolder());

  /* fth23: a sealed catalog of the held team, the desk's own file for it, across a restart. The sealed edition opens from the copy under
     the key kept; the desk's own file for it is held and written nowhere (never in the clear: the card's words are in no file of the share
     or the copy), and a restart does the same: the edit is the page's layer's, sent again at every start, and nothing is lost on disk. */
  const S = makeDesk("sealed", false, true);
  const needle = "Edited by the desk.";
  const edited = base => { const d = JSON.parse(base); d.cards[0].body.en = needle; return d; };
  const sealedRun = async (d, first) => {
    const text = d.api.readCatalog();
    if (!text) return { text: text, w: null, first: first };
    const me = await d.ask("etiuda:branch-identity", true);
    const doc = JSON.parse(text);
    const hex8 = crypto.createHash("sha256").update(String(doc.id)).digest("hex").slice(0, 8);
    delete doc.sig;
    const grown = Object.assign(edited(JSON.stringify(doc)), { id: me.id + "-" + hex8, rev: 1,
      grew: { id: doc.id, rev: 1, sha: "sha256:" + crypto.createHash("sha256").update(Buffer.from(V2.v2SignedBytes(JSON.parse(text)))).digest("hex") },
      desk: { id: me.id, key: me.key, box: me.box } });
    const w = await d.ask("etiuda:branch-write", "wick-board-" + hex8, JSON.stringify(grown));
    return { text: text, w: w, first: first };
  };
  const beforeS = { share: listing(S.share), mirror: listing(S.mirror) };
  const d1 = loadDesk(S.ud), r1 = await sealedRun(d1, true);
  const d2 = loadDesk(S.ud), r2 = await sealedRun(d2, false);
  const afterS = { share: listing(S.share), mirror: listing(S.mirror) };
  const leaked = [S.share, S.mirror].some(root => walkText(root).some(t => t.indexOf(needle) >= 0));
  check(r1.text && r1.text.indexOf("Wick Board") >= 0 && r2.text === r1.text && !!r1.w && r1.w.ok === false && r1.w.held === true && !!r2.w && r2.w.held === true
    && JSON.stringify(afterS.mirror.filter(l => l.indexOf("desks/") !== 0)) === JSON.stringify(beforeS.mirror.filter(l => l.indexOf("desks/") !== 0))
    && JSON.stringify(afterS.share) === JSON.stringify(beforeS.share) && !leaked,
    "fth23 a sealed catalog of the held team opens from the local copy under the key kept, before and after a restart, and the desk's own file for it is held and written"
    + " in the clear nowhere: " + JSON.stringify({ w1: r1.w, w2: r2.w, opened: !!r1.text, same: r2.text === r1.text, leaked }));

  /* fth25: the store's sync leaves the copy out as the team's, as it leaves the share. */
  const syncRoot = api.storeSyncFolder();
  check(syncRoot === "", "fth25 the store's sync takes no catalog from, and puts none into, the local copy the desk reads for the held team: " + JSON.stringify(syncRoot));

  /* fth9: the page words the facts on the row and once in a notice, in English and Polish. */
  let page = null;
  try { page = await pageScene(); } catch (e) { page = { ok: false, error: String(e && e.stack ? e.stack.split("\n")[0] : e) }; }
  check(!!page && page.ok, "fth9 the copywriter's sentence for a held folder team, on its row in Settings and once in a notice, in English and Polish;"
    + " Dismiss holds for the run; the owed line beside it only where the outbox owes: " + JSON.stringify(page));

  /* fth10 to fth13: each deciding line, lifted alone, turns its check red. */
  const liftShell = async (tag, judge) => {
    const lines = SRC.split("\n"), at = lines.findIndex(l => l.includes("plant:" + tag));
    if (at < 0) return "plant line absent";
    lines.splice(at, 1);
    const P = makeDesk("plant-" + tag, true);
    const d = loadDesk(P.ud, lines.join("\n"));
    d.src = lines.join("\n");
    return (await judge(d, P)) ? "the check lifted" : "the check still held";
  };
  const shellPlants = [
    ["fth10", "team-file-place", async (d, P) => {
      for (const root of [P.share, P.mirror]) fs.writeFileSync(path.join(root, "etiuda-team.json"), JSON.stringify(teamFile(2, [{ desk: { id: OTHER_DESK } }])), "utf8");
      d.api.heedTeam();
      return !!d.api.teamRoster[TEAM];
    }, "fth3"],
    ["fth11", "folder-held-row", async d => { const r = (await d.ask("etiuda:team-join", "leads")).leads.filter(x => x.team === TEAM)[0]; return !r || r.folderHeld !== true; }, "fth4"],
    ["fth12", "folder-owed-row", async d => { const r = (await d.ask("etiuda:team-join", "leads")).leads.filter(x => x.team === TEAM)[0]; return !r || r.folderOwed !== true; }, "fth5"],
    ["fth16", "team-file-place", async d => d.api.pinnedLead() !== null, "fth14"],
    ["fth19", "held-folder-kept", async (d, P) => { const f = path.join(P.share, "desks", OTHER_DESK, "note.txt"); try { d.api.unlinkOwn(f); } catch { /* kept */ } return !fs.existsSync(f); }, "fth18"],
    ["fth28", "held-copy-kept", async (d, P) => { const f = path.join(P.mirror, "desks", OTHER_DESK, "note.txt"); try { d.api.unlinkOwn(f); } catch { /* kept */ } return !fs.existsSync(f); }, "fth18"],
    ["fth24", "held-local-copy", async (d, P) => path.resolve(d.api.catalogFolder()) !== path.resolve(P.mirror), "fth1"],
    ["fth27", "sync-held-copy", async (d, P) => d.api.storeSyncFolder() !== "", "fth25"],
    ["fth30", "open-catalog-shared", async (d, P) => {
      try { await d.ask("etiuda:open-catalog-folder"); } catch { /* the lifted line throws: nothing is opened */ }
      return d.opened.length === 0 || path.resolve(d.opened[0]) !== path.resolve(P.mirror);
    }, "fth29"]];
  for (const [id, tag, judge, of] of shellPlants) {
    if (PLANTS_OFF) { skip(id + " lifting plant:" + tag + " turns " + of + " red"); continue; }
    let detail = "";
    try { detail = await liftShell(tag, judge); } catch (e) { detail = "threw " + e.message; }
    check(detail === "the check lifted", id + " lifting plant:" + tag + " in a copy of shell/main.js turns " + of + " red: " + detail);
  }
  if (PLANTS_OFF) skip("fth13 lifting plant:folder-held-note and plant:folder-held-notice turns fth9 red");
  else {
    const turned = [];
    for (const [name, tag] of [["settings.js", "folder-held-note"], ["team-join.js", "folder-held-notice"]]) {
      let t = false;
      try {
        const mod = await plantedMod(name, tag);
        if (mod) {
          const r = await pageScene(name === "team-join.js" ? mod : null, name === "settings.js" ? mod : null);
          t = name === "settings.js" ? !(r.en && r.en.row && r.pl && r.pl.row) : !(r.en && r.en.notice && r.pl && r.pl.notice);
        }
      } catch { t = true; }
      turned.push(tag + "=" + t);
    }
    check(turned.every(s => s.endsWith("=true")), "fth13 lifting plant:folder-held-note in settings.js or plant:folder-held-notice in team-join.js turns fth9 red: " + turned.join(", "));
  }
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED + " (reg stand " + (regStand.held() ? "held" : "not held") + ")");
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
