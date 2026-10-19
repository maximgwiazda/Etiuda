/* The etiuda: handler, driven in bare node: the real shell/main.js under stubbed electron.
 * Slice 3, the handler. No window is opened.
 *
 *     node tests/link-handler.mjs        exit code is the number of failed checks, capped at 63
 *
 * Only an argument of the exact form etiuda:join#<base64url> whose document names a relay reaches
 * the confirm. The full URL, a double-wrapped form, more than 8192 characters and a folder
 * document are said and refused, with no I/O and the token unspent. An etiuda: argument is never
 * read as a file. A plant deletes the one line that holds each guard and the file is put back by
 * its sha256.
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
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), { policy: null });

const EXPECTED = 23;
const LINK_FOLDER = "A folder invitation is pasted in Etiuda, not opened from a link";
const LINK_FOLDER_PL = "Zaproszenie do folderu wkleja się w Etiudzie, a nie otwiera z odnośnika.";
const LINK_FORM = "Paste the invitation in Etiuda, which opens an invitation only from its own link.";
const LINK_FORM_PL = "Proszę wkleić zaproszenie w Etiudzie. Etiuda otwiera zaproszenie tylko ze swojego odnośnika.";
const LINK_LONG = "Ask your lead for a new invitation. This one is longer than Etiuda opens.";
const LINK_LONG_PL = "Proszę poprosić lidera o nowe zaproszenie. To jest dłuższe, niż Etiuda otwiera.";
const WIN_LOG = "Windows did not make this desk the program that opens an etiuda: link";
const HOST = "relay.example";
const RELAY_URL = "https://" + HOST + "/v1";
const LEAD = "Nia Pell";

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-link-handler-"));
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
fs.mkdirSync(path.join(LAB, "documents"), { recursive: true });
process.env.ETIUDA_TEST_DOCUMENTS = path.join(LAB, "documents");
process.env.XDG_CURRENT_DESKTOP = "GNOME";
const MAIN = path.join(ROOT, "shell", "main.js");
const pristine = fs.readFileSync(MAIN);
const pristineSha = crypto.createHash("sha256").update(pristine).digest("hex");

const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
const TAIL = "\nreturn { linkFromArg: typeof linkFromArg === \"function\" ? linkFromArg : null,"
  + " acceptLink: typeof acceptLink === \"function\" ? acceptLink : null,"
  + " linkArgFrom: typeof linkArgFrom === \"function\" ? linkArgFrom : null,"
  + " ecFromArgv: ecFromArgv, handPendingLink: typeof handPendingLink === \"function\" ? handPendingLink : null,"
  + " handHeldLink: typeof handHeldLink === \"function\" ? handHeldLink : null,"
  + " bindWindow: w => { theWindow = w; } };";

let loadN = 0;
function loadShell(opts) {
  const o = opts || {};
  const ud = path.join(LAB, "desk-" + (loadN++));
  const cat = path.join(ud, "catalogs");
  fs.mkdirSync(cat, { recursive: true });
  const deskObj = { kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: cat, eUiLang: "en" } };
  if (o.pins) deskObj.teamPins = o.pins;
  const desk = JSON.stringify(deskObj);
  fs.writeFileSync(path.join(ud, "desk.json"), desk, "utf8");
  const said = [], ons = {}, registered = [], sent = [];
  let netHits = 0, windows = 0;
  const win = {
    isDestroyed: () => false, isMinimized: () => false, restore: noop, focus: noop,
    webContents: { send: (ch, ...a) => sent.push([ch].concat(a)), once: noop, on: noop },
  };
  const BrowserWindow = new Proxy(function () {}, {
    get: () => inert, set: () => true, apply: () => undefined,
    construct: () => { windows++; return inert; },
  });
  const electron = {
    app: {
      getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => o.lock === true, quit: noop,
      on: (ev, fn) => { (ons[ev] = ons[ev] || []).push(fn); }, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false, removeSwitch: noop },
      isPackaged: o.packaged === true,
      setAsDefaultProtocolClient: o.register ? (...args) => { registered.push(args); return o.register(); } : undefined,
    },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: BrowserWindow, Menu: inert, dialog: inert, protocol: inert, session: inert, shell: inert,
    screen: inert, systemPreferences: inert, nativeTheme: { themeSource: "system" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8"),
    },
    net: { request: () => { netHits++; return inert; } },
  };
  const quiet = {
    log: s => said.push(String(s)), error: s => said.push("ERR " + String(s)), warn: s => said.push("WARN " + String(s)),
    info: s => said.push("INFO " + String(s)), debug: s => said.push("DEBUG " + String(s)),
  };
  const src = typeof o.src === "string" ? o.src : fs.readFileSync(MAIN, "utf8");
  const api = new Function("require", "__dirname", "__filename", "module", "exports", "console", src + TAIL)(
    n => (n === "electron" ? electron : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  return { api, said, ons, registered, sent, win, ud, desk, netHits: () => netHits, windows: () => windows };
}

const FS_IO = ["statSync", "lstatSync", "readFileSync", "writeFileSync", "appendFileSync", "mkdirSync", "mkdtempSync",
  "openSync", "readdirSync", "unlinkSync", "rmdirSync", "rmSync", "copyFileSync", "watch", "existsSync", "realpathSync",
  "readFile", "writeFile"];
function regCalls() {
  const c = regStand.calls;
  return c.export + c.query + c.other + c.machine + c.user + c.reached;
}
function ioDuring(fn) {
  const fsMod = nodeRequire("node:fs");
  const saved = {};
  let hits = 0;
  for (const n of FS_IO) {
    if (typeof fsMod[n] !== "function") continue;
    saved[n] = fsMod[n];
    fsMod[n] = function () { hits++; return saved[n].apply(this, arguments); };
  }
  const reg0 = regCalls();
  let result = null, err = null;
  try { result = fn(); }
  catch (e) { err = e; }
  finally { for (const n of Object.keys(saved)) fsMod[n] = saved[n]; }
  return { hits, reg: regCalls() - reg0, result, err };
}
function hasBoth(lines, en, pl) {
  return lines.some(l => l.indexOf(en) >= 0 && l.indexOf(pl) >= 0);
}
function withArgv(argv, fn) {
  const prev = process.argv;
  process.argv = argv;
  try { return fn(); }
  finally { process.argv = prev; }
}
function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return fn(); }
  finally { if (had) process.env[name] = prev; else delete process.env[name]; }
}
function lift(tag, fn, file) {
  const target = file || MAIN;
  const beforeBytes = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(beforeBytes).digest("hex");
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      fs.writeFileSync(target, lines.join("\n"));
      turned = fn(fs.readFileSync(target, "utf8")) === true;
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  } finally {
    fs.writeFileSync(target, beforeBytes);
  }
  const back = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex") === digest;
  return { turned, back, detail };
}

const hex = n => crypto.randomBytes(n).toString("hex");
function relayDoc() {
  return {
    team: "t-" + hex(8), secret: hex(16),
    lead: { keyId: "quay-lead", public: hex(32), name: LEAD },
    relay: { rt: hex(16), url: RELAY_URL, token: hex(32), inv: hex(16) },
  };
}
function pack(doc) { return Buffer.from(JSON.stringify(doc)).toString("base64url"); }

try {
  const doc = relayDoc();
  const token = doc.relay.token;
  const b64 = pack(doc);
  const exactArg = "etiuda:join#" + b64;
  const fullUrl = "https://etiuda.dev/join#" + b64;
  const doubleArg = "etiuda:join#etiuda:join#" + b64;
  const folder = process.platform === "win32" ? "C:\\LampShare\\team" : "/lamp-share/team";
  const folderDoc = relayDoc();
  delete folderDoc.relay;
  folderDoc.folder = folder;
  const folderArg = "etiuda:join#" + pack(folderDoc);
  const longArg = "etiuda:join#" + "A".repeat(8193 - "etiuda:join#".length);
  const edgeArg = "etiuda:join#" + "A".repeat(8192 - "etiuda:join#".length);
  const lamp = path.join(LAB, "lamp.ec");
  fs.writeFileSync(lamp, "lamp\n", "utf8");

  let api = null, said = [], ud = "", deskBefore = "", loadError = "";
  try {
    const L = loadShell({ lock: false });
    api = L.api; said = L.said; ud = L.ud; deskBefore = fs.readFileSync(path.join(ud, "desk.json"), "utf8");
  } catch (e) {
    loadError = e && e.stack ? e.stack.split("\n")[0] : String(e);
    console.log("  LOAD " + loadError);
  }
  const deskNow = () => { try { return fs.readFileSync(path.join(ud, "desk.json"), "utf8"); } catch { return ""; } };
  function refused(arg) {
    const snap = said.length;
    const run = ioDuring(() => (api && api.acceptLink ? api.acceptLink(arg) : null));
    return { run, lines: said.slice(snap) };
  }

  const classified = ioDuring(() => (api && api.linkFromArg ? api.linkFromArg(exactArg) : null));
  const opened = api && api.acceptLink ? api.acceptLink(exactArg) : null;
  const mirror = ud ? path.join(ud, "relay", doc.relay.rt) : "";
  check(classified.hits === 0 && classified.reg === 0 && !classified.err
    && classified.result && classified.result.text === "etiuda-join:" + b64
    && classified.result.parsed && classified.result.parsed.relay && classified.result.parsed.relay.url === RELAY_URL
    && opened && opened.confirm === true && opened.text === "etiuda-join:" + b64
    && opened.offer && opened.offer.lead === LEAD && opened.offer.relay === HOST
    && deskNow() === deskBefore && deskNow().indexOf(token) < 0 && !(mirror && fs.existsSync(mirror))
    && said.join("\n").indexOf(token) < 0,
    "3h1 only etiuda:join# and a relay invitation reaches the confirm, the token unspent, the read doing no I/O ("
    + classified.hits + " fs, " + classified.reg + " reg)" + (loadError ? " load: " + loadError : ""));

  const full = refused(fullUrl);
  check(full.run.hits === 0 && full.run.reg === 0 && !full.run.err && full.run.result && full.run.result.confirm !== true
    && full.run.result.refused === LINK_FORM && hasBoth(full.lines, LINK_FORM, LINK_FORM_PL) && deskNow() === deskBefore,
    "3h2 the full URL is refused and said, with no I/O and the token unspent (" + full.run.hits + " fs, " + full.run.reg + " reg)");

  const wrapped = refused(doubleArg);
  check(wrapped.run.hits === 0 && wrapped.run.reg === 0 && !wrapped.run.err && wrapped.run.result && wrapped.run.result.confirm !== true
    && wrapped.run.result.refused === LINK_FORM && hasBoth(wrapped.lines, LINK_FORM, LINK_FORM_PL) && deskNow() === deskBefore,
    "3h3 a double-wrapped form is refused and said, with no I/O and the token unspent (" + wrapped.run.hits + " fs, " + wrapped.run.reg + " reg)");

  const over = refused(longArg);
  const edge = refused(edgeArg);
  check(longArg.length === 8193 && edgeArg.length === 8192
    && over.run.hits === 0 && over.run.reg === 0 && !over.run.err && over.run.result && over.run.result.confirm !== true
    && over.run.result.refused === LINK_LONG && hasBoth(over.lines, LINK_LONG, LINK_LONG_PL)
    && edge.run.hits === 0 && edge.run.reg === 0 && edge.run.result && edge.run.result.confirm !== true
    && edge.run.result.refused !== LINK_LONG && deskNow() === deskBefore,
    "3h4 8193 characters are refused as too long and 8192 is not that refusal, with no I/O (" + over.run.hits + " fs, " + over.run.reg + " reg)");

  const folded = refused(folderArg);
  check(folded.run.hits === 0 && folded.run.reg === 0 && !folded.run.err && folded.run.result && folded.run.result.confirm !== true
    && folded.run.result.refused === LINK_FOLDER && hasBoth(folded.lines, LINK_FOLDER, LINK_FOLDER_PL) && deskNow() === deskBefore,
    "3h5 a folder document is refused with the folder sentence, with no I/O and the token unspent ("
    + folded.run.hits + " fs, " + folded.run.reg + " reg)");

  let etiudaStats = 0;
  const fsMod = nodeRequire("node:fs");
  const origStat = fsMod.statSync;
  fsMod.statSync = function (p) {
    if (String(p).slice(0, 7).toLowerCase() === "etiuda:") etiudaStats++;
    return origStat.apply(this, arguments);
  };
  let resolved = "";
  try { resolved = api && api.ecFromArgv ? api.ecFromArgv(["Etiuda.exe", "etiuda:not-a-file.ec", "ETIUDA:also.ec", lamp]) : ""; }
  finally { fsMod.statSync = origStat; }
  const plain = api && api.linkFromArg ? api.linkFromArg(lamp) : "missing";
  check(etiudaStats === 0 && resolved === path.resolve(lamp) && plain === null,
    "3h6 an etiuda: argument is never read as a file (" + etiudaStats + " stat(s)), and a real catalog still resolves");

  let secondError = "";
  let handler = null, sent = [], said2 = [], ud2 = "", desk2 = "";
  try {
    const S = loadShell({ lock: true, register: () => true });
    handler = (S.ons["second-instance"] || [])[0] || null;
    sent = S.sent; said2 = S.said; ud2 = S.ud; desk2 = S.desk;
    S.api.bindWindow(S.win);
  } catch (e) { secondError = e && e.message ? e.message : String(e); }
  const snap2 = said2.length;
  const secondNo = ioDuring(() => (handler ? handler({}, ["Etiuda.exe", fullUrl]) : null));
  const saidNoLines = said2.slice(snap2);
  const beforeSent = sent.length;
  if (handler) handler({}, ["Etiuda.exe", exactArg]);
  const offered = sent.slice(beforeSent).filter(m => m[0] === "etiuda:team-join" && m[1] && m[1].offer && m[1].offer.relay === HOST && m[1].offer.lead === LEAD);
  const desk2Now = () => { try { return fs.readFileSync(path.join(ud2, "desk.json"), "utf8"); } catch { return ""; } };
  check(!!handler && secondNo.hits === 0 && secondNo.reg === 0 && hasBoth(saidNoLines, LINK_FORM, LINK_FORM_PL)
    && offered.length === 1 && desk2Now() === desk2 && desk2Now().indexOf(token) < 0 && !secondError,
    "3h7 a second launch hands the link to the running desk and a refused one is said with no I/O ("
    + secondNo.hits + " fs, " + offered.length + " confirm(s))" + (secondError ? " " + secondError : ""));

  function regLine(L) {
    const n = L.registered.length;
    const scheme = n && L.registered[0] ? String(L.registered[0][0]) : "";
    const argc = n && L.registered[0] ? L.registered[0].length : 0;
    const saidNo = L.said.some(l => l.indexOf(WIN_LOG) >= 0);
    return n + ":" + scheme + ":" + argc + ":" + saidNo;
  }
  let packedNo = "", packedYes = "", loose = "", harness = "", regError = "";
  try {
    const no = withEnv("ETIUDA_TEST_DOCUMENTS", undefined, () => loadShell({ lock: true, packaged: true, register: () => false }));
    const yes = withEnv("ETIUDA_TEST_DOCUMENTS", undefined, () => loadShell({ lock: true, packaged: true, register: () => true }));
    const dev = withEnv("ETIUDA_TEST_DOCUMENTS", undefined, () => loadShell({ lock: true, packaged: false, register: () => true }));
    const lab = loadShell({ lock: true, packaged: true, register: () => true });
    packedNo = regLine(no);
    packedYes = regLine(yes);
    loose = regLine(dev);
    harness = regLine(lab);
  } catch (e) { regError = e && e.message ? e.message : String(e); }
  const quiet = "0::0:false";
  const winOk = process.platform === "win32"
    ? packedNo === "1:etiuda:1:true" && packedYes === "1:etiuda:1:false" && loose === quiet && harness === quiet
    : packedNo === quiet && packedYes === quiet && loose === quiet && harness === quiet;
  check(winOk && !regError, "3h8 a packaged start asks once to open etiuda:, an unpackaged start does not, and a packaged start under the harness does not ("
    + process.platform + ", " + packedNo + " / " + packedYes + " / " + loose + " / " + harness + ")"
    + (regError ? " " + regError : ""));

  const packPlant = lift("plant:link-pack", src => {
    const dev = withEnv("ETIUDA_TEST_DOCUMENTS", undefined, () => loadShell({ lock: true, packaged: false, register: () => true, src: src }));
    return process.platform === "win32" && dev.registered.length === 1;
  });
  const packLine = packPlant.detail !== "plant line absent";
  check(packPlant.back && (process.platform === "win32" ? packPlant.turned : packLine),
    "3he lifting plant:link-pack lets an unpackaged start register etiuda:, and the file is put back: "
    + packPlant.detail + ", sha " + (packPlant.back ? "restored" : "differs"));

  function formRefused(arg) {
    const r = refused(arg);
    return !!(r.run && r.run.result && r.run.result.confirm !== true && r.run.result.refused === LINK_FORM
      && hasBoth(r.lines, LINK_FORM, LINK_FORM_PL) && r.run.hits === 0 && r.run.reg === 0);
  }
  let padded = "", slashed = "";
  for (let i = 0; i < 40 && (padded.indexOf("+") < 0 || slashed.indexOf("/") < 0); i++) {
    const plusDoc = relayDoc(); plusDoc.lead.name = "Nia " + "~".repeat(12);
    const slashDoc = relayDoc(); slashDoc.lead.name = "Nia " + "?".repeat(12);
    const pb = Buffer.from(JSON.stringify(plusDoc)).toString("base64");
    const sb = Buffer.from(JSON.stringify(slashDoc)).toString("base64");
    if (padded.indexOf("+") < 0 && pb.indexOf("+") >= 0) padded = pb;
    if (slashed.indexOf("/") < 0 && sb.indexOf("/") >= 0) slashed = sb;
  }
  const equals = Buffer.from(JSON.stringify(doc)).toString("base64");
  const newlineArg = exactArg + "\n";
  const badAlphabet = formRefused("etiuda:join#" + padded) && padded.indexOf("+") >= 0
    && formRefused("etiuda:join#" + slashed) && slashed.indexOf("/") >= 0
    && formRefused("etiuda:join#" + equals) && equals.indexOf("=") >= 0
    && formRefused(newlineArg);
  const b64Plant = lift("plant:link-b64", src => {
    const L = loadShell({ lock: false, src: src });
    const a = L.api.acceptLink("etiuda:join#" + equals);
    const n = L.api.acceptLink(newlineArg);
    return !!(a && a.confirm === true && a.offer && a.offer.relay === HOST && n && n.confirm === true && n.offer && n.offer.relay === HOST);
  });
  check(badAlphabet && b64Plant.turned && b64Plant.back,
    "3hf a payload with +, / or = padding, or a trailing newline, is refused, and lifting plant:link-b64 lets it through: "
    + (padded.indexOf("+") >= 0) + "/" + (slashed.indexOf("/") >= 0) + "/" + (equals.indexOf("=") >= 0) + ", "
    + b64Plant.detail + ", sha " + (b64Plant.back ? "restored" : "differs"));

  const pasteArg = "etiuda-join:" + b64;
  const pasted = refused(pasteArg);
  const pasteOk = formRefused(pasteArg) && pasted.run.hits === 0;
  const pastePlant = lift("plant:link-paste", src => {
    const L = loadShell({ lock: false, src: src });
    const snap = L.said.length;
    const a = L.api.acceptLink(pasteArg);
    return (!a || a.confirm !== true) && !hasBoth(L.said.slice(snap), LINK_FORM, LINK_FORM_PL);
  });
  check(pasteOk && pastePlant.turned && pastePlant.back,
    "3hg an etiuda-join: argument is refused and said, and lifting plant:link-paste drops that refusal: "
    + pastePlant.detail + ", sha " + (pastePlant.back ? "restored" : "differs"));

  const otherPub = "ab".repeat(32);
  const pinned = loadShell({ lock: false, pins: { [doc.team]: { keyId: "other-quay", public: otherPub } } });
  const pinSnap = pinned.sent.length;
  const pinAns = pinned.api.acceptLink(exactArg);
  const pinOffers = pinned.sent.slice(pinSnap).filter(m => m[1] && m[1].offer);
  const pinOk = doc.lead.public !== otherPub && pinAns && pinAns.confirm !== true && pinOffers.length === 0;
  const offerPlant = lift("plant:link-offer", src => {
    const L = loadShell({ lock: false, pins: { [doc.team]: { keyId: "other-quay", public: otherPub } }, src: src });
    const a = L.api.acceptLink(exactArg);
    return !!(a && a.confirm === true);
  });
  check(pinOk && offerPlant.turned && offerPlant.back,
    "3hh a link readInvite refuses gives no confirm and sends no offer, and lifting plant:link-offer confirms: "
    + (pinAns && pinAns.refused) + ", offers " + pinOffers.length + ", " + offerPlant.detail
    + ", sha " + (offerPlant.back ? "restored" : "differs"));

  const early = withArgv(["Etiuda.exe", fullUrl], () => loadShell({ lock: true, packaged: true }));
  const earlyOffers = early.sent.filter(m => m[1] && m[1].offer);
  const earlyOk = early.windows() === 0 && earlyOffers.length === 0 && hasBoth(early.said, LINK_FORM, LINK_FORM_PL);
  const earlyPlant = lift("plant:link-early", src => {
    const L = withArgv(["Etiuda.exe", fullUrl], () => loadShell({ lock: true, packaged: true, src: src }));
    return L.windows() === 0 && !hasBoth(L.said, LINK_FORM, LINK_FORM_PL);
  });
  check(earlyOk && earlyPlant.turned && earlyPlant.back,
    "3hi a refused link in argv is said before any window exists, and lifting plant:link-early says nothing: windows "
    + early.windows() + ", " + earlyPlant.detail + ", sha " + (earlyPlant.back ? "restored" : "differs"));

  const heldLoad = withArgv(["Etiuda.exe", exactArg], () => loadShell({ lock: true, packaged: true }));
  heldLoad.api.bindWindow(heldLoad.win);
  const beforeHold = heldLoad.sent.length;
  const netHold = heldLoad.netHits();
  heldLoad.api.handHeldLink(heldLoad.win);
  const heldOffers = heldLoad.sent.slice(beforeHold).filter(m => m[0] === "etiuda:team-join" && m[1] && m[1].offer && m[1].offer.relay === HOST && m[1].offer.lead === LEAD);
  const holdOk = beforeHold === 0 && heldOffers.length === 1 && heldLoad.netHits() === netHold && heldLoad.windows() === 0;
  const holdPlant = lift("plant:link-hold", src => {
    const L = withArgv(["Etiuda.exe", exactArg], () => loadShell({ lock: true, packaged: true, src: src }));
    L.api.bindWindow(L.win);
    const n = L.sent.length;
    L.api.handHeldLink(L.win);
    return L.sent.slice(n).filter(m => m[1] && m[1].offer).length === 0;
  });
  check(holdOk && holdPlant.turned && holdPlant.back,
    "3hj a good link in argv calls nothing until the load handler, then sends one offer, and lifting plant:link-hold sends none: sent before "
    + beforeHold + ", after " + heldOffers.length + ", " + holdPlant.detail + ", sha " + (holdPlant.back ? "restored" : "differs"));

  function createRegisters(src) {
    const at = src.indexOf("function createWindow(");
    const end = src.indexOf("function routeTabChord(");
    if (at < 0 || end < at) return false;
    return src.slice(at, end).indexOf('on("did-finish-load", () => { handHeldLink(win); })') >= 0;
  }
  const registeredNow = createRegisters(fs.readFileSync(MAIN, "utf8"));
  const loadPlant = lift("plant:link-load", src => !createRegisters(src));
  check(registeredNow && loadPlant.turned && loadPlant.back,
    "3hk createWindow registers the load handler that hands the held link, and lifting plant:link-load drops it: "
    + loadPlant.detail + ", sha " + (loadPlant.back ? "restored" : "differs"));

  const quietSecond = loadShell({ lock: true, packaged: true });
  const secondHandler = (quietSecond.ons["second-instance"] || [])[0] || null;
  if (secondHandler) secondHandler({}, ["Etiuda.exe", exactArg]);
  const midOffers = quietSecond.sent.filter(m => m[1] && m[1].offer);
  quietSecond.api.bindWindow(quietSecond.win);
  quietSecond.api.handHeldLink(quietSecond.win);
  const lateOffers = quietSecond.sent.filter(m => m[0] === "etiuda:team-join" && m[1] && m[1].offer && m[1].offer.lead === LEAD && m[1].offer.relay === HOST);
  const pendingOk = !!secondHandler && midOffers.length === 0 && lateOffers.length === 1;
  const pendingPlant = lift("plant:link-pending", src => {
    const L = loadShell({ lock: true, packaged: true, src: src });
    const h = (L.ons["second-instance"] || [])[0];
    if (h) h({}, ["Etiuda.exe", exactArg]);
    L.api.bindWindow(L.win);
    L.api.handHeldLink(L.win);
    return L.sent.filter(m => m[1] && m[1].offer).length === 0;
  });
  check(pendingOk && pendingPlant.turned && pendingPlant.back,
    "3hl a second-instance link with no window is sent once the page loads, and lifting plant:link-pending sends none: mid "
    + midOffers.length + ", later " + lateOffers.length + ", " + pendingPlant.detail + ", sha " + (pendingPlant.back ? "restored" : "differs"));

  const PROTOCOLS = [{ name: "Etiuda", schemes: ["etiuda"] }];
  function protocolsMatch() {
    const file = path.join(ROOT, "electron-builder.js");
    const key = nodeRequire.resolve(file);
    delete nodeRequire.cache[key];
    let cfg = null;
    try { cfg = nodeRequire(file); }
    catch (e) { return false; }
    return JSON.stringify(cfg && cfg.protocols) === JSON.stringify(PROTOCOLS);
  }
  const protocolsNow = protocolsMatch();
  const protocolsPlant = lift("plant:link-protocols", () => {
    const file = path.join(ROOT, "electron-builder.js");
    const key = nodeRequire.resolve(file);
    delete nodeRequire.cache[key];
    let cfg = null;
    try { cfg = nodeRequire(file); }
    catch (e) { return false; }
    return JSON.stringify(cfg && cfg.protocols) !== JSON.stringify(PROTOCOLS);
  }, path.join(ROOT, "electron-builder.js"));
  check(protocolsNow && protocolsPlant.turned && protocolsPlant.back,
    "3h9 electron-builder.js protocols deep-compare to [{name:\"Etiuda\", schemes:[\"etiuda\"]}], and lifting plant:link-protocols drops the compare: "
    + protocolsPlant.detail + ", sha " + (protocolsPlant.back ? "restored" : "differs"));

  const legsFile = path.join(ROOT, "tools", "ci-legs.mjs");
  const legLine = '{ id: "link-handler", args: ["tests/link-handler.mjs"], where: "linux-ok" }';
  function linkLegNamed(src) {
    const at = src.indexOf('{ id: "team-join"');
    const next = src.indexOf('{ id: "desk-ipc"');
    return at >= 0 && next > at && src.slice(at, next).indexOf(legLine) >= 0;
  }
  const legsNow = linkLegNamed(fs.readFileSync(legsFile, "utf8"));
  const legsPlant = lift("plant:link-leg", src => !linkLegNamed(src), legsFile);
  check(legsNow && legsPlant.turned && legsPlant.back,
    "3hm tools/ci-legs.mjs names link-handler beside team-join, and lifting plant:link-leg drops it: "
    + (legsNow ? "named" : "unnamed") + ", " + legsPlant.detail + ", sha " + (legsPlant.back ? "restored" : "differs"));

  const formPlant = lift("plant:link-form", src => {
    const L = loadShell({ lock: false, src });
    const a = L.api.acceptLink(fullUrl), b = L.api.acceptLink(doubleArg);
    return !!(a && a.confirm === true && a.offer && a.offer.relay === HOST && b && b.confirm === true && b.offer && b.offer.relay === HOST);
  });
  check(formPlant.turned && formPlant.back, "3ha lifting plant:link-form lets the full URL and the double-wrapped form reach the confirm, and the file is put back: "
    + formPlant.detail + ", sha " + (formPlant.back ? "restored" : "differs"));

  const capPlant = lift("plant:link-cap", src => {
    const L = loadShell({ lock: false, src });
    const run = ioDuring(() => L.api.acceptLink(longArg));
    const lines = L.said;
    return run.hits === 0 && run.reg === 0 && !(run.result && run.result.confirm) && !hasBoth(lines, LINK_LONG, LINK_LONG_PL);
  });
  check(capPlant.turned && capPlant.back, "3hb lifting plant:link-cap drops the length sentence and still does not confirm, and the file is put back: "
    + capPlant.detail + ", sha " + (capPlant.back ? "restored" : "differs"));

  const folderPlant = lift("plant:link-folder", src => {
    const L = loadShell({ lock: false, src });
    const a = L.api.acceptLink(folderArg);
    return !!(a && a.confirm === true && a.offer && a.offer.lead === LEAD && !a.offer.relay);
  });
  check(folderPlant.turned && folderPlant.back, "3hc lifting plant:link-folder lets a folder document reach the confirm, and the file is put back: "
    + folderPlant.detail + ", sha " + (folderPlant.back ? "restored" : "differs"));

  const filePlant = lift("plant:link-file", src => {
    let n = 0;
    const live = nodeRequire("node:fs");
    const orig = live.statSync;
    live.statSync = function (p) {
      if (String(p).slice(0, 7).toLowerCase() === "etiuda:") n++;
      return orig.apply(this, arguments);
    };
    try {
      const L = loadShell({ lock: false, src });
      L.api.ecFromArgv(["Etiuda.exe", "etiuda:not-a-file.ec"]);
      return n >= 1;
    } finally { live.statSync = orig; }
  });
  check(filePlant.turned && filePlant.back, "3hd lifting plant:link-file reads an etiuda: argument as a file, and the file is put back: "
    + filePlant.detail + ", sha " + (filePlant.back ? "restored" : "differs"));

  check(regStand.held(), "3h0 every reg call was answered by the stand-in (" + regStand.said() + ")");
} finally {
  if (crypto.createHash("sha256").update(fs.readFileSync(MAIN)).digest("hex") !== pristineSha) fs.writeFileSync(MAIN, pristine);
}

const code = asserted === EXPECTED ? Math.min(failed, 63) : 78;
console.log("link-handler: asserted " + asserted + " failed " + failed + " exit " + code);
process.exit(code);
