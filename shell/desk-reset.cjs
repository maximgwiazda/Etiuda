"use strict";

/* The desk's reset, with no Electron in it. The page only asks. Only the process that
   holds the single-instance lock finishes it, on the next start. A link is removed and
   never followed. The licence names are the sibling's spelling; only a regular file is kept. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* Reset keeps these two. A ticked uninstall removes them; the lists differ on purpose. */
const LICENCE_FILES = ["etiuda-license.js", "etiuda-revoked.json"];
const MARKER_NAME = "reset-pending.json";
/* The single-instance lock's own names in this folder. Windows writes the first.
   Linux writes the other three, each a link. None of them is the desk's. */
const LOCK_FILES = ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"];
const OWNED = ["etiuda-ring.json", "etiuda-team.json"];
const BUSY = { EPERM: 1, EBUSY: 1, EACCES: 1 };
const PAUSE = new Int32Array(new SharedArrayBuffer(4));

function isLicenceName(name) {
  const n = String(name || "").toLowerCase();
  if (LICENCE_FILES.indexOf(n) >= 0) return true; /* plant:reset-keep-licence */
  return false;
}

function isLockName(name) {
  const n = String(name || "").toLowerCase();
  for (let i = 0; i < LOCK_FILES.length; i++) {
    if (LOCK_FILES[i].toLowerCase() === n) return true;
  }
  return false;
}

function within(root, abs) {
  const rel = path.relative(path.resolve(String(root || "")), abs);
  if (rel === "") return true;
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return true;
}

function pathOutside(roots, target) {
  const abs = path.resolve(String(target || ""));
  const list = Array.isArray(roots) ? roots : [];
  for (let i = 0; i < list.length; i++) {
    if (within(list[i], abs)) return false;
  }
  return true; /* plant:reset-confine */
}

/* A missing path is not outside by itself. A link is not followed, so its target is not read. */
function realOutside(roots, target) {
  let st;
  try { st = fs.lstatSync(target); }
  catch (e) {
    if (e && e.code === "ENOENT") return false;
    return pathOutside(roots, target);
  }
  if (st.isSymbolicLink()) return false;
  try { return pathOutside(roots, fs.realpathSync(target)); }
  catch (e) { return pathOutside(roots, target); }
}

