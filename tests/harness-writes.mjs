/* A HARNESS LAUNCH WRITES NOTHING THE ACCOUNT KEEPS: every place the shell can write the registry, or anything Windows
 * keeps per account outside a lab, read from the shell's own source and held to the harness guard. Node only.
 *
 *   node tests/harness-writes.mjs
 *
 * Each guard is shown red in memory: the line carrying its plant tag is cut from the source text and the same reading
 * is made again; nothing on disk is touched. Exit code is the number of failed checks, capped at 63. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "shell", "main.js");
const SHELL_FILES = ["shell/main.js", "shell/preload.js", "shell/tray.cjs", "shell/win-proxy.cjs", "shell/page-watch.cjs",
  "shell/clip-suggest.cjs", "shell/desk-reset.cjs", "shell/relay/channel.cjs", "shell/relay/blob.cjs",
  "shell/folder/syncer.cjs", "shell/folder/syncer-worker.cjs", "shell/embed/suggest.cjs", "shell/embed/core.cjs",
  "shell/embed/worker.cjs", "shell/caret.cs"];
let checks = 0, fails = 0;
const ok = (cond, what) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + what); if (!cond) fails++; };

/* Comments out, strings kept: a call named in a comment is not a call. */
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
/* A top-level function's text, from its `function` keyword to its closing brace at column 0. */
function fnText(src, name) {
  const at = src.search(new RegExp("^function " + name + "\\(", "m"));
  if (at < 0) return "";
  const end = src.indexOf("\n}", at);
  return end < 0 ? "" : src.slice(at, end + 2);
}

/* THE WRITES, by the API that makes each. Electron's own, and the shell's wrappers of tray.cjs's. */
const ELECTRON_WRITES = ["setAsDefaultProtocolClient", "removeAsDefaultProtocolClient", "setLoginItemSettings", "setJumpList",
  "setUserTasks", "addRecentDocument", "clearRecentDocuments", "writeShortcutLink", "setAppDetails"];
const WRAPPERS = { setLoginItemSettings: "harness-login", setJumpList: "harness-jump", showNotification: "harness-toast",
  notifyFirstClose: "harness-first-close" };
const REG_VERBS_READ = new Set(["query", "export"]);

