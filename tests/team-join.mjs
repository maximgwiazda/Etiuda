/* A desk asks to join the team a sealed catalog belongs to, driven in bare node: the real shell/main.js under stubbed
 * electron over a shared catalog folder, the lead played by the same pure declarations Studio slices from that file.
 * Board 834, step 12, slice 5.
 *
 *     node tests/team-join.mjs        exit code is the number of failed checks, capped at 63
 *
 * COMMIT THEN REVEAL. The request commits to the desk's nonce; the lead's opening names a nonce of its own; the desk
 * reveals only against the first opening it reads for its commitment, and the code covers both nonces, both desk keys
 * and the lead's key. So the oracle for a code is the pure joinCode over what each side holds, never the shell's word.
 * A reveal keeps an invitation's id, proof and kind as yes wrote them. A request with no invitation gains only the
 * opening.
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
/* Every reg call answers from a stand-in, never from this machine's registry (tests/reg-stand.cjs): until 2026-10-13
   this leg passed only because no machine policy and no proxy were set on the machine that ran it. Before the shell loads. */
/* The stand-in reads REG.policy at each reg call, and a desk's shell reads the policy once, at its first ask: so a desk
   loaded and asked while REG.policy is set keeps that policy for its run (15ay, 15az). */
const REG = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), REG);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 65;

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
  "memberProof", "inviteCode", "inviteIdOf", "inviteRead", "folderHost"];
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const eventFor = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });

/* One desk over its own user-data folder, the shell evaluated afresh, from `src` where a leg gives one; the safeStorage
   stand-in is reversible. */
