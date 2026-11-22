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
const EXPECTED = 13;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const LAB = createLab("etiuda-folder-team-held-");
const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const EXPOSE = ["catalogFolder", "teamWriteHere", "heedTeam", "leadsView", "joinPolicyFacts", "armFolder", "teamRoster", "teamEpochSeen"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

function loadDesk(ud, src) {
  const said = [], on = {}, invoke = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
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
  return { api, ask, said };
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

/* A desk holding the folder team: the share is its catalog folder setting, the mirror its local copy, the outbox owing one file. */
function makeDesk(name, owed) {
  const ud = path.join(LAB, name, "ud"), share = path.join(LAB, name, "share"), mirror = path.join(ud, "folder-mirror", TEAM);
  for (const d of [ud, share, mirror, path.join(share, "desks", OTHER_DESK), path.join(mirror, "desks", OTHER_DESK)]) fs.mkdirSync(d, { recursive: true });
  for (const root of [share, mirror]) {
    fs.writeFileSync(path.join(root, "etiuda-team.json"), JSON.stringify(teamFile(1, [])), "utf8");
    fs.writeFileSync(path.join(root, "wick-board.ec"), JSON.stringify(edition()), "utf8");
    fs.writeFileSync(path.join(root, "desks", OTHER_DESK, "note.txt"), "a desk's own file", "utf8");
  }
  if (owed) fs.writeFileSync(path.join(mirror, ".outbox.json"), JSON.stringify({ kind: "etiuda-folder-outbox", v: 1,
    owe: { ["desks/" + OTHER_DESK + "/note.txt"]: { owe: true, sha: "0".repeat(64) } }, floors: {} }), "utf8");
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({
    kind: "etiuda-desk", schema: 1,
    keys: { eCatalogFolder: share, eUiLang: "en" },
    teamPins: { [TEAM]: LEAD },
    teamKeys: { [TEAM]: { "1": "kept" } },
    teamEpochSeen: { [TEAM]: 1 },
    teamShown: { [TEAM]: { lead: "Ada", folder: share } }
  }), "utf8");
  return { ud, share, mirror };
}

/* ---- the page: the row's facts worded on the team's row in Settings and once in a notice (as tests/relay-desk-follow.mjs ks26) */
const HELD_EN = "Ada's team worked through a shared folder, which Etiuda no longer follows: its catalog stays on this computer as it is, and a new invitation from the team's lead brings the team back.";
const HELD_PL = "Zespół osoby Ada korzysta ze wspólnego folderu, którego Etiuda już nie obsługuje: katalog tego zespołu zostaje na tym komputerze bez zmian, a nowe zaproszenie od lidera zespołu przywróci zespół.";
const OWED_EN = "What this desk had not yet sent to the shared folder stays on this computer, unsent.";
const OWED_PL = "To, czego to stanowisko nie zdążyło wysłać do wspólnego folderu, zostaje na tym komputerze, niewysłane.";
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
      send({ leads: [Object.assign({}, fact, { folderOwed: true })] });
      const afterDismiss = noticeText(), rowOwed = pageWords(SET.settingsPageHtml("teams", ""));
      send({ leads: [{ team: team + "x", lead: "Ada", print: "0123456789abcdef", folderHeld: true, folderOwed: true }] });
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

  /* fth1: the catalog folder is the person's own setting, read as a plain folder; never the folder team's mirror. */
  let folder = "";
  try { folder = api.catalogFolder(); } catch (e) { folder = "threw " + e.message; }
  check(path.resolve(folder) === path.resolve(A.share),
    "fth1 a desk holding a folder team reads its catalog folder setting as a plain folder, not the team's mirror: " + folder);

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
  check(!!both && both.folder === "" && both.lead === HEX && both.bad.length === 0 && !!alone && alone.folder === "" && alone.lead === "" && alone.bad.length === 0,
    "fth7 a TeamFolder in machine policy is not read, and LeadKey stands alone: " + JSON.stringify({ both, alone: alone && { folder: alone.folder, lead: alone.lead, bad: alone.bad } }));

  /* fth8: the boot's look at the folder starts nothing that writes: share and mirror as they were. */
  try { await api.armFolder(null); } catch { /* the look's own refusal is not this check's */ }
  await new Promise(r => setTimeout(r, 300));
  const after = { share: listing(A.share), mirror: listing(A.mirror) };
  check(JSON.stringify(after) === JSON.stringify(listedTeam) && before.mirror.some(l => l.indexOf(".outbox.json ") === 0)
    && after.mirror.some(l => l.indexOf(".outbox.json ") === 0),
    "fth8 nothing under the share or the mirror is removed or changed, the outbox included: share " + after.share.length + " files, mirror "
    + after.mirror.length + (JSON.stringify(after) === JSON.stringify(listedTeam) ? ", the same" : ", changed: " + JSON.stringify({ before: listedTeam, after })));

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
    return (await judge(d, P)) ? "the check lifted" : "the check still held";
  };
  const shellPlants = [
    ["fth10", "heed-relay-only", async (d, P) => {
      for (const root of [P.share, P.mirror]) fs.writeFileSync(path.join(root, "etiuda-team.json"), JSON.stringify(teamFile(2, [{ desk: { id: OTHER_DESK } }])), "utf8");
      d.api.heedTeam();
      return !!d.api.teamRoster[TEAM];
    }, "fth3"],
    ["fth11", "folder-held-row", async d => { const r = (await d.ask("etiuda:team-join", "leads")).leads.filter(x => x.team === TEAM)[0]; return !r || r.folderHeld !== true; }, "fth4"],
    ["fth12", "folder-owed-row", async d => { const r = (await d.ask("etiuda:team-join", "leads")).leads.filter(x => x.team === TEAM)[0]; return !r || r.folderOwed !== true; }, "fth5"]];
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
