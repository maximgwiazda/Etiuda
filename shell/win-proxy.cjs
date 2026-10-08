"use strict";
/* WINDOWS' OWN PROXY SETTING, read before Chromium starts so that a proxy a company has configured is
   followed. The one program it starts is Windows' reg tool at its fixed system path, asked for one fixed
   key, once, and a program carrying this file may hold it to exactly that shape: a second call, key,
   path or program is a change to that program's check first. CommonJS, so a shell can require it. */
const { execFileSync } = require("node:child_process");

const REG_TOOL = "C:\\Windows\\System32\\reg.exe";
const PROXY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

/** The Chromium switches for the key's values as reg prints them, as [name] or [name, value] pairs.
 *  A script is read before a server, and a server only while ProxyEnable is 1. */
function proxySwitchesFrom(text) {
  const t = String(text || "");
  const str = (n) => {
    const m = new RegExp("^[ \\t]+" + n + "[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+(.*?)[ \\t\\r]*$", "m").exec(t);
    return m ? m[1] : "";
  };
  const on = /^[ \t]+ProxyEnable[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)[ \t\r]*$/im.exec(t);
  const script = str("AutoConfigURL"), server = str("ProxyServer");
  if (/^(?:https?|file):\/\/\S+$/i.test(script)) return [["proxy-pac-url", script]];
  if (on && parseInt(on[1], 16) === 1 && /^\S{1,2048}$/.test(server)) return [["proxy-server", server]];
  return [["no-proxy-server"]];
}

/** What Windows is set to now, as switches; every failure, and any system but Windows, is no proxy. */
function windowsProxySwitches() {
  if (process.platform !== "win32") return proxySwitchesFrom("");
  try {
    return proxySwitchesFrom(execFileSync(REG_TOOL, ["query", PROXY_KEY],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }));
  } catch { return proxySwitchesFrom(""); }
}

module.exports = { proxySwitchesFrom, windowsProxySwitches };
