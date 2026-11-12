/* WHAT THE REAL INSTALLS OWN ON THIS ACCOUNT, read and never written. The installer legs refuse before installing while
 * either shipped app is present, refuse a setup that is not the test build, and compare what the shipped apps own before
 * and after. Every read is `reg query` or a file read. The same file is in both trees; install-guard-selftest holds its
 * decisions on stand-ins. */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const I = require("../tools/test-identity.cjs");

/* electron-builder keys its registry entries by UUID v5 of the app id in this namespace (NsisTarget.js). */
const BUILDER_NS = "50e065bc-3134-11e6-9bab-38c9862bdaf3";
function uuidV5(name, ns) {
  const nsBytes = Buffer.from(String(ns).replace(/-/g, ""), "hex");
  const b = Buffer.from(crypto.createHash("sha1").update(Buffer.concat([nsBytes, Buffer.from(String(name), "utf8")])).digest().subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join("-");
}
const guidOf = appId => uuidV5(appId, BUILDER_NS);

/* The account a run may proceed on while a shipped app is present: its owner names it, as USERNAME or DOMAIN\USERNAME. */
const ACCOUNT_FLAG = "ETIUDA_INSTALL_TEST_ACCOUNT";
/* Stand-in places for the refusal's leg: folders here are looked at BESIDE the account's own, never instead of them. */
const LAB_FLAG = "ETIUDA_INSTALL_GUARD_LAB";

/* ---- the registry, read ------------------------------------------------------------------------------------------ */

const regRun = args => {
  const r = spawnSync("reg", args, { encoding: "utf8", windowsHide: true, timeout: 30000 });
  return { status: r.status, stdout: String(r.stdout || ""), stderr: String(r.stderr || "") + (r.error ? String(r.error.message) : "") };
};
/* A key this file builds, and nothing else, is asked of reg: exit 1 then means absent, which reg cannot otherwise say
   apart from a malformed name except in a localised message. */
const KEY_OK = /^HK(CU|LM)\\Software(\\[A-Za-z0-9 ._{}()-]+)+$/i;
const tidy = text => String(text).replace(/\r/g, "").split("\n").map(l => l.replace(/\s+$/, "")).filter(Boolean).join("\n");
function regQuery(key, run, value) {
  if (!KEY_OK.test(key)) throw new Error("install guard: " + JSON.stringify(key) + " is not a key it reads");
  const args = ["query", key].concat(value ? ["/v", value] : ["/s"]).concat(/^HKLM/i.test(key) ? ["/reg:64"] : []);
  const r = (run || regRun)(args);
  if (r.status === 0) return { present: true, text: tidy(r.stdout) };
  if (r.status === 1) return { present: false, text: "" };
  throw new Error("install guard: reg " + args.join(" ") + " answered " + r.status + " " + r.stderr.trim()
    + ", so what the real install owns cannot be read and nothing runs");
}
/** The values of one key's own listing, by name: four spaces, the name, the type, the value. */
function regValues(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const m = /^ {4}(.+?) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/.exec(line);
    if (m) out[m[1]] = m[3] || "";
  }
  return out;
}

/* ---- the account's places, from the account's own registry, so a run whose environment points elsewhere still looks
        at the real ones ------------------------------------------------------------------------------------------- */

function placesOfAccount(run, env) {
  const user = regValues(regQuery("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders", run).text);
  const all = regValues(regQuery("HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders", run).text);
  const pf = regValues(regQuery("HKLM\\Software\\Microsoft\\Windows\\CurrentVersion", run, "ProgramFilesDir").text);
  const places = { appData: user.AppData, localAppData: user["Local AppData"], desktop: user.Desktop, programs: user.Programs,
    commonDesktop: all["Common Desktop"], commonPrograms: all["Common Programs"], programFiles: pf.ProgramFilesDir };
  const missing = Object.keys(places).filter(k => !places[k]);
  if (missing.length) throw new Error("install guard: the registry names no " + missing.join(", ") + " for this account");
  const lab = String((env || {})[LAB_FLAG] || "");
  return Object.assign(places, { lab: lab ? path.resolve(lab) : "" });
}

/* ---- what the shipped apps own --------------------------------------------------------------------------------------- */

