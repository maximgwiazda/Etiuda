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
const EXPECTED = 48;

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
  "branchSignedBytes", "deskFileGenuine", "readCatalog", "catalogChanged", "isCatalogName", "JOINS_NAME",
  "memberProof", "inviteIdOf", "inviteRead", "folderHost"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

/* One desk over its own user-data folder, the shell evaluated afresh; the safeStorage stand-in is reversible. */
function loadDesk(ud) {
  const said = [], invoke = {};
  // Every way the shell can log is kept, so a leg can say what reached the log and what did not.
  const quiet = { log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: s => said.push("WARN " + String(s)),
    info: s => said.push("INFO " + String(s)), debug: s => said.push("DEBUG " + String(s)) };
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
  process.env.XDG_CURRENT_DESKTOP = "GNOME"; /* so the shell's Linux keyring switch (tests/shell-office.mjs 14) stays out, on any machine */
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console",
    SRC + "\nreturn { " + EXPOSE.join(", ") + " };")(n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const ask = (ch, ...args) => Promise.resolve(invoke[ch](eventFor(), ...args));
  const envelope = () => JSON.parse(fs.readFileSync(path.join(ud, "desk.json"), "utf8"));
  /* A window that only listens: what the shell sends it, by channel. */
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (ch, ...a) => sent.push([ch].concat(a)), once: noop, on: noop } };
  const desk = { api, ask, said, ud, envelope, win, sent, join: (op, file, name, check) => ask("etiuda:team-join", op, file, name, check) };
  DESKS.push(desk);
  return desk;
}
const DESKS = [], SECRETS = [];
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

  /* ---- the pinned lead's key, shown once to compare, and forgotten where it is not the lead's ------------------- */
  // Studio's Settings show its key as "studio-" and these 16 hex (src/sign.mjs keyIdFor): made here from the public half.
  const printOf = pub => crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16);
  const leadsOf = v => JSON.stringify((v && v.leads) || null);
  const shown = await D1r.join("state");
  const seenNow = await D1r.join("seen", TEAM);
  const seenLater = await loadDesk(D1r.ud).join("state");
  check(leadsOf(shown) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: false }])
    && leadsOf(seenNow) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: true }])
    && leadsOf(seenLater) === leadsOf(seenNow) && leadsOf(gone) === "[]",
    "15w admitted by its request, the desk names the lead it pinned by the key Studio's Settings show, not yet shown, then shown"
    + " once the agent has seen it, in a fresh run too: " + leadsOf(shown) + "; a desk that pinned nothing names none");

  const D7 = newDesk("seven", SHARE), me7 = await D7.ask("etiuda:branch-identity", true);
  put(SHARE, "etiuda-team.json", teamFile([entry(me7, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
  const tofu = await D7.join("state");
  check(leadsOf(tofu) === JSON.stringify([{ team: TEAM, print: printOf(FORGED.public), admitted: true, seen: false }])
    && FORGED.keyId === LEAD.keyId && printOf(FORGED.public) !== printOf(LEAD.public),
    "15x a first admission with no request, a forger's team file under the lead's own keyId, is named by the forger's key and"
    + " not the label it wrote, and is to be shown: " + leadsOf(tofu));

  const forgot = await D7.join("forget", TEAM);
  const after = D7.envelope(), fresh7 = loadDesk(D7.ud), still = await fresh7.join("state");
  check(leadsOf(forgot) === "[]" && !after.teamPins && !after.teamKeys && JSON.stringify(after.teamBarred) === JSON.stringify([TEAM])
    && leadsOf(still) === "[]" && D7.api.readCatalog() === null && fresh7.api.readCatalog() === null
    && still.sealed && still.sealed.team === TEAM,
    "15y forgotten, the lead's pin and every key kept under it are gone, and the same forger's file still on the share pins"
    + " nothing again, in this run or a fresh one: the catalog is shut and said sealed again, barred " + JSON.stringify(after.teamBarred));

  await fresh7.join("ask", "lamps.ec", "Zoe");
  put(SHARE, P.JOINS_NAME, joins([{ desk: me7.id, commit: (request(me7) || {}).commit, nonce: nonce() }]));
  await fresh7.join("state");
  put(SHARE, "etiuda-team.json", teamFile([entry(me7, K1, 1)]));
  const rejoined = await fresh7.join("state");
  check(rejoined.joined && leadsOf(rejoined) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: false }])
    && !fresh7.envelope().teamBarred && fresh7.api.readCatalog() === A1.trim(),
    "15z THE CONTROL: after forgetting, a request answered by the real lead admits the desk, pins that lead, lifts the bar and"
    + " shows the new key once: " + leadsOf(rejoined));

  /* ---- an invitation: paste, confirm, and a request that proves the secret without carrying it ------------------- */
  const inviteBlob = (o) => "etiuda-join:" + Buffer.from(JSON.stringify(o)).toString("base64url");
  const filesUnder = (dir) => {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      const at = path.join(dir, name);
      if (fs.statSync(at).isDirectory()) out.push(...filesUnder(at));
      else out.push(at);
    }
    return out;
  };
  const quiet = folder("quiet");
  const Du = newDesk("unc", quiet);
  const secretU = crypto.randomBytes(16).toString("hex");
  SECRETS.push(secretU);
  const lampLead = { keyId: LEAD.keyId, public: LEAD.public, name: "Lamp lead" };
  /* The four characters the agent types on the confirm, as the lead reads them from Studio: the first group of the key
     Studio's Settings print, made here from the public half. */
  const fourOf = pub => printOf(pub).slice(0, 4);
  const WIN = process.platform === "win32";
  const beforeQuiet = fs.readdirSync(quiet).slice().sort().join("|");
  const badPreview = await Du.join("read", "etiuda-join:not-valid");
  check(badPreview && badPreview.refused === "unread" && !badPreview.offer
      && fs.readdirSync(quiet).slice().sort().join("|") === beforeQuiet
      && !Du.envelope().teamJoin && !Du.envelope().teamPins,
    "15ab a malformed invitation is refused and nothing is written: " + (badPreview && badPreview.refused));
  /* A share's path is a place on Windows alone; elsewhere the same text is no place at all, and is refused. */
  const uncBlob = inviteBlob({ team: TEAM, folder: "\\\\quay-host\\catalogs\\", lead: lampLead, secret: secretU });
  const uncAt = Date.now();
  const uncPreview = await Du.join("read", uncBlob);
  const uncMs = Date.now() - uncAt;
  check((WIN ? uncPreview && uncPreview.offer && uncPreview.offer.host === "quay-host" && uncPreview.offer.lead === "Lamp lead"
        && uncPreview.offer.folder === "\\\\quay-host\\catalogs" && uncPreview.refused === undefined
      : uncPreview && uncPreview.refused === "unread" && !uncPreview.offer)
      && uncMs < 1000 && fs.readdirSync(quiet).slice().sort().join("|") === beforeQuiet,
    "15ac an invitation for a folder on another computer names that computer and the folder as Windows reaches it before anything"
    + " is opened, or is refused where that path is no place, and writes nothing: " + uncMs + "ms, "
    + (WIN ? "host " + (uncPreview && uncPreview.offer && uncPreview.offer.host) : "refused " + (uncPreview && uncPreview.refused)));
  check(r1 && r1.invite === undefined && r1.desk.kind === undefined && bytes1.indexOf('"invite"') < 0 && bytes1.indexOf('"kind": "desk"') < 0,
    "15ad a request made with no invitation is unchanged: no invite and no kind on the member");

  const yard = folder("yard");
  const Dy = newDesk("yard", folder("yard-old"));
  const mey = await Dy.ask("etiuda:branch-identity", true);
  const secretY = crypto.randomBytes(16).toString("hex");
  SECRETS.push(secretY);
  const yardBlob = inviteBlob({ team: TEAM, folder: yard, lead: lampLead, secret: secretY });
  const took = await Dy.join("invite", yardBlob, "Nia", fourOf(LEAD.public));
  const ry = JSON.parse(fs.readFileSync(path.join(yard, "desks", mey.id, "join.json"), "utf8"));
  const envY = Dy.envelope();
  check(took && took.join && took.join.state === "waiting" && ry.desk.kind === "desk" && ry.desk.name === "Nia"
      && ry.invite.id === P.inviteIdOf(secretY) && ry.invite.proof === P.memberProof(secretY, ry.commit)
      && envY.teamJoin && ry.commit === P.joinCommit(TEAM, mey.key, mey.box, envY.teamJoin.nonce)
      && envY.teamPins && envY.teamPins[TEAM].public === LEAD.public && envY.teamPins[TEAM].keyId === LEAD.keyId
      && envY.keys.eCatalogFolder === yard,
    "15ae yes pins the lead from the invitation and writes a desk request whose proof is that commitment's: "
    + (took && took.join && took.join.state));
  const yardText = filesUnder(yard).map(p => fs.readFileSync(p, "utf8")).join("\n");
  const restarted = loadDesk(Dy.ud);
  const envR = restarted.envelope();
  check(JSON.stringify(envY).indexOf(secretY) < 0 && yardText.indexOf(secretY) < 0 && JSON.stringify(envR).indexOf(secretY) < 0
      && envR.teamJoin && envR.teamJoin.invite && envR.teamJoin.invite.id === ry.invite.id
      && envR.teamJoin.invite.proof === ry.invite.proof && envR.teamJoin.invite.secret === undefined
      && envR.teamPins[TEAM].public === LEAD.public,
    "15af the secret is in nothing written to the share or the desk, and a restart still has the proof and the pin");
  const otherCommit = P.joinCommit(TEAM, mey.key, crypto.randomBytes(32).toString("hex"), envY.teamJoin.nonce);
  check(P.memberProof(crypto.randomBytes(16).toString("hex"), ry.commit) !== ry.invite.proof
      && P.memberProof(secretY, otherCommit) !== ry.invite.proof && otherCommit !== ry.commit,
    "15ag a proof made under another secret or another commitment does not match the request");

  /* ---- what an invitation may not move: a lead this desk already trusts, or one it was told does not match ------- */
  const deskWith = async (name, own, extra) => {
    const ud = path.join(LAB, name);
    fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(Object.assign({ kind: "etiuda-desk", schema: 1,
      keys: { eCatalogFolder: own, eUiLang: "en" } }, extra || {})), "utf8");
    const D = loadDesk(ud);
    await D.ask("etiuda:branch-identity", true);
    await D.join("state");
    return D;
  };
  const newSecret = () => { const s = crypto.randomBytes(16).toString("hex"); SECRETS.push(s); return s; };
  /* What trust and place a desk keeps: the pins, the kept keys, the keys already shown, the bars, the request, the folder. */
  const trustOf = D => { const e = D.envelope();
    return JSON.stringify([e.teamPins || null, e.teamKeys || null, e.teamSeen || null, e.teamBarred || null, e.teamJoin || null, e.keys.eCatalogFolder]); };
  /* Every call that could reach a path is watched for `dir` while `run` runs: which of them named it. A stat of a share
     is a connection to the computer it names, so "nothing changes" includes nothing asked there. */
  const watching = async (dir, run) => {
    const touched = [], untap = [];
    const tap = (obj, names, as) => names.forEach(n => {
      const real = obj[n];
      if (typeof real !== "function") return;
      obj[n] = function (p, ...rest) { if (String(p).indexOf(dir) >= 0) touched.push(as + n); return real.call(this, p, ...rest); };
      untap.push(() => { obj[n] = real; });
    });
    tap(fs, ["statSync", "lstatSync", "existsSync", "readdirSync", "readFileSync", "accessSync", "openSync", "mkdirSync", "writeFileSync",
      "watch", "stat", "lstat", "access", "readdir", "opendirSync"], "");
    tap(fs.promises, ["stat", "lstat", "access", "readdir", "readFile", "open", "opendir"], "promises.");
    try { await run(); await new Promise(r => setTimeout(r, 50)); }
    finally { untap.forEach(u => u()); }
    return touched;
  };
  const hostile = folder("hostile");
  const forgedLead = { keyId: FORGED.keyId, public: FORGED.public, name: "Lamp lead" };
  const Dp = await deskWith("pinned", folder("pinned-own"),
    { teamPins: { [TEAM]: LEAD }, teamSeen: [TEAM], teamKeys: { [TEAM]: { "1": Buffer.from("kept").toString("base64") } } });
  const secretP = newSecret();
  const forgedBlob = inviteBlob({ team: TEAM, folder: hostile, lead: forgedLead, secret: secretP });
  const relabelled = inviteBlob({ team: TEAM, folder: hostile, lead: { keyId: "lamp-other", public: LEAD.public, name: "Lamp lead" }, secret: secretP });
  const trustP = trustOf(Dp);
  let readP = null, takeP = null, readRelabelled = null, takeRelabelled = null;
  const touchedP = await watching(hostile, async () => {
    readP = await Dp.join("read", forgedBlob);
    takeP = await Dp.join("invite", forgedBlob, "Ola", fourOf(FORGED.public));
    readRelabelled = await Dp.join("read", relabelled);
    takeRelabelled = await Dp.join("invite", relabelled, "Ola", fourOf(LEAD.public));
  });
  const keptP = trustOf(Dp) === trustP && filesUnder(hostile).length === 0 && touchedP.length === 0;
  const sameLead = await Dp.join("read", inviteBlob({ team: TEAM, folder: hostile, lead: lampLead, secret: secretP }));
  check(readP && readP.refused === "pinned" && !readP.offer && takeP && takeP.refused === "pinned" && readRelabelled
      && readRelabelled.refused === "pinned" && takeRelabelled && takeRelabelled.refused === "pinned" && keptP
      && sameLead && !!sameLead.offer && sameLead.refused === undefined,
    "15ai an invitation for a team this desk already pins under another key, or under the same key with another keyId, is refused at"
    + " read and at yes, and nothing changes: the pin, the kept keys, the key already shown, the folder, and nothing asked or written"
    + " where it points; THE CONTROL, the lead it pins, is offered: " + (readP && readP.refused) + ", " + (takeP && takeP.refused)
    + ", touched " + JSON.stringify(touchedP));

  const Db = await deskWith("barred", folder("barred-own"), { teamBarred: [TEAM] });
  const secretB = newSecret();
  const barredBlob = inviteBlob({ team: TEAM, folder: hostile, lead: lampLead, secret: secretB });
  const trustB = trustOf(Db);
  let readB = null, takeB = null;
  const touchedB = await watching(hostile, async () => {
    readB = await Db.join("read", barredBlob);
    takeB = await Db.join("invite", barredBlob, "Ola", fourOf(LEAD.public));
  });
  check(readB && readB.refused === "barred" && !readB.offer && takeB && takeB.refused === "barred"
      && trustOf(Db) === trustB && filesUnder(hostile).length === 0 && touchedB.length === 0,
    "15aj an invitation for a team whose lead this desk was told does not match is refused at read and at yes, under any lead, and"
    + " nothing changes or is asked: the bar lifts only by an answered request: " + (readB && readB.refused) + ", " + (takeB && takeB.refused)
    + ", touched " + JSON.stringify(touchedB));

  const Ds = await deskWith("shown", folder("shown-own"), { teamSeen: [TEAM] });
  const takeS = await Ds.join("invite", inviteBlob({ team: TEAM, folder: folder("shown-yard"), lead: lampLead, secret: newSecret() }),
    "Ola", fourOf(LEAD.public));
  const envS = Ds.envelope();
  check(takeS && takeS.join && envS.teamPins && envS.teamPins[TEAM].public === LEAD.public && (envS.teamSeen || []).indexOf(TEAM) < 0
      && leadsOf(takeS) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: false, seen: false }]),
    "15ak a pin an invitation sets is a key not yet shown, so the comparison after admission comes, whatever the desk held: "
    + leadsOf(takeS));

  const Dc = await deskWith("four", folder("four-own"));
  const fourYard = folder("four-yard");
  const fourBlob = inviteBlob({ team: TEAM, folder: fourYard, lead: lampLead, secret: newSecret() });
  const trustC = trustOf(Dc);
  const otherFour = fourOf(FORGED.public) === fourOf(LEAD.public) ? "zzzz" : fourOf(FORGED.public);
  let noFour = null, wrongFour = null;
  const touchedC = await watching(fourYard, async () => {
    noFour = await Dc.join("invite", fourBlob, "Ola", "");
    wrongFour = await Dc.join("invite", fourBlob, "Ola", otherFour);
  });
  const keptC = trustOf(Dc) === trustC && filesUnder(fourYard).length === 0 && touchedC.length === 0;
  const rightFour = await Dc.join("invite", fourBlob, "Ola", " " + fourOf(LEAD.public).toUpperCase() + " ");
  check(noFour && noFour.refused === "check" && wrongFour && wrongFour.refused === "check" && keptC
      && rightFour && rightFour.join && rightFour.join.state === "waiting" && Dc.envelope().teamPins[TEAM].public === LEAD.public,
    "15al yes is taken only with the first four characters of the invitation's key, as the lead reads them, in either case: none,"
    + " or another key's four, change nothing and ask or write nothing: " + (noFour && noFour.refused) + ", " + (wrongFour && wrongFour.refused)
    + ", then " + (rightFour && rightFour.join && rightFour.join.state));

  const Dr = await deskWith("files", folder("files-own"));
  const underForger = folder("files-forger"), otherTeam = folder("files-other"), broken = folder("files-broken"), genuineFolder = folder("files-real");
  put(underForger, "etiuda-team.json", teamFile([], { lead: FORGED, signer: forger.privateKey }));
  put(otherTeam, "etiuda-team.json", sign({ format: 1, kind: "etiuda-team", id: "t-" + crypto.randomBytes(8).toString("hex"),
    catalogs: ["lamp-shop"], lead: LEAD, sealed: true, exportsSealed: false, epoch: 1, roster: [] }, lead.privateKey, LEAD.keyId));
  const cracked = teamFile([]);
  cracked.sig.value = (cracked.sig.value[0] === "a" ? "b" : "a") + cracked.sig.value.slice(1);
  put(broken, "etiuda-team.json", cracked);
  put(genuineFolder, "etiuda-team.json", teamFile([]));
  const trustR = trustOf(Dr);
  const foreign = [];
  for (const f of [underForger, otherTeam, broken]) {
    const r = await Dr.join("invite", inviteBlob({ team: TEAM, folder: f, lead: lampLead, secret: newSecret() }), "Ola", fourOf(LEAD.public));
    foreign.push((r && r.refused) + (fs.existsSync(path.join(f, "desks")) ? " wrote" : ""));
  }
  const keptR = trustOf(Dr) === trustR;
  const intoGenuine = await Dr.join("invite", inviteBlob({ team: TEAM, folder: genuineFolder, lead: lampLead, secret: newSecret() }),
    "Ola", fourOf(LEAD.public));
  check(foreign.every(x => x === "foreign") && keptR && intoGenuine && intoGenuine.join && intoGenuine.join.state === "waiting",
    "15am a folder whose team file is under another lead, for another team, or not whole under its lead takes no request, and the"
    + " folder is put back as it was; THE CONTROL, a team file whole under the invited lead, takes it: " + JSON.stringify(foreign));

  /* The folder the invitation names is one nothing has made. */
  const never = path.join(LAB, "never-" + crypto.randomBytes(4).toString("hex"));
  const Dn = await deskWith("untouched", folder("untouched-own"));
  const folderN = Dn.envelope().keys.eCatalogFolder;
  let readN = null;
  const touched = await watching(never, async () => {
    readN = await Dn.join("read", inviteBlob({ team: TEAM, folder: never, lead: lampLead, secret: newSecret() }));
  });
  check(readN && readN.offer && readN.offer.folder === never && touched.length === 0 && Dn.envelope().keys.eCatalogFolder === folderN,
    "15an reading an invitation states, opens and watches nothing at the folder it names, and the desk's own folder stays as it was:"
    + " touched " + JSON.stringify(touched));

  /* A folder that does not answer: here one whose parent is missing too, so the ask finds neither. */
  const silentFolder = path.join(LAB, "gone-" + crypto.randomBytes(4).toString("hex"), "team");
  const Dv = await deskWith("silent", folder("silent-own"));
  const trustV = trustOf(Dv);
  let tookV = null;
  const touchedV = await watching(silentFolder, async () => {
    tookV = await Dv.join("invite", inviteBlob({ team: TEAM, folder: silentFolder, lead: lampLead, secret: newSecret() }), "Ola", fourOf(LEAD.public));
  });
  check(tookV && tookV.refused === "silent" && trustOf(Dv) === trustV && !fs.existsSync(silentFolder)
      && touchedV.length > 0 && touchedV.every(n => n.indexOf("promises.") === 0),
    "15av at yes, a folder that does not answer is asked and nothing more: no call that could wait on it with the window behind it, the"
    + " desk's folder put back, nothing pinned or written: " + (tookV && tookV.refused) + ", touched " + JSON.stringify(touchedV));

  const Dk = await deskWith("kept", folder("kept-own"));
  const secretK = newSecret();
  await Dk.join("invite", inviteBlob({ team: TEAM, folder: folder("kept-yard"), lead: lampLead, secret: secretK }), "Ola", fourOf(LEAD.public));
  const envK = Dk.envelope();
  const hadK = !!(envK.teamJoin && envK.teamJoin.invite);
  if (hadK) envK.teamJoin.invite.secret = secretK;
  fs.writeFileSync(path.join(Dk.ud, "desk.json"), JSON.stringify(envK), "utf8");
  const viewK = await loadDesk(Dk.ud).join("state");
  check(hadK && viewK && viewK.join === null,
    "15ao a kept request whose invitation holds a secret is not read back: the desk drops the request rather than carry it");

  /* ---- the page: the engine's own team-join.js over this desk's shell ------------------------------------------- */
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.document = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const calls = [];
  let failOp = "", slowRead = false;
  /* The page over one desk's shell, every call it makes kept; a call named by failOp is refused, and a read can be slowed. */
  const hostOver = D => ({ onTeamJoin: noop, teamJoin: (op, file, name, four) => {
    calls.push([op, file, name, four]);
    if (op === failOp) return Promise.reject(new Error("the channel closed"));
    if (op === "read" && slowRead) return new Promise(r => setTimeout(() => r(D.join(op, file, name, four)), 40));
    return D.join(op, file, name, four);
  } });
  window.E_HOST = hostOver(Du);
  const HK = await import(MOD("hooks.js"));
  HK.hooks.render = noop;
  const TJ = await import(MOD("team-join.js"));
  const T = await import(MOD("ui-lang.js"));
  const pageOn = async D => { window.E_HOST = hostOver(D); TJ.wireTeamJoin(); await new Promise(r => setTimeout(r, 30)); };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const elOf = (attrs, value) => ({ value: value || "", hasAttribute: a => Object.prototype.hasOwnProperty.call(attrs, a),
    getAttribute: a => (Object.prototype.hasOwnProperty.call(attrs, a) ? attrs[a] : null) });
  const press = act => { const b = elOf({ "data-join": act }); TJ.wireTeamJoinEmpty({ querySelectorAll: () => [b] }); return Promise.resolve(b.onclick && b.onclick()); };
  const typeFour = value => { const c = elOf({ "data-join-check": "" }, value); TJ.wireTeamJoinEmpty({ querySelectorAll: () => [c] }); if (c.oninput) c.oninput(); };
  const held = () => (typeof TJ.inviteHeld === "function" ? TJ.inviteHeld() : null);
  const yesOf = html => (/<button[^>]*data-join="invite"[^>]*>/.exec(html) || [""])[0];
  const missOf = html => (/<div[^>]*data-join-miss[^>]*>/.exec(html) || [""])[0];
  const pageYard = folder("page-yard");
  const blobA = inviteBlob({ team: TEAM, folder: pageYard + path.sep, lead: lampLead, secret: newSecret() });
  let pasted = elOf({ "data-join-paste": "" }, blobA);
  document.querySelector = (sel) => sel === "[data-join-paste]" ? pasted : null;
  TJ.openJoinPaste();
  const pasteHtml = TJ.teamJoinEmptyHtml();
  await press("read");
  const confirmHtml = TJ.teamJoinEmptyHtml();
  const groups = printOf(LEAD.public).match(/.{4}/g);
  check(/<textarea /.test(pasteHtml) && confirmHtml.indexOf(pageYard) >= 0 && confirmHtml.indexOf(pageYard + path.sep) < 0
      && confirmHtml.indexOf("Lamp lead") >= 0 && /data-join-check/.test(confirmHtml) && confirmHtml.indexOf("e-join-key") < 0
      && groups.every(g => confirmHtml.indexOf(g) < 0) && / disabled/.test(yesOf(confirmHtml)),
    "15ah the confirm names the folder as the desk will use it and the lead, asks for the four characters the lead reads out, shows"
    + " no group of the key it asks about, and its yes waits for them");

  typeFour(otherFour);
  const wrongHtml = TJ.teamJoinEmptyHtml();
  const before = calls.length;
  await press("invite");
  const sentWhileShut = calls.length - before;
  typeFour(fourOf(LEAD.public).toUpperCase());
  const rightHtml = TJ.teamJoinEmptyHtml();
  check(/ disabled/.test(yesOf(wrongHtml)) && !!missOf(wrongHtml) && !/ hidden/.test(missOf(wrongHtml)) && sentWhileShut === 0
      && !!yesOf(rightHtml) && !/ disabled/.test(yesOf(rightHtml)) && / hidden/.test(missOf(rightHtml)),
    "15ap the yes opens only once the four characters typed are the first four of the invitation's key, in either case; another four"
    + " are said not to be them, and the shut yes sends nothing: sent " + sentWhileShut);
  await press("back");
  const heldAfterBack = held();

  const Dq = await deskWith("race", folder("race-own"));
  await pageOn(Dq);
  const raceB = folder("race-b");
  const blobB = inviteBlob({ team: TEAM, folder: raceB, lead: forgedLead, secret: newSecret() });
  TJ.openJoinPaste();
  const boxA = elOf({ "data-join-paste": "" }, blobA), readA = elOf({ "data-join": "read" });
  pasted = boxA;
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => [boxA, readA] });
  slowRead = true;
  const reading = Promise.resolve(readA.onclick && readA.onclick());
  boxA.value = blobB;
  if (boxA.oninput) boxA.oninput();
  await reading;
  slowRead = false;
  const raceHtml = TJ.teamJoinEmptyHtml();
  typeFour(fourOf(LEAD.public));
  await press("invite");
  const heldAfterYes = held();
  const sentYes = calls.filter(c => c[0] === "invite").pop();
  check(raceHtml.indexOf(pageYard) >= 0 && raceHtml.indexOf(raceB) < 0 && !!sentYes && sentYes[1] === blobA
      && fs.existsSync(path.join(pageYard, "desks")) && !fs.existsSync(path.join(raceB, "desks")),
    "15aq a second paste while the first is read changes nothing: the confirm shows the first, and yes sends the very text that was"
    + " read, never the box: " + (sentYes ? (sentYes[1] === blobA ? "the first" : sentYes[1] === blobB ? "the second" : "another") : "nothing"));

  const Dz = await deskWith("refused", folder("refused-own"));
  await pageOn(Dz);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, blobA);
  failOp = "read";
  await press("read");
  const afterReadFail = held(), readFailHtml = TJ.teamJoinEmptyHtml();
  failOp = "";
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, blobA);
  await press("read");
  typeFour(fourOf(LEAD.public));
  failOp = "invite";
  await press("invite");
  const afterYesFail = held(), yesFailHtml = TJ.teamJoinEmptyHtml();
  failOp = "";
  const letGo = h => !!h && h.mode === "" && h.draft === "" && h.read === "" && h.typed === "" && h.offer === null;
  check(letGo(afterReadFail) && letGo(afterYesFail) && !/<textarea /.test(readFailHtml) && !/data-join-check/.test(yesFailHtml),
    "15ar a call to the shell that fails lets the invitation go, the paste box or the confirm with it, after a read and after a yes");

  TJ.openJoinPaste();
  const boxC = elOf({ "data-join-paste": "" }, "");
  pasted = boxC;
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => [boxC] });
  boxC.value = blobA;
  if (boxC.oninput) boxC.oninput();
  await press("back");
  const heldAfterPasteBack = held();
  TJ.openJoinPaste();
  const unreadable = "etiuda-join:" + Buffer.from("{}").toString("base64url") + "x" + secretK;
  pasted = elOf({ "data-join-paste": "" }, unreadable);
  await press("read");
  const heldAfterRefusal = held(), refusedHtml = TJ.teamJoinEmptyHtml();
  await press("back");
  check(letGo(heldAfterYes) && letGo(heldAfterBack) && letGo(heldAfterPasteBack) && !!heldAfterRefusal && heldAfterRefusal.mode === "refused"
      && heldAfterRefusal.draft === "" && heldAfterRefusal.read === "" && heldAfterRefusal.offer === null && refusedHtml.indexOf(secretK) < 0,
    "15as the page lets an invitation go once it is answered: after a yes that took, after Cancel on the confirm and on the paste box,"
    + " and after a refusal, which keeps only its sentence");

  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read"
    ? { sealed: null, join: null, leads: [], offer: { folder: "\\\\quay-host\\catalogs", lead: "Lamp lead", print: printOf(LEAD.public),
      host: "quay-host", cloud: "", local: false } }
    : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, "etiuda-join:as-the-shell-read-it");
  await press("read");
  const hostHtml = TJ.teamJoinEmptyHtml();
  const hostLine = T.t("This folder is on the computer {HOST}.").split("{HOST}").join("quay-host");
  await press("back");
  check(hostHtml.indexOf("<p>" + hostLine + "</p>") >= 0,
    "15at the confirm says which computer the folder is on, in the line under its title: " + hostLine);

  window.E_HOST = hostOver(fresh7);
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const html = TJ.teamJoinEmptyHtml(), buttons = {};
  TJ.wireTeamJoinEmpty({ querySelectorAll: () => ["seen", "forget"].map(a => (buttons[a] = { getAttribute: () => a })) });
  const grouped = printOf(LEAD.public).replace(/(.{4})(?=.)/g, "$1 ");
  await buttons.seen.onclick();
  const afterPage = await fresh7.join("state");
  /* The key wears Studio's sign before its groups (team-join.js keySignHtml), and the groups are the shell's print. */
  const signed = /<div class="e-join-key"><span class="e-ksig"><span class="e-kdisc" role="img" aria-label="[^"]+"><svg[\s\S]*?<\/svg><\/span><span>([0-9a-f ]+)<\/span><\/span><\/div>/.exec(html);
  check(!!signed && signed[1] === grouped && /data-join="seen"/.test(html) && /data-join="forget"/.test(html)
    && leadsOf(afterPage) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: true, seen: true }])
    && JSON.stringify(TJ.teamLeads()) === JSON.stringify(afterPage.leads),
    "15aa the page shows the shell's key in four groups of four after Studio's sign, with the two answers, and the agent's \"it matches\" reaches"
    + " the shell as seen: " + grouped);

  /* Last, over every desk above: the log of each holds none of the secrets any invitation carried. */
  const leaked = [];
  DESKS.forEach(D => D.said.forEach(line => SECRETS.forEach(s => { if (line.indexOf(s) >= 0) leaked.push(line.slice(0, 48)); })));
  check(SECRETS.length >= 10 && leaked.length === 0,
    "15au no invitation's secret reaches the shell's log, through every read, yes and refusal above (" + SECRETS.length + " secrets, "
    + DESKS.length + " desks): leaked " + leaked.length);
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
