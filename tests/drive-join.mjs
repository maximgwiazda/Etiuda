/* A Drive team folder is found on any desk however Drive is installed (board 955, condition 2). An invitation made on
 * G:\Shared drives\Team joins with no picker on a desk whose folder is under Shared drives in Polish, on one with only
 * .shortcut-targets-by-id\<id>\Team, and on one whose Drive root only HKLM names, its folders in a language no list holds.
 * The shell is the shipped one, loaded in bare node. G: and H: are lab folders; every other drive letter answers as
 * absent, and every registry read is tests/reg-stand.cjs, which counts a write and never reaches the machine.
 * Each guard is lifted from a copy of the shell, and the scene it guards turns. The pure rules are sliced as Studio
 * slices them: what a place stores, the spellings, the look's bound and its mapped letters, and the places of every
 * other kind giving the candidates they gave before.
 *
 *     node tests/drive-join.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLab } from "./lab-owner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const STAND = { policy: null };
const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), STAND);
const EXPECTED = 11;
let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const LAB = createLab("etiuda-drive-join-");
const APP = path.join(LAB, "app");
fs.cpSync(path.join(ROOT, "shell"), path.join(APP, "shell"), { recursive: true });
const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
/* Drive's Polish names for My Drive and Shared drives, by code point. */
const POLISH_MINE = "M" + String.fromCharCode(0xf3) + "j dysk";
const POLISH_SHARED = "Dyski wsp" + String.fromCharCode(0xf3, 0x142) + "dzielone";
const SHORT_ID = "ab12cd34ef56";

function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("no " + JSON.stringify(marker));
  if (src.indexOf(marker, at + 1) >= 0) throw new Error(JSON.stringify(marker) + " twice");
  const isFn = marker.startsWith("function") || marker.startsWith("async function");
  let par = 0, brk = 0, brc = 0, saw = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; saw = true; }
    else if (ch === "}") {
      brc--;
      if (isFn && saw && !par && !brk && !brc) return src.slice(at, i + 1);
    } else if (ch === ";" && !isFn && !par && !brk && !brc) return src.slice(at, i + 1);
  }
  throw new Error("unterminated " + marker);
}
/* Studio's slice, with driveSeen beside it. */
const PLACE_DECLS = ["function placeKindOk(", "function driveTops(", "function placeSlash(", "function placeLeaf(", "function placeJoin(",
  "function placeUnder(", "function placeRest(", "function syncRootsFrom(", "function placeOf(",
  "function placeCandidates(", "function placeResolve(", "function placeKept(", "function readSyncRecords(", "async function driveSeen("];
function placeApi(src) {
  const body = PLACE_DECLS.map(m => sliceDecl(src, m)).join("\n");
  return new Function("crypto", "Buffer", body + "\nreturn { placeOf, placeCandidates, placeResolve, syncRootsFrom, readSyncRecords, driveSeen, placeKept };")(crypto, Buffer);
}
const lifted = tag => {
  const lines = SRC.split("\n");
  const at = lines.findIndex(l => l.indexOf("plant:" + tag) >= 0);
  if (at < 0) return null;
  lines.splice(at, 1);
  return lines.join("\n");
};

