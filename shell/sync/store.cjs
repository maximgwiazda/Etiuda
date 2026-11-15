"use strict";
/* A PERSON'S STORE ON THE DESK: the store's content key K and lead key S live in the person's own Microsoft or Google folder, made
   once by the first computer that finds no key file and read by every later one, with nothing shown and nothing typed. The relay
   holds only what K sealed and opens no session without the store certificate the licence service hands this person's signed-in
   computer. Driven through what its caller passes in, so legs run it over stand-ins. */
const crypto = require("node:crypto");

const KEY_FILE = "etiuda-store.json";
const KEY_KIND = "etiuda-store-key";
const FILE_MAX = 64 * 1024;
const HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;
const SPKI = Buffer.from("302a300506032b6570032100", "hex"), PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
/* The computers a store holds: the relay's own cap on a team's keys is far above this, and a person has few. */
const DEVICES_MAX = 64;

const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/* ---- the folder: one interface over OneDrive's App Folder and Google Drive's appDataFolder -------------------------------
   read() answers {ok: true, text} or {ok: true, text: null} where there is no key file, or {ok: false, why}; write(text) answers
   {ok: true} or {ok: false, why}, and create(text) writes only where no file is there yet, answering {ok: false, why: "taken"}
   where one is. `why` is one of: offline, no-drive (no OneDrive, or Drive switched off by the organisation), consent (the folder
   not allowed at sign-in), full, refused. `ask(method, url, headers, body)` answers {status, bytes} and throws when unreached. */
const textOf = r => Buffer.from(r && r.bytes ? r.bytes : []).toString("utf8");
function jsonOf(r) { try { return JSON.parse(textOf(r)); } catch { return null; } }
async function asked(ask, method, url, headers, body) {
  try { return { res: await ask(method, url, headers, body) }; } catch { return { why: "offline" }; }
}
/* A Graph answer that is not success, by what Microsoft documents: 401 or 403 for a token the folder was not allowed, 404 on the
   drive itself for a user with no OneDrive, 507 for a full drive. */
function graphWhy(res, onDrive) {
  const s = res.status, j = jsonOf(res), code = j && j.error && typeof j.error.code === "string" ? j.error.code : "";
  if (s === 507 || code === "quotaLimitReached" || code === "insufficientStorage") return "full";
  if (s === 401 || code === "accessDenied" || /scope|consent/i.test(code)) return "consent";
  if (s === 403) return "consent";
  if (s === 404 && onDrive) return "no-drive";
  return "refused";
}
function graphFolder(o) {
  const auth = () => ({ authorization: "Bearer " + o.token() });
  const fileUrl = GRAPH + ":/" + KEY_FILE + ":/content";
  async function drive() {
    const a = await asked(o.ask, "GET", GRAPH, auth());
    if (a.why) return a.why;
    return a.res.status === 200 ? null : graphWhy(a.res, true);
  }
  return {
    kind: "microsoft",
    async read() {
      const d = await drive();
      if (d) return { ok: false, why: d };
      const a = await asked(o.ask, "GET", fileUrl, auth());
      if (a.why) return { ok: false, why: a.why };
      if (a.res.status === 404) return { ok: true, text: null };
      if (a.res.status !== 200) return { ok: false, why: graphWhy(a.res, false) };
      return a.res.bytes && a.res.bytes.length > FILE_MAX ? { ok: false, why: "refused" } : { ok: true, text: textOf(a.res) };
    },
    async write(text) { return put(fileUrl, text); },
    async create(text) { return put(fileUrl + "?@microsoft.graph.conflictBehavior=fail", text); },
  };
  async function put(url, text) {
    const a = await asked(o.ask, "PUT", url, Object.assign({ "content-type": "application/json" }, auth()), Buffer.from(text, "utf8"));
    if (a.why) return { ok: false, why: a.why };
    if (a.res.status === 200 || a.res.status === 201) return { ok: true };
    if (a.res.status === 409) return { ok: false, why: "taken" };
    return { ok: false, why: graphWhy(a.res, false) };
  }
}
/* A Drive answer that is not success, by Google's documented reasons: insufficient permissions for a scope not granted, the domain's
   policy or Drive switched off for a Workspace user, the storage quota. */
