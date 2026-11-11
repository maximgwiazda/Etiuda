"use strict";
/* THE TRAY AND NOTIFICATION HELPER, shared between Desk and Studio through the pin.
   Pure Node with Electron passed in, so every path is testable in bare node.
   British English, no em or en dashes.

   Input names accepted by decideClose (one name per input, unknown keys throw):
     stayInTray: boolean, whether minimising or closing to tray is enabled.
     etiudaInstallerClose: boolean, installer --update-close (shell/main.js win.etiudaInstallerClose).
     sessionEnd: boolean, Windows session is ending (shell/main.js session-end).
     quitting: boolean, application is shutting down (shell/main.js quitting).
     refusalClose: boolean, closed from refusal page (shell/main.js closeFromRefusal).
     placedWindow: boolean, offscreen harness instance (shell/main.js placed windows / PLACED_ASIDE).
*/

const APP_IDS = Object.freeze({
  desktop: "app.etiuda.desktop",
  studio: "app.etiuda.studio",
});

/* Windows notifications in Electron do not deliver action button presses; a click opens the item. */
const TOAST_BUTTONS_SUPPORTED = false;
const TOAST_BUTTON_PROBE = Object.freeze({
  supported: false,
  reason: "Windows notifications in Electron do not support action buttons; a click opens the item.",
});

const VALID_CLOSE_KEYS = new Set([
  "stayInTray",
  "etiudaInstallerClose",
  "sessionEnd",
  "quitting",
  "refusalClose",
  "placedWindow",
]);

/** Decide whether window close hides to tray or quits.
 *  Never-hide cases always quit: installer update-close, session-end, quitting, refusal, harness.
 *  One name per input; unknown keys throw so misspelt inputs cannot hide. */
function decideClose(opts) {
  if (!opts) return "quit";
  for (const k of Object.keys(opts)) {
    if (!VALID_CLOSE_KEYS.has(k)) {
      throw new Error("Unknown close option: " + k);
    }
  }
  /* plant:update-close */ if (opts.etiudaInstallerClose) return "quit";
  if (opts.sessionEnd) return "quit";
  if (opts.quitting) return "quit";
  if (opts.refusalClose) return "quit";
  if (opts.placedWindow) return "quit";
  if (opts.stayInTray) return "hide";
  return "quit";
}

/** Set the Application User Model ID for Windows toast routing. */
function setAppUserModelId(electronApp, appId) {
  if (electronApp && typeof electronApp.setAppUserModelId === "function") {
    electronApp.setAppUserModelId(appId);
  }
}

/** Show a notification, setting AUMID first and attaching a click opener with no action buttons. */
function showNotification(opts) {
  const { electron, appId, title, body, icon, onClick } = opts || {};
  if (!electron || !electron.Notification) return null;
  if (typeof electron.Notification.isSupported === "function" && !electron.Notification.isSupported()) {
    return null;
  }
  if (appId && electron.app) {
    setAppUserModelId(electron.app, appId);
  }
  try {
    const notif = new electron.Notification({
      title,
      body,
      icon,
      actions: [],
    });
    if (typeof onClick === "function") {
      notif.on("click", onClick);
    }
    notif.show();
    return notif;
  } catch {
    return null;
  }
}

/** Show the first-close toast once and remember that it has been shown. */
function notifyFirstClose(opts) {
  const { told, setTold } = opts || {};
  if (told) return null;
  const notif = showNotification(opts);
  if (!notif) return null;
  if (typeof setTold === "function") {
    setTold(true);
  }
  return { shown: true, notification: notif };
}

/** Build start-with-Windows login item settings, including --hidden argument. */
/* Under this desk's own name (Electron's `name` on Windows), never Electron's default id, which follows an AppUserModelId the
   desk sets only when a notification shows (the test architect's hold of 23:29). `opts.name` names another, for clearing an
   earlier build's value. */
function buildLoginItemSettings(enabled, opts) {
  const openAtLogin = !!enabled;
  const out = {
    openAtLogin,
    args: openAtLogin ? ["--hidden"] : [],
    name: (opts && opts.name) || APP_IDS.desktop,
  };
  if (opts && opts.path) out.path = opts.path;
  return out;
}