function samePath(a, b) {
  const x = path.resolve(String(a || ""));
  const y = path.resolve(String(b || ""));
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function ownedName(name) {
  const n = String(name || "").toLowerCase();
  if (OWNED.indexOf(n) >= 0) return true;
  return n.length > 3 && n.endsWith(".ec");
}

function lstatOf(p) {
  try { return fs.lstatSync(p); }
  catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
}

function namesOf(dir) {
  try { return fs.readdirSync(dir); }
  catch (e) {
    if (e && e.code === "ENOENT") return [];
    throw e;
  }
}

function remember(seen, p) {
  const abs = path.resolve(p);
  const id = process.platform === "win32" ? abs.toLowerCase() : abs;
  if (seen.has(id)) return "";
  seen.add(id);
  return abs;
}

function refused(detail, userData, roots, keep) {
  return {
    ok: false, reason: "refused", changed: false, remove: [],
    detail: detail || "", keep: keep || [], roots: roots || [], userData: userData || ""
  };
}

/* What the desk file says about the folders a reset may touch: the catalog folder setting, the team folders it names
   (each held team's), and this desk's own ids under desks/ (its key now and every
   key kept aside), read from desk.json or the newest backup that parses; empty where none does. */
function deskFacts(user) {
  const names = ["desk.json"];
  for (let n = 1; n <= 9; n++) names.push("desk.bak" + n + ".json");
  for (let i = 0; i < names.length; i++) {
    let doc = null;
    try { doc = JSON.parse(fs.readFileSync(path.join(user, names[i]), "utf8")); } catch (e) { continue; }
    if (!doc || typeof doc !== "object") continue;
    let keys = doc.keys;
    if (typeof keys === "string") { try { keys = JSON.parse(keys || "{}"); } catch (e) { keys = {}; } }
    const setting = keys && typeof keys === "object" && typeof keys.eCatalogFolder === "string" ? keys.eCatalogFolder : "";
    const shares = [];
    const shown = doc.teamShown && typeof doc.teamShown === "object" ? doc.teamShown : {};
    Object.keys(shown).forEach(t => { const s = shown[t]; if (s && typeof s.folder === "string" && s.folder) shares.push(s.folder); });
    const ids = [];
    [doc.branch].concat(Array.isArray(doc.branchOld) ? doc.branchOld : []).forEach(b => {
      const pub = b && b.sign ? String(b.sign.pub) : "";
      if (/^[0-9a-f]{64}$/.test(pub)) ids.push("k-" + crypto.createHash("sha256").update(Buffer.from(pub, "hex")).digest("hex").slice(0, 16));
    });
    return { setting: setting, shares: shares, ids: ids };
  }
  return { setting: "", shares: [], ids: [] };
}

/* The default catalog is a root only when the setting names it, or names nothing. A folder
   the user chose is never a root, nor is a team's share, `shares`, even at the default's path.
   The default, when it is itself a link, is skipped. */
function planReset(opts) {
  const o = opts || {};
  const rawUser = String(o.userData || "");
  if (!path.isAbsolute(rawUser)) return refused("the desk folder is not an absolute path", rawUser);
  const user = path.resolve(rawUser);
  const userSt = lstatOf(user);
  if (userSt && userSt.isSymbolicLink()) return refused("the desk folder is a link", user);
  if (userSt && !userSt.isDirectory()) return refused("the desk folder is not a folder", user);
  const setting = String(o.catalogSetting || "").trim();
  const rawDefault = String(o.defaultCatalog || "");
  const shares = (Array.isArray(o.shares) ? o.shares : []).map(String).filter(s => path.isAbsolute(s));
  const ids = (Array.isArray(o.deskIds) ? o.deskIds : []).map(String).filter(id => /^k-[0-9a-f]{16}$/.test(id));
  const roots = [user];
  let catalog = "";
  if (path.isAbsolute(rawDefault)) {
    const def = path.resolve(rawDefault);
    const named = !setting || samePath(setting, def);
    const defSt = lstatOf(def);
    const onShare = shares.some(s => within(s, def)); /* plant:reset-share-root */
    if (named && !onShare && !(defSt && defSt.isSymbolicLink())) {
      catalog = def;
      if (!samePath(def, user)) roots.push(def);
    }
  }
  const remove = [];
  const keep = [];
  const seen = new Set();
  namesOf(user).forEach(name => {
    if (name.toLowerCase() === MARKER_NAME.toLowerCase()) return;
    if (isLockName(name)) return;
    const at = path.join(user, name);
    if (catalog && samePath(at, catalog)) return;
    const st = lstatOf(at);
    if (!st) return;
    if (!st.isSymbolicLink() && st.isFile() && isLicenceName(name)) {
      const abs = remember(seen, at);
      if (abs) keep.push(abs);
      return;
    }
    const abs = remember(seen, at);
    if (abs) remove.push(abs);
  });
  if (catalog && !samePath(catalog, user)) {
    namesOf(catalog).forEach(name => {
      if (!ownedName(name)) return;
      const at = path.join(catalog, name);
      const st = lstatOf(at);
      if (!st || (st.isDirectory() && !st.isSymbolicLink())) return;
      const abs = remember(seen, at);
      if (abs) remove.push(abs);
    });
    /* This desk's own folders under desks/, whole, where desks/ is a real folder: a link there is never passed through. */
    const desks = path.join(catalog, "desks"), desksSt = lstatOf(desks);
    if (desksSt && desksSt.isDirectory() && !desksSt.isSymbolicLink()) {
      ids.forEach(id => {
        const at = path.join(desks, id);
        const keepIt = !lstatOf(at); /* plant:reset-own-desks */
        if (keepIt) return;
        const abs = remember(seen, at);
        if (abs) remove.push(abs);
      });
    }
  }
  for (let i = 0; i < remove.length; i++) {
    if (pathOutside(roots, remove[i]) || realOutside(roots, remove[i]))
      return refused("a path lies outside the desk's folders", user, roots, keep);
  }
  return { ok: true, reason: "", changed: false, remove: remove, keep: keep, roots: roots, userData: user, detail: "" };
}

function pause() { Atomics.wait(PAUSE, 0, 0, 40); }

function attempt(fn) {
  let last = null;
  for (let i = 0; i < 8; i++) {
    try { fn(); return null; }
    catch (e) {
      if (e && e.code === "ENOENT") return null;
      last = e;
      if (e && BUSY[e.code] && i < 7) { pause(); continue; }
      return e;
    }
  }
  return last;
}

/* A link is unlinked as a link. Its target, and anything only reached through it, stays. A folder
   that cannot be listed is a failed entry like a file that will not unlink, so the pass records it. */
function removeEntry(p) {
  const st = lstatOf(p);
  if (!st) return null;
  if (st.isSymbolicLink()) return attempt(() => fs.unlinkSync(p));
  if (st.isDirectory()) {
    let names;
    try { names = namesOf(p); } catch (e) { if (!e.path) e.path = p; return e; } /* plant:reset-unlisted */
    for (let i = 0; i < names.length; i++) {
      const err = removeEntry(path.join(p, names[i]));
      if (err) return err;
    }
    return attempt(() => fs.rmdirSync(p));
  }
  return attempt(() => fs.unlinkSync(p));
}

function applyReset(plan) {
  if (!plan || plan.ok !== true) return { ok: false, reason: "refused", changed: false };
  const roots = Array.isArray(plan.roots) ? plan.roots : [];
  const remove = Array.isArray(plan.remove) ? plan.remove : [];
  for (let i = 0; i < remove.length; i++) {
    if (pathOutside(roots, remove[i]) || realOutside(roots, remove[i]))
      return { ok: false, reason: "refused", changed: false };
  }
  let changed = false;
  for (let i = 0; i < remove.length; i++) {
    if (pathOutside(roots, remove[i]) || realOutside(roots, remove[i]))
      return { ok: false, reason: "refused", changed: changed };
    if (plan.userData && samePath(remove[i], plan.userData)) continue;
    const err = removeEntry(remove[i]);
    if (err) {
      const unlisted = [];
      return {
        ok: false, reason: String(err.code || err.message || "refused"), changed: changed,
        owed: expandRemaining(remove, i, unlisted), unlisted: unlisted,
        blocked: err.path ? path.resolve(String(err.path)) : remove[i]
      };
    }
    changed = true;
  }
  return { ok: true, changed: changed, owed: [] };
}

/* What a failed pass still has to remove: the entry that stopped it, and every later entry,
   each directory listed as the files still inside it and then itself. A later start unlinks
   those paths and does not walk again, so a file created after the pass is not among them;
   a directory that could not be listed goes into `unlisted`, and is the one a later start walks. */
function expandRemaining(remove, fromIndex, unlisted) {
  const out = [];
  const walk = (p) => {
    const st = lstatOf(p);
    if (!st) return;
    if (st.isSymbolicLink() || !st.isDirectory()) { out.push(path.resolve(p)); return; }
    let names = [];
    try { names = namesOf(p); } catch (e) { names = []; if (Array.isArray(unlisted)) unlisted.push(path.resolve(p)); }
    for (let i = 0; i < names.length; i++) walk(path.join(p, names[i]));
    out.push(path.resolve(p));
  };
  for (let i = fromIndex; i < remove.length; i++) walk(remove[i]);
  return out;
}

function removeExact(p) {
  const st = lstatOf(p);
  if (!st) return null;
  if (st.isSymbolicLink() || !st.isDirectory()) return attempt(() => fs.unlinkSync(p));
  return attempt(() => fs.rmdirSync(p));
}

function owedAllowed(p, user, roots) {
  if (!p || pathOutside(roots, p) || realOutside(roots, p)) return false;
  if (samePath(p, user)) return false;
  const base = path.basename(p);
  if (base.toLowerCase() === MARKER_NAME.toLowerCase()) return false;
  if (!samePath(path.dirname(p), user)) return true;
  if (isLockName(base) || isLicenceName(base)) return false;
  return true;
}

/* Only the paths the failed pass recorded. */
function applyOwed(doc, roots) {
  const owed = Array.isArray(doc.owed) ? doc.owed : [];
  const unlisted = new Set((Array.isArray(doc.unlisted) ? doc.unlisted : []).map(p => path.resolve(String(p || ""))));
  const stillUnlisted = list => list.filter(p => unlisted.has(p));
  const user = doc.userData;
  const left = [];
  let changed = false;
  let blocked = "";
  for (let i = 0; i < owed.length; i++) {
    const p = path.resolve(String(owed[i] || ""));
    if (!owedAllowed(p, user, roots)) continue;
    const st = lstatOf(p);
    if (!st) continue;
    const err = unlisted.has(p) ? removeEntry(p) : removeExact(p);
    if (err) {
      left.push(p);
      for (let j = i + 1; j < owed.length; j++) {
        const rest = path.resolve(String(owed[j] || ""));
        if (owedAllowed(rest, user, roots) && lstatOf(rest)) left.push(rest);
      }
      return {
        ok: false, changed: changed, owed: left, unlisted: stillUnlisted(left),
        blocked: err.path ? path.resolve(String(err.path)) : p,
        reason: String(err.code || err.message || "refused")
      };
    }
    changed = true;
  }
  if (left.length) return { ok: false, changed: changed, owed: left, blocked: blocked, reason: "refused" };
  return { ok: true, changed: changed, owed: [] };
}

function commitReset(opts) {
  const plan = planReset(opts);
  if (!plan.ok) return plan;
  return Object.assign({ keep: plan.keep, remove: plan.remove }, applyReset(plan));
}

function stageReset(opts) {
  const plan = planReset(opts || {});
  if (!plan.ok) return { ok: false, reason: "refused", changed: false, detail: plan.detail || "" };
  const user = plan.userData;
  const marker = path.join(user, MARKER_NAME);
  if (pathOutside([user], marker)) return { ok: false, reason: "refused", changed: false };
  const body = JSON.stringify({ v: 1, userData: user, catalogSetting: String((opts && opts.catalogSetting) || ""), attempts: 0 });
  const tmp = marker + ".tmp";
  try {
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, marker);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (err) { /* the marker was not written */ }
    return { ok: false, reason: "refused", changed: false };
  }
  return { ok: true, changed: false, marker: marker };
}