/* G: and H: as lab folders. Any other bare letter is absent, so the look reads nothing of this machine's drives. */
function mappedFs(labs) {
  const map = p => {
    if (typeof p !== "string") return { kind: "pass" };
    const m = /^([A-Za-z]):(?:[\\/](.*))?$/.exec(p);
    if (!m) return { kind: "pass" };
    const letter = m[1].toUpperCase();
    const rest = (m[2] || "").replace(/\//g, "\\").replace(/\\+$/, "");
    if (letter === "G" || letter === "H") return { kind: "path", path: rest ? path.win32.join(labs[letter], rest) : labs[letter] };
    if (!rest) return { kind: "absent" };
    return { kind: "pass" };
  };
  const enoent = () => Object.assign(new Error("ENOENT: lab letter absent"), { code: "ENOENT" });
  const wrap = (fn, thisArg, args, two, promised) => {
    const next = args.slice();
    for (let i = 0; i < (two ? 2 : 1) && i < next.length; i++) {
      const m = map(next[i]);
      if (m.kind === "absent") {
        if (promised) return Promise.reject(enoent());
        if (fn === fs.existsSync) return false;
        throw enoent();
      }
      if (m.kind === "path") next[i] = m.path;
    }
    return fn.apply(thisArg, next);
  };
  const pathy = /^(readdirSync|statSync|lstatSync|existsSync|mkdirSync|writeFileSync|readFileSync|openSync|renameSync|copyFileSync|unlinkSync|accessSync|rmSync|realpathSync|appendFileSync)$/;
  const twoArg = { stat: 1, lstat: 1, access: 1, readdir: 1, mkdir: 1, readFile: 1, writeFile: 1, open: 1, unlink: 1, rm: 1, realpath: 1, appendFile: 1, rename: 2, copyFile: 2 };
  return new Proxy(fs, {
    get(obj, prop) {
      if (prop === "promises") {
        return new Proxy(fs.promises, {
          get(pobj, pprop) {
            const v = pobj[pprop];
            if (typeof v !== "function") return v;
            if (!twoArg[pprop]) return v.bind(pobj);
            return (...args) => wrap(v, pobj, args, twoArg[pprop] === 2, true);
          }
        });
      }
      const v = obj[prop];
      if (typeof v !== "function") return v;
      if (!pathy.test(String(prop))) return v.bind(obj);
      return (...args) => wrap(v, obj, args, prop === "renameSync" || prop === "copyFileSync", false);
    }
  });
}

const ENGINE_FRAME = { parent: null, url: "file:///C:/lab/engine/etiuda.html" };
const noop = () => {};
const inert = new Proxy(function () {}, { get: () => inert, set: () => true, apply: () => undefined });
function loadDesk(ud, mapped, picks, src) {
  const invoke = {};
  const quiet = { log: noop, error: noop, warn: noop, info: noop, debug: noop };
  const electron = {
    app: { getPath: () => ud, setPath: noop, requestSingleInstanceLock: () => false, quit: noop, on: noop, getVersion: () => "0.0.0",
      whenReady: () => new Promise(noop), commandLine: { appendSwitch: noop } },
    ipcMain: { on: noop, handle: (ch, fn) => { invoke[ch] = fn; } },
    BrowserWindow: inert, Menu: inert,
    dialog: { showOpenDialog: async () => { picks.n++; return { canceled: true, filePaths: [] }; } },
    net: inert, protocol: inert, session: inert, shell: inert, screen: inert, systemPreferences: inert,
    nativeTheme: { themeSource: "system" },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: s => Buffer.from(Buffer.from(String(s), "utf8").map(b => b ^ 0x5a)),
      decryptString: b => Buffer.from(Buffer.from(b).map(x => x ^ 0x5a)).toString("utf8")
    }
  };
  process.env.XDG_CURRENT_DESKTOP = "GNOME";
  new Function("require", "__dirname", "__filename", "module", "exports", "console", src)(
    n => (n === "electron" ? electron : (n === "node:fs" || n === "fs") ? mapped : nodeRequire(n)),
    path.join(APP, "shell"), path.join(APP, "shell", "main.js"), { exports: {} }, {}, quiet);
  const event = () => ({ sender: { id: 1, once: noop }, senderFrame: ENGINE_FRAME, returnValue: undefined });
  return { ask: (ch, ...args) => Promise.resolve(invoke[ch](event(), ...args)) };
}

function codeFor(secret, pub) {
  const mac = crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(Buffer.from(pub, "hex")).digest();
  return String(mac.readUIntBE(0, 6) % 100000).padStart(5, "0");
}

const P = placeApi(SRC);
const place = P.placeOf("G:\\Shared drives\\Team", P.syncRootsFrom({ gdrive: ["G:\\"] }));
const lead = { keyId: "lamp-lead", public: crypto.randomBytes(32).toString("hex"), name: "Lamp lead" };
function invitation() {
  const secret = crypto.randomBytes(16).toString("hex");
  const doc = { team: "t-" + crypto.randomBytes(8).toString("hex"), folder: "G:\\Shared drives\\Team", lead: lead, secret: secret, place: place };
  return { blob: "etiuda-join:" + Buffer.from(JSON.stringify(doc)).toString("base64url"), code: codeFor(secret, lead.public) };
}