/** Every place the comparison reads, as { label, kind, at, app, role }. */
function ownedPlan(places) {
  const plan = [];
  const add = (label, kind, at, app, role) => plan.push({ label, kind, at, app, role });
  for (const app of Object.keys(I.SHIPPED)) {
    const s = I.SHIPPED[app], g = guidOf(s.appId);
    for (const hive of ["HKCU", "HKLM"]) {
      add(app + " " + hive + " uninstall key", "reg", hive + "\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + g, app, "registered");
      add(app + " " + hive + " Software\\" + g, "reg", hive + "\\Software\\" + g, app, "registered");
    }
    for (const [where, dir] of [["Desktop", places.desktop], ["Start Menu", places.programs],
      ["public Desktop", places.commonDesktop], ["all-users Start Menu", places.commonPrograms]])
      add(app + " shortcut on the " + where, "file", path.join(dir, s.productName + ".lnk"), app, "shortcut");
    add(app + " per-user install folder", "folder", path.join(places.localAppData, "Programs", s.productName), app, "folder");
    add(app + " all-users install folder", "folder", path.join(places.programFiles, s.productName), app, "folder");
    if (places.lab) {
      add(app + " stand-in per-user install folder", "folder", path.join(places.lab, "Programs", s.productName), app, "folder");
      add(app + " stand-in all-users install folder", "folder", path.join(places.lab, "Program Files", s.productName), app, "folder");
    }
    add(app + " profile", "profile", path.join(places.appData, s.packageName), app, "profile");
  }
  const d = I.SHIPPED.desk;
  for (const hive of ["HKCU", "HKLM"]) {
    add(hive + " ." + d.ext, "reg", hive + "\\Software\\Classes\\." + d.ext, "desk", "class");
    add(hive + " " + d.catalogClass, "reg", hive + "\\Software\\Classes\\" + d.catalogClass, "desk", "class");
  }
  add("HKCU " + d.scheme + ":", "reg", "HKCU\\Software\\Classes\\" + d.scheme, "desk", "class");
  return plan;
}

const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");
/** One place, as the string the comparison holds. A profile is its top-level files by name and sha256. */
function readPlace(p, run) {
  if (p.kind === "reg") { const r = regQuery(p.at, run); return r.present ? "present\n" + r.text : "absent"; }
  if (!fs.existsSync(p.at)) return "absent";
  if (p.kind === "file") return "sha256 " + sha(fs.readFileSync(p.at));
  if (p.kind === "folder") return "present";
  return fs.readdirSync(p.at).sort().filter(n => { try { return fs.statSync(path.join(p.at, n)).isFile(); } catch (e) { return false; } })
    .map(n => { try { return n + " " + sha(fs.readFileSync(path.join(p.at, n))); } catch (e) { return n + " unreadable"; } }).join("\n") || "empty";
}
/** The whole plan read, plus the class .ec names where it is not the shipped one. */
function snapshot(places, run, extra) {
  const plan = ownedPlan(places).concat(extra || []);
  const entries = {};
  for (const p of plan) entries[p.label] = readPlace(p, run);
  for (const hive of ["HKCU", "HKLM"]) {
    const named = regValues(entries[hive + " ." + I.SHIPPED.desk.ext] || "")["(Default)"];
    if (named && named !== I.SHIPPED.desk.catalogClass && /^[A-Za-z0-9 ._-]+$/.test(named)) {
      const p = { label: hive + " " + named + " (the class ." + I.SHIPPED.desk.ext + " names)", kind: "reg", at: hive + "\\Software\\Classes\\" + named, app: "desk", role: "class" };
      plan.push(p);
      entries[p.label] = readPlace(p, run);
    }
  }
  return { plan, entries };
}

/** Every label whose reading differs, with both readings; [] when the two are equal. */
function compare(before, after) {
  const a = (before && before.entries) || {}, b = (after && after.entries) || {};
  const labels = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  return labels.filter(l => a[l] !== b[l]).map(l => ({ label: l, was: a[l] === undefined ? "unread" : a[l], now: b[l] === undefined ? "unread" : b[l] }));
}
const brief = v => { const s = String(v).split("\n"); return s[0] + (s.length > 1 ? " (" + (s.length - 1) + " more line(s))" : ""); };
const diffLine = d => d.label + ": " + brief(d.was) + " -> " + brief(d.now);

/* ---- the refusal ----------------------------------------------------------------------------------------------------- */

/** Every reason a shipped app counts as present: a registration in either hive, or an install folder. */
function presence(snap) {
  return snap.plan.filter(p => (p.role === "registered" || p.role === "folder") && snap.entries[p.label] !== "absent")
    .map(p => I.SHIPPED[p.app].productName + " is on this account: " + p.label + " (" + p.at + ")");
}
function accountOf(env) {
  const user = (() => { try { return os.userInfo().username; } catch (e) { return String((env || {}).USERNAME || ""); } })();
  const domain = String((env || {}).USERDOMAIN || (env || {}).COMPUTERNAME || "");
  return { user, domain, said: domain ? domain + "\\" + user : user };
}
const namesAccount = (flag, acc) => { const f = String(flag || "").trim().toLowerCase();
  return !!f && !!acc.user && (f === acc.user.toLowerCase() || (!!acc.domain && f === (acc.domain + "\\" + acc.user).toLowerCase())); };
/** The refusals presence makes on this account, [] where none stands or the flag names this account. */
function refusals(reasons, env, acc) {
  if (!reasons.length) return [];
  const flag = String((env || {})[ACCOUNT_FLAG] || "");
  if (namesAccount(flag, acc)) return [];
  return reasons.concat([(flag ? ACCOUNT_FLAG + " names " + JSON.stringify(flag) + ", not this account, " + acc.said + ". "
    : "") + "Nothing was installed. The test install never runs beside a shipped one unless the account's owner names that"
    + " account in " + ACCOUNT_FLAG + "."]);
}

/* ---- a setup's identity, read from its own version resource -------------------------------------------------------- */

/** The VS_VERSIONINFO strings `keys` of a PE file's first bytes; a key read two ways is answered as "". */
function versionStrings(buf, keys) {
  const out = {};
  for (const key of keys || ["ProductName", "FileDescription"]) {
    const pat = Buffer.from(key + "\0", "utf16le"), seen = new Set();
    for (let at = buf.indexOf(pat); at > -1; at = buf.indexOf(pat, at + 2)) {
      const head = at - 6;
      if (head < 0 || head % 4 !== 0 || buf.readUInt16LE(head + 4) !== 1) continue;
      const len = buf.readUInt16LE(head), chars = buf.readUInt16LE(head + 2);
      const from = (at + pat.length + 3) & ~3;
      if (!chars || from + chars * 2 > head + len) continue;
      seen.add(buf.toString("utf16le", from, from + chars * 2).replace(/\0+$/, ""));
    }
    out[key] = seen.size === 1 ? Array.from(seen)[0] : "";
  }
  return out;
}
function setupIdentity(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 4 * 1024 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const v = versionStrings(buf, ["ProductName", "FileDescription"]);
    return { productName: v.ProductName, description: v.FileDescription, appId: I.markIn(v.FileDescription) };
  } finally { fs.closeSync(fd); }
}
/** "" for the test build of `app`; otherwise why the setup is refused. Run before it is run. */
function setupRefusal(id, app) {
  const t = I.TEST[app];
  if (!t) return "no test identity for " + JSON.stringify(app);
  const shipped = Object.values(I.SHIPPED);
  const asShipped = shipped.find(s => s.productName === id.productName || s.appId === id.appId);
  if (!id.productName) return "the setup's version resource names no product, so its app id cannot be read; only the test build runs";
  if (asShipped) return "the setup is the shipped " + asShipped.productName + " (app id " + asShipped.appId
    + "): its install would write, and its uninstall remove, what the real install owns";
  if (id.productName !== t.productName || id.appId !== t.appId)
    return "the setup names " + JSON.stringify(id.productName) + " and app id " + JSON.stringify(id.appId || null)
      + ", not the test build " + t.productName + " / " + t.appId;
  return "";
}