function dropMarker(marker) {
  try { fs.unlinkSync(marker); } catch (e) { /* already gone */ }
}

/* Dropped only when the pass completes, or the marker will not parse, or it names another
   folder. A failed pass leaves it held. Without the lock, nothing here is read. No folder the
   marker names is a root: the default is the caller's own (`defaultCatalog`, a path or a
   function answering one), and the setting and the team folders are the desk file's. The
   marker's setting is read only where the desk file has none, and it can only keep the
   default from being a root. */
function honourPendingReset(opts) {
  if (!opts || opts.holdsLock !== true) return { pending: false, changed: false };
  const raw = String((opts && opts.userData) || "");
  if (!path.isAbsolute(raw)) return { pending: false, changed: false };
  const user = path.resolve(raw);
  const dirSt = lstatOf(user);
  if (!dirSt) return { pending: false, changed: false };
  if (dirSt.isSymbolicLink() || !dirSt.isDirectory()) return { pending: false, changed: false };
  const marker = path.join(user, MARKER_NAME);
  const mst = lstatOf(marker);
  if (!mst) return { pending: false, changed: false };
  if (mst.isSymbolicLink() || !mst.isFile()) {
    dropMarker(marker);
    return { pending: true, ok: false, changed: false };
  }
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(marker, "utf8")); }
  catch (e) {
    dropMarker(marker);
    return { pending: true, ok: false, changed: false };
  }
  if (!doc || doc.v !== 1 || !samePath(doc.userData, user)) {
    dropMarker(marker);
    return { pending: true, ok: false, changed: false };
  }
  let given = [], own = "";
  try { given = typeof opts.shares === "function" ? opts.shares() : opts.shares; } catch (e) { given = []; }
  try { own = String((typeof opts.defaultCatalog === "function" ? opts.defaultCatalog() : opts.defaultCatalog) || ""); } catch (e) { own = ""; }
  const facts = deskFacts(user);
  const planOpts = {
    userData: user,
    defaultCatalog: own, catalogSetting: facts.setting || String(doc.catalogSetting || ""), /* plant:reset-own-default */
    shares: facts.shares.concat(Array.isArray(given) ? given : []),
    deskIds: facts.ids
  };
  let done;
  if (Array.isArray(doc.owed) && doc.owed.length) {
    if (doc.held !== false) {
      const blocked = doc.blocked || doc.owed[0];
      return {
        pending: true, ok: false, changed: false, notice: true,
        paths: noticePaths(blocked), owed: doc.owed
      };
    }
    const plan = planReset(planOpts);
    if (!plan.ok) return { pending: true, ok: false, changed: false };
    done = applyOwed(doc, plan.roots);
  } else done = commitReset(planOpts);
  if (done && done.ok) {
    dropMarker(marker);
    return { pending: true, ok: true, changed: true };
  }
  return rememberOwed(user, doc, done);
}

