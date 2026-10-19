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

const EXPECTED = 15;
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
  + " bindWindow: w => { theWindow = w; } };";

let loadN = 0;
function loadShell(opts) {
  const o = opts || {};
  const ud = path.join(LAB, "desk-" + (loadN++));
  const cat = path.join(ud, "catalogs");
  fs.mkdirSync(cat, { recursive: true });
  const desk = JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: cat, eUiLang: "en" } });
  fs.writeFileSync(path.join(ud, "desk.json"), desk, "utf8");
  const said = [], ons = {}, registered = [], sent = [];
  let netHits = 0;
  const win = {
    isDestroyed: () => false, isMinimized: () => false, restore: noop, focus: noop,
    webContents: { send: (ch, ...a) => sent.push([ch].concat(a)), once: noop, on: noop },
  };
  const electron = {
    app: {
      getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => o.lock === true, quit: noop,
      on: (ev, fn) => { (ons[ev] = ons[ev] || []).push(fn); }, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop, hasSwitch: () => false, removeSwitch: noop },
      isPackaged: o.packaged === true,
      setAsDefaultProtocolClient: o.register ? (...args) => { registered.push(args); return o.register(); } : undefined,
    },
    ipcMain: { on: noop, handle: noop },
    BrowserWindow: inert, Menu: inert, dialog: inert, protocol: inert, session: inert, shell: inert,
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
  return { api, said, ons, registered, sent, win, ud, desk, netHits: () => netHits };
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
function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return fn(); }
  finally { if (had) process.env[name] = prev; else delete process.env[name]; }
}
function lift(tag, fn) {
  const beforeBytes = fs.readFileSync(MAIN);
  const digest = crypto.createHash("sha256").update(beforeBytes).digest("hex");
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      fs.writeFileSync(MAIN, lines.join("\n"));
      turned = fn(fs.readFileSync(MAIN, "utf8")) === true;
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  } finally {
    fs.writeFileSync(MAIN, beforeBytes);
  }
  const back = crypto.createHash("sha256").update(fs.readFileSync(MAIN)).digest("hex") === digest;
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

  const builder = fs.readFileSync(path.join(ROOT, "electron-builder.js"), "utf8");
  check(builder.indexOf("MimeType=x-scheme-handler/etiuda;") >= 0 && /schemes:\s*\[\s*"etiuda"\s*\]/.test(builder),
    "3h9 the Linux packaging names MimeType=x-scheme-handler/etiuda; and the etiuda scheme");

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