/* ---- the legs' calls --------------------------------------------------------------------------------------------- */

/* THE DESK SENTINEL (the lead engineer's find, 2026-11-12): a computer that must never run an installer carries this file in its
   home folder, created once there and in no tree. Its presence refuses every leg, whatever ACCOUNT_FLAG names and whether or not
   a shipped app is present, because "no shipped app present" is also true of a desk with neither installed. tools/runner/ reads
   the same name. `home` is for the selftest; a leg passes none. */
const DESK_SENTINEL = ".etiuda-no-installers";
function deskSentinelAt(env, home) { return path.join(home || (env && env.USERPROFILE) || os.homedir(), DESK_SENTINEL); }

/** Before anything is built or installed: the refusals, and the snapshot the end is compared with. */
function guardStart(opts) {
  const o = opts || {}, env = o.env || process.env;
  const sentinel = deskSentinelAt(env, o.home);
  const desk = fs.existsSync(sentinel) ? ["this computer carries " + sentinel + ", a desk where installers never run"] : [];
  if (process.platform !== "win32" && !o.run) return { refusals: desk.concat(["the install guard reads a Windows registry and this is " + process.platform]), before: null };
  const places = placesOfAccount(o.run, env);
  const before = snapshot(places, o.run, o.extra);
  const acc = accountOf(env);
  const reasons = presence(before);
  const flagged = reasons.length > 0 && namesAccount(env[ACCOUNT_FLAG], acc);
  return { places, before, account: acc, reasons, flagged, refusals: desk.concat(refusals(reasons, env, acc)),
    reads: before.plan.length + " place(s): " + before.plan.map(p => p.label).join("; ") };
}
/** After the leg, the setups uninstalled: every place whose reading changed. Nothing is restored. */
function guardEnd(start, run) {
  if (!start || !start.before) return { diffs: [{ label: "the guard", was: "unread", now: "unread" }], after: null };
  const after = snapshot(start.places, run, start.before.plan.filter(p => p.extra));
  return { after, diffs: compare(start.before, after) };
}

module.exports = { BUILDER_NS, uuidV5, guidOf, ACCOUNT_FLAG, LAB_FLAG, KEY_OK, regQuery, regValues, placesOfAccount,
  ownedPlan, readPlace, snapshot, compare, diffLine, presence, accountOf, namesAccount, refusals, versionStrings,
  setupIdentity, setupRefusal, guardStart, guardEnd, DESK_SENTINEL, deskSentinelAt };