let scene = 0;
/* One desk joining one invitation, its drives laid out by `fill`, from the shell text `src`. */
async function joinAt(fill, src) {
  const name = "s" + (++scene);
  const labs = { G: path.join(LAB, name, "G"), H: path.join(LAB, name, "H") };
  fs.mkdirSync(labs.G, { recursive: true });
  fs.mkdirSync(labs.H, { recursive: true });
  fill(labs);
  const ud = path.join(LAB, name, "desk");
  const own = path.join(LAB, name, "own");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(own, { recursive: true });
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify({ kind: "etiuda-desk", schema: 1, keys: { eCatalogFolder: own, eUiLang: "en" } }), "utf8");
  const picks = { n: 0 };
  const inv = invitation();
  let res = null, offer = null, err = "";
  try {
    const desk = loadDesk(ud, mappedFs(labs), picks, src || SRC);
    await desk.ask("etiuda:branch-identity", true);
    const read = await desk.ask("etiuda:team-join", "read", inv.blob);
    offer = read && read.offer ? read.offer : null;
    res = await desk.ask("etiuda:team-join", "invite", inv.blob, "Ada", inv.code);
  } catch (e) { err = e && e.stack ? e.stack.split("\n")[0] : String(e); }
  return { labs, picks: picks.n, res, offer, err };
}
const joinIn = dir => {
  const desks = path.join(dir, "desks");
  if (!fs.existsSync(desks)) return "";
  for (const id of fs.readdirSync(desks)) {
    const file = path.join(desks, id, "join.json");
    if (fs.existsSync(file)) return file;
  }
  return "";
};
const waiting = r => !r.err && r.picks === 0 && r.res && r.res.join && r.res.join.state === "waiting" && !r.res.refused && !r.res.canceled;
const said = r => "picks " + r.picks + (r.res && r.res.refused ? ", refused " + r.res.refused : "") + (r.res && r.res.canceled ? ", canceled" : "")
  + (r.err ? ", " + r.err : "");

/* The Polish desk: Drive on H: with no record anywhere, found by its folders. */
const polishFill = labs => {
  fs.mkdirSync(path.join(labs.H, POLISH_MINE), { recursive: true });
  fs.mkdirSync(path.join(labs.H, POLISH_SHARED, "Team"), { recursive: true });
};
const polishGreen = r => waiting(r) && !!joinIn(path.join(r.labs.H, POLISH_SHARED, "Team")) && !fs.existsSync(path.join(r.labs.H, "Shared drives"));
/* The shortcut desk: the folder only as a shortcut's target. */
const shortcutFill = labs => {
  fs.mkdirSync(path.join(labs.H, POLISH_MINE), { recursive: true });
  fs.mkdirSync(path.join(labs.H, POLISH_SHARED), { recursive: true });
  fs.mkdirSync(path.join(labs.H, ".shortcut-targets-by-id", SHORT_ID, "Team"), { recursive: true });
};
const shortcutGreen = r => waiting(r) && !!joinIn(path.join(r.labs.H, ".shortcut-targets-by-id", SHORT_ID, "Team"))
  && !fs.existsSync(path.join(r.labs.H, POLISH_SHARED, "Team"));
/* The machine-wide desk: HKLM's WOW6432Node key names H, a bare letter, and Drive's folders there are in a language no list
   holds, so no scan recognises it. The folder beside the right one, sorted first, answers a parent's stat. */
const machineFill = labs => {
  fs.mkdirSync(path.join(labs.H, "Lab Mine"), { recursive: true });
  fs.mkdirSync(path.join(labs.H, "Lab Teams", "Team"), { recursive: true });
};
const machineGreen = r => waiting(r) && !!joinIn(path.join(r.labs.H, "Lab Teams", "Team")) && !fs.existsSync(path.join(r.labs.H, "Lab Mine", "Team"));
const MACHINE_DRIVE = { "HKLM\\SOFTWARE\\WOW6432Node\\Google\\DriveFS": "H" };

const polish = await joinAt(polishFill);
check(!!place && place.kind === "gdrive" && place.root === "Shared drives" && place.rel === "Team" && polishGreen(polish)
    && !!polish.offer && polish.offer.how === "root" && polish.offer.folder === "H:\\" + POLISH_SHARED + "\\Team",
  "955c an invitation made on G:\\Shared drives\\Team joins with no picker into H:\\" + POLISH_SHARED + "\\Team on a desk with no"
  + " record of Drive, and the confirm shows that folder: place " + (place ? place.root + " / " + place.rel : "none")
  + ", confirm " + (polish.offer ? polish.offer.how + " " + polish.offer.folder : "none") + ", " + said(polish));

const shortcut = await joinAt(shortcutFill);
check(shortcutGreen(shortcut),
  "955d the same invitation joins with no picker into H:\\.shortcut-targets-by-id\\" + SHORT_ID + "\\Team where the folder is only"
  + " a shortcut's target: " + said(shortcut));

STAND.drive = MACHINE_DRIVE;
const before = Object.assign({}, regStand.calls);
const machine = await joinAt(machineFill);
const asked = { drive: regStand.calls.drive - before.drive, machine: regStand.calls.machine - before.machine, reached: regStand.calls.reached - before.reached };
check(machineGreen(machine) && asked.drive >= 3 && asked.machine === 0 && asked.reached === 0 && regStand.held(),
  "955e a desk whose Drive root only HKLM's WOW6432Node key names, as a bare letter, its folders in an unlisted language, joins"
  + " with no picker into the folder that holds the team, and the registry was only read: " + said(machine)
  + ", " + asked.drive + " DriveFS queries, " + asked.machine + " other machine reads, " + asked.reached + " past the stand-in");
