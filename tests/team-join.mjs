/* A desk asks to join the team a sealed catalog belongs to, driven in bare node: the real shell/main.js under stubbed
 * electron over a shared catalog folder, the lead played by the same pure declarations Studio slices from that file.
 * Board 834, step 12, slice 5.
 *
 *     node tests/team-join.mjs        exit code is the number of failed checks, capped at 63
 *
 * COMMIT THEN REVEAL. The request commits to the desk's nonce; the lead's opening names a nonce of its own; the desk
 * reveals only against the first opening it reads for its commitment, and the code covers both nonces, both desk keys
 * and the lead's key. So the oracle for a code is the pure joinCode over what each side holds, never the shell's word.
 *
 * The shell runs from a copy of shell/ in a temp folder, so the folder above it holds no catalog of the checkout's.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
const nodeRequire = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 22;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-team-join-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(APP, "shell", "main.js"), "utf8");
const EXPOSE = ["sealCatalog", "wrapTeamKey", "joinCommit", "joinCode", "joinGenuine", "joinOpening", "joinSignedBytes",
  "branchSignedBytes", "deskFileGenuine", "readCatalog", "catalogChanged", "isCatalogName", "JOINS_NAME"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

/* One desk over its own user-data folder, the shell evaluated afresh; the safeStorage stand-in is reversible. */
function loadDesk(ud) {
  const said = [], invoke = {};
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: noop };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
    decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
  };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
           whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: noop, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert, dialog: inert, net: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" }, safeStorage,
  };
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.join(", ") + " };")(n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  /* A window that only listens: what the shell sends it, by channel. */
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (ch, ...a) => sent.push([ch].concat(a)), once: noop, on: noop } };
  return { api, ask, said, ud, envelope, win, sent, join: (op, file, name) => ask("etiuda:team-join", op, file, name) };
}
function newDesk(name, folder) {
  const ud = path.join(LAB, name);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"),
    JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder, eUiLang: "en" } }), "utf8");
  return loadDesk(ud);
}
const folder = name => { const f = path.join(LAB, name); fs.mkdirSync(f, { recursive: true }); return f; };