function loadDesk(ud, src) {
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
    (src || SRC) + "\nreturn { " + EXPOSE.join(", ") + " };")(n => (n === "electron" ? electron : nodeRequire(n)),
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
  /* The five digits the agent types on the confirm, as the lead reads them from Studio: HMAC-SHA256 under the invitation's
     secret over the lead's 32-byte public key, its first six bytes read big-endian, modulo 100000. Made here from the
     invitation's own text, never by the shell; wrongFor is the next code round, so never the right one. */
  const secretOf = blob => JSON.parse(Buffer.from(blob.slice(12), "base64url").toString("utf8")).secret;
  const codeFor = blob => {
    const o = JSON.parse(Buffer.from(blob.slice(12), "base64url").toString("utf8"));
    const mac = crypto.createHmac("sha256", Buffer.from(o.secret, "hex")).update(Buffer.from(o.lead.public, "hex")).digest();
    return String(mac.readUIntBE(0, 6) % 100000).padStart(5, "0");
  };
  const wrongFor = blob => String((+codeFor(blob) + 1) % 100000).padStart(5, "0");
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
  const took = await Dy.join("invite", yardBlob, "Nia", codeFor(yardBlob));
  /* Read only where the yes took, so a yes refused fails here and the legs after it still run. */
  const yardFile = path.join(yard, "desks", mey.id, "join.json");
  const ry = took && took.join && fs.existsSync(yardFile) ? JSON.parse(fs.readFileSync(yardFile, "utf8")) : {};
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
  const otherCommit = P.joinCommit(TEAM, mey.key, crypto.randomBytes(32).toString("hex"), envY.teamJoin ? envY.teamJoin.nonce : "");
  const proofY = ry.invite ? ry.invite.proof : undefined;
  check(!!proofY && P.memberProof(crypto.randomBytes(16).toString("hex"), ry.commit) !== proofY
      && P.memberProof(secretY, otherCommit) !== proofY && otherCommit !== ry.commit,
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
    takeP = await Dp.join("invite", forgedBlob, "Ola", codeFor(forgedBlob));
    readRelabelled = await Dp.join("read", relabelled);
    takeRelabelled = await Dp.join("invite", relabelled, "Ola", codeFor(relabelled));
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
    takeB = await Db.join("invite", barredBlob, "Ola", codeFor(barredBlob));
  });
  check(readB && readB.refused === "barred" && !readB.offer && takeB && takeB.refused === "barred"
      && trustOf(Db) === trustB && filesUnder(hostile).length === 0 && touchedB.length === 0,
    "15aj an invitation for a team whose lead this desk was told does not match is refused at read and at yes, under any lead, and"
    + " nothing changes or is asked: the bar lifts only by an answered request: " + (readB && readB.refused) + ", " + (takeB && takeB.refused)
    + ", touched " + JSON.stringify(touchedB));

  const Ds = await deskWith("shown", folder("shown-own"), { teamSeen: [TEAM] });
  const shownBlob = inviteBlob({ team: TEAM, folder: folder("shown-yard"), lead: lampLead, secret: newSecret() });
  const takeS = await Ds.join("invite", shownBlob, "Ola", codeFor(shownBlob));
  const envS = Ds.envelope();
  check(takeS && takeS.join && envS.teamPins && envS.teamPins[TEAM].public === LEAD.public && (envS.teamSeen || []).indexOf(TEAM) < 0
      && leadsOf(takeS) === JSON.stringify([{ team: TEAM, print: printOf(LEAD.public), admitted: false, seen: false }]),
    "15ak a pin an invitation sets is a key not yet shown, so the comparison after admission comes, whatever the desk held: "
    + leadsOf(takeS));

  const Dc = await deskWith("four", folder("four-own"));
  const fourYard = folder("four-yard");
  const fourBlob = inviteBlob({ team: TEAM, folder: fourYard, lead: lampLead, secret: newSecret() });
  const trustC = trustOf(Dc);
  const otherFour = wrongFor(fourBlob);
  let noFour = null, wrongFour = null;
  const touchedC = await watching(fourYard, async () => {
    noFour = await Dc.join("invite", fourBlob, "Ola", "");
    wrongFour = await Dc.join("invite", fourBlob, "Ola", otherFour);
  });
  const keptC = trustOf(Dc) === trustC && filesUnder(fourYard).length === 0 && touchedC.length === 0;
  const rightFour = await Dc.join("invite", fourBlob, "Ola", " " + codeFor(fourBlob).slice(0, 2) + " " + codeFor(fourBlob).slice(2) + " ");
  check(noFour && noFour.refused === "check" && wrongFour && wrongFour.refused === "check" && keptC
      && rightFour && rightFour.join && rightFour.join.state === "waiting" && Dc.envelope().teamPins[TEAM].public === LEAD.public,
    "15al yes is taken only with this invitation's check code as the lead reads it, spaces aside: none, or another code, change"
    + " nothing and ask or write nothing: " + (noFour && noFour.refused) + ", " + (wrongFour && wrongFour.refused)
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
  /* Whole under the invited lead's own public key, labelled with another keyId, as a pin is compared (15ai). */
  const relabelledTeam = folder("files-relabelled");
  put(relabelledTeam, "etiuda-team.json", sign({ format: 1, kind: "etiuda-team", id: TEAM, catalogs: ["lamp-shop"],
    lead: { keyId: "lamp-other", public: LEAD.public }, sealed: true, exportsSealed: false, epoch: 1, roster: [] }, lead.privateKey, "lamp-other"));
  const trustR = trustOf(Dr);
  const foreign = [];
  for (const f of [underForger, otherTeam, broken, relabelledTeam]) {
    const b = inviteBlob({ team: TEAM, folder: f, lead: lampLead, secret: newSecret() });
    const r = await Dr.join("invite", b, "Ola", codeFor(b));
    foreign.push((r && r.refused) + (fs.existsSync(path.join(f, "desks")) ? " wrote" : ""));
  }
  const keptR = trustOf(Dr) === trustR;
  const genuineBlob = inviteBlob({ team: TEAM, folder: genuineFolder, lead: lampLead, secret: newSecret() });
  const intoGenuine = await Dr.join("invite", genuineBlob, "Ola", codeFor(genuineBlob));
  check(foreign.every(x => x === "foreign") && keptR && intoGenuine && intoGenuine.join && intoGenuine.join.state === "waiting",
    "15am a folder whose team file is under another lead, for another team, not whole under its lead, or under the lead's key with"
    + " another keyId takes no request, and the"
    + " folder is put back as it was; THE CONTROL, a team file whole under the invited lead, takes it: " + JSON.stringify(foreign));

  /* A team file the desk cannot read is taken neither for no team file nor for another team's: a folder standing where the
     file would, and a file that is not JSON. The page's sentence for it is read with the page's legs, where 15be is. */
  const De = await deskWith("unreadable", folder("unreadable-own"));
  const unreadableTeam = folder("files-unreadable"), notJsonTeam = folder("files-not-json");
  fs.mkdirSync(path.join(unreadableTeam, "etiuda-team.json"));
  put(notJsonTeam, "etiuda-team.json", "{ not a team file");
  const trustE = trustOf(De);
  const tookE = [];
  for (const f of [unreadableTeam, notJsonTeam]) {
    const b = inviteBlob({ team: TEAM, folder: f, lead: lampLead, secret: newSecret() });
    const r = await De.join("invite", b, "Ola", codeFor(b));
    tookE.push((r && (r.refused || (r.join ? r.join.state : "nothing"))) + (fs.existsSync(path.join(f, "desks")) ? " wrote" : ""));
  }
  const keptE = trustOf(De) === trustE;

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
    const silentBlob = inviteBlob({ team: TEAM, folder: silentFolder, lead: lampLead, secret: newSecret() });
    tookV = await Dv.join("invite", silentBlob, "Ola", codeFor(silentBlob));
  });
  check(tookV && tookV.refused === "silent" && trustOf(Dv) === trustV && !fs.existsSync(silentFolder)
      && touchedV.length > 0 && touchedV.every(n => n.indexOf("promises.") === 0),
    "15av at yes, a folder that does not answer is asked and nothing more: no call that could wait on it with the window behind it, the"
    + " desk's folder put back, nothing pinned or written: " + (tookV && tookV.refused) + ", touched " + JSON.stringify(touchedV));

  const Dk = await deskWith("kept", folder("kept-own"));
  const secretK = newSecret();
  const keptBlob = inviteBlob({ team: TEAM, folder: folder("kept-yard"), lead: lampLead, secret: secretK });
  await Dk.join("invite", keptBlob, "Ola", codeFor(keptBlob));
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
      && confirmHtml.indexOf("Lamp lead") >= 0 && /<input[^>]*data-join-check[^>]*maxlength="5"/.test(confirmHtml) && confirmHtml.indexOf("e-join-key") < 0
      && groups.every(g => confirmHtml.indexOf(g) < 0) && / disabled/.test(yesOf(confirmHtml))
      && !new RegExp("(^|[^0-9])" + codeFor(blobA) + "([^0-9]|$)").test(confirmHtml.replace(/<svg[\s\S]*?<\/svg>/g, "")),
    "15ah the confirm names the folder as the desk will use it and the lead, asks for the code the lead reads out, shows neither"
    + " the key nor the code, and its yes waits for it");

  typeFour(wrongFor(blobA));
  const wrongHtml = TJ.teamJoinEmptyHtml();
  const before = calls.length;
  await press("invite");
  const sentWhileShut = calls.length - before;
  typeFour(codeFor(blobA).slice(0, 4));
  const partHtml = TJ.teamJoinEmptyHtml();
  typeFour(codeFor(blobA));
  const rightHtml = TJ.teamJoinEmptyHtml();
  check(/ disabled/.test(yesOf(wrongHtml)) && !!missOf(wrongHtml) && !/ hidden/.test(missOf(wrongHtml)) && sentWhileShut === 0
      && / disabled/.test(yesOf(partHtml)) && / hidden/.test(missOf(partHtml))
      && !!yesOf(rightHtml) && !/ disabled/.test(yesOf(rightHtml)) && / hidden/.test(missOf(rightHtml)),
    "15ap the yes opens only once the code typed is this invitation's check code, all five digits; another code is said not to"
    + " match, four of the five are not yet said wrong, and the shut yes sends nothing: sent " + sentWhileShut);
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
  typeFour(codeFor(blobA));
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
  typeFour(codeFor(blobA));
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

  /* ---- the check code: a forger who never saw the real invitation cannot make it ------------------------------ */
  /* The forger's key is ground until its print opens with the same four characters as the real lead's, which beat the
     check when it was the print's first group; its own invitation carries its own secret, so its own code is right for it. */
  const realYard = folder("code-real"), forgedYard = folder("code-forged");
  const realBlob = inviteBlob({ team: TEAM, folder: realYard, lead: lampLead, secret: newSecret() });
  let groundPub = "";
  do { groundPub = crypto.randomBytes(32).toString("hex"); } while (printOf(groundPub).slice(0, 4) !== printOf(LEAD.public).slice(0, 4));
  let forgedCodeBlob = "";
  do {
    forgedCodeBlob = inviteBlob({ team: TEAM, folder: forgedYard, lead: { keyId: LEAD.keyId, public: groundPub, name: "Lamp lead" }, secret: newSecret() });
  } while (codeFor(forgedCodeBlob) === codeFor(realBlob));
  const realCode = codeFor(realBlob), forgedOwn = codeFor(forgedCodeBlob);
  const pureOk = typeof P.inviteCode === "function" && P.inviteCode(secretOf(realBlob), LEAD.public) === realCode
    && P.inviteCode(secretOf(forgedCodeBlob), groundPub) === forgedOwn && P.inviteCode("zz", LEAD.public) === "" && P.inviteCode(secretOf(realBlob), "ab") === "";
  const Dw = await deskWith("forged-code", folder("forged-code-own"));
  await pageOn(Dw);
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, forgedCodeBlob);
  await press("read");
  typeFour(realCode);
  const forgedPage = TJ.teamJoinEmptyHtml();
  await press("back");
  const trustW = trustOf(Dw);
  const forgedTakeReal = await Dw.join("invite", forgedCodeBlob, "Ola", realCode);
  const forgedTakePrint = await Dw.join("invite", forgedCodeBlob, "Ola", printOf(LEAD.public).slice(0, 4));
  const keptW = trustOf(Dw) === trustW && filesUnder(forgedYard).length === 0;
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, realBlob);
  await press("read");
  typeFour(realCode);
  const realPage = TJ.teamJoinEmptyHtml();
  await press("invite");
  const envW = Dw.envelope();
  check(pureOk && / disabled/.test(yesOf(forgedPage)) && !/ hidden/.test(missOf(forgedPage))
      && forgedTakeReal && forgedTakeReal.refused === "check" && forgedTakePrint && forgedTakePrint.refused === "check" && keptW
      && !/ disabled/.test(yesOf(realPage)) && !!envW.teamJoin && envW.teamPins && envW.teamPins[TEAM].public === LEAD.public,
    "15aw a forged invitation, its own code right for its own secret and key and its print opening like the real lead's, fails against"
    + " the real lead's code at the confirm and at yes, and so does the print's first group; THE CONTROL, the real invitation with"
    + " that code, is taken: " + (forgedTakeReal && forgedTakeReal.refused) + ", " + (forgedTakePrint && forgedTakePrint.refused)
    + ", then " + (envW.teamJoin ? "taken" : "not taken"));

  /* The code is five digits, so it is sought as a whole token, never inside a longer run of letters and digits; an
     invitation whose code the desk's file already holds as a token, or that is this year, is not the one used. */
  const asToken = code => new RegExp("(^|[^0-9A-Za-z])" + code + "([^0-9A-Za-z]|$)");
  const Dx = await deskWith("code-unwritten", folder("code-unwritten-own"));
  const unwrittenYard = folder("code-unwritten-yard");
  const deskBefore = fs.readFileSync(path.join(Dx.ud, "desk.json"), "utf8");
  let unwritten = "";
  do { unwritten = inviteBlob({ team: TEAM, folder: unwrittenYard, lead: lampLead, secret: newSecret() }); }
  while (asToken(codeFor(unwritten)).test(deskBefore) || codeFor(unwritten) === String(new Date().getFullYear()));
  const codeX = codeFor(unwritten);
  await Dx.join("read", unwritten);
  const tookX = await Dx.join("invite", unwritten, "Ola", codeX);
  const Dx2 = loadDesk(Dx.ud);
  await Dx2.join("state");
  /* The yes reply is scanned too; the read reply carries offer.code for the confirm, and is not. */
  const written = filesUnder(unwrittenYard).concat(filesUnder(Dx.ud)).map(f => fs.readFileSync(f, "latin1")).concat(Dx.said, Dx2.said, [JSON.stringify(tookX)]);
  const holding = written.filter(text => asToken(codeX).test(text)).length;
  check(tookX && tookX.join && tookX.join.state === "waiting" && written.length >= 5 && holding === 0,
    "15ax the check code is written nowhere: not in the share, not in the desk's file or its envelope, not in the log, not in the"
    + " yes reply, across a read, a yes and a restart (" + written.length + " texts read): holding " + holding);

  /* ---- machine policy names the team's folder or its lead: the invitation door is closed --------------------- */
  /* The policy key as reg export writes it, each value a string with its two escapes. Off Windows the shell reads no
     machine policy at all, so there the door stands as it does with none. */
  const regText = rows => "Windows Registry Editor Version 5.00\n\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Etiuda]\n"
    + rows.map(([k, v]) => '"' + k + '"="' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"\n').join("") + "\n";
  const underPolicy = async (rows, name, own) => {
    const before = regStand.calls.export;
    REG.policy = regText(rows);
    try { const D = await deskWith(name, own); D.policyRead = regStand.calls.export > before; return D; }
    finally { REG.policy = null; }
  };
  const writtenUnder = dir => filesUnder(dir).filter(f => f.indexOf(path.join(dir, "desks")) === 0).length;
  /* One desk under the policy `rows` makes of its named folder, which holds the team's file, and a valid invitation from
     `from` into a folder of its own, or into the named folder where `intoNamed`: read, then yes with its right code. */
  let policyCases = 0;
  const policyCase = async (label, rows, from, intoNamed) => {
    const n = policyCases++;
    const named = folder("policy-" + n), invited = intoNamed ? named : folder("policy-invited-" + n);
    put(named, "etiuda-team.json", teamFile([]));
    const Dm = await underPolicy(rows(named), "policy-desk-" + n, folder("policy-own-" + n));
    const blob = inviteBlob({ team: TEAM, folder: invited, lead: from, secret: newSecret() });
    const trust = trustOf(Dm);
    let readM = null, takeM = null;
    const asks = async () => { readM = await Dm.join("read", blob); takeM = await Dm.join("invite", blob, "Ola", codeFor(blob)); };
    /* The named folder is this desk's catalog folder, so its own reads of it are not the invitation's doing. */
    const touchedM = intoNamed ? (await asks(), []) : await watching(invited, asks);
    const kept = trustOf(Dm) === trust, inNamed = writtenUnder(named), inInvited = intoNamed ? 0 : writtenUnder(invited);
    const still = kept && inNamed === 0 && inInvited === 0 && touchedM.length === 0;
    const ok = WIN ? Dm.policyRead && readM && readM.refused === "policy" && !readM.offer && takeM && takeM.refused === "policy" && still
      : !Dm.policyRead && readM && !!readM.offer && readM.refused === undefined;
    return label + ": " + (ok ? "ok" : "read " + (readM && (readM.refused || (readM.offer ? "offered" : "nothing")))
      + ", yes " + (takeM && (takeM.refused || (takeM.join ? takeM.join.state : "nothing"))) + (kept ? "" : ", trust or folder moved")
      + ", requests " + inNamed + " in the policy's folder and " + inInvited + " in the invitation's, touched " + touchedM.length);
  };
  const folderLead = f => [["TeamFolder", f], ["LeadKey", LEAD.public]];
  const byFolder = [
    await policyCase("folder and lead", folderLead, lampLead, false),
    await policyCase("folder alone", f => [["TeamFolder", f]], lampLead, false),
    await policyCase("folder and lead, the invitation naming both", folderLead, lampLead, true),
  ];
  const Dnp = await deskWith("policy-control", folder("policy-control-own"));
  const controlBlob = inviteBlob({ team: TEAM, folder: folder("policy-control-yard"), lead: lampLead, secret: newSecret() });
  const readNp = await Dnp.join("read", controlBlob);
  check(byFolder.every(x => / ok$/.test(x)) && readNp && !!readNp.offer && readNp.refused === undefined,
    "15ay while machine policy names the team's folder, with the lead or without, a valid invitation with its right check code is"
    + " refused at read and at yes with the policy's word, one naming the policy's own folder and lead included, and nothing"
    + " changes: no pin, key or request, in the policy's folder or the invitation's, the desk's folder setting as it was, and"
    + " nothing asked where the invitation points; THE CONTROL, a desk with no policy, is offered it; off Windows no machine"
    + " policy is read and the door stands as before: " + byFolder.join("; "));

  const leadAlone = () => [["LeadKey", LEAD.public]];
  const byLead = [
    await policyCase("lead alone, the invitation from that lead", leadAlone, lampLead, false),
    await policyCase("lead alone, the invitation from another", leadAlone, forgedLead, false),
  ];
  check(byLead.every(x => / ok$/.test(x)),
    "15az a policy naming only the lead's key closes the door too: an invitation from that very lead, or from another, is refused"
    + " at read and at yes with the same word and nothing changes; off Windows no machine policy is read and the door stands as"
    + " before: " + byLead.join("; "));

  /* A join kept from an invitation is let go when machine policy arrives in a later run: the pin it set and the folder it
     set go, and what the desk held before stays. The same desk restarted with no policy keeps it all. */
  const restartUnder = async (rows, ud) => {
    const before = regStand.calls.export;
    REG.policy = rows ? regText(rows) : null;
    try { const D = loadDesk(ud); await D.join("state"); D.policyRead = regStand.calls.export > before; return D; }
    finally { REG.policy = null; }
  };
  const T2 = "t-" + crypto.randomBytes(8).toString("hex");
  const keptT2 = { [T2]: { "1": Buffer.from("kept").toString("base64") } };
  const letGoOutcome = [];
  const bothNamed = f => [["TeamFolder", f], ["LeadKey", LEAD.public]];
  const LET_GO_LINE = "the request to join team " + TEAM + " made from an invitation is let go, since machine policy names this desk's team";
  for (const [label, priorPins, rows] of [["folder and lead, no pin before", { [T2]: LEAD }, bothNamed],
    ["folder and lead, the invited lead pinned before", { [T2]: LEAD, [TEAM]: FORGED }, bothNamed],
    ["lead alone, no pin before", { [T2]: LEAD }, null]]) {
    const n = letGoOutcome.length, priorFolder = folder("letgo-own-" + n), invitedYard = folder("letgo-yard-" + n);
    const policyFolder = folder("letgo-policy-" + n);
    const Di = await deskWith("letgo-" + n, priorFolder, { teamPins: priorPins, teamSeen: [T2], teamKeys: keptT2 });
    const meI = await Di.ask("etiuda:branch-identity", true);
    const inviteI = inviteBlob({ team: TEAM, folder: invitedYard, lead: forgedLead, secret: newSecret() });
    const tookI = await Di.join("invite", inviteI, "Ola", codeFor(inviteI));
    const afterYes = Di.envelope();
    const Dn = await restartUnder(null, Di.ud);
    const plain = Dn.envelope();
    const keptPlain = !!plain.teamJoin && !!plain.teamJoin.invite && plain.teamPins[TEAM].public === FORGED.public
      && plain.keys.eCatalogFolder === invitedYard;
    /* The invited lead's file, the desk on its roster, in the folder the desk reads under the policy: its own where the policy
       names only the lead. Under the policy it is not trusted. */
    put(rows ? policyFolder : priorFolder, "etiuda-team.json", teamFile([entry(meI, K1, 1)], { lead: FORGED, signer: forger.privateKey }));
    const Dq = await restartUnder(rows ? rows(policyFolder) : [["LeadKey", LEAD.public]], Di.ud);
    const env = Dq.envelope(), pins = env.teamPins || {};
    const refusedFile = Dq.said.some(l => l.indexOf("is signed by a key other than the lead's this desk trusts for team " + TEAM) >= 0);
    const priorStays = pins[T2] && pins[T2].public === LEAD.public && (env.teamSeen || []).indexOf(T2) >= 0
      && JSON.stringify((env.teamKeys || {})[T2]) === JSON.stringify(keptT2[T2]);
    const invitedPin = priorPins[TEAM] ? !!pins[TEAM] && pins[TEAM].public === FORGED.public : !pins[TEAM];
    /* The let-go is said once, in these words, and neither it, the rest of that run's log nor the desk's file after it holds
       the invitation's secret, the proof its request carried or its check code. */
    const proofI = afterYes.teamJoin && afterYes.teamJoin.invite ? String(afterYes.teamJoin.invite.proof) : "";
    const letGoSaid = Dq.said.filter(l => l === "ERR etiuda: " + LET_GO_LINE).length;
    const holding = [Dq.said.join("\n"), fs.readFileSync(path.join(Di.ud, "desk.json"), "latin1")]
      .filter(text => text.indexOf(secretOf(inviteI)) >= 0 || (!!proofI && text.indexOf(proofI) >= 0) || asToken(codeFor(inviteI)).test(text)).length;
    const quietPlain = !Dn.said.some(l => l.indexOf(LET_GO_LINE) >= 0);
    const ok = WIN
      ? Dq.policyRead && !env.teamJoin && invitedPin && env.keys.eCatalogFolder === priorFolder && priorStays && refusedFile
        && !(env.teamKeys || {})[TEAM] && fs.existsSync(path.join(invitedYard, "desks", meI.id, "join.json"))
        && letGoSaid === 1 && /^[0-9a-f]{64}$/.test(proofI) && holding === 0 && quietPlain
      : !!env.teamJoin && env.keys.eCatalogFolder === invitedYard && priorStays && letGoSaid === 0 && quietPlain;
    letGoOutcome.push(label + ": " + (tookI && tookI.join && afterYes.keys.eCatalogFolder === invitedYard && keptPlain && ok ? "ok"
      : "yes " + (tookI && (tookI.refused || (tookI.join && tookI.join.state))) + ", kept with no policy " + keptPlain
        + ", the let-go said " + letGoSaid + " time(s) under policy and " + (quietPlain ? "not" : "also") + " with none, "
        + holding + " text(s) holding the secret, the proof or the code"
        + ", under policy: join " + (env.teamJoin ? "kept" : "gone") + ", invited pin " + (pins[TEAM] ? pins[TEAM].keyId + (pins[TEAM].public === FORGED.public ? " (the invitation's)" : "") : "none")
        + ", folder " + (env.keys.eCatalogFolder === priorFolder ? "the desk's own" : env.keys.eCatalogFolder === invitedYard ? "the invitation's" : "other")
        + ", earlier trust " + (priorStays ? "kept" : "lost") + ", the invited lead's file " + (refusedFile ? "refused" : "not refused")));
  }
  check(letGoOutcome.every(x => / ok$/.test(x)),
    "15bf a join kept from an invitation is let go once machine policy arrives in a later run: the pin the invitation set and"
    + " the folder it set go, the desk's own folder comes back, its request stays where it was written, and the invited lead's"
    + " file is refused under the policy, and the desk says once that the request is let go, with no secret, proof or check code in"
    + " that sentence, the rest of its log or its file, while a pin, a key and a key shown that the desk held before stay; THE"
    + " CONTROL, the same desk restarted with no policy, keeps the join, the pin and the folder and says no let-go; off Windows no"
    + " machine policy is read and all of it stays: " + letGoOutcome.join("; "));

  /* A join made from the folder's own request, with no invitation, is not policy's to let go: restarted under each policy, the
     request, its code and what the desk held before stay, and no let-go is said. In the same run an invitation is refused with
     the policy's word, so the policy was in force. */
  const plainShare = folder("plain-share");
  put(plainShare, "etiuda-team.json", teamFile([]));
  put(plainShare, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  const Dg = await deskWith("plain-join", plainShare, { teamPins: { [T2]: LEAD }, teamSeen: [T2], teamKeys: keptT2 });
  const meG = await Dg.ask("etiuda:branch-identity", true);
  await Dg.join("ask", "lamps.ec", "Ola");
  const reqG = path.join(plainShare, "desks", meG.id, "join.json");
  const commitG = fs.existsSync(reqG) ? JSON.parse(fs.readFileSync(reqG, "utf8")).commit : "";
  put(plainShare, P.JOINS_NAME, joins([{ desk: meG.id, commit: commitG, nonce: nonce() }]));
  const viewG = v => (v && v.join ? v.join.state + " " + v.join.code : "no join");
  const codeG = viewG(await Dg.join("state"));
  const joinG = JSON.stringify(Dg.envelope().teamJoin || null), bytesG = fs.existsSync(reqG) ? fs.readFileSync(reqG, "utf8") : "";
  const plainBlob = inviteBlob({ team: TEAM, folder: folder("plain-yard"), lead: lampLead, secret: newSecret() });
  const plainKept = [];
  for (const [label, rows] of [["no policy", null], ["folder and lead", bothNamed(plainShare)], ["folder alone", [["TeamFolder", plainShare]]],
    ["lead alone", [["LeadKey", LEAD.public]]]]) {
    const Dgr = await restartUnder(rows, Dg.ud);
    const v = await Dgr.join("state"), door = await Dgr.join("read", plainBlob);
    const env = Dgr.envelope(), pins = env.teamPins || {};
    const stays = JSON.stringify(env.teamJoin || null) === joinG && !(env.teamJoin || {}).invite && viewG(v) === codeG
      && fs.readFileSync(reqG, "utf8") === bytesG && env.keys.eCatalogFolder === plainShare
      && !!pins[T2] && pins[T2].public === LEAD.public && (env.teamSeen || []).indexOf(T2) >= 0
      && JSON.stringify((env.teamKeys || {})[T2]) === JSON.stringify(keptT2[T2]);
    const unsaid = !Dgr.said.some(l => l.indexOf("made from an invitation is let go") >= 0);
    const inForce = rows && WIN ? Dgr.policyRead && door && door.refused === "policy" : door && !!door.offer && door.refused === undefined;
    plainKept.push(label + ": " + (stays && unsaid && inForce ? "ok" : (stays ? "kept" : "join " + viewG(v) + (env.teamJoin ? "" : ", gone from the file"))
      + (unsaid ? "" : ", let-go said") + ", the invitation " + (door && (door.refused || (door.offer ? "offered" : "nothing")))));
  }
  check(/^code [0-9]{6}$/.test(codeG) && plainKept.every(x => / ok$/.test(x)),
    "15bg a join made from the folder's own request, with no invitation, is kept when machine policy arrives in a later run, under a"
    + " policy naming the folder and the lead, the folder alone or the lead alone: the request in the desk's file and on the share,"
    + " its six-digit code, the folder and what the desk held before all stay, and no let-go is said, while in that same run an"
    + " invitation is refused with the policy's word; THE CONTROL, a restart with no policy, keeps it too and the invitation is"
    + " offered; off Windows no machine policy is read and all of it stays: " + codeG.split(" ")[0] + "; " + plainKept.join("; "));

  /* ---- the confirm's host line comes only from a folder the reader returned ----------------------------------- */
  /* The shell evaluated with folderHost wrapped, so every folder it is asked of is kept here. */
  const HOST_SRC = SRC.split("function folderHost(").length === 2
    ? SRC.replace("function folderHost(", "function folderHostAsked(")
      + "\nfunction folderHost(f, e) { globalThis.etiudaHostAsked.push(String(f)); return folderHostAsked(f, e); }"
    : "";
  const hostForms = ["/\\evil.example\\share\\team", "\\/evil.example/share/team", "/\\evil.example\\share\\OneDrive\\team",
    "\\\\?\\UNC\\evil.example\\share\\team", "C:\\OneDrive\\..\\Windows\\Temp\\team", "\\\\quay-host\\catalogs\\",
    "C:/OneDrive/team/", folder("host-yard") + path.sep];
  const hostWrong = [];
  let hostTaken = 0;
  if (!HOST_SRC) hostWrong.push("shell/main.js does not hold exactly one folderHost declaration");
  else {
    const udH = path.join(LAB, "host-asked");
    fs.mkdirSync(udH, { recursive: true });
    fs.writeFileSync(path.join(udH, "desk.json"),
      JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: folder("host-own"), eUiLang: "en" } }), "utf8");
    const Dh = loadDesk(udH, HOST_SRC);
    await Dh.ask("etiuda:branch-identity", true);
    for (const form of hostForms) {
      const blob = inviteBlob({ team: TEAM, folder: form, lead: lampLead, secret: newSecret() });
      const want = P.inviteRead(blob, !WIN);
      globalThis.etiudaHostAsked = [];
      const got = await Dh.join("read", blob);
      await Dh.join("invite", blob, "Ola", wrongFor(blob));
      const asked = globalThis.etiudaHostAsked;
      if (want) hostTaken++;
      if (JSON.stringify(asked) !== JSON.stringify(want ? [want.folder] : []) || (got && got.offer ? got.offer.folder : null) !== (want ? want.folder : null))
        hostWrong.push(JSON.stringify(form) + " asked of " + JSON.stringify(asked));
    }
    delete globalThis.etiudaHostAsked;
  }
  check(hostWrong.length === 0 && hostTaken >= 1,
    "15bb where a folder sits is asked only of the folder the invitation reader returned, once at read, never at yes, and never of"
    + " a text it refused (" + hostForms.length + " forms, " + hostTaken + " taken): " + JSON.stringify(hostWrong));

  /* The page shows the policy's refusal in its own sentence, in either language. */
  const ST = await import(MOD("storage.js"));
  const langWas = ST.lsGet("eUiLang");
  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read" || op === "invite"
    ? { sealed: null, join: null, leads: [], refused: "policy" } : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const policyPage = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, controlBlob);
    await press("read");
    policyPage[lang] = TJ.teamJoinEmptyHtml();
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const POLICY_LINE = { en: "The organisation's IT sets this desk's team, so invitations are turned off.",
    pl: "Zespół tego stanowiska ustawia dział IT organizacji, więc zaproszenia są wyłączone." };
  const pageSaid = lang => (/<p>([^<]*)<\/p>/.exec(policyPage[lang] || "") || ["", ""])[1];
  const escHtml = s => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
  check(pageSaid("en") === escHtml(POLICY_LINE.en) && pageSaid("pl") === escHtml(POLICY_LINE.pl) && policyPage.en.indexOf(secretOf(controlBlob)) < 0,
    "15ba the policy's refusal reaches the page as its own sentence, in English and in Polish: " + pageSaid("en") + " / " + pageSaid("pl"));

  const UNREADABLE_LINE = { en: "The team file in this folder could not be read, so this desk did not join and nothing was written. Let the team's lead know, so they can check the folder.",
    pl: "Nie udało się odczytać pliku zespołu w tym folderze, więc stanowisko nie dołączyło i nic nie zapisano. Proszę dać znać liderowi zespołu: może sprawdzić ten folder." };
  window.E_HOST = { onTeamJoin: noop, teamJoin: op => Promise.resolve(op === "read" || op === "invite"
    ? { sealed: null, join: null, leads: [], refused: "unreadable" } : { sealed: null, join: null, leads: [] }) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  const unreadableSaid = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, controlBlob);
    await press("read");
    unreadableSaid[lang] = (/<p>([^<]*)<\/p>/.exec(TJ.teamJoinEmptyHtml()) || ["", ""])[1];
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(tookE.every(x => x === "unreadable") && keptE
      && unreadableSaid.en === escHtml(UNREADABLE_LINE.en) && unreadableSaid.pl === escHtml(UNREADABLE_LINE.pl),
    "15be a folder whose team file cannot be read, a folder standing where the file would or a file that is not JSON, takes no"
    + " request and puts the desk's folder back, refused with a word of its own that the page says in its own sentence, in"
    + " English and in Polish: " + JSON.stringify(tookE) + ", " + unreadableSaid.en);

  /* A team file larger than the shell reads (TEAM_MAX in shell/main.js, 1 MiB) is one it cannot read, however whole: refused
     at yes with that word, and the page over this desk's own shell says that sentence. THE CONTROL is the same file at
     exactly 1 MiB, read and taken. */
  const MIB = 1024 * 1024;
  const padTeam = (dir, size) => {
    const text = JSON.stringify(teamFile([])), at = path.join(dir, "etiuda-team.json");
    fs.writeFileSync(at, text + " ".repeat(size - Buffer.byteLength(text)), "utf8");
    return fs.statSync(at).size;
  };
  const overYard = folder("files-oversized"), atYard = folder("files-at-limit");
  const sizes = [padTeam(overYard, MIB + 1), padTeam(atYard, MIB)];
  const Do = await deskWith("oversized", folder("oversized-own"));
  const trustO = trustOf(Do);
  const overBlob = inviteBlob({ team: TEAM, folder: overYard, lead: lampLead, secret: newSecret() });
  const overWord = await Do.join("invite", overBlob, "Ola", codeFor(overBlob));
  await pageOn(Do);
  const overSaid = {};
  for (const lang of ["en", "pl"]) {
    ST.lsSet("eUiLang", lang);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, overBlob);
    await press("read");
    typeFour(codeFor(overBlob));
    await press("invite");
    overSaid[lang] = (/<p>([^<]*)<\/p>/.exec(TJ.teamJoinEmptyHtml()) || ["", ""])[1];
    await press("back");
  }
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  const keptO = trustOf(Do) === trustO && writtenUnder(overYard) === 0;
  const atBlob = inviteBlob({ team: TEAM, folder: atYard, lead: lampLead, secret: newSecret() });
  const atWord = await Do.join("invite", atBlob, "Ola", codeFor(atBlob));
  check(sizes[0] === MIB + 1 && sizes[1] === MIB && overWord && overWord.refused === "unreadable" && keptO
      && overSaid.en === escHtml(UNREADABLE_LINE.en) && overSaid.pl === escHtml(UNREADABLE_LINE.pl)
      && atWord && atWord.join && atWord.join.state === "waiting" && writtenUnder(atYard) === 1,
    "15bh a team file one byte larger than 1 MiB, whole under the invited lead otherwise, is one the desk cannot read: refused at"
    + " yes as unreadable, nothing written or pinned and the desk's folder put back, and the page over this desk's shell says the"
    + " team file could not be read, in English and in Polish; THE CONTROL, the same file at exactly 1 MiB, is read and taken: "
    + sizes.join(" and ") + " bytes, " + (overWord && (overWord.refused || (overWord.join ? overWord.join.state : "nothing"))) + ", then "
    + (atWord && (atWord.refused || (atWord.join ? atWord.join.state : "nothing"))) + "; " + overSaid.en);

  /* A read the page has let go is answered to nobody: one left by Cancel, and one landing while another paste box is open. */
  const Dst = await deskWith("stale", folder("stale-own"));
  const staleAt = folder("stale-a");
  const staleA = inviteBlob({ team: TEAM, folder: staleAt, lead: lampLead, secret: newSecret() });
  const staleB = inviteBlob({ team: TEAM, folder: folder("stale-b"), lead: lampLead, secret: newSecret() });
  let slowText = "";
  window.E_HOST = { onTeamJoin: noop, teamJoin: (op, file, name, four) => (op === "read" && file === slowText
    ? new Promise(r => setTimeout(() => r(Dst.join(op, file, name, four)), 60)) : Dst.join(op, file, name, four)) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  slowText = staleA;
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleA);
  const lateA = press("read");
  await press("back");
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleB);
  await lateA;
  const whileB = held(), whileBHtml = TJ.teamJoinEmptyHtml();
  await press("read");
  const shownB = held();
  await press("back");
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, staleA);
  const lateA2 = press("read");
  await press("back");
  await lateA2;
  const abandoned = held(), abandonedHtml = TJ.teamJoinEmptyHtml();
  slowText = "";
  check(!!whileB && whileB.mode === "paste" && whileB.offer === null && whileBHtml.indexOf(staleAt) < 0
      && !!shownB && shownB.mode === "confirm" && shownB.read === staleB && letGo(abandoned) && abandonedHtml.indexOf(staleAt) < 0,
    "15bc a read the page let go is answered to nobody: one landing while another invitation's paste box is open leaves that box as"
    + " it was and the next read shows its own, and one left by Cancel shows nothing when it lands: "
    + (whileB && whileB.mode) + ", then " + (shownB && shownB.mode) + ", then " + (abandoned && (abandoned.mode || "nothing")));

  /* Hide on the bubble, where a catalog is open, lets the invitation go as Cancel does. The bubble is drawn on stand-ins. */
  const AS = await import(MOD("app-state.js"));
  const bubbles = [];
  const stubNode = () => ({ className: "", id: "", style: {}, attrs: {}, listeners: {}, isConnected: false, innerHTML: "",
    offsetWidth: 340, offsetHeight: 200, classList: { contains: () => false, add: noop, remove: noop },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, appendChild(c) { return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], remove() { this.removed = true; } });
  const docWas = { createElement: document.createElement, body: document.body };
  const globalsWas = {};
  for (const k of ["innerWidth", "innerHeight", "addEventListener", "removeEventListener"]) globalsWas[k] = globalThis[k];
  let heldShown = null, heldHidden = null, escaped = false;
  try {
    document.createElement = () => stubNode();
    document.body = { appendChild: el => { bubbles.push(el); return el; } };
    Object.assign(globalThis, { innerWidth: 1280, innerHeight: 800, addEventListener: noop, removeEventListener: noop });
    const Dhd = await deskWith("hide", folder("hide-own"));
    window.E_HOST = hostOver(Dhd);
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 30));
    AS.setCards([{ id: "c-hide" }]);
    TJ.openJoinPaste();
    pasted = elOf({ "data-join-paste": "" }, inviteBlob({ team: TEAM, folder: folder("hide-yard"), lead: lampLead, secret: newSecret() }));
    await press("read");
    heldShown = held();
    const top = bubbles[bubbles.length - 1];
    const onKey = top && (top.listeners.keydown || [])[0];
    if (onKey) { onKey({ key: "Escape", preventDefault: noop, stopPropagation: noop }); escaped = true; }
    heldHidden = held();
  } finally {
    AS.setCards([]);
    document.createElement = docWas.createElement;
    document.body = docWas.body;
    for (const k of Object.keys(globalsWas)) { if (globalsWas[k] === undefined) delete globalThis[k]; else globalThis[k] = globalsWas[k]; }
  }
  check(!!heldShown && heldShown.mode === "confirm" && heldShown.read !== "" && escaped && letGo(heldHidden),
    "15bd Hide on the bubble, pressed while it holds an invitation's confirm, lets the invitation go as Cancel does: "
    + (heldShown && heldShown.mode) + ", then " + (heldHidden && (heldHidden.mode || "nothing held")) + ", " + bubbles.length + " bubble(s) drawn");

  /* A lead may open an invitation's request for the six-digit code. The reveal rewrites the file. The bytes written
     at yes stay, and only the reveal and the opening are added. A request that never carried an invitation gains the
     same two fields and nothing else, which is the file this desk has always written on a reveal. */
  const codeYard = folder("code-yard");
  put(codeYard, "etiuda-team.json", teamFile([entry(me2, K1, 1)]));
  put(codeYard, "lamps.ec", P.sealCatalog(K1, TEAM, 1, A1));
  const Dplain = newDesk("code-plain", codeYard);
  const mePlain = await Dplain.ask("etiuda:branch-identity", true);
  const askedPlain = await Dplain.join("ask", "lamps.ec", "Bram");
  const plainPath = path.join(codeYard, "desks", mePlain.id, "join.json");
  const plainWait = fs.existsSync(plainPath) ? fs.readFileSync(plainPath, "utf8") : "";
  const Dinv = newDesk("code-inv", folder("code-old"));
  const meInv = await Dinv.ask("etiuda:branch-identity", true);
  const secretBi = newSecret();
  const biBlob = inviteBlob({ team: TEAM, folder: codeYard, lead: lampLead, secret: secretBi });
  const tookBi = await Dinv.join("invite", biBlob, "Nils", codeFor(biBlob));
  const invPath = path.join(codeYard, "desks", meInv.id, "join.json");
  const invWait = fs.existsSync(invPath) ? fs.readFileSync(invPath, "utf8") : "";
  const readReq = (text) => { try { return JSON.parse(text); } catch { return null; } };
  const plainDoc = readReq(plainWait), invDoc = readReq(invWait);
  const nPlain = nonce(), nInv = nonce();
  const joinPlain = Dplain.envelope().teamJoin || {}, joinInv = Dinv.envelope().teamJoin || {};
  put(codeYard, P.JOINS_NAME, joins([
    { desk: mePlain.id, commit: plainDoc && plainDoc.commit, nonce: nPlain },
    { desk: meInv.id, commit: invDoc && invDoc.commit, nonce: nInv },
  ]));
  const seenPlain = await Dplain.join("state");
  const seenInv = await Dinv.join("state");
  const plainNow = fs.existsSync(plainPath) ? fs.readFileSync(plainPath, "utf8") : "";
  const invNow = fs.existsSync(invPath) ? fs.readFileSync(invPath, "utf8") : "";
  const plainGot = readReq(plainNow), invGot = readReq(invNow);
  const beforeSig = (text) => { const at = text.indexOf("\n \"sig\":"); return at < 0 ? "" : text.slice(0, at); };
  /* The bytes a reveal adds, built by the same stringify the shell uses, so a drifted field or a drifted order fails. */
  const revealTail = (deskNonce, leadNonce) => {
    const text = JSON.stringify({ reveal: deskNonce,
      opened: { lead: { keyId: LEAD.keyId, public: LEAD.public }, nonce: leadNonce }, sig: 0 }, null, 1);
    const at = text.indexOf("\n \"sig\":");
    return at < 0 ? "" : text.slice(1, at);
  };
  const plainHead = beforeSig(plainWait), invHead = beforeSig(invWait);
  const plainGrew = beforeSig(plainNow) === plainHead + revealTail(joinPlain.nonce, nPlain);
  const invGrew = beforeSig(invNow) === invHead + revealTail(joinInv.nonce, nInv);
  const codePlain = P.joinCode(TEAM, mePlain.key, mePlain.box, LEAD.public, joinPlain.nonce, nPlain);
  const codeShown = (seen) => !!(seen && seen.join && seen.join.state === "code" && seen.join.code);
  const invViewQuiet = !!(seenInv && seenInv.join && seenInv.join.code === "" && seenInv.join.state === "waiting"
    && seenInv.join.invite && seenInv.join.invite.lead === "Lamp lead");
  const plainOk = !!(askedPlain && askedPlain.join && askedPlain.join.state === "waiting" && plainDoc && plainGot
    && plainDoc.invite === undefined && plainDoc.desk && plainDoc.desk.kind === undefined
    && plainGrew && plainGot.invite === undefined && plainGot.desk && plainGot.desk.kind === undefined
    && plainGot.commit === plainDoc.commit && plainGot.reveal === joinPlain.nonce
    && codeShown(seenPlain) && seenPlain.join.code === codePlain && P.joinGenuine(plainGot, mePlain.id));
  const invOk = !!(tookBi && tookBi.join && tookBi.join.state === "waiting" && invDoc && invGot
    && invDoc.desk && invDoc.desk.kind === "desk" && invDoc.invite && invGrew
    && invGot.desk && invGot.desk.kind === invDoc.desk.kind
    && JSON.stringify(invGot.invite) === JSON.stringify(invDoc.invite)
    && invGot.commit === invDoc.commit && invGot.reveal === joinInv.nonce
    && invViewQuiet && P.joinGenuine(invGot, meInv.id));
  check(plainOk && invOk,
    "15bi a desk that took an invitation, opened afterwards, reveals with that invitation and its kind intact, and its view names the lead and carries no code,"
    + " while a request with no invitation reveals with only the opening added and shows its code: invite " + (invOk ? "kept" : "dropped")
    + ", plain " + (plainOk ? "unchanged" : "moved"));

  /* An invitation's wait names the lead and never draws a code. A request still does, empty places and then the digits. */
  let tookFn = null;
  const Dwait = await deskWith("door-wait", folder("invite-own"));
  const waitYard = folder("invite-wait-yard");
  window.E_HOST = { onTeamJoin: fn => { tookFn = fn; }, teamJoin: (op, file, name, four) => Dwait.join(op, file, name, four) };
  TJ.wireTeamJoin();
  await new Promise(r => setTimeout(r, 30));
  ST.lsSet("eUiLang", "en");
  const waitBlob = inviteBlob({ team: TEAM, folder: waitYard, lead: lampLead, secret: newSecret() });
  TJ.openJoinPaste();
  pasted = elOf({ "data-join-paste": "" }, waitBlob);
  await press("read");
  typeFour(codeFor(waitBlob));
  await press("invite");
  const waitHtml = TJ.teamJoinEmptyHtml();
  const shellWait = await Dwait.join("state");
  const quietInvite = !!(shellWait && shellWait.join && shellWait.join.code === "" && shellWait.join.state === "waiting"
    && shellWait.join.invite && shellWait.join.invite.lead === "Lamp lead");
  const enInvite = waitHtml.indexOf("Joining Lamp lead&#39;s team") >= 0
    && waitHtml.indexOf("The lead&#39;s Studio lets this desk in by itself; nothing to do here.") >= 0
    && waitHtml.indexOf("e-join-code") < 0 && waitHtml.indexOf("e-join-wait") < 0
    && waitHtml.indexOf("Waiting for the lead to open the request") < 0
    && waitHtml.indexOf('data-join="cancel"') >= 0;
  const paint = view => { if (tookFn) tookFn(view); return TJ.teamJoinEmptyHtml(); };
  const armed = paint({ join: { file: "a.ec", state: "code", code: "483920", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] });
  const noDigits = armed.indexOf("483") < 0 && armed.indexOf("920") < 0 && armed.indexOf("e-join-code") < 0
    && armed.indexOf("Joining Lamp lead&#39;s team") >= 0;
  const blank = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia", invite: { lead: "" } }, leads: [] });
  const namedLead = blank.indexOf("the lead") >= 0 && blank.indexOf("Joining &#39;s") < 0 && blank.indexOf("e-join-code") < 0;
  const requestWait = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia" }, leads: [] });
  const requestCode = paint({ join: { file: "a.ec", state: "code", code: "120034", asked: 1, name: "Nia" }, leads: [] });
  const requestDoor = requestWait.indexOf("Waiting for the lead to open the request") >= 0 && requestWait.indexOf("e-join-wait") >= 0
    && requestCode.indexOf("e-join-code") >= 0 && requestCode.indexOf(">120<") >= 0 && requestCode.indexOf(">034<") >= 0
    && requestCode.indexOf("Joining ") < 0;
  ST.lsSet("eUiLang", "pl");
  const plHtml = paint({ join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia", invite: { lead: "Lamp lead" } }, leads: [] });
  const plInvite = plHtml.indexOf("Dołączanie do zespołu osoby Lamp lead") >= 0
    && plHtml.indexOf("Studio lidera samo wpuszcza to stanowisko; tutaj nie trzeba nic robić.") >= 0
    && plHtml.indexOf("e-join-code") < 0;
  if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  check(!!tookFn && quietInvite && enInvite && noDigits && namedLead && requestDoor && plInvite,
    "15bk an invitation's wait names the lead and says the lead's Studio admits the desk, with no code places and no digits, in English and in Polish;"
    + " a request still waits with empty places and then shows its code: view " + (shellWait && shellWait.join ? shellWait.join.state + "/" + shellWait.join.code : "none")
    + (quietInvite ? " lead named" : " lead missing"));

  /* Joining loads a catalog only on an empty desk. A desk that already has one keeps it. */
  const loads = [];
  const wasLoad = HK.hooks.loadCatalogFromFolder;
  HK.hooks.loadCatalogFromFolder = name => { loads.push(String(name)); };
  AS.setCards([{ id: "c-loaded" }]);
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const keptCatalog = loads.length === 0 && AS.cards.length === 1 && AS.cards[0].id === "c-loaded";
  AS.setCards([]);
  loads.length = 0;
  if (tookFn) tookFn({ joined: { team: TEAM, file: "lamps.ec" }, join: null, leads: [] });
  const loadedEmpty = loads.length === 1 && loads[0] === "lamps.ec";
  HK.hooks.loadCatalogFromFolder = wasLoad;
  AS.setCards([]);
  check(!!tookFn && keptCatalog && loadedEmpty,
    "15bl joining leaves a catalog the desk already has loaded, and an empty desk still loads the one the invitation named: kept "
    + keptCatalog + ", empty loaded " + JSON.stringify(loads));

  /* Join a team in Settings, the Library and the Menu, on a desk that already has a catalog and has seen its lead. */
  const doorWas = { createElement: document.createElement, body: document.body, getElementById: document.getElementById,
    querySelector: document.querySelector, gcs: globalThis.getComputedStyle, add: globalThis.addEventListener,
    remove: globalThis.removeEventListener, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
  const menuJoin = { hidden: true };
  let doorNote = "not run";
  try {
    document.documentElement = document.documentElement || {};
    document.body = { classList: { contains: () => false, toggle: noop, add: noop, remove: noop }, appendChild: el => el };
    document.createElement = () => stubNode();
    document.getElementById = id => id === "menuJoin" ? menuJoin : null;
    globalThis.getComputedStyle = () => ({ fontSize: "16px" });
    globalThis.addEventListener = noop;
    globalThis.removeEventListener = noop;
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 800;
    AS.setCards([{ id: "c-door" }]);
    ST.lsSet("eUiLang", "en");
    const seenLead = { team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true };
    window.E_HOST = { onTeamJoin: fn => { tookFn = fn; }, teamJoin: () => Promise.resolve({ sealed: null, join: null, leads: [seenLead] }) };
    TJ.wireTeamJoin();
    await new Promise(r => setTimeout(r, 30));
    const SET = await import(MOD("settings.js"));
    const MG = await import(MOD("manage.js"));
    const settingsOn = SET.settingsBodyHtml();
    const libraryOn = MG.libraryActionsHtml();
    const shown = settingsOn.indexOf('id="setJoinTeam"') >= 0 && settingsOn.indexOf('<div class="set-label">Team</div>') >= 0
      && settingsOn.indexOf("Join a team") >= 0
      && settingsOn.indexOf("data-forget-lead") >= 0 && settingsOn.indexOf("data-forget-lead") < settingsOn.indexOf('id="setJoinTeam"')
      && libraryOn.indexOf('id="mgImportCatalog"') >= 0 && libraryOn.indexOf('id="mgImportCatalog"') < libraryOn.indexOf('id="mgJoinTeam"')
      && menuJoin.hidden === false;
    const settingsBtn = { classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, hidden: false };
    const settingsMenu = { hidden: true, classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, contains: () => false, onclick: null };
    const moreBtn = { classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, hidden: true };
    const moreMenu = { hidden: true, classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, contains: () => false };
    document.querySelector = sel => (sel === "#settingsBtn" ? settingsBtn : sel === "#settingsMenu" ? settingsMenu
      : sel === "#moreBtn" ? moreBtn : sel === "#moreMenu" ? moreMenu : sel === "[data-join-paste]" ? pasted : null);
    const HM = await import(MOD("header-menus.js"));
    HM.wireHeaderMenus();
    const doorLoads = [];
    HK.hooks.loadCatalogFromFolder = name => { doorLoads.push(String(name)); };
    settingsMenu.onclick({ target: { closest: () => ({ dataset: { act: "join" } }) } });
    const opened = TJ.inviteHeld().mode === "paste" && doorLoads.length === 0 && AS.cards.length === 1;
    tookFn({ sealed: null, join: null, leads: [{ team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: false }] });
    const unseenSettings = SET.settingsBodyHtml(), unseenLibrary = MG.libraryActionsHtml();
    const unseen = unseenSettings.indexOf('id="setJoinTeam"') < 0 && unseenLibrary.indexOf('id="mgJoinTeam"') < 0 && menuJoin.hidden === true;
    tookFn({ sealed: null, join: { file: "a.ec", state: "waiting", code: "", asked: 1, name: "Nia" },
      leads: [{ team: TEAM, print: "abcdabcdabcdabcd", admitted: true, seen: true }] });
    const flightSettings = SET.settingsBodyHtml(), flightLibrary = MG.libraryActionsHtml();
    const flight = flightSettings.indexOf('id="setJoinTeam"') < 0 && flightLibrary.indexOf('id="mgJoinTeam"') < 0 && menuJoin.hidden === true;
    window.E_HOST = {};
    tookFn({ sealed: null, join: null, leads: [seenLead] });
    const noHost = SET.settingsBodyHtml().indexOf('id="setJoinTeam"') < 0 && MG.libraryActionsHtml().indexOf('id="mgJoinTeam"') < 0
      && menuJoin.hidden === true;
    doorNote = [shown, opened, unseen, flight, noHost].join("/");
    check(shown && opened && unseen && flight && noHost,
      "15bj Join a team is in Settings after the lead's key, in the Library after Load, and in the Menu, on a desk that already has a catalog and has seen its lead;"
      + " the Menu opens the paste and loads nothing; the door hides while a key is unseen, while a request is in flight, and with no shell: " + doorNote);
  } catch (e) {
    check(false, "15bj Join a team is in Settings after the lead's key, in the Library after Load, and in the Menu: threw "
      + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
  } finally {
    HK.hooks.loadCatalogFromFolder = wasLoad;
    AS.setCards([]);
    document.createElement = doorWas.createElement;
    document.body = doorWas.body;
    document.getElementById = doorWas.getElementById;
    document.querySelector = doorWas.querySelector;
    if (doorWas.gcs === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = doorWas.gcs;
    if (doorWas.add === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = doorWas.add;
    if (doorWas.remove === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = doorWas.remove;
    if (doorWas.innerWidth === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = doorWas.innerWidth;
    if (doorWas.innerHeight === undefined) delete globalThis.innerHeight; else globalThis.innerHeight = doorWas.innerHeight;
    if (langWas == null) ST.lsDel("eUiLang"); else ST.lsSet("eUiLang", langWas);
  }

  /* Last, over every desk above: the log of each holds none of the secrets any invitation carried. */
  const leaked = [];
  DESKS.forEach(D => D.said.forEach(line => SECRETS.forEach(s => { if (line.indexOf(s) >= 0) leaked.push(line.slice(0, 48)); })));
  check(SECRETS.length >= 10 && leaked.length === 0,
    "15au no invitation's secret reaches the shell's log, through every read, yes and refusal above (" + SECRETS.length + " secrets, "
    + DESKS.length + " desks): leaked " + leaked.length);
} catch (e) {
  check(false, "harness: " + (e && e.stack ? e.stack : e));
}

check(regStand.held(), "rs1 every reg call was answered by the stand-in, the policy key's at least once and no other key of the machine's hive (Windows), none off it (" + regStand.said() + ")");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