STAND.drive = undefined;

/* Each guard lifted from a copy of the shell turns its scene. */
const turns = [
  ["drive-scan", polishFill, polishGreen, null, "955f lifting plant:drive-scan leaves the Polish desk at the picker"],
  ["drive-links", shortcutFill, shortcutGreen, null, "955g lifting plant:drive-links leaves the shortcut desk at the picker"],
  ["drive-hklm", machineFill, machineGreen, MACHINE_DRIVE, "955h lifting plant:drive-hklm leaves the machine-wide desk at the picker"],
  ["drive-itself", machineFill, machineGreen, MACHINE_DRIVE, "955i lifting plant:drive-itself takes the folder beside the right one, and the join fails there"]
];
for (const [tag, fill, green, drive, line] of turns) {
  const src = lifted(tag);
  STAND.drive = drive || undefined;
  const r = src ? await joinAt(fill, src) : null;
  STAND.drive = undefined;
  check(!!r && !green(r), line + ": " + (r ? said(r) + (tag === "drive-itself" && fs.existsSync(path.join(r.labs.H, "Lab Mine", "Team")) ? ", Lab Mine\\Team written" : "") : "no plant"));
}

/* The pure rules, sliced. */
const tailLifted = (() => { try { return placeApi(lifted("drive-tail")); } catch (e) { return null; } })();
const tailPlace = tailLifted ? tailLifted.placeOf("G:\\Shared drives\\Team", tailLifted.syncRootsFrom({ gdrive: ["G:"] })) : null;
const linkPlace = P.placeOf("G:\\.shortcut-targets-by-id\\" + SHORT_ID + "\\Team\\Desk", P.syncRootsFrom({ gdrive: ["G:"] }));
const bare = P.placeCandidates("", { kind: "gdrive", root: "Shared drives", rel: "Team" }, P.syncRootsFrom({ gdrive: ["H:"] }));
const topsLifted = (() => { try { return placeApi(lifted("drive-tops")); } catch (e) { return null; } })();
const bareLifted = topsLifted ? topsLifted.placeCandidates("", { kind: "gdrive", root: "Shared drives", rel: "Team" }, topsLifted.syncRootsFrom({ gdrive: ["H:"] })) : [];
const older = P.placeCandidates("", { kind: "gdrive", rel: "Shared drives\\Team" }, P.syncRootsFrom({ gdrive: ["H:"], gdriveSeen: [{ root: "H:", tops: [POLISH_SHARED], links: [] }] }));
check(!!tailPlace && tailPlace.rel === "Shared drives\\Team" && !!linkPlace && linkPlace.root === ".shortcut-targets-by-id"
    && linkPlace.rel === SHORT_ID + "\\Team\\Desk" && bare.indexOf("H:\\" + POLISH_SHARED + "\\Team") > 0
    && bareLifted.indexOf("H:\\" + POLISH_SHARED + "\\Team") < 0 && older[0] === "H:\\" + POLISH_SHARED + "\\Team" && older.length === 1,
  "955j a place stores the part after Drive's folder (lifting plant:drive-tail stores the whole path), a shortcut's place keeps its"
  + " id, a root nobody listed is tried in every listed spelling (lifting plant:drive-tops tries only the writer's), and an older"
  + " place holding Drive's folder in its path lands in this root's own spelling: lifted " + (tailPlace ? tailPlace.rel : "none")
  + ", link " + (linkPlace ? linkPlace.root + " / " + linkPlace.rel : "none") + ", " + bare.length + " spellings, older " + older.join("|"));

/* The record: DefaultMountPoint as a letter, a folder with variables, and a variable this computer does not have. */
const rec = P.readSyncRecords({
  env: { USERPROFILE: "C:\\Users\\ann" },
  reg: (key, name) => (name !== "DefaultMountPoint" ? "" : key === "HKLM:\\SOFTWARE\\Google\\DriveFS" ? "%UserProfile%\\GDrive"
    : key === "HKLM:\\SOFTWARE\\WOW6432Node\\Google\\DriveFS" ? "k" : key === "HKLM:\\SOFTWARE\\Policies\\Google\\DriveFS" ? "%NOPE%\\Drive" : ""),
  subkeys: () => [], readFile: () => "",
  drives: () => [{ root: "J:", tops: ["My Drive"], links: [] }]
});
check(rec.gdrive.join("|") === "C:\\Users\\ann\\GDrive|k:|J:" && rec.gdriveSeen.length === 1,
  "955k DefaultMountPoint is read as a letter or a folder with its variables, one naming a variable this computer lacks names no"
  + " root, and a root a look found joins them: " + rec.gdrive.join("|"));

