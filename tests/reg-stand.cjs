/* A STAND-IN FOR reg.exe, for the legs that load the real shell/main.js in bare node (tests/team-join.mjs,
 * tests/team-desk.mjs). Until 2026-10-13 those legs ran the real reg.exe: the shell's policy reader exported this
 * machine's HKLM\SOFTWARE\Policies\Etiuda into every case, and shell/win-proxy.cjs queried its HKCU proxy setting. They
 * passed only because neither was set here (Clement beta's read of join-policy f7131c5; a Grok read of this file).
 *
 *     const regStand = nodeRequire("./reg-stand.cjs").regStand(nodeRequire("node:child_process"), { policy: null });
 *
 * Called once, before the shell loads, with the node:child_process module itself. It replaces that module's execFile,
 * execFileSync, exec, execSync, spawn and spawnSync in place, and syncs the ES module bindings, so a require taken
 * anywhere later (the shell, win-proxy.cjs, a preload) gets the stand-in. Every call whose program is reg or reg.exe,
 * by any path, is answered here and none reaches the machine; every other call goes to the real function unchanged.
 * - HKLM\SOFTWARE\Policies\Etiuda, in either spelling of the hive and with either slash: with no policy (the default)
 *   it fails as reg.exe does for a key that is not there, which the shell reads as no policy. With `policy` given as
 *   the text of a .reg export, `reg export <key> <file>` writes it to <file> as reg.exe does: UTF-16LE behind FF FE,
 *   each bare line feed made CRLF. `reg query` of the key with a policy scripted throws, as not stood in.
 * - Any other key under HKLM fails as missing and is counted as `machine`: a second reader of the machine's hive.
 * - Anything else (the HKCU proxy and theme reads) fails as missing and is counted as `user`; the shell reads both
 *   failures as unset.
 * spawn of reg throws, as not stood in, and counts nothing. `regStand.held()` is the line a leg checks.
 *
 * Not covered: a reader that reaches the registry through another program (PowerShell, a native addon). */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const norm = (x) => String(x).replace(/\//g, "\\");
const HIVE = /^(?:HKLM|HKEY_LOCAL_MACHINE)(?:\\|$)/i;
const POLICY = /^(?:HKLM|HKEY_LOCAL_MACHINE)\\SOFTWARE\\Policies\\Etiuda(?:\\|$)/i;
const isReg = (file) => /^reg(\.exe)?$/i.test(path.win32.basename(String(file || "")));
/* A command line's words, a quoted word whole: enough for `reg export "HKLM\..." "C:\...\policy.reg" /y`. */
const words = (cmd) => Array.from(String(cmd).matchAll(/"([^"]*)"|(\S+)/g), (m) => (m[1] !== undefined ? m[1] : m[2]));

function regStand(real, opts) {
  const o = opts || {};
  const calls = { export: 0, query: 0, other: 0, machine: 0, user: 0, reached: 0 };
  const orig = {};
  for (const k of ["execFile", "execFileSync", "exec", "execSync", "spawn", "spawnSync"]) orig[k] = real[k];
  const missing = () => {
    const e = new Error("ERROR: The system was unable to find the specified registry key or value.");
    e.status = 1;
    return { error: e };
  };
  /* The answer for a reg call, or null where the program is not reg. */
  const answer = (file, args, count) => {
    if (!isReg(file)) return null;
    const a = (Array.isArray(args) ? args : []).map(String);
    const keys = a.map(norm);
    const verb = String(a[0] || "").toLowerCase();
    if (keys.some((x) => POLICY.test(x))) {
      if (count) calls[verb === "export" || verb === "query" ? verb : "other"]++;
      if (o.policy == null) return missing();
      if (verb === "export") {
        const text = String(o.policy).replace(/\r?\n/g, "\r\n");
        fs.writeFileSync(a[2], Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
        return { stdout: "" };
      }
      throw new Error("reg-stand: only reg export is stood in for a scripted policy, not reg " + verb);
    }
    if (count) calls[keys.some((x) => HIVE.test(x)) ? "machine" : "user"]++;
    return missing();
  };
  const out = (enc, s) => (enc && enc !== "buffer" ? String(s) : Buffer.from(String(s)));
  const encOf = (x) => (x && typeof x === "object" ? x.encoding : undefined);
  const later = (cb, r, enc) => setImmediate(() => cb && cb(r.error || null, r.error ? out(enc, "") : out(enc, r.stdout), out(enc, "")));
  const child = { pid: 0, on() { return this; }, once() { return this; }, kill() { return true; } };
  const fromLine = (cmd) => { const w = words(cmd); return [w[0], w.slice(1)]; };
  /* The real function. A reg call that gets here went past the stand-in, which is counted so that held() fails. */
  const pass = (file, k, args) => { if (isReg(file)) calls.reached++; return orig[k].apply(real, args); };
  Object.assign(real, {
    execFileSync(file, args, options) {
      const r = answer(file, args, true);
      if (!r) return pass(file, "execFileSync", arguments);
      if (r.error) throw r.error;
      return out(encOf(options), r.stdout);
    },
    execFile(file, args, options, cb) {
      const r = answer(file, args, true);
      if (!r) return pass(file, "execFile", arguments);
      later([args, options, cb].find((f) => typeof f === "function"), r, encOf(options));
      return child;
    },
    execSync(cmd, options) {
      const [file, args] = fromLine(cmd);
      const r = answer(file, args, true);
      if (!r) return pass(file, "execSync", arguments);
      if (r.error) throw r.error;
      return out(encOf(options), r.stdout);
    },
    exec(cmd, options, cb) {
      const [file, args] = fromLine(cmd);
      const r = answer(file, args, true);
      if (!r) return pass(file, "exec", arguments);
      later([options, cb].find((f) => typeof f === "function"), r, encOf(options));
      return child;
    },
    spawnSync(file, args, options) {
      const r = answer(file, args, true);
      if (!r) return pass(file, "spawnSync", arguments);
      const enc = encOf(options);
      return { pid: 0, status: r.error ? 1 : 0, signal: null, stdout: out(enc, r.error ? "" : r.stdout), stderr: out(enc, ""), output: [] };
    },
    spawn(file, args) {
      if (isReg(file)) throw new Error("reg-stand: spawn of reg is not stood in; use execFileSync");
      return pass(file, "spawn", arguments);
    },
  });
  syncBuiltinESMExports();
  const policyReads = () => calls.export + calls.query + calls.other;
  /* On Windows at least one policy read answered here and no other key of the machine's hive asked for; off Windows,
     where the shell reads no policy, no reg call at all. Either way no reg call reached the machine. */
  const held = () => (process.platform === "win32"
    ? policyReads() >= 1 && calls.machine === 0 && calls.reached === 0
    : policyReads() + calls.machine + calls.user + calls.reached === 0);
  const said = () => calls.export + " export, " + calls.query + " query, " + calls.other + " other of the policy key, "
    + calls.machine + " elsewhere in HKLM, " + calls.user + " outside it, " + calls.reached + " past the stand-in";
  return { calls, held, said, total: policyReads };
}

module.exports = { regStand };
