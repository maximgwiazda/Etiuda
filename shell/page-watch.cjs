"use strict";
/* A PAGE THAT STOPS takes the band and its three controls with it, since the window has no frame,
   and leaves an empty pane that only Alt+F4 closes. The first loss reloads the page; a second within
   a minute asks in a recovery window of the program's own, as a page that stops answering does.
   Everything a program owns arrives in `o`, so a node gate drives this file on a window model. */
const fs = require("node:fs");
const path = require("node:path");

/* THE RECOVERY WINDOW'S PAGE, drawn by the shell because the page that would draw it has stopped.
   No script: each choice is a link to a query of its own, which the window hears at will-navigate.
   The leading choice is filled and last, as in the page's own dialogs, and colour-scheme follows
   nativeTheme, which the program's theme sets. `accent` is { over, fill, darkFill }. */
const ACCENT = { over: "#dde9fc", fill: "#0e67d8", darkFill: "#136adc" };
function recoveryDoc(lang, title, message, buttons, accent) {
  const a = accent || ACCENT;
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const order = buttons.map((b, i) => i).filter(i => i > 0).concat([0]);
  const sans = '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif';
  return '<!DOCTYPE html>\n<html lang="' + esc(lang) + '">\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\';'
    + ' style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">\n'
    + '<title>' + esc(title) + '</title>\n<style>\n'
    + ':root{color-scheme:light;--bg:#fff;--ink:#0f172a;--soft:color-mix(in srgb,#0f172a 4%,transparent);'
    + '--over:' + a.over + ';--over-ink:' + a.fill + ';--fill:' + a.fill + ';--lift:brightness(1.08)}\n'
    + '@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#1d1f24;--ink:#e3e6ea;'
    + '--soft:color-mix(in srgb,#e3e6ea 6%,transparent);--over:color-mix(in srgb,' + a.darkFill + ' 30%,transparent);'
    + '--fill:' + a.darkFill + ';--over-ink:#fff;--lift:brightness(.92)}}\n'
    + 'html,body{height:100%;margin:0}\n'
    + 'body{box-sizing:border-box;padding:18px 18px 14px;display:flex;flex-direction:column;'
    + 'justify-content:space-between;background:var(--bg);color:var(--ink);cursor:default;user-select:none;'
    + '-webkit-app-region:drag;font:15px/1.5 ' + sans + '}\n'
    + 'h1{margin:0;font:600 16px/1.35 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;'
    + 'letter-spacing:-.2px;text-wrap:balance}\n'
    + 'nav{display:flex;justify-content:flex-end;gap:8px}\n'
    + 'a{-webkit-app-region:no-drag;padding:7px 11px;border:1px solid transparent;border-radius:8px;'
    + 'background:var(--soft);color:var(--ink);font:13px ' + sans + ';'
    + 'text-decoration:none;white-space:nowrap;outline:none;cursor:default}\n'
    + 'a:hover,a:focus-visible{background:var(--over);color:var(--over-ink)}\n'
    + 'a.go,a.go:hover,a.go:focus-visible{background:var(--fill);border-color:var(--fill);color:#fff;font-weight:600}\n'
    + 'a.go:hover,a.go:focus-visible{filter:var(--lift)}\n'
    + '@media (forced-colors:active){a{border-color:ButtonText}a:focus-visible{outline:2px solid Highlight}}\n'
    + '</style>\n<h1>' + esc(message) + '</h1>\n<nav>'
    + order.map(i => '<a href="?answer-' + i + '"' + (i === 0 ? ' class="go" autofocus' : '') + '>'
      + esc(buttons[i]) + '</a>').join("")
    + '</nav>\n';
}

const RECOVERY_HEIGHT = 112;

/* A SMALL WINDOW OF ITS OWN, in its own renderer, so it can ask while the page is gone or hung.
   Answers { response } as the system box did: the chosen index, 0 for Escape or a close, and -1 once
   the signal aborts it. ITS PAGE IS A FILE: a link followed in a file:// document reaches
   will-navigate, where Chromium stops one in a data: URL unheard (measured). A file that cannot be
   written takes the first choice at once. `w` is one row of words with its `lang` and `title`. */