try {
  const V2 = await import(MOD("catalog-v2.js"));
  const SHARE = folder("share");
  const D1 = newDesk("one", SHARE);
  const P = D1.api;

  /* ---- the lead, a catalog invented from nothing, and the team ------------------------------------------------- */
  const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const lead = crypto.generateKeyPairSync("ed25519"), forger = crypto.generateKeyPairSync("ed25519");
  const LEAD = { keyId: "lamp-lead", public: pubHex(lead.publicKey) }, FORGED = { keyId: "lamp-lead", public: pubHex(forger.publicKey) };
  const sign = (doc, key, keyId) => {
    const out = JSON.parse(JSON.stringify(doc));
    delete out.sig;
    out.sig = { alg: "Ed25519", keyId: keyId };
    out.sig.value = crypto.sign(null, Buffer.from(V2.v2SignedBytes(out)), key).toString("hex");
    return out;
  };
  const A1 = JSON.stringify(sign({ format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1, name: "Lamp Shop", date: "2026-02-01",
    langs: [{ code: "en", label: "EN" }], tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [{ id: "c-warm", shelf: "t-op", bodyShape: "plain", title: { en: "Warm opening" }, body: { en: "Good day." } }] },
    lead.privateKey, LEAD.keyId), null, 1) + "\n";
  const TEAM = "t-" + crypto.randomBytes(8).toString("hex"), K1 = crypto.randomBytes(32);
  const put = (dir, name, t) => fs.writeFileSync(path.join(dir, name), typeof t === "string" ? t : JSON.stringify(t), "utf8");
  const entry = (who, key, epoch) => ({ desk: { id: who.id, key: who.key, box: who.box }, wrap: P.wrapTeamKey(key, who.box, TEAM, epoch, who.id) });
  const teamFile = (roster, o) => sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"],
    lead: (o && o.lead) || LEAD, sealed: true, exportsSealed: false, epoch: 1, roster: roster },
    (o && o.signer) || lead.privateKey, LEAD.keyId);
  const joins = (open, o) => ({ format: 1, kind: "etiuda-team-joins", team: TEAM, lead: (o && o.lead) || LEAD, open: open });
  const nonce = () => crypto.randomBytes(32).toString("hex");
  const reqOf = me => path.join(SHARE, "desks", me.id, "join.json");
  const request = me => { try { return JSON.parse(fs.readFileSync(reqOf(me), "utf8")); } catch { return null; } };
  const kept = D => D.envelope().teamJoin || null;

  /* ---- the pure half: the code, the commitment, the request's signature, the opening ------------------------- */
  const h = () => nonce(), base = [TEAM, h(), h(), h(), h(), h()];
  const c0 = P.joinCode(...base);
  const moved = base.map((_, i) => P.joinCode(...base.map((v, j) => (j !== i ? v : i === 0 ? "t-" + crypto.randomBytes(8).toString("hex") : h()))));
  check(/^[0-9]{6}$/.test(c0) && P.joinCode(...base) === c0 && moved.every(c => /^[0-9]{6}$/.test(c) && c !== c0),
    "15a the code is six digits, the same from the same parts, and another for each of the six parts changed alone"
    + " (team, key, box, lead, the desk's nonce, the lead's): " + moved.filter(c => c !== c0).length + " of 6 differ");
  check(P.joinCode("t-xyz", ...base.slice(1)) === "" && P.joinCode(TEAM, "ab", ...base.slice(2)) === ""
    && P.joinCode(TEAM, ...base.slice(1, 5), "") === "",
    "15b a malformed team, key or nonce gives no code at all");
  const [n1, n2] = [h(), h()];
  check(P.joinCommit(TEAM, base[1], base[2], n1) === P.joinCommit(TEAM, base[1], base[2], n1)
    && P.joinCommit(TEAM, base[1], base[2], n1) !== P.joinCommit(TEAM, base[1], base[2], n2)
    && P.joinCommit(TEAM, base[1], base[2], n1) !== P.joinCommit(TEAM, base[1], h(), n1),
    "15c the commitment binds the nonce and the box: another of either commits to something else");

  /* ---- outside the team ---------------------------------------------------------------------------------------- */
  const me1 = await D1.ask("etiuda:branch-identity", true);
  const D2 = newDesk("two", SHARE), me2 = await D2.ask("etiuda:branch-identity", true);
  put(SHARE, "etiuda-team.json", teamFile([entry(me2, K1, 1)]));
  put(SHARE, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  put(SHARE, "plain.ec", A1);
  const out = await D1.join("state");
  check(out.sealed && out.sealed.file === "lamps.ec" && out.sealed.team === TEAM && out.join === null && !fs.existsSync(path.join(SHARE, "desks"))
    && !kept(D1),
    "15d a desk outside the team says which sealed catalog it cannot open and for which team, and writes nothing to the share"
    + " until the agent asks: sealed " + JSON.stringify(out.sealed));
  const inside = await D2.join("state");
  check(inside.sealed === null, "15e THE CONTROL: a desk on the roster finds nothing sealed against it");
  const notSealed = await D1.join("ask", "plain.ec", "Max G.");
  check(notSealed.join === null && !fs.existsSync(path.join(SHARE, "desks")) && !kept(D1),
    "15f asked to join over a catalog that is not sealed against it, the desk writes nothing");
  fs.unlinkSync(path.join(SHARE, "plain.ec"));

  /* ---- the request ----------------------------------------------------------------------------------------------- */
  const asked = await D1.join("ask", "lamps.ec", "Max G.");
  const r1 = request(me1), j1 = kept(D1), bytes1 = fs.readFileSync(reqOf(me1), "utf8");
  check(asked.join && asked.join.state === "waiting" && asked.join.code === "" && r1 && P.joinGenuine(r1, me1.id)
    && r1.team === TEAM && r1.desk.key === me1.key && r1.desk.box === me1.box && r1.desk.name === "Max G." && r1.reveal === undefined
    && j1 && r1.commit === P.joinCommit(TEAM, me1.key, me1.box, j1.nonce) && bytes1.indexOf(j1.nonce) < 0,
    "15g the agent's press writes desks/<id>/join.json, genuine under the join prefix, committing to a nonce the share does not"
    + " hold; the desk waits with no code");
  const asBranch = JSON.parse(JSON.stringify(r1));
  asBranch.sig.value = crypto.sign(null, P.branchSignedBytes(asBranch), crypto.generateKeyPairSync("ed25519").privateKey).toString("hex");
  check(!P.deskFileGenuine(r1, me1.id) && !P.joinGenuine(asBranch, me1.id) && !P.joinGenuine(r1, me2.id)
    && !P.joinGenuine(Object.assign({}, r1, { team: "t-" + "0".repeat(16) }), me1.id),
    "15h the join prefix keeps its own domain: a request is no desk file, a branch signature is no request, and another folder"
    + " or a changed team is not genuine");

  /* ---- the lead opens: the code appears without a reload, and only that opening is answered -------------------- */
  check(P.isCatalogName(P.JOINS_NAME), "15i the watch hears the lead's file of openings land beside the team file");
  const L1 = nonce();
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }]));
  D1.sent.length = 0;
  P.catalogChanged(D1.win);
  const pushed = D1.sent.filter(s => s[0] === "etiuda:team-join").map(s => s[1]).pop();
  const want = P.joinCode(TEAM, me1.key, me1.box, LEAD.public, j1.nonce, L1);
  const r1b = request(me1);
  check(pushed && pushed.join && pushed.join.state === "code" && pushed.join.code === want && /^[0-9]{6}$/.test(want),
    "15j the opening lands and the watch sends the page the code at once, the lead's own reckoning of it over what each side"
    + " holds: " + (pushed && pushed.join ? pushed.join.state : "nothing sent"));
  check(r1b && P.joinGenuine(r1b, me1.id) && r1b.reveal === j1.nonce && r1b.opened.nonce === L1 && r1b.opened.lead.public === LEAD.public
    && P.joinCode(TEAM, r1b.desk.key, r1b.desk.box, r1b.opened.lead.public, r1b.reveal, r1b.opened.nonce) === want,
    "15k the request now reveals its nonce against that opening, which it names, so the lead reckons the same code from the file");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: nonce() }]));
  const later = await D1.join("state");
  check(later.join.code === want && request(me1).opened.nonce === L1,
    "15l a second opening for the same request is never answered: the code and the revealed opening stand");

  /* ---- a request the lead has not opened waits; a refusal is said ------------------------------------------------ */
  const D3 = newDesk("three", SHARE), me3 = await D3.ask("etiuda:branch-identity", true);
  await D3.join("ask", "lamps.ec", "Ada");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }, { desk: me3.id, commit: "0".repeat(64), nonce: nonce() }]));
  const w3 = await D3.join("state");
  check(w3.join.state === "waiting" && request(me3).reveal === undefined,
    "15m an opening that names another commitment opens nothing: the desk waits and reveals nothing");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me1.id, commit: r1.commit, nonce: L1 }, { desk: me3.id, commit: request(me3).commit, refused: true }]));
  check((await D3.join("state")).join.state === "refused", "15n the lead's refusal reaches the desk as refused");
  const gone = await D3.join("cancel");
  check(gone.join === null && !fs.existsSync(reqOf(me3)) && !kept(D3) && gone.sealed && gone.sealed.file === "lamps.ec",
    "15o cancelling takes the request off the share and out of the envelope, and the sealed catalog is still said");

  /* ---- the envelope keeps the request across a restart ------------------------------------------------------------ */
  const D1r = loadDesk(D1.ud);
  const again = await D1r.join("state");
  check(again.join && again.join.code === want && again.join.state === "code", "15p a restarted desk shows the same code from its envelope");

  /* ---- admission: the lead's team file wraps the key for this desk ------------------------------------------------ */
  put(SHARE, "etiuda-team.json", teamFile([entry(me2, K1, 1), entry(me1, K1, 1)]));
  const inNow = await D1r.join("state");
  check(inNow.joined && inNow.joined.team === TEAM && inNow.joined.file === "lamps.ec" && inNow.join === null && inNow.sealed === null
    && !fs.existsSync(reqOf(me1)) && !kept(D1r) && D1r.api.readCatalog() === A1.trim(),
    "15q admitted, the desk says it joined, takes its request off the share, and opens the catalog");

  /* ---- the lead a desk compared codes with is the one its first admission must carry ---------------------------- */
  const D4 = newDesk("four", SHARE), me4 = await D4.ask("etiuda:branch-identity", true);
  await D4.join("ask", "lamps.ec", "Ola");
  const r4 = request(me4);
  put(SHARE, P.JOINS_NAME, joins([{ desk: me4.id, commit: r4.commit, nonce: nonce() }]));
  await D4.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me4, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const viaForger = await D4.join("state");
  check(viaForger.joined === null && !D4.envelope().teamPins && !D4.envelope().teamKeys && D4.api.readCatalog() === null
    && D4.said.filter(l => /lead this desk asked to join/.test(l)).length === 1,
    "15r a first admission signed by a key other than the lead whose opening the desk revealed against pins nothing and opens"
    + " nothing, and the log says so once");
  put(SHARE, "etiuda-team.json", teamFile([entry(me4, K1, 1)]));
  const viaLead = await D4.join("state");
  check(viaLead.joined && JSON.stringify(D4.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }),
    "15s THE CONTROL: the same admission under the lead it compared codes with pins that lead and joins");

  /* ---- before the answer, no first admission at all: the forger's file lands after the request is written -------- */
  const pinnedNothing = D => !D.envelope().teamPins && !D.envelope().teamKeys && D.api.readCatalog() === null;
  const D5 = newDesk("five", SHARE), me5 = await D5.ask("etiuda:branch-identity", true);
  await D5.join("ask", "lamps.ec", "Ewa");
  put(SHARE, "etiuda-team.json", teamFile([entry(me5, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const waitForged = await D5.join("state");
  check(waitForged.joined === null && waitForged.join && waitForged.join.state === "waiting" && pinnedNothing(D5)
    && !D5.said.some(l => /lead this desk asked to join/.test(l)),
    "15t while the request waits on the lead's answer, a team file wrapping the key for this desk under any lead pins nothing,"
    + " opens nothing, is not said as joined, and the log names no lead the desk has not yet been told");
  const D6 = newDesk("six", SHARE), me6 = await D6.ask("etiuda:branch-identity", true);
  await D6.join("ask", "lamps.ec", "Iga");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me6.id, commit: request(me6).commit, refused: true }]));
  const refusedFirst = await D6.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me6, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const refusedForged = await D6.join("state");
  check(refusedFirst.join && refusedFirst.join.state === "refused" && refusedForged.joined === null && refusedForged.join
    && refusedForged.join.state === "refused" && pinnedNothing(D6),
    "15u after the lead refused, a team file wrapping the key for this desk under any lead pins nothing, opens nothing and the"
    + " desk still reads refused");
  put(SHARE, "etiuda-team.json", teamFile([entry(me6, K1, 1)]));
  const refusedLead = await D6.join("state");
  const dropped = await D6.join("cancel");
  check(refusedLead.join && refusedLead.join.state === "refused" && dropped.join === null && dropped.sealed === null
    && JSON.stringify(D6.envelope().teamPins) === JSON.stringify({ [TEAM]: LEAD }) && D6.api.readCatalog() === A1.trim(),
    "15v the lead's own admission read while the request stands refused waits too, and the cancel alone, the team file"
    + " unchanged since, has it read again and the catalog open");
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
