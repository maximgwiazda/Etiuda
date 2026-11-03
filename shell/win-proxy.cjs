"use strict";
/* WINDOWS' OWN PROXY SETTING, read before Chromium starts so that a proxy a company has configured is
   followed. The one program it starts is Windows' reg tool at its fixed system path, asked for three
   fixed keys, each once. A second program, or a key beside those three, is a change to that program's
   check first. CommonJS, so a shell can require it. */
const { execFileSync } = require("node:child_process");

const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
/* Machine policy, then the user, then machine settings. The first that names a script or a server wins. */
const PROXY_KEYS = [
  "HKLM\\Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
];

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

/** 1 where the key turns automatic detection on, 0 where it turns it off, null where it does not say. */
function autoDetect(text) {
  const m = /^[ \t]+AutoDetect[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(String(text || ""));
  if (!m) return null;
  return parseInt(m[1], 16) === 1 ? 1 : 0;
}

/** The Chromium switches for one key's values as reg prints them, as [name] or [name, value] pairs. */
function proxySwitchesFrom(text) {
  const named = namedSwitch(text);
  return named ? [named] : [["no-proxy-server"]];
}

/* The first reading that names a script or a server wins. Where none does, detection on leaves
   Chromium's resolver, and detection off or unsaid is no proxy. */
function switchesFromReadings(texts) {
  for (const t of texts) {
    const named = namedSwitch(t);
    if (named) return [named];
  }
  for (const t of texts) {
    const detect = autoDetect(t);
    if (detect === 1) return [];
    if (detect === 0) return [["no-proxy-server"]];
  }
  return [["no-proxy-server"]];
}

function readKey(key) {
  try {
    return execFileSync(REG_TOOL, ["query", key],
      { encoding: "utf8", windowsHide: true, timeout: 5000 });
  } catch { return ""; }
}

/** What Windows is set to now, as switches. A failed read is an empty key. Any system but Windows is no proxy. */
function windowsProxySwitches() {
  if (process.platform !== "win32") return [["no-proxy-server"]];
  return switchesFromReadings(PROXY_KEYS.map(readKey));
}

module.exports = { proxySwitchesFrom, windowsProxySwitches };