function askInWindow(parent, w, message, buttons, signal, o) {
  return new Promise(done => {
    const file = path.join(o.tmpdir(), (o.name || "etiuda-recovery") + "-" + process.pid + ".html");
    try { fs.writeFileSync(file, recoveryDoc(w.lang, w.title, message, buttons, o.accent)); }
    catch (e) {
      o.log("the recovery window could not be drawn, so its first choice is taken - " + e.message);
      done({ response: 0 });
      return;
    }
    const size = { width: o.width || 400, height: RECOVERY_HEIGHT };
    let at = {};
    try {
      const b = parent.getBounds();
      at = { x: Math.round(b.x + (b.width - size.width) / 2), y: Math.round(b.y + (b.height - size.height) / 2) };
    } catch { /* Electron centres it on the screen */ }
    const box = new o.BrowserWindow(Object.assign({
      parent, modal: true, show: false, frame: false, useContentSize: true,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      title: w.title, backgroundColor: o.dark() ? "#1d1f24" : "#ffffff",
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false,
        webviewTag: false, webSecurity: true, spellcheck: false },
    }, size, at, o.aside ? Object.assign({ focusable: false }, o.asideAt()) : {}));
    let answered = false;
    const answer = r => {
      if (answered) return;
      answered = true;
      if (!box.isDestroyed()) box.close();
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      done({ response: r });
    };
    box.webContents.on("will-navigate", (e, url) => {
      e.preventDefault();
      const m = /\?answer-(\d+)$/.exec(String(url || ""));
      if (m && +m[1] < buttons.length) answer(+m[1]);
    });
    box.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    box.webContents.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); answer(0); }
    });
    box.on("closed", () => answer(0));
    if (signal) signal.addEventListener("abort", () => answer(-1));
    box.once("ready-to-show", () => {
      if (o.hidden) return;
      if (o.aside) box.showInactive(); else box.show();
    });
    o.log("the recovery window asks: " + message);
    box.loadFile(file);
  });
}

/** `o`: BrowserWindow (Electron's); dark() for the theme at the moment of asking; words() answering
 *  one row with its `lang` and `title`; aside, the harness's flag, puts the window beyond the far
 *  corner, unfocused, at asideAt(), and hidden keeps it from being shown at all; tmpdir(); log(line);
 *  now() in milliseconds; and optionally name (the page file's stem), width, accent, lost(details)
 *  on every loss, and reloading() just before each reload this watch sends. */
function watchPage(win, o) {
  let lastGone = 0, restarting = false, hangAsk = null;
  const recover = () => { if (o.reloading) o.reloading(); win.webContents.reload(); };
  win.webContents.on("render-process-gone", (e, d) => {
    if (win.isDestroyed() || d.reason === "clean-exit") return;
    o.log("the page stopped (" + d.reason + ", exit code " + d.exitCode + ")");
    if (o.lost) o.lost(d);
    // The hang window's Restart reloads here, once the old page has gone: a reload sent straight
    // after the kill can land in the dying process and leave the window empty.
    if (restarting) { restarting = false; recover(); return; }
    const again = o.now() - lastGone < 60000;
    lastGone = o.now();
    if (!again) { recover(); return; }
    const w = o.words();
    askInWindow(win, w, w.gone, [w.restart, w.close], null, o).then(r => {
      if (win.isDestroyed()) return;
      if (r.response === 0) recover(); else if (r.response === 1) win.close();
    });
  });
  win.on("unresponsive", () => {
    if (hangAsk || win.isDestroyed()) return;
    o.log("the page is not responding");
    const w = o.words();
    hangAsk = new AbortController();
    const signal = hangAsk.signal;
    askInWindow(win, w, w.hung, [w.wait, w.restart], signal, o).then(r => {
      hangAsk = null;
      if (signal.aborted || r.response !== 1 || win.isDestroyed()) return;
      restarting = true;
      win.webContents.forcefullyCrashRenderer();
    });
  });
  win.on("responsive", () => { if (hangAsk) hangAsk.abort(); });
}

module.exports = { watchPage, askInWindow, recoveryDoc, RECOVERY_HEIGHT };
