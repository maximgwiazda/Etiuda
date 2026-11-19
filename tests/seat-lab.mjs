/* Shared sign-in lab helper for bare-node shell tests (criterion (a)-(d), B-H).
 * Drives the loaded shell's own ETIUDA_SIGNIN_LAB path over loopback 127.0.0.1 and
 * mints signed seat certificates under a per-run (or caller-supplied) test root, so
 * no test writes signin.json directly or rests on a bypass of the desk's own check.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const core = nodeRequire(path.join(ROOT, "relay", "core.cjs"));

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const DAY_MS = 24 * 60 * 60 * 1000;
const hex = n => crypto.randomBytes(n).toString("hex");
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

function certBytes(c) {
  return Buffer.from("etiuda-seat-certificate\n" + [c.format, c.licence, c.desk, c.person, c.code, c.issued, c.until, c.sig.keyId]
    .concat(c.pooled === true ? ["pooled"] : [])
    .concat(c.deskOnly === true ? ["desk-only"] : [])
    .map(String).join("\n"), "utf8");
}

function makeKey(prefix) {
  const kp = crypto.generateKeyPairSync("ed25519");
  const pub = kp.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI_ED25519.length).toString("hex");
  return { id: prefix + "-" + hex(4), pub, privateKey: kp.privateKey };
}

function keyFromSeed(id, seedHex, pubHex) {
  return {
    id,
    pub: pubHex,
    privateKey: crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]),
      format: "der",
      type: "pkcs8",
    }),
  };
}

function resolveKey(k, fallbackPrefix) {
  if (!k) return makeKey(fallbackPrefix);
  if (k.privateKey && k.pub) return { id: k.id || k.keyId || fallbackPrefix + "-1", pub: k.pub, privateKey: k.privateKey };
  if (k.seed && k.pub) return keyFromSeed(k.id || k.keyId || fallbackPrefix + "-1", k.seed, k.pub);
  throw new Error("seat-lab: key requires privateKey or seed");
}

function writeLabFile(labDir, opts) {
  const o = opts || {};
  const origin = (o.serviceOrigin || "http://127.0.0.1:1").replace(/\/+$/, "");
  const root = o.root || "";
  if (!/^[0-9a-f]{64}$/.test(root)) throw new Error("seat-lab: root must be 64 hex");
  fs.mkdirSync(labDir, { recursive: true });
  const filePath = path.join(labDir, o.filename || "signin-lab.json");
  fs.writeFileSync(filePath, JSON.stringify({
    service: origin + "/",
    root,
    provider: {
      id: "lab",
      clientId: o.clientId || "lab-client",
      scope: o.scope || "openid",
      authorize: origin + "/auth",
      token: origin + "/token",
      issuer: origin,
    },
  }), "utf8");
  return filePath;
}

function labShell(pendingNonces, labFetches, serviceOrigin) {
  const nonces = pendingNonces || new Map();
  const fetches = labFetches || [];
  const origin = (serviceOrigin || "http://127.0.0.1:1").replace(/\/+$/, "");
  return {
    openExternal(url) {
      const u = new URL(String(url));
      if (u.origin + u.pathname !== origin + "/auth") {
        return Promise.reject(new Error("unexpected external url: " + url));
      }
      const redirect = u.searchParams.get("redirect_uri");
      const state = u.searchParams.get("state");
      const nonce = u.searchParams.get("nonce");
      const code = "lab-code-" + hex(8);
      nonces.set(code, nonce);
      const back = redirect + "/?state=" + encodeURIComponent(state) + "&code=" + encodeURIComponent(code);
      fetches.push(fetch(back, { redirect: "follow" }).then(r => r.arrayBuffer()).catch(() => {}));
      return Promise.resolve();
    },
  };
}

async function settleLabShell(labFetches) {
  while (labFetches && labFetches.length) {
    await Promise.allSettled(labFetches.splice(0));
  }
}

function mintCert(deskPub, clockNow, spec, keys) {
  const o = spec || {};
  const rootKey = keys.rootKey;
  const signer = keys.signer;
  const now = Math.max(1, Number.isFinite(clockNow) ? Math.round(clockNow) : Date.now());
  const maxSpan = o.pooled ? core.POOLED_CERT_SPAN_MS : core.CERT_SPAN_MS;
  const span = Number.isFinite(o.spanMs) ? o.spanMs : Number.isFinite(o.span) ? o.span : maxSpan;
  let issued = now;
  let until = now + span;
  if (o.kind === "trial" && Number.isFinite(o.trialDay)) {
    const totalDays = Number.isFinite(o.trialDays) ? o.trialDays : 14;
    const elapsedDays = Math.max(0, o.trialDay - 1);
    issued = Math.max(1, now - elapsedDays * DAY_MS);
    until = issued + Math.min(totalDays * DAY_MS, maxSpan);
  } else if (o.ended === true || (typeof o.endedAgoMs === "number" && o.endedAgoMs > 0)) {
    const ago = typeof o.endedAgoMs === "number" && o.endedAgoMs > 0 ? Math.round(o.endedAgoMs) : 1000;
    until = Math.max(2, now - ago);
    issued = Math.max(1, until - Math.min(span, until - 1));
  } else if (typeof o.endsInMs === "number" && Number.isFinite(o.endsInMs)) {
    if (o.endsInMs <= 0) {
      until = Math.max(2, now + Math.round(o.endsInMs));
      issued = Math.max(1, until - Math.min(span, until - 1));
    } else {
      issued = now;
      until = now + Math.round(o.endsInMs);
    }
  }
  if (Number.isSafeInteger(o.issued)) issued = o.issued;
  if (Number.isSafeInteger(o.until)) until = o.until;

  const via = o.via || (() => {
    const d = {
      kind: "etiuda-delegation",
      format: 1,
      key: { id: signer.id, pub: signer.pub },
      may: ["licence", "relay-grant"],
      from: Math.max(1, issued - 10 * DAY_MS),
      until: issued + 100 * DAY_MS,
      sig: { alg: "ed25519", keyId: rootKey.id, value: "" },
    };
    d.sig.value = signHex(rootKey, core.delegationBytes(d));
    return d;
  })();

  const deskOnly = o.deskOnly !== undefined ? !!o.deskOnly : o.kind === "trial";
  const cert = Object.assign({
    kind: "etiuda-seat-certificate",
    format: 1,
    licence: o.licence || hex(16),
    desk: deskPub,
    person: o.person || hex(32),
    code: o.code || "ABCDEFGHJKMNPQRS",
    issued,
    until,
    via,
  }, o.pooled === true ? { pooled: true } : {}, deskOnly ? { deskOnly: true } : {}, o.fields || {});
  cert.sig = { alg: "Ed25519", keyId: signer.id, value: "" };
  cert.sig.value = signHex(signer, certBytes(cert));
  return cert;
}

function holdingFor(spec, cert) {
  const o = spec || {};
  if (o.holding !== undefined) return o.holding;
  if (o.seat && typeof o.seat === "object") return o.seat;
  if (!o.kind) return null;
  const ends = Number.isSafeInteger(o.ends) ? o.ends : (cert ? cert.until : 0);
  if (o.kind === "trial") return { on: "trial", ends };
  if (o.kind === "studio-trial") return { on: "studio-trial", ends };
  if (o.kind === "purchase" || o.kind === "own") return { on: "own", ends };
  if (o.kind === "team") return Object.assign({ on: "team", ends }, o.lead ? { lead: o.lead } : {});
  if (o.kind === "org") return { on: "org", ends };
  return null;
}

function doorsSigFor(cert, doors, signer) {
  const fields = [cert.sig.value, doors.length].concat(...doors.map(d => [d.team, d.rt, d.url, d.keyId, d.lead, d.box]));
  return signHex(signer, Buffer.from("etiuda-seat-doors\n" + fields.join("\n"), "utf8"));
}

function revocationsFor(specRev, rootKey) {
  if (!specRev) return null;
  if (specRev.sig && specRev.sig.value) return specRev;
  const r = {
    kind: "etiuda-revocations",
    format: 1,
    serial: specRev.serial || 1,
    keys: (specRev.keys || []).slice().sort(),
    sig: { alg: "ed25519", keyId: rootKey.id, value: "" },
  };
  r.sig.value = signHex(rootKey, core.revocationBytes(r));
  return r;
}

function labFetch(url, init, clockNow, state) {
  const origin = (state && state.serviceOrigin ? state.serviceOrigin : "http://127.0.0.1:1").replace(/\/+$/, "");
  const uStr = String(url);
  if (!uStr.startsWith(origin + "/")) return null;
  const spec = (state && typeof state.getSeat === "function" ? state.getSeat() : state && state.seat) || {};
  const jsonRes = (o, status) => Promise.resolve(new Response(JSON.stringify(o), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  }));

  if (uStr.endsWith("/token")) {
    const form = new URLSearchParams(Buffer.from(init && init.body ? init.body : "").toString("utf8"));
    const code = form.get("code") || "";
    const nonces = state && state.pendingNonces;
    const nonce = nonces ? nonces.get(code) : undefined;
    if (nonce && nonces) nonces.delete(code);
    const nowSec = Math.floor(Date.now() / 1000);
    const claims = Object.assign({
      iss: origin,
      aud: state && state.clientId ? state.clientId : "lab-client",
      sub: spec.sub || "sub-1",
      iat: nowSec,
      exp: nowSec + 3600,
    }, nonce ? { nonce } : {}, spec.idClaims || {});
    const jwt = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "."
      + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig";
    return jsonRes({
      token_type: "Bearer",
      expires_in: 3600,
      id_token: jwt,
      refresh_token: spec.refreshToken || "rt-1",
    });
  }

  if (uStr.endsWith("/signin/desk")) {
    const req = JSON.parse(Buffer.from(init.body).toString("utf8"));
    if (spec.status && spec.status !== 200) {
      return jsonRes(Object.assign(
        { ok: false, reason: spec.reason || "full" },
        spec.managed === true ? { managed: true, cause: spec.cause || "" } : {}
      ), spec.status);
    }
    const revoked = revocationsFor(spec.revoked, state.rootKey);
    const code = spec.code || "ABCDEFGHJKMNPQRS";
    if (spec.none === true || spec.waiting === true || spec.certificate === null || spec.kind === "none") {
      const body = Object.assign(
        { ok: true, code, certificate: null, doors: [] },
        spec.waiting === true ? { reason: "waiting" } : {},
        spec.ask ? { ask: spec.ask } : {},
        spec.trials ? { trials: spec.trials } : {},
        spec.holding ? { seat: spec.holding } : {},
        spec.storeOffer === true ? { storeOffer: true } : {},
        spec.managed === true ? { managed: true, cause: spec.cause || "" } : {},
        revoked ? { revoked } : {}
      );
      return jsonRes(body);
    }
    const cert = mintCert(req.desk, clockNow, spec, state);
    const doors = Array.isArray(spec.doors) ? spec.doors : [];
    const doorsSig = doors.length ? (spec.doorsSig !== undefined ? spec.doorsSig : doorsSigFor(cert, doors, state.signer)) : "";
    const holding = holdingFor(spec, cert);
    const body = Object.assign(
      { ok: true, code: cert.code, certificate: cert, doors },
      doorsSig ? { doorsSig } : {},
      holding ? { seat: holding } : {},
      spec.trials ? { trials: spec.trials } : {},
      spec.ask ? { ask: spec.ask } : {},
      spec.storeOffer === true ? { storeOffer: true } : {},
      spec.managed === true ? { managed: true, cause: spec.cause || "" } : {},
      revoked ? { revoked } : {}
    );
    return jsonRes(body);
  }

  if (uStr.endsWith("/signout/desk")) {
    return jsonRes({ ok: true });
  }
  return null;
}

function withSigninLab(labPath, fn) {
  const wasLab = process.env.ETIUDA_SIGNIN_LAB;
  process.env.ETIUDA_SIGNIN_LAB = labPath;
  try { return fn(); }
  finally {
    if (wasLab === undefined) delete process.env.ETIUDA_SIGNIN_LAB;
    else process.env.ETIUDA_SIGNIN_LAB = wasLab;
  }
}

async function seatDesk(desk, opts, settleFn) {
  const o = opts || {};
  const hasSpec = !!(o.force || o.none || o.waiting || o.ended || o.endedAgoMs !== undefined || o.endsInMs !== undefined
    || o.kind || o.licence || o.spanMs !== undefined || o.span !== undefined || o.deskOnly !== undefined
    || o.pooled !== undefined || o.holding !== undefined || o.seat !== undefined || o.code || o.status
    || o.trials || o.doors || o.revoked || o.issued !== undefined || o.until !== undefined);
  let sameDesk = false;
  if (!hasSpec) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(desk.ud, "desk.json"), "utf8"));
      const cur = JSON.parse(fs.readFileSync(path.join(desk.ud, "signin.json"), "utf8"));
      sameDesk = !!(d && d.branch && d.branch.sign && d.branch.sign.pub && cur && cur.held && cur.held.cert && cur.held.cert.desk === d.branch.sign.pub);
    } catch { sameDesk = false; }
  }
  if (sameDesk) return null;
  desk.sync("etiuda:signin-click", "lab");
  const view = await desk.ask("etiuda:signin", "lab");
  if (typeof settleFn === "function") await settleFn();
  const expectNone = !!(o.none || o.waiting || o.kind === "none" || o.certificate === null);
  const ok = !!view && view.signedIn === "lab" && (expectNone ? view.seat === "none" : (view.seat === "held" || view.seat === "lapsed"));
  if (!ok || (o.waiting && view.refused !== "waiting") || (o.expectWorks === true && view.works !== true)) {
    throw new Error("lab sign-in did not seat desk " + desk.ud + ": " + JSON.stringify(view));
  }
  return view;
}

const isInside = (dir, target) => {
  const rel = path.relative(dir, path.resolve(target));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};

/* Wraps Node's fs write paths so any signin.json write by the leg itself (outside the shellFs proxy) is caught. */
function createSigninGuard(opts) {
  const o = opts || {};
  const dirs = (o.dirs || []).map(d => path.resolve(d));
  const labelRoot = o.labelRoot ? path.resolve(o.labelRoot) : null;
  const onWrite = typeof o.onWrite === "function" ? o.onWrite : null;
  const legWrites = [];
  const shellWrites = [];

  const noteWrite = (target, fromShell) => {
    if (typeof target !== "string") return;
    const resolved = path.resolve(target);
    if (onWrite) onWrite(resolved, fromShell);
    if (path.basename(resolved) !== "signin.json") return;
    if (dirs.length > 0 && !dirs.some(d => isInside(d, resolved))) return;
    const label = labelRoot && isInside(labelRoot, resolved) ? path.relative(labelRoot, resolved).replace(/\\/g, "/") : resolved.replace(/\\/g, "/");
    if (fromShell) shellWrites.push(label);
    else legWrites.push(label);
  };

  const rawWriteFileSync = fs.writeFileSync.bind(fs);
  const rawRenameSync = fs.renameSync.bind(fs);
  const rawCopyFileSync = fs.copyFileSync.bind(fs);
  const rawAppendFileSync = fs.appendFileSync.bind(fs);
  const rawWriteFile = fs.writeFile.bind(fs);
  const rawOpenSync = fs.openSync.bind(fs);
  const rawPromisesWriteFile = fs.promises.writeFile.bind(fs.promises);
  const rawPromisesRename = fs.promises.rename.bind(fs.promises);
  const rawPromisesCopyFile = fs.promises.copyFile.bind(fs.promises);
  const rawPromisesAppendFile = fs.promises.appendFile.bind(fs.promises);
  const isWriteFlags = flags => (typeof flags === "string"
    ? /[wa+]/.test(flags)
    : typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0);

  const wrappedWriteFileSync = function (file, ...args) { noteWrite(file, false); return rawWriteFileSync(file, ...args); };
  const wrappedRenameSync = function (oldPath, newPath, ...args) { noteWrite(newPath, false); return rawRenameSync(oldPath, newPath, ...args); };
  const wrappedCopyFileSync = function (src, dest, ...args) { noteWrite(dest, false); return rawCopyFileSync(src, dest, ...args); };
  const wrappedAppendFileSync = function (file, ...args) { noteWrite(file, false); return rawAppendFileSync(file, ...args); };
  const wrappedWriteFile = function (file, ...args) { noteWrite(file, false); return rawWriteFile(file, ...args); };
  const wrappedOpenSync = function (file, flags, ...args) { if (isWriteFlags(flags)) noteWrite(file, false); return rawOpenSync(file, flags, ...args); };
  const wrappedPromisesWriteFile = function (file, ...args) { noteWrite(file, false); return rawPromisesWriteFile(file, ...args); };
  const wrappedPromisesRename = function (oldPath, newPath, ...args) { noteWrite(newPath, false); return rawPromisesRename(oldPath, newPath, ...args); };
  const wrappedPromisesCopyFile = function (src, dest, ...args) { noteWrite(dest, false); return rawPromisesCopyFile(src, dest, ...args); };
  const wrappedPromisesAppendFile = function (file, ...args) { noteWrite(file, false); return rawPromisesAppendFile(file, ...args); };

  fs.writeFileSync = wrappedWriteFileSync;
  fs.renameSync = wrappedRenameSync;
  fs.copyFileSync = wrappedCopyFileSync;
  fs.appendFileSync = wrappedAppendFileSync;
  fs.writeFile = wrappedWriteFile;
  fs.openSync = wrappedOpenSync;
  fs.promises.writeFile = wrappedPromisesWriteFile;
  fs.promises.rename = wrappedPromisesRename;
  fs.promises.copyFile = wrappedPromisesCopyFile;
  fs.promises.appendFile = wrappedPromisesAppendFile;

  const callThrough = (obj, prop, wrapped, raw, args) => (obj[prop] !== wrapped ? obj[prop](...args) : raw(...args));

  const shellPromises = new Proxy(fs.promises, {
    get(t, k) {
      if (k === "writeFile") return (file, ...args) => { noteWrite(file, true); return callThrough(fs.promises, "writeFile", wrappedPromisesWriteFile, rawPromisesWriteFile, [file, ...args]); };
      if (k === "rename") return (oldPath, newPath, ...args) => { noteWrite(newPath, true); return callThrough(fs.promises, "rename", wrappedPromisesRename, rawPromisesRename, [oldPath, newPath, ...args]); };
      if (k === "copyFile") return (src, dest, ...args) => { noteWrite(dest, true); return callThrough(fs.promises, "copyFile", wrappedPromisesCopyFile, rawPromisesCopyFile, [src, dest, ...args]); };
      if (k === "appendFile") return (file, ...args) => { noteWrite(file, true); return callThrough(fs.promises, "appendFile", wrappedPromisesAppendFile, rawPromisesAppendFile, [file, ...args]); };
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  const shellFs = new Proxy(fs, {
    get(t, k) {
      if (k === "writeFileSync") return (file, ...args) => { noteWrite(file, true); return callThrough(fs, "writeFileSync", wrappedWriteFileSync, rawWriteFileSync, [file, ...args]); };
      if (k === "renameSync") return (oldPath, newPath, ...args) => { noteWrite(newPath, true); return callThrough(fs, "renameSync", wrappedRenameSync, rawRenameSync, [oldPath, newPath, ...args]); };
      if (k === "copyFileSync") return (src, dest, ...args) => { noteWrite(dest, true); return callThrough(fs, "copyFileSync", wrappedCopyFileSync, rawCopyFileSync, [src, dest, ...args]); };
      if (k === "appendFileSync") return (file, ...args) => { noteWrite(file, true); return callThrough(fs, "appendFileSync", wrappedAppendFileSync, rawAppendFileSync, [file, ...args]); };
      if (k === "writeFile") return (file, ...args) => { noteWrite(file, true); return callThrough(fs, "writeFile", wrappedWriteFile, rawWriteFile, [file, ...args]); };
      if (k === "openSync") return (file, flags, ...args) => { if (isWriteFlags(flags)) noteWrite(file, true); return callThrough(fs, "openSync", wrappedOpenSync, rawOpenSync, [file, flags, ...args]); };
      if (k === "promises") return shellPromises;
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });

  return {
    shellFs,
    legWrites,
    shellWrites,
    passed(requireShellWrite = true) {
      return legWrites.length === 0 && (!requireShellWrite || shellWrites.length > 0);
    },
    report(id = "943c", requireShellWrite = true) {
      const ok = legWrites.length === 0 && (!requireShellWrite || shellWrites.length > 0);
      const line = id + " no signin.json under any desk folder of the leg was written by the leg itself: leg writes "
        + legWrites.length + (legWrites.length ? " (" + [...new Set(legWrites)].slice(0, 5).join(", ") + ")" : "")
        + ", shell writes " + shellWrites.length;
      return { ok, line };
    },
    restore() {
      fs.writeFileSync = rawWriteFileSync;
      fs.renameSync = rawRenameSync;
      fs.copyFileSync = rawCopyFileSync;
      fs.appendFileSync = rawAppendFileSync;
      fs.writeFile = rawWriteFile;
      fs.openSync = rawOpenSync;
      fs.promises.writeFile = rawPromisesWriteFile;
      fs.promises.rename = rawPromisesRename;
      fs.promises.copyFile = rawPromisesCopyFile;
      fs.promises.appendFile = rawPromisesAppendFile;
    },
  };
}

function createSeatLab(opts) {
  const o = opts || {};
  const rootKey = resolveKey(o.rootKey, "lab-root");
  const signer = resolveKey(o.signer, "lab-svc");
  const serviceOrigin = (o.serviceOrigin || "http://127.0.0.1:1").replace(/\/+$/, "");
  const clientId = o.clientId || "lab-client";
  const labPath = writeLabFile(o.labDir, {
    filename: o.filename,
    serviceOrigin,
    root: o.root || rootKey.pub,
    clientId,
    scope: o.scope,
  });
  const pendingNonces = new Map();
  const labFetches = [];
  let seatSpec = o.seat || {};
  const defaultClock = typeof o.clock === "function" ? o.clock : () => Date.now();
  const state = {
    rootKey,
    signer,
    serviceOrigin,
    clientId,
    pendingNonces,
    getSeat: () => seatSpec,
  };
  return {
    path: labPath,
    root: o.root || rootKey.pub,
    rootKey,
    signer,
    setSeat(spec) { seatSpec = spec || {}; },
    getSeat() { return seatSpec; },
    labShell: () => labShell(pendingNonces, labFetches, serviceOrigin),
    settleLabShell: () => settleLabShell(labFetches),
    labFetch: (url, init, clockNow, overrideSeat) => {
      const now = clockNow !== undefined ? clockNow : defaultClock();
      const s = overrideSeat ? Object.assign({}, state, { getSeat: () => overrideSeat }) : state;
      return labFetch(url, init, now, s);
    },
    net: (fallback) => ({
      fetch: (url, init) => {
        const res = labFetch(url, init, defaultClock(), state);
        if (res) return res;
        return typeof fallback === "function" ? fallback(url, init) : Promise.reject(new Error("no network in seat-lab: " + url));
      },
      isOnline: () => true,
    }),
    mintCert: (deskPub, clockNow, spec) => mintCert(deskPub, clockNow !== undefined ? clockNow : defaultClock(), spec || seatSpec, state),
    withSigninLab: (fn) => withSigninLab(labPath, fn),
    seatDesk: async (desk, spec) => {
      const prev = seatSpec;
      if (spec) seatSpec = spec;
      try { return await seatDesk(desk, spec, () => settleLabShell(labFetches)); }
      finally { if (spec) seatSpec = prev; }
    },
  };
}

export {
  createSeatLab,
  createSigninGuard,
  writeLabFile,
  labShell,
  labFetch,
  settleLabShell,
  seatDesk,
  withSigninLab,
  mintCert,
};