function driveWhy(res) {
  const j = jsonOf(res), errs = j && j.error && Array.isArray(j.error.errors) ? j.error.errors : [];
  const reasons = errs.map(e => String(e && e.reason || ""));
  if (reasons.some(r => r === "storageQuotaExceeded" || r === "quotaExceeded")) return "full";
  if (reasons.some(r => r === "insufficientPermissions" || r === "insufficientScopes") || res.status === 401) return "consent";
  if (reasons.some(r => r === "domainPolicy" || r === "accessNotConfigured" || r === "dailyLimitExceededUnreg" || r === "notAccessibleForUser")) return "no-drive";
  if (res.status === 403) return "no-drive";
  return "refused";
}
function driveFolder(o) {
  const auth = () => ({ authorization: "Bearer " + o.token() });
  /* Oldest first, so two computers that each made a file in the same instant both read the one made first. */
  const listUrl = DRIVE + "?spaces=appDataFolder&orderBy=createdTime&fields=files(id,createdTime)&q=" + encodeURIComponent("name = '" + KEY_FILE + "'");
  async function idOf() {
    const a = await asked(o.ask, "GET", listUrl, auth());
    if (a.why) return { why: a.why };
    if (a.res.status !== 200) return { why: driveWhy(a.res) };
    const j = jsonOf(a.res), files = j && Array.isArray(j.files) ? j.files : null;
    if (!files) return { why: "refused" };
    const f = files.find(x => x && typeof x.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x.id));
    return { id: f ? f.id : null };
  }
  return {
    kind: "google",
    async read() {
      const f = await idOf();
      if (f.why) return { ok: false, why: f.why };
      if (!f.id) return { ok: true, text: null };
      const a = await asked(o.ask, "GET", DRIVE + "/" + f.id + "?alt=media", auth());
      if (a.why) return { ok: false, why: a.why };
      if (a.res.status === 404) return { ok: true, text: null };
      if (a.res.status !== 200) return { ok: false, why: driveWhy(a.res) };
      return a.res.bytes && a.res.bytes.length > FILE_MAX ? { ok: false, why: "refused" } : { ok: true, text: textOf(a.res) };
    },
    async write(text) {
      const f = await idOf();
      if (f.why) return { ok: false, why: f.why };
      return f.id ? media(f.id, text) : made(text);
    },
    /* Drive has no create-if-absent, so a file found first is "taken"; two computers making a store in the same instant both write,
       and each re-reads before it trusts its own (storeLook). */
    async create(text) {
      const f = await idOf();
      if (f.why) return { ok: false, why: f.why };
      return f.id ? { ok: false, why: "taken" } : made(text);
    },
  };
  async function media(id, text) {
    const a = await asked(o.ask, "PATCH", DRIVE_UPLOAD + "/" + id + "?uploadType=media", Object.assign({ "content-type": "application/json" }, auth()), Buffer.from(text, "utf8"));
    if (a.why) return { ok: false, why: a.why };
    return a.res.status === 200 ? { ok: true } : { ok: false, why: driveWhy(a.res) };
  }
  async function made(text) {
    const b = "etiuda-" + crypto.randomBytes(12).toString("hex");
    const body = Buffer.from("--" + b + "\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: KEY_FILE, parents: ["appDataFolder"] })
      + "\r\n--" + b + "\r\ncontent-type: application/json\r\n\r\n" + text + "\r\n--" + b + "--", "utf8");
    const a = await asked(o.ask, "POST", DRIVE_UPLOAD + "?uploadType=multipart", Object.assign({ "content-type": "multipart/related; boundary=" + b }, auth()), body);
    if (a.why) return { ok: false, why: a.why };
    return a.res.status === 200 ? { ok: true } : { ok: false, why: driveWhy(a.res) };
  }
}
/* The folder of the provider a person signed in with, or null for one with none. */
function folderFor(provider, o) {
  if (provider === "microsoft") return graphFolder(o);
  if (provider === "google") return driveFolder(o);
  return null;
}