function noticePaths(blocked) {
  const list = Array.isArray(blocked) ? blocked : (blocked ? [blocked] : []);
  const names = [];
  for (let i = 0; i < list.length; i++) {
    const base = path.basename(String(list[i] || ""));
    if (base && names.indexOf(base) < 0) names.push(base);
  }
  return names;
}

function writeMarker(user, doc) {
  const marker = path.join(user, MARKER_NAME);
  if (pathOutside([user], marker)) return false;
  const tmp = marker + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(doc));
    fs.renameSync(tmp, marker);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (err) { /* the marker was not written */ }
    return false;
  }
}

/* The marker keeps the paths still owed and the time of the pass that failed. A later start
   reads that list. The names are what the page says is in the way. */
function rememberOwed(user, doc, done) {
  if (!done || !Array.isArray(done.owed) || !done.owed.length) {
    return { pending: true, ok: false, changed: !!(done && done.changed) };
  }
  const blocked = done.blocked || done.owed[0];
  const next = {
    v: 1,
    userData: user,
    catalogSetting: String(doc.catalogSetting || ""),
    attempts: (doc.attempts || 0) + 1,
    owed: done.owed,
    unlisted: Array.isArray(done.unlisted) ? done.unlisted : [],
    owedAt: doc.owedAt || new Date().toISOString(),
    blocked: blocked || "",
    held: true
  };
  writeMarker(user, next);
  return {
    pending: true, ok: false, changed: !!done.changed, notice: true,
    paths: noticePaths(blocked), owed: done.owed
  };
}