function judge(srcRaw) {
  const src = code(srcRaw);
  const out = {};
  /* the marker itself, run on stand-ins */
  const hl = fnText(src, "harnessLaunch");
  let marker = null;
  try {
    const run = (argv, env) => new Function("process", hl + "\nreturn harnessLaunch();")({ argv, env });
    marker = {
      plain: run(["Etiuda.exe"], {}),
      udd: run(["Etiuda.exe", "--user-data-dir=C:\\lab\\ud"], {}),
      offscreen: run(["Etiuda.exe"], { ETIUDA_TEST_OFFSCREEN: "" }),
      docs: run(["Etiuda.exe"], { ETIUDA_TEST_DOCUMENTS: "C:\\lab\\d" }),
      devtools: run(["Etiuda.exe"], { ETIUDA_TEST_DEVTOOLS: "1" }),
      lookalike: run(["Etiuda.exe", "--user-data-dirx", "C:\\x\\--user-data-dir=y"], {}),
    };
  } catch (e) { marker = { error: e.message }; }
  out.marker = marker;
  /* each wrapper: under the marker it calls nothing, outside it calls the import once */
  out.wrappers = {};
  for (const name of Object.keys(WRAPPERS)) {
    const text = fnText(src, name);
    let r = "missing";
    if (text) {
      try {
        const calls = [];
        const make = harness => new Function("harnessLaunch", name + "Of", text + "\nreturn " + name + ";")(() => harness, (...a) => { calls.push(a); return "wrote"; });
        const under = make(true)({}, true), outside = make(false)({}, true);
        r = under === null && outside === "wrote" && calls.length === 1 ? "guarded" : "UNGUARDED (" + calls.length + " write(s) of 2 starts)";
      } catch (e) { r = "threw " + e.message; }
    }
    out.wrappers[name] = r;
  }
  /* registerEtiudaLink: the scheme is asked for only after the marker returned */
  const reg = fnText(src, "registerEtiudaLink");
  const iGuard = reg.search(/if \(harnessLaunch\(\)\) return;/), iCall = reg.indexOf("setAsDefaultProtocolClient(\"etiuda\")");
  out.link = iGuard > -1 && iCall > iGuard ? "guarded" : "UNGUARDED";
  /* no write reaches Electron except through a guarded place: the wrappers' imports are called only inside them, and an
     Electron write API is called only inside registerEtiudaLink */
  const stray = [];
  for (const api of ELECTRON_WRITES) {
    const re = new RegExp("\\b" + api + "\\s*\\(", "g");
    for (let m; (m = re.exec(src));) {
      const line = src.slice(0, m.index).split("\n").length;
      const lineText = src.split("\n")[line - 1];
      if (/^\s*function /.test(lineText)) continue;
      const inLink = reg && m.index >= src.indexOf(reg) && m.index < src.indexOf(reg) + reg.length && api === "setAsDefaultProtocolClient";
      const viaWrapper = WRAPPERS[api] && !/\.\s*$/.test(src.slice(Math.max(0, m.index - 2), m.index));
      if (!inLink && !viaWrapper) stray.push(api + " at line " + line);
    }
  }
  if (/\bnew\s+Notification\s*\(/.test(src)) stray.push("new Notification");
  for (const name of Object.keys(WRAPPERS)) {
    const uses = (src.match(new RegExp("\\b" + name + "Of\\s*\\(", "g")) || []).length;
    const inside = (fnText(src, name).match(new RegExp("\\b" + name + "Of\\s*\\(", "g")) || []).length;
    if (uses !== inside) stray.push(name + "Of called outside its wrapper " + (uses - inside) + " time(s)");
  }
  out.stray = stray;
  return out;
}

/* THE REGISTRY BY ANY OTHER PATH: every reg.exe call in the shell reads (query, export to a scratch file); no file of the
   shell names another tool that writes the registry. */
function regVerbs(srcRaw) {
  const src = code(srcRaw);
  const verbs = [];
  for (const m of src.matchAll(/execFile(?:Sync)?\(\s*REG_TOOL\s*,\s*(\[\s*"(\w+)"|(\w+)\[)/g)) {
    if (m[2]) verbs.push(m[2]);
    else {
      const def = new RegExp("const " + m[3] + "\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\];").exec(src);
      if (!def) verbs.push("unreadable " + m[3]);
      else for (const v of def[1].matchAll(/\[\s*"(\w+)"/g)) verbs.push(v[1]);
    }
  }
  return verbs;
}

const mainSrc = fs.readFileSync(MAIN, "utf8");
const now = judge(mainSrc);
const m = now.marker || {};
ok(m.plain === false && m.udd === true && m.offscreen === true && m.docs === true && m.devtools === true && m.lookalike === false,
  "hw1 the harness marker: a plain start is no harness launch; --user-data-dir, or any of ETIUDA_TEST_OFFSCREEN (even empty), "
  + "ETIUDA_TEST_DOCUMENTS or ETIUDA_TEST_DEVTOOLS, is; a look-alike switch is not: " + JSON.stringify(m));
ok(Object.values(now.wrappers).every(v => v === "guarded"),
  "hw2 the login item (Start with Windows), the jump list, a toast and the first-close toast write nothing under the marker and once without: "
  + JSON.stringify(now.wrappers));
ok(now.link === "guarded", "hw3 the etiuda: handler is asked for only after the marker returns: " + now.link);
ok(now.stray.length === 0, "hw4 no Electron write and no notification reaches Windows except through those guards"
  + (now.stray.length ? ": " + now.stray.join("; ") : " (" + ELECTRON_WRITES.length + " write APIs and new Notification searched)"));

const verbs = [];
for (const rel of SHELL_FILES) {
  const at = path.join(ROOT, rel);
  if (!fs.existsSync(at)) continue;
  const text = fs.readFileSync(at, "utf8");
  if (rel.endsWith(".cs")) { if (/Microsoft\.Win32|Registry\./.test(text)) verbs.push(rel + " uses the registry"); continue; }
  for (const v of regVerbs(text)) verbs.push(rel + " " + v);
  if (/Set-ItemProperty|New-ItemProperty|Remove-ItemProperty|regedit|reg\s+(add|delete|import)\b|"(add|delete|import|restore|load|copy)"\s*,\s*"HK/i.test(code(text)))
    verbs.push(rel + " names a registry-writing tool");
}
const writes = verbs.filter(v => !REG_VERBS_READ.has(v.split(" ").pop()));
ok(writes.length === 0 && verbs.length >= 4, "hw5 every reg.exe call in the shell reads, and no shell file names another registry writer: "
  + verbs.join(", ") + (writes.length ? "; WRITES: " + writes.join(", ") : ""));

/* THE CONTROLS, in memory: each plant line cut, and the reading that held goes red at the guard it belongs to. */
const cut = tag => mainSrc.split("\n").filter(l => l.indexOf("plant:" + tag) < 0).join("\n");
for (const [i, [name, tag]] of Object.entries(WRAPPERS).entries()) {
  const lifted = judge(cut(tag));
  ok(mainSrc.indexOf("plant:" + tag) > -1 && lifted.wrappers[name] !== "guarded",
    "hw6" + "abcd"[i] + " control: cutting plant:" + tag + " leaves " + name + " " + lifted.wrappers[name]);
}
const linkLifted = judge(cut("harness-link"));
ok(mainSrc.indexOf("plant:harness-link") > -1 && linkLifted.link !== "guarded", "hw7 control: cutting plant:harness-link leaves the handler " + linkLifted.link);
const planted = judge(mainSrc.replace("function syncJumpList() {", "function syncJumpList() {\n  app.setLoginItemSettings({ openAtLogin: true });"));
ok(planted.stray.length === 1 && /setLoginItemSettings at line/.test(planted.stray[0]),
  "hw8 control: a direct app.setLoginItemSettings planted in the jump list is named: " + planted.stray.join("; "));
const markerLifted = judge(mainSrc.replace(/argv\.some\(a => \/\^--user-data-dir\(=\|\$\)\/\.test\(String\(a\)\)\)\s*\|\|/, ""));
ok(markerLifted.marker && markerLifted.marker.udd === false, "hw9 control: the marker without its --user-data-dir clause reads a harness launch as plain");
ok(regVerbs('execFileSync(REG_TOOL, ["add", "HKCU\\\\X"]); const qs = [\n ["query", "a"],\n ["delete", "b"]\n];\nexecFile(REG_TOOL, qs[i]);').join(",") === "add,query,delete",
  "hw10 control: the reg reader names a literal verb and every verb of an array it is handed");

console.log("\n#counts checks=" + checks + " failed=" + fails);
process.exit(fails ? Math.min(fails, 63) : 0);
