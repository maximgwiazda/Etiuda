"use strict";

/* Set-up works. Only the judged methods refuse, so a positive control cannot pass. */

const model = require("./model.cjs");

const JUDGED = [
  "hello", "list", "fetch", "subscribe", "upload", "acceptBlob", "acceptDeskFile", "loadTeamFile",
  "showFreshness", "syncMirror", "verifyDeskSignature", "verifyUploadSignature",
  "programAllowUpload", "fetchDeletion", "considerOutgoing", "readRing",
];

function generic(name) {
  if (name === "showFreshness") {
    return { shown: false, blocked: false, time: null, epoch: null, rev: null, ageMs: null };
  }
  if (name === "considerOutgoing") {
    return { send: false, reason: "refused", said: "That was refused." };
  }
  if (name === "readRing") return { source: "none", ring: null };
  if (name === "verifyDeskSignature" || name === "verifyUploadSignature") return { ok: false };
  return { ok: false, reason: "refused", said: "That was refused.", served: false };
}

function createTarget(limits) {
  const real = model.createTarget(limits);
  const api = {};
  Object.keys(real).forEach(function (name) {
    if (JUDGED.indexOf(name) !== -1) {
      api[name] = function () { return generic(name); };
    } else {
      api[name] = real[name];
    }
  });
  return api;
}

module.exports = { createTarget };