/* The look: within its bound whatever a letter does, and never at a mapped network letter. */
async function look(src) {
  const api = src ? placeApi(src) : P;
  const read = [];
  const readdir = dir => {
    read.push(dir);
    if (dir === "Q:\\") return new Promise(noop);
    if (dir === "Z:\\") return Promise.resolve(["My Drive"]);
    if (dir === "K:\\") return Promise.resolve([POLISH_MINE, ".shortcut-targets-by-id"]);
    if (dir === "K:\\.shortcut-targets-by-id") return Promise.resolve([SHORT_ID]);
    if (dir === "K:\\.shortcut-targets-by-id\\" + SHORT_ID) return Promise.resolve(["Team"]);
    if (dir === "L:\\") return Promise.resolve(["Projects"]);
    if (dir === "M:\\") return Promise.resolve(["Lab Mine"]);
    return Promise.reject(Object.assign(new Error("absent"), { code: "ENOENT" }));
  };
  const t0 = Date.now();
  const found = await api.driveSeen({ gdrive: ["M:\\"], mapped: [{ letter: "Z:", remote: "\\\\files\\dept" }] }, readdir, 300);
  return { found, read, ms: Date.now() - t0 };
}
/* The look's own timer does not hold a process open, so this one keeps the leg alive across its bound. */
const hold = setTimeout(noop, 5000);
const seen = await look();
const k = seen.found.find(f => f.root === "K:");
const mappedLifted = lifted("drive-mapped");
const seenLifted = mappedLifted ? await look(mappedLifted) : null;
clearTimeout(hold);
check(seen.ms < 1500 && !!k && k.links.join("|") === "K:\\.shortcut-targets-by-id\\" + SHORT_ID + "\\Team"
    && seen.found.map(f => f.root).sort().join("|") === "K:|M:" && seen.read.indexOf("Z:\\") < 0 && seen.read.indexOf("Q:\\") >= 0
    && !!seenLifted && seenLifted.read.indexOf("Z:\\") >= 0,
  "955l a look answers within its bound past a letter that never answers, keeps a root the records name and a letter holding Drive's"
  + " folders with its shortcut targets, passes over a letter holding none, and never reads a mapped network letter (lifting"
  + " plant:drive-mapped reads it): " + seen.ms + " ms, roots " + seen.found.map(f => f.root).join("|")
  + ", mapped read " + (seen.read.indexOf("Z:\\") >= 0) + (seenLifted ? ", lifted " + (seenLifted.read.indexOf("Z:\\") >= 0) : ""));

/* Every other kind gives the candidates it gave before this change, read off the rules as they stood. */
const before955 = [
  [{ kind: "onedrive", root: "OneDrive", rel: "Etiuda" }, { onedrive: ["D:\\Users\\ben\\OneDrive", "E:\\Spare\\OneDrive"] }, "D:\\Users\\ben\\OneDrive\\Etiuda|E:\\Spare\\OneDrive\\Etiuda"],
  [{ kind: "onedrive-business", root: "OneDrive - Northwind", rel: "Team\\Desk" }, { onedriveBusiness: ["D:\\Cloud\\OneDrive - Other", "D:\\Cloud\\OneDrive - Northwind"] }, "D:\\Cloud\\OneDrive - Northwind\\Team\\Desk|D:\\Cloud\\OneDrive - Other\\Team\\Desk"],
  [{ kind: "dropbox", rel: "Etiuda" }, { dropbox: ["C:\\Users\\ann\\Dropbox"] }, "C:\\Users\\ann\\Dropbox\\Etiuda"],
  [{ kind: "mapped", root: "\\\\files\\dept", rel: "Etiuda" }, { mapped: [{ letter: "Y:", remote: "\\\\files\\dept" }] }, "Y:\\Etiuda|\\\\files\\dept\\Etiuda"],
  [{ kind: "unc", root: "\\\\files\\dept", rel: "Etiuda" }, {}, ""]
];
const drift = before955.filter(([pl, rc, want]) => P.placeCandidates("", pl, P.syncRootsFrom(rc)).join("|") !== want);
check(drift.length === 0,
  "955m a OneDrive, business, Dropbox, mapped or network-share place gives exactly the candidates it gave before: drift "
  + JSON.stringify(drift.map(d => d[0].kind)));

console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
