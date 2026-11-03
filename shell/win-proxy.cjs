"use strict";
/* WINDOWS' OWN PROXY SETTING, read before Chromium starts so that a proxy a company has configured is
   followed. The one program it starts is Windows' reg tool at its fixed system path, asked for three
   keys, each once: machine policy, then either the user's or the machine's Internet Settings and
   Connections. A second program, or a key beside those, is a change to that program's check first.
   CommonJS, so a shell can require it. */
const { execFileSync } = require("node:child_process");

const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const POLICY_KEY = "HKLM\\Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const USER_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const USER_CONN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections";
const MACHINE_KEY = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const MACHINE_CONN_KEY = "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections";

/** A named script or an enabled server in one key's reg print, as [name, value], or null.
 *  A script is read before a server, and a server only while ProxyEnable is 1. */
function namedSwitch(text) {
  const t = String(text || "");
  const str = (n) => {
    const m = new RegExp("^[ \\t]+" + n + "[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+(.*?)[ \\t\\r]*$", "m").exec(t);
    return m ? m[1] : "";
  };
  const on = /^[ \t]+ProxyEnable[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(t);
  const script = str("AutoConfigURL"), server = str("ProxyServer");
  if (/^(?:https?|file):\/\/\S+$/i.test(script)) return ["proxy-pac-url", script];
  if (on && parseInt(on[1], 16) === 1 && /^\S{1,2048}$/.test(server)) return ["proxy-server", server];
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
  const named = namedSwitch(text);
  if (named) return [named];
  if (connText !== undefined) {
    const flags = connectionFlags(connText);
    if (flags !== null && (flags & 0x0f) === 0x01) return [["no-proxy-server"]];
    return [];
  }
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

/** What Windows is set to now, as switches. Any system but Windows is no proxy. A failed read leaves Chromium's resolver. */
function windowsProxySwitches() {
  if (process.platform !== "win32") return [["no-proxy-server"]];
  const pol = readKey(POLICY_KEY);
  if (pol.failed) return [];
  const perMachine = isPerMachine(pol.text);
  const settingsKey = perMachine ? MACHINE_KEY : USER_KEY;
  const connKey = perMachine ? MACHINE_CONN_KEY : USER_CONN_KEY;
  const set = readKey(settingsKey);
  if (set.failed) return [];
  const named = namedSwitch(set.text);
  if (named) return [named];
  const conn = readKey(connKey);
  if (conn.failed) return [];
  const flags = connectionFlags(conn.text);
  if (flags !== null && (flags & 0x0f) === 0x01) return [["no-proxy-server"]];
  return [];
}

module.exports = { proxySwitchesFrom, windowsProxySwitches };