/* ---- the key file ---------------------------------------------------------------------------------------------------- */
const pubOf = seedHex => crypto.createPublicKey(crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" }))
  .export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
/* The store's keys as the folder and the local sealing keep them: K the content key, S the lead key's seed, the relay team id and
   address, and the computers enrolled (each {id, pub, desk}) with the list's revision, which S signs at the relay. */
function keyText(k) {
  return JSON.stringify({ kind: KEY_KIND, format: 1, k: k.k, s: k.s, rt: k.rt, url: k.url, devices: k.devices, rev: k.rev });
}
function keyRead(text) {
  let j = null;
  try { j = typeof text === "string" && text.length <= FILE_MAX ? JSON.parse(text) : null; } catch { j = null; }
  if (!j || typeof j !== "object" || j.kind !== KEY_KIND || j.format !== 1 || !HEX64.test(String(j.k)) || !HEX64.test(String(j.s))
    || !HEX32.test(String(j.rt)) || typeof j.url !== "string" || !/^https:\/\/[a-z0-9.-]+\/[a-z0-9/-]*$/.test(j.url)
    || !Array.isArray(j.devices) || j.devices.length > DEVICES_MAX || !Number.isSafeInteger(j.rev) || j.rev < 0) return null;
  const devices = j.devices.filter(d => d && typeof d === "object" && typeof d.id === "string" && HEX64.test(String(d.pub)) && typeof d.desk === "string")
    .map(d => ({ id: d.id, pub: d.pub, desk: d.desk }));
  if (devices.length !== j.devices.length) return null;
  return { k: j.k, s: j.s, rt: j.rt, url: j.url, devices, rev: j.rev };
}
/* THE ENDED MARK: what "Turn off everywhere" leaves in the folder in the key's place, so a computer still holding the keys reads that
   the person ended the store rather than writing the key back. It names the store it ended and holds no key. */
const ENDED_KIND = "etiuda-store-ended";
function endedText(rt) { return JSON.stringify({ kind: ENDED_KIND, format: 1, rt: String(rt) }); }
function endedRead(text) {
  let j = null;
  try { j = typeof text === "string" && text.length <= FILE_MAX ? JSON.parse(text) : null; } catch { j = null; }
  return !!j && typeof j === "object" && j.kind === ENDED_KIND && j.format === 1 && HEX32.test(String(j.rt));
}
function freshKeys(rand, url) {
  return { k: rand(32).toString("hex"), s: rand(32).toString("hex"), rt: rand(16).toString("hex"), url, devices: [], rev: 0 };
}

/* ---- whether sync is on (decision 52) ----------------------------------------------------------------------------------
   On a computer the company manages, sync is off unless its PersonalStore policy turns it on ("on", the person's own store; or
   "company", the company's), and the policy holds the switch; everywhere else it is on from sign-in, unless the person turned it
   off. {on, company, held}: held where the policy, not the person, decides. */
function storePolicy(managed, policy, personOff) {
  const p = typeof policy === "string" ? policy.toLowerCase() : "";
  if (p === "off") return { on: false, company: false, held: true };
  if (p === "on" || p === "company") return { on: true, company: p === "company", held: true };
  if (managed === true) return { on: false, company: false, held: true }; /* plant:policy-managed */
  return { on: personOff !== true, company: false, held: false };
}

/* ---- one look: the folder read, the key adopted, written back or made, and this computer enrolled -------------------------
   `io`: folder (above, or null where the provider has none), local() and keep(keys) (this computer's own sealed copy, or null),
   grant(rt, sPub) the licence service's store/grant answer {grant, store} or {why}, relay.create(keys, grant), relay.renew(keys, grant), relay.devices(keys, store)
   (the list signed by S, and by this computer with its store certificate), me {id, pub, desk} this computer's key at the relay, url the relay's address, rand(n).
   Answers {state: "on", keys, store}, {state: "unavailable", why} where the folder could not be reached (the desk works as today),
   or {state: "paused", why} where the service or relay was not. It shows nothing and asks nothing. */
async function storeLook(io) {
  if (!io.folder) return { state: "unavailable", why: "no-drive" };
  const read = await io.folder.read();
  if (!read.ok) return { state: "unavailable", why: read.why };
  /* The person turned sync off everywhere: this computer turns off too, unless the person has turned it on here since (io.fresh),
     where a new store is made over the mark. */
  const ended = read.text !== null && endedRead(read.text);
  if (ended && io.fresh !== true) return { state: "ended" }; /* plant:ended-off */
  /* The relay holds the store the folder names no more (io.gone, its id; swept, or ended by the service): it is replaced as an ended one is. */
  const gone = !ended && !!io.gone && read.text !== null && (keyRead(read.text) || {}).rt === io.gone;
  let keys = read.text === null || ended || gone ? null : keyRead(read.text);
  const local = ended || gone ? null : io.local();
  if (!keys && local) {
    /* The file deleted or unreadable, this computer holding the keys: written back, so no other computer starts afresh. A deleted one
       is made again only where no file has come since; one another computer wrote meanwhile is adopted. */
    const back = read.text === null ? await io.folder.create(keyText(local)) : await io.folder.write(keyText(local)); /* plant:write-back */
    if (!back.ok && back.why !== "taken") return { state: "unavailable", why: back.why };
    const now = back.ok ? { ok: true, text: keyText(local) } : await io.folder.read();
    keys = now.ok && now.text !== null ? keyRead(now.text) : null;
    if (!keys) return { state: "unavailable", why: now.ok ? "refused" : now.why };
  }
  let made = false;
  if (!keys) {
    const fresh = freshKeys(io.rand, io.url);
    const put = ended || gone ? await io.folder.write(keyText(fresh)) : await io.folder.create(keyText(fresh));
    if (!put.ok && put.why !== "taken") return { state: "unavailable", why: put.why };
    /* Read again, so two computers making a store at once both adopt the file that stands where each sees the other's write. Where each
       reads back its own (a replica not yet reconciled) both replace, and the earlier store ends: its computer adopts the folder's store
       at the look after its replica shows it, and its sync carries every edit there (shell/sync/sync.cjs). */
    const again = await io.folder.read();
    keys = again.ok && again.text !== null ? keyRead(again.text) : null;
    if (!keys) return { state: "unavailable", why: again.ok ? "refused" : again.why };
    made = keys.rt === fresh.rt; /* plant:made */
  }
  const sPub = pubOf(keys.s);
  /* Only a computer that made the store its folder shows says it replaces the person's others (the service ends them); two may, above. */
  const got = await io.grant(keys.rt, sPub, { replace: made });
  if (!got || got.why || !got.grant) return { state: "paused", why: got && got.why ? got.why : "unreached", keys };
  /* Sealed here only once the service grants the store to the person signed in, so a key file it refuses never replaces this computer's own. */
  if (!local || local.rt !== keys.rt || local.k !== keys.k || local.s !== keys.s || local.rev !== keys.rev) io.keep(keys); /* plant:keep-granted */
  if (made) {
    const c = await io.relay.create(keys, got.grant);
    if (!c.ok) return { state: "paused", why: c.why || "relay", keys };
  }
  /* Every other look hands the relay the grant it was given, so the store lapses from the person's last seat and not from its making; a
     renewal refused for any other reason changes nothing here and is asked again at the next look. */
  else if (typeof io.relay.renew === "function") {
    let r = null;
    r = await Promise.resolve(io.relay.renew(keys, got.grant)).catch(() => null); /* plant:store-renew */
    /* Swept while every computer was away, or a seat regained after the sweep: a fresh store, once, which this computer's sync fills. */
    if (r && r.ok === false && r.why === "not-enrolled" && !io.gone) return storeLook(Object.assign({}, io, { gone: keys.rt })); /* plant:store-remake */
  }
  if (!keys.devices.some(d => d.pub === io.me.pub)) {
    /* This computer enrols itself with S, the list kept in the folder's file so the next computer signs the whole of it. */
    const next = Object.assign({}, keys, { devices: keys.devices.concat([{ id: io.me.id, pub: io.me.pub, desk: io.me.desk }]).slice(-DEVICES_MAX), rev: keys.rev + 1 });
    const d = await io.relay.devices(next, got.store);
    if (!d.ok) return { state: "paused", why: d.why || "relay", keys };
    const w = await io.folder.write(keyText(next));
    if (!w.ok) return { state: "unavailable", why: w.why, keys: next };
    io.keep(next);
    keys = next;
  }
  return { state: "on", keys, store: got.store, made };
}

/* ---- this computer leaves the store (This computer): the list without it written to the folder first, so a computer enrolling
   later signs it without this one even where the relay is not reached now; then signed at the relay by S and by this computer under its
   store certificate. `io`: folder, keys (this computer's last copy), cert() (a current store certificate, asked only once the folder
   holds this store), relay.devices(next, cert), me {pub}. {ok: true} where the store names it no more, or the store is gone or
   replaced; else {ok: false, why}. */
async function storeLeave(io) {
  if (!io.folder) return { ok: false, why: "no-drive" };
  const read = await io.folder.read();
  if (!read.ok) return { ok: false, why: read.why };
  const held = read.text === null ? null : keyRead(read.text);
  if ((read.text !== null && endedRead(read.text)) || (held && held.rt !== io.keys.rt)) return { ok: true };
  const base = held || io.keys, listed = base.devices.some(d => d.pub === io.me.pub);
  const next = listed ? Object.assign({}, base, { devices: base.devices.filter(d => d.pub !== io.me.pub), rev: base.rev + 1 }) : base;
  if (listed) {
    const w = read.text === null ? await io.folder.create(keyText(next)) : await io.folder.write(keyText(next)); /* plant:leave-folder */
    if (!w.ok) return { ok: false, why: w.why };
  }
  const cert = await io.cert();
  if (!cert) return { ok: false, why: "unreached" };
  /* Posted even where the folder already left this computer out, since the relay may not have taken that list yet; a list it holds
     already (replay-rev) or a store it no longer has is done. */
  const d = await io.relay.devices(next, cert); /* plant:leave-relay */
  return d.ok || d.why === "replay-rev" || d.why === "not-enrolled" ? { ok: true } : { ok: false, why: d.why || "relay" };
}

/* ---- what the desk says, once: a reason it says the first time it meets it and not again until another, or sync, comes ---- */
function sayOnce(kept, look) {
  const why = look && look.state === "unavailable" ? look.why : "";
  /* Offline is not a reason to speak: the desk syncs when it is back, and the row stays as it was. */
  if (!why || why === "offline") return { say: null, kept: why === "offline" ? kept : "" };
  if (why === kept) return { say: null, kept }; /* plant:say-once */
  return { say: why, kept: why };
}

/* ---- the honest pause: a store certificate lapsed pauses sync; the row speaks only after PAUSE_SAY_MS ---- */
const PAUSE_SAY_MS = 3 * 24 * 60 * 60 * 1000;
function pausedLine(cert, now, signinRefused) {
  if (signinRefused === true || !cert || !Number.isSafeInteger(cert.until) || now < cert.until) return null;
  return now - cert.until >= PAUSE_SAY_MS ? { since: cert.until } : null; /* plant:pause-days */
}

/* ---- what the page is told: the Account row's line and the one thing said once -------------------------------------------
   `o`: provider (the signed-in one, "" for none), pol (storePolicy's answer), look (the last look's {state, why} or null), until (the
   last store certificate's end), now, signinRefused, conflicts (cards kept in two versions), say (what waits to be said once), owed
   (a Turn off everywhere the licence service has not answered yet), seatless (the account's seat refused at its last renewal), full
   (the store's room at the relay refused a write, roomNext). Answers
   {shown, line, on, held, why, since, say}: line "org-off" where policy keeps sync off, "off" where the person turned it off,
   "ungiven" where the folder's consent was never given (off, the switch the person's own way to ask for it), "unavailable" where
   the folder could not be reached for a reason the person cannot mend (never offline), "noseat", "conflict", "paused" after
   PAUSE_SAY_MS, "full", else "on". Nothing of a key, a store or a token. Pure. */
function storeRow(o) {
  if (o.provider !== "microsoft" && o.provider !== "google") return { shown: false };
  const pol = o.pol || {}, say = typeof o.say === "string" ? o.say : "";
  if (!pol.on && !pol.held && o.owed === true) return { shown: true, line: "ending", on: false, held: false, why: "", since: 0, say: "" };
  if (!pol.on) return { shown: true, line: pol.held ? "org-off" : "off", on: false, held: pol.held === true, why: "", since: 0, say: "" };
  const base = { shown: true, on: true, held: pol.held === true, why: "", since: 0, say };
  const look = o.look;
  if (look && look.state === "unavailable" && look.why === "ungiven") return Object.assign(base, { line: "ungiven", on: false, say: "" }); /* plant:row-ungiven */
  if (look && look.state === "unavailable" && look.why !== "offline") return Object.assign(base, { line: "unavailable", why: String(look.why || "") });
  if (o.seatless === true) return Object.assign(base, { line: "noseat" }); /* plant:row-noseat */
  if (Number(o.conflicts) > 0) return Object.assign(base, { line: "conflict" });
  const p = pausedLine({ until: o.until }, o.now, o.signinRefused);
  if (p) return Object.assign(base, { line: "paused", since: p.since });
  return Object.assign(base, { line: o.full === true ? "full" : "on" }); /* plant:row-full */
}
/* The store's room: full once the relay (or the channel's own count) refuses a write as "team-size", the changes staying owed on this
   computer, and no longer once a write is taken (reason ""); any other refusal leaves it as it was. */
function roomNext(full, reason) {
  if (reason === "team-size") return true;
  return reason === "" ? false : full === true;
}
/* Said once, from the account control: "on" at the first look that finds sync on on this computer, where that look made the person's
   store (a second computer, or a store made afresh later, says nothing); `told` whether this computer has had its first such look. */
function firstSay(told, look) {
  if (told === true || !look || look.state !== "on") return { say: "", told: told === true };
  return { say: look.made === true ? "on" : "", told: true }; /* plant:first-say */
}

module.exports = { KEY_FILE, KEY_KIND, FILE_MAX, DEVICES_MAX, GRAPH, DRIVE, DRIVE_UPLOAD, PAUSE_SAY_MS, graphFolder, driveFolder, folderFor, keyText, keyRead,
  freshKeys, pubOf, storePolicy, storeLook, storeLeave, sayOnce, pausedLine, storeRow, roomNext, firstSay, endedText, endedRead };