/* The person's Try again: un-holds the marker for the next start and deletes nothing live. */
function retryPendingReset(opts) {
  if (!opts || opts.holdsLock !== true) return { ok: false, reason: "refused", changed: false };
  const raw = String(opts.userData || "");
  if (!path.isAbsolute(raw)) return { ok: false, reason: "refused", changed: false };
  const user = path.resolve(raw);
  const marker = path.join(user, MARKER_NAME);
  const mst = lstatOf(marker);
  if (!mst || mst.isSymbolicLink() || !mst.isFile()) return { ok: false, reason: "none", changed: false };
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(marker, "utf8")); }
  catch (e) {
    dropMarker(marker);
    return { ok: false, reason: "refused", changed: false };
  }
  if (!doc || doc.v !== 1 || !samePath(doc.userData, user)) {
    dropMarker(marker);
    return { ok: false, reason: "refused", changed: false };
  }
  doc.held = false;
  if (!writeMarker(user, doc)) return { ok: false, reason: "refused", changed: false };
  return { ok: true, changed: false, marker: marker };
}

function stopPendingReset(opts) {
  if (!opts || opts.holdsLock !== true) return { ok: false, reason: "refused" };
  const raw = String(opts.userData || "");
  if (!path.isAbsolute(raw)) return { ok: false, reason: "refused" };
  const user = path.resolve(raw);
  const marker = path.join(user, MARKER_NAME);
  if (pathOutside([user], marker)) return { ok: false, reason: "refused" };
  dropMarker(marker);
  return { ok: true };
}

const RESET_NOTICE_CHANNEL = "etiuda:reset-unfinished";

function deliverResetNotice(win, notice) {
  const paths = notice && Array.isArray(notice.paths) ? notice.paths.filter(p => typeof p === "string" && p) : [];
  if (!paths.length || !win || !win.webContents || typeof win.webContents.send !== "function") return false;
  win.webContents.send(RESET_NOTICE_CHANNEL, { paths: paths });
  return true;
}

/* What readDesk calls a first run: no desk file and no backup of one. A missing folder is not. */
function wouldStartNew(dir) {
  let names;
  try { names = fs.readdirSync(dir); }
  catch (e) { return false; }
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (n.toLowerCase() === "desk.json") return false;
    if (/^desk\.bak[1-9]\.json$/i.test(n)) return false;
  }
  return true;
}

module.exports = {
  planReset: planReset,
  applyReset: applyReset,
  commitReset: commitReset,
  stageReset: stageReset,
  honourPendingReset: honourPendingReset,
  retryPendingReset: retryPendingReset,
  stopPendingReset: stopPendingReset,
  deliverResetNotice: deliverResetNotice,
  wouldStartNew: wouldStartNew,
  MARKER_NAME: MARKER_NAME,
  LICENCE_FILES: LICENCE_FILES,
  LOCK_FILES: LOCK_FILES
};
