/* THE REGISTRY STOOD IN FOR A HARNESS-LAUNCHED SHELL: loaded into Electron's main process before the app, beside the crash guard,
 * by tests/engine.js shellLaunch, the one door every harness launch of the shell goes through. In Electron's main process the
 * shell's own guard (shell/win-proxy.cjs, regOpts) lets a reg call through, since an installed desk must read its machine; here
 * reg-stand answers every such call instead, so a window leg reads no part of this machine's registry, as no leg writes it.
 * Machine policy is none and the proxy, DriveFS and DWM keys are missing, unless a leg names a policy as the text of a .reg
 * export in a file (ETIUDA_REG_STAND_POLICY). Every other program runs as it would. */
"use strict";

if (!globalThis.__ETIUDA_REG_STAND__) {
  const fs = require("node:fs");
  const named = process.env.ETIUDA_REG_STAND_POLICY;
  const opts = { policy: named ? fs.readFileSync(named, "utf8") : null };
  globalThis.__ETIUDA_REG_STAND__ = require("./reg-stand.cjs").regStand(require("node:child_process"), opts);
}

module.exports = { stand: globalThis.__ETIUDA_REG_STAND__ };