/** Whether a launch item named `name` (the desk's own by default) is on, from Electron's getLoginItemSettings answer. Its
 *  openAtLogin compares the arguments too, and the desk writes --hidden, so the name is what is read. */
function loginItemOn(got, name) {
  const n = name || APP_IDS.desktop;
  return !!(got && Array.isArray(got.launchItems) && got.launchItems.some((i) => i && i.name === n && i.enabled !== false));
}

/** Apply start-with-Windows settings to electron app. */
function setLoginItemSettings(electronApp, enabled, opts) {
  const settings = buildLoginItemSettings(enabled, opts);
  if (electronApp && typeof electronApp.setLoginItemSettings === "function") {
    electronApp.setLoginItemSettings(settings);
  }
  return settings;
}

/** Build tray context menu template with Open and Quit items. */
function buildTrayMenuTemplate(opts) {
  const { openLabel, onOpen, quitLabel, onQuit, items } = opts || {};
  const tpl = [];
  if (openLabel) {
    tpl.push({ label: openLabel, click: onOpen });
  }
  if (Array.isArray(items)) {
    for (const item of items) tpl.push(item);
  }
  if (quitLabel) {
    if (tpl.length > 0) tpl.push({ type: "separator" });
    tpl.push({ label: quitLabel, click: onQuit });
  }
  return tpl;
}

/** Create and configure a Tray instance with tooltip, menu, and click handler. */
function createTray(opts) {
  const {
    electronTray,
    electronMenu,
    icon,
    tooltip,
    template,
    openLabel,
    onOpen,
    quitLabel,
    onQuit,
    items,
    onClick,
  } = opts || {};
  if (!electronTray) return null;
  const tray = new electronTray(icon);
  if (tooltip && typeof tray.setToolTip === "function") {
    tray.setToolTip(tooltip);
  }
  if (electronMenu) {
    const tpl = template || buildTrayMenuTemplate({ openLabel, onOpen, quitLabel, onQuit, items });
    if (tpl && typeof electronMenu.buildFromTemplate === "function") {
      const menu = electronMenu.buildFromTemplate(tpl);
      if (typeof tray.setContextMenu === "function") {
        tray.setContextMenu(menu);
      }
    }
  }
  if (typeof onClick === "function" && typeof tray.on === "function") {
    tray.on("click", onClick);
  }
  return tray;
}

/** Build Windows Jump List categories with tasks and at most five recent items. */
function buildJumpList(opts) {
  const { tasks, recent, recentCategoryName, execPath } = opts || {};
  const program = execPath || process.execPath;
  const categories = [];

  if (Array.isArray(tasks) && tasks.length > 0) {
    categories.push({
      type: "tasks",
      items: tasks.map((t) => ({
        type: "task",
        title: t.title,
        program: t.program || program,
        args: t.args || "",
        description: t.description || "",
        iconPath: t.iconPath || "",
        iconIndex: t.iconIndex || 0,
      })),
    });
  }

  if (Array.isArray(recent) && recent.length > 0) {
    const capped = recent.slice(0, 5);
    categories.push({
      type: "custom",
      name: recentCategoryName || "Recent",
      items: capped.map((r) => ({
        type: "task",
        title: r.title,
        program: r.program || program,
        args: r.args || (r.path ? '"' + r.path + '"' : ""),
        description: r.description || "",
        iconPath: r.iconPath || "",
        iconIndex: 0,
      })),
    });
  }

  return categories;
}

/** Apply jump list categories to electron app. */
function setJumpList(electronApp, opts) {
  const categories = buildJumpList(opts);
  if (electronApp && typeof electronApp.setJumpList === "function") {
    electronApp.setJumpList(categories);
  }
  return categories;
}

/** Pick pre-rendered badge label: null for 0, count for 1 to 9, 9+ for 10 or more. */
function pickBadge(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 9) return "9+";
  return String(Math.floor(n));
}

module.exports = {
  APP_IDS,
  TOAST_BUTTONS_SUPPORTED,
  TOAST_BUTTON_PROBE,
  decideClose,
  setAppUserModelId,
  showNotification,
  notifyFirstClose,
  buildLoginItemSettings,
  loginItemOn,
  setLoginItemSettings,
  buildTrayMenuTemplate,
  createTray,
  buildJumpList,
  setJumpList,
  pickBadge,
};
