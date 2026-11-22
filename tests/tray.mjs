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

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
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
    /* Under this desk's own name, never Electron's default id, which follows an AppUserModelId the desk sets only when a
       notification shows (the test architect, 23:29). */
    check(enabledSettings.name === "app.etiuda.desktop" && disabledSettings.name === "app.etiuda.desktop"
      && buildLoginItemSettings(false, { name: "electron.app.Etiuda" }).name === "electron.app.Etiuda",
      "login item is written under the desk's own name, app.etiuda.desktop, unless another is named");

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

  /* 1110tr1. Quit's toast and the first-close notice name what actually quits. */
  {
    const mainSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    const settingsSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
    const langSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
    const bodies = [...mainSrc.matchAll(/trayKeepsBody:\s*"([^"]*)"/g)].map(m => m[1]);
    const noticeEn = "Its shortcut still works and the team's updates still arrive. To quit, right-click the tray icon and choose Quit Etiuda; Settings, under General, can make closing the window quit instead.";
    const noticePl = "Skrót nadal działa, a aktualizacje od zespołu wciąż docierają. Program zamyka pozycja Zakończ Etiudę w menu ikony zasobnika; w Ustawieniach, w części Ogólne, można ustawić, by zamknięcie okna kończyło działanie.";
    const toastEn = "Closing the window will quit Etiuda.";
    const toastPl = "Zamknięcie okna zakończy działanie Etiudy.";
    const toastWired = settingsSrc.includes('toast(quit?t("' + toastEn + '"):t("Stay in the tray"))');
    const pair = langSrc.includes('"' + toastEn + '":"' + toastPl + '"');
    const iconQuits = /tray icon quits|z ikony w zasobniku/.test(bodies.join("\n"));
    check(bodies[0] === noticeEn && bodies[1] === noticePl && !iconQuits && toastWired && pair,
      "1110tr1 the first-close notice names the Quit Etiuda row, in English and in Polish, and Quit's toast says the window will quit when it closes"
      + " (" + JSON.stringify(bodies[0]) + " / " + JSON.stringify(bodies[1]) + ", toast " + toastWired + "/" + pair + ")");
  }

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

  /* 10. THE FIRST-CLOSE TRACE (shell/main.js firstCloseTraced, trayToastTrace, trayTraceWrite), read from main.js and run
     with this tray.cjs and stand-ins for Electron's Notification, each boot a fresh process over a scratch user-data folder:
     one line per attempt naming each outcome, and the same calls reaching Electron as the untraced close makes. Each outcome's
     line carrying a plant tag is cut in memory and the same reading made again. */
  {
    const mainText = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    const fnOf = (src, name) => {
      const at = src.search(new RegExp("^function " + name + "\\(", "m"));
      const end = at < 0 ? -1 : src.indexOf("\n}", at);
      return end < 0 ? "" : src.slice(at, end + 2);
    };
    const SHOW_ERR = "the toast could not be made\nsecond line", SHOW_REFUSED = "show refused: C:\\Users\\Someone\\AppData\\icon.png", WINDOWS_SAID = "0x80070490 element not found";
    /* kind: shows, unsupported, ctor-throws, show-throws, words-throw; harness: the marker's answer; closes: how many */
    const boot = (src, kind, harness, closes, traced) => {
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-tray-trace-"));
      const rec = { supportedAsked: 0, aumid: [], made: [], shown: 0, clicks: 0, told: false, threw: [] };
      let lastNote = null;
      class FakeNote {
        constructor(opts) {
          if (kind === "ctor-throws") throw new Error(SHOW_ERR);
          rec.made.push(JSON.stringify(opts));
          this.handlers = {};
          lastNote = this;
        }
        static isSupported() { rec.supportedAsked++; return kind !== "unsupported"; }
        on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); if (ev === "click") rec.clicks++; return this; }
        emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }
        show() { if (kind === "show-throws") throw new Error(SHOW_REFUSED); rec.shown++; }
      }
      const fakeApp = { getPath: () => ud, getName: () => "etiuda", setAppUserModelId: (id) => { rec.aumid.push(id); } };
      const consts = (src.match(/^const TRAY_TRACE_FILE[^\n]*\n^const trayTraceState[^\n]*$/m) || [""])[0];
      const body = [consts, "let trayNoticeTold = false;", fnOf(src, "legacyLoginName"), fnOf(src, "deskAppId"), fnOf(src, "notifyFirstClose"),
        fnOf(src, "maybeFirstClose"), fnOf(src, "firstCloseTraced"), fnOf(src, "trayToastTrace"), fnOf(src, "trayTraceWrite"),
        "return { close: " + (traced ? "firstCloseTraced" : "maybeFirstClose") + ", told: () => trayNoticeTold };"].join("\n");
      let lines = [], why = "";
      try {
        const made = new Function("fs", "path", "app", "Notification", "harnessLaunch", "notifyFirstCloseOf", "trayWords", "showDesk",
          "APP_IDS", "testIdentityAppId", body)(fs, path, fakeApp, FakeNote, () => harness, trayMod.notifyFirstClose,
          () => { if (kind === "words-throw") throw new Error("words unread"); return { trayKeepsRunning: "Title", trayKeepsBody: "Body" }; },
          () => {}, APP_IDS, () => "");
        for (let i = 0; i < closes; i++) {
          try { made.close({}); } catch (e) { rec.threw.push(e.message); }
          if (i === 0 && lastNote && kind === "shows") lastNote.emit("failed", {}, WINDOWS_SAID);
          if (i === 0 && lastNote && kind === "shows-ok") lastNote.emit("show", {});
        }
        rec.told = made.told();
        const at = path.join(ud, "tray-trace.txt");
        lines = fs.existsSync(at) ? fs.readFileSync(at, "utf8").split("\n").filter(Boolean) : [];
      } catch (e) {
        why = String(e && e.message || e).split("\n")[0];
      } finally {
        fs.rmSync(ud, { recursive: true, force: true });
      }
      return { rec, lines, why };
    };
    const STAMP = "^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z first close: ";
    const reads = (src) => ({
      shows: boot(src, "shows", false, 2, true),
      showsOk: boot(src, "shows-ok", false, 1, true),
      unsupported: boot(src, "unsupported", false, 1, true),
      ctorThrows: boot(src, "ctor-throws", false, 1, true),
      showThrows: boot(src, "show-throws", false, 1, true),
      harness: boot(src, "shows", true, 1, true),
      wordsThrow: boot(src, "words-throw", false, 1, true),
      capped: boot(src, "unsupported", false, 10, true),
    });
    const r = reads(mainText);
    const say = (x) => JSON.stringify(x.lines) + (x.why ? " (" + x.why + ")" : "");
    check(r.shows.lines.length === 2
      && new RegExp(STAMP + "isSupported=true aumid=app\\.etiuda\\.desktop \\(this attempt set it\\) harnessLaunch=false outcome=shown$").test(r.shows.lines[0])
      && /Z first close, Windows: failed: 0x80070490 element not found$/.test(r.shows.lines[1]) && r.shows.rec.shown === 1 && r.shows.rec.told
      && r.showsOk.lines.length === 2 && /Z first close, Windows: shown$/.test(r.showsOk.lines[1]),
      "ft1 a toast that shows: one line naming isSupported=true, the app id this attempt set, harnessLaunch=false and outcome=shown; "
      + "Windows's failed or shown event on a line of its own; the second close, told, writes nothing: " + say(r.shows) + " " + say(r.showsOk));
    check(r.unsupported.lines.length === 1
      && new RegExp(STAMP + "isSupported=false aumid=electron\\.app\\.etiuda \\(Electron's default, unless another toast set one\\) harnessLaunch=false outcome=not supported$").test(r.unsupported.lines[0]),
      "ft2 Notification.isSupported() false: the line says not supported and the app id in force is Electron's default: " + say(r.unsupported));
    check(r.ctorThrows.lines.length === 1
      && new RegExp(STAMP + "isSupported=true aumid=app\\.etiuda\\.desktop \\(this attempt set it\\) harnessLaunch=false outcome=thrown: the toast could not be made$").test(r.ctorThrows.lines[0]),
      "ft3 the Notification made to throw: the line says thrown with the message's first line, which tray.cjs swallows: " + say(r.ctorThrows));
    check(r.showThrows.lines.length === 1 && /outcome=thrown: show refused: %USERPROFILE%\\AppData\\icon\.png$/.test(r.showThrows.lines[0]),
      "ft4 show() made to throw: the line says thrown with its message, the user's own folder named %USERPROFILE%: " + say(r.showThrows));
    check(r.harness.lines.length === 1 && r.harness.rec.made.length === 0
      && new RegExp(STAMP + "isSupported=not asked aumid=electron\\.app\\.etiuda .* harnessLaunch=true outcome=not attempted \\(harnessLaunch\\)$").test(r.harness.lines[0]),
      "ft5 a harness launch: no toast made and nothing asked of Notification, and the line says harnessLaunch=true, not attempted: " + say(r.harness));
    check(r.wordsThrow.lines.length === 1 && /outcome=thrown: words unread$/.test(r.wordsThrow.lines[0])
      && r.wordsThrow.rec.threw.join() === "words unread",
      "ft6 a throw before tray.cjs is reached: the line says thrown: words unread, and the throw still reaches the close as before: " + say(r.wordsThrow));
    check(r.capped.lines.length === 6, "ft7 ten closes that never show write six lines a run, no more: " + r.capped.lines.length);
    /* the control: the same calls reach Electron with the trace and without it */
    const diffs = (src) => { const same = [];
    for (const [kind, harness, closes] of [["shows", false, 2], ["unsupported", false, 1], ["ctor-throws", false, 1], ["show-throws", false, 1],
      ["shows", true, 1], ["words-throw", false, 1]]) {
      const a = boot(src, kind, harness, closes, true).rec, b = boot(src, kind, harness, closes, false).rec;
      const key = (x) => JSON.stringify([x.supportedAsked, x.aumid, x.made, x.shown, x.clicks, x.told, x.threw]);
      if (key(a) !== key(b)) same.push(kind + (harness ? " (harness)" : "") + ": traced " + key(a) + " untraced " + key(b));
    }
    return same; };
    const same = diffs(mainText);
    check(same.length === 0, "ft8 no change of behaviour: isSupported asked, the app id set, the toast made, shown, its click wired, told "
      + "and any throw are the same with the trace and without it, in all six cases" + (same.length ? ": " + same.join("; ") : ""));
    /* The inline plant proofs ft9 to ft13 honour ETIUDA_PLANTS=off (plant-hold's pk-off), named as not run. */
    if (PLANTS_OFF) console.log("  NOT RUN ft9 to ft13, the trace's plant proofs (ETIUDA_PLANTS=off)");
    else {
      for (const [tag, id, pick, was] of [["trace-shown", "ft9", "shows", /outcome=shown$/], ["trace-unsupported", "ft10", "unsupported", /outcome=not supported$/],
        ["trace-thrown", "ft11", "ctorThrows", /outcome=thrown: the toast could not be made$/], ["trace-caught", "ft12", "wordsThrow", /outcome=thrown: words unread$/]]) {
        const cut = mainText.split("\n").filter((l) => l.indexOf("plant:" + tag) < 0).join("\n");
        const lifted = reads(cut)[pick];
        check(mainText.indexOf("plant:" + tag) > -1 && !(lifted.lines[0] && was.test(lifted.lines[0])),
          id + " control: cutting plant:" + tag + " takes that outcome from the line: " + say(lifted));
      }
      const swallowed = mainText.replace("return show.apply(n, arguments);", "return undefined;");
      const seenBroken = swallowed !== mainText ? diffs(swallowed) : [];
      check(seenBroken.length > 0, "ft13 control: a stand-in whose show() no longer reaches Electron's is caught by ft8: " + seenBroken.length + " case(s) differ");
    }
  }

  /* 11. THE TRAY BUBBLE (board 1016 (10)): the desk's own blue bubble at the first close of a start, in place of Windows's
     notification. Its place is the pure bubblePlace in tray.cjs; once per start, the Off the bubble's own button sets, the
     window that takes no focus and the Settings row are read from shell/main.js, the engine and the preload. */
  {
    const bp = trayMod.bubblePlace;
    const disp = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
    const size = { width: 360, height: 150 };
    const at = (bounds) => (typeof bp === "function" ? bp({ bounds: bounds, display: disp, size: size }) : null);
    const a = at({ x: 1700, y: 1040, width: 24, height: 40 });
    check(!!a && a.side === "above" && a.x === 1532 && a.y === 880 && a.tip === 180,
      "tb1 a tray icon on the bottom taskbar: the bubble stands just above it, centred on the icon, its pointer on the icon: " + JSON.stringify(a));
    const e = at({ x: 1900, y: 1040, width: 24, height: 40 });
    check(!!e && e.side === "above" && e.x === 1552 && e.tip === 340,
      "tb2 an icon at the screen's edge: the bubble keeps 8 px inside the work area and the pointer stays on the bubble's own edge: " + JSON.stringify(e));
    const none = [["zero bounds", { x: 0, y: 0, width: 0, height: 0 }], ["no bounds", undefined], ["empty object", {}], ["not a number", { x: NaN, y: 1, width: 24, height: 24 }],
      ["overflow flyout, inside the work area", { x: 1600, y: 900, width: 24, height: 24 }]].map(([n, b]) => [n, at(b)]);
    check(none.every(([, r]) => r && r.side === "none" && r.tip === null && r.x === 1548 && r.y === 878),
      "tb3 bounds empty, zero, unreadable or in the hidden overflow: the bubble stands at the bottom corner by the notification area, with no pointer: "
      + JSON.stringify(none));

    const mainText = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
    const fnOf = (src, name) => {
      const at2 = src.search(new RegExp("^function " + name + "\\(", "m"));
      const end = at2 < 0 ? -1 : src.indexOf("\n}", at2);
      return end < 0 ? "" : src.slice(at2, end + 2);
    };
    /* kind: on, off, bubble-false, bubble-throws; harness: the marker's answer */
    const noteRun = (src, kind, harness, closes) => {
      const log = { bubble: 0, traced: 0 };
      const body = ["let trayNoticeTold = false;", fnOf(src, "firstCloseNote"),
        "return { close: firstCloseNote, told: () => trayNoticeTold };"].join("\n");
      let made, why = "";
      try {
        made = new Function("bubbleOn", "harnessLaunch", "showTrayBubble", "firstCloseTraced", body)(
          () => kind !== "off", () => harness,
          () => { log.bubble++; if (kind === "bubble-throws") throw new Error("no window"); return kind !== "bubble-false"; },
          () => { log.traced++; return null; });
        for (let i = 0; i < closes; i++) made.close({});
      } catch (err) { why = String(err && err.message || err); }
      return { log: log, told: made ? made.told() : null, why: why };
    };
    const noteReads = (src) => ({
      on: noteRun(src, "on", false, 3), off: noteRun(src, "off", false, 2), no: noteRun(src, "bubble-false", false, 2),
      throws: noteRun(src, "bubble-throws", false, 1), harness: noteRun(src, "on", true, 1),
    });
    const n = noteReads(mainText);
    const nsay = (x) => JSON.stringify(x);
    check(n.on.log.bubble === 1 && n.on.log.traced === 0 && n.on.told === true,
      "tb4 three closes in one start: the bubble is shown once, Windows's notification never, and the start is told: " + nsay(n.on));
    check(n.off.log.bubble === 0 && n.off.log.traced === 0 && n.off.told === true,
      "tb5 with Say so at the first close Off, nothing is shown at the close, bubble or Windows notification: " + nsay(n.off));
    check(n.no.log.bubble === 1 && n.no.log.traced === 1 && n.throws.log.traced === 1 && n.throws.why === "",
      "tb6 a bubble that cannot be made (answers false or throws) leaves the close to the Windows notification once: " + nsay([n.no, n.throws]));
    check(n.harness.log.bubble === 0 && n.harness.log.traced === 1,
      "tb7 a harness launch makes no bubble window: " + nsay(n.harness));

    /* The setting and the bubble's own buttons */
    const actRun = (src, go, on) => {
      const patches = [], shown = [], hid = [];
      const body = [fnOf(src, "bubbleOn"), fnOf(src, "bubbleAct"), "return { on: bubbleOn, act: bubbleAct };"].join("\n");
      let made;
      try { made = new Function("readWindowMeta", "patchWindowMeta", "showDesk", "deskWindow", "hideTrayBubble", body)(
        () => (on === undefined ? {} : { trayBubble: on, trayNotes: false }), (x) => patches.push(JSON.stringify(x)), () => shown.push(1), () => null, () => hid.push(1)); }
      catch (err) { return { on: null, patches: [], shown: 0, hid: 0, why: String(err && err.message || err) }; }
      if (go) made.act(go);
      return { on: made.on(), patches: patches, shown: shown.length, hid: hid.length };
    };
    const ar = (src) => ({ none: actRun(src, "", undefined), offKey: actRun(src, "", false), ok: actRun(src, "ok", undefined), off: actRun(src, "off", undefined),
      open: actRun(src, "open", undefined), junk: actRun(src, "later", undefined) });
    const r = ar(mainText);
    check(r.none.on === true && r.offKey.on === false,
      "tb8 the bubble is on by default and off only where the place file says trayBubble false, whatever the notifications' master switch holds: " + nsay([r.none, r.offKey]));
    check(r.ok.patches.length === 0 && r.ok.hid === 1 && r.ok.shown === 0
      && r.off.patches.join() === '{"trayBubble":false}' && r.off.hid === 1 && r.off.shown === 0
      && r.open.patches.length === 0 && r.open.hid === 1 && r.open.shown === 1 && r.junk.hid === 0 && r.junk.patches.length === 0,
      "tb9 OK closes it and writes nothing; Don't show again writes trayBubble false and closes it; its text opens Etiuda; any other word does nothing: " + nsay(r));

    const sb = fnOf(mainText, "showTrayBubble");
    check(sb.length > 0 && /focusable:\s*false/.test(sb) && /showInactive\(\)/.test(sb) && !/\.focus\(/.test(sb) && !/\.show\(\)/.test(sb)
      && /getBounds\(/.test(sb) && /globalShortcut\.register\("Escape"/.test(sb) && /setTimeout\(/.test(sb),
      "tb10 the bubble's window is not focusable and is shown inactive, never focused; it reads the tray's bounds, registers Esc while it stands and closes by itself");

    const settingsSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "settings.js"), "utf8");
    const langSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "ui-lang.js"), "utf8");
    const preloadSrc = fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8");
    const bubLine = "Once each start, a blue bubble over the tray icon says Etiuda keeps running there. Don't show again in the bubble turns this off.";
    const bubLinePl = "Raz po każdym uruchomieniu niebieski dymek nad ikoną w zasobniku informuje, że Etiuda działa tam dalej. Przycisk Nie pokazuj więcej w dymku wyłącza tę opcję.";
    check(settingsSrc.includes('row("firstclose"') && settingsSrc.includes('t("Say so at the first close")') && settingsSrc.includes('t("' + bubLine + '")')
      && settingsSrc.includes('seg==="firstclose"') && settingsSrc.includes("setTrayBubble") && settingsSrc.includes("trayBubbleState")
      && langSrc.includes('"Say so at the first close":"Informuj przy pierwszym zamknięciu"') && langSrc.includes('"' + bubLine + '":"' + bubLinePl + '"')
      && /setTrayBubble:[^\n]*etiuda:tray-bubble-set/.test(preloadSrc) && /trayBubbleState:[^\n]*etiuda:tray-bubble-state/.test(preloadSrc)
      && /ipcMain\.on\("etiuda:tray-bubble-set"/.test(mainText) && /ipcMain\.on\("etiuda:tray-bubble-state"/.test(mainText),
      "tb11 Settings, General has the row Say so at the first close (On or Off) in both languages, wired through the preload to the place file");
    const wordsEn = ["Its shortcut still works and the team's updates still arrive. To quit, right-click its icon here and choose Quit Etiuda.", "Don't show again"];
    const wordsPl = ["Skrót nadal działa, a aktualizacje od zespołu wciąż docierają. Aby zamknąć program, wystarczy kliknąć tę ikonę prawym przyciskiem i wybrać Zakończ Etiudę.", "Nie pokazuj więcej"];
    check(wordsEn.every(w => mainText.includes('"' + w + '"')) && wordsPl.every(w => mainText.includes('"' + w + '"')),
      "tb12 the bubble's body and its quiet button are the copywriter's words, English and Polish");

    /* the plants: each deciding line cut in memory, the reading made again */
    if (PLANTS_OFF) console.log("  NOT RUN tb13 to tb16, the bubble's plant proofs (ETIUDA_PLANTS=off)");
    else {
      const cutOf = (tag) => mainText.split("\n").filter((l) => l.indexOf("plant:" + tag) < 0).join("\n");
      const p1 = noteReads(cutOf("bubble-off")), p2 = noteReads(cutOf("bubble-once")), p3 = ar(cutOf("bubble-key")), p4 = ar(cutOf("bubble-off-write"));
      check(mainText.includes("plant:bubble-off") && p1.off.log.bubble > 0, "tb13 control: cutting plant:bubble-off shows the bubble with the setting Off: " + nsay(p1.off));
      check(mainText.includes("plant:bubble-once") && p2.on.log.bubble > 1, "tb14 control: cutting plant:bubble-once shows it at every close: " + nsay(p2.on));
      check(mainText.includes("plant:bubble-key") && p3.offKey.on !== false, "tb15 control: cutting plant:bubble-key leaves the bubble on after Off is written: " + nsay(p3.offKey));
      check(mainText.includes("plant:bubble-off-write") && p4.off.patches.join() !== '{"trayBubble":false}', "tb16 control: cutting plant:bubble-off-write leaves Don't show again writing nothing: " + nsay(p4.off));
    }
  }

  console.log("\n#counts checks=" + checks + " failures=" + failed);
  process.exit(failed ? 1 : 0);
}

run();
