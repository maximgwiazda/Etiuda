/* The tray helper, close policy, first close note, login item, and jump list.
 *
 *   node tests/tray.mjs
 *
 * Everything the helper touches in Electron is injected so this gate runs in bare node.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CJS_PATH = path.join(ROOT, "shell", "tray.cjs");
const nodeRequire = createRequire(import.meta.url);

let checks = 0, failed = 0;
function check(ok, what) {
  checks++;
  if (ok) {
    console.log("  ok   " + what);
  } else {
    failed++;
    console.log("  FAIL " + what);
  }
}

function makeFakeElectron() {
  const fakeApp = {
    _appUserModelId: null,
    _loginItemSettings: null,
    _jumpList: null,
    setAppUserModelId(id) {
      this._appUserModelId = id;
    },
    setLoginItemSettings(settings) {
      this._loginItemSettings = settings;
    },
    setJumpList(categories) {
      this._jumpList = categories;
    },
  };

  class FakeNotification {
    constructor(opts) {
      this.opts = opts;
      this.shown = false;
      this._handlers = {};
    }
    on(event, handler) {
      this._handlers[event] = handler;
      return this;
    }
    show() {
      this.shown = true;
    }
    click() {
      if (this._handlers.click) this._handlers.click();
    }
  }

  const FakeMenu = {
    buildFromTemplate(template) {
      return { template, items: template };
    },
  };

  class FakeTray {
    constructor(icon) {
      this.icon = icon;
      this.toolTip = null;
      this.contextMenu = null;
      this._handlers = {};
    }
    setToolTip(tip) {
      this.toolTip = tip;
    }
    setContextMenu(menu) {
      this.contextMenu = menu;
    }
    on(event, handler) {
      this._handlers[event] = handler;
      return this;
    }
    click() {
      if (this._handlers.click) this._handlers.click();
    }
  }

  return {
    app: fakeApp,
    Notification: FakeNotification,
    Menu: FakeMenu,
    Tray: FakeTray,
  };
}

async function run() {
  let trayMod;
  try {
    trayMod = nodeRequire(CJS_PATH);
  } catch (err) {
    check(false, "load shell/tray.cjs: " + (err && err.message));
    console.log("\n#counts checks=" + checks + " failures=" + failed);
    process.exit(1);
  }

  const {
    decideClose,
    APP_IDS,
    setAppUserModelId,
    notifyFirstClose,
    showNotification,
    buildLoginItemSettings,
    setLoginItemSettings,
    buildTrayMenuTemplate,
    createTray,
    buildJumpList,
    setJumpList,
    pickBadge,
    TOAST_BUTTONS_SUPPORTED,
    TOAST_BUTTON_PROBE,
  } = trayMod;

  /* 1. Close policy table: hide, quit, and every never-hide case */
  check(decideClose({ stayInTray: false }) === "quit", "close policy: default (stayInTray false) quits");
  check(decideClose({}) === "quit", "close policy: empty options quits");
  check(decideClose(null) === "quit", "close policy: null options quits");
  check(decideClose({ stayInTray: true }) === "hide", "close policy: stayInTray true hides");

  /* Never-hide inputs under their one name quit with stayInTray on */
  check(decideClose({ stayInTray: true, etiudaInstallerClose: true }) === "quit",
    "close policy: etiudaInstallerClose quits with stayInTray on");
  check(decideClose({ stayInTray: true, sessionEnd: true }) === "quit",
    "close policy: sessionEnd quits with stayInTray on");
  check(decideClose({ stayInTray: true, quitting: true }) === "quit",
    "close policy: quitting quits with stayInTray on");
  check(decideClose({ stayInTray: true, refusalClose: true }) === "quit",
    "close policy: refusalClose quits with stayInTray on");
  check(decideClose({ stayInTray: true, placedWindow: true }) === "quit",
    "close policy: placedWindow quits with stayInTray on");

  /* An unknown key throws so a misspelt key cannot fall through and hide */
  let unknownThrew = false;
  try {
    decideClose({ stayInTray: true, unknownKey: true });
  } catch {
    unknownThrew = true;
  }
  check(unknownThrew === true, "close policy: an unknown key throws");

  let misspeltThrew = false;
  try {
    decideClose({ stayInTray: true, updateClose: true });
  } catch {
    misspeltThrew = true;
  }
  check(misspeltThrew === true, "close policy: misspelt alias updateClose throws");

  /* 2. First-close note once: says sentence once and remembers */
  {
    const fake = makeFakeElectron();
    let toldValue = false;
    let clickCount = 0;
    const res1 = notifyFirstClose({
      electron: fake,
      appId: APP_IDS.desktop,
      told: toldValue,
      setTold: (val) => { toldValue = val; },
      title: "First Close Title",
      body: "First Close Body",
      onClick: () => { clickCount++; },
    });
    check(res1 && res1.shown === true, "first-close shows toast when told is false");
    check(toldValue === true, "first-close records told as true");
    check(fake.app._appUserModelId === APP_IDS.desktop, "first-close sets AUMID before showing");
    check(res1.notification && res1.notification.shown === true, "notification shown flag is true");
    check(res1.notification.opts.actions === undefined || res1.notification.opts.actions.length === 0,
      "first-close toast carries no action buttons (question 9)");

    res1.notification.click();
    check(clickCount === 1, "first-close toast click handler fires");

    /* Second attempt when told is true */
    const res2 = notifyFirstClose({
      electron: fake,
      appId: APP_IDS.desktop,
      told: toldValue,
      setTold: () => { check(false, "setTold should not be called again"); },
      title: "First Close Title",
      body: "First Close Body",
    });
    check(res2 === null || (res2 && res2.shown === false), "first-close does not show again when told is true");

    /* Leg: no Notification, told stays false */
    let toldNoNotif = false;
    const resNoNotif = notifyFirstClose({
      electron: {},
      told: toldNoNotif,
      setTold: (val) => { toldNoNotif = val; },
      title: "First Close Title",
      body: "First Close Body",
    });
    check(resNoNotif === null, "first-close returns null when electron has no Notification");
    check(toldNoNotif === false, "no Notification, told stays false");
  }

  /* 3. Login item and its arguments */
  {
    const enabledSettings = buildLoginItemSettings(true);
    check(enabledSettings.openAtLogin === true, "login item enabled sets openAtLogin true");
    check(Array.isArray(enabledSettings.args) && enabledSettings.args.includes("--hidden"),
      "login item args include --hidden when enabled");

    const disabledSettings = buildLoginItemSettings(false);
    check(disabledSettings.openAtLogin === false, "login item disabled sets openAtLogin false");

    const fake = makeFakeElectron();
    setLoginItemSettings(fake.app, true);
    check(fake.app._loginItemSettings && fake.app._loginItemSettings.openAtLogin === true
      && fake.app._loginItemSettings.args.includes("--hidden"),
      "setLoginItemSettings applies settings to electron app");
  }

  /* 4. App ID (AUMID) and notifications */
  {
    check(APP_IDS.desktop === "app.etiuda.desktop", "desktop appId is app.etiuda.desktop");
    check(APP_IDS.studio === "app.etiuda.studio", "studio appId is app.etiuda.studio");

    const fake = makeFakeElectron();
    setAppUserModelId(fake.app, APP_IDS.studio);
    check(fake.app._appUserModelId === APP_IDS.studio, "setAppUserModelId sets app ID on app");

    /* General notification wrapper sets AUMID and opens on click with no buttons */
    const fake2 = makeFakeElectron();
    let clicked = false;
    const notif = showNotification({
      electron: fake2,
      appId: APP_IDS.desktop,
      title: "Update",
      body: "Edition published",
      onClick: () => { clicked = true; },
    });
    check(fake2.app._appUserModelId === APP_IDS.desktop, "showNotification sets AUMID before toast");
    check(notif && notif.shown === true, "showNotification shows toast");
    check(notif.opts.actions === undefined || notif.opts.actions.length === 0,
      "toast carries no buttons");
    notif.click();
    check(clicked === true, "toast click triggers onClick callback");
  }

  /* 5. Menu: Open, Quit, and click */
  {
    let opened = false, quitted = false, customClicked = false;
    const template = buildTrayMenuTemplate({
      openLabel: "Open Etiuda",
      onOpen: () => { opened = true; },
      quitLabel: "Quit Etiuda",
      onQuit: () => { quitted = true; },
      items: [
        { label: "Settings", click: () => { customClicked = true; } },
      ],
    });

    check(Array.isArray(template) && template.length === 4, "tray menu template has 4 items (open, item, sep, quit)");
    check(template[0].label === "Open Etiuda", "first item is openLabel");
    check(template[template.length - 1].label === "Quit Etiuda", "last item is quitLabel");

    template[0].click();
    check(opened === true, "openLabel click fires onOpen");
    template[template.length - 1].click();
    check(quitted === true, "quitLabel click fires onQuit");

    const fake = makeFakeElectron();
    let trayClicked = false;
    const tray = createTray({
      electronTray: fake.Tray,
      electronMenu: fake.Menu,
      icon: "tray.ico",
      tooltip: "Etiuda",
      openLabel: "Open Etiuda",
      onOpen: () => {},
      quitLabel: "Quit Etiuda",
      onQuit: () => {},
      onClick: () => { trayClicked = true; },
    });

    check(tray.icon === "tray.ico", "tray icon is set");
    check(tray.toolTip === "Etiuda", "tray tooltip is set");
    check(tray.contextMenu !== null, "tray context menu is set");
    tray.click();
    check(trayClicked === true, "tray left click fires onClick");
  }

  /* 6. Jump list builder */
  {
    const tasks = [
      { title: "New tab", args: "--new-tab" },
      { title: "Library", args: "--library" },
    ];
    const recent = [
      { title: "Catalog 1", path: "C:\\cats\\1.ec" },
      { title: "Catalog 2", path: "C:\\cats\\2.ec" },
      { title: "Catalog 3", path: "C:\\cats\\3.ec" },
      { title: "Catalog 4", path: "C:\\cats\\4.ec" },
      { title: "Catalog 5", path: "C:\\cats\\5.ec" },
      { title: "Catalog 6", path: "C:\\cats\\6.ec" },
    ];
    const categories = buildJumpList({
      tasks,
      recent,
      recentCategoryName: "Recent catalogs",
      execPath: "C:\\app\\etiuda.exe",
    });

    check(Array.isArray(categories) && categories.length === 2, "jump list has tasks and recent categories");
    const taskCat = categories.find((c) => c.type === "tasks");
    const recentCat = categories.find((c) => c.type === "custom");
    check(taskCat && taskCat.items.length === 2, "tasks category holds the 2 given tasks");
    check(taskCat.items[0].title === "New tab" && taskCat.items[0].args === "--new-tab", "task item preserved");
    check(taskCat.items[0].program === "C:\\app\\etiuda.exe", "task item program set to execPath");
    check(recentCat && recentCat.name === "Recent catalogs", "recent category name matches");
    check(recentCat && recentCat.items.length === 5, "recent category capped at 5 files maximum");

    const fake = makeFakeElectron();
    setJumpList(fake.app, { tasks, recent, recentCategoryName: "Recent catalogs" });
    check(fake.app._jumpList !== null, "setJumpList sets jump list on electron app");
  }

  /* 7. Badge icon pick: 0, 1, 9, 10 */
  check(pickBadge(0) === null, "badge pick 0 returns null (no badge)");
  check(pickBadge(-1) === null, "badge pick negative returns null");
  check(pickBadge(1) === "1", "badge pick 1 returns '1'");
  check(pickBadge(9) === "9", "badge pick 9 returns '9'");
  check(pickBadge(10) === "9+", "badge pick 10 returns '9+'");
  check(pickBadge(15) === "9+", "badge pick > 10 returns '9+'");

  /* 8. Toast-button probe result recorded */
  check(TOAST_BUTTONS_SUPPORTED === false, "toast buttons supported recorded as false");
  check(TOAST_BUTTON_PROBE && typeof TOAST_BUTTON_PROBE.reason === "string"
    && TOAST_BUTTON_PROBE.reason.length > 0,
    "toast-button probe result recorded with explanation");

  /* 9. Planted removal of --update-close rule in a scratch copy */
  {
    const originalSrc = fs.readFileSync(CJS_PATH, "utf8");
    const marker = "/* plant:update-close */";
    check(originalSrc.includes(marker), "tray.cjs contains plant:update-close marker");

    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tray-plant-"));
    const scratchFile = path.join(scratchDir, "tray.cjs");
    try {
      const lines = originalSrc.split("\n");
      const idx = lines.findIndex((l) => l.includes(marker));
      check(idx >= 0, "found plant:update-close line index: " + idx);

      lines.splice(idx, 1);
      fs.writeFileSync(scratchFile, lines.join("\n"), "utf8");

      const scratchMod = nodeRequire(scratchFile);
      const mutatedDecision = scratchMod.decideClose({ stayInTray: true, etiudaInstallerClose: true });
      check(mutatedDecision === "hide",
        "planted removal of update-close rule turns decideClose({ stayInTray: true, etiudaInstallerClose: true }) to 'hide'");
    } finally {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
    }
  }

  console.log("\n#counts checks=" + checks + " failures=" + failed);
  process.exit(failed ? 1 : 0);
}

run();
