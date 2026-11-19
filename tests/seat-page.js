/* ONE SEATED BOOT FOR BROWSER PAGE LEGS.
 *
 * Mints a real seat certificate via tests/seat-lab.mjs under a per-call test root,
 * verifies its delegation and certificate signatures against that root, and builds a
 * view shaped as shell/main.js signinViewOf gives one so window.E_HOST.signinState()
 * passes the page's deskWorks() gate without touching src/, shell/, ui/ or engine/.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSeatLab } = require("./seat-lab.mjs");

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");


function canonJson(v) {
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function verifyEd25519(pubHex, bytes, sigHex) {
  try {
    if (!/^[0-9a-f]{64}$/.test(String(pubHex)) || !/^[0-9a-f]{128}$/.test(String(sigHex))) return false;
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519, Buffer.from(pubHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, bytes, key, Buffer.from(sigHex, "hex")) === true;
  } catch (e) {
    return false;
  }
}

function verifySeatCert(cert, rootPub, deskPub, now) {
  if (!cert || typeof cert !== "object" || !cert.via || !cert.sig) return false;
  if (String(cert.desk) !== String(deskPub)) return false;
  if (!Number.isSafeInteger(cert.issued) || !Number.isSafeInteger(cert.until) || cert.until <= cert.issued) return false;
  if (!Number.isSafeInteger(now) || now < cert.issued || now >= cert.until) return false;
  const d = cert.via;
  if (!Array.isArray(d.may) || d.may.indexOf("licence") < 0) return false;
  const viaBytes = Buffer.from("etiuda-delegation\n" + canonJson(Object.assign({}, d, {
    sig: { alg: d.sig.alg, keyId: d.sig.keyId },
  })), "utf8");
  if (!verifyEd25519(rootPub, viaBytes, d.sig.value)) return false;
  if (cert.sig.keyId !== d.key.id) return false;
  const certBytes = Buffer.from("etiuda-seat-certificate\n" + [
    cert.format, cert.licence, cert.desk, cert.person, cert.code, cert.issued, cert.until, cert.sig.keyId,
  ].concat(cert.pooled === true ? ["pooled"] : []).concat(cert.deskOnly === true ? ["desk-only"] : []).map(String).join("\n"), "utf8");
  return verifyEd25519(d.key.pub, certBytes, cert.sig.value);
}

function deskPubKeyHex() {
  const kp = crypto.generateKeyPairSync("ed25519");
  return kp.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI_ED25519.length).toString("hex");
}

function buildSeatedView(opts) {
  const o = opts || {};
  const now = Number.isSafeInteger(o.now) ? o.now : Date.now();
  const offered = Array.isArray(o.offered) ? o.offered.slice() : ["microsoft", "google"];
  const signedIn = typeof o.signedIn === "string" ? o.signedIn : (offered[0] || "");
  const labDir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-seat-page-"));
  let cert, root;
  try {
    const lab = createSeatLab({ labDir });
    root = o.tamperRoot || lab.root;
    const deskPub = deskPubKeyHex();
    const spec = Object.assign({ kind: "own", code: "ABCDEFGHJKMNPQRS" }, o.certSpec || {});
    cert = lab.mintCert(deskPub, now, spec);
    if (o.tamperUntil != null) cert.until = o.tamperUntil;
    const certOk = verifySeatCert(cert, root, deskPub, now);
    const works = certOk && offered.length > 0 && !!signedIn && offered.indexOf(signedIn) >= 0;
    const holding = signedIn && cert ? { on: spec.kind === "trial" ? "trial" : "own", ends: cert.until } : null;
    return Object.assign({
      offered,
      preview: false,
      signedIn,
      code: signedIn ? cert.code : "",
      seat: !signedIn ? "" : (now >= cert.until ? "lapsed" : "held"),
      deskOnly: !!signedIn && cert.deskOnly === true,
      askLead: false,
      trialUntil: 0,
      licenceManaged: false,
      cause: "",
      at: signedIn ? now : 0,
      reached: true,
      ask: false,
      refused: "",
      busy: "",
      said: "",
      doors: [],
      relaySeat: "",
      outOwed: false,
      link: "",
      keeps: true,
      works,
      now,
      until: cert ? cert.until : 0,
      stoppedAt: 0,
      online: true,
      ended: 0,
      holding,
      trials: null,
      registered: true,
    }, o.overrides || {});
  } finally {
    fs.rmSync(labDir, { recursive: true, force: true });
  }
}

let cachedView = null;

function seatedView(opts) {
  if (opts && (opts.fresh || opts.certSpec || opts.now || opts.offered || opts.signedIn !== undefined
    || opts.overrides || opts.tamperRoot || opts.tamperUntil !== undefined)) {
    return buildSeatedView(opts);
  }
  if (!cachedView || cachedView.until - Date.now() < 60 * 60 * 1000) {
    cachedView = buildSeatedView();
  }
  return Object.assign({}, cachedView, { holding: cachedView.holding ? Object.assign({}, cachedView.holding) : null });
}

async function seatPage(page, opts) {
  const o = opts || {};
  const view = o.view || seatedView(o);
  await page.evaluateOnNewDocument((v, preserve) => {
    const prev = window.E_HOST && typeof window.E_HOST === "object" ? window.E_HOST : null;
    if (prev) {
      if (!preserve || typeof prev.signinState !== "function") prev.signinState = () => v;
      if (typeof prev.signIn !== "function") prev.signIn = async () => v;
      if (typeof prev.signinCheck !== "function") prev.signinCheck = async () => v;
      return;
    }
    window.E_HOST = {
      signinState: () => v,
      signIn: async () => v,
      signinCheck: async () => v,
    };
  }, view, !!o.preserveSigninState);
  return view;
}

module.exports = { seatedView, seatPage, verifySeatCert };
