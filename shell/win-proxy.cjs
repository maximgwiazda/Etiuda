"use strict";
/* WINDOWS' OWN PROXY SETTING, read before Chromium starts so that a proxy a company has configured is
   followed, and again where the shell asks (windowsProxyChange). The one program it starts is Windows'
   reg tool at its fixed system path, asked for three keys, each once a read: machine policy, then either the user's or the machine's Internet Settings and
   Connections. A second program, or a key beside those, is a change to that program's check first.
   CommonJS, so a shell can require it. */
const { execFileSync } = require("node:child_process");

const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const POLICY_KEY = "HKLM\\Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const USER_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const USER_CONN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections";
const MACHINE_KEY = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const MACHINE_CONN_KEY = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections";

/** A named script or an enabled server in one key's reg print, as switches ([name, value] pairs), or null. A server
 *  counts only while ProxyEnable is 1, and carries ProxyOverride as its bypass list. Where both are named, the script
 *  wins unless the Connections flags are read and leave the script off (bit 0x04), which marks it a leftover. */
function namedSwitch(text, flags) {
  const t = String(text || "");
  const str = (n) => {
    const m = new RegExp("^[ \\t]+" + n + "[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+(.*?)[ \\t\\r]*$", "m").exec(t);
    return m ? m[1] : "";
  };
  const on = /^[ \t]+ProxyEnable[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(t);
  const script = str("AutoConfigURL"), server = str("ProxyServer"), bypass = str("ProxyOverride");
  const hasScript = /^(?:https?|file):\/\/\S+$/i.test(script);
  const hasServer = !!on && parseInt(on[1], 16) === 1 && /^\S{1,2048}$/.test(server);
  if (hasScript && !(hasServer && typeof flags === "number" && (flags & 0x04) === 0)) return [["proxy-pac-url", script]]; /* plant:proxy-script-flag */
  if (hasServer) return /^\S{1,2048}$/.test(bypass) ? [["proxy-server", server], ["proxy-bypass-list", bypass]] : [["proxy-server", server]]; /* plant:proxy-bypass */
  return null;
}

/** The flags byte from DefaultConnectionSettings, or null where missing or unreadable.
 *  Characters 16 and 17 of the hex string are byte 8. */
function connectionFlags(text) {
  const m = /^[ \t]+DefaultConnectionSettings[ \t]+REG_BINARY[ \t]+([0-9a-fA-F]+)/m.exec(String(text || ""));
  if (!m || m[1].length < 18) return null;
  const byte = parseInt(m[1].slice(16, 18), 16);
  return Number.isFinite(byte) ? byte : null;
}

/** Whether the machine policy key forces per-machine proxy settings (ProxySettingsPerUser 0). */
function isPerMachine(policyText) {
  const m = /^[ \t]+ProxySettingsPerUser[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(String(policyText || ""));
  return !!m && parseInt(m[1], 16) === 0;
}

/** The Chromium switches for one key's values as reg prints them, as [name] or [name, value] pairs. */
function proxySwitchesFrom(text, connText) {
  const flags = connText === undefined ? null : connectionFlags(connText);
  const named = namedSwitch(text, flags);
  if (named) return named;
  if (connText !== undefined) return flags !== null && (flags & 0x0f) === 0x01 ? [["no-proxy-server"]] : [];
  return [["no-proxy-server"]];
}

function readKey(key) {
  try {
    return { ok: true, text: execFileSync(REG_TOOL, ["query", key],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }) };
  } catch (e) {
    const isMissing = !!e && e.status === 1 && !/did not answer/i.test(String(e.message || ""));
    return { ok: isMissing, text: "", failed: !isMissing };
  }
}

/* The keys asked for in turn, each read handed back to it. A proxy named in the machine policy key itself is followed before the settings it would override, and the
   Connections flags are read whenever the settings are, since they judge a script named beside a server. */
function* askWindows() {
  const pol = yield POLICY_KEY;
  if (pol.failed) return [];
  const byPolicy = namedSwitch(pol.text, null);
  if (byPolicy) return byPolicy; /* plant:proxy-policy-named */
  const perMachine = isPerMachine(pol.text);
  const set = yield perMachine ? MACHINE_KEY : USER_KEY;
  if (set.failed) return [];
  const conn = yield perMachine ? MACHINE_CONN_KEY : USER_CONN_KEY;
  const flags = conn.failed ? null : connectionFlags(conn.text);
  const named = namedSwitch(set.text, flags);
  if (named) return named;
  if (flags !== null && (flags & 0x0f) === 0x01) return [["no-proxy-server"]];
  return [];
}

function readWindows() {
  const ask = askWindows();
  let step = ask.next();
  while (!step.done) step = ask.next(readKey(step.value));
  return step.value;
}
let lastAnswer = null;
/** What Windows is set to now, as switches. Any system but Windows or a failed read leaves Chromium's resolver. */
function windowsProxySwitches() {
  if (process.platform !== "win32") return [];
  const out = readWindows();
  lastAnswer = JSON.stringify(out);
  return out;
}

/** Switches as the session's proxy config (Electron's setProxy). */
function proxyConfigOf(switches) {
  const s = Object.fromEntries((switches || []).map(p => [p[0], p.length > 1 ? p[1] : true]));
  if (s["no-proxy-server"]) return { mode: "direct" };
  if (s["proxy-pac-url"]) return { mode: "pac_script", pacScript: s["proxy-pac-url"] };
  if (s["proxy-server"]) return Object.assign({ mode: "fixed_servers", proxyRules: s["proxy-server"] }, s["proxy-bypass-list"] ? { proxyBypassRules: s["proxy-bypass-list"] } : {});
  return { mode: "system" };
}

/** Windows' setting read again, as the session's proxy config where it differs from the last read, else null. */
function windowsProxyChange() {
  if (process.platform !== "win32") return null;
  const out = readWindows(), now = JSON.stringify(out);
  if (now === lastAnswer) return null; /* plant:proxy-change-same */
  lastAnswer = now;
  return proxyConfigOf(out);
}

module.exports = { proxySwitchesFrom, windowsProxySwitches, windowsProxyChange, proxyConfigOf };
